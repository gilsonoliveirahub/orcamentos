import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendWhatsApp } from '@/lib/whatsapp'
import { emailFollowup, emailUpgradeNudge } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Called by a cron job (Vercel Cron or external scheduler)
// Finds leads that are 2 or 5 days old and still active, sends follow-up email to professional

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const header = req.headers.get('authorization') || req.headers.get('x-cron-secret') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : header
  if (cronSecret && token !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  function daysAgo(n: number) {
    const d = new Date(now)
    d.setDate(d.getDate() - n)
    return d.toISOString()
  }

  // Leads criados há exactamente 2 ou 5 dias (com margem de 1 hora)
  const targets = [2, 5]
  let totalSent = 0

  for (const days of targets) {
    const from = new Date(now); from.setDate(from.getDate() - days); from.setHours(from.getHours() - 1)
    const to = new Date(now); to.setDate(to.getDate() - days); to.setHours(to.getHours() + 1)

    const { data: leads } = await supabaseAdmin
      .from('leads')
      .select('*, professionals(name, email, phone, specialty, plan)')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .not('status', 'in', '(fechado,perdido)')
      .not('professionals', 'is', null)

    if (!leads || leads.length === 0) continue

    for (const lead of leads) {
      const prof = lead.professionals
      if (!prof?.email) continue

      // Nunca enviar follow-up (revela nome/telefone) para um lead que o
      // profissional ainda não desbloqueou — plano free ou marketplace sem créditos
      const isBlocked = !prof.plan || prof.plan === 'free' || !!lead.locked
      if (isBlocked) continue

      const metadata = lead.metadata || {}
      const servico = metadata.tipo_trabalho || lead.q1_tipo_trabalho || prof.specialty || 'serviço'
      const isDay5 = days === 5

      try {
        await emailFollowup({
          profName: prof.name, profEmail: prof.email, leadId: lead.id,
          leadName: lead.name, leadPhone: lead.phone, leadStatus: lead.status,
          servico, days,
        })
      } catch (err) {
        console.error(`[followup] email não enviado (lead ${lead.id}): ${err instanceof Error ? err.message : 'erro desconhecido'}`)
      }

      // WhatsApp ao profissional
      if (prof.phone) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'
        const msg = isDay5
          ? `⚠️ *Lead sem resposta há 5 dias*\n\n👤 ${lead.name || '—'} · ${servico}\n📱 ${lead.phone || '—'}\n\nVer lead: ${appUrl}/leads/${lead.id}`
          : `💡 *Follow-up D+2*\n\nJá contactaste *${lead.name || 'o cliente'}*?\n📱 ${lead.phone || '—'} · ${servico}\n\nVer lead: ${appUrl}/leads/${lead.id}`
        sendWhatsApp(prof.phone, msg).then(result => {
          if (result.status !== 'sent') {
            console.warn(`[followup] WhatsApp não enviado (lead ${lead.id}): ${result.reason}`)
          }
        })
      }

      totalSent++
    }
  }

  // Nudge para free users com leads — D+1, D+3, D+7 após registo
  const nudgeDays = [1, 3, 7]
  for (const days of nudgeDays) {
    const from = new Date(now); from.setDate(from.getDate() - days); from.setHours(from.getHours() - 1)
    const to = new Date(now); to.setDate(to.getDate() - days); to.setHours(to.getHours() + 1)

    const { data: profs } = await supabaseAdmin
      .from('professionals')
      .select('id, name, email')
      .eq('plan', 'free')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())

    if (!profs) continue

    for (const prof of profs) {
      if (!prof.email) continue

      const { count } = await supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', prof.id)

      const totalLeads = count || 0
      if (totalLeads === 0) continue

      await emailUpgradeNudge({ name: prof.name, email: prof.email, totalLeads, dia: days }).catch(err => {
        console.error(`[followup] nudge não enviado (prof ${prof.id}): ${err instanceof Error ? err.message : 'erro desconhecido'}`)
      })
      totalSent++
    }
  }

  return NextResponse.json({ ok: true, sent: totalSent })
}
