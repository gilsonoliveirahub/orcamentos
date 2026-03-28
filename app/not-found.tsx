import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0c1a' }}>
      <div className="text-center">
        <div className="text-6xl font-black text-indigo-500 mb-2">404</div>
        <h1 className="text-2xl font-black text-white mb-2">Página não encontrada</h1>
        <p className="text-gray-500 mb-8">O link pode estar errado ou ter expirado.</p>
        <Link href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
