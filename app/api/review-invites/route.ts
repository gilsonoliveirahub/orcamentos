import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { sendInviteMessage } from '@/lib/send-review-invite'

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
    .select('id, client_name, channel, client_email, client_phone, status, created_at, completed_at, send_status, send_error')
    .eq('professional_id', professional.id)
    .order('created_at', { ascending: false })

  // A UI só mostra "Reenviar" para um convite WhatsApp pendente quando isto
  // é true. TWILIO_REVIEW_INVITE_CONTENT_SID só prova que existe um SID
  // configurado, nunca que a Meta aprovou o modelo — por isso exige também
  // TWILIO_REVIEW_INVITE_TEMPLATE_APPROVED='true', uma flag manual que só
  // deve ser ligada depois de confirmar o estado "Approved" no WhatsApp
  // Manager da Meta (nunca inferida pela app). Sem isto, reenviar ia só
  // repetir a mesma falha (ver lib/send-review-invite.ts). Email não
  // depende de nenhuma aprovação externa, está sempre operacional.
  const whatsappOperational =
    !!process.env.TWILIO_REVIEW_INVITE_CONTENT_SID &&
    process.env.TWILIO_REVIEW_INVITE_TEMPLATE_APPROVED === 'true'

  return NextResponse.json({ invites: invites || [], whatsapp_operational: whatsappOperational })
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

    // Impede um 2º convite pendente (ou pedido por confirmar) para o mesmo
    // contacto — a constraint única parcial em BD
    // (review_invites_pending_contact_unique, cobre 'pending' e 'requested')
    // é a última linha de defesa atómica; este check só serve para dar uma
    // mensagem clara em vez do genérico "erro 500" numa corrida normal
    // (não simultânea). Consulta sempre pela coluna do próprio canal — nunca
    // um filtro .or() com valor interpolado (evitava injeção na sintaxe de
    // filtro do PostgREST, que usa vírgulas/parênteses como separadores).
    const existingQuery = supabaseAdmin
      .from('review_invites')
      .select('id')
      .eq('professional_id', professional.id)
      .in('status', ['pending', 'requested'])
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
    const sendError = await sendInviteMessage(
      { id: invite.id, client_name: name, channel, client_email: email, client_phone: phone },
      professional
    )

    return NextResponse.json({ invite, send_error: sendError })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
