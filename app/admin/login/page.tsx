'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Shield, Eye, EyeOff } from 'lucide-react'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) { setError('Email ou password incorrectos.'); setLoading(false); return }

    // A confirmação de que é admin é feita no servidor (proxy.ts), que bloqueia
    // e redireciona para /dashboard quem não estiver em public.admins.
    const params = new URLSearchParams(window.location.search)
    const redirect = params.get('redirect')
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      router.push(redirect)
    } else {
      router.push('/admin')
    }
    router.refresh()
  }

  const inputClass = "w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
  const inputStyle = { background: '#0d0f1a', border: '1px solid rgba(255,255,255,0.08)' }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0c1a' }}>
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', boxShadow: '0 8px 24px rgba(239,68,68,0.35)' }}>
            <Shield size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white">Admin — Faço<span style={{ color: '#818cf8' }}>Por</span>Ti</h1>
          <p className="text-gray-500 text-sm mt-1">Acesso restrito a administradores</p>
        </div>

        <div className="rounded-3xl p-8" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.08)' }}>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Email</label>
              <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="o@teu.email" className={inputClass} style={inputStyle} />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Password</label>
              <div className="relative">
                <input required type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" className={inputClass} style={inputStyle} />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-center py-2 px-4 rounded-xl"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full font-bold py-3.5 rounded-xl text-sm text-white transition-all mt-2"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', boxShadow: '0 8px 24px rgba(239,68,68,0.3)', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'A processar...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-700 text-xs mt-6">
          FaçoPorTi © 2026 — Área administrativa
        </p>
      </div>
    </div>
  )
}
