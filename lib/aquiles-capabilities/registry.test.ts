import { describe, expect, it, vi } from 'vitest'

// vi.mock é "hoisted" para antes dos imports abaixo — necessário porque
// registry.ts importa estaticamente todas as capacidades, que por sua vez
// importam @/lib/supabase-admin (que falha sem env vars reais fora de um
// teste que as stube antes do import).
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }))

import { AQUILES_CAPABILITIES, getCapability } from './registry'

// Verificação de segurança, não só funcional: a lista de capacidades é
// fechada e nunca deve crescer para incluir gestão de permissões,
// credenciais ou aprovações do próprio Aquiles — exclusão deliberada e
// permanente (ver pedido explícito do Gilson). Este teste falha se algum
// dia alguém acrescentar uma capacidade com um destes nomes/ids.
const FORBIDDEN_ID_PATTERNS = [/admin/i, /credential/i, /token/i, /approve/i, /decide/i, /role/i, /permission/i]

describe('AQUILES_CAPABILITIES registry', () => {
  it('só contém as 4 capacidades esperadas', () => {
    expect(Object.keys(AQUILES_CAPABILITIES).sort()).toEqual([
      'change-lead-status',
      'edit-professional',
      'manage-review-invite',
      'unlock-marketplace-lead',
    ])
  })

  it('nenhuma capacidade gere permissões, credenciais ou aprovações', () => {
    for (const id of Object.keys(AQUILES_CAPABILITIES)) {
      for (const pattern of FORBIDDEN_ID_PATTERNS) {
        expect(pattern.test(id)).toBe(false)
      }
    }
  })

  it('cada capacidade usa um action_type válido da fila de aprovação', () => {
    const valid = ['delete_permanent', 'money_movement', 'security_access_change', 'publish_deploy', 'other_sensitive']
    for (const capability of Object.values(AQUILES_CAPABILITIES)) {
      expect(valid).toContain(capability.actionType)
    }
  })

  it('getCapability devolve null para ids desconhecidos (nunca lookup dinâmico/eval)', () => {
    expect(getCapability('decide')).toBeNull()
    expect(getCapability('manage-admins')).toBeNull()
    expect(getCapability('__proto__')).toBeNull()
    expect(getCapability('constructor')).toBeNull()
    expect(getCapability('')).toBeNull()
  })

  it('getCapability devolve a capacidade certa para um id válido', () => {
    expect(getCapability('edit-professional')?.id).toBe('edit-professional')
  })
})
