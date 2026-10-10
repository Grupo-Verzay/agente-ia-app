import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeConsulta } from "@/lib/rutas-del-dueno.server";
import { listOwnerTrainingRevisions } from "@/lib/owner-training";

/**
 * POST /api/owner/training/revisions — versiones guardadas del entrenamiento.
 *
 * Consulta: pasa por el motor (plan del módulo + bitácora).
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  agentId: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  return rutaDeConsulta(request, bodySchema, "owner_listar_revisiones_entrenamiento", async (quien, body) => {
    const r = await listOwnerTrainingRevisions(quien.cuentaId, body.agentId);
    return r.ok ? { ...r.data } : { ok: false, status: r.status, message: r.message };
  });
}
