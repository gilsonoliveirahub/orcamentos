'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { MessageCircle, Clock, CheckCircle, Search, LogOut, User, ChevronRight, Star, MapPin, Briefcase, Loader2 } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  novo: 'Novo',
  qualificado: 'Qualificado',
  visita: 'Visita',
  proposta: 'Proposta',
  fechado: 'Fechado',
  perdido: 'Perdido',
}

const STATUS_COLOR: Record<string, string> = {
  novo: '#6366f1',
  qualificado: '#3b82f6',
  visita: '#f59e0b',
  proposta: '#8b5cf6',
  fechado: '#22c55e',
  perdido: '#ef4444',
}

export default function ClienteDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [client, setClient] = useState<any>(null)
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)

      // Buscar dados do cliente
      const { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!clientData) { router.push('/login'); return }
      setClient(clientData)

      // Buscar pedidos do cliente pelo telefone ou user_id
      const { data: leadsData } = await supabase
        .from('leads')
        .select('*, professionals(name, specialty, phone, zone)')
        .eq('phone', clientData.phone)
        .order('created_at', { ascending: false })

      setLeads(leadsData || [])
      setLoading(false)
    })
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      {/* Header */}
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-lg mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              {client?.name?.[0] || <User size={18} />}
            </div>
            <div>
              <div className="font-bold text-white text-sm">{client?.name}</div>
              <div className="text-xs text-gray-500">Portal do Cliente</div>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-black text-white">Os meus pedidos</h1>
          <p className="text-gray-500 text-sm mt-1">{leads.length} pedido{leads.length !== 1 ? 's' : ''} encontrado{leads.length !== 1 ? 's' : ''}</p>
        </div>

        {leads.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <Search size={24} className="text-indigo-400" />
            </div>
            <h2 className="text-white font-bold mb-2">Nenhum pedido ainda</h2>
            <p className="text-gray-500 text-sm mb-6">Visite a página de um profissional para pedir um orçamento.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {leads.map(lead => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function LeadCard({ lead }: { lead: any }) {
  const prof = lead.professionals
  const status = lead.status || 'novo'
  const color = STATUS_COLOR[status] || '#6366f1'
  const date = new Date(lead.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })

  const waText = encodeURIComponent(
    `Olá! 👋 Sou ${lead.name} e pedi um orçamento pelo FaçoPorTi. Pode dar-me feedback sobre o meu pedido?`
  )

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Status bar */}
      <div className="h-1" style={{ background: color }} />

      <div className="p-5">
        {/* Professional info */}
        {prof && (
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              {prof.name?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-sm">{prof.name}</div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1 text-xs" style={{ color: '#818cf8' }}>
                  <Briefcase size={10} /> {prof.specialty}
                </span>
                {prof.zone && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin size={10} /> {prof.zone}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <Star size={10} fill="currentColor" /> 5.0
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Status + date */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold px-3 py-1 rounded-full"
            style={{ background: `${color}20`, color }}>
            {STATUS_LABEL[status] || status}
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Clock size={11} /> {date}
          </span>
        </div>

        {/* Quote if exists */}
        {lead.q1_tipo_trabalho && (
          <div className="text-xs text-gray-400 mb-4">
            <span className="text-gray-600">Serviço: </span>{lead.q1_tipo_trabalho}
            {lead.q3_area_m2 && <> · <span className="text-gray-600">Área: </span>{lead.q3_area_m2}m²</>}
          </div>
        )}

        {/* CTA */}
        {prof?.phone && (
          <a href={`https://wa.me/${prof.phone}?text=${waText}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold text-white"
            style={{ background: '#25d36620', color: '#25d366', border: '1px solid #25d36630' }}>
            <MessageCircle size={16} />
            Falar com {prof.name?.split(' ')[0]}
          </a>
        )}
      </div>
    </div>
  )
}
