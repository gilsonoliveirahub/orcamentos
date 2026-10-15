export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  extractBearerToken,
  fetchSiteOpsReadonlySummary,
  tokenConfigured,
  verifySiteOpsReadonlyToken,
} from '@/lib/site-ops-readonly-summary'

const TOKEN_ENV = 'SITE_FACOPORTI_OPS_READONLY_TOKEN'
const RPC_JWT_ENV = 'SITE_FACOPORTI_OPS_RPC_JWT'
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const rpcJwt = process.env[RPC_JWT_ENV]
  if (!supabaseUrl || !supabaseAnonKey || !tokenConfigured(rpcJwt)) {
    return jsonNoStore({ error: 'Credencial RPC read-only não configurada' }, { status: 503 })
  }

  try {
    // Usa a anon key apenas como apikey pública do projeto Supabase e um JWT
    // server-side de papel dedicado no header Authorization para executar só a
    // RPC agregada site_ops_readonly_summary(). Não lê nem usa
    // SUPABASE_SERVICE_ROLE_KEY e não concede SELECT direto/anónimo às tabelas
    // privadas.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${rpcJwt}` } },
    })

    const summary = await fetchSiteOpsReadonlySummary(supabase)
    return jsonNoStore(summary)
  } catch (error) {
    console.error('[api/internal/site-ops/summary] falha ao gerar resumo:', error instanceof Error ? error.message : error)
    return jsonNoStore({ error: 'Falha ao gerar resumo read-only' }, { status: 500 })
  }
}

export const POST = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
