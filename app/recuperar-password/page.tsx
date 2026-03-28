'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Briefcase, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

export default function RecuperarPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nova-password`,
    })
    if (error) { setError('Email não encontrado.'); setLoading(false); return }
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0c1a' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)' }}>
            <Briefcase size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white">Recuperar password</h1>
          <p className="text-gray-500 text-sm mt-1">Envia-mos-te um link por email</p>
        </div>

        <div className="rounded-3xl p-8" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.08)' }}>
          {sent ? (
            <div className="text-center">
              <div className="text-5xl mb-4">📧</div>
              <h2 className="text-white font-black text-lg mb-2">Email enviado!</h2>
              <p className="text-gray-400 text-sm">Verifica o teu email e clica no link para definir uma nova password.</p>
              <Link href="/login" className="block mt-6 text-indigo-400 text-sm hover:text-indigo-300 transition-colors">
                Voltar ao login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">O teu email</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="o@teu.email"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  style={{ background: '#0d0f1a', border: '1px solid rgba(255,255,255,0.08)' }} />
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
                {loading ? 'A enviar...' : 'Enviar link'}
              </button>
              <Link href="/login" className="flex items-center justify-center gap-1 text-gray-500 hover:text-gray-300 text-sm transition-colors">
                <ChevronLeft size={14} /> Voltar ao login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
