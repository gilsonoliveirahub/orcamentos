'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('cookie_consent')) setVisible(true)
  }, [])

  function accept() {
    localStorage.setItem('cookie_consent', 'accepted')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4"
      role="dialog"
      aria-label="Aviso de cookies"
    >
      <div
        className="max-w-2xl mx-auto rounded-2xl px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        style={{
          background: '#13152a',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        <p className="text-sm text-gray-300 flex-1">
          Utilizamos cookies estritamente necessários para autenticação e funcionamento da plataforma.
          Ao continuar, aceita a nossa{' '}
          <Link href="/privacidade" className="text-indigo-400 underline hover:text-indigo-300">
            Política de Privacidade
          </Link>
          {' '}e{' '}
          <Link href="/cookies" className="text-indigo-400 underline hover:text-indigo-300">
            Política de Cookies
          </Link>
          .
        </p>
        <button
          onClick={accept}
          className="flex-shrink-0 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all"
          style={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
          }}
        >
          Aceitar
        </button>
      </div>
    </div>
  )
}
