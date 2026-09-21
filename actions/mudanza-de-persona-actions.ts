"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { laCuentaQueConfigura } from "@/lib/cuenta-que-configura";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
import { laFamiliaDeLaCuenta } from "@/lib/familia-de-cuentas";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import {
    PORQUE,
    comoRolDeDestino,
    porQueNoSePuedeMudar,
    type RolDeDestino,
} from "@/lib/mudanza-de-persona";
import {
    aplicarLaMudanza,
    elInforme,
    laCuentaDeDestino,
    laPersonaQueSeMuda,
    type FilaDeCuenta,
    type FilaDePersona,
    type Informe,
    type LoQueSeHizo,
} from "@/lib/mudanza-de-persona-db";

/**
 * Mover una persona de una cuenta a otra, en dos pasos.
 *
 * **El informe va primero, y no es una cortesía**: lo que se mueve es poco
 * —porque su id no cambia— pero lo que deja de alcanzar puede ser el trabajo
 * de una persona. Así que `informeDeLaMudanzaAction` cuenta contra la base y no
 * escribe nada, y `mudarALaPersonaAction` es el único que escribe.
 *
 * Las dos pasan por la misma puerta. Una acción ES un endpoint: esconder el
 * diálogo no cierra la petición.
 */

type Respuesta<T> = { success: true; data: T } | { success: false; message: string };

const NO = (message: string) => ({ success: false as const, message });

/**
 * Quién puede mudar a alguien.
 *
 * **Las DOS cuentas**, la que la suelta y la que la recibe. Con una sola se
 * podría sacar gente de una cuenta ajena, o meterla en una donde no se manda —
 * y meter a alguien en una cuenta es darle el alcance entero de esa cuenta.
 *
 * Y «mandar en las dos» se pregunta con la puerta de siempre
 * (`laCuentaQueConfigura`) más la regla que ya rige en los canales que cruzan y
 * en las Finanzas de la familia: **solo la cuenta MADRE reparte entre las
 * cuentas de su familia**. El administrador de una vinculada participa en su
 * cuenta; no mueve gente entre las hermanas.
 *
 * El superadministrador de verdad pasa esté en la cuenta que esté, que es la
 * regla de *«Súper administrador» es la PERSONA*.
 */
async function puedeMudar(origenId: string, destinoId: string): Promise<boolean> {
    const user = await currentUser();
    if (!user?.id) return false;
    if (esSuperAdminDeVerdad(user)) return true;

    const cuenta = await laCuentaQueConfigura();
    if (!cuenta?.id) return false;

    // Su propia cuenta es siempre una de las dos: mover a alguien de su equipo
    // a otra, o traerlo. Lo demás es repartir entre cuentas ajenas.
    if (cuenta.id !== origenId && cuenta.id !== destinoId) return false;

    const familia = await laFamiliaDeLaCuenta(cuenta.id);
    if (familia.raiz !== cuenta.id) return false;
    return familia.cuentas.includes(origenId) && familia.cuentas.includes(destinoId);
}

/**
 * Lo que las dos acciones comprueban antes de hacer nada.
 *
 * Va con `ok` como discriminante y no con un `"error" in caso`: sin un campo
 * que distinga las dos ramas, el compilador no estrecha la unión y el mensaje
 * sale como `string | undefined`.
 */
type Caso =
    | { ok: false; error: string }
    | {
          ok: true;
          persona: FilaDePersona;
          destino: FilaDeCuenta;
          rol: RolDeDestino;
          origenId: string;
      };

async function elCaso(personaId: unknown, destinoId: unknown, rolPedido: unknown): Promise<Caso> {
    const id = typeof personaId === "string" ? personaId.trim() : "";
    const destino = typeof destinoId === "string" ? destinoId.trim() : "";
    const rol: RolDeDestino = comoRolDeDestino(rolPedido);

    const persona = id ? await laPersonaQueSeMuda(id) : null;
    const cuenta = destino ? await laCuentaDeDestino(destino) : null;

    const no = porQueNoSePuedeMudar(persona, cuenta);
    if (no) return { ok: false, error: PORQUE[no] };
    // `porQueNoSePuedeMudar` ya garantiza los dos, pero el compilador no lo
    // sabe y un `!` aquí sería fiarlo a que nadie toque esa función.
    if (!persona?.ownerId || !cuenta) return { ok: false, error: PORQUE.no_es_del_equipo };

    if (!(await puedeMudar(persona.ownerId, cuenta.id))) {
        return { ok: false, error: "No autorizado para mover a esta persona entre estas dos cuentas." };
    }

    return { ok: true, persona, destino: cuenta, rol, origenId: persona.ownerId };
}

