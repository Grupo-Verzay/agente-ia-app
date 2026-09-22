import "server-only";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertCanAccessTargetUser } from "@/actions/billing/helpers/app-access-guard";

/**
 * **De qué cuenta es una llamada que se lanza desde una conversación.**
 *
 * Una sola pregunta, y la contestan TODOS los caminos que llaman: la llamada
 * manual (`startAstraCall`), la llamada con IA (`startBotCallAction`) y el
 * registro de la burbuja (`logOutgoingCallAction`). Antes cada uno la
 * contestaba a su manera y no coincidían:
 *
 * | camino | con qué cuenta decidía |
 * | --- | --- |
 * | llamada manual | la dueña de la línea… y, si no tenía número, **la de quien mira** |
 * | llamada con IA | **siempre la de quien mira** (`effectiveId`), ignorando la línea |
 * | la burbuja | la dueña de la línea |
 *
 * La segunda fila es el fallo reportado: desde la madre, llamando con IA en
 * una conversación de Verzay Ventas, la llamada salía con el número de la
 * MADRE. Como el servidor de llamadas identifica la cuenta por la sesión
 * (`sid`) —de ahí salen el asistente, su configuración, sus créditos y la
 * línea de WhatsApp—, **todo** caía en la madre: el WhatsApp del que salía la
 * llamada, los créditos que se gastaban y el chat donde aparecía.
 *
 * > **La cuenta de una llamada es la DUEÑA de la línea de la conversación.**
 * > Si esa cuenta no tiene número de llamadas, **no se llama**: se dice. Caer
 * > en el número de quien mira es exactamente el fallo — la llamada saldría
 * > de otro WhatsApp y cobraría a otra cuenta, sin un solo error.
 *
 * Solo cuando **no hay línea** —el marcador de CRM › Llamadas, que no está
 * dentro de ninguna conversación— la cuenta es la de quien mira, que es a
 * quien pertenece ese marcador.
 */
export type CuentaDeLaLlamada =
    | {
          ok: true;
          /** La cuenta que llama, paga y bajo la que queda el registro. */
          cuentaId: string;
          /** La línea de la conversación, cuando se sabe cuál es. */
          instanceName: string | null;
          /** El número de llamadas de ESA cuenta. `null` = no tiene. */
          sid: string | null;
          /** De dónde salió la cuenta: la línea, o quien mira (sin línea). */
          origen: "linea" | "propia";
      }
    | { ok: false; motivo: string };

export const SIN_NUMERO_EN_LA_LINEA =
    "La cuenta de esta conversación no tiene un número vinculado para llamar. Vincúlalo en Conexión → Llamadas de esa cuenta.";

export const SIN_ACCESO_A_LA_LINEA =
    "No tienes acceso a la cuenta dueña de esta conversación, así que no se puede llamar desde ella.";

async function elSidDe(cuentaId: string): Promise<string | null> {
    const u = await db.user.findUnique({ where: { id: cuentaId }, select: { astraCallsSid: true } });
    return u?.astraCallsSid ?? null;
}

export async function laCuentaDeLaLlamada(instanceName?: string | null): Promise<CuentaDeLaLlamada> {
    const me = await currentUser();
    if (!me?.id) return { ok: false, motivo: "No autorizado." };

    const nombre = instanceName?.trim();
    if (nombre) {
        const linea = await db.instancia.findFirst({
            where: { instanceName: nombre },
            select: { userId: true, instanceName: true },
        });
        if (linea?.userId) {
            try {
                // La misma puerta que el resto de la plataforma: la madre llega
                // a sus hijas; una hija no llega a su madre.
                await assertCanAccessTargetUser(linea.userId);
            } catch (error) {
                console.warn("[llamadas] sin acceso a la cuenta de la linea de la conversacion", {
                    instanceName: nombre,
                    error: error instanceof Error ? error.message : String(error),
                });
                return { ok: false, motivo: SIN_ACCESO_A_LA_LINEA };
            }
            return {
                ok: true,
                cuentaId: linea.userId,
                instanceName: linea.instanceName,
                sid: await elSidDe(linea.userId),
                origen: "linea",
            };
        }
        // Un nombre que no está en `Instancias` —una línea borrada, el nombre
        // por defecto «llamadas»— no dice de quién es nada. Se sigue con quien
        // mira, que es lo que se hacía, pero no en silencio.
        console.warn("[llamadas] la linea de la conversacion no esta en Instancias; se usa la cuenta propia", {
            instanceName: nombre,
        });
    }

    const fila = me as { effectiveId?: string | null; ownerId?: string | null };
    const propia = fila.effectiveId ?? fila.ownerId ?? me.id;
    return { ok: true, cuentaId: propia, instanceName: null, sid: await elSidDe(propia), origen: "propia" };
}

/**
 * La cuenta bajo la que quedó ESCRITA una llamada, para quien llega con el id
 * de su fila (transcribir, grabar).
 *
 * Esa fila puede ser de otra cuenta de la familia —la dueña de la línea, no la
 * de quien mira—, así que buscarla con `effectiveId` no la encuentra y la
 * llamada se queda sin Resumen IA ni transcripción sin un solo error. Se lee
 * el dueño de la fila y se pasa por la puerta de siempre.
 */
export async function laCuentaDeLaFilaDeLlamada(chatMessageId: string): Promise<string | null> {
    const me = await currentUser();
    if (!me?.id) return null;
    let id: bigint;
    try {
        id = BigInt(chatMessageId);
    } catch {
        return null;
    }
    const fila = await db.chatMessage.findFirst({
        where: { id, messageType: "call" },
        select: { userId: true },
    });
    if (!fila?.userId) return null;
    try {
        await assertCanAccessTargetUser(fila.userId);
    } catch (error) {
        console.warn("[llamadas] sin acceso a la cuenta de la llamada", {
            chatMessageId,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
    return fila.userId;
}
