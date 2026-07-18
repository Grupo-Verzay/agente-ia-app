import { NextResponse } from "next/server";
import { z } from "zod";

import { appendOwnerTrainingInstruction } from "@/lib/owner-training";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/training/instruction — agrega una instrucción al entrenamiento
 * del agente y publica una nueva revisión (queda activa y es reversible).
 *
 * Solo AGREGA (append de un step); nunca reescribe ni borra lo existente.
 * Acción sensible: requiere `confirmed: true` → 428 si falta.
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, instruction, title?, agentId?, confirmed }
 */
const bodySchema = ownerBaseSchema.extend({
  instruction: z.string().trim().min(1).max(2000),
  title: z.string().trim().min(1).max(80).optional(),
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
    const result = await appendOwnerTrainingInstruction({
      ownerId: guard.owner.ownerId,
      agentId: guard.body.agentId,
      title: guard.body.title,
      instruction: guard.body.instruction,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }
    return NextResponse.json(
      { success: true, message: "Instrucción agregada y publicada.", ...result.data },
      { status: 200 },
    );
  } catch (error) {
    console.error("[POST /api/owner/training/instruction]", error);
    return NextResponse.json({ success: false, message: "No se pudo actualizar el entrenamiento." }, { status: 500 });
  }
}
