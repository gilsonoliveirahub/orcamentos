import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function fakeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/admin/professionals/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@supabase/ssr')
    vi.doUnmock('next/headers')
  })

  it('bloqueia quem não está autenticado', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
    }))
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { PATCH } = await import('./route')
    const res = await PATCH(fakeRequest({ name: 'Novo nome' }), fakeParams('prof-1'))

    expect(res.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })

  it('bloqueia utilizador autenticado que não é admin', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
    }))
    const from = vi.fn((table: string) => {
      if (table === 'admins') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { PATCH } = await import('./route')
    const res = await PATCH(fakeRequest({ name: 'Novo nome' }), fakeParams('prof-1'))

    expect(res.status).toBe(403)
  })

  it('admin autenticado consegue editar campos permitidos e fica registado em auditoria', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) } }),
    }))

    const before = { name: 'Nome Antigo', phone: null, specialties: [], zone: null, description: null, active: true }
    const after = { name: 'Nome Novo', phone: null, specialties: [], zone: null, description: null, active: true }
    const auditInserts: Record<string, unknown>[] = []

    const from = vi.fn((table: string) => {
      if (table === 'admins') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'admin-row-1' } }) }) }) }
      }
      if (table === 'professionals') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: before, error: null }) }) }),
          update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: after, error: null }) }) }) }),
        }
      }
      if (table === 'admin_audit_log') {
        return { insert: (payload: Record<string, unknown>) => { auditInserts.push(payload); return Promise.resolve({ error: null }) } }
      }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { PATCH } = await import('./route')
    const res = await PATCH(fakeRequest({ name: 'Nome Novo' }), fakeParams('prof-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.professional.name).toBe('Nome Novo')
    expect(auditInserts).toHaveLength(1)
    expect(auditInserts[0].professional_id).toBe('prof-1')
    expect(auditInserts[0].admin_id).toBe('admin-1')
    const changes = auditInserts[0].changes as Record<string, unknown>
    expect(changes.name).toEqual({ before: 'Nome Antigo', after: 'Nome Novo' })
  })

  it('ignora silenciosamente campos fora da whitelist (email, stripe, user_id, password)', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) } }),
    }))

    const before = { name: 'Nome', phone: null, specialties: [], zone: null, description: null, active: true }
    const captured: { update: Record<string, unknown> } = { update: {} }

    const from = vi.fn((table: string) => {
      if (table === 'admins') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'a' } }) }) }) }
      if (table === 'professionals') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: before, error: null }) }) }),
          update: (payload: Record<string, unknown>) => {
            captured.update = payload
            return { eq: () => ({ select: () => ({ single: async () => ({ data: { ...before, ...payload }, error: null }) }) }) }
          },
        }
      }
      if (table === 'admin_audit_log') return { insert: async () => ({ error: null }) }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { PATCH } = await import('./route')
    await PATCH(fakeRequest({
      name: 'Nome Novo',
      email: 'hack@invalido.com',
      user_id: 'outro-user',
      stripe_customer_id: 'cus_fake',
      password: 'nova-password',
      active: false,
    }), fakeParams('prof-1'))

    expect(captured.update).toEqual({ name: 'Nome Novo', active: false })
    expect(captured.update.email).toBeUndefined()
    expect(captured.update.user_id).toBeUndefined()
    expect(captured.update.stripe_customer_id).toBeUndefined()
    expect(captured.update.password).toBeUndefined()
  })

  it('devolve 404 se o profissional não existir', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) } }),
    }))
    const from = vi.fn((table: string) => {
      if (table === 'admins') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'a' } }) }) }) }
      if (table === 'professionals') return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'not found' } }) }) }) }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { PATCH } = await import('./route')
    const res = await PATCH(fakeRequest({ name: 'X' }), fakeParams('prof-inexistente'))

    expect(res.status).toBe(404)
  })
})