/** Paso uno: qué se va a mover y qué se va a dejar de alcanzar. No escribe. */
export async function informeDeLaMudanzaAction(
    personaId: string,
    destinoId: string,
    rolPedido: string,
): Promise<Respuesta<Informe>> {
    const caso = await elCaso(personaId, destinoId, rolPedido);
    if (!caso.ok) return NO(caso.error);

    const informe = await elInforme({
        persona: caso.persona,
        destino: caso.destino,
        rol: caso.rol,
    });
    return { success: true, data: informe };
}

/** Paso dos: aplicarla. */
export async function mudarALaPersonaAction(
    personaId: string,
    destinoId: string,
    rolPedido: string,
): Promise<Respuesta<LoQueSeHizo>> {
    const caso = await elCaso(personaId, destinoId, rolPedido);
    if (!caso.ok) return NO(caso.error);

    try {
        const hecho = await aplicarLaMudanza({
            personaId: caso.persona.id,
            origenId: caso.origenId,
            destinoId: caso.destino.id,
            rol: caso.rol,
        });

        // Mover a alguien de cuenta cambia a qué llega, y pasa una vez cada
        // mucho: queda dicho con quién lo hizo. No va a `audit_logs` porque esa
        // tabla la lee el historial de una nota y su `entity_type` es una lista
        // cerrada de cosas del CRM; una fila ahí no la vería nadie.
        const user = await currentUser();
        console.info("[mudanza] persona movida de cuenta", {
            persona: caso.persona.id,
            de: caso.origenId,
            a: caso.destino.id,
            rol: caso.rol,
            porQuien: user ? laPersonaQueActua(user).id : null,
            ...hecho,
        });

        revalidatePath("/equipo");
        return { success: true, data: hecho };
    } catch (error) {
        // El caso típico no es un ataque: es que alguien la movió mientras se
        // leía el informe. Sin decirlo se ve como un botón que no hace nada.
        console.warn("[mudanza] no se pudo aplicar", {
            persona: caso.persona.id,
            destino: caso.destino.id,
            error: String(error),
        });
        return NO(error instanceof Error ? error.message : "No se pudo mover a esta persona.");
    }
}

/**
 * Las cuentas de la familia a las que se puede mudar a esta persona.
 *
 * **Sin la suya dentro.** La acción la rechazaría con «ya está en esa cuenta»,
 * y una opción que al elegirla da error es peor que no ofrecerla. Por eso
 * recibe a quién se va a mover y no es una lista a secas.
 */
export async function cuentasParaMudarAction(
    personaId?: string,
): Promise<Respuesta<{ id: string; nombre: string; correo: string }[]>> {
    const user = await currentUser();
    if (!user?.id) return NO("No autorizado.");

    const cuenta = await laCuentaQueConfigura();
    if (!cuenta?.id) return NO("No autorizado.");

    const suya =
        typeof personaId === "string" && personaId.trim()
            ? (await laPersonaQueSeMuda(personaId.trim()))?.ownerId ?? null
            : null;

    const familia = await laFamiliaDeLaCuenta(cuenta.id);
    // Solo la raíz reparte, **la misma condición que `puedeMudar`**, con la
    // misma excepción para el superadministrador de verdad. Si el selector
    // ofreciera algo que la puerta rechaza, sería un botón que da error; y si
    // ofreciera menos, se estaría cerrando desde la pantalla algo que la puerta
    // deja pasar — que es como se pierde una regla.
    if (!esSuperAdminDeVerdad(user) && familia.raiz !== cuenta.id) {
        return { success: true, data: [] };
    }

    const filas = await Promise.all(familia.cuentas.map((id) => laCuentaDeDestino(id)));
    return {
        success: true,
        data: filas
            .filter((f): f is NonNullable<typeof f> => !!f && !f.ownerId && f.id !== suya)
            .map((f) => ({ id: f.id, nombre: f.nombre, correo: f.correo })),
    };
}
