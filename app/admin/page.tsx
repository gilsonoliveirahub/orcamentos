'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Users, FileText, Euro, TrendingUp, CheckCircle, LogOut, ToggleLeft, ToggleRight, ChevronRight, Loader2, Shield } from 'lucide-react'

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [professionals, setProfessionals] = useState<any[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [quotes, setQuotes] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }

      // Verificar se é admin
      const { data: admin } = await supabase.from('admins').select('id').eq('user_id', user.id).maybeSingle()
      if (!admin) { router.push('/dashboard'); return }

      // Carregar todos os dados
      const [{ data: profs }, { data: leadsData }, { data: quotesData }] = await Promise.all([
        supabase.from('professionals').select('*').order('created_at', { ascending: false }),
        supabase.from('leads').select('*, professionals(name)').order('created_at', { ascending: false }),
        supabase.from('quotes').select('*'),
      ])

      setProfessionals(profs || [])
      setLeads(leadsData || [])
      setQuotes(quotesData || [])
      setLoading(false)
    })
  }, [router])

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('professionals').update({ active: !current }).eq('id', id)
    setProfessionals(prev => prev.map(p => p.id === id ? { ...p, active: !current } : p))
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  )

  const totalFaturacao = quotes.reduce((s, q) => s + ((q.valor_min + q.valor_max) / 2 || 0), 0)
  const leadsHoje = leads.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length
  const profActivos = professionals.filter(p => p.active).length

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      {/* Header */}
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
              <Shield size={18} className="text-white" />
            </div>
            <div>
              <h1 className="font-black text-white">Admin</h1>
              <p className="text-xs text-gray-600">FaçoPorTi — Painel de controlo</p>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* KPIs globais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: <Users size={18} />, value: profActivos, label: 'Profissionais activos', color: '#818cf8' },
            { icon: <FileText size={18} />, value: leads.length, label: 'Total leads', color: '#c084fc' },
            { icon: <TrendingUp size={18} />, value: leadsHoje, label: 'Leads hoje', color: '#60a5fa' },
            { icon: <Euro size={18} />, value: `€${Math.round(totalFaturacao)}`, label: 'Valor orçamentos', color: '#34d399' },
          ].map((k, i) => (
            <div key={i} className="rounded-2xl p-5" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2 mb-2" style={{ color: k.color }}>
                {k.icon}
                <span className="text-xs font-semibold text-gray-500">{k.label}</span>
              </div>
              <div className="text-2xl font-black text-white">{k.value}</div>
            </div>
          ))}
        </div>

        {/* Profissionais */}
        <div className="mb-8">
          <h2 className="text-lg font-black text-white mb-4">Profissionais ({professionals.length})</h2>
          <div className="rounded-2xl overflow-hidden" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
            {professionals.length === 0 ? (
              <p className="text-gray-500 text-sm p-6">Nenhum profissional registado.</p>
            ) : professionals.map((prof, i) => {
              const profLeads = leads.filter(l => l.professional_id === prof.id)
              const profQuotes = quotes.filter(q => q.professional_id === prof.id)
              return (
                <div key={prof.id} className="flex items-center gap-4 px-5 py-4"
                  style={{ borderBottom: i < professionals.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                    {prof.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm">{prof.name}</div>
                    <div className="text-xs text-gray-500">{prof.email} · {prof.specialty} {prof.zone ? `· ${prof.zone}` : ''}</div>
                  </div>
                  <div className="hidden md:flex items-center gap-4 text-xs text-gray-500">
                    <span>{profLeads.length} leads</span>
                    <span>{profQuotes.length} orçamentos</span>
                    <a href={`/p/${prof.slug}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-indigo-400 transition-colors">
                      /p/{prof.slug} <ChevronRight size={12} />
                    </a>
                  </div>
                  <button onClick={() => toggleActive(prof.id, prof.active)}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
                    style={prof.active
                      ? { background: 'rgba(52,211,153,0.15)', color: '#34d399' }
                      : { background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>
                    {prof.active ? <><ToggleRight size={14} /> Activo</> : <><ToggleLeft size={14} /> Inactivo</>}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Últimos leads */}
        <div>
          <h2 className="text-lg font-black text-white mb-4">Últimos leads</h2>
          <div className="rounded-2xl overflow-hidden" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
            {leads.slice(0, 20).map((lead, i) => (
              <div key={lead.id} className="flex items-center gap-4 px-5 py-3"
                style={{ borderBottom: i < Math.min(leads.length, 20) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-sm">{lead.name || 'Sem nome'}</div>
                  <div className="text-xs text-gray-500">{lead.professionals?.name} · {lead.q1_tipo_trabalho || '—'} {lead.q3_area_m2 ? `· ${lead.q3_area_m2}m²` : ''}</div>
                </div>
                <div className="text-xs text-gray-600">
                  {new Date(lead.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-lg"
                  style={{
                    background: lead.status === 'fechado' ? 'rgba(52,211,153,0.15)' : 'rgba(129,140,248,0.15)',
                    color: lead.status === 'fechado' ? '#34d399' : '#818cf8',
                  }}>
                  {lead.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
