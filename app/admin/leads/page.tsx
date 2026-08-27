'use client'

import { Suspense, useEffect, useState, useTransition } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { Shield, LogOut, Loader2, Search } from 'lucide-react'
import AdminNav from '@/components/admin/AdminNav'
import { ADMIN_LEAD_ACCESS_STATE_LABELS, type AdminLeadAccessState } from '@/lib/admin-lead-access-state'

type LeadRow = {
  id: string; name: string | null; phone: string | null; email: string | null
  status: string | null; source: string | null; specialty: string | null; zone_requested: string | null
  professional_id: string | null; created_at: string; valor_fechado: number | null
  access_state: AdminLeadAccessState; abandoned: boolean
  professionals: { name: string; specialty: string | null; zone: string | null } | null
}

const cardStyle = { background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }
const STATUS_COLOR: Record<string, string> = { novo: '#818cf8', qualificado: '#60a5fa', visita: '#fbbf24', proposta: '#c084fc', fechado: '#34d399', perdido: '#f87171' }
const ACCESS_COLOR: Record<AdminLeadAccessState, string> = { aberto: '#34d399', bloqueado: '#f87171', disponivel: '#60a5fa', adquirido: '#c084fc', desconhecido: '#64748b' }

// useSearchParams() exige um limite de Suspense em rotas estáticas (sem
// isto, o build de produção falha com "missing-suspense-with-csr-bailout").
export default function AdminLeadsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    }>
      <AdminLeadsPageInner />
    </Suspense>
  )
}

function AdminLeadsPageInner() {
  const router = useRouter()
  const searchParamsInit = useSearchParams()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [error, setError] = useState('')

  const [q, setQ] = useState('')
  const [status, setStatus] = useState(searchParamsInit.get('status') || '')
  const [source, setSource] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [zone, setZone] = useState('')
  const [accessState, setAccessState] = useState('')
  const [abandoned, setAbandoned] = useState(searchParamsInit.get('abandoned') === 'true')

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
    if (status) params.set('status', status)
    if (source) params.set('source', source)
    if (specialty) params.set('specialty', specialty)
    if (zone) params.set('zone', zone)
    if (accessState) params.set('access_state', accessState)
    if (abandoned) params.set('abandoned', 'true')

    fetch(`/api/admin/leads?${params.toString()}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao carregar leads')
        setLeads(json.leads)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar leads'))
      .finally(() => setLoading(false))
  }, [checking, q, status, source, specialty, zone, accessState, abandoned])

  const specialties = Array.from(new Set(leads.map(l => l.specialty).filter(Boolean))) as string[]

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
                <p className="text-xs text-gray-600">FaçoPorTi — Leads</p>
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <LogOut size={14} /> Sair
            </button>
          </div>
          <AdminNav active="leads" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="rounded-2xl p-4 flex flex-wrap gap-3 items-end mb-6" style={cardStyle}>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-gray-500 block mb-1">Pesquisar (nome/telefone/email)</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={q} onChange={e => setQ(e.target.value)} className="w-full bg-transparent border rounded-lg pl-8 pr-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Estado</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <option value="" style={{ background: '#0d0f1e' }}>Todos</option>
              {['novo', 'qualificado', 'visita', 'proposta', 'fechado', 'perdido'].map(s => <option key={s} value={s} style={{ background: '#0d0f1e' }}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Origem</label>
            <select value={source} onChange={e => setSource(e.target.value)} className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <option value="" style={{ background: '#0d0f1e' }}>Todas</option>
              <option value="pessoal" style={{ background: '#0d0f1e' }}>Link pessoal</option>
              <option value="marketplace" style={{ background: '#0d0f1e' }}>Marketplace</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Estado de acesso</label>
            <select value={accessState} onChange={e => setAccessState(e.target.value)} className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <option value="" style={{ background: '#0d0f1e' }}>Todos</option>
              {Object.entries(ADMIN_LEAD_ACCESS_STATE_LABELS).map(([k, label]) => <option key={k} value={k} style={{ background: '#0d0f1e' }}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Especialidade</label>
            <select value={specialty} onChange={e => setSpecialty(e.target.value)} className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <option value="" style={{ background: '#0d0f1e' }}>Todas</option>
              {specialties.map(s => <option key={s} value={s} style={{ background: '#0d0f1e' }}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Zona</label>
            <input value={zone} onChange={e => setZone(e.target.value)} placeholder="Ex: Lisboa" className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white w-28" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-400 pb-1.5">
            <input type="checkbox" checked={abandoned} onChange={e => setAbandoned(e.target.checked)} /> Só abandonados (+30d)
          </label>
        </div>

        {error && <div className="text-sm text-center py-3 px-4 rounded-xl mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}

        <div className="rounded-2xl overflow-hidden overflow-x-auto" style={cardStyle}>
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-indigo-500" size={28} /></div>
          ) : leads.length === 0 ? (
            <p className="text-gray-500 text-sm p-6">Nenhum lead encontrado para estes filtros.</p>
          ) : (
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Profissional</th>
                  <th className="px-4 py-3">Especialidade / Zona</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Acesso</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-right">Data</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(l => (
                  <tr key={l.id} className="border-b cursor-pointer hover:bg-white/[0.02]" style={{ borderColor: 'rgba(255,255,255,0.04)' }} onClick={() => router.push(`/admin/leads/${l.id}`)}>
                    <td className="px-4 py-3 text-white font-semibold">{l.name || 'Sem nome'} {l.abandoned && <span className="ml-1 text-xs" style={{ color: '#fbbf24' }} title="Abandonado (+30d)">●</span>}</td>
                    <td className="px-4 py-3 text-gray-400">{l.professionals?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{l.specialty} {l.zone_requested ? `· ${l.zone_requested}` : ''}</td>
                    <td className="px-4 py-3 text-gray-400 capitalize">{l.source || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: `${ACCESS_COLOR[l.access_state]}22`, color: ACCESS_COLOR[l.access_state] }}>
                        {ADMIN_LEAD_ACCESS_STATE_LABELS[l.access_state]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: `${STATUS_COLOR[l.status || ''] || '#64748b'}22`, color: STATUS_COLOR[l.status || ''] || '#64748b' }}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-white font-bold">{l.valor_fechado ? `€${l.valor_fechado}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">{new Date(l.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}</td>
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
