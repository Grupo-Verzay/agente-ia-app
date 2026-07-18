import { NextResponse } from "next/server";
import { z } from "zod";

import { getOwnerTraining } from "@/lib/owner-training";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/training/get — lee la sección de entrenamiento actual del
 * dueño (solo lectura). Sirve para que el agente muestre qué instrucciones tiene.
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, agentId? }
 */
const bodySchema = ownerBaseSchema.extend({
  agentId: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  const guard = await guardOwnerRequest(request, bodySchema);
  if (!guard.ok) return guard.response;

  try {
    const result = await getOwnerTraining(guard.owner.ownerId, guard.body.agentId);
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }
    return NextResponse.json({ success: true, training: result.data }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/training/get]", error);
    return NextResponse.json({ success: false, message: "No se pudo leer el entrenamiento." }, { status: 500 });
  }
}
