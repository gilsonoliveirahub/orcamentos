import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

describe('POST /api/auth/register — mensagens de erro amigáveis', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/email')
  })

  it('email já registado no Supabase Auth: devolve mensagem em português, nunca o texto técnico original', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        auth: { admin: { createUser: async () => ({ data: null, error: { message: 'User already registered' } }) } },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailBoasVindas: vi.fn().mockResolvedValue(undefined), emailNovaProfissao: vi.fn().mockResolvedValue(undefined), emailNovoRegisto: vi.fn().mockResolvedValue(undefined) }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ password: '123456', role: 'client', name: 'Cliente', email: 'ja@existe.com' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Este email já está registado. Tente entrar ou recuperar a password.')
    expect(json.error).not.toContain('User already registered')
  })

  it('violação de unique constraint ao criar profissional: devolve mensagem em português, nunca o SQL técnico', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        auth: { admin: { createUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } },
        from: () => ({ insert: async () => ({ error: { message: 'duplicate key value violates unique constraint "professionals_slug_key"' } }) }),
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailBoasVindas: vi.fn().mockResolvedValue(undefined), emailNovaProfissao: vi.fn().mockResolvedValue(undefined), emailNovoRegisto: vi.fn().mockResolvedValue(undefined) }))

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
    vi.doMock('@/lib/email', () => ({ emailBoasVindas: vi.fn().mockResolvedValue(undefined), emailNovaProfissao: vi.fn().mockResolvedValue(undefined), emailNovoRegisto: vi.fn().mockResolvedValue(undefined) }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ password: '123456', role: 'client', name: 'Cliente', email: 'x@example.com' }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Não foi possível concluir o pedido. Tente novamente dentro de instantes.')
    expect(json.error).not.toContain('ECONNREFUSED')
  })

  it('sucesso: cria a conta normalmente e não mexe na resposta de sucesso', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        auth: { admin: { createUser: async () => ({ data: { user: { id: 'user-2' } }, error: null }) } },
        from: () => ({ insert: async () => ({ error: null }) }),
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailBoasVindas: vi.fn().mockResolvedValue(undefined), emailNovaProfissao: vi.fn().mockResolvedValue(undefined), emailNovoRegisto: vi.fn().mockResolvedValue(undefined) }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ password: '123456', role: 'client', name: 'Cliente', email: 'ok@example.com' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
  })
})
