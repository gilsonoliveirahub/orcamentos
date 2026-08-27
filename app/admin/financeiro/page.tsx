'use client'

import { useEffect, useState, useTransition } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Shield, LogOut, Loader2, Euro, AlertCircle } from 'lucide-react'
import AdminNav from '@/components/admin/AdminNav'
import { cardStyle } from '@/components/admin/AdminFicha'

type Financials = {
  professionalValue: { total: number; ticketMedio: number; comValorCount: number; totalFechados: number; byMonth: Array<{ month: string; total: number; count: number }> }
  platformRevenue: { available: boolean; reason: string }
}

export default function AdminFinanceiroPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()
  const [data, setData] = useState<Financials | null>(null)
  const [error, setError] = useState('')

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
    fetch('/api/admin/financials')
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao carregar financeiro')
        setData(json)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar financeiro'))
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

  const { professionalValue, platformRevenue } = data
  const maxMonth = Math.max(...professionalValue.byMonth.map(m => m.total), 1)

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
                <p className="text-xs text-gray-600">FaçoPorTi — Financeiro</p>
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <LogOut size={14} /> Sair
            </button>
          </div>
          <AdminNav active="financeiro" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-lg font-black text-white mb-1 flex items-center gap-2"><Euro size={18} /> Valor gerado aos profissionais</h2>
          <p className="text-xs text-gray-600 mb-4">Dinheiro que os clientes pagaram aos profissionais através da plataforma — nunca receita da FaçoPorTi.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-2xl p-5" style={cardStyle}>
              <div className="text-2xl font-black text-white">€{Math.round(professionalValue.total)}</div>
              <div className="text-xs text-gray-500">Valor fechado total</div>
            </div>
            <div className="rounded-2xl p-5" style={cardStyle}>
              <div className="text-2xl font-black" style={{ color: '#fbbf24' }}>€{professionalValue.ticketMedio}</div>
              <div className="text-xs text-gray-500">Ticket médio</div>
            </div>
            <div className="rounded-2xl p-5" style={cardStyle}>
              <div className="text-2xl font-black" style={{ color: '#34d399' }}>{professionalValue.comValorCount}</div>
              <div className="text-xs text-gray-500">Fechados com valor indicado</div>
            </div>
            <div className="rounded-2xl p-5" style={cardStyle}>
              <div className="text-2xl font-black text-white">{professionalValue.totalFechados}</div>
              <div className="text-xs text-gray-500">Total de fechados</div>
            </div>
          </div>

          {professionalValue.byMonth.length > 0 && (
            <div className="rounded-2xl p-5" style={cardStyle}>
              <h3 className="text-sm font-bold text-gray-400 mb-4">Evolução mensal (valor fechado)</h3>
              <div className="flex items-end gap-2 h-32 overflow-x-auto">
                {professionalValue.byMonth.map(m => (
                  <div key={m.month} className="flex-1 min-w-[36px] flex flex-col items-center gap-1" title={`${m.month}: €${m.total} (${m.count})`}>
                    <div className="w-full rounded-t-lg" style={{ height: `${(m.total / maxMonth) * 100}px`, minHeight: '4px', background: 'rgba(52,211,153,0.5)' }} />
                    <span className="text-xs text-gray-600">{m.month.slice(5)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-3">Mês aproximado pela última atualização do lead (não existe data de fecho dedicada).</p>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2"><Euro size={18} /> Receita do FaçoPorTi</h2>
          <div className="rounded-2xl p-5 flex items-start gap-3" style={cardStyle}>
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
            <div>
              <p className="text-sm text-white font-semibold mb-1">Ainda não disponível</p>
              <p className="text-xs text-gray-500">{platformRevenue.reason}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
