import Link from 'next/link'
import { MessageCircle } from 'lucide-react'

export default function ContactosPage() {
  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="text-xl font-semibold text-white">
            Faço<span style={{ color: '#c9a84c' }}>PorTi</span>
          </Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-white transition-colors">← Início</Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-black text-white mb-10">Contactos</h1>

        <div className="space-y-4 text-gray-300 leading-relaxed text-lg">
          <p>Se precisares de ajuda ou tiveres alguma dúvida, podes entrar em contacto connosco:</p>
          <p>
            Email:{' '}
            <a href="mailto:contacto@façoporti.com" className="text-[#c9a84c] hover:underline">
              contacto@façoporti.com
            </a>
          </p>
          <p className="text-gray-500 text-base">Respondemos o mais rápido possível.</p>

          <a
            href="https://wa.me/14245872587"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 py-3 px-6 rounded-xl font-bold text-sm transition-all"
            style={{ background: 'rgba(37,211,102,0.12)', color: '#25d366', border: '1px solid rgba(37,211,102,0.2)' }}
          >
            <MessageCircle size={16} /> Falar connosco pelo WhatsApp
          </a>
        </div>
      </div>

      <footer className="border-t mt-16" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <p className="text-sm text-gray-600">© 2026 FaçoPorTi</p>
          <div className="flex gap-6">
            <Link href="/privacidade" className="text-sm text-gray-600 hover:text-white transition-colors">Privacidade</Link>
            <Link href="/termos" className="text-sm text-gray-600 hover:text-white transition-colors">Termos</Link>
            <Link href="/sobre" className="text-sm text-gray-600 hover:text-white transition-colors">Sobre nós</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
