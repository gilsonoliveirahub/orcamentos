'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Briefcase, Eye, EyeOff } from 'lucide-react'

export default function NovaPassword() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('As passwords não coincidem.'); return }
    if (password.length < 6) { setError('Password deve ter pelo menos 6 caracteres.'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError('Erro ao actualizar password.'); setLoading(false); return }
    router.push('/login')
  }

  const inp = "w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
  const ist = { background: '#0d0f1a', border: '1px solid rgba(255,255,255,0.08)' }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0c1a' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)' }}>
            <Briefcase size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white">Nova password</h1>
        </div>
        <div className="rounded-3xl p-8" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.08)' }}>
          <form onSubmit={handleSubmit} className="space-y-4">
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
            {error && (
              <div className="text-sm text-center py-2 px-4 rounded-xl"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'A guardar...' : 'Definir nova password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
