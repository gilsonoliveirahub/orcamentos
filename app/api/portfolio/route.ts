import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

async function getAuthenticatedProfessional() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: prof } = await supabaseAdmin
    .from('professionals')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  return prof
}

// POST — upload de ficheiro + guardar na DB
export async function POST(req: NextRequest) {
  const prof = await getAuthenticatedProfessional()
  if (!prof) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Ficheiro em falta' }, { status: 400 })

  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')
  if (!isImage && !isVideo) return NextResponse.json({ error: 'Tipo de ficheiro inválido' }, { status: 400 })
  if (file.size > 100 * 1024 * 1024) return NextResponse.json({ error: 'Ficheiro demasiado grande (máx 100MB)' }, { status: 400 })

  const uploadType = form.get('type') as string | null
  const ext = file.name.split('.').pop()
  const folder = uploadType === 'avatar' ? 'avatars' : 'portfolio'
  const path = `${folder}/${prof.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const bytes = await file.arrayBuffer()
  const { data: storageData, error: storageError } = await supabaseAdmin.storage
    .from('lead-media')
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (storageError) return NextResponse.json({ error: `Storage: ${storageError.message}` }, { status: 500 })

  const { data: { publicUrl } } = supabaseAdmin.storage.from('lead-media').getPublicUrl(storageData.path)

  // Avatar: devolve só a URL, sem inserir na tabela portfolio
  if (uploadType === 'avatar') {
    return NextResponse.json({ item: { url: publicUrl } })
  }

  const sortOrder = parseInt(form.get('sort_order') as string || '0')
  const { data: item, error: dbError } = await supabaseAdmin
    .from('professional_portfolio')
    .insert({ professional_id: prof.id, url: publicUrl, type: isVideo ? 'video' : 'image', sort_order: sortOrder })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: `DB: ${dbError.message}` }, { status: 500 })

  return NextResponse.json({ item })
}

// DELETE — eliminar item do portfólio
export async function DELETE(req: NextRequest) {
  const prof = await getAuthenticatedProfessional()
  if (!prof) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID em falta' }, { status: 400 })

  const { data: item } = await supabaseAdmin
    .from('professional_portfolio')
    .select('professional_id, url')
    .eq('id', id)
    .single()

  if (!item || item.professional_id !== prof.id)
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  await supabaseAdmin.from('professional_portfolio').delete().eq('id', id)

  return NextResponse.json({ ok: true })
}
