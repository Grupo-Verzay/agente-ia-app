import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeAccion } from "@/lib/rutas-del-dueno.server";

/**
 * POST /api/owner/training/restore — volver el entrenamiento a una versión guardada.
 *
 * NO ejecuta: PREPARA la acción y devuelve (202) el texto exacto que la persona
 * tiene que confirmar. Se ejecuta con su «sí» en `/api/owner/turn`.
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  revisionNumber: z.number().int().positive(),
});

export async function POST(request: Request) {
  return rutaDeAccion(request, bodySchema, "owner_restaurar_entrenamiento", (body) => ({ revisionNumber: body.revisionNumber }));
}
