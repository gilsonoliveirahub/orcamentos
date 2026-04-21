import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })

export async function GET() {
  try {
    const account = await stripe.accounts.retrieve()
    return NextResponse.json({ ok: true, id: account.id, charges_enabled: account.charges_enabled, payouts_enabled: account.payouts_enabled, requirements: account.requirements })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, type: err.type, code: err.code })
  }
}
