import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeAccion } from "@/lib/rutas-del-dueno.server";

/**
 * POST /api/owner/training/instruction/edit — editar una instrucción del entrenamiento.
 *
 * NO ejecuta: PREPARA la acción y devuelve (202) el texto exacto que la persona
 * tiene que confirmar. Se ejecuta con su «sí» en `/api/owner/turn`.
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema
  .extend({
    stepId: z.string().trim().min(1),
    instruction: z.string().trim().min(1).max(2000).optional(),
    title: z.string().trim().min(1).max(80).optional(),
  })
  .refine((b) => b.instruction !== undefined || b.title !== undefined, {
    message: "Indica el nuevo texto (instruction) y/o el título a cambiar.",
  });

export async function POST(request: Request) {
  return rutaDeAccion(request, bodySchema, "owner_editar_instruccion_entrenamiento", (body) => ({ stepId: body.stepId, instruction: body.instruction, title: body.title }));
}
