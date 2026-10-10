import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeAccion } from "@/lib/rutas-del-dueno.server";

/**
 * POST /api/owner/tag — poner una etiqueta (se crea si no existe).
 *
 * NO ejecuta: PREPARA la acción y devuelve (202) el texto exacto que la persona
 * tiene que confirmar. Se ejecuta con su «sí» en `/api/owner/turn`.
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  sessionId: z.number().int().positive().optional(),
  phone: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).max(40),
});

export async function POST(request: Request) {
  return rutaDeAccion(request, bodySchema, "owner_etiquetar_contacto", (body) => ({ sessionId: body.sessionId, phone: body.phone, tag: body.tag }));
}
