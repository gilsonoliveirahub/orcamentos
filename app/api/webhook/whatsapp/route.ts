export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { QUESTIONS, getNextQuestion, parseAnswer } from '@/lib/questions'
import { calculateQuote, generateProposalText } from '@/lib/calculator'
import { sendWhatsApp } from '@/lib/whatsapp'

// Fase de captação de profissionais — atendimento automático de pedidos de
// clientes está temporariamente desativado (por omissão, sempre desligado
// a menos que WHATSAPP_INTAKE_ENABLED=true esteja definido no ambiente).
// Não cria leads nem encaminha contactos para nenhum profissional enquanto
// isto estiver desligado.
// Quando reativar: o fluxo abaixo ainda assume "1 profissional só" e
// precisa do redesenho descrito no diagnóstico (identificar especialidade
// antes de associar profissional, corresponder por especialidade+zona só
// no fim) antes de voltar a atender pedidos reais.
const INTAKE_ENABLED = process.env.WHATSAPP_INTAKE_ENABLED === 'true'

const COMING_SOON_MESSAGE =
  'Olá! 👋 Obrigado por contactares a *Façoporti*.\n\n' +
  'Estamos ainda a preparar a plataforma e o atendimento automático de pedidos vai estar disponível em breve.\n\n' +
  'Volta a escrever-nos dentro de dias. Obrigado pela paciência! 🙏'

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length > 4 ? `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}` : '****'
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''
    const body = contentType.includes('application/json')
      ? await req.json()
      : Object.fromEntries((await req.formData()).entries())

    // Suporte Evolution API e Twilio
    const phone = body.data?.key?.remoteJid?.replace('@s.whatsapp.net', '')
      || body.From?.replace('whatsapp:+', '')
      || body.phone

    const messageText = body.data?.message?.conversation
      || body.data?.message?.extendedTextMessage?.text
      || body.Body
      || body.text
      || ''

    if (!phone || !messageText) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    if (!INTAKE_ENABLED) {
      const result = await sendWhatsApp(phone, COMING_SOON_MESSAGE)
      if (result.status !== 'sent') {
        console.warn(`[webhook/whatsapp] mensagem "em breve" não enviada (${maskPhone(phone)}): ${result.reason}`)
      }
      return NextResponse.json({
        success: true,
        phone,
        response: COMING_SOON_MESSAGE,
        lead_id: null,
      })
    }

    // ────────────────────────────────────────────────────────────────
    // Fluxo completo de leads — desativado por agora (ver INTAKE_ENABLED)
    // ────────────────────────────────────────────────────────────────

    // Buscar ou criar lead
    let { data: lead } = await supabase
      .from('leads')
      .select('*, professionals(*)')
      .eq('phone', phone)
      .neq('status', 'fechado')
      .neq('status', 'perdido')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!lead) {
      // Não associar a nenhum profissional na criação — a correspondência
      // por especialidade/zona só deve acontecer depois de o pedido estar
      // concluído (ver diagnóstico de 2026-07-16)
      const { data: newLead, error: insertError } = await supabase
        .from('leads')
        .insert({ phone, professional_id: null, current_question: 0 })
        .select()
        .single()

      if (insertError || !newLead) {
        console.error(`[webhook/whatsapp] falha ao criar lead (${maskPhone(phone)}): ${insertError?.message}`)
        return NextResponse.json({ error: 'Erro ao criar pedido' }, { status: 500 })
      }

      lead = { ...newLead, professionals: null }
    }

    const currentQ = lead.current_question || 0
    const question = QUESTIONS.find(q => q.id === currentQ)

    let responseText = ''
    let updates: any = {}

    if (currentQ === 0) {
      // Primeiro contacto — pedir nome
      responseText = `Olá! 👋 Bem-vindo à *Façoporti*.\n\nComo se chama?`
      updates = { current_question: 0.5 }
    } else if (currentQ === 0.5) {
      // Guardar nome e começar questões
      updates = { name: messageText.trim(), current_question: 1, status: 'qualificado' }
      const firstQ = QUESTIONS[0]
      responseText = firstQ.text
    } else if (question) {
      // Processar resposta à questão atual
      const answer = parseAnswer(question, messageText)

      if (answer !== null) {
        updates[question.key] = answer

        const nextQ = getNextQuestion(currentQ)
        if (nextQ) {
          updates.current_question = nextQ.id
          responseText = nextQ.text
        } else {
          // Todas as perguntas respondidas — calcular orçamento
          updates.current_question = 99
          updates.status = 'proposta'

          const professional = lead.professionals || {}
          const area_paredes = lead.q3_area_m2 || answer || 50
          const area_tetos = lead.q8_teto ? Math.round(area_paredes * 0.3) : 0
          const quoteInput = {
            area_m2_paredes: area_paredes,
            area_m2_tetos: area_tetos,
            tipo: (lead.q1_tipo_trabalho || 'interior') as 'interior' | 'exterior' | 'ambos',
            cor_escura: !!lead.q4_cor_escura,
            fissuras: !!lead.q5_fissuras,
            mobilias: !!lead.q6_mobilias,
            primer: !!lead.q7_primer,
            prices: {
              price_m2_walls: professional.price_m2_walls || 4,
              price_m2_ceiling: professional.price_m2_ceiling || 5,
              price_m2_exterior: professional.price_m2_exterior || 6,
              extra_dark_color: professional.extra_dark_color || 1.25,
              extra_cracks: professional.extra_cracks || 6,
              extra_furniture_move: professional.extra_furniture_move || 50,
              extra_primer: professional.extra_primer || 2,
              min_quote: professional.min_quote || 150,
            },
          }

          const quoteResult = calculateQuote(quoteInput)
          const proposalText = generateProposalText(lead, quoteResult, professional)

          // Guardar orçamento
          const { error: quoteError } = await supabase.from('quotes').insert({
            lead_id: lead.id,
            professional_id: lead.professional_id,
            area_m2: area_paredes,
            valor_base: quoteResult.valor_base,
            extras_total: quoteResult.extras_total,
            valor_final: quoteResult.valor_final,
            valor_min: quoteResult.valor_min,
            valor_max: quoteResult.valor_max,
            proposal_text: proposalText,
            sent_at: new Date().toISOString(),
            status: 'enviado',
          })
          if (quoteError) {
            console.error(`[webhook/whatsapp] falha ao guardar orçamento (lead ${lead.id}): ${quoteError.message}`)
          }

          responseText = proposalText
        }
      } else {
        responseText = `Não percebi. Por favor escolha uma das opções ou escreva a resposta.`
      }
    }

    // Actualizar lead
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('leads')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', lead.id)

      if (updateError) {
        console.error(`[webhook/whatsapp] falha ao atualizar lead ${lead.id}: ${updateError.message}`)
        return NextResponse.json({ error: 'Erro ao gravar resposta' }, { status: 500 })
      }
    }

    if (responseText) {
      const result = await sendWhatsApp(phone, responseText)
      if (result.status !== 'sent') {
        console.warn(`[webhook/whatsapp] resposta não enviada (lead ${lead.id}): ${result.reason}`)
      }
    }

    return NextResponse.json({
      success: true,
      phone,
      response: responseText,
      lead_id: lead.id,
    })
  } catch (err: any) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Webhook activo ✅' })
}
