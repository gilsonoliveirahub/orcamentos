'use client'

import { useState } from 'react'
import { X, Euro } from 'lucide-react'

// Pergunta obrigatória ao marcar um lead como "Fechado": ou um valor válido,
// ou a escolha explícita "Prefiro não indicar". Fechar/cancelar o modal não
// avança o estado — aborta a transição para "fechado" por completo.
export default function ClosedValueModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (valor: number | null) => void
  onCancel: () => void
}) {
  const [valor, setValor] = useState('')
  const parsed = parseFloat(valor)
  const isValid = valor.trim() !== '' && Number.isFinite(parsed) && parsed > 0

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm rounded-3xl" style={{ background: '#13152a', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between p-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="font-black text-lg text-white">Trabalho fechado</h2>
            <p className="text-sm text-gray-500">Qual foi o valor final?</p>
          </div>
          <button onClick={onCancel} className="text-gray-500 hover:text-white p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">
              Valor final acordado do trabalho (€)
            </label>
            <div className="relative">
              <Euro size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="number"
                min="0"
                step="0.01"
                autoFocus
                value={valor}
                onChange={e => setValor(e.target.value)}
                placeholder="850"
                className="w-full rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                style={{ background: '#0d0f1a', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </div>
          </div>

          <button
            onClick={() => onConfirm(parsed)}
            disabled={!isValid}
            className="w-full py-3.5 rounded-xl font-black text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: isValid ? 1 : 0.4 }}
          >
            Confirmar valor
          </button>

          <button
            onClick={() => onConfirm(null)}
            className="w-full py-3 rounded-xl font-semibold text-sm text-gray-400 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Prefiro não indicar
          </button>
        </div>
      </div>
    </div>
  )
}
