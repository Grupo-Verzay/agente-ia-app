"use server"

import { db } from "@/lib/db"
import { whereRecordatoriosDelLead } from "@/lib/registros-del-lead"
import { z } from "zod"
import { formValuesReminderSchema, ReminderDeliverySummary, reminderSchema } from "@/schema/reminder"
import { Prisma, Reminders } from "@prisma/client"
import { laCuentaDeLaAccion } from "@/lib/cuenta-de-la-accion"
import { laClaveDelServidorDeLaCuenta } from "@/lib/clave-del-servidor.server"
import { sinLaClaveDeLaFila } from "@/lib/clave-del-servidor"
import { laHoraParaElMotor } from "@/lib/zona-de-la-cuenta"
import { laZonaHorariaDeLaCuenta } from "@/lib/zona-de-la-cuenta.server"
import { elMensajeDelRecordatorio } from "@/lib/repeticion-del-recordatorio"
import { desdeCuandoSeReprograma, elMensajeDeLaCampana, elPlanDeLaEdicion, elTelefonoDelJid, esUnaCampana, LA_CAMPANA_NO_SE_REPITE, lasHorasEscalonadas, laPausa, losRetrasos } from "@/lib/campanas"

/**
 * Este fichero no tenía **ni una** llamada a `currentUser()`: el `userId` —que
 * en `createReminder` y `updateReminder` sale de un `parse` de Zod, o sea que un
 * barrido por la firma no lo ve— entraba directo al `where` y al `create`.
 *
 * El peor era `getReminderFormDeps`: devolvía **la clave de Evolution** de la
 * cuenta que se le nombrara, con su servidor y sus leads. No es leer de más: es
 * entregar unas credenciales.
 *
 * **Y la clave del servidor no entra ni sale por el navegador.** `apikey` y
 * `serverUrl` llegaban del formulario —la pantalla los recibía hechos, con la
 * clave GLOBAL de Evolution dentro— y se guardaban tal cual. Ahora lo que
 * mande el navegador en esos dos campos se IGNORA y se pone la de la cuenta
 * del recordatorio (`laClaveDelServidorDeLaCuenta`), y todo lo que se devuelve
 * pasa por `sinLaClaveDeLaFila`. Ver `lib/clave-del-servidor.ts`.
 *
 * **`getRemindersByUserId` se queda fuera a propósito**: la abre
 * `/schedule/[userId]`, una página pública —lo dice el middleware— donde no hay
 * sesión que comprobar. Comprobar algo ahí la tumbaría entera, igual que pasa
 * con `getPublicCatalog`.
 */

/** El dueño sale de la FILA, no del navegador. */
async function laCuentaDelRecordatorio(id: string) {
    const suyo = await db.reminders.findUnique({ where: { id }, select: { userId: true } })
    if (!suyo?.userId) return null
    return laCuentaDeLaAccion(suyo.userId)
}

// ─── Helpers de campaña ───────────────────────────────────────────────────────


/**
 * La hora del recordatorio para el motor: el reloj de pared que eligió la
 * persona, leído en la zona de la CUENTA y guardado como instante (ISO/UTC).
 *
 * Antes el individual se guardaba como «dd/MM/yyyy HH:mm» y el motor lo leía
 * SIEMPRE en hora de Colombia, y la campaña se convertía con la zona del
 * servidor: una cuenta de México recibía sus recordatorios una hora antes, y
 * una de España seis horas tarde.
 */
function laHoraDelSeguimiento(timeStr: string, zona: string, segundosDeMas = 0): string {
    return laHoraParaElMotor(timeStr, zona, segundosDeMas);
}

/**
 * `data` va con tipo por parametro. Antes era `unknown` a secas y quien
 * llamaba no podia leer lo que venia dentro sin que TypeScript se quejara
 * -de ahi salian varios errores- ni sabia que esperar sin abrir esta funcion.
 */
export interface ReminderResponse<T = unknown> {
    success: boolean
    message: string
    data?: T
}

/**
 * Crear un nuevo recordatorio
 */
