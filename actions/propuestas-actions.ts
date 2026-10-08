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
import { comoPlantilla, type DatosDePlantilla, type PlantillaDePlan } from "@/lib/plantillas-de-planes";
import { mandaEnLaCasaDeVerdad } from "@/lib/mando-de-la-casa";
import {
    elAvisoDelPlanApagado,
    elPrecioEnLaMoneda,
    laLlaveDelPlan,
    type PlanParaCargar,
    type PlanParaElegir,
} from "@/lib/plan-de-la-propuesta";
import { elPlanParaCargar, losPlanesParaElegir, losResumenesDeLosPlanes } from "@/lib/plan-de-la-propuesta.server";
import {
    borrarPlantilla,
    borrarPropuesta,
    crearPlantilla,
    crearPropuesta,
    editarPlantilla,
    editarPropuesta,
    elEsloganDe,
    elSaludoDe,
    ponerLosAjustes,
    EnlaceOcupado,
    lasPlantillasDe,
    laPropuestaDeLaCuenta,
    lasLineasParaEnviar,
    lasPropuestasDe,
    ponerElEslogan,
    type LineaParaEnviar,
} from "@/lib/propuestas-db";
import { resolveWhatsAppDispatcherLine, sendViaWhatsAppDispatcher } from "@/actions/whatsapp-dispatcher";
import { resolveInstanceOwner } from "@/lib/chat-persistence";
import {
    comoDestino,
    elDestinoParaMostrar,
    elJidDelDestino,
    esDestinoLid,
    losDigitosDelDestino,
} from "@/lib/destino-de-la-llamada";

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

type QuienManda = {
    cuenta: string;
    personaId: string;
    /**
     * ¿Manda en la CASA? Solo la casa enlaza una plantilla a un plan del panel
     * de Planes y pone planes en una propuesta: esos planes son los que vende la
     * plataforma. Se pregunta solo cuando hace falta (cuesta una consulta).
     */
    esDeLaCasa: () => Promise<boolean>;
};

/**
 * `pedida` solo lo pasan las acciones del panel de Chats: allí la cuenta es la
 * DUEÑA de la línea de la conversación, que puede ser una hija. Pasa por
 * `laCuentaDeLaAccion`, o sea `assertCanAccessTargetUser`: hacia abajo, nunca
 * hacia arriba.
 */
async function quienManda(pedida?: string | null): Promise<QuienManda | null> {
    const user = await currentUser();
    if (!user || !canManageWorkspace(user)) return null;
    const cuenta = await laCuentaDeLaAccion(pedida ?? undefined);
    if (!cuenta) return null;
    let casa: Promise<boolean> | null = null;
    return {
        cuenta,
        personaId: laPersonaQueActua(user).id,
        esDeLaCasa: () => (casa ??= mandaEnLaCasaDeVerdad(user).catch(() => false)),
    };
}

const SOLO_LA_CASA = "Solo quien administra la plataforma puede enlazar una plantilla a un plan del panel de Planes.";

/**
 * Las plantillas con lo VIGENTE de su plan: una enlazada se pinta con el nombre
 * y el precio de hoy del panel de Planes, no con la foto que se guardó.
 */
async function conLoVigente(plantillas: PlantillaDePlan[]): Promise<PlantillaDePlan[]> {
    const refs = plantillas.flatMap((p) => (p.plan ? [p.plan] : []));
    if (refs.length === 0) return plantillas;
    const vigentes = await losResumenesDeLosPlanes(refs);
    return plantillas.map((p) => {
        const v = p.plan ? vigentes.get(laLlaveDelPlan(p.plan)) : undefined;
        if (!v) return p;
        return { ...p, nombre: v.nombre, precio: elPrecioEnLaMoneda(v, p.moneda) ?? p.precio };
    });
}

const ENLACE_OCUPADO = "Ese enlace personalizado ya lo usa otra propuesta: elige otro.";

const NO_AUTORIZADO = { success: false as const, message: "No autorizado." };

export async function listarPropuestasAction(): Promise<
    Respuesta<{
        propuestas: Propuesta[];
        origen: string;
        lineas: LineaParaEnviar[];
        eslogan: string;
        saludo: string;
        plantillas: PlantillaDePlan[];
        /** Los planes del panel de Planes que se pueden enlazar. Vacío si no manda en la casa. */
        planes: PlanParaElegir[];
    }>
> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    try {
        const [propuestas, origen, lineas, eslogan, saludo, plantillas, planes] = await Promise.all([
            lasPropuestasDe(q.cuenta),
            elOrigenDeLaApp(),
            lasLineasParaEnviar(q.cuenta),
            elEsloganDe(q.cuenta),
            elSaludoDe(q.cuenta).catch(() => ""),
            lasPlantillasDe(q.cuenta).then(conLoVigente),
            q.esDeLaCasa().then((casa) => (casa ? losPlanesParaElegir() : [])),
        ]);
        return { success: true, data: { propuestas, origen, lineas, eslogan, saludo, plantillas, planes } };
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
    const planes = (await q.esDeLaCasa()) ? v.datos.planes : [];
    try {
        const p = await crearPropuesta({ ...v.datos, planes, cuentaId: q.cuenta, creadoPorId: q.personaId || null });
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
        // Quien no manda en la casa no pone ni quita planes: se quedan los que tenía.
        let planes = v.datos.planes;
        if (!(await q.esDeLaCasa())) {
            const antes = await laPropuestaDeLaCuenta(q.cuenta, id);
            if (!antes) return { success: false, message: "Propuesta no encontrada." };
            planes = antes.planes;
        }
        const p = await editarPropuesta(q.cuenta, id, { ...v.datos, planes });
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

/**
 * Las PLANTILLAS DE PLANES: crear, editar y eliminar, con la MISMA puerta que
 * las propuestas (quien administra la cuenta) y acotadas por la cuenta de la
 * sesión. Sin tope de cuántas. Ninguna toca una propuesta: las propuestas
 * guardan su copia.
 */
/**
 * Una plantilla enlazada guarda solo la referencia al plan; el nombre y el
 * precio que se guardan son una FOTO para ordenar la lista, sacada del plan hoy.
 * Lo de verdad se lee al cargarla (`cargarPlanEnLaPropuestaAction`).
 */
async function conLaFotoDelPlan(
    q: QuienManda,
    datos: DatosDePlantilla,
): Promise<{ ok: true; datos: typeof datos } | { ok: false; message: string }> {
    if (!datos.plan) return { ok: true, datos };
    if (!(await q.esDeLaCasa())) return { ok: false, message: SOLO_LA_CASA };
    const plan = await elPlanParaCargar(datos.plan, await elOrigenDeLaApp());
    if (!plan) return { ok: false, message: "Ese plan no está en el panel de Planes." };
    return {
        ok: true,
        datos: { ...datos, nombre: plan.nombre, precio: elPrecioEnLaMoneda(plan, datos.moneda) ?? 0, caracteristicas: [] },
    };
}

export async function crearPlantillaAction(raw: unknown): Promise<Respuesta<PlantillaDePlan>> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    const v = comoPlantilla(raw);
    if (!v.ok) return { success: false, message: v.motivo };
    const foto = await conLaFotoDelPlan(q, v.datos);
    if (!foto.ok) return { success: false, message: foto.message };
    try {
        const p = await crearPlantilla({ ...foto.datos, cuentaId: q.cuenta, creadoPorId: q.personaId || null });
        revalidatePath(RUTA);
        return { success: true, data: p };
    } catch (error) {
        console.error("[propuestas] no se pudo crear la plantilla", { cuenta: q.cuenta, error: String(error) });
        return { success: false, message: "No se pudo crear la plantilla." };
    }
}

export async function editarPlantillaAction(id: unknown, raw: unknown): Promise<Respuesta<PlantillaDePlan>> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    if (typeof id !== "string" || !id.trim()) return { success: false, message: "Plantilla no encontrada." };
    const v = comoPlantilla(raw);
    if (!v.ok) return { success: false, message: v.motivo };
    const foto = await conLaFotoDelPlan(q, v.datos);
    if (!foto.ok) return { success: false, message: foto.message };
    try {
        const p = await editarPlantilla(q.cuenta, id, foto.datos);
        if (!p) return { success: false, message: "Plantilla no encontrada." };
        revalidatePath(RUTA);
        return { success: true, data: p };
    } catch (error) {
        console.error("[propuestas] no se pudo editar la plantilla", { cuenta: q.cuenta, id, error: String(error) });
        return { success: false, message: "No se pudo guardar la plantilla." };
    }
}

export async function borrarPlantillaAction(id: unknown): Promise<Respuesta<null>> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    if (typeof id !== "string" || !id.trim()) return { success: false, message: "Plantilla no encontrada." };
    try {
        const ok = await borrarPlantilla(q.cuenta, id);
        if (!ok) return { success: false, message: "Plantilla no encontrada." };
        revalidatePath(RUTA);
        return { success: true, data: null };
    } catch (error) {
        console.error("[propuestas] no se pudo borrar la plantilla", { cuenta: q.cuenta, id, error: String(error) });
        return { success: false, message: "No se pudo eliminar la plantilla." };
    }
}

