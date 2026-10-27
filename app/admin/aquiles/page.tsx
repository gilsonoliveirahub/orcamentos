'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Shield, Loader2, Check, X, AlertCircle } from 'lucide-react'
import AdminNav from '@/components/admin/AdminNav'
import { cardStyle } from '@/components/admin/AdminFicha'

type AquilesAction = {
  id: string
  action_type: 'delete_permanent' | 'money_movement' | 'security_access_change' | 'publish_deploy' | 'other_sensitive'
  summary: string
  payload: Record<string, unknown>
  requested_by: string
  status: 'pending' | 'approved' | 'rejected' | 'consumed' | 'executed' | 'failed'
  requested_at: string
  decided_at: string | null
  decision_note: string | null
  expires_at: string | null
  consumed_at: string | null
  executed_at: string | null
}

const ACTION_TYPE_LABELS: Record<AquilesAction['action_type'], string> = {
  delete_permanent: 'Apagar definitivamente',
  money_movement: 'Movimento de dinheiro',
  security_access_change: 'Alteração de acessos de segurança',
  publish_deploy: 'Commit / push / deploy',
  other_sensitive: 'Outra ação sensível',
}

const STATUS_COLOR: Record<AquilesAction['status'], string> = {
  pending: '#fbbf24',
  approved: '#60a5fa',
  rejected: '#f87171',
  consumed: '#a78bfa',
  executed: '#34d399',
  failed: '#f87171',
}

function isExpired(action: AquilesAction) {
  return action.status === 'approved' && !!action.expires_at && new Date(action.expires_at) <= new Date()
}

type CapabilityPreview = {
  capability_id: string
  found: boolean
  not_found_reason?: string
  target_summary: string
  changes: Array<{ field: string; before: unknown; after: unknown }>
  effects: Array<{ label: string }>
  blocked: boolean
  blocked_reason?: string
}

