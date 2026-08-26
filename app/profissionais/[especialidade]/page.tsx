import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { specialtyFromSlug } from '@/lib/specialty-slug'
import { PROFESSIONS } from '@/lib/professions'
import ProfessionalCard from '@/components/ProfessionalCard'

type Props = { params: Promise<{ especialidade: string }> }

// Página indexável por especialidade (/profissionais/[slug]) — só existe
// quando há mesmo oferta real: se a especialidade não tiver nenhum
// profissional ativo, devolve 404 (nunca uma página vazia indexável). Não
// há nenhuma combinação cidade×profissão aqui — com a quantidade atual de
// profissionais isso seria conteúdo fino/artificial; esta arquitetura só
// cresce organicamente à medida que existirem mais especialidades reais.
async function getActiveProfessionalsBySpecialty(specialty: string) {
  const { data } = await supabaseAdmin
    .from('professionals')
    .select('id, name, slug, specialty, specialties, zone, description, avatar_url, reviews(rating), professional_portfolio(id, url, type)')
    .eq('active', true)
    .or(`specialty.eq.${specialty},specialties.cs.{${specialty}}`)
  return data || []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { especialidade } = await params
  const specialty = specialtyFromSlug(especialidade)
  if (!specialty) return { title: 'Especialidade não encontrada | FaçoPorTi' }

  const professionals = await getActiveProfessionalsBySpecialty(specialty)
  if (professionals.length === 0) return { title: 'Especialidade não encontrada | FaçoPorTi' }

  const label = PROFESSIONS[specialty]?.label || specialty
  const title = `${label} em Portugal — ${professionals.length} profissional${professionals.length === 1 ? '' : 'is'} | FaçoPorTi`
  const description = `Encontre profissionais de ${label.toLowerCase()} verificados no FaçoPorTi. Peça um orçamento diretamente, sem concorrência entre profissionais.`

  return { title, description, openGraph: { title, description, type: 'website' } }
}

export default async function EspecialidadePage({ params }: Props) {
  const { especialidade } = await params
  const specialty = specialtyFromSlug(especialidade)
  if (!specialty) notFound()

  const professionals = await getActiveProfessionalsBySpecialty(specialty)
  if (professionals.length === 0) notFound()

  const label = PROFESSIONS[specialty]?.label || specialty

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${label} em Portugal`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: professionals.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `https://façoporti.com/p/${p.slug}`,
        name: p.name,
      })),
    },
  }

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/profissionais" className="text-gray-500 hover:text-gray-300 transition-colors">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-2xl font-black text-white">{PROFESSIONS[specialty]?.emoji} {label} em Portugal</h1>
          </div>
          <p className="text-gray-500 text-sm ml-7">
            {professionals.length} profissional{professionals.length === 1 ? '' : 'is'} disponível{professionals.length === 1 ? '' : 'is'}
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 grid gap-4">
        {professionals.map(prof => (
          <ProfessionalCard key={prof.id} prof={prof} />
        ))}
      </div>

      <div className="max-w-3xl mx-auto px-6 pb-10">
        <Link href="/profissionais" className="text-sm font-semibold" style={{ color: '#818cf8' }}>
          Ver todas as especialidades →
        </Link>
      </div>
    </div>
  )
}
