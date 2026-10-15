import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(join(process.cwd(), 'supabase/migration_site_ops_readonly_summary.sql'), 'utf8')

describe('migration_site_ops_readonly_summary.sql', () => {
  it('cria RPC agregada SECURITY DEFINER e não concede execução a anon/authenticated', () => {
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.site_ops_readonly_summary\s*\(\s*\)/i)
    expect(sql).toMatch(/returns\s+jsonb/i)
    expect(sql).toMatch(/security\s+definer/i)
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.site_ops_readonly_summary\s*\(\s*\)\s+from\s+anon/i)
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.site_ops_readonly_summary\s*\(\s*\)\s+from\s+authenticated/i)
    expect(sql).toMatch(/grant\s+usage\s+on\s+schema\s+public\s+to\s+site_ops_readonly_server/i)
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.site_ops_readonly_summary\s*\(\s*\)\s+to\s+site_ops_readonly_server/i)
    expect(sql).toMatch(/grant\s+site_ops_readonly_server\s+to\s+authenticator/i)
    expect(sql).not.toMatch(/grant\s+select\s+on\s+(?:table\s+)?public\.(leads|professionals|analytics_daily_summary|analytics_daily_unique_visitors)\s+to\s+anon/i)
    expect(sql).not.toMatch(/grant\s+select\s+on\s+(?:table\s+)?public\.(leads|professionals|analytics_daily_summary|analytics_daily_unique_visitors)\s+to\s+site_ops_readonly_server/i)
  })

  it('agrega no banco sem paginação PostgREST e só devolve JSON agregado', () => {
    expect(sql).toMatch(/from\s+public\.leads/i)
    expect(sql).toMatch(/from\s+public\.professionals/i)
    expect(sql).toMatch(/from\s+public\.analytics_daily_summary/i)
    expect(sql).toMatch(/from\s+public\.analytics_daily_unique_visitors/i)
    expect(sql).toMatch(/jsonb_build_object\(\s*'generated_at'/i)
    expect(sql).toMatch(/'leads'/i)
    expect(sql).toMatch(/'professionals'/i)
    expect(sql).toMatch(/'analytics'/i)
    expect(sql).not.toMatch(/\blimit\s+\d+/i)
    expect(sql).not.toMatch(/\boffset\s+\d+/i)
  })
})
