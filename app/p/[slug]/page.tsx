'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import { MessageCircle, ChevronRight, ChevronLeft, Star, MapPin, Briefcase, Camera, X, Loader2 } from 'lucide-react'
import { calculateQuote, generateProposalText } from '@/lib/calculator'
import { getProfession, mapAnswersToLeadFields, type Question } from '@/lib/professions'

export default function ProfessionalPublicPage() {
  const { slug } = useParams()
  const source = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ref') === 'marketplace' ? 'marketplace' : 'pessoal'
  const [professional, setProfessional] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0) // 0 = intro, 1..N = perguntas, N+1 = media, N+2 = contacto
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase
      .from('professionals')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()
      .then(({ data }) => { setProfessional(data); setLoading(false) })
  }, [slug])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <div className="w-10 h-10 border-4 border-indigo-900 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )

  if (!professional) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <div className="text-center">
        <div className="text-5xl mb-4">😕</div>
        <h1 className="text-white text-xl font-bold">Profissional não encontrado</h1>
        <p className="text-gray-500 mt-2">Este link pode ter expirado ou estar incorrecto.</p>
      </div>
    </div>
  )

  const profession = getProfession(professional.specialty)
  const questions = profession.questions
  const totalSteps = questions.length + 2 // +1 media, +1 contacto
  const isMediaStep = step === questions.length + 1
  const isContactStep = step === totalSteps

  function answerAndAdvance(key: string, value: any) {
    setAnswers(prev => ({ ...prev, [key]: value }))
    setStep(s => s + 1)
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)

    // Verificar limite de leads para plano Starter
    if (professional.plan === 'starter') {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', professional.id)
        .gte('created_at', startOfMonth.toISOString())
      if ((count ?? 0) >= 10) {
        setSubmitting(false)
        alert('Este profissional atingiu o limite de pedidos para este mês. Tente mais tarde.')
        return
      }
    }

    const legacyFields = mapAnswersToLeadFields(answers)

    const res = await fetch('/api/leads/public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        professional_id: professional.id,
        name,
        phone,
        email: email || null,
        status: 'novo',
        source,
        ...legacyFields,
        metadata: mediaUrls.length > 0 ? { ...answers, media_urls: mediaUrls } : answers,
      }),
    })
    const { lead } = await res.json()

    if (lead) {
      if (professional.specialty === 'Pintura' && legacyFields.q3_area_m2) {
        const quoteInput = {
          area_m2: legacyFields.q3_area_m2,
          tipo: (legacyFields.q1_tipo_trabalho?.toLowerCase() || 'interior') as 'interior' | 'exterior' | 'ambos',
          cor_escura: !!legacyFields.q4_cor_escura,
          fissuras: !!legacyFields.q5_fissuras,
          mobilias: !!legacyFields.q6_mobilias,
          primer: !!legacyFields.q7_primer,
          teto: !!legacyFields.q8_teto,
          prices: {
            price_m2_walls: professional.price_m2_walls || 4,
            price_m2_ceiling: professional.price_m2_ceiling || 5,
            price_m2_exterior: professional.price_m2_exterior || 6,
            extra_dark_color: professional.extra_dark_color || 1.25,
            extra_cracks: professional.extra_cracks || 6,
            extra_furniture_move: professional.extra_furniture_move || 50,
            extra_primer: professional.extra_primer || 2,
            min_quote: professional.min_quote || 150,
          },
        }
        const quoteResult = calculateQuote(quoteInput)
        const proposalText = generateProposalText({ ...legacyFields, name }, quoteResult, professional)

        await supabase.from('quotes').insert({
          lead_id: lead.id,
          professional_id: professional.id,
          area_m2: quoteInput.area_m2,
          valor_base: quoteResult.valor_base,
          extras_total: quoteResult.extras_total,
          valor_final: quoteResult.valor_final,
          valor_min: quoteResult.valor_min,
          valor_max: quoteResult.valor_max,
          proposal_text: proposalText,
          status: 'rascunho',
        })
      }

      // Auto-generate estimate for non-paint professions
      if (professional.specialty !== 'Pintura') {
        fetch('/api/quote/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_id: lead.id }),
        }).catch(() => {})
      }

      fetch('/api/notifications/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id }),
      }).catch(() => {})
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  const waLines = Object.entries(answers)
    .filter(([, v]) => v)
    .map(([k, v]) => `• ${k.replace(/_/g, ' ')}: ${v}`)
    .join('\n')

  const waText = encodeURIComponent(
    `Olá ${professional.name}! 👋\n\nO meu nome é ${name} e pedi um orçamento pelo FaçoPorTi.\n\n${waLines}\n\nPode confirmar disponibilidade?`
  )

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0c1a' }}>
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-black text-white mb-2">Pedido enviado!</h1>
        <p className="text-gray-400 mb-8">
          O seu pedido foi registado. Clique abaixo para falar directamente com {professional.name}.
        </p>
        <a
          href={`https://wa.me/${professional.phone}?text=${waText}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl text-black font-black text-lg"
          style={{ background: '#25d366', boxShadow: '0 8px 24px rgba(37,211,102,0.4)' }}
        >
          <MessageCircle size={22} /> Falar no WhatsApp
        </a>
        <p className="text-gray-600 text-xs mt-4">Powered by FaçoPorTi</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>

      {/* Cabeçalho do profissional */}
      <div style={{ background: 'linear-gradient(135deg, #0d0f1e, #13152a)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-lg mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.4)' }}
            >
              {profession.emoji}
            </div>
            <div>
              <h1 className="text-xl font-black text-white">{professional.name}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="flex items-center gap-1 text-xs" style={{ color: '#818cf8' }}>
                  <Briefcase size={11} /> {professional.specialty}
                </span>
                {professional.zone && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin size={11} /> {professional.zone}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <Star size={11} fill="currentColor" /> 5.0
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8">

        {/* Intro */}
        {step === 0 && (
          <div>
            <h2 className="text-2xl font-black text-white mb-2">Pedir Orçamento</h2>
            <p className="text-gray-400 mb-8">
              Responda a algumas perguntas rápidas e receba um orçamento em segundos.
            </p>
            <div className="space-y-3 mb-8">
              {[
                `${profession.emoji} ${professional.specialty} — especialista verificado`,
                '⚡ Menos de 2 minutos',
                '📱 Contacto directo via WhatsApp',
              ].map(item => (
                <div key={item} className="flex items-center gap-3 text-sm text-gray-300">{item}</div>
              ))}
            </div>
            <button
              onClick={() => setStep(1)}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)' }}
            >
              Começar <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* Perguntas */}
        {step >= 1 && step <= questions.length && (
          <QuestionStep
            question={questions[step - 1]}
            current={step}
            total={totalSteps}
            answer={answers[questions[step - 1].key]}
            onAnswer={(value) => answerAndAdvance(questions[step - 1].key, value)}
            onTextNext={(value) => answerAndAdvance(questions[step - 1].key, value)}
            onBack={() => setStep(s => s - 1)}
          />
        )}

        {/* Media */}
        {isMediaStep && (
          <MediaStep
            current={questions.length + 1}
            total={totalSteps}
            mediaUrls={mediaUrls}
            onMediaChange={setMediaUrls}
            onNext={() => setStep(s => s + 1)}
            onBack={() => setStep(s => s - 1)}
          />
        )}

        {/* Contacto */}
        {isContactStep && (
          <ContactStep
            name={name}
            phone={phone}
            email={email}
            total={totalSteps}
            submitting={submitting}
            onNameChange={setName}
            onPhoneChange={setPhone}
            onEmailChange={setEmail}
            onBack={() => setStep(s => s - 1)}
            onSubmit={handleSubmit}
          />
        )}

      </div>
    </div>
  )
}

// ── Upload de media ───────────────────────────────────────────────────────────

function MediaStep({
  current, total, mediaUrls, onMediaChange, onNext, onBack,
}: {
  current: number
  total: number
  mediaUrls: string[]
  onMediaChange: (urls: string[]) => void
  onNext: () => void
  onBack: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError('')
    setUploading(true)

    const newUrls: string[] = []
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      if (!isImage && !isVideo) continue
      if (file.size > 50 * 1024 * 1024) { setError('Ficheiro demasiado grande (máx 50MB)'); continue }

      const ext = file.name.split('.').pop()
      const path = `leads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { data, error: upErr } = await supabase.storage.from('lead-media').upload(path, file, { upsert: false })
      if (upErr) { setError('Erro ao carregar ficheiro. Tente novamente.'); continue }
      const { data: { publicUrl } } = supabase.storage.from('lead-media').getPublicUrl(data.path)
      newUrls.push(publicUrl)
    }

    onMediaChange([...mediaUrls, ...newUrls])
    setUploading(false)
  }

  function removeUrl(url: string) {
    onMediaChange(mediaUrls.filter(u => u !== url))
  }

  return (
    <div>
      <ProgressBar current={current} total={total} />
      <h2 className="text-xl font-black text-white mb-1">Fotos ou vídeo</h2>
      <p className="text-gray-400 text-sm mb-6">Opcional — ajuda o profissional a preparar um orçamento mais preciso.</p>

      {/* Prévia de ficheiros */}
      {mediaUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {mediaUrls.map(url => (
            <div key={url} className="relative aspect-square rounded-xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {url.match(/\.(mp4|mov|webm)$/i) ? (
                <video src={url} className="w-full h-full object-cover" />
              ) : (
                <img src={url} alt="" className="w-full h-full object-cover" />
              )}
              <button
                onClick={() => removeUrl(url)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.7)' }}
              >
                <X size={12} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Botão de upload */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl font-semibold text-sm transition-all"
        style={{ background: 'rgba(255,255,255,0.04)', border: '2px dashed rgba(255,255,255,0.12)', color: '#9ca3af' }}
      >
        {uploading ? <><Loader2 size={18} className="animate-spin" /> A carregar...</> : <><Camera size={18} /> Adicionar fotos ou vídeo</>}
      </button>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

      <button
        onClick={onNext}
        className="w-full mt-4 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white"
        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)' }}
      >
        {mediaUrls.length > 0 ? 'Continuar' : 'Saltar'} <ChevronRight size={18} />
      </button>
      <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mt-4 transition-colors">
        <ChevronLeft size={15} /> Voltar
      </button>
    </div>
  )
}

