'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { track } from '@/lib/track-client'
import { PROFESSIONS, SPECIALTY_LIST } from '@/lib/professions'

const CTA_HREF = '/login?tab=register&role=professional'

// Segunda versão da página de aterragem (teste A/B contra /comecar) — mesma
// oferta e marca, mas percorre vários gatilhos de copywriting ao longo do
// scroll em vez de um só: dor -> autoridade pessoal -> perda -> pertença ->
// reciprocidade. Ver app/comecar/page.tsx para a versão de ângulo único.
export default function JuntarPage() {
  useEffect(() => {
    track({ event_type: 'page_view', path: '/juntar' })
  }, [])

  return (
    <main className="min-h-screen bg-[#08080a] text-white font-sans overflow-x-hidden">

      {/* HERO — dor -> agitação -> solução */}
      <section className="relative min-h-[92vh] flex items-center justify-center px-6 pt-16 pb-14">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-25%] left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.15) 0%, rgba(201,168,76,0) 65%)' }} />
        </div>

        <div className="relative z-10 text-center max-w-2xl mx-auto">
          <span className="text-2xl font-semibold tracking-tight block mb-10">
            Faço<span className="text-[#c9a84c]">PorTi</span>
          </span>

          <h1 className="text-4xl md:text-6xl font-bold leading-[1.12] tracking-tight mb-6">
            Achas que devias ter<br />mais clientes a esta<br />altura do mês?
          </h1>

          <p className="text-lg md:text-xl text-white/60 max-w-xl mx-auto mb-10 leading-relaxed">
            A maioria dos profissionais não perde trabalho por falta de qualidade —
            perde porque ninguém sabe que existem no momento certo.
          </p>

          <div className="flex flex-col items-center gap-4">
            <Link
              href={CTA_HREF}
              className="inline-block bg-[#c9a84c] text-black font-semibold px-10 py-4 rounded-full text-lg hover:bg-[#e0bf6a] transition-all hover:scale-[1.03]"
              style={{ boxShadow: '0 8px 32px rgba(201,168,76,0.35)' }}
            >
              Resolver isto agora
            </Link>
            <p className="text-sm text-white/30">Conta grátis para sempre · Sem cartão de crédito</p>
          </div>
        </div>
      </section>

      {/* AUTORIDADE PESSOAL — a história do Gilson */}
      <section className="py-24 border-y border-white/5">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <img src="/gilson-depoimento.png" alt="Gilson Oliveira" className="w-16 h-16 rounded-full object-cover object-center mx-auto mb-6" />
          <p className="text-xl md:text-2xl font-light leading-relaxed text-white/85 mb-4">
            "Sou pintor. Construí a Façoporti para resolver um problema que eu próprio tinha —
            perdia horas por pedido a explicar preços no WhatsApp, sem nunca saber se ia fechar."
          </p>
          <p className="text-white/40 text-sm">Gilson Oliveira · Pintor profissional e fundador</p>
          <p className="text-white/50 text-base mt-8 max-w-md mx-auto">
            Uso a plataforma todos os dias, para o meu próprio trabalho. Não é uma ideia de escritório — é a ferramenta que eu precisava e não existia.
          </p>
        </div>
      </section>

      {/* AVERSÃO À PERDA */}
      <section className="py-24 max-w-2xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-bold leading-tight mb-6">
          Enquanto lês isto, há alguém em Portugal<br className="hidden md:block" /> à procura de um profissional como tu.
        </h2>
        <p className="text-white/50 text-lg mb-10 leading-relaxed">
          Sem estares visível no momento certo, esse pedido vai provavelmente para outro. A Façoporti põe o teu perfil à frente disso — hoje, não daqui a uns meses.
        </p>
        <Link
          href={CTA_HREF}
          className="inline-block bg-[#c9a84c] text-black font-semibold px-9 py-3.5 rounded-full text-base hover:bg-[#e0bf6a] transition-colors"
        >
          Criar o meu perfil agora
        </Link>
      </section>

      {/* PERTENÇA — profissões reais + identidade "independente" */}
      <section className="py-24 bg-white/2 border-y border-white/5">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Feita para quem trabalha por conta própria</h2>
          <p className="text-white/50 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            Sem depender só do "conhece alguém que conhece alguém". Sem intermediários a levar a maior fatia.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {SPECIALTY_LIST.map(spec => {
              const prof = PROFESSIONS[spec]
              return (
                <span key={spec} className="inline-flex items-center gap-2 bg-white/3 border border-white/8 rounded-full px-4 py-2 text-sm text-white/70">
                  <span>{prof?.emoji || '💼'}</span> {prof?.label || spec}
                </span>
              )
            })}
            <span className="inline-flex items-center gap-2 bg-[#c9a84c]/5 border border-[#c9a84c]/20 rounded-full px-4 py-2 text-sm text-[#c9a84c]">
              + a tua área, se não estiver na lista
            </span>
          </div>
        </div>
      </section>

      {/* RECIPROCIDADE — valor antes do pitch */}
      <section className="py-24 max-w-2xl mx-auto px-6">
        <div className="bg-white/3 border border-white/8 rounded-3xl p-8 md:p-10">
          <p className="text-[#c9a84c] text-xs font-bold uppercase tracking-widest mb-4">Dica rápida</p>
          <p className="text-xl text-white/85 leading-relaxed mb-6">
            Fecha sempre o pedido por escrito antes de dares um preço — evita mal-entendidos e propostas que nunca avançam.
          </p>
          <p className="text-white/50 leading-relaxed">
            A Façoporti faz isso automaticamente por ti: o cliente responde a perguntas simples e tu recebes tudo pronto para orçamentar, sem teres de perguntar nada por mensagem.
          </p>
        </div>
      </section>

      {/* FAQ RÁPIDO */}
      <section className="py-20 max-w-2xl mx-auto px-6">
        <div className="space-y-4">
          {[
            { q: 'Preciso de pagar para criar a conta?', a: 'Não. A conta é gratuita e não expira. Só pagas se decidires ativar um plano para abrir os pedidos que recebes.' },
            { q: 'Os clientes que me contactam são só meus?', a: 'Sim — os pedidos feitos pelo teu link pessoal são encaminhados exclusivamente para ti, nunca para outro profissional.' },
            { q: 'Posso cancelar quando quiser?', a: 'Sim, sem compromissos. Cancelas no dashboard e o plano mantém-se ativo até ao fim do período já pago.' },
          ].map(item => (
            <details key={item.q} className="group bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
              <summary className="flex items-center justify-between px-6 py-5 cursor-pointer list-none font-medium text-white/90 hover:text-white transition-colors">
                {item.q}
                <span className="text-[#c9a84c] text-xl ml-4 group-open:rotate-45 transition-transform duration-200">+</span>
              </summary>
              <p className="px-6 pb-5 text-white/50 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="pb-32 pt-8 text-center px-6">
        <h2 className="text-3xl md:text-4xl font-bold mb-8 max-w-lg mx-auto leading-tight">
          Não é sorte. É apareceres primeiro.
        </h2>
        <Link
          href={CTA_HREF}
          className="inline-block bg-[#c9a84c] text-black font-semibold px-10 py-4 rounded-full text-lg hover:bg-[#e0bf6a] transition-all hover:scale-[1.03]"
          style={{ boxShadow: '0 8px 32px rgba(201,168,76,0.35)' }}
        >
          Criar conta grátis
        </Link>
        <p className="text-sm text-white/30 mt-6">
          <a href="/termos" className="hover:text-white/50 transition-colors">Termos</a>
          {' · '}
          <a href="/privacidade" className="hover:text-white/50 transition-colors">Privacidade</a>
        </p>
      </section>

      {/* CTA FIXO MOBILE */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-[#08080a] via-[#08080a]/95 to-transparent md:hidden">
        <Link
          href={CTA_HREF}
          className="block text-center bg-[#c9a84c] text-black font-semibold py-3.5 rounded-full text-base"
          style={{ boxShadow: '0 8px 24px rgba(201,168,76,0.4)' }}
        >
          Criar conta grátis
        </Link>
      </div>
    </main>
  )
}
