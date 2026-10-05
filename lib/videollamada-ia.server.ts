import "server-only";

import { laCitaDeLaVideollamada } from "@/lib/cita-de-la-videollamada.server";

import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { elBloqueDeLaPantalla, elBloqueDelEnvio, elBloqueDelGuion } from "@/lib/pantalla-del-avatar";
import { leerElGuionDeVideollamada } from "@/lib/guion-videollamada-db";
import { elGuionQueSeUsa, type GuionDeVideollamada } from "@/lib/guion-videollamada";
import { laPersonaParaLaConversacion } from "@/lib/persona-de-tavus.server";
import { SALUDO_INICIAL } from "@/lib/videollamada-crm";
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
    | {
          estado: "ir";
          url: string;
          nombre: string | null;
          /** La cita y su firma: la sala las usa para reabrir sola y para pedir envíos por WhatsApp. */
          citaId: string;
          firma: string;
          /** La sesión ya estaba en curso y alguien había entrado: el avatar retoma, no vuelve a saludar. */
          reentrada: boolean;
          /** El saludo del guion de la cuenta: la sala lo dice si Verzy calla al entrar. */
          saludo: string;
      }
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
        const cita = await laCitaDeLaVideollamada(citaId);
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

/** Lo que ya se habló en una sesión anterior de la MISMA cita (se cortó y se reabre). */
export function elBloqueDeLoYaHablado(transcripcion: string | null | undefined): string {
    const t = String(transcripcion ?? "").trim();
    if (!t) return "";
    const recorte = t.length > 3000 ? `…${t.slice(-3000)}` : t;
    return [
        "CONVERSACIÓN ANTERIOR DE ESTA MISMA CITA",
        "La videollamada se cortó y el cliente volvió a entrar. Ya se presentaron: NO saludes como si fuera la primera vez ni reinicies el guion. " +
            "Retoma donde quedaron, con una frase corta de reconexión.",
        recorte,
    ].join("\n");
}

async function elContexto(
    cita: CitaParaAbrir,
    yaHablado?: string | null,
    guion?: GuionDeVideollamada | null,
    entrenamiento?: string | null,
): Promise<string> {
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
    // La pantalla que comparte el avatar: solo cómo se usa la herramienta; a dónde ir lo dice su entrenamiento.
    const anterior = elBloqueDeLoYaHablado(yaHablado);
    // Con la fecha de hoy en la zona del negocio: agendar «el jueves a las 3» la necesita.
    const ahora = laFechaDeHoyParaElGuion(new Date(), zona);
    return [contexto, elBloqueDeLaPantalla(), elBloqueDelEnvio(), elBloqueDelGuion(ahora, guion, entrenamiento), anterior]
        .filter(Boolean)
        .join("\n\n");
}

