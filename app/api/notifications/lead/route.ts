import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { lead_id } = await req.json()

    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('*, professionals(name, email, phone, specialty)')
      .eq('id', lead_id)
      .single()

    if (!lead || !lead.professionals?.email) return NextResponse.json({ ok: false })

    const prof = lead.professionals
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ ok: false, reason: 'no key' })

    const metadata = lead.metadata || {}
    const servico = metadata.tipo_trabalho || lead.q1_tipo_trabalho || prof.specialty || '—'
    const area = metadata.area_m2 || lead.q3_area_m2
    const prazo = metadata.prazo || lead.q9_prazo || '—'
    const notas = metadata.notas || lead.q12_notas || ''
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://orcamentos-taupe.vercel.app'

    // Build dynamic details from metadata
    const extraRows = Object.entries(metadata)
      .filter(([k, v]) => v && !['tipo_trabalho', 'area_m2', 'prazo', 'notas'].includes(k))
      .map(([k, v]) => {
        const label = k.replace(/_/g, ' ')
        return `<tr><td style="padding:8px;color:#666;text-transform:capitalize">${label}</td><td style="padding:8px">${v}</td></tr>`
      }).join('')

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'FaçoPorTi <onboarding@resend.dev>',
        to: [prof.email],
        subject: `🔔 Novo pedido — ${lead.name || 'Cliente'} · ${servico}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0c1a;color:#fff;border-radius:16px;overflow:hidden">
            <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 32px">
              <h2 style="margin:0;color:#fff;font-size:20px">🔔 Novo pedido de orçamento!</h2>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:14px">FaçoPorTi — ${prof.specialty || 'Profissional'}</p>
            </div>
            <div style="padding:24px 32px">
              <p style="color:#94a3b8;margin:0 0 20px">Olá <strong style="color:#fff">${prof.name}</strong>, recebeste um novo pedido!</p>
              <table style="width:100%;border-collapse:collapse;margin:0 0 20px">
                <tr style="background:rgba(255,255,255,0.05)">
                  <td style="padding:10px;color:#64748b;font-size:13px">Cliente</td>
                  <td style="padding:10px;font-weight:bold;color:#fff">${lead.name || '—'}</td>
                </tr>
                <tr>
                  <td style="padding:10px;color:#64748b;font-size:13px">Telefone</td>
                  <td style="padding:10px;color:#818cf8">${lead.phone || '—'}</td>
                </tr>
                <tr style="background:rgba(255,255,255,0.05)">
                  <td style="padding:10px;color:#64748b;font-size:13px">Serviço</td>
                  <td style="padding:10px;color:#fff">${servico}</td>
                </tr>
                ${area ? `<tr><td style="padding:10px;color:#64748b;font-size:13px">Área</td><td style="padding:10px;color:#fff">${area}m²</td></tr>` : ''}
                <tr style="background:rgba(255,255,255,0.05)">
                  <td style="padding:10px;color:#64748b;font-size:13px">Prazo</td>
                  <td style="padding:10px;color:#fff">${prazo}</td>
                </tr>
                ${extraRows}
                ${notas ? `<tr><td style="padding:10px;color:#64748b;font-size:13px">Notas</td><td style="padding:10px;color:#94a3b8;font-style:italic">${notas}</td></tr>` : ''}
              </table>
              <a href="${appUrl}/leads/${lead.id}"
                style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
                Ver lead no dashboard →
              </a>
              ${lead.phone ? `
              <a href="https://wa.me/${lead.phone.replace(/\D/g, '')}?text=Olá ${encodeURIComponent(lead.name || 'Cliente')}%2C vi o seu pedido no FaçoPorTi e gostava de agendar uma visita. Quando lhe dá jeito%3F"
                style="display:inline-block;margin-left:12px;background:#25d366;color:#000;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
                💬 WhatsApp
              </a>` : ''}
            </div>
            <div style="padding:16px 32px;background:rgba(255,255,255,0.03);text-align:center">
              <p style="color:#334155;font-size:12px;margin:0">FaçoPorTi — A plataforma que trabalha por si</p>
            </div>
          </div>
        `,
      }),
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
