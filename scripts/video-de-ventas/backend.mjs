/**
 * El BACKEND de la historia: lo que en producción hacen el webhook y la IA —
 * guardar cada mensaje de la conversación y tocar el CRM— escrito en la base de
 * la App de verdad, en el momento en que ocurre en el vídeo.
 *
 * Escribe EXACTAMENTE lo que escribe el webhook para una línea de WhatsApp
 * Mensajería (`waha`): una fila en `chat_messages` con su `raw` al estilo de
 * Evolution, el último mensaje de `chat_conversations` y la ficha (`Session`)
 * del contacto la primera vez que escribe. El panel no sabe que esto no es el
 * webhook: lee lo que lee siempre, por los mismos caminos, y lo pinta con sus
 * propios relojes. Eso es lo que hace que lo que se ve en el portátil sea la
 * App de verdad y no un dibujo.
 *
 * Lo que NO hay aquí es inteligencia: las respuestas de la IA son las de la
 * historia (`historia.mjs`). El vídeo lo dice en su cierre.
 */
import { CALIFICACION, CLIENTA, MEDIOS, NEGOCIO, NOTAS_DE_VOZ, ZONA, laConversacion } from "./historia.mjs";

/** El id de WhatsApp de un mensaje de la historia. */
export const idDelMensaje = (m) => `SONRIE_${m.id}`;

/** Dónde sirve el estudio los archivos de la historia (lo intercepta Playwright). */
export const rutaDelMedio = (base, archivo) => `${base}/__estudio/medios/${archivo}`;

/**
 * El `messageType`, el contenido y el `raw` de un mensaje, como los guarda el
 * webhook. Pura: la usa el banco para comprobar que cada tipo sale con la forma
 * que el panel sabe pintar.
 */
export function comoLoGuardaElWebhook(m, { base, segundos = {} }) {
    const fromMe = m.de === "ia";
    const key = { id: idDelMensaje(m), remoteJid: CLIENTA.jid, fromMe };
    const marca = { messageTimestamp: Math.floor(m.en / 1000), pushName: fromMe ? null : CLIENTA.nombreDeWhatsapp, ...(fromMe ? { sentByAi: true } : {}) };
    const medio = m.medio ? MEDIOS[m.medio] : null;
    const url = medio ? rutaDelMedio(base, medio.archivo) : null;
    switch (m.tipo) {
        case "texto":
            return { messageType: "conversation", content: m.texto, mediaUrl: null, raw: { key, message: { conversation: m.texto }, ...marca } };
        case "nota": {
            const nota = NOTAS_DE_VOZ[m.nota];
            const seg = segundos[m.medio] ?? 0;
            return {
                messageType: "audioMessage",
                content: "[Audio]",
                mediaUrl: url,
                raw: {
                    key,
                    message: { audioMessage: { mimetype: medio.mime, ptt: true, seconds: seg } },
                    transcripcion: nota.transcripcion,
                    ...marca,
                },
            };
        }
        case "documento":
            return {
                messageType: "documentMessage",
                content: medio.nombre,
                mediaUrl: url,
                raw: {
                    key,
                    message: { documentMessage: { mimetype: medio.mime, fileName: medio.nombre, pageCount: medio.paginas, title: medio.nombre } },
                    ...marca,
                },
            };
        case "video":
            return {
                messageType: "videoMessage",
                content: m.texto ?? "",
                mediaUrl: url,
                raw: { key, message: { videoMessage: { mimetype: medio.mime, caption: m.texto ?? "", seconds: segundos[m.medio] ?? 0 } }, ...marca },
            };
        case "imagen":
            return {
                messageType: "imageMessage",
                content: m.texto ?? "",
                mediaUrl: url,
                raw: { key, message: { imageMessage: { mimetype: medio.mime, caption: m.texto ?? "" } }, ...marca },
            };
        default:
            throw new Error(`[video] tipo de mensaje desconocido: ${m.tipo}`);
    }
}

/**
 * El aviso en vivo de un mensaje recién guardado: lo que el backend emite por
 * socket.io (`chat:changed`) en cuanto el webhook lo escribe. Con la forma de
 * `ChatChangedPayload` (`hooks/chats/useChatsRealtime.ts`). Pura.
 */
export function elAvisoEnVivo(m, fila) {
    const ts = m.en;
    return {
        remoteJid: CLIENTA.jid,
        instanceName: NEGOCIO.linea,
        message: {
            id: idDelMensaje(m),
            fromMe: m.de === "ia",
            content: fila.content,
            messageType: fila.messageType,
            pushName: m.de === "ia" ? null : CLIENTA.nombreDeWhatsapp,
            ts,
        },
        ts,
    };
}

