export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isValidTwilioSignature } from '@/lib/twilio-signature'

// Status callback da Twilio para os convites de avaliação por WhatsApp —
// única forma de saber se uma mensagem chegou mesmo (o pedido inicial só
// confirma que a Twilio a aceitou para a fila, nunca que foi entregue). Ver
// lib/send-review-invite.ts (StatusCallback) e lib/whatsapp.ts
// (sendWhatsAppTemplate).
//
// Valida sempre a assinatura oficial (X-Twilio-Signature, ver
// lib/twilio-signature.ts) antes de aceitar qualquer atualização — sem
// isto, qualquer um que soubesse (ou adivinhasse) um whatsapp_message_sid
// conseguiria forjar "entregue"/"falhou" para o convite de outra pessoa. O
// URL usado na assinatura é sempre o mesmo que foi registado como
// StatusCallback ao enviar (NEXT_PUBLIC_APP_URL + este caminho), nunca
// req.url — esse pode não refletir o URL público real atrás do proxy da
// Vercel.
const DELIVERED_STATUSES = new Set(['delivered', 'read'])
const FAILED_STATUSES = new Set(['failed', 'undelivered'])

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''
    const body: Record<string, string> = contentType.includes('application/json')
      ? await req.json()
      : Object.fromEntries((await req.formData()).entries()) as Record<string, string>

    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (!authToken) {
      console.error('[webhook/twilio-status] TWILIO_AUTH_TOKEN não configurado — recusa aceitar sem poder validar a assinatura')
      return NextResponse.json({ error: 'erro interno' }, { status: 500 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'
    const callbackUrl = `${appUrl}/api/webhook/twilio-status`
    const signature = req.headers.get('x-twilio-signature')
    if (!isValidTwilioSignature(callbackUrl, body, signature, authToken)) {
      console.error('[webhook/twilio-status] assinatura Twilio inválida — pedido recusado')
      return NextResponse.json({ error: 'assinatura inválida' }, { status: 403 })
    }

    const messageSid = typeof body.MessageSid === 'string' ? body.MessageSid : null
    const messageStatus = typeof body.MessageStatus === 'string' ? body.MessageStatus : null
    const errorCode = typeof body.ErrorCode === 'string' ? body.ErrorCode : null

    if (!messageSid || !messageStatus) {
      return NextResponse.json({ error: 'dados em falta' }, { status: 400 })
    }

    // Estados intermédios (queued/sent/accepted) não gravam nada — já
    // temos send_status='sent' desde o pedido inicial; só o resultado final
    // (entregue ou falhou) importa persistir aqui.
    let sendStatus: 'delivered' | 'failed' | null = null
    if (DELIVERED_STATUSES.has(messageStatus)) sendStatus = 'delivered'
    else if (FAILED_STATUSES.has(messageStatus)) sendStatus = 'failed'
    if (!sendStatus) return NextResponse.json({ ok: true, ignored: true })

    const { error } = await supabaseAdmin
      .from('review_invites')
      .update({
        send_status: sendStatus,
        send_error: sendStatus === 'failed' ? (errorCode ? `twilio_${errorCode}` : messageStatus) : null,
        send_status_updated_at: new Date().toISOString(),
      })
      .eq('whatsapp_message_sid', messageSid)

    if (error) {
      console.error(`[webhook/twilio-status] falha ao atualizar convite (sid ${messageSid}): ${error.message}`)
      return NextResponse.json({ error: 'erro interno' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[webhook/twilio-status] erro inesperado:', err?.message ?? err)
    return NextResponse.json({ error: 'erro interno' }, { status: 500 })
  }
}
