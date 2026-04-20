import Link from 'next/link'

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white font-sans">

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/5">
        <span className="text-xl font-semibold tracking-tight">
          Faço<span className="text-[#c9a84c]">PorTi</span>
        </span>
        <div className="flex items-center gap-6">
          <Link href="/profissionais" className="text-sm text-white/60 hover:text-white transition-colors">Profissionais</Link>
          <a href="#como-funciona" className="text-sm text-white/60 hover:text-white transition-colors">Como funciona</a>
          <a href="#precos" className="text-sm text-white/60 hover:text-white transition-colors">Preços</a>
          <Link href="/login" className="text-sm text-white/60 hover:text-white transition-colors">Entrar</Link>
          <Link href="/pedir" className="text-sm bg-[#c9a84c] text-black font-medium px-4 py-2 rounded-full hover:bg-[#e0bf6a] transition-colors">
            Pedir orçamento
          </Link>
        </div>
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
            O teu negócio,<br />
            <span className="text-[#c9a84c]">mais clientes.</span>
          </h1>

          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Canalizador, eletricista, pintor, carpinteiro — cria o teu perfil, partilha o teu link e recebe pedidos qualificados diretamente. Sem concorrência. Sem pagar por lead.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/pedir" className="w-full sm:w-auto text-center bg-[#c9a84c] text-black font-semibold px-8 py-4 rounded-full text-lg hover:bg-[#e0bf6a] transition-colors">
              Pedir orçamento
            </Link>
            <Link href="/login" className="w-full sm:w-auto text-center border border-white/20 text-white px-8 py-4 rounded-full text-lg hover:border-white/40 transition-colors">
              Sou profissional
            </Link>
          </div>

          <p className="text-sm text-white/30 mt-6">Sem cartão de crédito • Resposta em minutos</p>
        </div>
      </section>

      {/* PROVA SOCIAL */}
      <section className="py-16 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-white/30 text-sm uppercase tracking-widest mb-10">Resultados reais</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '8+', label: 'Profissões suportadas' },
              { value: '2 min', label: 'Para gerar um orçamento' },
              { value: '€19', label: 'Para começar' },
              { value: '100%', label: 'Teus clientes, só teus' },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-4xl font-bold text-[#c9a84c] mb-2">{stat.value}</div>
                <div className="text-sm text-white/50">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="py-32 max-w-6xl mx-auto px-6">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Como funciona</h2>
          <p className="text-white/50 text-lg">Três passos simples para fechar mais trabalhos</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              step: '01',
              title: 'Partilhas o teu link',
              desc: 'Crias a tua conta e recebes um link pessoal. Partilhas no Instagram, WhatsApp, cartão de visita — onde quiseres.',
              image: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=600&q=80',
            },
            {
              step: '02',
              title: 'O cliente preenche',
              desc: 'O cliente responde a 12 perguntas simples sobre o trabalho. Envia fotos. Leva menos de 2 minutos.',
              image: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=600&q=80',
            },
            {
              step: '03',
              title: 'Tu recebes o lead qualificado',
              desc: 'Recebes o pedido com orçamento estimado já calculado, proposta pronta para enviar por WhatsApp e estado no teu pipeline.',
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
      </section>

      {/* DIFERENCIAL vs ZAASK */}
      <section className="py-24 bg-white/2 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Uma abordagem diferente</h2>
            <p className="text-white/50 text-lg">Noutras plataformas competis com outros profissionais. No FaçoPorTi, o cliente já é teu.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Zaask */}
            <div className="bg-white/3 border border-white/8 rounded-3xl p-8">
              <h3 className="text-xl font-semibold text-white/40 mb-6">Plataformas tradicionais</h3>
              <ul className="space-y-4">
                {[
                  'Cliente envia pedido a 5 pintores',
                  'Competis por preço',
                  'Pagas por cada lead',
                  'Clientes sem qualificação prévia',
                  'Sem controlo do processo',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-white/40">
                    <span className="text-red-400/60">✕</span> {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* FaçoPorTi */}
            <div className="bg-[#c9a84c]/5 border border-[#c9a84c]/20 rounded-3xl p-8">
              <h3 className="text-xl font-semibold text-[#c9a84c] mb-6">FaçoPorTi</h3>
              <ul className="space-y-4">
                {[
                  'O cliente chega diretamente a ti',
                  'Sem concorrência de preço',
                  'Plano fixo mensal, leads ilimitados',
                  'Lead qualificado com 12 perguntas + fotos',
                  'Tu geres o teu pipeline',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-white/80">
                    <span className="text-[#c9a84c]">✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* SCREENSHOT / PREVIEW */}
      <section className="py-32 max-w-6xl mx-auto px-6 text-center">
        <h2 className="text-4xl md:text-5xl font-bold mb-4">O teu dashboard</h2>
        <p className="text-white/50 text-lg mb-16">Todos os teus leads num só lugar. Pipeline visual, orçamentos automáticos, propostas prontas.</p>

        <div className="relative rounded-3xl overflow-hidden border border-white/10">
          <img
            src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1400&q=80"
            alt="Dashboard FaçoPorTi"
            className="w-full opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
            <Link href="/login" className="bg-[#c9a84c] text-black font-semibold px-8 py-3 rounded-full hover:bg-[#e0bf6a] transition-colors">
              Experimentar agora
            </Link>
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
                  'Até 10 leads/mês',
                  'Link pessoal',
                  'Orçamentos automáticos',
                  'Pipeline Kanban',
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
              <div className="text-4xl font-bold mb-1">€49<span className="text-lg font-normal text-white/40">/mês</span></div>
              <p className="text-white/40 -text-sm mb-8">Para profissionais a crescer</p>
              <ul className="space-y-3 mb-8">
                {[
                  'Leads ilimitados',
                  'Follow-up automático (D0/D2/D5)',
                  'Notificações WhatsApp',
                  'PDF de orçamento',
                  'Estatísticas avançadas',
                  'Suporte prioritário',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-3 text-white/80 text-sm">
                    <span className="text-[#c9a84c]">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="block text-center bg-[#c9a84c] text-black font-semibold py-3 rounded-full hover:bg-[#e0bf6a] transition-colors">
                Começar Pro
              </Link>
            </div>
          </div>
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
              <div className="font-semibold">Gilson Oliveira</div>
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
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Pronto para fechar mais trabalhos?</h2>
          <p className="text-white/50 text-lg mb-10">Cria a tua conta em 2 minutos.</p>
          <Link href="/login" className="inline-block bg-[#c9a84c] text-black font-semibold px-10 py-4 rounded-full text-lg hover:bg-[#e0bf6a] transition-colors">
            Criar conta
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-lg font-semibold">Faço<span className="text-[#c9a84c]">PorTi</span></span>
          <p className="text-sm text-white/30">© 2026 FaçoPorTi. Todos os direitos reservados.</p>
          <div className="flex gap-6">
            <a href="#" className="text-sm text-white/30 hover:text-white transition-colors">Privacidade</a>
            <a href="#" className="text-sm text-white/30 hover:text-white transition-colors">Termos</a>
            <Link href="/login" className="text-sm text-white/30 hover:text-white transition-colors">Entrar</Link>
          </div>
        </div>
      </footer>

    </main>
  )
}
