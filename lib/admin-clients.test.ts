import { describe, it, expect } from 'vitest'
import { groupLeadsByClient, type LeadForClientView } from './admin-clients'

function lead(overrides: Partial<LeadForClientView>): LeadForClientView {
  return {
    id: 'l1', phone: '351911111111', name: 'Cliente', email: null, status: 'novo',
    source: 'pessoal', valor_fechado: null, created_at: '2026-01-01T00:00:00Z',
    professional_id: 'p1', professional_name: 'Ana',
    ...overrides,
  }
}

describe('groupLeadsByClient', () => {
  it('agrupa vários leads do mesmo telefone num só cliente, usando o pedido mais recente para nome/email', () => {
    const leads = [
      lead({ id: 'l1', name: 'Nome Antigo', email: null, created_at: '2026-01-01T00:00:00Z' }),
      lead({ id: 'l2', name: 'Nome Novo', email: 'novo@x.com', created_at: '2026-02-01T00:00:00Z' }),
    ]
    const [client] = groupLeadsByClient(leads)
    expect(client.phone).toBe('351911111111')
    expect(client.name).toBe('Nome Novo')
    expect(client.email).toBe('novo@x.com')
    expect(client.leadsCount).toBe(2)
    expect(client.lastRequestAt).toBe('2026-02-01T00:00:00Z')
  })

  it('leads sem telefone são ignorados (não há chave para agrupar)', () => {
    const leads = [lead({ id: 'l1', phone: null })]
    expect(groupLeadsByClient(leads)).toEqual([])
  })

  it('conta fechados/perdidos e soma valor_fechado só dos fechados', () => {
    const leads = [
      lead({ id: 'l1', status: 'fechado', valor_fechado: 300 }),
      lead({ id: 'l2', status: 'fechado', valor_fechado: 200 }),
      lead({ id: 'l3', status: 'perdido', valor_fechado: null }),
      lead({ id: 'l4', status: 'novo' }),
    ]
    const [client] = groupLeadsByClient(leads)
    expect(client.fechadosCount).toBe(2)
    expect(client.perdidosCount).toBe(1)
    expect(client.valorFechadoTotal).toBe(500)
  })

  it('lista profissionais distintos associados ao cliente, sem duplicados', () => {
    const leads = [
      lead({ id: 'l1', professional_id: 'p1', professional_name: 'Ana' }),
      lead({ id: 'l2', professional_id: 'p1', professional_name: 'Ana' }),
      lead({ id: 'l3', professional_id: 'p2', professional_name: 'Bruno' }),
      lead({ id: 'l4', professional_id: null, professional_name: null }),
    ]
    const [client] = groupLeadsByClient(leads)
    expect(client.professionals).toEqual([{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Bruno' }])
  })

  it('agrupa telefones diferentes em clientes separados, ordenados pelo pedido mais recente', () => {
    const leads = [
      lead({ id: 'l1', phone: '111', created_at: '2026-01-01T00:00:00Z' }),
      lead({ id: 'l2', phone: '222', created_at: '2026-03-01T00:00:00Z' }),
    ]
    const clients = groupLeadsByClient(leads)
    expect(clients.map(c => c.phone)).toEqual(['222', '111'])
  })
})
