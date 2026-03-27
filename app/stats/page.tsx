'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, TrendingUp, Users, Euro, CheckCircle } from 'lucide-react'
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
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center text-gray-500">
      A carregar...
    </div>
  )

  const totalLeads = leads.length
  const fechados = leads.filter(l => l.status === 'fechado')
  const perdidos = leads.filter(l => l.status === 'perdido')
  const conversao = totalLeads > 0 ? Math.round((fechados.length / totalLeads) * 100) : 0

  // Faturação estimada (média dos orçamentos fechados)
  const quotasFechadas = quotes.filter(q => fechados.some(l => l.id === q.lead_id))
  const faturacaoEstimada = quotasFechadas.reduce((sum, q) => sum + ((q.valor_min + q.valor_max) / 2), 0)
  const faturacaoPotencial = quotes.reduce((sum, q) => sum + ((q.valor_min + q.valor_max) / 2), 0)

  // Leads por mês (últimos 6 meses)
  const now = new Date()
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return {
      label: d.toLocaleDateString('pt-PT', { month: 'short' }),
      year: d.getFullYear(),
      month: d.getMonth(),
    }
  })

  const leadsPorMes = meses.map(m => ({
    ...m,
    count: leads.filter(l => {
      const d = new Date(l.created_at)
      return d.getFullYear() === m.year && d.getMonth() === m.month
    }).length,
  }))

  const maxCount = Math.max(...leadsPorMes.map(m => m.count), 1)

  // Por status
  const porStatus = [
    { id: 'novo', label: 'Novo', color: '#6366f1' },
    { id: 'qualificado', label: 'Qualificado', color: '#f59e0b' },
    { id: 'visita', label: 'Visita', color: '#3b82f6' },
    { id: 'proposta', label: 'Proposta', color: '#8b5cf6' },
    { id: 'fechado', label: 'Fechado', color: '#10b981' },
    { id: 'perdido', label: 'Perdido', color: '#ef4444' },
  ].map(s => ({
    ...s,
    count: leads.filter(l => l.status === s.id).length,
  })).filter(s => s.count > 0)

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="border-b border-[#2a2a2a] px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-black">Estatísticas</h1>
          <p className="text-gray-500 text-xs">Resumo do negócio</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Users size={16} className="text-[#6366f1]" />
              <span className="text-xs text-gray-500 font-semibold">TOTAL LEADS</span>
            </div>
            <div className="text-3xl font-black text-white">{totalLeads}</div>
            <div className="text-xs text-gray-500 mt-1">{perdidos.length} perdidos</div>
          </div>

          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={16} className="text-[#10b981]" />
              <span className="text-xs text-gray-500 font-semibold">CONVERSÃO</span>
            </div>
            <div className="text-3xl font-black text-[#10b981]">{conversao}%</div>
            <div className="text-xs text-gray-500 mt-1">{fechados.length} fechados</div>
          </div>

          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Euro size={16} className="text-[#00c17c]" />
              <span className="text-xs text-gray-500 font-semibold">FATURAÇÃO EST.</span>
            </div>
            <div className="text-3xl font-black text-[#00c17c]">€{Math.round(faturacaoEstimada)}</div>
            <div className="text-xs text-gray-500 mt-1">obras fechadas</div>
          </div>

          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} className="text-[#f59e0b]" />
              <span className="text-xs text-gray-500 font-semibold">PIPELINE TOTAL</span>
            </div>
            <div className="text-3xl font-black text-[#f59e0b]">€{Math.round(faturacaoPotencial)}</div>
            <div className="text-xs text-gray-500 mt-1">todos os orçamentos</div>
          </div>
        </div>

        {/* Gráfico leads por mês */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5">
          <h2 className="text-sm font-bold text-gray-400 mb-4">Leads por Mês</h2>
          <div className="flex items-end gap-3 h-32">
            {leadsPorMes.map(m => (
              <div key={`${m.year}-${m.month}`} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-500">{m.count || ''}</span>
                <div
                  className="w-full rounded-t-lg bg-[#6366f1] transition-all"
                  style={{ height: `${(m.count / maxCount) * 96}px`, minHeight: m.count > 0 ? '4px' : '0' }}
                />
                <span className="text-xs text-gray-500 capitalize">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Por status */}
        {porStatus.length > 0 && (
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5">
            <h2 className="text-sm font-bold text-gray-400 mb-4">Distribuição por Estado</h2>
            <div className="space-y-3">
              {porStatus.map(s => (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="text-sm text-gray-300 w-24">{s.label}</span>
                  <div className="flex-1 bg-[#0d0d0d] rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${(s.count / totalLeads) * 100}%`, background: s.color }}
                    />
                  </div>
                  <span className="text-sm font-bold text-white w-6 text-right">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalLeads === 0 && (
          <div className="text-center text-gray-600 py-12">
            Ainda não tens leads. Começa a receber orçamentos via WhatsApp!
          </div>
        )}
      </div>
    </div>
  )
}
