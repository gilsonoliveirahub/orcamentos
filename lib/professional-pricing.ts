// P1 (2026-09-18): preços configurados pelo profissional POR ESPECIALIDADE E
// POR SUBSERVIÇO (tabela nova `professional_pricing`, migração ainda não
// executada — ver supabase/migration_p1_professional_pricing.sql), em vez de
// um único conjunto de campos partilhado por toda a conta independentemente
// de quantas especialidades/subserviços tiver ativos. Um profissional com
// Pintura + Pavimentos e Revestimentos passa a poder ter preços diferentes
// para cada uma, e dentro da própria Pintura, preços diferentes para
// paredes/tetos/exterior/portas — sem inventar nenhum valor que o
// profissional não tenha escrito.

export interface SpecialtyPricing {
  price_per_m2?: number | null
  price_per_hour?: number | null
  price_per_unit?: number | null
  travel_cost?: number | null
  min_quote?: number | null
  price_m2_walls?: number | null
  price_m2_ceiling?: number | null
  price_m2_exterior?: number | null
  extra_dark_color?: number | null
  extra_cracks?: number | null
  extra_furniture_move?: number | null
  extra_primer?: number | null
}

export const SPECIALTY_PRICING_FIELDS = [
  'price_per_m2', 'price_per_hour', 'price_per_unit', 'travel_cost', 'min_quote',
  'price_m2_walls', 'price_m2_ceiling', 'price_m2_exterior',
  'extra_dark_color', 'extra_cracks', 'extra_furniture_move', 'extra_primer',
] as const

export interface PricingRow extends SpecialtyPricing {
  specialty: string
  // '' (ou ausente) = preço geral da especialidade (linha "toda a
  // especialidade", equivalente ao que existia antes de haver subserviços).
  // Um valor não-vazio identifica um subserviço específico (ver
  // SPECIALTY_SUBSERVICES abaixo) — nunca texto livre do cliente.
  subservico?: string | null
}

export interface SubserviceDef {
  key: string
  label: string
  unit: 'm2' | 'hour' | 'unit'
}

/**
 * Catálogo de subserviços por especialidade — só as especialidades onde
 * Gilson deu exemplos concretos (2026-09-18): Pintura (paredes interior/
 * exterior/tetos/portas e aros) e Pavimentos e Revestimentos (chão
 * flutuante/remoção de pavimento/rodapés). As restantes especialidades
 * continuam com um preço geral por especialidade (sem subserviços) — não
 * inventado aqui, porque não há exemplo nem pedido para elas.
 */
export const SPECIALTY_SUBSERVICES: Record<string, SubserviceDef[]> = {
  Pintura: [
    { key: 'paredes_interior', label: 'Pintura interior (paredes)', unit: 'm2' },
    { key: 'paredes_exterior', label: 'Pintura exterior', unit: 'm2' },
    { key: 'tetos', label: 'Tetos', unit: 'm2' },
    { key: 'portas_aros', label: 'Portas e aros', unit: 'unit' },
  ],
  'Pavimentos e Revestimentos': [
    { key: 'chao_flutuante', label: 'Colocação de chão flutuante', unit: 'm2' },
    { key: 'remocao_pavimento', label: 'Remoção de pavimento existente', unit: 'm2' },
    { key: 'rodapes', label: 'Rodapés', unit: 'unit' },
  ],
}

export function getSubservices(specialty: string): SubserviceDef[] {
  return SPECIALTY_SUBSERVICES[specialty] || []
}

/**
 * Subserviço realmente pedido pelo cliente neste lead, a partir das
 * respostas do questionário — só quando há uma correspondência direta e
 * inequívoca a uma resposta existente. Sem correspondência conhecida,
 * devolve `null` (o cálculo cai no preço geral da especialidade, nunca
 * inventa uma correspondência que o questionário não confirma).
 */
export function resolveRequestedSubservico(specialty: string, answers: Record<string, any> | null | undefined): string | null {
  if (specialty === 'Pavimentos e Revestimentos' && answers?.tipo_servico === 'Chão flutuante novo') return 'chao_flutuante'
  return null
}

/**
 * Indexa as linhas de `professional_pricing` (vindas do embed
 * `professionals(*, professional_pricing(*))` ou de uma query direta em
 * app/config) por especialidade e depois por subserviço (`''` = linha geral
 * da especialidade). Tolera `undefined`/`null`/`[]` — contas sem nenhuma
 * linha configurada ainda (todas, antes desta migração ser aplicada e
 * usada).
 */