/**
 * Lo que trae una plantilla ENLAZADA al cargarla en una propuesta: el plan del
 * panel de Planes leído HOY —nombre, precios, recuadros de capacidad, «Qué
 * incluye», si tiene video y el enlace a su página pública—. Solo llega el id de
 * la plantilla, que se busca acotada por la cuenta.
 */
export async function cargarPlanEnLaPropuestaAction(
    plantillaId: unknown,
    cuenta?: unknown,
): Promise<Respuesta<{ plan: PlanParaCargar; avisos: string[] }>> {
    const q = await quienManda(typeof cuenta === "string" && cuenta.trim() ? cuenta : null);
    if (!q) return NO_AUTORIZADO;
    if (typeof plantillaId !== "string" || !plantillaId.trim()) return { success: false, message: "Plantilla no encontrada." };
    try {
        const plantilla = (await lasPlantillasDe(q.cuenta)).find((p) => p.id === plantillaId);
        if (!plantilla) return { success: false, message: "Plantilla no encontrada." };
        if (!plantilla.plan) return { success: false, message: "Esa plantilla no está enlazada a un plan del panel de Planes." };
        if (!(await q.esDeLaCasa())) return { success: false, message: SOLO_LA_CASA };
        const plan = await elPlanParaCargar(plantilla.plan, await elOrigenDeLaApp());
        if (!plan) return { success: false, message: "El plan de esa plantilla ya no está en el panel de Planes." };
        const avisos = plan.activo ? [] : [elAvisoDelPlanApagado(plan.nombre)];
        return { success: true, data: { plan, avisos } };
    } catch (error) {
        console.error("[propuestas] no se pudo cargar el plan de la plantilla", { cuenta: q.cuenta, plantillaId, error: String(error) });
        return { success: false, message: "No se pudo leer el plan del panel de Planes." };
    }
}

/** La configuración de la cuenta: el eslogan y el saludo del envío por WhatsApp. */
export async function ponerConfiguracionAction(
    eslogan: unknown,
    saludo: unknown,
): Promise<Respuesta<{ eslogan: string; saludo: string }>> {
    const q = await quienManda();
    if (!q) return NO_AUTORIZADO;
    try {
        const guardado = await ponerLosAjustes(q.cuenta, {
            eslogan: typeof eslogan === "string" ? eslogan : "",
            saludo: typeof saludo === "string" ? saludo : "",
        });
        revalidatePath(RUTA);
        return { success: true, data: guardado };
    } catch (error) {
        console.error("[propuestas] no se pudo guardar la configuración", { cuenta: q.cuenta, error: String(error) });
        return { success: false, message: "No se pudo guardar la configuración." };
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
        return await enviarLaPropuesta(q.cuenta, p, p.linea, elJidDelWhatsapp(p.whatsapp), `+${p.whatsapp}`);
    } catch (error) {
        console.error("[propuestas] no se pudo enviar por WhatsApp", { cuenta: q.cuenta, id, error: String(error) });
        return { success: false, message: "No se pudo enviar por WhatsApp." };
    }
}

/**
 * El envío de verdad, compartido por el panel y por el panel de Chats: por la
 * línea pedida y por NINGUNA otra. Si la línea no es de la cuenta, o no está
 * conectada, se dice y no se manda nada.
 */
async function enviarLaPropuesta(
    cuenta: string,
    p: Propuesta,
    linea: string,
    remoteJid: string,
    aMostrar: string,
): Promise<Respuesta<{ a: string; linea: string }>> {
    const lineas = await lasLineasParaEnviar(cuenta);
    const deLaCuenta = lineas.find((l) => l.instanceName === linea);
    if (!deLaCuenta) {
        return { success: false, message: `La línea «${linea}» ya no es de esta cuenta. Edita la propuesta y elige otra.` };
    }
    const dispatcher = await resolveWhatsAppDispatcherLine({
        ownerUserId: cuenta,
        preferredInstanceName: linea,
        includeAdminFallback: false,
    });
    // El despachador cae a otra línea conectada si la pedida no lo está:
    // aquí eso sería mandar desde un número que no es el elegido.
    if (!dispatcher || dispatcher.instanceName !== linea) {
        console.warn("[propuestas] la línea elegida no está conectada", { cuenta, linea, otra: dispatcher?.instanceName ?? null });
        return { success: false, message: `La línea «${deLaCuenta.nombre}» no está conectada ahora mismo. Conéctala y vuelve a intentarlo.` };
    }
    const enlace = elEnlaceDeLaPropuesta(await elOrigenDeLaApp(), p);
    const r = await sendViaWhatsAppDispatcher({
        dispatcher,
        remoteJid,
        text: elMensajeDeWhatsapp(p.cliente, enlace, await elSaludoDe(cuenta).catch(() => "")),
    });
    if (!r?.success) {
        console.warn("[propuestas] el envío por WhatsApp no salió", { cuenta, id: p.id, motivo: r?.message });
        return { success: false, message: r?.message ? `No se pudo enviar: ${r.message}` : "No se pudo enviar por WhatsApp." };
    }
    return { success: true, data: { a: aMostrar, linea: deLaCuenta.nombre } };
}

