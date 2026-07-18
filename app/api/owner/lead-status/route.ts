import { NextResponse } from "next/server";
import { z } from "zod";

import { moveOwnerLeadStatus } from "@/lib/owner-commands";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/lead-status — cambia el estado de lead (kanban) de un contacto
 * del dueño.
 *
 * Acción que toca a un tercero (dispara notificación/automatizaciones de etapa):
 * requiere `confirmed: true`. Sin confirmación → 428.
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, sessionId, status, confirmed }
 */
const bodySchema = ownerBaseSchema.extend({
  sessionId: z.number().int().positive(),
  status: z.enum(["FRIO", "TIBIO", "CALIENTE", "FINALIZADO", "DESCARTADO"]),
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
    const result = await moveOwnerLeadStatus({
      ownerId: guard.owner.ownerId,
      sessionId: guard.body.sessionId,
      status: guard.body.status,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }
    return NextResponse.json({ success: true, message: "Estado del lead actualizado.", ...result.data }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/lead-status]", error);
    return NextResponse.json({ success: false, message: "No se pudo actualizar el estado." }, { status: 500 });
  }
}
