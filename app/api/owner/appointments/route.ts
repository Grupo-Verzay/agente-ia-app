import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeConsulta } from "@/lib/rutas-del-dueno.server";
import { listOwnerAppointments } from "@/lib/owner-commands";

/**
 * POST /api/owner/appointments — citas del dueño con su detalle.
 *
 * Consulta: pasa por el motor (plan del módulo + bitácora).
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  scope: z.enum(["today", "upcoming"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  return rutaDeConsulta(request, bodySchema, "owner_listar_citas", async (quien, body) => {
    const appointments = await listOwnerAppointments(quien.cuentaId, { scope: body.scope, limit: body.limit });
    return { count: appointments.length, appointments };
  });
}
