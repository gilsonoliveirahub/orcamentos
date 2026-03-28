'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Plus, X, CheckCircle, Clock, Briefcase, Euro, Calendar, ChevronLeft, FileText, Phone } from 'lucide-react'

const STATUS_OPTIONS = [
  { id: 'pendente',   label: 'Pendente',   color: '#fbbf24' },
  { id: 'aceite',     label: 'Aceite',     color: '#818cf8' },
  { id: 'em_curso',   label: 'Em Curso',   color: '#60a5fa' },
  { id: 'concluido',  label: 'Concluído',  color: '#34d399' },
  { id: 'cancelado',  label: 'Cancelado',  color: '#f87171' },
]

function statusInfo(s: string) {
  return STATUS_OPTIONS.find(o => o.id === s) || STATUS_OPTIONS[0]
}

export default function AcordosPage() {
  const router = useRouter()
  const [professional, setProfessional] = useState<any>(null)
  const [acordos, setAcordos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState('todos')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('professionals').select('*').eq('user_id', user.id).maybeSingle()
      if (!prof) { router.push('/login'); return }
      setProfessional(prof)
      await loadAcordos(prof.id)
    })
  }, [router])

  async function loadAcordos(profId: string) {
    const { data } = await supabase
      .from('agreements')
      .select('*')
      .eq('professional_id', profId)
      .order('created_at', { ascending: false })
    setAcordos(data || [])
    setLoading(false)
  }

  const filtered = filterStatus === 'todos' ? acordos : acordos.filter(a => a.status === filterStatus)

  const totalValor = acordos
    .filter(a => ['aceite', 'em_curso', 'concluido'].includes(a.status))
    .reduce((s, a) => s + (a.valor || 0), 0)

  const totalConcluido = acordos.filter(a => a.status === 'concluido').reduce((s, a) => s + (a.valor || 0), 0)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <div className="w-8 h-8 border-4 border-indigo-900 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      {showModal && professional && (
        <NovoAcordoModal
          professionalId={professional.id}
          onClose={() => setShowModal(false)}
          onCreated={() => { loadAcordos(professional.id); setShowModal(false) }}
        />
      )}

      {/* Header */}
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white transition-colors">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h1 className="font-black text-white text-lg">Acordos</h1>
              <p className="text-xs text-gray-600">Contratos com clientes</p>
            </div>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 text-white font-bold text-sm px-4 py-2.5 rounded-xl"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            <Plus size={15} /> Novo Acordo
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total acordos', value: acordos.length, color: '#818cf8', icon: <FileText size={16} /> },
            { label: 'Em carteira', value: `€${Math.round(totalValor)}`, color: '#c084fc', icon: <Euro size={16} /> },
            { label: 'Faturado', value: `€${Math.round(totalConcluido)}`, color: '#34d399', icon: <CheckCircle size={16} /> },
          ].map((k, i) => (
            <div key={i} className="rounded-2xl p-4" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2 mb-1" style={{ color: k.color }}>{k.icon}<span className="text-xs font-semibold">{k.label}</span></div>
              <div className="text-xl font-black text-white">{k.value}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {[{ id: 'todos', label: 'Todos', color: '#64748b' }, ...STATUS_OPTIONS].map(s => (
            <button key={s.id} onClick={() => setFilterStatus(s.id)}
              className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-full transition-all"
              style={filterStatus === s.id
                ? { background: s.color + '30', color: s.color, border: `1px solid ${s.color}50` }
                : { background: 'rgba(255,255,255,0.04)', color: '#475569', border: '1px solid rgba(255,255,255,0.06)' }}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500">Nenhum acordo {filterStatus !== 'todos' ? `com estado "${statusInfo(filterStatus).label}"` : 'registado'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(acordo => <AcordoCard key={acordo.id} acordo={acordo} onUpdate={() => loadAcordos(professional.id)} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function AcordoCard({ acordo, onUpdate }: { acordo: any; onUpdate: () => void }) {
  const st = statusInfo(acordo.status)

  async function changeStatus(newStatus: string) {
    await supabase.from('agreements').update({ status: newStatus }).eq('id', acordo.id)
    onUpdate()
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="h-1" style={{ background: st.color }} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="font-black text-white">{acordo.client_name}</h3>
            {acordo.client_phone && (
              <a href={`https://wa.me/${acordo.client_phone}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs mt-0.5" style={{ color: '#25d366' }}>
                <Phone size={10} /> {acordo.client_phone}
              </a>
            )}
          </div>
          {acordo.valor && (
            <div className="text-right flex-shrink-0">
              <div className="text-xl font-black text-white">€{acordo.valor.toLocaleString('pt-PT')}</div>
            </div>
          )}
        </div>

        {acordo.descricao && (
          <p className="text-sm text-gray-400 mb-3">{acordo.descricao}</p>
        )}

        <div className="flex items-center gap-3 flex-wrap mb-3">
          {acordo.data_inicio && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar size={11} /> {new Date(acordo.data_inicio).toLocaleDateString('pt-PT')}
              {acordo.data_fim && <> → {new Date(acordo.data_fim).toLocaleDateString('pt-PT')}</>}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs" style={{ color: st.color }}>
            <Clock size={11} /> {new Date(acordo.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
          </span>
        </div>

        {/* Mudar estado */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.filter(s => s.id !== acordo.status).map(s => (
            <button key={s.id} onClick={() => changeStatus(s.id)}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
              style={{ background: s.color + '15', color: s.color, border: `1px solid ${s.color}30` }}>
              → {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function NovoAcordoModal({ professionalId, onClose, onCreated }: { professionalId: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    client_name: '', client_phone: '', descricao: '', valor: '',
    status: 'pendente', data_inicio: '', data_fim: '', notas: '',
  })
  const [saving, setSaving] = useState(false)

  function set(k: string, v: string) { setForm(prev => ({ ...prev, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('agreements').insert({
      professional_id: professionalId,
      client_name: form.client_name,
      client_phone: form.client_phone || null,
      descricao: form.descricao || null,
      valor: form.valor ? parseFloat(form.valor) : null,
      status: form.status,
      data_inicio: form.data_inicio || null,
      data_fim: form.data_fim || null,
      notas: form.notas || null,
    })
    setSaving(false)
    onCreated()
  }

  const inp = "w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
  const ist = { background: '#0d0f1a', border: '1px solid rgba(255,255,255,0.08)' }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl" style={{ background: '#13152a', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between p-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="font-black text-xl text-white">Novo Acordo</h2>
            <p className="text-sm text-gray-500">Registar contrato com cliente</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Nome do Cliente *</label>
              <input required value={form.client_name} onChange={e => set('client_name', e.target.value)}
                placeholder="Maria Santos" className={inp} style={ist} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">WhatsApp</label>
              <input value={form.client_phone} onChange={e => set('client_phone', e.target.value)}
                placeholder="351912345678" className={inp} style={ist} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Descrição do trabalho</label>
            <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)}
              placeholder="Pintura interior de 3 divisões, ~60m²..."
              rows={3} className={inp} style={ist} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Valor (€)</label>
              <input type="number" value={form.valor} onChange={e => set('valor', e.target.value)}
                placeholder="850" className={inp} style={ist} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Estado</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inp} style={ist}>
                {STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Data início</label>
              <input type="date" value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} className={inp} style={ist} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Data fim</label>
              <input type="date" value={form.data_fim} onChange={e => set('data_fim', e.target.value)} className={inp} style={ist} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Notas internas</label>
            <textarea value={form.notas} onChange={e => set('notas', e.target.value)}
              placeholder="Só visível para si..."
              rows={2} className={inp} style={ist} />
          </div>

          <button type="submit" disabled={saving}
            className="w-full py-3.5 rounded-xl font-black text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'A guardar...' : 'Guardar Acordo'}
          </button>
        </form>
      </div>
    </div>
  )
}
