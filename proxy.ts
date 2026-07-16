import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const PROTECTED = ['/dashboard', '/leads', '/stats', '/config', '/cliente', '/acordos', '/admin', '/perfil', '/onboarding', '/conta', '/upgrade', '/creditos']
const AUTH_ONLY = ['/login', '/admin/login']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isAdminLogin = pathname === '/admin/login'
  const isProtected = !isAdminLogin && PROTECTED.some(p => pathname.startsWith(p))
  const isAuthOnly = AUTH_ONLY.some(p => pathname === p)
  if (!isProtected && !isAuthOnly) return NextResponse.next()

  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAdminArea = pathname.startsWith('/admin')

  if (isProtected && !user) {
    const loginUrl = new URL(isAdminArea ? '/admin/login' : '/login', req.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // /admin exige, no servidor, que o utilizador esteja em public.admins —
  // não depende só da verificação feita no browser pela própria página
  if (isAdminArea && !isAdminLogin && user) {
    const { data: admin } = await supabase.from('admins').select('id').eq('user_id', user.id).maybeSingle()
    if (!admin) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }

  if (isAuthOnly && user) {
    if (isAdminLogin) {
      const { data: admin } = await supabase.from('admins').select('id').eq('user_id', user.id).maybeSingle()
      return NextResponse.redirect(new URL(admin ? '/admin' : '/dashboard', req.url))
    }
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|p/).*)'],
}
