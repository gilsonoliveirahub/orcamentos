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
const RPC_SECRET_KEY_ENV = 'SITE_FACOPORTI_OPS_RPC_SECRET_KEY'
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
  const rpcSecretKey = process.env[RPC_SECRET_KEY_ENV]
  if (!supabaseUrl || !tokenConfigured(rpcSecretKey)) {
    return jsonNoStore({ error: 'Credencial RPC read-only não configurada' }, { status: 503 })
  }

  try {
    // rpcSecretKey é uma chave sb_secret_... dedicada (API Keys novas da
    // Supabase), criada com secret_jwt_template.role = site_ops_readonly_server.
    // NÃO é um JWT — é um token opaco. Por isso vai só no header `apikey`
    // (comportamento nativo do supabase-js quando passada como key do
    // createClient), nunca montado à mão como `Authorization: Bearer`: a
    // Supabase documenta explicitamente que colar uma chave nova no header
    // Authorization como JWT é rejeitado nas Edge Functions e, na API REST,
    // passa uma verificação superficial sem autenticar de facto — a
    // autenticação e a troca pelo role dedicado acontecem só via `apikey`,
    // dentro do gateway da Supabase. Nunca usa SUPABASE_SERVICE_ROLE_KEY e
    // nunca concede SELECT direto/anónimo às tabelas privadas.
    const supabase = createClient(supabaseUrl, rpcSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
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
