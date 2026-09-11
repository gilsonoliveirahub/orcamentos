import type { Metadata } from 'next'
import ProfissionaisClient from './ProfissionaisClient'

export const metadata: Metadata = {
  title: 'Profissionais em Portugal | FaçoPorTi',
  description: 'Encontre profissionais disponíveis perto de si — pintores, eletricistas, canalizadores e outras especialidades.',
  alternates: { canonical: '/profissionais' },
}

export default function ProfissionaisPage() {
  return <ProfissionaisClient />
}
