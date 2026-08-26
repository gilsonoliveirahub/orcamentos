import { describe, it, expect } from 'vitest'
import { sortProfessionalsForRanking } from './professional-ranking'

describe('sortProfessionalsForRanking', () => {
  it('plano continua a mandar primeiro (pro > starter > free) — modelo de negócio intacto', () => {
    const profs = [
      { id: 'free-1', plan: 'free', created_at: '2020-01-01T00:00:00Z' },
      { id: 'pro-1', plan: 'pro', created_at: '2026-01-01T00:00:00Z' },
      { id: 'starter-1', plan: 'starter', created_at: '2021-01-01T00:00:00Z' },
    ]
    const sorted = sortProfessionalsForRanking(profs, {})
    expect(sorted.map(p => p.id)).toEqual(['pro-1', 'starter-1', 'free-1'])
  })

  it('mesmo plano: desempata por fiabilidade (score mais alto primeiro), não só por antiguidade', () => {
    const profs = [
      { id: 'pro-antigo-mau', plan: 'pro', created_at: '2020-01-01T00:00:00Z' },
      { id: 'pro-novo-bom', plan: 'pro', created_at: '2026-01-01T00:00:00Z' },
    ]
    const scores = { 'pro-antigo-mau': { score: 0.2, total: 10 }, 'pro-novo-bom': { score: 0.9, total: 5 } }
    const sorted = sortProfessionalsForRanking(profs, scores)
    expect(sorted.map(p => p.id)).toEqual(['pro-novo-bom', 'pro-antigo-mau'])
  })

  it('mesmo plano e mesma fiabilidade (ou sem dados): cai para antiguidade, mais antigo primeiro', () => {
    const profs = [
      { id: 'novo', plan: 'starter', created_at: '2026-01-01T00:00:00Z' },
      { id: 'antigo', plan: 'starter', created_at: '2020-01-01T00:00:00Z' },
    ]
    const sorted = sortProfessionalsForRanking(profs, {})
    expect(sorted.map(p => p.id)).toEqual(['antigo', 'novo'])
  })

  it('sem nenhum score carregado (endpoint falhou): comportamento igual ao anterior (só plano + antiguidade)', () => {
    const profs = [
      { id: 'a', plan: 'free', created_at: '2022-01-01T00:00:00Z' },
      { id: 'b', plan: 'free', created_at: '2021-01-01T00:00:00Z' },
    ]
    const sorted = sortProfessionalsForRanking(profs, {})
    expect(sorted.map(p => p.id)).toEqual(['b', 'a'])
  })

  it('profissional sem entrada no agregado (nunca teve leads): tratado como score neutro 1, não penalizado', () => {
    const profs = [
      { id: 'sem-leads', plan: 'pro', created_at: '2026-01-01T00:00:00Z' },
      { id: 'com-falhas', plan: 'pro', created_at: '2020-01-01T00:00:00Z' },
    ]
    const scores = { 'com-falhas': { score: 0.3, total: 8 } } // 'sem-leads' ausente do mapa
    const sorted = sortProfessionalsForRanking(profs, scores)
    expect(sorted.map(p => p.id)).toEqual(['sem-leads', 'com-falhas'])
  })
})
