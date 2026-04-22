'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import { PROFESSIONS } from '@/lib/professions'

// Build label map from all profession question definitions
const QUESTION_LABELS: Record<string, string> = {}
for (const prof of Object.values(PROFESSIONS)) {
  for (const q of prof.questions) {
    if (!QUESTION_LABELS[q.key]) {
      QUESTION_LABELS[q.key] = q.text.replace(/\?$/, '').trim()
    }
  }
}

// Manual overrides for cleaner display
const LABEL_OVERRIDES: Record<string, string> = {
  notas: 'Observações',
  prazo: 'Prazo / Urgência',
  tipo_trabalho: 'Tipo de trabalho',
  area_m2: 'Área (m²)',
  // legacy paint fields
  q1_tipo_trabalho: 'Tipo de trabalho',
  q2_divisoes: 'Divisões',
  q3_area_m2: 'Área (m²)',
  q9_prazo: 'Prazo',
  q12_notas: 'Observações',
}

const SKIP_KEYS = new Set(['media_urls', 'altura_paredes_raw'])

function getLabel(key: string): string {
  return LABEL_OVERRIDES[key] || QUESTION_LABELS[key] || key.replace(/_/g, ' ')
}

function formatVal(key: string, value: any): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (Array.isArray(value)) return value.join(', ')
  if ((key === 'area_m2' || key === 'q3_area_m2') && !String(value).includes('m²')) return `${value} m²`
  return String(value)
}

