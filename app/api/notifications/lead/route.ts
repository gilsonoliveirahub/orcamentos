import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { lead_id } = await req.json()

    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('*, professionals(name, email, phone)')
      .eq('id', lead_id)
      .single()

    if (!lead || !lead.professionals?.email) return NextResponse.json({ ok: false })

    const prof = lead.professionals
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ ok: false, reason: 'no key' })

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'FaçoPorTi <notificacoes@facoporti.pt>',
        to: [prof.email],
        subject: `Novo pedido de orçamento — ${lead.name || 'Cliente'}`,
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
            <h2 style="color:#6366f1">Novo pedido de orçamento!</h2>
            <p>Olá <strong>${prof.name}</strong>,</p>
            <p>Recebeste um novo pedido de orçamento pelo FaçoPorTi.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:8px;color:#666">Nome</td><td style="padding:8px;font-weight:bold">${lead.name || '—'}</td></tr>
              <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">Telefone</td><td style="padding:8px">${lead.phone || '—'}</td></tr>
              <tr><td style="padding:8px;color:#666">Serviço</td><td style="padding:8px">${lead.q1_tipo_trabalho || '—'}</td></tr>
              <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">Área</td><td style="padding:8px">${lead.q3_area_m2 ? `${lead.q3_area_m2}m²` : '—'}</td></tr>
              <tr><td style="padding:8px;color:#666">Prazo</td><td style="padding:8px">${lead.q9_prazo || '—'}</td></tr>
            </table>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://orcamentos-taupe.vercel.app'}/dashboard"
              style="display:inline-block;background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
              Ver no dashboard
            </a>
            <p style="color:#999;font-size:12px;margin-top:24px">FaçoPorTi — A plataforma que trabalha por si</p>
          </div>
        `,
      }),
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
