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
  showIf?: { key: string; value: string | string[] }
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
      { key: 'altura_paredes', text: 'Qual a altura das paredes?', type: 'choice', options: ['2.2m', '2.4m', '2.7m', '3m ou mais', 'Outro'], unit: 'm' },
      { key: 'num_quartos', text: 'Quantos quartos vão ser pintados?', type: 'choice', options: ['0', '1', '2', '3', '4 ou mais'] },
      { key: 'tem_sala', text: 'Inclui sala?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'tem_cozinha', text: 'Inclui cozinha? (normalmente só teto)', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'num_wc', text: 'Quantas casas de banho? (normalmente só teto)', type: 'choice', options: ['0', '1', '2', '3 ou mais'] },
      { key: 'tem_hall', text: 'Inclui hall / corredor?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'area_total_m2', text: 'Área total da habitação em m²? (para os tetos — coloque 0 se não incluir tetos)', type: 'number', placeholder: 'ex: 80 ou 0', unit: 'm²', optional: true },
      { key: 'cor_escura', text: 'Qual a situação da cor?', type: 'choice', options: ['Branco / Manter branco', 'Cor / Manter cor', 'Branco / Passa a cor', 'Cor / Passa a branco'] },
      { key: 'fissuras', text: 'As paredes têm fissuras ou danos?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'mobilias', text: 'Há móveis que precisem de ser movidos?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'primer', text: 'Necessita de primário / preparação de superfície?', type: 'choice', options: ['Sim', 'Não', 'Não sei'] },
      { key: 'prazo', text: 'Qual a urgência?', type: 'choice', options: ['Esta semana', 'Este mês', 'Sem pressa'] },
      { key: 'notas', text: 'Alguma observação adicional?', type: 'text', placeholder: 'Tipo de tinta, cor pretendida, acessos difíceis...', minLength: 20, optional: true },
    ],
  },

  Electricidade: {
    emoji: '⚡',
    label: 'Eletricidade',
    questions: [
      { key: 'tipo_trabalho', text: 'Que tipo de trabalho elétrico precisa?', type: 'choice', options: ['Reparação / Avaria', 'Nova instalação', 'Tomadas / Interruptores', 'Quadro elétrico', 'Iluminação', 'Outro'] },
      { key: 'num_pontos', text: 'Quantos pontos elétricos (tomadas, interruptores, luzes)?', type: 'choice', options: ['1 a 3', '4 a 10', '11 a 20', 'Mais de 20', 'Não sei'] },
      { key: 'quadro_eletrico', text: 'O quadro elétrico precisa de ser substituído?', type: 'choice', options: ['Sim', 'Não', 'Não sei'] },
      { key: 'instalacao_embutida', text: 'A instalação é embutida (dentro das paredes)?', type: 'choice', options: ['Sim, tudo embutido', 'Não, é à vista / calha', 'Misto'] },
      { key: 'certificacao', text: 'Necessita de certificação elétrica (DGEG)?', type: 'choice', options: ['Sim', 'Não', 'Não sei'] },
      { key: 'tipo_imovel', text: 'Tipo de imóvel?', type: 'choice', options: ['Habitação', 'Comércio / Escritório', 'Indústria / Armazém'] },
      { key: 'prazo', text: 'Qual a urgência?', type: 'choice', options: ['Emergência (sem luz/curto)', 'Esta semana', 'Este mês', 'Sem pressa'] },
      { key: 'notas', text: 'Descreva o trabalho necessário', type: 'text', placeholder: 'Ex: quadro elétrico a disparar constantemente, preciso de instalar 3 tomadas na sala...', minLength: 20, optional: true },
    ],
  },

  Canalização: {
    emoji: '🔧',
    label: 'Canalização',
    questions: [
      { key: 'tipo_problema', text: 'Qual o tipo de problema?', type: 'choice', options: ['Fuga de água', 'Entupimento', 'Torneira / Sanita / Autoclismo', 'Nova instalação', 'Caldeira / Aquecimento central', 'Outro'] },
      { key: 'local', text: 'Onde é o problema?', type: 'choice', options: ['Casa de banho', 'Cozinha', 'Exterior / Jardim', 'Cave / Garagem', 'Vários locais'] },
      { key: 'acesso_tubagens', text: 'As tubagens estão acessíveis ou dentro de parede/teto?', type: 'choice', options: ['Visíveis / acessíveis', 'Dentro de parede ou teto', 'Não sei'] },
      { key: 'danos_visiveis', text: 'Há danos visíveis — humidade, manchas ou inundação?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'caldeira_tipo', text: 'Que tipo de caldeira / aquecimento?', type: 'choice', options: ['Gás natural', 'GPL (botija/depósito)', 'Elétrica', 'Bomba de calor', 'Não se aplica'] },
      { key: 'prazo', text: 'Qual a urgência?', type: 'choice', options: ['Emergência (água a correr)', 'Urgente (hoje / amanhã)', 'Esta semana', 'Sem pressa'] },
      { key: 'notas', text: 'Descreva o problema', type: 'text', placeholder: 'Ex: torneira da cozinha a pingar há 2 dias, cheiro a humidade na casa de banho...', minLength: 20, optional: true },
    ],
  },

  Carpintaria: {
    emoji: '🔨',
    label: 'Carpintaria',
    questions: [
      { key: 'tipo_trabalho', text: 'Que tipo de trabalho precisa?', type: 'choice', options: ['Roupeiro / Armário por medida', 'Cozinha por medida', 'Soalho / Parquet', 'Portas / Janelas', 'Deck / Terraço', 'Móvel de casa de banho', 'Reparação', 'Outro'] },
      { key: 'largura_metros', text: 'Comprimento ou largura total (metros)?', type: 'number', placeholder: 'ex: 3.5', unit: 'm', optional: true },
      { key: 'area_m2', text: 'Área total (m²)? — para soalho ou deck', type: 'number', placeholder: 'ex: 20', unit: 'm²', optional: true },
      { key: 'material', text: 'Preferência de material?', type: 'choice', options: ['Madeira maciça', 'MDF lacado', 'MDF melamina', 'Contraplacado', 'Sem preferência'] },
      { key: 'acabamento', text: 'Acabamento pretendido?', type: 'choice', options: ['Natural / Envernizado', 'Lacado a cor (branco ou outro)', 'Oleado', 'Sem preferência'] },
      { key: 'tem_medidas', text: 'Tem as medidas definidas?', type: 'choice', options: ['Sim, tenho medidas exatas', 'Tenho ideia aproximada', 'Preciso de medição no local'] },
      { key: 'prazo', text: 'Qual a urgência?', type: 'choice', options: ['Esta semana', 'Este mês', 'Próximos 3 meses', 'Sem pressa'] },
      { key: 'notas', text: 'Descreva o que precisa', type: 'text', placeholder: 'Ex: roupeiro de 3m com portas deslizantes, interior com prateleiras e gavetas...', minLength: 20, optional: true },
    ],
  },

  Jardinagem: {
    emoji: '🌿',
    label: 'Jardinagem',
    questions: [
      { key: 'tipo_trabalho', text: 'Que serviço precisa?', type: 'choice', options: ['Corte de relva', 'Poda de árvores / arbustos', 'Limpeza e desbaste geral', 'Plantação', 'Manutenção regular (tudo incluído)', 'Outro'] },
      { key: 'area_m2', text: 'Área do jardim em m²?', type: 'number', placeholder: 'ex: 150', unit: 'm²' },
      { key: 'estado_jardim', text: 'Estado atual do jardim?', type: 'choice', options: ['Bem tratado (manutenção regular)', 'Algum crescimento (meses sem tratar)', 'Muito abandonado (mais de 1 ano)'] },
      { key: 'arvores_grandes', text: 'Tem árvores de grande porte (acima de 3m)?', type: 'choice', options: ['Não', 'Sim, 1 a 2', 'Sim, 3 ou mais'] },
      { key: 'acesso_maquinas', text: 'Há acesso para máquinas (cortador de relva)?', type: 'choice', options: ['Sim, acesso fácil', 'Não, só trabalho manual', 'Acesso difícil (degraus/rampa)'] },
      { key: 'frequencia', text: 'Frequência pretendida?', type: 'choice', options: ['Uma vez', 'Quinzenal', 'Mensal', 'A definir'] },
      { key: 'prazo', text: 'Quando precisa?', type: 'choice', options: ['Esta semana', 'Este mês', 'Sem pressa'] },
      { key: 'notas', text: 'Algum detalhe adicional?', type: 'text', placeholder: 'Ex: jardim com relva e 2 laranjeiras, portão de 1.5m de largura para a máquina...', minLength: 20, optional: true },
    ],
  },

  Mudanças: {
    emoji: '📦',
    label: 'Mudanças',
    questions: [
      { key: 'tipo_imovel', text: 'Que tipo de espaço vai mudar?', type: 'choice', options: ['T0 / T1', 'T2', 'T3', 'T4 ou maior', 'Escritório / Comércio', 'Só alguns móveis / volumes'] },
      { key: 'acesso_origem', text: 'Acesso no local de origem?', type: 'choice', options: ['Rés-do-chão', 'Com elevador', 'Sem elevador (1º ao 3º)', 'Sem elevador (4º ou superior)'] },
      { key: 'acesso_destino', text: 'Acesso no local de destino?', type: 'choice', options: ['Rés-do-chão', 'Com elevador', 'Sem elevador (1º ao 3º)', 'Sem elevador (4º ou superior)'] },
      { key: 'distancia', text: 'Distância da mudança?', type: 'choice', options: ['Mesma cidade', 'Até 50km', '50 a 150km', 'Mais de 150km'] },
      { key: 'items_especiais', text: 'Tem itens especiais ou muito pesados?', type: 'choice', options: ['Piano', 'Cofre / Objetos muito pesados', 'Obras de arte / frágeis', 'Eletrodomésticos grandes', 'Não'] },
      { key: 'embalagem', text: 'Precisa de serviço de embalagem?', type: 'choice', options: ['Sim, embale tudo', 'Só frágeis e caixas', 'Não, embalo eu'] },
      { key: 'data_mudanca', text: 'Quando é a mudança?', type: 'choice', options: ['Esta semana', 'Próximas 2 semanas', 'Este mês', 'Próximos 3 meses'] },
      { key: 'notas', text: 'Informações adicionais', type: 'text', placeholder: 'Ex: tenho piano, frigorífico americano, 3 sofás... portão de entrada com 2m de largura...', minLength: 20, optional: true },
    ],
  },

  Limpeza: {
    emoji: '✨',
    label: 'Limpeza',
    questions: [
      { key: 'tipo_limpeza', text: 'Que tipo de limpeza precisa?', type: 'choice', options: ['Limpeza geral', 'Limpeza de fundo (profunda)', 'Limpeza pós-obra', 'Limpeza de mudança (saída ou entrada)', 'Limpeza de escritório / comércio'] },
      { key: 'num_quartos', text: 'Quantos quartos?', type: 'choice', options: ['0', '1', '2', '3', '4 ou mais'] },
      { key: 'num_wc', text: 'Quantas casas de banho?', type: 'choice', options: ['1', '2', '3 ou mais'] },
      { key: 'tem_cozinha', text: 'Inclui cozinha?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'estado_imovel', text: 'Estado atual do imóvel?', type: 'choice', options: ['Normal (uso diário)', 'Muito sujo / longa ausência', 'Pós-obra (pó de obra, tinta)'] },
      { key: 'animais', text: 'Tem animais de estimação?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'frequencia', text: 'Frequência do serviço?', type: 'choice', options: ['Uma vez', 'Semanal', 'Quinzenal', 'Mensal'] },
      { key: 'prazo', text: 'Quando precisa?', type: 'choice', options: ['Esta semana', 'Este mês', 'Sem pressa'] },
      { key: 'notas', text: 'Algum detalhe adicional?', type: 'text', placeholder: 'Ex: cozinha com forno e exaustor muito sujos, alérgico a lixívia...', minLength: 20, optional: true },
    ],
  },

  Remodelação: {
    emoji: '🏗️',
    label: 'Remodelação',
    questions: [
      { key: 'divisoes', text: 'Que divisões vão ser remodeladas?', type: 'multiselect', options: ['Casa de banho', 'Cozinha', 'Quarto', 'Sala', 'Hall / Corredor', 'Exterior / Terraço', 'Toda a habitação'] },
      { key: 'area_m2', text: 'Área total a remodelar em m²?', type: 'number', placeholder: 'ex: 15', unit: 'm²' },
      { key: 'tipo_obra', text: 'Que tipo de obra é?', type: 'choice', options: ['Obras totais (demolição incluída)', 'Só acabamentos (azulejos, pintura, pavimento)', 'Pequenas reparações e melhorias'] },
      { key: 'materiais', text: 'Os materiais já estão escolhidos / comprados?', type: 'choice', options: ['Sim, já tenho tudo', 'Só alguns', 'Não, preciso de ajuda'] },
      { key: 'tem_projeto', text: 'Tem projeto ou plantas definidas?', type: 'choice', options: ['Sim, tenho projeto', 'Tenho ideia mas sem projeto', 'Preciso de ajuda a planear'] },
      { key: 'orcamento_disponivel', text: 'Orçamento disponível para a obra?', type: 'choice', options: ['Até 2.000€', '2.000€ a 5.000€', '5.000€ a 15.000€', '15.000€ a 50.000€', 'Mais de 50.000€', 'Ainda não definido'] },
      { key: 'prazo', text: 'Quando precisa de começar?', type: 'choice', options: ['O mais rápido possível', 'Este mês', 'Próximos 3 meses', 'Sem pressa'] },
      { key: 'notas', text: 'Descreva o projeto', type: 'text', placeholder: 'Ex: quero remodelar a casa de banho — nova base de duche, azulejos brancos, bancada em pedra...', minLength: 20, optional: true },
    ],
  },

  'Pavimentos de Madeira': {
    emoji: '🏡',
    label: 'Pavimentos de Madeira',
    questions: [
      { key: 'tipo_servico', text: 'Qual é o serviço pretendido?', type: 'choice', options: ['Chão flutuante novo', 'Envernizamento de madeira'] },
      { key: 'area_m2', text: 'Área total em m²?', type: 'number', placeholder: 'ex: 40', unit: 'm²' },
      { key: 'mobilias', text: 'O espaço estará vazio ou tem mobília?', type: 'choice', options: ['Vazio', 'Com mobília', 'Misto'] },
      { key: 'prazo', text: 'Quando precisa de iniciar?', type: 'choice', options: ['Esta semana', 'Este mês', 'Próximos 3 meses', 'Sem pressa'] },
      // Chão flutuante
      { key: 'pavimento_nivelado', text: 'O pavimento atual está nivelado?', type: 'choice', options: ['Sim', 'Não', 'Não sei'], showIf: { key: 'tipo_servico', value: 'Chão flutuante novo' } },
      { key: 'material_incluido', text: 'Já tem o material ou quer incluir no orçamento?', type: 'choice', options: ['Já tenho o material', 'Incluir no orçamento', 'Ainda não decidi'], showIf: { key: 'tipo_servico', value: 'Chão flutuante novo' } },
      { key: 'classe_ac', text: 'Classe de resistência pretendida?', type: 'choice', options: ['AC4 (uso doméstico intenso)', 'AC5 (uso comercial)', 'Não sei / A definir'], showIf: { key: 'tipo_servico', value: 'Chão flutuante novo' } },
      { key: 'cortar_portas', text: 'As portas precisam de ser cortadas para o novo pavimento?', type: 'choice', options: ['Sim', 'Não', 'Não sei'], showIf: { key: 'tipo_servico', value: 'Chão flutuante novo' } },
      { key: 'rodapes', text: 'Pretende rodapés novos?', type: 'choice', options: ['Sim', 'Não', 'Só alguns'], showIf: { key: 'tipo_servico', value: 'Chão flutuante novo' } },
      // Envernizamento
      { key: 'madeira_danificada', text: 'A madeira tem danos visíveis (riscos, manchas, fissuras)?', type: 'choice', options: ['Sim, bastante', 'Alguns danos', 'Está bem, só precisa de renovar'], showIf: { key: 'tipo_servico', value: 'Envernizamento de madeira' } },
      { key: 'tipo_verniz', text: 'Preferência de verniz?', type: 'choice', options: ['Água (menos cheiro, mais rápido)', 'Solvente (mais durável)', 'Sem preferência'], showIf: { key: 'tipo_servico', value: 'Envernizamento de madeira' } },
      { key: 'nivel_brilho', text: 'Nível de brilho pretendido?', type: 'choice', options: ['Mate', 'Acetinado', 'Brilhante'], showIf: { key: 'tipo_servico', value: 'Envernizamento de madeira' } },
      { key: 'manter_cor', text: 'Deseja manter a cor natural ou alterar o tom?', type: 'choice', options: ['Manter cor natural', 'Alterar o tom', 'Aguardo sugestão'], showIf: { key: 'tipo_servico', value: 'Envernizamento de madeira' } },
      { key: 'preencher_juntas', text: 'É necessário preencher as juntas entre as tábuas?', type: 'choice', options: ['Sim', 'Não', 'Não sei'], showIf: { key: 'tipo_servico', value: 'Envernizamento de madeira' } },
      { key: 'notas', text: 'Pode descrever o estado atual do chão?', type: 'text', placeholder: 'Ex: soalho de pinho com alguns riscos, última vez que foi envernizado há 10 anos...', minLength: 10, optional: true },
    ],
  },

  'Estuque e Pladur': {
    emoji: '🧱',
    label: 'Estuque e Pladur',
    questions: [
      { key: 'tipo_trabalho', text: 'Que tipo de trabalho precisa?', type: 'choice', options: ['Estuque projetado', 'Estuque tradicional', 'Pladur / Gesso cartonado', 'Regularização de paredes', 'Reparação / Correção de fissuras', 'Teto falso'] },
      { key: 'divisoes', text: 'Que espaços vão ser intervencionados?', type: 'multiselect', options: ['Quarto', 'Sala', 'Cozinha', 'Casa de banho', 'Hall / Corredor', 'Exterior', 'Todo o imóvel'] },
      { key: 'area_m2', text: 'Área total a tratar em m²?', type: 'number', placeholder: 'ex: 60', unit: 'm²' },
      { key: 'altura_paredes', text: 'Qual a altura das paredes / pé-direito?', type: 'choice', options: ['Até 2.4m', '2.4m a 3m', 'Mais de 3m', 'Não sei'] },
      { key: 'transporte_placas', text: 'Para pladur: há condições para transporte de placas?', type: 'choice', options: ['Sim, acesso fácil', 'Acesso difícil (escadas, elevador pequeno)', 'Não se aplica'] },
      { key: 'mobilias', text: 'O espaço estará vazio ou tem mobília que precise de proteção?', type: 'choice', options: ['Estará vazio', 'Tem mobília — precisa de proteção', 'Misto'] },
      { key: 'fornecimento', text: 'Pretende orçamento com material incluído ou apenas mão de obra?', type: 'choice', options: ['Material + mão de obra', 'Só mão de obra', 'Ainda não sei'] },
      { key: 'prazo', text: 'Quando precisa de começar?', type: 'choice', options: ['O mais rápido possível', 'Este mês', 'Próximos 3 meses', 'Sem pressa'] },
      { key: 'notas', text: 'Algum detalhe adicional?', type: 'text', placeholder: 'Ex: paredes com fissuras nas juntas, teto a empenar, quero teto falso em pladur com aro de luz...', minLength: 20, optional: true },
    ],
  },

  'Ar Condicionado': {
    emoji: '❄️',
    label: 'Ar Condicionado',
    questions: [
      { key: 'tipo_trabalho', text: 'Que trabalho precisa?', type: 'choice', options: ['Instalação nova', 'Substituição de equipamento existente', 'Manutenção / Limpeza', 'Reparação / Avaria'] },
      { key: 'num_unidades', text: 'Quantas unidades interiores pretende instalar?', type: 'choice', options: ['1', '2', '3', '4 ou mais', 'Ainda não sei'] },
      { key: 'tipo_espaco', text: 'Que tipo de espaço é?', type: 'choice', options: ['Quarto', 'Sala', 'Escritório / Comércio', 'Armazém / Industrial', 'Vários espaços'] },
      { key: 'bomba_condensados', text: 'Será necessário bomba de condensados (drenagem)?', type: 'choice', options: ['Sim', 'Não', 'Não sei'] },
      { key: 'tomada_proxima', text: 'O local da unidade interior tem tomada elétrica próxima?', type: 'choice', options: ['Sim', 'Não', 'Não sei'] },
      { key: 'equipamento', text: 'Já comprou o aparelho ou quer proposta com máquina incluída?', type: 'choice', options: ['Já tenho o aparelho', 'Quero proposta com máquina incluída', 'Ainda não decidi'] },
      { key: 'marca_preferencia', text: 'Tem preferência de marca?', type: 'choice', options: ['Daikin', 'Mitsubishi Electric', 'LG', 'Samsung', 'Toshiba', 'Sem preferência'] },
      { key: 'tipo_imovel', text: 'O imóvel é moradia ou apartamento?', type: 'choice', options: ['Moradia', 'Apartamento', 'Escritório / Comércio'] },
      { key: 'prazo', text: 'Qual a urgência?', type: 'choice', options: ['Esta semana', 'Este mês', 'Próximos 3 meses', 'Sem pressa'] },
      { key: 'notas', text: 'Algum detalhe adicional?', type: 'text', placeholder: 'Ex: quarto de 15m², janela a sul, sem tomada junto à parede exterior...', minLength: 20, optional: true },
    ],
  },
}

export const SPECIALTY_LIST = [
  'Pintura',
  'Remodelação',
  'Limpeza',
  'Canalização',
  'Electricidade',
  'Carpintaria',
  'Pavimentos de Madeira',
  'Estuque e Pladur',
  'Ar Condicionado',
  'Jardinagem',
  'Mudanças',
]

const GENERIC_PROFESSION: ProfessionConfig = {
  emoji: '💼',
  label: 'Outro',
  questions: [
    { key: 'tipo_trabalho', text: 'Que serviço precisa?', type: 'text', placeholder: 'Descreva brevemente o que precisa...', minLength: 10 },
    { key: 'prazo', text: 'Qual a urgência?', type: 'choice', options: ['Esta semana', 'Este mês', 'Próximos 3 meses', 'Sem pressa'] },
    { key: 'notas', text: 'Mais detalhes sobre o trabalho', type: 'text', placeholder: 'Quanto mais detalhe der, mais preciso será o orçamento...', minLength: 20, optional: true },
  ],
}

export function getProfession(specialty: string): ProfessionConfig {
  return PROFESSIONS[specialty] || GENERIC_PROFESSION
}

/** Calcula áreas de pintura a partir das divisões e altura */
export function calcPaintingAreas(answers: Record<string, any>): { area_paredes: number; area_tetos: number } {
  const heightMap: Record<string, number> = { '2.2m': 2.2, '2.4m': 2.4, '2.7m': 2.7, '3m ou mais': 3.0 }
  const height = heightMap[answers['altura_paredes']] || parseFloat(answers['altura_paredes']) || 2.4

  const quartosMap: Record<string, number> = { '0': 0, '1': 1, '2': 2, '3': 3, '4 ou mais': 4 }
  const quartos = quartosMap[answers['num_quartos']] ?? 1
  const wcMap: Record<string, number> = { '0': 0, '1': 1, '2': 2, '3 ou mais': 3 }
  const wcs = wcMap[answers['num_wc']] ?? 1

  // Perímetros médios por divisão (m) — só paredes sem azulejo
  // Cozinha e WC normalmente têm paredes azulejadas, só contam no teto
  let perimeter = quartos * 14
  if (answers['tem_sala'] === 'Sim') perimeter += 18
  if (answers['tem_hall'] === 'Sim') perimeter += 10

  const area_paredes = Math.max(Math.round(perimeter * height * 0.85), 10)
  const area_tetos = answers['area_total_m2'] ? Math.max(parseFloat(answers['area_total_m2']) || 0, 0) : 0

  return { area_paredes, area_tetos }
}

/** Mapeia as respostas para os campos legacy da tabela leads (compatibilidade) */
export function mapAnswersToLeadFields(answers: Record<string, any>) {
  const usesNewPaintingForm = !!answers['altura_paredes']
  const paintingAreas = usesNewPaintingForm ? calcPaintingAreas(answers) : null

  return {
    q1_tipo_trabalho: answers['tipo_trabalho'] || answers['tipo_imovel'] || null,
    q2_divisoes: answers['divisoes'] || answers['local'] || answers['num_divisoes'] || null,
    q3_area_m2: paintingAreas ? paintingAreas.area_paredes
              : answers['area_m2_paredes'] ? parseFloat(answers['area_m2_paredes'])
              : answers['area_m2'] ? parseFloat(answers['area_m2']) : null,
    q4_cor_escura: answers['cor_escura'] === 'Sim' || answers['cor_escura'] === 'Branco / Passa a cor' || answers['cor_escura'] === 'Cor / Passa a branco',
    q5_fissuras: answers['fissuras'] === 'Sim',
    q6_mobilias: answers['mobilias'] === 'Sim',
    q7_primer: answers['primer'] === 'Sim',
    q8_teto: paintingAreas ? paintingAreas.area_tetos > 0
           : answers['area_m2_tetos'] ? parseFloat(answers['area_m2_tetos']) > 0
           : answers['teto'] === 'Sim',
    q9_prazo: answers['prazo'] === 'Esta semana' || answers['prazo']?.includes('Emergência') || answers['prazo']?.includes('Urgente')
      ? 'urgente'
      : answers['prazo'] === 'Este mês'
        ? 'normal'
        : 'sem_pressa',
    q12_notas: answers['notas'] || null,
  }
}
