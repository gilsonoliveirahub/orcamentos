import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { professionalTitle, professionalDescription, professionalJsonLd } from '@/lib/professional-seo'
import ProfessionalProfileClient from './ProfessionalProfileClient'

type Props = { params: Promise<{ slug: string }> }

// Perfil público de cada profissional (link exclusivo, sem concorrência) —
// a página em si continua inteiramente client-side (ProfessionalProfileClient,
// cópia fiel do que já existia, comportamento intocado) porque tem lógica
// interativa própria (wizard de pedido, lightbox, tracking). O que faltava
// era metadata única por profissional e dados estruturados — hoje qualquer
// página de perfil usava sempre o título/descrição genéricos do site
// inteiro, e um crawler que não executa JS via só uma casca vazia.
async function getPublicProfessional(slug: string) {
  const { data } = await supabaseAdmin
    .from('professionals')
    .select('id, name, specialty, specialties, zone, description, avatar_url')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle()
  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const prof = await getPublicProfessional(slug)

  if (!prof) {
    return { title: 'Profissional não encontrado | FaçoPorTi' }
  }

  const title = professionalTitle(prof)
  const description = professionalDescription(prof)

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
      images: prof.avatar_url ? [prof.avatar_url] : undefined,
    },
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const prof = await getPublicProfessional(slug)

  let jsonLd: Record<string, unknown> | null = null
  if (prof) {
    const { data: reviews } = await supabaseAdmin
      .from('reviews')
      .select('rating')
      .eq('professional_id', prof.id)

    const ratings = (reviews || []).map(r => r.rating).filter((r): r is number => typeof r === 'number')
    jsonLd = professionalJsonLd(prof, ratings)
  }

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <ProfessionalProfileClient />
    </>
  )
}
