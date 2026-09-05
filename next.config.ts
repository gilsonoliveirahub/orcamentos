import type { NextConfig } from "next";

// Domínios externos realmente usados pelo browser, confirmados por grep
// antes de escrever esta política (nenhum adivinhado):
// - Supabase (lib/supabase.ts, createBrowserClient): REST direto do browser
//   em várias páginas admin/dashboard (fetch/XHR) e imagens de portfólio/
//   avatar (Supabase Storage) — precisa de connect-src e img-src.
// - Stripe: checkout/portal são sempre um redirect de página inteira
//   (window.location.href = url em app/upgrade/page.tsx), nunca stripe.js/
//   Elements carregado no browser — não precisa de nenhuma exceção de CSP.
// - Twilio: só usado server-side (lib/whatsapp.ts, fetch para api.twilio.com
//   a partir do servidor) — nunca carregado no browser, não precisa de CSP.
// - Sem Google Analytics/Tag Manager/Facebook Pixel/CDNs externos/iframes.
const SUPABASE_ORIGIN = "https://*.supabase.co";
const isDev = process.env.NODE_ENV === "development";

// CSP sem nonce, deliberadamente. Um CSP com nonce por-pedido (a forma
// "correta"/mais rígida, ver node_modules/next/dist/docs/01-app/02-guides/
// content-security-policy.md) exige renderização dinâmica em TODAS as
// páginas — a homepage, /p/[slug], /profissionais e as páginas indexáveis
// por especialidade perderiam toda a geração estática/ISR. É uma mudança de
// arquitetura com impacto direto em SEO/performance, desproporcional para
// este pacote de baixo esforço. Fica documentado como pendência (ver
// relatório) para decisão explícita futura, não implementado agora.
// script-src/style-src mantêm 'unsafe-inline' (igual ao comportamento atual,
// sem regressão) — as restantes diretivas já dão proteção real sem esse
// custo: nunca corre um script/frame de outra origem, nunca é embutido
// noutro site, formulários só submetem para o próprio domínio.
const cspDirectives = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: ${SUPABASE_ORIGIN}`,
  `font-src 'self' data:`,
  `connect-src 'self' ${SUPABASE_ORIGIN}`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'self'`,
  `upgrade-insecure-requests`,
];

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
  // 2 anos, incluindo subdomínios. Sem "preload": submeter à lista de
  // preload do browser é praticamente irreversível (propagação lenta,
  // remoção demorada) — decisão que fica para o Gilson tomar depois de
  // confirmar HTTPS válido em todos os subdomínios reais do domínio.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Mantido junto com frame-ancestors (CSP) — X-Frame-Options continua a
  // proteger browsers antigos que não leem frame-ancestors.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // geolocation=(self): usado de verdade em app/profissionais/page.tsx
  // ("Perto de mim", navigator.geolocation.getCurrentPosition) — bloquear
  // por completo quebrava essa funcionalidade real. Câmara/microfone nunca
  // são usados em lado nenhum do código, por isso ficam bloqueados.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
