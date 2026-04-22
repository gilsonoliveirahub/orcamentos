'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { CheckCircle, ChevronRight, Copy, Briefcase, ExternalLink, Crown, Zap, MessageCircle } from 'lucide-react'
import { SPECIALTY_LIST, PROFESSIONS } from '@/lib/professions'

const STEPS = ['Perfil', 'O teu link', 'Plano']

export default function OnboardingPage() {
  const router = useRouter()
  const [professional, setProfessional] = useState<any>(null)
  const [step, setStep] = useState(1)
  const [phone, setPhone] = useState('')
  const [zone, setZone] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('professionals').select('*').eq('user_id', user.id).maybeSingle()
      if (!prof) { router.push('/login'); return }
      // Se já passou pelo onboarding, vai direto ao dashboard
      if (prof.onboarding_done) { router.push('/dashboard'); return }
      setProfessional(prof)
      setPhone(prof.phone || '')
      setZone(prof.zone || '')
      setDescription(prof.description || '')
    })
  }, [router])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!phone) return
    setSaving(true)
    await supabase.from('professionals').update({ phone, zone, description: description || null }).eq('id', professional.id)
    setProfessional((p: any) => ({ ...p, phone, zone, description }))
    setSaving(false)
    setStep(2)
  }

  async function goToStep3() {
    setStep(3)
  }

  async function finishWithPlan() {
    await supabase.from('professionals').update({ onboarding_done: true }).eq('id', professional.id)
    router.push('/upgrade')
  }

  async function finishExplore() {
    await supabase.from('professionals').update({ onboarding_done: true }).eq('id', professional.id)
    router.push('/dashboard')
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/p/${professional?.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function shareWhatsApp() {
    const link = `${window.location.origin}/p/${professional?.slug}`
    const msg = `Oi! Podes pedir o teu orçamento diretamente aqui: ${link} — responde a algumas perguntas rápidas e receberei o teu pedido já organizado 👷`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (!professional) return null

  const inp = "w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
  const ist = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }
  const firstName = professional.name?.split(' ')[0] || 'profissional'
  const profLink = typeof window !== 'undefined' ? `${window.location.origin}/p/${professional.slug}` : `/p/${professional.slug}`

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: '#0a0c1a' }}>
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)' }}>
            <Briefcase size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white">Bem-vindo, {firstName}!</h1>
          <p className="text-gray-500 text-sm mt-1">Configura o teu perfil em 2 minutos</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((label, i) => {
            const n = i + 1
            const active = n === step
            const done = n < step
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 transition-all"
                    style={{
                      background: done ? '#34d399' : active ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.06)',
                      color: done || active ? '#fff' : '#475569',
                    }}>
                    {done ? <CheckCircle size={14} /> : n}
                  </div>
                  <span className="text-xs font-semibold hidden sm:block" style={{ color: active ? '#e2e8f0' : done ? '#34d399' : '#475569' }}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-0.5 rounded-full mx-1" style={{ background: done ? '#34d399' : 'rgba(255,255,255,0.08)' }} />
                )}
              </div>
            )
          })}
        </div>

        {/* ── Passo 1: Perfil ── */}
        {step === 1 && (
          <div className="rounded-3xl p-6 sm:p-8" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 className="font-black text-white text-lg mb-1">Completa o teu perfil</h2>
            <p className="text-gray-500 text-sm mb-6">Os clientes usam estes dados para te contactar.</p>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">
                  WhatsApp <span className="text-red-400">*</span>
                </label>
                <input required value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="351912345678" className={inp} style={ist} />
                <p className="text-xs text-gray-600 mt-1">Inclui o código do país. Portugal: 351</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Zona de trabalho</label>
                <input value={zone} onChange={e => setZone(e.target.value)}
                  placeholder="ex: Lisboa, Setúbal, Porto..." className={inp} style={ist} />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">
                  Sobre ti <span className="text-gray-600 normal-case font-normal">(opcional)</span>
                </label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="ex: Pintor profissional com 10 anos de experiência em interiores e exteriores..."
                  rows={3} className={`${inp} resize-none`} style={ist} />
              </div>

              <button type="submit" disabled={saving || !phone}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-white transition-all mt-2"
                style={{
                  background: !phone ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  boxShadow: phone ? '0 8px 24px rgba(99,102,241,0.35)' : 'none',
                  opacity: !phone ? 0.4 : 1,
                }}>
                {saving ? 'A guardar...' : <>Continuar <ChevronRight size={18} /></>}
              </button>
            </form>
          </div>
        )}

        {/* ── Passo 2: O teu link ── */}
        {step === 2 && (
          <div className="rounded-3xl p-6 sm:p-8" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-4xl mb-4 text-center">🔗</div>
            <h2 className="font-black text-white text-lg mb-1 text-center">O teu link está ativo!</h2>
            <p className="text-gray-400 text-sm mb-6 text-center">
              Partilha este link com os teus clientes. Quando entrarem, o pedido de orçamento vem diretamente para ti.
            </p>

            {/* Link box */}
            <div className="rounded-2xl p-4 mb-5" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <p className="text-xs text-gray-500 mb-1.5">O teu link público</p>
              <p className="text-indigo-300 font-mono text-sm break-all leading-relaxed">{profLink}</p>
            </div>

            <div className="space-y-3 mb-6">
              <button onClick={copyLink}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all"
                style={{
                  background: copied ? 'rgba(52,211,153,0.15)' : 'rgba(99,102,241,0.15)',
                  color: copied ? '#34d399' : '#818cf8',
                  border: `1px solid ${copied ? '#34d39930' : '#6366f130'}`,
                }}>
                <Copy size={15} /> {copied ? 'Copiado!' : 'Copiar link'}
              </button>

              <button onClick={shareWhatsApp}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all"
                style={{ background: 'rgba(37,211,102,0.12)', color: '#25d366', border: '1px solid rgba(37,211,102,0.2)' }}>
                <MessageCircle size={15} /> Partilhar no WhatsApp
              </button>

              <a href={`/p/${professional.slug}`} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.07)' }}>
                <ExternalLink size={15} /> Pré-visualizar link
              </a>
            </div>

            <button onClick={goToStep3}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.35)' }}>
              Continuar <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* ── Passo 3: Plano ── */}
        {step === 3 && (
          <div className="rounded-3xl p-6 sm:p-8" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-4xl mb-4 text-center">🚀</div>
            <h2 className="font-black text-white text-lg mb-1 text-center">Escolhe o teu plano</h2>
            <p className="text-gray-400 text-sm mb-6 text-center">
              Para receberes leads pelo teu link precisas de um plano ativo.
            </p>

            <div className="space-y-3 mb-5">
              {/* Starter */}
              <button onClick={finishWithPlan}
                className="w-full rounded-2xl p-4 text-left transition-all hover:opacity-90"
                style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap size={16} style={{ color: '#818cf8' }} />
                    <span className="font-black text-white">Starter</span>
                  </div>
                  <span className="font-black text-white">€19<span className="text-gray-500 font-normal text-xs">/mês</span></span>
                </div>
                <p className="text-xs text-gray-400">Até 10 leads/mês via link · Orçamentos automáticos · Dashboard kanban</p>
              </button>

              {/* Pro */}
              <button onClick={finishWithPlan}
                className="w-full rounded-2xl p-4 text-left relative transition-all hover:opacity-90"
                style={{ background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.3)' }}>
                <span className="absolute -top-2.5 left-4 text-xs font-black px-2.5 py-0.5 rounded-full"
                  style={{ background: '#c9a84c', color: '#000' }}>MAIS POPULAR</span>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Crown size={16} style={{ color: '#c9a84c' }} />
                    <span className="font-black text-white">Pro</span>
                  </div>
                  <span className="font-black text-white">€39<span className="text-gray-500 font-normal text-xs">/mês</span></span>
                </div>
                <p className="text-xs text-gray-400">Até 50 leads/mês · Follow-up automático · Estatísticas avançadas</p>
              </button>
            </div>

            <div className="text-center mb-4">
              <span className="text-xs text-gray-600">Tens 7 dias de trial gratuito incluídos</span>
            </div>

            <button onClick={finishExplore}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-colors"
              style={{ color: '#64748b' }}>
              Explorar o dashboard primeiro →
            </button>
          </div>
        )}

        <p className="text-center text-gray-700 text-xs mt-6">
          FaçoPorTi © 2026 · <a href="/privacidade" className="hover:text-gray-500 transition-colors">Privacidade</a>
        </p>
      </div>
    </div>
  )
}
