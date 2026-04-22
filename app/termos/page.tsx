import Link from 'next/link'

export default function TermosPage() {
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
        <h1 className="text-3xl font-black text-white mb-2">Termos de Serviço</h1>
        <p className="text-gray-500 text-sm mb-10">Última atualização: 20 de abril de 2026</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-lg font-bold text-white mb-3">1. Aceitação dos termos</h2>
            <p>Ao aceder ou utilizar a plataforma FaçoPorTi (disponível em facoporti.com), o utilizador aceita os presentes Termos de Serviço na sua totalidade. Se não concordar com algum dos termos, deverá abster-se de utilizar a plataforma.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">2. Descrição do serviço</h2>
            <p className="mb-3">O FaçoPorTi é uma plataforma que permite a profissionais independentes em Portugal receber e gerir pedidos de orçamento de potenciais clientes. A plataforma oferece:</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>Página de perfil pessoal com link partilhável</li>
              <li>Receção automática de pedidos de orçamento</li>
              <li>Dashboard de gestão de leads</li>
              <li>Marketplace de leads com sistema de créditos</li>
              <li>Notificações por email</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">3. Registo e conta</h2>
            <p className="mb-3">Para utilizar o FaçoPorTi como profissional é necessário criar uma conta com informações verdadeiras e atualizadas. O utilizador é responsável por:</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>Manter a confidencialidade da sua palavra-passe</li>
              <li>Toda a atividade realizada na sua conta</li>
              <li>Notificar imediatamente o FaçoPorTi em caso de uso não autorizado</li>
            </ul>
            <p className="mt-3">O FaçoPorTi reserva-se o direito de suspender ou terminar contas que violem estes termos.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">4. Planos e pagamentos</h2>
            <p className="mb-3">O FaçoPorTi oferece os seguintes planos pagos para profissionais:</p>
            <ul className="space-y-2 list-disc list-inside mb-3">
              <li><strong className="text-white">Starter — €19/mês:</strong> acesso à plataforma com funcionalidades base</li>
              <li><strong className="text-white">Pro — €39/mês:</strong> acesso completo com funcionalidades avançadas</li>
            </ul>
            <p className="mb-3">Os pagamentos são processados pela Stripe de forma segura. As subscrições são cobradas mensalmente e renovadas automaticamente até cancelamento.</p>
            <p>Adicionalmente, estão disponíveis pacotes de créditos para desbloquear leads do marketplace, adquiridos separadamente através de pagamento único.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">5. Dois tipos de pedidos</h2>
            <p className="mb-3"><strong className="text-white">Link pessoal:</strong> cada profissional dispõe de um link exclusivo. Pedidos submetidos através desse link são encaminhados única e exclusivamente para esse profissional — não são partilhados com nenhum outro. Os dados de contacto do cliente são imediatamente visíveis e estão incluídos no plano mensal, sem custo adicional por pedido.</p>
            <p className="mb-3"><strong className="text-white">Marketplace:</strong> clientes que acedam ao site FaçoPorTi sem um link de profissional específico podem submeter pedidos que serão atribuídos automaticamente a um profissional disponível. Para aceder aos dados de contacto destes leads, é necessário gastar 1 crédito por lead.</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>Os créditos são adquiridos em pacotes e não expiram</li>
              <li>Os créditos não são reembolsáveis após utilização</li>
              <li>Um lead desbloqueado não garante a contratação do profissional</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">6. Cancelamentos e reembolsos</h2>
            <p className="mb-3">O utilizador pode cancelar a sua subscrição a qualquer momento através do dashboard. O acesso à plataforma mantém-se ativo até ao fim do período faturado.</p>
            <p className="mb-3">Reembolsos de subscrições podem ser solicitados em até 14 dias após o início do plano, desde que não tenham sido utilizadas as funcionalidades pagas. Para solicitar reembolso, contacte <a href="mailto:suporte@facoporti.com" className="text-indigo-400 hover:underline">suporte@facoporti.com</a>.</p>
            <p>Pacotes de créditos não são reembolsáveis após compra.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">7. Conduta do utilizador</h2>
            <p className="mb-3">O utilizador compromete-se a não utilizar a plataforma para:</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>Inserir informações falsas ou enganosas</li>
              <li>Contactar clientes para fins não relacionados com o pedido de orçamento</li>
              <li>Realizar spam ou comunicações não solicitadas</li>
              <li>Violar a privacidade de outros utilizadores</li>
              <li>Contornar os mecanismos de pagamento da plataforma</li>
              <li>Qualquer atividade ilegal ou contrária aos bons costumes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">8. Responsabilidade</h2>
            <p className="mb-3">O FaçoPorTi atua exclusivamente como intermediário entre clientes e profissionais. Não somos parte nos contratos celebrados entre clientes e profissionais e não nos responsabilizamos por:</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>A qualidade dos serviços prestados pelos profissionais</li>
              <li>Qualquer dano resultante da relação entre cliente e profissional</li>
              <li>Informações incorretas fornecidas pelos utilizadores</li>
              <li>Indisponibilidade temporária da plataforma por razões técnicas</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">9. Propriedade intelectual</h2>
            <p>Todo o conteúdo da plataforma FaçoPorTi (marca, design, código, textos) é propriedade do FaçoPorTi e protegido por direitos de autor. É proibida a reprodução, distribuição ou modificação sem autorização expressa.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">10. Proteção de dados</h2>
            <p>O tratamento de dados pessoais rege-se pela nossa <Link href="/privacidade" className="text-indigo-400 hover:underline">Política de Privacidade</Link>, em conformidade com o RGPD e a legislação portuguesa aplicável.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">11. Alterações aos termos</h2>
            <p>O FaçoPorTi reserva-se o direito de atualizar estes termos a qualquer momento. Em caso de alterações relevantes, os utilizadores serão notificados por email com pelo menos 30 dias de antecedência. A utilização continuada da plataforma após as alterações constitui aceitação dos novos termos.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">12. Lei aplicável e foro</h2>
            <p>Estes termos regem-se pela lei portuguesa. Em caso de litígio, as partes comprometem-se a tentar uma resolução amigável. Na impossibilidade, será competente o tribunal da comarca de Lisboa, sem prejuízo do direito do consumidor de recorrer a meios alternativos de resolução de litígios (RAL).</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">13. Contacto</h2>
            <p>Para questões relacionadas com estes termos, contacte-nos em <a href="mailto:suporte@facoporti.com" className="text-indigo-400 hover:underline">suporte@facoporti.com</a>.</p>
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
