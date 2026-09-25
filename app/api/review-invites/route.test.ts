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

// review_invites.select(...).eq(...).in(...) termina em .ilike() (canal
// email) ou .eq() (canal whatsapp) — os dois têm de devolver um objeto
// "thenable" com .maybeSingle(), por isso a chain simula ambos os finais.
function existingCheckChain(data: unknown) {
  const terminal = { maybeSingle: async () => ({ data }) }
  return { select: () => ({ eq: () => ({ in: () => ({ ilike: () => terminal, eq: () => terminal }) }) }) }
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

  // review_invites precisa de suportar .update() a partir desta versão —
  // sendInviteMessage (lib/send-review-invite.ts) grava sempre o estado
  // real do envio (send_status/send_error) depois de tentar, para ambos os
  // canais. mockReviewInvitesTable junta insert() + update() num só sítio.
  function mockReviewInvitesTable(insertHandler: (payload: Record<string, unknown>) => unknown, updateSpy?: (payload: Record<string, unknown>) => void) {
    return {
      ...existingCheckChain(null),
      insert: insertHandler,
      update: (payload: Record<string, unknown>) => {
        updateSpy?.(payload)
        return { eq: async () => ({ error: null }) }
      },
    }
  }

  it('canal email: cria o convite e envia o email quando não há nenhum pendente', async () => {
    mockAuth('user-1')
    const emailConviteAvaliacao = vi.fn().mockResolvedValue(undefined)
    let insertArgs: Record<string, unknown> | null = null
    let updateArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', name: 'Ana' } }) }) }) }
          if (table === 'review_invites') {
            return mockReviewInvitesTable((payload: Record<string, unknown>) => {
              insertArgs = payload
              return { select: () => ({ single: async () => ({ data: { id: 'invite-1', ...payload, status: 'pending', created_at: '2026-01-01' }, error: null }) }) }
            }, p => { updateArgs = p })
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: '  Cliente  ', channel: 'email', client_email: '  Cliente@Example.com  ' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(insertArgs).toEqual({ professional_id: 'prof-1', client_name: 'Cliente', channel: 'email', client_email: 'cliente@example.com', client_phone: null })
    expect(emailConviteAvaliacao).toHaveBeenCalledWith({ profName: 'Ana', clientName: 'Cliente', clientEmail: 'cliente@example.com', inviteId: 'invite-1' })
    expect(json.send_error).toBeNull()
    expect(updateArgs).toMatchObject({ send_status: 'sent', send_error: null })
  })

  it('canal whatsapp: cria o convite e envia pelo modelo aprovado (nunca texto livre), nunca chama o email', async () => {
    mockAuth('user-1')
    process.env.REVIEW_TOKEN_SECRET = 'segredo-teste'
    process.env.TWILIO_REVIEW_INVITE_CONTENT_SID = 'HXabc'
    const emailConviteAvaliacao = vi.fn()
    const sendWhatsAppTemplate = vi.fn().mockResolvedValue({ status: 'sent', messageSid: 'SM123' })
    let insertArgs: Record<string, unknown> | null = null
    let updateArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', name: 'Ana' } }) }) }) }
          if (table === 'review_invites') {
            return mockReviewInvitesTable((payload: Record<string, unknown>) => {
              insertArgs = payload
              return { select: () => ({ single: async () => ({ data: { id: 'invite-1', ...payload, status: 'pending', created_at: '2026-01-01' }, error: null }) }) }
            }, p => { updateArgs = p })
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: 'Cliente', channel: 'whatsapp', client_phone: '351 912 345 678' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(insertArgs).toEqual({ professional_id: 'prof-1', client_name: 'Cliente', channel: 'whatsapp', client_email: null, client_phone: '351912345678' })
    expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(1)
    const call = sendWhatsAppTemplate.mock.calls[0][0]
    expect(call.to).toBe('351912345678')
    expect(call.contentSid).toBe('HXabc')
    expect(call.contentVariables).toEqual({ '1': 'Cliente', '2': 'Ana', '3': expect.stringContaining('/avaliar-convite/invite-1?token=') })
    expect(call.statusCallbackUrl).toContain('/api/webhook/twilio-status')
    expect(emailConviteAvaliacao).not.toHaveBeenCalled()
    expect(json.send_error).toBeNull()
    expect(updateArgs).toMatchObject({ send_status: 'sent', send_error: null, whatsapp_message_sid: 'SM123' })

    delete process.env.REVIEW_TOKEN_SECRET
    delete process.env.TWILIO_REVIEW_INVITE_CONTENT_SID
  })

  it('convite criado mesmo que o envio do email falhe — devolve o erro, mas não bloqueia', async () => {
    mockAuth('user-1')
    const emailConviteAvaliacao = vi.fn().mockRejectedValue(new Error('Resend fora do ar'))
    let updateArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', name: 'Ana' } }) }) }) }
          if (table === 'review_invites') {
            return mockReviewInvitesTable(
              () => ({ select: () => ({ single: async () => ({ data: { id: 'invite-1', client_name: 'Cliente', channel: 'email', client_email: 'cliente@example.com', status: 'pending', created_at: '2026-01-01' }, error: null }) }) }),
              p => { updateArgs = p }
            )
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate: vi.fn() }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: 'Cliente', channel: 'email', client_email: 'cliente@example.com' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.invite.id).toBe('invite-1')
    expect(json.send_error).toContain('Resend fora do ar')
    expect(updateArgs).toMatchObject({ send_status: 'failed', send_error: 'Resend fora do ar' })
  })

  it('convite criado mesmo que o envio por WhatsApp falhe — devolve o erro, mas não bloqueia', async () => {
    mockAuth('user-1')
    process.env.REVIEW_TOKEN_SECRET = 'segredo-teste'
    process.env.TWILIO_REVIEW_INVITE_CONTENT_SID = 'HXabc'
    const sendWhatsAppTemplate = vi.fn().mockResolvedValue({ status: 'failed', reason: 'twilio_500' })
    let updateArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', name: 'Ana' } }) }) }) }
          if (table === 'review_invites') {
            return mockReviewInvitesTable(
              () => ({ select: () => ({ single: async () => ({ data: { id: 'invite-1', client_name: 'Cliente', channel: 'whatsapp', client_phone: '351912345678', status: 'pending', created_at: '2026-01-01' }, error: null }) }) }),
              p => { updateArgs = p }
            )
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao: vi.fn() }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: 'Cliente', channel: 'whatsapp', client_phone: '351912345678' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.send_error).toBe('twilio_500')
    expect(updateArgs).toMatchObject({ send_status: 'failed', send_error: 'twilio_500' })

    delete process.env.REVIEW_TOKEN_SECRET
    delete process.env.TWILIO_REVIEW_INVITE_CONTENT_SID
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

  it('whatsapp_operational: exige SID configurado E aprovação confirmada da Meta — SID sozinho não chega', async () => {
    mockAuth('user-1')
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'review_invites') return { select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    delete process.env.TWILIO_REVIEW_INVITE_CONTENT_SID
    delete process.env.TWILIO_REVIEW_INVITE_TEMPLATE_APPROVED
    const { GET } = await import('./route')

    const res1 = await GET()
    expect((await res1.json()).whatsapp_operational).toBe(false)

    // SID configurado mas sem confirmação de aprovação — continua false,
    // é exatamente o estado atual (modelo Rejected na Meta, ticket Twilio
    // #29711731 aberto a aguardar motivo).
    process.env.TWILIO_REVIEW_INVITE_CONTENT_SID = 'HXabc'
    const res2 = await GET()
    expect((await res2.json()).whatsapp_operational).toBe(false)

    process.env.TWILIO_REVIEW_INVITE_TEMPLATE_APPROVED = 'true'
    const res3 = await GET()
    expect((await res3.json()).whatsapp_operational).toBe(true)

    delete process.env.TWILIO_REVIEW_INVITE_CONTENT_SID
    delete process.env.TWILIO_REVIEW_INVITE_TEMPLATE_APPROVED
  })
})
