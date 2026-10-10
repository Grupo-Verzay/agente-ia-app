import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeAccion } from "@/lib/rutas-del-dueno.server";

/**
 * POST /api/owner/assign — asignar un contacto a un asesor (o «ninguno»).
 *
 * NO ejecuta: PREPARA la acción y devuelve (202) el texto exacto que la persona
 * tiene que confirmar. Se ejecuta con su «sí» en `/api/owner/turn`.
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  sessionId: z.number().int().positive().optional(),
  phone: z.string().trim().min(1).optional(),
  advisorName: z.string().trim().min(1).max(60),
});

export async function POST(request: Request) {
  return rutaDeAccion(request, bodySchema, "owner_asignar_asesor", (body) => ({ sessionId: body.sessionId, phone: body.phone, advisorName: body.advisorName }));
}
