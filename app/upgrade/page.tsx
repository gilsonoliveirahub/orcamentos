'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { CheckCircle, ArrowLeft, Crown, Zap, Info, ShieldCheck } from 'lucide-react'
import { isActivePlanCycle, type ActiveSubscriptionStatus, type SimplifiedSubscriptionStatus } from '@/lib/stripe-plans'

export default function UpgradePage() {
  const router = useRouter()
  const [professional, setProfessional] = useState<any>(null)
  const [subStatus, setSubStatus] = useState<ActiveSubscriptionStatus & { status?: SimplifiedSubscriptionStatus } | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState<string | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)
  // P5 (2026-09-19): seletor mensal/anual — só decide qual "cycle" vai no
  // pedido a /api/stripe/checkout; o Price ID real é sempre resolvido no
  // servidor (lib/stripe-plans.ts), nunca enviado a partir daqui.
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly')

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const success = searchParams?.get('success') === '1'

  async function loadSubscriptionStatus() {
    // GET sem parâmetros de propósito — o servidor resolve o profissional só
    // pela sessão autenticada (ver app/api/stripe/subscription-status),
    // nunca a partir de um id enviado a partir daqui.
    const res = await fetch('/api/stripe/subscription-status')
    const json = await res.json().catch(() => null)
    if (json && !json.error) setSubStatus(json)
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('professionals').select('*').eq('user_id', user.id).maybeSingle()
      if (!data) { router.push('/login'); return }
      setProfessional(data)
      // Bug corrigido em 2026-09-19: o cartão "Plano atual" decidia isto só
      // pelo tier (professional.plan) — nunca distinguia mensal de anual.
      // Aguarda esta leitura ao Stripe antes de tirar o loading, para nunca
      // desenhar a página uma vez com o estado errado e "saltar" logo a
      // seguir.
      await loadSubscriptionStatus()
      setLoading(false)
    })
  }, [router])

  const handlePortal = async () => {
    setOpeningPortal(true)
    const res = await fetch('/api/stripe/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professional_id: professional.id }),
    })
    const { url, error } = await res.json()
    if (url) window.location.href = url
    else { alert(error || 'Erro ao abrir portal'); setOpeningPortal(false) }
  }

  const handleCheckout = async (plan: 'starter' | 'pro') => {
    // Acesso administrativo (2026-09-19) — esta conta tem funcionalidades
    // Pro/Starter concedidas sem cobrança (ver "O meu plano" em /perfil).
    // Continuar aqui cria uma subscrição Stripe REAL, cobrada ao email
    // desta conta — nunca deixar isso acontecer por um clique acidental.
    if (subStatus?.status === 'admin_access') {
      const confirmed = window.confirm(
        'Esta conta tem acesso administrativo (sem subscrição real). Continuar vai criar uma subscrição Stripe REAL e cobrar esta conta. Continuar?'
      )
      if (!confirmed) return
    }
    setPaying(plan)
    // 2026-09-19: já não envia professional_id — a rota resolve sempre o
    // profissional pela sessão autenticada, nunca por um id vindo daqui.
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, cycle }),
    })
    const { url, ok, deferred, error } = await res.json()
    if (url) {
      // Primeira subscrição — só aqui há um checkout do Stripe para onde ir.
      window.location.href = url
      return
    }
    if (ok) {
      // Já tinha subscrição: upgrade aplicado de imediato com proration (o
      // Stripe já confirmou o pagamento da diferença), ou downgrade
      // registado para entrar em vigor só na próxima renovação — em
      // nenhum dos casos há um checkout para onde redirecionar.
      alert(deferred
        ? 'Pedido registado — o novo plano entra em vigor na próxima renovação.'
        : 'Plano atualizado com sucesso!')
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('professionals').select('*').eq('user_id', user.id).maybeSingle()
        if (data) {
          setProfessional(data)
          await loadSubscriptionStatus()
        }
      }
      setPaying(null)
      return
    }
    alert(error || 'Erro ao iniciar pagamento')
    setPaying(null)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c1a' }}>
      <div className="w-8 h-8 border-4 border-indigo-900 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )

  // Regras corrigidas em 2026-09-19: "ativo" depende do Price ID/ciclo REAL
  // da subscrição (subStatus, lido do Stripe), nunca só do tier guardado em
  // professionals.plan — ver isActivePlanCycle em lib/stripe-plans.ts.
  // Quando subStatus.cycle é null (sem subscrição Stripe identificável, ex:
  // conta marcada "pro" manualmente) isto é sempre false para os dois
  // planos, nunca bloqueando o botão de nenhum ciclo.
  const isStarterActive = isActivePlanCycle(subStatus, 'starter', cycle)
  const isProActive = isActivePlanCycle(subStatus, 'pro', cycle)
  // "Tem plano na BD mas sem ciclo identificável" — a conta está marcada
  // como paga (starter/pro) mas subStatus.cycle é null: nem trial, nem
  // inactive, só sem uma subscrição Stripe real por trás do tier. Exclui
  // admin_access de propósito (2026-09-19) — é um estado explicado à parte
  // abaixo, nunca tratado como a mesma inconsistência de uma conta normal.
  const hasUnidentifiedCycle = !!subStatus && subStatus.cycle === null
    && (subStatus.plan === 'starter' || subStatus.plan === 'pro')
    && subStatus.status !== 'admin_access'
  const isAdminAccess = subStatus?.status === 'admin_access'

  return (
    <div className="min-h-screen" style={{ background: '#0a0c1a' }}>
      <div style={{ background: '#0d0f1e', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-black text-white">Escolhe o teu plano</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10">

        {success && (
          <div className="mb-6 p-4 rounded-2xl flex items-center gap-3"
            style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
            <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />
            <p className="text-sm font-bold text-white">Pagamento confirmado! O teu plano está ativo.</p>
          </div>
        )}

        {/* Acesso administrativo (2026-09-19) — nunca deve parecer um erro de
            cobrança nem convidar a "ativar o pagamento" (ver
            hasUnidentifiedCycle acima, que exclui este caso). Qualquer
            escolha nas cartas abaixo continua a criar uma subscrição real
            (handleCheckout já pede confirmação explícita nesse caso). */}
        {isAdminAccess && (
          <div className="mb-6 p-4 rounded-2xl flex items-center gap-3"
            style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)' }}>
            <ShieldCheck size={18} className="flex-shrink-0" style={{ color: '#a78bfa' }} />
            <p className="text-sm text-gray-300">
              Esta conta tem <strong className="text-white">acesso administrativo</strong> às funcionalidades {subStatus?.plan === 'pro' ? 'Pro' : 'Starter'}, sem subscrição nem cobrança associada.
              Escolher um plano abaixo cria uma <strong className="text-white">subscrição Stripe real</strong>, cobrada a esta conta.
            </p>
          </div>
        )}

        {/* P5 (2026-09-19): seletor Mensal/Anual — só decide o "cycle" enviado
            a /api/stripe/checkout quando se escolhe um plano; o Price ID real
            é sempre resolvido no servidor. */}
        <div className="flex items-center justify-center gap-1 mb-8 p-1 rounded-full mx-auto w-fit"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={() => setCycle('monthly')}
            className="px-5 py-2 rounded-full text-sm font-bold transition-all"
            style={cycle === 'monthly' ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' } : { color: '#9ca3af' }}
          >
            Mensal
          </button>
          <button
            onClick={() => setCycle('annual')}
            className="px-5 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2"
            style={cycle === 'annual' ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' } : { color: '#9ca3af' }}
          >
            Anual
            <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: cycle === 'annual' ? 'rgba(255,255,255,0.25)' : 'rgba(52,211,153,0.15)', color: cycle === 'annual' ? '#fff' : '#34d399' }}>
              -15%
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Starter */}
          <div className="rounded-2xl p-6 flex flex-col"
            style={{ background: 'rgba(255,255,255,0.03)', border: isStarterActive ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-white text-lg">Starter</h3>
              {isStarterActive && (
                <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>ATIVO</span>
              )}
            </div>
            <div className="text-3xl font-black text-white mb-1">
              {cycle === 'annual' ? '€193,80' : '€19'}
              <span className="text-base font-normal text-gray-400">{cycle === 'annual' ? '/ano + IVA' : '/mês + IVA'}</span>
            </div>
            <p className="text-xs text-gray-500 mb-5">Ideal para começar</p>
            <ul className="space-y-3 mb-8 flex-1">
              {['Até 10 pedidos/mês via link pessoal', 'Link pessoal', 'Orçamentos automáticos', 'Dashboard kanban', 'Suporte por email'].map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                  <CheckCircle size={14} className="text-indigo-400 flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>
            {isStarterActive ? (
              <div className="w-full py-3 rounded-xl text-center text-sm font-bold text-indigo-400"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                Plano atual
              </div>
            ) : (
              <button
                className="w-full py-3 rounded-xl font-bold text-white text-sm transition-opacity"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: paying === 'starter' ? 0.7 : 1 }}
                disabled={paying !== null}
                onClick={() => handleCheckout('starter')}
              >
                {paying === 'starter' ? 'A redirecionar...' : subStatus?.plan === 'starter'
                  ? `Mudar para Starter ${cycle === 'annual' ? 'anual' : 'mensal'}`
                  : 'Escolher Starter'}
              </button>
            )}
          </div>

          {/* Pro */}
          <div className="rounded-2xl p-6 flex flex-col relative"
            style={{ background: 'rgba(201,168,76,0.06)', border: isProActive ? '2px solid #c9a84c' : '1px solid rgba(201,168,76,0.25)' }}>
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-black px-3 py-0.5 rounded-full"
              style={{ background: '#c9a84c', color: '#000' }}>
              MAIS POPULAR
            </span>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-white text-lg">Pro</h3>
              {isProActive && (
                <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.2)', color: '#c9a84c' }}>ATIVO</span>
              )}
            </div>
            <div className="text-3xl font-black text-white mb-1">
              {cycle === 'annual' ? '€397,80' : '€39'}
              <span className="text-base font-normal text-gray-400">{cycle === 'annual' ? '/ano + IVA' : '/mês + IVA'}</span>
            </div>
            <p className="text-xs text-gray-500 mb-5">Para quem quer crescer a sério</p>
            <ul className="space-y-3 mb-8 flex-1">
              {[
                { label: 'Até 30 pedidos/mês via link', soon: false },
                { label: 'Follow-up automático', soon: false },
                { label: 'Notificações de novos pedidos por WhatsApp', soon: false },
                { label: 'PDF de orçamento', soon: true },
                { label: 'Estatísticas avançadas', soon: false },
                { label: 'Suporte prioritário', soon: false },
              ].map(f => (
                <li key={f.label} className="flex items-center gap-2 text-sm text-white">
                  <CheckCircle size={14} className="text-amber-400 flex-shrink-0" />
                  {f.label}
                  {f.soon && <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c' }}>em breve</span>}
                </li>
              ))}
            </ul>
            {isProActive ? (
              <div className="w-full py-3 rounded-xl text-center text-sm font-bold"
                style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c' }}>
                <Crown size={14} className="inline mr-1" /> Plano atual
              </div>
            ) : (
              <button
                className="w-full py-3 rounded-xl font-black text-black text-sm transition-opacity"
                style={{ background: 'linear-gradient(135deg, #c9a84c, #e0bf6a)', boxShadow: '0 8px 24px rgba(201,168,76,0.3)', opacity: paying === 'pro' ? 0.7 : 1 }}
                disabled={paying !== null}
                onClick={() => handleCheckout('pro')}
              >
                {paying === 'pro' ? 'A redirecionar...' : subStatus?.plan === 'pro'
                  ? `Mudar para Pro ${cycle === 'annual' ? 'anual' : 'mensal'}`
                  : 'Escolher Pro'}
              </button>
            )}
          </div>

        </div>

        {/* Regra 5 (2026-09-19): a conta tem um tier pago na BD mas sem
            Price ID/subscrição Stripe identificável — nunca inventa o ciclo
            (por isso nenhum dos dois cartões acima aparece como "ATIVO"),
            só explica a situação e deixa os botões de Mensal/Anual livres. */}
        {hasUnidentifiedCycle && (
          <div className="mt-6 p-4 rounded-2xl flex items-center gap-3"
            style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
            <Info size={18} className="text-blue-400 flex-shrink-0" />
            <p className="text-sm text-gray-300">
              A tua conta está marcada como <strong className="text-white">{subStatus?.plan === 'pro' ? 'Pro' : 'Starter'}</strong>,
              mas não encontrámos uma subscrição Stripe ativa associada. Escolhe Mensal ou Anual acima para ativar o pagamento.
            </p>
          </div>
        )}

        <p className="text-center text-xs text-gray-600 mt-6">
          Sem contrato · Cancela a qualquer momento · Pagamento seguro via Stripe
        </p>

        {/* Portal de gestão — só aparece se já tem subscrição */}
        {professional?.stripe_customer_id && (
          <div className="mt-6 text-center">
            <button
              onClick={handlePortal}
              disabled={openingPortal}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
            >
              {openingPortal ? 'A abrir...' : 'Gerir subscrição · Faturas · Cancelar'}
            </button>
          </div>
        )}

        {professional?.plan === 'inactive' && (
          <div className="mt-6 p-4 rounded-2xl flex items-center gap-3"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <Zap size={18} className="text-red-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-white">Subscrição cancelada</p>
              <p className="text-xs text-gray-400">Escolhe um plano para voltar a receber leads</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
