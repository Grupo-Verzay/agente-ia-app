import { NextResponse } from "next/server";
import { z } from "zod";

import { assignOwnerAdvisor } from "@/lib/owner-commands";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/assign — asigna un contacto del dueño a un asesor de la cuenta
 * (resuelto por nombre), o lo libera.
 *
 * Acción que reasigna trabajo: requiere `confirmed: true` → 428 si falta.
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, sessionId, advisorName, confirmed }
 */
const bodySchema = ownerBaseSchema.extend({
  sessionId: z.number().int().positive(),
  advisorName: z.string().trim().min(1).max(60),
  confirmed: z.boolean().optional(),
});

export async function POST(request: Request) {
  const guard = await guardOwnerRequest(request, bodySchema);
  if (!guard.ok) return guard.response;

  if (guard.body.confirmed !== true) {
    return NextResponse.json(
      { success: false, message: "Esta acción requiere confirmación (confirmed: true).", requiresConfirmation: true },
      { status: 428 },
    );
  }

  try {
    const result = await assignOwnerAdvisor({
      ownerId: guard.owner.ownerId,
      sessionId: guard.body.sessionId,
      advisorName: guard.body.advisorName,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }
    return NextResponse.json({ success: true, message: "Asignación actualizada.", ...result.data }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/assign]", error);
    return NextResponse.json({ success: false, message: "No se pudo asignar el asesor." }, { status: 500 });
  }
}
