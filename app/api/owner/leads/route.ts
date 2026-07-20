import { NextResponse } from "next/server";
import { z } from "zod";

import { listOwnerLeads } from "@/lib/owner-commands";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/leads — lista de solo lectura de los leads/contactos del dueño con
 * su estado del embudo (nombre, teléfono, estado, etiquetas). Filtro opcional por
 * estado (frío/tibio/caliente/finalizado/descartado).
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, status?, limit? }
 */
const bodySchema = ownerBaseSchema.extend({
  status: z.string().trim().min(1).max(30).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  const guard = await guardOwnerRequest(request, bodySchema);
  if (!guard.ok) return guard.response;

  try {
    const leads = await listOwnerLeads(guard.owner.ownerId, {
      status: guard.body.status,
      limit: guard.body.limit,
    });
    return NextResponse.json({ success: true, count: leads.length, leads }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/leads]", error);
    return NextResponse.json({ success: false, message: "No se pudieron cargar los leads." }, { status: 500 });
  }
}
