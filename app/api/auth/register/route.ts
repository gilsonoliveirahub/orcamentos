import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { emailBoasVindas, emailNovaProfissao } from '@/lib/email'
import { SPECIALTY_LIST } from '@/lib/professions'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { user_id, role, name, email, phone, specialty, zone } = await req.json()

    if (role === 'professional') {
      const baseSlug = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
      const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`

      const trialEndsAt = new Date()
      trialEndsAt.setDate(trialEndsAt.getDate() + 7)

      const { error } = await supabaseAdmin.from('professionals').insert({
        user_id,
        name,
        email,
        phone: phone || null,
        specialty: specialty || 'Pintura',
        zone: zone || null,
        slug,
        plan: 'free',
        trial_ends_at: trialEndsAt.toISOString(),
        active: true,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })

      emailBoasVindas({ name, email, slug }).catch(() => {})

      if (!SPECIALTY_LIST.includes(specialty)) {
        // Gera perguntas via Claude e notifica admin
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        fetch(`${baseUrl}/api/professions/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ specialty }),
        }).catch(() => {})
        emailNovaProfissao({ profName: name, profEmail: email, specialty, slug }).catch(() => {})
      }
    } else {
      const { error } = await supabaseAdmin.from('clients').insert({
        user_id,
        name,
        email,
        phone: phone || null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
