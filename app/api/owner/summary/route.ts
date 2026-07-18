import { NextResponse } from "next/server";

import { getOwnerSummary } from "@/lib/owner-commands";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/summary — resumen de solo lectura del día del dueño
 * (tareas pendientes, tareas que vencen hoy, citas de hoy). No modifica nada.
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone }
 */
export async function POST(request: Request) {
  const guard = await guardOwnerRequest(request, ownerBaseSchema);
  if (!guard.ok) return guard.response;

  try {
    const summary = await getOwnerSummary(guard.owner.ownerId);
    return NextResponse.json({ success: true, summary }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/summary]", error);
    return NextResponse.json({ success: false, message: "No se pudo generar el resumen." }, { status: 500 });
  }
}
