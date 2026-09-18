'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Save, ArrowLeft, CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getProfessionPricingType, getActiveSpecialties } from '@/lib/professions'
import {
  buildPricingIndex, resolveSpecialtyPricing, getSubservices,
  type SpecialtyPricing, type SubserviceDef,
} from '@/lib/professional-pricing'

// '' = linha geral da especialidade (fora de qualquer subserviço).
const WHOLE_SPECIALTY = ''

export default function ConfigPage() {
  const router = useRouter()
  const [professional, setProfessional] = useState<any>(null)
  const [specialties, setSpecialties] = useState<string[]>([])
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('')
  // P1 (2026-09-18, revisto para subserviços): preços por especialidade E
  // por subserviço — pricingDraft[especialidade][subserviço]. `''` é a linha
  // geral da especialidade (extras, min_quote, e o preço geral de fallback
  // para tipos de trabalho sem subserviço próprio). A linha geral vem
  // pré-preenchida com o legacy (professionals.*) para nunca mostrar campos
  // vazios a um profissional que já tinha preços configurados antes desta
  // funcionalidade existir; as linhas de subserviço começam vazias (nunca
  // existiu essa granularidade antes, não há nada de onde herdar).
  const [pricingDraft, setPricingDraft] = useState<Record<string, Record<string, SpecialtyPricing>>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('professionals').select('*').eq('user_id', user.id).maybeSingle()
      if (!data) { router.push('/login'); return }
      setProfessional(data)

      const active = getActiveSpecialties(data)
      setSpecialties(active)
      setSelectedSpecialty(active[0] || data.specialty || 'Pintura')

      // Tabela nova (P1) — pode ainda não existir em produção (migração por
      // aplicar). O Supabase nunca rejeita a promise nesse caso, devolve
      // {data: null, error: {...}} — cai simplesmente em "sem nenhuma linha
      // configurada", que já é o comportamento correto de compatibilidade
      // (usa o legacy abaixo). Nunca impede a página de carregar.
      const { data: pricingRows } = await supabase
        .from('professional_pricing')
        .select('*')
        .eq('professional_id', data.id)
      const pricingIndex = buildPricingIndex(pricingRows || [])

      const draft: Record<string, Record<string, SpecialtyPricing>> = {}
      for (const specialty of active.length > 0 ? active : [data.specialty || 'Pintura']) {
        draft[specialty] = {
          [WHOLE_SPECIALTY]: { ...resolveSpecialtyPricing(data, pricingIndex[specialty]) },
        }
        for (const sub of getSubservices(specialty)) {
          draft[specialty][sub.key] = { ...(pricingIndex[specialty]?.[sub.key] || {}) }
        }
      }
      setPricingDraft(draft)
    })
  }, [router])

  function handleProfessionalChange(key: string, value: string) {
    setProfessional((prev: any) => ({ ...prev, [key]: value }))
  }

  function handlePricingChange(sub: string, field: string, value: string) {
    setPricingDraft((prev) => ({
      ...prev,
      [selectedSpecialty]: {
        ...prev[selectedSpecialty],
        [sub]: { ...prev[selectedSpecialty]?.[sub], [field]: parseFloat(value) || null },
      },
    }))
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')

    // P0 (2026-09-18): antes disto, uma falha do UPDATE (ex: coluna
    // inexistente, RLS, rede) era ignorada em silêncio — o profissional via
    // sempre "Guardado!" mesmo quando nada foi gravado. Continua a valer
    // aqui: só mostra sucesso depois de confirmar que o Supabase não
    // devolveu erro em nenhuma das escritas.
    const { error: profError } = await supabase
      .from('professionals')
      .update({ name: professional.name, phone: professional.phone })
      .eq('id', professional.id)

    // Uma linha para a especialidade geral + uma por cada subserviço do
    // catálogo desta especialidade (mesmo vazia — o fallback campo-a-campo
    // em lib/professional-pricing.ts trata uma linha sem determinado campo
    // como "sem preço próprio nesse campo", nunca como zero).
    const subKeys = [WHOLE_SPECIALTY, ...getSubservices(selectedSpecialty).map(s => s.key)]
    const rows = subKeys.map((sub) => ({
      professional_id: professional.id,
      specialty: selectedSpecialty,
      subservico: sub,
      ...pricingDraft[selectedSpecialty]?.[sub],
    }))

    const { error: pricingError } = await supabase
      .from('professional_pricing')
      .upsert(rows, { onConflict: 'professional_id,specialty,subservico' })

    setSaving(false)
    if (profError || pricingError) {
      setSaveError('Não foi possível guardar. Tente novamente — se o problema persistir, contacte o suporte.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (!professional) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <div className="w-8 h-8 border-4 border-indigo-900 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )

  const profType = getProfessionPricingType(selectedSpecialty)
  const subservices = getSubservices(selectedSpecialty)
  const inp = "w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
  const ist = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }
  const card = { background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.07)' }

  const Field = ({ label, field, sub = WHOLE_SPECIALTY, suffix = '€', desc = '' }: any) => {
    const value = (pricingDraft[selectedSpecialty]?.[sub] || {})[field as keyof SpecialtyPricing]
    return (
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-1">{label}</label>
        {desc && <p className="text-xs text-gray-500 mb-2">{desc}</p>}
        <div className="flex items-center gap-3">
          <input
            type="number"
            step="0.5"
            value={value ?? ''}
            onChange={e => handlePricingChange(sub, field, e.target.value)}
            className="rounded-xl px-4 py-2.5 text-white text-sm w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            style={ist}
          />
          <span className="text-gray-500 text-sm">{suffix}</span>
        </div>
      </div>
    )
  }

  const unitField = (sub: SubserviceDef) =>
    sub.unit === 'hour' ? 'price_per_hour' : sub.unit === 'unit' ? 'price_per_unit' : 'price_per_m2'
  const unitSuffix = (sub: SubserviceDef) =>
    sub.unit === 'hour' ? '€/hora' : sub.unit === 'unit' ? '€/unidade' : '€/m²'

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-lg mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-black text-white">Configurações</h1>
            <p className="text-gray-500 text-xs">{selectedSpecialty} · Preços e dados</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-6 space-y-5">

        {/* Dados do profissional */}
        <div className="rounded-2xl p-5 space-y-4" style={card}>
          <h2 className="font-black text-white text-sm">Dados do Profissional</h2>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Nome</label>
            <input value={professional.name || ''} onChange={e => handleProfessionalChange('name', e.target.value)} className={inp} style={ist} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">WhatsApp</label>
            <input value={professional.phone || ''} onChange={e => handleProfessionalChange('phone', e.target.value)}
              placeholder="351912345678" className={inp} style={ist} />
          </div>
        </div>

        {/* P1/P3 (2026-09-18): seletor de especialidade — só aparece quando a
            conta tem mais de uma ativa. Cada especialidade tem a sua própria
            configuração de preços (e subserviços), guardada e carregada
            independentemente. Pintura e Pavimentos e Revestimentos, quando
            ambas ativas, aparecem aqui como duas opções distintas. */}
        {specialties.length > 1 && (
          <div className="rounded-2xl p-5 space-y-3" style={card}>
            <h2 className="font-black text-white text-sm">Especialidade a configurar</h2>
            <div className="flex flex-wrap gap-2">
              {specialties.map((specialty) => (
                <button
                  key={specialty}
                  onClick={() => setSelectedSpecialty(specialty)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={specialty === selectedSpecialty
                    ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}
                >
                  {specialty}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Subserviços — preço independente por parte do trabalho (ex:
            Pintura interior/exterior/tetos/portas e aros; chão flutuante/
            remoção de pavimento/rodapés). Só aparece para as especialidades
            com catálogo definido (ver SPECIALTY_SUBSERVICES). Sem preço
            próprio, cada subserviço usa o preço geral da especialidade
            abaixo — nunca o de outro subserviço. */}
        {subservices.length > 0 && (
          <div className="rounded-2xl p-5 space-y-4" style={card}>
            <h2 className="font-black text-white text-sm">Subserviços — {selectedSpecialty}</h2>
            <p className="text-xs text-gray-500">Preço independente para cada parte do trabalho. Sem preço definido aqui, usa o preço geral da especialidade, mais abaixo.</p>
            {subservices.map((sub, i) => (
              <div key={sub.key} className={i > 0 ? 'pt-4' : ''} style={i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.06)' } : undefined}>
                <Field label={sub.label} field={unitField(sub)} sub={sub.key} suffix={unitSuffix(sub)} />
              </div>
            ))}
          </div>
        )}

        {/* Preços — Pintura (linha geral: extras, aplicam-se independentemente
            do subserviço acima) */}
        {profType === 'pintura' && (
          <div className="rounded-2xl p-5 space-y-4" style={card}>
            <h2 className="font-black text-white text-sm">Extras — Pintura</h2>
            <Field label="Mudança de cor (multiplicador)" field="extra_dark_color" suffix="× paredes" desc="Ex: 1.10 = +10% só sobre o valor das paredes (branco↔cor), nunca sobre tetos" />
            <Field label="Tratamento de fissuras" field="extra_cracks" suffix="€/m²" />
            <Field label="Deslocação de móveis" field="extra_furniture_move" suffix="€/divisão" />
            <Field label="Aplicação de primário" field="extra_primer" suffix="€/m²" />
          </div>
        )}

        {/* Preços — Profissões por hora (Canalização, Electricidade, Limpeza, etc.) */}
        {profType === 'hourly' && (
          <div className="rounded-2xl p-5 space-y-4" style={card}>
            <h2 className="font-black text-white text-sm">Preços — {selectedSpecialty}</h2>
            <Field label="Preço por hora" field="price_per_hour" suffix="€/hora" />
            <Field label="Taxa de deslocação" field="travel_cost" suffix="€" desc="Custo fixo por visita/deslocação (opcional)" />
          </div>
        )}

        {/* Preços — Profissões por m² (Remodelação, Pavimentos, Estuque, Jardinagem).
            Para especialidades com subserviços (Pavimentos e Revestimentos),
            isto é o preço GERAL — usado quando o trabalho pedido não bate com
            nenhum dos subserviços listados acima (ex: soalho, cerâmica). */}
        {profType === 'm2' && (
          <div className="rounded-2xl p-5 space-y-4" style={card}>
            <h2 className="font-black text-white text-sm">
              {subservices.length > 0 ? `Preço geral — ${selectedSpecialty}` : `Preços — ${selectedSpecialty}`}
            </h2>
            {subservices.length > 0 && (
              <p className="text-xs text-gray-500">Usado para trabalhos desta especialidade sem subserviço próprio configurado acima.</p>
            )}
            <Field label="Preço por m²" field="price_per_m2" suffix="€/m²" />
            <Field label="Preço por hora" field="price_per_hour" suffix="€/hora" desc="Para trabalhos sem área definida (opcional)" />
          </div>
        )}

        {/* Preços — Profissões personalizadas / outras */}
        {profType === 'generic' && (
          <div className="rounded-2xl p-5 space-y-4" style={card}>
            <h2 className="font-black text-white text-sm">Preços — {selectedSpecialty}</h2>
            <p className="text-xs text-gray-500">Define os teus preços base para que os orçamentos sejam calculados automaticamente.</p>
            <Field label="Preço por hora" field="price_per_hour" suffix="€/hora" />
          </div>
        )}

        {/* Orçamento mínimo — por especialidade (aplica-se a qualquer
            subserviço dela, não é possível ter um mínimo diferente por
            subserviço nesta versão) */}
        <div className="rounded-2xl p-5" style={card}>
          <h2 className="font-black text-white text-sm mb-4">Orçamento Mínimo — {selectedSpecialty}</h2>
          <Field label="Valor mínimo por trabalho" field="min_quote" suffix="€"
            desc="Mesmo que o cálculo seja inferior, nunca cobras menos que isto nesta especialidade." />
        </div>

        {/* Webhook info */}
        <div className="rounded-2xl p-4" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <p className="text-xs font-semibold text-indigo-400 mb-1">Webhook WhatsApp</p>
          <code className="text-xs text-gray-400 break-all">
            {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/whatsapp
          </code>
          <p className="text-xs text-gray-600 mt-1">Cola este URL na Evolution API ou Twilio</p>
        </div>

        {/* Erro ao guardar — nunca esconder uma falha atrás de "Guardado!" */}
        {saveError && (
          <div className="rounded-2xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-sm" style={{ color: '#f87171' }}>{saveError}</p>
          </div>
        )}

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
