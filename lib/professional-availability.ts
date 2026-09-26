// Disponibilidade avançada do profissional (2026-09-25) — três estados em
// vez do simples ligar/desligar de `accepting_leads`:
//   'disponivel'   — igual ao antigo accepting_leads=true
//   'parcial'      — continua a aceitar pedidos, mas mostra publicamente que
//                    a capacidade está reduzida (nunca bloqueia nada sozinho)
//   'indisponivel' — igual ao antigo accepting_leads=false; pode ter
//                    `available_from` (data de regresso) associada
//
// `accepting_leads` continua a existir e a ser escrito em sincronia (nunca
// removido — várias partes do código e a ficha de admin ainda o leem
// diretamente) mas deixa de ser a fonte de verdade sempre que
// `availability_status` já estiver definido. Antes da migração ser aplicada
// (ou para profissionais que nunca mexeram nisto), cai sempre no
// comportamento antigo — coluna ausente/nunca definida conta como
// disponível, nunca penaliza por omissão (mesma filosofia já usada para
// accepting_leads em lib/marketplace.ts e lib/professional-ranking.ts).

export type AvailabilityStatus = 'disponivel' | 'parcial' | 'indisponivel'
export const AVAILABILITY_STATUSES: readonly AvailabilityStatus[] = ['disponivel', 'parcial', 'indisponivel']

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  disponivel: 'Disponível',
  parcial: 'Disponibilidade limitada',
  indisponivel: 'Indisponível',
}

export type AvailabilityInput = {
  availability_status?: string | null
  available_from?: string | null
  accepting_leads?: boolean | null
}

function isKnownStatus(v: unknown): v is AvailabilityStatus {
  return v === 'disponivel' || v === 'parcial' || v === 'indisponivel'
}

/**
 * Estado efetivo, já resolvendo "indisponível até {available_from}": quando
 * a data de regresso já passou, conta como disponível de novo sem precisar
 * de o profissional voltar a mexer em nada — mas isto é só um cálculo de
 * LEITURA, nunca escreve nada na base de dados sozinho.
 */
export function computeEffectiveAvailability(input: AvailabilityInput, now: Date = new Date()): AvailabilityStatus {
  const status: AvailabilityStatus = isKnownStatus(input.availability_status)
    ? input.availability_status
    : (input.accepting_leads === false ? 'indisponivel' : 'disponivel')

  if (status === 'indisponivel' && input.available_from) {
    const from = new Date(`${input.available_from}T00:00:00`)
    if (!Number.isNaN(from.getTime()) && from.getTime() <= now.getTime()) return 'disponivel'
  }
  return status
}

/** Único ponto que decide se o profissional pode adquirir/mostrar-se disponível para novos pedidos. */
export function isAcceptingLeads(input: AvailabilityInput, now: Date = new Date()): boolean {
  return computeEffectiveAvailability(input, now) !== 'indisponivel'
}