/**
 * Lo que el contacto está haciendo —«escribiendo…», «grabando audio…»—, como
 * lo manda el backend por socket.io (`chat:presence`, `ChatPresencePayload`).
 * Así el panel lo enseña a la vez que el celular y WhatsApp Web. `ts` va con el
 * reloj de la HISTORIA (el del navegador), no con el de la máquina. Pura.
 */
export function laPresencia(presence, ts) {
    if (!["escribiendo", "grabando", "en_linea", "nada"].includes(presence)) throw new Error(`[video] presencia desconocida: ${presence}`);
    return { remoteJid: CLIENTA.jid, instanceName: NEGOCIO.linea, presence, lastSeen: null, ts };
}

/**
 * El simulador. `ctx` es lo que devuelve la siembra (la cuenta, el embudo y sus
 * etapas, las etiquetas y el servicio); `embudos`, el módulo compilado de
 * `lib/embudos-db.ts`, que es el que mueve una conversación de etapa en la App.
 */
/**
 * La hora de la HISTORIA en la posición del embudo. `moverConversacion` sella
 * `actualizadoEn` con `NOW()` del servidor, y el navegador corre con el reloj
 * de la historia (días por delante): sin esto, cada tarjeta del embudo diría
 * «hace 6 días» sobre algo que acaba de pasar.
 */
export async function laHoraDeLaPosicion(db, sessionId, ms) {
    await db.$executeRaw`UPDATE "embudo_posiciones" SET "actualizadoEn" = ${new Date(ms)} WHERE "sessionId" = ${sessionId}`;
}