/** «jueves 2026-10-08T15:30», en la zona de la cuenta. */
export function laFechaDeHoyParaElGuion(instante: Date, zona: string): string {
    const partes = Object.fromEntries(
        new Intl.DateTimeFormat("es-CO", {
            timeZone: laZonaDeLaCuenta(zona),
            weekday: "long", year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", hourCycle: "h23",
        })
            .formatToParts(instante)
            .map((p) => [p.type, p.value]),
    );
    return `${partes.weekday} ${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}

/* ── Abrir ─────────────────────────────────────────────────────────────── */

/**
 * El guion que la cuenta dueña de la cita guardó en Agente IA › Videollamadas.
 * Si no se puede leer, `null`: va el de fábrica y la llamada nunca sale sin guion.
 */
async function elGuionDeLaCita(cita: CitaParaAbrir): Promise<GuionDeVideollamada | null> {
    try {
        return await leerElGuionDeVideollamada(cita.userId);
    } catch (error) {
        console.warn("[videollamada] no se pudo leer el guion de la cuenta; va el de fábrica", {
            cita: cita.id,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/** El agentId del entrenamiento de Videollamadas (lib/channel-training.ts). */
export const AGENTE_DE_VIDEOLLAMADAS = "system-prompt-ai-videollamadas";

/**
 * El entrenamiento que la cuenta dueña de la cita escribió en Agente IA ›
 * Videollamadas (el MISMO editor que Llamadas). Sin fila o vacío → `null` y
 * va el guion. Nunca tumba la llamada.
 */
async function elEntrenamientoDeLaCita(cita: CitaParaAbrir): Promise<string | null> {
    try {
        const fila = await db.agentPrompt.findFirst({
            where: { userId: cita.userId, agentId: AGENTE_DE_VIDEOLLAMADAS },
            orderBy: { updatedAt: "desc" },
            select: { promptText: true },
        });
        const texto = fila?.promptText?.trim();
        return texto ? texto : null;
    } catch (error) {
        console.warn("[videollamada] no se pudo leer el entrenamiento de Videollamadas; va el guion", {
            cita: cita.id,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

async function crearLaConversacion(
    cita: CitaParaAbrir,
    tavus: { clave: string; personaId: string },
    yaHablado?: string | null,
    guionLeido?: GuionDeVideollamada | null,
): Promise<{ id: string; url: string }> {
    const origen = elOrigenPublico();
    const ahora = new Date();
    // La persona con la que se crea TIENE las herramientas: la original si se
    // le pudieron poner, o su copia si tiene ediciones del editor de Tavus
    // (409 maker_changes). Sin ellas no hay pantalla compartida.
    const personaId = await laPersonaParaLaConversacion(tavus);
    const guion = guionLeido === undefined ? await elGuionDeLaCita(cita) : guionLeido;
    const cuerpo: Record<string, unknown> = {
        persona_id: personaId,
        conversation_name: `Cita ${cita.id}`,
        conversational_context: await elContexto(cita, yaHablado, guion, await elEntrenamientoDeLaCita(cita)),
        properties: {
            max_call_duration: laDuracionMaxima(ahora, cita.endTime),
            participant_absent_timeout: 300,
            // Si se le cae la conexión al cliente, la conversación espera
            // tres minutos a que vuelva por el mismo enlace: así el avatar
            // sigue donde iba en vez de empezar de nuevo.
            participant_left_timeout: 180,
            language: "spanish",
        },
    };
    // SIN custom_greeting a propósito: Tavus lo dice en el mismo instante en
    // que el cliente entra, y ese «hola» se pierde mientras ajusta la
    // pantalla. El saludo lo hace decir la sala pasado un margen
    // (ESPERA_DEL_SALUDO_MS de SalaDeLaVideollamada).
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

    const cita: CitaParaAbrir | null = await laCitaDeLaVideollamada(id);
    if (!cita) return { estado: "no_existe" };

    const ajustes = await leerLosAjustes(cita.userId).catch(() => null);
    const tavus = await elAvatarDeLaCuenta(cita.userId);
    if (ajustes?.modo !== "tavus" || !tavus) {
        if (!tavus) console.error("[videollamada] la cuenta no tiene avatar propio y falta TAVUS_API_KEY o TAVUS_PERSONA_ID en el entorno", { cita: id });
        return { estado: "sin_configurar" };
    }

    const existente = await laVideollamada(id);
    const guion = await elGuionDeLaCita(cita);
    const irA = (url: string) => ({
        estado: "ir" as const,
        url,
        nombre: elNombreDelProspecto(cita),
        citaId: id,
        firma: laFirmaDeLaCita(id),
        reentrada: false,
        saludo: elGuionQueSeUsa(guion).saludo || SALUDO_INICIAL,
    });
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
        // Reentrada SOLO si alguien ya estuvo DENTRO de esta conversación (la
        // sala lo apunta al unirse, `marcarLaEntradaReal`). Abrir o precargar
        // la página no cuenta: si contara, la primera entrada de verdad
        // arrancaba «a mitad de conversación».
        return { ...irA(existente.conversacionUrl), reentrada: !!existente.entroEn };
    }

    const reclamada = await reclamarLaCreacion(id, cita.userId);
    if (!reclamada) {
        const url = await esperarALaOtraPestana(id);
        if (url) return irA(url);
        return { estado: "fallo", motivo: "No se pudo abrir la videollamada en este momento." };
    }

    try {
        const conversacion = await crearLaConversacion(cita, tavus, existente?.transcripcion, guion);
        await apuntarLaConversacion(id, conversacion.id, conversacion.url);
        console.info("[videollamada] conversación creada", { cita: id, cuenta: cita.userId, conversacion: conversacion.id });
        return irA(conversacion.url);
    } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        await soltarElReclamo(id).catch(() => undefined);
        console.error("[videollamada] Tavus no creó la conversación", { cita: id, cuenta: cita.userId, motivo });
        return { estado: "fallo", motivo: elMotivoLegible(motivo) };
    }
}

/**
 * La sala ENTRÓ de verdad a la llamada (evento `joined-meeting` de Daily). Es
 * lo único que apunta `entroEn`: de ahí salen la reentrada, el aviso de
 * ausencia del backend y el «entró» del CRM.
 */
export async function marcarLaEntradaReal(citaId: string): Promise<void> {
    await marcarQueEntro(citaId);
}