export async function createReminder(formData: formValuesReminderSchema): Promise<ReminderResponse> {
    const parse = reminderSchema.safeParse(formData)

    if (!parse.success) {
        const errors = parse.error.format()
        return {
            success: false,
            message: "Datos inválidos. Corrige los campos requeridos.",
            data: errors,
        }
    }

    const { campaignMinDelay, campaignMaxDelay, media, mediaType, nameFile, esCampana, ...reminderData } = parse.data

    const jids    = (reminderData.remoteJid ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const names   = (reminderData.pushName  ?? '').split(',').map(s => s.trim());
    const baseMsg = reminderData.description || reminderData.title;
    // Lo dice la pantalla desde la que se crea: una campaña de UN contacto se
    // guardaba como recordatorio y desaparecía de Campañas.
    const isCampaign = esUnaCampana(esCampana, jids.length);
    // Una campaña sale una vez: la repetición no la sabe repetir el motor
    // (repetía el texto crudo, sin variables, sin archivo y sin pausa).
    if (isCampaign) reminderData.repeatType = LA_CAMPANA_NO_SE_REPITE;
    if (isCampaign && jids.length === 0) {
        return { success: false, message: "Elige al menos un contacto para la campaña." }
    }
    const seguimientoTipo = media ? `seguimiento-${mediaType ?? "image"}` : "text";

    try {
        const cuenta = await laCuentaDeLaAccion(reminderData.userId)
        if (!cuenta) return { success: false, message: "No autorizado." }

        // La clave con la que el motor manda el mensaje sale de la CUENTA, no
        // del formulario: lo que el navegador mande en `apikey`/`serverUrl` no
        // decide contra qué servidor habla el nuestro.
        const servidor = await laClaveDelServidorDeLaCuenta(cuenta)
        const serverurl = servidor?.url ?? ""
        const apikey = servidor?.key ?? ""
        const zona = await laZonaHorariaDeLaCuenta(cuenta)

        // Crear 1 registro Reminders por campaña o recordatorio
        const reminder = await db.reminders.create({
            data: {
                ...reminderData,
                serverUrl: serverurl || null,
                apikey: apikey || null,
                userId: cuenta,
                isCampaign,
            } as Prisma.RemindersCreateInput,
        });

        if (!isCampaign) {
            // Recordatorio individual — 1 Seguimiento
            await db.seguimiento.create({
                data: {
                    idNodo:    `reminder-${reminder.id}`,
                    serverurl,
                    instancia: reminderData.instanceName ?? "",
                    apikey,
                    remoteJid: reminderData.remoteJid ?? "",
                    mensaje:   elMensajeDelRecordatorio(baseMsg, reminderData.pushName),
                    tipo:      seguimientoTipo,
                    media:     media ?? null,
                    nameFile:  nameFile ?? null,
                    time:      laHoraDelSeguimiento(reminderData.time ?? '', zona),
                    workflowId: reminderData.workflowId ?? null,
                },
            });

            return {
                success: true,
                message: "Recordatorio creado exitosamente.",
                data: sinLaClaveDeLaFila(reminder),
            };
        }

        // Campaña — N Seguimientos individuales con la pausa y variables resueltas
        const retrasos = losRetrasos(jids.length, laPausa(campaignMinDelay, campaignMaxDelay));

        for (let i = 0; i < jids.length; i++) {
            const jid   = jids[i];
            await db.seguimiento.create({
                data: {
                    idNodo:    `camping-${reminder.id}-${i + 1}`,
                    serverurl,
                    instancia: reminderData.instanceName ?? "",
                    apikey,
                    remoteJid: jid,
                    mensaje:   elMensajeDeLaCampana(baseMsg, names[i] ?? '', elTelefonoDelJid(jid)),
                    tipo:      seguimientoTipo,
                    media:     media ?? null,
                    nameFile:  nameFile ?? null,
                    time:      laHoraDelSeguimiento(reminderData.time ?? '', zona, retrasos[i]),
                    workflowId: reminderData.workflowId ?? null,
                },
            });
        }

        return {
            success: true,
            message: `Campaña creada: ${jids.length} mensajes programados.`,
            data: sinLaClaveDeLaFila(reminder),
        }
    } catch (error) {
        console.error("[CREATE_REMINDER]", error)
        return {
            success: false,
            message: "Error al crear el recordatorio.",
        }
    }
}

/**
 * Los recordatorios de la AGENDA de una cuenta: los que se le programan a quien
 * reserva una cita. Esta se queda abierta a propósito y es la que abre
 * `/schedule/[userId]`, que el middleware deja sin sesión.
 *
 * Y es una función aparte, no un parámetro de la de abajo, porque el filtro
 * **es** la puerta: `isSchedule: true` son los que esa pantalla va a programar
 * y nada más. Su hermana devuelve la biblioteca entera de la cuenta —campañas
 * fuera, pero todo lo demás dentro, con sus textos—, y eso no lo tiene que ver
 * quien entra a pedir una cita.
 *
 * Era justo lo que pasaba: la página llamaba a `getRemindersByUserId` y
 * filtraba `isSchedule` **al pintar**, así que lo que viajaba desde el servidor
 * era la lista completa. El filtro vivía un paso después del sitio donde
 * importa.
 */
export async function getScheduleRemindersByUserId(
    userId: string,
): Promise<ReminderResponse<Reminders[]>> {
    if (!userId) {
        return { success: false, message: "El ID del usuario es obligatorio." }
    }

    try {
        const reminders = await db.reminders.findMany({
            where: { userId, isCampaign: false, isSchedule: true },
            orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
        })
        return {
            success: true,
            message: "Recordatorios obtenidos correctamente.",
            // Esta es la que abre la página PÚBLICA: sin la clave, o se la
            // entrega a cualquiera que pida una cita.
            data: reminders.map((r) => sinLaClaveDeLaFila(r)),
        }
    } catch (error) {
        console.error("[GET_SCHEDULE_REMINDERS]", error)
        return { success: false, message: "Error al obtener los recordatorios." }
    }
}

/**
 * Obtener todos los recordatorios de un usuario.
 *
 * Con guarda: esto es la biblioteca entera de la cuenta, con el texto de cada
 * recordatorio dentro. Sin ella, con una sesión cualquiera y otro id se leía
 * la de al lado. Lo que necesita la pantalla pública de reservas es la de
 * arriba.
 */
export async function getRemindersByUserId(userId: string): Promise<ReminderResponse<Reminders[]>> {
    const cuenta = await laCuentaDeLaAccion(userId)
    if (!cuenta) {
        return { success: false, message: "No autorizado." }
    }
    userId = cuenta

    if (!userId) {
        return {
            success: false,
            message: "El ID del usuario es obligatorio.",
        }
    }

    try {
        const reminders = await db.reminders.findMany({
            where: { userId, isCampaign: false },
            orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
        })

        return {
            success: true,
            message: "Recordatorios obtenidos correctamente.",
            data: reminders.map((r) => sinLaClaveDeLaFila(r)),
        }
    } catch (error) {
        console.error("[GET_REMINDERS]", error)
        return {
            success: false,
            message: "Error al obtener los recordatorios.",
        }
    }
}

export async function getCampaignsByUserId(userId: string): Promise<ReminderResponse<Reminders[]>> {
    if (!userId) {
        return {
            success: false,
            message: "El ID del usuario es obligatorio.",
        }
    }

    try {
        const cuenta = await laCuentaDeLaAccion(userId)
        if (!cuenta) return { success: false, message: "No autorizado." }

        const campaigns = await db.reminders.findMany({
            where: { userId: cuenta, isCampaign: true },
            orderBy: { createdAt: 'desc' },
        })

        return {
            success: true,
            message: "Campañas obtenidas correctamente.",
            data: campaigns.map((c) => sinLaClaveDeLaFila(c)),
        }
    } catch (error) {
        console.error("[GET_CAMPAIGNS]", error)
        return {
            success: false,
            message: "Error al obtener las campañas.",
        }
    }
}

const SENT_STATUSES = new Set(["sent", "success", "completed", "done", "delivered"]);
const FAILED_STATUSES = new Set(["failed", "error"]);
const CANCELED_STATUSES = new Set(["canceled", "cancelled", "deleted"]);

function normalizeDeliveryStatus(status: string | null | undefined) {
    return (status ?? "pending").toLowerCase();
}

export async function getReminderDeliverySummaries(
    reminderIds: string[],
): Promise<{ success: boolean; message: string; data?: Record<string, ReminderDeliverySummary> }> {
    const pedidos = reminderIds.filter(Boolean);
    if (pedidos.length === 0) {
        return { success: true, message: "Sin recordatorios.", data: {} };
    }

    try {
        // Una lista que llega de fuera no decide a qué se llega: se **filtra**,
        // no se rechaza entera. Los dueños salen de las filas.
        const filas = await db.reminders.findMany({
            where: { id: { in: pedidos } },
            select: { id: true, userId: true },
        });
        const ids: string[] = [];
        for (const fila of filas) {
            if (fila.userId && (await laCuentaDeLaAccion(fila.userId))) ids.push(fila.id);
        }
        if (ids.length === 0) {
            return { success: true, message: "Sin recordatorios.", data: {} };
        }

        const directIds = ids.map((id) => `reminder-${id}`);
        const campaignPrefixes = ids.map((id) => `camping-${id}-`);

        const rows = await db.seguimiento.findMany({
            where: {
                OR: [
                    { idNodo: { in: directIds } },
                    ...campaignPrefixes.map((prefix) => ({ idNodo: { startsWith: prefix } })),
                ],
            },
            orderBy: { time: "asc" },
            select: {
                id: true,
                idNodo: true,
                remoteJid: true,
                mensaje: true,
                tipo: true,
                time: true,
                followUpStatus: true,
                followUpAttempt: true,
                followUpMaxAttempts: true,
                errorReason: true,
                media: true,
                nameFile: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        const summaries: Record<string, ReminderDeliverySummary> = Object.fromEntries(
            ids.map((id) => [id, { total: 0, pending: 0, sent: 0, failed: 0, canceled: 0, items: [] }])
        );

        for (const row of rows) {
            const reminderId = row.idNodo?.startsWith("reminder-")
                ? row.idNodo.replace("reminder-", "")
                : row.idNodo?.match(/^camping-(.+)-\d+$/)?.[1];
            if (!reminderId || !summaries[reminderId]) continue;

            const status = normalizeDeliveryStatus(row.followUpStatus);
            const summary = summaries[reminderId];
            summary.total += 1;
            if (SENT_STATUSES.has(status)) summary.sent += 1;
            else if (FAILED_STATUSES.has(status)) summary.failed += 1;
            else if (CANCELED_STATUSES.has(status)) summary.canceled += 1;
            else summary.pending += 1;

            summary.items.push({
                id: row.id,
                remoteJid: row.remoteJid,
                mensaje: row.mensaje,
                tipo: row.tipo,
                time: row.time,
                followUpStatus: row.followUpStatus,
                followUpAttempt: row.followUpAttempt,
                followUpMaxAttempts: row.followUpMaxAttempts,
                errorReason: row.errorReason,
                media: row.media,
                nameFile: row.nameFile,
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
            });
        }

        return { success: true, message: "Estados obtenidos correctamente.", data: summaries };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Error al obtener estados de envio.",
        };
    }
}

function reminderSeguimientoWhere(reminderId: string) {
    return {
        OR: [
            { idNodo: `reminder-${reminderId}` },
            { idNodo: { startsWith: `camping-${reminderId}-` } },
        ],
    };
}

/**
 * Vuelve a poner en `pending` los envíos de esos estados, ESCALONADOS desde
 * ahora con la pausa (`lasHorasEscalonadas`). Antes se les ponía a todos la
 * misma hora y salían de golpe: justo lo que la pausa existe para evitar.
 */
async function volverAProgramar(
    reminderId: string,
    estados: string[],
    extra: { followUpAttempt?: number },
): Promise<{ count: number }> {
    const filas = await db.seguimiento.findMany({
        where: { ...reminderSeguimientoWhere(reminderId), followUpStatus: { in: estados } },
        orderBy: { id: "asc" },
        select: { id: true },
    });
    const horas = lasHorasEscalonadas(filas.length, new Date());
    let count = 0;
    for (let i = 0; i < filas.length; i++) {
        const r = await db.seguimiento.updateMany({
            where: { id: filas[i].id, followUpStatus: { in: estados } },
            data: { followUpStatus: "pending", errorReason: null, time: horas[i], ...extra },
        });
        count += r.count;
    }
    return { count };
}

export async function retryReminderFailedDeliveries(reminderId: string): Promise<ReminderResponse> {
    if (!reminderId) return { success: false, message: "ID obligatorio." };

    try {
        if (!(await laCuentaDelRecordatorio(reminderId))) {
            return { success: false, message: "No autorizado." };
        }

        const result = await volverAProgramar(reminderId, ["failed", "error"], { followUpAttempt: 0 });

        return {
            success: true,
            message: result.count > 0 ? `Se reintentaran ${result.count} envio(s).` : "No hay envios fallidos para reintentar.",
            data: { count: result.count },
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Error al reintentar envios.",
        };
    }
}

export async function cancelReminderPendingDeliveries(reminderId: string): Promise<ReminderResponse> {
    if (!reminderId) return { success: false, message: "ID obligatorio." };

    try {
        if (!(await laCuentaDelRecordatorio(reminderId))) {
            return { success: false, message: "No autorizado." };
        }

        const result = await db.seguimiento.updateMany({
            where: {
                ...reminderSeguimientoWhere(reminderId),
                followUpStatus: "pending",
            },
            data: {
                followUpStatus: "canceled",
                errorReason: "Cancelado manualmente",
            },
        });

        return {
            success: true,
            message: result.count > 0 ? `Se pausaron ${result.count} envio(s).` : "No hay envios pendientes para pausar.",
            data: { count: result.count },
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Error al pausar envios.",
        };
    }
}

export async function resumeReminderCanceledDeliveries(reminderId: string): Promise<ReminderResponse> {
    if (!reminderId) return { success: false, message: "ID obligatorio." };

    try {
        if (!(await laCuentaDelRecordatorio(reminderId))) {
            return { success: false, message: "No autorizado." };
        }

        const result = await volverAProgramar(reminderId, ["canceled", "cancelled"], {});

        return {
            success: true,
            message: result.count > 0 ? `Se reanudaron ${result.count} envio(s).` : "No hay envios pausados para reanudar.",
            data: { count: result.count },
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Error al reanudar envios.",
        };
    }
}

/**
 * Eliminar todos los recordatorios de un usuario
 */
export async function deleteAllReminders(userId: string, isCampaign: boolean): Promise<ReminderResponse> {
    if (!userId) {
        return { success: false, message: "El ID del usuario es obligatorio." }
    }

    try {
        const cuenta = await laCuentaDeLaAccion(userId)
        if (!cuenta) return { success: false, message: "No autorizado." }

        // Con sus envíos: sin esto, lo pendiente seguía saliendo después de
        // «Eliminar todos».
        const ids = (await db.reminders.findMany({ where: { userId: cuenta, isCampaign }, select: { id: true } })).map((r) => r.id)
        for (const id of ids) await db.seguimiento.deleteMany({ where: reminderSeguimientoWhere(id) })
        await db.reminders.deleteMany({ where: { userId: cuenta, isCampaign } })
        return { success: true, message: "Todos los registros eliminados correctamente." }
    } catch (error) {
        console.error("[DELETE_ALL_REMINDERS]", error)
        return { success: false, message: "Error al eliminar los registros." }
    }
}

/**
 * Eliminar un recordatorio por su ID
 */
export async function deleteReminder(id: string): Promise<ReminderResponse> {
    if (!id) {
        return {
            success: false,
            message: "El ID del recordatorio es obligatorio.",
        }
    }

    try {
        if (!(await laCuentaDelRecordatorio(id))) {
            return { success: false, message: "No autorizado." }
        }

        await db.reminders.delete({ where: { id } });
        // Eliminar también sus envíos programados. Con `reminder-<id>` a secas
        // se quedaban los `camping-<id>-<n>` de una campaña: se borraba y sus
        // mensajes seguían saliendo.
        await db.seguimiento.deleteMany({ where: reminderSeguimientoWhere(id) });

        return {
            success: true,
            message: "Recordatorio eliminado correctamente.",
        }
    } catch (error) {
        console.error("[DELETE_REMINDER]", error)
        return {
            success: false,
            message: "Error al eliminar el recordatorio.",
        }
    }
}

export type ReminderItem = {
  id: string;
  title: string;
  description: string | null;
  time: string | null;
  repeatType: string | null;
  instanceName: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getRemindersByRemoteJid(
  userId: string,
  remoteJid: string,
): Promise<{ success: boolean; message: string; data?: ReminderItem[] }> {
  try {
    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return { success: false, message: 'No autorizado.' };

    const items = await db.reminders.findMany({
      where: whereRecordatoriosDelLead(cuenta, remoteJid),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        time: true,
        repeatType: true,
        instanceName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      success: true,
      message: 'Recordatorios obtenidos correctamente.',
      data: items.map((r) => ({
        ...r,
        repeatType: r.repeatType as string | null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Error al obtener los recordatorios.',
    };
  }
}

export async function updateReminderBasic(
  id: string,
  data: { title?: string; description?: string; time?: string }
): Promise<ReminderResponse> {
  if (!id) return { success: false, message: "ID obligatorio." };
  try {
    if (!(await laCuentaDelRecordatorio(id))) {
      return { success: false, message: "No autorizado." };
    }

    await db.reminders.update({ where: { id }, data });
    return { success: true, message: "Recordatorio actualizado correctamente." };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Error al actualizar." };
  }
}

/**
 * Actualizar un recordatorio por ID
 */
export async function updateReminder(id: string, formData: formValuesReminderSchema): Promise<ReminderResponse> {
    if (!id) {
        return {
            success: false,
            message: "El ID del recordatorio es obligatorio.",
        }
    }

    const parse = reminderSchema.safeParse(formData)

    if (!parse.success) {
        return {
            success: false,
            message: "Datos inválidos. Corrige los campos requeridos.",
            data: parse.error.format(),
        }
    }

    // `apikey` y `serverUrl` se descartan: los del navegador no deciden nada.
    const { campaignMinDelay, campaignMaxDelay, media, mediaType, nameFile, esCampana: _esCampana, userId: _userId, apikey: _apikey, serverUrl: _serverUrl, ...data } = parse.data

    try {
        const cuenta = await laCuentaDelRecordatorio(id)
        if (!cuenta) {
            return { success: false, message: "No autorizado." }
        }

        const servidor = await laClaveDelServidorDeLaCuenta(cuenta)
        const antes = await db.reminders.findUnique({ where: { id }, select: { isCampaign: true } })
        if (antes?.isCampaign) data.repeatType = LA_CAMPANA_NO_SE_REPITE
        const updated = await db.reminders.update({
            where: { id },
            data: {
                ...data,
                ...(servidor ? { serverUrl: servidor.url, apikey: servidor.key } : {}),
            } as Prisma.RemindersUpdateInput,
        })

        // Si cambió la hora (o el texto) de un recordatorio individual, su envío
        // pendiente se mueve con él: antes se quedaba con la hora vieja, y el
        // cambio de la pantalla no llegaba al cliente.
        if (!updated.isCampaign && !updated.isSchedule && data.time) {
            const zona = await laZonaHorariaDeLaCuenta(cuenta)
            await db.seguimiento.updateMany({
                where: { idNodo: `reminder-${id}`, followUpStatus: "pending" },
                data: {
                    time: laHoraDelSeguimiento(data.time, zona),
                    ...(data.description || data.title
                        ? { mensaje: elMensajeDelRecordatorio(data.description || data.title, updated.pushName) }
                        : {}),
                },
            })
        }

        // Una campaña: lo que todavía no salió (pendiente o pausado) se vuelve a
        // programar con la hora, el mensaje y los contactos nuevos. Antes se
        // quedaba con lo de antes y editar no cambiaba lo que salía.
        if (updated.isCampaign) {
            const zona = await laZonaHorariaDeLaCuenta(cuenta)
            const existentes = await db.seguimiento.findMany({
                where: reminderSeguimientoWhere(id),
                select: { id: true, idNodo: true, remoteJid: true, followUpStatus: true, tipo: true, media: true, nameFile: true },
            })
            const jids = (updated.remoteJid ?? '').split(',').map((j) => j.trim()).filter(Boolean)
            const nombres = (updated.pushName ?? '').split(',').map((n) => n.trim())
            const plan = elPlanDeLaEdicion(id, existentes, jids.map((jid, i) => ({ jid, nombre: nombres[i] ?? '' })))
            const modelo = existentes[0]
            const retrasos = losRetrasos(plan.crear.length, laPausa(campaignMinDelay, campaignMaxDelay))
            const baseMsg = updated.description || updated.title
            const desde = desdeCuandoSeReprograma(laHoraDelSeguimiento(updated.time ?? '', zona), new Date())
            await db.$transaction([
                db.seguimiento.deleteMany({ where: { id: { in: plan.borrar } } }),
                ...plan.crear.map((c, i) => db.seguimiento.create({
                    data: {
                        idNodo: `camping-${id}-${c.numero}`,
                        serverurl: servidor?.url ?? "",
                        instancia: updated.instanceName ?? "",
                        apikey: servidor?.key ?? "",
                        remoteJid: c.jid,
                        mensaje: elMensajeDeLaCampana(baseMsg, c.nombre, elTelefonoDelJid(c.jid)),
                        tipo: media ? `seguimiento-${mediaType ?? "image"}` : (modelo?.tipo ?? "text"),
                        media: media ?? modelo?.media ?? null,
                        nameFile: nameFile ?? modelo?.nameFile ?? null,
                        time: new Date(desde.getTime() + retrasos[i] * 1000).toISOString(),
                        workflowId: updated.workflowId ?? null,
                        ...(c.pausado ? { followUpStatus: "canceled", errorReason: "Cancelado manualmente" } : {}),
                    },
                })),
            ])
        }

        return {
            success: true,
            message: updated.isCampaign ? "Campaña actualizada correctamente." : "Recordatorio actualizado correctamente.",
            data: sinLaClaveDeLaFila(updated),
        }
    } catch (error) {
        console.error("[UPDATE_REMINDER]", error)
        return {
            success: false,
            message: "Error al actualizar el recordatorio.",
        }
    }
}

/**
 * Actualiza el campo order de un recordatorio
 */
export async function updateReminderOrder(reminderId: string, order: number): Promise<{ success: boolean }> {
    try {
        if (!(await laCuentaDelRecordatorio(reminderId))) return { success: false };

        await db.reminders.update({ where: { id: reminderId }, data: { order } });
        return { success: true };
    } catch {
        return { success: false };
    }
}

export async function getReminderFormDeps(userId: string, instanceId: string): Promise<{
    success: boolean
    message?: string
    data?: {
        instanceName: string
        workflows: { id: string; name: string; userId: string; description: string | null; definition: string; status: string; createdAt: Date; updatedAt: Date; order: number }[]
        leads: { id: number; userId: string; remoteJid: string; pushName: string; instanceId: string; status: boolean; leadStatus: string | null }[]
    }
}> {
    try {
        const cuenta = await laCuentaDeLaAccion(userId)
        if (!cuenta) return { success: false, message: 'No autorizado.' }

        // Ya no devuelve la clave del servidor: el recordatorio la pone en el
        // servidor al guardarse (`createReminder`), así que el formulario no
        // tiene por qué tenerla.
        const [instances, workflows, leads] = await Promise.all([
            db.instancia.findMany({ where: { userId: cuenta }, select: { instanceName: true, instanceId: true } }),
            db.workflow.findMany({ where: { userId: cuenta }, orderBy: { name: 'asc' } }),
            db.session.findMany({
                where: { userId: cuenta },
                select: { id: true, userId: true, remoteJid: true, pushName: true, instanceId: true, status: true, leadStatus: true },
                orderBy: { pushName: 'asc' },
                take: 200,
            }),
        ])

        const instance = instances.find(i => i.instanceId === instanceId) ?? instances[0]

        return {
            success: true,
            data: {
                instanceName: instance?.instanceName ?? instanceId,
                workflows: workflows,
                leads: leads,
            },
        }
    } catch (error) {
        console.error('[GET_REMINDER_FORM_DEPS]', error)
        return { success: false, message: 'Error al cargar datos del formulario.' }
    }
}
