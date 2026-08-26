import { describe, it, expect } from 'vitest'
import { toFriendlyMessage } from './friendly-error'

describe('toFriendlyMessage', () => {
  it('traduz email já registado (Supabase Auth)', () => {
    expect(toFriendlyMessage('User already registered')).toBe(
      'Este email já está registado. Tente entrar ou recuperar a password.'
    )
  })

  it('violação de unique constraint cujo nome menciona email: usa a mensagem mais específica de email duplicado', () => {
    expect(toFriendlyMessage('duplicate key value violates unique constraint "professionals_email_key"'))
      .toBe('Este email já está registado. Tente entrar ou recuperar a password.')
  })

  it('violação de unique constraint sem menção a email: usa a mensagem genérica de registo duplicado', () => {
    expect(toFriendlyMessage('duplicate key value violates unique constraint "professionals_slug_key"'))
      .toBe('Já existe um registo com estes dados.')
  })

  it('traduz password fraca/curta', () => {
    expect(toFriendlyMessage('Password should be at least 6 characters')).toBe(
      'A password é demasiado curta ou fraca. Use pelo menos 6 caracteres.'
    )
  })

  it('traduz email inválido', () => {
    expect(toFriendlyMessage('Unable to validate email address: invalid format')).toBe(
      'O email indicado não é válido.'
    )
  })

  it('traduz violação de not-null', () => {
    expect(toFriendlyMessage('null value in column "phone" violates not-null constraint')).toBe(
      'Falta preencher um campo obrigatório.'
    )
  })

  it('traduz rate limit', () => {
    expect(toFriendlyMessage('Email rate limit exceeded')).toBe(
      'Demasiados pedidos em pouco tempo. Aguarde um momento e tente novamente.'
    )
  })

  it('cai no fallback genérico para erro não reconhecido, sem nunca expor o texto técnico original', () => {
    const raw = 'relation "xyz_internal_table" does not exist at line 42'
    const friendly = toFriendlyMessage(raw)
    expect(friendly).toBe('Não foi possível concluir o pedido. Tente novamente dentro de instantes.')
    expect(friendly).not.toContain('xyz_internal_table')
  })

  it('cai no fallback genérico quando não há mensagem nenhuma', () => {
    expect(toFriendlyMessage(null)).toBe('Não foi possível concluir o pedido. Tente novamente dentro de instantes.')
    expect(toFriendlyMessage(undefined)).toBe('Não foi possível concluir o pedido. Tente novamente dentro de instantes.')
    expect(toFriendlyMessage('')).toBe('Não foi possível concluir o pedido. Tente novamente dentro de instantes.')
  })
})
