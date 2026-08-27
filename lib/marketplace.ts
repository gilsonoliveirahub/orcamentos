import { supabaseAdmin } from '@/lib/supabase-admin'
import { geocodeZone, computeDistanceKm, formatDistanceKm } from '@/lib/geo'
import { professionalSpecialties } from '@/lib/professional-specialties'

export const MARKETPLACE_RADIUS_KM = 50

export type MarketplaceOpportunity = {
  id: string
  specialty: string
  zone_requested: string | null
  created_at: string
  distance_km: number | null
  distance_label: string // "aproximadamente 18 km" ou "distância indisponível"
}

/**
 * Lista as oportunidades do marketplace visíveis para um profissional:
 * mesma especialidade, sem dono (professional_id null), dentro de ~50km
 * (ou sem distância disponível — nunca esconde um lead só por falta de
 * coordenadas, mostra "distância indisponível" e deixa entrar).
 * Devolve só o resumo — nunca nome/telefone/email/notas do cliente.
 */
export async function listMarketplaceOpportunities(professionalId: string): Promise<MarketplaceOpportunity[]> {
  const { data: prof } = await supabaseAdmin
    .from('professionals')
    .select('specialty, specialties, zone')
    .eq('id', professionalId)
    .single()

  if (!prof) return []

  const specialties = professionalSpecialties(prof)
  if (specialties.length === 0) return []

  const profCoords = geocodeZone(prof.zone)

  const { data: leads } = await supabaseAdmin
    .from('leads')
    .select('id, specialty, zone_requested, created_at, lat, lng')
    .is('professional_id', null)
    .eq('source', 'marketplace')
    .in('specialty', specialties)
    .order('created_at', { ascending: false })

  if (!leads) return []

  const withinRadius: MarketplaceOpportunity[] = []
  for (const lead of leads) {
    const leadCoords = lead.lat != null && lead.lng != null
      ? { lat: lead.lat, lng: lead.lng }
      : geocodeZone(lead.zone_requested) // fallback para leads antigos sem lat/lng gravado

    const distanceKm = computeDistanceKm(profCoords, leadCoords)

    // Sem coordenadas de um dos dois lados: fallback — mantém visível
    // (correspondência por zona já feita pelo filtro de specialty; não
    // perder pedidos só por falta de geocodificação) e assinala isso.
    if (distanceKm === null) {
      withinRadius.push({
        id: lead.id,
        specialty: lead.specialty,
        zone_requested: lead.zone_requested,
        created_at: lead.created_at,
        distance_km: null,
        distance_label: 'distância indisponível',
      })
      continue
    }

    if (distanceKm <= MARKETPLACE_RADIUS_KM) {
      withinRadius.push({
        id: lead.id,
        specialty: lead.specialty,
        zone_requested: lead.zone_requested,
        created_at: lead.created_at,
        distance_km: distanceKm,
        distance_label: formatDistanceKm(distanceKm),
      })
    }
  }

  // Mais próximo primeiro — hoje a lista só saía ordenada por data (mais
  // recente primeiro), apesar da distância já estar calculada. Ordenar por
  // proximidade aproxima o pedido do profissional mais adequado sem exigir
  // nenhuma estrutura nova. Distância indisponível fica sempre no fim (não
  // se sabe se está perto ou longe); em caso de empate, mantém-se o mais
  // recente primeiro.
  withinRadius.sort((a, b) => {
    if (a.distance_km === null && b.distance_km === null) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (a.distance_km === null) return 1
    if (b.distance_km === null) return -1
    if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return withinRadius
}

export type AcquireResult =
  | { ok: true; leadId: string }
  | { ok: false; error: 'plan' | 'credits' | 'taken' | 'not_found' | 'specialty' | 'out_of_range' | 'unavailable' }

type AcquireRpcResult = { ok: true } | { ok: false; error: 'plan' | 'credits' | 'taken' | 'not_found' | 'specialty' | 'out_of_range' }

/**
 * Aquisição atómica de uma oportunidade do marketplace — tudo (confirmar
 * plano/crédito/especialidade/raio, descontar o crédito e associar o lead)
 * acontece numa única transação da função SQL acquire_marketplace_lead(),
 * nunca em passos separados a partir da aplicação. Ou conclui tudo, ou não
 * altera nada — por isso não existe (nem pode existir) lógica de reembolso
 * aqui: nunca há cobrança antes de a transação confirmar que a aquisição é
 * válida, mesmo com dois profissionais a disputar o mesmo lead ao mesmo
 * tempo (ver comentário da função em supabase/migration_marketplace_v3_atomic.sql).
 */
export async function acquireMarketplaceLead(params: { leadId: string; professionalId: string }): Promise<AcquireResult> {
  const { leadId, professionalId } = params

  const { data: prof } = await supabaseAdmin
    .from('professionals')
    .select('zone, accepting_leads')
    .eq('id', professionalId)
    .maybeSingle()

  if (!prof) return { ok: false, error: 'not_found' }

  // "Disponibilidade": o profissional pode pausar-se para não adquirir mais
  // pedidos do marketplace sem ter de desativar a conta. Verificação
  // aplicacional (não dentro da transação SQL da RPC, ao contrário de
  // plano/crédito/especialidade/raio) porque não há nada de financeiro em
  // jogo aqui — o pior cenário de uma corrida rara com o toggle é adquirir
  // um pedido extra, não perder dinheiro nem duplicar cobrança.
  // === false é deliberado: coluna ausente (undefined, antes da migração
  // ser aplicada) ou nunca definida conta sempre como "disponível".
  if (prof.accepting_leads === false) return { ok: false, error: 'unavailable' }

  // Coordenadas do profissional calculadas aqui (zona vem da própria BD,
  // nunca do cliente) e passadas à função SQL, que faz a confirmação final
  // do raio dentro da mesma transação da aquisição — impede que uma
  // chamada direta à API (fora da listagem já filtrada) adquira um lead
  // fora do raio só por saltar a UI.
  const profCoords = geocodeZone(prof.zone)

  const { data, error } = await supabaseAdmin.rpc('acquire_marketplace_lead', {
    p_lead_id: leadId,
    p_professional_id: professionalId,
    p_radius_km: MARKETPLACE_RADIUS_KM,
    p_prof_lat: profCoords?.lat ?? null,
    p_prof_lng: profCoords?.lng ?? null,
  })

  if (error || !data) return { ok: false, error: 'not_found' }

  const result = data as AcquireRpcResult
  if (!result.ok) return { ok: false, error: result.error }

  // Só o profissional que adquiriu recebe a notificação completa — reutiliza
  // a mesma rota já usada quando um lead era atribuído automaticamente
  // (calcula isBlocked/isFreePlan; como o plano já foi confirmado pago e o
  // lead acabou de ficar locked=false, o resultado é sempre a notificação
  // completa, nunca a redigida).
  fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'}/api/notifications/lead`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_id: leadId }),
  }).catch(() => {})

  return { ok: true, leadId }
}
