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
import { Phone, MessageCircle, Euro, User, LogOut, Plus, X, BarChart2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

const COLUMNS = [
  { id: 'novo', label: 'Novo', color: '#6366f1' },
  { id: 'qualificado', label: 'Qualificado', color: '#f59e0b' },
  { id: 'visita', label: 'Visita', color: '#3b82f6' },
  { id: 'proposta', label: 'Proposta', color: '#8b5cf6' },
  { id: 'fechado', label: 'Fechado ✅', color: '#10b981' },
  { id: 'perdido', label: 'Perdido ❌', color: '#ef4444' },
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
      className={`bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4 cursor-pointer active:cursor-grabbing select-none ${isDragging ? 'shadow-2xl' : 'hover:border-[#3a3a3a]'} transition-colors`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <User size={14} className="text-gray-500" />
          <span className="font-semibold text-sm text-white">{lead.name || 'Sem nome'}</span>
        </div>
        <span className="text-xs text-gray-500">
          {new Date(lead.created_at).toLocaleDateString('pt-PT')}
        </span>
      </div>

      <div className="flex items-center gap-1 text-gray-400 text-xs mb-3">
        <Phone size={11} />
        <span>{lead.phone}</span>
      </div>

      {lead.q1_tipo_trabalho && (
        <div className="text-xs text-gray-500 mb-1">
          📐 {lead.q1_tipo_trabalho} · {lead.q3_area_m2 ? `${lead.q3_area_m2}m²` : 'área?'}
        </div>
      )}

      {quote && (
        <div className="flex items-center gap-1 text-[#00c17c] text-sm font-bold mt-2">
          <Euro size={13} />
          {quote.valor_min}–{quote.valor_max}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <a
          href={`https://wa.me/${lead.phone}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1 text-xs bg-[#25d366] text-black font-semibold px-2 py-1 rounded-lg"
        >
          <MessageCircle size={11} /> WhatsApp
        </a>
        {!quote && lead.q3_area_m2 && (
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
            className="text-xs bg-[#6366f1] text-white font-semibold px-2 py-1 rounded-lg"
          >
            Gerar Orçamento
          </button>
        )}
      </div>
    </div>
  )
}

function Column({ id, label, color, leads, quotes, onCardClick }: any) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const colLeads = leads.filter((l: any) => l.status === id)

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[220px] max-w-[280px] rounded-2xl p-3 transition-colors ${isOver ? 'bg-[#ffffff08]' : 'bg-[#161616]'}`}
    >
      <div className="flex items-center gap-2 mb-4 px-1">
        <div className="w-3 h-3 rounded-full" style={{ background: color }} />
        <span className="font-bold text-sm text-white">{label}</span>
        <span className="ml-auto bg-[#2a2a2a] text-gray-400 text-xs font-semibold px-2 py-0.5 rounded-full">
          {colLeads.length}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {colLeads.map((lead: any) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            quote={quotes.find((q: any) => q.lead_id === lead.id)}
            onClick={() => onCardClick(lead.id)}
          />
        ))}
        {colLeads.length === 0 && (
          <div className="text-center text-gray-600 text-xs py-8 border border-dashed border-[#2a2a2a] rounded-xl">
            Arrasta um lead aqui
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[#2a2a2a]">
          <h2 className="font-black text-lg">Novo Lead Manual</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Nome</label>
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="João Silva"
                className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00c17c]"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Telefone *</label>
              <input
                required
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="351912345678"
                className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00c17c]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Tipo de Trabalho</label>
              <select
                value={form.q1_tipo_trabalho}
                onChange={e => set('q1_tipo_trabalho', e.target.value)}
                className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00c17c]"
              >
                <option value="interior">Interior</option>
                <option value="exterior">Exterior</option>
                <option value="ambos">Ambos</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Área (m²)</label>
              <input
                type="number"
                value={form.q3_area_m2}
                onChange={e => set('q3_area_m2', e.target.value)}
                placeholder="80"
                className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00c17c]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Divisões</label>
            <input
              value={form.q2_divisoes}
              onChange={e => set('q2_divisoes', e.target.value)}
              placeholder="2 quartos, sala, cozinha"
              className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00c17c]"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Prazo</label>
            <select
              value={form.q9_prazo}
              onChange={e => set('q9_prazo', e.target.value)}
              className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00c17c]"
            >
              <option value="urgente">Esta semana</option>
              <option value="normal">Este mês</option>
              <option value="sem_pressa">Sem pressa</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'q4_cor_escura', label: 'Cor escura' },
              { key: 'q5_fissuras', label: 'Fissuras' },
              { key: 'q6_mobilias', label: 'Móveis a mover' },
              { key: 'q7_primer', label: 'Primário' },
              { key: 'q8_teto', label: 'Inclui teto' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(form as any)[key]}
                  onChange={e => set(key, e.target.checked)}
                  className="accent-[#00c17c]"
                />
                <span className="text-sm text-gray-300">{label}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Notas</label>
            <textarea
              value={form.q12_notas}
              onChange={e => set('q12_notas', e.target.value)}
              placeholder="Observações adicionais..."
              rows={2}
              className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00c17c] resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#00c17c] text-black font-bold py-3 rounded-xl text-sm"
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

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      {showModal && (
        <NovoLeadModal
          onClose={() => setShowModal(false)}
          onCreated={loadData}
        />
      )}

      {/* Header */}
      <div className="border-b border-[#2a2a2a] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">Faço<span className="text-[#00c17c]">Por</span>Ti</h1>
          <p className="text-gray-500 text-xs">Gestão de Orçamentos</p>
        </div>
        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-2xl font-black text-[#00c17c]">{totalLeads}</div>
            <div className="text-xs text-gray-500">Leads</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-[#6366f1]">{totalOrcamentos}</div>
            <div className="text-xs text-gray-500">Orçamentos</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-[#f59e0b]">{totalFechado}</div>
            <div className="text-xs text-gray-500">Fechados</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 bg-[#00c17c] text-black font-bold text-sm px-4 py-2 rounded-lg"
          >
            <Plus size={15} /> Novo Lead
          </button>
          <a href="/stats" className="flex items-center gap-1 bg-[#1e1e1e] border border-[#2a2a2a] text-sm px-4 py-2 rounded-lg hover:border-[#6366f1] transition-colors">
            <BarChart2 size={15} /> Stats
          </a>
          <a href="/config" className="bg-[#1e1e1e] border border-[#2a2a2a] text-sm px-4 py-2 rounded-lg hover:border-[#00c17c] transition-colors">
            ⚙️ Preços
          </a>
          <button onClick={loadData} className="bg-[#1e1e1e] border border-[#2a2a2a] text-sm px-4 py-2 rounded-lg hover:border-[#2a2a2a] transition-colors">
            ↻
          </button>
          <button onClick={handleLogout} className="flex items-center gap-1 text-gray-500 hover:text-white text-sm px-3 py-2 rounded-lg transition-colors">
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* Pipeline */}
      <div className="p-6">
        {loading ? (
          <div className="text-center text-gray-500 py-20">A carregar...</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
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
