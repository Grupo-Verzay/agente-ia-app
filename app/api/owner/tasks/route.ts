import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeConsulta } from "@/lib/rutas-del-dueno.server";
import { listOwnerTasks } from "@/lib/owner-commands";

/**
 * POST /api/owner/tasks — tareas pendientes o de hoy, con detalle.
 *
 * Consulta: pasa por el motor (plan del módulo + bitácora).
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  scope: z.enum(["pending", "today"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  return rutaDeConsulta(request, bodySchema, "owner_listar_tareas", async (quien, body) => {
    const tasks = await listOwnerTasks(quien.cuentaId, { scope: body.scope, limit: body.limit });
    return { count: tasks.length, tasks };
  });
}
