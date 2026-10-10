import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeAccion } from "@/lib/rutas-del-dueno.server";

/**
 * POST /api/owner/task — crear una tarea.
 *
 * NO ejecuta: PREPARA la acción y devuelve (202) el texto exacto que la persona
 * tiene que confirmar. Se ejecuta con su «sí» en `/api/owner/turn`.
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  title: z.string().trim().min(1),
  dueDate: z.string().min(1),
  type: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  return rutaDeAccion(request, bodySchema, "owner_crear_tarea", (body) => ({ title: body.title, dueDate: body.dueDate, type: body.type }));
}
