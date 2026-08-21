import { db } from "@/lib/db";

/**
 * Un asesor acaba de responder en esta conversación: la IA se calla.
 *
 * Se llama ANTES de entregarle el mensaje a WhatsApp, no después. Un texto sale
 * en milisegundos, pero un audio o una imagen viajan en base64 y tardan
 * segundos —a veces más que la ventana que la IA espera antes de contestar—, así
 * que pausar al final dejaba a la IA respondiendo encima del asesor. Y si el
 * envío se pasaba del tiempo límite, la pausa no llegaba a escribirse nunca.
 *
 * Un fallo aquí nunca puede impedir que el mensaje salga: el asesor está
 * escribiéndole a un cliente y eso manda.
 */
export async function pausarIaPorIntervencionHumana(
  userId: string | null | undefined,
  remoteJid: string,
): Promise<void> {
  if (!userId || !remoteJid) return;

  try {
    await db.session.updateMany({
      where: { userId, remoteJid },
      data: { status: false },
    });
  } catch {
    // Silencio a propósito: el envío sigue su curso.
  }
}
