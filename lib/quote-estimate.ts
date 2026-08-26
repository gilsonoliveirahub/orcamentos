// Motor de estimativa genérico por especialidade — extraído de
// app/api/quote/estimate/route.ts para ser reutilizável também por
// componentes 'use client' (ex: app/pedir/page.tsx), sem arrastar
// nenhum import de supabaseAdmin/service role para o bundle do browser.
// Lógica de cálculo mantida byte a byte igual à original.

export type PriceEstimate = { min: number; max: number; descricao: string }

// Margem adicional só na apresentação antecipada ao cliente (nunca gravada em
// `quotes`, nunca vista pelo profissional) — reduz o risco de a proposta real
// ultrapassar a expectativa criada aqui. Aprovada explicitamente: mínimo
// público = mínimo interno; máximo público = máximo interno × 1.15. Partilhada
// por qualquer fluxo que use estimatePriceRange para mostrar uma
// pré-visualização ao cliente (app/pedir e o link pessoal para especialidades
// que não têm preços próprios do profissional — ver ProfessionalProfileClient).
export const PUBLIC_ESTIMATE_MAX_MARGIN = 1.15

const PRICE_TABLES: Record<string, (answers: Record<string, any>) => PriceEstimate> = {
  Pintura: (a) => {
    let area_paredes: number
    let area_tetos: number
    if (a.altura_paredes) {
      // novo formato: calcula a partir das divisões
      const heightMap: Record<string, number> = { '2.2m': 2.2, '2.4m': 2.4, '2.7m': 2.7, '3m ou mais': 3.0 }
      const height = heightMap[a.altura_paredes] || parseFloat(a.altura_paredes) || 2.4
      const quartosMap: Record<string, number> = { '0': 0, '1': 1, '2': 2, '3': 3, '4 ou mais': 4 }
      let perimeter = (quartosMap[a.num_quartos] ?? 1) * 14
      if (a.tem_sala === 'Sim') perimeter += 18
      if (a.tem_hall === 'Sim') perimeter += 10
      // Cozinha e WC têm paredes azulejadas — só contam no teto
      area_paredes = Math.max(Math.round(perimeter * height * 0.85), 10)
      area_tetos = parseFloat(a.area_total_m2) || 0
    } else {
      area_paredes = parseFloat(a.area_m2_paredes || a.area_m2 || a.q3_area_m2) || 30
      area_tetos = parseFloat(a.area_m2_tetos) || 0
    }
    const tipo = (a.tipo_trabalho || a.q1_tipo_trabalho || 'interior').toLowerCase()
    const priceParedes = tipo.includes('exterior') ? 6 : 4
    const base = area_paredes * priceParedes + area_tetos * 5
    const extras = a.cor_escura || a.q4_cor_escura ? base * 0.25 : 0
    const min = Math.max(Math.round(base + extras), 150)
    const descricao = `Pintura ${tipo} — ${area_paredes}m² paredes${area_tetos > 0 ? ` + ${area_tetos}m² tetos` : ''}`
    return { min, max: Math.round(min * 1.4), descricao }
  },

  Electricidade: (a) => {
    const base: Record<string, [number, number]> = {
      'Reparação / Avaria': [80, 200],
      'Nova instalação': [500, 2000],
      'Tomadas e interruptores': [60, 150],
      'Quadro elétrico': [300, 800],
      'Iluminação': [100, 400],
      'Outro': [80, 300],
    }
    const area = parseFloat(a.area_m2) || 0
    const [min, max] = base[a.tipo_trabalho] || [80, 300]
    const areaBonus = area > 100 ? Math.round(area * 1.5) : 0
    const urgBonus = a.prazo?.includes('Emergência') ? 80 : 0
    return { min: min + urgBonus, max: max + areaBonus + urgBonus, descricao: a.tipo_trabalho || 'Trabalho elétrico' }
  },

  Canalização: (a) => {
    const base: Record<string, [number, number]> = {
      'Fuga de água': [60, 200],
      'Entupimento': [50, 150],
      'Nova instalação': [400, 1500],
      'Reparação de torneira / sanita': [40, 120],
      'Aquecimento / Caldeira': [100, 500],
      'Outro': [60, 200],
    }
    const [min, max] = base[a.tipo_trabalho] || [60, 200]
    const urgBonus = a.prazo?.includes('Emergência') ? 100 : a.prazo?.includes('Urgente') ? 40 : 0
    return { min: min + urgBonus, max: max + urgBonus, descricao: a.tipo_trabalho || 'Trabalho de canalização' }
  },

  Carpintaria: (a) => {
    const area = parseFloat(a.area_m2) || 10
    const base: Record<string, [number, number]> = {
      'Móveis por medida': [50, 150],
      'Portas e janelas': [200, 600],
      'Soalho / Deck': [20, 60],
      'Cozinha': [2000, 6000],
      'Reparação': [80, 300],
      'Outro': [80, 200],
    }
    const [minPer, maxPer] = base[a.tipo_trabalho] || [80, 200]
    const isByArea = ['Soalho / Deck', 'Móveis por medida'].includes(a.tipo_trabalho)
    const madeira = a.material === 'Madeira maciça' ? 1.3 : 1
    if (isByArea) {
      return { min: Math.round(area * minPer * madeira), max: Math.round(area * maxPer * madeira), descricao: a.tipo_trabalho }
    }
    return { min: Math.round(minPer * madeira), max: Math.round(maxPer * madeira), descricao: a.tipo_trabalho }
  },

  Jardinagem: (a) => {
    const area = parseFloat(a.area_m2) || 50
    const base: Record<string, [number, number]> = {
      'Corte de relva': [0.15, 0.40],
      'Poda de árvores / arbustos': [0.30, 0.80],
      'Limpeza de jardim': [0.25, 0.60],
      'Plantação': [0.50, 1.20],
      'Manutenção regular': [0.20, 0.50],
      'Outro': [0.20, 0.50],
    }
    const [minPer, maxPer] = base[a.tipo_trabalho] || [0.25, 0.60]
    const freq = { 'Uma vez': 1, 'Semanal': 4, 'Quinzenal': 2, 'Mensal': 1 }[a.frequencia as string] || 1
    const visita = Math.max(area * minPer, 40)
    return {
      min: Math.round(visita),
      max: Math.round(area * maxPer * 1.1),
      descricao: `${a.tipo_trabalho}${freq > 1 ? ` (${a.frequencia})` : ''}`,
    }
  },

  Mudanças: (a) => {
    const tamanho: Record<string, [number, number]> = {
      'T1': [200, 500],
      'T2': [350, 700],
      'T3': [500, 1000],
      'T4 ou maior': [700, 1500],
      'Escritório / Comércio': [400, 1200],
      'Só alguns móveis': [100, 300],
    }
    const dist: Record<string, number> = { 'Local (mesma cidade)': 1, 'Regional (até 100km)': 1.5, 'Nacional (mais de 100km)': 2.5 }
    const sem_elev = a.elevador === 'Não' ? 1.2 : 1
    const [min, max] = tamanho[a.tipo_imovel] || [300, 800]
    const mult = (dist[a.distancia as string] || 1) * sem_elev
    return { min: Math.round(min * mult), max: Math.round(max * mult), descricao: `Mudança ${a.tipo_imovel} — ${a.distancia}` }
  },

  Limpeza: (a) => {
    const area = parseFloat(a.area_m2) || 80
    const base: Record<string, [number, number]> = {
      'Limpeza geral': [0.15, 0.30],
      'Limpeza pós-obra': [0.35, 0.70],
      'Limpeza de fundo': [0.25, 0.50],
      'Limpeza de escritório': [0.15, 0.30],
      'Limpeza de janelas': [3, 6],
    }
    const [minPer, maxPer] = base[a.tipo_trabalho] || [0.20, 0.40]
    const isJanelas = a.tipo_trabalho === 'Limpeza de janelas'
    return {
      min: Math.round(Math.max(area * minPer, 50)),
      max: Math.round(Math.max(area * maxPer, 80)),
      descricao: `${a.tipo_trabalho}${!isJanelas ? ` (${area}m²)` : ''}`,
    }
  },

  Remodelação: (a) => {
    const area = parseFloat(a.area_m2) || 15
    const base: Record<string, [number, number]> = {
      'Casa de banho': [3000, 8000],
      'Cozinha': [4000, 12000],
      'Quarto / Sala': [1500, 5000],
      'Toda a habitação': [15000, 50000],
      'Escritório': [2000, 6000],
      'Outro': [1000, 5000],
    }
    const estado: Record<string, number> = {
      'Precisa de obras totais': 1,
      'Só alguns acabamentos': 0.5,
      'Pequenas reparações': 0.25,
    }
    const [min, max] = base[a.tipo_trabalho] || [2000, 8000]
    const mult = estado[a.estado as string] || 1
    return { min: Math.round(min * mult), max: Math.round(max * mult), descricao: `${a.tipo_trabalho} (${area}m²)` }
  },

  Outro: (a) => {
    return { min: 100, max: 500, descricao: a.tipo_trabalho || 'Trabalho a orçamentar' }
  },
}

export function estimatePriceRange(specialty: string, answers: Record<string, any>): PriceEstimate {
  const estimator = PRICE_TABLES[specialty] || PRICE_TABLES['Outro']
  return estimator(answers)
}
