'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { CheckCircle, ArrowLeft, Zap, Crown } from 'lucide-react'

export default function UpgradePage() {
  const router = useRouter()
  const [professional, setProfessional] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)

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

  const trialDays = professional?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(professional.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0

  const isPro = professional?.plan === 'pro'

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <div className="w-8 h-8 border-4 border-indigo-900 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-lg mx-auto px-6 py-5 flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-black text-white">Plano Pro</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-10">

        {isPro ? (
          <div className="text-center py-16">
            <Crown size={48} className="mx-auto mb-4 text-amber-400" />
            <h2 className="text-2xl font-black text-white mb-2">Já és Pro!</h2>
            <p className="text-gray-400">Tens acesso a todas as funcionalidades premium.</p>
          </div>
        ) : (
          <>
            {/* Trial banner */}
            {trialDays > 0 && (
              <div className="mb-6 p-4 rounded-2xl flex items-center gap-3"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <Zap size={18} className="text-indigo-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-white">Trial ativo — {trialDays} dia{trialDays !== 1 ? 's' : ''} restante{trialDays !== 1 ? 's' : ''}</p>
                  <p className="text-xs text-gray-400">A testar o Pro gratuitamente</p>
                </div>
              </div>
            )}

            {trialDays === 0 && professional?.plan === 'free' && (
              <div className="mb-6 p-4 rounded-2xl flex items-center gap-3"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <Zap size={18} className="text-red-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-white">Trial expirado</p>
                  <p className="text-xs text-gray-400">Faz upgrade para continuar a receber leads ilimitados</p>
                </div>
              </div>
            )}

            {/* Comparação */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              {/* Free */}
              <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <h3 className="font-bold text-white mb-1">Grátis</h3>
                <div className="text-2xl font-black text-white mb-4">0€</div>
                <ul className="space-y-2.5">
                  {['Até 10 leads/mês', 'Link pessoal', 'Orçamentos automáticos'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-gray-400">
                      <CheckCircle size={12} className="text-gray-600" /> {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pro */}
              <div className="rounded-2xl p-5 relative"
                style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.25)' }}>
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-black px-3 py-0.5 rounded-full"
                  style={{ background: '#c9a84c', color: '#000' }}>
                  POPULAR
                </span>
                <h3 className="font-bold text-white mb-1">Pro</h3>
                <div className="text-2xl font-black text-white mb-1">€29<span className="text-sm font-normal text-gray-400">/mês</span></div>
                <p className="text-xs text-gray-500 mb-4">Cancela quando quiseres</p>
                <ul className="space-y-2.5">
                  {[
                    'Leads ilimitados',
                    'Follow-up automático',
                    'Notificações WhatsApp',
                    'PDF de orçamento',
                    'Estatísticas avançadas',
                    'Suporte prioritário',
                  ].map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-white">
                      <CheckCircle size={12} className="text-amber-400 flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* CTA */}
            {success && (
              <div className="mb-4 p-4 rounded-2xl flex items-center gap-3"
                style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
                <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />
                <p className="text-sm font-bold text-white">Pagamento confirmado! O teu plano Pro está ativo.</p>
              </div>
            )}
            <button
              className="w-full py-4 rounded-2xl font-black text-black text-lg mb-3"
              style={{ background: 'linear-gradient(135deg, #c9a84c, #e0bf6a)', boxShadow: '0 8px 24px rgba(201,168,76,0.3)', opacity: paying ? 0.7 : 1 }}
              disabled={paying}
              onClick={async () => {
                setPaying(true)
                const res = await fetch('/api/stripe/checkout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ professional_id: professional.id }),
                })
                const { url, error } = await res.json()
                if (url) window.location.href = url
                else { alert(error || 'Erro ao iniciar pagamento'); setPaying(false) }
              }}
            >
              {paying ? 'A redirecionar...' : 'Ativar Pro — €29/mês'}
            </button>
            <p className="text-center text-xs text-gray-600">
              Sem contrato · Cancela a qualquer momento · Pagamento seguro
            </p>
          </>
        )}
      </div>
    </div>
  )
}
