// Zonas reais dos profissionais listados numa página de especialidade
// (/profissionais/[especialidade]) — usado para enriquecer meta description,
// H1/intro e JSON-LD com termos geográficos reais, sem nunca inventar
// cidades/zonas que não existam entre os profissionais realmente ativos
// (decisão de negócio 2026-09-10: sem mínimo fixo de profissionais por
// localidade, nunca uma página dedicada por zona sem oferta real).

export type ProfessionalWithZone = { zone: string | null }

/** Zonas únicas, sem vazios/duplicados, ordem alfabética (nunca a ordem de inserção, que dependeria do ranking). */
export function computeUniqueZones(professionals: ProfessionalWithZone[]): string[] {
  const zones = new Set<string>()
  for (const p of professionals) {
    const zone = p.zone?.trim()
    if (zone) zones.add(zone)
  }
  return Array.from(zones).sort((a, b) => a.localeCompare(b, 'pt-PT'))
}

/** Frase curta para meta description/intro — nunca gerada se não houver nenhuma zona real. */
export function formatZonesSummary(zones: string[]): string | null {
  if (zones.length === 0) return null
  if (zones.length <= 3) return zones.join(', ')
  return `${zones.slice(0, 3).join(', ')} e mais ${zones.length - 3} zona${zones.length - 3 === 1 ? '' : 's'}`
}
