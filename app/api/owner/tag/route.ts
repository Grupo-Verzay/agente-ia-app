import { NextResponse } from "next/server";
import { z } from "zod";

import { tagOwnerContact } from "@/lib/owner-commands";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/tag — aplica una etiqueta (por nombre) a un contacto del
 * dueño. Si la etiqueta no existe, se crea.
 *
 * Acción que modifica el CRM (dispara automatizaciones de etiqueta): requiere
 * `confirmed: true`. Sin confirmación → 428.
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, sessionId, tag, confirmed }
 */
const bodySchema = ownerBaseSchema.extend({
  sessionId: z.number().int().positive().optional(),
  phone: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).max(40),
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
    const result = await tagOwnerContact({
      ownerId: guard.owner.ownerId,
      sessionId: guard.body.sessionId,
      phone: guard.body.phone,
      tagName: guard.body.tag,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }
    return NextResponse.json({ success: true, message: "Etiqueta aplicada.", ...result.data }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/tag]", error);
    return NextResponse.json({ success: false, message: "No se pudo aplicar la etiqueta." }, { status: 500 });
  }
}
