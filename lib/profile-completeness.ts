// Completude do perfil — só os campos que realmente melhoram confiança do
// cliente, matching, SEO local ou descoberta por IA. Nunca usado para
// penalizar ranking (isso continua exclusivamente em
// lib/professional-ranking.ts); só para mostrar ao próprio profissional o
// que falta. Nome e especialidade ficam de fora de propósito — já são
// obrigatórios no registo (sempre 100% preenchidos), contá-los só inflaria
// a percentagem sem informar nada de novo.

export type ProfileCompletenessInput = {
  description: string | null
  avatar_url: string | null
  zone: string | null
  phone: string | null
  portfolioCount: number
  reviewsCount: number
}

export type ProfileCompletenessItem = { key: string; label: string; done: boolean }

export type ProfileCompleteness = {
  percent: number
  completedCount: number
  totalCount: number
  items: ProfileCompletenessItem[]
}

// Limiar mínimo para a descrição contar como "preenchida" — poucas
// palavras não ajudam SEO/confiança mais do que estar vazia.
const MIN_DESCRIPTION_LENGTH = 20

export function computeProfileCompleteness(input: ProfileCompletenessInput): ProfileCompleteness {
  const items: ProfileCompletenessItem[] = [
    { key: 'description', label: 'Descrição do teu trabalho ("Sobre mim")', done: (input.description?.trim().length ?? 0) >= MIN_DESCRIPTION_LENGTH },
    { key: 'avatar', label: 'Foto de perfil', done: !!input.avatar_url },
    { key: 'zone', label: 'Zona onde trabalhas', done: !!input.zone?.trim() },
    { key: 'phone', label: 'Telefone/WhatsApp para contacto', done: !!input.phone?.trim() },
    { key: 'portfolio', label: 'Pelo menos 1 foto no portfólio', done: input.portfolioCount > 0 },
    { key: 'reviews', label: 'Pelo menos 1 avaliação de cliente', done: input.reviewsCount > 0 },
  ]

  const completedCount = items.filter(i => i.done).length
  return {
    percent: Math.round((completedCount / items.length) * 100),
    completedCount,
    totalCount: items.length,
    items,
  }
}
