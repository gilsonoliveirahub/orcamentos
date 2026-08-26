import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Guarda estática do ficheiro de migração do Grupo 2: garante que os 3
// INSERTs públicos (`with check (true)`) continuam a ser removidos, e que
// a constraint de avaliação única por lead continua presente. Sem isto,
// leads/quotes/reviews voltariam a ficar abertos a escrita direta via REST
// do Supabase por qualquer portador da anon key.
const sql = readFileSync(join(__dirname, 'migration_reviews_quotes_leads_rls_lockdown.sql'), 'utf-8')

describe('migration_reviews_quotes_leads_rls_lockdown.sql', () => {
  it('remove a policy de INSERT público de leads', () => {
    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+"leads_insert_public"\s+on\s+leads\s*;/i)
  })

  it('remove a policy de INSERT público de quotes', () => {
    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+"quotes_insert_public"\s+on\s+quotes\s*;/i)
  })

  it('remove a policy de INSERT público de reviews', () => {
    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+"reviews_insert_public"\s+on\s+reviews\s*;/i)
  })

  it('adiciona a constraint unique(lead_id) em reviews — uma avaliação por trabalho', () => {
    expect(sql).toMatch(/alter\s+table\s+reviews\s+add\s+constraint\s+reviews_lead_id_unique\s+unique\s*\(\s*lead_id\s*\)\s*;/i)
  })

  it('não concede nenhum INSERT novo a public/anon/authenticated nestas 3 tabelas', () => {
    const grantLines = sql.split('\n').filter(line => /^\s*grant\s+insert/i.test(line))
    expect(grantLines).toHaveLength(0)
  })
})
