export type AnswerType = 'choice' | 'number' | 'text'

export interface Question {
  key: string
  text: string
  type: AnswerType
  options?: string[]
  placeholder?: string
  unit?: string
  optional?: boolean
}

export interface ProfessionConfig {
  emoji: string
  label: string
  questions: Question[]
}

export const PROFESSIONS: Record<string, ProfessionConfig> = {
  Pintura: {
    emoji: '🖌️',
    label: 'Pintura',
    questions: [
      { key: 'tipo_trabalho', text: 'Que tipo de pintura precisa?', type: 'choice', options: ['Interior', 'Exterior', 'Ambos'] },
      { key: 'area_m2', text: 'Qual a área aproximada em m²?', type: 'number', placeholder: 'ex: 80', unit: 'm²' },
      { key: 'fissuras', text: 'As paredes têm fissuras ou danos?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'teto', text: 'Inclui pintura do teto?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'cor_escura', text: 'A cor escolhida é escura?', type: 'choice', options: ['Sim', 'Não', 'Ainda não sei'] },
      { key: 'mobilias', text: 'Há móveis que precisem de ser movidos?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'prazo', text: 'Qual a urgência?', type: 'choice', options: ['Esta semana', 'Este mês', 'Sem pressa'] },
      { key: 'notas', text: 'Alguma observação adicional?', type: 'text', placeholder: 'Tipo de tinta, acessos difíceis...', optional: true },
    ],
  },

  Electricidade: {
    emoji: '⚡',
    label: 'Electricidade',
    questions: [
      { key: 'tipo_trabalho', text: 'Que tipo de trabalho elétrico precisa?', type: 'choice', options: ['Reparação / Avaria', 'Nova instalação', 'Tomadas e interruptores', 'Quadro elétrico', 'Iluminação', 'Outro'] },
      { key: 'tipo_imovel', text: 'Qual o tipo de imóvel?', type: 'choice', options: ['Habitação', 'Comércio / Escritório', 'Indústria / Armazém'] },
      { key: 'area_m2', text: 'Área aproximada em m²?', type: 'number', placeholder: 'ex: 100', unit: 'm²' },
      { key: 'prazo', text: 'Qual a urgência?', type: 'choice', options: ['Emergência', 'Esta semana', 'Este mês', 'Sem pressa'] },
      { key: 'notas', text: 'Descreva o trabalho necessário', type: 'text', placeholder: 'Mais detalhes sobre o que precisa...' },
    ],
  },

  Canalização: {
    emoji: '🔧',
    label: 'Canalização',
    questions: [
      { key: 'tipo_trabalho', text: 'Qual o tipo de problema?', type: 'choice', options: ['Fuga de água', 'Entupimento', 'Nova instalação', 'Reparação de torneira / sanita', 'Aquecimento / Caldeira', 'Outro'] },
      { key: 'local', text: 'Onde é o problema?', type: 'choice', options: ['Casa de banho', 'Cozinha', 'Exterior / Jardim', 'Cave / Garagem', 'Outro'] },
      { key: 'prazo', text: 'Qual a urgência?', type: 'choice', options: ['Emergência (água a correr)', 'Urgente (hoje / amanhã)', 'Esta semana', 'Sem pressa'] },
      { key: 'notas', text: 'Descreva o problema em detalhe', type: 'text', placeholder: 'Há quanto tempo, se há danos visíveis...' },
    ],
  },

  Carpintaria: {
    emoji: '🪚',
    label: 'Carpintaria',
    questions: [
      { key: 'tipo_trabalho', text: 'Que tipo de trabalho precisa?', type: 'choice', options: ['Móveis por medida', 'Portas e janelas', 'Soalho / Deck', 'Cozinha', 'Reparação', 'Outro'] },
      { key: 'material', text: 'Preferência de material?', type: 'choice', options: ['Madeira maciça', 'MDF / Melamina', 'Sem preferência'] },
      { key: 'area_m2', text: 'Área ou dimensão aproximada (m²)', type: 'number', placeholder: 'ex: 15', unit: 'm²' },
      { key: 'prazo', text: 'Qual a urgência?', type: 'choice', options: ['Esta semana', 'Este mês', 'Sem pressa'] },
      { key: 'notas', text: 'Descreva o que precisa', type: 'text', placeholder: 'Dimensões, estilo, referências...' },
    ],
  },

  Jardinagem: {
    emoji: '🌿',
    label: 'Jardinagem',
    questions: [
      { key: 'tipo_trabalho', text: 'Que serviço precisa?', type: 'choice', options: ['Corte de relva', 'Poda de árvores / arbustos', 'Limpeza de jardim', 'Plantação', 'Manutenção regular', 'Outro'] },
      { key: 'area_m2', text: 'Área do jardim em m²?', type: 'number', placeholder: 'ex: 200', unit: 'm²' },
      { key: 'frequencia', text: 'Com que frequência precisa do serviço?', type: 'choice', options: ['Uma vez', 'Semanal', 'Quinzenal', 'Mensal'] },
      { key: 'prazo', text: 'Quando precisa?', type: 'choice', options: ['Esta semana', 'Este mês', 'Sem pressa'] },
      { key: 'notas', text: 'Algum detalhe adicional?', type: 'text', placeholder: 'Tipo de plantas, equipamentos disponíveis...', optional: true },
    ],
  },

  Mudanças: {
    emoji: '📦',
    label: 'Mudanças',
    questions: [
      { key: 'tipo_imovel', text: 'Que tipo de espaço vai mudar?', type: 'choice', options: ['T1', 'T2', 'T3', 'T4 ou maior', 'Escritório / Comércio', 'Só alguns móveis'] },
      { key: 'distancia', text: 'Distância da mudança?', type: 'choice', options: ['Local (mesma cidade)', 'Regional (até 100km)', 'Nacional (mais de 100km)'] },
      { key: 'elevador', text: 'Existe elevador nos imóveis?', type: 'choice', options: ['Sim em ambos', 'Só na origem', 'Só no destino', 'Não'] },
      { key: 'prazo', text: 'Quando quer fazer a mudança?', type: 'choice', options: ['Esta semana', 'Este mês', 'Próximos 3 meses'] },
      { key: 'notas', text: 'Objetos especiais ou informações adicionais?', type: 'text', placeholder: 'Piano, cofre, obras de arte, andares...', optional: true },
    ],
  },

  Limpeza: {
    emoji: '✨',
    label: 'Limpeza',
    questions: [
      { key: 'tipo_trabalho', text: 'Que tipo de limpeza precisa?', type: 'choice', options: ['Limpeza geral', 'Limpeza pós-obra', 'Limpeza de fundo', 'Limpeza de escritório', 'Limpeza de janelas'] },
      { key: 'area_m2', text: 'Área em m²?', type: 'number', placeholder: 'ex: 90', unit: 'm²' },
      { key: 'frequencia', text: 'Frequência do serviço?', type: 'choice', options: ['Uma vez', 'Semanal', 'Quinzenal', 'Mensal'] },
      { key: 'prazo', text: 'Quando precisa?', type: 'choice', options: ['Esta semana', 'Este mês', 'Sem pressa'] },
      { key: 'notas', text: 'Algum detalhe adicional?', type: 'text', placeholder: 'Produtos específicos, zonas prioritárias...', optional: true },
    ],
  },

  Remodelação: {
    emoji: '🏗️',
    label: 'Remodelação',
    questions: [
      { key: 'tipo_trabalho', text: 'Que tipo de remodelação?', type: 'choice', options: ['Casa de banho', 'Cozinha', 'Quarto / Sala', 'Toda a habitação', 'Escritório', 'Outro'] },
      { key: 'area_m2', text: 'Área a remodelar em m²?', type: 'number', placeholder: 'ex: 12', unit: 'm²' },
      { key: 'estado', text: 'Estado atual do espaço?', type: 'choice', options: ['Precisa de obras totais', 'Só alguns acabamentos', 'Pequenas reparações'] },
      { key: 'prazo', text: 'Quando precisa de começar?', type: 'choice', options: ['O mais rápido possível', 'Este mês', 'Próximos 3 meses', 'Sem pressa'] },
      { key: 'notas', text: 'Descreva o projeto', type: 'text', placeholder: 'Materiais preferidos, referências, orçamento...' },
    ],
  },
}

export const SPECIALTY_LIST = Object.keys(PROFESSIONS)

export function getProfession(specialty: string): ProfessionConfig {
  return PROFESSIONS[specialty] || PROFESSIONS['Pintura']
}

/** Mapeia as respostas para os campos legacy da tabela leads (compatibilidade) */
export function mapAnswersToLeadFields(answers: Record<string, any>) {
  return {
    q1_tipo_trabalho: answers['tipo_trabalho'] || answers['tipo_imovel'] || null,
    q2_divisoes: answers['divisoes'] || answers['local'] || null,
    q3_area_m2: answers['area_m2'] ? parseFloat(answers['area_m2']) : null,
    q4_cor_escura: answers['cor_escura'] === 'Sim',
    q5_fissuras: answers['fissuras'] === 'Sim',
    q6_mobilias: answers['mobilias'] === 'Sim',
    q7_primer: false,
    q8_teto: answers['teto'] === 'Sim',
    q9_prazo: answers['prazo'] === 'Esta semana' || answers['prazo']?.includes('Emergência') || answers['prazo']?.includes('Urgente')
      ? 'urgente'
      : answers['prazo'] === 'Este mês'
        ? 'normal'
        : 'sem_pressa',
    q12_notas: answers['notas'] || null,
  }
}
