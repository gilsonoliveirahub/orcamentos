import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractBearerToken,
  fetchSiteOpsReadonlySummary,
  verifySiteOpsReadonlyToken,
  type SiteOpsSummaryQueryClient,
  type SiteOpsReadonlySummary,
} from './site-ops-readonly-summary'

const FIXTURE_SUMMARY: SiteOpsReadonlySummary = {
  generated_at: '2026-10-07T12:00:00.000Z',
  leads: {
    total: 3,
    assigned_total: 2,
    with_closed_value_total: 2,
    closed_value_sum: 375,
    by_status: { novo: 1, fechado: 2 },
    by_source: { marketplace: 2, pessoal: 1 },
    by_specialty: { Pintura: 2, 'Canalização': 1 },
    by_zone_requested: { Porto: 2, Lisboa: 1 },
    by_month: { '2026-10': 2, '2026-09': 1 },
  },
  professionals: {
    total: 2,
    active_total: 1,
    inactive_total: 1,
    trial_ending_soon_total: 1,
    by_plan: { pro: 1, inactive: 1 },
    by_specialty: { Pintura: 1, Pladur: 1, 'Canalização': 1 },
    by_zone: { Porto: 1, Lisboa: 1 },
    by_month: { '2026-10': 1, '2026-09': 1 },
  },
  analytics: {
    events_total: 5,
    unique_visitors_daily_sum: 4,
    by_event_type: { profile_view: 3, request_started: 2 },
    by_origin_channel: { google: 3, direto: 2 },
    by_source: { marketplace: 5 },
    by_day: { '2026-10-06': 5 },
  },
}

describe('site ops read-only summary RPC contract', () => {
  afterEach(() => vi.restoreAllMocks())

  it('aceita somente JSON agregado conhecido e preserva totais fictícios exatos', async () => {
    const calls: string[] = []
    const client: SiteOpsSummaryQueryClient = {
      async query(sql) {
        calls.push(sql)
        return { rows: [{ summary: FIXTURE_SUMMARY }] }
      },
    }

    await expect(fetchSiteOpsReadonlySummary(client)).resolves.toEqual(FIXTURE_SUMMARY)
    expect(calls).toEqual(['select public.site_ops_readonly_summary() as summary'])
  })

  it('propaga erro de query/permissão em vez de converter permissão negada em zero', async () => {
    const client: SiteOpsSummaryQueryClient = {
      async query() {
        throw new Error('permission denied for function site_ops_readonly_summary')
      },
    }

    await expect(fetchSiteOpsReadonlySummary(client)).rejects.toThrow('permission denied')
  })

  it('rejeita resposta vazia em vez de devolver zeros silenciosos', async () => {
    const client: SiteOpsSummaryQueryClient = {
      async query() {
        return { rows: [] }
      },
    }

    await expect(fetchSiteOpsReadonlySummary(client)).rejects.toThrow('Resposta vazia')
  })

  it('rejeita payload com PII/identificadores mesmo vindo da RPC', async () => {
    const client: SiteOpsSummaryQueryClient = {
      async query() {
        return { rows: [{ summary: { ...FIXTURE_SUMMARY, email: 'cliente@example.com' } }] }
      },
    }

    await expect(fetchSiteOpsReadonlySummary(client)).rejects.toThrow('campo pessoal')
  })

  it('não faz nenhuma outra chamada além da RPC agregada', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ summary: FIXTURE_SUMMARY }] })
    const client = { query }

    await fetchSiteOpsReadonlySummary(client)
    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith('select public.site_ops_readonly_summary() as summary')
  })

  it('valida token dedicado por comparação constante e rejeita segredo ausente/fraco', () => {
    const expected = 'readonly-token-com-mais-de-24-caracteres'
    expect(verifySiteOpsReadonlyToken(expected, expected)).toBe(true)
    expect(verifySiteOpsReadonlyToken('errado', expected)).toBe(false)
    expect(verifySiteOpsReadonlyToken(expected, undefined)).toBe(false)
    expect(verifySiteOpsReadonlyToken('curto', 'curto')).toBe(false)
    expect(extractBearerToken(`Bearer ${expected}`)).toBe(expected)
    expect(extractBearerToken('Basic abc')).toBeNull()
  })
})
