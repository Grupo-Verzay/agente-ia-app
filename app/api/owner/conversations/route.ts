import { NextResponse } from "next/server";
import { z } from "zod";

import { listOwnerConversations } from "@/lib/owner-commands";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/conversations — conversaciones recientes del dueño (solo lectura).
 * scope "unanswered" (el cliente escribió último, falta responder) o "recent".
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, scope?, limit? }
 */
const bodySchema = ownerBaseSchema.extend({
  scope: z.enum(["unanswered", "recent"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  const guard = await guardOwnerRequest(request, bodySchema);
  if (!guard.ok) return guard.response;

  try {
    const conversations = await listOwnerConversations(guard.owner.ownerId, {
      scope: guard.body.scope,
      limit: guard.body.limit,
    });
    return NextResponse.json({ success: true, count: conversations.length, conversations }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/conversations]", error);
    return NextResponse.json({ success: false, message: "No se pudieron cargar las conversaciones." }, { status: 500 });
  }
}
