'use client'

type ClientTrackEventType =
  | 'page_view'
  | 'quote_cta_click'
  | 'request_started'
  | 'whatsapp_click'
  | 'email_click'

type TrackParams = {
  event_type: ClientTrackEventType
  path: string
  professional_slug?: string
  source?: 'pessoal' | 'marketplace'
}

// Mesma leitura de referrer/UTM usada pelo track() de page_view/request_started
// — reutilizada também na submissão do pedido (/api/leads/marketplace e
// /api/leads/public), para que o evento "pedido concluído" (server-side,
// nunca passa por aqui) possa ser atribuído à mesma visita/campanha. Como o
// wizard nunca navega (é tudo estado dentro da mesma página), a query string
// e o document.referrer capturados no envio final são sempre os mesmos que
// no carregamento inicial da página.
export function currentCampaignContext(): { referrer?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string } {
  if (typeof window === 'undefined') return {}
  const search = new URLSearchParams(window.location.search)
  const ctx: { referrer?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string } = {}
  if (document.referrer) ctx.referrer = document.referrer
  const utmSource = search.get('utm_source')
  const utmMedium = search.get('utm_medium')
  const utmCampaign = search.get('utm_campaign')
  if (utmSource) ctx.utm_source = utmSource
  if (utmMedium) ctx.utm_medium = utmMedium
  if (utmCampaign) ctx.utm_campaign = utmCampaign
  return ctx
}

// Envio "fire-and-forget" — nunca deve atrasar nem interromper a navegação do
// utilizador. sendBeacon sobrevive mesmo quando a página está a ser fechada
// (ex: clique num link que navega imediatamente); fetch com keepalive é o
// fallback para navegadores sem sendBeacon.
export function track(params: TrackParams) {
  if (typeof window === 'undefined') return

  try {
    const payload: Record<string, string> = {
      event_type: params.event_type,
      path: params.path,
      ...currentCampaignContext(),
    }
    if (params.professional_slug) payload.professional_slug = params.professional_slug
    if (params.source) payload.source = params.source

    const body = JSON.stringify(payload)

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))
    } else {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // Uma falha de analítica nunca deve quebrar a experiência do utilizador.
  }
}
