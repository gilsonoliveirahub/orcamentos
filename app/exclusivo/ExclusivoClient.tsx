'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { track } from '@/lib/track-client'
import { PROFESSIONS, SPECIALTY_LIST } from '@/lib/professions'

const CTA_HREF = '/login?tab=register&role=professional'

// Página de aterragem para tráfego pago (anúncio Facebook) — mensagem
// alinhada com o anúncio (dor: correr atrás de responder primeiro a um
// pedido partilhado com outros profissionais). Sem menu nem links de saída
// além do CTA, para não distrair um clique que já custou dinheiro.
export default function ExclusivoClient() {
  useEffect(() => {
    track({ event_type: 'page_view', path: '/exclusivo' })
  }, [])

  return (
    <main className="min-h-screen bg-[#08080a] text-white font-sans overflow-x-hidden">

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center px-6 pt-20 pb-16">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.16) 0%, rgba(201,168,76,0) 65%)' }} />
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, rgba(99,102,241,0) 70%)' }} />
        </div>

        <div className="relative z-10 text-center max-w-3xl mx-auto">
          <span className="text-2xl font-semibold tracking-tight block mb-10">
            Faço<span className="text-[#c9a84c]">PorTi</span>
          </span>

          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white/70 mb-8">
            <span className="w-2 h-2 rounded-full bg-[#c9a84c] animate-pulse" />
            Para profissionais independentes em Portugal
          </div>

          <h1 className="text-4xl md:text-6xl font-bold leading-[1.1] tracking-tight mb-6">
            Já não precisas de ser<br />
            o mais rápido a responder<br />
            para ganhar o cliente.
          </h1>

          <p className="text-lg md:text-xl text-white/60 max-w-xl mx-auto mb-10 leading-relaxed">
            Cria o teu link pessoal. Cada pedido que chega por ele é só teu &mdash;
            nunca partilhado com outro profissional ao mesmo tempo.
          </p>

          <div className="flex flex-col items-center gap-4">
            <Link
              href={CTA_HREF}
              className="inline-block bg-[#c9a84c] text-black font-semibold px-10 py-4 rounded-full text-lg hover:bg-[#e0bf6a] transition-all hover:scale-[1.03]"
              style={{ boxShadow: '0 8px 32px rgba(201,168,76,0.35)' }}
            >
              Criar o Meu Link Grátis
            </Link>
            <p className="text-sm text-white/30">Grátis para sempre &middot; Sem cartão de crédito &middot; Menos de 1 minuto</p>
          </div>
        </div>
      </section>

      {/* O PROBLEMA — a pessoa reconhece-se de imediato */}
      <section className="py-20 max-w-3xl mx-auto px-6">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">Conheces isto?</h2>
        <div className="space-y-4">
          {[
            'Um cliente pede orçamento numa app, e o mesmo pedido chega a mais três profissionais ao mesmo tempo',
            'Perdes tempo a explicar o trabalho a alguém que já fechou negócio com outro, cinco minutos antes de ti',
            'Sentes que estás sempre a competir por preço, nunca só a fazer o teu trabalho',
          ].map(item => (
            <div key={item} className="flex items-start gap-4 bg-white/3 border border-white/8 rounded-2xl px-6 py-4">
              <span className="text-[#c9a84c] text-xl flex-shrink-0 mt-0.5">✓</span>
              <p className="text-white/80 leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
      </section>

      {/* A DIFERENÇA — mecanismo real, não promessa vaga */}
      <section className="py-20 border-y border-white/5">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">A diferença não é publicidade. É estrutural.</h2>
          <p className="text-white/60 text-lg leading-relaxed max-w-2xl mx-auto">
            Quando alguém pede um orçamento através do teu link pessoal, o pedido nunca é
            mostrado a outro profissional. Não há licitação por leads, não há corrida pela
            resposta mais rápida &mdash; és tu, sozinho, do primeiro contacto ao trabalho fechado.
          </p>
        </div>
      </section>

      {/* PROFISSÕES SUPORTADAS */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-white/40 text-sm uppercase tracking-widest mb-8">Já disponível para</p>
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

      {/* COMO FUNCIONA — 3 passos, reduz a sensação de complexidade */}
      <section className="py-24 max-w-5xl mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { title: '1. Cria o teu link', desc: 'Conta gratuita, sem cartão de crédito. O teu link fica pronto em menos de um minuto.' },
            { title: '2. Partilha-o', desc: 'Nas tuas redes, no WhatsApp, no cartão de visita — onde já falas com clientes.' },
            { title: '3. Recebe pedidos só teus', desc: 'Cada pedido chega organizado, com orçamento estimado, exclusivamente para ti.' },
          ].map(item => (
            <div key={item.title} className="bg-white/3 border border-white/8 rounded-3xl p-8 hover:border-[#c9a84c]/30 transition-colors">
              <h3 className="text-xl font-semibold mb-3 text-[#c9a84c]">{item.title}</h3>
              <p className="text-white/50 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* DEPOIMENTO — real, do fundador, sem números inventados */}
      <section className="py-24 max-w-3xl mx-auto px-6 text-center relative">
        <div className="text-8xl text-[#c9a84c]/15 font-serif absolute -top-4 left-1/2 -translate-x-1/2 select-none">"</div>
        <blockquote className="relative text-xl md:text-2xl font-light leading-relaxed text-white/80 mb-8">
          Antes perdia cerca de 30 minutos por pedido a fazer perguntas no WhatsApp.
          Agora recebo as informações organizadas e só preciso de confirmar o valor.
        </blockquote>
        <div className="flex items-center justify-center gap-3">
          <img src="/gilson-depoimento.png" alt="Gilson Oliveira" className="w-11 h-11 rounded-full object-cover object-center" />
          <div className="text-left">
            <div className="font-semibold text-sm">Gilson Oliveira</div>
            <div className="text-xs text-white/40">Pintor profissional e fundador do FaçoPorTi</div>
          </div>
        </div>
      </section>

      {/* OBJEÇÕES — quebra dúvidas de preço antes de aparecerem */}
      <section className="py-20 max-w-2xl mx-auto px-6">
        <div className="space-y-4">
          {[
            { q: 'Quanto custa?', a: 'A conta é grátis para sempre — dá para veres como funciona antes de decidires. Quando quiseres abrir os pedidos, o Starter é 19€/mês (10 pedidos/mês pelo teu link) e o Pro é 39€/mês (30 pedidos/mês, mais follow-up automático e notificações por WhatsApp).' },
            { q: 'Os clientes que me contactam são só meus?', a: 'Sim — os pedidos feitos pelo teu link pessoal são encaminhados exclusivamente para ti, nunca para outro profissional ao mesmo tempo.' },
            { q: 'E se eu quiser mais pedidos do que o meu link me dá?', a: 'Há também um marketplace opcional, com pedidos avulsos desde 1,50€ cada — usas só quando quiseres mais volume, sem obrigação nenhuma.' },
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
          Cria o teu link antes que outro profissional crie o dele com os teus clientes.
        </h2>
        <Link
          href={CTA_HREF}
          className="inline-block bg-[#c9a84c] text-black font-semibold px-10 py-4 rounded-full text-lg hover:bg-[#e0bf6a] transition-all hover:scale-[1.03]"
          style={{ boxShadow: '0 8px 32px rgba(201,168,76,0.35)' }}
        >
          Criar o Meu Link Grátis
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
          Criar o Meu Link Grátis
        </Link>
      </div>
    </main>
  )
}
