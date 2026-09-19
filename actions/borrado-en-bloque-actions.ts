"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertCanAccessTargetUser } from "@/actions/billing/helpers/app-access-guard";
import {
    borrarUnaAUna,
    comoListaDeIds,
    comoResumen,
    type ResumenDelBorrado,
} from "@/lib/borrado-en-bloque";
import { deleteFlowAction } from "@/actions/flow-actions";

/**
 * El borrado en bloque de las pantallas cuyo dominio no tenía ninguno.
 *
 * # Por qué una acción y no N llamadas
 *
 * **Next serializa las acciones de servidor de una misma página** —una en
 * vuelo, la siguiente espera—, así que veinte borrados desde el navegador son
 * veinte idas y vueltas en fila india. Con una selección de verdad eso son
 * minutos de un diálogo en «Eliminando…».
 *
 * # Y por qué el dueño NO llega del navegador
 *
 * Las acciones de una fila de estas pantallas —`deleteCotizacion`,
 * `deleteFinanceContact`, `deleteExpense`…— reciben el `userId` **del
 * navegador** y lo meten en el `where` sin preguntarle nada a la sesión. O sea
 * que basta con mandar otro id para borrar lo de otra cuenta. **Eso ya estaba
 * así y no se toca aquí** —es un frente aparte, el H02 de la auditoría—, pero
 * lo que no se puede hacer es **copiar el patrón** en lo que se escribe hoy.
 *
 * Así que todas las de este fichero resuelven la cuenta con `currentUser()` y
 * la pasan por `assertCanAccessTargetUser`, que es la regla de siempre: uno
 * mismo, el asesor sobre su dueño, las cuentas vinculadas, admin y super admin,
 * y el reseller sobre sus clientes.
 *
 * Y el `where` lleva **las dos cosas**, `id IN (…)` y el dueño: sin el dueño,
 * una lista de ids que llega de fuera decide qué filas se borran.
 */

/** La cuenta sobre la que se actúa, comprobada. `null` si no se puede. */
async function laCuenta(pedida?: string): Promise<string | null> {
    const persona = await currentUser();
    if (!persona) return null;

    // Sin id pedido, la cuenta de quien mira. Es el caso normal: estas
    // pantallas son de una cuenta, no de un cliente.
    const objetivo = String(pedida ?? "").trim() || (persona.ownerId ?? persona.id);
    try {
        await assertCanAccessTargetUser(objetivo);
        return objetivo;
    } catch (error) {
        console.warn("[borrado] se pidió una cuenta que no se alcanza", { objetivo, error });
        return null;
    }
}

const NO_AUTORIZADO: ResumenDelBorrado = {
    success: false,
    borrados: 0,
    fallaron: 0,
    message: "No autorizado.",
};

const SIN_IDS: ResumenDelBorrado = {
    success: false,
    borrados: 0,
    fallaron: 0,
    message: "No se recibió ningún elemento.",
};

/** Cotizaciones. */
export async function eliminarCotizacionesAction(
    ids: string[],
    userId?: string,
): Promise<ResumenDelBorrado> {
    const lista = comoListaDeIds(ids);
    if (lista.length === 0) return SIN_IDS;
    const cuenta = await laCuenta(userId);
    if (!cuenta) return NO_AUTORIZADO;

    const { count } = await db.cotizacion.deleteMany({ where: { id: { in: lista }, userId: cuenta } });
    revalidatePath("/cotizaciones");
    return comoResumen(count, lista.length - count, "cotizaciones");
}

