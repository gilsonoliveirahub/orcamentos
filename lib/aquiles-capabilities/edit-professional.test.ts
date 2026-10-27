import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadCapability(fromImpl: (table: string) => unknown) {
  vi.resetModules()
  vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn(fromImpl) } }))
  const mod = await import('./edit-professional')
  return mod.editProfessionalCapability
}

describe('edit-professional capability', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('preview: profissional não encontrado fica bloqueado', async () => {
    const capability = await loadCapability(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }))
    const preview = await capability.preview({ professional_id: 'p1', updates: { name: 'Novo' } })
    expect(preview.found).toBe(false)
    expect(preview.blocked).toBe(true)
  })

  it('preview: mostra o diff só dos campos editáveis submetidos, ignora campos não permitidos', async () => {
    const capability = await loadCapability(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Ana', phone: '912', zone: 'Porto' } }) }) }),
    }))
    const preview = await capability.preview({ professional_id: 'p1', updates: { name: 'Ana Nova', email: 'hack@example.com' } })
    expect(preview.blocked).toBe(false)
    expect(preview.changes).toEqual([{ field: 'name', before: 'Ana', after: 'Ana Nova' }])
    expect(preview.target_summary).toBe('Ana')
  })

  it('preview: nenhum campo editável submetido fica bloqueado', async () => {
    const capability = await loadCapability(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Ana' } }) }) }) }))
    const preview = await capability.preview({ professional_id: 'p1', updates: { email: 'x@x.com' } })
    expect(preview.blocked).toBe(true)
    expect(preview.blocked_reason).toMatch(/Nenhum campo/)
  })

  it('execute: atualiza, devolve o diff e regista em admin_audit_log ligado à ação do Aquiles', async () => {
    const audit: Record<string, unknown>[] = []
    const capability = await loadCapability((table: string) => {
      if (table === 'professionals') {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn()
                .mockResolvedValueOnce({ data: { name: 'Ana', phone: null, specialties: [], zone: null, description: null, active: true }, error: null })
                .mockResolvedValueOnce({ data: { name: 'Ana Nova', phone: null, specialties: [], zone: null, description: null, active: true }, error: null }),
            }),
          }),
          update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { name: 'Ana Nova', phone: null, specialties: [], zone: null, description: null, active: true }, error: null }) }) }) }),
        }
      }
      if (table === 'admin_audit_log') {
        return { insert: vi.fn(async (row: Record<string, unknown>) => { audit.push(row); return { error: null } }) }
      }
      throw new Error(`tabela inesperada: ${table}`)
    })

    const result = await capability.execute({ professional_id: 'p1', updates: { name: 'Ana Nova' } }, { actionId: 'act-1', approvedByAdminId: 'admin-1' })

    expect(result.changes).toEqual({ name: { before: 'Ana', after: 'Ana Nova' } })
    expect(audit).toEqual([{ admin_id: 'admin-1', professional_id: 'p1', changes: { name: { before: 'Ana', after: 'Ana Nova' } }, aquiles_action_id: 'act-1' }])
  })

  it('execute: rejeita sem admin aprovador identificado (nunca grava auditoria sem responsável)', async () => {
    const capability = await loadCapability((table: string) => {
      if (table === 'professionals') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { name: 'Ana', phone: null, specialties: [], zone: null, description: null, active: true }, error: null }) }) }),
          update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { name: 'Ana Nova' }, error: null }) }) }) }),
        }
      }
      throw new Error(`tabela inesperada chamada antes de validar o aprovador: ${table}`)
    })

    await expect(capability.execute({ professional_id: 'p1', updates: { name: 'Ana Nova' } }, { actionId: 'act-1', approvedByAdminId: null }))
      .rejects.toThrow('recusado por segurança')
  })
})
