import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }

function fakeRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: { get: (name: string) => (name === 'user-agent' ? 'Mozilla/5.0 (cliente real)' : name === 'x-forwarded-for' ? '203.0.113.9' : null) },
  } as unknown as NextRequest
}

// Todas as rotas que criam um lead chamam notifyLeadCreated() diretamente
// (P0, 2026-09-18) — mockado por omissão em todos os testes deste ficheiro
// para nunca disparar um envio real; testes específicos de notificação
// substituem este mock por um vi.fn() para verificar as chamadas.
function mockNotifyLeadDefault() {
  vi.doMock('@/lib/notify-lead', () => ({ notifyLeadCreated: vi.fn().mockResolvedValue({ ok: true }) }))
}

describe('POST /api/leads/public — registo de request_completed', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, ANALYTICS_HASH_SECRET: 'segredo-teste' }
    mockNotifyLeadDefault()
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/notify-lead')
  })

  it('regista request_completed no servidor, com o professional_id correto, depois de criar o lead com sucesso', async () => {
    const analyticsInserts: Record<string, unknown>[] = []
    const from = vi.fn((table: string) => {
      if (table === 'professionals') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1', marketplace_credits: 0 } }) }) }) }
      }
      if (table === 'leads') {
        return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'lead-1' }, error: null }) }) }) }
      }
      if (table === 'analytics_events') {
        return { insert: (row: Record<string, unknown>) => { analyticsInserts.push(row); return Promise.resolve({ error: null }) } }
      }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', name: 'Cliente', phone: '351911111111', source: 'pessoal' }))

    expect(res.status).toBe(200)
    expect(analyticsInserts).toHaveLength(1)
    expect(analyticsInserts[0]).toMatchObject({ event_type: 'request_completed', professional_id: 'prof-1', source: 'pessoal' })
    // Nunca guarda IP/User-Agent — só o hash
    expect(JSON.stringify(analyticsInserts[0])).not.toContain('203.0.113.9')
    expect(JSON.stringify(analyticsInserts[0])).not.toContain('cliente real')
  })

  it('não regista request_completed quando a criação do lead falha', async () => {
    const analyticsInsert = vi.fn()
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1', marketplace_credits: 0 } }) }) }) }
      if (table === 'leads') return { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'falha' } }) }) }) }
      if (table === 'analytics_events') return { insert: analyticsInsert }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', name: 'Cliente', phone: '351911111111' }))

    expect(res.status).toBe(400)
    expect(analyticsInsert).not.toHaveBeenCalled()
  })

  it('propaga referrer/UTM da submissão para o evento request_completed, sem os gravar como colunas do lead', async () => {
    const analyticsInserts: Record<string, unknown>[] = []
    const leadInserts: Record<string, unknown>[] = []
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1', marketplace_credits: 0 } }) }) }) }
      if (table === 'leads') {
        return {
          insert: (payload: Record<string, unknown>) => {
            leadInserts.push(payload)
            return { select: () => ({ single: async () => ({ data: { id: 'lead-1' }, error: null }) }) }
          },
        }
      }
      if (table === 'analytics_events') return { insert: (row: Record<string, unknown>) => { analyticsInserts.push(row); return Promise.resolve({ error: null }) } }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { POST } = await import('./route')
    await POST(fakeRequest({
      professional_id: 'prof-1', name: 'Cliente', phone: '351911111111', source: 'pessoal',
      referrer: 'https://www.instagram.com/algumsitio', utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'bio',
    }))

    expect(analyticsInserts[0]).toMatchObject({
      referrer_domain: 'instagram.com', utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'bio', origin_channel: 'instagram',
    })
    expect(leadInserts[0]).not.toHaveProperty('referrer')
    expect(leadInserts[0]).not.toHaveProperty('utm_source')
  })

  it('marca source: marketplace quando o pedido veio via ?ref=marketplace no /p/[slug]', async () => {
    const analyticsInserts: Record<string, unknown>[] = []
    // Como o marketplace_credits > 0, o código chama .update(...) na tabela
    // professionals antes do insert do lead (dedução atómica de crédito).
    const profFrom = vi.fn(() => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1', marketplace_credits: 5 } }) }) }),
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }) }),
    }))
    const fromCombined = vi.fn((table: string) => {
      if (table === 'professionals') return profFrom()
      if (table === 'leads') return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'lead-2' }, error: null }) }) }) }
      if (table === 'analytics_events') return { insert: (row: Record<string, unknown>) => { analyticsInserts.push(row); return Promise.resolve({ error: null }) } }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: fromCombined } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', name: 'Cliente', phone: '351911111111', source: 'marketplace' }))

    expect(res.status).toBe(200)
    expect(analyticsInserts[0]).toMatchObject({ event_type: 'request_completed', source: 'marketplace' })
  })
})

