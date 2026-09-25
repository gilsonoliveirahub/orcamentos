'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Save, Copy, CheckCircle, Loader2, ExternalLink, Settings, Camera, X, Star, Play, Pause, PauseCircle, ZoomIn, ZoomOut, Crown, Zap, AlertTriangle, Info, ShieldCheck, Mail, Clock, UserPlus, Phone, Bell, RefreshCw, Ban, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { SPECIALTY_LIST, PROFESSIONS } from '@/lib/professions'
import { computeProfileCompleteness } from '@/lib/profile-completeness'
import { computeEffectiveAvailability, AVAILABILITY_STATUSES, AVAILABILITY_LABELS, type AvailabilityStatus } from '@/lib/professional-availability'
import type { ActiveSubscriptionStatus, SimplifiedSubscriptionStatus } from '@/lib/stripe-plans'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'

// Convidar um cliente de um trabalho feito FORA do FaçoPorTi a deixar
// opinião — sem criar nenhum pedido fictício em `leads` só para isso (ver
// supabase/migration_review_invites.sql). Um único canal por convite (email
// OU WhatsApp, nunca os dois — decisão de negócio, 2026-09-23); um único
// convite pendente por contacto de cada vez, a mensagem de erro do servidor
// (409) já vem pronta a mostrar quando o profissional tenta repetir.
function InviteReviewModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/review-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: name, channel, client_email: channel === 'email' ? email : undefined, client_phone: channel === 'whatsapp' ? phone : undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Não foi possível criar o convite.')
        setSaving(false)
        return
      }
      if (json.send_error) {
        setError(`Convite criado, mas ${channel === 'email' ? 'o email' : 'o WhatsApp'} não foi enviado. Tenta noutra altura.`)
        setSaving(false)
        onCreated()
        return
      }
      onCreated()
      onClose()
    } catch {
      setError('Não foi possível criar o convite. Tente novamente.')
      setSaving(false)
    }
  }

  const inputClass = "w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
  const inputStyle = { background: '#0d0f1a', border: '1px solid rgba(255,255,255,0.08)' }

  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl"
        style={{ background: '#13152a', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between p-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="font-black text-xl text-white">Convidar cliente para avaliar</h2>
            <p className="text-sm text-gray-500">Para trabalhos feitos fora do FaçoPorTi</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-gray-400 leading-relaxed">
            Enviamos ao cliente uma ligação pessoal e segura para deixar a opinião. Aparece no teu perfil marcada como <strong className="text-white">&quot;Cliente convidado pelo profissional&quot;</strong>, separada das avaliações de pedidos feitos aqui.
          </p>

          {/* Canal — um dos dois, nunca os dois ao mesmo tempo */}
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <button type="button" onClick={() => setChannel('email')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors"
              style={channel === 'email' ? { background: 'rgba(99,102,241,0.2)', color: '#818cf8' } : { color: '#64748b' }}>
              <Mail size={13} /> Email
            </button>
            <button type="button" onClick={() => setChannel('whatsapp')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors"
              style={channel === 'whatsapp' ? { background: 'rgba(37,211,102,0.15)', color: '#25d366' } : { color: '#64748b' }}>
              <Phone size={13} /> WhatsApp
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Nome do cliente</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="Maria Santos" className={inputClass} style={inputStyle} />
          </div>
          {channel === 'email' ? (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Email do cliente</label>
              <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="maria@exemplo.com" className={inputClass} style={inputStyle} />
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Telemóvel do cliente</label>
              <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="351 912 345 678" className={inputClass} style={inputStyle} />
            </div>
          )}
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full font-bold py-3.5 rounded-xl text-sm text-white transition-all flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #c9a84c, #e0bf6a)', color: '#000', opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : channel === 'email' ? <Mail size={16} /> : <Phone size={16} />}
            {saving ? 'A enviar...' : 'Enviar convite'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function PerfilPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [professional, setProfessional] = useState<any>(null)
  // "O meu plano" (2026-09-19) — nunca deriva ciclo/estado só do tier
  // guardado em professionals.plan; vem sempre desta leitura real ao
  // Stripe (mesma rota usada por app/upgrade e app/dashboard).
  const [subStatus, setSubStatus] = useState<(ActiveSubscriptionStatus & { status: SimplifiedSubscriptionStatus; current_period_end: string | null }) | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', zone: '', description: '' })
  const [specialties, setSpecialties] = useState<string[]>(['Pintura'])
  const [portfolio, setPortfolio] = useState<any[]>([])
  const [reviews, setReviews] = useState<any[]>([])
  const [invites, setInvites] = useState<any[]>([])
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [decidingRequestId, setDecidingRequestId] = useState<string | null>(null)
  const [whatsappOperational, setWhatsappOperational] = useState(true)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [avatarLightbox, setAvatarLightbox] = useState(false)
  const [portfolioLightboxIndex, setPortfolioLightboxIndex] = useState<number | null>(null)
  const [availabilityStatus, setAvailabilityStatus] = useState<AvailabilityStatus>('disponivel')
  const [availableFrom, setAvailableFrom] = useState('')
  const [togglingAccepting, setTogglingAccepting] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const portfolioRef = useRef<HTMLInputElement>(null)

  // Convites de avaliação (trabalhos fora do FaçoPorTi) — separado do
  // carregamento principal para poder ser chamado outra vez depois de criar
  // um convite novo, sem recarregar o resto do perfil.
  async function loadInvites() {
    const res = await fetch('/api/review-invites')
    if (!res.ok) return
    const json = await res.json()
    setInvites(json.invites || [])
    setWhatsappOperational(!!json.whatsapp_operational)
  }

  // Todas as ações do profissional sobre um convite (confirmar/rejeitar um
  // pedido, reenviar, cancelar) passam por aqui — mesmo endpoint PATCH, o
  // servidor é que valida se a ação faz sentido no estado atual (ver
  // app/api/review-invites/[id]/route.ts). send_error só se aplica a
  // confirm/resend, que são os únicos que tentam mesmo enviar. De propósito
  // não há nenhuma ação para apagar a avaliação de um cliente.
  async function handleInviteAction(id: string, action: 'confirm' | 'reject' | 'resend' | 'cancel', confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return
    setDecidingRequestId(id)
    try {
      const res = await fetch(`/api/review-invites/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error || 'Não foi possível concluir a ação.')
        return
      }
      if ((action === 'confirm' || action === 'resend') && json.send_error) {
        alert(`Feito, mas o envio falhou (${json.send_error}). Tenta noutra altura.`)
      }
      await loadInvites()
    } finally {
      setDecidingRequestId(null)
    }
  }

  // Elimina o CONVITE em si (nunca uma avaliação — não existe nenhuma ação
  // para isso) — só rejeitados, cancelados, ou pendentes cujo envio falhou
  // aceitam isto do lado do servidor, é só para limpar a lista.
  async function handleDeleteInvite(id: string) {
    if (!confirm('Eliminar este convite da lista? Não pode ser desfeito.')) return
    setDecidingRequestId(id)
    try {
      const res = await fetch(`/api/review-invites/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        alert(json.error || 'Não foi possível eliminar.')
        return
      }
      await loadInvites()
    } finally {
      setDecidingRequestId(null)
    }
  }

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
      // Mostra sempre o estado EFETIVO (ver lib/professional-availability.ts)
      // — se "indisponível até {data}" já passou, o próprio formulário já
      // aparece como "Disponível" em vez de confundir com uma data no
      // passado. Se availability_status ainda não existir na BD (migração
      // por aplicar), cai no antigo accepting_leads — nunca esconder pedidos
      // por omissão.
      const effective = computeEffectiveAvailability(prof)
      setAvailabilityStatus(effective)
      setAvailableFrom(prof.availability_status === 'indisponivel' ? (prof.available_from || '') : '')
      const [{ data: portfolioData }, { data: reviewsData }] = await Promise.all([
        supabase.from('professional_portfolio').select('*').eq('professional_id', prof.id).order('sort_order').order('created_at'),
        supabase.from('reviews').select('*').eq('professional_id', prof.id).order('created_at', { ascending: false }),
      ])
      setPortfolio(portfolioData || [])
      setReviews(reviewsData || [])
      // GET sem parâmetros de propósito — o servidor resolve o profissional
      // só pela sessão autenticada, nunca por um id enviado a partir daqui.
      const statusRes = await fetch('/api/stripe/subscription-status')
      const statusJson = await statusRes.json().catch(() => null)
      if (statusJson && !statusJson.error) setSubStatus(statusJson)
      loadInvites()
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

  // accepting_leads (coluna antiga) fica sempre escrita em sincronia — várias
  // partes do código e a ficha de admin ainda a leem diretamente (ver
  // lib/professional-availability.ts).
  async function handleAvailabilityChange(status: AvailabilityStatus, fromDate: string) {
    setTogglingAccepting(true)
    const nextAvailableFrom = status === 'indisponivel' && fromDate ? fromDate : null
    const { error } = await supabase.from('professionals').update({
      availability_status: status,
      available_from: nextAvailableFrom,
      accepting_leads: status !== 'indisponivel',
    }).eq('id', professional.id)
    if (!error) {
      setAvailabilityStatus(status)
      setAvailableFrom(nextAvailableFrom || '')
    } else {
      alert('Não foi possível guardar a disponibilidade. Tenta novamente.')
    }
    setTogglingAccepting(false)
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/p/${professional.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleAvatarFileSelected(file: File) {
    const reader = new FileReader()
    reader.onload = () => setCropSrc(reader.result as string)
    reader.readAsDataURL(file)
    setZoom(1)
    setCrop({ x: 0, y: 0 })
  }

  async function handleCropConfirm() {
    if (!cropSrc || !croppedAreaPixels) return
    setUploadingAvatar(true)
    setCropSrc(null)
    const blob = await getCroppedImg(cropSrc, croppedAreaPixels)
    const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
    const form = new FormData()
    form.append('file', file)
    form.append('type', 'avatar')
    const res = await fetch('/api/portfolio', { method: 'POST', body: form })
    const json = await res.json()
    if (!res.ok) { alert(`Erro: ${json.error}`); setUploadingAvatar(false); return }
    await supabase.from('professionals').update({ avatar_url: json.item.url }).eq('id', professional.id)
    setProfessional((p: any) => ({ ...p, avatar_url: json.item.url }))
    setUploadingAvatar(false)
  }

  async function handlePortfolioUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingPortfolio(true)
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      if (!isImage && !isVideo) continue
      const form = new FormData()
      form.append('file', file)
      form.append('sort_order', String(portfolio.length))
      const res = await fetch('/api/portfolio', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) { alert(`Erro: ${json.error}`); continue }
      setPortfolio(p => [...p, json.item])
    }
    setUploadingPortfolio(false)
  }

  async function deletePortfolioItem(item: any) {
    if (!confirm('Apagar este item do portfólio?')) return
    setPortfolio(p => p.filter(i => i.id !== item.id))
    const res = await fetch('/api/portfolio', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) })
    if (!res.ok) {
      const json = await res.json()
      alert(`Erro ao apagar: ${json.error}`)
      setPortfolio(p => [...p, item])
    }
  }

  const inp = "w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
  const ist = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0

  const PLAN_LIMITS: Record<string, { photos: number; videos: number }> = {
    free:    { photos: 5,  videos: 0 },
    starter: { photos: 10, videos: 2 },
    pro:     { photos: 50, videos: 5 },
  }
  const plan = professional?.plan || 'free'
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free
  const photoCount = portfolio.filter(i => i.type !== 'video').length
  const videoCount = portfolio.filter(i => i.type === 'video').length

  // Só informativo — nunca afeta ranking nem visibilidade, só ajuda o
  // profissional a perceber o que falta para um perfil mais forte.
  const completeness = professional ? computeProfileCompleteness({
    description: form.description,
    avatar_url: professional.avatar_url,
    zone: form.zone,
    phone: form.phone,
    portfolioCount: portfolio.length,
    reviewsCount: reviews.length,
  }) : null

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={28} />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>

      {showInviteModal && (
        <InviteReviewModal onClose={() => setShowInviteModal(false)} onCreated={loadInvites} />
      )}

      {/* Crop modal */}
      {cropSrc && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#000' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <button onClick={() => setCropSrc(null)} className="text-gray-400 hover:text-white transition-colors text-sm font-semibold">
              Cancelar
            </button>
            <span className="text-white font-black text-sm">Ajustar foto</span>
            <button onClick={handleCropConfirm}
              className="font-black text-sm px-4 py-1.5 rounded-xl"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}>
              Confirmar
            </button>
          </div>
          <div className="relative flex-1">
            <Cropper
              image={cropSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, area) => setCroppedAreaPixels(area)}
            />
          </div>
          <div className="px-6 py-5" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center gap-3">
              <ZoomOut size={18} className="text-gray-400 flex-shrink-0" />
              <input
                type="range" min={1} max={3} step={0.05}
                value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                className="flex-1 accent-indigo-500"
              />
              <ZoomIn size={18} className="text-gray-400 flex-shrink-0" />
            </div>
            <p className="text-center text-gray-600 text-xs mt-2">Faz zoom e arrasta para ajustar</p>
          </div>
        </div>
      )}

      {/* Avatar lightbox */}
      {avatarLightbox && professional.avatar_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.95)' }}
          onClick={() => setAvatarLightbox(false)}>
          <button className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors">
            <X size={28} />
          </button>
          <img src={professional.avatar_url} alt={form.name}
            className="max-w-full max-h-[85vh] rounded-3xl object-contain"
            style={{ boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }}
            onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Portfolio lightbox */}
      {portfolioLightboxIndex !== null && portfolio[portfolioLightboxIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.95)' }}
          onClick={() => setPortfolioLightboxIndex(null)}
          onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
          onTouchEnd={e => {
            if (touchStartX.current === null) return
            const diff = e.changedTouches[0].clientX - touchStartX.current
            touchStartX.current = null
            if (Math.abs(diff) < 50) return
            setPortfolioLightboxIndex(i => {
              if (i === null) return i
              if (diff < 0) return i < portfolio.length - 1 ? i + 1 : i
              return i > 0 ? i - 1 : i
            })
          }}>
          <button className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
            onClick={() => setPortfolioLightboxIndex(null)}>
            <X size={28} />
          </button>
          {portfolioLightboxIndex > 0 && (
            <button
              className="absolute left-3 sm:left-4 text-white/60 hover:text-white transition-colors p-2"
              onClick={e => { e.stopPropagation(); setPortfolioLightboxIndex(i => (i as number) - 1) }}>
              <ChevronLeft size={32} />
            </button>
          )}
          {portfolioLightboxIndex < portfolio.length - 1 && (
            <button
              className="absolute right-3 sm:right-4 text-white/60 hover:text-white transition-colors p-2"
              onClick={e => { e.stopPropagation(); setPortfolioLightboxIndex(i => (i as number) + 1) }}>
              <ChevronRight size={32} />
            </button>
          )}
          <div onClick={e => e.stopPropagation()} className="flex flex-col items-center max-w-full">
            {portfolio[portfolioLightboxIndex].type === 'video' ? (
              <video src={portfolio[portfolioLightboxIndex].url} controls autoPlay className="max-w-full rounded-xl" style={{ maxHeight: '80vh' }} />
            ) : (
              <img src={portfolio[portfolioLightboxIndex].url} alt="" className="max-w-full rounded-xl object-contain" style={{ maxHeight: '80vh' }} />
            )}
          </div>
        </div>
      )}

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
            onChange={e => { if (e.target.files?.[0]) { handleAvatarFileSelected(e.target.files[0]); e.target.value = '' } }} />
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <div className="relative">
              {professional.avatar_url ? (
                <button onClick={() => setAvatarLightbox(true)} className="block">
                  <img src={professional.avatar_url} alt={form.name}
                    className="w-16 h-16 rounded-2xl object-cover hover:opacity-90 transition-opacity" />
                </button>
              ) : (
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black text-white"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
                  {form.name?.[0] || '?'}
                </div>
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.6)' }}>
                  <Loader2 size={20} className="animate-spin text-white" />
                </div>
              )}
            </div>
            <button onClick={() => avatarRef.current?.click()} disabled={uploadingAvatar}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
              <Camera size={11} />
              {uploadingAvatar ? 'A carregar...' : professional.avatar_url ? 'Alterar' : 'Adicionar foto'}
            </button>
          </div>
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

        {/* Completude do perfil — só informativo, nunca afeta ranking */}
        {completeness && completeness.percent < 100 && (
          <div className="rounded-2xl p-5" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-white">Completa o teu perfil</h2>
              <span className="text-xs font-bold" style={{ color: '#818cf8' }}>{completeness.percent}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full mb-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-1.5 rounded-full transition-all" style={{ width: `${completeness.percent}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
            </div>
            <ul className="space-y-1">
              {completeness.items.filter(i => !i.done).map(i => (
                <li key={i.key} className="text-xs text-gray-500 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: '#64748b' }} />
                  {i.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSave} className="rounded-2xl p-6 space-y-5" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-black text-white">Editar informações</h2>

          <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-3 min-w-0">
              {availabilityStatus === 'disponivel' && <Play size={16} className="text-emerald-400 flex-shrink-0" />}
              {availabilityStatus === 'parcial' && <PauseCircle size={16} className="text-amber-400 flex-shrink-0" />}
              {availabilityStatus === 'indisponivel' && <Pause size={16} className="text-red-400 flex-shrink-0" />}
              <div className="min-w-0">
                <div className="text-sm font-bold text-white">{AVAILABILITY_LABELS[availabilityStatus]}</div>
                <div className="text-xs text-gray-500">
                  {availabilityStatus === 'disponivel' && 'A aceitar pedidos normalmente.'}
                  {availabilityStatus === 'parcial' && 'Continuas a aceitar pedidos — os clientes veem um aviso de capacidade reduzida.'}
                  {availabilityStatus === 'indisponivel' && 'Continuas a ver o marketplace, mas não podes adquirir novos pedidos.'}
                </div>
              </div>
            </div>
            <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              {AVAILABILITY_STATUSES.map(s => (
                <button key={s} type="button" disabled={togglingAccepting}
                  onClick={() => handleAvailabilityChange(s, availableFrom)}
                  className="flex-1 py-2 text-xs font-bold transition-colors"
                  style={availabilityStatus === s
                    ? { background: s === 'disponivel' ? 'rgba(52,211,153,0.15)' : s === 'parcial' ? 'rgba(251,191,36,0.15)' : 'rgba(248,113,113,0.15)', color: s === 'disponivel' ? '#34d399' : s === 'parcial' ? '#fbbf24' : '#f87171' }
                    : { color: '#64748b' }}>
                  {AVAILABILITY_LABELS[s]}
                </button>
              ))}
            </div>
            {availabilityStatus === 'indisponivel' && (
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Disponível a partir de (opcional)</label>
                <input type="date" value={availableFrom} disabled={togglingAccepting}
                  onChange={e => handleAvailabilityChange('indisponivel', e.target.value)}
                  className="rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  style={{ background: '#0d0f1a', border: '1px solid rgba(255,255,255,0.08)' }} />
                <p className="text-xs text-gray-600 mt-1.5">Assim que a data chegar, voltas a aparecer disponível automaticamente — não precisas de voltar aqui.</p>
              </div>
            )}
          </div>

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
            <div className="text-right">
              <div className="text-xs font-semibold" style={{ color: photoCount >= limits.photos ? '#f87171' : '#64748b' }}>
                📷 {photoCount}/{limits.photos} fotos
              </div>
              {limits.videos > 0 && (
                <div className="text-xs font-semibold mt-0.5" style={{ color: videoCount >= limits.videos ? '#f87171' : '#64748b' }}>
                  🎬 {videoCount}/{limits.videos} vídeos
                </div>
              )}
              {limits.videos === 0 && (
                <div className="text-xs mt-0.5" style={{ color: '#475569' }}>vídeos: plano free</div>
              )}
            </div>
          </div>

          {portfolio.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {portfolio.map(item => (
                <div key={item.id} className="relative aspect-square rounded-xl overflow-hidden group cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  onClick={() => setPortfolioLightboxIndex(portfolio.indexOf(item))}>
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
                    onClick={e => { e.stopPropagation(); deletePortfolioItem(item) }}
                    className="absolute top-1 right-1 w-7 h-7 rounded-full flex items-center justify-center transition-opacity"
                    style={{ background: 'rgba(239,68,68,0.85)', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }}>
                    <X size={13} className="text-white" />
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
                  <div className="flex items-center gap-2 mt-1.5">
                    <p className="text-xs text-gray-500 font-semibold">— {r.client_name}</p>
                    {r.source === 'convidado' && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                        style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c' }}>
                        <UserPlus size={10} /> Cliente convidado pelo profissional
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pedidos de avaliação submetidos por visitantes do perfil público
            (status 'requested') — só aparecem aqui, nunca é enviado nada
            sem esta confirmação explícita (ver
            app/api/review-invites/request/route.ts). */}
        {invites.some(i => i.status === 'requested') && (
          <div className="rounded-2xl p-6 space-y-4" style={{ background: '#0d0f1e', border: '1px solid rgba(201,168,76,0.3)' }}>
            <div>
              <h2 className="font-black text-white flex items-center gap-2"><Bell size={16} style={{ color: '#c9a84c' }} /> Pedidos de avaliação</h2>
              <p className="text-xs text-gray-500 mt-0.5">Alguém no teu perfil público pediu para avaliar — confirma só se reconheceres como cliente teu.</p>
            </div>
            <div className="space-y-2">
              {invites.filter(i => i.status === 'requested').map(inv => (
                <div key={inv.id} className="p-3 rounded-xl space-y-2.5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-semibold truncate">{inv.client_name}</p>
                    <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                      {inv.channel === 'whatsapp' ? <Phone size={10} /> : <Mail size={10} />}
                      {inv.channel === 'whatsapp' ? inv.client_phone : inv.client_email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleInviteAction(inv.id, 'confirm')} disabled={decidingRequestId === inv.id}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg transition-all"
                      style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', opacity: decidingRequestId === inv.id ? 0.6 : 1 }}>
                      {decidingRequestId === inv.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Confirmar
                    </button>
                    <button onClick={() => handleInviteAction(inv.id, 'reject')} disabled={decidingRequestId === inv.id}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg transition-all"
                      style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', opacity: decidingRequestId === inv.id ? 0.6 : 1 }}>
                      <X size={12} /> Rejeitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Convites de avaliação — trabalhos fora do FaçoPorTi, sem pedido
            fictício nenhum em leads (ver migration_review_invites.sql). */}
        <div className="rounded-2xl p-6 space-y-4" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-black text-white">Convites de avaliação</h2>
              <p className="text-xs text-gray-500 mt-0.5">Para trabalhos feitos fora do FaçoPorTi</p>
            </div>
            <button onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl flex-shrink-0"
              style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c' }}>
              <UserPlus size={13} /> Convidar cliente
            </button>
          </div>
          {invites.filter(i => i.status !== 'requested').length === 0 ? (
            <p className="text-xs text-gray-600">Ainda não convidaste nenhum cliente.</p>
          ) : (
            <div className="space-y-2">
              {invites.filter(i => i.status !== 'requested').map(inv => (
                <div key={inv.id} className="flex items-center justify-between gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-semibold truncate">{inv.client_name}</p>
                    <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                      {inv.channel === 'whatsapp' ? <Phone size={10} /> : <Mail size={10} />}
                      {inv.channel === 'whatsapp' ? inv.client_phone : inv.client_email}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    {inv.status === 'completed' ? (
                      <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
                        <CheckCircle size={11} /> Avaliado
                      </span>
                    ) : inv.status === 'rejected' ? (
                      <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(148,163,184,0.12)', color: '#94a3b8' }}>
                        <X size={11} /> Rejeitado
                      </span>
                    ) : inv.status === 'cancelled' ? (
                      <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(148,163,184,0.12)', color: '#94a3b8' }}>
                        <X size={11} /> Cancelado
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                        <Clock size={11} /> Pendente
                      </span>
                    )}
                    {/* Estado real do envio — distinto do estado do convite
                        acima: "pendente" só diz que ainda não avaliou, isto
                        diz se a mensagem chegou a sair. Erro sempre visível,
                        nunca escondido atrás de "Pendente" genérico. */}
                    {inv.status === 'pending' && inv.send_status === 'failed' && (
                      <span className="text-xs font-bold" style={{ color: '#f87171' }} title={inv.send_error || ''}>
                        Falha no envio{inv.send_error ? `: ${inv.send_error}` : ''}
                      </span>
                    )}
                    {inv.status === 'pending' && inv.send_status === 'sent' && (
                      <span className="text-xs text-gray-500">Enviado, a aguardar confirmação</span>
                    )}
                    {inv.status === 'pending' && inv.send_status === 'delivered' && (
                      <span className="text-xs" style={{ color: '#34d399' }}>Entregue</span>
                    )}

                    {/* Ações — só as que fazem sentido no estado atual.
                        "Reenviar" fica de fora para WhatsApp enquanto o
                        modelo não estiver aprovado (whatsapp_operational),
                        para nunca repetir a mesma falha sem avisar. */}
                    <div className="flex items-center gap-2 mt-0.5">
                      {inv.status === 'pending' && (inv.channel === 'email' || whatsappOperational) && (
                        <button onClick={() => handleInviteAction(inv.id, 'resend')} disabled={decidingRequestId === inv.id}
                          className="text-xs font-semibold flex items-center gap-1 disabled:opacity-50" style={{ color: '#818cf8' }}>
                          <RefreshCw size={11} /> Reenviar
                        </button>
                      )}
                      {inv.status === 'pending' && (
                        <button onClick={() => handleInviteAction(inv.id, 'cancel', 'Cancelar este convite? O link deixa de funcionar.')} disabled={decidingRequestId === inv.id}
                          className="text-xs font-semibold flex items-center gap-1 disabled:opacity-50" style={{ color: '#f87171' }}>
                          <Ban size={11} /> Cancelar
                        </button>
                      )}
                      {(inv.status === 'rejected' || inv.status === 'cancelled' || (inv.status === 'pending' && inv.send_status === 'failed')) && (
                        <button onClick={() => handleDeleteInvite(inv.id)} disabled={decidingRequestId === inv.id}
                          className="text-xs font-semibold flex items-center gap-1 disabled:opacity-50" style={{ color: '#64748b' }}>
                          <Trash2 size={11} /> Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* O meu plano (2026-09-19) — nome do plano, ciclo, estado e preço
            vêm sempre de subStatus (leitura real ao Stripe), nunca de uma
            suposição a partir do tier guardado na BD. */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-black text-white text-sm">O meu plano</h2>
          {(() => {
            const planTier = subStatus?.plan
            const planLabel = planTier === 'pro' ? 'Pro' : planTier === 'starter' ? 'Starter' : 'Sem plano'
            const cycleLabel = subStatus?.cycle === 'annual' ? 'Anual' : subStatus?.cycle === 'monthly' ? 'Mensal' : null
            const priceLabel = planTier === 'pro'
              ? (subStatus?.cycle === 'annual' ? '€397,80/ano + IVA' : subStatus?.cycle === 'monthly' ? '€39/mês + IVA' : null)
              : planTier === 'starter'
                ? (subStatus?.cycle === 'annual' ? '€193,80/ano + IVA' : subStatus?.cycle === 'monthly' ? '€19/mês + IVA' : null)
                : null
            const isAdminAccess = subStatus?.status === 'admin_access'
            const statusMeta: Record<SimplifiedSubscriptionStatus, { label: string; color: string; bg: string; icon: React.ReactElement }> = {
              active:          { label: 'Ativo',                              color: '#34d399', bg: 'rgba(52,211,153,0.12)', icon: <CheckCircle size={14} /> },
              past_due:        { label: 'Pagamento em atraso',                color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', icon: <AlertTriangle size={14} /> },
              canceled:        { label: 'Cancelado',                          color: '#f87171', bg: 'rgba(248,113,113,0.12)', icon: <Zap size={14} /> },
              no_subscription: { label: 'Sem subscrição Stripe associada',    color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', icon: <Info size={14} /> },
              // Acesso administrativo (2026-09-19) — nunca "erro de
              // cobrança": é um acesso concedido de propósito, ligado a esta
              // conta estar na tabela `admins` (ver
              // app/api/stripe/subscription-status/route.ts).
              admin_access:    { label: 'Acesso administrativo (sem cobrança)', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', icon: <ShieldCheck size={14} /> },
              unknown:         { label: 'Estado desconhecido',                color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', icon: <Info size={14} /> },
            }
            const meta = subStatus ? statusMeta[subStatus.status] : null
            return (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: isAdminAccess ? 'rgba(167,139,250,0.15)' : planTier === 'pro' ? 'rgba(201,168,76,0.15)' : 'rgba(99,102,241,0.15)' }}>
                    {isAdminAccess
                      ? <ShieldCheck size={18} style={{ color: '#a78bfa' }} />
                      : <Crown size={18} style={{ color: planTier === 'pro' ? '#c9a84c' : '#818cf8' }} />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-white">
                      {isAdminAccess ? `Acesso administrativo · funcionalidades ${planLabel}` : `${planLabel}${cycleLabel ? ` · ${cycleLabel}` : ''}`}
                    </div>
                    {priceLabel && !isAdminAccess && <div className="text-xs text-gray-500">{priceLabel}</div>}
                  </div>
                </div>

                {meta && (
                  <div className="flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl w-fit"
                    style={{ background: meta.bg, color: meta.color }}>
                    {meta.icon} {meta.label}
                  </div>
                )}

                {/* Regra 5 (profissional normal): plano marcado na BD mas sem
                    subscrição Stripe real por trás — nunca inventa
                    "Mensal"/"Anual", explica a situação claramente. Nunca
                    aparece para admin_access (é um estado distinto, tratado
                    acima). */}
                {subStatus?.status === 'no_subscription' && (planTier === 'starter' || planTier === 'pro') && (
                  <p className="text-xs text-gray-500">
                    A tua conta está marcada como {planLabel} mas não encontrámos uma subscrição Stripe ativa — escolhe um ciclo para a ativar.
                  </p>
                )}

                {isAdminAccess && (
                  <p className="text-xs text-gray-500">
                    Acesso {planLabel} atribuído por administração da plataforma — sem subscrição, ciclo nem cobrança associados.
                  </p>
                )}

                {subStatus?.current_period_end && subStatus.status === 'active' && (
                  <div className="text-xs text-gray-500">
                    Próxima renovação: {new Date(subStatus.current_period_end).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </div>
                )}

                <Link href="/upgrade"
                  className="flex items-center justify-center gap-2 text-sm font-bold px-4 py-3 rounded-xl transition-all"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}>
                  Ver ou alterar plano
                </Link>
              </>
            )
          })()}
        </div>

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

// ── Helpers de crop ───────────────────────────────────────────────────────────

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', reject)
    img.src = url
  })
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height)
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.92))
}
