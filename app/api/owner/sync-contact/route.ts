import { NextResponse } from "next/server";
import { z } from "zod";

import { isOwnerCommandAuthorized } from "@/lib/owner-command-auth";
import { autoSyncContactIfEnabled } from "@/actions/google-sheets-actions";

/**
 * POST /api/owner/sync-contact — sincroniza UN contacto a Google Sheets.
 *
 * Pensado para que el BACKEND (api-webhook) lo llame cuando entra un lead nuevo
 * por WhatsApp (o cambia), para que la sincronización automática cubra también
 * lo que ocurre fuera de la plataforma. La app decide si realmente sincroniza:
 * `autoSyncContactIfEnabled` solo actúa si la cuenta activó el opt-in y tiene
 * una hoja conectada; en caso contrario es un no-op barato.
 *
 * Auth: secreto compartido (Authorization: Bearer <OWNER_COMMANDS_KEY>).
 * Body: { userId, remoteJid }
 */
const bodySchema = z.object({
  userId: z.string().min(1),
  remoteJid: z.string().min(1),
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
    return NextResponse.json({ success: false, message: "Parámetros inválidos." }, { status: 422 });
  }

  try {
    await autoSyncContactIfEnabled(parsed.data.userId, parsed.data.remoteJid);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/owner/sync-contact]", error);
    return NextResponse.json({ success: false, message: "No se pudo sincronizar." }, { status: 500 });
  }
}
