// Construção pura de metadata/JSON-LD para /p/[slug] — separado da página
// (que faz I/O) para ser testável sem mocks de Supabase/Next.

import { PROFESSIONS } from '@/lib/professions'
import { professionalSpecialties } from '@/lib/professional-specialties'

export type PublicProfessional = {
  name: string
  specialty: string | null
  specialties: string[] | null
  zone: string | null
  description: string | null
  avatar_url: string | null
}

export function specialtyLabel(prof: { specialty: string | null; specialties: string[] | null }): string {
  const spec = professionalSpecialties(prof)[0] ?? null
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

export type ProfessionalReviewForJsonLd = {
  rating: number
  client_name?: string | null
  comment?: string | null
  created_at?: string | null
}

/**
 * Áreas servidas a partir de `zone` (texto livre, já usado no produto para
 * várias localidades separadas por vírgula, ex: "Lisboa, Margem Sul e
 * Arredores") — nunca inventa localidades, só estrutura o que já lá está.
 * Uma só área devolve string simples; várias devolvem uma lista de Place,
 * mais claro para motores de busca/IA do que uma frase única.
 */
function areaServedFromZone(zone: string | null): string | Array<{ '@type': string; name: string }> | undefined {
  if (!zone?.trim()) return undefined
  const parts = zone.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length <= 1) return zone
  return parts.map(name => ({ '@type': 'Place', name }))
}

// Máximo de reviews incluídas no JSON-LD — dados reais, nunca inventados,
// mas sem despejar um histórico inteiro numa única página.
const MAX_JSONLD_REVIEWS = 10

export function professionalJsonLd(prof: PublicProfessional, reviews: ProfessionalReviewForJsonLd[]): Record<string, unknown> {
  const ratings = reviews.map(r => r.rating)
  const avgRating = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null

  // Todas as especialidades reais do profissional, não só a primeira —
  // knowsAbout aceita uma lista, e esconder as restantes desperdiçava dados
  // estruturados que já existem (lib/professional-specialties.ts).
  const specialtyLabels = professionalSpecialties(prof).map(s => PROFESSIONS[s]?.label || s)
  const knowsAbout = specialtyLabels.length > 1 ? specialtyLabels : (specialtyLabels[0] ?? 'Serviços')

  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: prof.name,
    description: prof.description || undefined,
    image: prof.avatar_url || undefined,
    address: prof.zone ? { '@type': 'PostalAddress', addressLocality: prof.zone, addressCountry: 'PT' } : undefined,
    areaServed: areaServedFromZone(prof.zone),
    knowsAbout,
    ...(avgRating !== null ? {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: avgRating.toFixed(1), reviewCount: ratings.length },
    } : {}),
    ...(reviews.length > 0 ? {
      review: reviews.slice(0, MAX_JSONLD_REVIEWS).map(r => ({
        '@type': 'Review',
        author: { '@type': 'Person', name: r.client_name || 'Cliente FaçoPorTi' },
        reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        reviewBody: r.comment || undefined,
        datePublished: r.created_at || undefined,
      })),
    } : {}),
  }
}
