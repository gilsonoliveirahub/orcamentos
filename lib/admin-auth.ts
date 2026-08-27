import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Extraído de app/api/admin/metrics/route.ts e app/api/admin/professionals/
// [id]/route.ts (duplicado nos dois) — confirma sessão via cookies e depois
// confirma pertença a public.admins com a service role (nunca confia só na
// verificação feita no browser). Devolve o utilizador autenticado do
// Supabase Auth (não a linha de `admins`) para manter o mesmo formato que já
// era usado por essas rotas (ex: admin.id nos registos de admin_audit_log).
export async function getAuthenticatedAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: admin } = await supabaseAdmin
    .from('admins')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!admin) return null

  return user
}
