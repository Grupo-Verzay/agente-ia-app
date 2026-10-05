import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { elBloqueDeLaPantalla } from "@/lib/pantalla-del-avatar";
import { asegurarLaPantallaEnLaPersona } from "@/lib/persona-de-tavus.server";
import { deInstanteAReloj, laZonaDeLaCuenta } from "@/lib/zona-de-la-cuenta";
import { elContextoDeLaConversacion, TOPE_DE_MENSAJES, type MensajeDelChat } from "@/lib/contexto-de-la-conversacion";
import {
    elContextoParaTavus,
    elEnlaceDeLaVideollamada,
    elEnlaceDelNombre,
    elNombreDelProspecto,
    laDuracionMaxima,
    pareceUnEnlaceConNombre,
    queHacerAlAbrir,
} from "@/lib/videollamada-ia";
import {
    apuntarLaConversacion,
    elAvatarDeLaCuenta,
    elEnlaceDeLaCita,
    laCitaDelEnlace,
    laVideollamada,
    leerLosAjustes,
    marcarQueEntro,
    reclamarLaCreacion,
    soltarElReclamo,
} from "@/lib/videollamada-ia-db";

/**
 * Abrir `/videollamada/<id de la cita>`: aquí, y SOLO aquí, se crea la
 * conversación de Tavus, con el avatar fijo de la plataforma («Verzy»), para
 * cualquier cuenta. La clave no sale de este fichero: va en la cabecera `x-api-key` de
 * la petición a Tavus y en ningún otro sitio.
 */

export const API_DE_TAVUS = "https://tavusapi.com/v2/conversations";

/** Cuánto espera la segunda pestaña a que la primera termine de crear la sala. */
const ESPERA_POR_OTRA_PESTANA_MS = 10_000;

export type ResultadoAlAbrir =
    | { estado: "ir"; url: string; nombre: string | null }
    | { estado: "temprano"; abreEn: Date; zona: string }
    | { estado: "cerrada" }
    | { estado: "cancelada" }
    | { estado: "no_existe" }
    | { estado: "sin_configurar" }
    | { estado: "fallo"; motivo: string };

/* ── La firma del aviso de Tavus ───────────────────────────────────────── */

function laLlaveDeLaFirma(): string {
    return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
}

/** La firma que va en el `callback_url`: sin ella el aviso no se acepta. */
export function laFirmaDeLaCita(citaId: string): string {
    return createHmac("sha256", laLlaveDeLaFirma()).update(`videollamada:${citaId}`).digest("hex").slice(0, 32);
}

export function esLaFirmaDeLaCita(citaId: string, firma: unknown): boolean {
    if (!laLlaveDeLaFirma() || typeof firma !== "string") return false;
    const buena = Buffer.from(laFirmaDeLaCita(citaId));
    const llega = Buffer.from(firma);
    return buena.length === llega.length && timingSafeEqual(buena, llega);
}

/* ── El enlace de una cita ─────────────────────────────────────────────── */

/**
 * El origen PÚBLICO de la plataforma. No sale de la petición: el enlace se arma
 * también en el agente IA (que llama a la App por su dirección interna) y en
 * los recordatorios, y la dirección de vuelta de Tavus tiene que poder
 * alcanzarse desde fuera. Es el mismo respaldo que los enlaces de pago.
 */
export function elOrigenPublico(): string {
    return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://agente.ia-app.com").replace(/\/+$/, "");
}

/**
 * El enlace de reunión de ESA cita: el de la videollamada con IA si la cuenta
 * está en ese modo, o el enlace fijo de siempre. `null` si no hay ninguno.
 */
export async function elEnlaceDeReunionDeLaCita(cuentaId: string, citaId: string | null): Promise<string | null> {
    const ajustes = await leerLosAjustes(cuentaId).catch(() => null);
    if (ajustes?.modo === "tavus" && citaId) {
        const origen = elOrigenPublico();
        if (origen) return elEnlaceDeLaVideollamada(origen, await laLlaveDelEnlace(citaId));
    }
    const fila = await db.user.findUnique({ where: { id: cuentaId }, select: { meetingUrl: true } });
    return fila?.meetingUrl?.trim() || null;
}

/**
 * Lo que va en `/videollamada/<x>`: el nombre del prospecto si lo hay
 * («maria-alejandra-rosas»), y si no —o si falla— el id de la cita.
 */
async function laLlaveDelEnlace(citaId: string): Promise<string> {
    try {
        const cita = await db.appointment.findUnique({
            where: { id: citaId },
            select: { clientName: true, session: { select: { customName: true, pushName: true } } },
        });
        const base = cita ? elEnlaceDelNombre(elNombreDelProspecto(cita)) : null;
        if (!base) return citaId;
        return await elEnlaceDeLaCita(citaId, base);
    } catch (error) {
        console.warn("[videollamada] no se pudo armar el enlace con nombre; va el id de la cita", {
            cita: citaId,
            error: error instanceof Error ? error.message : String(error),
        });
        return citaId;
    }
}

