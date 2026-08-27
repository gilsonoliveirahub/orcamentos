import { MapPin, Briefcase, Star, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { PROFESSIONS } from '@/lib/professions'

// Extraído de app/profissionais/page.tsx (era local, ProfCard) para ser
// reutilizável também pelas páginas de especialidade
// (app/profissionais/[especialidade]/page.tsx) — mesma apresentação, sem
// nenhuma alteração de lógica.
// distanceLabel: rótulo aproximado já formatado (ex: "aproximadamente 5
// km", ver lib/geo.ts formatDistanceKm) — nunca coordenadas nem distância
// exata. Opcional: só definido quando a página tem localização do cliente
// (ver app/profissionais/page.tsx, "Perto de mim").
export default function ProfessionalCard({ prof, distanceLabel }: { prof: any; distanceLabel?: string }) {
  const emoji = PROFESSIONS[prof.specialty]?.emoji || '🔧'
  const reviews: any[] = prof.reviews || []
  const portfolio: any[] = prof.professional_portfolio || []

  const avgRating = reviews.length > 0
    ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length
    : null

  const photoItems = portfolio.filter((p: any) => !p.type || p.type === 'image')
  const thumbs = photoItems.slice(0, 3)

  return (
    <Link
      href={`/p/${prof.slug}`}
      className="block rounded-2xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-xl"
      style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
    >
      <div className="p-5">
        <div className="flex items-start gap-4">

          {/* Avatar */}
          {prof.avatar_url ? (
            <img
              src={prof.avatar_url}
              alt={prof.name}
              className="w-16 h-16 rounded-2xl object-cover flex-shrink-0"
              style={{ border: '2px solid rgba(99,102,241,0.3)' }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 font-black text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              {emoji}
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-black text-white text-lg leading-tight">{prof.name}</h3>
              {avgRating !== null && (
                <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                  <Star size={13} className="text-amber-400" fill="currentColor" />
                  <span className="text-sm font-bold text-amber-400">{avgRating.toFixed(1)}</span>
                  <span className="text-xs text-gray-600">({reviews.length})</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}
              >
                <Briefcase size={10} /> {prof.specialty}
              </span>
              {prof.zone && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <MapPin size={10} /> {prof.zone}
                </span>
              )}
              {distanceLabel && (
                <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#34d399' }}>
                  <MapPin size={10} /> {distanceLabel}
                </span>
              )}
            </div>

            {(prof.description || prof.bio) && (
              <p className="text-xs text-gray-500 mt-2 line-clamp-2 leading-relaxed">
                {prof.description || prof.bio}
              </p>
            )}
          </div>
        </div>

        {/* Thumbnails do portfólio */}
        {thumbs.length > 0 && (
          <div className="flex gap-2 mt-4">
            {thumbs.map((item: any) => (
              <div
                key={item.id}
                className="h-16 rounded-xl overflow-hidden flex-1"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
            {portfolio.length > 3 && (
              <div
                className="h-16 rounded-xl flex items-center justify-center flex-shrink-0 w-12"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
              >
                <span className="text-xs font-bold text-indigo-400">+{portfolio.length - 3}</span>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <div
          className="flex items-center justify-center gap-2 w-full mt-4 py-3 rounded-xl font-bold text-white text-sm"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.25)' }}
        >
          Ver perfil & Pedir Orçamento <ChevronRight size={16} />
        </div>
      </div>
    </Link>
  )
}
