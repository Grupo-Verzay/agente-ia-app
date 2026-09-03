import { db } from "@/lib/db";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";

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
 *
 * Se busca la sesión por TODAS las variantes del número, no por el JID exacto.
 * Antes era `where: { userId, remoteJid }` a secas, y ahí se perdían dos casos
 * que no son raros:
 *
 *   - La sesión guardada bajo `remoteJidAlt` en vez de `remoteJid`.
 *   - El mismo contacto escrito de otra forma —`@lid` frente al número real—,
 *     que es justo lo que WhatsApp devuelve unas veces sí y otras no.
 *
 * En esos casos `updateMany` no tocaba ninguna fila, no fallaba, y la IA seguía
 * despierta contestando encima del asesor sin que nada lo dijera. El resto del
 * código ya resolvía el JID así (ver #295 y #296); esto faltaba por alinear.
 */
export async function pausarIaPorIntervencionHumana(
  userId: string | null | undefined,
  remoteJid: string,
): Promise<void> {
  // Los dos caminos por los que esto se rendia ANTES de llegar a su aviso, y sin
  // escribir nada. Es el mismo fallo que ya esta documentado en CLAUDE.md: que
  // no salga el aviso no significa que no haya fallo, puede significar que no se
  // llego a el. Aqui se pagaba caro, porque el sintoma es la IA contestando
  // encima del asesor delante del cliente.
  if (!userId || !remoteJid) {
    console.warn(
      "[pausarIaPorIntervencionHumana] No se intenta pausar: falta el dato para buscar la sesion. La IA sigue activa en esta conversacion.",
      { tieneUserId: Boolean(userId), remoteJid: remoteJid || "(vacio)" },
    );
    return;
  }

  try {
    const candidatos = buildWhatsAppJidCandidates(remoteJid);
    if (candidatos.length === 0) {
      console.warn(
        `[pausarIaPorIntervencionHumana] El numero no produjo ninguna forma con la que buscar (${remoteJid}). La IA sigue activa en esta conversacion.`,
      );
      return;
    }

    const { count } = await db.session.updateMany({
      where: {
        userId,
        OR: [
          { remoteJid: { in: candidatos } },
          { remoteJidAlt: { in: candidatos } },
        ],
      },
      data: { status: false },
    });

    // Que no pause nada es exactamente el fallo que se pagaba en silencio: el
    // asesor escribe, la IA no se entera y contesta encima. Queda en el log
    // para poder verlo cuando pase.
    if (count === 0) {
      console.warn(
        `[pausarIaPorIntervencionHumana] Sin sesión que pausar para ${remoteJid} (userId=${userId}). La IA sigue activa en esta conversación.`,
      );
    }
  } catch (error) {
    // El envío sigue su curso pase lo que pase, pero el error se ve.
    console.error("[pausarIaPorIntervencionHumana]", error);
  }
}
