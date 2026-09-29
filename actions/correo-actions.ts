"use server";

import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import {
    comoAccionEnLote,
    comoAdjuntosParaEnviar,
    comoCorreoNuevo,
    comoCarpeta,
    comoDatosDeImap,
    comoLoteDeCorreos,
    comoDestinatarios,
    comoFirma,
    comoTextoDeLaRespuesta,
    conLaFirma,
    elTextoParaLaIa,
    hayLlavesDe,
    laFotoDelAnclado,
    losNumerosDeLasBandejas,
    type AccionEnLote,
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
import {
    elNombreDelArchivoDelCorreo,
    formatearCorreo,
    TOPE_DE_CONVERSACIONES_POR_LOTE,
} from "@/lib/conversacion-legible";

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

/**
 * Una página de la bandeja de UN buzón. `carpeta` es «entrada» (lo de
 * siempre) o «archivo» —la pastilla «Archivados»—; lo que no se entienda es
 * «entrada».
 */
export async function bandejaAction(buzonId: unknown, cursor: unknown, carpeta?: unknown): Promise<Resultado<Pagina>> {
    try {
        const r = await elMio(buzonId);
        if ("error" in r) return { success: false, message: r.error! };
        if (r.buzon.estado === "reconectar") {
            return { success: false, message: r.buzon.ultimoError || "Vuelve a conectar este correo.", reconectar: true };
        }
        const pagina = await elProveedorDe(r.buzon).bandeja(r.buzon, typeof cursor === "string" && cursor ? cursor : null, comoCarpeta(carpeta));
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
export async function bandejaUnificadaAction(cursores?: unknown, carpeta?: unknown): Promise<Resultado<{ porBuzon: LoDeUnBuzon[] }>> {
    try {
        const deDonde = comoCarpeta(carpeta);
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
                const pagina = await elProveedorDe(buzon).bandeja(buzon, cursorDe(visible.id), deDonde);
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
        return { success: true, totales: await contarLosBuzones(persona.id, "total") };
    } catch (error) {
        return fallo(error, "no se pudieron contar las bandejas");
    }
}

/**
 * Cuántos correos SIN LEER tiene la persona entre todos sus buzones: el número
 * que el menú lateral pinta junto a «Correos».
 *
 * Es el contador del PROVEEDOR sobre la bandeja de entrada (`messagesUnread` de
 * Gmail, `unreadItemCount` de Outlook, `STATUS UNSEEN` de IMAP), con la MISMA
 * regla de suma que el selector de bandejas (`losNumerosDeLasBandejas`): si un
 * buzón no contesta, el total es `null` —sin número—, nunca una suma más baja
 * dicha con toda la seguridad de un número. Sin buzones, 0.
 */
export async function correosSinLeerAction(): Promise<Resultado<{ sinLeer: number | null }>> {
    try {
        const persona = await laPersona();
        if (!persona) return { success: false, message: "No autorizado." };
        const porBuzon = await contarLosBuzones(persona.id, "sinLeer");
        if (porBuzon.length === 0) return { success: true, sinLeer: 0 };
        const { todas } = losNumerosDeLasBandejas(porBuzon.map((t) => ({ id: t.buzonId })), porBuzon);
        return { success: true, sinLeer: todas ?? null };
    } catch (error) {
        return fallo(error, "no se pudieron contar los correos sin leer");
    }
}

/**
 * Un número por buzón de la persona —su total o sus sin leer—, preguntado al
 * proveedor. La lista sale de `losBuzonesDe(persona)`: ningún id llega del
 * navegador. `Promise.allSettled`: un buzón que no contesta se queda SIN número
 * (`total: null`), no en cero, y no le quita el suyo a los demás. Un buzón que
 * pide volver a conectar ni se pregunta.
 */
async function contarLosBuzones(personaId: string, que: "total" | "sinLeer"): Promise<TotalDeUnBuzon[]> {
    const mios = await losBuzonesDe(personaId);
    const resultados = await Promise.allSettled(
        mios.map(async (visible): Promise<TotalDeUnBuzon> => {
            if (visible.estado === "reconectar") return { buzonId: visible.id, total: null };
            const buzon = await elBuzonDe(personaId, visible.id);
            if (!buzon) return { buzonId: visible.id, total: null };
            const proveedor = elProveedorDe(buzon);
            return { buzonId: visible.id, total: await (que === "total" ? proveedor.total(buzon) : proveedor.sinLeer(buzon)) };
        }),
    );
    return resultados.map((r, i): TotalDeUnBuzon => {
        if (r.status === "fulfilled") return r.value;
        // No es mudo: un número que falta sin decirlo se lee como un contador roto.
        fallo(r.reason, `no se pudo contar la bandeja de ${mios[i].direccion}`);
        return { buzonId: mios[i].id, total: null };
    });
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

/**
 * Redactar un correo NUEVO desde uno de los buzones de la persona. Es la
 * tercera forma de mandar y va por el MISMO camino que responder y reenviar:
 * el buzón se busca con la persona en el WHERE (`elMio`), el destinatario pasa
 * por la misma regla que al reenviar (`comoCorreoNuevo` → `comoDestinatarios`),
 * los archivos por `comoAdjuntosParaEnviar` y la FIRMA la pone el servidor.
 */
export async function enviarCorreoNuevoAction(
    buzonId: unknown,
    para: unknown,
    asunto: unknown,
    texto: unknown,
    adjuntos?: unknown,
): Promise<Resultado<{ enviado: true; para: string[] }>> {
    try {
        const r = await elMio(buzonId);
        if ("error" in r) return { success: false, message: r.error! };
        if (r.buzon.estado === "reconectar") {
            return { success: false, message: r.buzon.ultimoError || "Vuelve a conectar este correo.", reconectar: true };
        }
        const archivos = comoAdjuntosParaEnviar(adjuntos);
        if (!archivos.ok) return { success: false, message: archivos.motivo };
        const nuevo = comoCorreoNuevo({ para, asunto, texto, conAdjuntos: archivos.lista.length > 0 });
        if (!nuevo.ok) return { success: false, message: nuevo.motivo };
        await elProveedorDe(r.buzon).enviar(
            r.buzon,
            nuevo.para,
            nuevo.asunto,
            conLaFirma(nuevo.texto, r.buzon.firma, r.buzon.firmaActiva),
            archivos.lista,
        );
        return { success: true, enviado: true, para: nuevo.para };
    } catch (error) {
        return fallo(error, "no se pudo enviar el correo nuevo");
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

/** Lo que devuelve un lote: lo que salió y lo que no, con su motivo. */
export type ResumenDelLote = {
    hechos: { buzonId: string; id: string }[];
    fallidos: { buzonId: string; id: string; motivo: string }[];
    /** Solo en «eliminar»: si algún servidor IMAP no tenía papelera y lo borró del todo. */
    sinPapelera: boolean;
};

/**
 * Hacer lo MISMO a varios correos a la vez: la barra de la selección múltiple,
 * como la de Chats (leído, no leído, destacar, archivar, eliminar).
 *
 * **Una acción de servidor con la lista entera, no N llamadas**: Next pone en
 * fila las acciones de una misma página, así que veinte llamadas sueltas son
 * veinte idas y vueltas en fila india. Y dentro va **en serie**: son veinte
 * peticiones al proveedor del mismo buzón, y en paralelo es justo lo que un
 * proveedor frena.
 *
 * - La lista se sanea (`comoLoteDeCorreos`: pares de verdad, sin repetir, con
 *   tope) y **cada buzón se busca con la persona en el `WHERE`**: un par con el
 *   buzón de otro sale en `fallidos` diciendo «no está», igual que uno
 *   inventado.
 * - **Lo que no se pudo se CUENTA y se dice**, correo a correo: un «listo»
 *   sobre veinte de los que salieron dieciocho es peor que un error.
 * - Archivar y eliminar desanclan, como sus hermanas de uno en uno.
 */
export async function correosEnLoteAction(accion: unknown, lote: unknown): Promise<Resultado<ResumenDelLote>> {
    try {
        const persona = await laPersona();
        if (!persona) return { success: false, message: "No autorizado." };
        const que: AccionEnLote | null = comoAccionEnLote(accion);
        if (!que) return { success: false, message: "No se entendió qué hacer con los correos." };
        const lista = comoLoteDeCorreos(lote);
        if (!lista.length) return { success: false, message: "No hay correos seleccionados." };

        const buzones = new Map<string, Awaited<ReturnType<typeof elBuzonDe>>>();
        const resumen: ResumenDelLote = { hechos: [], fallidos: [], sinPapelera: false };
        for (const item of lista) {
            if (!buzones.has(item.buzonId)) buzones.set(item.buzonId, await elBuzonDe(persona.id, item.buzonId));
            const buzon = buzones.get(item.buzonId);
            if (!buzon) {
                resumen.fallidos.push({ ...item, motivo: "Ese correo no está conectado." });
                continue;
            }
            if (buzon.estado === "reconectar") {
                resumen.fallidos.push({ ...item, motivo: buzon.ultimoError || "Vuelve a conectar este correo." });
                continue;
            }
            const proveedor = elProveedorDe(buzon);
            try {
                if (que === "leido") await proveedor.marcarComoLeido(buzon, item.id);
                else if (que === "noLeido") await proveedor.marcarComoNoLeido(buzon, item.id);
                else if (que === "destacar") await proveedor.destacar(buzon, item.id, true);
                else if (que === "quitarDestacado") await proveedor.destacar(buzon, item.id, false);
                else if (que === "archivar") await proveedor.archivar(buzon, item.id);
                else {
                    const { aLaPapelera } = await proveedor.eliminar(buzon, item.id);
                    if (!aLaPapelera) resumen.sinPapelera = true;
                }
                if (que === "archivar" || que === "eliminar") {
                    await desanclarElCorreo(buzon.personaId, buzon.id, item.id).catch((error) =>
                        console.warn("[correo] hecho en lote, pero no se pudo quitar el anclado", error instanceof Error ? error.message : error),
                    );
                }
                resumen.hechos.push(item);
            } catch (error) {
                const f = fallo(error, `no se pudo ${que} en lote`);
                resumen.fallidos.push({ ...item, motivo: f.message });
            }
        }
        return { success: true, ...resumen };
    } catch (error) {
        return fallo(error, "no se pudo hacer la acción en lote");
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

/**
 * Exportar correos a texto legible: uno (el «⋯» de la fila o del correo
 * abierto) o los de la lista que se está mirando (el «⋯» de la barra). Es el
 * MISMO formato que la exportación de Chats (`lib/conversacion-legible.ts`).
 *
 * La puerta es la de siempre de Correo: cada buzón se busca con la PERSONA en
 * el `WHERE` (`elMio`), así que un id de otro buzón se contesta como uno que
 * no existe y se cuenta en `omitidos`. Y **leer para exportar no marca como
 * leído**: exportar es guardarse una copia, no abrirlo.
 */
export async function exportarCorreosAction(
    raw: unknown,
    zonaHoraria?: unknown,
): Promise<Resultado<{ archivos: { nombre: string; contenido: string }[]; omitidos: number; message: string }>> {
    const persona = await laPersona();
    if (!persona) return { success: false, message: "No autorizado." };
    const vistos = new Set<string>();
    const pedidos: { buzonId: string; correoId: string }[] = [];
    for (const p of Array.isArray(raw) ? raw : []) {
        const buzonId = typeof p?.buzonId === "string" ? p.buzonId : "";
        const correoId = typeof p?.correoId === "string" ? p.correoId : "";
        if (!buzonId || !correoId || vistos.has(`${buzonId}::${correoId}`)) continue;
        vistos.add(`${buzonId}::${correoId}`);
        pedidos.push({ buzonId, correoId });
    }
    if (pedidos.length === 0) return { success: false, message: "No hay correos que exportar." };
    const recortado = pedidos.length > TOPE_DE_CONVERSACIONES_POR_LOTE;
    const zona = typeof zonaHoraria === "string" && zonaHoraria.length < 64 ? zonaHoraria : undefined;
    const exportadaEn = new Date();
    const archivos: { nombre: string; contenido: string }[] = [];
    let omitidos = 0;
    // En serie: son peticiones al proveedor de la persona, y varias a la vez
    // contra el mismo buzón es lo que hace que Gmail o un IMAP cierren la puerta.
    for (const p of pedidos.slice(0, TOPE_DE_CONVERSACIONES_POR_LOTE)) {
        try {
            const r = await elMio(p.buzonId);
            if ("error" in r) {
                omitidos++;
                continue;
            }
            const correo = await elProveedorDe(r.buzon).leer(r.buzon, p.correoId);
            archivos.push({
                nombre: elNombreDelArchivoDelCorreo(correo.asunto, correo.fecha),
                contenido: formatearCorreo(correo, { exportadaEn, zonaHoraria: zona }),
            });
        } catch (error) {
            console.warn("[correo] no se pudo exportar un correo", error instanceof Error ? error.message : error);
            omitidos++;
        }
    }
    if (archivos.length === 0) return { success: false, message: "No se pudo exportar ninguno de los correos." };
    const message = [
        `${archivos.length} correo${archivos.length === 1 ? "" : "s"} exportado${archivos.length === 1 ? "" : "s"}.`,
        omitidos ? `${omitidos} no se pudo${omitidos === 1 ? "" : "ieron"} exportar.` : "",
        recortado ? `Se exportan como mucho ${TOPE_DE_CONVERSACIONES_POR_LOTE} por vez.` : "",
    ]
        .filter(Boolean)
        .join(" ");
    return { success: true, archivos, omitidos, message };
}
