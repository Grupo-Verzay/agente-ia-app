import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeAccion } from "@/lib/rutas-del-dueno.server";

/**
 * POST /api/owner/lead-status — cambiar el estado (kanban) de un lead.
 *
 * NO ejecuta: PREPARA la acción y devuelve (202) el texto exacto que la persona
 * tiene que confirmar. Se ejecuta con su «sí» en `/api/owner/turn`.
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  sessionId: z.number().int().positive().optional(),
  phone: z.string().trim().min(1).optional(),
  status: z.enum(["FRIO", "TIBIO", "CALIENTE", "FINALIZADO", "DESCARTADO"]),
});

export async function POST(request: Request) {
  return rutaDeAccion(request, bodySchema, "owner_mover_lead", (body) => ({ sessionId: body.sessionId, phone: body.phone, status: body.status }));
}
