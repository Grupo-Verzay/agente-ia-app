"use server";

import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import {
    comoAdjuntosParaEnviar,
    comoDatosDeImap,
    comoDestinatarios,
    comoFirma,
    comoTextoDeLaRespuesta,
    conLaFirma,
    elTextoParaLaIa,
    hayLlavesDe,
    laFotoDelAnclado,
    type CorreoAnclado,
    type CorreoCompleto,
    type CorreoDeLaBandeja,
    type ProveedorConBoton,
} from "@/lib/correo";
import {
    anclarElCorreo,
    desanclarElCorreo,
    elBuzonDe,
    guardarElBuzon,
    guardarLaFirma,
    losAncladosDe,
    losBuzonesDe,
    quitarElBuzon,
    type BuzonVisible,
} from "@/lib/correo-db";
import { elProveedorDe, ErrorDeCorreo, probarImap, type Pagina } from "@/lib/correo-proveedores.server";
import { pedirSugerenciaALaIa } from "@/lib/sugerencia-de-correo.server";

/**
 * Las acciones de Correo.
 *
 * # De quién es: el id de la PERSONA no llega nunca del navegador
 *
 * Ninguna recibe un `userId`. La persona sale de la sesión
 * (`laPersonaQueActua`) y **todo buzón se busca con ella en el `WHERE`**
 * (`elBuzonDe`). Lo que sí llega es el id del BUZÓN, y con el de otra persona
 * contesta exactamente lo mismo que con uno inventado: «no está».
 *
 * Y no pasa por `laCuentaDeLaAccion` ni por `assertCanAccessTargetUser`, a
 * propósito: esas resuelven un ALCANCE —a qué cuentas llego— y el correo no lo
 * tiene. Es de quien lo conectó, y de nadie más: ni el dueño de la cuenta, ni
 * un administrador, ni el súper administrador lo ven.
 *
 * # Y no toca nada de Chats
 *
 * Ni `persistChatMessage`, ni `Session`, ni el reparto de asesores, ni las
 * marcas de leído de la bandeja. Lo comprueba el barrido de
 * `lib/__tests__/correo.test.mjs`, que falla si este fichero o los de `lib/`
 * importan cualquiera de esos caminos.
 */
async function laPersona(): Promise<{ id: string; cuentaId: string | null } | null> {
    const user = await currentUser();
    if (!user?.id) return null;
    const persona = laPersonaQueActua(user as any);
    if (!persona.id) return null;
    // Solo para saber desde qué cuenta se conectó: no decide ningún acceso.
    const u = user as { ownerId?: string | null; id: string };
    return { id: persona.id, cuentaId: u.ownerId ?? u.id };
}

type Resultado<T> = ({ success: true } & T) | { success: false; message: string; reconectar?: boolean };

function fallo(error: unknown, contexto: string): { success: false; message: string; reconectar?: boolean } {
    if (error instanceof ErrorDeCorreo) {
        console.warn(`[correo] ${contexto}`, error.message);
        return { success: false, message: error.message, reconectar: error.reconectar };
    }
    // Un fallo aquí no puede ser mudo: se ve como una bandeja vacía.
    console.error(`[correo] ${contexto}`, error);
    return { success: false, message: "No se pudo completar. Inténtalo de nuevo." };
}

export async function misBuzonesAction(): Promise<
    Resultado<{ buzones: BuzonVisible[]; conBoton: Record<ProveedorConBoton, boolean>; anclados: CorreoAnclado[] }>
> {
    try {
        const persona = await laPersona();
        if (!persona) return { success: false, message: "No autorizado." };
        const buzones = await losBuzonesDe(persona.id);
        // Los anclados viajan con los buzones: una vuelta y no dos. Y que falle
        // su lectura no deja sin bandeja: se ve sin anclados, y se dice.
        let anclados: CorreoAnclado[] = [];
        try {
            anclados = buzones.length ? await losAncladosDe(persona.id) : [];
        } catch (error) {
            console.warn("[correo] no se pudieron leer los anclados", error instanceof Error ? error.message : error);
        }
        return {
            success: true,
            buzones,
            conBoton: { gmail: hayLlavesDe("gmail", process.env), outlook: hayLlavesDe("outlook", process.env) },
            anclados,
        };
    } catch (error) {
        return fallo(error, "no se pudieron leer los buzones");
    }
}

