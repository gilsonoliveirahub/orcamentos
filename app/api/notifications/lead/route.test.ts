import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

describe('POST /api/notifications/lead', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/email')
    vi.doUnmock('@/lib/whatsapp')
  })

  it('still returns ok:true and logs a warning when WhatsApp fails — never hides the failure', async () => {
    const lead = {
      id: 'lead-1',
      name: 'Cliente Teste',
      phone: '351911111111',
      email: null,
      q1_tipo_trabalho: 'Pintura',
      metadata: {},
      source: 'pessoal',
      professionals: { name: 'Prof Teste', email: 'prof@example.com', specialty: 'Pintura', phone: '351922222222' },
    }

    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }),
      },
    }))

    const emailNovoLead = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/email', () => ({ emailNovoLead }))

    const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'failed', reason: 'twilio_500' })
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    const json = await res.json()

    expect(json).toEqual({ ok: true })
    expect(emailNovoLead).toHaveBeenCalledTimes(1)
    expect(sendWhatsApp).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('WhatsApp não enviado'))
  })

  it('skips WhatsApp entirely (no crash, no call) when the professional has no phone', async () => {
    const lead = {
      id: 'lead-2', name: 'Cliente', phone: '351911111111', email: null,
      q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal',
      professionals: { name: 'Prof', email: 'prof@example.com', specialty: 'Pintura', phone: null },
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }) },
    }))
    const emailNovoLead = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/email', () => ({ emailNovoLead }))
    const sendWhatsApp = vi.fn()
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-2' }))
    const json = await res.json()

    expect(json).toEqual({ ok: true })
    expect(emailNovoLead).toHaveBeenCalledTimes(1)
    expect(sendWhatsApp).not.toHaveBeenCalled()
  })

  it('returns ok:false without sending anything when the lead or professional email is missing', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }) },
    }))
    const emailNovoLead = vi.fn()
    vi.doMock('@/lib/email', () => ({ emailNovoLead }))
    const sendWhatsApp = vi.fn()
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'missing' }))
    const json = await res.json()

    expect(json).toEqual({ ok: false })
    expect(emailNovoLead).not.toHaveBeenCalled()
    expect(sendWhatsApp).not.toHaveBeenCalled()
  })
})
