import { NextResponse } from "next/server";
import { z } from "zod";

import { guardOwnerRequest, ownerBaseSchema } from "@/lib/owner-command-auth";
import { atenderTurno } from "@/lib/motor-del-dueno.server";

/**
 * POST /api/owner/turn — lo PRIMERO que el backend pregunta cuando una persona
 * autorizada escribe, antes de que la IA lea nada.
 *
 * - Si es el código de verificación, se comprueba y se contesta.
 * - Si tiene una acción esperando su confirmación: un «sí» limpio la ejecuta,
 *   un «no» la cancela, y cualquier otra cosa la DESCARTA con un aviso.
 *
 * Responde `{ atendido: true, respuesta }` (se envía tal cual y se acaba el
 * turno) o `{ atendido: false, aviso?, contexto? }` (sigue la IA; el aviso va
 * delante de su respuesta).
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, ownerPhone, texto, canal? }
 */
const bodySchema = ownerBaseSchema.extend({
  texto: z.string().max(8000),
});

export async function POST(request: Request) {
  const guard = await guardOwnerRequest(request, bodySchema);
  if (!guard.ok) return guard.response;
  try {
    const turno = await atenderTurno(guard.quien, guard.body.texto);
    return NextResponse.json({ success: true, ...turno }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/turn]", error);
    return NextResponse.json({ success: false, message: "No se pudo atender el mensaje." }, { status: 500 });
  }
}
