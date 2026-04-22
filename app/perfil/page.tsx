'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Save, Copy, CheckCircle, Loader2, ExternalLink, Settings } from 'lucide-react'
import Link from 'next/link'
import { SPECIALTY_LIST, PROFESSIONS } from '@/lib/professions'

export default function PerfilPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [professional, setProfessional] = useState<any>(null)
  const [form, setForm] = useState({ name: '', phone: '', specialty: 'Pintura', zone: '', description: '' })

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('professionals').select('*').eq('user_id', user.id).maybeSingle()
      if (!prof) { router.push('/login'); return }
      setProfessional(prof)
      setForm({
        name: prof.name || '',
        phone: prof.phone || '',
        specialty: prof.specialty || 'Pintura',
        zone: prof.zone || '',
        description: prof.description || '',
      })
      setLoading(false)
    })
  }, [router])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('professionals').update({
      name: form.name,
      phone: form.phone,
      specialty: form.specialty,
      zone: form.zone,
      bio: form.bio,
    }).eq('id', professional.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/p/${professional.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inp = "w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
  const ist = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={28} />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      {/* Header */}
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-lg mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="font-black text-white">O meu perfil</h1>
            <p className="text-xs text-gray-600">Informações da conta</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8 space-y-6">

        {/* Avatar + link público */}
        <div className="rounded-2xl p-6 flex items-center gap-5" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
            {form.name?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-white text-lg">{form.name}</div>
            <div className="text-sm text-gray-500">{form.specialty} {form.zone ? `· ${form.zone}` : ''}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-indigo-400 truncate">/p/{professional.slug}</span>
              <button onClick={copyLink}
                className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 transition-all"
                style={copied
                  ? { background: 'rgba(52,211,153,0.15)', color: '#34d399' }
                  : { background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                {copied ? <><CheckCircle size={11} /> Copiado</> : <><Copy size={11} /> Copiar link</>}
              </button>
              <a href={`/p/${professional.slug}`} target="_blank" rel="noopener noreferrer"
                className="text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0">
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSave} className="rounded-2xl p-6 space-y-5" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-black text-white">Editar informações</h2>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Nome completo</label>
            <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Gilson Oliveira" className={inp} style={ist} />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">WhatsApp</label>
            <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              placeholder="351912345678" className={inp} style={ist} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Especialidade</label>
              <select value={form.specialty} onChange={e => setForm(p => ({ ...p, specialty: e.target.value }))}
                className={inp} style={ist}>
                {SPECIALTY_LIST.map(s => <option key={s} value={s}>{PROFESSIONS[s].label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Zona</label>
              <input value={form.zone} onChange={e => setForm(p => ({ ...p, zone: e.target.value }))}
                placeholder="Lisboa, Porto..." className={inp} style={ist} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Sobre mim</label>
            <textarea value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
              placeholder="Descreve o teu trabalho, experiência, especialidades..."
              rows={3} className={inp} style={ist} />
          </div>

          <button type="submit" disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-white transition-all"
            style={{ background: saved ? 'rgba(52,211,153,0.8)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: saving ? 0.7 : 1 }}>
            {saved ? <><CheckCircle size={16} /> Guardado!</> : saving ? 'A guardar...' : <><Save size={16} /> Guardar alterações</>}
          </button>
        </form>

        {/* Info conta */}
        <div className="rounded-2xl p-5 space-y-3" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-black text-white text-sm">Informações da conta</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Email</span>
              <span className="text-gray-300">{professional.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estado</span>
              <span className={professional.active ? 'text-green-400' : 'text-red-400'}>
                {professional.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Membro desde</span>
              <span className="text-gray-300">
                {new Date(professional.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
          <Link href="/conta"
            className="flex items-center gap-2 text-sm font-semibold mt-4 px-4 py-3 rounded-xl transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Settings size={14} /> Mudar password / Definições de conta
          </Link>
        </div>

      </div>
    </div>
  )
}
