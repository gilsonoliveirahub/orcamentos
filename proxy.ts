import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const PROTECTED = ['/dashboard', '/leads', '/stats', '/config', '/cliente', '/acordos', '/admin', '/perfil', '/onboarding', '/conta', '/upgrade', '/creditos']
const AUTH_ONLY = ['/login']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isProtected = PROTECTED.some(p => pathname.startsWith(p))
  const isAuthOnly = AUTH_ONLY.some(p => pathname.startsWith(p))
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

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (isAuthOnly && user) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|p/).*)'],
}
