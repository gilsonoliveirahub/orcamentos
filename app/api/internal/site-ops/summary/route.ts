export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { Client } from 'pg'
import { NextRequest, NextResponse } from 'next/server'
import {
  extractBearerToken,
  fetchSiteOpsReadonlySummary,
  tokenConfigured,
  verifySiteOpsReadonlyToken,
} from '@/lib/site-ops-readonly-summary'
import { SUPABASE_ROOT_CA } from '@/lib/supabase-root-ca'

const TOKEN_ENV = 'SITE_FACOPORTI_OPS_READONLY_TOKEN'
const DB_URL_ENV = 'SITE_FACOPORTI_OPS_DB_URL'
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, private' }

function jsonNoStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...(init?.headers || {}) },
  })
}

function methodNotAllowed() {
  return jsonNoStore(
    { error: 'Método não permitido' },
    { status: 405, headers: { Allow: 'GET' } }
  )
}

function requestToken(req: NextRequest) {
  return extractBearerToken(req.headers.get('authorization')) || req.headers.get('x-facoporti-readonly-token')
}

export async function GET(req: NextRequest) {
  const expectedToken = process.env[TOKEN_ENV]
  if (!tokenConfigured(expectedToken)) {
    return jsonNoStore({ error: 'Credencial read-only não configurada' }, { status: 503 })
  }

  if (!verifySiteOpsReadonlyToken(requestToken(req), expectedToken)) {
    return jsonNoStore({ error: 'Não autorizado' }, { status: 403 })
  }

  const dbUrl = process.env[DB_URL_ENV]
  if (!tokenConfigured(dbUrl)) {
    return jsonNoStore({ error: 'Credencial RPC read-only não configurada' }, { status: 503 })
  }

  // dbUrl liga diretamente ao shared pooler (Supavisor, modo transação) como
  // o role dedicado site_ops_readonly_server — não usa supabase-js/PostgREST
  // nem nenhuma API Key da Supabase (secret_jwt_template exige plano Pro).
  // O role só tem EXECUTE nesta RPC e USAGE no schema, nunca SELECT em
  // tabelas; nunca usa SUPABASE_SERVICE_ROLE_KEY. TLS sempre validado contra
  // o CA real da Supabase (rejectUnauthorized + ca fixado), nunca desligado.
  //
  // Nunca passar `connectionString` directamente ao Client: o pg-connection-string
  // interpreta `sslmode` da própria URL (mesmo sem o termo estar presente) e
  // ignora o `ca` explícito, validando contra o conjunto de CAs por omissão do
  // Node — que não conhece a CA própria da Supabase, falhando com
  // "self-signed certificate in certificate chain". Por isso os campos são
  // extraídos à mão e passados em separado, nunca via connectionString.
  const parsedUrl = new URL(dbUrl)
  const client = new Client({
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || 5432),
    database: parsedUrl.pathname.replace(/^\//, '') || 'postgres',
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    ssl: { rejectUnauthorized: true, ca: SUPABASE_ROOT_CA },
    connectionTimeoutMillis: 10000,
  })

  try {
    await client.connect()
    const summary = await fetchSiteOpsReadonlySummary(client)
    return jsonNoStore(summary)
  } catch (error) {
    console.error('[api/internal/site-ops/summary] falha ao gerar resumo:', error instanceof Error ? error.message : error)
    return jsonNoStore({ error: 'Falha ao gerar resumo read-only' }, { status: 500 })
  } finally {
    await client.end().catch(() => {})
  }
}

export const POST = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