// ── Barra de progresso ────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${(current / total) * 100}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
        />
      </div>
      <span className="text-xs text-gray-500">{current}/{total}</span>
    </div>
  )
}

// ── Pergunta individual ───────────────────────────────────────────────────────

function QuestionStep({
  question, current, total, answer, onAnswer, onTextNext, onBack,
}: {
  question: Question
  current: number
  total: number
  answer: any
  onAnswer: (v: any) => void
  onTextNext: (v: any) => void
  onBack: () => void
}) {
  const [text, setText] = useState(answer || '')

  if (question.type === 'choice' && question.options) {
    return (
      <div>
        <ProgressBar current={current} total={total} />
        <h2 className="text-xl font-black text-white mb-6">{question.text}</h2>
        <div className="space-y-3">
          {question.options.map(opt => (
            <button
              key={opt}
              onClick={() => onAnswer(opt)}
              className="w-full text-left px-5 py-4 rounded-2xl font-semibold text-white transition-all"
              style={{
                background: answer === opt ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                border: answer === opt ? 'none' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
        {current > 1 && (
          <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mt-4 transition-colors">
            <ChevronLeft size={15} /> Voltar
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <ProgressBar current={current} total={total} />
      <h2 className="text-xl font-black text-white mb-6">{question.text}</h2>
      <input
        type={question.type === 'number' ? 'number' : 'text'}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={question.placeholder || ''}
        className="w-full rounded-2xl px-5 py-4 text-white text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        autoFocus
      />
      {question.unit && <p className="text-xs text-gray-600 mt-1">{question.unit}</p>}
      <button
        onClick={() => onTextNext(text)}
        disabled={!text && !question.optional}
        className="w-full mt-4 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-white transition-all"
        style={{
          background: text || question.optional ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
          opacity: !text && !question.optional ? 0.4 : 1,
          boxShadow: text || question.optional ? '0 8px 24px rgba(99,102,241,0.4)' : 'none',
        }}
      >
        {question.optional && !text ? 'Saltar' : 'Continuar'} <ChevronRight size={18} />
      </button>
      {current > 1 && (
        <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mt-4 transition-colors">
          <ChevronLeft size={15} /> Voltar
        </button>
      )}
    </div>
  )
}

// ── Dados de contacto ─────────────────────────────────────────────────────────

function ContactStep({
  name, phone, email, total, submitting, onNameChange, onPhoneChange, onEmailChange, onBack, onSubmit,
}: {
  name: string
  phone: string
  email: string
  total: number
  submitting: boolean
  onNameChange: (v: string) => void
  onPhoneChange: (v: string) => void
  onEmailChange: (v: string) => void
  onBack: () => void
  onSubmit: () => void
}) {
  const ready = name.trim().length > 1 && phone.trim().length >= 9

  return (
    <div>
      <ProgressBar current={total} total={total} />
      <h2 className="text-xl font-black text-white mb-2">Quase pronto!</h2>
      <p className="text-gray-400 text-sm mb-6">Deixe os seus dados para receber o orçamento.</p>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">O seu nome</label>
          <input
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="João Silva"
            className="w-full rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Telemóvel / WhatsApp</label>
          <input
            value={phone}
            onChange={e => onPhoneChange(e.target.value)}
            placeholder="351912345678"
            type="tel"
            className="w-full rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Email <span className="text-gray-600 normal-case">(opcional)</span></label>
          <input
            value={email}
            onChange={e => onEmailChange(e.target.value)}
            placeholder="joao@email.com"
            type="email"
            className="w-full rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
        </div>
      </div>
      <button
        onClick={onSubmit}
        disabled={!ready || submitting}
        className="w-full mt-6 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white transition-all"
        style={{
          background: ready && !submitting ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
          boxShadow: ready && !submitting ? '0 8px 24px rgba(99,102,241,0.4)' : 'none',
          opacity: !ready || submitting ? 0.4 : 1,
        }}
      >
        {submitting ? 'A enviar...' : <>Ver Orçamento <ChevronRight size={18} /></>}
      </button>
      <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mt-4 transition-colors">
        <ChevronLeft size={15} /> Voltar
      </button>
    </div>
  )
}
