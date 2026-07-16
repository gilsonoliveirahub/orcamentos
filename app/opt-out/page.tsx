'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

export default function OptOutPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const professionalId = searchParams.get('id')
    const token = searchParams.get('token')

    if (!professionalId || !token) {
      startTransition(() => {
        setStatus('error')
        setError('Link inválido ou incompleto.')
      })
      return
    }

    fetch('/api/opt-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professional_id: professionalId, token }),
    })
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao processar pedido')
        setStatus('success')
      })
      .catch(err => {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Falha ao processar pedido')
      })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#0a0c1a' }}>
      <div className="w-full max-w-md text-center rounded-2xl p-8" style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href="/" className="text-xl font-semibold text-white mb-8 inline-block">
          Faço<span style={{ color: '#c9a84c' }}>PorTi</span>
        </Link>

        {status === 'loading' && (
          <div className="py-6">
            <Loader2 className="animate-spin text-indigo-500 mx-auto mb-4" size={32} />
            <p className="text-gray-400 text-sm">A processar o teu pedido...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="py-6">
            <CheckCircle2 className="text-emerald-400 mx-auto mb-4" size={40} />
            <h1 className="text-lg font-black text-white mb-2">Cancelado com sucesso</h1>
            <p className="text-gray-400 text-sm">
              Não vais receber mais emails promocionais da FaçoPorTi. Continuas a receber notificações sobre os teus leads e a tua conta.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="py-6">
            <XCircle className="text-red-400 mx-auto mb-4" size={40} />
            <h1 className="text-lg font-black text-white mb-2">Não foi possível processar</h1>
            <p className="text-gray-400 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
