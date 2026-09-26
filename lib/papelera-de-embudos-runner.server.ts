import "server-only";

import { db } from "@/lib/db";
import { DIAS_EN_LA_PAPELERA } from "@/lib/papelera-de-embudos";
import { lasQueLesTocaElBorradoEnFirme, olvidarDeLaPapelera } from "@/lib/embudos-db";

/**
 * El borrado en firme de lo que se vació de la columna de Perdido.
 *
 * **`server-only` y no una acción**, y no es una etiqueta más floja: un
 * `export async function` en un fichero `'use server'` es un POST al que se
 * llega desde el navegador con los parámetros que uno quiera, y esto borra
 * fichas de clientes sin preguntarle a nadie quién llama —porque lo llama un
 * cron, donde no hay sesión que preguntar—. Es el mismo reparto que
 * `lib/grabaciones-runner.server.ts`.
 *
 * Cuelga del barrido diario (`/api/cron/billing`), en su propio `try` como los
 * demás: un barrido que se cuelgue no puede tumbar el cobro, que es lo que de
 * verdad importa de esa vuelta.
 *
 * # Qué se borra, y qué NO
 *
 * Se borra **la ficha del lead** (`Session`) con todo lo que cuelga de ella en
 * cascada: sus etiquetas, sus notas internas, sus citas, sus registros, sus
 * seguimientos del CRM y su historial de asignaciones. Es lo que un embudo
 * administra —una tarjeta ES una ficha de lead— y es el mismo borrado que ya
 * hace Leads desde su papelera de fila.
 *
 * **El historial de WhatsApp no se borra** (`chat_messages`,
 * `chat_conversations`), así que la conversación sigue en Chats sin su ficha de
 * CRM. Y se dice en vez de disimularlo.
 *
 * Lo que era el obstáculo **ya no lo es**: `hardDeleteLocalChat` vive ahora en
 * `lib/borrado-de-chats.server.ts` y se puede llamar desde aquí (la sacó el
 * arreglo del borrado en bloque, que necesitaba lo mismo para su obrero de
 * fondo). Lo que queda es la decisión, que es otra cosa: vaciar la columna de
 * Perdido borra **fichas de CRM**, y llevarse además el historial de WhatsApp de
 * esas conversaciones es un borrado mucho más ancho del que nadie pidió. Se
 * decide aparte; lo que no puede pasar es que se dé por hecho.
 */

/** Cuántas se borran por vuelta. */
const POR_VUELTA = 50;

export type ResumenDelBarrido = {
    caducadas: number;
    borradas: number;
    fallos: number;
};

export async function runPapeleraDeEmbudos(opciones?: { limite?: number }): Promise<ResumenDelBarrido> {
    const limite = Math.max(1, Math.min(POR_VUELTA, opciones?.limite ?? POR_VUELTA));
    const resumen: ResumenDelBarrido = { caducadas: 0, borradas: 0, fallos: 0 };

    const caducadas = await lasQueLesTocaElBorradoEnFirme({ dias: DIAS_EN_LA_PAPELERA, limite });
    resumen.caducadas = caducadas.length;
    if (caducadas.length === 0) return resumen;

    for (const c of caducadas) {
        // Cada una en su propio `try`: una fila rota en mitad de la lista no
        // puede dejar sin borrar a las cuarenta y nueve de detrás.
        try {
            await borrarLaFichaEnFirme(c.sessionId);
            // La fila de la papelera se va DESPUÉS de la ficha. Al revés, un
            // fallo a mitad dejaría la ficha sin nadie que se acuerde de
            // borrarla, y en la papelera no volvería a salir.
            await olvidarDeLaPapelera(c.sessionId);
            resumen.borradas += 1;
            console.info("[embudos] conversación vaciada borrada en firme", {
                sessionId: c.sessionId,
                cuenta: c.cuentaId,
                nombre: c.nombre,
            });
        } catch (error) {
            resumen.fallos += 1;
            console.warn("[embudos] no se pudo borrar en firme una conversación vaciada", {
                sessionId: c.sessionId,
                cuenta: c.cuentaId,
                error,
            });
        }
    }
    return resumen;
}

/**
 * Borra la ficha y lo que cuelga de ella.
 *
 * **Las dos filas que se desenganchan antes no son simetría de adorno**, y cada
 * una por un motivo distinto:
 *
 * - `CollabNotification` **no tiene relación de Prisma a propósito**, así que su
 *   `sessionId` no es clave foránea y **no lo pone nadie en nulo**: sin esta
 *   línea quedaría apuntando a una ficha que ya no existe, y la campanita
 *   enseñaría una mención de un lead que no se puede abrir.
 * - `FinanceTransaction.session` es opcional y sin `onDelete`, o sea `SetNull`
 *   por omisión, así que Postgres ya lo desengancha solo. Se hace igual porque
 *   es una consulta de nada y porque **lo que hay en producción no tiene que
 *   coincidir con el esquema**: esta base ya tiene columnas creadas en caliente
 *   por el backend, y una restricción con otra regla dejaría este barrido
 *   fallando cada noche por una transacción de finanzas de hace un año.
 *
 * Si la ficha ya no está —alguien la borró desde Leads o desde Chats en estos
 * treinta días— esto no falla: `deleteMany` sobre cero filas es cero filas, y la
 * fila de la papelera se va igual.
 */
async function borrarLaFichaEnFirme(sessionId: number): Promise<void> {
    await db.$transaction(async (tx) => {
        await tx.financeTransaction.updateMany({ where: { sessionId }, data: { sessionId: null } });
        await tx.collabNotification.updateMany({ where: { sessionId }, data: { sessionId: null } });
        await tx.session.deleteMany({ where: { id: sessionId } });
        // Su posición en cualquier embudo se va con ella: sin la ficha no hay
        // tarjeta que colocar, y una posición huérfana no la limpia nadie.
        await tx.$executeRaw`DELETE FROM "embudo_posiciones" WHERE "sessionId" = ${sessionId}`;
    });
}
