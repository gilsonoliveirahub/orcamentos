export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Endpoint público (usado por /profissionais, listagem pública) — substitui
// o antigo select('*') feito pelo browser com a chave anon diretamente à
// tabela `professionals`. A policy RLS `professionals_select_active` dá
// SELECT à LINHA inteira (não só a colunas) para qualquer profissional
// ativo, incluindo a papéis anon — por isso um select('*') do cliente
// expunha phone/email/user_id/stripe_customer_id/stripe_subscription_id/
// marketplace_credits/current_period_start/end/pending_plan/
// marketing_opt_in/trial_ends_at/preços internos a qualquer visitante sem
// sessão, via DevTools ou REST direto.
//
// Esta rota corre no servidor com supabaseAdmin e devolve só os campos já
// públicos noutras páginas equivalentes (/p/[slug], /profissionais/
// [especialidade]) + plan/created_at/accepting_leads, que já eram enviados
// ao browser antes (via select('*')) e são necessários para
// sortProfessionalsForRanking — não são segredos como os campos acima,
// só a lista deixa de incluir tudo o resto. Nenhuma regra de negócio,
// RLS ou dado real foi alterado.
//
// NOTA (corrigido 2026-08-27): a coluna `bio` chegou a existir no
// schema.sql do repositório mas NÃO existe na tabela real em produção
// (renomeada para `description` nalgum momento sem atualizar o ficheiro
// local) — incluí-la aqui partia esta rota com um 500 em produção.
// Confirmado via leitura direta (information_schema.columns) antes desta
// correção.
const PUBLIC_SELECT = 'id, name, slug, specialty, specialties, zone, description, avatar_url, plan, created_at, accepting_leads, reviews(rating), professional_portfolio(id, url, type)'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('professionals')
      .select(PUBLIC_SELECT)
      .eq('active', true)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ professionals: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
