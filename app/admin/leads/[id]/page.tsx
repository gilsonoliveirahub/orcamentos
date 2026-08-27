'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { LogOut, Loader2, ArrowLeft, User, Briefcase, FileText, Image as ImageIcon, Euro } from 'lucide-react'
import { Section, Field, fmtDateTime } from '@/components/admin/AdminFicha'
import { ADMIN_LEAD_ACCESS_STATE_LABELS, type AdminLeadAccessState } from '@/lib/admin-lead-access-state'

type LeadDetail = {
  lead: {
    id: string; name: string | null; phone: string | null; email: string | null
    status: string | null; source: string | null; specialty: string | null; zone_requested: string | null
    professional_id: string | null; created_at: string; updated_at: string; opened_at: string | null
    locked: boolean | null; valor_fechado: number | null; metadata: Record<string, unknown>
    q1_tipo_trabalho: string | null; q2_divisoes: string | null; q3_area_m2: number | null
    q4_cor_escura: boolean | null; q5_fissuras: boolean | null; q6_mobilias: boolean | null
    q7_primer: boolean | null; q8_teto: boolean | null; q9_prazo: string | null
    q10_orcamentos_anteriores: boolean | null; q11_fotos_url: string[] | null; q12_notas: string | null
    professionals: { id: string; name: string; email: string | null; phone: string | null; specialty: string | null; zone: string | null; slug: string | null } | null
  }
  access_state: AdminLeadAccessState
  quotes: Array<{ id: string; valor_min: number | null; valor_max: number | null; valor_final: number | null; proposal_text: string | null; status: string; created_at: string }>
  client: { id: string; name: string; email: string | null } | null
}

const ACCESS_COLOR: Record<AdminLeadAccessState, string> = { aberto: '#34d399', bloqueado: '#f87171', disponivel: '#60a5fa', adquirido: '#c084fc', desconhecido: '#64748b' }

const RESPOSTAS: Array<{ key: keyof LeadDetail['lead']; label: string }> = [
  { key: 'q1_tipo_trabalho', label: 'Tipo de trabalho' },
  { key: 'q2_divisoes', label: 'Divisões' },
  { key: 'q3_area_m2', label: 'Área (m²)' },
  { key: 'q4_cor_escura', label: 'Cor escura' },
  { key: 'q5_fissuras', label: 'Fissuras' },
  { key: 'q6_mobilias', label: 'Mobílias a mover' },
  { key: 'q7_primer', label: 'Primer' },
  { key: 'q8_teto', label: 'Teto incluído' },
  { key: 'q9_prazo', label: 'Prazo' },
  { key: 'q10_orcamentos_anteriores', label: 'Já teve orçamentos' },
  { key: 'q12_notas', label: 'Notas' },
]

function fmtValue(v: unknown) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  return String(v)
}

export default function AdminLeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<LeadDetail | null>(null)
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/admin/login'); return }
      const { data: admin } = await supabase.from('admins').select('id').eq('user_id', user.id).maybeSingle()
      if (!admin) { router.push('/dashboard'); return }
      setChecking(false)
    })
  }, [router])

  const load = useCallback(() => {
    startTransition(() => { setLoading(true); setError('') })
    fetch(`/api/admin/leads/${id}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao carregar lead')
        setData(json)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar lead'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { if (!checking) load() }, [checking, load])

  if (checking || loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  )

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0a0c1a' }}>
        <p className="text-sm" style={{ color: '#f87171' }}>{error || 'Lead não encontrado'}</p>
        <button onClick={() => router.push('/admin/leads')} className="text-sm text-indigo-400">Voltar à lista</button>
      </div>
    )
  }

  const { lead, access_state, quotes, client } = data
  const fotos = (lead.q11_fotos_url || []).filter(Boolean)

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin/leads')} className="text-gray-500 hover:text-white transition-colors"><ArrowLeft size={20} /></button>
            <div>
              <h1 className="font-black text-white">{lead.name || 'Sem nome'}</h1>
              <p className="text-xs text-gray-600">{lead.specialty} {lead.zone_requested ? `· ${lead.zone_requested}` : ''}</p>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-wrap gap-3">
          <span className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: `${ACCESS_COLOR[access_state]}22`, color: ACCESS_COLOR[access_state] }}>
            {ADMIN_LEAD_ACCESS_STATE_LABELS[access_state]}
          </span>
          <span className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(129,140,248,0.15)', color: '#818cf8' }}>{lead.status}</span>
          {lead.valor_fechado != null && (
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>Valor fechado: €{lead.valor_fechado}</span>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Section title="Cliente" icon={<User size={16} />}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome" value={lead.name} />
              <Field label="Telefone" value={lead.phone} />
              <Field label="Email" value={lead.email} />
              <Field label="Conta de cliente" value={client ? `Sim (${client.email || client.name})` : 'Não (sem login)'} />
            </div>
          </Section>

          <Section title="Profissional / Origem" icon={<Briefcase size={16} />}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Profissional" value={lead.professionals?.name} />
              <Field label="Origem" value={lead.source === 'marketplace' ? 'Marketplace' : lead.source === 'pessoal' ? 'Link pessoal' : lead.source} />
              <Field label="Criado em" value={fmtDateTime(lead.created_at)} />
              <Field label="Última atualização" value={fmtDateTime(lead.updated_at)} />
              <Field label="Aberto em" value={fmtDateTime(lead.opened_at)} />
              {lead.professionals?.slug && <Field label="Perfil" value={<a className="text-indigo-400" href={`/p/${lead.professionals.slug}`} target="_blank" rel="noopener noreferrer">/p/{lead.professionals.slug}</a>} />}
            </div>
          </Section>
        </div>

        <Section title="Respostas do pedido" icon={<FileText size={16} />}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {RESPOSTAS.map(r => (
              <Field key={r.key} label={r.label} value={fmtValue(lead[r.key])} />
            ))}
          </div>
        </Section>

        {fotos.length > 0 && (
          <Section title="Fotos / vídeos" icon={<ImageIcon size={16} />}>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {fotos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block h-24 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </Section>
        )}

        <Section title="Estimativa / proposta" icon={<Euro size={16} />}>
          {quotes.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum orçamento gerado para este pedido.</p>
          ) : (
            <div className="space-y-4">
              {quotes.map(q => (
                <div key={q.id} className="pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-2">
                    <Field label="Mínimo" value={q.valor_min != null ? `€${q.valor_min}` : '—'} />
                    <Field label="Máximo" value={q.valor_max != null ? `€${q.valor_max}` : '—'} />
                    <Field label="Final" value={q.valor_final != null ? `€${q.valor_final}` : '—'} />
                    <Field label="Estado" value={q.status} />
                  </div>
                  {q.proposal_text && <p className="text-xs text-gray-500 whitespace-pre-wrap">{q.proposal_text}</p>}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
