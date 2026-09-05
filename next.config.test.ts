import { describe, it, expect } from 'vitest'
import nextConfig from './next.config'

// Guarda dos headers de seguranca (Grupo 4, topico 2) — confirma que as
// protecoes reais estao presentes e que as excecoes documentadas (Supabase,
// geolocation) continuam exatamente como o necessario, nem mais nem menos.
describe('next.config.ts — headers de seguranca', () => {
  async function getHeaders() {
    const rules = await nextConfig.headers!()
    expect(rules).toHaveLength(1)
    expect(rules[0].source).toBe('/(.*)')
    const map: Record<string, string> = {}
    for (const h of rules[0].headers) map[h.key] = h.value
    return map
  }

  it('define todos os headers de seguranca esperados', async () => {
    const headers = await getHeaders()
    for (const key of [
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(headers[key]).toBeTruthy()
    }
  })

  it('X-Content-Type-Options e nosniff', async () => {
    const headers = await getHeaders()
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
  })

  it('HSTS: 2 anos + includeSubDomains, sem preload (decisao pendente, nunca automatica)', async () => {
    const headers = await getHeaders()
    expect(headers['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains')
    expect(headers['Strict-Transport-Security']).not.toMatch(/preload/)
  })

  it('Permissions-Policy: geolocation permitido para self (usado em /profissionais), camera/microfone bloqueados', async () => {
    const headers = await getHeaders()
    expect(headers['Permissions-Policy']).toMatch(/geolocation=\(self\)/)
    expect(headers['Permissions-Policy']).toMatch(/camera=\(\)/)
    expect(headers['Permissions-Policy']).toMatch(/microphone=\(\)/)
  })

  it('CSP: connect-src e img-src incluem o Supabase (senao dashboard/admin partiam-se)', async () => {
    const headers = await getHeaders()
    expect(headers['Content-Security-Policy']).toMatch(/connect-src[^;]*https:\/\/\*\.supabase\.co/)
    expect(headers['Content-Security-Policy']).toMatch(/img-src[^;]*https:\/\/\*\.supabase\.co/)
  })

  it('CSP: bloqueia embutir o site noutro site (frame-ancestors) e plugins legacy (object-src)', async () => {
    const headers = await getHeaders()
    expect(headers['Content-Security-Policy']).toMatch(/frame-ancestors 'self'/)
    expect(headers['Content-Security-Policy']).toMatch(/object-src 'none'/)
  })

  it('CSP: formulários só submetem para o próprio site (form-action)', async () => {
    const headers = await getHeaders()
    expect(headers['Content-Security-Policy']).toMatch(/form-action 'self'/)
  })

  it('CSP: nunca inclui unsafe-eval fora de desenvolvimento', async () => {
    const headers = await getHeaders()
    if (process.env.NODE_ENV !== 'development') {
      expect(headers['Content-Security-Policy']).not.toMatch(/unsafe-eval/)
    }
  })
})