export function elBackend({ db, embudos, ctx, base, segundos, avisar = () => {} }) {
    const cal = ctx.calendario;
    const mensajes = laConversacion(cal);
    let sesionId = null;
    let seguimientoId = null;
    let recordatorioId = null;
    let citaId = null;

    async function laSesion(m) {
        if (sesionId) return sesionId;
        const s = await db.session.create({
            data: {
                userId: ctx.cuenta,
                remoteJid: CLIENTA.jid,
                pushName: CLIENTA.nombreDeWhatsapp,
                // En `Session` la línea va por su NOMBRE: es con lo que la bandeja
                // empareja la ficha con su conversación (`linea::numero`).
                instanceId: NEGOCIO.linea,
                status: true,
                createdAt: new Date(m.en),
            },
        });
        sesionId = s.id;
        // Toda conversación nueva entra en la primera etapa del embudo.
        await embudos.moverConversacion({ sessionId: sesionId, embudoId: ctx.embudoId, etapaId: ctx.etapas.Nuevo, movidoPorId: ctx.cuenta });
        await laHoraDeLaPosicion(db, sesionId, m.en);
        return sesionId;
    }

    /** Guarda un mensaje de la historia, como lo guarda el webhook. */
    async function llega(id) {
        const m = mensajes.find((x) => x.id === id);
        if (!m) throw new Error(`[video] la historia no tiene el mensaje ${id}`);
        await laSesion(m);
        const fila = comoLoGuardaElWebhook(m, { base, segundos });
        const fromMe = m.de === "ia";
        await db.chatMessage.create({
            data: {
                userId: ctx.cuenta,
                instanceName: NEGOCIO.linea,
                instanceType: "waha",
                remoteJid: CLIENTA.jid,
                messageId: idDelMensaje(m),
                fromMe,
                pushName: fromMe ? null : CLIENTA.nombreDeWhatsapp,
                messageType: fila.messageType,
                content: fila.content,
                mediaUrl: fila.mediaUrl,
                raw: fila.raw,
                messageTimestamp: new Date(m.en),
            },
        });
        const ultimo = {
            lastMessageId: idDelMensaje(m),
            lastMessageFromMe: fromMe,
            lastMessageType: fila.messageType,
            lastMessageContent: fila.content,
            lastMessageMediaUrl: fila.mediaUrl,
            lastMessageRaw: fila.raw,
            lastMessageTimestamp: new Date(m.en),
        };
        const tocadas = await db.chatConversation.updateMany({
            where: { userId: ctx.cuenta, instanceName: NEGOCIO.linea, remoteJid: CLIENTA.jid },
            data: ultimo,
        });
        if (tocadas.count === 0) {
            await db.chatConversation.create({
                data: {
                    userId: ctx.cuenta,
                    instanceName: NEGOCIO.linea,
                    instanceType: "waha",
                    remoteJid: CLIENTA.jid,
                    pushName: CLIENTA.nombreDeWhatsapp,
                    ...ultimo,
                },
            });
        }
        await db.session.update({ where: { id: sesionId }, data: { updatedAt: new Date(m.en) } });
        // Como el webhook: primero se guarda y después se avisa. El aviso sale
        // ANTES de los efectos de la IA, que en producción llegan después.
        avisar("chat:changed", elAvisoEnVivo(m, fila));
        for (const efecto of m.efectos ?? []) await aplicar(efecto, m);
        if (m.seguimiento && seguimientoId) {
            await db.seguimiento.update({ where: { id: seguimientoId }, data: { followUpStatus: "sent" } });
        }
        if (m.recordatorio && recordatorioId) {
            await db.seguimiento.update({ where: { id: recordatorioId }, data: { followUpStatus: "sent" } });
        }
        return m;
    }

    /** Lo que la IA y sus herramientas le hacen al CRM. */
    async function aplicar(efecto, m) {
        if (efecto.ficha) {
            const antes = await db.externalClientData.findUnique({
                where: { userId_remoteJid: { userId: ctx.cuenta, remoteJid: CLIENTA.jid } },
            });
            const data = { ...(antes?.data ?? {}), ...efecto.ficha };
            await db.externalClientData.upsert({
                where: { userId_remoteJid: { userId: ctx.cuenta, remoteJid: CLIENTA.jid } },
                update: { data, source: "ia" },
                create: { userId: ctx.cuenta, remoteJid: CLIENTA.jid, data, source: "ia" },
            });
        }
        if (efecto.etapa) {
            const etapaId = ctx.etapas[efecto.etapa];
            if (!etapaId) throw new Error(`[video] el embudo no tiene la etapa «${efecto.etapa}»`);
            await embudos.moverConversacion({ sessionId: sesionId, embudoId: ctx.embudoId, etapaId, movidoPorId: ctx.cuenta });
            await laHoraDeLaPosicion(db, sesionId, m.en);
        }
        if (efecto.etiqueta) {
            const tagId = ctx.etiquetas[efecto.etiqueta];
            if (!tagId) throw new Error(`[video] no hay etiqueta «${efecto.etiqueta}»`);
            await db.sessionTag.upsert({
                where: { sessionId_tagId: { sessionId: sesionId, tagId } },
                update: {},
                create: { sessionId: sesionId, tagId },
            });
        }
        if (efecto.nombre) {
            await db.session.update({ where: { id: sesionId }, data: { customName: efecto.nombre } });
        }
        if (efecto.calificacion) {
            await db.session.update({
                where: { id: sesionId },
                data: { leadStatus: CALIFICACION[efecto.calificacion], leadStatusUpdatedAt: new Date(m.en) },
            });
        }
        if (efecto.seguimientoProgramado) {
            const s = await db.seguimiento.create({
                data: {
                    idNodo: "seguimiento-ia",
                    instancia: NEGOCIO.linea,
                    remoteJid: CLIENTA.jid,
                    tipo: "seguimiento-text",
                    mensaje: mensajes.find((x) => x.seguimiento)?.texto ?? "",
                    time: new Date(cal.seguimiento).toISOString(),
                    followUpStatus: "pending",
                    followUpMode: "ai",
                },
            });
            seguimientoId = s.id;
        }
        if (efecto.cita) {
            const a = await db.appointment.create({
                data: {
                    userId: ctx.cuenta,
                    sessionId: sesionId,
                    clientName: CLIENTA.nombre,
                    startTime: new Date(cal.cita),
                    endTime: new Date(cal.finDeLaCita),
                    timezone: ZONA,
                    status: "PENDIENTE",
                    serviceId: ctx.servicio,
                },
            });
            citaId = a.id;
            const r = await db.seguimiento.create({
                data: {
                    idNodo: `appt-reminder-${a.id}`,
                    instancia: NEGOCIO.linea,
                    remoteJid: CLIENTA.jid,
                    tipo: "seguimiento-text",
                    mensaje: mensajes.find((x) => x.recordatorio)?.texto ?? "",
                    time: new Date(cal.recordatorio).toISOString(),
                    followUpStatus: "pending",
                    idempotencyKey: `appt-reminder:${a.id}:video`,
                },
            });
            recordatorioId = r.id;
        }
        if (efecto.citaConfirmada && citaId) {
            await db.appointment.update({ where: { id: citaId }, data: { status: "CONFIRMADA" } });
        }
        void m;
    }

    return {
        mensajes,
        llega,
        get sesionId() {
            return sesionId;
        },
        get citaId() {
            return citaId;
        },
    };
}
