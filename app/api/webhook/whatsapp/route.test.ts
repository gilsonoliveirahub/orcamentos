import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }

function fakeRequest(body: unknown, contentType: 'application/json' | 'application/x-www-form-urlencoded' = 'application/json'): NextRequest {
  return {
    headers: { get: (name: string) => (name === 'content-type' ? contentType : null) },
    json: async () => body,
    formData: async () => new Map(Object.entries(body as Record<string, string>)) as unknown as FormData,
  } as unknown as NextRequest
}

describe('POST /api/webhook/whatsapp', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
    delete process.env.WHATSAPP_INTAKE_ENABLED
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/whatsapp')
  })

  describe('captação desativada (comportamento por omissão)', () => {
    it('nunca cria lead, nunca consulta profissionais, responde sempre com a mensagem informativa da FaçoPorTi', async () => {
      const from = vi.fn()
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ From: 'whatsapp:+351911111111', Body: 'Olá, preciso de um pintor' }))
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.lead_id).toBeNull()
      expect(from).not.toHaveBeenCalled() // nunca toca na base de dados — sem lead, sem consulta a profissionais
      expect(sendWhatsApp).toHaveBeenCalledTimes(1)
      const [, sentMessage] = sendWhatsApp.mock.calls[0]

      // A plataforma está ativa — nunca dizer que ainda está em preparação
      expect(sentMessage).toContain('FaçoPorTi')
      expect(sentMessage).toContain('A plataforma está ativa')
      expect(sentMessage).not.toContain('em preparação')
      expect(sentMessage).not.toContain('em breve')
      expect(sentMessage).not.toContain('Gilson')

      // Encaminha para os sítios certos, nunca inicia o questionário nem atribui profissional
      expect(sentMessage).toContain('https://façoporti.com/pedir')
      expect(sentMessage).toContain('https://façoporti.com/login')
      expect(sentMessage).toContain('contacto@façoporti.com')

      // Nunca revela dados pessoais — a mensagem não depende de nenhum lead/cliente real
      expect(sentMessage).not.toMatch(/\d{8,}/) // nenhum número de telefone embutido na resposta
    })

    it('responde da mesma forma a qualquer mensagem repetida — nunca entra em loop diferente', async () => {
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { POST } = await import('./route')
      const res1 = await POST(fakeRequest({ From: 'whatsapp:+351911111111', Body: 'primeira mensagem' }))
      const res2 = await POST(fakeRequest({ From: 'whatsapp:+351911111111', Body: 'segunda mensagem, resposta diferente' }))
      const json1 = await res1.json()
      const json2 = await res2.json()

      expect(json1.response).toBe(json2.response) // resposta estável e previsível, sem estado a acumular
    })

    it('rejeita pedidos sem telefone/mensagem antes de sequer olhar para a captação', async () => {
      const from = vi.fn()
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
      const sendWhatsApp = vi.fn()
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ From: 'whatsapp:+351911111111', Body: '' }))

      expect(res.status).toBe(400)
      expect(from).not.toHaveBeenCalled()
      expect(sendWhatsApp).not.toHaveBeenCalled()
    })
  })

  describe('fluxo completo (dormant — só corre com WHATSAPP_INTAKE_ENABLED=true, para travar regressões)', () => {
    beforeEach(() => {
      process.env.WHATSAPP_INTAKE_ENABLED = 'true'
    })

    it('cria lead novo sem escolher nenhum profissional aleatório (professional_id fica null)', async () => {
      const insertedPayloads: Record<string, unknown>[] = []
      const from = vi.fn((_table: string) => ({
        select: () => ({
          eq: () => ({ neq: () => ({ neq: () => ({ order: () => ({ limit: () => ({ single: async () => ({ data: null, error: { message: 'no rows' } }) }) }) }) }) }),
        }),
        insert: (payload: Record<string, unknown>) => {
          insertedPayloads.push(payload)
          return { select: () => ({ single: async () => ({ data: { id: 'lead-new', ...payload }, error: null }) }) }
        },
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      }))
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

      const { POST } = await import('./route')
      await POST(fakeRequest({ From: 'whatsapp:+351911111111', Body: 'Olá' }))

      // "professionals" nunca é consultado ao criar o lead — não há SELECT ... LIMIT 1
      const calledTables = from.mock.calls.map(c => c[0])
      expect(calledTables).not.toContain('professionals')
      expect(insertedPayloads[0]).toMatchObject({ professional_id: null })
    })

    it('uma falha ao gravar a resposta fica registada e NÃO envia a pergunta seguinte (corta a repetição infinita)', async () => {
      const existingLead = {
        id: 'lead-1', phone: '351911111111', current_question: 11,
        q1_tipo_trabalho: 'interior', professionals: null,
      }
      const from = vi.fn(() => ({
        select: () => ({
          eq: () => ({ neq: () => ({ neq: () => ({ order: () => ({ limit: () => ({ single: async () => ({ data: existingLead, error: null }) }) }) }) }) }),
        }),
        update: () => ({ eq: async () => ({ data: null, error: { message: 'malformed array literal' } }) }),
      }))
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
      const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
      vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ From: 'whatsapp:+351911111111', Body: 'saltar' }))

      expect(res.status).toBe(500)
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('falha ao atualizar lead'))
      expect(sendWhatsApp).not.toHaveBeenCalled() // não manda a "pergunta seguinte" com base num estado que não foi gravado
    })

    it('resposta a pergunta de fotos nunca tenta gravar uma string num campo array', async () => {
      const { parseAnswer, QUESTIONS } = await import('@/lib/questions')
      const photosQuestion = QUESTIONS.find(q => q.key === 'q11_fotos_url')!
      const answer = parseAnswer(photosQuestion, 'Saltar')
      expect(Array.isArray(answer)).toBe(true)
    })
  })
})