async function elMio(buzonId: unknown) {
    const persona = await laPersona();
    if (!persona) return { error: "No autorizado." as const };
    if (typeof buzonId !== "string" || !buzonId) return { error: "Ese correo no está conectado." as const };
    const buzon = await elBuzonDe(persona.id, buzonId);
    if (!buzon) return { error: "Ese correo no está conectado." as const };
    return { buzon };
}

export async function bandejaAction(buzonId: unknown, cursor: unknown): Promise<Resultado<Pagina>> {
    try {
        const r = await elMio(buzonId);
        if ("error" in r) return { success: false, message: r.error! };
        if (r.buzon.estado === "reconectar") {
            return { success: false, message: r.buzon.ultimoError || "Vuelve a conectar este correo.", reconectar: true };
        }
        const pagina = await elProveedorDe(r.buzon).bandeja(r.buzon, typeof cursor === "string" && cursor ? cursor : null);
        return { success: true, ...pagina };
    } catch (error) {
        return fallo(error, "no se pudo leer la bandeja");
    }
}

/** Lo que devuelve la bandeja unificada por cada buzón: su página, o por qué no llegó. */
export type LoDeUnBuzon =
    | { buzonId: string; ok: true; correos: CorreoDeLaBandeja[]; siguiente: string | null }
    | { buzonId: string; ok: false; message: string; reconectar: boolean };

/**
 * La bandeja UNIFICADA: la página de cada buzón de la persona, de una vez.
 *
 * - Sin `cursores` es la primera página de TODOS sus buzones. Con `cursores`
 *   (`{ buzonId: cursor }`) es «cargar más»: solo se piden los nombrados, y un
 *   id que no sea de un buzón SUYO se ignora — la lista sale de
 *   `losBuzonesDe(persona)`, no del navegador.
 * - `Promise.allSettled`, nunca `Promise.all`: un buzón que pide volver a
 *   conectar o cuyo proveedor no contesta no puede dejar vacía la bandeja de
 *   los demás. Cada casilla dice DE QUIÉN es y, si falló, por qué.
 * - Cada correo sale con su `buzonId`: la pantalla lo necesita para abrirlo,
 *   responderlo y eliminarlo en SU buzón, y para pintar de cuál llegó.
 */
export async function bandejaUnificadaAction(cursores?: unknown): Promise<Resultado<{ porBuzon: LoDeUnBuzon[] }>> {
    try {
        const persona = await laPersona();
        if (!persona) return { success: false, message: "No autorizado." };
        const mios = await losBuzonesDe(persona.id);
        const pedidos =
            cursores && typeof cursores === "object"
                ? mios.filter((b) => {
                      const c = (cursores as Record<string, unknown>)[b.id];
                      return typeof c === "string" && c.length > 0;
                  })
                : mios;
        const cursorDe = (id: string): string | null =>
            cursores && typeof cursores === "object" ? ((cursores as Record<string, string>)[id] ?? null) : null;

        const resultados = await Promise.allSettled(
            pedidos.map(async (visible): Promise<LoDeUnBuzon> => {
                if (visible.estado === "reconectar") {
                    return { buzonId: visible.id, ok: false, message: visible.ultimoError || "Vuelve a conectar este correo.", reconectar: true };
                }
                const buzon = await elBuzonDe(persona.id, visible.id);
                if (!buzon) return { buzonId: visible.id, ok: false, message: "Ese correo no está conectado.", reconectar: false };
                const pagina = await elProveedorDe(buzon).bandeja(buzon, cursorDe(visible.id));
                return {
                    buzonId: visible.id,
                    ok: true,
                    correos: pagina.correos.map((c) => ({ ...c, buzonId: visible.id })),
                    siguiente: pagina.siguiente,
                };
            }),
        );
        const porBuzon = resultados.map((r, i): LoDeUnBuzon => {
            if (r.status === "fulfilled") return r.value;
            const f = fallo(r.reason, `no se pudo leer la bandeja de ${pedidos[i].direccion}`);
            return { buzonId: pedidos[i].id, ok: false, message: f.message, reconectar: Boolean(f.reconectar) };
        });
        return { success: true, porBuzon };
    } catch (error) {
        return fallo(error, "no se pudo leer la bandeja unificada");
    }
}

/** El total de un buzón, o por qué no llegó (entonces la fila va sin número). */
export type TotalDeUnBuzon = { buzonId: string; total: number | null };

