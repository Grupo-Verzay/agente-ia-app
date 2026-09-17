import "server-only";

import { cache } from "react";

import { db } from "@/lib/db";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import { isAdminLike, isAdminOrReseller } from "@/lib/rbac";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
import {
    esRolDePlataforma,
    porQueNoPuedeOtorgarlo,
    puedeCambiarElRol,
    rolQueReparte,
    rolesQuePuedeOtorgar,
    type RolDePlataforma,
} from "@/lib/roles-que-puede-otorgar";

type Persona = {
    id?: string | null;
    role?: string | null;
    rolDeLaPersona?: string | null;
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

    // El súper administrador de plataforma manda esté en la cuenta que esté:
    // es la regla de `lib/super-admin-de-verdad.ts`, y va la PRIMERA porque
    // detrás de la condición de cuenta no sirve de nada.
    if (esSuperAdminDeVerdad(persona)) return true;

    const cuenta = await cuentaQueManda(persona);

    // Una cuenta vinculada NO gestiona a la cuenta de la que cuelga. Va antes
    // que el `isAdminLike`: la cuenta vinculada de este caso tiene rol `admin`,
    // así que esa línea la dejaba pasar y podía editar —y degradar— a su
    // propia madre.
    if (await cuelgaDeEstaCuenta(cuenta.id, id)) return false;

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

/**
 * Las cuentas de las que cuelga esta, las que están POR ENCIMA de ella.
 *
 * Son dos caminos, los mismos dos por los que se vincula gente en toda la App:
 * `linked_accounts` —la cuenta ya existente que se cuelga de otra, que es el
 * caso de Verzay | Atencion bajo Grupo Verzay— y `owner_id`, la sub-cuenta que
 * se crea desde Equipo.
 *
 * Existe porque desde una cuenta vinculada con rol `admin` el listado de
 * Clientes devolvía **a su propia madre** —`getEnrichedClients` trae a todo el
 * que no tenga `ownerId`— y desde ahí se podía abrir su ficha y editarla. La
 * dirección de la relación es lo importante: la madre manda sobre la hija, no
 * al revés.
 *
 * Memoizada por petición: la misma pantalla lo pregunta una vez para filtrar la
 * lista y otra por cada fila que se intenta tocar.
 */
export const cuentasDeLasQueCuelga = cache(
    async (cuentaId: string): Promise<string[]> => {
        const id = String(cuentaId ?? "").trim();
        if (!id) return [];

        const filas = await db.$queryRaw<{ id: string }[]>`
            SELECT la."master_user_id" AS id
            FROM "linked_accounts" la
            WHERE la."linked_user_id" = ${id}
            UNION
            SELECT u."owner_id" AS id
            FROM "User" u
            WHERE u.id = ${id} AND u."owner_id" IS NOT NULL
        `.catch((e) => {
            // Un fallo mudo aquí abre justo el agujero que esto cierra, así que
            // se dice. Se sigue con la lista vacía —el resto de puertas siguen
            // puestas— pero queda constancia de por qué.
            console.warn("[clientes] no se pudo leer de qué cuentas cuelga", {
                cuenta: id,
                error: e instanceof Error ? e.message : String(e),
            });
            return [] as { id: string }[];
        });

        return filas.map((f) => f.id).filter(Boolean);
    },
);

/** ¿Es `posibleMadre` una cuenta de la que cuelga `cuentaId`? */
export async function cuelgaDeEstaCuenta(
    cuentaId: string,
    posibleMadre: string,
): Promise<boolean> {
    const madre = String(posibleMadre ?? "").trim();
    if (!madre || !cuentaId) return false;
    return (await cuentasDeLasQueCuelga(cuentaId)).includes(madre);
}

/**
 * Con qué rol reparte roles esta persona.
 *
 * La mitad asíncrona de `rolQueReparte`: lo único que hace falta ir a buscar es
 * el rol de la cuenta por la que actúa. Lo usan las acciones que guardan y las
 * pantallas que pintan el desplegable, **la misma función para las dos**.
 */
export async function rolConElQueReparte(persona: Persona): Promise<string> {
    if (esSuperAdminDeVerdad(persona)) return "super_admin";
    if (!persona?.id) return "";
    return rolQueReparte(false, (await cuentaQueManda(persona)).role);
}

/** Los roles que esta persona puede poner. Es lo que lista el desplegable. */
export async function rolesQueRepartePersona(
    persona: Persona,
): Promise<RolDePlataforma[]> {
    return rolesQuePuedeOtorgar(await rolConElQueReparte(persona));
}

export type VeredictoDelRol =
    | { ok: true; rol: RolDePlataforma | undefined }
    | { ok: false; motivo: string };

/**
 * Qué rol se puede guardar de verdad, mirando el que el formulario pide y el
 * que la cuenta ya tenía.
 *
 * Se contesta con un veredicto en vez de reventar a propósito: el mensaje tiene
 * que llegar **a la pantalla**, y el `catch` de las acciones de Clientes
 * convierte cualquier `throw` en «Error interno al actualizar los datos», que
 * es tanto como no decir nada.
 *
 * `rol: undefined` significa «no lo toques»: o no vino en el formulario, o es
 * el mismo que ya tenía. Eso segundo importa más de lo que parece — el
 * formulario de edición manda el rol SIEMPRE, así que sin esta salida un
 * `admin` no podría guardarle el teléfono a una cuenta con rol superior aunque
 * no estuviera tocando el rol.
 */
export async function elRolQueSePuedeGuardar(
    persona: Persona,
    rolPedido: unknown,
    rolActual: string | null | undefined,
): Promise<VeredictoDelRol> {
    const pedido = typeof rolPedido === "string" ? rolPedido.trim() : "";
    if (!pedido) return { ok: true, rol: undefined };
    if (pedido === (rolActual ?? "")) return { ok: true, rol: undefined };

    const reparte = await rolConElQueReparte(persona);
    if (!puedeCambiarElRol(reparte, rolActual, pedido)) {
        console.warn("[clientes] intento de asignar un rol que no le toca", {
            quien: persona?.id ?? null,
            reparteComo: reparte,
            rolActual: rolActual ?? null,
            rolPedido: pedido,
        });
        return { ok: false, motivo: porQueNoPuedeOtorgarlo(reparte, rolActual, pedido) };
    }

    return { ok: true, rol: pedido as RolDePlataforma };
}

/**
 * El rol con el que nace un cliente nuevo.
 *
 * Crear no tiene «rol actual» contra el que comparar, así que la regla es la
 * corta: solo se puede poner uno de los que reparte. Y lo que no venga —o venga
 * inventado— nace `user`, que es lo que ya hacía el formulario por defecto.
 */
export async function elRolConElQueNace(
    persona: Persona,
    rolPedido: unknown,
): Promise<VeredictoDelRol> {
    const pedido = typeof rolPedido === "string" ? rolPedido.trim() : "";
    if (!pedido || !esRolDePlataforma(pedido)) return { ok: true, rol: "user" };

    const reparte = await rolConElQueReparte(persona);
    if (!rolesQuePuedeOtorgar(reparte).includes(pedido)) {
        console.warn("[clientes] intento de crear una cuenta con un rol que no le toca", {
            quien: persona?.id ?? null,
            reparteComo: reparte,
            rolPedido: pedido,
        });
        return { ok: false, motivo: porQueNoPuedeOtorgarlo(reparte, "user", pedido) };
    }

    return { ok: true, rol: pedido };
}
