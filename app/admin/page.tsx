'use client'

import { useEffect, useState, useTransition } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Users, FileText, Euro, LogOut, Loader2, Shield, Scale, AlertTriangle, Clock } from 'lucide-react'
import { ADMIN_PLAN_LABELS, type AdminPlanLabel } from '@/lib/admin-plan-label'
import AdminNav from '@/components/admin/AdminNav'

type Overview = {
  professionals: { total: number; byPlan: Record<AdminPlanLabel, number> }
  business: { totalLeads: number; leadsHoje: number; novos: number; emCurso: number; propostas: number; fechados: number; perdidos: number; taxaFecho: number }
  value: { valorFechadoReal: number; ticketMedio: number; comValorCount: number }
  alerts: { trialsEndingSoon: Array<{ id: string; name: string; trial_ends_at: string }>; abandonedLeadsCount: number }
  calibration: {
    overall: { sampleSize: number; avgAbsErrorPercent: number; withinRangeCount: number; aboveCount: number; belowCount: number } | null
    bySpecialty: Array<{ specialty: string; sampleSize: number; avgAbsErrorPercent: number }>
  }
  recentLeads: Array<{ id: string; name: string | null; status: string | null; specialty: string | null; zone_requested: string | null; created_at: string; professional_name: string | null }>
}

const cardStyle = { background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }
const PLAN_BADGE_COLOR: Record<AdminPlanLabel, string> = { free: '#64748b', trial: '#fbbf24', starter: '#60a5fa', pro: '#34d399', inactive: '#f87171' }

