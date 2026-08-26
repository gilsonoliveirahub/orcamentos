'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Users, FileText, Euro, TrendingUp, CheckCircle, LogOut, ToggleLeft, ToggleRight, ChevronRight, Loader2, Shield, Pencil, X, BarChart3, Scale } from 'lucide-react'
import { buildCalibrationSamples, summarizeCalibration, summarizeCalibrationBySpecialty } from '@/lib/estimate-calibration'

interface Professional {
  id: string
  name: string
  phone?: string | null
  specialty?: string | null
  specialties?: string[] | null
  zone?: string | null
  description?: string | null
  active: boolean
  [key: string]: unknown
}

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [professionals, setProfessionals] = useState<any[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [quotes, setQuotes] = useState<any[]>([])
  const [editingProf, setEditingProf] = useState<Professional | null>(null)
  const [editForm, setEditForm] = useState({ name: '', phone: '', specialties: '', zone: '', description: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }

      // Verificar se é admin
      const { data: admin } = await supabase.from('admins').select('id').eq('user_id', user.id).maybeSingle()
      if (!admin) { router.push('/dashboard'); return }

      // Carregar todos os dados
      const [{ data: profs }, { data: leadsData }, { data: quotesData }] = await Promise.all([
        supabase.from('professionals').select('*').order('created_at', { ascending: false }),
        supabase.from('leads').select('*, professionals(name)').order('created_at', { ascending: false }),
        supabase.from('quotes').select('*'),
      ])

      setProfessionals(profs || [])
      setLeads(leadsData || [])
      setQuotes(quotesData || [])
      setLoading(false)
    })
  }, [router])

  async function patchProfessional(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/admin/professionals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Falha ao atualizar')
    return json.professional
  }

  async function toggleActive(id: string, current: boolean) {
    try {
      await patchProfessional(id, { active: !current })
      setProfessionals(prev => prev.map(p => p.id === id ? { ...p, active: !current } : p))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao atualizar')
    }
  }

  function openEdit(prof: Professional) {
    setEditingProf(prof)
    setEditError('')
    setEditForm({
      name: prof.name || '',
      phone: prof.phone || '',
      specialties: (prof.specialties && prof.specialties.length > 0 ? prof.specialties : [prof.specialty].filter(Boolean) as string[]).join(', '),
      zone: prof.zone || '',
      description: prof.description || '',
    })
  }

  async function saveEdit() {
    if (!editingProf) return
    setSavingEdit(true)
    setEditError('')
    try {
      const specialties = editForm.specialties.split(',').map(s => s.trim()).filter(Boolean)
      const updated = await patchProfessional(editingProf.id, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || null,
        specialties,
        zone: editForm.zone.trim() || null,
        description: editForm.description.trim() || null,
      })
      setProfessionals(prev => prev.map(p => p.id === editingProf.id ? { ...p, ...updated } : p))
      setEditingProf(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Falha ao atualizar')
    } finally {
      setSavingEdit(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  )

  const totalFaturacao = quotes.reduce((s, q) => s + ((q.valor_min + q.valor_max) / 2 || 0), 0)
  const leadsHoje = leads.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length
  const profActivos = professionals.filter(p => p.active).length

  // Calibração da estimativa: nunca toca nos motores de cálculo nem na
  // margem pública de +15% — só compara o que já foi gravado
  // (quotes.valor_min/max/final vs. leads.valor_fechado real).
  const calibrationSamples = buildCalibrationSamples(quotes, leads, professionals)
  const calibrationOverall = summarizeCalibration(calibrationSamples)
  const calibrationBySpecialty = summarizeCalibrationBySpecialty(calibrationSamples)

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      {/* Header */}
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
              <Shield size={18} className="text-white" />
            </div>
            <div>
              <h1 className="font-black text-white">Admin</h1>
              <p className="text-xs text-gray-600">FaçoPorTi — Painel de controlo</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/admin/metricas')}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: 'rgba(129,140,248,0.15)', color: '#818cf8' }}>
              <BarChart3 size={14} /> Métricas
            </button>
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <LogOut size={14} /> Sair
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* KPIs globais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: <Users size={18} />, value: profActivos, label: 'Profissionais activos', color: '#818cf8' },
            { icon: <FileText size={18} />, value: leads.length, label: 'Total leads', color: '#c084fc' },
            { icon: <TrendingUp size={18} />, value: leadsHoje, label: 'Leads hoje', color: '#60a5fa' },
            { icon: <Euro size={18} />, value: `€${Math.round(totalFaturacao)}`, label: 'Valor orçamentos', color: '#34d399' },
          ].map((k, i) => (
            <div key={i} className="rounded-2xl p-5" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2 mb-2" style={{ color: k.color }}>
                {k.icon}
                <span className="text-xs font-semibold text-gray-500">{k.label}</span>
              </div>
              <div className="text-2xl font-black text-white">{k.value}</div>
            </div>
          ))}
        </div>

        {/* Calibração da estimativa vs. valor real — só mede, nunca ajusta
            nada automaticamente. Sem amostra suficiente, mostra estado
            neutro em vez de inventar um número. */}
        <div className="mb-8">
          <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2">
            <Scale size={18} /> Calibração da Estimativa
          </h2>
          <div className="rounded-2xl p-5" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
            {!calibrationOverall ? (
              <p className="text-sm text-gray-500">Ainda sem trabalhos fechados com valor real e orçamento associado — sem amostra para comparar.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  {[
                    { label: 'Amostra', value: calibrationOverall.sampleSize, color: '#818cf8' },
                    { label: 'Erro médio', value: `${calibrationOverall.avgAbsErrorPercent.toFixed(1)}%`, color: '#fbbf24' },
                    { label: 'Dentro do intervalo', value: calibrationOverall.withinRangeCount, color: '#34d399' },
                    { label: 'Acima / Abaixo', value: `${calibrationOverall.aboveCount} / ${calibrationOverall.belowCount}`, color: '#f87171' },
                  ].map((k, i) => (
                    <div key={i}>
                      <div className="text-xl font-black" style={{ color: k.color }}>{k.value}</div>
                      <div className="text-xs text-gray-500">{k.label}</div>
                    </div>
                  ))}
                </div>
                {calibrationBySpecialty.length > 0 && (
                  <div className="pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Erro médio por especialidade</p>
                    <div className="space-y-2">
                      {calibrationBySpecialty.map(s => (
                        <div key={s.specialty} className="flex items-center gap-3 text-sm">
                          <span className="text-gray-300 flex-1">{s.specialty}</span>
                          <span className="text-gray-500 text-xs">{s.sampleSize} amostras</span>
                          <span className="font-bold w-16 text-right" style={{ color: '#fbbf24' }}>{s.avgAbsErrorPercent.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Profissionais */}
        <div className="mb-8">
          <h2 className="text-lg font-black text-white mb-4">Profissionais ({professionals.length})</h2>
          <div className="rounded-2xl overflow-hidden" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
            {professionals.length === 0 ? (
              <p className="text-gray-500 text-sm p-6">Nenhum profissional registado.</p>
            ) : professionals.map((prof, i) => {
              const profLeads = leads.filter(l => l.professional_id === prof.id)
              const profQuotes = quotes.filter(q => q.professional_id === prof.id)
              return (
                <div key={prof.id} className="flex items-center gap-4 px-5 py-4"
                  style={{ borderBottom: i < professionals.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                    {prof.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm">{prof.name}</div>
                    <div className="text-xs text-gray-500">{prof.email} · {prof.specialty} {prof.zone ? `· ${prof.zone}` : ''}</div>
                  </div>
                  <div className="hidden md:flex items-center gap-4 text-xs text-gray-500">
                    <span>{profLeads.length} leads</span>
                    <span>{profQuotes.length} orçamentos</span>
                    <a href={`/p/${prof.slug}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-indigo-400 transition-colors">
                      /p/{prof.slug} <ChevronRight size={12} />
                    </a>
                  </div>
                  <button onClick={() => openEdit(prof)}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
                    style={{ background: 'rgba(129,140,248,0.15)', color: '#818cf8' }}>
                    <Pencil size={14} /> Editar
                  </button>
                  <button onClick={() => toggleActive(prof.id, prof.active)}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
                    style={prof.active
                      ? { background: 'rgba(52,211,153,0.15)', color: '#34d399' }
                      : { background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>
                    {prof.active ? <><ToggleRight size={14} /> Activo</> : <><ToggleLeft size={14} /> Inactivo</>}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {editingProf && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => !savingEdit && setEditingProf(null)}>
            <div className="w-full max-w-md rounded-2xl p-6"
              style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.08)' }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-black text-white text-lg">Editar profissional</h3>
                <button onClick={() => !savingEdit && setEditingProf(null)} className="text-gray-500 hover:text-gray-300">
                  <X size={18} />
                </button>
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
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block uppercase tracking-wide">Descrição</label>
                  <textarea
                    value={editForm.description}
                    onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                    style={{ background: '#0a0c1a', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                </div>
              </div>

              {editError && (
                <div className="text-sm text-center py-2 px-4 rounded-xl mt-4"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {editError}
                </div>
              )}

              <div className="flex gap-3 mt-5">
                <button onClick={() => setEditingProf(null)} disabled={savingEdit}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-400"
                  style={{ background: 'rgba(255,255,255,0.05)' }}>
                  Cancelar
                </button>
                <button onClick={saveEdit} disabled={savingEdit}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: savingEdit ? 0.7 : 1 }}>
                  {savingEdit ? 'A guardar...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Últimos leads */}
        <div>
          <h2 className="text-lg font-black text-white mb-4">Últimos leads</h2>
          <div className="rounded-2xl overflow-hidden" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
            {leads.slice(0, 20).map((lead, i) => (
              <div key={lead.id} className="flex items-center gap-4 px-5 py-3"
                style={{ borderBottom: i < Math.min(leads.length, 20) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-sm">{lead.name || 'Sem nome'}</div>
                  <div className="text-xs text-gray-500">{lead.professionals?.name} · {lead.metadata?.tipo_trabalho || lead.q1_tipo_trabalho || '—'} {(lead.metadata?.area_m2 || lead.q3_area_m2) ? `· ${lead.metadata?.area_m2 || lead.q3_area_m2}m²` : ''}</div>
                </div>
                <div className="text-xs text-gray-600">
                  {new Date(lead.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-lg"
                  style={{
                    background: lead.status === 'fechado' ? 'rgba(52,211,153,0.15)' : 'rgba(129,140,248,0.15)',
                    color: lead.status === 'fechado' ? '#34d399' : '#818cf8',
                  }}>
                  {lead.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
