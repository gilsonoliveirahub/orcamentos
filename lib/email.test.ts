import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

describe('email sending (lib/email.ts)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends via the verified punycode domain, with reply-to, never the unverified literal-ç domain', async () => {
    process.env.RESEND_API_KEY = 'test_key'
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchSpy)

    const { emailBoasVindas } = await import('./email')
    await emailBoasVindas({ name: 'Teste', email: 'teste@example.com', slug: 'teste' })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, options] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(options.headers.Authorization).toBe('Bearer test_key')

    const body = JSON.parse(options.body)
    // Regressão do bug de 2026-04-27: "façoporti.com" não está verificado no
    // Resend, só o domínio punycode — isto trava se alguém trocar outra vez.
    expect(body.from).toContain('xn--faoporti-t0a.com')
    expect(body.from).not.toContain('façoporti.com')
    expect(body.reply_to).toBe('gilsongomesoliveira1@hotmail.com')
    expect(body.to).toEqual(['teste@example.com'])
  })

  it('throws when RESEND_API_KEY is not configured, instead of failing silently', async () => {
    delete process.env.RESEND_API_KEY
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { emailBoasVindas } = await import('./email')

    await expect(
      emailBoasVindas({ name: 'Teste', email: 'teste@example.com', slug: 'teste' })
    ).rejects.toThrow('RESEND_API_KEY não configurado')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws with the Resend error details when the API rejects the request', async () => {
    process.env.RESEND_API_KEY = 'test_key'
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false, status: 422, json: async () => ({ message: 'domain not verified' }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { emailBoasVindas } = await import('./email')

    await expect(
      emailBoasVindas({ name: 'Teste', email: 'teste@example.com', slug: 'teste' })
    ).rejects.toThrow(/Resend error 422/)
  })

  it('never sends the admin-only emails to anyone other than the admin address', async () => {
    process.env.RESEND_API_KEY = 'test_key'
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchSpy)

    const { emailNovaProfissao } = await import('./email')
    await emailNovaProfissao({
      profName: 'Fulano', profEmail: 'fulano@example.com', specialty: 'Canalizador', slug: 'fulano',
    })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.to).toEqual(['gilsongomesoliveira1@hotmail.com'])
  })
})
