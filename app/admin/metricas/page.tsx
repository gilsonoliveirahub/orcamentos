'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Eye, MousePointerClick, PlayCircle, CheckCircle2, MessageCircle, Mail, UserPlus, Globe, IdCard } from 'lucide-react'
import AdminNav from '@/components/admin/AdminNav'

type Totals = {
  page_view: number
  quote_cta_click: number
  request_started: number
  request_completed: number
  whatsapp_click: number
  email_click: number
  registration_completed: number
}

type BucketTotals = Totals & { unique_visitors: number | null }

type MetricsResponse = {
  totals: Totals
  conversion: { view_to_started: number; started_to_completed: number; view_to_completed: number; view_to_registration: number }
  events_by_day: Array<{ day: string; event_type: string; count: number }>
  by_origin_channel: Array<{ origin_channel: string; event_count: number }>
  unique_visitors_platform: { by_day: Array<{ day: string; unique_visitors: number }>; daily_sum: number } | null
  perfis_publicos: BucketTotals
  area_profissional: BucketTotals | null
  site: BucketTotals | null
  by_professional: Array<{
    professional_id: string
    name: string
    specialty: string | null
    zone: string | null
    plan: string | null
    page_view: number
    quote_cta_click: number
    request_started: number
    request_completed: number
    whatsapp_click: number
    email_click: number
    unique_visitors_daily_sum: number
    conversion_rate: number
  }>
  by_utm_campaign: Array<{
    utm_campaign: string
    utm_source: string | null
    utm_medium: string | null
    page_view: number
    request_started: number
    request_completed: number
    registration_completed: number
    unique_visitors: number
    conversion_rate: number
  }>
  note: string
}

type Professional = { id: string; name: string; specialty: string | null; zone: string | null; plan: string | null }

const kpiStyle = { background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.07)' }

function defaultFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function daysAgoStr(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

// Atalhos de período — todos terminam sempre hoje; "Hoje" cobre só o dia
// atual (from === to). Não substituem os campos De/Até, só os pré-preenchem.
const PERIOD_PRESETS = [
  { label: 'Hoje', days: 0 },
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
] as const

export default function AdminMetricasPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [checking, setChecking] = useState(true)
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()

  const [from, setFrom] = useState(defaultFrom())
  const [to, setTo] = useState(todayStr())
  const [professionalId, setProfessionalId] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [zone, setZone] = useState('')
  const [plan, setPlan] = useState('')
  const [source, setSource] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/admin/login'); return }
      const { data: admin } = await supabase.from('admins').select('id').eq('user_id', user.id).maybeSingle()
      if (!admin) { router.push('/dashboard'); return }
      setAuthorized(true)
      setChecking(false)
    })
  }, [router])

  useEffect(() => {
    if (!authorized) return
    supabase.from('professionals').select('id, name, specialty, zone, plan').order('name').then(({ data }) => {
      setProfessionals(data || [])
    })
  }, [authorized])

  useEffect(() => {
    if (!authorized) return
    startTransition(() => {
      setLoadingData(true)
      setError('')
    })
    const params = new URLSearchParams({ from, to })
    if (professionalId) params.set('professional_id', professionalId)
    if (specialty) params.set('specialty', specialty)
    if (zone) params.set('zone', zone)
    if (plan) params.set('plan', plan)
    if (source) params.set('source', source)

    fetch(`/api/admin/metrics?${params.toString()}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao carregar métricas')
        setData(json)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar métricas'))
      .finally(() => setLoadingData(false))
  }, [authorized, from, to, professionalId, specialty, zone, plan, source])

  const specialties = useMemo(() => Array.from(new Set(professionals.map(p => p.specialty).filter(Boolean))) as string[], [professionals])
  const zones = useMemo(() => Array.from(new Set(professionals.map(p => p.zone).filter(Boolean))) as string[], [professionals])
  const plans = useMemo(() => Array.from(new Set(professionals.map(p => p.plan).filter(Boolean))) as string[], [professionals])

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  )

  const t = data?.totals
  const maxDayCount = data ? Math.max(...data.events_by_day.filter(e => e.event_type === 'page_view').map(e => e.count), 1) : 1
  const pageViewsByDay = data ? data.events_by_day.filter(e => e.event_type === 'page_view') : []

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/admin')} className="text-gray-500 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-lg font-black text-white">Métricas</h1>
              <p className="text-gray-500 text-xs">Visitas, cliques e conversão da plataforma</p>
            </div>
          </div>
          <AdminNav active="metricas" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Períodos rápidos — só pré-preenchem De/Até, continuam editáveis à mão */}
        <div className="flex flex-wrap gap-2">
          {PERIOD_PRESETS.map(p => {
            const presetFrom = daysAgoStr(p.days)
            const active = from === presetFrom && to === todayStr()
            return (
              <button key={p.label} onClick={() => { setFrom(presetFrom); setTo(todayStr()) }}
                className="text-xs font-bold px-3 py-1.5 rounded-full transition-all"
                style={active
                  ? { background: 'rgba(99,102,241,0.25)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.4)' }
                  : { background: 'rgba(255,255,255,0.04)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
                {p.label}
              </button>
            )
          })}
        </div>

        {/* Filtros */}
        <div className="rounded-2xl p-4 flex flex-wrap gap-3 items-end" style={kpiStyle}>
          {[
            { label: 'De', el: <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }} /> },
            { label: 'Até', el: <input type="date" value={to} onChange={e => setTo(e.target.value)} className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }} /> },
          ].map((f, i) => (
            <div key={i}>
              <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
              {f.el}
            </div>
          ))}

          <div>
            <label className="text-xs text-gray-500 block mb-1">Profissional</label>
            <select value={professionalId} onChange={e => setProfessionalId(e.target.value)}
              className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <option value="" style={{ background: '#0d0f1e' }}>Todos</option>
              {professionals.map(p => <option key={p.id} value={p.id} style={{ background: '#0d0f1e' }}>{p.name}</option>)}
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
            <select value={zone} onChange={e => setZone(e.target.value)}
              className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <option value="" style={{ background: '#0d0f1e' }}>Todas</option>
              {zones.map(z => <option key={z} value={z} style={{ background: '#0d0f1e' }}>{z}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Plano</label>
            <select value={plan} onChange={e => setPlan(e.target.value)}
              className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <option value="" style={{ background: '#0d0f1e' }}>Todos</option>
              {plans.map(p => <option key={p} value={p} style={{ background: '#0d0f1e' }}>{p}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Origem</label>
            <select value={source} onChange={e => setSource(e.target.value)}
              className="bg-transparent border rounded-lg px-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <option value="" style={{ background: '#0d0f1e' }}>Todas</option>
              <option value="pessoal" style={{ background: '#0d0f1e' }}>Link pessoal</option>
              <option value="marketplace" style={{ background: '#0d0f1e' }}>Marketplace</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="text-sm text-center py-3 px-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {loadingData ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-indigo-500" size={28} /></div>
        ) : data && t ? (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: <Eye size={18} />, value: t.page_view, label: 'Visitas', color: '#818cf8' },
                { icon: <UserPlus size={18} />, value: t.registration_completed, label: 'Registos (profissionais + clientes)', color: '#a78bfa' },
                { icon: <MousePointerClick size={18} />, value: t.quote_cta_click, label: 'Cliques "Pedir Orçamento"', color: '#c084fc' },
                { icon: <PlayCircle size={18} />, value: t.request_started, label: 'Pedidos iniciados', color: '#60a5fa' },
                { icon: <CheckCircle2 size={18} />, value: t.request_completed, label: 'Pedidos concluídos', color: '#34d399' },
                { icon: <MessageCircle size={18} />, value: t.whatsapp_click, label: 'Cliques WhatsApp', color: '#25d366' },
                { icon: <Mail size={18} />, value: t.email_click, label: 'Cliques email', color: '#fbbf24' },
                { icon: <CheckCircle2 size={18} />, value: `${Math.round(data.conversion.view_to_completed * 100)}%`, label: 'Conversão geral (visita → pedido)', color: '#f472b6' },
                { icon: <CheckCircle2 size={18} />, value: `${Math.round(data.conversion.started_to_completed * 100)}%`, label: 'Conversão do pedido (iniciado → concluído)', color: '#34d399' },
                { icon: <UserPlus size={18} />, value: `${Math.round(data.conversion.view_to_registration * 100)}%`, label: 'Conversão em registo (visita → conta criada)', color: '#a78bfa' },
                { icon: <Eye size={18} />, value: data.unique_visitors_platform ? data.unique_visitors_platform.daily_sum : '—', label: 'Visitantes únicos aproximados por dia (soma do período)', color: '#22d3ee' },
              ].map((k, i) => (
                <div key={i} className="rounded-2xl p-4" style={kpiStyle}>
                  <div className="flex items-center gap-2 mb-2" style={{ color: k.color }}>
                    {k.icon}
                    <span className="text-xs font-semibold text-gray-500">{k.label}</span>
                  </div>
                  <div className="text-2xl font-black text-white">{k.value}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 -mt-2">
              &quot;Clique no WhatsApp&quot; significa abertura do link — não garante que a mensagem foi enviada. Visitantes únicos são aproximados por dia; a soma do período pode contar a mesma pessoa mais de uma vez em dias diferentes.
            </p>

            {/* Três públicos, nunca misturados: área profissional (páginas de
                captação — /comecar, /juntar, /exclusivo, registo de
                profissional), perfis públicos (/p/[slug] — clientes a
                consultar um profissional específico) e site (páginas gerais
                + registo de cliente). Ver lib/analytics.ts
                classifyNullProfessionalPath e lib/metrics.ts
                fetchNullProfessionalBucketTotals/computeProfilesTotals. */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl p-5" style={kpiStyle}>
                <h2 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2"><UserPlus size={15} /> Área profissional (captação)</h2>
                <p className="text-xs text-gray-600 -mt-2 mb-4">/comecar, /juntar, /exclusivo</p>
                {data.area_profissional ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div><div className="text-xl font-black text-white">{data.area_profissional.page_view}</div><div className="text-xs text-gray-500">Visitas</div></div>
                      <div><div className="text-xl font-black text-white">{data.area_profissional.registration_completed}</div><div className="text-xs text-gray-500">Registos</div></div>
                    </div>
                    <p className="text-xs font-bold mt-3" style={{ color: '#a78bfa' }}>
                      {data.area_profissional.page_view > 0 ? Math.round((data.area_profissional.registration_completed / data.area_profissional.page_view) * 100) : 0}% visita → registo
                    </p>
                    {data.area_profissional.unique_visitors !== null && (
                      <p className="text-xs text-gray-600 mt-2">{data.area_profissional.unique_visitors} visitantes únicos aproximados (últimos 90 dias no máximo).</p>
                    )}
                  </>
                ) : <p className="text-xs text-gray-600">Filtra por profissional para ver isto — este bloco é sempre da plataforma inteira.</p>}
              </div>
              <div className="rounded-2xl p-5" style={kpiStyle}>
                <h2 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2"><IdCard size={15} /> Perfis públicos</h2>
                <p className="text-xs text-gray-600 -mt-2 mb-4">/p/[slug] — clientes a consultar um profissional</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-xl font-black text-white">{data.perfis_publicos.page_view}</div><div className="text-xs text-gray-500">Visitas</div></div>
                  <div><div className="text-xl font-black text-white">{data.perfis_publicos.quote_cta_click}</div><div className="text-xs text-gray-500">Cliques &quot;Pedir Orçamento&quot;</div></div>
                  <div><div className="text-xl font-black text-white">{data.perfis_publicos.request_started}</div><div className="text-xs text-gray-500">Pedidos iniciados</div></div>
                  <div><div className="text-xl font-black text-white">{data.perfis_publicos.request_completed}</div><div className="text-xs text-gray-500">Pedidos concluídos</div></div>
                </div>
                <p className="text-xs font-bold mt-3" style={{ color: '#f472b6' }}>
                  {data.perfis_publicos.page_view > 0 ? Math.round((data.perfis_publicos.request_completed / data.perfis_publicos.page_view) * 100) : 0}% visita ao perfil → pedido concluído
                </p>
                {data.perfis_publicos.unique_visitors !== null && (
                  <p className="text-xs text-gray-600 mt-3">{data.perfis_publicos.unique_visitors} visitantes únicos aproximados (soma entre profissionais e dias — pode repetir a mesma pessoa).</p>
                )}
              </div>
              <div className="rounded-2xl p-5" style={kpiStyle}>
                <h2 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2"><Globe size={15} /> Site (geral)</h2>
                <p className="text-xs text-gray-600 -mt-2 mb-4">/, /contactos, /pedir, registo de cliente</p>
                {data.site ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div><div className="text-xl font-black text-white">{data.site.page_view}</div><div className="text-xs text-gray-500">Visitas</div></div>
                      <div><div className="text-xl font-black text-white">{data.site.request_started}</div><div className="text-xs text-gray-500">Pedidos iniciados</div></div>
                      <div><div className="text-xl font-black text-white">{data.site.request_completed}</div><div className="text-xs text-gray-500">Pedidos concluídos</div></div>
                      <div><div className="text-xl font-black text-white">{data.site.registration_completed}</div><div className="text-xs text-gray-500">Registos</div></div>
                    </div>
                    {data.site.unique_visitors !== null && (
                      <p className="text-xs text-gray-600 mt-3">{data.site.unique_visitors} visitantes únicos aproximados (últimos 90 dias no máximo) — inclui quem nunca converteu.</p>
                    )}
                  </>
                ) : <p className="text-xs text-gray-600">Filtra por profissional para ver isto — este bloco é sempre da plataforma inteira.</p>}
              </div>
            </div>

            {/* Evolução diária (visitas) */}
            {pageViewsByDay.length > 0 && (
              <div className="rounded-2xl p-5" style={kpiStyle}>
                <h2 className="text-sm font-bold text-gray-400 mb-5">Visitas por dia</h2>
                <div className="flex items-end gap-1 h-28 overflow-x-auto">
                  {pageViewsByDay.map(d => (
                    <div key={d.day} className="flex-1 min-w-[6px] flex flex-col items-center gap-1" title={`${d.day}: ${d.count}`}>
                      <div className="w-full rounded-t-lg" style={{ height: `${(d.count / maxDayCount) * 88}px`, minHeight: d.count > 0 ? '4px' : '0', background: 'rgba(99,102,241,0.5)' }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Origem das visitas */}
            {data.by_origin_channel.length > 0 && (
              <div className="rounded-2xl p-5" style={kpiStyle}>
                <h2 className="text-sm font-bold text-gray-400 mb-4">Origem das visitas</h2>
                <div className="space-y-3">
                  {data.by_origin_channel.map(o => {
                    const max = Math.max(...data.by_origin_channel.map(x => x.event_count), 1)
                    return (
                      <div key={o.origin_channel} className="flex items-center gap-3">
                        <span className="text-sm text-gray-300 w-24 capitalize">{o.origin_channel}</span>
                        <div className="flex-1 rounded-full h-2" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <div className="h-2 rounded-full" style={{ width: `${(o.event_count / max) * 100}%`, background: '#6366f1' }} />
                        </div>
                        <span className="text-sm font-bold text-white w-10 text-right">{o.event_count}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-600 mt-3">Aplicações como WhatsApp e Instagram nem sempre enviam informação de origem — para medir corretamente, distribui os links com parâmetros UTM.</p>
              </div>
            )}

            {/* Campanhas (UTM) — pensado especificamente para "os anúncios
                pagos estão a gerar registos e pedidos, ou só visitas?". Só
                aparecem campanhas com utm_campaign preenchido nos links
                partilhados; cobre no máximo os últimos 90 dias (retenção de
                analytics_events, ver lib/metrics.ts fetchUtmCampaignTotals). */}
            {data.by_utm_campaign.length > 0 && (
              <div>
                <h2 className="text-lg font-black text-white mb-4">Campanhas (UTM)</h2>
                <div className="rounded-2xl overflow-hidden overflow-x-auto" style={kpiStyle}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        <th className="px-4 py-3">Campanha</th>
                        <th className="px-4 py-3">Origem</th>
                        <th className="px-4 py-3">Suporte</th>
                        <th className="px-4 py-3 text-right">Visitas</th>
                        <th className="px-4 py-3 text-right">Registos</th>
                        <th className="px-4 py-3 text-right">Pedidos concluídos</th>
                        <th className="px-4 py-3 text-right">Conversão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_utm_campaign.map(c => (
                        <tr key={c.utm_campaign} className="border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                          <td className="px-4 py-3 font-semibold text-white">{c.utm_campaign}</td>
                          <td className="px-4 py-3 text-gray-400">{c.utm_source || '—'}</td>
                          <td className="px-4 py-3 text-gray-400">{c.utm_medium || '—'}</td>
                          <td className="px-4 py-3 text-right text-white font-bold">{c.page_view}</td>
                          <td className="px-4 py-3 text-right text-white font-bold">{c.registration_completed}</td>
                          <td className="px-4 py-3 text-right text-white font-bold">{c.request_completed}</td>
                          <td className="px-4 py-3 text-right text-emerald-400 font-bold">{Math.round(c.conversion_rate * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-600 mt-2">Só cobre os últimos 90 dias (retenção dos eventos individuais). Precisa de <code>utm_campaign</code> nos links partilhados — sem UTM, a visita aparece só na Origem, nunca aqui.</p>
              </div>
            )}

            {/* Ranking por profissional */}
            <div>
              <h2 className="text-lg font-black text-white mb-4">Resultados por profissional</h2>
              <div className="rounded-2xl overflow-hidden overflow-x-auto" style={kpiStyle}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <th className="px-4 py-3">Profissional</th>
                      <th className="px-4 py-3">Especialidade</th>
                      <th className="px-4 py-3">Zona</th>
                      <th className="px-4 py-3">Plano</th>
                      <th className="px-4 py-3 text-right">Visitas</th>
                      <th className="px-4 py-3 text-right">Pedidos</th>
                      <th className="px-4 py-3 text-right">Conversão</th>
                      <th className="px-4 py-3 text-right">Visit. únicos (soma/dia)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_professional.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">Sem dados para os filtros escolhidos.</td></tr>
                    ) : data.by_professional.map(p => (
                      <tr key={p.professional_id} className="border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        <td className="px-4 py-3 font-semibold text-white">{p.name}</td>
                        <td className="px-4 py-3 text-gray-400">{p.specialty || '—'}</td>
                        <td className="px-4 py-3 text-gray-400">{p.zone || '—'}</td>
                        <td className="px-4 py-3 text-gray-400 capitalize">{p.plan || '—'}</td>
                        <td className="px-4 py-3 text-right text-white font-bold">{p.page_view}</td>
                        <td className="px-4 py-3 text-right text-white font-bold">{p.request_completed}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 font-bold">{Math.round(p.conversion_rate * 100)}%</td>
                        <td className="px-4 py-3 text-right text-gray-400">{p.unique_visitors_daily_sum}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
