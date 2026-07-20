import { NextResponse } from "next/server";
import { z } from "zod";

import { listOwnerTasks } from "@/lib/owner-commands";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/tasks — lista de solo lectura de las tareas del dueño con DETALLE
 * (título, tipo, vencimiento, contacto, responsable). El resumen (/api/owner/summary)
 * solo da el conteo.
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, scope? ("pending"|"today"), limit? }
 */
const bodySchema = ownerBaseSchema.extend({
  scope: z.enum(["pending", "today"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  const guard = await guardOwnerRequest(request, bodySchema);
  if (!guard.ok) return guard.response;

  try {
    const tasks = await listOwnerTasks(guard.owner.ownerId, {
      scope: guard.body.scope,
      limit: guard.body.limit,
    });
    return NextResponse.json({ success: true, count: tasks.length, tasks }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/tasks]", error);
    return NextResponse.json({ success: false, message: "No se pudieron cargar las tareas." }, { status: 500 });
  }
}