/**
 * La cuenta de una conversación de Chats es la DUEÑA de su línea, y su línea
 * tiene que ser una de las que esa cuenta puede usar para enviar. Lo que llega
 * del navegador es solo el nombre de la línea: la cuenta se resuelve aquí.
 */
async function laLineaDelChat(instanceName: unknown): Promise<{ q: QuienManda; linea: string } | { error: string }> {
    if (typeof instanceName !== "string" || !instanceName.trim()) {
        return { error: "No se sabe por qué línea va esta conversación." };
    }
    const linea = instanceName.trim();
    const dueno = await resolveInstanceOwner(linea);
    if (!dueno) return { error: "Esa línea ya no existe." };
    const q = await quienManda(dueno.userId);
    if (!q) return { error: NO_AUTORIZADO.message };
    const lineas = await lasLineasParaEnviar(q.cuenta);
    if (!lineas.some((l) => l.instanceName === linea)) {
        return { error: "Por esta línea no se pueden enviar propuestas." };
    }
    return { q, linea };
}

/** Lo que necesita el formulario del panel de Chats para esa conversación. */
export async function propuestaDesdeElChatAction(instanceName: unknown): Promise<
    Respuesta<{
        origen: string;
        lineas: LineaParaEnviar[];
        plantillas: PlantillaDePlan[];
        planes: PlanParaElegir[];
        linea: string;
        cuenta: string;
    }>
> {
    try {
        const r = await laLineaDelChat(instanceName);
        if ("error" in r) return { success: false, message: r.error };
        const { q, linea } = r;
        const [origen, lineas, plantillas, planes] = await Promise.all([
            elOrigenDeLaApp(),
            lasLineasParaEnviar(q.cuenta),
            lasPlantillasDe(q.cuenta).then(conLoVigente),
            q.esDeLaCasa().then((casa) => (casa ? losPlanesParaElegir() : [])),
        ]);
        return { success: true, data: { origen, lineas, plantillas, planes, linea, cuenta: q.cuenta } };
    } catch (error) {
        console.error("[propuestas] no se pudo preparar la propuesta del chat", { instanceName, error: String(error) });
        return { success: false, message: "No se pudo abrir el formulario de la propuesta." };
    }
}

/**
 * Crea la propuesta en la cuenta dueña de la línea de la conversación y la manda
 * por WhatsApp a ESE contacto, por ESA línea. El WhatsApp y la línea que traiga
 * el formulario no mandan: los ponen la conversación (`destino`, que puede ser
 * un `@lid` sin teléfono) y su línea.
 */
export async function crearYEnviarPropuestaDesdeElChatAction(
    instanceName: unknown,
    destino: unknown,
    raw: unknown,
): Promise<Respuesta<{ propuesta: Propuesta; a: string; linea: string }>> {
    try {
        const r = await laLineaDelChat(instanceName);
        if ("error" in r) return { success: false, message: r.error };
        const { q, linea } = r;
        const d = comoDestino(typeof destino === "string" ? destino : "");
        if (!d) return { success: false, message: "Esta conversación no tiene a quién enviarle la propuesta." };
        const whatsapp = esDestinoLid(d) ? "" : losDigitosDelDestino(d);
        const base = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const v = comoPropuesta({ ...base, whatsapp, linea });
        if (!v.ok) return { success: false, message: v.motivo };
        const planes = (await q.esDeLaCasa()) ? v.datos.planes : [];
        let p: Propuesta;
        try {
            p = await crearPropuesta({ ...v.datos, planes, cuentaId: q.cuenta, creadoPorId: q.personaId || null });
        } catch (error) {
            if (error instanceof EnlaceOcupado) return { success: false, message: ENLACE_OCUPADO };
            throw error;
        }
        revalidatePath(RUTA);
        const envio = await enviarLaPropuesta(q.cuenta, p, linea, elJidDelDestino(d), elDestinoParaMostrar(d));
        if (!envio.success) {
            return { success: false, message: `La propuesta se guardó en Propuestas, pero no se envió: ${envio.message}` };
        }
        return { success: true, data: { propuesta: p, ...envio.data } };
    } catch (error) {
        console.error("[propuestas] no se pudo crear y enviar desde el chat", { instanceName, error: String(error) });
        return { success: false, message: "No se pudo crear y enviar la propuesta." };
    }
}
