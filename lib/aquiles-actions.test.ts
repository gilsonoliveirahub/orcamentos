import { describe, expect, it } from 'vitest'
import {
  consumeApprovedAction,
  extractBearerToken,
  getAction,
  isValidActionType,
  listPending,
  recordExecutionResult,
  requestAction,
  tokenConfigured,
  verifyAquilesActionsToken,
  type AquilesActionsQueryClient,
} from './aquiles-actions'

function fakeClient(rows: unknown[]): AquilesActionsQueryClient & { calls: Array<{ sql: string; params?: unknown[] }> } {
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  return {
    calls,
    query(sql: string, params?: unknown[]) {
      calls.push({ sql, params })
      return Promise.resolve({ rows })
    },
  }
}

describe('aquiles-actions: token', () => {
  it('rejeita token curto, ausente ou diferente', () => {
    expect(tokenConfigured(undefined)).toBe(false)
    expect(tokenConfigured('curto')).toBe(false)
    expect(verifyAquilesActionsToken(null, 'x'.repeat(32))).toBe(false)
    expect(verifyAquilesActionsToken('y'.repeat(32), 'x'.repeat(32))).toBe(false)
  })

  it('aceita token igual de comprimento válido', () => {
    const token = 'token-ficticio-com-mais-de-24-caracteres'
    expect(verifyAquilesActionsToken(token, token)).toBe(true)
  })

  it('extrai bearer token do header Authorization', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123')
    expect(extractBearerToken(null)).toBeNull()
    expect(extractBearerToken('Basic abc')).toBeNull()
  })
})

describe('aquiles-actions: action_type', () => {
  it('só aceita os 5 tipos previstos', () => {
    expect(isValidActionType('delete_permanent')).toBe(true)
    expect(isValidActionType('money_movement')).toBe(true)
    expect(isValidActionType('security_access_change')).toBe(true)
    expect(isValidActionType('publish_deploy')).toBe(true)
    expect(isValidActionType('other_sensitive')).toBe(true)
    expect(isValidActionType('qualquer_coisa')).toBe(false)
    expect(isValidActionType(undefined)).toBe(false)
  })
})

describe('aquiles-actions: RPC helpers', () => {
  it('requestAction chama a RPC com os 3 parâmetros (nunca requested_by — isso é session_user do lado da base) e devolve o id', async () => {
    const client = fakeClient([{ id: 'aaaa-1111' }])
    const id = await requestAction(client, {
      actionType: 'delete_permanent',
      summary: 'Apagar lead de teste X',
      payload: { lead_id: '123' },
    })
    expect(id).toBe('aaaa-1111')
    expect(client.calls[0].sql).toBe('select public.aquiles_request_action($1, $2, $3) as id')
    expect(client.calls[0].params).toEqual(['delete_permanent', 'Apagar lead de teste X', '{"lead_id":"123"}'])
  })

  it('requestAction rebenta se a RPC não devolver id', async () => {
    const client = fakeClient([{}])
    await expect(requestAction(client, { actionType: 'other_sensitive', summary: 'x', payload: {} })).rejects.toThrow('não devolveu id')
  })

  it('getAction chama a RPC sem nenhum identificador de dono (filtragem é session_user no servidor) e devolve null quando não encontra', async () => {
    const client = fakeClient([{ action: null }])
    const action = await getAction(client, 'id-1')
    expect(action).toBeNull()
    expect(client.calls[0].sql).toBe('select public.aquiles_get_action($1) as action')
    expect(client.calls[0].params).toEqual(['id-1'])
  })

  it('getAction devolve a linha quando encontrada', async () => {
    const client = fakeClient([{ action: { id: 'id-1', status: 'pending' } }])
    const action = await getAction(client, 'id-1')
    expect(action).toEqual({ id: 'id-1', status: 'pending' })
  })

  it('listPending devolve [] quando a RPC devolve null/undefined', async () => {
    const client = fakeClient([{ actions: null }])
    expect(await listPending(client)).toEqual([])
  })

  it('listPending devolve o array normalizado, sem parâmetros (identidade vem de session_user)', async () => {
    const client = fakeClient([{ actions: [{ id: '1' }, { id: '2' }] }])
    expect(await listPending(client)).toEqual([{ id: '1' }, { id: '2' }])
    expect(client.calls[0].params).toEqual([])
  })

  it('consumeApprovedAction envia id + action_type + payload exatos e devolve true só quando a RPC confirma o consumo (approved -> consumed, nunca significa sucesso)', async () => {
    const approvedClient = fakeClient([{ ok: true }])
    const ok = await consumeApprovedAction(approvedClient, 'id-1', 'delete_permanent', { lead_id: '123' })
    expect(ok).toBe(true)
    expect(approvedClient.calls[0].sql).toBe('select public.aquiles_consume_approved_action($1, $2, $3) as ok')
    expect(approvedClient.calls[0].params).toEqual(['id-1', 'delete_permanent', '{"lead_id":"123"}'])

    const notApprovedClient = fakeClient([{ ok: false }])
    expect(await consumeApprovedAction(notApprovedClient, 'id-1', 'delete_permanent', {})).toBe(false)
  })

  it('recordExecutionResult envia id + success + result e devolve true só quando a RPC confirma consumed -> executed/failed', async () => {
    const okClient = fakeClient([{ ok: true }])
    const ok = await recordExecutionResult(okClient, 'id-1', true, { leads_apagados: 1 })
    expect(ok).toBe(true)
    expect(okClient.calls[0].sql).toBe('select public.aquiles_record_execution_result($1, $2, $3) as ok')
    expect(okClient.calls[0].params).toEqual(['id-1', true, '{"leads_apagados":1}'])

    const failClient = fakeClient([{ ok: true }])
    expect(await recordExecutionResult(failClient, 'id-1', false, { erro: 'timeout' })).toBe(true)
    expect(failClient.calls[0].params).toEqual(['id-1', false, '{"erro":"timeout"}'])

    const notConsumedClient = fakeClient([{ ok: false }])
    expect(await recordExecutionResult(notConsumedClient, 'id-1', true, {})).toBe(false)
  })
})
