import { describe, it, expect } from 'vitest'
import { QUESTIONS, parseAnswer, getNextQuestion } from './questions'

describe('parseAnswer', () => {
  it('nunca devolve uma string para perguntas do tipo photos — a coluna é text[]', () => {
    const photosQuestion = QUESTIONS.find(q => q.key === 'q11_fotos_url')!
    expect(parseAnswer(photosQuestion, 'saltar')).toEqual([])
    expect(parseAnswer(photosQuestion, 'Tinta marca CIN vinil Mat')).toEqual([])
    expect(parseAnswer(photosQuestion, '')).toEqual([])
  })

  it('interpreta perguntas de número', () => {
    const areaQuestion = QUESTIONS.find(q => q.key === 'q3_area_m2')!
    expect(parseAnswer(areaQuestion, '80')).toBe(80)
    expect(parseAnswer(areaQuestion, '80m²')).toBe(80) // símbolo ² não é dígito, é removido
    expect(parseAnswer(areaQuestion, 'não sei')).toBeNull()
  })

  it('interpreta perguntas booleanas por número ou palavra', () => {
    const fissurasQuestion = QUESTIONS.find(q => q.key === 'q5_fissuras')!
    expect(parseAnswer(fissurasQuestion, '1')).toBe(true)
    expect(parseAnswer(fissurasQuestion, 'sim')).toBe(true)
    expect(parseAnswer(fissurasQuestion, '2')).toBe(false)
    expect(parseAnswer(fissurasQuestion, 'não')).toBe(false)
  })
})

describe('getNextQuestion', () => {
  it('avança sequencialmente e devolve null no fim', () => {
    expect(getNextQuestion(1)?.id).toBe(2)
    expect(getNextQuestion(11)?.id).toBe(12)
    expect(getNextQuestion(12)).toBeNull()
  })
})

describe('texto da primeira pergunta', () => {
  it('apresenta-se como Façoporti, nunca menciona Gilson', () => {
    expect(QUESTIONS[0].text).toContain('Façoporti')
    expect(QUESTIONS[0].text).not.toContain('Gilson')
  })
})