/** Notas. La nota es de la PERSONA, no de la cuenta — ver la regla de Notas. */
export async function eliminarNotasAction(ids: string[]): Promise<ResumenDelBorrado> {
    const lista = comoListaDeIds(ids);
    if (lista.length === 0) return SIN_IDS;

    // `elDuenoDeLasNotas` ignora a propósito el id que llegue del navegador:
    // aquí se hace lo mismo, con la persona de la sesión y nada más. Una nota
    // compartida la borra quien la escribió, no quien la recibe.
    const persona = await currentUser();
    if (!persona) return NO_AUTORIZADO;
    const suyo = persona.sessionUserId ?? persona.id;

    const { count } = await db.userNote.deleteMany({ where: { id: { in: lista }, userId: suyo } });
    revalidatePath("/notas");
    return comoResumen(count, lista.length - count, "notas");
}

/** Bloques de la base de conocimiento (Mis datos). */
export async function eliminarBloquesAction(
    ids: string[],
    userId?: string,
): Promise<ResumenDelBorrado> {
    const lista = comoListaDeIds(ids);
    if (lista.length === 0) return SIN_IDS;
    const cuenta = await laCuenta(userId);
    if (!cuenta) return NO_AUTORIZADO;

    const { count } = await db.knowledgeBlock.deleteMany({
        where: { id: { in: lista }, userId: cuenta },
    });
    revalidatePath("/my-data");
    return comoResumen(count, lista.length - count, "bloques");
}

/** Filas de datos externos. */
export async function eliminarDatosExternosAction(
    ids: string[],
    userId?: string,
): Promise<ResumenDelBorrado> {
    const lista = comoListaDeIds(ids);
    if (lista.length === 0) return SIN_IDS;
    const cuenta = await laCuenta(userId);
    if (!cuenta) return NO_AUTORIZADO;

    const { count } = await db.externalClientData.deleteMany({
        where: { id: { in: lista }, userId: cuenta },
    });
    revalidatePath("/panel/external-data");
    revalidatePath("/admin/external-data");
    return comoResumen(count, lista.length - count, "registros");
}

/** Contactos de Finanzas. */
export async function eliminarContactosDeFinanzasAction(
    ids: string[],
    userId?: string,
): Promise<ResumenDelBorrado> {
    const lista = comoListaDeIds(ids);
    if (lista.length === 0) return SIN_IDS;
    const cuenta = await laCuenta(userId);
    if (!cuenta) return NO_AUTORIZADO;

    const { count } = await db.financeContact.deleteMany({
        where: { id: { in: lista }, userId: cuenta },
    });
    revalidatePath("/dashboard/finance");
    return comoResumen(count, lista.length - count, "contactos");
}

/** Cuentas de Finanzas. */
export async function eliminarCuentasDeFinanzasAction(
    ids: string[],
    userId?: string,
): Promise<ResumenDelBorrado> {
    const lista = comoListaDeIds(ids);
    if (lista.length === 0) return SIN_IDS;
    const cuenta = await laCuenta(userId);
    if (!cuenta) return NO_AUTORIZADO;

    const { count } = await db.financeAccount.deleteMany({
        where: { id: { in: lista }, userId: cuenta },
    });
    revalidatePath("/dashboard/finance/accounts");
    return comoResumen(count, lista.length - count, "cuentas");
}

/**
 * Diagramas.
 *
 * Va de una en una a propósito, por `deleteFlowAction`: esa acción ya resuelve
 * quién manda en el diagrama y además limpia lo que cuelga de él —los
 * compartidos, su sitio en la carpeta—. Reescribir aquí esa comprobación sería
 * un segundo borrado que el día que se afine el de al lado se queda atrás.
 *
 * En serie, nunca en paralelo: el pool de Prisma es de diez por proceso.
 */
export async function eliminarDiagramasAction(ids: string[]): Promise<ResumenDelBorrado> {
    const lista = comoListaDeIds(ids);
    if (lista.length === 0) return SIN_IDS;

    const { borrados, fallaron } = await borrarUnaAUna(lista, async (id) => {
        const res = await deleteFlowAction(id);
        return !!res?.success;
    });
    revalidatePath("/diagramas");
    return comoResumen(borrados, fallaron, "diagramas");
}