export default function QuotePDF() {
  const { id } = useParams()
  const [data, setData] = useState<{ lead: any; quote: any; prof: any } | null>(null)

  useEffect(() => {
    supabase
      .from('quotes')
      .select('*, leads(*, professionals(*))')
      .eq('id', id)
      .single()
      .then(({ data: quote }) => {
        if (!quote) return
        setData({ quote, lead: quote.leads, prof: quote.leads?.professionals })
      })
  }, [id])

  useEffect(() => {
    if (data) setTimeout(() => window.print(), 1000)
  }, [data])

  if (!data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif', color: '#666' }}>
      A preparar orçamento...
    </div>
  )

  const { quote, lead, prof } = data
  const hoje = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
  const profLabel = PROFESSIONS[prof?.specialty]?.label || prof?.specialty || '—'
  const valorEstimado = Math.round((quote.valor_min + quote.valor_max) / 2)

  // Build details list from metadata or legacy fields
  const metadata = lead?.metadata || {}
  const details: Array<[string, string]> = []

  if (Object.keys(metadata).length > 0) {
    for (const [k, v] of Object.entries(metadata)) {
      if (SKIP_KEYS.has(k) || !v) continue
      const label = getLabel(k)
      const val = formatVal(k, v)
      if (val) details.push([label, val])
    }
  } else {
    const legacyKeys = ['q1_tipo_trabalho', 'q2_divisoes', 'q3_area_m2', 'q9_prazo', 'q12_notas']
    for (const k of legacyKeys) {
      const v = lead?.[k]
      if (!v) continue
      details.push([getLabel(k), formatVal(k, v)])
    }
  }

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; background: #f0f0f5; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
        }
      `}</style>

      {/* Toolbar (hidden when printing) */}
      <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: '#1a1a2e', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>FaçoPorTi — Orçamento</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => window.print()}
            style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
          >
            ⬇ Guardar PDF
          </button>
          <button
            onClick={() => window.close()}
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
          >
            Fechar
          </button>
        </div>
      </div>

      {/* A4 Page */}
      <div className="no-print" style={{ height: 60 }} />
      <div style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', background: '#fff', boxShadow: '0 4px 32px rgba(0,0,0,0.15)' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', padding: '40px 48px 32px', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -1, marginBottom: 4 }}>FaçoPorTi</div>
              <div style={{ fontSize: 13, opacity: 0.75, letterSpacing: 0.5 }}>PROPOSTA DE ORÇAMENTO</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 1 }}>Data de emissão</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{hoje}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '32px 48px' }}>

          {/* Profissional + Cliente */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
            <div style={{ background: '#f8f9ff', borderRadius: 12, padding: '20px 24px', borderLeft: '4px solid #6366f1' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>Profissional</div>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>{prof?.name || '—'}</div>
              <div style={{ color: '#555', fontSize: 13 }}>{profLabel}</div>
              {prof?.zone && <div style={{ color: '#777', fontSize: 12, marginTop: 2 }}>{prof.zone}</div>}
              {prof?.phone && <div style={{ color: '#6366f1', fontSize: 13, marginTop: 6, fontWeight: 600 }}>{prof.phone}</div>}
            </div>
            <div style={{ background: '#f8f9ff', borderRadius: 12, padding: '20px 24px', borderLeft: '4px solid #c9a84c' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>Cliente</div>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>{lead?.name || '—'}</div>
              {lead?.phone && <div style={{ color: '#777', fontSize: 13, marginTop: 2 }}>{lead.phone}</div>}
              {lead?.email && <div style={{ color: '#777', fontSize: 13 }}>{lead.email}</div>}
            </div>
          </div>

          {/* Detalhes do serviço */}
          {details.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 }}>Detalhes do Serviço</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {details.map(([label, value], i) => (
                    <tr key={label} style={{ background: i % 2 === 0 ? '#f8f9ff' : '#fff' }}>
                      <td style={{ padding: '9px 16px', color: '#666', width: '42%', fontWeight: 500 }}>{label}</td>
                      <td style={{ padding: '9px 16px', color: '#1a1a2e', fontWeight: 600 }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Valor estimado */}
          <div style={{ background: 'linear-gradient(135deg, #f0f0ff, #f8f4ff)', borderRadius: 16, padding: '28px 32px', marginBottom: 32, border: '2px solid rgba(99,102,241,0.15)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 18 }}>Valor Estimado</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mínimo</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#10b981' }}>€{quote.valor_min}</div>
              </div>
              <div style={{ color: '#ddd', fontSize: 28, fontWeight: 300 }}>—</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Máximo</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#8b5cf6' }}>€{quote.valor_max}</div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right', borderLeft: '2px solid rgba(99,102,241,0.2)', paddingLeft: 32 }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Estimativa central</div>
                <div style={{ fontSize: 40, fontWeight: 900, color: '#1a1a2e', letterSpacing: -1 }}>€{valorEstimado}</div>
              </div>
            </div>
            <div style={{ marginTop: 14, fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>
              * Valor sujeito a confirmação após visita técnica ao local.
            </div>
          </div>

          {/* Texto da proposta */}
          {quote.proposal_text && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 }}>Mensagem da Proposta</div>
              <div style={{ background: '#f8f9ff', borderRadius: 12, padding: '20px 24px', fontSize: 13, color: '#333', lineHeight: 1.75, whiteSpace: 'pre-wrap', fontFamily: 'inherit', borderLeft: '3px solid #6366f1' }}>
                {quote.proposal_text}
              </div>
            </div>
          )}

          {/* Condições gerais */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: 20, fontSize: 11, color: '#aaa', lineHeight: 1.7 }}>
            <div style={{ fontWeight: 700, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }}>Condições Gerais</div>
            <ul style={{ margin: 0, paddingLeft: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
              <li>Este orçamento tem validade de 30 dias.</li>
              <li>Valor final confirmado após visita ao local.</li>
              <li>Materiais não incluídos, salvo indicação em contrário.</li>
              <li>Pagamento conforme acordado entre as partes.</li>
            </ul>
          </div>

        </div>

        {/* Footer */}
        <div style={{ background: '#1a1a2e', padding: '16px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>FaçoPorTi</div>
          <div style={{ color: '#64748b', fontSize: 11 }}>facoporti.com · A plataforma que trabalha por si</div>
        </div>

      </div>
    </>
  )
}
