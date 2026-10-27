import { Client } from 'pg'
import { NextRequest, NextResponse } from 'next/server'
import { extractBearerToken, tokenConfigured, verifyAquilesActionsToken } from '@/lib/aquiles-actions'
import { SUPABASE_ROOT_CA } from '@/lib/supabase-root-ca'

// Partilhado pelas duas rotas internas (actions/route.ts e
// actions/[id]/route.ts) para não duplicar a verificação de token e a
// ligação pg — mesmo padrão de /api/internal/site-ops/summary, mas com
// credenciais e role Postgres próprios (site_ops_actions_server), nunca os
// do conector read-only.

export const TOKEN_ENV = 'SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN'
export const DB_URL_ENV = 'SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL'
export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, private' }

export function jsonNoStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...(init?.headers || {}) } })
}

export function methodNotAllowed(allow: string) {
  return jsonNoStore({ error: 'Método não permitido' }, { status: 405, headers: { Allow: allow } })
}

type AuthorizedResult = { ok: true; dbUrl: string } | { ok: false; response: NextResponse }

export function authorizeAquilesActionsRequest(req: NextRequest): AuthorizedResult {
  const expectedToken = process.env[TOKEN_ENV]
  if (!tokenConfigured(expectedToken)) {
    return { ok: false, response: jsonNoStore({ error: 'Credencial de ações não configurada' }, { status: 503 }) }
  }

  const provided = extractBearerToken(req.headers.get('authorization'))
  if (!verifyAquilesActionsToken(provided, expectedToken)) {
    return { ok: false, response: jsonNoStore({ error: 'Não autorizado' }, { status: 403 }) }
  }

  const dbUrl = process.env[DB_URL_ENV]
  if (!tokenConfigured(dbUrl)) {
    return { ok: false, response: jsonNoStore({ error: 'Credencial RPC de ações não configurada' }, { status: 503 }) }
  }

  return { ok: true, dbUrl }
}

// Nunca passar `connectionString` directamente ao Client — ver comentário em
// lib equivalente do site-ops-readonly-summary sobre o pg-connection-string
// ignorar o `ca` explícito quando `sslmode` vem embutido na própria URL.
export function openAquilesActionsClient(dbUrl: string) {
  const parsedUrl = new URL(dbUrl)
  return new Client({
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || 5432),
    database: parsedUrl.pathname.replace(/^\//, '') || 'postgres',
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    ssl: { rejectUnauthorized: true, ca: SUPABASE_ROOT_CA },
    connectionTimeoutMillis: 10000,
  })
}
