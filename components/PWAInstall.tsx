'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

export default function PWAInstall() {
  const [prompt, setPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e)
      setShow(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function install() {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setShow(false)
  }

  if (!show) return null

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 rounded-2xl p-4 flex items-center gap-3"
      style={{ background: '#1e2035', border: '1px solid rgba(99,102,241,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
    >
      <Image src="/icon-192.png" width={48} height={48} alt="FaçoPorTi" className="rounded-xl flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-black text-white text-sm">Instalar FaçoPorTi</div>
        <div className="text-xs text-gray-500">Adicionar ao ecrã principal</div>
      </div>
      <button
        onClick={install}
        className="px-4 py-2 rounded-xl text-sm font-black text-white flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
      >
        Instalar
      </button>
      <button onClick={() => setShow(false)} className="text-gray-500 hover:text-gray-300 text-xl leading-none flex-shrink-0">
        &times;
      </button>
    </div>
  )
}
