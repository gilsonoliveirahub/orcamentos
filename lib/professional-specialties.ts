// Leitura única de "que especialidades tem este profissional" — usa
// specialties[] quando definido, cai para o campo singular `specialty`
// quando o array está vazio (perfis antigos que nunca usaram múltiplas
// especialidades). Extraído de lib/marketplace.ts para ser reutilizável em
// contexto client-side (filtros/pesquisa públicos) sem arrastar esse
// ficheiro (importa supabaseAdmin) para o bundle do browser.

export type ProfessionalForSpecialties = { specialty: string | null; specialties: string[] | null }

export function professionalSpecialties(prof: ProfessionalForSpecialties): string[] {
  if (prof.specialties && prof.specialties.length > 0) return prof.specialties
  return prof.specialty ? [prof.specialty] : []
}
