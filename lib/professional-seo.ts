// Construção pura de metadata/JSON-LD para /p/[slug] — separado da página
// (que faz I/O) para ser testável sem mocks de Supabase/Next.

import { PROFESSIONS } from '@/lib/professions'

export type PublicProfessional = {
  name: string
  specialty: string | null
  specialties: string[] | null
  zone: string | null
  description: string | null
  avatar_url: string | null
}

export function specialtyLabel(prof: { specialty: string | null; specialties: string[] | null }): string {
  const spec = prof.specialties?.length ? prof.specialties[0] : prof.specialty
  return (spec && PROFESSIONS[spec]?.label) || spec || 'Serviços'
}

export function professionalTitle(prof: PublicProfessional): string {
  const label = specialtyLabel(prof)
  return `${prof.name} — ${label}${prof.zone ? ` em ${prof.zone}` : ''} | FaçoPorTi`
}

export function professionalDescription(prof: PublicProfessional): string {
  const label = specialtyLabel(prof)
  return prof.description
    ? prof.description.slice(0, 155)
    : `Peça orçamento a ${prof.name}, ${label.toLowerCase()}${prof.zone ? ` em ${prof.zone}` : ''}. Resposta direta, sem concorrência entre profissionais.`
}

export function professionalJsonLd(prof: PublicProfessional, ratings: number[]): Record<string, unknown> {
  const avgRating = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null

  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: prof.name,
    description: prof.description || undefined,
    image: prof.avatar_url || undefined,
    address: prof.zone ? { '@type': 'PostalAddress', addressLocality: prof.zone, addressCountry: 'PT' } : undefined,
    areaServed: prof.zone || undefined,
    knowsAbout: specialtyLabel(prof),
    ...(avgRating !== null ? {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: avgRating.toFixed(1), reviewCount: ratings.length },
    } : {}),
  }
}
