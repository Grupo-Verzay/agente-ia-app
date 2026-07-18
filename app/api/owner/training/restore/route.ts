import { NextResponse } from "next/server";
import { z } from "zod";

import { restoreOwnerTraining } from "@/lib/owner-training";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/training/restore — restaura el entrenamiento a una revisión
 * previa y la republica (rollback). Red de seguridad si un cambio empeoró al
 * agente.
 *
 * Acción sensible: requiere `confirmed: true` → 428 si falta.
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, revisionNumber, agentId?, confirmed }
 */
const bodySchema = ownerBaseSchema.extend({
  revisionNumber: z.number().int().positive(),
  agentId: z.string().trim().min(1).optional(),
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
    const result = await restoreOwnerTraining({
      ownerId: guard.owner.ownerId,
      agentId: guard.body.agentId,
      revisionNumber: guard.body.revisionNumber,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }
    return NextResponse.json(
      { success: true, message: "Entrenamiento restaurado.", ...result.data },
      { status: 200 },
    );
  } catch (error) {
    console.error("[POST /api/owner/training/restore]", error);
    return NextResponse.json({ success: false, message: "No se pudo restaurar el entrenamiento." }, { status: 500 });
  }
}