/* ── El contexto del prospecto ─────────────────────────────────────────── */

/** El chat de WhatsApp de la conversación, por sus TRES columnas (cada rama con su índice). */
async function losMensajesDelChat(cuentaId: string, identidades: string[]): Promise<MensajeDelChat[]> {
    if (identidades.length === 0) return [];
    const filas = await db.$queryRaw<{ fromMe: boolean; content: string | null; messageTimestamp: Date }[]>`
        SELECT * FROM (
            (SELECT "fromMe", "content", "messageTimestamp" FROM "chat_messages"
              WHERE "userId" = ${cuentaId} AND "remoteJid" = ANY(${identidades}::text[])
                AND "messageType" <> 'call' AND COALESCE("content", '') <> ''
              ORDER BY "messageTimestamp" DESC LIMIT ${TOPE_DE_MENSAJES})
            UNION ALL
            (SELECT "fromMe", "content", "messageTimestamp" FROM "chat_messages"
              WHERE "userId" = ${cuentaId} AND "remoteJidAlt" = ANY(${identidades}::text[])
                AND "messageType" <> 'call' AND COALESCE("content", '') <> ''
              ORDER BY "messageTimestamp" DESC LIMIT ${TOPE_DE_MENSAJES})
            UNION ALL
            (SELECT "fromMe", "content", "messageTimestamp" FROM "chat_messages"
              WHERE "userId" = ${cuentaId} AND "senderPn" = ANY(${identidades}::text[])
                AND "messageType" <> 'call' AND COALESCE("content", '') <> ''
              ORDER BY "messageTimestamp" DESC LIMIT ${TOPE_DE_MENSAJES})
        ) t
        ORDER BY "messageTimestamp" DESC
        LIMIT ${TOPE_DE_MENSAJES * 3}
    `;
    const vistos = new Set<string>();
    const unicos = filas.filter((f) => {
        const llave = `${f.fromMe}|${f.messageTimestamp.getTime()}|${f.content}`;
        if (vistos.has(llave)) return false;
        vistos.add(llave);
        return true;
    });
    return unicos
        .slice(0, TOPE_DE_MENSAJES)
        .reverse()
        .map((f) => ({ delCliente: !f.fromMe, texto: String(f.content ?? "") }));
}

type CitaParaAbrir = {
    id: string;
    userId: string;
    startTime: Date;
    endTime: Date;
    timezone: string;
    status: string;
    clientName: string | null;
    service: { name: string } | null;
    session: { remoteJid: string; remoteJidAlt: string | null; pushName: string; customName: string | null } | null;
    user: { company: string | null; name: string | null; email: string; timezone: string | null };
};

async function elContexto(cita: CitaParaAbrir): Promise<string> {
    const nombre = elNombreDelProspecto(cita);
    let conversacion = "";
    try {
        const identidades = cita.session
            ? buildWhatsAppJidCandidates(cita.session.remoteJid, [cita.session.remoteJidAlt])
            : [];
        const mensajes = await losMensajesDelChat(cita.userId, identidades);
        conversacion = elContextoDeLaConversacion({ nombre: nombre ?? undefined, mensajes });
    } catch (error) {
        // Nunca tumba la sala: se entra sin el chat y el bloque dice que no lo hay.
        console.warn("[videollamada] no se pudo leer la conversación para el contexto", {
            cita: cita.id,
            error: error instanceof Error ? error.message : String(error),
        });
        conversacion = elContextoDeLaConversacion({ nombre: nombre ?? undefined, mensajes: [] });
    }
    const zona = laZonaDeLaCuenta(cita.timezone || cita.user.timezone);
    const contexto = elContextoParaTavus({
        negocio: nombreDeLaCuenta(cita.user),
        nombreDelCliente: nombre,
        servicio: cita.service?.name ?? null,
        inicioLegible: deInstanteAReloj(cita.startTime, zona),
        conversacion,
    });
    // La pantalla que comparte el avatar: sin esto no sabe qué páginas hay.
    return `${contexto}\n\n${elBloqueDeLaPantalla()}`;
}

/* ── Abrir ─────────────────────────────────────────────────────────────── */

async function crearLaConversacion(
    cita: CitaParaAbrir,
    tavus: { clave: string; personaId: string },
): Promise<{ id: string; url: string }> {
    const origen = elOrigenPublico();
    const ahora = new Date();
    // Sin la herramienta en la persona, Verzy no puede compartir pantalla.
    await asegurarLaPantallaEnLaPersona(tavus);
    const cuerpo: Record<string, unknown> = {
        persona_id: tavus.personaId,
        conversation_name: `Cita ${cita.id}`,
        conversational_context: await elContexto(cita),
        properties: {
            max_call_duration: laDuracionMaxima(ahora, cita.endTime),
            participant_absent_timeout: 300,
            language: "spanish",
        },
    };
    if (origen) {
        cuerpo.callback_url =
            `${origen}/api/videollamada/tavus?c=${encodeURIComponent(cita.id)}&f=${laFirmaDeLaCita(cita.id)}`;
    }
    const respuesta = await fetch(API_DE_TAVUS, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": tavus.clave },
        body: JSON.stringify(cuerpo),
        cache: "no-store",
    });
    const datos = (await respuesta.json().catch(() => ({}))) as {
        conversation_id?: string;
        conversation_url?: string;
        message?: string;
        error?: string;
    };
    if (!respuesta.ok || !datos.conversation_id || !datos.conversation_url) {
        const motivo = datos.message || datos.error || `Tavus contestó ${respuesta.status}`;
        throw new Error(motivo);
    }
    return { id: datos.conversation_id, url: datos.conversation_url };
}

