"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
import { laCuentaQueConfigura } from "@/lib/cuenta-que-configura";
import { accesoAlProyecto } from "@/lib/acceso-al-proyecto";
import { elDestinoDeLosTickets } from "@/lib/tickets-db";
import { guardarLaColumna } from "@/lib/orden-de-tablero-db";
import {
    TIPOS_DE_TABLERO,
    TOPE_DE_TARJETAS_DE_COLUMNA,
    type TipoDeTablero,
} from "@/lib/orden-del-tablero";

/**
 * Guardar el orden de UNA columna de un tablero.
 *
 * Un módulo `'use server'` solo exporta funciones asíncronas: los tipos y las
 * constantes viven en `lib/orden-del-tablero.ts`. Ya costó una versión entera
 * en Carpetas —el build pasaba limpio y cada llamada daba 500 en producción—.
 */

type Respuesta = { success: boolean; message?: string };

const Esquema = z.object({
    tipo: z.enum(TIPOS_DE_TABLERO),
    tableroId: z.string().trim().min(1),
    /** Los ids de esa columna, en el orden en que tienen que quedar. */
    ids: z.array(z.string().trim().min(1)).max(TOPE_DE_TARJETAS_DE_COLUMNA),
});

/**
 * De quién es el tablero y si quien llama puede reordenarlo, **más** los ids
 * que de verdad están en él.
 *
 * Las dos mitades importan. La primera es la puerta de siempre: en Proyectos,
 * `accesoAlProyecto().puedeTrabajar`, exactamente la misma con la que ya se
 * crea, se edita y se mueve una tarjeta —escribir aquí una condición nueva es
 * como se acabó teniendo un chat que se podía anclar y no se podía borrar—; en
 * Tickets, la cuenta que los recibe.
 *
 * La segunda es que **una lista que llega de fuera no decide qué se ordena**.
 * Sin cruzarla contra las tarjetas del tablero se podrían escribir filas para
 * ids inventados: no abriría ninguna puerta —esto solo guarda posiciones— pero
 * llenaría la tabla de basura que nadie sabría de dónde salió.
 */
async function laColumnaQueSePuedeGuardar(
    tipo: TipoDeTablero,
    tableroId: string,
    ids: string[],
): Promise<string[]> {
    const user = await currentUser();
    if (!user) throw new Error("No autorizado.");

    if (tipo === "proyecto") {
        const projectId = Number(tableroId);
        if (!Number.isInteger(projectId) || projectId <= 0) throw new Error("Tablero no encontrado.");

        const cuenta = user.effectiveId ?? user.ownerId ?? user.id;
        const acceso = await accesoAlProyecto(user, cuenta, projectId);
        // Un proyecto que no se puede ver se contesta como si no existiera.
        if (!acceso) throw new Error("Tablero no encontrado.");
        if (!acceso.puedeTrabajar) {
            throw new Error("Solo un administrador puede reordenar el tablero.");
        }

        const suyas = await db.task.findMany({
            where: {
                projectId,
                ownerId: acceso.ownerId,
                id: { in: ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) },
            },
            select: { id: true },
        });
        const validos = new Set(suyas.map((t) => String(t.id)));
        return ids.filter((id) => validos.has(id));
    }

    // Tickets. La puerta es la misma de `ticketsDeSoporteAction`: la cuenta
    // configurada, o el superadministrador esté donde esté.
    const destino = await elDestinoDeLosTickets();
    if (!destino) throw new Error("Todavía no hay una cuenta que reciba los tickets.");
    if (!esSuperAdminDeVerdad(user)) {
        const cuenta = await laCuentaQueConfigura();
        if (!cuenta?.id || destino !== cuenta.id) throw new Error("No autorizado.");
    }
    if (destino !== tableroId) throw new Error("Ese tablero no está aquí.");

    const filas = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "tickets_de_soporte"
    WHERE "destinoId" = ${destino} AND "id" = ANY(${ids}::text[])
  `;
    const validos = new Set(filas.map((f) => f.id));
    return ids.filter((id) => validos.has(id));
}

/**
 * Lo que decide qué pasa cuando **dos administradores reordenan a la vez**.
 *
 * Cada uno manda su columna ENTERA, así que cada escritura es una foto completa
 * y coherente. Postgres las serializa y **gana la última, pero gana entera**:
 * la columna acaba en el orden que vio una persona, nunca mezclando las dos —que
 * daría un orden que no eligió nadie—. Si tocan columnas distintas ni se
 * rozan: son filas con `tarjetaId` distinto.
 *
 * Se acepta a sabiendas y sin candado de versión, a diferencia de confirmar un
 * cobro: aquí lo que se pierde es un arrastre, se ve al instante y se deshace
 * volviéndolo a arrastrar. Un diálogo de «alguien reordenó mientras tanto» sale
 * más caro que el problema que evita.
 */
export async function guardarElOrdenDeLaColumnaAction(entrada: unknown): Promise<Respuesta> {
    try {
        const datos = Esquema.parse(entrada);
        const ids = await laColumnaQueSePuedeGuardar(datos.tipo, datos.tableroId, datos.ids);
        if (ids.length === 0) return { success: true };

        await guardarLaColumna({ tipo: datos.tipo, tableroId: datos.tableroId, ids });
        return { success: true };
    } catch (error) {
        const message =
            error instanceof z.ZodError
                ? error.errors[0]?.message ?? "Datos incompletos."
                : error instanceof Error
                  ? error.message
                  : "No se pudo guardar el orden.";
        // Y no es mudo: un orden que se arrastra, se suelta y al recargar no
        // está se lee como que la App pierde lo que haces.
        console.warn("[tablero] no se pudo guardar el orden de una columna", { message });
        return { success: false, message };
    }
}
