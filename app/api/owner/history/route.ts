import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeConsulta } from "@/lib/rutas-del-dueno.server";
import { elHistorial } from "@/lib/motor-del-dueno.server";

/**
 * POST /api/owner/history — las últimas acciones hechas por el Modo Dueño.
 *
 * Consulta: pasa por el motor (plan del módulo + bitácora).
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  limit: z.number().int().min(1).max(30).optional(),
});

export async function POST(request: Request) {
  return rutaDeConsulta(request, bodySchema, "owner_ver_historial_acciones", async (quien, body) => ({ acciones: await elHistorial(quien, body.limit) }));
}
