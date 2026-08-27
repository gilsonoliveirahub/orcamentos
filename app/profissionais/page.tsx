'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, MapPin, Loader2, ArrowLeft, LocateFixed } from 'lucide-react'
import Link from 'next/link'
import { PROFESSIONS, SPECIALTY_LIST } from '@/lib/professions'
import { sortProfessionalsForRanking, type DistancesById, type ReliabilityScoresById } from '@/lib/professional-ranking'
import { professionalSpecialties } from '@/lib/professional-specialties'
import { geocodeZone, computeDistanceKm, formatDistanceKm, type Coordinates } from '@/lib/geo'
import ProfessionalCard from '@/components/ProfessionalCard'

const ZONAS = ['Todas as zonas', 'Lisboa', 'Porto', 'Setúbal', 'Braga', 'Aveiro', 'Coimbra', 'Faro', 'Évora']

type GeoStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable'

export default function ProfissionaisPage() {
  const [professionals, setProfessionals] = useState<any[]>([])
  const [scores, setScores] = useState<ReliabilityScoresById>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterSpec, setFilterSpec] = useState('Todos')
  const [filterZona, setFilterZona] = useState('Todas as zonas')
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle')
  const [myCoords, setMyCoords] = useState<Coordinates | null>(null)

  useEffect(() => {
    Promise.all([
      // Lista pública de profissionais ativos — via rota server-side (nunca
      // select('*') direto do browser com a chave anon, que expunha colunas
      // sensíveis por a policy RLS ser ao nível da linha, não da coluna).
      fetch('/api/professionals/public').then(r => r.ok ? r.json() : { professionals: [] }).catch(() => ({ professionals: [] })),
      // Score agregado de fiabilidade de processo (fecha/perde vs. abandona)
      // — endpoint público que nunca devolve dados de lead, só o número. Se
      // falhar, cai para o comportamento anterior (só plano + antiguidade),
      // nunca bloqueia a página.
      fetch('/api/professionals/reliability').then(r => r.ok ? r.json() : { scores: {} }).catch(() => ({ scores: {} })),
    ]).then(([{ professionals }, { scores }]) => {
      setProfessionals(professionals || [])
      setScores(scores || {})
      setLoading(false)
    })
  }, [])

  // "Perto de mim" — pede geolocalização do browser (normal, com fallback
  // total quando negada/indisponível: os filtros de zona/pesquisa já
  // existentes continuam a funcionar sozinhos). Nunca guarda a localização
  // em lado nenhum — só em estado do componente, só para ordenar esta
  // visita. Coordenadas dos profissionais nunca são exatas: continuam a
  // vir só da zona (texto), geocodificada aproximadamente (lib/geo.ts),
  // exatamente como já acontece no marketplace interno.
  function handleFindNearMe() {
    if (!('geolocation' in navigator)) { setGeoStatus('unavailable'); return }
    setGeoStatus('locating')
    navigator.geolocation.getCurrentPosition(
      pos => { setMyCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStatus('granted') },
      () => setGeoStatus('denied'),
      { timeout: 8000, maximumAge: 300000 }
    )
  }

  const distances: DistancesById | undefined = useMemo(() => {
    if (!myCoords) return undefined
    const map: DistancesById = {}
    for (const p of professionals) {
      map[p.id] = computeDistanceKm(myCoords, geocodeZone(p.zone))
    }
    return map
  }, [myCoords, professionals])

  const ranked = useMemo(
    () => sortProfessionalsForRanking(professionals, scores, distances),
    [professionals, scores, distances]
  )
  const visible = ranked.length > 20 && !myCoords ? ranked.slice(0, 20) : ranked

  const filtered = visible.filter(p => {
    const specs = professionalSpecialties(p)
    const matchSearch = !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.zone?.toLowerCase().includes(search.toLowerCase()) ||
      specs.some(s => s.toLowerCase().includes(search.toLowerCase()))
    const matchSpec = filterSpec === 'Todos' || specs.includes(filterSpec)
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

        {/* Pesquisa + perto de mim */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar por nome, zona ou serviço..."
              className="w-full rounded-2xl pl-10 pr-4 py-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>
          <button
            onClick={handleFindNearMe}
            disabled={geoStatus === 'locating'}
            title="Ordenar por profissionais mais próximos de ti"
            className="flex-shrink-0 flex items-center gap-1.5 px-4 rounded-2xl text-sm font-semibold transition-all"
            style={myCoords
              ? { background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }
              : { background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {geoStatus === 'locating' ? <Loader2 size={15} className="animate-spin" /> : <LocateFixed size={15} />}
            <span className="hidden sm:inline">{myCoords ? 'Perto de mim' : 'Perto de mim'}</span>
          </button>
        </div>
        {(geoStatus === 'denied' || geoStatus === 'unavailable') && (
          <p className="text-xs text-gray-500 -mt-2 mb-4">
            Não foi possível usar a tua localização — usa os filtros de zona abaixo.
          </p>
        )}

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
              <ProfessionalCard key={prof.id} prof={prof} distanceLabel={distances?.[prof.id] != null ? formatDistanceKm(distances[prof.id] as number) : undefined} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
