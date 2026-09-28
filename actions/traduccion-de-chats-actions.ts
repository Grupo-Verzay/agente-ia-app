"use server";

import { currentUser } from "@/lib/auth";
import { getAssociatedAccountIds } from "@/lib/cuentas-asociadas";
import { resolveInstanceOwner } from "@/lib/chat-persistence";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";
import { IDIOMA_DEL_PANEL, elIdiomaDelTexto, type Idioma } from "@/lib/idioma-del-cliente";
import {
    TOPE_POR_VUELTA,
    hayQueTraducirlo,
    laLlevaUnaPersona,
    seTraduceAlEnviar,
    seTraduceSolo,
    unaTraduccion,
    type Traduccion,
} from "@/lib/traduccion-de-chats";
import {
    elEstadoDeLaConversacion,
    elIdiomaDeLaConversacionGuardada,
    guardarLaTraduccion,
    losMensajesDeLaConversacion,
    traducirCobrando,
} from "@/lib/traduccion-de-chats.server";

/**
 * La traducción de Chats, en tres acciones y una sola puerta.
 *
 * | acción | cuándo | hacia dónde |
 * | --- | --- | --- |
 * | `traduccionesDeLaConversacionAction` | la pide la conversación abierta, sola | lo del cliente, al español |
 * | `traducirMensajeAction` | «Traducir» del menú «⋯» de un mensaje | ese mensaje, al español |
 * | `traducirParaEnviarAction` | antes de enviar lo que escribió el asesor | del español al idioma del cliente |
 *
 * # La puerta es la de Chats
 *
 * La línea se resuelve a su cuenta DUEÑA y quien llama tiene que alcanzarla
 * (`getAssociatedAccountIds`: lo propio y lo de abajo, nunca hacia arriba). Es
 * la misma pregunta que se hace para leer sus mensajes: quien no los puede leer
 * tampoco los traduce ni gasta los créditos de esa cuenta.
 */

type Conversacion = { instanceName: string; remoteJid: string; aliases?: string[] };

type Puerta =
    | { ok: true; cuenta: string; userIds: string[]; instanceName: string; candidatos: string[] }
    | { ok: false; message: string };

async function laPuerta(c: Conversacion): Promise<Puerta> {
    const user = await currentUser();
    if (!user?.id) return { ok: false, message: "No autorizado." };
    const instanceName = String(c?.instanceName ?? "").trim();
    const remoteJid = String(c?.remoteJid ?? "").trim();
    if (!instanceName || !remoteJid) return { ok: false, message: "Falta la conversación." };
    const dueno = await resolveInstanceOwner(instanceName);
    if (!dueno?.userId) return { ok: false, message: "La línea no existe." };
    const cuentas = await getAssociatedAccountIds(user);
    if (!cuentas.includes(dueno.userId)) {
        console.warn("[traduccion] se pidió traducir en una línea que no se alcanza", { instanceName });
        return { ok: false, message: "No autorizado." };
    }
    const aliases = Array.isArray(c.aliases) ? c.aliases.filter((a) => typeof a === "string") : [];
    return {
        ok: true,
        cuenta: dueno.userId,
        userIds: [dueno.userId],
        instanceName,
        candidatos: buildWhatsAppJidCandidates(remoteJid, aliases),
    };
}

export type TraduccionesDeLaConversacion =
    | {
          success: true;
          idioma: Idioma | null;
          /** Si lo del cliente se traduce solo (otro idioma y la lleva una persona). */
          automatica: boolean;
          traducciones: Record<string, Traduccion>;
          /** Mensajes del cliente que quedaron por traducir para la vuelta siguiente. */
          quedan: number;
          /** Por qué algo no se tradujo: sin créditos, sin IA… Se dice una vez. */
          aviso?: string;
      }
    | { success: false; message: string };

/**
 * El idioma de la conversación, las traducciones que ya tienen sus mensajes y
 * —si la lleva una persona y el cliente no escribe en español— las que faltan
 * de lo que escribió el cliente, traducidas y guardadas ahora.
 *
 * Solo se traducen los ids que llegan (lo que la pantalla tiene delante) y como
 * mucho `TOPE_POR_VUELTA`: el resto sale en la vuelta siguiente.
 */
