'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  LogOut, Loader2, ArrowLeft, Pencil, X, ToggleLeft, ToggleRight,
  ExternalLink, TrendingUp, Euro, Clock, ShieldCheck, History,
} from 'lucide-react'
import { ADMIN_PLAN_LABELS, type AdminPlanLabel } from '@/lib/admin-plan-label'

type Ficha = {
  professional: {
    id: string; name: string; email: string | null; phone: string | null
    specialty: string | null; specialties: string[] | null; zone: string | null
    active: boolean; slug: string | null; plan: string | null; trial_ends_at: string | null
    current_period_start: string | null; current_period_end: string | null
    pending_plan: string | null; marketplace_credits: number | null
    stripe_customer_id: string | null; stripe_subscription_id: string | null
    accepting_leads: boolean | null; created_at: string
  }
  effective_plan: AdminPlanLabel
  activity: {
    leadsPersonalCount: number; leadsMarketplaceCount: number; activeCount: number
    fechadosCount: number; perdidosCount: number; abandonedCount: number; totalCount: number
  }
  performance: {
    reliability: { score: number; total: number; resolved: number; abandoned: number; pending: number }
    conversionRate: number; avgResponseHours: number | null
    faturacaoReal: number; ticketMedio: number; comValorCount: number
  }
  history: Array<{ id: string; created_at: string; admin_email: string | null; changes: Record<string, { before: unknown; after: unknown }> }>
}

type FieldChange = { before: unknown; after: unknown }

const cardStyle = { background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }
const PLAN_BADGE_COLOR: Record<AdminPlanLabel, string> = { free: '#64748b', trial: '#fbbf24', starter: '#60a5fa', pro: '#34d399', inactive: '#f87171' }

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Stat({ label, value, color = '#818cf8' }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <div className="text-xl font-black" style={{ color }}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={cardStyle}>
      <h2 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2">{icon} {title}</h2>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm text-white font-semibold break-words">{value ?? '—'}</div>
    </div>
  )
}