/**
 * Cuántos correos hay en la bandeja de entrada de CADA buzón de la persona: el
 * número que el selector de bandejas pinta junto a cada una, como el de cada
 * canal en Chats.
 *
 * Es un `COUNT` del PROVEEDOR —la etiqueta `INBOX` de Gmail, la carpeta `inbox`
 * de Outlook, el `STATUS` de IMAP—, nunca el largo de lo cargado: la bandeja
 * trae de a 25, y un «25» junto a un buzón de 3.000 correos mentiría.
 *
 * - La lista sale de `losBuzonesDe(persona)`: ningún id llega del navegador.
 * - `Promise.allSettled`: un buzón que no contesta se queda SIN número
 *   (`total: null`), no en cero, y no le quita el suyo a los demás.
 * - Un buzón que pide volver a conectar ni se pregunta.
 */
export async function totalesDeLosBuzonesAction(): Promise<Resultado<{ totales: TotalDeUnBuzon[] }>> {
    try {
        const persona = await laPersona();
        if (!persona) return { success: false, message: "No autorizado." };
        const mios = await losBuzonesDe(persona.id);
        const resultados = await Promise.allSettled(
            mios.map(async (visible): Promise<TotalDeUnBuzon> => {
                if (visible.estado === "reconectar") return { buzonId: visible.id, total: null };
                const buzon = await elBuzonDe(persona.id, visible.id);
                if (!buzon) return { buzonId: visible.id, total: null };
                return { buzonId: visible.id, total: await elProveedorDe(buzon).total(buzon) };
            }),
        );
        const totales = resultados.map((r, i): TotalDeUnBuzon => {
            if (r.status === "fulfilled") return r.value;
            // No es mudo: un número que falta sin decirlo se lee como un contador roto.
            fallo(r.reason, `no se pudo contar la bandeja de ${mios[i].direccion}`);
            return { buzonId: mios[i].id, total: null };
        });
        return { success: true, totales };
    } catch (error) {
        return fallo(error, "no se pudieron contar las bandejas");
    }
}

/**
 * Abrir un correo: traerlo Y marcarlo como leído en el buzón — igual en los
 * tres proveedores. Son dos pasos y el segundo NO puede tumbar el primero: si
 * el proveedor no deja marcar, el correo se enseña igual y la respuesta dice
 * `leido: false` con su motivo, para que la pantalla le devuelva el punto de
 * «sin leer» y, si falta permiso, ofrezca volver a conectar.
 *
 * `estabaSinLeer === false` (lo que la bandeja ya sabe) se salta la llamada:
 * marcar un correo ya leído es una petición para no cambiar nada. No decide
 * ningún acceso: en el peor caso, un correo se queda sin marcar.
 */
export async function leerCorreoAction(
    buzonId: unknown,
    correoId: unknown,
    estabaSinLeer?: unknown,
): Promise<Resultado<{ correo: CorreoCompleto; leido: boolean; motivoSinMarcar: string | null; reconectar: boolean }>> {
    try {
        const r = await elMio(buzonId);
        if ("error" in r) return { success: false, message: r.error! };
        if (typeof correoId !== "string" || !correoId) return { success: false, message: "Ese correo no existe." };
        const proveedor = elProveedorDe(r.buzon);
        const correo = await proveedor.leer(r.buzon, correoId);
        if (estabaSinLeer === false) return { success: true, correo, leido: true, motivoSinMarcar: null, reconectar: false };
        try {
            await proveedor.marcarComoLeido(r.buzon, correoId);
            return { success: true, correo, leido: true, motivoSinMarcar: null, reconectar: false };
        } catch (error) {
            // No es mudo: se ve como un punto de «sin leer» que no se va.
            console.warn("[correo] no se pudo marcar como leído", error instanceof Error ? error.message : error);
            const conMotivo = error instanceof ErrorDeCorreo;
            return {
                success: true,
                correo,
                leido: false,
                motivoSinMarcar: conMotivo ? error.message : "No se pudo marcar como leído en tu correo.",
                reconectar: conMotivo && error.faltaPermiso,
            };
        }
    } catch (error) {
        return fallo(error, "no se pudo abrir el correo");
    }
}

/**
 * Eliminar: a la PAPELERA del propio buzón en los tres proveedores (se
 * recupera desde ahí). Solo un servidor IMAP sin papelera lo borra del todo,
 * y entonces `aLaPapelera: false` lo dice.
 */
