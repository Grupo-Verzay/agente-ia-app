import { z } from "zod";

import { ownerBaseSchema } from "@/lib/owner-command-auth";
import { rutaDeConsulta } from "@/lib/rutas-del-dueno.server";
import { listOwnerConversations } from "@/lib/owner-commands";

/**
 * POST /api/owner/conversations — conversaciones recientes o sin responder.
 *
 * Consulta: pasa por el motor (plan del módulo + bitácora).
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 */
const bodySchema = ownerBaseSchema.extend({
  scope: z.enum(["unanswered", "recent"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  return rutaDeConsulta(request, bodySchema, "owner_listar_conversaciones", async (quien, body) => {
    const conversations = await listOwnerConversations(quien.cuentaId, { scope: body.scope, limit: body.limit });
    return { count: conversations.length, conversations };
  });
}