describe('POST /api/leads/public — consentimento de marketing do CLIENTE', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, ANALYTICS_HASH_SECRET: 'segredo-teste' }
    mockNotifyLeadDefault()
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/notify-lead')
  })

  function mockSupabase() {
    const leadInserts: Record<string, unknown>[] = []
    const consentUpserts: Array<[Record<string, unknown>, Record<string, unknown>]> = []
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1', marketplace_credits: 0 } }) }) }) }
      if (table === 'leads') {
        return {
          insert: (payload: Record<string, unknown>) => {
            leadInserts.push(payload)
            return { select: () => ({ single: async () => ({ data: { id: 'lead-1', ...payload }, error: null }) }) }
          },
        }
      }
      if (table === 'marketing_consents') {
        return { upsert: (payload: Record<string, unknown>, opts: Record<string, unknown>) => { consentUpserts.push([payload, opts]); return Promise.resolve({ error: null }) } }
      }
      if (table === 'analytics_events') return { insert: async () => ({ error: null }) }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    return { leadInserts, consentUpserts }
  }

  it('checkbox marcada + email: grava no lead e regista em marketing_consents com origem p_slug', async () => {
    const { leadInserts, consentUpserts } = mockSupabase()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({
      professional_id: 'prof-1', name: 'Cliente', phone: '351911111111', email: 'cliente@example.com', marketing_opt_in: true,
    }))

    expect(res.status).toBe(200)
    expect(leadInserts[0]).toMatchObject({ marketing_opt_in: true, marketing_consent_version: 'v1', marketing_consent_source: 'p_slug' })
    expect(consentUpserts).toHaveLength(1)
    expect(consentUpserts[0][0]).toMatchObject({ email: 'cliente@example.com', opted_in: true, lead_id: 'lead-1' })
  })

  it('checkbox marcada sem email: grava no lead mas NÃO cria registo em marketing_consents (nada para enviar)', async () => {
    const { leadInserts, consentUpserts } = mockSupabase()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({
      professional_id: 'prof-1', name: 'Cliente', phone: '351911111111', marketing_opt_in: true,
    }))

    expect(res.status).toBe(200)
    expect(leadInserts[0]).toMatchObject({ marketing_opt_in: true })
    expect(consentUpserts).toHaveLength(0)
  })

  it('checkbox desmarcada (omissão): grava false no lead e não toca em marketing_consents', async () => {
    const { leadInserts, consentUpserts } = mockSupabase()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({
      professional_id: 'prof-1', name: 'Cliente', phone: '351911111111', email: 'cliente@example.com',
    }))

    expect(res.status).toBe(200)
    expect(leadInserts[0]).toMatchObject({ marketing_opt_in: false, marketing_consent_version: null, marketing_consent_source: null })
    expect(consentUpserts).toHaveLength(0)
  })

  it('ignora consent_version/consent_source enviados pelo cliente — são sempre definidos pelo servidor', async () => {
    const { leadInserts } = mockSupabase()
    const { POST } = await import('./route')
    await POST(fakeRequest({
      professional_id: 'prof-1', name: 'Cliente', phone: '351911111111', email: 'cliente@example.com',
      marketing_opt_in: true,
      marketing_consent_version: 'v999-falsificado',
      marketing_consent_source: 'origem-inventada',
    }))

    // O corpo do lead reflete sempre o valor do servidor ('v1', 'p_slug'),
    // nunca o que o cliente tentou enviar diretamente.
    expect(leadInserts[0].marketing_consent_version).toBe('v1')
    expect(leadInserts[0].marketing_consent_source).toBe('p_slug')
  })
})

