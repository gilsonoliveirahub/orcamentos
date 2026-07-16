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

// Envio "fire-and-forget" — nunca deve atrasar nem interromper a navegação do
// utilizador. sendBeacon sobrevive mesmo quando a página está a ser fechada
// (ex: clique num link que navega imediatamente); fetch com keepalive é o
// fallback para navegadores sem sendBeacon.
export function track(params: TrackParams) {
  if (typeof window === 'undefined') return

  try {
    const search = new URLSearchParams(window.location.search)
    const payload: Record<string, string> = {
      event_type: params.event_type,
      path: params.path,
    }
    if (params.professional_slug) payload.professional_slug = params.professional_slug
    if (params.source) payload.source = params.source
    if (document.referrer) payload.referrer = document.referrer
    const utmSource = search.get('utm_source')
    const utmMedium = search.get('utm_medium')
    const utmCampaign = search.get('utm_campaign')
    if (utmSource) payload.utm_source = utmSource
    if (utmMedium) payload.utm_medium = utmMedium
    if (utmCampaign) payload.utm_campaign = utmCampaign

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
