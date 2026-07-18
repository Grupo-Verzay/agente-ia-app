import { NextResponse } from "next/server";
import { z } from "zod";

import { createOwnerTask } from "@/lib/owner-commands";
import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/reminder — crea un recordatorio para el dueño.
 * Un recordatorio es una tarea de tipo "Recordatorio" asignada al propio dueño.
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, title, dueDate (ISO 8601) }
 */
const bodySchema = ownerBaseSchema.extend({
  title: z.string().trim().min(1),
  dueDate: z.string().min(1),
});

export async function POST(request: Request) {
  const guard = await guardOwnerRequest(request, bodySchema);
  if (!guard.ok) return guard.response;

  const dueDate = new Date(guard.body.dueDate);
  if (isNaN(dueDate.getTime())) {
    return NextResponse.json(
      { success: false, message: "dueDate inválida (usa formato ISO 8601)." },
      { status: 422 },
    );
  }

  try {
    const reminder = await createOwnerTask({
      ownerId: guard.owner.ownerId,
      ownerName: guard.owner.name,
      title: guard.body.title,
      type: "Recordatorio",
      dueDate,
    });
    return NextResponse.json(
      { success: true, message: "Recordatorio creado.", reminder },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/owner/reminder]", error);
    return NextResponse.json({ success: false, message: "No se pudo crear el recordatorio." }, { status: 500 });
  }
}