export async function traduccionesDeLaConversacionAction(
    conversacion: Conversacion,
    messageIds: string[],
): Promise<TraduccionesDeLaConversacion> {
    try {
        const p = await laPuerta(conversacion);
        if (!p.ok) return { success: false, message: p.message };

        const ids = Array.isArray(messageIds) ? messageIds.slice(0, 200) : [];
        const [idioma, estado, mensajes] = await Promise.all([
            elIdiomaDeLaConversacionGuardada(p),
            elEstadoDeLaConversacion({ userId: p.cuenta, instanceName: p.instanceName, candidatos: p.candidatos }),
            losMensajesDeLaConversacion({ ...p, messageIds: ids }),
        ]);

        const traducciones: Record<string, Traduccion> = {};
        for (const m of mensajes) if (m.traduccion) traducciones[m.messageId] = m.traduccion;

        const automatica = seTraduceSolo({ idioma, laLlevaUnaPersona: laLlevaUnaPersona(estado) });
        if (!automatica || !idioma) return { success: true, idioma, automatica, traducciones, quedan: 0 };

        const todos = mensajes.filter(
            (m) => !m.fromMe && hayQueTraducirlo({ texto: m.texto, traduccion: m.traduccion }),
        );
        const pendientes = todos.slice(0, TOPE_POR_VUELTA);

        let aviso: string | undefined;
        // En serie: son pocas, y una cuenta sin créditos corta a la primera en
        // vez de pedir veinte veces lo mismo.
        for (const m of pendientes) {
            const r = await traducirCobrando(p.cuenta, m.texto, IDIOMA_DEL_PANEL);
            if (!r.ok) {
                aviso = r.aviso;
                break;
            }
            const t = unaTraduccion(r.texto, idioma, "automatica");
            await guardarLaTraduccion(m.fila, t);
            traducciones[m.messageId] = t;
        }
        if (pendientes.length) {
            console.info("[traduccion] mensajes del cliente traducidos solos", {
                linea: p.instanceName,
                idioma,
                traducidos: pendientes.length - (aviso ? 1 : 0),
                ...(aviso ? { aviso } : {}),
            });
        }
        const quedan = aviso ? 0 : Math.max(0, todos.length - pendientes.length);
        return { success: true, idioma, automatica, traducciones, quedan, ...(aviso ? { aviso } : {}) };
    } catch (error) {
        console.warn("[traduccion] no se pudieron leer las traducciones", {
            error: error instanceof Error ? error.message : String(error),
        });
        return { success: false, message: "No se pudieron leer las traducciones." };
    }
}

/**
 * «Traducir» del menú de un mensaje: el respaldo por si la automática no se
 * disparó. Vale para cualquier mensaje con texto —del cliente, del asesor o de
 * la IA— y siempre hacia el español.
 */
export async function traducirMensajeAction(
    conversacion: Conversacion,
    messageId: string,
): Promise<{ success: true; traduccion: Traduccion } | { success: false; message: string }> {
    try {
        const p = await laPuerta(conversacion);
        if (!p.ok) return { success: false, message: p.message };

        const [mensaje] = await losMensajesDeLaConversacion({ ...p, messageIds: [String(messageId ?? "")] });
        if (!mensaje) {
            return { success: false, message: "Ese mensaje todavía no está guardado; inténtalo en unos segundos." };
        }
        if (mensaje.traduccion) return { success: true, traduccion: mensaje.traduccion };
        if (!hayQueTraducirlo({ texto: mensaje.texto, traduccion: null })) {
            return { success: false, message: "Ese mensaje ya está en español." };
        }

        const r = await traducirCobrando(p.cuenta, mensaje.texto, IDIOMA_DEL_PANEL);
        if (!r.ok) return { success: false, message: r.aviso };

        // El idioma del mensaje: el de la conversación si lo hay y no es el
        // español; si no, el que dice el propio texto; y si tampoco, inglés,
        // que es lo único que la pantalla necesita para nombrarlo.
        const idiomaDeLaConversacion = await elIdiomaDeLaConversacionGuardada(p);
        const idioma: Idioma =
            elIdiomaDelTexto(mensaje.texto) ??
            (idiomaDeLaConversacion && idiomaDeLaConversacion !== IDIOMA_DEL_PANEL ? idiomaDeLaConversacion : "en");
        const t = unaTraduccion(r.texto, idioma, "manual");
        await guardarLaTraduccion(mensaje.fila, t);
        return { success: true, traduccion: t };
    } catch (error) {
        console.warn("[traduccion] no se pudo traducir el mensaje", {
            messageId,
            error: error instanceof Error ? error.message : String(error),
        });
        return { success: false, message: "No se pudo traducir el mensaje." };
    }
}

export type LoQueSale = {
    success: true;
    /** Lo que se manda por WhatsApp. */
    texto: string;
    /** El original en español, para guardarlo con el mensaje. Solo si se tradujo. */
    traduccion?: Traduccion;
    /** Por qué sale sin traducir, si no se pudo. */
    aviso?: string;
};

/**
 * Lo que escribió el asesor, en el idioma del cliente, ANTES de enviarlo.
 *
 * Si no hace falta —el cliente escribe en español, el texto ya está en su
 * idioma— sale tal cual. Si hace falta y no se puede (sin créditos, la IA no
 * contestó), **sale en español y se dice**: un mensaje que no llega porque no
 * se pudo traducir es peor que uno sin traducir.
 */
export async function traducirParaEnviarAction(
    conversacion: Conversacion,
    texto: string,
    opciones?: { reenviado?: boolean },
): Promise<LoQueSale | { success: false; message: string }> {
    const original = String(texto ?? "");
    try {
        const p = await laPuerta(conversacion);
        if (!p.ok) return { success: false, message: p.message };

        const idioma = await elIdiomaDeLaConversacionGuardada(p);
        if (!seTraduceAlEnviar({ idioma, texto: original, reenviado: opciones?.reenviado }) || !idioma) {
            return { success: true, texto: original };
        }
        const r = await traducirCobrando(p.cuenta, original, idioma);
        if (!r.ok) {
            console.warn("[traduccion] el mensaje del asesor sale sin traducir", {
                linea: p.instanceName,
                idioma,
                motivo: r.motivo,
            });
            return { success: true, texto: original, aviso: `Se envió sin traducir: ${r.aviso}` };
        }
        return {
            success: true,
            texto: r.texto,
            traduccion: unaTraduccion(original, idioma, "al_enviar"),
        };
    } catch (error) {
        console.warn("[traduccion] no se pudo preparar el envío", {
            error: error instanceof Error ? error.message : String(error),
        });
        return { success: true, texto: original, aviso: "Se envió sin traducir: no se pudo traducir en este momento." };
    }
}

