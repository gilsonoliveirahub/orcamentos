'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2 } from 'lucide-react'

type SearchResults = {
  professionals: Array<{ id: string; name: string; email: string | null }>
  clients: Array<{ phone: string; name: string | null; email: string | null }>
  leads: Array<{ id: string; name: string | null; phone: string | null; status: string | null }>
}

const EMPTY: SearchResults = { professionals: [], clients: [], leads: [] }

// Pesquisa administrativa global (profissional/cliente/email/telefone/lead)
// — embutida na navegação para estar disponível em todas as páginas do CRM
// sem duplicar este componente em cada uma.
export default function AdminGlobalSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResults>(EMPTY)
  const boxRef = useRef<HTMLDivElement>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (q.trim().length < 2) { startTransition(() => setResults(EMPTY)); return }
    const timer = setTimeout(() => {
      setLoading(true)
      fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`)
        .then(res => res.ok ? res.json() : EMPTY)
        .then(setResults)
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  const hasResults = results.professionals.length > 0 || results.clients.length > 0 || results.leads.length > 0

  function go(path: string) {
    setOpen(false)
    setQ('')
    router.push(path)
  }

  return (
    <div className="relative ml-auto" ref={boxRef}>
      <div className="relative w-48 sm:w-64">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Pesquisar..."
          className="w-full bg-transparent border rounded-lg pl-8 pr-2 py-1.5 text-xs text-white focus:outline-none"
          style={{ borderColor: 'rgba(255,255,255,0.1)' }}
        />
        {loading && <Loader2 size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />}
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 mt-1 w-72 rounded-xl overflow-hidden z-50 max-h-96 overflow-y-auto"
          style={{ background: '#0d0f1e', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {!loading && !hasResults && <p className="text-xs text-gray-500 p-3">Sem resultados.</p>}

          {results.professionals.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 px-3 pt-2 pb-1 uppercase tracking-wide">Profissionais</p>
              {results.professionals.map(p => (
                <button key={p.id} onClick={() => go(`/admin/profissionais/${p.id}`)} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/5">
                  {p.name} <span className="text-xs text-gray-500">{p.email}</span>
                </button>
              ))}
            </div>
          )}

          {results.clients.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 px-3 pt-2 pb-1 uppercase tracking-wide">Clientes</p>
              {results.clients.map(c => (
                <button key={c.phone} onClick={() => go(`/admin/clientes/${encodeURIComponent(c.phone)}`)} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/5">
                  {c.name || 'Sem nome'} <span className="text-xs text-gray-500">{c.phone}</span>
                </button>
              ))}
            </div>
          )}

          {results.leads.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 px-3 pt-2 pb-1 uppercase tracking-wide">Leads</p>
              {results.leads.map(l => (
                <button key={l.id} onClick={() => go(`/admin/leads/${l.id}`)} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/5">
                  {l.name || 'Sem nome'} <span className="text-xs text-gray-500">{l.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
