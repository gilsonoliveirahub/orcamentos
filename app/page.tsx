import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import MarketingPage from './marketing/page'
import { HOMEPAGE_FAQ } from '@/lib/homepage-faq'

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: HOMEPAGE_FAQ.map(item => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
}

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: prof } = await supabase.from('professionals').select('id').eq('user_id', user.id).maybeSingle()
    if (prof) redirect('/dashboard')
    redirect('/cliente/dashboard')
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <MarketingPage />
    </>
  )
}
