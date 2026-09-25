import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { createHmac } from 'crypto'

const AUTH_TOKEN = 'auth-token-teste'
const APP_URL = 'https://app-teste.example.com'
const CALLBACK_URL = `${APP_URL}/api/webhook/twilio-status`

function signatureFor(params: Record<string, string>) {
  const data = Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], CALLBACK_URL)
  return createHmac('sha1', AUTH_TOKEN).update(data).digest('base64')
}

function fakeFormRequest(fields: Record<string, string>, opts: { signature?: string | null } = {}): NextRequest {
  const form = new URLSearchParams(fields)
  const signature = opts.signature === undefined ? signatureFor(fields) : opts.signature
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
  if (signature !== null) headers['x-twilio-signature'] = signature
  return {
    headers: new Headers(headers),
    formData: async () => {
      const fd = new FormData()
      for (const [k, v] of form.entries()) fd.append(k, v)
      return fd
    },
  } as unknown as NextRequest
}

describe('POST /api/webhook/twilio-status', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN
    process.env.NEXT_PUBLIC_APP_URL = APP_URL
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  it('sem TWILIO_AUTH_TOKEN configurado: 500, nunca toca na BD (não há como validar a assinatura)', async () => {
    delete process.env.TWILIO_AUTH_TOKEN
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const { POST } = await import('./route')
    const res = await POST(fakeFormRequest({ MessageSid: 'SM123', MessageStatus: 'delivered' }))
    expect(res.status).toBe(500)
    expect(from).not.toHaveBeenCalled()
  })

  it('sem cabeçalho X-Twilio-Signature: 403, nunca toca na BD', async () => {
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const { POST } = await import('./route')
    const res = await POST(fakeFormRequest({ MessageSid: 'SM123', MessageStatus: 'delivered' }, { signature: null }))
    expect(res.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })

  it('assinatura inválida (forjada): 403, nunca toca na BD', async () => {
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const { POST } = await import('./route')
    const res = await POST(fakeFormRequest({ MessageSid: 'SM123', MessageStatus: 'delivered' }, { signature: 'assinatura-forjada' }))
    expect(res.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })

  it('dados em falta (sem MessageSid/MessageStatus), mas assinatura válida: 400, nunca toca na BD', async () => {
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const { POST } = await import('./route')
    const res = await POST(fakeFormRequest({}))
    expect(res.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })

  it('estado intermédio (queued/sent): ignora, nunca escreve nada', async () => {
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const { POST } = await import('./route')
    const res = await POST(fakeFormRequest({ MessageSid: 'SM123', MessageStatus: 'queued' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.ignored).toBe(true)
    expect(from).not.toHaveBeenCalled()
  })

  it('delivered: grava send_status=delivered, send_error=null, correlacionado só pelo messageSid', async () => {
    let eqArgs: unknown[] | null = null
    let updateArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table !== 'review_invites') throw new Error(`tabela inesperada: ${table}`)
          return { update: (p: Record<string, unknown>) => { updateArgs = p; return { eq: (...a: unknown[]) => { eqArgs = a; return Promise.resolve({ error: null }) } } } }
        },
      },
    }))
    const { POST } = await import('./route')
    const res = await POST(fakeFormRequest({ MessageSid: 'SM123', MessageStatus: 'delivered' }))
    expect(res.status).toBe(200)
    expect(updateArgs).toMatchObject({ send_status: 'delivered', send_error: null })
    expect(eqArgs).toEqual(['whatsapp_message_sid', 'SM123'])
  })

  it('read conta como delivered', async () => {
    let updateArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ update: (p: Record<string, unknown>) => { updateArgs = p; return { eq: async () => ({ error: null }) } } }) },
    }))
    const { POST } = await import('./route')
    await POST(fakeFormRequest({ MessageSid: 'SM123', MessageStatus: 'read' }))
    expect(updateArgs).toMatchObject({ send_status: 'delivered' })
  })

  it('failed com ErrorCode: grava send_status=failed com o código', async () => {
    let updateArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ update: (p: Record<string, unknown>) => { updateArgs = p; return { eq: async () => ({ error: null }) } } }) },
    }))
    const { POST } = await import('./route')
    await POST(fakeFormRequest({ MessageSid: 'SM123', MessageStatus: 'failed', ErrorCode: '63016' }))
    expect(updateArgs).toMatchObject({ send_status: 'failed', send_error: 'twilio_63016' })
  })

  it('undelivered sem ErrorCode: grava failed com o próprio nome do estado como motivo', async () => {
    let updateArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ update: (p: Record<string, unknown>) => { updateArgs = p; return { eq: async () => ({ error: null }) } } }) },
    }))
    const { POST } = await import('./route')
    await POST(fakeFormRequest({ MessageSid: 'SM123', MessageStatus: 'undelivered' }))
    expect(updateArgs).toMatchObject({ send_status: 'failed', send_error: 'undelivered' })
  })

  it('erro ao gravar na BD: devolve 500, nunca lança', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ update: () => ({ eq: async () => ({ error: { message: 'db down' } }) }) }) },
    }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { POST } = await import('./route')
    const res = await POST(fakeFormRequest({ MessageSid: 'SM123', MessageStatus: 'delivered' }))
    expect(res.status).toBe(500)
  })
})
