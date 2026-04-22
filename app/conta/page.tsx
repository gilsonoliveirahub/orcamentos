'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Eye, EyeOff, CheckCircle, LogOut, CreditCard } from 'lucide-react'

export default function ContaPage() {
  const router = useRouter()
  const [professional, setProfessional] = useState<any>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('professionals').select('id, stripe_customer_id, plan').eq('user_id', user.id).maybeSingle()
      if (data) setProfessional(data)
    })
  }, [])

  async function handlePortal() {
    setOpeningPortal(true)
    const res = await fetch('/api/stripe/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professional_id: professional.id }),
    })
    const { url, error } = await res.json()
    if (url) window.location.href = url
    else { alert(error || 'Erro ao abrir portal'); setOpeningPortal(false) }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('As passwords não coincidem.'); return }
    if (password.length < 6) { setError('Mínimo 6 caracteres.'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError('Erro ao actualizar.'); setLoading(false); return }
    setSuccess('Password actualizada!')
    setPassword('')
    setConfirm('')
    setLoading(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const inp = "w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
  const ist = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-lg mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="font-black text-white">Definições de conta</h1>
            <p className="text-xs text-gray-600">Segurança e acesso</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8 space-y-6">
        {/* Mudar password */}
        <form onSubmit={handleChangePassword} className="rounded-2xl p-6 space-y-4"
          style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-black text-white">Mudar password</h2>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Nova password</label>
            <div className="relative">
              <input required type={showPass ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={inp} style={ist} />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Confirmar password</label>
            <input required type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)} placeholder="••••••••" className={inp} style={ist} />
          </div>

          {error && <div className="text-sm py-2 px-4 rounded-xl text-center"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}
          {success && <div className="flex items-center justify-center gap-2 text-sm py-2 px-4 rounded-xl"
            style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}>
            <CheckCircle size={14} /> {success}
          </div>}

          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-xl font-bold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'A guardar...' : 'Actualizar password'}
          </button>
        </form>

        {/* Subscrição */}
        {professional?.stripe_customer_id && (
          <div className="rounded-2xl p-6" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="font-black text-white mb-4">Subscrição</h2>
            <button onClick={handlePortal} disabled={openingPortal}
              className="flex items-center gap-2 text-sm font-bold px-4 py-3 rounded-xl transition-all"
              style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)', opacity: openingPortal ? 0.6 : 1 }}>
              <CreditCard size={15} /> {openingPortal ? 'A abrir...' : 'Gerir subscrição · Faturas · Cancelar'}
            </button>
          </div>
        )}

        {/* Sair */}
        <div className="rounded-2xl p-6" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-black text-white mb-4">Sessão</h2>
          <button onClick={handleLogout}
            className="flex items-center gap-2 text-sm font-bold px-4 py-3 rounded-xl transition-all"
            style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}>
            <LogOut size={15} /> Terminar sessão
          </button>
        </div>
      </div>
    </div>
  )
}