export async function eliminarCorreoAction(
    buzonId: unknown,
    correoId: unknown,
): Promise<Resultado<{ eliminado: true; aLaPapelera: boolean }>> {
    try {
        const r = await elMio(buzonId);
        if ("error" in r) return { success: false, message: r.error! };
        if (r.buzon.estado === "reconectar") {
            return { success: false, message: r.buzon.ultimoError || "Vuelve a conectar este correo.", reconectar: true };
        }
        if (typeof correoId !== "string" || !correoId) return { success: false, message: "Ese correo no existe." };
        const { aLaPapelera } = await elProveedorDe(r.buzon).eliminar(r.buzon, correoId);
        // Lo que se va a la papelera no puede quedarse anclado arriba.
        await desanclarElCorreo(r.buzon.personaId, r.buzon.id, correoId).catch((error) =>
            console.warn("[correo] eliminado, pero no se pudo quitar el anclado", error instanceof Error ? error.message : error),
        );
        return { success: true, eliminado: true, aLaPapelera };
    } catch (error) {
        return fallo(error, "no se pudo eliminar el correo");
    }
}

/**
 * Responder. A quién y con qué asunto lo decide el SERVIDOR leyendo el
 * original: el navegador manda el texto, el id y los archivos, nunca el
 * destinatario. Si no, «responder» sería una forma de mandar correo a quien uno
 * quiera desde el buzón conectado.
 *
 * La FIRMA la pone el servidor, la del buzón y solo si está activa
 * (`conLaFirma`): el navegador no puede mandar otra.
 */
export async function responderCorreoAction(
    buzonId: unknown,
    correoId: unknown,
    texto: unknown,
    adjuntos?: unknown,
): Promise<Resultado<{ enviado: true }>> {
    try {
        const r = await elMio(buzonId);
        if ("error" in r) return { success: false, message: r.error! };
        const cuerpo = comoTextoDeLaRespuesta(texto);
        if (!cuerpo) return { success: false, message: "Escribe algo antes de responder." };
        if (typeof correoId !== "string" || !correoId) return { success: false, message: "Ese correo no existe." };
        const archivos = comoAdjuntosParaEnviar(adjuntos);
        if (!archivos.ok) return { success: false, message: archivos.motivo };
        const proveedor = elProveedorDe(r.buzon);
        const original = await proveedor.leer(r.buzon, correoId);
        if (!original.responderA) return { success: false, message: "Ese correo no dice a quién responder." };
        await proveedor.responder(r.buzon, original, conLaFirma(cuerpo, r.buzon.firma, r.buzon.firmaActiva), archivos.lista);
        return { success: true, enviado: true };
    } catch (error) {
        return fallo(error, "no se pudo responder");
    }
}

/**
 * Reenviar. Aquí el destinatario SÍ llega del navegador —reenviar es elegir a
 * quién—, y por eso se valida en el servidor (`comoDestinatarios`: direcciones
 * de verdad, sin repetir y con tope). Lo que no llega de fuera es el correo: se
 * vuelve a leer del proveedor, con sus archivos, y va debajo de lo escrito.
 */
export async function reenviarCorreoAction(
    buzonId: unknown,
    correoId: unknown,
    para: unknown,
    texto: unknown,
    adjuntos?: unknown,
): Promise<Resultado<{ enviado: true; para: string[] }>> {
    try {
        const r = await elMio(buzonId);
        if ("error" in r) return { success: false, message: r.error! };
        if (r.buzon.estado === "reconectar") {
            return { success: false, message: r.buzon.ultimoError || "Vuelve a conectar este correo.", reconectar: true };
        }
        if (typeof correoId !== "string" || !correoId) return { success: false, message: "Ese correo no existe." };
        const destinatarios = comoDestinatarios(para);
        if (!destinatarios.ok) return { success: false, message: destinatarios.motivo };
        const archivos = comoAdjuntosParaEnviar(adjuntos);
        if (!archivos.ok) return { success: false, message: archivos.motivo };
        // Un reenvío sin nada escrito es normal: solo el original.
        const escrito = typeof texto === "string" ? texto.replace(/\r\n/g, "\n").trim().slice(0, 20_000) : "";
        const proveedor = elProveedorDe(r.buzon);
        const original = await proveedor.leer(r.buzon, correoId);
        await proveedor.reenviar(
            r.buzon,
            original,
            destinatarios.lista,
            conLaFirma(escrito, r.buzon.firma, r.buzon.firmaActiva),
            archivos.lista,
        );
        return { success: true, enviado: true, para: destinatarios.lista };
    } catch (error) {
        return fallo(error, "no se pudo reenviar");
    }
}

