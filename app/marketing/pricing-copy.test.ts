import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { HOMEPAGE_FAQ } from '@/lib/homepage-faq'
import { CREDIT_PACKS } from '@/lib/marketplace-credits'

// P2 (2026-09-18): pacotes de créditos do marketplace atualizados (1/10/25/
// 50 créditos, todos com IVA incluído, substituindo os antigos 10/25/50 por
// 20€/45€/75€ sem IVA mencionado) — o mínimo real passou de 1,50€/lead
// (pack50 antigo) para 7,43€/lead (pack50 novo, ver lib/marketplace-credits.ts).
// Este teste lê os ficheiros fonte diretamente (não renderiza os
// componentes, que são 'use client' e não têm harness de DOM neste
// projeto) para travar as menções de preço contra nova divergência
// silenciosa entre a homepage, a FAQ e a fonte única dos pacotes.
const marketingSource = readFileSync(join(__dirname, 'page.tsx'), 'utf-8')
const cheapestPack = CREDIT_PACKS[CREDIT_PACKS.length - 1]

describe('coerência do preço mínimo do marketplace na homepage (P2, 2026-09-18)', () => {
  it('a secção de preços da homepage anuncia "Leads exclusivos desde €X,XX — IVA incluído", calculado a partir do pacote mais barato (nunca um número fixo no texto)', () => {
    expect(cheapestPack.perLeadEur).toBe(7.43)
    expect(marketingSource).toMatch(/Leads exclusivos desde €\{formatEur\(.*perLeadEur.*\)\} — IVA incluído/)
  })

  it('já não menciona nenhum dos valores antigos e incorretos (2,5€ ou 1,50€)', () => {
    expect(marketingSource).not.toMatch(/desde 2,5€/)
    expect(marketingSource).not.toMatch(/desde 1,50€/)
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

  it('a FAQ da mesma homepage menciona o mesmo valor mínimo (7,43€, IVA incluído), sem divergir', () => {
    const faqText = HOMEPAGE_FAQ.map(item => item.a).join(' ')
    expect(faqText).toMatch(/desde 7,43€ por lead, IVA incluído/)
  })
})

// 2026-09-19: opção anual (Starter 193,80€ + IVA, Pro 397,80€ + IVA, -15%)
// mostrada só como informação na homepage — sem Price ID no Stripe ainda,
// por isso tem de estar marcada "Em breve" e não pode ter nenhum botão/link
// que inicie uma compra. Fica aqui e não em checkout/route.test.ts porque é
// especificamente sobre a apresentação pública, não sobre a API.
describe('planos anuais — só informação, marcados "Em breve" (2026-09-19)', () => {
  it('mostra os dois valores anuais exatos', () => {
    expect(marketingSource).toMatch(/€193,80\/ano \+ IVA \(-15%\)/)
    expect(marketingSource).toMatch(/€397,80\/ano \+ IVA \(-15%\)/)
  })

  it('cada menção ao valor anual vem marcada "Em breve", para nunca parecer compra ativa', () => {
    const matches = marketingSource.match(/ano \+ IVA \(-15%\)[\s\S]{0,80}?Em breve/g) || []
    expect(matches).toHaveLength(2)
  })

  it('não existe nenhum seletor de ciclo (mensal/anual) nem qualquer referência a "annual"/"cycle" na página pública', () => {
    expect(marketingSource).not.toMatch(/cycle/i)
    expect(marketingSource).not.toMatch(/\bannual\b/i)
  })
})
