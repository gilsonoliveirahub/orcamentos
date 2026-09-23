'use client'

import { useEffect, useState, useTransition } from 'react'
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
import { Phone, MessageCircle, Euro, User, LogOut, Plus, X, BarChart2, TrendingUp, CheckCircle, ChevronRight, Link2, Lock, Unlock, Menu, ShoppingCart, GripVertical, Star, Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getCycleWindow, PERSONAL_LINK_PLAN_LIMITS } from '@/lib/personal-link-limits-shared'
import { getEffectivePlan, isPaidEffective } from '@/lib/effective-plan'
import ClosedValueModal from '@/components/ClosedValueModal'
import { isAbandonedLead } from '@/lib/reliability'
import { shouldShowStaleLeadsReminder } from '@/lib/stale-leads-reminder'
import { getLeadSpecialty } from '@/lib/professions'

const STALE_REMINDER_DISMISSED_KEY = 'facoporti_stale_leads_reminder_dismissed_at'

const COLUMNS = [
  { id: 'novo',        label: 'Novo',        desc: 'Pedidos novos, ainda por avaliar.',        color: '#818cf8', bg: 'rgba(129,140,248,0.12)' },
  { id: 'qualificado', label: 'Qualificado', desc: 'Pedidos válidos, prontos para avançar.',    color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  { id: 'visita',      label: 'Visita',      desc: 'Visita ou avaliação agendada.',             color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  { id: 'proposta',    label: 'Proposta',    desc: 'Orçamento enviado, a aguardar decisão.',    color: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
  { id: 'fechado',     label: 'Fechado',     desc: 'Valor do orçamento fechado.',                color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  { id: 'perdido',     label: 'Perdido',     desc: 'Pedidos que não avançaram.',                 color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
]

// Ordem "linha a linha" dos 6 estados na grelha 3 colunas × 2 linhas: 1ª
// linha Novo/Visita/Fechado, 2ª linha Qualificado/Proposta/Perdido — colocada
// assim (em vez de "3 colunas, cada uma com os 2 estados empilhados") para
// que a grelha CSS alinhe a MESMA altura dentro de cada linha (comportamento
// nativo do grid: cada item estica até à altura do mais alto da sua linha).
// "concluido" fica de fora de propósito: não é um estado do pipeline em que
// se arrasta o cartão, só se chega lá pela confirmação explícita em
// /leads/[id] (ver CompleteJobModal) — por isso tem a sua própria secção de
// largura total mais abaixo, sempre depois das 2 linhas, nunca misturada.
const BOARD_ORDER = ['novo', 'visita', 'fechado', 'qualificado', 'proposta', 'perdido']

function LeadCard({ lead, quote, onClick, onUnlock, onStatusChange, isPaid, personalQuotaExhausted }: { lead: any; quote: any; onClick: () => void; onUnlock: () => void; onStatusChange: (leadId: string, status: string) => void; isPaid: boolean; personalQuotaExhausted?: boolean }) {
  const router = useRouter()
  const isPlanLocked = !isPaid
  const isMarketplaceLocked = !isPlanLocked && lead.locked && lead.source === 'marketplace'
  // Lead do link pessoal ainda não aberto, com a quota do ciclo esgotada —
  // fica visível mas bloqueado até ao próximo ciclo (a decisão real é
  // sempre feita no servidor no momento de abrir, isto é só a indicação
  // visual antecipada).
  const isQuotaLocked = !isPlanLocked && lead.source !== 'marketplace' && !lead.opened_at && !!personalQuotaExhausted
  const isLocked = isPlanLocked || isMarketplaceLocked || isQuotaLocked
  // Um lead bloqueado não deve poder ser arrastado — nunca fazia sentido
  // mudar de estado algo que ainda nem se consegue ver.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id, disabled: isLocked })

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 999, opacity: 0.9 }
    : {}

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: isLocked ? '#f4f4f6' : '#ffffff',
        border: isLocked ? '1px solid rgba(220,38,38,0.25)' : '1px solid rgba(15,23,42,0.08)',
        boxShadow: isDragging ? '0 25px 50px rgba(0,0,0,0.35)' : '0 1px 3px rgba(15,23,42,0.12)',
      }}
      onClick={isLocked ? undefined : onClick}
      className={`group relative rounded-2xl p-4 transition-all select-none ${
        isDragging ? 'shadow-2xl scale-105' : isLocked ? 'cursor-default' : 'cursor-pointer hover:translate-y-[-2px] hover:shadow-xl'
      }`}
    >
      {/* Badge marketplace */}
      {lead.source === 'marketplace' && (
        <div className="flex items-center gap-1 mb-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{ background: isLocked ? 'rgba(220,38,38,0.1)' : 'rgba(201,168,76,0.15)', color: isLocked ? '#dc2626' : '#92730f' }}>
            {isLocked ? <Lock size={9} /> : <Unlock size={9} />}
            {isLocked ? 'Bloqueado' : 'Marketplace'}
          </span>
        </div>
      )}

      {/* Avatar + nome */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
            style={{ background: isLocked ? '#9ca3af' : 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            {isLocked ? <Lock size={14} /> : (lead.name || '?')[0].toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-sm leading-tight" style={{ color: '#0f172a' }}>
              {isLocked ? '••••••••' : (lead.name || 'Sem nome')}
            </div>
            <div className="text-xs flex items-center gap-1 mt-0.5" style={{ color: '#64748b' }}>
              <Phone size={9} /> {isLocked ? '•••••••••' : lead.phone}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Handle de arrastar — só no desktop. Isolar aqui (em vez do
              cartão inteiro) evita que arrastar um dedo para fazer scroll
              horizontal no telemóvel seja interpretado como início de drag;
              em telemóvel a mudança de estado passa pelo select abaixo. */}
          {!isLocked && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              onClick={e => e.stopPropagation()}
              aria-label="Arrastar para mudar estado"
              className="hidden md:flex items-center justify-center w-6 h-6 rounded-lg transition-colors cursor-grab active:cursor-grabbing"
              style={{ color: '#94a3b8' }}
            >
              <GripVertical size={14} />
            </button>
          )}
          {!isLocked && <ChevronRight size={14} className="transition-colors" style={{ color: '#94a3b8' }} />}
        </div>
      </div>

      {/* Tags */}
      {(lead.metadata?._service_specialty || lead.q1_tipo_trabalho || lead.q3_area_m2) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {lead.metadata?._service_specialty && (
            <span className="text-xs px-2 py-0.5 rounded-lg font-medium"
              style={{ background: 'rgba(139,92,246,0.12)', color: '#6d28d9' }}>
              {lead.metadata._service_specialty}
            </span>
          )}
          {lead.q1_tipo_trabalho && (
            <span className="text-xs px-2 py-0.5 rounded-lg font-medium capitalize"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#4338ca' }}>
              {lead.q1_tipo_trabalho}
            </span>
          )}
          {lead.q3_area_m2 && (
            <span className="text-xs px-2 py-0.5 rounded-lg font-medium"
              style={{ background: 'rgba(96,165,250,0.15)', color: '#1d4ed8' }}>
              {lead.q3_area_m2} m²
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid rgba(15,23,42,0.08)' }}>
        {isLocked ? (
          isPlanLocked ? (
            <button
              onClick={e => { e.stopPropagation(); router.push('/upgrade') }}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-black py-2 rounded-xl transition-colors"
              style={{ background: 'rgba(99,102,241,0.1)', color: '#4338ca', border: '1px solid rgba(99,102,241,0.25)' }}
            >
              <Lock size={11} /> Ativar plano para ver
            </button>
          ) : isQuotaLocked ? (
            <div className="w-full flex items-center justify-center gap-1.5 text-xs font-black py-2 rounded-xl"
              style={{ background: 'rgba(100,116,139,0.1)', color: '#475569', border: '1px solid rgba(100,116,139,0.25)' }}
            >
              <Lock size={11} /> Limite do ciclo atingido
            </div>
          ) : (
          <button
            onClick={e => { e.stopPropagation(); onUnlock() }}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-black py-2 rounded-xl transition-colors"
            style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.25)' }}
          >
            <Unlock size={11} /> Desbloquear (1 crédito)
          </button>
          )
        ) : quote ? (
          <>
            <span className="text-xs" style={{ color: '#64748b' }}>Orçamento</span>
            <span className="text-sm font-black" style={{ color: '#059669' }}>
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
              style={{ background: 'rgba(37,211,102,0.12)', color: '#16803c' }}
            >
              <MessageCircle size={11} /> WhatsApp
            </a>
            <button
              onClick={async (e) => {
                e.stopPropagation()
                // Antes: `lead.q3_area_m2 ? generate : estimate` — critério
                // frágil que só funcionava por acaso (só Pintura preenche
                // q3_area_m2) e divergia do critério real usado em
                // app/leads/[id]/page.tsx. Unificado: a especialidade
                // realmente pedida pelo cliente decide sempre a rota,
                // nunca um campo legacy usado como proxy.
                const specialty = getLeadSpecialty(lead)
                const endpoint = specialty === 'Pintura' ? '/api/quote/generate' : '/api/quote/estimate'
                await fetch(endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ lead_id: lead.id }),
                })
                window.location.reload()
              }}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#4338ca' }}
            >
              + Orçamento
            </button>
            <span className="text-xs" style={{ color: '#94a3b8' }}>
              {new Date(lead.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
            </span>
          </>
        )}
      </div>

      {/* Controlo explícito de estado — só no telemóvel. Não obriga a
          arrastar; usa exatamente a mesma função de mudança de estado do
          drag-and-drop (ver changeLeadStatus em Dashboard), nunca duplicada. */}
      {!isLocked && (
        <select
          value={lead.status}
          onClick={e => e.stopPropagation()}
          onChange={e => { e.stopPropagation(); onStatusChange(lead.id, e.target.value) }}
          className="md:hidden w-full mt-3 text-xs font-semibold rounded-xl px-3 py-2"
          style={{ background: '#f8fafc', color: '#0f172a', border: '1px solid rgba(15,23,42,0.1)' }}
        >
          {COLUMNS.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      )}
    </div>
  )
}

// Máximo de cartões visíveis por estado antes de precisar de "Ver todos" —
// sem isto, um estado com muitos pedidos esticava a caixa inteira (e, por
// estarem todas na mesma linha da grelha, arrastava consigo as outras duas
// caixas da linha, com muito espaço vazio lá dentro). 2 (não 4): mesmo 4
// cartões já deixava as caixas mais curtas da mesma linha com uma área
// escura vazia grande a mais — 2 mantém a linha compacta em qualquer
// combinação. Lista completa só quando pedido explicitamente.
const MAX_VISIBLE_CARDS = 2

// Uma caixa por estado: contorno e brilho na cor do estado, título em texto
// claro (bem legível sobre o fundo escuro), descrição curta em mostarda —
// dentro, a lista de pedidos em cartões brancos com texto escuro (LeadCard).
// O estado vazio é deliberadamente compacto (uma linha), nunca uma caixa
// alta e vazia. As 3 caixas de cada linha da grelha (ver render em
// Dashboard) ficam com a MESMA altura por definição do CSS Grid (stretch é o
// comportamento por omissão) — nunca precisa de cálculo manual.
function Column({ id, label, desc, color, bg, leads, quotes, onCardClick, onUnlock, onStatusChange, isPaid, personalQuotaExhausted }: any) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const colLeads = leads.filter((l: any) => l.status === id)
  const [expanded, setExpanded] = useState(false)
  const hasMore = colLeads.length > MAX_VISIBLE_CARDS
  const visibleLeads = expanded ? colLeads : colLeads.slice(0, MAX_VISIBLE_CARDS)

  return (
    <div
      ref={setNodeRef}
      className="w-full h-full flex flex-col rounded-2xl p-3.5 transition-all"
      style={{
        background: '#12141f',
        border: `2px solid ${color}`,
        boxShadow: isOver ? `0 0 0 3px ${color}40` : 'none',
      }}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        <span className="font-bold text-sm" style={{ color: '#f1f5f9' }}>{label}</span>
        <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-lg flex-shrink-0"
          style={{ background: bg, color }}>
          {colLeads.length}
        </span>
      </div>
      {desc && <p className="text-xs mb-3 pl-4" style={{ color: '#c9a84c' }}>{desc}</p>}

      <div className="flex flex-col gap-2.5">
        {visibleLeads.map((lead: any) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            quote={quotes.find((q: any) => q.lead_id === lead.id)}
            onClick={() => onCardClick(lead.id)}
            onUnlock={() => onUnlock(lead.id)}
            onStatusChange={onStatusChange}
            isPaid={isPaid}
            personalQuotaExhausted={personalQuotaExhausted}
          />
        ))}
        {colLeads.length === 0 && (
          <div className="rounded-xl py-3 text-center text-xs font-semibold"
            style={{ background: 'rgba(255,255,255,0.03)', border: `1px dashed ${color}50`, color: '#64748b' }}>
            Sem pedidos neste estado
          </div>
        )}
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="text-xs font-bold py-2 rounded-xl transition-colors"
            style={{ background: `${color}15`, color }}
          >
            {expanded ? 'Ver menos' : `Ver todos (${colLeads.length})`}
          </button>
        )}
      </div>
    </div>
  )
}

// Cartão da secção "Concluído" — deliberadamente não arrastável (ao
// contrário de LeadCard): reabrir um trabalho concluído não passa por
// drag-and-drop, só pela ação explícita em /leads/[id]. Mostra sempre os
// dois factos separados: quando foi concluído pelo profissional e se já há
// opinião do cliente — nunca apresenta um como se fosse o outro.
function ConcludedLeadCard({ lead, review, onClick }: { lead: any; review: any; onClick: () => void }) {
  // Primeira foto real enviada pelo cliente (se houver) — nunca um
  // placeholder genérico. metadata.media_urls é o campo novo; q11_fotos_url
  // é o legacy, ainda usado nalguns leads antigos.
  const photos: string[] = Array.isArray(lead.metadata?.media_urls) ? lead.metadata.media_urls : (lead.q11_fotos_url || [])
  const isVideoUrl = (url: string) => /\.(mp4|mov|webm)$/i.test(url)
  const thumb = photos.find(u => u && !isVideoUrl(u))

  return (
    <div
      onClick={onClick}
      className="rounded-2xl p-3.5 cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-lg select-none flex items-center gap-3"
      style={{ background: '#ffffff', border: '1px solid rgba(52,211,153,0.3)' }}
    >
      {thumb ? (
        <img src={thumb} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" style={{ border: '1px solid rgba(15,23,42,0.08)' }} />
      ) : (
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #34d399, #059669)' }}>
          {(lead.name || '?')[0].toUpperCase()}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="font-bold text-sm leading-tight truncate" style={{ color: '#0f172a' }}>{lead.name || 'Sem nome'}</div>
          <CheckCircle size={13} style={{ color: '#059669' }} className="flex-shrink-0" />
        </div>
        <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>
          {lead.concluido_at ? `Concluído ${new Date(lead.concluido_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}` : 'Concluído'}
        </div>

        {review ? (
          <div className="flex items-center gap-0.5 mt-1.5">
            {[1, 2, 3, 4, 5].map(n => (
              <Star key={n} size={11} fill={review.rating >= n ? '#f59e0b' : 'none'} style={{ color: review.rating >= n ? '#f59e0b' : '#d1d5db' }} />
            ))}
            <span className="text-xs ml-1" style={{ color: '#059669' }}>Opinião recebida</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 mt-1.5 text-xs" style={{ color: '#94a3b8' }}>
            <Clock size={11} /> A aguardar opinião
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
  const [error, setError] = useState('')

  function set(key: string, value: any) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/leads/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      // Sem esta verificação, uma falha no servidor fechava o modal na mesma
      // e o profissional perdia os dados que acabou de escrever, sem aviso.
      if (!res.ok) throw new Error()
      onCreated()
      onClose()
    } catch {
      setError('Não foi possível criar o lead. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
  const inputStyle = { background: '#0d0f1a', border: '1px solid rgba(255,255,255,0.08)' }

  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
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

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              { key: 'q4_cor_escura', label: 'Mudança de cor' },
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

          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
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
  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [professional, setProfessional] = useState<any>(null)
  const [subStatus, setSubStatus] = useState<{ plan: string | null; cycle: 'monthly' | 'annual' | null; status: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [closingLeadId, setClosingLeadId] = useState<string | null>(null)
  const [staleReminderDismissedAt, setStaleReminderDismissedAt] = useState<number | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STALE_REMINDER_DISMISSED_KEY) : null
    setStaleReminderDismissedAt(stored ? Number(stored) : null)
  }, [])

  function dismissStaleReminder() {
    const now = Date.now()
    localStorage.setItem(STALE_REMINDER_DISMISSED_KEY, String(now))
    setStaleReminderDismissedAt(now)
  }
  const router = useRouter()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const [, startTransition] = useTransition()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    // dashboard_leads() (RPC) devolve só o resumo — nome/telefone/email/
    // notas/fotos só vêm preenchidos para leads já autorizados (abertos, ou
    // adquiridos no marketplace). O cliente Supabase já nem consegue pedir
    // essas colunas diretamente a leads (ver REVOKE em
    // supabase/migration_marketplace_v3_atomic.sql).
    const [{ data: leadsData }, { data: quotesData }, { data: profData }] = await Promise.all([
      supabase.rpc('dashboard_leads'),
      supabase.from('quotes').select('*').order('created_at', { ascending: false }),
      user ? supabase.from('professionals').select('id, slug, name, marketplace_credits, plan, trial_ends_at, current_period_start, current_period_end').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const sortedLeads = [...(leadsData || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setLeads(sortedLeads)
    setQuotes(quotesData || [])
    setProfessional(profData)
    // Indicação compacta do plano (2026-09-19) — ciclo/estado vêm sempre
    // desta leitura real ao Stripe, nunca de professionals.plan sozinho
    // (mesma rota usada por app/upgrade e app/perfil). GET sem parâmetros
    // de propósito — o servidor resolve o profissional só pela sessão.
    if (profData) {
      fetch('/api/stripe/subscription-status')
        .then(res => res.json()).then(json => { if (json && !json.error) setSubStatus(json) }).catch(() => {})
      // Opiniões dos clientes (para a secção "Concluído") — reviews tem
      // policy de leitura pública (reviews_select_all), por isso o cliente
      // Supabase do browser já consegue ler diretamente, sem rota própria.
      supabase.from('reviews').select('lead_id, rating, comment, client_name, created_at').eq('professional_id', profData.id)
        .then(({ data, error }) => { if (!error) setReviews(data || []) })
    }
    setLoading(false)
  }

  useEffect(() => { startTransition(() => { loadData() }) }, [])

  function copyLink() {
    if (!professional?.slug) return
    const url = `${window.location.origin}/p/${professional.slug}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleUnlock(leadId: string) {
    const res = await fetch('/api/leads/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    })
    if (res.ok) {
      loadData()
    } else {
      const { error } = await res.json()
      if (error === 'Sem créditos') {
        router.push('/creditos')
      }
    }
  }

  // Única função de mudança de estado — usada tanto pelo drag-and-drop
  // (desktop) como pelo select explícito (telemóvel), para nunca duplicar
  // esta lógica em dois sítios.
  async function changeLeadStatus(leadId: string, newStatus: string) {
    if (!COLUMNS.find(c => c.id === newStatus)) return
    const previousStatus = leads.find(l => l.id === leadId)?.status
    if (previousStatus === newStatus) return
    // "Fechado" exige decidir o valor final primeiro — não move o card nem
    // chama a API já; só depois de confirmado no modal (ver handleConfirmClose).
    if (newStatus === 'fechado') { setClosingLeadId(leadId); return }
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l))
    setActionError('')
    const res = await fetch('/api/leads/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, status: newStatus }),
    })
    if (!res.ok) {
      // Reverte a mudança otimista — sem isto o quadro continuava a mostrar
      // um estado (ex: "Proposta") que nunca chegou a ser gravado, e as
      // Stats acabavam por não bater certo com o que o profissional via aqui.
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: previousStatus } : l))
      setActionError('Não foi possível mover o pedido. Tente novamente.')
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    await changeLeadStatus(active.id as string, over.id as string)
  }

  async function handleConfirmClose(valor: number | null) {
    const leadId = closingLeadId
    setClosingLeadId(null)
    if (!leadId) return
    const previousStatus = leads.find(l => l.id === leadId)?.status
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: 'fechado' } : l))
    setActionError('')
    const res = await fetch('/api/leads/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: leadId,
        status: 'fechado',
        valor_fechado: valor,
        valor_fechado_decision: valor === null ? 'nao_informar' : 'informado',
      }),
    })
    if (!res.ok) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: previousStatus } : l))
      setActionError('Não foi possível fechar o pedido. Tente novamente.')
    }
  }

  // Secção "Concluído" — trabalhos marcados como concluídos pelo
  // profissional (ver app/leads/[id]/page.tsx), com a opinião do cliente
  // associada quando já existir (reviews_select_all é pública, ver loadData).
  const concludedLeads = leads.filter(l => l.status === 'concluido')
  const reviewsByLead = Object.fromEntries(reviews.map((r: any) => [r.lead_id, r]))

  const totalFechado = leads.filter(l => l.status === 'fechado').length
  const totalLeads = leads.length
  const totalOrcamentos = quotes.length

  // Quota de abertura de leads do link pessoal (10 Starter / 30 Pro por
  // ciclo, alinhado com o período de subscrição Stripe — fallback de mês
  // calendário só para contas sem subscrição, ex: ativadas manualmente) —
  // cálculo aproximado para a badge do card; a decisão real e atómica é
  // sempre feita no servidor em /api/leads/open no momento da abertura.
  const { start: cycleStart } = getCycleWindow({
    current_period_start: professional?.current_period_start ?? null,
    current_period_end: professional?.current_period_end ?? null,
  })
  const personalOpenedThisCycle = leads.filter(l =>
    l.source !== 'marketplace' && l.opened_at && new Date(l.opened_at) >= cycleStart
  ).length
  // Fonte de verdade única de permissões (lib/effective-plan.ts) — trial
  // ativo conta como Starter aqui, nunca como Pro; inactive nunca conta como
  // pago, mesmo tendo sido pago antes.
  const effectivePlan = getEffectivePlan({ plan: professional?.plan ?? null, trial_ends_at: professional?.trial_ends_at ?? null })
  const personalLimit = PERSONAL_LINK_PLAN_LIMITS[effectivePlan] ?? 0
  const personalQuotaExhausted = personalOpenedThisCycle >= personalLimit
  const faturacao = quotes
    .filter(q => leads.find(l => l.id === q.lead_id && l.status === 'fechado'))
    .reduce((sum, q) => sum + ((q.valor_min + q.valor_max) / 2), 0)
  const potencial = quotes
    .filter(q => leads.find(l => l.id === q.lead_id && l.status !== 'fechado' && l.status !== 'perdido'))
    .reduce((sum, q) => sum + ((q.valor_min + q.valor_max) / 2), 0)

  // Processos por finalizar: mesma definição já usada em Stats/fiabilidade
  // (lib/reliability.ts) — em aberto há mais de 30 dias, nunca fechado nem
  // perdido. Lembrete só, nunca bloqueia nem obriga a preencher nada.
  const staleLeadsCount = leads.filter(l => isAbandonedLead(l)).length
  const showStaleReminder = shouldShowStaleLeadsReminder({ staleCount: staleLeadsCount, dismissedAt: staleReminderDismissedAt })

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      {showModal && <NovoLeadModal onClose={() => setShowModal(false)} onCreated={loadData} />}
      {closingLeadId && (
        <ClosedValueModal onConfirm={handleConfirmClose} onCancel={() => setClosingLeadId(null)} />
      )}

      {/* Header — faixa branca de propósito (separação/luminosidade), ao
          contrário do resto do painel que fica escuro. Logo: símbolo da
          marca (public/icon-512.png), nunca substituído por um ícone
          genérico. */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid rgba(15,23,42,0.08)' }}>

        {/* Desktop header */}
        <div className="hidden md:flex px-6 py-3.5 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="/icon-512.png" alt="FaçoPorTi"
              className="w-12 h-12 rounded-2xl object-contain flex-shrink-0"
              style={{ border: '1px solid rgba(15,23,42,0.1)', boxShadow: '0 1px 4px rgba(15,23,42,0.12)' }} />
            <div>
              <h1 className="text-lg font-black" style={{ color: '#0f172a' }}>Faço<span style={{ color: '#ea580c' }}>Por</span>Ti</h1>
              <p className="text-xs" style={{ color: '#64748b' }}>Gestão de Orçamentos</p>
            </div>
          </div>

          {/* KPIs — fundo em tons de azul sólidos (não só a faixa fica
              branca), texto branco para contraste alto. */}
          <div className="flex items-center gap-2">
            {[
              { icon: <User size={13} />, value: totalLeads, label: 'Leads', bg: '#4f46e5' },
              { icon: <TrendingUp size={13} />, value: totalOrcamentos, label: 'Orçamentos', bg: '#2563eb' },
              { icon: <CheckCircle size={13} />, value: totalFechado, label: 'Fechados', bg: '#0284c7' },
              ...(faturacao > 0 ? [{ icon: <Euro size={13} />, value: `€${Math.round(faturacao)}`, label: 'Faturado', bg: '#0369a1' }] : []),
            ].map((kpi, i) => (
              <div key={i} className="flex items-center gap-2.5 px-4 py-2 rounded-xl"
                style={{ background: kpi.bg }}>
                <span className="text-white">{kpi.icon}</span>
                <div>
                  <div className="text-base font-black leading-tight text-white">{kpi.value}</div>
                  <div className="text-xs leading-tight text-white/80">{kpi.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions — mesmos tons de azul sólidos que os KPIs, para se
              distinguirem claramente da faixa branca; "Novo Lead" continua o
              botão mais destacado (gradiente + sombra, único não-flat). */}
          <div className="flex items-center gap-2">
            {professional?.slug && (
              <button onClick={copyLink}
                className="flex items-center gap-1.5 text-sm font-bold px-3 py-2.5 rounded-xl transition-all text-white"
                style={{ background: copied ? '#059669' : '#2563eb' }}>
                <Link2 size={14} /> {copied ? 'Copiado!' : 'Meu Link'}
              </button>
            )}
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.4)' }}>
              <Plus size={15} /> Novo Lead
            </button>
            <a href="/marketplace"
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors text-white"
              style={{ background: '#2563eb' }}>
              <ShoppingCart size={14} /> Marketplace
            </a>
            <a href="/acordos"
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors text-white"
              style={{ background: '#2563eb' }}>
              📋 Acordos
            </a>
            <a href="/stats"
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors text-white"
              style={{ background: '#2563eb' }}>
              <BarChart2 size={14} /> Stats
            </a>
            <a href="/config"
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors text-white"
              style={{ background: '#2563eb' }}>
              ⚙️ Preços
            </a>
            <button onClick={loadData}
              className="text-sm px-3 py-2.5 rounded-xl transition-colors text-white"
              style={{ background: '#2563eb' }}>
              ↻
            </button>
            <a href="/perfil"
              className="px-3 py-2.5 rounded-xl transition-colors text-white"
              style={{ background: '#2563eb' }}>
              👤
            </a>
            <button onClick={handleLogout}
              className="px-3 py-2.5 rounded-xl transition-colors"
              style={{ color: '#64748b' }}>
              <LogOut size={15} />
            </button>
          </div>
        </div>

        {/* Mobile header */}
        <div className="flex md:hidden px-4 py-2.5 items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/icon-512.png" alt="FaçoPorTi"
              className="w-10 h-10 rounded-xl object-contain flex-shrink-0"
              style={{ border: '1px solid rgba(15,23,42,0.1)', boxShadow: '0 1px 3px rgba(15,23,42,0.12)' }} />
            <h1 className="text-base font-black" style={{ color: '#0f172a' }}>Faço<span style={{ color: '#ea580c' }}>Por</span>Ti</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 text-white font-bold text-xs px-3 py-2 rounded-xl"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <Plus size={13} /> Novo Lead
            </button>
            <button onClick={() => setMobileMenuOpen(o => !o)}
              className="p-2 rounded-xl text-white"
              style={{ background: '#2563eb' }}>
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden px-4 pb-4 flex flex-col gap-2" style={{ borderTop: '1px solid rgba(15,23,42,0.08)' }}>
            {/* KPIs — mesmo tratamento azul sólido/texto branco do desktop */}
            <div className="flex items-center gap-2 py-3 overflow-x-auto">
              {[
                { icon: <User size={12} />, value: totalLeads, label: 'Leads', bg: '#4f46e5' },
                { icon: <TrendingUp size={12} />, value: totalOrcamentos, label: 'Orçamentos', bg: '#2563eb' },
                { icon: <CheckCircle size={12} />, value: totalFechado, label: 'Fechados', bg: '#0284c7' },
                ...(faturacao > 0 ? [{ icon: <Euro size={12} />, value: `€${Math.round(faturacao)}`, label: 'Faturado', bg: '#0369a1' }] : []),
              ].map((kpi, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl flex-shrink-0"
                  style={{ background: kpi.bg }}>
                  <span className="text-white">{kpi.icon}</span>
                  <div>
                    <div className="text-sm font-black leading-tight text-white">{kpi.value}</div>
                    <div className="text-xs leading-tight text-white/80">{kpi.label}</div>
                  </div>
                </div>
              ))}
            </div>
            {/* Link */}
            {professional?.slug && (
              <button onClick={() => { copyLink(); setMobileMenuOpen(false) }}
                className="flex items-center gap-2 text-sm font-bold px-4 py-3 rounded-xl w-full text-white"
                style={{ background: copied ? '#059669' : '#2563eb' }}>
                <Link2 size={14} /> {copied ? 'Copiado!' : 'Copiar meu link'}
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <a href="/marketplace" className="flex items-center justify-center gap-2 text-sm font-semibold px-3 py-3 rounded-xl text-white"
                style={{ background: '#2563eb' }}>
                <ShoppingCart size={14} /> Marketplace
              </a>
              <a href="/acordos" className="flex items-center justify-center gap-2 text-sm font-semibold px-3 py-3 rounded-xl text-white"
                style={{ background: '#2563eb' }}>
                📋 Acordos
              </a>
              <a href="/stats" className="flex items-center justify-center gap-2 text-sm font-semibold px-3 py-3 rounded-xl text-white"
                style={{ background: '#2563eb' }}>
                <BarChart2 size={14} /> Stats
              </a>
              <a href="/config" className="flex items-center justify-center gap-2 text-sm font-semibold px-3 py-3 rounded-xl text-white"
                style={{ background: '#2563eb' }}>
                ⚙️ Preços
              </a>
              <a href="/perfil" className="flex items-center justify-center gap-2 text-sm font-semibold px-3 py-3 rounded-xl text-white"
                style={{ background: '#2563eb' }}>
                👤 Perfil
              </a>
            </div>
            <button onClick={handleLogout}
              className="flex items-center justify-center gap-2 text-sm px-3 py-3 rounded-xl"
              style={{ color: '#dc2626', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.15)' }}>
              <LogOut size={14} /> Sair da conta
            </button>
          </div>
        )}
      </div>

      {/* Banner trial — escondido para quem já subscreveu (Starter ou Pro),
          independentemente de trial_ends_at: uma vez pago, o trial deixa de
          ser relevante, mesmo que a data em si não mude. */}
      {professional?.trial_ends_at && professional?.plan !== 'pro' && professional?.plan !== 'starter' && (() => {
        const days = Math.max(0, Math.ceil((new Date(professional.trial_ends_at).getTime() - Date.now()) / 86400000))
        if (days > 3) return null
        return (
          <div className="mx-3 md:mx-6 mt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 py-3 rounded-xl"
            style={{ background: days === 0 ? 'rgba(239,68,68,0.08)' : 'rgba(201,168,76,0.08)', border: `1px solid ${days === 0 ? 'rgba(239,68,68,0.2)' : 'rgba(201,168,76,0.2)'}` }}>
            <span className="text-sm font-semibold" style={{ color: days === 0 ? '#f87171' : '#c9a84c' }}>
              {days === 0 ? '⚠️ Trial expirado — ativa um plano para continuar a receber pedidos pelo teu link pessoal' : `⚡ Trial (equivalente a Starter): ${days} dia${days !== 1 ? 's' : ''} restante${days !== 1 ? 's' : ''}`}
            </span>
            <a href="/upgrade" className="text-xs font-black px-3 py-1.5 rounded-lg transition-colors self-start sm:self-auto"
              style={{ background: days === 0 ? 'rgba(239,68,68,0.15)' : 'rgba(201,168,76,0.15)', color: days === 0 ? '#f87171' : '#c9a84c' }}>
              Upgrade →
            </a>
          </div>
        )
      })()}

      {/* Indicação compacta do plano (2026-09-19) — plan+cycle+status vêm de
          subStatus (leitura real ao Stripe), nunca de professional.plan
          sozinho. cycle null (sem subscrição identificável) mostra só o
          tier, sem inventar "Mensal"/"Anual". admin_access (acesso
          concedido de propósito, sem cobrança) tem o seu próprio texto —
          nunca aparece como "sem subscrição associada". */}
      {subStatus?.plan && (subStatus.plan === 'starter' || subStatus.plan === 'pro') && (
        <div className="mx-3 md:mx-6 mt-3">
          <a href="/upgrade" className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full transition-colors"
            style={subStatus.status === 'admin_access'
              ? { background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }
              : {
                background: subStatus.plan === 'pro' ? 'rgba(201,168,76,0.12)' : 'rgba(99,102,241,0.12)',
                color: subStatus.plan === 'pro' ? '#c9a84c' : '#818cf8',
                border: `1px solid ${subStatus.plan === 'pro' ? 'rgba(201,168,76,0.25)' : 'rgba(99,102,241,0.25)'}`,
              }}>
            {subStatus.status === 'admin_access'
              ? `Acesso administrativo · funcionalidades ${subStatus.plan === 'pro' ? 'Pro' : 'Starter'}`
              : `Plano ${subStatus.plan === 'pro' ? 'Pro' : 'Starter'}${subStatus.cycle ? ` · ${subStatus.cycle === 'annual' ? 'Anual' : 'Mensal'}` : ' · sem subscrição associada'}`}
          </a>
        </div>
      )}

      {/* Banner créditos marketplace */}
      {professional && (
        <div className="mx-3 md:mx-6 mt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-white">
              🏪 Créditos marketplace: <span style={{ color: '#c9a84c' }}>{professional.marketplace_credits ?? 0}</span>
            </span>
            <span className="text-xs text-gray-500">· leads que chegam pelo site</span>
          </div>
          <a href="/creditos" className="text-xs font-black px-4 py-2 rounded-lg transition-colors self-start sm:self-auto"
            style={{ background: '#c9a84c', color: '#000' }}>
            Comprar créditos
          </a>
        </div>
      )}

      {/* Potencial */}
      {potencial > 0 && (
        <div className="mx-3 md:mx-6 mt-3 px-4 py-3 rounded-xl flex items-center gap-3"
          style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
          <TrendingUp size={15} style={{ color: '#34d399' }} />
          <span className="text-sm font-semibold" style={{ color: '#34d399' }}>
            Potencial este mês: <span className="font-black">€{Math.round(potencial)}</span> em trabalhos
          </span>
        </div>
      )}

      {/* Erro ao mudar estado/fechar (drag-and-drop ou modal de fecho) */}
      {actionError && (
        <div className="mx-3 md:mx-6 mt-3 flex items-center justify-between gap-2 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <span className="text-sm" style={{ color: '#f87171' }}>{actionError}</span>
          <button onClick={() => setActionError('')} className="text-gray-500 hover:text-white transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Lembrete de processos por finalizar — nunca bloqueia, dispensável,
          com cooldown (lib/stale-leads-reminder.ts) para nunca ser excessivo. */}
      {showStaleReminder && (
        <div className="mx-3 md:mx-6 mt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}>
          <span className="text-sm text-gray-300">
            <span className="font-bold text-white">Tens {staleLeadsCount} processo{staleLeadsCount === 1 ? '' : 's'} por finalizar.</span>{' '}
            Mantém os teus trabalhos atualizados para teres estatísticas mais precisas sobre o desempenho do teu negócio.
          </span>
          <div className="flex items-center gap-3 flex-shrink-0 self-start sm:self-auto">
            <a href="/stats" className="text-xs font-black px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
              Ver Stats →
            </a>
            <button onClick={dismissStaleReminder} className="text-gray-500 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Pipeline */}
      <div className="p-3 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-indigo-900 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600 text-sm">A carregar...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Grelha 3 colunas × 2 linhas (1 coluna em telemóvel, sem scroll
                horizontal) — grid-auto-flow em ordem "linha a linha"
                (BOARD_ORDER) faz o CSS alinhar nativamente a mesma altura
                dentro de cada linha, mesmo que um estado tenha muito mais
                pedidos que os outros da mesma linha (ver MAX_VISIBLE_CARDS
                + "Ver todos" em Column, que evita essa caixa disparar). */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
                {BOARD_ORDER.map(id => {
                  const col = COLUMNS.find(c => c.id === id)!
                  return (
                    <Column key={col.id} {...col} leads={leads} quotes={quotes}
                      onCardClick={(leadId: string) => router.push(`/leads/${leadId}`)}
                      onUnlock={handleUnlock}
                      onStatusChange={changeLeadStatus}
                      isPaid={isPaidEffective(effectivePlan)}
                      personalQuotaExhausted={personalQuotaExhausted} />
                  )
                })}
              </div>
            </DndContext>

            {/* Concluído — largura total das 3 colunas, trabalhos marcados
                como concluídos + estado da opinião do cliente. Fora do
                DndContext de propósito: reabrir um trabalho concluído nunca
                passa por arrastar, só pela ação explícita em /leads/[id]. */}
            <div className="mt-4 rounded-2xl p-3.5" style={{ background: '#0f1e17', border: '2px solid #34d399' }}>
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
                <span className="font-bold text-sm" style={{ color: '#f1f5f9' }}>Concluído</span>
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>
                  {concludedLeads.length}
                </span>
              </div>
              <p className="text-xs mb-3 pl-4" style={{ color: '#c9a84c' }}>Trabalhos terminados pelo profissional.</p>

              {concludedLeads.length === 0 ? (
                <div className="rounded-xl py-3 text-center text-xs font-semibold"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(52,211,153,0.4)', color: '#64748b' }}>
                  Sem trabalhos concluídos ainda
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {concludedLeads.map(lead => (
                    <ConcludedLeadCard
                      key={lead.id}
                      lead={lead}
                      review={reviewsByLead[lead.id]}
                      onClick={() => router.push(`/leads/${lead.id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
