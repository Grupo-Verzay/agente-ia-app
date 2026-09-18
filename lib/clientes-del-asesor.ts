import "server-only";

import { db } from "@/lib/db";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import { isAdminOrReseller } from "@/lib/rbac";

/**
 * La fila de la persona real, cuando no es la que viene en la sesión.
 *
 * Solo consulta **dentro de otra cuenta**, que es el único caso en que los dos
 * ids difieren; en el normal devuelve lo que ya traía y no cuesta nada. Hacen
 * falta sus tres campos —`role`, `ownerId` y `advisorRole`— porque son los que
 * `cuentaQueManda` mira para decidir si hereda el alcance de su cuenta.
 *
 * Si la fila no se puede leer se sigue con la efectiva, que es como estaba
 * antes: se ve de menos, nunca de más. Pero **no es mudo**, porque una cartera
 * equivocada se nota como un «No autorizado» suelto e irreproducible.
 */
async function laPersonaDetras(quienMira: {
    id?: string | null;
    role?: string | null;
    ownerId?: string | null;
    advisorRole?: string | null;
    sessionUserId?: string | null;
}) {
    const personaId = quienMira.sessionUserId?.trim();
    if (!personaId || personaId === quienMira.id) return quienMira;

    try {
        const fila = await db.user.findUnique({
            where: { id: personaId },
            select: { id: true, role: true, ownerId: true, advisorRole: true },
        });
        if (fila) return fila;
    } catch (error) {
        console.warn("[cartera] no se pudo leer la fila de la persona", {
            persona: personaId,
            error: String(error),
        });
    }
    return quienMira;
}

/**
 * Los clientes que le tocan a quien está preguntando.
 *
 * Es la MISMA cartera que ya decide qué ve en Clientes (`advisor_clients`):
 * alguien del equipo no tiene rol de admin, pero sí puede tener clientes
 * asignados, y entonces ve esos y solo esos.
 *
 * - `null` = sin límite propio. Es admin, super admin o reseller: cada uno se
 *   acota por su regla (el reseller por sus asignaciones, el admin por lo suyo).
 * - `[]` = no le han asignado ninguno. Quien llame corta con «No autorizado».
 *
 * Y el `administrador` de una cuenta no pasa por su cartera sino por la de su
 * cuenta: actúa por ella (ver `lib/cuenta-que-manda.ts`), así que sobre una
 * cuenta de admin o de reseller devuelve `null` —sin límite propio— y ve lo
 * mismo que su jefe sin que nadie le asigne nada.
 *
 * Estaba escrito dentro de `userClientDataActions` y no salía de ahí, así que
 * cada pantalla nueva volvía a pedir rol de admin y le cerraba la puerta al
 * asesor. Vive aquí para que Clientes, Instancias y Analíticas repartan igual.
 */
export async function clientesDelAsesor(quienMira: {
    id?: string | null;
    role?: string | null;
    ownerId?: string | null;
    advisorRole?: string | null;
    sessionUserId?: string | null;
}): Promise<string[] | null> {
    if (!quienMira?.id) return [];

    // La cartera es de la PERSONA, y `currentUser()` devuelve la fila EFECTIVA.
    // Dentro de otra cuenta —«Ingresar» o el conmutador— esa fila es la del
    // cliente, así que se leía SU cartera en vez de la de quien está sentado
    // delante: Clientes, Instancias y Analíticas contestaban con una lista que
    // no es la suya, o con «No autorizado» sin motivo.
    const persona = await laPersonaDetras(quienMira);

    // Quién manda aquí. El administrador de una cuenta actúa POR ella: su
    // alcance es el de su cuenta, no el suyo propio, y por eso no hay que
    // asignarle los clientes uno a uno (ver `lib/cuenta-que-manda.ts`). **Eso
    // no cambia**: lo único que se corrige es DE QUIÉN se parte.
    const cuenta = await cuentaQueManda(persona);
    if (isAdminOrReseller(cuenta.role)) return null;

    try {
        const filas = await db.advisorClient.findMany({
            where: { advisorUserId: cuenta.id },
            select: { clientUserId: true },
        });
        return Array.from(new Set(filas.map((f) => f.clientUserId)));
    } catch (error) {
        // La tabla la crea la migración del backend. Si aún no está, esta
        // persona no tiene cartera; pero un fallo mudo aquí se ve como un
        // «No autorizado» sin motivo, así que se dice.
        console.warn("[cartera] no se pudieron leer los clientes del asesor", {
            asesor: cuenta.id,
            error: String(error),
        });
        return [];
    }
}
