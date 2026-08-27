'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { LogOut, Loader2, ArrowLeft, User, History } from 'lucide-react'
import { Section, Field, Stat, fmtDateTime } from '@/components/admin/AdminFicha'
import { ADMIN_LEAD_ACCESS_STATE_LABELS, type AdminLeadAccessState } from '@/lib/admin-lead-access-state'

type ClientDetail = {
  client: {
    phone: string; name: string | null; email: string | null
    leadsCount: number; lastRequestAt: string
    professionals: Array<{ id: string; name: string }>
    fechadosCount: number; perdidosCount: number; valorFechadoTotal: number
  }
  account: { id: string; name: string; email: string | null } | null
  leads: Array<{
    id: string; name: string | null; status: string | null; source: string | null
    specialty: string | null; zone_requested: string | null; valor_fechado: number | null
    created_at: string; access_state: AdminLeadAccessState
    professionals: { name: string; slug: string | null } | null
  }>
}

const STATUS_COLOR: Record<string, string> = { novo: '#818cf8', qualificado: '#60a5fa', visita: '#fbbf24', proposta: '#c084fc', fechado: '#34d399', perdido: '#f87171' }

export default function AdminClienteFichaPage() {
  const { phone } = useParams<{ phone: string }>()
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()
  const [data, setData] = useState<ClientDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/admin/login'); return }
      const { data: admin } = await supabase.from('admins').select('id').eq('user_id', user.id).maybeSingle()
      if (!admin) { router.push('/dashboard'); return }
      setChecking(false)
    })
  }, [router])

  const load = useCallback(() => {
    startTransition(() => { setLoading(true); setError('') })
    fetch(`/api/admin/clients/${phone}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao carregar cliente')
        setData(json)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar cliente'))
      .finally(() => setLoading(false))
  }, [phone])

  useEffect(() => { if (!checking) load() }, [checking, load])

  if (checking || loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  )

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0a0c1a' }}>
        <p className="text-sm" style={{ color: '#f87171' }}>{error || 'Cliente não encontrado'}</p>
        <button onClick={() => router.push('/admin/clientes')} className="text-sm text-indigo-400">Voltar à lista</button>
      </div>
    )
  }

  const { client, account, leads } = data

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin/clientes')} className="text-gray-500 hover:text-white transition-colors"><ArrowLeft size={20} /></button>
            <div>
              <h1 className="font-black text-white">{client.name || 'Sem nome'}</h1>
              <p className="text-xs text-gray-600">{client.phone}</p>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <Section title="Contacto" icon={<User size={16} />}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nome" value={client.name} />
            <Field label="Telefone" value={client.phone} />
            <Field label="Email" value={client.email} />
            <Field label="Conta de login" value={account ? 'Sim' : 'Não'} />
            <Field label="Profissionais associados" value={client.professionals.map(p => p.name).join(', ') || '—'} />
            <Field label="Último pedido" value={fmtDateTime(client.lastRequestAt)} />
          </div>
        </Section>

        <Section title="Resumo" icon={<History size={16} />}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Pedidos" value={client.leadsCount} />
            <Stat label="Fechados" value={client.fechadosCount} color="#34d399" />
            <Stat label="Perdidos" value={client.perdidosCount} color="#f87171" />
            <Stat label="Valor fechado total" value={`€${client.valorFechadoTotal}`} color="#fbbf24" />
          </div>
        </Section>

        <Section title="Histórico de pedidos" icon={<History size={16} />}>
          <div className="space-y-3">
            {leads.map(l => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 py-3 cursor-pointer hover:bg-white/[0.02]" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} onClick={() => router.push(`/admin/leads/${l.id}`)}>
                <div className="flex-1 min-w-[140px]">
                  <div className="text-sm text-white font-semibold">{l.specialty} {l.zone_requested ? `· ${l.zone_requested}` : ''}</div>
                  <div className="text-xs text-gray-500">{l.professionals?.name || 'Sem profissional'} · {ADMIN_LEAD_ACCESS_STATE_LABELS[l.access_state]}</div>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: `${STATUS_COLOR[l.status || ''] || '#64748b'}22`, color: STATUS_COLOR[l.status || ''] || '#64748b' }}>{l.status}</span>
                {l.valor_fechado != null && <span className="text-xs font-bold text-white">€{l.valor_fechado}</span>}
                <span className="text-xs text-gray-600">{new Date(l.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
