'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, MapPin, Briefcase, Star, ChevronRight, Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { PROFESSIONS, SPECIALTY_LIST } from '@/lib/professions'

const ZONAS = ['Todas as zonas', 'Lisboa', 'Porto', 'Setúbal', 'Braga', 'Aveiro', 'Coimbra', 'Faro', 'Évora']

export default function ProfissionaisPage() {
  const [professionals, setProfessionals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterSpec, setFilterSpec] = useState('Todos')
  const [filterZona, setFilterZona] = useState('Todas as zonas')

  useEffect(() => {
    supabase
      .from('professionals')
      .select('*')
      .eq('active', true)
      .then(({ data }) => {
        const all = data || []
        const planScore = (plan: string) => plan === 'pro' ? 3 : plan === 'starter' ? 2 : 1
        const sorted = [...all].sort((a, b) => {
          const diff = planScore(b.plan) - planScore(a.plan)
          if (diff !== 0) return diff
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        })
        setProfessionals(all.length > 20 ? sorted.slice(0, 20) : sorted)
        setLoading(false)
      })
  }, [])

  const filtered = professionals.filter(p => {
    const matchSearch = !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.zone?.toLowerCase().includes(search.toLowerCase()) ||
      p.specialty?.toLowerCase().includes(search.toLowerCase())
    const matchSpec = filterSpec === 'Todos' || p.specialty === filterSpec
    const matchZona = filterZona === 'Todas as zonas' || p.zone?.toLowerCase().includes(filterZona.toLowerCase())
    return matchSearch && matchSpec && matchZona
  })

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>

      {/* Header */}
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/" className="text-gray-500 hover:text-gray-300 transition-colors">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-2xl font-black text-white">Encontrar Profissional</h1>
          </div>
          <p className="text-gray-500 text-sm ml-7">
            {loading ? '...' : `${filtered.length} profissional${filtered.length !== 1 ? 'is' : ''} disponível${filtered.length !== 1 ? 'is' : ''}`}
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">

        {/* Pesquisa */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar por nome, zona ou serviço..."
            className="w-full rounded-2xl pl-10 pr-4 py-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
        </div>

        {/* Grid de profissões */}
        <div className="grid grid-cols-5 sm:grid-cols-9 gap-2 mb-4">
          <button
            onClick={() => setFilterSpec('Todos')}
            className="flex flex-col items-center gap-1 py-3 px-1 rounded-2xl transition-all"
            style={filterSpec === 'Todos'
              ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }
              : { background: 'rgba(255,255,255,0.05)', color: '#64748b', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-xl">🔍</span>
            <span className="text-xs font-semibold">Todos</span>
          </button>
          {SPECIALTY_LIST.map(s => (
            <button
              key={s}
              onClick={() => setFilterSpec(s)}
              className="flex flex-col items-center gap-1 py-3 px-1 rounded-2xl transition-all"
              style={filterSpec === s
                ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }
                : { background: 'rgba(255,255,255,0.05)', color: '#64748b', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span className="text-xl">{PROFESSIONS[s].emoji}</span>
              <span className="text-xs font-semibold leading-tight">{s.length > 8 ? s.slice(0, 7) + '…' : s}</span>
            </button>
          ))}
        </div>

        {/* Filtro de zona */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6" style={{ scrollbarWidth: 'none' }}>
          {ZONAS.map(z => (
            <button
              key={z}
              onClick={() => setFilterZona(z)}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full transition-all"
              style={filterZona === z
                ? { background: 'rgba(201,168,76,0.15)', color: '#c9a84c', border: '1px solid rgba(201,168,76,0.3)' }
                : { background: 'rgba(255,255,255,0.05)', color: '#64748b', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {z !== 'Todas as zonas' && <MapPin size={10} />}
              {z}
            </button>
          ))}
        </div>

        {/* Resultados */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-indigo-500" size={28} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="text-white font-bold mb-2">Nenhum profissional encontrado</h2>
            <p className="text-gray-500 text-sm mb-6">Tente alterar os filtros ou a zona de pesquisa.</p>
            <button
              onClick={() => { setFilterSpec('Todos'); setFilterZona('Todas as zonas'); setSearch('') }}
              className="text-sm font-semibold px-5 py-2.5 rounded-xl"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
            >
              Limpar filtros
            </button>
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
  const emoji = PROFESSIONS[prof.specialty]?.emoji || '🔧'

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all hover:-translate-y-0.5"
      style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="p-5">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-black text-white text-lg leading-tight">{prof.name}</h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Star size={13} className="text-amber-400" fill="currentColor" />
                <span className="text-sm font-bold text-amber-400">5.0</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}
              >
                <Briefcase size={10} /> {prof.specialty}
              </span>
              {prof.zone && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <MapPin size={10} /> {prof.zone}
                </span>
              )}
            </div>
            {prof.bio && (
              <p className="text-xs text-gray-500 mt-1.5 line-clamp-1">{prof.bio}</p>
            )}
          </div>
        </div>
        <Link
          href={`/p/${prof.slug}`}
          className="flex items-center justify-center gap-2 w-full mt-4 py-3 rounded-xl font-bold text-white text-sm"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.25)' }}
        >
          Pedir Orçamento <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  )
}
