import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Guarda estática do ficheiro de migração: garante que
// unlock_marketplace_lead_by_credit nunca fica executável por anon/
// authenticated, e que o service_role tem uma permissão EXPLÍCITA (não só
// implícita por o REVOKE de PUBLIC deixar tudo o resto de fora). Recebe
// p_professional_id como parâmetro — se ficasse executável pelo cliente
// autenticado, qualquer profissional podia desbloquear/descontar crédito
// de outro só por passar o id alheio.
const sql = readFileSync(join(__dirname, 'migration_marketplace_v4_unlock_atomic.sql'), 'utf-8')

describe('migration_marketplace_v4_unlock_atomic.sql — permissões de unlock_marketplace_lead_by_credit', () => {
  it('revoga a execução de public, anon e authenticated', () => {
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+unlock_marketplace_lead_by_credit\(uuid,\s*uuid\)\s+from\s+public,\s*authenticated,\s*anon\s*;/i
    )
  })

  it('concede execução explicitamente só ao service_role', () => {
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+unlock_marketplace_lead_by_credit\(uuid,\s*uuid\)\s+to\s+service_role\s*;/i
    )
  })

  it('o GRANT ao service_role vem depois do REVOKE de public/anon/authenticated (ordem importa: nunca o inverso)', () => {
    const revokeIndex = sql.search(/revoke\s+all\s+on\s+function\s+unlock_marketplace_lead_by_credit/i)
    const grantIndex = sql.search(/grant\s+execute\s+on\s+function\s+unlock_marketplace_lead_by_credit/i)

    expect(revokeIndex).toBeGreaterThan(-1)
    expect(grantIndex).toBeGreaterThan(-1)
    expect(grantIndex).toBeGreaterThan(revokeIndex)
  })

  it('não concede execução a nenhum outro papel (public/anon/authenticated) via grant', () => {
    const grantLines = sql.split('\n').filter(line => /^\s*grant\s+execute/i.test(line))
    for (const line of grantLines) {
      expect(line).not.toMatch(/\b(public|anon|authenticated)\b/i)
    }
  })
})
