import "server-only";

import { db } from "@/lib/db";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import { isAdminLike, isAdminOrReseller } from "@/lib/rbac";

type Persona = {
    id?: string | null;
    role?: string | null;
    ownerId?: string | null;
    advisorRole?: string | null;
};

/**
 * ¿Manda esta persona sobre la cuenta de un cliente?
 *
 * Es la llave de las cuatro cosas que se hacen desde el menú de una fila en
 * Clientes —Editar, Módulos, Asignar a y Eliminar— y también de Módulos desde
 * cualquier otro sitio.
 *
 * Antes cada acción preguntaba lo suyo: una pedía `isAdminOrReseller` y no
 * miraba de quién era el cliente, otra sí lo miraba pero solo por
 * `demoResellerId`, y la de módulos dejaba pasar al administrador de una cuenta
 * **sobre cualquier cliente de la plataforma**. Tres respuestas distintas a la
 * misma pregunta, y la más suelta era la que decidía.
 *
 * Aquí se responde una vez:
 *
 * - **Admin y super admin**: sobre todas.
 * - **Reseller**: solo sobre las suyas, por los dos caminos con los que se le
 *   vinculan clientes (`demoResellerId`, el nuevo, y la tabla `reseller`, el
 *   viejo). Son las mismas que ya le salen en el listado.
 * - **El `administrador` de una cuenta**: lo que mande su cuenta, ni más ni
 *   menos (ver `lib/cuenta-que-manda.ts`). Es la mano derecha del dueño.
 * - **Todos los demás**, incluido el colaborador con clientes asignados: no.
 *   A él se le pasa una cuenta para que entre a arreglarla, no para que la
 *   administre, y esa diferencia es a propósito.
 */
export async function puedeGestionarAlCliente(
    persona: Persona,
    clientId: string,
): Promise<boolean> {
    const id = String(clientId ?? "").trim();
    if (!id || !persona?.id) return false;

    const cuenta = await cuentaQueManda(persona);
    if (isAdminLike(cuenta.role)) return true;
    if (cuenta.role !== "reseller") return false;

    // Se pregunta por UNO, así que se consulta por uno: traerse la cartera
    // entera para mirar si está dentro sale caro y no hace falta.
    const suyo = await db.user.findFirst({
        where: {
            id,
            OR: [
                { demoResellerId: cuenta.id },
                { reseller_reseller_userIdToUser: { some: { resellerid: cuenta.id } } },
            ],
        },
        select: { id: true },
    });

    return !!suyo;
}

/**
 * Lo mismo, pero reventando con el mensaje de siempre.
 *
 * Las acciones de Clientes ya trabajaban así —`throw` arriba y un `catch` que
 * lo convierte en `success: false`—, y devolver un booleano habría obligado a
 * reescribir cada una.
 */
export async function exigirGestionDelCliente(
    persona: Persona,
    clientId: string,
): Promise<string> {
    const id = String(clientId ?? "").trim();
    if (!id) throw new Error("userId es requerido.");
    if (!(await puedeGestionarAlCliente(persona, id))) {
        throw new Error("No autorizado.");
    }
    return id;
}

/**
 * ¿Puede esta persona crear clientes y ver el panel entero de Clientes?
 *
 * No mira a ningún cliente en concreto: es la puerta de la pantalla, no la de
 * una fila. Un `administrador` entra por su cuenta, como el resto.
 */
export async function puedeAdministrarClientes(persona: Persona): Promise<boolean> {
    if (!persona?.id) return false;
    const cuenta = await cuentaQueManda(persona);
    return isAdminOrReseller(cuenta.role);
}

/**
 * ¿Manda esta persona sobre la ficha de este usuario, sea cliente o de su
 * equipo?
 *
 * Los módulos se reparten en dos sitios y son la misma pregunta con dos
 * respuestas distintas: en Clientes se le dan a la cuenta de un cliente, y en
 * Equipo a alguien de la propia. La comprobación pedía rol de admin o reseller,
 * así que el dueño de una cuenta corriente **no podía guardar los módulos de su
 * propio equipo** —la pantalla estaba, el botón también, y el guardado
 * contestaba que no— y el administrador de una cuenta reseller tampoco.
 */
export async function puedeGestionarLaFichaDe(
    persona: Persona,
    targetId: string,
): Promise<boolean> {
    const id = String(targetId ?? "").trim();
    if (!id || !persona?.id) return false;

    if (await puedeGestionarAlCliente(persona, id)) return true;

    // Nadie se gestiona a sí mismo por aquí: los módulos dicen qué ve una
    // cuenta, y dejar que se los conceda ella misma sería darle la llave de su
    // propia puerta.
    const cuenta = await cuentaQueManda(persona);
    if (id === cuenta.id || id === persona.id) return false;

    // Alguien de su equipo, por los dos caminos: la sub-cuenta que se crea desde
    // Equipo (`owner_id`) y la cuenta ya existente que se vincula
    // (`linked_accounts`).
    const delEquipo = await db.$queryRaw<{ id: string }[]>`
        SELECT u.id
        FROM "User" u
        WHERE u.id = ${id}
          AND (
            u.owner_id = ${cuenta.id}
            OR EXISTS (
              SELECT 1
              FROM "linked_accounts" la
              WHERE la."master_user_id" = ${cuenta.id}
                AND la."linked_user_id" = u.id
            )
          )
        LIMIT 1
    `.catch(() => [] as { id: string }[]);

    return delEquipo.length > 0;
}
