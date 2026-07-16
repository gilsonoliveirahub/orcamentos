import { supabaseAdmin } from '@/lib/supabase-admin'

// Versão do texto de consentimento mostrado ao cliente — se o texto da
// checkbox mudar no futuro, sobe-se este valor para distinguir, em auditoria,
// sob que redação cada consentimento foi dado.
export const CLIENT_CONSENT_VERSION = 'v1'

export type ClientConsentSource = 'pedir' | 'p_slug'

export type ClientConsentFields = {
  marketing_opt_in: boolean
  marketing_opt_in_at: string | null
  marketing_consent_version: string | null
  marketing_consent_source: ClientConsentSource | null
}

/**
 * Calcula os campos de consentimento a gravar DIRETAMENTE no lead — nunca
 * confia no corpo do pedido para consent_version/consent_source (só o
 * booleano da checkbox vem do cliente; a versão e a origem são sempre
 * definidas aqui, no servidor).
 */
export function computeClientConsentFields(rawOptIn: unknown, source: ClientConsentSource): ClientConsentFields {
  const optedIn = rawOptIn === true
  if (!optedIn) {
    return {
      marketing_opt_in: false,
      marketing_opt_in_at: null,
      marketing_consent_version: null,
      marketing_consent_source: null,
    }
  }
  return {
    marketing_opt_in: true,
    marketing_opt_in_at: new Date().toISOString(),
    marketing_consent_version: CLIENT_CONSENT_VERSION,
    marketing_consent_source: source,
  }
}

/**
 * Atualiza a fonte de verdade por email (marketing_consents) — só quando há
 * opt-in E email. Sem email não há para onde enviar, por isso não se cria
 * registo nenhum (o consentimento fica só documentado no próprio lead).
 * Um único email pode aparecer em vários leads ao longo do tempo; este
 * upsert garante que o estado mais recente por email é sempre o que decide
 * se um envio futuro pode acontecer.
 */
export async function upsertClientMarketingConsent(params: {
  email: string | null | undefined
  leadId: string
  fields: ClientConsentFields
}) {
  const { email, leadId, fields } = params
  if (!fields.marketing_opt_in || !email) return

  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return

  const { error } = await supabaseAdmin.from('marketing_consents').upsert(
    {
      email: normalizedEmail,
      opted_in: true,
      opted_in_at: fields.marketing_opt_in_at,
      consent_version: fields.marketing_consent_version,
      consent_source: fields.marketing_consent_source,
      lead_id: leadId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'email' }
  )

  if (error) {
    console.error(`[marketing-consent] falha ao registar consentimento (${normalizedEmail}): ${error.message}`)
  }
}
