'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { CheckCircle, ChevronRight, Copy, Briefcase } from 'lucide-react'

export default function OnboardingPage() {
  const router = useRouter()
  const [professional, setProfessional] = useState<any>(null)
  const [phone, setPhone] = useState('')
  const [zone, setZone] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('professionals').select('*').eq('user_id', user.id).maybeSingle()
      if (!prof) { router.push('/login'); return }
      // Se já tem telefone, skip onboarding
      if (prof.phone) { router.push('/dashboard'); return }
      setProfessional(prof)
      setZone(prof.zone || '')
    })
  }, [router])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!phone) return
    setSaving(true)
    await supabase.from('professionals').update({ phone, zone }).eq('id', professional.id)
    setSaving(false)
    setDone(true)
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/p/${professional?.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!professional) return null

  const inp = "w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
  const ist = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0c1a' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)' }}>
            <Briefcase size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white">Bem-vindo, {professional.name?.split(' ')[0]}!</h1>
          <p className="text-gray-500 text-sm mt-1">Configura o teu perfil em 1 minuto</p>
        </div>

        <div className="rounded-3xl p-8" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.08)' }}>
          {!done ? (
            <form onSubmit={handleSave} className="space-y-5">
              <div className="flex items-center gap-3 p-4 rounded-2xl mb-2"
                style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <CheckCircle size={16} className="text-indigo-400 flex-shrink-0" />
                <p className="text-sm text-indigo-300">Conta criada com sucesso! Só falta o teu número de WhatsApp para os clientes te contactarem.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">
                  WhatsApp <span className="text-red-400">*</span>
                </label>
                <input required value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="351912345678" className={inp} style={ist} />
                <p className="text-xs text-gray-600 mt-1">Inclui o código do país. Portugal: 351...</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Zona de trabalho</label>
                <input value={zone} onChange={e => setZone(e.target.value)}
                  placeholder="ex: Lisboa, Setúbal, Porto..." className={inp} style={ist} />
              </div>

              <button type="submit" disabled={saving || !phone}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-white transition-all"
                style={{ background: !phone ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: !phone ? 0.4 : 1 }}>
                {saving ? 'A guardar...' : <>Continuar <ChevronRight size={18} /></>}
              </button>
            </form>
          ) : (
            <div className="text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-xl font-black text-white mb-2">Tudo pronto!</h2>
              <p className="text-gray-400 text-sm mb-6">O teu link público está activo. Partilha-o com clientes para recebers pedidos de orçamento.</p>

              <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <p className="text-xs text-gray-500 mb-1">O teu link</p>
                <p className="text-indigo-300 font-mono text-sm break-all">{window.location.origin}/p/{professional.slug}</p>
              </div>

              <button onClick={copyLink}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white mb-3 transition-all"
                style={{ background: copied ? 'rgba(52,211,153,0.2)' : 'rgba(99,102,241,0.2)', color: copied ? '#34d399' : '#818cf8', border: `1px solid ${copied ? '#34d39940' : '#6366f140'}` }}>
                <Copy size={15} /> {copied ? 'Copiado!' : 'Copiar link'}
              </button>

              <button onClick={() => router.push('/dashboard')}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-white"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                Ir para o dashboard <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
