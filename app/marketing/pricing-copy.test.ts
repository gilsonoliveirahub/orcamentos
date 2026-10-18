import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { HOMEPAGE_FAQ } from '@/lib/homepage-faq'
import { CREDIT_PACKS } from '@/lib/marketplace-credits'

// Preços 2026-10-17 (aprovados pelo proprietário, substituem os de
// 2026-09-18) — o mínimo real passou de 7,43€/lead (pack50 anterior,
// valor já com IVA embutido) para 17,53€/lead (pack50 novo, ver
// lib/marketplace-credits.ts — agora com `baseEur` sem IVA + `perLeadEur`
// de referência já com os 23% de IVA, o que o cliente paga de facto).
// Este teste lê os ficheiros fonte diretamente (não renderiza os
// componentes, que são 'use client' e não têm harness de DOM neste
// projeto) para travar as menções de preço contra nova divergência
// silenciosa entre a homepage, a FAQ e a fonte única dos pacotes.
const marketingSource = readFileSync(join(__dirname, 'page.tsx'), 'utf-8')
const cheapestPack = CREDIT_PACKS[CREDIT_PACKS.length - 1]

describe('coerência do preço mínimo do marketplace na homepage (preços 2026-10-17)', () => {
  it('a secção de preços da homepage anuncia "Leads exclusivos desde €X,XX — IVA incluído", calculado a partir do pacote mais barato (nunca um número fixo no texto)', () => {
    expect(cheapestPack.perLeadEur).toBe(17.53)
    expect(marketingSource).toMatch(/Leads exclusivos desde €\{formatEur\(.*perLeadEur.*\)\} — IVA incluído/)
  })

  it('já não menciona nenhum dos valores antigos e incorretos (2,5€, 1,50€ ou o mínimo anterior de 7,43€)', () => {
    expect(marketingSource).not.toMatch(/desde 2,5€/)
    expect(marketingSource).not.toMatch(/desde 1,50€/)
    expect(marketingSource).not.toMatch(/desde 7,43€/)
  })

  it('mostra claramente que os preços incluem IVA', () => {
    expect(marketingSource).toMatch(/IVA incluído/)
  })

  it('explica que os créditos não expiram e que cada crédito desbloqueia um lead do marketplace', () => {
    expect(marketingSource).toMatch(/créditos não expiram/)
    expect(marketingSource).toMatch(/cada crédito desbloqueia um lead do marketplace/)
  })

  it('mostra os 4 pacotes (1/10/25/50 créditos) importados da fonte única, nunca uma lista duplicada e divergente', () => {
    expect(CREDIT_PACKS.map((p) => p.credits)).toEqual([1, 10, 25, 50])
    expect(marketingSource).toMatch(/CREDIT_PACKS/)
  })

  it('a FAQ da mesma homepage menciona o mesmo valor mínimo (17,53€, IVA incluído), sem divergir', () => {
    const faqText = HOMEPAGE_FAQ.map(item => item.a).join(' ')
    expect(faqText).toMatch(/desde 17,53€ por lead, IVA incluído/)
  })
})

// P5 (2026-09-19): planos anuais ficaram funcionais (Price IDs criados no
// Stripe) — a página pública ganha um seletor Mensal/Anual real (troca os
// valores mostrados) e o "Em breve" (P2, texto informativo sem checkout)
// sai. Fica aqui e não em checkout/route.test.ts porque é especificamente
// sobre a apresentação pública, não sobre a API.
//
// Preços 2026-10-18: Starter 29€/mês e Pro 59€/mês (antes 19€/39€); anual
// recalculado mantendo os mesmos -15% sobre o mensal NOVO — 295,80€/
// 601,80€ por ano (antes 193,80€/397,80€, calculado sobre o mensal
// antigo). Ver lib/stripe-plans.ts para os Price IDs.
describe('planos anuais — seletor funcional, "Em breve" removido (P5, 2026-09-19)', () => {
  it('existe um seletor Mensal/Anual (estado pricingCycle + os dois botões)', () => {
    expect(marketingSource).toMatch(/pricingCycle/)
    expect(marketingSource).toMatch(/Mensal/)
    expect(marketingSource).toMatch(/Anual/)
  })

  it('mostra o desconto de 15% junto ao seletor', () => {
    expect(marketingSource).toMatch(/-15%/)
  })

  it('mostra os dois valores anuais exatos, com "+ IVA"', () => {
    expect(marketingSource).toMatch(/€295,80/)
    expect(marketingSource).toMatch(/€601,80/)
    expect(marketingSource).toMatch(/\/ano \+ IVA/)
    expect(marketingSource).toMatch(/\/mês \+ IVA/)
  })

  it('já não mostra "Em breve" junto aos planos — o checkout anual está funcional', () => {
    // Capital "Em breve" era especificamente o texto do P2 junto ao anual —
    // distingue do "em breve" minúsculo, não relacionado, que já existia
    // antes numa funcionalidade Pro à parte (PDF de orçamento).
    expect(marketingSource).not.toMatch(/Em breve/)
  })

  it('não altera os pacotes de créditos (continuam a vir de CREDIT_PACKS, sem seletor de ciclo aplicado a eles)', () => {
    expect(marketingSource).toMatch(/CREDIT_PACKS/)
  })
})
