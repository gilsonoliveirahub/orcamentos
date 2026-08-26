// Slug determinístico para URLs por especialidade (/profissionais/[slug]) —
// derivado sempre de SPECIALTY_LIST, nunca uma tabela paralela para manter
// sincronizada à mão.

import { SPECIALTY_LIST } from '@/lib/professions'

const DIACRITICS_REGEX = new RegExp('[̀-ͯ]', 'g')

export function specialtyToSlug(specialty: string): string {
  return specialty
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Devolve o nome real da especialidade (como está em SPECIALTY_LIST) a partir do slug, ou null se não corresponder a nenhuma. */
export function specialtyFromSlug(slug: string): string | null {
  return SPECIALTY_LIST.find(s => specialtyToSlug(s) === slug) ?? null
}
