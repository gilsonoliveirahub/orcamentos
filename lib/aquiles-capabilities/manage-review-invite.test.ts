import { afterEach, describe, expect, it, vi } from 'vitest'

const BASE_INVITE = {
  id: 'inv-1', professional_id: 'prof-1', client_name: 'Cliente X', channel: 'email',
  client_email: 'cliente@x.com', client_phone: null, status: 'pending', send_status: null,
}

async function loadCapability(opts: {
  invite: typeof BASE_INVITE | null
  applyReviewInviteAction?: ReturnType<typeof vi.fn>
  isInviteDeletable?: ReturnType<typeof vi.fn>
  deleteSpy?: ReturnType<typeof vi.fn>
}) {
  vi.resetModules()
  vi.doMock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
      from: vi.fn((table: string) => {
        if (table === 'review_invites') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.invite }) }) }),
            delete: () => ({ eq: opts.deleteSpy ?? vi.fn(async () => ({ error: null })) }),
          }
        }
        if (table === 'professionals') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1', name: 'Profissional X' } }) }) }) }
        }
        throw new Error(`tabela inesperada: ${table}`)
      }),
    },
  }))
  vi.doMock('@/lib/review-invite-actions', () => ({
    applyReviewInviteAction: opts.applyReviewInviteAction ?? vi.fn(async () => ({ ok: true, status: 'cancelled' })),
    isInviteDeletable: opts.isInviteDeletable ?? vi.fn(() => true),
  }))
  const mod = await import('./manage-review-invite')
  return mod.manageReviewInviteCapability
}

describe('manage-review-invite capability', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/review-invite-actions')
  })

  it('preview: action desconhecida fica bloqueada antes de sequer consultar o convite', async () => {
    const capability = await loadCapability({ invite: null })
    const preview = await capability.preview({ invite_id: 'inv-1', action: 'apagar_tudo' as never })
    expect(preview.blocked).toBe(true)
    expect(preview.blocked_reason).toMatch(/action deve ser/)
  })

  it('preview: convite não encontrado fica bloqueado', async () => {
    const capability = await loadCapability({ invite: null })
    const preview = await capability.preview({ invite_id: 'inv-1', action: 'cancel' })
    expect(preview.found).toBe(false)
    expect(preview.blocked).toBe(true)
  })

  it('preview: cancelar um convite já não-pendente fica bloqueado', async () => {
    const capability = await loadCapability({ invite: { ...BASE_INVITE, status: 'cancelled' } })
    const preview = await capability.preview({ invite_id: 'inv-1', action: 'cancel' })
    expect(preview.blocked).toBe(true)
    expect(preview.blocked_reason).toMatch(/pendente/)
  })

  it('preview: eliminar reutiliza isInviteDeletable', async () => {
    const isInviteDeletable = vi.fn(() => false)
    const capability = await loadCapability({ invite: { ...BASE_INVITE, status: 'pending', send_status: null }, isInviteDeletable })
    const preview = await capability.preview({ invite_id: 'inv-1', action: 'delete' })
    expect(isInviteDeletable).toHaveBeenCalled()
    expect(preview.blocked).toBe(true)
  })

  it('execute: delete reutiliza isInviteDeletable e apaga a linha', async () => {
    const deleteSpy = vi.fn(async () => ({ error: null }))
    const capability = await loadCapability({ invite: { ...BASE_INVITE, status: 'cancelled' }, deleteSpy })
    const result = await capability.execute({ invite_id: 'inv-1', action: 'delete' }, { actionId: 'a1', approvedByAdminId: 'admin-1' })
    expect(result).toEqual({ status: 'deleted' })
    expect(deleteSpy).toHaveBeenCalledWith('id', 'inv-1')
  })

  it('execute: delete bloqueado por isInviteDeletable nunca chega a apagar', async () => {
    const deleteSpy = vi.fn(async () => ({ error: null }))
    const isInviteDeletable = vi.fn(() => false)
    const capability = await loadCapability({ invite: { ...BASE_INVITE, status: 'pending' }, isInviteDeletable, deleteSpy })
    await expect(capability.execute({ invite_id: 'inv-1', action: 'delete' }, { actionId: 'a1', approvedByAdminId: 'admin-1' })).rejects.toThrow()
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('execute: confirm/reject/resend/cancel delega em applyReviewInviteAction com o profissional certo', async () => {
    const applyReviewInviteAction = vi.fn(async () => ({ ok: true as const, status: 'pending', send_error: null }))
    const capability = await loadCapability({ invite: { ...BASE_INVITE, status: 'requested' }, applyReviewInviteAction })

    const result = await capability.execute({ invite_id: 'inv-1', action: 'confirm' }, { actionId: 'a1', approvedByAdminId: 'admin-1' })

    expect(applyReviewInviteAction).toHaveBeenCalledWith('confirm', expect.objectContaining({ id: 'inv-1' }), { id: 'prof-1', name: 'Profissional X' })
    expect(result).toEqual({ status: 'pending', send_error: null })
  })

  it('execute: propaga o erro de applyReviewInviteAction (ex: estado já tratado)', async () => {
    const applyReviewInviteAction = vi.fn(async () => ({ ok: false as const, status: 409, error: 'Este pedido já foi tratado.' }))
    const capability = await loadCapability({ invite: { ...BASE_INVITE, status: 'requested' }, applyReviewInviteAction })

    await expect(capability.execute({ invite_id: 'inv-1', action: 'confirm' }, { actionId: 'a1', approvedByAdminId: 'admin-1' }))
      .rejects.toThrow('Este pedido já foi tratado.')
  })
})
