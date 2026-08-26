import type { MetadataRoute } from 'next'
import { supabaseAdmin } from '@/lib/supabase-admin'

const BASE = 'https://façoporti.com'

// Páginas públicas fixas — nunca inclui /marketing (duplica a homepage,
// ver app/robots.ts) nem áreas autenticadas/privadas.
const STATIC_PAGES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }> = [
  { path: '', changeFrequency: 'weekly', priority: 1 },
  { path: '/pedir', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/profissionais', changeFrequency: 'daily', priority: 0.8 },
  { path: '/comecar', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/juntar', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/sobre', changeFrequency: 'monthly', priority: 0.4 },
  { path: '/contactos', changeFrequency: 'monthly', priority: 0.4 },
  { path: '/privacidade', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/termos', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/cookies', changeFrequency: 'yearly', priority: 0.2 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map(p => ({
    url: `${BASE}${p.path}`,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }))

  // Cada profissional ativo com slug é uma página pública real e única
  // (perfil, portfólio, reviews) — exatamente o tipo de conteúdo indexável
  // que vale a pena listar, sem gerar nenhuma página artificial.
  //
  // Sem lastModified: schema.sql declara `professionals.updated_at`, mas
  // essa coluna não existe de facto na base de produção (confirmado ao
  // vivo — schema.sql está desatualizado face à produção real, problema
  // pré-existente e fora do âmbito deste tópico). Selecionar essa coluna
  // fazia a query inteira falhar (42703) e o sitemap ficava silenciosamente
  // sem nenhum profissional, sem erro visível.
  const { data: professionals } = await supabaseAdmin
    .from('professionals')
    .select('slug')
    .eq('active', true)
    .not('slug', 'is', null)

  const professionalEntries: MetadataRoute.Sitemap = (professionals || []).map(p => ({
    url: `${BASE}/p/${p.slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...staticEntries, ...professionalEntries]
}
