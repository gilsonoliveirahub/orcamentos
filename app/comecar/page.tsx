import type { Metadata } from 'next'
import ComecarClient from './ComecarClient'

export const metadata: Metadata = {
  title: 'Recebe Pedidos Sem Concorrência | FaçoPorTi',
  description: 'Recebe pedidos de orçamento qualificados pelo teu link pessoal, sem concorrência com outros profissionais. Starter a €19/mês.',
  alternates: { canonical: '/comecar' },
}

export default function ComecarPage() {
  return <ComecarClient />
}
