import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeAccion } from "@/lib/rutas-del-dueno.server";

/**
 * POST /api/owner/training/instruction — agregar una instrucción al entrenamiento.
 *
 * NO ejecuta: PREPARA la acción y devuelve (202) el texto exacto que la persona
 * tiene que confirmar. Se ejecuta con su «sí» en `/api/owner/turn`.
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  instruction: z.string().trim().min(1).max(2000),
  title: z.string().trim().min(1).max(80).optional(),
});

export async function POST(request: Request) {
  return rutaDeAccion(request, bodySchema, "owner_agregar_instruccion_entrenamiento", (body) => ({ instruction: body.instruction, title: body.title }));
}
