import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

describe('recordLeadStatusChange', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  it('insere a transição com os campos certos', async () => {
    let insertArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ insert: (row: Record<string, unknown>) => { insertArgs = row; return Promise.resolve({ error: null }) } }) },
    }))

    const { recordLeadStatusChange } = await import('./lead-status-history')
    await recordLeadStatusChange({ leadId: 'lead-1', fromStatus: 'novo', toStatus: 'qualificado', changedBy: 'prof-1' })

    expect(insertArgs).toEqual({ lead_id: 'lead-1', from_status: 'novo', to_status: 'qualificado', changed_by: 'prof-1' })
  })

  it('aceita fromStatus null (primeira transição registada de um lead antigo)', async () => {
    let insertArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ insert: (row: Record<string, unknown>) => { insertArgs = row; return Promise.resolve({ error: null }) } }) },
    }))

    const { recordLeadStatusChange } = await import('./lead-status-history')
    await recordLeadStatusChange({ leadId: 'lead-1', fromStatus: null, toStatus: 'novo', changedBy: 'prof-1' })

    expect(insertArgs).toMatchObject({ from_status: null, to_status: 'novo' })
  })

  it('nunca lança quando o insert falha — só regista o erro', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ insert: async () => ({ error: { message: 'db down' } }) }) },
    }))

    const { recordLeadStatusChange } = await import('./lead-status-history')
    await expect(recordLeadStatusChange({ leadId: 'lead-1', fromStatus: 'novo', toStatus: 'qualificado', changedBy: 'prof-1' })).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('lead-1'))
  })
})
