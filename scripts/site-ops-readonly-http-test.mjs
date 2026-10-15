#!/usr/bin/env node
/*
 * FaçoPorTi — teste HTTP off-production do endpoint read-only site ops.
 * Não imprime tokens. Usar só contra localhost/staging, nunca produção.
 *
 * Env obrigatórias:
 *   SITE_OPS_SUMMARY_URL=http://127.0.0.1:3000/api/internal/site-ops/summary
 *   SITE_FACOPORTI_OPS_READONLY_TOKEN=<token de acesso do endpoint staging/local>
 */

const url = process.env.SITE_OPS_SUMMARY_URL
const token = process.env.SITE_FACOPORTI_OPS_READONLY_TOKEN

if (!url || !token) {
  console.error('Faltam envs: SITE_OPS_SUMMARY_URL e SITE_FACOPORTI_OPS_READONLY_TOKEN')
  process.exit(2)
}

if (/facoporti\.pt|vercel\.app|production|prod/i.test(url) && !/localhost|127\.0\.0\.1|staging|preview|test/i.test(url)) {
  console.error('Recusado: URL parece produção. Use apenas localhost/staging/preview/test.')
  process.exit(2)
}

const piiKeyPattern = /^(id|name|email|phone|telefone|telemovel|telemóvel|client|cliente|professional_id|user_id)$/i
const piiValuePattern = /@|\+?351|\b9\d{8}\b|Cliente Sintético|Teste Readonly/i

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function hasPii(value) {
  if (Array.isArray(value)) return value.some(hasPii)
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, nested]) => piiKeyPattern.test(key) || hasPii(nested))
  }
  return typeof value === 'string' && piiValuePattern.test(value)
}

async function request(method, bearer) {
  const headers = bearer ? { Authorization: `Bearer ${bearer}` } : undefined
  const response = await fetch(url, { method, headers })
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { response, body }
}

async function main() {
  const missing = await request('GET')
  assert(missing.response.status === 403, `GET sem token deveria ser 403, obtido ${missing.response.status}`)
  assert(missing.response.headers.get('cache-control') === 'no-store, private', 'GET sem token sem Cache-Control no-store/private')

  const wrong = await request('GET', `${token}-errado`)
  assert(wrong.response.status === 403, `GET token errado deveria ser 403, obtido ${wrong.response.status}`)
  assert(wrong.response.headers.get('cache-control') === 'no-store, private', 'GET token errado sem Cache-Control no-store/private')

  const ok = await request('GET', token)
  assert(ok.response.status === 200, `GET token correto deveria ser 200, obtido ${ok.response.status}: ${JSON.stringify(ok.body)}`)
  assert(ok.response.headers.get('cache-control') === 'no-store, private', 'GET token correto sem Cache-Control no-store/private')
  assert(ok.body && typeof ok.body === 'object', 'Resposta 200 não é JSON object')
  assert(ok.body.generated_at && ok.body.leads && ok.body.professionals && ok.body.analytics, 'Resposta sem chaves agregadas obrigatórias')
  assert(!hasPii(ok.body), 'Resposta contém PII/identificador proibido')
  assert(typeof ok.body.leads.total === 'number', 'leads.total não é number')
  assert(typeof ok.body.professionals.total === 'number', 'professionals.total não é number')
  assert(typeof ok.body.analytics.events_total === 'number', 'analytics.events_total não é number')

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const blocked = await request(method, token)
    assert(blocked.response.status === 405, `${method} deveria ser 405, obtido ${blocked.response.status}`)
    assert(blocked.response.headers.get('allow') === 'GET', `${method} deveria devolver Allow: GET`)
    assert(blocked.response.headers.get('cache-control') === 'no-store, private', `${method} sem Cache-Control no-store/private`)
  }

  console.log('OK: endpoint read-only validado via HTTP off-production sem imprimir tokens.')
}

main().catch((error) => {
  console.error(`FALHA: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
