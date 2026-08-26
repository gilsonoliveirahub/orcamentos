// Arquitetura preparada para análise visual futura — SEM nenhuma chamada
// externa nesta fase (nenhuma decisão de fornecedor/custo foi tomada). A
// interface MediaAnalyzer é o contrato estável: qualquer implementação
// futura (ex: uma API de visão paga) troca-se aqui sem tocar em nada que a
// consuma. A implementação atual (DeterministicMediaAnalyzer) nunca analisa
// conteúdo — só classifica tipo de ficheiro — e marca isso explicitamente
// em `aiContentAnalysisAvailable: false`, para a interface nunca apresentar
// uma conclusão de conteúdo como facto quando na verdade não existe nenhuma.
//
// Extrair "quantidade/tipo de superfícies ou elementos visíveis" exigiria
// mesmo uma API de visão computacional (paga) ou um modelo local pesado —
// nenhum dos dois foi autorizado nesta fase. Fica documentado como
// pendente, não implementado por adivinhação.

import { isVideoUrl } from '@/lib/media-summary'

export type MediaAnalysisResult = {
  url: string
  type: 'image' | 'video'
  aiContentAnalysisAvailable: false
}

export interface MediaAnalyzer {
  analyze(mediaUrls: string[]): Promise<MediaAnalysisResult[]>
}

export class DeterministicMediaAnalyzer implements MediaAnalyzer {
  async analyze(mediaUrls: string[]): Promise<MediaAnalysisResult[]> {
    return mediaUrls.map(url => ({
      url,
      type: isVideoUrl(url) ? 'video' : 'image',
      aiContentAnalysisAvailable: false,
    }))
  }
}
