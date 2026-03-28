'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  useDroppable,
  useDraggable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { Phone, MessageCircle, Euro, User, LogOut, Plus, X, BarChart2, Briefcase, TrendingUp, CheckCircle, ChevronRight, Link2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

const COLUMNS = [
  { id: 'novo',        label: 'Novo',       color: '#818cf8', bg: 'rgba(129,140,248,0.12)' },
  { id: 'qualificado', label: 'Qualificado', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  { id: 'visita',      label: 'Visita',      color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  { id: 'proposta',    label: 'Proposta',    color: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
  { id: 'fechado',     label: 'Fechado',     color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  { id: 'perdido',     label: 'Perdido',     color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
]

function LeadCard({ lead, quote, onClick }: { lead: any; quote: any; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id })

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 999, opacity: 0.9 }
    : {}

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`group relative rounded-2xl p-4 cursor-pointer transition-all select-none ${
        isDragging
          ? 'shadow-2xl scale-105'
          : 'hover:translate-y-[-2px] hover:shadow-xl'
      }`}
      style={{
        ...style,
        background: 'linear-gradient(135deg, #1e2035 0%, #191b2e 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: isDragging ? '0 25px 50px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      {/* Avatar + nome */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            {(lead.name || '?')[0].toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-sm text-white leading-tight">{lead.name || 'Sem nome'}</div>
            <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
              <Phone size={9} /> {lead.phone}
            </div>
          </div>
        </div>
        <ChevronRight size={14} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
      </div>

      {/* Tags */}
      {lead.q1_tipo_trabalho && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="text-xs px-2 py-0.5 rounded-lg font-medium capitalize"
            style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>
            {lead.q1_tipo_trabalho}
          </span>
          {lead.q3_area_m2 && (
            <span className="text-xs px-2 py-0.5 rounded-lg font-medium"
              style={{ background: 'rgba(96,165,250,0.2)', color: '#60a5fa' }}>
              {lead.q3_area_m2} m²
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {quote ? (
          <>
            <span className="text-xs text-gray-500">Orçamento</span>
            <span className="text-sm font-black" style={{ color: '#34d399' }}>
              €{quote.valor_min}–{quote.valor_max}
            </span>
          </>
        ) : (
          <>
            <a
              href={`https://wa.me/${lead.phone}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(37,211,102,0.15)', color: '#25d366' }}
            >
              <MessageCircle size={11} /> WhatsApp
            </a>
            {lead.q3_area_m2 && (
              <button
                onClick={async (e) => {
                  e.stopPropagation()
                  await fetch('/api/quote/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lead_id: lead.id }),
                  })
                  window.location.reload()
                }}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}
              >
                + Orçamento
              </button>
            )}
            <span className="text-xs text-gray-600">
              {new Date(lead.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

function Column({ id, label, color, bg, leads, quotes, onCardClick }: any) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const colLeads = leads.filter((l: any) => l.status === id)

  return (
    <div className="flex-1 min-w-[240px] max-w-[290px] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        <span className="font-bold text-sm" style={{ color: '#e2e8f0' }}>{label}</span>
        <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-lg"
          style={{ background: bg, color }}>
          {colLeads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className="flex flex-col gap-3 flex-1 rounded-xl p-3 min-h-[200px] transition-all"
        style={{
          background: '#ffffff',
          border: `3px solid ${color}`,
          outline: `3px solid ${color}40`,
          outlineOffset: '3px',
          borderRadius: '14px',
        }}
      >
        {colLeads.map((lead: any) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            quote={quotes.find((q: any) => q.lead_id === lead.id)}
            onClick={() => onCardClick(lead.id)}
          />
        ))}
        {colLeads.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-10 gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-1"
              style={{ background: `${color}20`, border: `2px dashed ${color}60` }}>
              <Plus size={16} style={{ color }} />
            </div>
            <span className="text-sm font-bold" style={{ color: '#9b1c1c' }}>Arrasta aqui</span>
          </div>
        )}
      </div>
    </div>
  )
}

function NovoLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '', phone: '', q1_tipo_trabalho: 'interior',
    q2_divisoes: '', q3_area_m2: '', q4_cor_escura: false,
    q5_fissuras: false, q6_mobilias: false, q7_primer: false,
    q8_teto: false, q9_prazo: 'normal', q12_notas: '',
  })
  const [saving, setSaving] = useState(false)

  function set(key: string, value: any) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/leads/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    onCreated()
    onClose()
  }

  const inputClass = "w-full rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
  const inputStyle = { background: '#0d0f1a', border: '1px solid rgba(255,255,255,0.08)' }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl"
        style={{ background: '#13152a', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between p-6"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="font-black text-xl text-white">Novo Lead</h2>
            <p className="text-sm text-gray-500">Adicionar cliente manualmente</p>
          </div>
          <button onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors p-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Nome</label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="João Silva" className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Telefone *</label>
              <input required value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="351912345678" className={inputClass} style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Tipo</label>
              <select value={form.q1_tipo_trabalho} onChange={e => set('q1_tipo_trabalho', e.target.value)}
                className={inputClass} style={inputStyle}>
                <option value="interior">Interior</option>
                <option value="exterior">Exterior</option>
                <option value="ambos">Ambos</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Área (m²)</label>
              <input type="number" value={form.q3_area_m2} onChange={e => set('q3_area_m2', e.target.value)}
                placeholder="80" className={inputClass} style={inputStyle} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Divisões</label>
            <input value={form.q2_divisoes} onChange={e => set('q2_divisoes', e.target.value)}
              placeholder="2 quartos, sala, cozinha" className={inputClass} style={inputStyle} />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Prazo</label>
            <select value={form.q9_prazo} onChange={e => set('q9_prazo', e.target.value)}
              className={inputClass} style={inputStyle}>
              <option value="urgente">Esta semana</option>
              <option value="normal">Este mês</option>
              <option value="sem_pressa">Sem pressa</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 p-4 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              { key: 'q4_cor_escura', label: 'Cor escura' },
              { key: 'q5_fissuras', label: 'Fissuras' },
              { key: 'q6_mobilias', label: 'Móveis a mover' },
              { key: 'q7_primer', label: 'Primário' },
              { key: 'q8_teto', label: 'Inclui teto' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={(form as any)[key]}
                  onChange={e => set(key, e.target.checked)} className="accent-indigo-500 w-4 h-4" />
                <span className="text-sm text-gray-400">{label}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Notas</label>
            <textarea value={form.q12_notas} onChange={e => set('q12_notas', e.target.value)}
              placeholder="Observações adicionais..." rows={2}
              className={`${inputClass} resize-none`} style={inputStyle} />
          </div>

          <button type="submit" disabled={saving}
            className="w-full font-bold py-3.5 rounded-xl text-sm text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)' }}>
            {saving ? 'A criar...' : 'Criar Lead'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [leads, setLeads] = useState<any[]>([])
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [professional, setProfessional] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const router = useRouter()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data: leadsData }, { data: quotesData }, { data: profData }] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('quotes').select('*').order('created_at', { ascending: false }),
      user ? supabase.from('professionals').select('slug, name').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    setLeads(leadsData || [])
    setQuotes(quotesData || [])
    setProfessional(profData)
    setLoading(false)
  }

  function copyLink() {
    if (!professional?.slug) return
    const url = `${window.location.origin}/p/${professional.slug}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const leadId = active.id as string
    const newStatus = over.id as string
    if (!COLUMNS.find(c => c.id === newStatus)) return
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l))
    await supabase.from('leads').update({ status: newStatus }).eq('id', leadId)
  }

  const totalFechado = leads.filter(l => l.status === 'fechado').length
  const totalLeads = leads.length
  const totalOrcamentos = quotes.length
  const faturacao = quotes
    .filter(q => leads.find(l => l.id === q.lead_id && l.status === 'fechado'))
    .reduce((sum, q) => sum + ((q.valor_min + q.valor_max) / 2), 0)

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      {showModal && <NovoLeadModal onClose={() => setShowModal(false)} onCreated={loadData} />}

      {/* Header */}
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-6 py-4 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.4)' }}>
              <Briefcase size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white">Faço<span style={{ color: '#818cf8' }}>Por</span>Ti</h1>
              <p className="text-xs text-gray-600">Gestão de Orçamentos</p>
            </div>
          </div>

          {/* KPIs */}
          <div className="hidden md:flex items-center gap-2">
            {[
              { icon: <User size={13} />, value: totalLeads, label: 'Leads', color: '#818cf8', bg: 'rgba(129,140,248,0.1)' },
              { icon: <TrendingUp size={13} />, value: totalOrcamentos, label: 'Orçamentos', color: '#c084fc', bg: 'rgba(192,132,252,0.1)' },
              { icon: <CheckCircle size={13} />, value: totalFechado, label: 'Fechados', color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
              ...(faturacao > 0 ? [{ icon: <Euro size={13} />, value: `€${Math.round(faturacao)}`, label: 'Faturado', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' }] : []),
            ].map((kpi, i) => (
              <div key={i} className="flex items-center gap-2.5 px-4 py-2 rounded-xl"
                style={{ background: kpi.bg, border: `1px solid ${kpi.color}20` }}>
                <span style={{ color: kpi.color }}>{kpi.icon}</span>
                <div>
                  <div className="text-base font-black text-white leading-tight">{kpi.value}</div>
                  <div className="text-xs leading-tight" style={{ color: kpi.color + 'aa' }}>{kpi.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {professional?.slug && (
              <button onClick={copyLink}
                className="flex items-center gap-1.5 text-sm font-bold px-3 py-2.5 rounded-xl transition-all"
                style={{ background: copied ? 'rgba(52,211,153,0.15)' : 'rgba(99,102,241,0.15)', color: copied ? '#34d399' : '#818cf8', border: `1px solid ${copied ? '#34d39930' : '#6366f130'}` }}>
                <Link2 size={14} /> {copied ? 'Copiado!' : 'Meu Link'}
              </button>
            )}
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.35)' }}>
              <Plus size={15} /> Novo Lead
            </button>
            <a href="/acordos"
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.07)' }}>
              📋 Acordos
            </a>
            <a href="/stats"
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.07)' }}>
              <BarChart2 size={14} /> Stats
            </a>
            <a href="/config"
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.07)' }}>
              ⚙️ Preços
            </a>
            <button onClick={loadData}
              className="text-sm px-3 py-2.5 rounded-xl transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.07)' }}>
              ↻
            </button>
            <button onClick={handleLogout}
              className="px-3 py-2.5 rounded-xl transition-colors"
              style={{ color: '#475569' }}>
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-indigo-900 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600 text-sm">A carregar...</p>
            </div>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-6" style={{ minHeight: 'calc(100vh - 140px)' }}>
              {COLUMNS.map(col => (
                <Column key={col.id} {...col} leads={leads} quotes={quotes}
                  onCardClick={(id: string) => router.push(`/leads/${id}`)} />
              ))}
            </div>
          </DndContext>
        )}
      </div>
    </div>
  )
}
