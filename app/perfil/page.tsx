'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Save, Copy, CheckCircle, Loader2, ExternalLink, Settings, Camera, X, Star, Play, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { SPECIALTY_LIST, PROFESSIONS } from '@/lib/professions'

export default function PerfilPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [professional, setProfessional] = useState<any>(null)
  const [form, setForm] = useState({ name: '', phone: '', zone: '', description: '' })
  const [specialties, setSpecialties] = useState<string[]>(['Pintura'])
  const [portfolio, setPortfolio] = useState<any[]>([])
  const [reviews, setReviews] = useState<any[]>([])
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false)
  const avatarRef = useRef<HTMLInputElement>(null)
  const portfolioRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('professionals').select('*').eq('user_id', user.id).maybeSingle()
      if (!prof) { router.push('/login'); return }
      setProfessional(prof)
      setForm({
        name: prof.name || '',
        phone: prof.phone || '',
        zone: prof.zone || '',
        description: prof.description || '',
      })
      setSpecialties(prof.specialties?.length ? prof.specialties : [prof.specialty || 'Pintura'])
      const [{ data: portfolioData }, { data: reviewsData }] = await Promise.all([
        supabase.from('professional_portfolio').select('*').eq('professional_id', prof.id).order('sort_order').order('created_at'),
        supabase.from('reviews').select('*').eq('professional_id', prof.id).order('created_at', { ascending: false }),
      ])
      setPortfolio(portfolioData || [])
      setReviews(reviewsData || [])
      setLoading(false)
    })
  }, [router])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('professionals').update({
      name: form.name,
      phone: form.phone,
      specialty: specialties[0],
      specialties,
      zone: form.zone,
      description: form.description,
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

  async function handleAvatarUpload(file: File) {
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop()
    const path = `avatars/${professional.id}/${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from('lead-media').upload(path, file, { upsert: true })
    if (error) { setUploadingAvatar(false); return }
    const { data: { publicUrl } } = supabase.storage.from('lead-media').getPublicUrl(data.path)
    await supabase.from('professionals').update({ avatar_url: publicUrl }).eq('id', professional.id)
    setProfessional((p: any) => ({ ...p, avatar_url: publicUrl }))
    setUploadingAvatar(false)
  }

  async function handlePortfolioUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingPortfolio(true)
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      if (!isImage && !isVideo) continue
      if (file.size > 100 * 1024 * 1024) continue
      const ext = file.name.split('.').pop()
      const path = `portfolio/${professional.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { data, error } = await supabase.storage.from('lead-media').upload(path, file, { upsert: false })
      if (error) continue
      const { data: { publicUrl } } = supabase.storage.from('lead-media').getPublicUrl(data.path)
      const { data: inserted, error: dbError } = await supabase.from('professional_portfolio').insert({
        professional_id: professional.id,
        url: publicUrl,
        type: isVideo ? 'video' : 'image',
        sort_order: portfolio.length,
      }).select().single()
      if (dbError) { alert(`Erro ao guardar ficheiro: ${dbError.message}`); continue }
      if (inserted) setPortfolio(p => [...p, inserted])
    }
    setUploadingPortfolio(false)
  }

  async function deletePortfolioItem(item: any) {
    await supabase.from('professional_portfolio').delete().eq('id', item.id)
    setPortfolio(p => p.filter(i => i.id !== item.id))
  }

  const inp = "w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
  const ist = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0

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
          <input ref={avatarRef} type="file" accept="image/*" className="hidden"
            onChange={e => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])} />
          <button onClick={() => avatarRef.current?.click()} className="relative flex-shrink-0 group">
            {professional.avatar_url ? (
              <img src={professional.avatar_url} alt={form.name}
                className="w-16 h-16 rounded-2xl object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black text-white"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
                {form.name?.[0] || '?'}
              </div>
            )}
            <div className="absolute inset-0 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(0,0,0,0.55)' }}>
              {uploadingAvatar
                ? <Loader2 size={18} className="animate-spin text-white" />
                : <Camera size={18} className="text-white" />}
            </div>
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-black text-white text-lg">{form.name}</div>
            <div className="text-sm text-gray-500">{specialties.join(' · ')}{form.zone ? ` · ${form.zone}` : ''}</div>
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

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Especialidades</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {specialties.map(s => (
                <span key={s} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
                  {PROFESSIONS[s]?.label || s}
                  {specialties.length > 1 && (
                    <button type="button" onClick={() => setSpecialties(p => p.filter(x => x !== s))}
                      className="text-indigo-400 hover:text-red-400 transition-colors leading-none ml-0.5">&times;</button>
                  )}
                </span>
              ))}
            </div>
            <select value="" onChange={e => { if (e.target.value) setSpecialties(p => p.includes(e.target.value) ? p : [...p, e.target.value]) }}
              className={inp} style={{ ...ist, color: '#94a3b8' }}>
              <option value="" style={{ background: '#1e2035', color: '#64748b' }}>+ Adicionar especialidade</option>
              {SPECIALTY_LIST.filter(s => !specialties.includes(s)).map(s => (
                <option key={s} value={s} style={{ background: '#1e2035', color: '#e2e8f0' }}>{PROFESSIONS[s]?.label || s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Zona</label>
            <input value={form.zone} onChange={e => setForm(p => ({ ...p, zone: e.target.value }))}
              placeholder="Lisboa, Porto..." className={inp} style={ist} />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Sobre mim</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Descreve o teu trabalho, experiência, especialidades..."
              rows={3} className={inp} style={ist} />
          </div>

          <button type="submit" disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-white transition-all"
            style={{ background: saved ? 'rgba(52,211,153,0.8)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: saving ? 0.7 : 1 }}>
            {saved ? <><CheckCircle size={16} /> Guardado!</> : saving ? 'A guardar...' : <><Save size={16} /> Guardar alterações</>}
          </button>
        </form>

        {/* Portfólio */}
        <div className="rounded-2xl p-6 space-y-4" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black text-white">Portfólio</h2>
              <p className="text-xs text-gray-500 mt-0.5">Aparece no teu perfil público</p>
            </div>
            <span className="text-xs text-gray-600 font-semibold">{portfolio.length} {portfolio.length === 1 ? 'item' : 'itens'}</span>
          </div>

          {portfolio.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {portfolio.map(item => (
                <div key={item.id} className="relative aspect-square rounded-xl overflow-hidden group"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {item.type === 'video' ? (
                    <>
                      <video src={item.url} className="w-full h-full object-cover" muted playsInline />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
                        style={{ background: 'rgba(0,0,0,0.4)' }}>
                        <Play size={18} className="text-white" fill="currentColor" />
                      </div>
                    </>
                  ) : (
                    <img src={item.url} alt="" className="w-full h-full object-cover" />
                  )}
                  <button
                    onClick={() => deletePortfolioItem(item)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'rgba(239,68,68,0.9)' }}>
                    <X size={12} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input ref={portfolioRef} type="file" accept="image/*,video/*" multiple className="hidden"
            onChange={e => { handlePortfolioUpload(e.target.files); e.target.value = '' }} />
          <button onClick={() => portfolioRef.current?.click()} disabled={uploadingPortfolio}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '2px dashed rgba(255,255,255,0.1)', color: '#64748b' }}>
            {uploadingPortfolio
              ? <><Loader2 size={15} className="animate-spin" /> A carregar...</>
              : <><Camera size={15} /> Adicionar fotos ou vídeos</>}
          </button>
          <p className="text-xs text-gray-600 text-center">Máx. 100MB por ficheiro · imagens e vídeos</p>
        </div>

        {/* Avaliações */}
        {reviews.length > 0 && (
          <div className="rounded-2xl p-6 space-y-4" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-black text-white">Avaliações</h2>
                <p className="text-xs text-gray-500 mt-0.5">Aparecem no teu perfil público</p>
              </div>
              <div className="flex items-center gap-1 text-sm font-bold text-amber-400">
                <Star size={14} fill="currentColor" />
                {avgRating.toFixed(1)}
                <span className="text-gray-600 font-normal text-xs">({reviews.length})</span>
              </div>
            </div>
            <div className="space-y-3">
              {reviews.map(r => (
                <div key={r.id} className="p-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(n => (
                        <Star key={n} size={12} fill={n <= r.rating ? '#fbbf24' : 'none'}
                          className={n <= r.rating ? 'text-amber-400' : 'text-gray-700'} />
                      ))}
                    </div>
                    <span className="text-xs text-gray-600">
                      {new Date(r.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  {r.comment && <p className="text-xs text-gray-300 leading-relaxed">{r.comment}</p>}
                  <p className="text-xs text-gray-500 mt-1.5 font-semibold">— {r.client_name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

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
