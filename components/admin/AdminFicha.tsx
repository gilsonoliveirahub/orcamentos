import type { ReactNode } from 'react'

// Blocos de apresentação partilhados por todas as fichas administrativas
// (Profissionais, Leads, Clientes...) — só layout, sem lógica de dados.
const cardStyle = { background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.06)' }

export function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={cardStyle}>
      <h2 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2">{icon} {title}</h2>
      {children}
    </div>
  )
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm text-white font-semibold break-words">{value ?? '—'}</div>
    </div>
  )
}

export function Stat({ label, value, color = '#818cf8' }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <div className="text-xl font-black" style={{ color }}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-PT')
}

export { cardStyle }
