import { NextResponse } from "next/server";
import { z } from "zod";

import { searchOwnerContacts } from "@/lib/owner-commands";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/contacts/search — resuelve contactos del dueño por nombre o
 * número (solo lectura). El agente lo usa para obtener el sessionId antes de
 * pedir confirmación de una acción de Fase 2.
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, query }
 */
const bodySchema = ownerBaseSchema.extend({
  query: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const guard = await guardOwnerRequest(request, bodySchema);
  if (!guard.ok) return guard.response;

  try {
    const contacts = await searchOwnerContacts(guard.owner.ownerId, guard.body.query);
    return NextResponse.json({ success: true, contacts }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/contacts/search]", error);
    return NextResponse.json({ success: false, message: "No se pudo buscar contactos." }, { status: 500 });
  }
}
