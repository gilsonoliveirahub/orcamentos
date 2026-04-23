import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendWhatsApp } from '@/lib/whatsapp'

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
      .select('*, professionals(name, email, phone, specialty)')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .not('status', 'in', '(fechado,perdido)')
      .not('professionals', 'is', null)

    if (!leads || leads.length === 0) continue

    for (const lead of leads) {
      const prof = lead.professionals
      if (!prof?.email) continue

      const resendKey = process.env.RESEND_API_KEY
      if (!resendKey) continue

      const metadata = lead.metadata || {}
      const servico = metadata.tipo_trabalho || lead.q1_tipo_trabalho || prof.specialty || 'serviço'
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://xn--faoporti-t0a.com'
      const isDay5 = days === 5

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'FaçoPorTi <noreply@xn--faoporti-t0a.com>',
          to: [prof.email],
          subject: isDay5
            ? `⚠️ Lead fria há 5 dias — ${lead.name || 'Cliente'}`
            : `💡 Follow-up — Já contactaste ${lead.name || 'o cliente'}?`,
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0c1a;color:#fff;border-radius:16px;overflow:hidden">
              <div style="background:${isDay5 ? 'linear-gradient(135deg,#ef4444,#f97316)' : 'linear-gradient(135deg,#f59e0b,#eab308)'};padding:20px 32px">
                <h2 style="margin:0;color:#fff;font-size:18px">
                  ${isDay5 ? '⚠️ Lead sem resposta há 5 dias' : '💡 Já contactaste este cliente?'}
                </h2>
              </div>
              <div style="padding:24px 32px">
                <p style="color:#94a3b8;margin:0 0 16px">Olá <strong style="color:#fff">${prof.name}</strong>,</p>
                <p style="color:#94a3b8;margin:0 0 20px">
                  ${isDay5
                    ? `O lead de <strong style="color:#fff">${lead.name || 'um cliente'}</strong> ainda está sem resposta há 5 dias. Considera fechar ou marcar como perdido.`
                    : `Há 2 dias recebeste um pedido de <strong style="color:#fff">${lead.name || 'um cliente'}</strong> para <strong style="color:#fff">${servico}</strong>. Já estabeleceste contacto?`
                  }
                </p>
                <table style="width:100%;border-collapse:collapse;margin-bottom:20px;background:rgba(255,255,255,0.03);border-radius:8px;overflow:hidden">
                  <tr><td style="padding:10px;color:#64748b;font-size:13px">Cliente</td><td style="padding:10px;color:#fff;font-weight:bold">${lead.name || '—'}</td></tr>
                  <tr><td style="padding:10px;color:#64748b;font-size:13px">Telefone</td><td style="padding:10px;color:#818cf8">${lead.phone || '—'}</td></tr>
                  <tr><td style="padding:10px;color:#64748b;font-size:13px">Serviço</td><td style="padding:10px;color:#fff">${servico}</td></tr>
                  <tr><td style="padding:10px;color:#64748b;font-size:13px">Estado</td><td style="padding:10px;color:#fbbf24">${lead.status}</td></tr>
                </table>
                <div style="display:flex;gap:12px;flex-wrap:wrap">
                  <a href="${appUrl}/leads/${lead.id}"
                    style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px">
                    Abrir lead →
                  </a>
                  ${lead.phone ? `
                  <a href="https://wa.me/${lead.phone.replace(/\D/g, '')}"
                    style="display:inline-block;background:#25d366;color:#000;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px">
                    💬 WhatsApp
                  </a>` : ''}
                </div>
              </div>
              <div style="padding:16px 32px;background:rgba(255,255,255,0.02);text-align:center">
                <p style="color:#334155;font-size:12px;margin:0">FaçoPorTi · Follow-up automático dia ${days}</p>
              </div>
            </div>
          `,
        }),
      })

      // WhatsApp ao profissional
      if (prof.phone) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'
        const msg = isDay5
          ? `⚠️ *Lead sem resposta há 5 dias*\n\n👤 ${lead.name || '—'} · ${servico}\n📱 ${lead.phone || '—'}\n\nVer lead: ${appUrl}/leads/${lead.id}`
          : `💡 *Follow-up D+2*\n\nJá contactaste *${lead.name || 'o cliente'}*?\n📱 ${lead.phone || '—'} · ${servico}\n\nVer lead: ${appUrl}/leads/${lead.id}`
        sendWhatsApp(prof.phone, msg).catch(() => {})
      }

      totalSent++
    }
  }

  return NextResponse.json({ ok: true, sent: totalSent })
}
