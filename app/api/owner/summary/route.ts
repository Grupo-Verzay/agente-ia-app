import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnerSummary } from "@/lib/owner-commands";
import { isOwnerCommandAuthorized, resolveOwnerCommand } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/summary
 *
 * Devuelve un resumen de solo lectura del día del dueño (tareas pendientes,
 * tareas que vencen hoy, citas de hoy). No modifica nada.
 *
 * Auth: header Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone }
 */

const bodySchema = z.object({
  userId: z.string().min(1),
  ownerPhone: z.string().min(7),
});

export async function POST(request: Request) {
  if (!process.env.OWNER_COMMANDS_KEY) {
    return NextResponse.json(
      { success: false, message: "OWNER_COMMANDS_KEY no está configurado." },
      { status: 500 },
    );
  }

  if (!isOwnerCommandAuthorized(request)) {
    return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Parámetros inválidos.", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const auth = await resolveOwnerCommand({
    userId: parsed.data.userId,
    ownerPhone: parsed.data.ownerPhone,
  });
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.reason }, { status: 403 });
  }

  try {
    const summary = await getOwnerSummary(auth.owner.ownerId);
    return NextResponse.json({ success: true, summary }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/summary]", error);
    return NextResponse.json(
      { success: false, message: "No se pudo generar el resumen." },
      { status: 500 },
    );
  }
}