describe('POST /api/leads/public — proteção idempotente e notificação server-side (P0, 2026-09-18)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, ANALYTICS_HASH_SECRET: 'segredo-teste' }
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/notify-lead')
  })

  function mockSupabase(opts: { existingByKey?: Record<string, unknown> | null } = {}) {
    const leadInserts: Record<string, unknown>[] = []
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1', marketplace_credits: 0 } }) }) }) }
      if (table === 'leads') {
        return {
          // Verificação de idempotência: procura lead existente por chave.
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.existingByKey ?? null }) }) }),
          insert: (payload: Record<string, unknown>) => {
            leadInserts.push(payload)
            return { select: () => ({ single: async () => ({ data: { id: 'lead-novo', ...payload }, error: null }) }) }
          },
        }
      }
      if (table === 'analytics_events') return { insert: async () => ({ error: null }) }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    return { leadInserts }
  }

  it('com idempotency_key nova (sem lead existente): cria o lead normalmente e grava a chave', async () => {
    const { leadInserts } = mockSupabase({ existingByKey: null })
    vi.doMock('@/lib/notify-lead', () => ({ notifyLeadCreated: vi.fn().mockResolvedValue({ ok: true }) }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', name: 'Cliente', phone: '351911111111', idempotency_key: 'chave-abc' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(leadInserts).toHaveLength(1)
    expect(leadInserts[0]).toMatchObject({ idempotency_key: 'chave-abc' })
    expect(json.lead.id).toBe('lead-novo')
  })

  it('com idempotency_key já usada por um lead existente: devolve esse lead, NÃO cria um segundo, NÃO notifica de novo', async () => {
    const existing = { id: 'lead-original', name: 'Cliente', idempotency_key: 'chave-repetida' }
    const { leadInserts } = mockSupabase({ existingByKey: existing })
    const notifyLeadCreated = vi.fn().mockResolvedValue({ ok: true })
    vi.doMock('@/lib/notify-lead', () => ({ notifyLeadCreated }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', name: 'Cliente', phone: '351911111111', idempotency_key: 'chave-repetida' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.lead).toEqual(existing)
    expect(leadInserts).toHaveLength(0) // nunca chega a tentar criar um segundo lead
    expect(notifyLeadCreated).not.toHaveBeenCalled() // já foi notificado na primeira vez
  })

  it('clique duplo (2 submissões concorrentes com a mesma chave, nenhuma vê a outra a tempo): a 2ª colisão do INSERT devolve o lead já criado pela 1ª, em vez de erro', async () => {
    let inserted: Record<string, unknown> | null = null
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1', marketplace_credits: 0 } }) }) }) }
      if (table === 'leads') {
        return {
          // Simula: a verificação inicial não viu nada (ambas as chamadas
          // passaram por aqui antes de qualquer uma escrever), mas o INSERT
          // da 2ª colide com a constraint UNIQUE já cumprida pela 1ª.
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: inserted }) }) }),
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                if (inserted) return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } }
                inserted = { id: 'lead-vencedor', ...payload }
                return { data: inserted, error: null }
              },
            }),
          }),
        }
      }
      if (table === 'analytics_events') return { insert: async () => ({ error: null }) }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const notifyLeadCreated = vi.fn().mockResolvedValue({ ok: true })
    vi.doMock('@/lib/notify-lead', () => ({ notifyLeadCreated }))

    const { POST } = await import('./route')
    const body = { professional_id: 'prof-1', name: 'Cliente', phone: '351911111111', idempotency_key: 'chave-corrida' }
    const [res1, res2] = await Promise.all([POST(fakeRequest(body)), POST(fakeRequest(body))])
    const [json1, json2] = await Promise.all([res1.json(), res2.json()])

    // As duas respostas apontam para o MESMO lead — nunca 2 leads distintos.
    expect(json1.lead.id).toBe('lead-vencedor')
    expect(json2.lead.id).toBe('lead-vencedor')
    // Só uma das duas chamadas chega a notificar (a que criou de facto).
    expect(notifyLeadCreated).toHaveBeenCalledTimes(1)
  })

  it('notifica o profissional exatamente uma vez, de forma aguardada, ao criar um lead novo', async () => {
    mockSupabase({ existingByKey: null })
    const notifyLeadCreated = vi.fn().mockResolvedValue({ ok: true })
    vi.doMock('@/lib/notify-lead', () => ({ notifyLeadCreated }))

    const { POST } = await import('./route')
    await POST(fakeRequest({ professional_id: 'prof-1', name: 'Cliente', phone: '351911111111' }))

    expect(notifyLeadCreated).toHaveBeenCalledTimes(1)
    expect(notifyLeadCreated).toHaveBeenCalledWith('lead-novo')
  })

  it('falha na notificação não impede a resposta nem cria um lead extra — só é registada', async () => {
    const { leadInserts } = mockSupabase({ existingByKey: null })
    const notifyLeadCreated = vi.fn().mockRejectedValue(new Error('falha ao notificar'))
    vi.doMock('@/lib/notify-lead', () => ({ notifyLeadCreated }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', name: 'Cliente', phone: '351911111111' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.lead.id).toBe('lead-novo')
    expect(leadInserts).toHaveLength(1) // um único lead, mesmo com a notificação a falhar
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('notificação falhou'))
  })
})
