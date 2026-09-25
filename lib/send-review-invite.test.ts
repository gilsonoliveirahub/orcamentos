import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

const ORIGINAL_ENV = { ...process.env }

function mockUpdate(spy: (payload: Record<string, unknown>) => void) {
  vi.doMock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
      from: (table: string) => {
        if (table !== 'review_invites') throw new Error(`tabela inesperada: ${table}`)
        return { update: (payload: Record<string, unknown>) => { spy(payload); return { eq: async () => ({ error: null }) } } }
      },
    },
  }))
}

describe('sendInviteMessage', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, REVIEW_TOKEN_SECRET: 'segredo-teste', TWILIO_REVIEW_INVITE_CONTENT_SID: 'HXabc' }
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/email')
    vi.doUnmock('@/lib/whatsapp')
  })

  const invite = (overrides: Partial<{ id: string; client_name: string; channel: string; client_email: string | null; client_phone: string | null }> = {}) => ({
    id: 'invite-1', client_name: 'Maria', channel: 'email', client_email: 'maria@example.com', client_phone: null, ...overrides,
  })

  it('email: sucesso grava send_status=sent, send_error=null', async () => {
    let updateArgs: Record<string, unknown> | null = null
    mockUpdate(p => { updateArgs = p })
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate: vi.fn() }))

    const { sendInviteMessage } = await import('./send-review-invite')
    const result = await sendInviteMessage(invite(), { name: 'Ana' })

    expect(result).toBeNull()
    expect(updateArgs).toEqual({ send_status: 'sent', send_error: null, send_status_updated_at: expect.any(String) })
  })

  it('email: falha grava send_status=failed com a mensagem de erro, devolve-a ao chamador', async () => {
    let updateArgs: Record<string, unknown> | null = null
    mockUpdate(p => { updateArgs = p })
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao: vi.fn().mockRejectedValue(new Error('Resend fora do ar')) }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate: vi.fn() }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { sendInviteMessage } = await import('./send-review-invite')
    const result = await sendInviteMessage(invite(), { name: 'Ana' })

    expect(result).toBe('Resend fora do ar')
    expect(updateArgs).toMatchObject({ send_status: 'failed', send_error: 'Resend fora do ar' })
  })

  it('whatsapp: usa sendWhatsAppTemplate (nunca texto livre), com contentSid/variáveis/statusCallback corretos', async () => {
    let updateArgs: Record<string, unknown> | null = null
    mockUpdate(p => { updateArgs = p })
    const sendWhatsAppTemplate = vi.fn().mockResolvedValue({ status: 'sent', messageSid: 'SM123' })
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao: vi.fn() }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate }))

    const { sendInviteMessage } = await import('./send-review-invite')
    const result = await sendInviteMessage(invite({ channel: 'whatsapp', client_email: null, client_phone: '351912345678' }), { name: 'Ana Pintora' })

    expect(result).toBeNull()
    expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(1)
    const call = sendWhatsAppTemplate.mock.calls[0][0]
    expect(call.to).toBe('351912345678')
    expect(call.contentSid).toBe('HXabc')
    expect(call.contentVariables).toEqual({ '1': 'Maria', '2': 'Ana Pintora', '3': expect.stringContaining('/avaliar-convite/invite-1?token=') })
    expect(call.statusCallbackUrl).toContain('/api/webhook/twilio-status')
    expect(updateArgs).toEqual({ send_status: 'sent', send_error: null, send_status_updated_at: expect.any(String), whatsapp_message_sid: 'SM123' })
  })

  it('whatsapp: falha do envio grava send_status=failed com o motivo, devolve-o ao chamador', async () => {
    let updateArgs: Record<string, unknown> | null = null
    mockUpdate(p => { updateArgs = p })
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao: vi.fn() }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate: vi.fn().mockResolvedValue({ status: 'failed', reason: 'twilio_63016' }) }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { sendInviteMessage } = await import('./send-review-invite')
    const result = await sendInviteMessage(invite({ channel: 'whatsapp', client_email: null, client_phone: '351912345678' }), { name: 'Ana' })

    expect(result).toBe('twilio_63016')
    expect(updateArgs).toMatchObject({ send_status: 'failed', send_error: 'twilio_63016' })
  })

  it('whatsapp: sem REVIEW_TOKEN_SECRET nunca chega a tentar enviar, grava failed', async () => {
    delete process.env.REVIEW_TOKEN_SECRET
    let updateArgs: Record<string, unknown> | null = null
    mockUpdate(p => { updateArgs = p })
    const sendWhatsAppTemplate = vi.fn()
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao: vi.fn() }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { sendInviteMessage } = await import('./send-review-invite')
    const result = await sendInviteMessage(invite({ channel: 'whatsapp', client_email: null, client_phone: '351912345678' }), { name: 'Ana' })

    expect(result).toContain('REVIEW_TOKEN_SECRET')
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled()
    expect(updateArgs).toMatchObject({ send_status: 'failed' })
  })

  it('whatsapp: sem TWILIO_REVIEW_INVITE_CONTENT_SID nunca tenta texto livre como alternativa — falha com motivo claro', async () => {
    delete process.env.TWILIO_REVIEW_INVITE_CONTENT_SID
    let updateArgs: Record<string, unknown> | null = null
    mockUpdate(p => { updateArgs = p })
    const sendWhatsAppTemplate = vi.fn()
    vi.doMock('@/lib/email', () => ({ emailConviteAvaliacao: vi.fn() }))
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { sendInviteMessage } = await import('./send-review-invite')
    const result = await sendInviteMessage(invite({ channel: 'whatsapp', client_email: null, client_phone: '351912345678' }), { name: 'Ana' })

    expect(result).toContain('TWILIO_REVIEW_INVITE_CONTENT_SID')
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled()
    expect(updateArgs).toMatchObject({ send_status: 'failed' })
  })
})
