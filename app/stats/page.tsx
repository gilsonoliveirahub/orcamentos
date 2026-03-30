'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, TrendingUp, Users, Euro, CheckCircle, Clock, Target, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function StatsPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<any[]>([])
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: true }),
      supabase.from('quotes').select('*'),
    ]).then(([{ data: l }, { data: q }]) => {
      setLeads(l || [])
      setQuotes(q || [])
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <div className="w-8 h-8 border-4 border-indigo-900 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )

  const totalLeads = leads.length
  const fechados = leads.filter(l => l.status === 'fechado')
  const perdidos = leads.filter(l => l.status === 'perdido')
  const ativos = leads.filter(l => !['fechado', 'perdido'].includes(l.status))
  const conversao = totalLeads > 0 ? Math.round((fechados.length / totalLeads) * 100) : 0

  const quotasFechadas = quotes.filter(q => fechados.some(l => l.id === q.lead_id))
  const faturacaoEstimada = quotasFechadas.reduce((sum, q) => sum + ((q.valor_min + q.valor_max) / 2), 0)
  const faturacaoPotencial = quotes.reduce((sum, q) => sum + ((q.valor_min + q.valor_max) / 2), 0)
  const ticketMedio = fechados.length > 0 ? Math.round(faturacaoEstimada / fechados.length) : 0

  // Tempo médio para fechar (dias)
  const tempoMedio = fechados.length > 0
    ? Math.round(fechados.reduce((sum, l) => {
        const dias = (new Date(l.updated_at || l.created_at).getTime() - new Date(l.created_at).getTime()) / 86400000
        return sum + dias
      }, 0) / fechados.length)
    : 0

  // Leads dos últimos 30 dias
  const now30 = new Date(); now30.setDate(now30.getDate() - 30)
  const leadsUltimos30 = leads.filter(l => new Date(l.created_at) > now30).length

  // Por mês (últimos 6 meses)
  const now = new Date()
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { label: d.toLocaleDateString('pt-PT', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() }
  })
  const leadsPorMes = meses.map(m => ({
    ...m,
    total: leads.filter(l => { const d = new Date(l.created_at); return d.getFullYear() === m.year && d.getMonth() === m.month }).length,
    fechados: fechados.filter(l => { const d = new Date(l.created_at); return d.getFullYear() === m.year && d.getMonth() === m.month }).length,
  }))
  const maxCount = Math.max(...leadsPorMes.map(m => m.total), 1)

  // Por estado
  const porStatus = [
    { id: 'novo', label: 'Novo', color: '#6366f1' },
    { id: 'qualificado', label: 'Qualificado', color: '#f59e0b' },
    { id: 'visita', label: 'Visita', color: '#3b82f6' },
    { id: 'proposta', label: 'Proposta', color: '#8b5cf6' },
    { id: 'fechado', label: 'Fechado', color: '#10b981' },
    { id: 'perdido', label: 'Perdido', color: '#ef4444' },
  ].map(s => ({ ...s, count: leads.filter(l => l.status === s.id).length })).filter(s => s.count > 0)

  // Por especialidade / tipo de trabalho
  const porTipo = Object.entries(
    leads.reduce((acc: Record<string, number>, l) => {
      const tipo = l.metadata?.tipo_trabalho || l.q1_tipo_trabalho || 'Outro'
      acc[tipo] = (acc[tipo] || 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const kpiStyle = { background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.07)' }

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-black text-white">Estatísticas</h1>
            <p className="text-gray-500 text-xs">Resumo do negócio</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-5">

        {/* KPIs principais */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: <Users size={15} className="text-indigo-400" />, label: 'TOTAL LEADS', value: totalLeads, sub: `${leadsUltimos30} nos últimos 30 dias`, color: '#818cf8' },
            { icon: <CheckCircle size={15} className="text-emerald-400" />, label: 'CONVERSÃO', value: `${conversao}%`, sub: `${fechados.length} fechados`, color: '#34d399' },
            { icon: <Euro size={15} className="text-green-400" />, label: 'FATURAÇÃO EST.', value: `€${Math.round(faturacaoEstimada)}`, sub: 'obras fechadas', color: '#4ade80' },
            { icon: <TrendingUp size={15} className="text-amber-400" />, label: 'PIPELINE', value: `€${Math.round(faturacaoPotencial)}`, sub: `${ativos.length} ativos`, color: '#fbbf24' },
            { icon: <Target size={15} className="text-purple-400" />, label: 'TICKET MÉDIO', value: `€${ticketMedio}`, sub: 'por obra fechada', color: '#c084fc' },
            { icon: <Clock size={15} className="text-blue-400" />, label: 'TEMPO FECHO', value: tempoMedio > 0 ? `${tempoMedio}d` : '—', sub: 'média para fechar', color: '#60a5fa' },
            { icon: <Zap size={15} className="text-red-400" />, label: 'PERDIDOS', value: perdidos.length, sub: `${totalLeads > 0 ? Math.round(perdidos.length / totalLeads * 100) : 0}% do total`, color: '#f87171' },
            { icon: <CheckCircle size={15} className="text-cyan-400" />, label: 'EM CURSO', value: ativos.length, sub: 'leads ativos', color: '#22d3ee' },
          ].map((k, i) => (
            <div key={i} className="rounded-2xl p-4" style={kpiStyle}>
              <div className="flex items-center gap-2 mb-2">
                {k.icon}
                <span className="text-xs text-gray-500 font-semibold tracking-wide">{k.label}</span>
              </div>
              <div className="text-2xl font-black" style={{ color: k.color }}>{k.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Gráfico de barras por mês */}
        <div className="rounded-2xl p-5" style={kpiStyle}>
          <h2 className="text-sm font-bold text-gray-400 mb-5">Leads por Mês</h2>
          <div className="flex items-end gap-2 h-28">
            {leadsPorMes.map(m => (
              <div key={`${m.year}-${m.month}`} className="flex-1 flex flex-col items-center gap-1">
                {m.total > 0 && <span className="text-xs text-gray-500">{m.total}</span>}
                <div className="w-full relative" style={{ height: `${(m.total / maxCount) * 88}px`, minHeight: m.total > 0 ? '6px' : '0' }}>
                  <div className="w-full h-full rounded-t-lg" style={{ background: 'rgba(99,102,241,0.25)' }} />
                  {m.fechados > 0 && (
                    <div
                      className="absolute bottom-0 w-full rounded-t-lg"
                      style={{ height: `${(m.fechados / m.total) * 100}%`, background: '#34d399' }}
                    />
                  )}
                </div>
                <span className="text-xs text-gray-500 capitalize">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(99,102,241,0.25)' }} /><span className="text-xs text-gray-500">Leads</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-400" /><span className="text-xs text-gray-500">Fechados</span></div>
          </div>
        </div>

        {/* Distribuição por estado */}
        {porStatus.length > 0 && (
          <div className="rounded-2xl p-5" style={kpiStyle}>
            <h2 className="text-sm font-bold text-gray-400 mb-4">Pipeline por Estado</h2>
            <div className="space-y-3">
              {porStatus.map(s => (
                <div key={s.id} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="text-sm text-gray-300 w-24">{s.label}</span>
                  <div className="flex-1 rounded-full h-2" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-2 rounded-full transition-all" style={{ width: `${(s.count / totalLeads) * 100}%`, background: s.color }} />
                  </div>
                  <span className="text-sm font-bold text-white w-6 text-right">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top tipos de trabalho */}
        {porTipo.length > 0 && (
          <div className="rounded-2xl p-5" style={kpiStyle}>
            <h2 className="text-sm font-bold text-gray-400 mb-4">Top Serviços Pedidos</h2>
            <div className="space-y-3">
              {porTipo.map(([tipo, count], i) => (
                <div key={tipo} className="flex items-center gap-3">
                  <span className="text-xs font-black text-gray-600 w-4">{i + 1}</span>
                  <span className="text-sm text-gray-300 flex-1 capitalize">{tipo}</span>
                  <span className="text-sm font-black text-white">{count as number}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalLeads === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📊</div>
            <p className="text-gray-500">Ainda sem dados. Começa a receber leads!</p>
          </div>
        )}
      </div>
    </div>
  )
}
