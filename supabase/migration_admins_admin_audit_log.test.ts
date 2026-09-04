import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Guarda estática do ficheiro que versiona admins/admin_audit_log — trava a
// estrutura real confirmada em produção (Supabase Studio, 2026-09-05) contra
// edições futuras que a afastem do que existe de facto.
const sql = readFileSync(join(__dirname, 'migration_admins_admin_audit_log.sql'), 'utf-8')

describe('migration_admins_admin_audit_log.sql — estrutura fiel à produção confirmada', () => {
  it('admins: colunas confirmadas (id, user_id not null com FK+cascade, email not null, created_at nullable)', () => {
    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+admins\s*\(/i)
    expect(sql).toMatch(/id\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/i)
    expect(sql).toMatch(/user_id\s+uuid\s+not\s+null\s+references\s+auth\.users\(id\)\s+on\s+delete\s+cascade/i)
    expect(sql).toMatch(/email\s+text\s+not\s+null/i)
    expect(sql).toMatch(/created_at\s+timestamptz\s+default\s+now\(\)/i)
    // created_at de admins é nullable em produção — nunca deve ganhar "not null"
    expect(sql).not.toMatch(/created_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)\s*\n\);\s*\n\s*alter table admins/i)
  })

  it('admin_audit_log: colunas confirmadas (todas not null, FKs sem cascade)', () => {
    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+admin_audit_log\s*\(/i)
    expect(sql).toMatch(/admin_id\s+uuid\s+not\s+null\s+references\s+auth\.users\(id\)/i)
    expect(sql).toMatch(/professional_id\s+uuid\s+not\s+null\s+references\s+professionals\(id\)/i)
    expect(sql).toMatch(/changes\s+jsonb\s+not\s+null/i)
    expect(sql).toMatch(/created_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/i)
  })

  it('admin_audit_log: as FKs de admin_id/professional_id não têm ON DELETE (default NO ACTION, confirmado em produção)', () => {
    const adminIdLine = sql.split('\n').find(l => /admin_id\s+uuid/i.test(l)) || ''
    const professionalIdLine = sql.split('\n').find(l => /professional_id\s+uuid\s+not\s+null\s+references/i.test(l)) || ''
    expect(adminIdLine).not.toMatch(/on delete/i)
    expect(professionalIdLine).not.toMatch(/on delete/i)
  })

  it('RLS ativo nas duas tabelas', () => {
    expect(sql).toMatch(/alter\s+table\s+admins\s+enable\s+row\s+level\s+security\s*;/i)
    expect(sql).toMatch(/alter\s+table\s+admin_audit_log\s+enable\s+row\s+level\s+security\s*;/i)
  })

  it('admins: só a policy "Admin reads own record" (self-read por user_id), sem INSERT/UPDATE/DELETE', () => {
    expect(sql).toMatch(/create\s+policy\s+if\s+not\s+exists\s+"Admin reads own record"\s*\n\s*on\s+admins\s+for\s+select\s*\n\s*using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)\s*;/i)
    expect(sql).not.toMatch(/on\s+admins\s+for\s+(insert|update|delete)/i)
  })

  it('admin_audit_log: só a policy "Admins read audit log" (via EXISTS em admins), sem INSERT/UPDATE/DELETE', () => {
    expect(sql).toMatch(/create\s+policy\s+if\s+not\s+exists\s+"Admins read audit log"\s*\n\s*on\s+admin_audit_log\s+for\s+select\s*\n\s*using\s*\(\s*exists\s*\(\s*select\s+1\s+from\s+admins\s+where\s+admins\.user_id\s*=\s*auth\.uid\(\)\s*\)\s*\)\s*;/i)
    expect(sql).not.toMatch(/on\s+admin_audit_log\s+for\s+(insert|update|delete)/i)
  })
})