export function buildPricingIndex(
  rows: PricingRow[] | null | undefined
): Record<string, Record<string, SpecialtyPricing>> {
  const index: Record<string, Record<string, SpecialtyPricing>> = {}
  for (const row of rows || []) {
    if (!row || typeof row.specialty !== 'string' || !row.specialty) continue
    const sub = row.subservico || ''
    if (!index[row.specialty]) index[row.specialty] = {}
    index[row.specialty][sub] = row
  }
  return index
}

/**
 * Combina várias fontes campo-a-campo, pela ordem dada (a primeira fonte
 * com o campo definido ganha) — nunca deixa um campo em falta numa fonte
 * "esconder" o valor já existente numa fonte de prioridade menor. Sem
 * nenhuma fonte a definir um campo, esse campo fica ausente (nunca um
 * número inventado).
 */
export function mergePricing(...sources: Array<SpecialtyPricing | null | undefined>): SpecialtyPricing {
  const result: SpecialtyPricing = {}
  for (const field of SPECIALTY_PRICING_FIELDS) {
    for (const source of sources) {
      const value = source?.[field]
      if (value !== null && value !== undefined) {
        (result as any)[field] = value
        break
      }
    }
  }
  return result
}

/**
 * Preço a usar quando o cálculo é ao nível de toda a especialidade (sem
 * subserviço distinto pedido, ou especialidade sem catálogo de
 * subserviços). Ordem campo-a-campo: 1) linha geral da especialidade
 * (subservico=''); 2) colunas legacy do profissional (compatibilidade).
 */
export function resolveSpecialtyPricing(
  professional: SpecialtyPricing | null | undefined,
  specialtyRows: Record<string, SpecialtyPricing> | null | undefined
): SpecialtyPricing {
  return mergePricing(specialtyRows?.[''], professional)
}

/**
 * Preço a usar para UM subserviço pedido dentro de uma especialidade.
 * Ordem de resolução, campo-a-campo (regra ditada 2026-09-18): 1) linha
 * própria do subserviço; 2) linha geral da especialidade; 3) colunas
 * legacy do profissional. Sem subserviço pedido (null), salta direto para
 * a resolução de especialidade acima.
 */
export function resolveSubservicePricing(
  professional: SpecialtyPricing | null | undefined,
  specialtyRows: Record<string, SpecialtyPricing> | null | undefined,
  subservico: string | null | undefined
): SpecialtyPricing {
  if (!subservico) return resolveSpecialtyPricing(professional, specialtyRows)
  return mergePricing(specialtyRows?.[subservico], specialtyRows?.[''], professional)
}

export interface PaintingAreaPrices {
  price_m2_walls?: number | null
  price_m2_ceiling?: number | null
  price_m2_exterior?: number | null
}

/**
 * Preços de Pintura por área (paredes/tetos/exterior) — os 3 termos que
 * `lib/calculator.ts` já usava antes de existirem subserviços. Cada termo
 * usa, por ordem: o `price_per_m2` do subserviço correspondente
 * (paredes_interior/tetos/paredes_exterior) → a linha geral da
 * especialidade/legacy (mesmos nomes `price_m2_*` de sempre). Nunca mistura
 * o preço de um subserviço com o de outro (paredes_interior nunca alimenta
 * `price_m2_exterior`, por exemplo).
 */
export function resolvePaintingAreaPrices(
  professional: SpecialtyPricing | null | undefined,
  specialtyRows: Record<string, SpecialtyPricing> | null | undefined
): PaintingAreaPrices {
  const wholeOrLegacy = resolveSpecialtyPricing(professional, specialtyRows)
  const walls = specialtyRows?.['paredes_interior']?.price_per_m2
  const ceiling = specialtyRows?.['tetos']?.price_per_m2
  const exterior = specialtyRows?.['paredes_exterior']?.price_per_m2
  return {
    price_m2_walls: walls ?? wholeOrLegacy.price_m2_walls,
    price_m2_ceiling: ceiling ?? wholeOrLegacy.price_m2_ceiling,
    price_m2_exterior: exterior ?? wholeOrLegacy.price_m2_exterior,
  }
}
