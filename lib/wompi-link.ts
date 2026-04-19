/**
 * Utilidades para generar links y referencias de pago Wompi.
 *
 * Referencia embebida: verzay-{userId}-{planCode}-{timestamp}
 * Esta referencia viaja en el link de Wompi y permite al webhook
 * identificar automáticamente al cliente cuando se confirma el pago.
 */

export type VerzayPlanCode =
  | 'plan49'
  | 'plan49-50'
  | 'plan99'
  | 'plan99-50'
  | 'plan119-50'
  | 'plan149'
  | 'plan249'
  | 'agente-ia';

/**
 * Genera la referencia que debe incluirse en el link de pago de Wompi.
 *
 * @example
 * buildWompiReference('cm842kthc0000qd2l', 'plan99')
 * // → 'verzay-cm842kthc0000qd2l-plan99-1712534400000'
 */
export function buildWompiReference(
  clientUserId: string,
  planCode: VerzayPlanCode | string,
): string {
  const ts = Date.now();
  return `verzay-${clientUserId}-${planCode}-${ts}`;
}

/**
 * Extrae el clientUserId de una referencia Wompi.
 * Útil para depuración o listados en el panel de admin.
 */
export function extractClientUserIdFromReference(reference: string): string | null {
  if (!reference?.startsWith('verzay-')) return null;
  const rest = reference.slice('verzay-'.length);
  const parts = rest.split('-');
  if (parts.length < 3) return null;
  return parts.slice(0, parts.length - 2).join('-') || null;
}
