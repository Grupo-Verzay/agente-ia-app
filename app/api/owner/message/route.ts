import { NextResponse } from "next/server";
import { z } from "zod";

import { sendOwnerMessage } from "@/lib/owner-commands";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/message — envía un mensaje de WhatsApp a un contacto del
 * dueño, desde la instancia conectada de su cuenta.
 *
 * Acción que toca a un tercero: requiere `confirmed: true` (la confirmación la
 * gestiona el agente antes de llamar aquí). Sin confirmación → 428.
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, sessionId, text, confirmed }
 */
const bodySchema = ownerBaseSchema.extend({
  sessionId: z.number().int().positive(),
  text: z.string().trim().min(1).max(4096),
  confirmed: z.boolean().optional(),
});

export async function POST(request: Request) {
  const guard = await guardOwnerRequest(request, bodySchema);
  if (!guard.ok) return guard.response;

  if (guard.body.confirmed !== true) {
    return NextResponse.json(
      { success: false, message: "Esta acción requiere confirmación (confirmed: true).", requiresConfirmation: true },
      { status: 428 },
    );
  }

  try {
    const result = await sendOwnerMessage({
      ownerId: guard.owner.ownerId,
      sessionId: guard.body.sessionId,
      text: guard.body.text,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }
    return NextResponse.json({ success: true, message: "Mensaje enviado.", ...result.data }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/message]", error);
    return NextResponse.json({ success: false, message: "No se pudo enviar el mensaje." }, { status: 500 });
  }
}
