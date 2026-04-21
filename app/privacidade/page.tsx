import Link from 'next/link'

export default function PrivacidadePage() {
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
        <h1 className="text-3xl font-black text-white mb-2">Política de Privacidade</h1>
        <p className="text-gray-500 text-sm mb-10">Última atualização: 21 de abril de 2026</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-lg font-bold text-white mb-3">1. Quem somos</h2>
            <p className="mb-2">O FaçoPorTi é uma plataforma de gestão de leads e orçamentos para profissionais independentes em Portugal.</p>
            <p className="mb-1"><strong className="text-white">Responsável pelo tratamento:</strong> Gilson Gomes de Oliveira</p>
            <p className="mb-1"><strong className="text-white">NIF:</strong> 232 619 808</p>
            <p className="mb-1"><strong className="text-white">Morada:</strong> Av. Embaixador Assis Chateaubriand, n.º 21, 2.º Direito, 2780-197 Oeiras, Lisboa, Portugal</p>
            <p className="mt-2">Contacto geral: <a href="mailto:suporte@facoporti.com" className="text-indigo-400 hover:underline">suporte@facoporti.com</a></p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">2. Que dados recolhemos</h2>
            <p className="mb-3"><strong className="text-white">Profissionais:</strong> nome, endereço de email, número de telefone, especialidade, zona de atuação e informações de pagamento (processadas pela Stripe — não armazenamos dados de cartão).</p>
            <p><strong className="text-white">Clientes que pedem orçamentos:</strong> nome, número de telefone, email (opcional), descrição do trabalho pretendido e ficheiros multimédia (fotos/vídeos) enviados voluntariamente.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">3. Para que usamos os dados</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li>Conectar clientes a profissionais qualificados</li>
              <li>Gerar orçamentos automáticos</li>
              <li>Enviar notificações por email sobre novos pedidos</li>
              <li>Processar pagamentos de subscrições e créditos</li>
              <li>Melhorar a plataforma</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">4. Base legal (RGPD)</h2>
            <p>O tratamento dos dados baseia-se na execução de um contrato (art. 6.º, n.º 1, al. b) do RGPD) para os utilizadores registados, e no consentimento (al. a)) para os clientes que submetem pedidos de orçamento. O consentimento é recolhido de forma explícita no momento da submissão do pedido e pode ser retirado a qualquer momento mediante contacto.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">5. Com quem partilhamos os dados</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong className="text-white">Profissional destinatário:</strong> ao submeter um pedido, o cliente aceita que os seus dados de contacto sejam partilhados com o profissional destinatário, que é determinado da seguinte forma: (a) se o pedido for feito através do link pessoal de um profissional, os dados vão exclusivamente para esse profissional; (b) se o pedido for feito através do marketplace, os dados vão para o profissional que desbloquear o lead com um crédito. Em nenhum caso os dados são partilhados com múltiplos profissionais simultaneamente.</li>
              <li><strong className="text-white">Stripe (EUA):</strong> processamento de pagamentos. A Stripe opera sob as Cláusulas Contratuais-Tipo (CCT/SCC) aprovadas pela Comissão Europeia, garantindo proteção adequada dos dados transferidos para fora da UE.</li>
              <li><strong className="text-white">Supabase:</strong> armazenamento de dados em servidores na União Europeia (Irlanda).</li>
              <li><strong className="text-white">Resend / Amazon SES (Irlanda):</strong> envio de emails transacionais, processado na UE.</li>
            </ul>
            <p className="mt-3">Não vendemos dados a terceiros.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">6. Durante quanto tempo guardamos os dados</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong className="text-white">Contas de profissionais:</strong> conservados enquanto a conta estiver ativa. Após eliminação, apagados no prazo de 30 dias, salvo obrigações legais (ex: faturas — 10 anos).</li>
              <li><strong className="text-white">Dados de clientes (pedidos de orçamento):</strong> conservados por um máximo de 2 anos após a data do pedido, salvo se o cliente solicitar apagamento antes.</li>
              <li><strong className="text-white">Ficheiros multimédia:</strong> apagados no prazo de 30 dias após encerramento do lead.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">7. Os seus direitos</h2>
            <p className="mb-3">Ao abrigo do RGPD, tem direito a:</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>Aceder aos seus dados pessoais</li>
              <li>Retificar dados incorretos</li>
              <li>Solicitar o apagamento dos dados ("direito a ser esquecido")</li>
              <li>Opor-se ao tratamento ou solicitar a limitação</li>
              <li>Portabilidade dos dados</li>
              <li>Retirar o consentimento a qualquer momento, sem prejuízo da licitude do tratamento efetuado antes da retirada</li>
              <li>Apresentar reclamação à CNPD (Comissão Nacional de Proteção de Dados — <a href="https://www.cnpd.pt" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">cnpd.pt</a>)</li>
            </ul>
            <p className="mt-3">Para exercer os seus direitos, contacte-nos em <a href="mailto:suporte@facoporti.com" className="text-indigo-400 hover:underline">suporte@facoporti.com</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">8. Cookies</h2>
            <p>Utilizamos apenas cookies estritamente necessários para autenticação e funcionamento da plataforma. Não utilizamos cookies de rastreamento ou publicidade. Consulte a nossa <Link href="/cookies" className="text-indigo-400 hover:underline">Política de Cookies</Link> para mais detalhes.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">9. Segurança</h2>
            <p>Os dados são transmitidos por HTTPS e armazenados em servidores seguros na União Europeia. As passwords são armazenadas de forma encriptada (bcrypt) e nunca em texto simples.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">10. Alterações a esta política</h2>
            <p>Em caso de alterações relevantes, notificaremos os utilizadores por email com 30 dias de antecedência.</p>
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
