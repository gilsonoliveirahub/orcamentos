'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle, Zap } from 'lucide-react'

const PACKS = [
  { id: 'pack10', credits: 10, price: 20, per: 2.00, label: 'Básico' },
  { id: 'pack25', credits: 25, price: 45, per: 1.80, label: 'Popular', highlight: true },
  { id: 'pack50', credits: 50, price: 75, per: 1.50, label: 'Pro' },
]

export default function CreditosPage() {
  const router = useRouter()
  const [professional, setProfessional] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState<string | null>(null)

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const success = searchParams?.get('credits') === 'ok'

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('professionals').select('*').eq('user_id', user.id).maybeSingle()
      if (!data) { router.push('/login'); return }
      setProfessional(data)
      setLoading(false)
    })
  }, [router])

  const handleBuy = async (packId: string) => {
    setPaying(packId)
    const res = await fetch('/api/stripe/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professional_id: professional.id, pack: packId }),
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

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-xl mx-auto px-6 py-5 flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-black text-white">Créditos Marketplace</h1>
            <p className="text-xs text-gray-500">Saldo atual: <span className="text-amber-400 font-bold">{professional?.marketplace_credits ?? 0} créditos</span></p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-6 py-8">

        {success && (
          <div className="mb-6 p-4 rounded-2xl flex items-center gap-3"
            style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
            <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />
            <p className="text-sm font-bold text-white">Créditos adicionados com sucesso!</p>
          </div>
        )}

        <div className="mb-6 p-4 rounded-2xl" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <div className="flex items-start gap-3">
            <Zap size={18} className="text-indigo-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-white mb-1">O que são créditos marketplace?</p>
              <p className="text-xs text-gray-400">Quando um cliente chega ao teu perfil pelo site FaçoPorTi (e não pelo teu link pessoal), esse lead custa 1 crédito. Se não tiveres créditos, o lead chega bloqueado — vês que existe mas não vês os contactos. Compra créditos para desbloquear.</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {PACKS.map(pack => (
            <div key={pack.id} className="rounded-2xl p-5 flex items-center justify-between"
              style={{
                background: pack.highlight ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.03)',
                border: pack.highlight ? '1px solid rgba(201,168,76,0.3)' : '1px solid rgba(255,255,255,0.08)',
              }}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-black text-white text-lg">{pack.credits} créditos</span>
                  {pack.highlight && (
                    <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: '#c9a84c', color: '#000' }}>
                      MELHOR VALOR
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">€{pack.per.toFixed(2)} por lead · {pack.label}</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-black text-white mb-2">€{pack.price}</div>
                <button
                  onClick={() => handleBuy(pack.id)}
                  disabled={paying !== null}
                  className="px-4 py-2 rounded-xl font-bold text-sm transition-opacity"
                  style={{
                    background: pack.highlight ? 'linear-gradient(135deg, #c9a84c, #e0bf6a)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: pack.highlight ? '#000' : '#fff',
                    opacity: paying ? 0.7 : 1,
                  }}
                >
                  {paying === pack.id ? 'A redirecionar...' : 'Comprar'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Pagamento único · Sem validade · Pagamento seguro via Stripe
        </p>
      </div>
    </div>
  )
}
