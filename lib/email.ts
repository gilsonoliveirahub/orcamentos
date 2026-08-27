import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateClientOptOutToken, generateProfessionalOptOutToken } from '@/lib/optout'
import { generateReviewToken } from '@/lib/review-token'

const FROM = 'FaçoPorTi <contacto@xn--faoporti-t0a.com>'
// Confirmado com teste real em 2026-07-16: a caixa contacto@ no Hostinger
// aceita mail endereçado à forma punycode (o bounce inicial era config
// desatualizada, corrigida do lado do Hostinger e reconfirmada via teste
// direto ao Resend antes desta alteração).
const REPLY_TO = 'contacto@xn--faoporti-t0a.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY não configurado')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, reply_to: REPLY_TO }),
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

// Rodapé só para emails PROMOCIONAIS — inclui o link de cancelamento. Nunca
// usado nos emails transacionais acima (pedido de orçamento, notificações),
// que não dependem de nenhum consentimento de marketing.
function wrapPromotional(content: string, unsubscribeUrl: string) {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0c1a;color:#fff;border-radius:16px;overflow:hidden">
      ${content}
      <div style="padding:16px 32px;background:rgba(255,255,255,0.03);text-align:center">
        <p style="color:#334155;font-size:12px;margin:0">
          FaçoPorTi · <a href="${APP_URL}/privacidade" style="color:#334155">Privacidade</a> · <a href="${APP_URL}/termos" style="color:#334155">Termos</a>
        </p>
        <p style="color:#334155;font-size:12px;margin:8px 0 0">
          <a href="${unsubscribeUrl}" style="color:#334155">Cancelar emails promocionais</a>
        </p>
      </div>
    </div>
  `
}

// ── Novo lead BLOQUEADO — nunca inclui dados de contacto do cliente ───────────
export async function emailNovoLeadBloqueado({
  profName, profEmail, profSpecialty, zoneApprox, isFreePlan,
}: {
  profName: string; profEmail: string; profSpecialty: string
  zoneApprox?: string | null; isFreePlan: boolean
}) {
  const ctaText = isFreePlan ? 'Ativar plano' : 'Desbloquear pedido'
  const ctaUrl = isFreePlan ? `${APP_URL}/upgrade` : `${APP_URL}/dashboard`

  await sendEmail(profEmail, `🔔 Novo pedido — ${profSpecialty}`, wrap(`
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 32px">
      <h2 style="margin:0;color:#fff;font-size:20px">🔒 Novo pedido de orçamento!</h2>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:14px">Os detalhes ficam disponíveis depois de ${isFreePlan ? 'ativares um plano' : 'desbloqueares'}</p>
    </div>
    <div style="padding:24px 32px">
      <p style="color:#94a3b8;margin:0 0 20px">Olá <strong style="color:#fff">${profName}</strong>, tens um novo pedido!</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px">
        <tr style="background:rgba(255,255,255,0.05)">
          <td style="padding:10px;color:#64748b;font-size:13px">Especialidade</td>
          <td style="padding:10px;font-weight:bold;color:#fff">${profSpecialty}</td>
        </tr>
        ${zoneApprox ? `<tr><td style="padding:10px;color:#64748b;font-size:13px">Zona</td><td style="padding:10px;color:#fff">${zoneApprox}</td></tr>` : ''}
      </table>
      <a href="${ctaUrl}"
        style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
        ${ctaText} →
      </a>
    </div>
  `))
}

// ── Novo lead para o profissional ─────────────────────────────────────────────
export async function emailNovoLead({
  profName, profEmail, profSpecialty,
  leadId, leadName, leadPhone, leadEmail,
  servico, area, prazo, notas, source, extraRows, mediaCount,
}: {
  profName: string; profEmail: string; profSpecialty: string
  leadId: string; leadName: string; leadPhone: string; leadEmail?: string
  servico: string; area?: string; prazo: string; notas?: string
  source: string; extraRows?: string; mediaCount?: number
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
        ${mediaCount ? `<tr style="background:rgba(255,255,255,0.05)"><td style="padding:10px;color:#64748b;font-size:13px">Fotos/vídeos</td><td style="padding:10px;color:#fff">📷 ${mediaCount} anexado${mediaCount === 1 ? '' : 's'} — ver no dashboard</td></tr>` : ''}
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

// ── Trial a expirar ───────────────────────────────────────────────────────────
export async function emailTrialAExpirar({
  name, email, slug, horasRestantes,
}: {
  name: string; email: string; slug: string; horasRestantes: number
}) {
  const isUltimosDias = horasRestantes <= 24
  await sendEmail(email, `⏳ O teu trial ${isUltimosDias ? 'expira amanhã' : 'expira em breve'} — FaçoPorTi`, wrap(`
    <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:24px 32px">
      <h2 style="margin:0;color:#000;font-size:20px">⏳ O teu trial está a expirar</h2>
      <p style="margin:4px 0 0;color:rgba(0,0,0,0.6);font-size:14px">${isUltimosDias ? 'Menos de 24 horas restantes' : `${Math.ceil(horasRestantes / 24)} dias restantes`}</p>
    </div>
    <div style="padding:24px 32px">
      <p style="color:#94a3b8;margin:0 0 16px">Olá <strong style="color:#fff">${name}</strong>,</p>
      <p style="color:#94a3b8;margin:0 0 24px">
        O teu período de trial gratuito ${isUltimosDias ? 'termina amanhã' : `termina em ${Math.ceil(horasRestantes / 24)} dias`}. Para continuares a receber pedidos de orçamento pelo teu link pessoal, escolhe um plano.
      </p>
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin:0 0 24px">
        <p style="color:#64748b;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px">O teu link pessoal</p>
        <p style="color:#818cf8;font-size:15px;font-weight:bold;margin:0">${APP_URL}/p/${slug}</p>
      </div>
      <a href="${APP_URL}/upgrade"
        style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
        Escolher plano →
      </a>
      <p style="color:#475569;font-size:12px;margin:20px 0 0">A partir de €19/mês · Sem compromisso · Cancela a qualquer momento</p>
    </div>
  `))
}

// ── Nova profissão desconhecida (notificação admin) ───────────────────────────
export async function emailNovaProfissao({
  profName, profEmail, specialty, slug,
}: {
  profName: string; profEmail: string; specialty: string; slug: string
}) {
  const ADMIN_EMAIL = 'gilsongomesoliveira1@hotmail.com'
  await sendEmail(ADMIN_EMAIL, `🆕 Nova profissão não suportada — ${specialty}`, wrap(`
    <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:24px 32px">
      <h2 style="margin:0;color:#000;font-size:20px">🆕 Nova profissão registada!</h2>
      <p style="margin:4px 0 0;color:rgba(0,0,0,0.6);font-size:14px">Profissão fora da lista — avaliar implementação</p>
    </div>
    <div style="padding:24px 32px">
      <p style="color:#94a3b8;margin:0 0 20px">Um novo profissional registou-se com uma profissão não suportada:</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
        <tr style="background:rgba(255,255,255,0.05)">
          <td style="padding:10px;color:#64748b;font-size:13px">Nome</td>
          <td style="padding:10px;font-weight:bold;color:#fff">${profName}</td>
        </tr>
        <tr>
          <td style="padding:10px;color:#64748b;font-size:13px">Email</td>
          <td style="padding:10px;color:#818cf8">${profEmail}</td>
        </tr>
        <tr style="background:rgba(255,255,255,0.05)">
          <td style="padding:10px;color:#64748b;font-size:13px">Profissão pedida</td>
          <td style="padding:10px;font-weight:bold;font-size:16px" style="color:#f59e0b">${specialty}</td>
        </tr>
        <tr>
          <td style="padding:10px;color:#64748b;font-size:13px">Link público</td>
          <td style="padding:10px;color:#818cf8">${APP_URL}/p/${slug}</td>
        </tr>
      </table>
      <p style="color:#64748b;font-size:13px">O profissional está a usar o formulário genérico até implementares perguntas específicas para esta área.</p>
      <a href="${APP_URL}/admin"
        style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
        Ver no admin →
      </a>
    </div>
  `))
}

// ── Novo registo (notificação admin) ─────────────────────────────────────────
export async function emailNovoRegisto({
  tipo, name, email, phone, specialty, slug,
}: {
  tipo: 'profissional' | 'cliente'
  name: string; email: string; phone?: string; specialty?: string; slug?: string
}) {
  const ADMIN_EMAIL = 'gilsongomesoliveira1@hotmail.com'
  const isPro = tipo === 'profissional'
  await sendEmail(ADMIN_EMAIL, `👤 Novo ${tipo} registado — ${name}`, wrap(`
    <div style="background:linear-gradient(135deg,${isPro ? '#6366f1,#8b5cf6' : '#34d399,#059669'});padding:24px 32px">
      <h2 style="margin:0;color:#fff;font-size:20px">👤 Novo ${tipo} registado!</h2>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:14px">${new Date().toLocaleString('pt-PT')}</p>
    </div>
    <div style="padding:24px 32px">
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
        <tr style="background:rgba(255,255,255,0.05)">
          <td style="padding:10px;color:#64748b;font-size:13px">Nome</td>
          <td style="padding:10px;font-weight:bold;color:#fff">${name}</td>
        </tr>
        <tr>
          <td style="padding:10px;color:#64748b;font-size:13px">Email</td>
          <td style="padding:10px;color:#818cf8">${email}</td>
        </tr>
        ${phone ? `<tr style="background:rgba(255,255,255,0.05)"><td style="padding:10px;color:#64748b;font-size:13px">Telefone</td><td style="padding:10px;color:#fff">${phone}</td></tr>` : ''}
        ${specialty ? `<tr><td style="padding:10px;color:#64748b;font-size:13px">Profissão</td><td style="padding:10px;color:#fff">${specialty}</td></tr>` : ''}
        ${slug ? `<tr style="background:rgba(255,255,255,0.05)"><td style="padding:10px;color:#64748b;font-size:13px">Link público</td><td style="padding:10px;color:#818cf8">${APP_URL}/p/${slug}</td></tr>` : ''}
      </table>
      <a href="${APP_URL}/admin"
        style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
        Ver no admin →
      </a>
    </div>
  `))
}

// ── Novo pagamento (notificação admin) ────────────────────────────────────────
export async function emailNovoPagamento({
  tipo, name, email, valor, plano,
}: {
  tipo: 'subscricao' | 'creditos'
  name: string; email: string; valor: string; plano?: string
}) {
  const ADMIN_EMAIL = 'gilsongomesoliveira1@hotmail.com'
  const isSubscricao = tipo === 'subscricao'
  await sendEmail(ADMIN_EMAIL, `💰 Novo pagamento — ${name} · ${valor}`, wrap(`
    <div style="background:linear-gradient(135deg,#c9a84c,#e0bf6a);padding:24px 32px">
      <h2 style="margin:0;color:#000;font-size:20px">💰 Novo pagamento recebido!</h2>
      <p style="margin:4px 0 0;color:rgba(0,0,0,0.6);font-size:14px">${isSubscricao ? `Subscrição — Plano ${plano}` : 'Compra de créditos marketplace'}</p>
    </div>
    <div style="padding:24px 32px">
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
        <tr style="background:rgba(255,255,255,0.05)">
          <td style="padding:10px;color:#64748b;font-size:13px">Nome</td>
          <td style="padding:10px;font-weight:bold;color:#fff">${name}</td>
        </tr>
        <tr>
          <td style="padding:10px;color:#64748b;font-size:13px">Email</td>
          <td style="padding:10px;color:#818cf8">${email}</td>
        </tr>
        <tr style="background:rgba(255,255,255,0.05)">
          <td style="padding:10px;color:#64748b;font-size:13px">Tipo</td>
          <td style="padding:10px;color:#fff">${isSubscricao ? 'Subscrição' : 'Créditos'}</td>
        </tr>
        ${plano ? `<tr><td style="padding:10px;color:#64748b;font-size:13px">Plano</td><td style="padding:10px;font-weight:bold;color:#c9a84c;font-size:16px">${plano}</td></tr>` : ''}
        <tr style="background:rgba(255,255,255,0.05)">
          <td style="padding:10px;color:#64748b;font-size:13px">Valor</td>
          <td style="padding:10px;font-weight:bold;color:#34d399;font-size:18px">${valor}</td>
        </tr>
      </table>
      <a href="${APP_URL}/admin"
        style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
        Ver no admin →
      </a>
    </div>
  `))
}

// ── Pedido de depoimento após trabalho fechado ────────────────────────────────
export async function emailPedidoDepoimento({
  tipo, name, email, outroNome, lead_id,
}: {
  tipo: 'profissional' | 'cliente'
  name: string; email: string; outroNome: string; lead_id?: string
}) {
  const isPro = tipo === 'profissional'
  const subject = isPro
    ? `Como correu o trabalho com ${outroNome}? Deixa a tua opinião`
    : `Como foi a experiência com ${outroNome}? Partilha a tua opinião`

  // O link só é gerado se REVIEW_TOKEN_SECRET estiver configurado — sem
  // token, /api/reviews recusa sempre a avaliação (ver lib/review-token.ts),
  // por isso nunca faz sentido mandar um link que conhecer o lead_id sozinho
  // já não é suficiente para usar.
  const reviewLink = lead_id && !isPro
    ? (() => {
        const secret = process.env.REVIEW_TOKEN_SECRET
        if (!secret) {
          console.error('[email] REVIEW_TOKEN_SECRET em falta — link de avaliação não incluído')
          return null
        }
        return `${APP_URL}/avaliar/${lead_id}?token=${generateReviewToken(lead_id, secret)}`
      })()
    : null

  await sendEmail(email, subject, wrap(`
    <div style="background:linear-gradient(135deg,#c9a84c,#e0bf6a);padding:24px 32px">
      <h2 style="margin:0;color:#000;font-size:20px">⭐ Conta-nos como correu!</h2>
      <p style="margin:4px 0 0;color:rgba(0,0,0,0.6);font-size:14px">A tua opinião ajuda outros ${isPro ? 'profissionais' : 'clientes'}</p>
    </div>
    <div style="padding:24px 32px">
      <p style="color:#94a3b8;margin:0 0 16px">Olá <strong style="color:#fff">${name}</strong>,</p>
      <p style="color:#94a3b8;margin:0 0 24px">
        ${isPro
          ? `O trabalho com <strong style="color:#fff">${outroNome}</strong> foi marcado como concluído. Ficámos contentes por ter chegado a bom porto!`
          : `O teu pedido de orçamento com <strong style="color:#fff">${outroNome}</strong> foi concluído. Esperamos que tenha corrido bem!`
        }
      </p>
      <p style="color:#94a3b8;margin:0 0 24px">
        ${reviewLink
          ? `A tua avaliação aparece no perfil público de <strong style="color:#fff">${outroNome}</strong> e ajuda outros clientes a escolher bem. Demora menos de 1 minuto!`
          : `Podes deixar o teu depoimento respondendo diretamente a este email — a tua opinião sobre o <strong style="color:#fff">FaçoPorTi</strong> ajuda-nos a melhorar.`
        }
      </p>
      <a href="${reviewLink || `mailto:gilsongomesoliveira1@hotmail.com?subject=Depoimento%20FaçoPorTi`}"
        style="display:inline-block;background:linear-gradient(135deg,#c9a84c,#e0bf6a);color:#000;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
        ⭐ Deixar avaliação →
      </a>
    </div>
  `))
}

// ── Follow-up automático (D+2 / D+5) ──────────────────────────────────────────
export async function emailFollowup({
  profName, profEmail, leadId, leadName, leadPhone, leadStatus, servico, days,
}: {
  profName: string; profEmail: string; leadId: string
  leadName?: string; leadPhone?: string; leadStatus: string; servico: string; days: number
}) {
  const isDay5 = days === 5
  const subject = isDay5
    ? `⚠️ Lead fria há 5 dias — ${leadName || 'Cliente'}`
    : `💡 Follow-up — Já contactaste ${leadName || 'o cliente'}?`

  await sendEmail(profEmail, subject, wrap(`
    <div style="background:${isDay5 ? 'linear-gradient(135deg,#ef4444,#f97316)' : 'linear-gradient(135deg,#f59e0b,#eab308)'};padding:20px 32px">
      <h2 style="margin:0;color:#fff;font-size:18px">
        ${isDay5 ? '⚠️ Lead sem resposta há 5 dias' : '💡 Já contactaste este cliente?'}
      </h2>
    </div>
    <div style="padding:24px 32px">
      <p style="color:#94a3b8;margin:0 0 16px">Olá <strong style="color:#fff">${profName}</strong>,</p>
      <p style="color:#94a3b8;margin:0 0 20px">
        ${isDay5
          ? `O lead de <strong style="color:#fff">${leadName || 'um cliente'}</strong> ainda está sem resposta há 5 dias. Considera fechar ou marcar como perdido.`
          : `Há 2 dias recebeste um pedido de <strong style="color:#fff">${leadName || 'um cliente'}</strong> para <strong style="color:#fff">${servico}</strong>. Já estabeleceste contacto?`
        }
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;background:rgba(255,255,255,0.03);border-radius:8px;overflow:hidden">
        <tr><td style="padding:10px;color:#64748b;font-size:13px">Cliente</td><td style="padding:10px;color:#fff;font-weight:bold">${leadName || '—'}</td></tr>
        <tr><td style="padding:10px;color:#64748b;font-size:13px">Telefone</td><td style="padding:10px;color:#818cf8">${leadPhone || '—'}</td></tr>
        <tr><td style="padding:10px;color:#64748b;font-size:13px">Serviço</td><td style="padding:10px;color:#fff">${servico}</td></tr>
        <tr><td style="padding:10px;color:#64748b;font-size:13px">Estado</td><td style="padding:10px;color:#fbbf24">${leadStatus}</td></tr>
      </table>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <a href="${APP_URL}/leads/${leadId}"
          style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px">
          Abrir lead →
        </a>
        ${leadPhone ? `
        <a href="https://wa.me/${leadPhone.replace(/\D/g, '')}"
          style="display:inline-block;background:#25d366;color:#000;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px">
          💬 WhatsApp
        </a>` : ''}
      </div>
    </div>
  `))
}

// ── Nudge para upgradar plano ─────────────────────────────────────────────────
// Enviado nos dias 1, 3 e 7 do trial de 7 dias (sempre a quem ainda está
// `plan: 'free'`, ver app/api/followup/route.ts) — ou seja, sempre a alguém
// com trial ativo (ou mesmo no limite dele no dia 7), nunca a quem já está
// sem trial há muito tempo. Por decisão de negócio, o trial dá acesso
// equivalente ao Starter (ver lib/effective-plan.ts): esta mensagem nunca
// pode dizer ou insinuar que o profissional está sem plano/sem acesso —
// só lembrar que o trial termina e incentivar a escolher Starter ou Pro
// para continuar com o mesmo acesso, sem interrupção.
export async function emailUpgradeNudge({
  name, email, totalLeads, dia,
}: {
  name: string; email: string; totalLeads: number; dia: number
}) {
  const diasRestantes = Math.max(0, 7 - dia)
  const subjects: Record<number, string> = {
    1: `O teu trial está ativo — já tens ${totalLeads} lead${totalLeads > 1 ? 's' : ''} no FaçoPorTi`,
    3: `${totalLeads} lead${totalLeads > 1 ? 's' : ''} no teu FaçoPorTi — o trial termina em ${diasRestantes} dias`,
    7: `${name}, o teu trial está a terminar`,
  }
  const subject = subjects[dia] || `Novos leads no FaçoPorTi — ${name}`
  const prazoTexto = dia >= 7 ? 'termina muito em breve' : `termina daqui a ${diasRestantes} dia${diasRestantes !== 1 ? 's' : ''}`

  await sendEmail(email, subject, wrap(`
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 32px">
      <h2 style="margin:0;color:#fff;font-size:20px">⚡ Trial ativo — acesso equivalente ao Starter</h2>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:14px">${dia >= 7 ? 'Termina muito em breve' : `Restam ${diasRestantes} dia${diasRestantes !== 1 ? 's' : ''}`}</p>
    </div>
    <div style="padding:24px 32px">
      <p style="color:#94a3b8;margin:0 0 16px">Olá <strong style="color:#fff">${name}</strong>,</p>
      <p style="color:#94a3b8;margin:0 0 24px">
        Já tens <strong style="color:#fff">${totalLeads} pedido${totalLeads > 1 ? 's' : ''} de orçamento</strong> no teu dashboard — o teu trial dá-te acesso equivalente ao plano Starter, sem custo, mas ${prazoTexto}. Escolhe Starter ou Pro para continuares sem interrupção.
      </p>
      <div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:20px;margin:0 0 24px;text-align:center">
        <p style="color:#818cf8;font-size:32px;font-weight:900;margin:0 0 4px">${totalLeads}</p>
        <p style="color:#64748b;font-size:13px;margin:0">pedido${totalLeads > 1 ? 's' : ''} no teu dashboard</p>
      </div>
      <a href="${APP_URL}/upgrade"
        style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
        Escolher Starter ou Pro — a partir de €19/mês →
      </a>
      <p style="color:#475569;font-size:12px;margin:20px 0 0">Sem compromisso · Cancela a qualquer momento</p>
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

// ══════════════════════════════════════════════════════════════════════════
// Emails PROMOCIONAIS — dois públicos separados, cada um com a sua própria
// fonte de verdade de consentimento e o seu próprio link de cancelamento.
// Nenhuma campanha automática é criada por estas funções — só a
// infraestrutura de envio, sempre condicionada ao consentimento verificado
// aqui dentro (nunca confiado ao chamador).
// ══════════════════════════════════════════════════════════════════════════

// ── Promocional para CLIENTES — verifica marketing_consents por email ────────
export async function emailPromocionalCliente({
  email, subject, contentHtml,
}: {
  email: string; subject: string; contentHtml: string
}) {
  const normalizedEmail = email.trim().toLowerCase()

  const { data: consent } = await supabaseAdmin
    .from('marketing_consents')
    .select('opted_in')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (!consent?.opted_in) {
    console.warn(`[email] emailPromocionalCliente bloqueado — sem consentimento (${normalizedEmail})`)
    return
  }

  const secret = process.env.EMAIL_OPTOUT_SECRET
  if (!secret) throw new Error('EMAIL_OPTOUT_SECRET não configurado')

  const token = generateClientOptOutToken(normalizedEmail, secret)
  const unsubscribeUrl = `${APP_URL}/cancelar-emails?email=${encodeURIComponent(normalizedEmail)}&token=${token}`

  await sendEmail(normalizedEmail, subject, wrapPromotional(contentHtml, unsubscribeUrl))
}

// ── Promocional para PROFISSIONAIS — verifica professionals.marketing_opt_in ─
export async function emailPromocionalProfissional({
  profId, profEmail, subject, contentHtml,
}: {
  profId: string; profEmail: string; subject: string; contentHtml: string
}) {
  const { data: prof } = await supabaseAdmin
    .from('professionals')
    .select('marketing_opt_in')
    .eq('id', profId)
    .maybeSingle()

  if (!prof?.marketing_opt_in) {
    console.warn(`[email] emailPromocionalProfissional bloqueado — sem opt-in (${profId})`)
    return
  }

  const secret = process.env.EMAIL_OPTOUT_SECRET
  if (!secret) throw new Error('EMAIL_OPTOUT_SECRET não configurado')

  const token = generateProfessionalOptOutToken(profId, secret)
  const unsubscribeUrl = `${APP_URL}/opt-out?id=${profId}&token=${token}`

  await sendEmail(profEmail, subject, wrapPromotional(contentHtml, unsubscribeUrl))
}
