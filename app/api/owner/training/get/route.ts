import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeConsulta } from "@/lib/rutas-del-dueno.server";
import { getOwnerTraining } from "@/lib/owner-training";

/**
 * POST /api/owner/training/get — instrucciones actuales del agente.
 *
 * Consulta: pasa por el motor (plan del módulo + bitácora).
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  agentId: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  return rutaDeConsulta(request, bodySchema, "owner_ver_entrenamiento", async (quien, body) => {
    const r = await getOwnerTraining(quien.cuentaId, body.agentId);
    return r.ok ? { training: r.data } : { ok: false, status: r.status, message: r.message };
  });
}
