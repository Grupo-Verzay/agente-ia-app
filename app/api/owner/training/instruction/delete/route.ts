import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeAccion } from "@/lib/rutas-del-dueno.server";

/**
 * POST /api/owner/training/instruction/delete — eliminar una instrucción del entrenamiento.
 *
 * NO ejecuta: PREPARA la acción y devuelve (202) el texto exacto que la persona
 * tiene que confirmar. Se ejecuta con su «sí» en `/api/owner/turn`.
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  stepId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  return rutaDeAccion(request, bodySchema, "owner_eliminar_instruccion_entrenamiento", (body) => ({ stepId: body.stepId }));
}
