// Conteúdo real já existente na secção FAQ da homepage (app/marketing/page.tsx)
// — extraído para aqui só para poder ser reutilizado como JSON-LD FAQPage em
// app/page.tsx (Server Component) sem duplicar o texto em dois sítios.
// Nenhuma pergunta/resposta nova foi inventada.

export const HOMEPAGE_FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'O cliente que usa o meu link vai para outros profissionais?',
    a: 'Não. O cliente que acede ao teu link pessoal é encaminhado exclusivamente para ti. Nenhum outro profissional recebe esse pedido.',
  },
  {
    q: 'O que é o marketplace?',
    a: 'O marketplace reúne pedidos feitos diretamente no FaçoPorTi. Quando existe um profissional ativo e compatível com a especialidade e a zona, o pedido é encaminhado para esse profissional. Os leads do marketplace são opcionais e pagos separadamente através de créditos.',
  },
  {
    q: 'Quando pago por uma lead?',
    a: 'Pagas com créditos sempre que recebes um lead do marketplace — desde 2,50€ por lead. Pedidos que chegam pelo teu link pessoal estão incluídos no plano mensal, sem custo adicional, até ao limite mensal do teu plano.',
  },
  {
    q: 'O que está incluído no plano mensal?',
    a: 'O teu link pessoal, a receção e gestão de pedidos via esse link (até ao limite do teu plano — 10/mês no Starter, 50/mês no Pro), o pipeline Kanban e os orçamentos automáticos. No plano Pro tens ainda follow-up automático, notificações WhatsApp e estatísticas avançadas.',
  },
  {
    q: 'Posso comprar mais leads do marketplace?',
    a: 'Sim. Podes comprar pacotes de créditos a qualquer momento. Os créditos não expiram.',
  },
  {
    q: 'Os pedidos do meu link contam para algum limite?',
    a: 'Sim. No plano Starter o máximo é 10 pedidos/mês via link pessoal. No plano Pro o máximo é 30 pedidos/mês.',
  },
  {
    q: 'Posso cancelar a qualquer momento?',
    a: 'Sim, sem compromissos. Cancelas no dashboard e o plano mantém-se ativo até ao fim do período já pago.',
  },
]
