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
import { Phone, MessageCircle, Euro, User, LogOut, Plus, X, BarChart2, Briefcase, TrendingUp, CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

const COLUMNS = [
  { id: 'novo', label: 'Novo', color: '#6366f1', bg: '#6366f120' },
  { id: 'qualificado', label: 'Qualificado', color: '#f59e0b', bg: '#f59e0b20' },
  { id: 'visita', label: 'Visita', color: '#3b82f6', bg: '#3b82f620' },
  { id: 'proposta', label: 'Proposta', color: '#8b5cf6', bg: '#8b5cf620' },
  { id: 'fechado', label: 'Fechado', color: '#10b981', bg: '#10b98120' },
  { id: 'perdido', label: 'Perdido', color: '#ef4444', bg: '#ef444420' },
]

function LeadCard({ lead, quote, onClick }: { lead: any; quote: any; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id })

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 999, opacity: 0.85 }
    : {}

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`bg-white rounded-2xl p-4 cursor-pointer shadow-sm border border-gray-100 transition-all ${isDragging ? 'shadow-2xl rotate-1' : 'hover:shadow-md hover:-translate-y-0.5'}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
            {(lead.name || '?')[0].toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-sm text-gray-800">{lead.name || 'Sem nome'}</div>
            <div className="text-xs text-gray-400 flex items-center gap-1">
              <Phone size={10} /> {lead.phone}
            </div>
          </div>
        </div>
        <span className="text-xs text-gray-400">
          {new Date(lead.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
        </span>
      </div>

      {lead.q1_tipo_trabalho && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
            {lead.q1_tipo_trabalho}
          </span>
          {lead.q3_area_m2 && (
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
              {lead.q3_area_m2} m²
            </span>
          )}
        </div>
      )}

      {quote ? (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">Orçamento</span>
          <span className="text-sm font-bold text-emerald-600">€{quote.valor_min}–{quote.valor_max}</span>
        </div>
      ) : (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <a
            href={`https://wa.me/${lead.phone}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-xs bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded-lg"
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
              className="text-xs bg-indigo-500 text-white font-semibold px-3 py-1.5 rounded-lg"
            >
              + Orçamento
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Column({ id, label, color, bg, leads, quotes, onCardClick }: any) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const colLeads = leads.filter((l: any) => l.status === id)

  return (
    <div
      ref={setNodeRef}
      className="flex-1 min-w-[240px] max-w-[300px] flex flex-col"
      style={{ transition: 'background 0.2s' }}
    >
      {/* Column header */}
      <div
        className="flex items-center gap-2 mb-3 px-1 py-2 rounded-xl"
        style={{ background: isOver ? bg : 'transparent' }}
      >
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        <span className="font-bold text-sm text-gray-700">{label}</span>
        <span
          className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: bg, color }}
        >
          {colLeads.length}
        </span>
      </div>

      {/* Cards */}
      <div
        className="flex flex-col gap-3 flex-1 rounded-2xl p-2 min-h-[200px] transition-colors"
        style={{ background: isOver ? bg : '#f8f9fa' }}
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
          <div className="flex-1 flex items-center justify-center text-gray-300 text-xs py-8 border-2 border-dashed border-gray-200 rounded-xl">
            Sem leads
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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="font-black text-xl text-gray-800">Novo Lead</h2>
            <p className="text-sm text-gray-400">Adicionar cliente manualmente</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-gray-100 rounded-xl p-2">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Nome</label>
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="João Silva"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Telefone *</label>
              <input
                required
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="351912345678"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Tipo de Trabalho</label>
              <select
                value={form.q1_tipo_trabalho}
                onChange={e => set('q1_tipo_trabalho', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              >
                <option value="interior">Interior</option>
                <option value="exterior">Exterior</option>
                <option value="ambos">Ambos</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Área (m²)</label>
              <input
                type="number"
                value={form.q3_area_m2}
                onChange={e => set('q3_area_m2', e.target.value)}
                placeholder="80"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Divisões</label>
            <input
              value={form.q2_divisoes}
              onChange={e => set('q2_divisoes', e.target.value)}
              placeholder="2 quartos, sala, cozinha"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Prazo</label>
            <select
              value={form.q9_prazo}
              onChange={e => set('q9_prazo', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
            >
              <option value="urgente">Esta semana</option>
              <option value="normal">Este mês</option>
              <option value="sem_pressa">Sem pressa</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-2xl p-4">
            {[
              { key: 'q4_cor_escura', label: '🎨 Cor escura' },
              { key: 'q5_fissuras', label: '🔧 Fissuras' },
              { key: 'q6_mobilias', label: '🛋️ Móveis a mover' },
              { key: 'q7_primer', label: '🖌️ Primário' },
              { key: 'q8_teto', label: '⬆️ Inclui teto' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(form as any)[key]}
                  onChange={e => set(key, e.target.checked)}
                  className="accent-indigo-500 w-4 h-4"
                />
                <span className="text-sm text-gray-600">{label}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Notas</label>
            <textarea
              value={form.q12_notas}
              onChange={e => set('q12_notas', e.target.value)}
              placeholder="Observações adicionais..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold py-3.5 rounded-xl text-sm shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transition-all"
          >
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
  const router = useRouter()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [{ data: leadsData }, { data: quotesData }] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('quotes').select('*').order('created_at', { ascending: false }),
    ])
    setLeads(leadsData || [])
    setQuotes(quotesData || [])
    setLoading(false)
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
    <div className="min-h-screen bg-gray-50">
      {showModal && (
        <NovoLeadModal onClose={() => setShowModal(false)} onCreated={loadData} />
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Briefcase size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-800">Faço<span className="text-indigo-500">Por</span>Ti</h1>
              <p className="text-xs text-gray-400">Gestão de Orçamentos</p>
            </div>
          </div>

          {/* KPIs */}
          <div className="hidden md:flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center">
                <User size={14} className="text-indigo-500" />
              </div>
              <div>
                <div className="text-lg font-black text-gray-800">{totalLeads}</div>
                <div className="text-xs text-gray-400">Leads</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center">
                <TrendingUp size={14} className="text-purple-500" />
              </div>
              <div>
                <div className="text-lg font-black text-gray-800">{totalOrcamentos}</div>
                <div className="text-xs text-gray-400">Orçamentos</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center">
                <CheckCircle size={14} className="text-emerald-500" />
              </div>
              <div>
                <div className="text-lg font-black text-gray-800">{totalFechado}</div>
                <div className="text-xs text-gray-400">Fechados</div>
              </div>
            </div>
            {faturacao > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center">
                  <Euro size={14} className="text-amber-500" />
                </div>
                <div>
                  <div className="text-lg font-black text-gray-800">€{Math.round(faturacao)}</div>
                  <div className="text-xs text-gray-400">Faturado</div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transition-all"
            >
              <Plus size={16} /> Novo Lead
            </button>
            <a href="/stats" className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm px-3 py-2.5 rounded-xl transition-colors font-semibold">
              <BarChart2 size={15} /> Stats
            </a>
            <a href="/config" className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm px-3 py-2.5 rounded-xl transition-colors font-semibold">
              ⚙️ Preços
            </a>
            <button onClick={loadData} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm px-3 py-2.5 rounded-xl transition-colors">
              ↻
            </button>
            <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600 px-3 py-2.5 rounded-xl transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-400 text-sm">A carregar leads...</p>
            </div>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-6">
              {COLUMNS.map(col => (
                <Column
                  key={col.id}
                  {...col}
                  leads={leads}
                  quotes={quotes}
                  onCardClick={(id: string) => router.push(`/leads/${id}`)}
                />
              ))}
            </div>
          </DndContext>
        )}
      </div>
    </div>
  )
}
