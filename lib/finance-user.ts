import { auth } from "@/auth";
import { db } from "@/lib/db";

/**
 * Cuenta a la que pertenece la sección Finanzas.
 *
 * Finanzas es SIEMPRE "por cuenta": debe mostrar los datos del titular logueado
 * (sus cuentas, ventas, gastos), no de una cuenta que se esté navegando por
 * impersonación / "cuenta activa". Por eso se resuelve por el email de la sesión
 * (estable ante impersonación), igual que la página de Cuentas.
 *
 * Usar este helper en TODAS las pantallas/acciones de Finanzas para que todas
 * escopen por la misma cuenta y no mezclen datos (p. ej. cuentas reales en una
 * pantalla y de demo en otra).
 */
export async function getFinanceUser(): Promise<{ id: string; preferredCurrencyCode: string | null } | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  const me = await db.user.findUnique({
    where: { email },
    select: { id: true, preferredCurrencyCode: true },
  });
  return me?.id ? { id: me.id, preferredCurrencyCode: me.preferredCurrencyCode } : null;
}
