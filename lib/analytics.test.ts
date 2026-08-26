import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// lib/analytics.ts importa @/lib/supabase-admin no topo do ficheiro (para
// recordRequestCompleted). Sem isto, o import estático abaixo falharia com
// "supabaseUrl is required" em ambiente de teste (sem .env.local), mesmo
// para os testes de funções puras que não tocam na base de dados. Os testes
// que precisam de um comportamento específico de supabaseAdmin substituem
// este mock com vi.doMock + import dinâmico (ver describe('recordRequestCompleted')).
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

import {
  hashVisitor,
  isAllowedPath,
  isKnownBot,
  sanitizeUtm,
  extractHostname,
  normalizeOriginChannel,
  EVENT_TYPES,
  SERVER_ONLY_EVENT_TYPES,
  clientIpFrom,
} from './analytics'

describe('hashVisitor (HMAC-SHA256)', () => {
  it('produces the same hash for the same IP+UA+day', () => {
    const a = hashVisitor('1.2.3.4', 'Mozilla/5.0', 'segredo-fixo', '2026-07-16')
    const b = hashVisitor('1.2.3.4', 'Mozilla/5.0', 'segredo-fixo', '2026-07-16')
    expect(a).toBe(b)
  })

  it('produces a different hash the next day, with the same permanent secret', () => {
    const today = hashVisitor('1.2.3.4', 'Mozilla/5.0', 'segredo-fixo', '2026-07-16')
    const tomorrow = hashVisitor('1.2.3.4', 'Mozilla/5.0', 'segredo-fixo', '2026-07-17')
    expect(today).not.toBe(tomorrow)
  })

  it('produces a different hash for a different visitor on the same day', () => {
    const a = hashVisitor('1.2.3.4', 'Mozilla/5.0', 'segredo-fixo', '2026-07-16')
    const b = hashVisitor('5.6.7.8', 'Mozilla/5.0', 'segredo-fixo', '2026-07-16')
    expect(a).not.toBe(b)
  })

  it('never contains the raw IP or User-Agent in the resulting hash', () => {
    const hash = hashVisitor('192.168.1.100', 'MyCustomBrowser/1.0', 'segredo-fixo', '2026-07-16')
    expect(hash).not.toContain('192.168.1.100')
    expect(hash).not.toContain('MyCustomBrowser')
    expect(hash).toMatch(/^[a-f0-9]{64}$/) // hex de 64 caracteres (SHA-256)
  })

  it('produces a different hash with a different secret (segredo nunca sai do servidor)', () => {
    const a = hashVisitor('1.2.3.4', 'Mozilla/5.0', 'segredo-a', '2026-07-16')
    const b = hashVisitor('1.2.3.4', 'Mozilla/5.0', 'segredo-b', '2026-07-16')
    expect(a).not.toBe(b)
  })
})

describe('isAllowedPath', () => {
  it('accepts fixed known paths', () => {
    expect(isAllowedPath('/')).toBe(true)
    expect(isAllowedPath('/contactos')).toBe(true)
    expect(isAllowedPath('/pedir')).toBe(true)
  })

  it('accepts professional slugs in the expected format', () => {
    expect(isAllowedPath('/p/gilson-oliveira')).toBe(true)
    expect(isAllowedPath('/p/luiz-santos-2716')).toBe(true)
  })

  it('rejects unknown paths and injection attempts', () => {
    expect(isAllowedPath('/admin')).toBe(false)
    expect(isAllowedPath('/dashboard')).toBe(false)
    expect(isAllowedPath('/p/<script>alert(1)</script>')).toBe(false)
    expect(isAllowedPath('/p/')).toBe(false)
    expect(isAllowedPath('not-a-path')).toBe(false)
  })
})

