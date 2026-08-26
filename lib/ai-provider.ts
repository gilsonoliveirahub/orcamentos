// Camada de indireção para qualquer funcionalidade de IA do FaçoPorTi — o
// resto da aplicação (qualificação, media) nunca deve importar um SDK de
// fornecedor (OpenAI, Anthropic, Google...) diretamente nem decidir sozinho
// se há IA disponível; pergunta sempre a este módulo. Trocar de fornecedor
// no futuro é mudar só aqui, nunca no fluxo principal que o consome.
//
// Hoje não há nenhum fornecedor configurado (nem chave, nem contrato) —
// isConfigured=false é o estado normal e esperado, não um erro. Nenhuma
// chamada externa é feita a partir deste ficheiro nem de mais lado nenhum.

import { DeterministicMediaAnalyzer, type MediaAnalyzer } from '@/lib/media-analysis'

export type AIProviderInfo = { configured: boolean; name: string | null }

export function getAIProviderInfo(): AIProviderInfo {
  // Único sítio que um dia vai ler a configuração real (ex: variável de
  // ambiente com o fornecedor escolhido) — até essa decisão ser tomada e
  // aprovada, mantém-se sempre "não configurado".
  return { configured: false, name: null }
}

/**
 * Ponto único de obtenção de um MediaAnalyzer — nunca instanciar
 * DeterministicMediaAnalyzer (ou uma futura implementação real) fora
 * daqui. Sem fornecedor configurado, devolve sempre o fallback
 * determinístico; a ausência de IA nunca pode impedir nada no fluxo
 * principal, por isso este fallback tem de continuar a funcionar sempre,
 * mesmo depois de um fornecedor real existir (ex: se a chamada externa
 * falhar).
 */
export function getMediaAnalyzer(): MediaAnalyzer {
  const { configured } = getAIProviderInfo()
  if (!configured) return new DeterministicMediaAnalyzer()
  // Quando houver decisão de fornecedor aprovada, troca-se esta linha por
  // uma implementação real de MediaAnalyzer — nada fora deste ficheiro
  // precisa de mudar.
  return new DeterministicMediaAnalyzer()
}
