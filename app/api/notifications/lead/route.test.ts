import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

// A lógica completa (autorização, dedup por canal, planos, etc.) foi
// extraída para lib/notify-lead.ts e está coberta em lib/notify-lead.test.ts
// (P0, 2026-09-18) — esta rota é agora só um wrapper HTTP fino, por isso o
// teste aqui só confirma que delega corretamente e trata erros.
describe('POST /api/notifications/lead — wrapper HTTP sobre lib/notify-lead', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/notify-lead') })

  it('chama notifyLeadCreated com o lead_id do corpo e devolve o resultado tal e qual', async () => {
    const notifyLeadCreated = vi.fn().mockResolvedValue({ ok: true })
    vi.doMock('@/lib/notify-lead', () => ({ notifyLeadCreated }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    const json = await res.json()

    expect(notifyLeadCreated).toHaveBeenCalledWith('lead-1')
    expect(json).toEqual({ ok: true })
  })

  it('propaga blocked:true quando notifyLeadCreated o devolve', async () => {
    const notifyLeadCreated = vi.fn().mockResolvedValue({ ok: true, blocked: true })
    vi.doMock('@/lib/notify-lead', () => ({ notifyLeadCreated }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-2' }))
    const json = await res.json()

    expect(json).toEqual({ ok: true, blocked: true })
  })

  it('devolve 500 com a mensagem de erro se notifyLeadCreated lançar', async () => {
    vi.doMock('@/lib/notify-lead', () => ({ notifyLeadCreated: vi.fn().mockRejectedValue(new Error('falha inesperada')) }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-3' }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('falha inesperada')
  })
})
