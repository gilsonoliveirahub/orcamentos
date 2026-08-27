'use client'

import { useEffect, useState, useTransition } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Shield, LogOut, Loader2, Search } from 'lucide-react'
import AdminNav from '@/components/admin/AdminNav'
import { cardStyle, fmtDate } from '@/components/admin/AdminFicha'
import { ADMIN_PLAN_LABELS, type AdminPlanLabel } from '@/lib/admin-plan-label'

// Reutiliza a mesma GET /api/admin/professionals da área Profissionais —
// esta página só muda o que é mostrado (campos de subscrição em vez de
// atividade), nunca duplica a leitura nem os filtros. Ainda não implementa
// os novos períodos de 6 meses/1 ano — isso é um pacote comercial separado.
type SubscriptionRow = {
  id: string; name: string; email: string | null; plan: string | null
  effective_plan: AdminPlanLabel; trial_ends_at: string | null
  current_period_start: string | null; current_period_end: string | null
  pending_plan: string | null; marketplace_credits: number | null
  stripe_customer_id: string | null; stripe_subscription_id: string | null
}

const PLAN_BADGE_COLOR: Record<AdminPlanLabel, string> = { free: '#64748b', trial: '#fbbf24', starter: '#60a5fa', pro: '#34d399', inactive: '#f87171' }

export default function AdminSubscricoesPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()
  const [rows, setRows] = useState<SubscriptionRow[]>([])
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [plan, setPlan] = useState('')

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
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (plan) params.set('plan', plan)
    fetch(`/api/admin/professionals?${params.toString()}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao carregar subscrições')
        setRows(json.professionals)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar subscrições'))
      .finally(() => setLoading(false))
  }, [checking, q, plan])

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
                <p className="text-xs text-gray-600">FaçoPorTi — Subscrições</p>
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <LogOut size={14} /> Sair
            </button>
          </div>
          <AdminNav active="subscricoes" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="rounded-2xl p-4 flex flex-wrap gap-3 items-end mb-6" style={cardStyle}>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-gray-500 block mb-1">Pesquisar (nome/email)</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={q} onChange={e => setQ(e.target.value)} className="w-full bg-transparent border rounded-lg pl-8 pr-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Plano</label>
            <select value={plan} onChange={e => setPlan(e.target.value)} className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <option value="" style={{ background: '#0d0f1e' }}>Todos</option>
              {Object.entries(ADMIN_PLAN_LABELS).map(([k, label]) => <option key={k} value={k} style={{ background: '#0d0f1e' }}>{label}</option>)}
            </select>
          </div>
        </div>

        {error && <div className="text-sm text-center py-3 px-4 rounded-xl mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}

        <div className="rounded-2xl overflow-hidden overflow-x-auto" style={cardStyle}>
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-indigo-500" size={28} /></div>
          ) : rows.length === 0 ? (
            <p className="text-gray-500 text-sm p-6">Nenhuma subscrição encontrada para estes filtros.</p>
          ) : (
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <th className="px-4 py-3">Profissional</th>
                  <th className="px-4 py-3">Plano guardado</th>
                  <th className="px-4 py-3">Plano efetivo</th>
                  <th className="px-4 py-3">Trial até</th>
                  <th className="px-4 py-3">Período atual</th>
                  <th className="px-4 py-3">Pendente</th>
                  <th className="px-4 py-3 text-right">Créditos</th>
                  <th className="px-4 py-3">Stripe</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b cursor-pointer hover:bg-white/[0.02]" style={{ borderColor: 'rgba(255,255,255,0.04)' }} onClick={() => router.push(`/admin/profissionais/${r.id}`)}>
                    <td className="px-4 py-3 text-white font-semibold">{r.name}<div className="text-xs text-gray-500 font-normal">{r.email}</div></td>
                    <td className="px-4 py-3 text-gray-400">{r.plan || 'free'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: `${PLAN_BADGE_COLOR[r.effective_plan]}22`, color: PLAN_BADGE_COLOR[r.effective_plan] }}>{ADMIN_PLAN_LABELS[r.effective_plan]}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(r.trial_ends_at)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{r.current_period_start ? `${fmtDate(r.current_period_start)} → ${fmtDate(r.current_period_end)}` : '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{r.pending_plan || '—'}</td>
                    <td className="px-4 py-3 text-right text-white font-bold">{r.marketplace_credits ?? 0}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.stripe_customer_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
