export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Campos que um admin tem permissão para alterar no perfil de outro
// profissional. Nunca inclui email (login), password, user_id, nem
// nada relacionado com Stripe/subscrições.
const EDITABLE_FIELDS = ['name', 'phone', 'specialties', 'zone', 'description', 'active'] as const
type EditableField = typeof EDITABLE_FIELDS[number]

async function getAuthenticatedAdmin() {
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Corpo do pedido inválido' }, { status: 400 })
  }

  const updates: Partial<Record<EditableField, unknown>> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) updates[field] = (body as Record<string, unknown>)[field]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 })
  }

  const selectFields = EDITABLE_FIELDS.join(',')

  const { data: before, error: beforeError } = await supabaseAdmin
    .from('professionals')
    .select(selectFields)
    .eq('id', id)
    .single()

  if (beforeError || !before) {
    return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })
  }

  const { data: after, error: updateError } = await supabaseAdmin
    .from('professionals')
    .update(updates)
    .eq('id', id)
    .select(selectFields)
    .single()

  if (updateError || !after) {
    return NextResponse.json({ error: updateError?.message || 'Falha ao atualizar' }, { status: 500 })
  }

  const beforeRecord = before as unknown as Record<string, unknown>
  const afterRecord = after as unknown as Record<string, unknown>
  const changes: Record<string, { before: unknown; after: unknown }> = {}
  for (const field of Object.keys(updates)) {
    changes[field] = { before: beforeRecord[field], after: afterRecord[field] }
  }

  const { error: auditError } = await supabaseAdmin.from('admin_audit_log').insert({
    admin_id: admin.id,
    professional_id: id,
    changes,
  })
  if (auditError) {
    console.error(`[admin/professionals] falha ao registar auditoria (admin ${admin.id}, profissional ${id}): ${auditError.message}`)
  }

  return NextResponse.json({ professional: after })
}
