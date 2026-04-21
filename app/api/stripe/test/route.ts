import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const key = process.env.STRIPE_SECRET_KEY || ''
    const res = await fetch('https://api.stripe.com/v1/account', {
      headers: { Authorization: `Bearer ${key}` },
    })
    const data = await res.json()
    return NextResponse.json({ status: res.status, keyPrefix: key.slice(0, 12), data })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message })
  }
}
