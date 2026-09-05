import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { HOMEPAGE_FAQ } from '@/lib/homepage-faq'

// Grupo 4, correção de texto (2026-09-05): a secção de preços da homepage
// dizia "desde 2,5€" para os leads do marketplace, enquanto a FAQ da mesma
// página (lib/homepage-faq.ts) já dizia corretamente "desde 1,50€" — o
// mínimo real (pack50, ver app/creditos/page.tsx: 2,00€/1,80€/1,50€ por
// lead). Nenhum preço/pacote/lógica comercial foi alterado, só o texto.
// Este teste lê o ficheiro fonte diretamente (não renderiza o componente,
// que é 'use client' e não tem harness de DOM neste projeto) para travar
// as duas menções contra nova divergência silenciosa.
const marketingSource = readFileSync(join(__dirname, 'page.tsx'), 'utf-8')

describe('coerência do preço mínimo do marketplace na homepage', () => {
  it('a secção de preços da homepage anuncia "desde 1,50€" (mínimo real dos pacotes)', () => {
    expect(marketingSource).toMatch(/Leads do marketplace desde 1,50€/)
  })

  it('já não menciona o valor antigo e incorreto (2,5€)', () => {
    expect(marketingSource).not.toMatch(/desde 2,5€/)
  })

  it('a FAQ da mesma homepage continua a mencionar o mesmo valor mínimo (1,50€), sem divergir', () => {
    const faqText = HOMEPAGE_FAQ.map(item => item.a).join(' ')
    expect(faqText).toMatch(/desde 1,50€/)
  })
})