async function esperarALaOtraPestana(citaId: string): Promise<string | null> {
    const hasta = Date.now() + ESPERA_POR_OTRA_PESTANA_MS;
    while (Date.now() < hasta) {
        await new Promise((r) => setTimeout(r, 700));
        const fila = await laVideollamada(citaId);
        if (fila?.conversacionUrl && fila.estado !== "finalizada") return fila.conversacionUrl;
        if (fila?.estado === "fallida") return null;
    }
    return null;
}

/** Lo que se traduce al cliente cuando Tavus dice que no. */
function elMotivoLegible(motivo: string): string {
    const m = motivo.toLowerCase();
    if (m.includes("401") || m.includes("unauthor") || m.includes("api key") || m.includes("invalid key")) {
        return "El servicio de videollamada no está disponible en este momento.";
    }
    if (m.includes("credit") || m.includes("quota") || m.includes("limit")) {
        return "El servicio de videollamada no tiene saldo disponible.";
    }
    return "No se pudo abrir la videollamada en este momento.";
}

export async function abrirLaVideollamada(citaId: string, ahora: Date = new Date()): Promise<ResultadoAlAbrir> {
    const pedido = String(citaId ?? "").trim();
    // Primero el enlace con nombre; si no lo es, el id de la cita (los enlaces viejos siguen abriendo).
    const porNombre = pareceUnEnlaceConNombre(pedido) ? await laCitaDelEnlace(pedido).catch(() => null) : null;
    const id = porNombre ?? pedido;
    if (!/^[0-9a-f-]{8,64}$/i.test(id)) return { estado: "no_existe" };

    const cita = (await db.appointment.findUnique({
        where: { id },
        select: {
            id: true,
            userId: true,
            startTime: true,
            endTime: true,
            timezone: true,
            status: true,
            clientName: true,
            service: { select: { name: true } },
            session: { select: { remoteJid: true, remoteJidAlt: true, pushName: true, customName: true } },
            user: { select: { company: true, name: true, email: true, timezone: true } },
        },
    })) as CitaParaAbrir | null;
    if (!cita) return { estado: "no_existe" };

    const ajustes = await leerLosAjustes(cita.userId).catch(() => null);
    const tavus = await elAvatarDeLaCuenta(cita.userId);
    if (ajustes?.modo !== "tavus" || !tavus) {
        if (!tavus) console.error("[videollamada] la cuenta no tiene avatar propio y falta TAVUS_API_KEY o TAVUS_PERSONA_ID en el entorno", { cita: id });
        return { estado: "sin_configurar" };
    }

    const existente = await laVideollamada(id);
    const decision = queHacerAlAbrir({
        ahora,
        inicio: cita.startTime,
        fin: cita.endTime,
        estado: cita.status,
        existente: existente?.conversacionUrl ? { url: existente.conversacionUrl, estado: existente.estado } : null,
    });

    if (decision.accion === "temprano") {
        return { estado: "temprano", abreEn: decision.abreEn, zona: laZonaDeLaCuenta(cita.timezone || cita.user.timezone) };
    }
    if (decision.accion === "cerrada") return { estado: "cerrada" };
    if (decision.accion === "cancelada") return { estado: "cancelada" };
    if (decision.accion === "reutilizar" && existente?.conversacionUrl) {
        await marcarQueEntro(id);
        return { estado: "ir", url: existente.conversacionUrl, nombre: elNombreDelProspecto(cita) };
    }

    const reclamada = await reclamarLaCreacion(id, cita.userId);
    if (!reclamada) {
        const url = await esperarALaOtraPestana(id);
        if (url) {
            await marcarQueEntro(id);
            return { estado: "ir", url, nombre: elNombreDelProspecto(cita) };
        }
        return { estado: "fallo", motivo: "No se pudo abrir la videollamada en este momento." };
    }

    try {
        const conversacion = await crearLaConversacion(cita, tavus);
        await apuntarLaConversacion(id, conversacion.id, conversacion.url);
        await marcarQueEntro(id);
        console.info("[videollamada] conversación creada", { cita: id, cuenta: cita.userId, conversacion: conversacion.id });
        return { estado: "ir", url: conversacion.url, nombre: elNombreDelProspecto(cita) };
    } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        await soltarElReclamo(id).catch(() => undefined);
        console.error("[videollamada] Tavus no creó la conversación", { cita: id, cuenta: cita.userId, motivo });
        return { estado: "fallo", motivo: elMotivoLegible(motivo) };
    }
}
