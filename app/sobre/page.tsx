import Link from 'next/link'

export default function SobrePage() {
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
        <h1 className="text-3xl font-black text-white mb-10">Sobre o FaçoPorTi</h1>

        <div className="space-y-6 text-gray-300 leading-relaxed text-lg">
          <p>
            O FaçoPorTi é uma plataforma criada para ajudar profissionais independentes a receber pedidos de clientes de forma simples e organizada.
          </p>
          <p>
            Com um link profissional próprio, cada utilizador pode partilhar o seu serviço e receber pedidos já com orçamento estimado, evitando trocas demoradas de mensagens.
          </p>
          <p>
            O objetivo é ajudar profissionais a poupar tempo, organizar melhor os pedidos e fechar mais trabalhos.
          </p>
        </div>
      </div>

      <footer className="border-t mt-16" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <p className="text-sm text-gray-600">© 2026 FaçoPorTi</p>
          <div className="flex gap-6">
            <Link href="/privacidade" className="text-sm text-gray-600 hover:text-white transition-colors">Privacidade</Link>
            <Link href="/termos" className="text-sm text-gray-600 hover:text-white transition-colors">Termos</Link>
            <Link href="/contactos" className="text-sm text-gray-600 hover:text-white transition-colors">Contactos</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
