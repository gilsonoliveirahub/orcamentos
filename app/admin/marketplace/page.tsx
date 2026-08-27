'use client'

import { useEffect, useState, useTransition } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Shield, LogOut, Loader2 } from 'lucide-react'
import AdminNav from '@/components/admin/AdminNav'
import { cardStyle } from '@/components/admin/AdminFicha'
import { ADMIN_LEAD_ACCESS_STATE_LABELS, type AdminLeadAccessState } from '@/lib/admin-lead-access-state'

// Reutiliza GET /api/admin/leads?source=marketplace — nunca uma segunda
// leitura de leads. "Créditos" mostrado é sempre o SALDO ATUAL do
// profissional (marketplace_credits), nunca um histórico de transações —
// essa tabela não existe hoje, e não se inventa aqui.
type MarketplaceLead = {
  id: string; specialty: string | null; zone_requested: string | null
  status: string | null; created_at: string; valor_fechado: number | null
  access_state: AdminLeadAccessState
  professionals: { name: string; marketplace_credits: number | null } | null
}

const STATUS_COLOR: Record<string, string> = { novo: '#818cf8', qualificado: '#60a5fa', visita: '#fbbf24', proposta: '#c084fc', fechado: '#34d399', perdido: '#f87171' }
const ACCESS_COLOR: Record<AdminLeadAccessState, string> = { aberto: '#34d399', bloqueado: '#f87171', disponivel: '#60a5fa', adquirido: '#c084fc', desconhecido: '#64748b' }

export default function AdminMarketplacePage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()
  const [leads, setLeads] = useState<MarketplaceLead[]>([])
  const [error, setError] = useState('')
  const [accessState, setAccessState] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/admin/login'); return }
      const { data: admin } = await supabase.from('admins').select('id').eq('user_id', user.id).maybeSingle()
      if (!admin) { router.push('/dashboard'); return }
      setChecking(false)
    })
  }, [router])

  useEffect(() => {
    if (checking) return
    startTransition(() => { setLoading(true); setError('') })
    const params = new URLSearchParams({ source: 'marketplace' })
    if (accessState) params.set('access_state', accessState)
    fetch(`/api/admin/leads?${params.toString()}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao carregar marketplace')
        setLeads(json.leads)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar marketplace'))
      .finally(() => setLoading(false))
  }, [checking, accessState])

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
                <Shield size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-black text-white">Admin</h1>
                <p className="text-xs text-gray-600">FaçoPorTi — Marketplace</p>
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <LogOut size={14} /> Sair
            </button>
          </div>
          <AdminNav active="marketplace" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="rounded-2xl p-4 flex flex-wrap gap-3 items-end mb-6" style={cardStyle}>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Estado</label>
            <select value={accessState} onChange={e => setAccessState(e.target.value)} className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <option value="" style={{ background: '#0d0f1e' }}>Todos</option>
              <option value="disponivel" style={{ background: '#0d0f1e' }}>Disponível</option>
              <option value="adquirido" style={{ background: '#0d0f1e' }}>Adquirido</option>
            </select>
          </div>
        </div>

        {error && <div className="text-sm text-center py-3 px-4 rounded-xl mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}

        <div className="rounded-2xl overflow-hidden overflow-x-auto" style={cardStyle}>
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-indigo-500" size={28} /></div>
          ) : leads.length === 0 ? (
            <p className="text-gray-500 text-sm p-6">Nenhuma oportunidade de marketplace encontrada.</p>
          ) : (
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <th className="px-4 py-3">Especialidade / Zona</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Adquirido por</th>
                  <th className="px-4 py-3 text-right">Saldo créditos (atual)</th>
                  <th className="px-4 py-3">Resultado</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-right">Data</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(l => (
                  <tr key={l.id} className="border-b cursor-pointer hover:bg-white/[0.02]" style={{ borderColor: 'rgba(255,255,255,0.04)' }} onClick={() => router.push(`/admin/leads/${l.id}`)}>
                    <td className="px-4 py-3 text-white font-semibold">{l.specialty} {l.zone_requested ? `· ${l.zone_requested}` : ''}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: `${ACCESS_COLOR[l.access_state]}22`, color: ACCESS_COLOR[l.access_state] }}>{ADMIN_LEAD_ACCESS_STATE_LABELS[l.access_state]}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{l.professionals?.name || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{l.professionals ? (l.professionals.marketplace_credits ?? 0) : '—'}</td>
                    <td className="px-4 py-3">
                      {l.status ? <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: `${STATUS_COLOR[l.status] || '#64748b'}22`, color: STATUS_COLOR[l.status] || '#64748b' }}>{l.status}</span> : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-bold">{l.valor_fechado ? `€${l.valor_fechado}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">{new Date(l.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-3">&quot;Saldo créditos (atual)&quot; é o saldo de agora do profissional que adquiriu — não existe histórico de transações de créditos para mostrar por lead.</p>
      </div>
    </div>
  )
}
