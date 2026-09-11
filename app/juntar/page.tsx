import type { Metadata } from 'next'
import JuntarClient from './JuntarClient'

export const metadata: Metadata = {
  title: 'Junta-te ao FaçoPorTi | Profissionais Independentes',
  description: 'Recebe pedidos de orçamento qualificados pelo teu link pessoal, sem concorrência com outros profissionais. Starter a €19/mês.',
  alternates: { canonical: '/juntar' },
}

export default function JuntarPage() {
  return <JuntarClient />
}
