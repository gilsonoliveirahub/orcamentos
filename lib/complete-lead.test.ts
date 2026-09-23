import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock genérico de supabase-admin para lib/complete-lead.ts: cobre a leitura
// do lead+profissional, a leitura de reviews (já avaliado?) e de
// notification_log (já enviado?), e o insert do log. Cada chamada .eq()
// devolve a própria chain — suporta tanto o caso de 1 .eq() (reviews) como
// o de 3 .eq() encadeados (notification_log, filtra lead_id+kind+status).
function mockSupabaseForComplete({
  lead,
  reviewData = null,
  alreadySent = false,
}: {
  lead: unknown
  reviewData?: unknown
  alreadySent?: boolean
}) {
  const inserted: Record<string, unknown>[] = []
  const chain = (data: unknown): any => ({
    eq: () => chain(data),
    maybeSingle: async () => ({ data }),
    limit: async () => ({ data }),
  })
  vi.doMock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
      from: (table: string) => {
        if (table === 'leads') return { select: () => chain(lead) }
        if (table === 'reviews') return { select: () => chain(reviewData) }
        if (table === 'notification_log') {
          return {
            select: () => chain(alreadySent ? [{ id: 'n1' }] : []),
            insert: async (row: Record<string, unknown>) => { inserted.push(row); return { error: null } },
          }
        }
        throw new Error(`tabela inesperada: ${table}`)
      },
    },
  }))
  return { inserted }
}

const LEAD = {
  id: 'lead-1', name: 'Cliente Teste', email: 'cliente@example.com', professional_id: 'prof-1',
  professionals: { name: 'Profissional Teste' },
}

describe('sendReviewRequestEmail', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/email')
  })

  it('cliente já avaliou: não envia email, regista "skipped/already_reviewed"', async () => {
    const { inserted } = mockSupabaseForComplete({ lead: LEAD, reviewData: { id: 'r1' } })
    const emailPedidoDepoimento = vi.fn()
    vi.doMock('@/lib/email', () => ({ emailPedidoDepoimento }))

    const { sendReviewRequestEmail } = await import('./complete-lead')
    const result = await sendReviewRequestEmail('lead-1')

    expect(result).toEqual({ status: 'skipped', reason: 'already_reviewed' })
    expect(emailPedidoDepoimento).not.toHaveBeenCalled()
    expect(inserted).toEqual([expect.objectContaining({ status: 'skipped', reason: 'already_reviewed', kind: 'review_request' })])
  })

  it('já havia um envio "sent" registado: não reenvia (evita duplicados em retries/novos cliques), sem novo registo no log', async () => {
    const { inserted } = mockSupabaseForComplete({ lead: LEAD, alreadySent: true })
    const emailPedidoDepoimento = vi.fn()
    vi.doMock('@/lib/email', () => ({ emailPedidoDepoimento }))

    const { sendReviewRequestEmail } = await import('./complete-lead')
    const result = await sendReviewRequestEmail('lead-1')

    expect(result).toEqual({ status: 'skipped', reason: 'already_sent' })
    expect(emailPedidoDepoimento).not.toHaveBeenCalled()
    expect(inserted).toEqual([])
  })

  it('lead sem email de contacto: não tenta enviar, regista "skipped/no_email"', async () => {
    const { inserted } = mockSupabaseForComplete({ lead: { ...LEAD, email: null } })
    const emailPedidoDepoimento = vi.fn()
    vi.doMock('@/lib/email', () => ({ emailPedidoDepoimento }))

    const { sendReviewRequestEmail } = await import('./complete-lead')
    const result = await sendReviewRequestEmail('lead-1')

    expect(result).toEqual({ status: 'skipped', reason: 'no_email' })
    expect(emailPedidoDepoimento).not.toHaveBeenCalled()
    expect(inserted).toEqual([expect.objectContaining({ status: 'skipped', reason: 'no_email' })])
  })

  it('caminho feliz: envia o email ao cliente com o link seguro e regista "sent"', async () => {
    const { inserted } = mockSupabaseForComplete({ lead: LEAD })
    const emailPedidoDepoimento = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/email', () => ({ emailPedidoDepoimento }))

    const { sendReviewRequestEmail } = await import('./complete-lead')
    const result = await sendReviewRequestEmail('lead-1')

    expect(result).toEqual({ status: 'sent' })
    expect(emailPedidoDepoimento).toHaveBeenCalledWith({
      tipo: 'cliente',
      name: 'Cliente Teste',
      email: 'cliente@example.com',
      outroNome: 'Profissional Teste',
      lead_id: 'lead-1',
    })
    expect(inserted).toEqual([expect.objectContaining({ lead_id: 'lead-1', professional_id: 'prof-1', channel: 'email', kind: 'review_request', status: 'sent' })])
  })

  it('falha no envio: nunca lança, regista "failed" com o motivo — fica disponível para reenvio', async () => {
    const { inserted } = mockSupabaseForComplete({ lead: LEAD })
    const emailPedidoDepoimento = vi.fn().mockRejectedValue(new Error('Resend error 500'))
    vi.doMock('@/lib/email', () => ({ emailPedidoDepoimento }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { sendReviewRequestEmail } = await import('./complete-lead')
    const result = await sendReviewRequestEmail('lead-1')

    expect(result).toEqual({ status: 'failed', reason: 'Resend error 500' })
    expect(inserted).toEqual([expect.objectContaining({ status: 'failed', reason: 'Resend error 500' })])
  })
})