export default function AdminProfissionalFichaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [error, setError] = useState('')

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', phone: '', specialties: '', zone: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/admin/login'); return }
      const { data: admin } = await supabase.from('admins').select('id').eq('user_id', user.id).maybeSingle()
      if (!admin) { router.push('/dashboard'); return }
      setChecking(false)
    })
  }, [router])

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    fetch(`/api/admin/professionals/${id}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao carregar profissional')
        setFicha(json)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar profissional'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { if (!checking) load() }, [checking, load])

  async function patchProfessional(updates: Record<string, unknown>) {
    const res = await fetch(`/api/admin/professionals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Falha ao atualizar')
    return json.professional
  }

  async function toggleActive() {
    if (!ficha) return
    try {
      await patchProfessional({ active: !ficha.professional.active })
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao atualizar')
    }
  }

  function openEdit() {
    if (!ficha) return
    setSaveError('')
    setEditForm({
      name: ficha.professional.name || '',
      phone: ficha.professional.phone || '',
      specialties: (ficha.professional.specialties?.length ? ficha.professional.specialties : [ficha.professional.specialty].filter(Boolean) as string[]).join(', '),
      zone: ficha.professional.zone || '',
      description: '',
    })
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true)
    setSaveError('')
    try {
      const specialties = editForm.specialties.split(',').map(s => s.trim()).filter(Boolean)
      await patchProfessional({
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || null,
        specialties,
        zone: editForm.zone.trim() || null,
      })
      setEditing(false)
      load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Falha ao atualizar')
    } finally {
      setSaving(false)
    }
  }

  if (checking || loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  )

  if (error || !ficha) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0a0c1a' }}>
        <p className="text-sm" style={{ color: '#f87171' }}>{error || 'Profissional não encontrado'}</p>
        <button onClick={() => router.push('/admin/profissionais')} className="text-sm text-indigo-400">Voltar à lista</button>
      </div>
    )
  }

  const { professional: p, effective_plan, activity, performance, history } = ficha

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin/profissionais')} className="text-gray-500 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              {p.name[0]}
            </div>
            <div>
              <h1 className="font-black text-white">{p.name}</h1>
              <p className="text-xs text-gray-600">{p.email}</p>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Ações */}
        <div className="flex flex-wrap gap-3">
          <button onClick={openEdit}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg"
            style={{ background: 'rgba(129,140,248,0.15)', color: '#818cf8' }}>
            <Pencil size={14} /> Editar
          </button>
          <button onClick={toggleActive}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg"
            style={p.active ? { background: 'rgba(52,211,153,0.15)', color: '#34d399' } : { background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>
            {p.active ? <><ToggleRight size={14} /> Ativo</> : <><ToggleLeft size={14} /> Inativo</>}
          </button>
          {p.slug && (
            <a href={`/p/${p.slug}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>
              <ExternalLink size={14} /> Ver perfil público
            </a>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Section title="Identificação" icon={<ShieldCheck size={16} />}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome" value={p.name} />
              <Field label="Email" value={p.email} />
              <Field label="Telefone" value={p.phone} />
              <Field label="Zona" value={p.zone} />
              <Field label="Especialidade(s)" value={(p.specialties?.length ? p.specialties : [p.specialty].filter(Boolean)).join(', ') || '—'} />
              <Field label="Regista desde" value={fmtDate(p.created_at)} />
              <Field label="A aceitar leads (marketplace)" value={p.accepting_leads === false ? 'Pausado' : 'Sim'} />
              <Field label="Estado" value={p.active ? 'Ativo' : 'Inativo'} />
            </div>
          </Section>

          <Section title="Plano / Subscrição" icon={<Euro size={16} />}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Plano guardado" value={p.plan || 'free'} />
              <Field label="Plano efetivo" value={
                <span className="px-2 py-0.5 rounded-lg text-xs font-bold" style={{ background: `${PLAN_BADGE_COLOR[effective_plan]}22`, color: PLAN_BADGE_COLOR[effective_plan] }}>
                  {ADMIN_PLAN_LABELS[effective_plan]}
                </span>
              } />
              <Field label="Trial até" value={fmtDate(p.trial_ends_at)} />
              <Field label="Plano pendente" value={p.pending_plan} />
              <Field label="Período atual (início)" value={fmtDate(p.current_period_start)} />
              <Field label="Período atual (fim)" value={fmtDate(p.current_period_end)} />
              <Field label="Créditos marketplace" value={p.marketplace_credits ?? 0} />
              <Field label="Stripe (customer / subscription)" value={p.stripe_customer_id ? `${p.stripe_customer_id} / ${p.stripe_subscription_id || '—'}` : '—'} />
            </div>
          </Section>
        </div>

        <Section title="Atividade (leads)" icon={<TrendingUp size={16} />}>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
            <Stat label="Link pessoal" value={activity.leadsPersonalCount} />
            <Stat label="Marketplace" value={activity.leadsMarketplaceCount} color="#c084fc" />
            <Stat label="Ativos" value={activity.activeCount} color="#60a5fa" />
            <Stat label="Fechados" value={activity.fechadosCount} color="#34d399" />
            <Stat label="Perdidos" value={activity.perdidosCount} color="#f87171" />
            <Stat label="Abandonados (+30d)" value={activity.abandonedCount} color="#fbbf24" />
          </div>
        </Section>

        <Section title="Desempenho" icon={<Clock size={16} />}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Fiabilidade" value={`${Math.round(performance.reliability.score * 100)}%`} />
            <Stat label="Conversão" value={`${Math.round(performance.conversionRate * 100)}%`} color="#34d399" />
            <Stat label="Resposta média" value={performance.avgResponseHours != null ? `${performance.avgResponseHours.toFixed(1)}h` : '—'} color="#60a5fa" />
            <Stat label="Ticket médio" value={`€${performance.ticketMedio}`} color="#fbbf24" />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <Stat label="Valor fechado gerado" value={`€${Math.round(performance.faturacaoReal)}`} color="#34d399" />
            <Stat label="Trabalhos fechados com valor indicado" value={`${performance.comValorCount} / ${activity.fechadosCount}`} />
          </div>
          {performance.reliability.total === 0 && (
            <p className="text-xs text-gray-600 mt-3">Ainda sem leads decididos (fechados/perdidos) para calcular fiabilidade ou conversão.</p>
          )}
        </Section>

        <Section title="Histórico de alterações administrativas" icon={<History size={16} />}>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma alteração administrativa registada para este profissional.</p>
          ) : (
            <div className="space-y-3">
              {history.map(h => (
                <div key={h.id} className="text-sm pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>{h.admin_email || 'Admin'}</span>
                    <span>{new Date(h.created_at).toLocaleString('pt-PT')}</span>
                  </div>
                  <div className="text-gray-300 text-xs space-y-0.5">
                    {Object.entries(h.changes).map(([field, diff]) => {
                      const { before, after } = diff as FieldChange
                      return (
                        <div key={field}>
                          <span className="text-gray-500">{field}:</span>{' '}
                          <span className="text-gray-500">{String(before ?? '—')}</span>
                          {' → '}
                          <span className="text-white">{String(after ?? '—')}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => !saving && setEditing(false)}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-black text-white text-lg">Editar profissional</h3>
              <button onClick={() => !saving && setEditing(false)} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {([
                { key: 'name', label: 'Nome' },
                { key: 'phone', label: 'Telefone' },
                { key: 'specialties', label: 'Especialidades (separadas por vírgula)' },
                { key: 'zone', label: 'Zona' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block uppercase tracking-wide">{f.label}</label>
                  <input
                    value={editForm[f.key]}
                    onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    style={{ background: '#0a0c1a', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                </div>
              ))}
            </div>
            {saveError && (
              <div className="text-sm text-center py-2 px-4 rounded-xl mt-4" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                {saveError}
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditing(false)} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-400" style={{ background: 'rgba(255,255,255,0.05)' }}>Cancelar</button>
              <button onClick={saveEdit} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'A guardar...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
