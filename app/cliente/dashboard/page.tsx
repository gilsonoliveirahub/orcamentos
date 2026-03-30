'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { MessageCircle, Clock, CheckCircle, Search, LogOut, User, Star, MapPin, Briefcase, Loader2, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { PROFESSIONS } from '@/lib/professions'

const STEPS = [
  { id: 'novo',        label: 'Recebido',  color: '#6366f1' },
  { id: 'qualificado', label: 'Analisado', color: '#3b82f6' },
  { id: 'visita',      label: 'Visita',    color: '#f59e0b' },
  { id: 'proposta',    label: 'Proposta',  color: '#8b5cf6' },
  { id: 'fechado',     label: 'Fechado',   color: '#22c55e' },
]

function getStepIndex(status: string) {
  return STEPS.findIndex(s => s.id === status)
}

export default function ClienteDashboard() {
  const router = useRouter()
  const [client, setClient] = useState<any>(null)
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewLead, setReviewLead] = useState<any>(null)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }

      const { data: clientData } = await supabase
        .from('clients').select('*').eq('user_id', user.id).maybeSingle()

      if (!clientData) { router.push('/login'); return }
      setClient(clientData)

      const { data: leadsData } = await supabase
        .from('leads')
        .select('*, professionals(name, specialty, phone, zone, slug), quotes(valor_min, valor_max)')
        .eq('phone', clientData.phone)
        .order('created_at', { ascending: false })

      setLeads(leadsData || [])
      setLoading(false)
    })
  }, [router])

  async function submitReview() {
    if (!reviewLead) return
    setSubmittingReview(true)
    await supabase.from('reviews').insert({
      professional_id: reviewLead.professional_id,
      lead_id: reviewLead.id,
      client_name: client?.name,
      rating,
      comment,
    })
    setSubmittingReview(false)
    setReviewLead(null)
    setComment('')
    setRating(5)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  )

  const ativos = leads.filter(l => l.status !== 'perdido' && l.status !== 'fechado')
  const concluidos = leads.filter(l => l.status === 'fechado' || l.status === 'perdido')

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>

      {/* Modal de avaliação */}
      {reviewLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-3xl p-6" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-black text-white text-lg">Avaliar serviço</h2>
              <button onClick={() => setReviewLead(null)} className="text-gray-500 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">Como correu o trabalho de <strong className="text-white">{reviewLead.professionals?.name}</strong>?</p>
            <div className="flex gap-2 mb-5">
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setRating(n)}>
                  <Star size={28} fill={n <= rating ? '#f59e0b' : 'none'} className={n <= rating ? 'text-amber-400' : 'text-gray-600'} />
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Conte como foi a experiência..."
              rows={3}
              className="w-full rounded-xl px-4 py-3 text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <button
              onClick={submitReview}
              disabled={submittingReview}
              className="w-full mt-4 py-3 rounded-xl font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              {submittingReview ? 'A enviar...' : 'Enviar avaliação'}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-lg mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-lg"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              {client?.name?.[0] || <User size={18} />}
            </div>
            <div>
              <div className="font-bold text-white text-sm">{client?.name}</div>
              <div className="text-xs text-gray-500">Portal do Cliente</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/pedir"
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-colors"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
            >
              <Plus size={13} /> Novo pedido
            </Link>
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8">

        {leads.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-white font-bold text-xl mb-2">Ainda sem pedidos</h2>
            <p className="text-gray-500 text-sm mb-6">Encontre um profissional e peça o seu primeiro orçamento.</p>
            <Link
              href="/pedir"
              className="inline-flex items-center gap-2 font-bold px-6 py-3.5 rounded-2xl text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              <Plus size={16} /> Pedir orçamento
            </Link>
          </div>
        ) : (
          <>
            {/* Pedidos ativos */}
            {ativos.length > 0 && (
              <div className="mb-8">
                <h2 className="text-white font-black text-lg mb-4">Em curso <span className="text-gray-500 font-normal text-sm">({ativos.length})</span></h2>
                <div className="space-y-4">
                  {ativos.map(lead => (
                    <LeadCard key={lead.id} lead={lead} onReview={setReviewLead} />
                  ))}
                </div>
              </div>
            )}

            {/* Pedidos concluídos */}
            {concluidos.length > 0 && (
              <div>
                <h2 className="text-white font-black text-lg mb-4">Concluídos <span className="text-gray-500 font-normal text-sm">({concluidos.length})</span></h2>
                <div className="space-y-4">
                  {concluidos.map(lead => (
                    <LeadCard key={lead.id} lead={lead} onReview={setReviewLead} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function LeadCard({ lead, onReview }: { lead: any; onReview: (l: any) => void }) {
  const prof = lead.professionals
  const status = lead.status || 'novo'
  const isFechado = status === 'fechado'
  const isPerdido = status === 'perdido'
  const stepIdx = getStepIndex(status)
  const emoji = PROFESSIONS[prof?.specialty]?.emoji || '🔧'
  const date = new Date(lead.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })
  const quote = lead.quotes?.[0]

  const waText = encodeURIComponent(
    `Olá ${prof?.name?.split(' ')[0]}! 👋 Sou ${lead.name} e pedi um orçamento pelo FaçoPorTi. Como está o meu pedido?`
  )

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#0d0f1e', border: `1px solid ${isFechado ? 'rgba(34,197,94,0.2)' : isPerdido ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.07)'}` }}>

      {/* Barra de cor no topo */}
      <div className="h-1" style={{ background: isFechado ? '#22c55e' : isPerdido ? '#ef4444' : STEPS[Math.max(0, stepIdx)]?.color || '#6366f1' }} />

      <div className="p-5">
        {/* Profissional */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="font-black text-white text-sm">{prof?.name || 'Profissional'}</span>
              <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={10} /> {date}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs" style={{ color: '#818cf8' }}><Briefcase size={9} className="inline mr-0.5" />{prof?.specialty}</span>
              {prof?.zone && <span className="text-xs text-gray-500"><MapPin size={9} className="inline mr-0.5" />{prof.zone}</span>}
            </div>
          </div>
        </div>

        {/* Timeline de progresso */}
        {!isPerdido && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{
                      background: i <= stepIdx ? s.color : 'rgba(255,255,255,0.06)',
                      boxShadow: i === stepIdx ? `0 0 8px ${s.color}80` : 'none',
                    }}
                  >
                    {i < stepIdx && <CheckCircle size={10} className="text-white" />}
                    {i === stepIdx && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="hidden" />
                  )}
                </div>
              ))}
            </div>
            {/* Linha de ligação */}
            <div className="relative h-0.5 mx-2.5 -mt-4 mb-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="absolute inset-y-0 left-0 transition-all"
                style={{
                  width: `${(stepIdx / (STEPS.length - 1)) * 100}%`,
                  background: `linear-gradient(90deg, #6366f1, ${STEPS[Math.max(0, stepIdx)]?.color})`,
                }}
              />
            </div>
            <div className="flex justify-between mt-1">
              {STEPS.map((s, i) => (
                <span key={s.id} className="text-xs flex-1 text-center" style={{ color: i === stepIdx ? s.color : '#374151', fontSize: '10px' }}>
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {isPerdido && (
          <div className="mb-4 px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
            Este pedido foi encerrado
          </div>
        )}

        {/* Orçamento */}
        {quote && (
          <div className="mb-4 flex items-center justify-between px-3 py-2 rounded-xl"
            style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
            <span className="text-xs text-gray-400">Orçamento estimado</span>
            <span className="font-black text-sm" style={{ color: '#34d399' }}>
              €{Math.round(quote.valor_min)}–€{Math.round(quote.valor_max)}
            </span>
          </div>
        )}

        {/* Detalhes do serviço */}
        {(lead.q1_tipo_trabalho || lead.metadata?.tipo_trabalho) && (
          <div className="text-xs text-gray-500 mb-4">
            <span className="text-gray-600">Serviço: </span>
            {lead.metadata?.tipo_trabalho || lead.q1_tipo_trabalho}
            {(lead.metadata?.area_m2 || lead.q3_area_m2) && (
              <> · <span className="text-gray-600">Área: </span>{lead.metadata?.area_m2 || lead.q3_area_m2}m²</>
            )}
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-2">
          {prof?.phone && (
            <a
              href={`https://wa.me/${prof.phone}?text=${waText}`}
              target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
              style={{ background: 'rgba(37,211,102,0.1)', color: '#25d366', border: '1px solid rgba(37,211,102,0.2)' }}
            >
              <MessageCircle size={14} /> WhatsApp
            </a>
          )}
          {isFechado && (
            <button
              onClick={() => onReview(lead)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
              style={{ background: 'rgba(251,191,36,0.1)', color: '#f59e0b', border: '1px solid rgba(251,191,36,0.2)' }}
            >
              <Star size={14} /> Avaliar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
