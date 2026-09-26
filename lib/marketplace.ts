import { supabaseAdmin } from '@/lib/supabase-admin'
import { geocodeZone, computeDistanceKm, formatDistanceKm } from '@/lib/geo'
import { professionalSpecialties } from '@/lib/professional-specialties'
import { notifyLeadCreated } from '@/lib/notify-lead'
import { isAcceptingLeads } from '@/lib/professional-availability'

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

  // Sem coordenadas do PRÓPRIO profissional (zona em texto livre não
  // reconhecida por lib/geo.ts), não há como confirmar o raio de 50km para
  // nenhum lead — diferente do caso de um lead antigo sem coordenadas
  // (tratado abaixo), aqui não se pode simplesmente "mostrar mesmo assim":
  // isso equivaleria a dar acesso ao país inteiro em vez dos 50km previstos.
  if (!profCoords) return []

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

    // profCoords já está garantido acima; só falta a coordenada do LEAD
    // (leads antigos sem lat/lng gravado e cuja zone_requested também não
    // geocodifica) — nesse caso mantém-se visível (correspondência por zona
    // já feita pelo filtro de specialty; não perder pedidos só por falta de
    // geocodificação do lado do lead) e assinala isso.
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
    .select('zone, accepting_leads, availability_status, available_from')
    .eq('id', professionalId)
    .maybeSingle()

  if (!prof) return { ok: false, error: 'not_found' }

  // "Disponibilidade": o profissional pode pausar-se para não adquirir mais
  // pedidos do marketplace sem ter de desativar a conta. Verificação
  // aplicacional (não dentro da transação SQL da RPC, ao contrário de
  // plano/crédito/especialidade/raio) porque não há nada de financeiro em
  // jogo aqui — o pior cenário de uma corrida rara com o toggle é adquirir
  // um pedido extra, não perder dinheiro nem duplicar cobrança.
  // isAcceptingLeads (lib/professional-availability.ts) resolve o estado
  // efetivo — 'parcial' continua a aceitar, 'indisponivel' com
  // available_from já passada volta a aceitar sozinho, e cai sempre no
  // antigo accepting_leads enquanto availability_status não existir/for null.
  if (!isAcceptingLeads(prof)) return { ok: false, error: 'unavailable' }

  // Coordenadas do profissional calculadas aqui (zona vem da própria BD,
  // nunca do cliente) e passadas à função SQL, que faz a confirmação final
  // do raio dentro da mesma transação da aquisição — impede que uma
  // chamada direta à API (fora da listagem já filtrada) adquira um lead
  // fora do raio só por saltar a UI.
  const profCoords = geocodeZone(prof.zone)

  // Zona não reconhecida: a função SQL só valida o raio quando ambas as
  // coordenadas existem (ver migration_marketplace_v3_atomic.sql), por isso
  // enviar lat/lng null faria a verificação de raio ser simplesmente
  // ignorada — na prática, dar acesso ao país inteiro a quem tem uma zona
  // não reconhecida. Bloqueado aqui, antes de chamar a RPC, para fechar essa
  // brecha sem alterar a regra de negócio dos 50km nem a função SQL.
  if (!profCoords) return { ok: false, error: 'out_of_range' }

  const { data, error } = await supabaseAdmin.rpc('acquire_marketplace_lead', {
    p_lead_id: leadId,
    p_professional_id: professionalId,
    p_radius_km: MARKETPLACE_RADIUS_KM,
    p_prof_lat: profCoords.lat,
    p_prof_lng: profCoords.lng,
  })

  if (error || !data) return { ok: false, error: 'not_found' }

  const result = data as AcquireRpcResult
  if (!result.ok) return { ok: false, error: result.error }

  // Só o profissional que adquiriu recebe a notificação completa (calcula
  // isBlocked/isFreePlan; como o plano já foi confirmado pago e o lead
  // acabou de ficar locked=false, o resultado é sempre a notificação
  // completa, nunca a redigida).
  //
  // P0 (2026-09-18): antes disto era um `fetch` à própria API sem `await` —
  // em ambiente serverless a função pode terminar assim que devolve a
  // resposta ao chamador, cancelando uma promessa pendente antes de o
  // pedido HTTP sequer sair. Chamada agora diretamente, em processo, e
  // aguardada — mesmo padrão já usado em app/api/leads/public/route.ts.
  // Uma falha aqui não deve impedir a aquisição já confirmada (o lead já
  // ficou atribuído na RPC acima); por isso o erro é apanhado e registado,
  // nunca propagado.
  try {
    await notifyLeadCreated(leadId)
  } catch (err: any) {
    console.error(`[marketplace] notificação pós-aquisição falhou (lead ${leadId}): ${err.message}`)
  }

  return { ok: true, leadId }
}
