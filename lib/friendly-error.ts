// Traduz mensagens técnicas (Supabase Auth, Postgres/PostgREST) para
// português simples, sem expor detalhes internos ao utilizador final.
// Casos reconhecidos mantêm o significado (nunca colapsam em "erro genérico"
// quando se sabe exatamente o que aconteceu); só o que não é reconhecido cai
// no fallback genérico. Quem chama esta função deve continuar a registar o
// erro técnico original (ex: console.error) antes de traduzir — aqui só se
// decide o que é mostrado ao utilizador, nunca se decide deixar de o registar.

const FRIENDLY_ERROR_PATTERNS: Array<{ test: RegExp; message: string }> = [
  {
    test: /user already registered|already been registered|email.*already.*(exists|registered)|duplicate key.*email/i,
    message: 'Este email já está registado. Tente entrar ou recuperar a password.',
  },
  {
    test: /password.*(at least|should be|too short|weak)/i,
    message: 'A password é demasiado curta ou fraca. Use pelo menos 6 caracteres.',
  },
  {
    test: /invalid.*email|email.*invalid|unable to validate email/i,
    message: 'O email indicado não é válido.',
  },
  {
    test: /duplicate key value violates unique constraint/i,
    message: 'Já existe um registo com estes dados.',
  },
  {
    test: /violates not-null constraint/i,
    message: 'Falta preencher um campo obrigatório.',
  },
  {
    test: /violates foreign key constraint/i,
    message: 'Não foi possível concluir o pedido — um dos dados associados já não existe.',
  },
  {
    test: /rate limit|too many requests/i,
    message: 'Demasiados pedidos em pouco tempo. Aguarde um momento e tente novamente.',
  },
]

const GENERIC_FALLBACK = 'Não foi possível concluir o pedido. Tente novamente dentro de instantes.'

export function toFriendlyMessage(rawMessage: string | null | undefined): string {
  if (!rawMessage) return GENERIC_FALLBACK
  for (const { test, message } of FRIENDLY_ERROR_PATTERNS) {
    if (test.test(rawMessage)) return message
  }
  return GENERIC_FALLBACK
}
