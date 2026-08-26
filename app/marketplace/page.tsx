'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, MapPin, Calendar, ShoppingCart, Lock } from 'lucide-react'

type Opportunity = {
  id: string
  specialty: string
  zone_requested: string | null
  created_at: string
  distance_km: number | null
  distance_label: string
}

const cardStyle = { background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.07)' }

type Professional = { id: string; plan: string | null; marketplace_credits: number | null; accepting_leads: boolean | null }

export default function MarketplacePage() {
  const router = useRouter()
  const [professional, setProfessional] = useState<Professional | null>(null)
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [acquiring, setAcquiring] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function loadOpportunities() {
    const res = await fetch('/api/marketplace/opportunities')
    if (res.ok) {
      const { opportunities } = await res.json()
      setOpportunities(opportunities)
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase
        .from('professionals')
        .select('id, plan, marketplace_credits, accepting_leads')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!prof) { router.push('/login'); return }
      setProfessional(prof)
      await loadOpportunities()
      setLoading(false)
    })
  }, [router])

  async function handleAcquire(leadId: string) {
    // Lista de planos pagos (nunca a lista dos não-pagos) — 'inactive'
    // (subscrição cancelada/pagamento falhado) não é 'free', mas também não
    // é pago; um deny-list deixava passar esse caso até ao servidor rejeitar.
    const isPaid = professional?.plan === 'starter' || professional?.plan === 'pro'
    if (!isPaid) { router.push('/upgrade'); return }
    if ((professional.marketplace_credits ?? 0) < 1) { router.push('/creditos'); return }

    setAcquiring(leadId)
    setError('')
    const res = await fetch('/api/marketplace/acquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    })
    const json = await res.json()
    setAcquiring(null)

    if (!res.ok) {
      if (json.reason === 'taken') {
        setError('Este pedido já foi adquirido por outro profissional.')
        setOpportunities(prev => prev.filter(o => o.id !== leadId))
      } else if (json.reason === 'credits') {
        router.push('/creditos')
      } else if (json.reason === 'plan') {
        router.push('/upgrade')
      } else {
        setError(json.error || 'Falha ao adquirir pedido')
      }
      return
    }

    router.push(`/leads/${leadId}`)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  )

  const isFree = !professional || !(professional.plan === 'starter' || professional.plan === 'pro')
  const hasCredits = (professional?.marketplace_credits ?? 0) > 0
  // ?? true: coluna ainda por migrar/nunca definida conta como disponível.
  const isPaused = (professional?.accepting_leads ?? true) === false

  async function handleReactivate() {
    if (!professional) return
    await supabase.from('professionals').update({ accepting_leads: true }).eq('id', professional.id)
    setProfessional(p => p ? { ...p, accepting_leads: true } : p)
  }

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-black text-white">Marketplace</h1>
            <p className="text-gray-500 text-xs">Oportunidades da tua especialidade, num raio aproximado de 50km</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        {isFree && (
          <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <p className="text-sm text-gray-300">Podes ver os resumos, mas precisas de um plano pago para adquirir pedidos.</p>
            <button onClick={() => router.push('/upgrade')}
              className="text-xs font-bold px-4 py-2 rounded-xl flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}>
              Ativar plano
            </button>
          </div>
        )}
        {!isFree && isPaused && (
          <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <p className="text-sm text-gray-300">Estás em pausa — podes ver oportunidades, mas não adquirir.</p>
            <button onClick={handleReactivate}
              className="text-xs font-bold px-4 py-2 rounded-xl flex-shrink-0"
              style={{ background: '#fbbf24', color: '#000' }}>
              Reativar
            </button>
          </div>
        )}
        {!isFree && !isPaused && !hasCredits && (
          <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <p className="text-sm text-gray-300">Sem créditos para adquirir. Cada aquisição consome 1 crédito.</p>
            <button onClick={() => router.push('/creditos')}
              className="text-xs font-bold px-4 py-2 rounded-xl flex-shrink-0"
              style={{ background: '#fbbf24', color: '#000' }}>
              Comprar créditos
            </button>
          </div>
        )}

        {error && (
          <div className="text-sm text-center py-3 px-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {opportunities.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🛒</div>
            <p className="text-gray-500">Sem oportunidades disponíveis de momento na tua especialidade e zona.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {opportunities.map(opp => (
              <div key={opp.id} className="rounded-2xl p-5 flex items-center justify-between gap-4" style={cardStyle}>
                <div className="min-w-0">
                  <div className="font-bold text-white text-sm mb-1.5">{opp.specialty}</div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    {opp.zone_requested && (
                      <span className="flex items-center gap-1"><MapPin size={11} /> {opp.zone_requested}</span>
                    )}
                    <span className="flex items-center gap-1"><Calendar size={11} /> {new Date(opp.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}</span>
                    <span>{opp.distance_label}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleAcquire(opp.id)}
                  disabled={acquiring === opp.id}
                  className="flex items-center gap-1.5 text-xs font-black px-4 py-2.5 rounded-xl flex-shrink-0 transition-all"
                  style={
                    isFree
                      ? { background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }
                      : { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', opacity: acquiring === opp.id ? 0.6 : 1 }
                  }
                >
                  {isFree ? <><Lock size={12} /> Ativar plano</> : acquiring === opp.id ? 'A adquirir...' : <><ShoppingCart size={12} /> Adquirir</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