/** Lo que tienen en común marcar como no leído, destacar y archivar: el buzón propio, conectado, y un id. */
async function elMioConectado(buzonId: unknown, correoId: unknown) {
    const r = await elMio(buzonId);
    if ("error" in r) return { fallo: { success: false as const, message: r.error! } };
    if (r.buzon.estado === "reconectar") {
        return { fallo: { success: false as const, message: r.buzon.ultimoError || "Vuelve a conectar este correo.", reconectar: true } };
    }
    if (typeof correoId !== "string" || !correoId) return { fallo: { success: false as const, message: "Ese correo no existe." } };
    return { buzon: r.buzon, correoId };
}

/**
 * Marcar como NO leído: la otra mitad de abrir. En el propio buzón, igual en
 * los tres (Gmail `UNREAD`, Outlook `isRead: false`, IMAP quita `\Seen`).
 */
export async function marcarNoLeidoAction(buzonId: unknown, correoId: unknown): Promise<Resultado<{ sinLeer: true }>> {
    try {
        const c = await elMioConectado(buzonId, correoId);
        if ("fallo" in c) return c.fallo!;
        await elProveedorDe(c.buzon).marcarComoNoLeido(c.buzon, c.correoId);
        return { success: true, sinLeer: true };
    } catch (error) {
        return fallo(error, "no se pudo marcar como no leído");
    }
}

/**
 * Destacar (o quitarlo). Es la marca del PROVEEDOR —la estrella de Gmail, la
 * bandera de Outlook, `\Flagged` en IMAP—, así que se ve igual en el móvil de
 * la persona. `destacado` tiene que ser un booleano: lo demás no se adivina.
 */
export async function destacarCorreoAction(
    buzonId: unknown,
    correoId: unknown,
    destacado: unknown,
): Promise<Resultado<{ destacado: boolean }>> {
    try {
        if (typeof destacado !== "boolean") return { success: false, message: "No se entendió si destacar o quitar la marca." };
        const c = await elMioConectado(buzonId, correoId);
        if ("fallo" in c) return c.fallo!;
        await elProveedorDe(c.buzon).destacar(c.buzon, c.correoId, destacado);
        return { success: true, destacado };
    } catch (error) {
        return fallo(error, "no se pudo destacar el correo");
    }
}

/**
 * Archivar: sacarlo de la bandeja SIN borrarlo, en el propio buzón (ver
 * `Archivado`). Si estaba anclado, deja de estarlo: lo que ya no está en la
 * bandeja no puede quedarse arriba de ella.
 */
export async function archivarCorreoAction(buzonId: unknown, correoId: unknown): Promise<Resultado<{ carpeta: string }>> {
    try {
        const c = await elMioConectado(buzonId, correoId);
        if ("fallo" in c) return c.fallo!;
        const { carpeta } = await elProveedorDe(c.buzon).archivar(c.buzon, c.correoId);
        await desanclarElCorreo(c.buzon.personaId, c.buzon.id, c.correoId).catch((error) =>
            console.warn("[correo] archivado, pero no se pudo quitar el anclado", error instanceof Error ? error.message : error),
        );
        return { success: true, carpeta };
    } catch (error) {
        return fallo(error, "no se pudo archivar el correo");
    }
}

/**
 * Anclar un correo arriba de la lista. La foto que se guarda sale del
 * PROVEEDOR (se lee el correo), no del navegador: así un anclado es siempre un
 * correo que existe en ese buzón, y lo que se ve arriba es lo que dice.
 */
export async function anclarCorreoAction(buzonId: unknown, correoId: unknown): Promise<Resultado<{ anclado: CorreoAnclado }>> {
    try {
        const c = await elMioConectado(buzonId, correoId);
        if ("fallo" in c) return c.fallo!;
        const correo = await elProveedorDe(c.buzon).leer(c.buzon, c.correoId);
        const anclado = laFotoDelAnclado(c.buzon.id, correo, Date.now());
        await anclarElCorreo(c.buzon.personaId, anclado);
        return { success: true, anclado };
    } catch (error) {
        return fallo(error, "no se pudo anclar el correo");
    }
}

