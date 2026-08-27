'use client'

import { useEffect, useState, useTransition } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Shield, LogOut, Loader2, Search, ChevronRight } from 'lucide-react'
import AdminNav from '@/components/admin/AdminNav'
import { cardStyle } from '@/components/admin/AdminFicha'

// "Cliente" aqui é sempre uma VISTA administrativa derivada de leads
// agrupados por telefone (ver lib/admin-clients.ts) — não existe nenhuma
// tabela `customers` no schema, e não criamos uma só para isto.
type ClientRow = {
  phone: string; name: string | null; email: string | null
  leadsCount: number; lastRequestAt: string
  professionals: Array<{ id: string; name: string }>
  fechadosCount: number; perdidosCount: number; valorFechadoTotal: number
}

export default function AdminClientesPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

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
    fetch(`/api/admin/clients?${params.toString()}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao carregar clientes')
        setClients(json.clients)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar clientes'))
      .finally(() => setLoading(false))
  }, [checking, q])

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
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
                <Shield size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-black text-white">Admin</h1>
                <p className="text-xs text-gray-600">FaçoPorTi — Clientes</p>
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <LogOut size={14} /> Sair
            </button>
          </div>
          <AdminNav active="clientes" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-xs text-gray-600 mb-4">Vista derivada dos pedidos (leads), agrupados por telefone — não é uma lista de contas separada.</p>

        <div className="rounded-2xl p-4 mb-6" style={cardStyle}>
          <label className="text-xs text-gray-500 block mb-1">Pesquisar (nome, telefone ou email)</label>
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={q} onChange={e => setQ(e.target.value)} className="w-full bg-transparent border rounded-lg pl-8 pr-2 py-1.5 text-sm text-white" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
          </div>
        </div>

        {error && <div className="text-sm text-center py-3 px-4 rounded-xl mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}

        <div className="rounded-2xl overflow-hidden" style={cardStyle}>
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-indigo-500" size={28} /></div>
          ) : clients.length === 0 ? (
            <p className="text-gray-500 text-sm p-6">Nenhum cliente encontrado para estes filtros.</p>
          ) : clients.map((c, i) => (
            <div key={c.phone} className="flex flex-wrap items-center gap-3 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
              style={{ borderBottom: i < clients.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
              onClick={() => router.push(`/admin/clientes/${encodeURIComponent(c.phone)}`)}>
              <div className="flex-1 min-w-[160px]">
                <div className="font-bold text-white text-sm">{c.name || 'Sem nome'}</div>
                <div className="text-xs text-gray-500">{c.phone} {c.email ? `· ${c.email}` : ''}</div>
              </div>
              <span className="text-xs text-gray-400">{c.leadsCount} pedido{c.leadsCount !== 1 ? 's' : ''}</span>
              <span className="text-xs text-gray-400 hidden sm:inline">{c.professionals.map(p => p.name).join(', ') || '—'}</span>
              <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>{c.fechadosCount} fechados</span>
              {c.valorFechadoTotal > 0 && <span className="text-xs font-bold text-white">€{c.valorFechadoTotal}</span>}
              <span className="text-xs text-gray-600">{new Date(c.lastRequestAt).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}</span>
              <ChevronRight size={16} className="text-gray-600 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
