'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import { MessageCircle, ChevronRight, ChevronLeft, Star, MapPin, Briefcase } from 'lucide-react'
import { calculateQuote, generateProposalText } from '@/lib/calculator'

const SERVICES: Record<string, { questions: string[]; keys: string[] }> = {
  Pintura: {
    questions: [
      'Que tipo de pintura precisa?',
      'Qual a área aproximada em m²?',
      'As paredes têm fissuras ou danos?',
      'Inclui pintura do teto?',
      'A cor escolhida é escura?',
      'Há móveis para mover?',
      'Qual a urgência?',
      'Alguma observação adicional?',
    ],
    keys: ['tipo_trabalho', 'area_m2', 'fissuras', 'teto', 'cor_escura', 'mobilias', 'prazo', 'notas'],
  },
  Limpeza: {
    questions: [
      'Que tipo de limpeza precisa?',
      'Qual a área da casa em m²?',
      'Quantas divisões?',
      'Inclui limpeza de janelas?',
      'Qual a urgência?',
      'Alguma observação adicional?',
    ],
    keys: ['tipo_trabalho', 'area_m2', 'divisoes', 'janelas', 'prazo', 'notas'],
  },
}

const TIPO_PINTURA = ['Interior', 'Exterior', 'Ambos']
const TIPO_LIMPEZA = ['Limpeza geral', 'Limpeza pós-obra', 'Limpeza fundo']
const PRAZO = ['Esta semana', 'Este mês', 'Sem pressa']
const SIM_NAO = ['Sim', 'Não']

