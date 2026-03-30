import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import MarketingPage from './marketing/page'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: prof } = await supabase.from('professionals').select('id').eq('user_id', user.id).maybeSingle()
    if (prof) redirect('/dashboard')
    redirect('/cliente/dashboard')
  }

  return <MarketingPage />
}
