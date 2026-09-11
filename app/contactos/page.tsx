import type { Metadata } from 'next'
import ContactosClient from './ContactosClient'

export const metadata: Metadata = {
  title: 'Contactos | FaçoPorTi',
  description: 'Entre em contacto com o FaçoPorTi por email ou WhatsApp.',
  alternates: { canonical: '/contactos' },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  name: 'Contactos — FaçoPorTi',
  mainEntity: {
    '@type': 'Organization',
    name: 'FaçoPorTi',
    // Punycode ASCII — JSON-LD nunca passa por new URL(), ver app/sitemap.ts.
    url: 'https://www.xn--faoporti-t0a.com',
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'contacto@façoporti.com',
      contactType: 'customer support',
      areaServed: 'PT',
    },
  },
}

export default function ContactosPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ContactosClient />
    </>
  )
}
