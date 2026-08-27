'use client'

import Link from 'next/link'
import { LayoutDashboard, Users, UserRound, FileText, CreditCard, Store, Euro, BarChart3 } from 'lucide-react'
import AdminGlobalSearch from './AdminGlobalSearch'

// Navegação partilhada do CRM administrativo — as 8 áreas aprovadas.
// Só entra aqui uma área que já tem página funcional (nunca link morto).
const TABS = [
  { key: 'visao-geral', label: 'Visão geral', href: '/admin', icon: LayoutDashboard },
  { key: 'profissionais', label: 'Profissionais', href: '/admin/profissionais', icon: Users },
  { key: 'clientes', label: 'Clientes', href: '/admin/clientes', icon: UserRound },
  { key: 'leads', label: 'Leads', href: '/admin/leads', icon: FileText },
  { key: 'subscricoes', label: 'Subscrições', href: '/admin/subscricoes', icon: CreditCard },
  { key: 'marketplace', label: 'Marketplace', href: '/admin/marketplace', icon: Store },
  { key: 'financeiro', label: 'Financeiro', href: '/admin/financeiro', icon: Euro },
  { key: 'metricas', label: 'Métricas', href: '/admin/metricas', icon: BarChart3 },
] as const

export type AdminNavKey = typeof TABS[number]['key']

export default function AdminNav({ active }: { active: AdminNavKey }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
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
      <AdminGlobalSearch />
    </div>
  )
}
