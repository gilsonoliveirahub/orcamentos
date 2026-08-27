'use client'

import Link from 'next/link'
import { LayoutDashboard, Users, BarChart3 } from 'lucide-react'

// Navegação partilhada do CRM administrativo. Só lista separadores já
// funcionais — as restantes áreas aprovadas (Clientes, Leads, Subscrições,
// Marketplace, Financeiro) entram aqui à medida que forem implementadas,
// nunca como link morto/página vazia.
const TABS = [
  { key: 'visao-geral', label: 'Visão geral', href: '/admin', icon: LayoutDashboard },
  { key: 'profissionais', label: 'Profissionais', href: '/admin/profissionais', icon: Users },
  { key: 'metricas', label: 'Métricas', href: '/admin/metricas', icon: BarChart3 },
] as const

export type AdminNavKey = typeof TABS[number]['key']

export default function AdminNav({ active }: { active: AdminNavKey }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {TABS.map(tab => {
        const Icon = tab.icon
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
            style={isActive
              ? { background: 'rgba(129,140,248,0.15)', color: '#818cf8' }
              : { color: '#64748b' }}
          >
            <Icon size={14} /> {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
