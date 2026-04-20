'use client'

import { useRef, useState } from 'react'
import { ChevronRight, ChevronLeft, MapPin, Camera, X, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { PROFESSIONS, SPECIALTY_LIST, getProfession, mapAnswersToLeadFields } from '@/lib/professions'

const ZONAS = ['Lisboa', 'Porto', 'Setúbal', 'Braga', 'Aveiro', 'Coimbra', 'Faro', 'Évora', 'Outra / Toda Portugal']

type Phase = 'profissao' | 'zona' | 'perguntas' | 'media' | 'contacto' | 'enviado'

export default function PedirPage() {
  const [phase, setPhase] = useState<Phase>('profissao')
  const [specialty, setSpecialty] = useState('')
  const [zona, setZona] = useState('')
  const [step, setStep] = useState(1)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [assigned, setAssigned] = useState(false)

  const profession = specialty ? getProfession(specialty) : null
  const questions = profession?.questions || []
  const totalSteps = questions.length

  function selectProfissao(s: string) { setSpecialty(s); setPhase('zona') }
  function selectZona(z: string) { setZona(z); setPhase('perguntas'); setStep(1) }

  function answerAndAdvance(key: string, value: any) {
    const next = { ...answers, [key]: value }
    setAnswers(next)
    if (step < totalSteps) setStep(s => s + 1)
    else setPhase('media')
  }

  function answerText(key: string, value: any) {
    answerAndAdvance(key, value)
  }

  function goBack() {
    if (phase === 'zona') { setPhase('profissao'); return }
    if (phase === 'perguntas') {
      if (step > 1) setStep(s => s - 1)
      else setPhase('zona')
      return
    }
    if (phase === 'media') { setPhase('perguntas'); setStep(totalSteps); return }
    if (phase === 'contacto') { setPhase('media'); return }
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)

    const legacyFields = mapAnswersToLeadFields(answers)

    const res = await fetch('/api/leads/marketplace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        specialty,
        zone_requested: zona !== 'Outra / Toda Portugal' ? zona : null,
        name,
        phone,
        email: email || null,
        status: 'novo',
        ...legacyFields,
        metadata: mediaUrls.length > 0 ? { ...answers, media_urls: mediaUrls } : answers,
      }),
    })

    const { lead, assigned: wasAssigned } = await res.json()
    setAssigned(wasAssigned)
    setSubmitting(false)
    setPhase('enviado')
  }

  // ── Enviado ────────────────────────────────────────────────────────────────
  if (phase === 'enviado') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#0a0c1a' }}>
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">{assigned ? '🎉' : '📋'}</div>
          <h1 className="text-2xl font-black text-white mb-3">
            {assigned ? 'Pedido enviado!' : 'Pedido registado!'}
          </h1>
          <p className="text-gray-400 mb-8">
            {assigned
              ? 'O teu pedido foi atribuído a um profissional. Receberás contacto em breve.'
              : 'Ainda não temos profissionais disponíveis na tua zona. Assim que um estiver disponível, entraremos em contacto.'}
          </p>
          <Link href="/" className="inline-block text-sm font-semibold px-6 py-3 rounded-2xl"
            style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
            Voltar ao início
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      {/* Header */}
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-lg mx-auto px-6 py-5 flex items-center gap-3">
          {phase === 'profissao' ? (
            <Link href="/" className="text-gray-500 hover:text-gray-300 transition-colors">
              <ChevronLeft size={22} />
            </Link>
          ) : (
            <button onClick={goBack} className="text-gray-500 hover:text-gray-300 transition-colors">
              <ChevronLeft size={22} />
            </button>
          )}
          <div>
            <h1 className="text-xl font-black text-white">
              {phase === 'profissao' && 'De que serviço precisa?'}
              {phase === 'zona' && `${PROFESSIONS[specialty]?.emoji} ${specialty}`}
              {phase === 'perguntas' && `${PROFESSIONS[specialty]?.emoji} ${specialty}`}
              {phase === 'media' && 'Fotos ou vídeo'}
              {phase === 'contacto' && 'Os seus dados'}
            </h1>
            {phase === 'perguntas' && (
              <p className="text-xs text-gray-500 mt-0.5">{step}/{totalSteps}</p>
            )}
            {phase === 'zona' && (
              <p className="text-xs text-gray-500 mt-0.5">Em que zona?</p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8">

        {/* Escolher profissão */}
        {phase === 'profissao' && (
          <div className="grid grid-cols-2 gap-3">
            {SPECIALTY_LIST.map(s => (
              <button key={s} onClick={() => selectProfissao(s)}
                className="flex items-center gap-4 p-5 rounded-2xl text-left transition-all hover:-translate-y-0.5"
                style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-3xl flex-shrink-0">{PROFESSIONS[s].emoji}</span>
                <div>
                  <div className="font-black text-white text-sm">{s}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{PROFESSIONS[s].questions.length} perguntas</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Escolher zona */}
        {phase === 'zona' && (
          <div className="space-y-3">
            {ZONAS.map(z => (
              <button key={z} onClick={() => selectZona(z)}
                className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl text-left transition-all hover:-translate-y-0.5"
                style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.07)' }}>
                <MapPin size={16} className="text-indigo-400 flex-shrink-0" />
                <span className="font-semibold text-white">{z}</span>
                <ChevronRight size={16} className="text-gray-600 ml-auto" />
              </button>
            ))}
          </div>
        )}

        {/* Perguntas */}
        {phase === 'perguntas' && profession && (
          <QuestionStep
            question={questions[step - 1]}
            current={step}
            total={totalSteps}
            answer={answers[questions[step - 1].key]}
            onAnswer={v => answerAndAdvance(questions[step - 1].key, v)}
            onTextNext={v => answerText(questions[step - 1].key, v)}
            onBack={goBack}
          />
        )}

        {/* Media */}
        {phase === 'media' && (
          <MediaStep
            mediaUrls={mediaUrls}
            onMediaChange={setMediaUrls}
            onNext={() => setPhase('contacto')}
            onBack={goBack}
          />
        )}

        {/* Contacto */}
        {phase === 'contacto' && (
          <ContactStep
            name={name} phone={phone} email={email}
            submitting={submitting}
            onNameChange={setName}
            onPhoneChange={setPhone}
            onEmailChange={setEmail}
            onBack={goBack}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  )
}

// ── Barra de progresso ────────────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${(current / total) * 100}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
      </div>
      <span className="text-xs text-gray-500">{current}/{total}</span>
    </div>
  )
}

// ── Pergunta ──────────────────────────────────────────────────────────────────
function QuestionStep({ question, current, total, answer, onAnswer, onTextNext, onBack }: any) {
  const [text, setText] = useState(answer || '')
  const [selected, setSelected] = useState<string[]>(Array.isArray(answer) ? answer : [])

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
          {question.options.map((opt: string) => {
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
        {current > 1 && (
          <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mt-4 transition-colors">
            <ChevronLeft size={15} /> Voltar
          </button>
        )}
      </div>
    )
  }

  if (question.type === 'choice' && question.options) {
    const hasOutro = question.options.includes('Outro')
    const outroSelected = hasOutro && answer === 'Outro'
    const [outroVal, setOutroVal] = useState('')

    return (
      <div>
        <ProgressBar current={current} total={total} />
        <h2 className="text-xl font-black text-white mb-6">{question.text}</h2>
        <div className="space-y-3">
          {question.options.map((opt: string) => (
            <button key={opt} onClick={() => onAnswer(opt)}
              className="w-full text-left px-5 py-4 rounded-2xl font-semibold text-white transition-all"
              style={{
                background: answer === opt ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                border: answer === opt ? 'none' : '1px solid rgba(255,255,255,0.08)',
              }}>
              {opt}
            </button>
          ))}
        </div>
        {outroSelected && (
          <div className="mt-4">
            <input
              type="number"
              step="0.1"
              value={outroVal}
              onChange={e => setOutroVal(e.target.value)}
              placeholder={question.unit ? `ex: 2.6 (${question.unit})` : 'Introduza o valor'}
              className="w-full rounded-2xl px-5 py-4 text-white text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              autoFocus
            />
            <button
              onClick={() => outroVal && onAnswer(outroVal + (question.unit ? question.unit : ''))}
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
        {current > 1 && (
          <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mt-4 transition-colors">
            <ChevronLeft size={15} /> Voltar
          </button>
        )}
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
      <button onClick={() => onTextNext(text)} disabled={!canContinue}
        className="w-full mt-4 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-white transition-all"
        style={{
          background: canContinue ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
          opacity: !canContinue ? 0.4 : 1,
          boxShadow: canContinue ? '0 8px 24px rgba(99,102,241,0.4)' : 'none',
        }}>
        {question.optional && !text ? 'Saltar' : 'Continuar'} <ChevronRight size={18} />
      </button>
      <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mt-4 transition-colors">
        <ChevronLeft size={15} /> Voltar
      </button>
    </div>
  )
}

// ── Media ─────────────────────────────────────────────────────────────────────
function MediaStep({ mediaUrls, onMediaChange, onNext, onBack }: any) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(''); setUploading(true)
    const newUrls: string[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue
      if (file.size > 50 * 1024 * 1024) { setError('Ficheiro demasiado grande (máx 50MB)'); continue }
      const ext = file.name.split('.').pop()
      const path = `leads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { data, error: upErr } = await supabase.storage.from('lead-media').upload(path, file, { upsert: false })
      if (upErr) { setError('Erro ao carregar. Tente novamente.'); continue }
      const { data: { publicUrl } } = supabase.storage.from('lead-media').getPublicUrl(data.path)
      newUrls.push(publicUrl)
    }
    onMediaChange([...mediaUrls, ...newUrls]); setUploading(false)
  }

  return (
    <div>
      <h2 className="text-xl font-black text-white mb-1">Fotos ou vídeo</h2>
      <p className="text-gray-400 text-sm mb-6">Opcional — ajuda o profissional a dar um orçamento mais preciso.</p>
      {mediaUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {mediaUrls.map((url: string) => (
            <div key={url} className="relative aspect-square rounded-xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {url.match(/\.(mp4|mov|webm)$/i)
                ? <video src={url} className="w-full h-full object-cover" />
                : <img src={url} alt="" className="w-full h-full object-cover" />}
              <button onClick={() => onMediaChange(mediaUrls.filter((u: string) => u !== url))}
                className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.7)' }}>
                <X size={12} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*,video/*" multiple className="hidden"
        onChange={e => handleFiles(e.target.files)} />
      <button onClick={() => inputRef.current?.click()} disabled={uploading}
        className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl font-semibold text-sm"
        style={{ background: 'rgba(255,255,255,0.04)', border: '2px dashed rgba(255,255,255,0.12)', color: '#9ca3af' }}>
        {uploading ? <><Loader2 size={18} className="animate-spin" /> A carregar...</> : <><Camera size={18} /> Adicionar fotos ou vídeo</>}
      </button>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      <button onClick={onNext}
        className="w-full mt-4 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white"
        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)' }}>
        {mediaUrls.length > 0 ? 'Continuar' : 'Saltar'} <ChevronRight size={18} />
      </button>
      <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mt-4 transition-colors">
        <ChevronLeft size={15} /> Voltar
      </button>
    </div>
  )
}

// ── Contacto ──────────────────────────────────────────────────────────────────
function ContactStep({ name, phone, email, submitting, onNameChange, onPhoneChange, onEmailChange, onBack, onSubmit }: any) {
  const ready = name.trim().length > 1 && phone.trim().length >= 9
  return (
    <div>
      <h2 className="text-xl font-black text-white mb-2">Quase pronto!</h2>
      <p className="text-gray-400 text-sm mb-6">Deixe os seus dados e um profissional entrará em contacto.</p>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">O seu nome</label>
          <input value={name} onChange={e => onNameChange(e.target.value)} placeholder="João Silva"
            className="w-full rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Telemóvel / WhatsApp</label>
          <input value={phone} onChange={e => onPhoneChange(e.target.value)} placeholder="351912345678" type="tel"
            className="w-full rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Email <span className="text-gray-600 normal-case">(opcional)</span></label>
          <input value={email} onChange={e => onEmailChange(e.target.value)} placeholder="joao@email.com" type="email"
            className="w-full rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
        </div>
      </div>
      <button onClick={onSubmit} disabled={!ready || submitting}
        className="w-full mt-6 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white transition-all"
        style={{
          background: ready && !submitting ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
          boxShadow: ready && !submitting ? '0 8px 24px rgba(99,102,241,0.4)' : 'none',
          opacity: !ready || submitting ? 0.4 : 1,
        }}>
        {submitting ? 'A enviar...' : <>Enviar pedido <ChevronRight size={18} /></>}
      </button>
      <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mt-4 transition-colors">
        <ChevronLeft size={15} /> Voltar
      </button>
    </div>
  )
}
