import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { elNumeroEsDelDueno } from "@/lib/identidad-del-dueno";
import { laPersonaDelNumero } from "@/lib/identidad-del-dueno.server";
import type { QuienOrdena } from "@/lib/motor-del-dueno.server";

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
 *   2. Identidad — el número que dio la orden (ownerPhone) tiene que ser el de
 *      una de las personas autorizadas de la cuenta (`ownerModePhone`, o
 *      `notificationNumber` si no hay lista), con `elNumeroEsDelDueno`.
 *      Defensa en profundidad: aunque el backend decida entrar en "modo
 *      dueño", esta app revalida la identidad antes de ejecutar nada. El
 *      segundo factor (código del panel) lo exige el motor para preparar.
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
 * ¿Este número es el de la persona guardada? Antes comparaba solo los últimos
 * diez dígitos y dejaba entrar al mismo número de OTRO país; ahora decide
 * `elNumeroEsDelDueno` (la misma regla que el motor, copiada byte a byte).
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return elNumeroEsDelDueno(a, b);
}

export type OwnerIdentity = {
  ownerId: string;
  name: string | null;
  role: string;
  /** El teléfono de la PERSONA autorizada tal como está guardado. */
  personPhone: string;
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
    select: {
      id: true,
      name: true,
      role: true,
      notificationNumber: true,
      ownerModeEnabled: true,
      ownerModePhone: true,
    },
  });

  if (!account) return { ok: false, reason: "Cuenta no encontrada." };

  // Falla cerrado: el Modo Dueño está apagado por defecto y debe activarse por cuenta.
  if (!account.ownerModeEnabled) {
    return { ok: false, reason: "El Modo Dueño no está activado para esta cuenta." };
  }

  // Lista de personas autorizadas (dueño/socio/admin). Si está vacía, cae al
  // número de notificación del titular.
  const persona = laPersonaDelNumero(account, params.ownerPhone);
  if (!persona) {
    return {
      ok: false,
      reason: "El número no está autorizado para administrar esta cuenta.",
    };
  }

  return {
    ok: true,
    owner: { ownerId: account.id, name: persona.name ?? account.name, role: account.role, personPhone: persona.phone },
  };
}

/** Campos base que todo comando de dueño debe incluir. */
export const ownerBaseSchema = z.object({
  userId: z.string().min(1),
  ownerPhone: z.string().min(7),
  /** whatsapp_texto | whatsapp_audio | … — para la bitácora. */
  canal: z.string().trim().min(1).max(40).optional(),
  /** El texto exacto de la orden (o la transcripción de la nota de voz). */
  pedido: z.string().max(8000).optional(),
});

export type GuardResult<TBody> =
  | { ok: true; owner: OwnerIdentity; quien: QuienOrdena; body: TBody }
  | { ok: false; response: NextResponse };

/**
 * Guardia común para los endpoints /api/owner/*: valida el secreto compartido,
 * parsea y valida el body con `schema` (que debe extender ownerBaseSchema; vale
 * cualquier esquema de Zod, tambien uno con `.refine()`, porque aqui solo se le
 * pide `safeParse`) y
 * resuelve/verifica la identidad del dueño. Devuelve el dueño y el body ya
 * validado, o una respuesta HTTP de error lista para retornar.
 */
export async function guardOwnerRequest<T extends z.ZodTypeAny>(
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

  const body = parsed.data as z.infer<T> & { userId: string; ownerPhone: string; canal?: string; pedido?: string };
  const auth = await resolveOwnerCommand({ userId: body.userId, ownerPhone: body.ownerPhone });
  if (!auth.ok) {
    return fail(auth.reason, 403);
  }

  return {
    ok: true,
    owner: auth.owner,
    quien: {
      cuentaId: auth.owner.ownerId,
      personaTelefono: auth.owner.personPhone,
      personaNombre: auth.owner.name,
      canal: body.canal ?? "whatsapp_texto",
      pedido: body.pedido ?? null,
    },
    body: parsed.data,
  };
}
