'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronRight, ChevronLeft, MapPin, Star, Briefcase, Loader2, Search } from 'lucide-react'
import Link from 'next/link'
import { PROFESSIONS, SPECIALTY_LIST } from '@/lib/professions'

const ZONAS = ['Lisboa', 'Porto', 'Setúbal', 'Braga', 'Aveiro', 'Coimbra', 'Faro', 'Évora', 'Outra / Toda Portugal']

export default function PedirPage() {
  const [step, setStep] = useState<'profissao' | 'zona' | 'resultados'>('profissao')
  const [specialty, setSpecialty] = useState('')
  const [zona, setZona] = useState('')
  const [professionals, setProfessionals] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  async function search(spec: string, z: string) {
    setLoading(true)
    let query = supabase.from('professionals').select('*').eq('active', true).eq('specialty', spec)
    if (z && z !== 'Outra / Toda Portugal') {
      query = query.ilike('zone', `%${z}%`)
    }
    const { data } = await query.order('created_at', { ascending: false })

    // Se não há resultados na zona, mostra todos da especialidade
    if (!data || data.length === 0) {
      const { data: all } = await supabase
        .from('professionals')
        .select('*')
        .eq('active', true)
        .eq('specialty', spec)
        .order('created_at', { ascending: false })
      setProfessionals(all || [])
    } else {
      setProfessionals(data)
    }
    setLoading(false)
    setStep('resultados')
  }

  function selectProfissao(s: string) {
    setSpecialty(s)
    setStep('zona')
  }

  function selectZona(z: string) {
    setZona(z)
    search(specialty, z)
  }

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>

      {/* Header */}
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-lg mx-auto px-6 py-5 flex items-center gap-3">
          {step !== 'profissao' && (
            <button
              onClick={() => setStep(step === 'resultados' ? 'zona' : 'profissao')}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <div>
            <h1 className="text-xl font-black text-white">
              {step === 'profissao' && 'De que serviço precisa?'}
              {step === 'zona' && `${PROFESSIONS[specialty]?.emoji} ${specialty}`}
              {step === 'resultados' && `Profissionais de ${specialty}`}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {step === 'profissao' && 'Escolha o tipo de trabalho'}
              {step === 'zona' && 'Em que zona?'}
              {step === 'resultados' && (zona && zona !== 'Outra / Toda Portugal' ? `Zona: ${zona}` : 'Toda Portugal')}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8">

        {/* Passo 1 — Escolher profissão */}
        {step === 'profissao' && (
          <div className="grid grid-cols-2 gap-3">
            {SPECIALTY_LIST.map(s => (
              <button
                key={s}
                onClick={() => selectProfissao(s)}
                className="flex items-center gap-4 p-5 rounded-2xl text-left transition-all hover:-translate-y-0.5"
                style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <span className="text-3xl flex-shrink-0">{PROFESSIONS[s].emoji}</span>
                <div>
                  <div className="font-black text-white text-sm">{s}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {PROFESSIONS[s].questions.length} perguntas
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Passo 2 — Escolher zona */}
        {step === 'zona' && (
          <div className="space-y-3">
            {ZONAS.map(z => (
              <button
                key={z}
                onClick={() => selectZona(z)}
                className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl text-left transition-all hover:-translate-y-0.5"
                style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <MapPin size={16} className="text-indigo-400 flex-shrink-0" />
                <span className="font-semibold text-white">{z}</span>
                <ChevronRight size={16} className="text-gray-600 ml-auto" />
              </button>
            ))}
          </div>
        )}

        {/* Passo 3 — Resultados */}
        {step === 'resultados' && (
          <>
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-indigo-500" size={28} />
              </div>
            ) : professionals.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">😕</div>
                <h2 className="text-white font-bold mb-2">Ainda sem profissionais aqui</h2>
                <p className="text-gray-500 text-sm mb-6">
                  Ainda não temos profissionais de {specialty} nesta zona. Experimente outra zona.
                </p>
                <button
                  onClick={() => setStep('zona')}
                  className="text-sm font-semibold px-5 py-3 rounded-xl"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
                >
                  Mudar zona
                </button>
              </div>
            ) : (
              <>
                {zona && zona !== 'Outra / Toda Portugal' && professionals.some(p => !p.zone?.toLowerCase().includes(zona.toLowerCase())) && (
                  <div
                    className="flex items-center gap-2 p-3 rounded-xl mb-4 text-xs"
                    style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)', color: '#fbbf24' }}
                  >
                    <Search size={13} />
                    Não encontrámos profissionais em {zona}. A mostrar todos os disponíveis.
                  </div>
                )}
                <div className="grid gap-4">
                  {professionals.map(prof => (
                    <ResultCard key={prof.id} prof={prof} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

      </div>
    </div>
  )
}

function ResultCard({ prof }: { prof: any }) {
  const emoji = PROFESSIONS[prof.specialty]?.emoji || '🔧'

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all hover:-translate-y-0.5"
      style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="p-5">
        <div className="flex items-center gap-4 mb-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-white">{prof.name}</h3>
              <div className="flex items-center gap-1">
                <Star size={12} className="text-amber-400" fill="currentColor" />
                <span className="text-xs font-bold text-amber-400">5.0</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-xs" style={{ color: '#818cf8' }}>
                <Briefcase size={10} /> {prof.specialty}
              </span>
              {prof.zone && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <MapPin size={10} /> {prof.zone}
                </span>
              )}
            </div>
          </div>
        </div>
        <Link
          href={`/p/${prof.slug}`}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-black text-white text-sm"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.3)' }}
        >
          Pedir Orçamento <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  )
}
