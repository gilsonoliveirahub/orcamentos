import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(pathname: string): NextRequest {
  return {
    nextUrl: { pathname },
    url: `https://facoporti.example${pathname}`,
    cookies: { getAll: () => [] },
  } as unknown as NextRequest
}

describe('proxy (middleware) — correspondência de caminhos', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@supabase/ssr')
  })

  it('/contactos é público — nunca deve ser tratado como protegido (regressão: "/conta" não pode corresponder a "/contactos")', async () => {
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
    }))

    const { proxy } = await import('./proxy')
    const res = await proxy(fakeRequest('/contactos'))

    // NextResponse.next() não tem "Location" — se tivesse sido tratado como
    // protegido, teria um redirect para /login aqui.
    expect(res.headers.get('location')).toBeNull()
  })

  it('/dashboard continua protegido — sem sessão, redireciona para /login', async () => {
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
    }))

    const { proxy } = await import('./proxy')
    const res = await proxy(fakeRequest('/dashboard'))

    expect(res.headers.get('location')).toContain('/login')
  })

  it('/contactos-qualquer-coisa (não é sub-rota real, só texto parecido) também não é bloqueado por engano', async () => {
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
    }))

    const { proxy } = await import('./proxy')
    const res = await proxy(fakeRequest('/contactos-qualquer-coisa'))

    expect(res.headers.get('location')).toBeNull()
  })
})
