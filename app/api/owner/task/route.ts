import { NextResponse } from "next/server";
import { z } from "zod";

import { createOwnerTask } from "@/lib/owner-commands";
import { isOwnerCommandAuthorized, resolveOwnerCommand } from "@/lib/owner-command-auth";

/**
 * POST /api/owner/task
 *
 * Crea una tarea para el dueño desde el "Modo Dueño por WhatsApp".
 * Lo invoca el backend NestJS cuando el agente reconoce una orden del dueño.
 *
 * Auth: header Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, title, dueDate (ISO 8601), type? }
 */

const bodySchema = z.object({
  userId: z.string().min(1),
  ownerPhone: z.string().min(7),
  title: z.string().trim().min(1),
  dueDate: z.string().min(1),
  type: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  if (!process.env.OWNER_COMMANDS_KEY) {
    return NextResponse.json(
      { success: false, message: "OWNER_COMMANDS_KEY no está configurado." },
      { status: 500 },
    );
  }

  if (!isOwnerCommandAuthorized(request)) {
    return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Parámetros inválidos.", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const dueDate = new Date(parsed.data.dueDate);
  if (isNaN(dueDate.getTime())) {
    return NextResponse.json(
      { success: false, message: "dueDate inválida (usa formato ISO 8601)." },
      { status: 422 },
    );
  }

  const auth = await resolveOwnerCommand({
    userId: parsed.data.userId,
    ownerPhone: parsed.data.ownerPhone,
  });
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.reason }, { status: 403 });
  }

  try {
    const task = await createOwnerTask({
      ownerId: auth.owner.ownerId,
      ownerName: auth.owner.name,
      title: parsed.data.title,
      type: parsed.data.type ?? "Seguimiento",
      dueDate,
    });
    return NextResponse.json({ success: true, message: "Tarea creada.", task }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/owner/task]", error);
    return NextResponse.json(
      { success: false, message: "No se pudo crear la tarea." },
      { status: 500 },
    );
  }
}
