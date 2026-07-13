'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Star, Loader2, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function AvaliarPage() {
  const { lead_id } = useParams()
  const [lead, setLead] = useState<any>(null)
  const [professional, setProfessional] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [alreadyReviewed, setAlreadyReviewed] = useState(false)
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: leadData } = await supabase
        .from('leads')
        .select('id, name, professional_id, status')
        .eq('id', lead_id as string)
        .maybeSingle()

      if (!leadData) { setLoading(false); return }
      setLead(leadData)
      setName(leadData.name || '')

      const { data: prof } = await supabase
        .from('professionals')
        .select('name, slug, avatar_url, specialty')
        .eq('id', leadData.professional_id)
        .maybeSingle()
      setProfessional(prof)

      const { data: existing } = await supabase
        .from('reviews')
        .select('id')
        .eq('lead_id', lead_id as string)
        .maybeSingle()
      if (existing) setAlreadyReviewed(true)

      setLoading(false)
    }
    load()
  }, [lead_id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0) { setError('Seleciona uma avaliação de 1 a 5 estrelas.'); return }
    if (name.trim().length < 2) { setError('Introduz o teu nome.'); return }
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id, rating, comment, client_name: name }),
    })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error || 'Erro ao submeter avaliação.')
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={28} />
    </div>
  )

  if (!lead || !professional) return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#0a0c1a' }}>
      <div className="text-center">
        <div className="text-5xl mb-4">😕</div>
        <h1 className="text-white text-xl font-bold">Link inválido</h1>
        <p className="text-gray-500 mt-2">Este pedido de avaliação não existe ou expirou.</p>
      </div>
    </div>
  )

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#0a0c1a' }}>
      <div className="text-center max-w-sm">
        <CheckCircle size={56} className="text-green-400 mx-auto mb-4" />
        <h1 className="text-2xl font-black text-white mb-2">Obrigado pela avaliação!</h1>
        <p className="text-gray-400 mb-8">
          A tua opinião vai ajudar outros clientes a escolher {professional.name}.
        </p>
        <Link href={`/p/${professional.slug}`}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          Ver perfil de {professional.name}
        </Link>
        <p className="text-gray-600 text-xs mt-6">Powered by FaçoPorTi</p>
      </div>
    </div>
  )

  if (alreadyReviewed) return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#0a0c1a' }}>
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">⭐</div>
        <h1 className="text-xl font-black text-white mb-2">Já avaliaste este serviço</h1>
        <p className="text-gray-400 mb-6">A tua avaliação já foi registada. Obrigado!</p>
        <Link href={`/p/${professional.slug}`}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          Ver perfil de {professional.name}
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: 'linear-gradient(180deg, #13152a 0%, #0d0f1e 100%)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-lg mx-auto px-6 pt-8 pb-6 text-center">
          {professional.avatar_url ? (
            <img src={professional.avatar_url} alt={professional.name}
              className="w-20 h-20 rounded-full object-cover mx-auto mb-3"
              style={{ border: '3px solid rgba(99,102,241,0.4)' }} />
          ) : (
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black text-white mx-auto mb-3"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
              {professional.name?.[0]}
            </div>
          )}
          <h1 className="text-xl font-black text-white">{professional.name}</h1>
          <p className="text-gray-500 text-sm mt-1">{professional.specialty}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8">
        <h2 className="text-2xl font-black text-white mb-1">Como foi a experiência?</h2>
        <p className="text-gray-400 text-sm mb-8">
          A tua avaliação aparece no perfil público de {professional.name} e ajuda outros clientes.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Estrelas */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-3 block uppercase tracking-wide">Avaliação</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(0)}
                  className="transition-transform hover:scale-110 active:scale-95"
                >
                  <Star
                    size={40}
                    fill={(hovered || rating) >= n ? '#fbbf24' : 'none'}
                    className={(hovered || rating) >= n ? 'text-amber-400' : 'text-gray-700'}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-sm text-gray-400 mt-2">
                {['', 'Mau', 'Razoável', 'Bom', 'Muito bom', 'Excelente'][rating]}
              </p>
            )}
          </div>

          {/* Comentário */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">
              Comentário <span className="text-gray-600 normal-case">(opcional)</span>
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Conta como correu o trabalho, pontualidade, qualidade..."
              rows={4}
              className="w-full rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* Nome */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">O teu nome</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="João Silva"
              className="w-full rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || rating === 0}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white transition-all"
            style={{
              background: rating > 0 && !submitting ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
              boxShadow: rating > 0 && !submitting ? '0 8px 24px rgba(99,102,241,0.4)' : 'none',
              opacity: rating === 0 || submitting ? 0.4 : 1,
            }}
          >
            {submitting ? <><Loader2 size={18} className="animate-spin" /> A enviar...</> : '⭐ Submeter avaliação'}
          </button>

          <p className="text-center text-gray-600 text-xs">
            A tua avaliação é pública e aparece no perfil do profissional.
          </p>
        </form>
      </div>
    </div>
  )
}
