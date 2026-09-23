import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function mockAuth(userId: string | null) {
  vi.doMock('@/lib/supabase-server', () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    }),
  }))
}

// review_invites.select(...).eq(...).eq(...) termina em .ilike() (canal
// email) ou .eq() (canal whatsapp) — os dois têm de devolver um objeto
// "thenable" com .maybeSingle(), por isso a chain simula ambos os finais.
function existingCheckChain(data: unknown) {
  const terminal = { maybeSingle: async () => ({ data }) }
  return { select: () => ({ eq: () => ({ eq: () => ({ ilike: () => terminal, eq: () => terminal }) }) }) }
}

describe('POST /api/review-invites', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-server')
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/email')
    vi.doUnmock('@/lib/whatsapp')
  })

  it('bloqueia quem não está autenticado', async () => {
    mockAuth(null)
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao: vi.fn() }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: 'Cliente', channel: 'email', client_email: 'c@example.com' }))
    expect(res.status).toBe(403)
  })

  it('rejeita nome em falta, sem chegar a tocar na BD', async () => {
    mockAuth('user-1')
    const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', name: 'Ana' } }) }) }) }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao: vi.fn() }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: '', channel: 'email', client_email: 'c@example.com' }))
    expect(res.status).toBe(400)
  })

  it('rejeita canal desconhecido', async () => {
    mockAuth('user-1')
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', name: 'Ana' } }) }) }) }) },
    }))
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao: vi.fn() }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: 'Cliente', channel: 'sms', client_email: 'c@example.com' }))
    expect(res.status).toBe(400)
  })

  it('canal email: rejeita email com formato inválido', async () => {
    mockAuth('user-1')
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', name: 'Ana' } }) }) }) }) },
    }))
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao: vi.fn() }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: 'Cliente', channel: 'email', client_email: 'nao-e-um-email' }))
    expect(res.status).toBe(400)
  })

  it('canal whatsapp: rejeita telemóvel demasiado curto', async () => {
    mockAuth('user-1')
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', name: 'Ana' } }) }) }) }) },
    }))
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao: vi.fn() }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: 'Cliente', channel: 'whatsapp', client_phone: '123' }))
    expect(res.status).toBe(400)
  })

  it('já existe um convite pendente para o mesmo email: 409, nunca cria nem envia', async () => {
    mockAuth('user-1')
    const insert = vi.fn()
    const emailConviteAvaliacao = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', name: 'Ana' } }) }) }) }
          if (table === 'review_invites') return { ...existingCheckChain({ id: 'existing-invite' }), insert }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: 'Cliente', channel: 'email', client_email: 'cliente@example.com' }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.reason).toBe('already_pending')
    expect(insert).not.toHaveBeenCalled()
    expect(emailConviteAvaliacao).not.toHaveBeenCalled()
  })

  it('canal email: cria o convite e envia o email quando não há nenhum pendente', async () => {
    mockAuth('user-1')
    const emailConviteAvaliacao = vi.fn().mockResolvedValue(undefined)
    let insertArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', name: 'Ana' } }) }) }) }
          if (table === 'review_invites') {
            return {
              ...existingCheckChain(null),
              insert: (payload: Record<string, unknown>) => {
                insertArgs = payload
                return { select: () => ({ single: async () => ({ data: { id: 'invite-1', ...payload, status: 'pending', created_at: '2026-01-01' }, error: null }) }) }
              },
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: '  Cliente  ', channel: 'email', client_email: '  Cliente@Example.com  ' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(insertArgs).toEqual({ professional_id: 'prof-1', client_name: 'Cliente', channel: 'email', client_email: 'cliente@example.com', client_phone: null })
    expect(emailConviteAvaliacao).toHaveBeenCalledWith({ profName: 'Ana', clientName: 'Cliente', clientEmail: 'cliente@example.com', inviteId: 'invite-1' })
    expect(json.send_error).toBeNull()
  })

  it('canal whatsapp: cria o convite e envia por WhatsApp, nunca chama o email', async () => {
    mockAuth('user-1')
    process.env.REVIEW_TOKEN_SECRET = 'segredo-teste'
    const emailConviteAvaliacao = vi.fn()
    const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
    let insertArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', name: 'Ana' } }) }) }) }
          if (table === 'review_invites') {
            return {
              ...existingCheckChain(null),
              insert: (payload: Record<string, unknown>) => {
                insertArgs = payload
                return { select: () => ({ single: async () => ({ data: { id: 'invite-1', ...payload, status: 'pending', created_at: '2026-01-01' }, error: null }) }) }
              },
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: 'Cliente', channel: 'whatsapp', client_phone: '351 912 345 678' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(insertArgs).toEqual({ professional_id: 'prof-1', client_name: 'Cliente', channel: 'whatsapp', client_email: null, client_phone: '351912345678' })
    expect(sendWhatsApp).toHaveBeenCalledTimes(1)
    expect(sendWhatsApp.mock.calls[0][0]).toBe('351912345678')
    expect(sendWhatsApp.mock.calls[0][1]).toContain('/avaliar-convite/invite-1?token=')
    expect(emailConviteAvaliacao).not.toHaveBeenCalled()
    expect(json.send_error).toBeNull()

    delete process.env.REVIEW_TOKEN_SECRET
  })

  it('convite criado mesmo que o envio do email falhe — devolve o erro, mas não bloqueia', async () => {
    mockAuth('user-1')
    const emailConviteAvaliacao = vi.fn().mockRejectedValue(new Error('Resend fora do ar'))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', name: 'Ana' } }) }) }) }
          if (table === 'review_invites') {
            return {
              ...existingCheckChain(null),
              insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'invite-1', client_name: 'Cliente', channel: 'email', client_email: 'cliente@example.com', status: 'pending', created_at: '2026-01-01' }, error: null }) }) }),
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp: vi.fn() }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: 'Cliente', channel: 'email', client_email: 'cliente@example.com' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.invite.id).toBe('invite-1')
    expect(json.send_error).toContain('Resend fora do ar')
  })

  it('convite criado mesmo que o envio por WhatsApp falhe — devolve o erro, mas não bloqueia', async () => {
    mockAuth('user-1')
    process.env.REVIEW_TOKEN_SECRET = 'segredo-teste'
    const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'failed', reason: 'twilio_500' })
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', name: 'Ana' } }) }) }) }
          if (table === 'review_invites') {
            return {
              ...existingCheckChain(null),
              insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'invite-1', client_name: 'Cliente', channel: 'whatsapp', client_phone: '351912345678', status: 'pending', created_at: '2026-01-01' }, error: null }) }) }),
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao: vi.fn() }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: 'Cliente', channel: 'whatsapp', client_phone: '351912345678' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.send_error).toBe('twilio_500')

    delete process.env.REVIEW_TOKEN_SECRET
  })
})

describe('GET /api/review-invites', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-server')
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('bloqueia quem não está autenticado', async () => {
    mockAuth(null)
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('devolve só os convites do profissional autenticado', async () => {
    mockAuth('user-1')
    const invites = [{ id: 'i1', client_name: 'Cliente', channel: 'email', client_email: 'c@example.com', client_phone: null, status: 'pending', created_at: '2026-01-01', completed_at: null }]
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'review_invites') return { select: () => ({ eq: () => ({ order: async () => ({ data: invites }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    const { GET } = await import('./route')
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.invites).toEqual(invites)
  })
})
