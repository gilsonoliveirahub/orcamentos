'use client'

import Link from 'next/link'
import { useEffect } from 'react'

// Sem isto, um erro inesperado em qualquer página mostrava o ecrã genérico
// do Next.js (sem marca, sem forma de voltar) a um cliente ou profissional
// real. "reset" tenta re-renderizar a mesma página antes de forçar a saída.
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[error-boundary]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0c1a' }}>
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-2xl font-black text-white mb-2">Ocorreu um erro</h1>
        <p className="text-gray-500 mb-8">Algo correu mal ao carregar esta página. Pode tentar novamente ou voltar ao início.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            Tentar novamente
          </button>
          <Link href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-white"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  )
}
