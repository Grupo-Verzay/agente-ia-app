import "server-only";

import { currentUser } from "@/lib/auth";
import { assertCanAccessTargetUser } from "@/actions/billing/helpers/app-access-guard";

/**
 * De qué cuenta es el dato que una acción va a tocar.
 *
 * # El agujero que esto cierra
 *
 * Ocho ficheros de acciones —Cotizaciones, las cuatro de Finanzas, Datos
 * externos, la base de conocimiento y Productos— **no tenían una sola llamada
 * a `currentUser()`**. Recibían el `userId` desde el navegador y lo metían
 * directo en el `where`:
 *
 * ```ts
 * export async function deleteFinanceContact(id: string, userId: string) {
 *   await db.financeContact.updateMany({ where: { id, userId }, … });
 * }
 * ```
 *
 * Una acción de servidor **es un endpoint**: basta con cambiar ese id para
 * borrar, crear o editar los datos de otra cuenta. Y no hace falta ni estar
 * dentro de la pantalla — con la sesión de cualquier cuenta vale, porque nadie
 * preguntaba de quién era el dato.
 *
 * Es el H02 de la auditoría del 2026-09-06, que ya está escrito en este
 * repositorio como regla —*toda acción y toda ruta comprueban de quién es el
 * dato*— y al que le faltaba justamente esto: **aplicarla donde no estaba.**
 *
 * # La regla, en una línea
 *
 * > **El id que llega del navegador no decide nada: se comprueba.** Lo que
 * > manda es la sesión, y `assertCanAccessTargetUser` dice si esa persona
 * > alcanza esa cuenta.
 *
 * Esa función es la de siempre y respeta a todos los que tienen que pasar: uno
 * mismo, el asesor sobre su dueño, las cuentas vinculadas en los dos sentidos,
 * admin y super admin sobre todo, y el reseller sobre sus clientes. Por eso
 * **esto no cierra ningún caso legítimo**: lo único que deja fuera es un id que
 * quien llama no alcanza por ninguno de esos caminos.
 *
 * # Y sin id, la cuenta de quien mira
 *
 * El parámetro sigue siendo opcional a propósito, para no tener que tocar las
 * decenas de pantallas que hoy lo mandan. Cuando no llega —o llega vacío— se
 * resuelve `ownerId ?? id`, que es la **fila efectiva**: la cuenta con la que
 * se entró.
 *
 * Y es la efectiva y no la persona porque esto es un **alcance**, no una firma.
 * Resolver la persona aquí es exactamente lo que rompió la cartera de clientes
 * en el #783: un administrador que llega a su cuenta por `linked_accounts` no
 * tiene `advisorRole` en su propia fila, así que preguntando por él se quedaba
 * sin alcanzar nada.
 *
 * # Dos formas, y por qué hacen falta las dos
 *
 * Las acciones de esta casa devuelven dos cosas distintas: unas un
 * `{ success, message }` y otras el dato pelado. Una sola forma obligaría a la
 * otra mitad a envolver todo en un `try`, y un `catch` que se olvida es un
 * «No autorizado» que se ve como una pantalla vacía.
 */

/**
 * La cuenta comprobada, o `null` si quien llama no la alcanza.
 *
 * Para las acciones que devuelven `{ success, message }`: el `null` se
 * convierte en su propio «No autorizado» sin lanzar nada.
 */
export async function laCuentaDeLaAccion(pedida?: string | null): Promise<string | null> {
    const persona = await currentUser();
    if (!persona) return null;

    const objetivo = String(pedida ?? "").trim() || (persona.ownerId ?? persona.id);

    try {
        await assertCanAccessTargetUser(objetivo);
        return objetivo;
    } catch (error) {
        // No es mudo a propósito. Un «No autorizado» suelto e irreproducible es
        // de lo más caro de diagnosticar, y el caso típico no es un ataque: es
        // una pantalla que manda el id equivocado —el del asesor donde la regla
        // espera el de su dueño—. Sin esta línea no hay forma de saber cuál.
        console.warn("[acciones] se pidió una cuenta que no se alcanza", {
            objetivo,
            quien: persona.id,
            error: error instanceof Error ? error.message : error,
        });
        return null;
    }
}

/**
 * Igual, pero lanza. Para las acciones que devuelven el dato pelado y no
 * tienen dónde meter un `success: false`.
 */
export async function exigirLaCuentaDeLaAccion(pedida?: string | null): Promise<string> {
    const cuenta = await laCuentaDeLaAccion(pedida);
    if (!cuenta) throw new Error("No autorizado.");
    return cuenta;
}
