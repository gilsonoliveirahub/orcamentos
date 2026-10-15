#!/usr/bin/env node
/*
 * Gera JWT HS256 para role dedicado Supabase em ambiente off-production.
 * Não usar em produção sem aprovação. Não enviar segredo/JWT por Telegram/chat.
 *
 * Compatibilidade: serve apenas para projetos Supabase/PostgREST configurados
 * com assinatura JWT simétrica HS256 via JWT secret do projeto. Se o staging
 * estiver configurado com signing keys assimétricas/JWKS, este script NÃO é o
 * caminho correto; gere o token pelo mecanismo oficial do projeto.
 *
 * Env obrigatórias:
 *   SUPABASE_JWT_SECRET=*** segredo JWT do projeto staging/local ***
 * Env opcionais:
 *   SITE_OPS_JWT_TTL_SECONDS=3600
 *   SITE_OPS_JWT_ROLE=site_ops_readonly_server
 */

import { createHmac, randomUUID } from 'node:crypto'

const secret = process.env.SUPABASE_JWT_SECRET
const role = process.env.SITE_OPS_JWT_ROLE || 'site_ops_readonly_server'
const ttlSeconds = Number.parseInt(process.env.SITE_OPS_JWT_TTL_SECONDS || '3600', 10)

if (!secret || secret.length < 32) {
  console.error('Falta SUPABASE_JWT_SECRET com comprimento seguro (>=32). Não cole segredo em chat.')
  process.exit(2)
}

if (!Number.isFinite(ttlSeconds) || ttlSeconds < 300 || ttlSeconds > 86400) {
  console.error('SITE_OPS_JWT_TTL_SECONDS deve ficar entre 300 e 86400 segundos.')
  process.exit(2)
}

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

const now = Math.floor(Date.now() / 1000)
const header = { alg: 'HS256', typ: 'JWT' }
const payload = {
  aud: 'authenticated',
  exp: now + ttlSeconds,
  iat: now,
  iss: 'supabase',
  role,
  sub: randomUUID(),
}

const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
const signature = createHmac('sha256', secret).update(unsigned).digest('base64url')

console.log(`${unsigned}.${signature}`)
