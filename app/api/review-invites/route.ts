import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { emailConviteAvaliacao } from '@/lib/email'
import { sendWhatsApp } from '@/lib/whatsapp'
import { generateInviteToken } from '@/lib/review-token'

export const dynamic = 'force-dynamic'

async function getAuthenticatedProfessional() {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null

  const { data: professional } = await supabaseAdmin
    .from('professionals')
    .select('id, name')
    .eq('user_id', user.id)
    .maybeSingle()

  return professional
}

// GET — lista os próprios convites (mais recentes primeiro), para o
// profissional ver no perfil quem já convidou e evitar duplicar sem ter de
// adivinhar (a proteção real contra duplicados é sempre a constraint única
// em BD, isto é só para a UI mostrar o estado antes de tentar).
export async function GET() {
  const professional = await getAuthenticatedProfessional()
  if (!professional) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { data: invites } = await supabaseAdmin
    .from('review_invites')
    .select('id, client_name, channel, client_email, client_phone, status, created_at, completed_at')
    .eq('professional_id', professional.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ invites: invites || [] })
}

// POST — cria um convite e envia por email ou WhatsApp (um dos dois, nunca
// os dois — decisão de negócio, 2026-09-23). lead_id nunca existe aqui de
// propósito (pedido explícito: sem pedidos fictícios em `leads` só para
// pendurar uma avaliação) — review_invites é a única fonte de verdade.
export async function POST(req: NextRequest) {
  try {
    const professional = await getAuthenticatedProfessional()
    if (!professional) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const { client_name, channel, client_email, client_phone } = await req.json()
    const name = typeof client_name === 'string' ? client_name.trim() : ''

    if (!name) {
      return NextResponse.json({ error: 'Indica o nome do cliente.' }, { status: 400 })
    }
    if (channel !== 'email' && channel !== 'whatsapp') {
      return NextResponse.json({ error: 'Escolhe um canal: email ou WhatsApp.' }, { status: 400 })
    }

    let email: string | null = null
    let phone: string | null = null

    if (channel === 'email') {
      email = typeof client_email === 'string' ? client_email.trim().toLowerCase() : ''
      if (!email) return NextResponse.json({ error: 'Indica o email do cliente.' }, { status: 400 })
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Email inválido.' }, { status: 400 })
      }
    } else {
      const digits = typeof client_phone === 'string' ? client_phone.replace(/\D/g, '') : ''
      if (digits.length < 8) return NextResponse.json({ error: 'Indica um número de telemóvel válido.' }, { status: 400 })
      phone = digits
    }

    // Impede um 2º convite pendente para o mesmo contacto — a constraint
    // única parcial em BD (review_invites_pending_contact_unique) é a
    // última linha de defesa atómica; este check só serve para dar uma
    // mensagem clara em vez do genérico "erro 500" numa corrida normal
    // (não simultânea). Consulta sempre pela coluna do próprio canal — nunca
    // um filtro .or() com valor interpolado (evitava injeção na sintaxe de
    // filtro do PostgREST, que usa vírgulas/parênteses como separadores).
    const existingQuery = supabaseAdmin
      .from('review_invites')
      .select('id')
      .eq('professional_id', professional.id)
      .eq('status', 'pending')
    const { data: existing } = await (channel === 'email'
      ? existingQuery.ilike('client_email', email!)
      : existingQuery.eq('client_phone', phone!)
    ).maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Já existe um convite pendente para este contacto.', reason: 'already_pending' }, { status: 409 })
    }

    const { data: invite, error } = await supabaseAdmin
      .from('review_invites')
      .insert({ professional_id: professional.id, client_name: name, channel, client_email: email, client_phone: phone })
      .select('id, client_name, channel, client_email, client_phone, status, created_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Já existe um convite pendente para este contacto.', reason: 'already_pending' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Melhor esforço: o convite fica sempre criado mesmo que o envio falhe —
    // devolve o erro ao profissional (send_error) para ele saber que tem de
    // tentar de outra forma; o convite já criado impede um novo até ficar
    // concluído (não há reenvio automático nesta fase).
    let sendError: string | null = null
    if (channel === 'email') {
      try {
        await emailConviteAvaliacao({ profName: professional.name, clientName: name, clientEmail: email!, inviteId: invite.id })
      } catch (err: any) {
        sendError = err.message
        console.error(`[review-invites] email não enviado (invite ${invite.id}): ${err.message}`)
      }
    } else {
      const secret = process.env.REVIEW_TOKEN_SECRET
      if (!secret) {
        sendError = 'REVIEW_TOKEN_SECRET não configurado'
        console.error(`[review-invites] ${sendError} — WhatsApp não enviado (invite ${invite.id})`)
      } else {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'
        const link = `${appUrl}/avaliar-convite/${invite.id}?token=${generateInviteToken(invite.id, secret)}`
        const result = await sendWhatsApp(phone!,
          `⭐ Olá ${name}! *${professional.name}* convidou-te a deixar uma opinião sobre um trabalho que fez para ti.\n\n` +
          `Demora menos de 1 minuto: ${link}\n\n` +
          `Esta ligação é pessoal e só pode ser usada uma vez.`
        )
        if (result.status !== 'sent') {
          sendError = result.reason
          console.error(`[review-invites] WhatsApp não enviado (invite ${invite.id}): ${result.reason}`)
        }
      }
    }

    return NextResponse.json({ invite, send_error: sendError })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
