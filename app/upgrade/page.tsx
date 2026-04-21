'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { CheckCircle, ArrowLeft, Crown, Zap } from 'lucide-react'

export default function UpgradePage() {
  const router = useRouter()
  const [professional, setProfessional] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState<string | null>(null)

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const success = searchParams?.get('success') === '1'

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('professionals').select('*').eq('user_id', user.id).maybeSingle()
      if (!data) { router.push('/login'); return }
      setProfessional(data)
      setLoading(false)
    })
  }, [router])

  const handleCheckout = async (plan: 'starter' | 'pro') => {
    setPaying(plan)
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professional_id: professional.id, plan }),
    })
    const { url, error } = await res.json()
    if (url) window.location.href = url
    else { alert(error || 'Erro ao iniciar pagamento'); setPaying(null) }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <div className="w-8 h-8 border-4 border-indigo-900 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )

  const currentPlan = professional?.plan

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-black text-white">Escolhe o teu plano</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10">

        {success && (
          <div className="mb-6 p-4 rounded-2xl flex items-center gap-3"
            style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
            <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />
            <p className="text-sm font-bold text-white">Pagamento confirmado! O teu plano está ativo.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Starter */}
          <div className="rounded-2xl p-6 flex flex-col"
            style={{ background: 'rgba(255,255,255,0.03)', border: currentPlan === 'starter' ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-white text-lg">Starter</h3>
              {currentPlan === 'starter' && (
                <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>ATIVO</span>
              )}
            </div>
            <div className="text-3xl font-black text-white mb-1">€19<span className="text-base font-normal text-gray-400">/mês</span></div>
            <p className="text-xs text-gray-500 mb-5">Ideal para começar</p>
            <ul className="space-y-3 mb-8 flex-1">
              {['Até 10 leads/mês', 'Link pessoal', 'Orçamentos automáticos', 'Dashboard kanban', 'Suporte por email'].map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                  <CheckCircle size={14} className="text-indigo-400 flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>
            {currentPlan === 'starter' ? (
              <div className="w-full py-3 rounded-xl text-center text-sm font-bold text-indigo-400"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                Plano atual
              </div>
            ) : (
              <button
                className="w-full py-3 rounded-xl font-bold text-white text-sm transition-opacity"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: paying === 'starter' ? 0.7 : 1 }}
                disabled={paying !== null}
                onClick={() => handleCheckout('starter')}
              >
                {paying === 'starter' ? 'A redirecionar...' : 'Escolher Starter'}
              </button>
            )}
          </div>

          {/* Pro */}
          <div className="rounded-2xl p-6 flex flex-col relative"
            style={{ background: 'rgba(201,168,76,0.06)', border: currentPlan === 'pro' ? '2px solid #c9a84c' : '1px solid rgba(201,168,76,0.25)' }}>
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-black px-3 py-0.5 rounded-full"
              style={{ background: '#c9a84c', color: '#000' }}>
              MAIS POPULAR
            </span>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-white text-lg">Pro</h3>
              {currentPlan === 'pro' && (
                <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.2)', color: '#c9a84c' }}>ATIVO</span>
              )}
            </div>
            <div className="text-3xl font-black text-white mb-1">€39<span className="text-base font-normal text-gray-400">/mês</span></div>
            <p className="text-xs text-gray-500 mb-5">Para quem quer crescer a sério</p>
            <ul className="space-y-3 mb-8 flex-1">
              {[
                'Até 50 pedidos/mês via link',
                'Follow-up automático',
                'Notificações WhatsApp',
                'PDF de orçamento',
                'Estatísticas avançadas',
                'Suporte prioritário',
              ].map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-white">
                  <CheckCircle size={14} className="text-amber-400 flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>
            {currentPlan === 'pro' ? (
              <div className="w-full py-3 rounded-xl text-center text-sm font-bold"
                style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c' }}>
                <Crown size={14} className="inline mr-1" /> Plano atual
              </div>
            ) : (
              <button
                className="w-full py-3 rounded-xl font-black text-black text-sm transition-opacity"
                style={{ background: 'linear-gradient(135deg, #c9a84c, #e0bf6a)', boxShadow: '0 8px 24px rgba(201,168,76,0.3)', opacity: paying === 'pro' ? 0.7 : 1 }}
                disabled={paying !== null}
                onClick={() => handleCheckout('pro')}
              >
                {paying === 'pro' ? 'A redirecionar...' : 'Escolher Pro'}
              </button>
            )}
          </div>

        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Sem contrato · Cancela a qualquer momento · Pagamento seguro via Stripe
        </p>

        {currentPlan === 'inactive' && (
          <div className="mt-6 p-4 rounded-2xl flex items-center gap-3"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <Zap size={18} className="text-red-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-white">Subscrição cancelada</p>
              <p className="text-xs text-gray-400">Escolhe um plano para voltar a receber leads</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
