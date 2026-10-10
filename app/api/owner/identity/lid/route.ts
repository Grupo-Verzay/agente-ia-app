import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { esCodigoDeVerificacion, soloDigitos } from "@/lib/identidad-del-dueno";
import { verificarCodigo } from "@/lib/identidad-del-dueno.server";
import { isOwnerCommandAuthorized } from "@/lib/owner-command-auth";
import { parseOwnerPeople } from "@/lib/owner-contacts";

/**
 * POST /api/owner/identity/lid — una persona que escribe con el número OCULTO
 * (`@lid`, sin dígitos que comparar) manda su código de verificación.
 *
 * Si el código es uno vigente de la cuenta, ese `@lid` queda atado a la persona
 * que lo generó en el panel y desde entonces el backend la reconoce como dueña.
 * Antes, alguien así se trataba como un cliente más.
 *
 * Auth: Authorization: Bearer <OWNER_COMMANDS_KEY>
 * Body: { userId, lid, texto }
 */
const bodySchema = z.object({
  userId: z.string().min(1),
  lid: z.string().trim().min(3).max(120),
  texto: z.string().max(40),
});

export async function POST(request: Request) {
  if (!process.env.OWNER_COMMANDS_KEY) {
    return NextResponse.json({ success: false, message: "OWNER_COMMANDS_KEY no está configurado." }, { status: 500 });
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
  if (!parsed.success || !esCodigoDeVerificacion(parsed.data.texto)) {
    return NextResponse.json({ success: false, message: "Parámetros inválidos." }, { status: 422 });
  }

  try {
    const cuenta = await db.user.findUnique({
      where: { id: parsed.data.userId },
      select: { ownerModeEnabled: true, ownerModePhone: true, notificationNumber: true },
    });
    if (!cuenta?.ownerModeEnabled) {
      return NextResponse.json({ success: false, motivo: "apagado" }, { status: 200 });
    }
    const personas = parseOwnerPeople(cuenta.ownerModePhone);
    const autorizados = personas.length ? personas.map((p) => p.phone) : [soloDigitos(cuenta.notificationNumber)];
    const r = await verificarCodigo({
      cuentaId: parsed.data.userId,
      lid: parsed.data.lid,
      texto: parsed.data.texto,
      telefonosAutorizados: autorizados,
    });
    if (!r.ok) return NextResponse.json({ success: false, motivo: r.motivo }, { status: 200 });
    const persona = personas.find((p) => p.phone === r.telefono);
    return NextResponse.json(
      {
        success: true,
        telefono: r.telefono,
        respuesta: `✅ Listo${persona?.name ? `, *${persona.name}*` : ""}: reconocí tu WhatsApp y quedó verificado. Ya puedes pedirme cosas; antes de cada cambio te pediré que lo confirmes.`,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[POST /api/owner/identity/lid]", error);
    return NextResponse.json({ success: false, message: "No se pudo verificar." }, { status: 500 });
  }
}
