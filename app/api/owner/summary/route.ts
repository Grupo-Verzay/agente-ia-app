import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeConsulta } from "@/lib/rutas-del-dueno.server";
import { getOwnerSummary } from "@/lib/owner-commands";

/**
 * POST /api/owner/summary — resumen del día (tareas y citas).
 *
 * Consulta: pasa por el motor (plan del módulo + bitácora).
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema;

export async function POST(request: Request) {
  return rutaDeConsulta(request, bodySchema, "owner_resumen_dia", async (quien, body) => ({ summary: await getOwnerSummary(quien.cuentaId) }));
}
