'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle, ChevronRight, ChevronLeft, Star, MapPin, Briefcase, Camera, X, Loader2, Play } from 'lucide-react'
import { calculateQuote, generateProposalText } from '@/lib/calculator'
import { getProfession, PROFESSIONS, mapAnswersToLeadFields, calcPaintingAreas, type Question, type ProfessionConfig } from '@/lib/professions'

export default function ProfessionalPublicPage() {
  const { slug } = useParams()
  const source = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ref') === 'marketplace' ? 'marketplace' : 'pessoal'
  const [professional, setProfessional] = useState<any>(null)
  const [profession, setProfession] = useState<ProfessionConfig | null>(null)
  const [portfolio, setPortfolio] = useState<any[]>([])
  const [reviews, setReviews] = useState<any[]>([])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(null)

  async function loadSpecialtyConfig(spec: string) {
    if (PROFESSIONS[spec]) {
      setProfession(getProfession(spec))
    } else {
      const { data: row } = await supabase.from('profession_configs').select('config').eq('specialty', spec).maybeSingle()
      if (row?.config) {
        setProfession(row.config as ProfessionConfig)
      } else {
        fetch('/api/professions/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ specialty: spec }) })
          .then(r => r.json()).then(({ config }) => { if (config) setProfession(config) }).catch(() => {})
        setProfession(getProfession(spec))
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    supabase
      .from('professionals')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()
      .then(async ({ data: prof }) => {
        if (!prof) { setLoading(false); return }
        setProfessional(prof)
        const [{ data: portfolioData }, { data: reviewsData }] = await Promise.all([
          supabase.from('professional_portfolio').select('*').eq('professional_id', prof.id).order('sort_order').order('created_at'),
          supabase.from('reviews').select('*').eq('professional_id', prof.id).order('created_at', { ascending: false }),
        ])
        setPortfolio(portfolioData || [])
        setReviews(reviewsData || [])
        const specs: string[] = prof.specialties?.length ? prof.specialties : [prof.specialty]
        if (specs.length > 1) {
          setLoading(false)
        } else {
          setSelectedSpecialty(specs[0])
          await loadSpecialtyConfig(specs[0])
        }
      })
  }, [slug])

  async function handleSelectSpecialty(spec: string) {
    setSelectedSpecialty(spec)
    setLoading(true)
    await loadSpecialtyConfig(spec)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <div className="w-10 h-10 border-4 border-indigo-900 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )

  if (professional && !selectedSpecialty) {
    const specs: string[] = professional.specialties?.length ? professional.specialties : [professional.specialty]
    return (
      <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
        <div style={{ background: 'linear-gradient(135deg, #0d0f1e, #13152a)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="max-w-lg mx-auto px-6 py-6">
            <div className="flex items-center gap-4">
              <Avatar prof={professional} size={14} emoji="💼" />
              <div>
                <h1 className="text-xl font-black text-white">{professional.name}</h1>
                {professional.zone && (
                  <span className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                    <MapPin size={11} /> {professional.zone}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-6 py-8">
          <h2 className="text-2xl font-black text-white mb-2">Qual o serviço?</h2>
          <p className="text-gray-400 mb-6">Escolha o serviço que pretende orçamentar.</p>
          <div className="space-y-3">
            {specs.map((spec: string) => {
              const pConf = getProfession(spec)
              return (
                <button key={spec} onClick={() => handleSelectSpecialty(spec)}
                  className="w-full flex items-center gap-4 p-5 rounded-2xl text-left transition-all hover:opacity-90"
                  style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  <span className="text-3xl">{pConf.emoji}</span>
                  <div>
                    <div className="font-black text-white">{pConf.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Pedido de orçamento rápido</div>
                  </div>
                  <ChevronRight size={16} className="text-gray-500 ml-auto" />
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  if (!professional || !profession) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <div className="text-center">
        <div className="text-5xl mb-4">😕</div>
        <h1 className="text-white text-xl font-bold">Profissional não encontrado</h1>
        <p className="text-gray-500 mt-2">Este link pode ter expirado ou estar incorrecto.</p>
      </div>
    </div>
  )

  const allQuestions = profession.questions
  function filterQuestions(ans: Record<string, any>) {
    return allQuestions.filter(q => {
      if (!q.showIf) return true
      const val = ans[q.showIf.key]
      return Array.isArray(q.showIf.value) ? q.showIf.value.includes(val) : val === q.showIf.value
    })
  }
  const questions = filterQuestions(answers)
  const totalSteps = questions.length + 2
  const isMediaStep = step === questions.length + 1
  const isContactStep = step === totalSteps

  function answerAndAdvance(key: string, value: any) {
    const next = { ...answers, [key]: value }
    setAnswers(next)
    setStep(s => s + 1)
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)

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
        metadata: { ...answers, _service_specialty: selectedSpecialty, ...(mediaUrls.length > 0 ? { media_urls: mediaUrls } : {}) },
      }),
    })
    const { lead } = await res.json()

    if (lead) {
      if (selectedSpecialty === 'Pintura' && legacyFields.q3_area_m2) {
        const paintingAreas = answers['altura_paredes']
          ? calcPaintingAreas(answers)
          : { area_paredes: legacyFields.q3_area_m2 || 0, area_tetos: answers['area_m2_tetos'] ? parseFloat(answers['area_m2_tetos']) : 0 }
        const quoteInput = {
          area_m2_paredes: paintingAreas.area_paredes,
          area_m2_tetos: paintingAreas.area_tetos,
          tipo: (legacyFields.q1_tipo_trabalho?.toLowerCase() || 'interior') as 'interior' | 'exterior' | 'ambos',
          cor_escura: !!legacyFields.q4_cor_escura,
          fissuras: !!legacyFields.q5_fissuras,
          mobilias: !!legacyFields.q6_mobilias,
          primer: !!legacyFields.q7_primer,
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
          area_m2: quoteInput.area_m2_paredes,
          valor_base: quoteResult.valor_base,
          extras_total: quoteResult.extras_total,
          valor_final: quoteResult.valor_final,
          valor_min: quoteResult.valor_min,
          valor_max: quoteResult.valor_max,
          proposal_text: proposalText,
          status: 'rascunho',
        })
      }

      if (selectedSpecialty !== 'Pintura') {
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

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0

  // ── Perfil público (step 0) ────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="min-h-screen pb-10" style={{ background: '#0a0c1a' }}>

        {/* Hero */}
        <div style={{ background: 'linear-gradient(180deg, #13152a 0%, #0d0f1e 100%)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="max-w-lg mx-auto px-6 pt-10 pb-8 flex flex-col items-center text-center">
            {professional.avatar_url ? (
              <img src={professional.avatar_url} alt={professional.name}
                className="w-24 h-24 rounded-full object-cover mb-4"
                style={{ border: '3px solid rgba(99,102,241,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.35)' }} />
            ) : (
              <div className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-black text-white mb-4"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 24px rgba(99,102,241,0.4)', border: '3px solid rgba(99,102,241,0.3)' }}>
                {professional.name?.[0]}
              </div>
            )}
            <h1 className="text-2xl font-black text-white">{professional.name}</h1>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {(professional.specialties?.length ? professional.specialties : [professional.specialty]).map((s: string) => (
                <span key={s} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                  {PROFESSIONS[s]?.emoji} {PROFESSIONS[s]?.label || s}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
              {professional.zone && (
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <MapPin size={13} /> {professional.zone}
                </span>
              )}
              {reviews.length > 0 ? (
                <span className="flex items-center gap-1 text-sm font-bold text-amber-400">
                  <Star size={13} fill="currentColor" />
                  {avgRating.toFixed(1)}
                  <span className="text-gray-500 font-normal text-xs">({reviews.length} avaliações)</span>
                </span>
              ) : (
                <span className="text-xs text-gray-600">Novo profissional</span>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-6 pt-6 space-y-8">

          {/* Sobre mim */}
          {professional.description && (
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider mb-2" style={{ color: '#818cf8' }}>Sobre mim</h2>
              <p className="text-gray-300 text-sm leading-relaxed">{professional.description}</p>
            </div>
          )}

          {/* Portfolio */}
          {portfolio.length > 0 && (
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider mb-3" style={{ color: '#818cf8' }}>
                Trabalhos realizados
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {portfolio.map((item, idx) => (
                  <button key={item.id} onClick={() => setLightboxIndex(idx)}
                    className="relative aspect-square rounded-xl overflow-hidden transition-transform hover:scale-[1.02] active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {item.type === 'video' ? (
                      <>
                        <video src={item.url} className="w-full h-full object-cover" muted playsInline />
                        <div className="absolute inset-0 flex items-center justify-center"
                          style={{ background: 'rgba(0,0,0,0.45)' }}>
                          <div className="w-9 h-9 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(255,255,255,0.9)' }}>
                            <Play size={16} className="text-black ml-0.5" fill="currentColor" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <img src={item.url} alt={item.caption || ''} className="w-full h-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Avaliações */}
          {reviews.length > 0 && (
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider mb-3" style={{ color: '#818cf8' }}>
                O que dizem os clientes
              </h2>
              <div className="space-y-3">
                {reviews.map(r => (
                  <div key={r.id} className="p-4 rounded-2xl"
                    style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(n => (
                          <Star key={n} size={13} fill={n <= r.rating ? '#fbbf24' : 'none'}
                            className={n <= r.rating ? 'text-amber-400' : 'text-gray-700'} />
                        ))}
                      </div>
                      <span className="text-xs text-gray-600">
                        {new Date(r.created_at).toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    {r.comment && <p className="text-sm text-gray-300 leading-relaxed">{r.comment}</p>}
                    <p className="text-xs text-gray-500 mt-2 font-semibold">— {r.client_name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div>
            <button
              onClick={() => setStep(1)}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white text-lg"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 32px rgba(99,102,241,0.45)' }}
            >
              {profession.emoji} Pedir Orçamento <ChevronRight size={20} />
            </button>
            <p className="text-center text-gray-600 text-xs mt-3">⚡ Menos de 2 minutos · Sem compromisso</p>
          </div>

        </div>

        {/* Lightbox */}
        {lightboxIndex !== null && portfolio[lightboxIndex] && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.95)' }}
            onClick={() => setLightboxIndex(null)}
          >
            <button
              className="absolute top-4 right-4 z-10 text-white/60 hover:text-white transition-colors"
              onClick={() => setLightboxIndex(null)}
            >
              <X size={28} />
            </button>
            {lightboxIndex > 0 && (
              <button
                className="absolute left-2 sm:left-4 z-10 text-white/60 hover:text-white transition-colors p-2"
                onClick={e => { e.stopPropagation(); setLightboxIndex(i => (i as number) - 1) }}
              >
                <ChevronLeft size={32} />
              </button>
            )}
            {lightboxIndex < portfolio.length - 1 && (
              <button
                className="absolute right-2 sm:right-4 z-10 text-white/60 hover:text-white transition-colors p-2"
                onClick={e => { e.stopPropagation(); setLightboxIndex(i => (i as number) + 1) }}
              >
                <ChevronRight size={32} />
              </button>
            )}
            <div onClick={e => e.stopPropagation()} className="flex flex-col items-center max-w-full">
              {portfolio[lightboxIndex].type === 'video' ? (
                <video src={portfolio[lightboxIndex].url} controls autoPlay className="max-w-full rounded-xl" style={{ maxHeight: '80vh' }} />
              ) : (
                <img src={portfolio[lightboxIndex].url} alt={portfolio[lightboxIndex].caption || ''} className="max-w-full rounded-xl object-contain" style={{ maxHeight: '80vh' }} />
              )}
              {portfolio[lightboxIndex].caption && (
                <p className="text-white/60 text-sm text-center mt-3">{portfolio[lightboxIndex].caption}</p>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Wizard (steps 1+) ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: 'linear-gradient(135deg, #0d0f1e, #13152a)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-lg mx-auto px-6 py-5">
          <button onClick={() => setStep(0)} className="flex items-center gap-3 text-left w-full group">
            <Avatar prof={professional} size={12} emoji={profession.emoji} />
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-black text-white leading-tight">{professional.name}</h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="flex items-center gap-1 text-xs" style={{ color: '#818cf8' }}>
                  <Briefcase size={10} /> {profession.label}
                </span>
                {professional.zone && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin size={10} /> {professional.zone}
                  </span>
                )}
              </div>
            </div>
            <span className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0">Ver perfil</span>
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8">
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

// ── Avatar helper ─────────────────────────────────────────────────────────────

function Avatar({ prof, size, emoji }: { prof: any; size: number; emoji: string }) {
  const cls = `w-${size} h-${size} rounded-2xl flex-shrink-0`
  if (prof?.avatar_url) {
    return <img src={prof.avatar_url} alt={prof.name} className={`${cls} object-cover`} />
  }
  return (
    <div className={`${cls} flex items-center justify-center font-black text-white`}
      style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.4)', fontSize: size > 12 ? '1.5rem' : '1rem' }}>
      {emoji}
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
      <h2 className="text-xl font-black text-white mb-1">Fotos e/ou vídeos</h2>
      <p className="text-gray-400 text-sm mb-6">Opcional — ajuda o profissional a preparar um orçamento mais preciso.</p>

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
        {uploading ? <><Loader2 size={18} className="animate-spin" /> A carregar...</> : <><Camera size={18} /> Adicionar fotos e/ou vídeos</>}
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
  const [selected, setSelected] = useState<string[]>(Array.isArray(answer) ? answer : [])
  const [outroVal, setOutroVal] = useState('')
  const [outroMode, setOutroMode] = useState(false)

  function toggleMulti(opt: string) {
    setSelected(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt])
  }

  if (question.type === 'multiselect' && question.options) {
    return (
      <div>
        <ProgressBar current={current} total={total} />
        <h2 className="text-xl font-black text-white mb-2">{question.text}</h2>
        <p className="text-sm text-gray-500 mb-5">Pode selecionar várias opções.</p>
        <div className="space-y-2">
          {question.options.map(opt => {
            const active = selected.includes(opt)
            return (
              <button key={opt} onClick={() => toggleMulti(opt)}
                className="w-full text-left px-5 py-4 rounded-2xl font-semibold text-white transition-all flex items-center gap-3"
                style={{
                  background: active ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                  border: active ? 'none' : '1px solid rgba(255,255,255,0.08)',
                }}>
                <div className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center"
                  style={{ background: active ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)', border: active ? 'none' : '1px solid rgba(255,255,255,0.2)' }}>
                  {active && <span className="text-xs font-black">✓</span>}
                </div>
                {opt}
              </button>
            )
          })}
        </div>
        <button onClick={() => onAnswer(selected.length > 0 ? selected : null)}
          disabled={selected.length === 0}
          className="w-full mt-5 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white transition-all"
          style={{
            background: selected.length > 0 ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
            opacity: selected.length === 0 ? 0.4 : 1,
            boxShadow: selected.length > 0 ? '0 8px 24px rgba(99,102,241,0.4)' : 'none',
          }}>
          Continuar ({selected.length} selecionado{selected.length !== 1 ? 's' : ''}) <ChevronRight size={18} />
        </button>
        <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mt-4 transition-colors">
          <ChevronLeft size={15} /> Voltar
        </button>
      </div>
    )
  }

  if (question.type === 'choice' && question.options) {
    const hasOutro = question.options.includes('Outro')
    const showOutroInput = hasOutro && (outroMode || (answer && !question.options.includes(answer)))

    return (
      <div>
        <ProgressBar current={current} total={total} />
        <h2 className="text-xl font-black text-white mb-6">{question.text}</h2>
        <div className="space-y-3">
          {question.options.map(opt => (
            <button
              key={opt}
              onClick={() => opt === 'Outro' ? setOutroMode(true) : onAnswer(opt)}
              className="w-full text-left px-5 py-4 rounded-2xl font-semibold text-white transition-all"
              style={{
                background: (opt === 'Outro' ? showOutroInput : answer === opt) ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                border: (opt === 'Outro' ? showOutroInput : answer === opt) ? 'none' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
        {showOutroInput && (
          <div className="mt-4">
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">
              Altura em metros
            </label>
            <input
              type="number"
              step="0.1"
              min="1"
              max="10"
              value={outroVal}
              onChange={e => setOutroVal(e.target.value)}
              placeholder="ex: 2.6"
              className="w-full rounded-2xl px-5 py-4 text-white text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              autoFocus
            />
            <p className="text-xs text-gray-600 mt-1">metros</p>
            <button
              onClick={() => outroVal && onAnswer(outroVal + 'm')}
              disabled={!outroVal}
              className="w-full mt-3 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white transition-all"
              style={{
                background: outroVal ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                opacity: !outroVal ? 0.4 : 1,
                boxShadow: outroVal ? '0 8px 24px rgba(99,102,241,0.4)' : 'none',
              }}
            >
              Continuar <ChevronRight size={18} />
            </button>
          </div>
        )}
        <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mt-4 transition-colors">
          <ChevronLeft size={15} /> Voltar
        </button>
      </div>
    )
  }

  const minLen = question.minLength || 0
  const meetsMin = !minLen || text.length >= minLen
  const canContinue = meetsMin && (text.length > 0 || question.optional)

  return (
    <div>
      <ProgressBar current={current} total={total} />
      <h2 className="text-xl font-black text-white mb-6">{question.text}</h2>
      {question.type === 'text' && !question.unit ? (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={question.placeholder || ''}
          rows={4}
          className="w-full rounded-2xl px-5 py-4 text-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          autoFocus
        />
      ) : (
        <input
          type={question.type === 'number' ? 'number' : 'text'}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={question.placeholder || ''}
          className="w-full rounded-2xl px-5 py-4 text-white text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          autoFocus
        />
      )}
      {question.unit && <p className="text-xs text-gray-600 mt-1">{question.unit}</p>}
      {minLen > 0 && (
        <p className="text-xs mt-2 transition-colors" style={{ color: meetsMin ? '#34d399' : text.length > 0 ? '#fbbf24' : '#6b7280' }}>
          {text.length}/{minLen} caracteres mínimos
        </p>
      )}
      <button
        onClick={() => onTextNext(text)}
        disabled={!canContinue}
        className="w-full mt-4 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-white transition-all"
        style={{
          background: canContinue ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
          opacity: !canContinue ? 0.4 : 1,
          boxShadow: canContinue ? '0 8px 24px rgba(99,102,241,0.4)' : 'none',
        }}
      >
        {question.optional && !text ? 'Saltar' : 'Continuar'} <ChevronRight size={18} />
      </button>
      <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mt-4 transition-colors">
        <ChevronLeft size={15} /> Voltar
      </button>
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
  const [rgpd, setRgpd] = useState(false)
  const ready = name.trim().length > 1 && phone.trim().length >= 9 && rgpd

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
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={rgpd} onChange={e => setRgpd(e.target.checked)}
            className="mt-1 w-4 h-4 rounded accent-indigo-500 flex-shrink-0" />
          <span className="text-xs text-gray-400">
            Aceito a{' '}
            <Link href="/privacidade" target="_blank" className="text-indigo-400 underline hover:text-indigo-300">
              Política de Privacidade
            </Link>
            {' '}e consinto o tratamento dos meus dados pessoais para receber um orçamento.
          </span>
        </label>
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
