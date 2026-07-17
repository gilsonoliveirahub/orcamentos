import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(): NextRequest {
  return { headers: { get: () => null } } as unknown as NextRequest
}

interface QueryBuilder extends PromiseLike<{ data: unknown }> {
  select: () => QueryBuilder
  eq: () => QueryBuilder
  gte: () => QueryBuilder
  lte: () => QueryBuilder
  not: () => QueryBuilder
}

// Thenable builder: qualquer combinação de chamadas encadeadas resolve
// corretamente quando finalmente "await"ado, tal como o cliente Supabase real.
function leadsChain(data: unknown): QueryBuilder {
  const builder: QueryBuilder = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    lte: () => builder,
    not: () => builder,
    then: (resolve) => Promise.resolve({ data }).then(resolve),
  }
  return builder
}

describe('GET /api/followup', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.CRON_SECRET
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/whatsapp')
    vi.doUnmock('@/lib/email')
    vi.doUnmock('@/lib/personal-link-limits')
  })

  it('nunca envia follow-up (email nem WhatsApp) para um lead bloqueado — plano free', async () => {
    const blockedLead = {
      id: 'lead-1', name: 'Cliente Bloqueado', phone: '351911111111', status: 'novo', locked: false,
      source: 'pessoal', opened_at: null, professional_id: 'prof-1',
      professionals: { name: 'Prof Free', email: 'proffree@example.com', phone: '351922222222', specialty: 'Pintura', plan: 'free' },
    }

    const from = vi.fn((table: string) => {
      if (table === 'leads') return leadsChain([blockedLead])
      if (table === 'professionals') return leadsChain([])
      return leadsChain([])
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))
    const emailFollowup = vi.fn().mockResolvedValue(undefined)
    const emailUpgradeNudge = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/email', () => ({ emailFollowup, emailUpgradeNudge }))

    const { GET } = await import('./route')
    await GET(fakeRequest())

    expect(emailFollowup).not.toHaveBeenCalled()
    expect(sendWhatsApp).not.toHaveBeenCalled()
  })

  it('nunca envia follow-up para um lead do marketplace ainda bloqueado (locked=true), mesmo com plano pago', async () => {
    const blockedLead = {
      id: 'lead-2', name: 'Cliente Bloqueado 2', phone: '351933333333', status: 'novo', locked: true,
      source: 'marketplace', opened_at: null, professional_id: 'prof-2',
      professionals: { name: 'Prof Pro', email: 'profpro@example.com', phone: '351944444444', specialty: 'Canalização', plan: 'pro' },
    }

    const from = vi.fn((table: string) => {
      if (table === 'leads') return leadsChain([blockedLead])
      return leadsChain([])
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))
    const emailFollowup = vi.fn().mockResolvedValue(undefined)
    const emailUpgradeNudge = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/email', () => ({ emailFollowup, emailUpgradeNudge }))

    const { GET } = await import('./route')
    await GET(fakeRequest())

    expect(emailFollowup).not.toHaveBeenCalled()
    expect(sendWhatsApp).not.toHaveBeenCalled()
  })

  it('envia follow-up normalmente para um lead desbloqueado (plano pago, locked=false)', async () => {
    const unlockedLead = {
      id: 'lead-3', name: 'Cliente Livre', phone: '351955555555', status: 'novo', locked: false,
      source: 'pessoal', opened_at: '2026-06-01T00:00:00Z', professional_id: 'prof-3',
      professionals: { name: 'Prof Pro', email: 'profpro@example.com', phone: '351966666666', specialty: 'Pintura', plan: 'pro' },
    }

    const from = vi.fn((table: string) => {
      if (table === 'leads') return leadsChain([unlockedLead])
      return leadsChain([])
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))
    const emailFollowup = vi.fn().mockResolvedValue(undefined)
    const emailUpgradeNudge = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/email', () => ({ emailFollowup, emailUpgradeNudge }))

    const { GET } = await import('./route')
    await GET(fakeRequest())

    // O mock não diferencia a janela D+2 de D+5, por isso o mesmo lead
    // "aparece" nas duas iterações — o que importa aqui é que o envio
    // aconteceu (ao contrário dos testes acima, onde nunca acontece).
    expect(emailFollowup).toHaveBeenCalled()
    expect(emailFollowup).toHaveBeenCalledWith(expect.objectContaining({ leadName: 'Cliente Livre' }))
  })

  it('nunca envia follow-up para um lead do link pessoal ainda não aberto cuja quota do ciclo está esgotada', async () => {
    const quotaExhaustedLead = {
      id: 'lead-4', name: 'Cliente Sem Quota', phone: '351977777777', status: 'novo', locked: false,
      source: 'pessoal', opened_at: null, professional_id: 'prof-4',
      professionals: { name: 'Prof Starter', email: 'profstarter@example.com', phone: '351988888888', specialty: 'Pintura', plan: 'starter' },
    }

    const from = vi.fn((table: string) => {
      if (table === 'leads') return leadsChain([quotaExhaustedLead])
      return leadsChain([])
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const isPersonalLinkQuotaExhausted = vi.fn().mockResolvedValue(true)
    vi.doMock('@/lib/personal-link-limits', () => ({ isPersonalLinkQuotaExhausted }))

    const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))
    const emailFollowup = vi.fn().mockResolvedValue(undefined)
    const emailUpgradeNudge = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/email', () => ({ emailFollowup, emailUpgradeNudge }))

    const { GET } = await import('./route')
    await GET(fakeRequest())

    expect(isPersonalLinkQuotaExhausted).toHaveBeenCalledWith('prof-4')
    expect(emailFollowup).not.toHaveBeenCalled()
    expect(sendWhatsApp).not.toHaveBeenCalled()
  })
})
