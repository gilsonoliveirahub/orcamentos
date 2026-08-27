'use client'

import { useEffect, useState, useTransition } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Shield, LogOut, Loader2, Search, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react'
import AdminNav from '@/components/admin/AdminNav'
import { ADMIN_PLAN_LABELS, type AdminPlanLabel } from '@/lib/admin-plan-label'

type ProfessionalRow = {
  id: string
  name: string
  email: string | null
  specialty: string | null
  specialties: string[] | null
  zone: string | null
  active: boolean
  plan: string | null
  effective_plan: AdminPlanLabel
  active_leads_count: number
  created_at: string
}

const PLAN_BADGE_COLOR: Record<AdminPlanLabel, string> = {
  free: '#64748b',
  trial: '#fbbf24',
  starter: '#60a5fa',
  pro: '#34d399',
  inactive: '#f87171',
}

const cardStyle = { background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }

export default function AdminProfissionaisPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [professionals, setProfessionals] = useState<ProfessionalRow[]>([])
  const [error, setError] = useState('')

  const [q, setQ] = useState('')
  const [plan, setPlan] = useState('')
  const [active, setActive] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [zone, setZone] = useState('')
  const [, startTransition] = useTransition()

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
    startTransition(() => {
      setLoading(true)
      setError('')
    })
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (plan) params.set('plan', plan)
    if (active) params.set('active', active)
    if (specialty) params.set('specialty', specialty)
    if (zone) params.set('zone', zone)

    fetch(`/api/admin/professionals?${params.toString()}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao carregar profissionais')
        setProfessionals(json.professionals)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar profissionais'))
      .finally(() => setLoading(false))
  }, [checking, q, plan, active, specialty, zone])

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch(`/api/admin/professionals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !current }),
    })
    if (!res.ok) { alert('Falha ao atualizar estado'); return }
    setProfessionals(prev => prev.map(p => p.id === id ? { ...p, active: !current } : p))
  }

  const specialties = Array.from(new Set(professionals.flatMap(p => p.specialties?.length ? p.specialties : [p.specialty]).filter(Boolean))) as string[]

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
                <Shield size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-black text-white">Admin</h1>
                <p className="text-xs text-gray-600">FaçoPorTi — Profissionais</p>
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <LogOut size={14} /> Sair
            </button>
          </div>
          <AdminNav active="profissionais" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Filtros */}
        <div className="rounded-2xl p-4 flex flex-wrap gap-3 items-end mb-6" style={cardStyle}>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-500 block mb-1">Pesquisar (nome ou email)</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nome ou email..."
                className="w-full bg-transparent border rounded-lg pl-8 pr-2 py-1.5 text-sm text-white"
                style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Plano</label>
            <select value={plan} onChange={e => setPlan(e.target.value)}
              className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <option value="" style={{ background: '#0d0f1e' }}>Todos</option>
              {Object.entries(ADMIN_PLAN_LABELS).map(([key, label]) => (
                <option key={key} value={key} style={{ background: '#0d0f1e' }}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Estado</label>
            <select value={active} onChange={e => setActive(e.target.value)}
              className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <option value="" style={{ background: '#0d0f1e' }}>Todos</option>
              <option value="true" style={{ background: '#0d0f1e' }}>Ativo</option>
              <option value="false" style={{ background: '#0d0f1e' }}>Inativo</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Especialidade</label>
            <select value={specialty} onChange={e => setSpecialty(e.target.value)}
              className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <option value="" style={{ background: '#0d0f1e' }}>Todas</option>
              {specialties.map(s => <option key={s} value={s} style={{ background: '#0d0f1e' }}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Zona</label>
            <input value={zone} onChange={e => setZone(e.target.value)} placeholder="Ex: Lisboa"
              className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white w-28" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
          </div>
        </div>

        {error && (
          <div className="text-sm text-center py-3 px-4 rounded-xl mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        <div className="rounded-2xl overflow-hidden" style={cardStyle}>
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-indigo-500" size={28} /></div>
          ) : professionals.length === 0 ? (
            <p className="text-gray-500 text-sm p-6">Nenhum profissional encontrado para estes filtros.</p>
          ) : professionals.map((prof, i) => (
            <div key={prof.id} className="flex flex-wrap items-center gap-3 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
              style={{ borderBottom: i < professionals.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
              onClick={() => router.push(`/admin/profissionais/${prof.id}`)}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                {prof.name[0]}
              </div>
              <div className="flex-1 min-w-[160px]">
                <div className="font-bold text-white text-sm">{prof.name}</div>
                <div className="text-xs text-gray-500">{prof.email} {prof.zone ? `· ${prof.zone}` : ''}</div>
              </div>
              <span className="text-xs text-gray-400 hidden sm:inline">{prof.specialty}</span>
              <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: `${PLAN_BADGE_COLOR[prof.effective_plan]}22`, color: PLAN_BADGE_COLOR[prof.effective_plan] }}>
                {ADMIN_PLAN_LABELS[prof.effective_plan]}
              </span>
              <span className="text-xs text-gray-400 hidden sm:inline">{prof.active_leads_count} ativos</span>
              <button onClick={e => { e.stopPropagation(); toggleActive(prof.id, prof.active) }}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
                style={prof.active
                  ? { background: 'rgba(52,211,153,0.15)', color: '#34d399' }
                  : { background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>
                {prof.active ? <><ToggleRight size={14} /> Ativo</> : <><ToggleLeft size={14} /> Inativo</>}
              </button>
              <ChevronRight size={16} className="text-gray-600 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
