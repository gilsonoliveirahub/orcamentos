'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Users, FileText, Euro, TrendingUp, LogOut, ChevronRight, Loader2, Shield, Scale } from 'lucide-react'
import { buildCalibrationSamples, summarizeCalibration, summarizeCalibrationBySpecialty } from '@/lib/estimate-calibration'
import { getAdminPlanLabel, ADMIN_PLAN_LABELS, type AdminPlanLabel } from '@/lib/admin-plan-label'
import AdminNav from '@/components/admin/AdminNav'

const PLAN_BADGE_COLOR: Record<AdminPlanLabel, string> = {
  free: '#64748b', trial: '#fbbf24', starter: '#60a5fa', pro: '#34d399', inactive: '#f87171',
}

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [professionals, setProfessionals] = useState<any[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [quotes, setQuotes] = useState<any[]>([])

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

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  )

  const totalFaturacao = quotes.reduce((s, q) => s + ((q.valor_min + q.valor_max) / 2 || 0), 0)
  const leadsHoje = leads.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length
  const profActivos = professionals.filter(p => p.active).length

  // Contagem por plano EFETIVO (distingue trial de starter) — só para a
  // gestão administrativa, nunca usado para decidir permissões (isso
  // continua em lib/effective-plan.ts, intocado).
  const planCounts = professionals.reduce((acc, p) => {
    const label = getAdminPlanLabel({ plan: p.plan, trial_ends_at: p.trial_ends_at })
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {} as Record<AdminPlanLabel, number>)

  // Calibração da estimativa vs. valor real — só mede, nunca ajusta
  // nada automaticamente. Sem amostra suficiente, mostra estado
  // neutro em vez de inventar um número.
  const calibrationSamples = buildCalibrationSamples(quotes, leads, professionals)
  const calibrationOverall = summarizeCalibration(calibrationSamples)
  const calibrationBySpecialty = summarizeCalibrationBySpecialty(calibrationSamples)

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      {/* Header */}
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
                <p className="text-xs text-gray-600">FaçoPorTi — Painel de controlo</p>
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <LogOut size={14} /> Sair
            </button>
          </div>
          <AdminNav active="visao-geral" />
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

        {/* Resumo de profissionais — gestão completa fica em /admin/profissionais,
            aqui é só visão geral para não duplicar a mesma lista em dois sítios. */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-white">Profissionais ({professionals.length})</h2>
            <button onClick={() => router.push('/admin/profissionais')}
              className="flex items-center gap-1 text-xs font-bold text-indigo-400 hover:text-indigo-300">
              Gerir profissionais <ChevronRight size={14} />
            </button>
          </div>
          <div className="rounded-2xl p-5 flex flex-wrap gap-4" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
            {(Object.keys(ADMIN_PLAN_LABELS) as AdminPlanLabel[]).map(key => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: PLAN_BADGE_COLOR[key] }} />
                <span className="text-sm text-gray-300">{ADMIN_PLAN_LABELS[key]}</span>
                <span className="text-sm font-black text-white">{planCounts[key] || 0}</span>
              </div>
            ))}
          </div>
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
