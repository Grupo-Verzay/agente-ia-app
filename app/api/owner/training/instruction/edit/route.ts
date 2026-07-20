import { NextResponse } from "next/server";
import { z } from "zod";

import { updateOwnerTrainingInstruction } from "@/lib/owner-training";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/training/instruction/edit — edita una instrucción existente del
 * entrenamiento (por su id de step) y publica una nueva revisión (reversible).
 *
 * Acción sensible: requiere `confirmed: true` → 428 si falta.
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, stepId, title?, instruction?, agentId?, confirmed }
 */
const bodySchema = ownerBaseSchema
  .extend({
    stepId: z.string().trim().min(1),
    instruction: z.string().trim().min(1).max(2000).optional(),
    title: z.string().trim().min(1).max(80).optional(),
    agentId: z.string().trim().min(1).optional(),
    confirmed: z.boolean().optional(),
  })
  .refine((b) => b.instruction !== undefined || b.title !== undefined, {
    message: "Indica el nuevo texto (instruction) y/o el título a cambiar.",
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
    const result = await updateOwnerTrainingInstruction({
      ownerId: guard.owner.ownerId,
      agentId: guard.body.agentId,
      stepId: guard.body.stepId,
      title: guard.body.title,
      instruction: guard.body.instruction,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }
    return NextResponse.json(
      { success: true, message: "Instrucción editada y publicada.", ...result.data },
      { status: 200 },
    );
  } catch (error) {
    console.error("[POST /api/owner/training/instruction/edit]", error);
    return NextResponse.json({ success: false, message: "No se pudo actualizar el entrenamiento." }, { status: 500 });
  }
}
