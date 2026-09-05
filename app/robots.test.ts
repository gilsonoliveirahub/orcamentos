import { describe, it, expect } from 'vitest'
import robots from './robots'
import { PROTECTED } from '../proxy'

// Guarda contra o gap encontrado no Grupo 4 (2026-09-05): /config,
// /onboarding e /conta eram paginas reais, protegidas em proxy.ts, mas
// faltavam no disallow de robots.ts — indexaveis por engano. Este teste
// cruza diretamente a lista PROTECTED real (importada do proprio proxy.ts,
// nunca copiada a mao) com o disallow, para uma nova rota protegida futura
// nunca mais passar despercebida da mesma forma.

describe('app/robots.ts', () => {
  it('usa o dominio canonico real do FaçoPorTi', () => {
    const result = robots()
    expect(result.sitemap).toBe('https://façoporti.com/sitemap.xml')
  })

  it('permite tudo por omissao (allow: /)', () => {
    const result = robots()
    expect(result.rules).toEqual(
      expect.arrayContaining([expect.objectContaining({ userAgent: '*', allow: '/' })])
    )
  })

  it.each(PROTECTED)('toda rota protegida em proxy.ts (%s) tem cobertura no disallow de robots.ts', (protectedPath) => {
    const result = robots()
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules
    const disallow = ([] as string[]).concat(rule.disallow ?? [])

    const covered = disallow.some(d =>
      d === protectedPath || d === `${protectedPath}/` || d.startsWith(`${protectedPath}/`)
    )
    expect(covered).toBe(true)
  })
})
