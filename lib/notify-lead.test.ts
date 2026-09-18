import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

// Mock padrão do supabase-admin para lib/notify-lead.ts: cobre a leitura do
// lead+professional, a leitura de notification_log (dedup — P0 2026-09-18,
// "no máximo uma notificação por canal para o mesmo lead") e a escrita do
// log. `alreadySent` simula canais já marcados como 'sent' anteriormente.
function mockSupabaseForNotify(lead: any, alreadySent: Array<'email' | 'whatsapp'> = []) {
  const inserted: Record<string, unknown>[] = []
  vi.doMock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
      from: (table: string) => {
        if (table === 'notification_log') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: alreadySent.map(channel => ({ channel })) }),
              }),
            }),
            insert: async (row: Record<string, unknown>) => { inserted.push(row); return { error: null } },
          }
        }
        return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
      },
    },
  }))
  return { inserted }
}

describe('notifyLeadCreated', () => {
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
    mockSupabaseForNotify(lead)

    const emailNovoLead = vi.fn().mockResolvedValue(undefined)
    const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))

    const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'failed', reason: 'twilio_500' })
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { notifyLeadCreated } = await import('./notify-lead')
    const result = await notifyLeadCreated('lead-1')

    expect(result).toEqual({ ok: true })
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
    mockSupabaseForNotify(lead)
    const emailNovoLead = vi.fn().mockResolvedValue(undefined)
    const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
    const sendWhatsApp = vi.fn()
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

    const { notifyLeadCreated } = await import('./notify-lead')
    const result = await notifyLeadCreated('lead-2')

    expect(result).toEqual({ ok: true })
    expect(emailNovoLead).toHaveBeenCalledTimes(1)
    expect(sendWhatsApp).not.toHaveBeenCalled()
  })

  it('returns ok:false without sending anything when the lead or professional email is missing', async () => {
    mockSupabaseForNotify(null)
    const emailNovoLead = vi.fn()
    const emailNovoLeadBloqueado = vi.fn()
    vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
    const sendWhatsApp = vi.fn()
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

    const { notifyLeadCreated } = await import('./notify-lead')
    const result = await notifyLeadCreated('missing')

    expect(result).toEqual({ ok: false })
    expect(emailNovoLead).not.toHaveBeenCalled()
    expect(sendWhatsApp).not.toHaveBeenCalled()
  })

  describe('proteção contra notificação duplicada (P0, 2026-09-18)', () => {
    const proLead = {
      id: 'lead-dup', name: 'Cliente Dup', phone: '351911111111', email: null, locked: false,
      opened_at: '2026-07-17T00:00:00Z', professional_id: 'prof-1',
      q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal',
      professionals: { name: 'Prof', email: 'prof@example.com', specialty: 'Pintura', phone: '351922222222', plan: 'pro', zone: 'Lisboa' },
    }

    it('não reenvia email se já houver um registo "sent" para este lead — chamar a função 2 vezes só envia 1 email', async () => {
      // Primeira chamada: nada enviado ainda.
      mockSupabaseForNotify(proLead, [])
      const emailNovoLead1 = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead: emailNovoLead1, emailNovoLeadBloqueado: vi.fn() }))
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp: vi.fn().mockResolvedValue({ status: 'sent' }) }))
      const { notifyLeadCreated: notify1 } = await import('./notify-lead')
      await notify1('lead-dup')
      expect(emailNovoLead1).toHaveBeenCalledTimes(1)

      // Segunda chamada (simula um retry): email já está 'sent' no log.
      vi.resetModules()
      mockSupabaseForNotify(proLead, ['email'])
      const emailNovoLead2 = vi.fn().mockResolvedValue(undefined)
      const sendWhatsApp2 = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/email', () => ({ emailNovoLead: emailNovoLead2, emailNovoLeadBloqueado: vi.fn() }))
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp: sendWhatsApp2 }))
      const { notifyLeadCreated: notify2 } = await import('./notify-lead')
      await notify2('lead-dup')

      expect(emailNovoLead2).not.toHaveBeenCalled()
      // WhatsApp não estava marcado como enviado — continua a disparar.
      expect(sendWhatsApp2).toHaveBeenCalledTimes(1)
    })

    it('não reenvia WhatsApp se já houver um registo "sent" para este lead', async () => {
      mockSupabaseForNotify(proLead, ['whatsapp'])
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado: vi.fn() }))
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { notifyLeadCreated } = await import('./notify-lead')
      await notifyLeadCreated('lead-dup')

      expect(emailNovoLead).toHaveBeenCalledTimes(1)
      expect(sendWhatsApp).not.toHaveBeenCalled()
    })

    it('uma tentativa anterior "failed" não impede uma nova tentativa (só "sent" conta como já enviado)', async () => {
      // hasAlreadySent só olha para status='sent' — uma falha anterior não
      // está incluída no array `alreadySent` simulado aqui, logo o motor
      // tenta de novo, como esperado.
      mockSupabaseForNotify(proLead, [])
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado: vi.fn() }))
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { notifyLeadCreated } = await import('./notify-lead')
      await notifyLeadCreated('lead-dup')

      expect(emailNovoLead).toHaveBeenCalledTimes(1)
      expect(sendWhatsApp).toHaveBeenCalledTimes(1)
    })
  })

  describe('proteção de leads bloqueados', () => {
    it('profissional Free recebe só notificação redigida (sem nome/telefone) por email — nunca por WhatsApp (exclusivo do Pro)', async () => {
      const lead = {
        id: 'lead-3', name: 'Nome Real do Cliente', phone: '351933333333', email: 'cliente@example.com', locked: false,
        q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal', zone_requested: null,
        professionals: { name: 'Prof Free', email: 'proffree@example.com', specialty: 'Pintura', phone: '351944444444', plan: 'free', zone: 'Porto' },
      }
      mockSupabaseForNotify(lead)
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { notifyLeadCreated } = await import('./notify-lead')
      const result = await notifyLeadCreated('lead-3')

      expect(result).toEqual({ ok: true, blocked: true })
      expect(emailNovoLead).not.toHaveBeenCalled()
      expect(emailNovoLeadBloqueado).toHaveBeenCalledTimes(1)
      expect(emailNovoLeadBloqueado).toHaveBeenCalledWith(expect.objectContaining({ isFreePlan: true }))
      expect(sendWhatsApp).not.toHaveBeenCalled()
    })

    it('profissional Starter (bloqueado): recebe email redigido, nunca WhatsApp (exclusivo do Pro)', async () => {
      const lead = {
        id: 'lead-3b', name: 'Nome Real do Cliente', phone: '351933333333', email: 'cliente@example.com', locked: false,
        q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal', zone_requested: null,
        professionals: { name: 'Prof Starter', email: 'profstarter@example.com', specialty: 'Pintura', phone: '351944444444', plan: 'starter', zone: 'Porto' },
      }
      mockSupabaseForNotify(lead)
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { notifyLeadCreated } = await import('./notify-lead')
      const result = await notifyLeadCreated('lead-3b')

      expect(result).toEqual({ ok: true, blocked: true })
      expect(emailNovoLeadBloqueado).toHaveBeenCalledWith(expect.objectContaining({ isFreePlan: false }))
      expect(sendWhatsApp).not.toHaveBeenCalled()
    })

    it('profissional em trial ativo (plan free, trial_ends_at no futuro): CTA de "desbloquear" como um pago, não "ativa o teu plano"', async () => {
      const lead = {
        id: 'lead-3c', name: 'Nome Real do Cliente', phone: '351933333333', email: 'cliente@example.com', locked: false,
        q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal', zone_requested: null,
        professionals: {
          name: 'Prof Trial', email: 'proftrial@example.com', specialty: 'Pintura', phone: '351944444444', zone: 'Porto',
          plan: 'free', trial_ends_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      }
      mockSupabaseForNotify(lead)
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { notifyLeadCreated } = await import('./notify-lead')
      const result = await notifyLeadCreated('lead-3c')

      expect(result).toEqual({ ok: true, blocked: true })
      expect(emailNovoLeadBloqueado).toHaveBeenCalledWith(expect.objectContaining({ isFreePlan: false }))
      expect(sendWhatsApp).not.toHaveBeenCalled()
    })

    it('profissional inactive (cancelado/pagamento falhado): CTA volta a "ativa o teu plano", mesmo tendo sido pago antes', async () => {
      const lead = {
        id: 'lead-3d', name: 'Nome Real do Cliente', phone: '351933333333', email: 'cliente@example.com', locked: false,
        q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal', zone_requested: null,
        professionals: { name: 'Prof Inactive', email: 'profinactive@example.com', specialty: 'Pintura', phone: '351944444444', plan: 'inactive', zone: 'Porto' },
      }
      mockSupabaseForNotify(lead)
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { notifyLeadCreated } = await import('./notify-lead')
      const result = await notifyLeadCreated('lead-3d')

      expect(result).toEqual({ ok: true, blocked: true })
      expect(emailNovoLeadBloqueado).toHaveBeenCalledWith(expect.objectContaining({ isFreePlan: true }))
      expect(sendWhatsApp).not.toHaveBeenCalled()
    })

    it('lead do marketplace sem créditos (locked=true) recebe só notificação redigida, mesmo com plano pago', async () => {
      const lead = {
        id: 'lead-4', name: 'Outro Cliente', phone: '351955555555', email: null, locked: true,
        q1_tipo_trabalho: 'Canalização', metadata: {}, source: 'marketplace', zone_requested: 'Faro',
        professionals: { name: 'Prof Pro', email: 'profpro@example.com', specialty: 'Canalização', phone: '351966666666', plan: 'pro', zone: 'Faro' },
      }
      mockSupabaseForNotify(lead)
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { notifyLeadCreated } = await import('./notify-lead')
      const result = await notifyLeadCreated('lead-4')

      expect(result).toEqual({ ok: true, blocked: true })
      expect(emailNovoLead).not.toHaveBeenCalled()
      expect(emailNovoLeadBloqueado).toHaveBeenCalledWith(expect.objectContaining({ isFreePlan: false, zoneApprox: 'Faro' }))

      const [, whatsappMessage] = sendWhatsApp.mock.calls[0]
      expect(whatsappMessage).not.toContain('Outro Cliente')
      expect(whatsappMessage).not.toContain('351955555555')
      expect(whatsappMessage).toContain('/dashboard')
    })

    it('profissional Starter e lead já aberto: recebe email completo, mas nunca WhatsApp (exclusivo do Pro)', async () => {
      const lead = {
        id: 'lead-5', name: 'Cliente Normal', phone: '351977777777', email: null, locked: false,
        opened_at: '2026-07-17T00:00:00Z', professional_id: 'prof-1',
        q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal',
        professionals: { name: 'Prof', email: 'prof@example.com', specialty: 'Pintura', phone: '351988888888', plan: 'starter', zone: 'Lisboa' },
      }
      mockSupabaseForNotify(lead)
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { notifyLeadCreated } = await import('./notify-lead')
      const result = await notifyLeadCreated('lead-5')

      expect(result).toEqual({ ok: true })
      expect(emailNovoLeadBloqueado).not.toHaveBeenCalled()
      expect(emailNovoLead).toHaveBeenCalledWith(expect.objectContaining({ leadName: 'Cliente Normal', leadPhone: '351977777777' }))
      expect(sendWhatsApp).not.toHaveBeenCalled()
    })

    it('profissional Pro e lead já aberto: recebe email completo E WhatsApp com os dados completos', async () => {
      const lead = {
        id: 'lead-5b', name: 'Cliente Normal Pro', phone: '351977777778', email: null, locked: false,
        opened_at: '2026-07-17T00:00:00Z', professional_id: 'prof-1',
        q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal',
        professionals: { name: 'Prof', email: 'prof@example.com', specialty: 'Pintura', phone: '351988888889', plan: 'pro', zone: 'Lisboa' },
      }
      mockSupabaseForNotify(lead)
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { notifyLeadCreated } = await import('./notify-lead')
      const result = await notifyLeadCreated('lead-5b')

      expect(result).toEqual({ ok: true })
      expect(emailNovoLead).toHaveBeenCalledWith(expect.objectContaining({ leadName: 'Cliente Normal Pro' }))
      expect(sendWhatsApp).toHaveBeenCalledTimes(1)
      const [, whatsappMessage] = sendWhatsApp.mock.calls[0]
      expect(whatsappMessage).toContain('Cliente Normal Pro')
      expect(whatsappMessage).toContain('351977777778')
    })

    it('lead com fotos/vídeos anexados: menciona a quantidade no email e no WhatsApp (plano Pro)', async () => {
      const lead = {
        id: 'lead-media', name: 'Cliente Com Fotos', phone: '351966666666', email: null, locked: false,
        opened_at: '2026-07-17T00:00:00Z', professional_id: 'prof-1',
        q1_tipo_trabalho: 'Pintura',
        metadata: { media_urls: ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.mp4'] },
        source: 'pessoal',
        professionals: { name: 'Prof', email: 'prof@example.com', specialty: 'Pintura', phone: '351988888888', plan: 'pro', zone: 'Lisboa' },
      }
      mockSupabaseForNotify(lead)
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { notifyLeadCreated } = await import('./notify-lead')
      await notifyLeadCreated('lead-media')

      expect(emailNovoLead).toHaveBeenCalledWith(expect.objectContaining({ mediaCount: 3 }))
      const [, whatsappMessage] = sendWhatsApp.mock.calls[0]
      expect(whatsappMessage).toContain('3 anexados')
    })

    it('lead sem fotos/vídeos: não menciona nada sobre media no WhatsApp nem passa mediaCount>0 (plano Pro)', async () => {
      const lead = {
        id: 'lead-sem-media', name: 'Cliente Sem Fotos', phone: '351955555555', email: null, locked: false,
        opened_at: '2026-07-17T00:00:00Z', professional_id: 'prof-1',
        q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal',
        professionals: { name: 'Prof', email: 'prof@example.com', specialty: 'Pintura', phone: '351988888888', plan: 'pro', zone: 'Lisboa' },
      }
      mockSupabaseForNotify(lead)
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { notifyLeadCreated } = await import('./notify-lead')
      await notifyLeadCreated('lead-sem-media')

      expect(emailNovoLead).toHaveBeenCalledWith(expect.objectContaining({ mediaCount: 0 }))
      const [, whatsappMessage] = sendWhatsApp.mock.calls[0]
      expect(whatsappMessage).not.toContain('Fotos/vídeos')
    })

    it('lead do link pessoal ainda não aberto recebe só notificação redigida, mesmo com plano Pro e locked=false (a quota só é consumida ao abrir, nunca antes)', async () => {
      const lead = {
        id: 'lead-6', name: 'Cliente Ainda Não Aberto', phone: '351999999999', email: null, locked: false,
        opened_at: null, professional_id: 'prof-1',
        q1_tipo_trabalho: 'Pintura', metadata: {}, source: 'pessoal', zone_requested: 'Braga',
        professionals: { name: 'Prof Pro', email: 'profpro@example.com', specialty: 'Pintura', phone: '351900000000', plan: 'pro', zone: 'Braga' },
      }
      mockSupabaseForNotify(lead)
      const emailNovoLead = vi.fn().mockResolvedValue(undefined)
      const emailNovoLeadBloqueado = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@/lib/email', () => ({ emailNovoLead, emailNovoLeadBloqueado }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { notifyLeadCreated } = await import('./notify-lead')
      const result = await notifyLeadCreated('lead-6')

      expect(result).toEqual({ ok: true, blocked: true })
      expect(emailNovoLead).not.toHaveBeenCalled()
      expect(emailNovoLeadBloqueado).toHaveBeenCalledWith(expect.objectContaining({ isFreePlan: false }))

      const [, whatsappMessage] = sendWhatsApp.mock.calls[0]
      expect(whatsappMessage).not.toContain('Cliente Ainda Não Aberto')
      expect(whatsappMessage).not.toContain('351999999999')
    })
  })
})
