// Completude do pedido — regras determinísticas (sem IA, sem chamada
// externa) sobre dados que já existem no lead, para ajudar o profissional a
// avaliar rapidamente se tem o suficiente para orçamentar com confiança, ou
// se vale a pena pedir mais detalhe ao cliente antes de avançar.
//
// "Zona genérica" é a opção de apanha-tudo do wizard /pedir (ver
// app/pedir/page.tsx, ZONAS) — só se aplica a leads do marketplace
// (zone_requested só existe aí; leads do link pessoal já vão sempre para um
// profissional de zona conhecida, não precisam desta pergunta).

export const GENERIC_ZONE_LABEL = 'Outra / Toda Portugal'
const MIN_NOTES_LENGTH = 20

export type CompletenessCheck = { key: string; label: string; met: boolean }

export type LeadForCompleteness = {
  source: string | null
  zone_requested: string | null
  metadata: Record<string, any> | null
}

export function computeLeadCompleteness(lead: LeadForCompleteness): { checks: CompletenessCheck[]; missingCount: number } {
  const metadata = lead.metadata || {}
  const notas: string = typeof metadata.notas === 'string' ? metadata.notas : ''
  const mediaUrls: unknown[] = Array.isArray(metadata.media_urls) ? metadata.media_urls : []

  const checks: CompletenessCheck[] = []

  if (lead.source === 'marketplace') {
    checks.push({
      key: 'zona',
      label: 'Zona específica indicada',
      met: !!lead.zone_requested && lead.zone_requested !== GENERIC_ZONE_LABEL,
    })
  }

  checks.push({ key: 'notas', label: 'Descrição com detalhe', met: notas.trim().length >= MIN_NOTES_LENGTH })
  checks.push({ key: 'media', label: 'Fotos ou vídeo anexados', met: mediaUrls.length > 0 })

  return { checks, missingCount: checks.filter(c => !c.met).length }
}