describe('isKnownBot', () => {
  it('flags common crawlers and the WhatsApp link-preview fetcher', () => {
    expect(isKnownBot('Googlebot/2.1')).toBe(true)
    expect(isKnownBot('facebookexternalhit/1.1')).toBe(true)
    expect(isKnownBot('WhatsApp/2.23')).toBe(true)
    expect(isKnownBot('curl/8.0')).toBe(true)
  })

  it('treats a missing User-Agent as untrustworthy', () => {
    expect(isKnownBot(null)).toBe(true)
    expect(isKnownBot(undefined)).toBe(true)
    expect(isKnownBot('')).toBe(true)
  })

  it('allows a normal mobile browser User-Agent', () => {
    expect(isKnownBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(false)
  })
})

describe('sanitizeUtm', () => {
  it('strips characters that could be interpreted as HTML/markup', () => {
    expect(sanitizeUtm('<script>alert(1)</script>')).toBe('scriptalert1script')
    expect(sanitizeUtm('a&b"c\'d')).toBe('abcd')
  })

  it('keeps normal campaign text', () => {
    expect(sanitizeUtm('promo-verao_2026')).toBe('promo-verao_2026')
  })

  it('enforces a maximum length', () => {
    const long = 'a'.repeat(500)
    expect(sanitizeUtm(long)?.length).toBeLessThanOrEqual(100)
  })

  it('returns null for empty or missing values', () => {
    expect(sanitizeUtm(null)).toBeNull()
    expect(sanitizeUtm(undefined)).toBeNull()
    expect(sanitizeUtm('')).toBeNull()
  })
})

describe('extractHostname', () => {
  it('extracts only the hostname, dropping path/query/hash', () => {
    expect(extractHostname('https://www.instagram.com/p/abc123?utm_source=ig')).toBe('instagram.com')
  })

  it('returns null for invalid URLs', () => {
    expect(extractHostname('not a url')).toBeNull()
    expect(extractHostname(null)).toBeNull()
  })
})

describe('normalizeOriginChannel', () => {
  it('classifies known domains', () => {
    expect(normalizeOriginChannel('instagram.com', null)).toBe('instagram')
    expect(normalizeOriginChannel('l.facebook.com', null)).toBe('facebook')
    expect(normalizeOriginChannel('wa.me', null)).toBe('whatsapp')
    expect(normalizeOriginChannel('google.pt', null)).toBe('google')
  })

  it('prioritizes utm_source over the referrer domain', () => {
    expect(normalizeOriginChannel('t.co', 'instagram')).toBe('instagram')
  })

  it('classifies as "direto" when there is no referrer nor utm_source', () => {
    expect(normalizeOriginChannel(null, null)).toBe('direto')
  })

  it('classifies unknown referrers as "outro"', () => {
    expect(normalizeOriginChannel('some-unknown-blog.pt', null)).toBe('outro')
  })

  it('classifies known AI chat products as "ia" (nunca motores de busca ambíguos como bing.com)', () => {
    expect(normalizeOriginChannel('chat.openai.com', null)).toBe('ia')
    expect(normalizeOriginChannel('claude.ai', null)).toBe('ia')
    expect(normalizeOriginChannel('perplexity.ai', null)).toBe('ia')
    expect(normalizeOriginChannel('bing.com', null)).toBe('outro')
  })

  it('classifica por utm_source de IA mesmo sem o domínio de referrer correspondente', () => {
    expect(normalizeOriginChannel('t.co', 'chatgpt')).toBe('ia')
  })
})

describe('event type whitelist', () => {
  it('marks request_completed as server-only', () => {
    expect(SERVER_ONLY_EVENT_TYPES).toContain('request_completed')
  })

  it('has exactly the 6 expected event types', () => {
    expect([...EVENT_TYPES].sort()).toEqual([
      'email_click', 'page_view', 'quote_cta_click', 'request_completed', 'request_started', 'whatsapp_click',
    ])
  })
})

describe('clientIpFrom', () => {
  it('prefers x-forwarded-for, taking only the first IP', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })
    expect(clientIpFrom(headers)).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip, then "unknown"', () => {
    expect(clientIpFrom(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9')
    expect(clientIpFrom(new Headers())).toBe('unknown')
  })
})

describe('recordRequestCompleted', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, ANALYTICS_HASH_SECRET: 'segredo-teste' }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('inserts a request_completed event with a hash, never with raw IP/User-Agent', async () => {
    const insertedRows: Record<string, unknown>[] = []
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: () => ({
          insert: (row: Record<string, unknown>) => { insertedRows.push(row); return Promise.resolve({ error: null }) },
        }),
      },
    }))

    const { recordRequestCompleted } = await import('./analytics')
    await recordRequestCompleted({ ip: '1.2.3.4', userAgent: 'Mozilla/5.0', professionalId: 'prof-1', source: 'pessoal', path: '/p/[slug]' })

    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0].event_type).toBe('request_completed')
    expect(insertedRows[0].professional_id).toBe('prof-1')
    expect(JSON.stringify(insertedRows[0])).not.toContain('1.2.3.4')
    expect(JSON.stringify(insertedRows[0])).not.toContain('Mozilla/5.0')
    expect(insertedRows[0].visitor_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('does not insert anything when ANALYTICS_HASH_SECRET is missing', async () => {
    delete process.env.ANALYTICS_HASH_SECRET
    const insert = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: () => ({ insert }) } }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { recordRequestCompleted } = await import('./analytics')
    await recordRequestCompleted({ ip: '1.2.3.4', userAgent: 'Mozilla/5.0', professionalId: null, source: 'marketplace', path: '/pedir' })

    expect(insert).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ANALYTICS_HASH_SECRET'))
  })

  it('accepts professionalId: null (marketplace sem profissional disponível)', async () => {
    const insertedRows: Record<string, unknown>[] = []
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ insert: (row: Record<string, unknown>) => { insertedRows.push(row); return Promise.resolve({ error: null }) } }) },
    }))

    const { recordRequestCompleted } = await import('./analytics')
    await recordRequestCompleted({ ip: '1.2.3.4', userAgent: 'Mozilla/5.0', professionalId: null, source: 'marketplace', path: '/pedir' })

    expect(insertedRows[0].professional_id).toBeNull()
  })

  it('grava a atribuição de campanha (UTM/canal) quando fornecida — sem isto o pedido concluído nunca podia ser ligado à visita/campanha que o originou', async () => {
    const insertedRows: Record<string, unknown>[] = []
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ insert: (row: Record<string, unknown>) => { insertedRows.push(row); return Promise.resolve({ error: null }) } }) },
    }))

    const { recordRequestCompleted } = await import('./analytics')
    await recordRequestCompleted({
      ip: '1.2.3.4', userAgent: 'Mozilla/5.0', professionalId: null, source: 'marketplace', path: '/pedir',
      referrerDomain: 'facebook.com', utmSource: 'facebook', utmMedium: 'cpc', utmCampaign: 'lancamento', originChannel: 'facebook',
    })

    expect(insertedRows[0]).toMatchObject({
      referrer_domain: 'facebook.com',
      utm_source: 'facebook',
      utm_medium: 'cpc',
      utm_campaign: 'lancamento',
      origin_channel: 'facebook',
    })
  })
})
