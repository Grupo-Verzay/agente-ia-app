import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";

/**
 * Autenticación e identidad para el "Modo Dueño por WhatsApp".
 *
 * Contexto: el agente de IA vive en el backend NestJS y, cuando reconoce que
 * quien escribe es el dueño de la cuenta, llama a los endpoints /api/owner/*
 * de esta app para ejecutar acciones administrativas (crear tarea, enviar
 * mensaje a un contacto, mover un lead, etc.). Este módulo es la capa de
 * seguridad de esos endpoints:
 *
 *   1. Secreto compartido (Bearer / x-owner-commands-secret) — solo el backend
 *      puede invocar estos endpoints. Calca el patrón de CRON_SECRET.
 *   2. Identidad del dueño — verifica que el número que dio la orden
 *      (ownerPhone) coincide con el número personal del dueño de la cuenta
 *      (User.notificationNumber). Defensa en profundidad: aunque el backend
 *      decida entrar en "modo dueño", esta app revalida la identidad antes de
 *      ejecutar nada.
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
 * (userId). En Fase 1/2 solo se autoriza al titular de la cuenta; ampliar a
 * cuentas vinculadas con rol administrador queda para una fase posterior.
 */
export async function resolveOwnerCommand(params: {
  userId: string;
  ownerPhone: string;
}): Promise<ResolveOwnerResult> {
  const account = await db.user.findUnique({
    where: { id: params.userId },
    select: { id: true, name: true, role: true, notificationNumber: true, ownerModeEnabled: true },
  });

  if (!account) return { ok: false, reason: "Cuenta no encontrada." };

  // Falla cerrado: el Modo Dueño está apagado por defecto y debe activarse por cuenta.
  if (!account.ownerModeEnabled) {
    return { ok: false, reason: "El Modo Dueño no está activado para esta cuenta." };
  }

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

/** Campos base que todo comando de dueño debe incluir. */
export const ownerBaseSchema = z.object({
  userId: z.string().min(1),
  ownerPhone: z.string().min(7),
});

export type GuardResult<TBody> =
  | { ok: true; owner: OwnerIdentity; body: TBody }
  | { ok: false; response: NextResponse };

/**
 * Guardia común para los endpoints /api/owner/*: valida el secreto compartido,
 * parsea y valida el body con `schema` (que debe extender ownerBaseSchema) y
 * resuelve/verifica la identidad del dueño. Devuelve el dueño y el body ya
 * validado, o una respuesta HTTP de error lista para retornar.
 */
export async function guardOwnerRequest<T extends z.ZodObject<any>>(
  request: Request,
  schema: T,
): Promise<GuardResult<z.infer<T>>> {
  const fail = (message: string, status: number, extra?: Record<string, unknown>) => ({
    ok: false as const,
    response: NextResponse.json({ success: false, message, ...extra }, { status }),
  });

  if (!process.env.OWNER_COMMANDS_KEY) {
    return fail("OWNER_COMMANDS_KEY no está configurado.", 500);
  }
  if (!isOwnerCommandAuthorized(request)) {
    return fail("No autorizado.", 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("JSON inválido.", 400);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return fail("Parámetros inválidos.", 422, { issues: parsed.error.flatten() });
  }

  const body = parsed.data as z.infer<T> & { userId: string; ownerPhone: string };
  const auth = await resolveOwnerCommand({ userId: body.userId, ownerPhone: body.ownerPhone });
  if (!auth.ok) {
    return fail(auth.reason, 403);
  }

  return { ok: true, owner: auth.owner, body: parsed.data };
}
