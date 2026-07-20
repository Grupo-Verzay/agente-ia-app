import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteOwnerTrainingInstruction } from "@/lib/owner-training";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/training/instruction/delete — elimina una instrucción del
 * entrenamiento (por su id de step) y publica una nueva revisión. Reversible: la
 * instrucción sigue en el snapshot anterior (se puede restaurar).
 *
 * Acción sensible: requiere `confirmed: true` → 428 si falta.
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, stepId, agentId?, confirmed }
 */
const bodySchema = ownerBaseSchema.extend({
  stepId: z.string().trim().min(1),
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
    const result = await deleteOwnerTrainingInstruction({
      ownerId: guard.owner.ownerId,
      agentId: guard.body.agentId,
      stepId: guard.body.stepId,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }
    return NextResponse.json(
      { success: true, message: "Instrucción eliminada y publicada.", ...result.data },
      { status: 200 },
    );
  } catch (error) {
    console.error("[POST /api/owner/training/instruction/delete]", error);
    return NextResponse.json({ success: false, message: "No se pudo actualizar el entrenamiento." }, { status: 500 });
  }
}
