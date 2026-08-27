export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthenticatedAdmin } from '@/lib/admin-auth'
import { calcFaturacaoReal, groupFaturacaoRealByMonth } from '@/lib/closed-value-stats'

// Financeiro admin — distingue sempre duas coisas que NUNCA podem ser
// confundidas:
//   A) valor económico gerado aos profissionais (leads.valor_fechado) —
//      dinheiro que os CLIENTES pagaram aos PROFISSIONAIS, não à FaçoPorTi;
//   B) receita real da própria FaçoPorTi (subscrições Stripe) — hoje não
//      existe nenhuma agregação fiável desses dados (nenhuma tabela nem
//      rotina soma faturas/MRR reais). Por isso a parte B é devolvida
//      sempre como indisponível, nunca calculada a partir de valor_fechado
//      nem estimada a partir do preço de tabela dos planos.
export async function GET() {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { data, error } = await supabaseAdmin.from('leads').select('status, updated_at, created_at, valor_fechado')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const leads = data || []
  const fechados = leads.filter(l => l.status === 'fechado')
  const totals = calcFaturacaoReal(fechados)
  const byMonth = groupFaturacaoRealByMonth(leads)

  return NextResponse.json({
    professionalValue: {
      total: totals.faturacaoReal,
      ticketMedio: totals.ticketMedio,
      comValorCount: totals.comValorCount,
      totalFechados: totals.totalFechados,
      byMonth,
    },
    platformRevenue: {
      available: false,
      reason: 'Sem fonte financeira real e fiável (ex: agregação de faturas/subscrições Stripe) — não é calculado a partir de valor_fechado nem estimado a partir do preço de tabela dos planos.',
    },
  })
}
