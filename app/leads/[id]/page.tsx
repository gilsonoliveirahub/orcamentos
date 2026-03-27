'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Phone, MessageCircle, Copy, Check, Euro, RefreshCw } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'

const QUESTION_LABELS: Record<string, string> = {
  q1_tipo_trabalho: 'Tipo de trabalho',
  q2_divisoes: 'Divisões',
  q3_area_m2: 'Área (m²)',
  q4_cor_escura: 'Cor escura',
  q5_fissuras: 'Fissuras/buracos',
  q6_mobilias: 'Móveis a mover',
  q7_primer: 'Primário',
  q8_teto: 'Pintura de teto',
  q9_prazo: 'Prazo',
  q10_orcamentos_anteriores: 'Outros orçamentos',
  q11_fotos_url: 'Fotos',
  q12_notas: 'Notas adicionais',
}

function formatValue(key: string, value: any): string {
  if (value === null || value === undefined || value === '') return '—'
  if (key === 'q3_area_m2') return `${value} m²`
  if (key === 'q9_prazo') {
    const map: Record<string, string> = { urgente: 'Esta semana', normal: 'Este mês', sem_pressa: 'Sem pressa' }
    return map[value] || value
  }
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  return String(value)
}

export default function LeadDetail() {
  const { id } = useParams()
  const router = useRouter()
  const [lead, setLead] = useState<any>(null)
  const [quote, setQuote] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    const [{ data: leadData }, { data: quoteData }] = await Promise.all([
      supabase.from('leads').select('*, professionals(*)').eq('id', id).single(),
      supabase.from('quotes').select('*').eq('lead_id', id).maybeSingle(),
    ])
    setLead(leadData)
    setQuote(quoteData)
    setLoading(false)
  }

  async function handleGenerateQuote() {
    setGenerating(true)
    await fetch('/api/quote/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: id }),
    })
    await loadData()
    setGenerating(false)
  }

  async function handleStatusChange(newStatus: string) {
    await supabase.from('leads').update({ status: newStatus }).eq('id', id)
    setLead((prev: any) => ({ ...prev, status: newStatus }))
  }

  function copyProposal() {
    if (quote?.proposal_text) {
      navigator.clipboard.writeText(quote.proposal_text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center text-gray-500">
      A carregar...
    </div>
  )

  if (!lead) return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center text-gray-500">
      Lead não encontrado.
    </div>
  )

  const STATUSES = [
    { id: 'novo', label: 'Novo', color: '#6366f1' },
    { id: 'qualificado', label: 'Qualificado', color: '#f59e0b' },
    { id: 'visita', label: 'Visita', color: '#3b82f6' },
    { id: 'proposta', label: 'Proposta', color: '#8b5cf6' },
    { id: 'fechado', label: 'Fechado', color: '#10b981' },
    { id: 'perdido', label: 'Perdido', color: '#ef4444' },
  ]

  const currentStatus = STATUSES.find(s => s.id === lead.status)

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      {/* Header */}
      <div className="border-b border-[#2a2a2a] px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-black">{lead.name || 'Sem nome'}</h1>
          <p className="text-gray-500 text-xs flex items-center gap-1">
            <Phone size={11} /> {lead.phone} · {new Date(lead.created_at).toLocaleDateString('pt-PT')}
          </p>
        </div>
        <a
          href={`https://wa.me/${lead.phone}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-[#25d366] text-black font-bold text-sm px-4 py-2 rounded-lg"
        >
          <MessageCircle size={15} /> WhatsApp
        </a>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">

        {/* Status */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5">
          <h2 className="text-sm font-bold text-gray-400 mb-3">Estado do Lead</h2>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map(s => (
              <button
                key={s.id}
                onClick={() => handleStatusChange(s.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${lead.status === s.id ? 'text-black' : 'bg-[#1e1e1e] text-gray-400 hover:text-white'}`}
                style={lead.status === s.id ? { background: s.color } : {}}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Respostas */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5">
          <h2 className="text-sm font-bold text-gray-400 mb-4">Respostas do Cliente</h2>
          <div className="space-y-3">
            {Object.entries(QUESTION_LABELS).map(([key, label]) => {
              const value = lead[key]
              if (value === null || value === undefined || value === '') return null
              return (
                <div key={key} className="flex justify-between items-start gap-4 py-2 border-b border-[#2a2a2a] last:border-0">
                  <span className="text-gray-500 text-sm">{label}</span>
                  <span className="text-white text-sm font-medium text-right">{formatValue(key, value)}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Orçamento */}
        {quote ? (
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-400">Orçamento Gerado</h2>
              <button
                onClick={handleGenerateQuote}
                disabled={generating}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-white"
              >
                <RefreshCw size={12} className={generating ? 'animate-spin' : ''} /> Recalcular
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <Euro size={20} className="text-[#00c17c]" />
              <span className="text-3xl font-black text-[#00c17c]">{quote.valor_min}–{quote.valor_max}</span>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-[#0d0d0d] rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-white">€{quote.valor_base}</div>
                <div className="text-xs text-gray-500">Base</div>
              </div>
              <div className="bg-[#0d0d0d] rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-[#f59e0b]">€{quote.extras_total}</div>
                <div className="text-xs text-gray-500">Extras</div>
              </div>
              <div className="bg-[#0d0d0d] rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-[#6366f1]">€{quote.valor_final}</div>
                <div className="text-xs text-gray-500">Total</div>
              </div>
            </div>

            {/* Proposta */}
            {quote.proposal_text && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 font-semibold">TEXTO DA PROPOSTA</span>
                  <button
                    onClick={copyProposal}
                    className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${copied ? 'bg-[#10b981] text-black' : 'bg-[#1e1e1e] text-gray-400 hover:text-white'}`}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
                <pre className="bg-[#0d0d0d] rounded-xl p-4 text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
                  {quote.proposal_text}
                </pre>
                <a
                  href={`https://wa.me/${lead.phone}?text=${encodeURIComponent(quote.proposal_text)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full mt-3 bg-[#25d366] text-black font-bold py-3 rounded-xl text-sm"
                >
                  <MessageCircle size={16} /> Enviar Proposta via WhatsApp
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 text-center">
            <p className="text-gray-500 text-sm mb-4">
              {lead.q3_area_m2 ? 'Este lead ainda não tem orçamento gerado.' : 'Falta a área (m²) para calcular o orçamento.'}
            </p>
            {lead.q3_area_m2 && (
              <button
                onClick={handleGenerateQuote}
                disabled={generating}
                className="bg-[#6366f1] text-white font-bold px-6 py-3 rounded-xl text-sm"
              >
                {generating ? 'A gerar...' : 'Gerar Orçamento'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
