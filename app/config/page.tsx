'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Save, ArrowLeft, CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

const HOURLY_PROFESSIONS = ['Canalização', 'Electricidade', 'Limpeza', 'Ar Condicionado', 'Mudanças', 'Carpintaria']
const M2_PROFESSIONS = ['Remodelação', 'Pavimentos de Madeira', 'Estuque e Pladur', 'Jardinagem']

function getProfessionType(specialty: string) {
  if (specialty === 'Pintura') return 'pintura'
  if (HOURLY_PROFESSIONS.includes(specialty)) return 'hourly'
  if (M2_PROFESSIONS.includes(specialty)) return 'm2'
  return 'generic' // profissões personalizadas
}

export default function ConfigPage() {
  const router = useRouter()
  const [professional, setProfessional] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('professionals').select('*').eq('user_id', user.id).maybeSingle()
      if (!data) { router.push('/login'); return }
      setProfessional(data)
    })
  }, [router])

  function handleChange(key: string, value: string) {
    setProfessional((prev: any) => ({ ...prev, [key]: parseFloat(value) || value }))
  }

  async function handleSave() {
    setSaving(true)
    await supabase.from('professionals').update(professional).eq('id', professional.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (!professional) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <div className="w-8 h-8 border-4 border-indigo-900 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )

  const profType = getProfessionType(professional.specialty)
  const inp = "w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
  const ist = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }
  const card = { background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.07)' }

  const Field = ({ label, field, suffix = '€', desc = '' }: any) => (
    <div>
      <label className="block text-sm font-semibold text-gray-300 mb-1">{label}</label>
      {desc && <p className="text-xs text-gray-500 mb-2">{desc}</p>}
      <div className="flex items-center gap-3">
        <input
          type="number"
          step="0.5"
          value={professional[field] ?? ''}
          onChange={e => handleChange(field, e.target.value)}
          className="rounded-xl px-4 py-2.5 text-white text-sm w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          style={ist}
        />
        <span className="text-gray-500 text-sm">{suffix}</span>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-lg mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-black text-white">Configurações</h1>
            <p className="text-gray-500 text-xs">{professional.specialty} · Preços e dados</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-6 space-y-5">

        {/* Dados do profissional */}
        <div className="rounded-2xl p-5 space-y-4" style={card}>
          <h2 className="font-black text-white text-sm">Dados do Profissional</h2>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Nome</label>
            <input value={professional.name || ''} onChange={e => handleChange('name', e.target.value)} className={inp} style={ist} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">WhatsApp</label>
            <input value={professional.phone || ''} onChange={e => handleChange('phone', e.target.value)}
              placeholder="351912345678" className={inp} style={ist} />
          </div>
        </div>

        {/* Preços — Pintura */}
        {profType === 'pintura' && (
          <>
            <div className="rounded-2xl p-5 space-y-4" style={card}>
              <h2 className="font-black text-white text-sm">Preços Base — Pintura</h2>
              <Field label="Pintura interior (paredes)" field="price_m2_walls" suffix="€/m²" />
              <Field label="Pintura de teto" field="price_m2_ceiling" suffix="€/m²" />
              <Field label="Pintura exterior" field="price_m2_exterior" suffix="€/m²" />
            </div>
            <div className="rounded-2xl p-5 space-y-4" style={card}>
              <h2 className="font-black text-white text-sm">Extras</h2>
              <Field label="Cor escura (multiplicador)" field="extra_dark_color" suffix="× base" desc="Ex: 1.25 = +25% sobre o preço base" />
              <Field label="Tratamento de fissuras" field="extra_cracks" suffix="€/m²" />
              <Field label="Deslocação de móveis" field="extra_furniture_move" suffix="€/divisão" />
              <Field label="Aplicação de primário" field="extra_primer" suffix="€/m²" />
            </div>
          </>
        )}

        {/* Preços — Profissões por hora (Canalização, Electricidade, Limpeza, etc.) */}
        {profType === 'hourly' && (
          <div className="rounded-2xl p-5 space-y-4" style={card}>
            <h2 className="font-black text-white text-sm">Preços — {professional.specialty}</h2>
            <Field label="Preço por hora" field="price_per_hour" suffix="€/hora" />
            <Field label="Taxa de deslocação" field="travel_cost" suffix="€" desc="Custo fixo por visita/deslocação (opcional)" />
          </div>
        )}

        {/* Preços — Profissões por m² (Remodelação, Pavimentos, Estuque, Jardinagem) */}
        {profType === 'm2' && (
          <div className="rounded-2xl p-5 space-y-4" style={card}>
            <h2 className="font-black text-white text-sm">Preços — {professional.specialty}</h2>
            <Field label="Preço por m²" field="price_per_m2" suffix="€/m²" />
            <Field label="Preço por hora" field="price_per_hour" suffix="€/hora" desc="Para trabalhos sem área definida (opcional)" />
          </div>
        )}

        {/* Preços — Profissões personalizadas / outras */}
        {profType === 'generic' && (
          <div className="rounded-2xl p-5 space-y-4" style={card}>
            <h2 className="font-black text-white text-sm">Preços — {professional.specialty}</h2>
            <p className="text-xs text-gray-500">Define os teus preços base para que os orçamentos sejam calculados automaticamente.</p>
            <Field label="Preço por hora" field="price_per_hour" suffix="€/hora" />
          </div>
        )}

        {/* Orçamento mínimo — universal */}
        <div className="rounded-2xl p-5" style={card}>
          <h2 className="font-black text-white text-sm mb-4">Orçamento Mínimo</h2>
          <Field label="Valor mínimo por trabalho" field="min_quote" suffix="€"
            desc="Mesmo que o cálculo seja inferior, nunca cobras menos que isto." />
        </div>

        {/* Webhook info */}
        <div className="rounded-2xl p-4" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <p className="text-xs font-semibold text-indigo-400 mb-1">Webhook WhatsApp</p>
          <code className="text-xs text-gray-400 break-all">
            {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/whatsapp
          </code>
          <p className="text-xs text-gray-600 mt-1">Cola este URL na Evolution API ou Twilio</p>
        </div>

        {/* Guardar */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 font-black py-4 rounded-xl text-white transition-all"
          style={{ background: saved ? 'rgba(52,211,153,0.8)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: saving ? 0.7 : 1 }}
        >
          {saved ? <><CheckCircle size={16} /> Guardado!</> : saving ? 'A guardar...' : <><Save size={16} /> Guardar Configurações</>}
        </button>

      </div>
    </div>
  )
}
