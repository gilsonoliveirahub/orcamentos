import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

describe('sendWhatsApp', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('skips and logs (masked) when Twilio credentials are missing — never calls the network', async () => {
    process.env.TWILIO_ACCOUNT_SID = ''
    process.env.TWILIO_AUTH_TOKEN = ''
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { sendWhatsApp } = await import('./whatsapp')
    const result = await sendWhatsApp('351912345678', 'mensagem secreta do cliente')

    expect(result).toEqual({ status: 'skipped', reason: 'missing_credentials' })
    expect(fetchSpy).not.toHaveBeenCalled()

    const logged = errorSpy.mock.calls.flat().join(' ')
    expect(logged).not.toContain('351912345678')
    expect(logged).not.toContain('mensagem secreta do cliente')
    expect(logged).toContain('5678') // só os últimos 4 dígitos, mascarado
  })

  it('skips invalid phone numbers without calling the network', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxx'
    process.env.TWILIO_AUTH_TOKEN = 'tokenxxx'
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { sendWhatsApp } = await import('./whatsapp')
    const result = await sendWhatsApp('123', 'oi')

    expect(result).toEqual({ status: 'skipped', reason: 'invalid_phone' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns sent and calls Twilio with the correct payload on success', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxx'
    process.env.TWILIO_AUTH_TOKEN = 'tokenxxx'
    process.env.TWILIO_WHATSAPP_FROM = '+14245872587'
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchSpy)

    const { sendWhatsApp } = await import('./whatsapp')
    const result = await sendWhatsApp('351912345678', 'Olá!')

    expect(result).toEqual({ status: 'sent' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const [url, options] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages.json')
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toMatch(/^Basic /)

    const body = new URLSearchParams(options.body)
    expect(body.get('To')).toBe('whatsapp:+351912345678')
    expect(body.get('From')).toBe('whatsapp:+14245872587')
    expect(body.get('Body')).toBe('Olá!')
  })

  it('returns failed with the Twilio error code (never throws) when the API rejects the request', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxx'
    process.env.TWILIO_AUTH_TOKEN = 'tokenxxx'
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ code: 21211, message: 'Invalid To Number' }),
    })
    vi.stubGlobal('fetch', fetchSpy)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { sendWhatsApp } = await import('./whatsapp')
    const result = await sendWhatsApp('351912345678', 'Olá!')

    expect(result).toEqual({ status: 'failed', reason: 'twilio_21211' })
    const logged = errorSpy.mock.calls.flat().join(' ')
    expect(logged).not.toContain('tokenxxx')
    expect(logged).not.toContain('Olá!')
  })

  it('returns failed with the http status when the Twilio error body cannot be parsed', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxx'
    process.env.TWILIO_AUTH_TOKEN = 'tokenxxx'
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false, status: 500, json: async () => { throw new Error('not json') },
    })
    vi.stubGlobal('fetch', fetchSpy)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { sendWhatsApp } = await import('./whatsapp')
    const result = await sendWhatsApp('351912345678', 'Olá!')

    expect(result).toEqual({ status: 'failed', reason: 'http_500' })
  })

  it('returns failed on network error instead of throwing', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxx'
    process.env.TWILIO_AUTH_TOKEN = 'tokenxxx'
    const fetchSpy = vi.fn().mockRejectedValue(new Error('fetch failed'))
    vi.stubGlobal('fetch', fetchSpy)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { sendWhatsApp } = await import('./whatsapp')
    const result = await sendWhatsApp('351912345678', 'Olá!')

    expect(result).toEqual({ status: 'failed', reason: 'network_error' })
  })
})
