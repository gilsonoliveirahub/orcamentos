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

  it('follow-up email throws instead of failing silently, and never blocks other leads by itself', async () => {
    process.env.RESEND_API_KEY = 'test_key'
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false, status: 429, json: async () => ({ message: 'rate limited' }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { emailFollowup } = await import('./email')

    await expect(
      emailFollowup({
        profName: 'Prof', profEmail: 'prof@example.com', leadId: 'lead-1',
        leadName: 'Cliente', leadPhone: '351911111111', leadStatus: 'novo',
        servico: 'Pintura', days: 2,
      })
    ).rejects.toThrow(/Resend error 429/)
  })

  it('follow-up email uses the verified domain and reaches the professional, not the admin', async () => {
    process.env.RESEND_API_KEY = 'test_key'
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchSpy)

    const { emailFollowup } = await import('./email')
    await emailFollowup({
      profName: 'Prof', profEmail: 'prof@example.com', leadId: 'lead-1',
      leadName: 'Cliente', leadPhone: '351911111111', leadStatus: 'novo',
      servico: 'Pintura', days: 5,
    })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.from).toContain('xn--faoporti-t0a.com')
    expect(body.to).toEqual(['prof@example.com'])
    expect(body.subject).toContain('Lead fria há 5 dias')
  })

  it('blocked-lead email never includes name/phone/notes — only specialty, zone and a CTA link', async () => {
    process.env.RESEND_API_KEY = 'test_key'
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchSpy)

    const { emailNovoLeadBloqueado } = await import('./email')
    await emailNovoLeadBloqueado({
      profName: 'Prof Free', profEmail: 'proffree@example.com', profSpecialty: 'Pintura',
      zoneApprox: 'Porto', isFreePlan: true,
    })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.to).toEqual(['proffree@example.com'])
    expect(body.html).toContain('Pintura')
    expect(body.html).toContain('Porto')
    expect(body.html).toContain('/upgrade')
    // Nunca deve ter forma de incluir nome/telefone/email do cliente —
    // a própria função não recebe esses parâmetros, mas confirma-se aqui
    // que nada nesse género aparece no HTML gerado.
    expect(body.html).not.toMatch(/telefone|phone/i)
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
