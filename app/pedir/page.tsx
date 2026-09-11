import type { Metadata } from 'next'
import PedirClient from './PedirClient'

export const metadata: Metadata = {
  title: 'Pedir Orçamento | FaçoPorTi',
  description: 'Peça um orçamento a um profissional em Portugal — pintura, eletricidade, canalização e outras especialidades.',
  alternates: { canonical: '/pedir' },
}

export default function PedirPage() {
  return <PedirClient />
}
