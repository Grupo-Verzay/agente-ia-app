import { quienFirma } from "@/lib/chat-de-equipo";
import {
    abrirElResultado,
    anotarLaAccion,
    anotarUnaVezAlDia,
    cerrarElResultado,
} from "@/lib/actividad-del-equipo-db";
import type { Desenlace, TipoDeAccion } from "@/lib/actividad-del-equipo";

/**
 * El único sitio por el que se apunta actividad desde una acción.
 *
 * Existe para que instrumentar sea **una línea** en cada sitio. Con la
 * resolución de quién es la persona copiada en cada llamador, el octavo se
 * equivoca —y aquí equivocarse significa apuntarle el trabajo a otro—. Es el
 * mismo motivo por el que los destinatarios de un aviso de tarea se calculan en
 * `lib/avisar-de-la-tarea.ts` y no en cada disparador.
 *
 * **Nada de esto lanza nunca.** Cuelga de acciones que ya terminaron su
 * trabajo: el mensaje ya salió, el ticket ya está cerrado. Medir no puede
 * deshacer lo medido. Pero tampoco es mudo — lo dicen las funciones de abajo.
 */

/** Quién y de qué cuenta, con la regla de siempre. */
type Quien = Parameters<typeof quienFirma>[0];

/**
 * Suma una acción al contador del día y, si se le pasa un `refId`, deja además
 * abierta su fila de desenlace.
 *
 * El `refId` es lo que permitirá cerrar el círculo después —«el ticket X se
 * resolvió en 4 h»—. Sin él solo se cuenta, que es lo correcto para lo que no
 * tiene un final que esperar: un mensaje enviado no «acaba» de ninguna manera.
 */
export async function apuntarLoQueHizo(
    quien: Quien,
    tipo: TipoDeAccion,
    refId?: string | null,
): Promise<void> {
    const firma = quienFirma(quien);
    if (!firma) return;

    await anotarLaAccion({
        personaId: firma.personaId,
        cuentaId: firma.cuentaId,
        tipo,
    });

    if (refId) {
        await abrirElResultado({
            personaId: firma.personaId,
            cuentaId: firma.cuentaId,
            tipo,
            refId,
        });
    }
}

/**
 * Cuenta una **cosa distinta al día**, no una vez más.
 *
 * Es lo que hace falta para «chats atendidos» —conversaciones, no mensajes— y
 * para «clientes tocados» —clientes, no ediciones—. La deduplicación la hace la
 * base con el id de la fila (ver `anotarUnaVezAlDia`), no una comprobación aquí
 * que dos peticiones simultáneas se saltarían las dos.
 */
export async function apuntarUnaVezAlDia(
    quien: Quien,
    tipo: TipoDeAccion,
    refId: string | null | undefined,
): Promise<void> {
    const firma = quienFirma(quien);
    if (!firma || !refId) return;
    await anotarUnaVezAlDia({
        personaId: firma.personaId,
        cuentaId: firma.cuentaId,
        tipo,
        refId,
    });
}

/**
 * Cierra el círculo de algo que se apuntó antes.
 *
 * No necesita saber quién lo cierra: la fila ya guarda de quién era la acción,
 * y lo que se mide es **cuánto tardó aquello**, no quién le puso el punto
 * final. Eso además lo hace llamable desde el cron, que no tiene sesión.
 */
export async function apuntarComoAcabo(
    tipo: TipoDeAccion,
    refId: string | null | undefined,
    desenlace: Desenlace,
): Promise<void> {
    if (!refId) return;
    await cerrarElResultado({ tipo, refId, desenlace });
}
