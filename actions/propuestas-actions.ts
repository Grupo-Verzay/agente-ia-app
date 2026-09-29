"use server";

import { revalidatePath } from "next/cache";

import { currentUser } from "@/lib/auth";
import { laCuentaDeLaAccion } from "@/lib/cuenta-de-la-accion";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { elOrigenDeLaApp } from "@/lib/origen-de-la-app";
import {
    comoPropuesta,
    elEnlaceDeLaPropuesta,
    elJidDelWhatsapp,
    elMensajeDeWhatsapp,
    type DatosDePropuesta,
    type Propuesta,
} from "@/lib/propuestas";
import {
    borrarPropuesta,
    crearPropuesta,
    editarPropuesta,
    elEsloganDe,
    EnlaceOcupado,
    laPropuestaDeLaCuenta,
    lasLineasParaEnviar,
    lasPropuestasDe,
    ponerElEslogan,
    type LineaParaEnviar,
} from "@/lib/propuestas-db";
import { resolveWhatsAppDispatcherLine, sendViaWhatsAppDispatcher } from "@/actions/whatsapp-dispatcher";

/**
 * Las acciones de Panel › Propuestas.
 *
 * **Ninguna recibe un id de cuenta**: la cuenta sale de la sesión
 * (`laCuentaDeLaAccion()` sin nada pedido, o sea la fila efectiva) y toda
 * consulta va acotada por ella. Así una propuesta de otra cuenta se contesta
 * igual que una que no existe, pidan el id que pidan.
 *
 * Y es de quien ADMINISTRA la cuenta (`canManageWorkspace`): una propuesta
 * comercial pone precios, así que un `agente` no la crea ni la cambia. Es la
 * misma puerta que el resto de ajustes de una cuenta.
 */

type Respuesta<T> = { success: true; data: T } | { success: false; message: string };

const RUTA = "/panel/propuestas";

async function quienManda(): Promise<{ cuenta: string; personaId: string } | null> {
    const user = await currentUser();
    if (!user || !canManageWorkspace(user)) return null;
    const cuenta = await laCuentaDeLaAccion();
    if (!cuenta) return null;
    return { cuenta, personaId: laPersonaQueActua(user).id };
}

const ENLACE_OCUPADO = "Ese enlace personalizado ya lo usa otra propuesta: elige otro.";

const NO_AUTORIZADO = { success: false as const, message: "No autorizado." };

export async function listarPropuestasAction(): Promise<
    Respuesta<{ propuestas: Propuesta[]; origen: string; lineas: LineaParaEnviar[]; eslogan: string }>
> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    try {
        const [propuestas, origen, lineas, eslogan] = await Promise.all([
            lasPropuestasDe(q.cuenta),
            elOrigenDeLaApp(),
            lasLineasParaEnviar(q.cuenta),
            elEsloganDe(q.cuenta),
        ]);
        return { success: true, data: { propuestas, origen, lineas, eslogan } };
    } catch (error) {
        console.error("[propuestas] no se pudieron leer", { cuenta: q.cuenta, error: String(error) });
        return { success: false, message: "No se pudieron cargar las propuestas." };
    }
}

/**
 * La línea que llega del navegador no se da por buena: tiene que ser una de las
 * de ESTA cuenta. Si no, una propuesta podría quedar apuntando a la línea de
 * otra cuenta y el envío saldría desde un número ajeno.
 */
async function laLineaEsDeLaCuenta(cuenta: string, datos: DatosDePropuesta): Promise<string | null> {
    if (!datos.linea) return null;
    const lineas = await lasLineasParaEnviar(cuenta);
    return lineas.some((l) => l.instanceName === datos.linea) ? null : "Esa línea de WhatsApp no es de esta cuenta.";
}

export async function crearPropuestaAction(raw: unknown): Promise<Respuesta<Propuesta>> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    const v = comoPropuesta(raw);
    if (!v.ok) return { success: false, message: v.motivo };
    const malaLinea = await laLineaEsDeLaCuenta(q.cuenta, v.datos);
    if (malaLinea) return { success: false, message: malaLinea };
    try {
        const p = await crearPropuesta({ ...v.datos, cuentaId: q.cuenta, creadoPorId: q.personaId || null });
        revalidatePath(RUTA);
        return { success: true, data: p };
    } catch (error) {
        if (error instanceof EnlaceOcupado) return { success: false, message: ENLACE_OCUPADO };
        console.error("[propuestas] no se pudo crear", { cuenta: q.cuenta, error: String(error) });
        return { success: false, message: "No se pudo crear la propuesta." };
    }
}

