import "server-only";
import { db } from "@/lib/db";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";
import { conElFlujo, type FlujoEjecutado } from "@/lib/flujos-ejecutados";

/**
 * Apunta en la ficha de la conversación (`Session.flujos`) que se ejecutó un
 * flujo, buscándola como el motor: la cuenta, su línea (`instanceId`) y todas
 * las identidades del contacto (`remoteJid` / `remoteJidAlt`).
 *
 * Nunca lanza: el flujo ya salió y eso manda. Pero no es mudo.
 */
export async function apuntarElFlujoEjecutado(input: {
  userId: string;
  instanceName: string;
  remoteJid: string;
  flujo: FlujoEjecutado;
}): Promise<number> {
  try {
    const candidates = buildWhatsAppJidCandidates(input.remoteJid);
    if (!input.userId || !input.instanceName || candidates.length === 0) return 0;
    const fichas = await db.session.findMany({
      where: {
        userId: input.userId,
        instanceId: input.instanceName,
        OR: [{ remoteJid: { in: candidates } }, { remoteJidAlt: { in: candidates } }],
      },
      select: { id: true, flujos: true },
    });
    if (fichas.length === 0) {
      console.warn("[flujos] no hay ficha donde apuntar el flujo ejecutado", {
        instanceName: input.instanceName,
        remoteJid: input.remoteJid,
        workflowId: input.flujo.id,
      });
      return 0;
    }
    let escritas = 0;
    for (const ficha of fichas) {
      const nuevo = conElFlujo(ficha.flujos, input.flujo);
      if (nuevo === null) continue;
      await db.session.update({ where: { id: ficha.id }, data: { flujos: nuevo } });
      escritas += 1;
    }
    return escritas;
  } catch (error) {
    console.warn("[flujos] no se pudo apuntar el flujo ejecutado", {
      instanceName: input.instanceName,
      workflowId: input.flujo.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