// Recalculado no servidor a partir do payload gravado (nunca o texto livre
// do Aquiles) — ver app/api/admin/aquiles-actions/[id]/preview/route.ts.
function usePreview(actionId: string) {
  const [preview, setPreview] = useState<CapabilityPreview | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/admin/aquiles-actions/${actionId}/preview`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao calcular preview')
        setPreview(json.preview)
        setReason(json.reason || null)
      })
      .catch(() => setReason('Falha ao calcular preview'))
      .finally(() => setLoading(false))
  }, [actionId])

  return { preview, reason, loading }
}

function PreviewBlock({ preview, reason, loading }: { preview: CapabilityPreview | null; reason: string | null; loading: boolean }) {
  if (loading) return <p className="text-xs text-gray-500 mt-2">A calcular preview…</p>
  if (!preview) return reason ? <p className="text-xs text-gray-500 mt-2">{reason}</p> : null

  return (
    <div className="mt-3 p-3 rounded" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <p className="text-sm text-gray-200 font-medium">{preview.target_summary}</p>
      {preview.changes.length > 0 && (
        <div className="mt-2 space-y-1">
          {preview.changes.map((c, i) => (
            <p key={i} className="text-xs text-gray-400">
              <span className="text-gray-500">{c.field}:</span> {JSON.stringify(c.before)} → <span className="text-indigo-300">{JSON.stringify(c.after)}</span>
            </p>
          ))}
        </div>
      )}
      {preview.effects.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {preview.effects.map((e, i) => (
            <li key={i} className="text-xs text-gray-400">• {e.label}</li>
          ))}
        </ul>
      )}
      {preview.blocked && (
        <p className="mt-2 text-xs font-medium" style={{ color: '#f87171' }}>⚠ Bloqueado: {preview.blocked_reason || preview.not_found_reason}</p>
      )}
    </div>
  )
}

function PendingActionCard({ action, deciding, onDecide }: { action: AquilesAction; deciding: boolean; onDecide: (id: string, decision: 'approved' | 'rejected') => void }) {
  const isCapabilityBased = typeof action.payload?.capability_id === 'string'
  const { preview, reason, loading } = usePreview(action.id)
  // Sem capability_id no payload (ex: o teste genérico sem capacidade real
  // ligada) não há preview para calcular — nunca bloqueia a aprovação só
  // por isso, é um pedido válido de um tipo diferente.
  const blockedByPreview = isCapabilityBased && !!preview?.blocked

  return (
    <div className="p-4 rounded" style={cardStyle}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.15)', color: STATUS_COLOR.pending }}>
            {ACTION_TYPE_LABELS[action.action_type]}
          </span>
          <p className="text-white mt-2">{action.summary}</p>
          <p className="text-xs text-gray-500 mt-1">
            Pedido por {action.requested_by} em {new Date(action.requested_at).toLocaleString('pt-PT')}
          </p>
          {isCapabilityBased ? (
            <PreviewBlock preview={preview} reason={reason} loading={loading} />
          ) : (
            Object.keys(action.payload || {}).length > 0 && (
              <pre className="text-xs text-gray-500 mt-2 whitespace-pre-wrap">{JSON.stringify(action.payload, null, 2)}</pre>
            )
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => onDecide(action.id, 'approved')}
            disabled={deciding || blockedByPreview}
            title={blockedByPreview ? preview?.blocked_reason : undefined}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-50"
            style={{ background: '#16a34a' }}
          >
            <Check size={14} /> Aprovar
          </button>
          <button
            onClick={() => onDecide(action.id, 'rejected')}
            disabled={deciding}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-50"
            style={{ background: '#dc2626' }}
          >
            <X size={14} /> Rejeitar
          </button>
        </div>
      </div>
    </div>
  )
}

// Única superfície humana de aprovação de todo o sistema — ver
// app/api/admin/aquiles-actions/[id]/decide/route.ts. O token do Aquiles
// nunca chega aqui; esta página só funciona com a mesma sessão admin usada
// no resto do painel.
export default function AdminAquilesPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()
  const [actions, setActions] = useState<AquilesAction[]>([])
  const [error, setError] = useState('')
  const [deciding, setDeciding] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/admin/login'); return }
      const { data: admin } = await supabase.from('admins').select('id').eq('user_id', user.id).maybeSingle()
      if (!admin) { router.push('/dashboard'); return }
      setChecking(false)
    })
  }, [router])

  const load = useCallback(() => {
    startTransition(() => { setLoading(true); setError('') })
    fetch('/api/admin/aquiles-actions')
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao carregar pedidos')
        setActions(json.actions || [])
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar pedidos'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (checking) return
    load()
  }, [checking, load])

  async function decide(id: string, decision: 'approved' | 'rejected') {
    setDeciding(id)
    try {
      const res = await fetch(`/api/admin/aquiles-actions/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao decidir')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao decidir')
    } finally {
      setDeciding(null)
    }
  }

  if (checking || loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  )

  const pending = actions.filter(a => a.status === 'pending')
  const decided = actions.filter(a => a.status !== 'pending')

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <AdminNav active="aquiles" />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="text-indigo-400" size={24} />
          <h1 className="text-xl font-semibold text-white">Aprovações do Aquiles</h1>
        </div>

        {error && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded text-red-300 text-sm" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <h2 className="text-sm font-medium text-gray-400 mb-2">Pendentes ({pending.length})</h2>
        <div className="space-y-3 mb-8">
          {pending.length === 0 && <p className="text-sm text-gray-500">Sem pedidos pendentes.</p>}
          {pending.map(action => (
            <PendingActionCard key={action.id} action={action} deciding={deciding === action.id} onDecide={decide} />
          ))}
        </div>

        <h2 className="text-sm font-medium text-gray-400 mb-2">Histórico</h2>
        <div className="space-y-2">
          {decided.map(action => (
            <div key={action.id} className="p-3 rounded flex items-center justify-between" style={cardStyle}>
              <div>
                <span className="text-xs font-medium" style={{ color: STATUS_COLOR[action.status] }}>
                  {action.status}{isExpired(action) ? ' · expirada' : ''}
                </span>
                <span className="text-sm text-gray-300 ml-2">{action.summary}</span>
              </div>
              <span className="text-xs text-gray-500">{ACTION_TYPE_LABELS[action.action_type]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
