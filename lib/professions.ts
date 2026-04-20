export type AnswerType = 'choice' | 'multiselect' | 'number' | 'text'

export interface Question {
  key: string
  text: string
  type: AnswerType
  options?: string[]
  placeholder?: string
  unit?: string
  optional?: boolean
  minLength?: number
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
      { key: 'tipo_imovel', text: 'Qual o tipo de imóvel?', type: 'choice', options: ['Apartamento', 'Moradia', 'Escritório / Comércio'] },
      { key: 'area_m2', text: 'Qual a área aproximada em m²?', type: 'number', placeholder: 'ex: 80', unit: 'm²' },
      { key: 'num_divisoes', text: 'Quantas divisões vão ser pintadas?', type: 'choice', options: ['1', '2', '3', '4', '5 ou mais'] },
      { key: 'fissuras', text: 'As paredes têm fissuras ou danos?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'teto', text: 'Inclui pintura do teto?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'cor_escura', text: 'A cor escolhida é escura?', type: 'choice', options: ['Sim', 'Não', 'Ainda não sei'] },
      { key: 'superficie', text: 'Tipo de superfície a pintar?', type: 'choice', options: ['Reboco / Estuque', 'Betão', 'Madeira', 'Metal', 'Misto'] },
      { key: 'mobilias', text: 'Há móveis que precisem de ser movidos?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'primer', text: 'Necessita de primário / preparação de superfície?', type: 'choice', options: ['Sim', 'Não', 'Não sei'] },
      { key: 'prazo', text: 'Qual a urgência?', type: 'choice', options: ['Esta semana', 'Este mês', 'Sem pressa'] },
      { key: 'notas', text: 'Alguma observação adicional?', type: 'text', placeholder: 'Tipo de tinta, acessos difíceis, referências de cor...', optional: true },
    ],
  },

  Electricidade: {
    emoji: '⚡',
    label: 'Electricidade',
    questions: [
      { key: 'tipo_trabalho', text: 'Que tipo de trabalho elétrico precisa?', type: 'choice', options: ['Reparação / Avaria', 'Nova instalação', 'Tomadas e interruptores', 'Quadro elétrico', 'Iluminação', 'Outro'] },
      { key: 'tipo_imovel', text: 'Qual o tipo de imóvel?', type: 'choice', options: ['Habitação', 'Comércio / Escritório', 'Indústria / Armazém'] },
      { key: 'area_m2', text: 'Área aproximada em m²?', type: 'number', placeholder: 'ex: 100', unit: 'm²' },
      { key: 'num_pontos', text: 'Número aproximado de pontos elétricos?', type: 'choice', options: ['Menos de 5', '5 a 15', '15 a 30', 'Mais de 30', 'Não sei'] },
      { key: 'certificacao', text: 'Necessita de certificação elétrica (DGEG)?', type: 'choice', options: ['Sim', 'Não', 'Não sei'] },
      { key: 'avaria_recente', text: 'A avaria/situação é recente?', type: 'choice', options: ['Sim, aconteceu agora', 'Há alguns dias', 'Problema antigo'] },
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
      { key: 'tipo_imovel', text: 'Tipo de imóvel?', type: 'choice', options: ['Apartamento', 'Moradia', 'Comércio'] },
      { key: 'agua_tipo', text: 'Envolve água quente, fria ou ambas?', type: 'choice', options: ['Água fria', 'Água quente', 'Ambas', 'Não sei'] },
      { key: 'danos_visiveis', text: 'Há danos visíveis (humidade, manchas, inundação)?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'acesso', text: 'O acesso ao local é fácil?', type: 'choice', options: ['Sim', 'Acesso difícil (parede/teto)', 'Não sei'] },
      { key: 'prazo', text: 'Qual a urgência?', type: 'choice', options: ['Emergência (água a correr)', 'Urgente (hoje / amanhã)', 'Esta semana', 'Sem pressa'] },
      { key: 'notas', text: 'Descreva o problema em detalhe', type: 'text', placeholder: 'Há quanto tempo, se há danos visíveis...' },
    ],
  },

  Carpintaria: {
    emoji: '🪚',
    label: 'Carpintaria',
    questions: [
      { key: 'tipo_trabalho', text: 'Que tipo de trabalho precisa?', type: 'choice', options: ['Móveis por medida', 'Portas e janelas', 'Soalho / Deck', 'Cozinha', 'Reparação', 'Outro'] },
      { key: 'material', text: 'Preferência de material?', type: 'choice', options: ['Madeira maciça', 'MDF / Melamina', 'Contraplacado', 'Sem preferência'] },
      { key: 'acabamento', text: 'Acabamento pretendido?', type: 'choice', options: ['Natural / Envernizado', 'Lacado (pintado)', 'Oleado', 'Sem preferência'] },
      { key: 'area_m2', text: 'Área ou dimensão aproximada?', type: 'number', placeholder: 'ex: 15', unit: 'm²' },
      { key: 'num_pecas', text: 'Quantas peças ou módulos?', type: 'choice', options: ['1', '2 a 5', '6 a 10', 'Mais de 10', 'Não sei'] },
      { key: 'tem_projeto', text: 'Tem projeto ou desenho definido?', type: 'choice', options: ['Sim, tenho projeto', 'Tenho ideia mas não projeto', 'Não, preciso de sugestão'] },
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
      { key: 'arvores_grandes', text: 'Existem árvores de grande porte?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'rega', text: 'Tem sistema de rega automático?', type: 'choice', options: ['Sim', 'Não', 'Quero instalar'] },
      { key: 'acesso', text: 'Tipo de acesso ao jardim?', type: 'choice', options: ['Fácil (entrada larga)', 'Restrito (só a pé)', 'Com desnível'] },
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
      { key: 'items_especiais', text: 'Tem itens especiais ou frágeis?', type: 'choice', options: ['Piano', 'Cofre / Objetos pesados', 'Obras de arte', 'Eletrodomésticos grandes', 'Não'] },
      { key: 'embalagem', text: 'Precisa de serviço de embalagem?', type: 'choice', options: ['Sim, tudo', 'Só alguns itens', 'Não, embalo eu'] },
      { key: 'data_prevista', text: 'Data prevista para a mudança?', type: 'choice', options: ['Esta semana', 'Próximas 2 semanas', 'Este mês', 'Próximos 3 meses'] },
      { key: 'prazo', text: 'Qual a urgência?', type: 'choice', options: ['Esta semana', 'Este mês', 'Próximos 3 meses'] },
      { key: 'notas', text: 'Objetos especiais ou informações adicionais?', type: 'text', placeholder: 'Piano, cofre, obras de arte, andares...', optional: true },
    ],
  },

  Limpeza: {
    emoji: '✨',
    label: 'Limpeza',
    questions: [
      { key: 'tipo_trabalho', text: 'Que tipo de limpeza precisa?', type: 'choice', options: ['Limpeza geral', 'Limpeza pós-obra', 'Limpeza de fundo', 'Limpeza de escritório', 'Limpeza de janelas'] },
      { key: 'tipo_imovel', text: 'Tipo de imóvel?', type: 'choice', options: ['Apartamento', 'Moradia', 'Escritório', 'Espaço comercial'] },
      { key: 'area_m2', text: 'Área em m²?', type: 'number', placeholder: 'ex: 90', unit: 'm²' },
      { key: 'estado_imovel', text: 'Estado atual do imóvel?', type: 'choice', options: ['Recém construído / obra', 'Em uso (dia-a-dia)', 'Desocupado há algum tempo'] },
      { key: 'animais', text: 'Tem animais de estimação?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'produtos', text: 'Prefere produtos específicos?', type: 'choice', options: ['Produtos ecológicos', 'Qualquer produto eficaz', 'Produtos fornecidos por mim'] },
      { key: 'frequencia', text: 'Frequência do serviço?', type: 'choice', options: ['Uma vez', 'Semanal', 'Quinzenal', 'Mensal'] },
      { key: 'prazo', text: 'Quando precisa?', type: 'choice', options: ['Esta semana', 'Este mês', 'Sem pressa'] },
      { key: 'notas', text: 'Algum detalhe adicional?', type: 'text', placeholder: 'Zonas prioritárias, alergias a produtos...', optional: true },
    ],
  },

  Remodelação: {
    emoji: '🏗️',
    label: 'Remodelação',
    questions: [
      { key: 'tipo_trabalho', text: 'Que áreas vão ser remodeladas?', type: 'multiselect', options: ['Casa de banho', 'Cozinha', 'Quarto', 'Sala', 'Escritório', 'Corredor / Hall', 'Toda a habitação', 'Exterior / Terraço', 'Outro'] },
      { key: 'area_m2', text: 'Área a remodelar em m²?', type: 'number', placeholder: 'ex: 12', unit: 'm²' },
      { key: 'estado', text: 'Estado atual do espaço?', type: 'choice', options: ['Precisa de obras totais', 'Só alguns acabamentos', 'Pequenas reparações'] },
      { key: 'materiais', text: 'Os materiais já estão comprados?', type: 'choice', options: ['Sim, todos', 'Parcialmente', 'Não, preciso de ajuda a escolher'] },
      { key: 'licenca', text: 'Necessita de licença de obras?', type: 'choice', options: ['Sim', 'Não', 'Não sei'] },
      { key: 'projeto', text: 'Tem projeto de arquitetura ou design?', type: 'choice', options: ['Sim, tenho projeto', 'Tenho ideia mas não projeto', 'Preciso de ajuda a planear'] },
      { key: 'orcamento_disponivel', text: 'Orçamento disponível para a obra?', type: 'choice', options: ['Até 2.000€', '2.000€ a 10.000€', '10.000€ a 30.000€', 'Mais de 30.000€', 'Ainda não definido'] },
      { key: 'prazo', text: 'Quando precisa de começar?', type: 'choice', options: ['O mais rápido possível', 'Este mês', 'Próximos 3 meses', 'Sem pressa'] },
      { key: 'notas', text: 'Descreva o projeto', type: 'text', placeholder: 'Ex: quero remodelar a casa de banho com azulejos brancos, base de duche, bancada em pedra...', minLength: 30 },
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
    q2_divisoes: answers['divisoes'] || answers['local'] || answers['num_divisoes'] || null,
    q3_area_m2: answers['area_m2'] ? parseFloat(answers['area_m2']) : null,
    q4_cor_escura: answers['cor_escura'] === 'Sim',
    q5_fissuras: answers['fissuras'] === 'Sim',
    q6_mobilias: answers['mobilias'] === 'Sim',
    q7_primer: answers['primer'] === 'Sim',
    q8_teto: answers['teto'] === 'Sim',
    q9_prazo: answers['prazo'] === 'Esta semana' || answers['prazo']?.includes('Emergência') || answers['prazo']?.includes('Urgente')
      ? 'urgente'
      : answers['prazo'] === 'Este mês'
        ? 'normal'
        : 'sem_pressa',
    q12_notas: answers['notas'] || null,
  }
}
