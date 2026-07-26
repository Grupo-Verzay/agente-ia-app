import { currentUser } from "@/lib/auth";

/**
 * Cuenta a la que pertenece la sección Finanzas.
 *
 * Finanzas escopa por la CUENTA QUE SE ESTÁ VIENDO (`effectiveId`), igual que el
 * resto del sistema (productos, CRM, chats). Eso resuelve bien los dos casos:
 *
 * - Asesor / sub-usuario: `effectiveId` es el id del DUEÑO, así que ve el dinero
 *   de la cuenta original y no una contabilidad partida por asesor.
 * - Admin o reseller que administra otras cuentas: al cambiarse a una de ellas,
 *   `effectiveId` es esa cuenta, así que ve las finanzas de esa cuenta y no las
 *   suyas.
 *
 * Usar este helper en TODAS las pantallas/acciones de Finanzas para que todas
 * escopen por la misma cuenta y no mezclen datos (p. ej. cuentas de una cuenta
 * en una pantalla y de otra en la siguiente).
 */
export async function getFinanceUser(): Promise<{ id: string; preferredCurrencyCode: string | null } | null> {
  const user = await currentUser();
  if (!user) return null;

  const id = user.effectiveId ?? user.id;
  return id ? { id, preferredCurrencyCode: user.preferredCurrencyCode } : null;
}
