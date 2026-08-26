import { describe, it, expect } from 'vitest'
import { getAIProviderInfo, getMediaAnalyzer } from './ai-provider'

describe('getAIProviderInfo', () => {
  it('sem nenhum fornecedor configurado hoje — estado normal, não um erro', () => {
    expect(getAIProviderInfo()).toEqual({ configured: false, name: null })
  })
})

describe('getMediaAnalyzer', () => {
  it('devolve sempre um analisador funcional, mesmo sem fornecedor configurado', async () => {
    const analyzer = getMediaAnalyzer()
    const result = await analyzer.analyze(['a.jpg', 'b.mp4'])
    expect(result).toEqual([
      { url: 'a.jpg', type: 'image', aiContentAnalysisAvailable: false },
      { url: 'b.mp4', type: 'video', aiContentAnalysisAvailable: false },
    ])
  })

  it('nunca rebenta nem devolve algo vazio/indefinido só por não haver IA', async () => {
    const analyzer = getMediaAnalyzer()
    await expect(analyzer.analyze([])).resolves.toEqual([])
  })
})
