const FROM = 'onboarding@resend.dev'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://orcamentos-taupe.vercel.app'

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY não configurado')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Resend error ${res.status}: ${JSON.stringify(body)}`)
  }
}

function wrap(content: string) {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0c1a;color:#fff;border-radius:16px;overflow:hidden">
      ${content}
      <div style="padding:16px 32px;background:rgba(255,255,255,0.03);text-align:center">
        <p style="color:#334155;font-size:12px;margin:0">
          FaçoPorTi · <a href="${APP_URL}/privacidade" style="color:#334155">Privacidade</a> · <a href="${APP_URL}/termos" style="color:#334155">Termos</a>
        </p>
      </div>
    </div>
  `
}

// ── Novo lead para o profissional ─────────────────────────────────────────────
export async function emailNovoLead({
  profName, profEmail, profSpecialty,
  leadId, leadName, leadPhone, leadEmail,
  servico, area, prazo, notas, source, extraRows,
}: {
  profName: string; profEmail: string; profSpecialty: string
  leadId: string; leadName: string; leadPhone: string; leadEmail?: string
  servico: string; area?: string; prazo: string; notas?: string
  source: string; extraRows?: string
}) {
  const isMarketplace = source === 'marketplace'
  const badge = isMarketplace
    ? `<span style="background:#c9a84c;color:#000;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:20px;margin-left:8px">MARKETPLACE</span>`
    : `<span style="background:rgba(99,102,241,0.3);color:#818cf8;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:20px;margin-left:8px">LINK PESSOAL</span>`

  await sendEmail(profEmail, `🔔 Novo pedido — ${leadName} · ${servico}`, wrap(`
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 32px">
      <h2 style="margin:0;color:#fff;font-size:20px">🔔 Novo pedido de orçamento!</h2>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:14px">${profSpecialty} ${badge}</p>
    </div>
    <div style="padding:24px 32px">
      <p style="color:#94a3b8;margin:0 0 20px">Olá <strong style="color:#fff">${profName}</strong>, tens um novo pedido!</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px">
        <tr style="background:rgba(255,255,255,0.05)">
          <td style="padding:10px;color:#64748b;font-size:13px">Cliente</td>
          <td style="padding:10px;font-weight:bold;color:#fff">${leadName}</td>
        </tr>
        <tr>
          <td style="padding:10px;color:#64748b;font-size:13px">Telefone</td>
          <td style="padding:10px;color:#818cf8">${leadPhone}</td>
        </tr>
        ${leadEmail ? `<tr style="background:rgba(255,255,255,0.05)"><td style="padding:10px;color:#64748b;font-size:13px">Email</td><td style="padding:10px;color:#fff">${leadEmail}</td></tr>` : ''}
        <tr ${leadEmail ? '' : 'style="background:rgba(255,255,255,0.05)"'}>
          <td style="padding:10px;color:#64748b;font-size:13px">Serviço</td>
          <td style="padding:10px;color:#fff">${servico}</td>
        </tr>
        ${area ? `<tr><td style="padding:10px;color:#64748b;font-size:13px">Área</td><td style="padding:10px;color:#fff">${area}m²</td></tr>` : ''}
        <tr style="background:rgba(255,255,255,0.05)">
          <td style="padding:10px;color:#64748b;font-size:13px">Urgência</td>
          <td style="padding:10px;color:#fff">${prazo}</td>
        </tr>
        ${extraRows || ''}
        ${notas ? `<tr><td style="padding:10px;color:#64748b;font-size:13px">Descrição</td><td style="padding:10px;color:#94a3b8;font-style:italic">${notas}</td></tr>` : ''}
      </table>
      <a href="${APP_URL}/leads/${leadId}"
        style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
        Ver no dashboard →
      </a>
      ${leadPhone ? `
      <a href="https://wa.me/${leadPhone.replace(/\D/g, '')}"
        style="display:inline-block;margin-left:12px;background:#25d366;color:#000;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
        💬 WhatsApp
      </a>` : ''}
    </div>
  `))
}

// ── Boas-vindas ao profissional ───────────────────────────────────────────────
export async function emailBoasVindas({
  name, email, slug,
}: {
  name: string; email: string; slug: string
}) {
  await sendEmail(email, `Bem-vindo ao FaçoPorTi, ${name}!`, wrap(`
    <div style="background:linear-gradient(135deg,#c9a84c,#e0bf6a);padding:24px 32px">
      <h2 style="margin:0;color:#000;font-size:22px">Bem-vindo ao FaçoPorTi! 🎉</h2>
      <p style="margin:4px 0 0;color:rgba(0,0,0,0.6);font-size:14px">O teu perfil está ativo</p>
    </div>
    <div style="padding:24px 32px">
      <p style="color:#94a3b8;margin:0 0 16px">Olá <strong style="color:#fff">${name}</strong>,</p>
      <p style="color:#94a3b8;margin:0 0 24px">O teu perfil está pronto. Partilha o teu link pessoal com os teus clientes e começa a receber pedidos de orçamento automaticamente.</p>
      <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;margin:0 0 24px;text-align:center">
        <p style="color:#64748b;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px">O teu link pessoal</p>
        <p style="color:#818cf8;font-size:16px;font-weight:bold;margin:0">${APP_URL}/p/${slug}</p>
      </div>
      <a href="${APP_URL}/dashboard"
        style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
        Ir para o dashboard →
      </a>
    </div>
  `))
}

// ── Lead desbloqueado ─────────────────────────────────────────────────────────
export async function emailLeadDesbloqueado({
  profName, profEmail, leadName, leadPhone, leadEmail, leadId,
}: {
  profName: string; profEmail: string
  leadName: string; leadPhone: string; leadEmail?: string; leadId: string
}) {
  await sendEmail(profEmail, `🔓 Lead desbloqueado — ${leadName}`, wrap(`
    <div style="background:linear-gradient(135deg,#34d399,#059669);padding:24px 32px">
      <h2 style="margin:0;color:#fff;font-size:20px">🔓 Lead desbloqueado!</h2>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:14px">Os contactos estão disponíveis</p>
    </div>
    <div style="padding:24px 32px">
      <p style="color:#94a3b8;margin:0 0 20px">Olá <strong style="color:#fff">${profName}</strong>, desbloqueaste um lead do marketplace.</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
        <tr style="background:rgba(255,255,255,0.05)">
          <td style="padding:10px;color:#64748b;font-size:13px">Nome</td>
          <td style="padding:10px;font-weight:bold;color:#fff">${leadName}</td>
        </tr>
        <tr>
          <td style="padding:10px;color:#64748b;font-size:13px">Telefone</td>
          <td style="padding:10px;color:#34d399;font-weight:bold;font-size:16px">${leadPhone}</td>
        </tr>
        ${leadEmail ? `<tr style="background:rgba(255,255,255,0.05)"><td style="padding:10px;color:#64748b;font-size:13px">Email</td><td style="padding:10px;color:#fff">${leadEmail}</td></tr>` : ''}
      </table>
      <a href="${APP_URL}/leads/${leadId}"
        style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
        Ver lead →
      </a>
      ${leadPhone ? `
      <a href="https://wa.me/${leadPhone.replace(/\D/g, '')}"
        style="display:inline-block;margin-left:12px;background:#25d366;color:#000;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
        💬 WhatsApp
      </a>` : ''}
    </div>
  `))
}
