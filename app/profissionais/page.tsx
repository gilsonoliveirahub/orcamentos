'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, MapPin, Briefcase, Star, ChevronRight, Loader2 } from 'lucide-react'
import Link from 'next/link'

const SPECIALTIES = ['Todos', 'Pintura', 'Limpeza', 'Electricidade', 'Canalização', 'Carpintaria', 'Jardinagem', 'Mudanças']

export default function ProfissionaisPage() {
  const [professionals, setProfessionals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Todos')

  useEffect(() => {
    supabase.from('professionals').select('*').eq('active', true).order('created_at', { ascending: false })
      .then(({ data }) => { setProfessionals(data || []); setLoading(false) })
  }, [])

  const filtered = professionals.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.zone?.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'Todos' || p.specialty === filter
    return matchSearch && matchFilter
  })

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      {/* Header */}
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-2xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-black text-white mb-1">Profissionais</h1>
          <p className="text-gray-500 text-sm">Encontre o profissional certo para o seu trabalho</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6">
        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar por nome ou zona..."
            className="w-full rounded-2xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          {SPECIALTIES.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className="flex-shrink-0 text-xs font-bold px-4 py-2 rounded-full transition-all"
              style={filter === s
                ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }
                : { background: 'rgba(255,255,255,0.05)', color: '#64748b', border: '1px solid rgba(255,255,255,0.06)' }}>
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-indigo-500" size={28} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-gray-500">Nenhum profissional encontrado</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map(prof => (
              <ProfCard key={prof.id} prof={prof} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ProfCard({ prof }: { prof: any }) {
  return (
    <div className="rounded-2xl overflow-hidden transition-transform hover:-translate-y-0.5"
      style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.3)' }}>
            {prof.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-white">{prof.name}</h3>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-xs" style={{ color: '#818cf8' }}>
                <Briefcase size={11} /> {prof.specialty}
              </span>
              {prof.zone && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <MapPin size={11} /> {prof.zone}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <Star size={11} fill="currentColor" /> 5.0
              </span>
            </div>
          </div>
        </div>

        <Link href={`/p/${prof.slug}`}
          className="flex items-center justify-center gap-2 w-full mt-4 py-3 rounded-xl font-bold text-white text-sm transition-all"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.3)' }}>
          Pedir Orçamento <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  )
}