function Kpi({ icon, value, label, color, onClick }: { icon: React.ReactNode; value: string | number; label: string; color: string; onClick?: () => void }) {
  return (
    <div className="rounded-2xl p-5" style={{ ...cardStyle, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div className="flex items-center gap-2 mb-2" style={{ color }}>
        {icon}
        <span className="text-xs font-semibold text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-black text-white">{value}</div>
    </div>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: admin } = await supabase.from('admins').select('id').eq('user_id', user.id).maybeSingle()
      if (!admin) { router.push('/dashboard'); return }
      setChecking(false)
    })
  }, [router])

  useEffect(() => {
    if (checking) return
    startTransition(() => { setLoading(true); setError('') })
    fetch('/api/admin/overview')
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao carregar visão geral')
        setData(json)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar visão geral'))
      .finally(() => setLoading(false))
  }, [checking])

  if (checking || loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  )

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
        <p className="text-sm" style={{ color: '#f87171' }}>{error || 'Falha ao carregar'}</p>
      </div>
    )
  }

  const { professionals, business, value, alerts, calibration, recentLeads } = data

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
                <Shield size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-black text-white">Admin</h1>
                <p className="text-xs text-gray-600">FaçoPorTi — Painel de controlo</p>
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <LogOut size={14} /> Sair
            </button>
          </div>
          <AdminNav active="visao-geral" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Profissionais */}
        <div>
          <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2"><Users size={18} /> Profissionais ({professionals.total})</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {(Object.keys(ADMIN_PLAN_LABELS) as AdminPlanLabel[]).map(key => (
              <Kpi key={key} icon={<span className="w-2 h-2 rounded-full inline-block" style={{ background: PLAN_BADGE_COLOR[key] }} />}
                value={professionals.byPlan[key]} label={ADMIN_PLAN_LABELS[key]} color={PLAN_BADGE_COLOR[key]}
                onClick={() => router.push(`/admin/profissionais?plan=${key}`)} />
            ))}
          </div>
        </div>

        {/* Negócio */}
        <div>
          <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2"><FileText size={18} /> Negócio ({business.totalLeads} pedidos, {business.leadsHoje} hoje)</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Kpi icon={<FileText size={18} />} value={business.novos} label="Novos" color="#818cf8" onClick={() => router.push('/admin/leads?status=novo')} />
            <Kpi icon={<FileText size={18} />} value={business.emCurso} label="Em curso" color="#60a5fa" onClick={() => router.push('/admin/leads?status=qualificado,visita')} />
            <Kpi icon={<FileText size={18} />} value={business.propostas} label="Propostas" color="#c084fc" onClick={() => router.push('/admin/leads?status=proposta')} />
            <Kpi icon={<FileText size={18} />} value={business.fechados} label="Fechados" color="#34d399" onClick={() => router.push('/admin/leads?status=fechado')} />
            <Kpi icon={<FileText size={18} />} value={business.perdidos} label="Perdidos" color="#f87171" onClick={() => router.push('/admin/leads?status=perdido')} />
            <Kpi icon={<FileText size={18} />} value={`${Math.round(business.taxaFecho * 100)}%`} label="Taxa de fecho" color="#fbbf24" />
          </div>
        </div>

        {/* Valor */}
        <div>
          <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2"><Euro size={18} /> Valor</h2>
          <div className="grid grid-cols-2 gap-4">
            <Kpi icon={<Euro size={18} />} value={`€${Math.round(value.valorFechadoReal)}`} label="Valor real fechado" color="#34d399" onClick={() => router.push('/admin/financeiro')} />
            <Kpi icon={<Euro size={18} />} value={`€${value.ticketMedio}`} label="Ticket médio real" color="#fbbf24" onClick={() => router.push('/admin/financeiro')} />
          </div>
        </div>

        {/* Atenção */}
        {(alerts.trialsEndingSoon.length > 0 || alerts.abandonedLeadsCount > 0) && (
          <div>
            <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2"><AlertTriangle size={18} /> Atenção</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {alerts.trialsEndingSoon.length > 0 && (
                <div className="rounded-2xl p-5 cursor-pointer" style={cardStyle} onClick={() => router.push('/admin/profissionais?expiring_soon=true')}>
                  <div className="flex items-center gap-2 mb-2" style={{ color: '#fbbf24' }}><Clock size={18} /><span className="text-xs font-semibold text-gray-500">Trials a terminar em 7 dias</span></div>
                  <div className="text-2xl font-black text-white mb-1">{alerts.trialsEndingSoon.length}</div>
                  <div className="text-xs text-gray-500">{alerts.trialsEndingSoon.map(t => t.name).join(', ')}</div>
                </div>
              )}
              {alerts.abandonedLeadsCount > 0 && (
                <div className="rounded-2xl p-5 cursor-pointer" style={cardStyle} onClick={() => router.push('/admin/leads?abandoned=true')}>
                  <div className="flex items-center gap-2 mb-2" style={{ color: '#f87171' }}><AlertTriangle size={18} /><span className="text-xs font-semibold text-gray-500">Leads parados há mais de 30 dias</span></div>
                  <div className="text-2xl font-black text-white">{alerts.abandonedLeadsCount}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Calibração da estimativa vs. valor real — só mede, nunca ajusta
            nada automaticamente. Sem amostra suficiente, mostra estado
            neutro em vez de inventar um número. */}
        <div>
          <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2"><Scale size={18} /> Calibração da Estimativa</h2>
          <div className="rounded-2xl p-5" style={cardStyle}>
            {!calibration.overall ? (
              <p className="text-sm text-gray-500">Ainda sem trabalhos fechados com valor real e orçamento associado — sem amostra para comparar.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  {[
                    { label: 'Amostra', value: calibration.overall.sampleSize, color: '#818cf8' },
                    { label: 'Erro médio', value: `${calibration.overall.avgAbsErrorPercent.toFixed(1)}%`, color: '#fbbf24' },
                    { label: 'Dentro do intervalo', value: calibration.overall.withinRangeCount, color: '#34d399' },
                    { label: 'Acima / Abaixo', value: `${calibration.overall.aboveCount} / ${calibration.overall.belowCount}`, color: '#f87171' },
                  ].map((k, i) => (
                    <div key={i}>
                      <div className="text-xl font-black" style={{ color: k.color }}>{k.value}</div>
                      <div className="text-xs text-gray-500">{k.label}</div>
                    </div>
                  ))}
                </div>
                {calibration.bySpecialty.length > 0 && (
                  <div className="pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Erro médio por especialidade</p>
                    <div className="space-y-2">
                      {calibration.bySpecialty.map(s => (
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
          <div className="rounded-2xl overflow-hidden" style={cardStyle}>
            {recentLeads.map((lead, i) => (
              <div key={lead.id} className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-white/[0.02]"
                style={{ borderBottom: i < recentLeads.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                onClick={() => router.push(`/admin/leads/${lead.id}`)}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-sm">{lead.name || 'Sem nome'}</div>
                  <div className="text-xs text-gray-500">{lead.professional_name || '—'} · {lead.specialty} {lead.zone_requested ? `· ${lead.zone_requested}` : ''}</div>
                </div>
                <div className="text-xs text-gray-600">
                  {new Date(lead.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-lg"
                  style={{ background: lead.status === 'fechado' ? 'rgba(52,211,153,0.15)' : 'rgba(129,140,248,0.15)', color: lead.status === 'fechado' ? '#34d399' : '#818cf8' }}>
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
