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

  it('mesmo plano: quem está em pausa (accepting_leads=false) nunca fica à frente de quem está a aceitar', () => {
    const profs = [
      { id: 'pausado-antigo', plan: 'pro', created_at: '2020-01-01T00:00:00Z', accepting_leads: false },
      { id: 'ativo-novo', plan: 'pro', created_at: '2026-01-01T00:00:00Z', accepting_leads: true },
    ]
    const sorted = sortProfessionalsForRanking(profs, {})
    expect(sorted.map(p => p.id)).toEqual(['ativo-novo', 'pausado-antigo'])
  })

  it('accepting_leads ausente/null (coluna nunca definida): conta como disponível, não penaliza', () => {
    const profs = [
      { id: 'sem-campo', plan: 'pro', created_at: '2026-01-01T00:00:00Z' },
      { id: 'pausado', plan: 'pro', created_at: '2020-01-01T00:00:00Z', accepting_leads: false },
    ]
    const sorted = sortProfessionalsForRanking(profs, {})
    expect(sorted.map(p => p.id)).toEqual(['sem-campo', 'pausado'])
  })

  it('mesmo plano, disponibilidade e fiabilidade: desempata por menos pedidos ativos agora (mais capacidade primeiro)', () => {
    const profs = [
      { id: 'sobrecarregado', plan: 'pro', created_at: '2020-01-01T00:00:00Z' },
      { id: 'com-espaco', plan: 'pro', created_at: '2026-01-01T00:00:00Z' },
    ]
    const scores = {
      sobrecarregado: { score: 1, total: 5, active_count: 8 },
      'com-espaco': { score: 1, total: 5, active_count: 1 },
    }
    const sorted = sortProfessionalsForRanking(profs, scores)
    expect(sorted.map(p => p.id)).toEqual(['com-espaco', 'sobrecarregado'])
  })

  it('sem active_count no agregado: trata como zero, não penaliza quem falta no mapa', () => {
    const profs = [
      { id: 'sem-dado', plan: 'pro', created_at: '2026-01-01T00:00:00Z' },
      { id: 'com-carga', plan: 'pro', created_at: '2020-01-01T00:00:00Z' },
    ]
    const scores = { 'com-carga': { score: 1, total: 5, active_count: 3 } }
    const sorted = sortProfessionalsForRanking(profs, scores)
    expect(sorted.map(p => p.id)).toEqual(['sem-dado', 'com-carga'])
  })

  it('mesmo plano/disponibilidade/fiabilidade: desempata por conversão (fecha mais do que perde) antes de antiguidade', () => {
    const profs = [
      { id: 'perde-muito', plan: 'pro', created_at: '2020-01-01T00:00:00Z' },
      { id: 'converte-bem', plan: 'pro', created_at: '2026-01-01T00:00:00Z' },
    ]
    const scores = {
      'perde-muito': { score: 1, total: 10, conversion_rate: 0.2 },
      'converte-bem': { score: 1, total: 10, conversion_rate: 0.9 },
    }
    const sorted = sortProfessionalsForRanking(profs, scores)
    expect(sorted.map(p => p.id)).toEqual(['converte-bem', 'perde-muito'])
  })

  it('mesmo plano/disponibilidade/fiabilidade/conversão: desempata por resposta mais rápida', () => {
    const profs = [
      { id: 'lento', plan: 'pro', created_at: '2020-01-01T00:00:00Z' },
      { id: 'rapido', plan: 'pro', created_at: '2026-01-01T00:00:00Z' },
    ]
    const scores = {
      lento: { score: 1, total: 5, conversion_rate: 1, avg_response_hours: 48 },
      rapido: { score: 1, total: 5, conversion_rate: 1, avg_response_hours: 2 },
    }
    const sorted = sortProfessionalsForRanking(profs, scores)
    expect(sorted.map(p => p.id)).toEqual(['rapido', 'lento'])
  })

  it('velocidade de resposta sem dado (null) num dos dois: não compara, passa para o critério seguinte', () => {
    const profs = [
      { id: 'sem-dado-resposta', plan: 'pro', created_at: '2026-01-01T00:00:00Z' },
      { id: 'com-dado-lento', plan: 'pro', created_at: '2020-01-01T00:00:00Z' },
    ]
    const scores = {
      'sem-dado-resposta': { score: 1, total: 5, conversion_rate: 1, avg_response_hours: null, active_count: 5 },
      'com-dado-lento': { score: 1, total: 5, conversion_rate: 1, avg_response_hours: 48, active_count: 1 },
    }
    // Sem poder comparar resposta, cai para capacidade: menos ativos primeiro.
    const sorted = sortProfessionalsForRanking(profs, scores)
    expect(sorted.map(p => p.id)).toEqual(['com-dado-lento', 'sem-dado-resposta'])
  })

  it('sem localização do cliente (distances omitido): comportamento idêntico a antes, nunca quebra chamadas existentes', () => {
    const profs = [
      { id: 'antigo', plan: 'starter', created_at: '2020-01-01T00:00:00Z' },
      { id: 'novo', plan: 'starter', created_at: '2026-01-01T00:00:00Z' },
    ]
    const sorted = sortProfessionalsForRanking(profs, {})
    expect(sorted.map(p => p.id)).toEqual(['antigo', 'novo'])
  })

  it('mesmo plano/disponibilidade/fiabilidade/conversão/resposta/capacidade: desempata por proximidade ao cliente', () => {
    const profs = [
      { id: 'longe', plan: 'pro', created_at: '2020-01-01T00:00:00Z' },
      { id: 'perto', plan: 'pro', created_at: '2026-01-01T00:00:00Z' },
    ]
    const scores = {
      longe: { score: 1, total: 5, conversion_rate: 1, avg_response_hours: 5, active_count: 2 },
      perto: { score: 1, total: 5, conversion_rate: 1, avg_response_hours: 5, active_count: 2 },
    }
    const distances = { longe: 40, perto: 5 }
    const sorted = sortProfessionalsForRanking(profs, scores, distances)
    expect(sorted.map(p => p.id)).toEqual(['perto', 'longe'])
  })

  it('proximidade sem dado num dos dois: não compara, cai para antiguidade (nunca inventa distância)', () => {
    const profs = [
      { id: 'sem-distancia', plan: 'pro', created_at: '2026-01-01T00:00:00Z' },
      { id: 'com-distancia', plan: 'pro', created_at: '2020-01-01T00:00:00Z' },
    ]
    const scores = {
      'sem-distancia': { score: 1, total: 5, conversion_rate: 1, avg_response_hours: 5, active_count: 2 },
      'com-distancia': { score: 1, total: 5, conversion_rate: 1, avg_response_hours: 5, active_count: 2 },
    }
    const distances = { 'com-distancia': 10 } // 'sem-distancia' ausente do mapa
    const sorted = sortProfessionalsForRanking(profs, scores, distances)
    expect(sorted.map(p => p.id)).toEqual(['com-distancia', 'sem-distancia']) // antiguidade: mais antigo primeiro
  })

  it('proximidade nunca sobrepõe plano/disponibilidade/fiabilidade — só desempata dentro deles', () => {
    const profs = [
      { id: 'pro-longe', plan: 'pro', created_at: '2026-01-01T00:00:00Z' },
      { id: 'starter-perto', plan: 'starter', created_at: '2026-01-01T00:00:00Z' },
    ]
    const distances = { 'pro-longe': 50, 'starter-perto': 1 }
    const sorted = sortProfessionalsForRanking(profs, {}, distances)
    expect(sorted.map(p => p.id)).toEqual(['pro-longe', 'starter-perto'])
  })
})
