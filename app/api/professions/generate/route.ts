import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `És um assistente que gera formulários de pedido de orçamento para profissionais portugueses.
Quando receberes o nome de uma profissão, devolve um JSON com esta estrutura exata:

{
  "emoji": "...",
  "label": "...",
  "questions": [
    {
      "key": "tipo_trabalho",
      "text": "Que tipo de trabalho precisa?",
      "type": "choice",
      "options": ["Opção 1", "Opção 2", "Opção 3"]
    }
  ],
  "price_min": 50,
  "price_max": 800
}

Regras:
- 5 a 8 perguntas, do mais geral para o mais específico
- Última pergunta sempre: { "key": "notas", "text": "Algum detalhe adicional?", "type": "text", "placeholder": "...", "optional": true }
- Penúltima pergunta sempre: { "key": "prazo", "text": "Qual a urgência?", "type": "choice", "options": ["Esta semana", "Este mês", "Próximos 3 meses", "Sem pressa"] }
- Tipos disponíveis: "choice" (escolha única), "text" (texto livre), "number" (valor numérico), "multiselect" (várias opções)
- Para "choice" e "multiselect" inclui sempre "options": [...]
- Para "number" inclui "unit" (ex: "m²", "horas")
- Para "text" inclui "placeholder"
- Chaves (key) em snake_case, sem acentos
- price_min e price_max: estimativa realista em euros para Portugal
- Devolve APENAS o JSON, sem texto adicional`

export async function POST(req: NextRequest) {
  try {
    const { specialty } = await req.json()
    if (!specialty) return NextResponse.json({ error: 'specialty obrigatório' }, { status: 400 })

    // Verifica se já existe
    const { data: existing } = await supabaseAdmin
      .from('profession_configs')
      .select('*')
      .eq('specialty', specialty)
      .maybeSingle()

    if (existing) return NextResponse.json({ config: existing.config, price_min: existing.price_min, price_max: existing.price_max, cached: true })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurado' }, { status: 500 })

    // Chama Claude para gerar as perguntas
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Profissão: ${specialty}` }],
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      return NextResponse.json({ error: `Claude API error: ${JSON.stringify(err)}` }, { status: 500 })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''

    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {
      // Tenta extrair JSON da resposta
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return NextResponse.json({ error: 'Resposta inválida do Claude' }, { status: 500 })
      parsed = JSON.parse(match[0])
    }

    const { price_min, price_max, ...config } = parsed

    // Guarda na DB
    await supabaseAdmin.from('profession_configs').insert({
      specialty,
      config,
      price_min: price_min || 80,
      price_max: price_max || 500,
    })

    return NextResponse.json({ config, price_min: price_min || 80, price_max: price_max || 500, cached: false })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
