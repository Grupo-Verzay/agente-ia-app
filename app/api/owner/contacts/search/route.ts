import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeConsulta } from "@/lib/rutas-del-dueno.server";
import { searchOwnerContacts } from "@/lib/owner-commands";

/**
 * POST /api/owner/contacts/search — contactos por nombre o número.
 *
 * Consulta: pasa por el motor (plan del módulo + bitácora).
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  query: z.string().trim().min(1),
});

export async function POST(request: Request) {
  return rutaDeConsulta(request, bodySchema, "owner_buscar_contacto", async (quien, body) => ({ contacts: await searchOwnerContacts(quien.cuentaId, body.query) }));
}
