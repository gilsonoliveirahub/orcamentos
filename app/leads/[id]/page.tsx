'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Phone, MessageCircle, Copy, Check, Euro, RefreshCw, FileDown } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { PROFESSIONS } from '@/lib/professions'

// Legacy paint fields
const PAINT_LABELS: Record<string, string> = {
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
  q12_notas: 'Notas adicionais',
}

function formatValue(key: string, value: any): string {
  if (value === null || value === undefined || value === '') return '—'
  if (key === 'q3_area_m2' || key === 'area_m2') return `${value} m²`
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  return String(value)
}

const cardStyle = { background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.07)' }

export default function LeadDetail() {
  const { id } = useParams()
  const router = useRouter()
  const [lead, setLead] = useState<any>(null)
  const [quote, setQuote] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { loadData() }, [id])

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
    const specialty = lead?.professionals?.specialty || 'Pintura'
    const endpoint = specialty === 'Pintura' ? '/api/quote/generate' : '/api/quote/estimate'
    await fetch(endpoint, {
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
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <div className="w-8 h-8 border-4 border-indigo-900 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )

  if (!lead) return (
    <div className="min-h-screen flex items-center justify-center text-gray-500" style={{ background: '#0a0c1a' }}>
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

  const specialty = lead.professionals?.specialty || 'Pintura'
  const isPaint = specialty === 'Pintura'

  // Build answers list: prefer metadata (new), fall back to legacy paint fields
  const metadata = lead.metadata || {}
  const hasMetadata = Object.keys(metadata).length > 0
  const answers: Array<{ label: string; value: string }> = []

  if (hasMetadata) {
    const labelMap: Record<string, string> = {
      tipo_trabalho: 'Tipo de trabalho',
      area_m2: 'Área (m²)',
      divisoes: 'Divisões / Compartimentos',
      material: 'Material',
      estado: 'Estado atual',
      prazo: 'Prazo',
      frequencia: 'Frequência',
      distancia: 'Distância',
      tipo_imovel: 'Tipo de imóvel',
      elevador: 'Elevador disponível',
      notas: 'Notas adicionais',
    }
    for (const [k, v] of Object.entries(metadata)) {
      if (!v) continue
      const label = labelMap[k] || k.replace(/_/g, ' ')
      answers.push({ label, value: formatValue(k, v) })
    }
  } else if (isPaint) {
    for (const [key, label] of Object.entries(PAINT_LABELS)) {
      const value = lead[key]
      if (value === null || value === undefined || value === '') continue
      answers.push({ label, value: formatValue(key, value) })
    }
  }

  const canGenerate = hasMetadata || isPaint

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      {/* Header */}
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-black text-white">{lead.name || 'Sem nome'}</h1>
            <p className="text-gray-500 text-xs flex items-center gap-1">
              <Phone size={11} /> {lead.phone} · {new Date(lead.created_at).toLocaleDateString('pt-PT')}
              {specialty && <span className="ml-1 text-indigo-400">· {PROFESSIONS[specialty]?.label || specialty}</span>}
            </p>
          </div>
          <a
            href={`https://wa.me/${lead.phone?.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-black font-bold text-sm px-4 py-2 rounded-xl"
            style={{ background: '#25d366' }}
          >
            <MessageCircle size={15} /> WhatsApp
          </a>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-5">

        {/* Status */}
        <div className="rounded-2xl p-5" style={cardStyle}>
          <h2 className="text-sm font-bold text-gray-400 mb-3">Estado do Lead</h2>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map(s => (
              <button
                key={s.id}
                onClick={() => handleStatusChange(s.id)}
                className="px-3 py-1.5 rounded-xl text-sm font-semibold transition-all"
                style={lead.status === s.id
                  ? { background: s.color, color: '#000' }
                  : { background: 'rgba(255,255,255,0.04)', color: '#9ca3af' }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Respostas */}
        {answers.length > 0 && (
          <div className="rounded-2xl p-5" style={cardStyle}>
            <h2 className="text-sm font-bold text-gray-400 mb-4">Respostas do Cliente</h2>
            <div className="space-y-0">
              {answers.map(({ label, value }) => (
                <div key={label} className="flex justify-between items-start gap-4 py-2.5 border-b last:border-0"
                  style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <span className="text-gray-500 text-sm">{label}</span>
                  <span className="text-white text-sm font-medium text-right max-w-[60%]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Orçamento */}
        {quote ? (
          <div className="rounded-2xl p-5" style={cardStyle}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-400">Orçamento Gerado</h2>
              <div className="flex items-center gap-2">
                <a
                  href={`/quotes/${quote.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
                >
                  <FileDown size={12} /> Descarregar PDF
                </a>
                <button
                  onClick={handleGenerateQuote}
                  disabled={generating}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors"
                >
                  <RefreshCw size={12} className={generating ? 'animate-spin' : ''} /> Recalcular
                </button>
              </div>
            </div>

            <div className="flex items-baseline gap-1 mb-4">
              <Euro size={18} className="text-emerald-400 mb-0.5" />
              <span className="text-3xl font-black text-emerald-400">{quote.valor_min}–{quote.valor_max}</span>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Mínimo', value: quote.valor_min, color: '#34d399' },
                { label: 'Estimado', value: quote.valor_final, color: '#818cf8' },
                { label: 'Máximo', value: quote.valor_max, color: '#fbbf24' },
              ].map(item => (
                <div key={item.label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-lg font-bold" style={{ color: item.color }}>€{item.value}</div>
                  <div className="text-xs text-gray-500">{item.label}</div>
                </div>
              ))}
            </div>

            {quote.proposal_text && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 font-semibold tracking-wide">PROPOSTA</span>
                  <button
                    onClick={copyProposal}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                    style={copied
                      ? { background: 'rgba(52,211,153,0.15)', color: '#34d399' }
                      : { background: 'rgba(255,255,255,0.05)', color: '#9ca3af' }}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
                <pre className="rounded-xl p-4 text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  {quote.proposal_text}
                </pre>
                <a
                  href={`https://wa.me/${lead.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(quote.proposal_text)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full mt-3 text-black font-bold py-3 rounded-xl text-sm transition-all"
                  style={{ background: '#25d366' }}
                >
                  <MessageCircle size={16} /> Enviar Proposta via WhatsApp
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl p-6 text-center" style={cardStyle}>
            <p className="text-gray-500 text-sm mb-4">
              Ainda sem orçamento gerado para este lead.
            </p>
            {canGenerate && (
              <button
                onClick={handleGenerateQuote}
                disabled={generating}
                className="font-bold px-6 py-3 rounded-xl text-sm text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: generating ? 0.6 : 1 }}
              >
                {generating ? 'A calcular...' : 'Gerar Orçamento'}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
