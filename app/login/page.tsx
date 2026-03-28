'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Briefcase, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [role, setRole] = useState<'professional' | 'client'>('client')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [specialty, setSpecialty] = useState('Pintura')
  const [zone, setZone] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Email ou password incorrectos.'); setLoading(false); return }

    // Verificar se é profissional ou cliente
    const { data: prof } = await supabase.from('professionals').select('id').eq('user_id', data.user.id).maybeSingle()
    if (prof) {
      router.push('/dashboard')
    } else {
      router.push('/cliente/dashboard')
    }
    router.refresh()
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    if (!data.user) { setError('Erro ao criar conta.'); setLoading(false); return }

    await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: data.user.id, role, name, email, phone, specialty, zone }),
    })

    setSuccess('Conta criada! Já pode entrar.')
    setTab('login')
    setLoading(false)
  }

  const inputClass = "w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
  const inputStyle = { background: '#0d0f1a', border: '1px solid rgba(255,255,255,0.08)' }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0c1a' }}>
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)' }}>
            <Briefcase size={24} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-white">Faço<span style={{ color: '#818cf8' }}>Por</span>Ti</h1>
          <p className="text-gray-500 text-sm mt-1">A plataforma que trabalha por si</p>
        </div>

        {/* Card */}
        <div className="rounded-3xl p-8" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.08)' }}>

          {/* Tabs */}
          <div className="flex rounded-xl p-1 mb-6" style={{ background: 'rgba(255,255,255,0.05)' }}>
            {(['login', 'register'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setError(''); setSuccess('') }}
                className="flex-1 py-2 text-sm font-bold rounded-lg transition-all"
                style={tab === t
                  ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }
                  : { color: '#64748b' }}>
                {t === 'login' ? 'Entrar' : 'Criar Conta'}
              </button>
            ))}
          </div>

          {/* Role selector (só no registo) */}
          {tab === 'register' && (
            <div className="flex rounded-xl p-1 mb-5" style={{ background: 'rgba(255,255,255,0.04)' }}>
              {([
                { id: 'client', label: '👤 Sou Cliente' },
                { id: 'professional', label: '🔧 Sou Profissional' },
              ] as const).map(r => (
                <button key={r.id} onClick={() => setRole(r.id)}
                  className="flex-1 py-2 text-sm font-semibold rounded-lg transition-all"
                  style={role === r.id
                    ? { background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid #6366f140' }
                    : { color: '#475569' }}>
                  {r.label}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={tab === 'login' ? handleLogin : handleRegister} className="space-y-4">

            {tab === 'register' && (
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Nome completo</label>
                <input required value={name} onChange={e => setName(e.target.value)}
                  placeholder="João Silva" className={inputClass} style={inputStyle} />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Email</label>
              <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="o@teu.email" className={inputClass} style={inputStyle} />
            </div>

            {tab === 'register' && (
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Telefone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="351912345678" className={inputClass} style={inputStyle} />
              </div>
            )}

            {tab === 'register' && role === 'professional' && (
              <>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Especialidade</label>
                  <select value={specialty} onChange={e => setSpecialty(e.target.value)}
                    className={inputClass} style={inputStyle}>
                    <option>Pintura</option>
                    <option>Limpeza</option>
                    <option>Electricidade</option>
                    <option>Canalização</option>
                    <option>Carpintaria</option>
                    <option>Jardinagem</option>
                    <option>Mudanças</option>
                    <option>Outro</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Zona de trabalho</label>
                  <input value={zone} onChange={e => setZone(e.target.value)}
                    placeholder="ex: Lisboa, Porto, Setúbal..." className={inputClass} style={inputStyle} />
                </div>
              </>
            )}

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
            {success && (
              <div className="text-sm text-center py-2 px-4 rounded-xl"
                style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}>
                {success}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full font-bold py-3.5 rounded-xl text-sm text-white transition-all mt-2"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.35)', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'A processar...' : tab === 'login' ? 'Entrar' : 'Criar Conta'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-700 text-xs mt-6">
          FaçoPorTi © 2026 — A plataforma que trabalha por si
        </p>
      </div>
    </div>
  )
}
