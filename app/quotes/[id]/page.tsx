'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'

export default function QuotePDF() {
  const { id } = useParams()
  const [data, setData] = useState<{ lead: any; quote: any; prof: any } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: quote } = await supabase.from('quotes').select('*, leads(*, professionals(*))').eq('id', id).single()
      if (!quote) return
      setData({ quote, lead: quote.leads, prof: quote.leads?.professionals })
    }
    load()
  }, [id])

  useEffect(() => {
    if (data) {
      setTimeout(() => window.print(), 600)
    }
  }, [data])

  if (!data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif', color: '#666' }}>
      A preparar orçamento...
    </div>
  )

  const { quote, lead, prof } = data
  const hoje = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
  const metadata = lead?.metadata || {}

  const details: Array<[string, string]> = []
  const labelMap: Record<string, string> = {
    tipo_trabalho: 'Tipo de trabalho',
    area_m2: 'Área (m²)',
    divisoes: 'Divisões',
    material: 'Material',
    estado: 'Estado atual',
    prazo: 'Prazo',
    frequencia: 'Frequência',
    distancia: 'Distância',
    tipo_imovel: 'Tipo de imóvel',
    elevador: 'Elevador',
    notas: 'Observações',
  }

  if (Object.keys(metadata).length > 0) {
    for (const [k, v] of Object.entries(metadata)) {
      if (!v) continue
      const label = labelMap[k] || k.replace(/_/g, ' ')
      const val = k === 'area_m2' ? `${v} m²` : String(v)
      details.push([label, val])
    }
  } else {
    // Legacy paint fields
    const legacyMap: Record<string, string> = {
      q1_tipo_trabalho: 'Tipo de trabalho',
      q2_divisoes: 'Divisões',
      q3_area_m2: 'Área (m²)',
      q9_prazo: 'Prazo',
      q12_notas: 'Observações',
    }
    for (const [k, label] of Object.entries(legacyMap)) {
      const v = lead?.[k]
      if (!v) continue
      details.push([label, k === 'q3_area_m2' ? `${v} m²` : String(v)])
    }
  }

  const valorEstimado = Math.round((quote.valor_min + quote.valor_max) / 2)

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; }
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Print button (hidden when printing) */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, zIndex: 100, display: 'flex', gap: 8 }}>
        <button
          onClick={() => window.print()}
          style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 }}
        >
          Imprimir / Guardar PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{ background: '#eee', color: '#333', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 }}
        >
          Fechar
        </button>
      </div>

      <div style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', background: '#fff', padding: '0' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', padding: '40px 48px 32px', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, marginBottom: 4 }}>FaçoPorTi</div>
              <div style={{ fontSize: 13, opacity: 0.75 }}>Proposta de Orçamento</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, opacity: 0.75 }}>Data</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{hoje}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '32px 48px' }}>

          {/* Profissional + Cliente */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
            <div style={{ background: '#f8f9ff', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Profissional</div>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>{prof?.name || '—'}</div>
              <div style={{ color: '#666', fontSize: 13 }}>{prof?.specialty}</div>
              {prof?.zone && <div style={{ color: '#666', fontSize: 13 }}>{prof.zone}</div>}
              {prof?.phone && <div style={{ color: '#6366f1', fontSize: 13, marginTop: 4 }}>{prof.phone}</div>}
            </div>
            <div style={{ background: '#f8f9ff', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Cliente</div>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>{lead?.name || '—'}</div>
              {lead?.phone && <div style={{ color: '#666', fontSize: 13 }}>{lead.phone}</div>}
            </div>
          </div>

          {/* Detalhes do serviço */}
          {details.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Detalhes do Serviço</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {details.map(([label, value], i) => (
                    <tr key={label} style={{ background: i % 2 === 0 ? '#f8f9ff' : '#fff' }}>
                      <td style={{ padding: '10px 16px', color: '#555', fontSize: 13, width: '40%' }}>{label}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: 13 }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Valor */}
          <div style={{ background: 'linear-gradient(135deg, #f0f0ff, #f5f0ff)', borderRadius: 16, padding: '28px 32px', marginBottom: 32, border: '2px solid rgba(99,102,241,0.15)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Valor Estimado</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Mínimo</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#6366f1' }}>€{quote.valor_min}</div>
              </div>
              <div style={{ color: '#ccc', fontSize: 32 }}>—</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Máximo</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#8b5cf6' }}>€{quote.valor_max}</div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Estimativa central</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: '#1a1a2e' }}>€{valorEstimado}</div>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: '#999', fontStyle: 'italic' }}>
              * Valor sujeito a confirmação após visita técnica ao local.
            </div>
          </div>

          {/* Proposta texto */}
          {quote.proposal_text && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Mensagem da Proposta</div>
              <div style={{ background: '#f8f9ff', borderRadius: 12, padding: '20px 24px', fontSize: 13, color: '#333', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                {quote.proposal_text}
              </div>
            </div>
          )}

          {/* Termos */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: 24, fontSize: 11, color: '#999', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, color: '#555', marginBottom: 6 }}>Condições Gerais</div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              <li>Este orçamento tem validade de 30 dias a partir da data de emissão.</li>
              <li>O valor final será confirmado após vistoria ao local de trabalho.</li>
              <li>Materiais não incluídos, salvo indicação em contrário.</li>
              <li>Pagamento conforme acordado entre as partes.</li>
            </ul>
          </div>

        </div>

        {/* Footer */}
        <div style={{ background: '#1a1a2e', padding: '16px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>FaçoPorTi</div>
          <div style={{ color: '#64748b', fontSize: 12 }}>facoporti.pt · A plataforma que trabalha por si</div>
        </div>
      </div>
    </>
  )
}
