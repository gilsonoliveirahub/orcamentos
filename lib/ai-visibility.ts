// AI Visibility — distingue claramente o que é mensurável hoje (sem
// nenhuma API externa paga) do que fica só documentado como metodologia
// futura, pendente de decisão de negócio/fornecedor.
//
// MENSURÁVEL HOJE (sinal parcial, nunca uma confirmação de recomendação):
// tráfego cujo referrer/utm indica que veio de um produto de IA dedicado
// (chat.openai.com, claude.ai, gemini.google.com, perplexity.ai...) — ver
// lib/analytics.ts, normalizeOriginChannel(). É um limite inferior: só
// conta visitas em que a ferramenta de IA passou o referrer e alguém
// realmente clicou. Nunca sabe se a IA mencionou o FaçoPorTi sem clique,
// nem se a menção foi positiva, precisa ou sequer existiu.
//
// NÃO MENSURÁVEL HOJE: se ChatGPT/Claude/Gemini/outros recomendam ou citam
// o FaçoPorTi quando perguntados. Exigiria consultar essas APIs
// diretamente (pagas) ou contratar um serviço de monitorização de marca
// (pago) — nenhuma chamada desse tipo é feita por este módulo nem por
// nenhum outro no código.

export type AIVisibilitySummary = {
  observedReferralCount: number
  methodology: 'referrer_utm_only'
  limitations: string[]
}

const LIMITATIONS = [
  'Só conta visitas em que a ferramenta de IA passou um referrer/utm reconhecido — muitas não passam nenhum.',
  'Não confirma que a IA recomendou o FaçoPorTi, só que alguém chegou a partir de uma dessas ferramentas.',
  'Não distingue uma menção positiva de uma negativa, nem mede a frequência real de citação dentro da IA.',
]

export function summarizeAIVisibility(
  byOriginChannel: Array<{ origin_channel: string; event_count: number }>
): AIVisibilitySummary {
  const iaEntry = byOriginChannel.find(c => c.origin_channel === 'ia')
  return {
    observedReferralCount: iaEntry?.event_count ?? 0,
    methodology: 'referrer_utm_only',
    limitations: LIMITATIONS,
  }
}

export type FutureAIVisibilityMetric = { key: string; description: string; requires: string }

// Documentado, não implementado — cada uma exigiria custo/fornecedor
// externo ou um processo manual recorrente, nenhum dos dois decidido.
export const FUTURE_AI_VISIBILITY_METRICS: FutureAIVisibilityMetric[] = [
  {
    key: 'llm_query_sampling',
    description: 'Perguntar periodicamente a assistentes de IA reais (ex: "quem faz pinturas em Lisboa?") e registar se o FaçoPorTi aparece na resposta.',
    requires: 'Acesso às APIs desses fornecedores (custo) ou um processo manual recorrente — decisão de negócio pendente.',
  },
  {
    key: 'brand_monitoring_service',
    description: 'Serviço terceiro especializado em monitorizar menções de marca em respostas de sistemas de IA.',
    requires: 'Contrato pago com um fornecedor externo — decisão de negócio pendente, não avaliado tecnicamente.',
  },
]
