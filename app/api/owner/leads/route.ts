import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeConsulta } from "@/lib/rutas-del-dueno.server";
import { listOwnerLeads } from "@/lib/owner-commands";

/**
 * POST /api/owner/leads — leads con su estado (filtro opcional por estado).
 *
 * Consulta: pasa por el motor (plan del módulo + bitácora).
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  status: z.string().trim().min(1).max(30).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  return rutaDeConsulta(request, bodySchema, "owner_listar_leads", async (quien, body) => {
    const leads = await listOwnerLeads(quien.cuentaId, { status: body.status, limit: body.limit });
    return { count: leads.length, leads };
  });
}
