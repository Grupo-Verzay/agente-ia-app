import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";

/**
 * La firma del asesor, antepuesta al texto que va a salir.
 *
 * Vive aquí y no en el envío de un proveedor porque **hay tres envíos**:
 * Evolution (`sendManualChatPayloadAction`), WhatsApp Mensajería
 * (`sendWahaTextAction`) y Baileys (`sendBaileysTextAction`). La firma estaba
 * escrita SOLO dentro del de Evolution, y ese ni siquiera arranca sin sus
 * credenciales: para una línea de Waha la función entera se salía en su primera
 * línea, así que el interruptor de la firma se veía encendido y el mensaje salía
 * sin firma. Es el mismo agujero que tuvo el Robot (ver CLAUDE.md): una función
 * escrita para un proveedor y dada por hecha para todos.
 *
 * Dos cosas que hay que mantener:
 *
 * 1. **Si se añade otro proveedor, llama a esto.** No copiar el bloque.
 * 2. **La sesión se busca por TODAS las identidades del contacto.** Con
 *    `{ userId, remoteJid }` a secas se perdía siempre que el chat estuviera
 *    abierto por su `@lid` —que es como llegan casi todos— y la sesión guardada
 *    bajo el número. Es la misma trampa de la pausa de la IA (#185).
 *
 * Nunca lanza y nunca bloquea el envío: si algo falla, el mensaje sale sin
 * firma, pero **se dice**. Un mensaje sin firma con el interruptor encendido no
 * puede ser mudo: es exactamente lo que costó no poder diagnosticarlo.
 */
export async function anteponerFirmaDelAsesor(params: {
  /** La cuenta DUEÑA de la línea, que es donde cuelga la conversación. */
  ownerUserId: string | null | undefined;
  remoteJid: string;
  texto: string;
}): Promise<string> {
  const { ownerUserId, remoteJid, texto } = params;
  try {
    if (!ownerUserId || !remoteJid || !texto) return texto;

    const user = await currentUser();
    const firma = (user?.advisorSignature as string | null | undefined)?.trim();
    // Sin firma configurada no hay nada que anteponer, y no es un fallo.
    if (!user?.id || !firma) return texto;

    const sesion = await buscarSesion(ownerUserId, remoteJid);
    if (!sesion) {
      console.warn("[firma] sin sesión para este contacto; el mensaje sale sin firma", {
        remoteJid,
        cuenta: ownerUserId,
      });
      return texto;
    }
    if (!sesion.signatureEnabled) return texto;

    return `${firma}\n${texto}`;
  } catch (error) {
    console.warn("[firma] no se pudo aplicar; el mensaje sale sin ella", {
      remoteJid,
      error: error instanceof Error ? error.message : String(error),
    });
    return texto;
  }
}

/**
 * Dos vueltas, como `pausarIaPorIntervencionHumana`: primero con las formas que
 * se sacan del propio jid y, si no aparece fila, se completan con las
 * identidades que guarda `chat_messages` —que anota cada mensaje con todas— y se
 * reintenta.
 *
 * Hace falta porque `buildWhatsAppJidCandidates` NO cruza el puente `@lid` ↔
 * número, y es a propósito: los dígitos de un `@lid` son un id de privacidad, no
 * un teléfono, y fabricar el número con ellos daría un JID falso que podría
 * casar con otro contacto. El teléfono real tiene que venir de la base.
 */
async function buscarSesion(
  userId: string,
  remoteJid: string,
): Promise<{ signatureEnabled: boolean } | null> {
  const buscarCon = (formas: string[]) =>
    db.session.findFirst({
      where: {
        userId,
        OR: [{ remoteJid: { in: formas } }, { remoteJidAlt: { in: formas } }],
      },
      select: { signatureEnabled: true },
    });

  const candidatos = buildWhatsAppJidCandidates(remoteJid);
  const primera = await buscarCon(candidatos);
  if (primera) return primera;

  const vistos = await db.chatMessage.findMany({
    where: {
      userId,
      OR: [
        { remoteJid: { in: candidatos } },
        { remoteJidAlt: { in: candidatos } },
        { senderPn: { in: candidatos } },
      ],
    },
    select: { remoteJid: true, remoteJidAlt: true, senderPn: true },
    distinct: ["remoteJid"],
    take: 20,
  });

  const otrasFormas = buildWhatsAppJidCandidates(
    remoteJid,
    vistos.flatMap((m) => [m.remoteJid, m.remoteJidAlt, m.senderPn]),
  );
  if (otrasFormas.length <= candidatos.length) return null;

  const segunda = await buscarCon(otrasFormas);
  if (segunda) {
    console.info("[firma] sesión encontrada por otra identidad del contacto", { remoteJid });
  }
  return segunda;
}
