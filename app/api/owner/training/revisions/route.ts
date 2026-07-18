import { NextResponse } from "next/server";
import { z } from "zod";

import { listOwnerTrainingRevisions } from "@/lib/owner-training";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/training/revisions — lista el historial de revisiones del
 * entrenamiento del dueño (solo lectura). Referencia para hacer rollback.
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
    const result = await listOwnerTrainingRevisions(guard.owner.ownerId, guard.body.agentId);
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }
    return NextResponse.json({ success: true, ...result.data }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/training/revisions]", error);
    return NextResponse.json({ success: false, message: "No se pudieron cargar las revisiones." }, { status: 500 });
  }
}
