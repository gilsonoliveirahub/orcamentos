import { describe, it, expect } from 'vitest'
import { computeProfileCompleteness } from './profile-completeness'

const complete = {
  description: 'Pinto casas e escritórios há mais de 10 anos, trabalho limpo e rápido.',
  avatar_url: 'https://x/avatar.jpg',
  zone: 'Lisboa',
  phone: '351912345678',
  portfolioCount: 3,
  reviewsCount: 2,
}

describe('computeProfileCompleteness', () => {
  it('perfil totalmente preenchido: 100%, todos os itens concluídos', () => {
    const r = computeProfileCompleteness(complete)
    expect(r.percent).toBe(100)
    expect(r.completedCount).toBe(r.totalCount)
    expect(r.items.every(i => i.done)).toBe(true)
  })

  it('perfil vazio: 0%, nenhum item concluído', () => {
    const r = computeProfileCompleteness({ description: null, avatar_url: null, zone: null, phone: null, portfolioCount: 0, reviewsCount: 0 })
    expect(r.percent).toBe(0)
    expect(r.completedCount).toBe(0)
  })

  it('descrição curta demais não conta como preenchida (menos de 20 caracteres)', () => {
    const r = computeProfileCompleteness({ ...complete, description: 'Pintor' })
    const item = r.items.find(i => i.key === 'description')
    expect(item?.done).toBe(false)
  })

  it('descrição só com espaços não conta como preenchida', () => {
    const r = computeProfileCompleteness({ ...complete, description: '                     ' })
    expect(r.items.find(i => i.key === 'description')?.done).toBe(false)
  })

  it('percentagem parcial arredondada corretamente (ex: 4 de 6 = 67%)', () => {
    const r = computeProfileCompleteness({ ...complete, portfolioCount: 0, reviewsCount: 0 })
    expect(r.completedCount).toBe(4)
    expect(r.percent).toBe(67)
  })

  it('nunca inclui nome nem especialidade (já obrigatórios no registo, não informam nada de novo)', () => {
    const r = computeProfileCompleteness(complete)
    expect(r.items.some(i => i.key === 'name' || i.key === 'specialty')).toBe(false)
  })
})
