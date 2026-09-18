// P0 (2026-09-18): protege valores manuais e propostas já enviadas/aceites
// contra o botão "Recalcular"/"Gerar Orçamento". Antes disto, qualquer
// chamada a /api/quote/generate, /api/quote/estimate ou /api/quote/hours
// sobrescrevia sempre a quote existente em silêncio, mesmo depois de o
// profissional ter editado o valor à mão ou já ter enviado a proposta ao
// cliente — usado a partir das 3 rotas para ter exatamente a mesma regra.
//
// `value_source` e `accepted_at` só existem depois de
// supabase/migration_p0_quotes_value_source.sql ser aplicada — até lá,
// `existingQuote.value_source` vem sempre `undefined` (coluna inexistente),
// o que este código trata como "não é manual" (comportamento seguro:
// nenhuma proteção nova bloqueia nada até a coluna existir, mas também não
// rebenta por a coluna não existir ainda).
export type ExistingQuoteForGuard = {
  status?: string | null
  value_source?: string | null
} | null | undefined

export type QuoteGuardResult =
  | { blocked: false }
  | { blocked: true; message: string }

export function checkQuoteRecalculationAllowed(existingQuote: ExistingQuoteForGuard): QuoteGuardResult {
  if (!existingQuote) return { blocked: false }

  if (existingQuote.status === 'enviado' || existingQuote.status === 'aceite') {
    return {
      blocked: true,
      message: 'Esta proposta já foi enviada ao cliente — não pode ser recalculada automaticamente. Contacte o cliente diretamente se precisar de alterar o valor.',
    }
  }

  if (existingQuote.value_source === 'manual') {
    return {
      blocked: true,
      message: 'Este valor foi editado manualmente — recalcular não o substitui automaticamente. Se quiser mesmo recalcular, ajuste o valor manualmente depois.',
    }
  }

  return { blocked: false }
}

// P2 (2026-09-18): guarda para a EDIÇÃO MANUAL do valor (rota
// /api/quote/manual — "permitir ao profissional rever, alterar ou
// substituir o valor"). Diferente de checkQuoteRecalculationAllowed acima:
// uma edição manual pode sempre substituir um valor calculado OU um valor
// manual anterior (é o próprio profissional a decidir, não um recálculo
// automático) — só continua bloqueada depois de a proposta já ter sido
// enviada/aceite pelo cliente, porque nesse ponto alterar o valor
// silenciosamente já afeta o que o cliente viu.
export function checkManualEditAllowed(existingQuote: ExistingQuoteForGuard): QuoteGuardResult {
  if (!existingQuote) return { blocked: false }

  if (existingQuote.status === 'enviado' || existingQuote.status === 'aceite') {
    return {
      blocked: true,
      message: 'Esta proposta já foi enviada ao cliente — para alterar o valor depois de enviada, contacte o cliente diretamente.',
    }
  }

  return { blocked: false }
}
