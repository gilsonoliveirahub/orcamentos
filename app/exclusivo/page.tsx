import type { Metadata } from 'next'
import ExclusivoClient from './ExclusivoClient'

export const metadata: Metadata = {
  title: 'Acesso Exclusivo | FaçoPorTi',
  description: 'Já não precisas de ser o mais rápido a responder para ganhar o cliente. Cria o teu link pessoal e recebe pedidos que são só teus, nunca partilhados com outro profissional.',
  alternates: { canonical: '/exclusivo' },
  robots: { index: false, follow: true },
}

export default function ExclusivoPage() {
  return <ExclusivoClient />
}
