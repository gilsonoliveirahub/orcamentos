export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()

  if (password === process.env.APP_PASSWORD) {
    const res = NextResponse.json({ ok: true })
    res.cookies.set('auth', 'ok', {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 dias
    })
    return res
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
