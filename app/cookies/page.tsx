import Link from 'next/link'

export default function CookiesPage() {
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

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black text-white mb-2">Política de Cookies</h1>
        <p className="text-gray-500 text-sm mb-10">Última atualização: 21 de abril de 2026</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-lg font-bold text-white mb-3">1. O que são cookies</h2>
            <p>Cookies são pequenos ficheiros de texto guardados no seu dispositivo quando visita um website. Permitem que o site recorde as suas preferências e sessão entre visitas.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">2. Cookies que utilizamos</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <th className="text-left px-4 py-3 text-white font-semibold">Nome</th>
                    <th className="text-left px-4 py-3 text-white font-semibold">Finalidade</th>
                    <th className="text-left px-4 py-3 text-white font-semibold">Duração</th>
                    <th className="text-left px-4 py-3 text-white font-semibold">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td className="px-4 py-3 font-mono text-indigo-400">sb-*</td>
                    <td className="px-4 py-3">Sessão de autenticação (Supabase)</td>
                    <td className="px-4 py-3">Sessão / 1 semana</td>
                    <td className="px-4 py-3 text-green-400">Estritamente necessário</td>
                  </tr>
                  <tr style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                    <td className="px-4 py-3 font-mono text-indigo-400">facoporti-cookies</td>
                    <td className="px-4 py-3">Registo da preferência de cookies</td>
                    <td className="px-4 py-3">1 ano</td>
                    <td className="px-4 py-3 text-green-400">Estritamente necessário</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm text-gray-500">Não utilizamos cookies de análise, publicidade ou rastreamento de terceiros.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">3. Base legal</h2>
            <p>Os cookies estritamente necessários são utilizados com base no interesse legítimo (art. 6.º, n.º 1, al. f) do RGPD) para garantir o funcionamento da plataforma. Não requerem consentimento prévio ao abrigo da Diretiva ePrivacy, uma vez que são indispensáveis ao serviço solicitado.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">4. Como gerir ou eliminar cookies</h2>
            <p className="mb-3">Pode eliminar ou bloquear cookies nas definições do seu browser:</p>
            <ul className="space-y-1 list-disc list-inside text-sm">
              <li>Chrome: Definições → Privacidade e segurança → Cookies</li>
              <li>Firefox: Opções → Privacidade e segurança → Cookies</li>
              <li>Safari: Preferências → Privacidade → Gerir dados de websites</li>
              <li>Edge: Definições → Cookies e permissões do site</li>
            </ul>
            <p className="mt-3 text-sm text-gray-500">Atenção: bloquear os cookies de sessão impedirá o funcionamento correto da autenticação na plataforma.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">5. Contacto</h2>
            <p>Para questões sobre cookies, contacte-nos em <a href="mailto:suporte@facoporti.com" className="text-indigo-400 hover:underline">suporte@facoporti.com</a>.</p>
          </section>

        </div>
      </div>

      <footer className="border-t mt-16" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <p className="text-sm text-gray-600">© 2026 FaçoPorTi</p>
          <div className="flex gap-6">
            <Link href="/privacidade" className="text-sm text-gray-600 hover:text-white transition-colors">Privacidade</Link>
            <Link href="/cookies" className="text-sm text-gray-600 hover:text-white transition-colors">Cookies</Link>
            <Link href="/termos" className="text-sm text-gray-600 hover:text-white transition-colors">Termos</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
