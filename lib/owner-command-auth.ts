import { db } from "@/lib/db";

/**
 * Autenticación e identidad para el "Modo Dueño por WhatsApp".
 *
 * Contexto: el agente de IA vive en el backend NestJS y, cuando reconoce que
 * quien escribe es el dueño de la cuenta, llama a los endpoints /api/owner/*
 * de esta app para ejecutar acciones administrativas (crear tarea, recordatorio,
 * resumen, etc.). Este módulo es la capa de seguridad de esos endpoints:
 *
 *   1. Secreto compartido (Bearer / x-owner-commands-secret) — solo el backend
 *      puede invocar estos endpoints. Calca el patrón de CRON_SECRET.
 *   2. Identidad del dueño — verifica que el número que dio la orden
 *      (ownerPhone) coincide con el número personal del dueño de la cuenta
 *      (User.notificationNumber). Defensa en profundidad: aunque el backend
 *      decida entrar en "modo dueño", esta app vuelve a validar la identidad
 *      antes de ejecutar nada.
 */

const KEY_HEADER = "x-owner-commands-secret";

/** Verifica el secreto compartido del canal de comandos de dueño. */
export function isOwnerCommandAuthorized(request: Request): boolean {
  const expected = (process.env.OWNER_COMMANDS_KEY ?? "").trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization");
  const secret = bearer?.startsWith("Bearer ")
    ? bearer.slice("Bearer ".length).trim()
    : (request.headers.get(KEY_HEADER) ?? "").trim();
  return secret.length > 0 && secret === expected;
}

/**
 * Compara dos números de teléfono de forma tolerante: normaliza a solo dígitos
 * y, si no son idénticos, compara por sufijo (últimos dígitos) para absorber
 * diferencias de prefijo de país (ej. "573001234567" vs "3001234567").
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = (a ?? "").replace(/\D/g, "");
  const dbn = (b ?? "").replace(/\D/g, "");
  if (da.length < 7 || dbn.length < 7) return false;
  if (da === dbn) return true;
  const suffixLen = Math.min(da.length, dbn.length, 10);
  return da.slice(-suffixLen) === dbn.slice(-suffixLen);
}

export type OwnerIdentity = {
  ownerId: string;
  name: string | null;
  role: string;
};

export type ResolveOwnerResult =
  | { ok: true; owner: OwnerIdentity }
  | { ok: false; reason: string };

/**
 * Verifica que quien envió el comando (ownerPhone) es el dueño de la cuenta
 * (userId). En Fase 1 solo se autoriza al titular de la cuenta; ampliar a
 * cuentas vinculadas con rol administrador queda para una fase posterior.
 */
export async function resolveOwnerCommand(params: {
  userId: string;
  ownerPhone: string;
}): Promise<ResolveOwnerResult> {
  const account = await db.user.findUnique({
    where: { id: params.userId },
    select: { id: true, name: true, role: true, notificationNumber: true },
  });

  if (!account) return { ok: false, reason: "Cuenta no encontrada." };

  if (!phonesMatch(params.ownerPhone, account.notificationNumber)) {
    return {
      ok: false,
      reason: "El número no está autorizado para administrar esta cuenta.",
    };
  }

  return {
    ok: true,
    owner: { ownerId: account.id, name: account.name, role: account.role },
  };
}
