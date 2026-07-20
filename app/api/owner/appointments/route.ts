import { NextResponse } from "next/server";
import { z } from "zod";

import { listOwnerAppointments } from "@/lib/owner-commands";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/appointments — lista de solo lectura de las citas del dueño con
 * sus DETALLES (nombre del cliente, teléfono, hora, servicio, estado). El resumen
 * (/api/owner/summary) solo da el conteo; esto da los datos para atenderlas.
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, scope? ("today"|"upcoming"), limit? }
 */
const bodySchema = ownerBaseSchema.extend({
  scope: z.enum(["today", "upcoming"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  const guard = await guardOwnerRequest(request, bodySchema);
  if (!guard.ok) return guard.response;

  try {
    const appointments = await listOwnerAppointments(guard.owner.ownerId, {
      scope: guard.body.scope,
      limit: guard.body.limit,
    });
    return NextResponse.json(
      { success: true, count: appointments.length, appointments },
      { status: 200 },
    );
  } catch (error) {
    console.error("[POST /api/owner/appointments]", error);
    return NextResponse.json({ success: false, message: "No se pudieron cargar las citas." }, { status: 500 });
  }
}
