'use client'

import { CheckCircle2, X } from 'lucide-react'

// Confirmação obrigatória antes de marcar um trabalho como concluído — o
// texto abaixo e o rótulo do botão são exatamente os pedidos: o profissional
// tem de perceber, antes de confirmar, que isto dispara um email ao cliente.
export default function CompleteJobModal({
  onConfirm,
  onCancel,
  submitting,
  mode = 'complete',
}: {
  onConfirm: () => void
  onCancel: () => void
  submitting?: boolean
  mode?: 'complete' | 'resend'
}) {
  const isResend = mode === 'resend'
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm rounded-3xl" style={{ background: '#13152a', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between p-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-black text-lg text-white">{isResend ? 'Reenviar pedido de opinião' : 'Marcar como concluído'}</h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-white p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm text-gray-300 leading-relaxed">
            {isResend
              ? 'O FaçoPorTi vai voltar a enviar ao cliente o email a pedir a sua opinião sobre o serviço.'
              : 'Ao marcar este trabalho como concluído, o FaçoPorTi enviará automaticamente um email ao cliente a pedir a sua opinião sobre o serviço.'}
          </p>

          <button
            onClick={onConfirm}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #34d399, #059669)', opacity: submitting ? 0.6 : 1 }}
          >
            <CheckCircle2 size={18} />
            {submitting ? 'A enviar...' : isResend ? 'Reenviar pedido de opinião' : 'Concluir e enviar pedido de opinião'}
          </button>

          <button
            onClick={onCancel}
            disabled={submitting}
            className="w-full py-3 rounded-xl font-semibold text-sm text-gray-400 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
