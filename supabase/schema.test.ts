import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Guarda estática do schema.sql: trava a reconciliação feita na auditoria
// de 2026-08-25 (schema.sql desatualizado face à produção real) para não
// regredir silenciosamente se o ficheiro for editado no futuro.
const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')

describe('schema.sql — reconciliação plan/specialties com a produção real', () => {
  it('o check da coluna plan inclui os 4 valores reais usados em produção (free/starter/pro/inactive)', () => {
    const checks = [...sql.matchAll(/check\s*\(\s*plan\s+in\s*\(([^)]+)\)\s*\)/gi)]
    expect(checks.length).toBeGreaterThan(0)
    for (const match of checks) {
      const values = match[1]
      for (const plan of ['free', 'starter', 'pro', 'inactive']) {
        expect(values).toMatch(new RegExp(`'${plan}'`))
      }
    }
  })

  it('a tabela professionals declara a coluna specialties (múltiplas especialidades por conta)', () => {
    expect(sql).toMatch(/specialties\s+text\[\]/i)
  })

  it('a constraint legacy do plan é recriada para bases já existentes (drop + add, nessa ordem)', () => {
    const dropIndex = sql.search(/alter\s+table\s+professionals\s+drop\s+constraint\s+if\s+exists\s+professionals_plan_check/i)
    const addIndex = sql.search(/alter\s+table\s+professionals\s+add\s+constraint\s+professionals_plan_check/i)

    expect(dropIndex).toBeGreaterThan(-1)
    expect(addIndex).toBeGreaterThan(-1)
    expect(addIndex).toBeGreaterThan(dropIndex)
  })
})
