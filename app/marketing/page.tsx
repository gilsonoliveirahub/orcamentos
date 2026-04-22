'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function MarketingPage() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white font-sans">

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center justify-between px-5 md:px-8 py-4 md:py-5">
          <span className="text-xl font-semibold tracking-tight">
            Faço<span className="text-[#c9a84c]">PorTi</span>
          </span>
          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            <a href="#como-funciona" className="text-sm text-white/60 hover:text-white transition-colors">Como funciona</a>
            <a href="#precos" className="text-sm text-white/60 hover:text-white transition-colors">Preços</a>
            <Link href="/login" className="text-sm text-white/60 hover:text-white transition-colors">Entrar</Link>
            <Link href="/pedir" className="text-sm text-white/60 hover:text-white transition-colors border border-white/20 px-4 py-2 rounded-full hover:border-white/40 transition-colors">
              Pedir orçamento
            </Link>
            <Link href="/login" className="text-sm bg-[#c9a84c] text-black font-medium px-4 py-2 rounded-full hover:bg-[#e0bf6a] transition-colors">
              Criar conta
            </Link>
          </div>
          {/* Mobile nav toggle */}
          <div className="flex md:hidden items-center gap-3">
            <Link href="/login" className="text-sm bg-[#c9a84c] text-black font-medium px-4 py-2 rounded-full">
              Criar conta
            </Link>
            <button onClick={() => setMobileNavOpen(o => !o)}
              className="flex flex-col gap-1.5 p-1"
              aria-label="Menu">
              <span className={`block h-0.5 w-6 bg-white/70 transition-all ${mobileNavOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block h-0.5 w-6 bg-white/70 transition-all ${mobileNavOpen ? 'opacity-0' : ''}`} />
              <span className={`block h-0.5 w-6 bg-white/70 transition-all ${mobileNavOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </button>
          </div>
        </div>
        {/* Mobile menu */}
        {mobileNavOpen && (
          <div className="md:hidden flex flex-col px-5 pb-5 gap-3 border-t border-white/5">
            <a href="#como-funciona" onClick={() => setMobileNavOpen(false)}
              className="text-sm text-white/70 py-3 border-b border-white/5">Como funciona</a>
            <a href="#precos" onClick={() => setMobileNavOpen(false)}
              className="text-sm text-white/70 py-3 border-b border-white/5">Preços</a>
            <Link href="/pedir" className="text-sm text-white/70 py-3 border-b border-white/5">Pedir orçamento</Link>
            <Link href="/login" className="text-sm text-white/70 py-3">Entrar</Link>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=1920&q=80"
            alt="Pintor profissional"
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/60 via-[#0a0a0a]/40 to-[#0a0a0a]" />
        </div>

        <div className="relative z-10 text-center max-w-4xl mx-auto px-6 pt-24">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white/70 mb-8">
            <span className="w-2 h-2 rounded-full bg-[#c9a84c] animate-pulse" />
            Para todos os profissionais independentes em Portugal
          </div>

          <h1 className="text-5xl md:text-7xl font-bold leading-tight tracking-tight mb-6">
            Recebe clientes diretamente<br />
            <span className="text-[#c9a84c]">no teu WhatsApp.</span>
          </h1>

          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-3 leading-relaxed">
            Cria o teu link profissional, partilha nas redes e recebe pedidos já com orçamento estimado.
          </p>
          <p className="text-base text-white/40 max-w-xl mx-auto mb-10 leading-relaxed">
            Também podes aceder a pedidos da plataforma na tua zona.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login" className="w-full sm:w-auto text-center bg-[#c9a84c] text-black font-semibold px-8 py-4 rounded-full text-lg hover:bg-[#e0bf6a] transition-colors">
              Começar a receber clientes
            </Link>
            <a href="#como-funciona" className="w-full sm:w-auto text-center border border-white/20 text-white px-8 py-4 rounded-full text-lg hover:border-white/40 transition-colors">
              Ver como funciona
            </a>
          </div>

          <p className="text-sm text-white/30 mt-6">Um único trabalho pode pagar o mês inteiro. Começa com 19€.</p>
        </div>
      </section>

      {/* NÚMEROS */}
      <section className="py-16 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-white/30 text-sm uppercase tracking-widest mb-10">Como funciona na prática</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-sm font-semibold text-white/70 leading-snug">Várias profissões suportadas</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-[#c9a84c] mb-2">2 min</div>
              <div className="text-sm text-white/50">Para gerar um orçamento</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-[#c9a84c] mb-2">€19</div>
              <div className="text-sm text-white/50">Para começar</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-white/70 leading-snug">Clientes do teu link são só teus</div>
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="py-32 max-w-6xl mx-auto px-6">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">3 passos para começares a receber pedidos</h2>
          <p className="text-white/50 text-lg">Em poucos minutos tens o teu link ativo e pronto a receber clientes.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              step: '01',
              title: 'Crias o teu link profissional',
              desc: 'Recebes um link próprio e partilhas no WhatsApp, Instagram ou onde quiseres.',
              image: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=600&q=80',
            },
            {
              step: '02',
              title: 'O cliente envia o pedido',
              desc: 'Responde a perguntas simples, envia fotos e recebe um orçamento estimado.',
              image: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=600&q=80',
            },
            {
              step: '03',
              title: 'Recebes o pedido pronto para fechar',
              desc: 'Recebes tudo organizado, com orçamento estimado e contacto direto para responder rapidamente.',
              image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80',
            },
          ].map((item) => (
            <div key={item.step} className="group relative bg-white/3 border border-white/8 rounded-3xl overflow-hidden hover:border-[#c9a84c]/30 transition-colors">
              <div className="relative h-48 overflow-hidden">
                <img src={item.image} alt={item.title} className="w-full h-full object-cover opacity-50 group-hover:opacity-70 group-hover:scale-105 transition-all duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-transparent" />
                <span className="absolute top-4 left-4 text-5xl font-bold text-white/10">{item.step}</span>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                <p className="text-white/50 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-white/30 text-sm mt-14">Em poucos minutos estás pronto para receber clientes.</p>
      </section>

      {/* DIFERENCIAL */}
      <section className="py-24 bg-white/2 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Duas formas de receber clientes</h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">No FaçoPorTi, recebes clientes diretamente pelo teu link e podes aceder a pedidos extra da plataforma.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Link pessoal */}
            <div className="bg-[#c9a84c]/5 border border-[#c9a84c]/20 rounded-3xl p-8">
              <h3 className="text-xl font-semibold text-[#c9a84c] mb-2">Pelo teu link profissional</h3>
              <p className="text-white/30 text-sm mb-6">Incluído no plano mensal</p>
              <ul className="space-y-4">
                {[
                  'O cliente entra diretamente no teu link',
                  'O pedido fica associado a ti',
                  'Sem concorrência direta',
                  'Orçamento automático com base nos teus preços',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-white/80">
                    <span className="text-[#c9a84c]">✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Marketplace */}
            <div className="bg-white/3 border border-white/8 rounded-3xl p-8">
              <h3 className="text-xl font-semibold text-white/70 mb-2">Pelo marketplace</h3>
              <p className="text-white/30 text-sm mb-6">Opcional — pagas por lead</p>
              <ul className="space-y-4">
                {[
                  'O cliente entra diretamente no FaçoPorTi',
                  'O pedido pode ficar disponível para profissionais compatíveis',
                  'Podes desbloquear a lead se quiseres',
                  'Pagas apenas quando queres contactar',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-white/50">
                    <span className="text-white/30">→</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-center text-white/30 text-sm mt-10">
            Clientes do teu link são só teus. O marketplace é opcional.
          </p>
        </div>
      </section>

      {/* DASHBOARD */}
      <section className="py-32 max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Tudo organizado num só lugar</h2>
            <p className="text-white/50 text-lg mb-10">Pedidos, orçamento estimado, propostas e acompanhamento — sem confusão no WhatsApp.</p>
            <ul className="space-y-4 mb-10">
              {[
                'Vês todos os pedidos num só painel',
                'Recebes o pedido já preenchido',
                'Confirmas o valor mais rápido',
                'Acompanhas cada cliente até fechar trabalho',
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-white/70">
                  <span className="w-5 h-5 rounded-full bg-[#c9a84c]/20 border border-[#c9a84c]/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-[#c9a84c] text-xs">✓</span>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/login" className="inline-block bg-[#c9a84c] text-black font-semibold px-8 py-4 rounded-full hover:bg-[#e0bf6a] transition-colors">
              Criar conta profissional
            </Link>
          </div>

          <div className="relative rounded-3xl overflow-hidden border border-white/10">
            <img
              src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80"
              alt="Dashboard FaçoPorTi"
              className="w-full opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/60 via-transparent to-transparent" />
          </div>
        </div>
      </section>

      {/* PREÇOS */}
      <section id="precos" className="py-32 bg-white/2 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Preços simples</h2>
            <p className="text-white/50 text-lg">Sem surpresas. Cancelas quando quiseres.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Starter */}
            <div className="bg-white/3 border border-white/8 rounded-3xl p-8">
              <h3 className="text-2xl font-bold mb-2">Starter</h3>
              <div className="text-4xl font-bold mb-1">€19<span className="text-lg font-normal text-white/40">/mês</span></div>
              <p className="text-white/40 text-sm mb-8">Para começar</p>
              <ul className="space-y-3 mb-8">
                {[
                  'Link profissional',
                  'Até 10 pedidos por mês no teu link',
                  'Orçamentos automáticos',
                  'Pipeline visual',
                  'Acesso ao marketplace',
                  'Pode comprar leads extra',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-3 text-white/60 text-sm">
                    <span className="text-[#c9a84c]">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="block text-center border border-white/20 text-white py-3 rounded-full hover:border-white/40 transition-colors">
                Começar
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-[#c9a84c]/5 border border-[#c9a84c]/30 rounded-3xl p-8 relative">
              <span className="absolute top-4 right-4 text-xs bg-[#c9a84c] text-black font-semibold px-3 py-1 rounded-full">Mais popular</span>
              <h3 className="text-2xl font-bold mb-2">Pro</h3>
              <div className="text-4xl font-bold mb-1">€39<span className="text-lg font-normal text-white/40">/mês</span></div>
              <p className="text-white/40 text-sm mb-8">Para profissionais a crescer</p>
              <ul className="space-y-3 mb-8">
                {[
                  { label: 'Link profissional', soon: false },
                  { label: 'Até 50 pedidos por mês no teu link', soon: false },
                  { label: 'Follow-up automático', soon: false },
                  { label: 'Notificações WhatsApp', soon: true },
                  { label: 'PDF de orçamento', soon: true },
                  { label: 'Estatísticas avançadas', soon: false },
                  { label: 'Suporte prioritário', soon: false },
                  { label: 'Leads do marketplace a preço mais baixo', soon: false },
                ].map((f) => (
                  <li key={f.label} className="flex items-center gap-3 text-white/80 text-sm">
                    <span className="text-[#c9a84c]">✓</span> {f.label}
                    {f.soon && <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c' }}>em breve</span>}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="block text-center bg-[#c9a84c] text-black font-semibold py-3 rounded-full hover:bg-[#e0bf6a] transition-colors">
                Começar Pro
              </Link>
            </div>
          </div>

          <div className="text-center mt-10 space-y-1">
            <p className="text-white/50 text-sm">Leads do marketplace desde 2,5€</p>
            <p className="text-white/30 text-sm">Os pedidos do teu link contam para o plano. O marketplace é opcional.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-32 max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Perguntas frequentes</h2>
          <p className="text-white/50 text-lg">Tudo o que precisas de saber antes de começar</p>
        </div>

        <div className="space-y-4">
          {[
            {
              q: 'O cliente que usa o meu link vai para outros profissionais?',
              a: 'Não. O cliente que acede ao teu link pessoal é encaminhado exclusivamente para ti. Nenhum outro profissional recebe esse pedido.',
            },
            {
              q: 'O que é o marketplace?',
              a: 'É a secção pública do FaçoPorTi onde qualquer pessoa pode pedir um orçamento sem ter o link de um profissional específico. Esses pedidos são atribuídos automaticamente a profissionais disponíveis na zona e especialidade.',
            },
            {
              q: 'Quando pago por uma lead?',
              a: 'Só pagas quando recebes um lead do marketplace — desde 2,50€ por lead. Pedidos que chegam pelo teu link pessoal estão totalmente incluídos no plano mensal, sem custo adicional.',
            },
            {
              q: 'O que está incluído no plano mensal?',
              a: 'O teu link pessoal, a receção e gestão ilimitada de pedidos via esse link, o pipeline Kanban e os orçamentos automáticos. No plano Pro tens ainda follow-up automático, notificações WhatsApp, PDF de orçamento e estatísticas avançadas.',
            },
            {
              q: 'Posso comprar mais leads do marketplace?',
              a: 'Sim. Podes comprar pacotes de créditos a qualquer momento. Os créditos não expiram.',
            },
            {
              q: 'Os pedidos do meu link contam para algum limite?',
              a: 'Sim. No plano Starter o máximo é 10 pedidos/mês via link pessoal. No plano Pro o máximo é 50 pedidos/mês.',
            },
            {
              q: 'Posso cancelar a qualquer momento?',
              a: 'Sim, sem compromissos. Cancelas no dashboard e o plano mantém-se ativo até ao fim do período já pago.',
            },
          ].map((item) => (
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

      {/* DEPOIMENTO */}
      <section className="py-32 max-w-4xl mx-auto px-6 text-center">
        <div className="relative">
          <div className="text-8xl text-[#c9a84c]/20 font-serif absolute -top-8 left-1/2 -translate-x-1/2">"</div>
          <blockquote className="text-2xl md:text-3xl font-light leading-relaxed text-white/80 mb-8">
            Antes perdia 30 minutos por lead a fazer perguntas no WhatsApp. Agora recebo tudo preenchido e só tenho de confirmar o valor.
          </blockquote>
          <div className="flex items-center justify-center gap-4">
            <img
              src="https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&q=80"
              alt="Pintor"
              className="w-12 h-12 rounded-full object-cover"
            />
            <div className="text-left">
              <div className="font-semibold">Profissional independente</div>
              <div className="text-sm text-white/40">Pintor, Lisboa</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1920&q=80"
            alt="background"
            className="w-full h-full object-cover opacity-10"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-[#0a0a0a]" />
        </div>
        <div className="relative z-10 text-center max-w-2xl mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Cria a tua conta e começa a receber pedidos organizados em poucos minutos.</h2>
          <Link href="/login" className="inline-block bg-[#c9a84c] text-black font-semibold px-10 py-4 rounded-full text-lg hover:bg-[#e0bf6a] transition-colors">
            Criar conta profissional
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <span className="text-lg font-semibold">Faço<span className="text-[#c9a84c]">PorTi</span></span>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/sobre" className="text-sm text-white/30 hover:text-white transition-colors">Sobre nós</Link>
            <Link href="/contactos" className="text-sm text-white/30 hover:text-white transition-colors">Contactos</Link>
            <Link href="/privacidade" className="text-sm text-white/30 hover:text-white transition-colors">Privacidade</Link>
            <Link href="/termos" className="text-sm text-white/30 hover:text-white transition-colors">Termos</Link>
            <Link href="/login" className="text-sm text-white/30 hover:text-white transition-colors">Entrar</Link>
          </div>
          <p className="text-sm text-white/20">© 2026 FaçoPorTi</p>
        </div>
      </footer>

    </main>
  )
}
