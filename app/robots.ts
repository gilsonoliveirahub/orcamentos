import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = 'https://façoporti.com'
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Áreas privadas/autenticadas e rotas de API — nunca fazem sentido
        // indexadas, e um crawler a percorrê-las não traz valor nenhum.
        // Lista alinhada com PROTECTED em proxy.ts (2026-09-05: confirmados
        // e corrigidos 3 caminhos que existiam como página real e protegida
        // por proxy.ts mas faltavam aqui — /config, /onboarding, /conta).
        disallow: [
          '/dashboard', '/leads/', '/perfil', '/stats', '/admin', '/api/', '/quotes/',
          '/cliente/dashboard', '/acordos', '/marketplace', '/creditos', '/upgrade',
          '/config', '/onboarding', '/conta',
          // /marketing é o mesmo componente que a homepage (/) — impedir
          // indexação para não criar conteúdo duplicado.
          '/marketing',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