export default function ProfessionalPublicPage() {
  const { slug } = useParams()
  const [professional, setProfessional] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0) // 0 = intro, 1-N = perguntas, final = resultado
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    supabase.from('professionals').select('*').eq('slug', slug).eq('active', true).maybeSingle()
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

  const service = SERVICES[professional.specialty] || SERVICES['Pintura']
  const totalSteps = service.questions.length + 1 // +1 para dados de contacto
  const isContactStep = step === totalSteps
  const isDone = submitted

  function getOptions(key: string) {
    if (key === 'tipo_trabalho') return professional.specialty === 'Limpeza' ? TIPO_LIMPEZA : TIPO_PINTURA
    if (key === 'prazo') return PRAZO
    if (['fissuras', 'teto', 'cor_escura', 'mobilias', 'janelas'].includes(key)) return SIM_NAO
    return null
  }

  async function handleSubmit() {
    // Guardar lead
    const leadData: any = {
      professional_id: professional.id,
      name,
      phone,
      status: 'novo',
      q1_tipo_trabalho: answers['tipo_trabalho'] || null,
      q2_divisoes: answers['divisoes'] || null,
      q3_area_m2: answers['area_m2'] ? parseFloat(answers['area_m2']) : null,
      q4_cor_escura: answers['cor_escura'] === 'Sim',
      q5_fissuras: answers['fissuras'] === 'Sim',
      q6_mobilias: answers['mobilias'] === 'Sim',
      q7_primer: false,
      q8_teto: answers['teto'] === 'Sim',
      q9_prazo: answers['prazo'] === 'Esta semana' ? 'urgente' : answers['prazo'] === 'Este mês' ? 'normal' : 'sem_pressa',
      q12_notas: answers['notas'] || null,
    }

    const { data: lead } = await supabase.from('leads').insert(leadData).select().single()

    if (lead) {
      // Calcular orçamento directamente no cliente sem precisar de API
      const quoteInput = {
        area_m2: leadData.q3_area_m2 || 50,
        tipo: (leadData.q1_tipo_trabalho?.toLowerCase() || 'interior') as 'interior' | 'exterior' | 'ambos',
        cor_escura: !!leadData.q4_cor_escura,
        fissuras: !!leadData.q5_fissuras,
        mobilias: !!leadData.q6_mobilias,
        primer: !!leadData.q7_primer,
        teto: !!leadData.q8_teto,
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
      const proposalText = generateProposalText({ ...leadData, name }, quoteResult, professional)

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

      // Notificação email em background (não bloqueia)
      fetch('/api/notifications/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id }),
      }).catch(() => {})
    }

    setSubmitted(true)
  }

  // Montar texto WhatsApp
  const waText = encodeURIComponent(
    `Olá ${professional.name}! 👋\n\nO meu nome é ${name} e pedi um orçamento pelo FaçoPorTi.\n\n` +
    Object.entries(answers).map(([k, v]) => `• ${k}: ${v}`).join('\n') +
    `\n\nPode confirmar disponibilidade?`
  )

  if (isDone) return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0c1a' }}>
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-black text-white mb-2">Pedido enviado!</h1>
        <p className="text-gray-400 mb-8">O seu pedido foi registado. Clique abaixo para falar directamente com {professional.name}.</p>
        <a href={`https://wa.me/${professional.phone}?text=${waText}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl text-black font-black text-lg"
          style={{ background: '#25d366', boxShadow: '0 8px 24px rgba(37,211,102,0.4)' }}>
          <MessageCircle size={22} />
          Falar no WhatsApp
        </a>
        <p className="text-gray-600 text-xs mt-4">
          Powered by FaçoPorTi
        </p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      {/* Header do profissional */}
      <div style={{ background: 'linear-gradient(135deg, #0d0f1e, #13152a)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-lg mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.4)' }}>
              {professional.name[0]}
            </div>
            <div>
              <h1 className="text-xl font-black text-white">{professional.name}</h1>
              <div className="flex items-center gap-3 mt-1">
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
            <p className="text-gray-400 mb-8">Responda a algumas perguntas rápidas e receba um orçamento automático em segundos.</p>
            <div className="space-y-3 mb-8">
              {['✅ Orçamento automático e gratuito', '⚡ Menos de 2 minutos', '📱 Ligação directa ao WhatsApp'].map(item => (
                <div key={item} className="flex items-center gap-3 text-sm text-gray-300">{item}</div>
              ))}
            </div>
            <button onClick={() => setStep(1)}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)' }}>
              Começar <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* Perguntas */}
        {step >= 1 && step <= service.questions.length && (
          <div>
            {/* Progress */}
            <div className="flex items-center gap-2 mb-6">
              <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-1.5 rounded-full transition-all"
                  style={{ width: `${((step) / totalSteps) * 100}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
              </div>
              <span className="text-xs text-gray-500">{step}/{totalSteps}</span>
            </div>

            <h2 className="text-xl font-black text-white mb-6">
              {service.questions[step - 1]}
            </h2>

            {(() => {
              const key = service.keys[step - 1]
              const options = getOptions(key)

              if (options) {
                return (
                  <div className="space-y-3">
                    {options.map(opt => (
                      <button key={opt} onClick={() => {
                        setAnswers(prev => ({ ...prev, [key]: opt }))
                        setStep(s => s + 1)
                      }}
                        className="w-full text-left px-5 py-4 rounded-2xl font-semibold text-white transition-all"
                        style={{
                          background: answers[key] === opt ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                          border: answers[key] === opt ? 'none' : '1px solid rgba(255,255,255,0.08)',
                        }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                )
              }

              return (
                <div>
                  <input
                    type={key === 'area_m2' ? 'number' : 'text'}
                    value={answers[key] || ''}
                    onChange={e => setAnswers(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={key === 'area_m2' ? 'ex: 80' : key === 'notas' ? 'Escreva aqui...' : ''}
                    className="w-full rounded-2xl px-5 py-4 text-white text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    autoFocus
                  />
                  <button onClick={() => setStep(s => s + 1)}
                    disabled={!answers[key]}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-white transition-all"
                    style={{ background: answers[key] ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)', opacity: answers[key] ? 1 : 0.4 }}>
                    Continuar <ChevronRight size={18} />
                  </button>
                </div>
              )
            })()}

            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mt-4 transition-colors">
                <ChevronLeft size={15} /> Voltar
              </button>
            )}
          </div>
        )}

        {/* Dados de contacto */}
        {isContactStep && (
          <div>
            <div className="flex items-center gap-2 mb-6">
              <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-1.5 rounded-full" style={{ width: '95%', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
              </div>
              <span className="text-xs text-gray-500">{totalSteps}/{totalSteps}</span>
            </div>

            <h2 className="text-xl font-black text-white mb-2">Quase pronto!</h2>
            <p className="text-gray-400 text-sm mb-6">Deixe os seus dados para receber o orçamento.</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">O seu nome</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="João Silva"
                  className="w-full rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">WhatsApp</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="351912345678"
                  className="w-full rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
            </div>

            <button onClick={handleSubmit} disabled={!name || !phone}
              className="w-full mt-6 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white transition-all"
              style={{ background: !name || !phone ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: name && phone ? '0 8px 24px rgba(99,102,241,0.4)' : 'none', opacity: !name || !phone ? 0.4 : 1 }}>
              Ver Orçamento <ChevronRight size={18} />
            </button>

            <button onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mt-4 transition-colors">
              <ChevronLeft size={15} /> Voltar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
