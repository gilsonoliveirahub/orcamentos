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
      locked: false,
      opened_at: '2026-07-17T00:00:00Z',
      professional_id: 'prof-1',
      q1_tipo_trabalho: 'Pintura',
      metadata: {},
      source: 'pessoal',
      professionals: { name: 'Prof Teste', email: 'prof@example.com', specialty: 'Pintura', phone: '351922222222', plan: 'pro', zone: 'Lisboa' },
    }

    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }),
      },
    }))

    const emailNovoLead = vi.fn().mockResolvedValue(undefined)
    const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))

    const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'failed', reason: 'twilio_500' })
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    const json = await res.json()

    expect(json).toEqual({ ok: true })
    expect(emailNovoLead).toHaveBeenCalledTimes(1)
    expect(emailNovoLeadBloqueado).not.toHaveBeenCalled()
    expect(sendWhatsApp).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('WhatsApp não enviado'))
  })

  it('skips WhatsApp entirely (no crash, no call) when the professional has no phone', async () => {
    const lead = {
      id: 'lead-2', name: 'Cliente', phone: '351911111111', email: null, locked: false,
      opened_at: '2026-07-17T00:00:00Z', professional_id: 'prof-1',
      q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal',
      professionals: { name: 'Prof', email: 'prof@example.com', specialty: 'Pintura', phone: null, plan: 'pro', zone: 'Lisboa' },
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }) },
    }))
    const emailNovoLead = vi.fn().mockResolvedValue(undefined)
    const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
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
    const emailNovoLeadBloqueado = vi.fn()
    vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
    const sendWhatsApp = vi.fn()
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'missing' }))
    const json = await res.json()

    expect(json).toEqual({ ok: false })
    expect(emailNovoLead).not.toHaveBeenCalled()
    expect(sendWhatsApp).not.toHaveBeenCalled()
  })

  describe('proteção de leads bloqueados', () => {
    it('profissional Free recebe só notificação redigida (sem nome/telefone) por email e WhatsApp', async () => {
      const lead = {
        id: 'lead-3', name: 'Nome Real do Cliente', phone: '351933333333', email: 'cliente@example.com', locked: false,
        q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal', zone_requested: null,
        professionals: { name: 'Prof Free', email: 'proffree@example.com', specialty: 'Pintura', phone: '351944444444', plan: 'free', zone: 'Porto' },
      }
      vi.doMock('@/lib/supabase-admin', () => ({
        supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }) },
      }))
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ lead_id: 'lead-3' }))
      const json = await res.json()

      expect(json).toEqual({ ok: true, blocked: true })
      expect(emailNovoLead).not.toHaveBeenCalled()
      expect(emailNovoLeadBloqueado).toHaveBeenCalledTimes(1)
      expect(emailNovoLeadBloqueado).toHaveBeenCalledWith(expect.objectContaining({ isFreePlan: true }))

      const [, whatsappMessage] = sendWhatsApp.mock.calls[0]
      expect(whatsappMessage).not.toContain('Nome Real do Cliente')
      expect(whatsappMessage).not.toContain('351933333333')
      expect(whatsappMessage).toContain('/upgrade')
    })

    it('lead do marketplace sem créditos (locked=true) recebe só notificação redigida, mesmo com plano pago', async () => {
      const lead = {
        id: 'lead-4', name: 'Outro Cliente', phone: '351955555555', email: null, locked: true,
        q1_tipo_trabalho: 'Canalização', metadata: {}, source: 'marketplace', zone_requested: 'Faro',
        professionals: { name: 'Prof Pro', email: 'profpro@example.com', specialty: 'Canalização', phone: '351966666666', plan: 'pro', zone: 'Faro' },
      }
      vi.doMock('@/lib/supabase-admin', () => ({
        supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }) },
      }))
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ lead_id: 'lead-4' }))
      const json = await res.json()

      expect(json).toEqual({ ok: true, blocked: true })
      expect(emailNovoLead).not.toHaveBeenCalled()
      expect(emailNovoLeadBloqueado).toHaveBeenCalledWith(expect.objectContaining({ isFreePlan: false, zoneApprox: 'Faro' }))

      const [, whatsappMessage] = sendWhatsApp.mock.calls[0]
      expect(whatsappMessage).not.toContain('Outro Cliente')
      expect(whatsappMessage).not.toContain('351955555555')
      expect(whatsappMessage).toContain('/dashboard')
    })

    it('profissional pago e lead já aberto (opened_at gravado) continua a receber os dados completos', async () => {
      const lead = {
        id: 'lead-5', name: 'Cliente Normal', phone: '351977777777', email: null, locked: false,
        opened_at: '2026-07-17T00:00:00Z', professional_id: 'prof-1',
        q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal',
        professionals: { name: 'Prof', email: 'prof@example.com', specialty: 'Pintura', phone: '351988888888', plan: 'starter', zone: 'Lisboa' },
      }
      vi.doMock('@/lib/supabase-admin', () => ({
        supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }) },
      }))
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ lead_id: 'lead-5' }))
      const json = await res.json()

      expect(json).toEqual({ ok: true })
      expect(emailNovoLeadBloqueado).not.toHaveBeenCalled()
      expect(emailNovoLead).toHaveBeenCalledWith(expect.objectContaining({ leadName: 'Cliente Normal', leadPhone: '351977777777' }))

      const [, whatsappMessage] = sendWhatsApp.mock.calls[0]
      expect(whatsappMessage).toContain('Cliente Normal')
      expect(whatsappMessage).toContain('351977777777')
    })

    it('lead com fotos/vídeos anexados: menciona a quantidade no email e no WhatsApp', async () => {
      const lead = {
        id: 'lead-media', name: 'Cliente Com Fotos', phone: '351966666666', email: null, locked: false,
        opened_at: '2026-07-17T00:00:00Z', professional_id: 'prof-1',
        q1_tipo_trabalho: 'Pintura',
        metadata: { media_urls: ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.mp4'] },
        source: 'pessoal',
        professionals: { name: 'Prof', email: 'prof@example.com', specialty: 'Pintura', phone: '351988888888', plan: 'starter', zone: 'Lisboa' },
      }
      vi.doMock('@/lib/supabase-admin', () => ({
        supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }) },
      }))
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { POST } = await import('./route')
      await POST(fakeRequest({ lead_id: 'lead-media' }))

      expect(emailNovoLead).toHaveBeenCalledWith(expect.objectContaining({ mediaCount: 3 }))
      const [, whatsappMessage] = sendWhatsApp.mock.calls[0]
      expect(whatsappMessage).toContain('3 anexados')
    })

    it('lead sem fotos/vídeos: não menciona nada sobre media no WhatsApp nem passa mediaCount>0', async () => {
      const lead = {
        id: 'lead-sem-media', name: 'Cliente Sem Fotos', phone: '351955555555', email: null, locked: false,
        opened_at: '2026-07-17T00:00:00Z', professional_id: 'prof-1',
        q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal',
        professionals: { name: 'Prof', email: 'prof@example.com', specialty: 'Pintura', phone: '351988888888', plan: 'starter', zone: 'Lisboa' },
      }
      vi.doMock('@/lib/supabase-admin', () => ({
        supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }) },
      }))
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { POST } = await import('./route')
      await POST(fakeRequest({ lead_id: 'lead-sem-media' }))

      expect(emailNovoLead).toHaveBeenCalledWith(expect.objectContaining({ mediaCount: 0 }))
      const [, whatsappMessage] = sendWhatsApp.mock.calls[0]
      expect(whatsappMessage).not.toContain('Fotos/vídeos')
    })

    it('lead do link pessoal ainda não aberto recebe só notificação redigida, mesmo com plano pago e locked=false (a quota só é consumida ao abrir, nunca antes)', async () => {
      const lead = {
        id: 'lead-6', name: 'Cliente Ainda Não Aberto', phone: '351999999999', email: null, locked: false,
        opened_at: null, professional_id: 'prof-1',
        q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal', zone_requested: 'Braga',
        professionals: { name: 'Prof Starter', email: 'profstarter@example.com', specialty: 'Pintura', phone: '351900000000', plan: 'starter', zone: 'Braga' },
      }
      vi.doMock('@/lib/supabase-admin', () => ({
        supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }) },
      }))
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ lead_id: 'lead-6' }))
      const json = await res.json()

      expect(json).toEqual({ ok: true, blocked: true })
      expect(emailNovoLead).not.toHaveBeenCalled()
      expect(emailNovoLeadBloqueado).toHaveBeenCalledWith(expect.objectContaining({ isFreePlan: false }))

      const [, whatsappMessage] = sendWhatsApp.mock.calls[0]
      expect(whatsappMessage).not.toContain('Cliente Ainda Não Aberto')
      expect(whatsappMessage).not.toContain('351999999999')
    })
  })
})
