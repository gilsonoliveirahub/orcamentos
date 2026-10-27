import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadCapability(opts: {
  fromImpl: (table: string) => unknown
  recordLeadStatusChange?: ReturnType<typeof vi.fn>
  sendReviewRequestEmail?: ReturnType<typeof vi.fn>
}) {
  vi.resetModules()
  vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn(opts.fromImpl) } }))
  vi.doMock('@/lib/lead-status-history', () => ({ recordLeadStatusChange: opts.recordLeadStatusChange ?? vi.fn(async () => {}) }))
  vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail: opts.sendReviewRequestEmail ?? vi.fn(async () => ({ status: 'sent' })) }))
  const mod = await import('./change-lead-status')
  return mod.changeLeadStatusCapability
}

const BASE_LEAD = {
  id: 'lead-1', name: 'Cliente X', phone: '912345678', status: 'qualificado',
  professional_id: 'prof-1', opened_at: null, source: 'pessoal', locked: false,
  concluido_at: null, valor_fechado: null,
}

function leadsFrom(lead: typeof BASE_LEAD | null, updateSpy?: (payload: Record<string, unknown>) => void) {
  return (table: string) => {
    if (table !== 'leads') throw new Error(`tabela inesperada: ${table}`)
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: lead }) }) }),
      update: (payload: Record<string, unknown>) => {
        updateSpy?.(payload)
        return { eq: async () => ({ error: null }) }
      },
    }
  }
}

describe('change-lead-status capability', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/lead-status-history')
    vi.doUnmock('@/lib/complete-lead')
  })

  it('preview: lead não encontrado fica bloqueado', async () => {
    const capability = await loadCapability({ fromImpl: leadsFrom(null) })
    const preview = await capability.preview({ lead_id: 'x', status: 'proposta' })
    expect(preview.found).toBe(false)
    expect(preview.blocked).toBe(true)
  })

  it('preview: fechar sem decisão de valor fica bloqueado', async () => {
    const capability = await loadCapability({ fromImpl: leadsFrom(BASE_LEAD) })
    const preview = await capability.preview({ lead_id: 'lead-1', status: 'fechado' })
    expect(preview.blocked).toBe(true)
    expect(preview.blocked_reason).toMatch(/valor final/)
  })

  it('preview: conclusão pela primeira vez avisa que dispara email', async () => {
    const capability = await loadCapability({ fromImpl: leadsFrom(BASE_LEAD) })
    const preview = await capability.preview({ lead_id: 'lead-1', status: 'concluido' })
    expect(preview.blocked).toBe(false)
    expect(preview.effects.some(e => e.label.includes('pedido de opinião'))).toBe(true)
  })

  it('execute: muda estado, nunca restringe por professional_id (admin age sobre qualquer lead), regista histórico com changed_by null', async () => {
    const recordLeadStatusChange = vi.fn(async () => {})
    const updateSpy = vi.fn()
    const capability = await loadCapability({ fromImpl: leadsFrom(BASE_LEAD, updateSpy), recordLeadStatusChange })

    const result = await capability.execute({ lead_id: 'lead-1', status: 'proposta' }, { actionId: 'a1', approvedByAdminId: 'admin-1' })

    expect(result).toEqual({ status: 'proposta' })
    expect(updateSpy).toHaveBeenCalledWith({ status: 'proposta' })
    expect(recordLeadStatusChange).toHaveBeenCalledWith({ leadId: 'lead-1', fromStatus: 'qualificado', toStatus: 'proposta', changedBy: null })
  })

  it('execute: fechar com decisão "informado" grava valor_fechado; "nao_informar" grava null', async () => {
    const updateSpy = vi.fn()
    const capability = await loadCapability({ fromImpl: leadsFrom(BASE_LEAD, updateSpy) })

    await capability.execute({ lead_id: 'lead-1', status: 'fechado', valor_fechado_decision: 'informado', valor_fechado: 250 }, { actionId: 'a1', approvedByAdminId: 'admin-1' })
    expect(updateSpy).toHaveBeenLastCalledWith({ status: 'fechado', valor_fechado: 250 })

    await capability.execute({ lead_id: 'lead-1', status: 'fechado', valor_fechado_decision: 'nao_informar' }, { actionId: 'a1', approvedByAdminId: 'admin-1' })
    expect(updateSpy).toHaveBeenLastCalledWith({ status: 'fechado', valor_fechado: null })
  })

  it('execute: fechar sem decisão válida rejeita e nunca chega a escrever', async () => {
    const updateSpy = vi.fn()
    const capability = await loadCapability({ fromImpl: leadsFrom(BASE_LEAD, updateSpy) })
    await expect(capability.execute({ lead_id: 'lead-1', status: 'fechado' }, { actionId: 'a1', approvedByAdminId: 'admin-1' })).rejects.toThrow()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('execute: primeira conclusão grava concluido_at/concluido_by e envia o email de pedido de opinião', async () => {
    const updateSpy = vi.fn()
    const sendReviewRequestEmail = vi.fn(async () => ({ status: 'sent' as const }))
    const capability = await loadCapability({ fromImpl: leadsFrom(BASE_LEAD, updateSpy), sendReviewRequestEmail })

    const result = await capability.execute({ lead_id: 'lead-1', status: 'concluido' }, { actionId: 'a1', approvedByAdminId: 'admin-1' })

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'concluido', concluido_by: 'prof-1' }))
    expect(sendReviewRequestEmail).toHaveBeenCalledWith('lead-1')
    expect(result).toEqual({ status: 'concluido', email: { status: 'sent' } })
  })
})