export async function editarPropuestaAction(id: unknown, raw: unknown): Promise<Respuesta<Propuesta>> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    if (typeof id !== "string" || !id.trim()) return { success: false, message: "Propuesta no encontrada." };
    const v = comoPropuesta(raw);
    if (!v.ok) return { success: false, message: v.motivo };
    const malaLinea = await laLineaEsDeLaCuenta(q.cuenta, v.datos);
    if (malaLinea) return { success: false, message: malaLinea };
    try {
        const p = await editarPropuesta(q.cuenta, id, v.datos);
        if (!p) return { success: false, message: "Propuesta no encontrada." };
        revalidatePath(RUTA);
        return { success: true, data: p };
    } catch (error) {
        if (error instanceof EnlaceOcupado) return { success: false, message: ENLACE_OCUPADO };
        console.error("[propuestas] no se pudo editar", { cuenta: q.cuenta, id, error: String(error) });
        return { success: false, message: "No se pudo guardar la propuesta." };
    }
}

export async function borrarPropuestaAction(id: unknown): Promise<Respuesta<null>> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    if (typeof id !== "string" || !id.trim()) return { success: false, message: "Propuesta no encontrada." };
    try {
        const ok = await borrarPropuesta(q.cuenta, id);
        if (!ok) return { success: false, message: "Propuesta no encontrada." };
        revalidatePath(RUTA);
        return { success: true, data: null };
    } catch (error) {
        console.error("[propuestas] no se pudo borrar", { cuenta: q.cuenta, id, error: String(error) });
        return { success: false, message: "No se pudo eliminar la propuesta." };
    }
}

/** El eslogan del encabezado de las propuestas de la cuenta. Vacío = ninguno. */
export async function ponerEsloganAction(eslogan: unknown): Promise<Respuesta<string>> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    try {
        const guardado = await ponerElEslogan(q.cuenta, typeof eslogan === "string" ? eslogan : "");
        revalidatePath(RUTA);
        return { success: true, data: guardado };
    } catch (error) {
        console.error("[propuestas] no se pudo guardar el eslogan", { cuenta: q.cuenta, error: String(error) });
        return { success: false, message: "No se pudo guardar el eslogan." };
    }
}

/**
 * Manda el enlace de la propuesta por WhatsApp: al número del cliente que tiene
 * la PROPUESTA, desde la línea que tiene la PROPUESTA. Nada de eso llega del
 * navegador: solo el id, y la propuesta se lee de la base acotada por la cuenta.
 *
 * Sale por el despachador del servidor, que es el mismo camino que ya usan los
 * avisos de la plataforma para Evolution, Waha y Meta, y deja su burbuja en el
 * chat. **Nunca por otra línea**: si la elegida no está conectada se dice, y no
 * se cae a la siguiente — el cliente recibiría la propuesta de un número que no
 * conoce.
 */
export async function enviarPropuestaPorWhatsappAction(id: unknown): Promise<Respuesta<{ a: string; linea: string }>> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    if (typeof id !== "string" || !id.trim()) return { success: false, message: "Propuesta no encontrada." };
    try {
        const p = await laPropuestaDeLaCuenta(q.cuenta, id);
        if (!p) return { success: false, message: "Propuesta no encontrada." };
        if (!p.whatsapp) {
            return { success: false, message: "Esta propuesta no tiene el WhatsApp del cliente. Edítala y escríbelo." };
        }
        if (!p.linea) {
            return { success: false, message: "Esta propuesta no tiene la línea desde la que se envía. Edítala y elígela." };
        }
        const lineas = await lasLineasParaEnviar(q.cuenta);
        const deLaCuenta = lineas.find((l) => l.instanceName === p.linea);
        if (!deLaCuenta) {
            return { success: false, message: `La línea «${p.linea}» ya no es de esta cuenta. Edita la propuesta y elige otra.` };
        }
        const dispatcher = await resolveWhatsAppDispatcherLine({
            ownerUserId: q.cuenta,
            preferredInstanceName: p.linea,
            includeAdminFallback: false,
        });
        // El despachador cae a otra línea conectada si la pedida no lo está:
        // aquí eso sería mandar desde un número que no es el elegido.
        if (!dispatcher || dispatcher.instanceName !== p.linea) {
            console.warn("[propuestas] la línea elegida no está conectada", { cuenta: q.cuenta, linea: p.linea, otra: dispatcher?.instanceName ?? null });
            return { success: false, message: `La línea «${deLaCuenta.nombre}» no está conectada ahora mismo. Conéctala y vuelve a intentarlo.` };
        }
        const enlace = elEnlaceDeLaPropuesta(await elOrigenDeLaApp(), p);
        const r = await sendViaWhatsAppDispatcher({
            dispatcher,
            remoteJid: elJidDelWhatsapp(p.whatsapp),
            text: elMensajeDeWhatsapp(p.cliente, enlace),
        });
        if (!r?.success) {
            console.warn("[propuestas] el envío por WhatsApp no salió", { cuenta: q.cuenta, id, motivo: r?.message });
            return { success: false, message: r?.message ? `No se pudo enviar: ${r.message}` : "No se pudo enviar por WhatsApp." };
        }
        return { success: true, data: { a: `+${p.whatsapp}`, linea: deLaCuenta.nombre } };
    } catch (error) {
        console.error("[propuestas] no se pudo enviar por WhatsApp", { cuenta: q.cuenta, id, error: String(error) });
        return { success: false, message: "No se pudo enviar por WhatsApp." };
    }
}
