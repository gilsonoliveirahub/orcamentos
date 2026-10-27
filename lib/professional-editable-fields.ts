// Campos que um admin (ou o Aquiles, em nome de um admin que aprovou) tem
// permissão para alterar no perfil de outro profissional. Nunca inclui
// email (login), password, user_id, nem nada relacionado com
// Stripe/subscrições/créditos — extraído de app/api/admin/professionals/
// [id]/route.ts para ser a mesma lista em qualquer caminho de escrita.
export const EDITABLE_PROFESSIONAL_FIELDS = ['name', 'phone', 'specialties', 'zone', 'description', 'active'] as const
export type EditableProfessionalField = (typeof EDITABLE_PROFESSIONAL_FIELDS)[number]
