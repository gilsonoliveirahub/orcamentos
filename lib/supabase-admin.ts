import { createClient } from '@supabase/supabase-js'

// Cliente com service role — bypassa RLS completamente
// Usado apenas em API routes (servidor), nunca exposto ao browser
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
