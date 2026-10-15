import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractBearerToken,
  fetchSiteOpsReadonlySummary,
  verifySiteOpsReadonlyToken,
  type SupabaseReadonlyRpcClient,
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
    const supabase: SupabaseReadonlyRpcClient = {
      async rpc(functionName) {
        calls.push(functionName)
        return { data: FIXTURE_SUMMARY, error: null }
      },
    }

    await expect(fetchSiteOpsReadonlySummary(supabase)).resolves.toEqual(FIXTURE_SUMMARY)
    expect(calls).toEqual(['site_ops_readonly_summary'])
  })

  it('propaga erro de RPC/RLS em vez de converter permissão negada em zero', async () => {
    const supabase: SupabaseReadonlyRpcClient = {
      async rpc() {
        return { data: null, error: { message: 'permission denied for function site_ops_readonly_summary' } }
      },
    }

    await expect(fetchSiteOpsReadonlySummary(supabase)).rejects.toThrow('permission denied')
  })

  it('rejeita payload com PII/identificadores mesmo vindo da RPC', async () => {
    const supabase: SupabaseReadonlyRpcClient = {
      async rpc() {
        return { data: { ...FIXTURE_SUMMARY, email: 'cliente@example.com' }, error: null }
      },
    }

    await expect(fetchSiteOpsReadonlySummary(supabase)).rejects.toThrow('campo pessoal')
  })

  it('não oferece API para SELECT direto paginado em tabelas privadas', async () => {
    const supabase = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: FIXTURE_SUMMARY, error: null }),
    }

    await fetchSiteOpsReadonlySummary(supabase)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('site_ops_readonly_summary')
    expect(supabase.from).not.toHaveBeenCalled()
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
