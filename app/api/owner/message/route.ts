import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeAccion } from "@/lib/rutas-del-dueno.server";

/**
 * POST /api/owner/message — enviar un WhatsApp a un contacto del dueño.
 *
 * NO ejecuta: PREPARA la acción y devuelve (202) el texto exacto que la persona
 * tiene que confirmar. Se ejecuta con su «sí» en `/api/owner/turn`.
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  sessionId: z.number().int().positive().optional(),
  phone: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1).max(4096),
});

export async function POST(request: Request) {
  return rutaDeAccion(request, bodySchema, "owner_enviar_mensaje", (body) => ({ sessionId: body.sessionId, phone: body.phone, text: body.text }));
}