export async function desanclarCorreoAction(buzonId: unknown, correoId: unknown): Promise<Resultado<{ desanclado: true }>> {
    try {
        const r = await elMio(buzonId);
        if ("error" in r) return { success: false, message: r.error! };
        if (typeof correoId !== "string" || !correoId) return { success: false, message: "Ese correo no existe." };
        await desanclarElCorreo(r.buzon.personaId, r.buzon.id, correoId);
        return { success: true, desanclado: true };
    } catch (error) {
        return fallo(error, "no se pudo desanclar el correo");
    }
}

/** Guardar la firma de un buzón y si va activa. Vacía es «sin firma». */
export async function guardarFirmaAction(
    buzonId: unknown,
    firma: unknown,
    activa: unknown,
): Promise<Resultado<{ firma: string | null; firmaActiva: boolean }>> {
    try {
        const r = await elMio(buzonId);
        if ("error" in r) return { success: false, message: r.error! };
        const limpia = comoFirma(firma);
        // Sin firma no hay nada que activar: un interruptor encendido sobre nada
        // diría que las respuestas llevan firma y no la llevan.
        const encendida = activa === true && Boolean(limpia);
        const ok = await guardarLaFirma(r.buzon.personaId, r.buzon.id, limpia, encendida);
        if (!ok) return { success: false, message: "Ese correo no está conectado." };
        return { success: true, firma: limpia, firmaActiva: encendida };
    } catch (error) {
        return fallo(error, "no se pudo guardar la firma");
    }
}

/**
 * La SUGERENCIA de respuesta, con la IA de la cuenta por la que se trabaja. El
 * correo se vuelve a leer del proveedor: no se le pasa a la IA lo que mande el
 * navegador. `borrador` es lo que ya estaba escrito, para completarlo.
 */
export async function sugerirRespuestaDeCorreoAction(
    buzonId: unknown,
    correoId: unknown,
    borrador?: unknown,
): Promise<Resultado<{ sugerencia: string }>> {
    try {
        const persona = await laPersona();
        if (!persona?.cuentaId) return { success: false, message: "No autorizado." };
        const c = await elMioConectado(buzonId, correoId);
        if ("fallo" in c) return c.fallo!;
        const correo = await elProveedorDe(c.buzon).leer(c.buzon, c.correoId);
        const texto = elTextoParaLaIa(correo);
        if (!texto) return { success: false, message: "Este correo no tiene texto al que responder." };
        const r = await pedirSugerenciaALaIa(
            persona.cuentaId,
            { de: correo.de || correo.deDireccion, asunto: correo.asunto, texto },
            typeof borrador === "string" ? borrador.slice(0, 4000) : "",
        );
        if (!r.ok) {
            // No es mudo: se ve como un botón que no hace nada.
            console.warn("[correo] la IA no sugirió", r.motivo);
            return { success: false, message: r.motivo };
        }
        return { success: true, sugerencia: r.texto };
    } catch (error) {
        return fallo(error, "no se pudo sugerir una respuesta");
    }
}

/** Conectar un correo de dominio propio. Se PRUEBA antes de guardar: entrada y salida. */
export async function conectarImapAction(raw: unknown): Promise<Resultado<{ buzon: BuzonVisible }>> {
    try {
        const persona = await laPersona();
        if (!persona) return { success: false, message: "No autorizado." };
        const v = comoDatosDeImap((raw ?? {}) as Record<string, unknown>);
        if (!v.ok) return { success: false, message: v.motivo };
        const { direccion, ...resto } = v.datos;
        const credenciales = { tipo: "imap" as const, ...resto };
        await probarImap(credenciales);
        const id = await guardarElBuzon({
            personaId: persona.id,
            cuentaId: persona.cuentaId,
            proveedor: "imap",
            direccion,
            nombre: null,
            credenciales,
        });
        const buzon = (await losBuzonesDe(persona.id)).find((b) => b.id === id)!;
        return { success: true, buzon };
    } catch (error) {
        return fallo(error, "no se pudo conectar el correo de dominio propio");
    }
}

export async function desconectarCorreoAction(buzonId: unknown): Promise<Resultado<{ quitado: true }>> {
    try {
        const persona = await laPersona();
        if (!persona) return { success: false, message: "No autorizado." };
        if (typeof buzonId !== "string" || !buzonId) return { success: false, message: "Ese correo no está conectado." };
        const quitado = await quitarElBuzon(persona.id, buzonId);
        if (!quitado) return { success: false, message: "Ese correo no está conectado." };
        return { success: true, quitado: true };
    } catch (error) {
        return fallo(error, "no se pudo desconectar el correo");
    }
}
