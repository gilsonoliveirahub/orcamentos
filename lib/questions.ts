export const QUESTIONS = [
  {
    id: 1,
    key: 'q1_tipo_trabalho',
    text: 'Olá! 👋 Sou o assistente do Gilson Oliveira, pintor profissional.\n\nQue tipo de trabalho precisa?\n\n1️⃣ Interior (quartos, sala, cozinha...)\n2️⃣ Exterior (fachada, garagem...)\n3️⃣ Ambos',
    type: 'choice',
    choices: { '1': 'interior', '2': 'exterior', '3': 'ambos', 'interior': 'interior', 'exterior': 'exterior', 'ambos': 'ambos' },
  },
  {
    id: 2,
    key: 'q2_divisoes',
    text: 'Quais as divisões a pintar? (ex: 2 quartos, sala, cozinha)',
    type: 'text',
  },
  {
    id: 3,
    key: 'q3_area_m2',
    text: 'Tem ideia da área em m²? (uma estimativa serve — ex: 80m²)\nSe não sabe, diga o nº de divisões e eu estimo.',
    type: 'number',
  },
  {
    id: 4,
    key: 'q4_cor_escura',
    text: 'A cor escolhida é escura? (cinzento escuro, verde, azul, preto...)\n\n1️⃣ Sim\n2️⃣ Não\n3️⃣ Ainda não sei',
    type: 'boolean',
    choices: { '1': true, 'sim': true, '2': false, 'não': false, 'nao': false, '3': false },
  },
  {
    id: 5,
    key: 'q5_fissuras',
    text: 'Tem fissuras ou buracos nas paredes?\n\n1️⃣ Sim\n2️⃣ Não',
    type: 'boolean',
    choices: { '1': true, 'sim': true, '2': false, 'não': false, 'nao': false },
  },
  {
    id: 6,
    key: 'q6_mobilias',
    text: 'Há móveis que precisem de ser movidos?\n\n1️⃣ Sim\n2️⃣ Não',
    type: 'boolean',
    choices: { '1': true, 'sim': true, '2': false, 'não': false, 'nao': false },
  },
  {
    id: 7,
    key: 'q7_primer',
    text: 'Precisa de primário? (recomendado se as paredes são novas ou têm manchas)\n\n1️⃣ Sim\n2️⃣ Não\n3️⃣ Não sei',
    type: 'boolean',
    choices: { '1': true, 'sim': true, '2': false, 'não': false, 'nao': false, '3': false },
  },
  {
    id: 8,
    key: 'q8_teto',
    text: 'Inclui pintura do teto?\n\n1️⃣ Sim\n2️⃣ Não',
    type: 'boolean',
    choices: { '1': true, 'sim': true, '2': false, 'não': false, 'nao': false },
  },
  {
    id: 9,
    key: 'q9_prazo',
    text: 'Qual a urgência do trabalho?\n\n1️⃣ Esta semana\n2️⃣ Este mês\n3️⃣ Sem pressa',
    type: 'choice',
    choices: { '1': 'urgente', '2': 'normal', '3': 'sem_pressa' },
  },
  {
    id: 10,
    key: 'q10_orcamentos_anteriores',
    text: 'Já pediu outros orçamentos?\n\n1️⃣ Sim\n2️⃣ Não',
    type: 'boolean',
    choices: { '1': true, 'sim': true, '2': false, 'não': false, 'nao': false },
  },
  {
    id: 11,
    key: 'q11_fotos_url',
    text: 'Pode enviar fotos do espaço? Ajuda a dar um orçamento mais preciso.\n(Envie as fotos agora ou escreva "saltar" para continuar)',
    type: 'photos',
  },
  {
    id: 12,
    key: 'q12_notas',
    text: 'Alguma observação adicional? (tipo de tinta preferida, acessos difíceis, etc.)\nSe não tiver, escreva "não".',
    type: 'text',
  },
]

export function getNextQuestion(currentQ: number): typeof QUESTIONS[0] | null {
  return QUESTIONS.find(q => q.id === currentQ + 1) || null
}

export function parseAnswer(question: typeof QUESTIONS[0], text: string): any {
  const normalized = text.trim().toLowerCase()

  if (question.type === 'number') {
    const num = parseFloat(text.replace(',', '.').replace(/[^\d.]/g, ''))
    if (!isNaN(num)) return num
    // Estima por nº de divisões
    const divisoes = parseInt(text)
    if (!isNaN(divisoes)) return divisoes * 15 // ~15m2 por divisão
    return null
  }

  if (question.type === 'boolean' && question.choices) {
    return (question.choices as Record<string, any>)[normalized] ?? null
  }

  if (question.type === 'choice' && question.choices) {
    return (question.choices as Record<string, any>)[normalized] || text
  }

  return text
}
