import { describe, it, expect } from 'vitest'
import { DeterministicMediaAnalyzer } from './media-analysis'

describe('DeterministicMediaAnalyzer', () => {
  const analyzer = new DeterministicMediaAnalyzer()

  it('classifica tipo por extensão, nunca analisa conteúdo', async () => {
    const results = await analyzer.analyze(['a.jpg', 'b.mp4'])
    expect(results).toEqual([
      { url: 'a.jpg', type: 'image', aiContentAnalysisAvailable: false },
      { url: 'b.mp4', type: 'video', aiContentAnalysisAvailable: false },
    ])
  })

  it('nunca marca aiContentAnalysisAvailable como true — nenhuma análise de IA está ligada nesta fase', async () => {
    const results = await analyzer.analyze(['x.jpg'])
    expect(results[0].aiContentAnalysisAvailable).toBe(false)
  })

  it('sem media: lista vazia', async () => {
    expect(await analyzer.analyze([])).toEqual([])
  })
})
