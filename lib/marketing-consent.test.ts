import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// lib/marketing-consent.ts importa @/lib/supabase-admin no topo.
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

import { computeClientConsentFields, CLIENT_CONSENT_VERSION } from './marketing-consent'

describe('computeClientConsentFields', () => {
  it('returns all-false/null when the client did not check the box', () => {
    const fields = computeClientConsentFields(false, 'p_slug')
    expect(fields).toEqual({
      marketing_opt_in: false,
      marketing_opt_in_at: null,
      marketing_consent_version: null,
      marketing_consent_source: null,
    })
  })

  it('returns all-false/null for anything that is not strictly boolean true (no truthy coercion)', () => {
    expect(computeClientConsentFields('true', 'pedir').marketing_opt_in).toBe(false)
    expect(computeClientConsentFields(1, 'pedir').marketing_opt_in).toBe(false)
    expect(computeClientConsentFields(undefined, 'pedir').marketing_opt_in).toBe(false)
  })

  it('records version and source, set by the server, when opted in', () => {
    const fields = computeClientConsentFields(true, 'p_slug')
    expect(fields.marketing_opt_in).toBe(true)
    expect(fields.marketing_consent_version).toBe(CLIENT_CONSENT_VERSION)
    expect(fields.marketing_consent_source).toBe('p_slug')
    expect(fields.marketing_opt_in_at).not.toBeNull()
  })

  it('uses the source passed by the route, distinguishing /pedir from /p/[slug]', () => {
    expect(computeClientConsentFields(true, 'pedir').marketing_consent_source).toBe('pedir')
    expect(computeClientConsentFields(true, 'p_slug').marketing_consent_source).toBe('p_slug')
  })
})

describe('upsertClientMarketingConsent', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  const optedInFields = {
    marketing_opt_in: true,
    marketing_opt_in_at: '2026-07-16T00:00:00.000Z',
    marketing_consent_version: 'v1',
    marketing_consent_source: 'p_slug' as const,
  }

  it('does nothing when there is no email, even if opted in', async () => {
    const upsert = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: () => ({ upsert }) } }))
    const { upsertClientMarketingConsent } = await import('./marketing-consent')

    await upsertClientMarketingConsent({ email: null, leadId: 'lead-1', fields: optedInFields })
    await upsertClientMarketingConsent({ email: '', leadId: 'lead-1', fields: optedInFields })

    expect(upsert).not.toHaveBeenCalled()
  })

  it('does nothing when opted_in is false, regardless of email', async () => {
    const upsert = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: () => ({ upsert }) } }))
    const { upsertClientMarketingConsent } = await import('./marketing-consent')

    await upsertClientMarketingConsent({
      email: 'cliente@example.com', leadId: 'lead-1',
      fields: { marketing_opt_in: false, marketing_opt_in_at: null, marketing_consent_version: null, marketing_consent_source: null },
    })

    expect(upsert).not.toHaveBeenCalled()
  })

  it('upserts by normalized (lowercase, trimmed) email, keyed on email for the conflict target', async () => {
    const calls: Array<[Record<string, unknown>, Record<string, unknown>]> = []
    const upsert = vi.fn((payload: Record<string, unknown>, opts: Record<string, unknown>) => { calls.push([payload, opts]); return Promise.resolve({ error: null }) })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: () => ({ upsert }) } }))
    const { upsertClientMarketingConsent } = await import('./marketing-consent')

    await upsertClientMarketingConsent({ email: '  Cliente@Example.com  ', leadId: 'lead-42', fields: optedInFields })

    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toMatchObject({ email: 'cliente@example.com', opted_in: true, lead_id: 'lead-42', consent_version: 'v1', consent_source: 'p_slug' })
    expect(calls[0][1]).toEqual({ onConflict: 'email' })
  })
})
