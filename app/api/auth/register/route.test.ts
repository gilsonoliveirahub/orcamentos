import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body, headers: new Headers() } as unknown as NextRequest
}

// `from('professionals')` precisa de suportar tanto a cadeia de leitura
// (select().eq().maybeSingle(), usada para a verificação de idempotência)
// como o insert() normal — `from('clients')` só usa insert().
function mockSupabaseAdmin({ createUser, existingProfessional = null, insertError = null }: {
  createUser: () => Promise<{ data: { user: { id: string } } | null; error: { message: string } | null }>
  existingProfessional?: { id: string } | null
  insertError?: { message: string } | null
}) {
  return {
    supabaseAdmin: {
      auth: { admin: { createUser } },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingProfessional, error: null }) }) }),
        insert: async () => ({ error: insertError }),
      }),
    },
  }
}

let emailMocks: { emailBoasVindas: ReturnType<typeof vi.fn>; emailNovaProfissao: ReturnType<typeof vi.fn>; emailNovoRegisto: ReturnType<typeof vi.fn> }

describe('POST /api/auth/register — mensagens de erro amigáveis', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // Fresh a cada teste — nunca partilhado, para não arrastar contagens de
    // chamadas de um teste para o seguinte (importa para os asserts de
    // "não foi chamado" nos testes de idempotência abaixo).
    emailMocks = { emailBoasVindas: vi.fn().mockResolvedValue(undefined), emailNovaProfissao: vi.fn().mockResolvedValue(undefined), emailNovoRegisto: vi.fn().mockResolvedValue(undefined) }
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/email')
    vi.doUnmock('@/lib/analytics')
  })

  it('email já registado no Supabase Auth: devolve mensagem em português, nunca o texto técnico original', async () => {
    vi.doMock('@/lib/supabase-admin', () => mockSupabaseAdmin({
      createUser: async () => ({ data: null, error: { message: 'User already registered' } }),
    }))
    vi.doMock('@/lib/email', () => emailMocks)

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ password: '123456', role: 'client', name: 'Cliente', email: 'ja@existe.com' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Este email já está registado. Tente entrar ou recuperar a password.')
    expect(json.error).not.toContain('User already registered')
  })

  it('violação de unique constraint ao criar profissional: devolve mensagem em português, nunca o SQL técnico', async () => {
    vi.doMock('@/lib/supabase-admin', () => mockSupabaseAdmin({
      createUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
      insertError: { message: 'duplicate key value violates unique constraint "professionals_slug_key"' },
    }))
    vi.doMock('@/lib/email', () => emailMocks)

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ password: '123456', role: 'professional', name: 'Profissional', email: 'novo@example.com', specialty: 'Pintura' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Já existe um registo com estes dados.')
    expect(json.error).not.toContain('constraint')
  })

  it('erro inesperado (exceção): devolve mensagem genérica em português, nunca a mensagem da exceção', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        auth: { admin: { createUser: async () => { throw new Error('ECONNREFUSED 127.0.0.1:5432') } } },
      },
    }))
    vi.doMock('@/lib/email', () => emailMocks)

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ password: '123456', role: 'client', name: 'Cliente', email: 'x@example.com' }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Não foi possível concluir o pedido. Tente novamente dentro de instantes.')
    expect(json.error).not.toContain('ECONNREFUSED')
  })

  it('sucesso: cria a conta normalmente e não mexe na resposta de sucesso', async () => {
    vi.doMock('@/lib/supabase-admin', () => mockSupabaseAdmin({
      createUser: async () => ({ data: { user: { id: 'user-2' } }, error: null }),
    }))
    vi.doMock('@/lib/email', () => emailMocks)
    vi.doMock('@/lib/analytics', () => ({ recordRegistrationCompleted: vi.fn().mockResolvedValue(undefined), clientIpFrom: () => 'unknown' }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ password: '123456', role: 'client', name: 'Cliente', email: 'ok@example.com' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
  })

  it('sucesso profissional: regista registration_completed uma única vez, com papel "profissional"', async () => {
    const recordRegistrationCompleted = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/supabase-admin', () => mockSupabaseAdmin({
      createUser: async () => ({ data: { user: { id: 'user-3' } }, error: null }),
    }))
    vi.doMock('@/lib/email', () => emailMocks)
    vi.doMock('@/lib/analytics', () => ({ recordRegistrationCompleted, clientIpFrom: () => '1.2.3.4' }))

    const { POST } = await import('./route')
    await POST(fakeRequest({ password: '123456', role: 'professional', name: 'Profissional', email: 'prof@example.com', specialty: 'Pintura' }))

    expect(recordRegistrationCompleted).toHaveBeenCalledTimes(1)
    expect(recordRegistrationCompleted).toHaveBeenCalledWith(expect.objectContaining({ role: 'profissional' }))
  })

  it('sucesso cliente: regista registration_completed uma única vez, com papel "cliente"', async () => {
    const recordRegistrationCompleted = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/supabase-admin', () => mockSupabaseAdmin({
      createUser: async () => ({ data: { user: { id: 'user-4' } }, error: null }),
    }))
    vi.doMock('@/lib/email', () => emailMocks)
    vi.doMock('@/lib/analytics', () => ({ recordRegistrationCompleted, clientIpFrom: () => '1.2.3.4' }))

    const { POST } = await import('./route')
    await POST(fakeRequest({ password: '123456', role: 'client', name: 'Cliente', email: 'cliente@example.com' }))

    expect(recordRegistrationCompleted).toHaveBeenCalledTimes(1)
    expect(recordRegistrationCompleted).toHaveBeenCalledWith(expect.objectContaining({ role: 'cliente' }))
  })

  it('profissional já existente com o mesmo user_id (reenvio): não cria duplicado nem regista o evento outra vez', async () => {
    const recordRegistrationCompleted = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/supabase-admin', () => mockSupabaseAdmin({
      createUser: async () => ({ data: { user: { id: 'user-5' } }, error: null }),
      existingProfessional: { id: 'prof-already-exists' },
    }))
    vi.doMock('@/lib/email', () => emailMocks)
    vi.doMock('@/lib/analytics', () => ({ recordRegistrationCompleted, clientIpFrom: () => '1.2.3.4' }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ password: '123456', role: 'professional', name: 'Profissional', email: 'reenvio@example.com', specialty: 'Pintura' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(recordRegistrationCompleted).not.toHaveBeenCalled()
    expect(emailMocks.emailBoasVindas).not.toHaveBeenCalled()
  })
})
