'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Save, ArrowLeft } from 'lucide-react'

export default function ConfigPage() {
  const [professional, setProfessional] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('professionals').select('*').limit(1).single()
      .then(({ data }) => setProfessional(data))
  }, [])

  function handleChange(key: string, value: string) {
    setProfessional((prev: any) => ({ ...prev, [key]: parseFloat(value) || value }))
  }

  async function handleSave() {
    setSaving(true)
    await supabase.from('professionals').update(professional).eq('id', professional.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!professional) return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center text-gray-500">
      A carregar...
    </div>
  )

  const Field = ({ label, field, suffix = '€', desc = '' }: any) => (
    <div>
      <label className="block text-sm font-semibold text-gray-300 mb-1">{label}</label>
      {desc && <p className="text-xs text-gray-500 mb-2">{desc}</p>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.5"
          value={professional[field] || ''}
          onChange={e => handleChange(field, e.target.value)}
          className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm w-32 focus:outline-none focus:border-[#00c17c]"
        />
        <span className="text-gray-500 text-sm">{suffix}</span>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="border-b border-[#2a2a2a] px-6 py-4 flex items-center gap-4">
        <a href="/dashboard" className="text-gray-500 hover:text-white">
          <ArrowLeft size={20} />
        </a>
        <div>
          <h1 className="text-lg font-black">Configurar Pack de Preços</h1>
          <p className="text-gray-500 text-xs">Ajusta os teus preços base e extras</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-6 space-y-8">

        {/* Info */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-6">
          <h2 className="font-bold text-[#00c17c] mb-4">Dados do Profissional</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Nome</label>
              <input
                value={professional.name || ''}
                onChange={e => handleChange('name', e.target.value)}
                className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm w-full focus:outline-none focus:border-[#00c17c]"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">WhatsApp (com código país)</label>
              <input
                value={professional.phone || ''}
                onChange={e => handleChange('phone', e.target.value)}
                placeholder="351912345678"
                className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm w-full focus:outline-none focus:border-[#00c17c]"
              />
            </div>
          </div>
        </div>

        {/* Preços Base */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-6">
          <h2 className="font-bold text-[#00c17c] mb-4">Preços Base</h2>
          <div className="space-y-4">
            <Field label="Pintura Interior (paredes)" field="price_m2_walls" suffix="€/m²" />
            <Field label="Pintura de Teto" field="price_m2_ceiling" suffix="€/m²" />
            <Field label="Pintura Exterior" field="price_m2_exterior" suffix="€/m²" />
          </div>
        </div>

        {/* Extras */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-6">
          <h2 className="font-bold text-[#f59e0b] mb-4">Extras</h2>
          <div className="space-y-4">
            <Field
              label="Cor Escura (multiplicador)"
              field="extra_dark_color"
              suffix="× base"
              desc="Ex: 1.25 = +25% sobre o preço base"
            />
            <Field
              label="Tratamento de Fissuras"
              field="extra_cracks"
              suffix="€/m²"
            />
            <Field
              label="Deslocação de Móveis"
              field="extra_furniture_move"
              suffix="€/divisão"
            />
            <Field
              label="Aplicação de Primário"
              field="extra_primer"
              suffix="€/m²"
            />
          </div>
        </div>

        {/* Mínimo */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-6">
          <h2 className="font-bold text-gray-300 mb-4">Orçamento Mínimo</h2>
          <Field
            label="Valor mínimo de qualquer trabalho"
            field="min_quote"
            suffix="€"
            desc="Mesmo que o cálculo seja inferior, nunca cobras menos que isto."
          />
        </div>

        {/* Guardar */}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full flex items-center justify-center gap-2 font-bold py-4 rounded-xl transition-colors ${saved ? 'bg-[#10b981]' : 'bg-[#00c17c] hover:bg-[#00955e]'} text-black`}
        >
          <Save size={18} />
          {saving ? 'A guardar...' : saved ? '✓ Guardado!' : 'Guardar Configurações'}
        </button>

        <div className="bg-[#1a1a2e] border border-[#6366f133] rounded-xl p-4">
          <p className="text-xs text-gray-400">
            <strong className="text-[#6366f1]">Webhook URL:</strong><br />
            <code className="text-[#00c17c] text-xs break-all">
              {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/whatsapp
            </code>
            <br /><br />
            Cola este URL na tua Evolution API ou Twilio para receber mensagens WhatsApp.
          </p>
        </div>
      </div>
    </div>
  )
}
