import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeAccion } from "@/lib/rutas-del-dueno.server";

/**
 * POST /api/owner/revert — deshacer una acción del historial (por su código).
 *
 * NO ejecuta: PREPARA la acción y devuelve (202) el texto exacto que la persona
 * tiene que confirmar. Se ejecuta con su «sí» en `/api/owner/turn`.
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  accionId: z.string().trim().min(6).max(64),
});

export async function POST(request: Request) {
  return rutaDeAccion(request, bodySchema, "owner_revertir_accion", (body) => ({ accionId: body.accionId }));
}
