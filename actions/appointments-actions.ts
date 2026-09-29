'use server';

import { db } from '@/lib/db';
import { programarLosRecordatoriosDeLaCita } from '@/lib/recordatorios-de-la-cita.server';
import { Appointment, AppointmentStatus } from '@prisma/client';
import { addMinutes, parseISO, isBefore } from 'date-fns';
// El lead de una reserva pública se crea SIN puerta: quien reserva no tiene
// cuenta. `registerSession` —la acción— ya pide sesión (ver
// `lib/leads-sin-puerta.server.ts`).
import { registrarLaSesion } from '@/lib/leads-sin-puerta.server';
import { laCuentaDeLaConversacion } from '@/lib/dueno-del-dato.server';
import { getAuditActorId, writeAuditLog } from './audit-log-actions';
import {
    syncAppointmentToCalendar,
    updateAppointmentCalendarEvent,
    deleteCalendarEvent,
} from './google-calendar-actions';
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';
import { lasCuentasQueConsultaElCrm } from '@/lib/cuentas-del-crm';
import { lasCitasPorEstado } from '@/lib/citas-por-estado.server';
import { laLineaDeLaNotificacionDeCita } from '@/lib/agenda-de-la-familia';
import { comoFranjaNueva, elEstadoAlReagendar, laDuracionDeLaCita } from '@/lib/reagendar-cita';
import { reprogramarLosRecordatoriosDeLaCita } from '@/lib/reagendar-cita.server';
import { dispararLasAutomatizacionesDeCita } from '@/lib/automatizaciones-de-cita.server';

/**
 * Este fichero no tenía **ni una** llamada a `currentUser()`: el `userId` —y en
 * dos casos el `sessionId`— llegaban del navegador y entraban directos al
 * `where`. Es el H02 de siempre: con la sesión de cualquier cuenta y otro id se
 * leía, se cambiaba y se **borraba** la agenda de otra.
 *
 * **`createAppointment` y `getAvailableSlots` se quedan fuera a propósito**: las
 * abre la página pública de reservas (`/schedule/[userId]` y
 * `/api/schedule/...`), que no tiene sesión — comprobar algo ahí las tumbaría
 * enteras, igual que pasa con `getPublicCatalog`.
 */

/** El dueño sale de la FILA, no del navegador. */
async function laCuentaDeLaCita(id: string) {
    const suya = await db.appointment.findUnique({ where: { id }, select: { userId: true } });
    if (!suya?.userId) return null;
    return laCuentaDeLaAccion(suya.userId);
}

// La de la conversación es la compartida (`lib/dueno-del-dato.server.ts`): la
// misma que usan las notas internas, los participantes y asignar un chat.

/**
 * Las cuentas cuyas citas se leen en el tablero de Agenda.
 *
 * **Sin `cuentasPedidas` es la cuenta propia y nada más**, que es lo que estas
 * lecturas devolvían siempre: así cualquier otro llamador sigue viendo lo
 * suyo. El tablero de Agenda pasa la lista del filtro —la que resolvió
 * `resolverLasCuentasDelCrm` en la página— y entonces se re-resuelve con la
 * MISMA puerta del CRM (`lasCuentasQueConsultaElCrm`): lo propio y lo que
 * cuelga HACIA ABAJO, nunca la madre ni las hermanas. Una acción de servidor
 * ES un endpoint: la lista que llega del navegador no decide a qué se llega.
 */
async function lasCuentasDeLaAgenda(
    userId: string,
    cuentasPedidas?: readonly string[] | null,
): Promise<string[] | null> {
    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return null;
    if (cuentasPedidas === undefined || cuentasPedidas === null) return [cuenta];
    return lasCuentasQueConsultaElCrm(cuenta, cuentasPedidas);
}

interface AppointmentOperationResponse {
    success: boolean;
    message: string;
    data?: Appointment | Appointment[];
    seguimientosCount?: Record<string, number>;
}

interface CreateAppointmentInput {
    userId: string;
    sessionId?: number;
    pushName: string;
    phone: string;
    instanceName: string;
    startTime: string;
    endTime: string;
    timezone: string;
    serviceId: string;
}

//Obtener citas por usuario (Asesor)
export async function getAppointmentsByUser(
    userId: string,
    cuentasPedidas?: string[] | null,
): Promise<AppointmentOperationResponse> {
    try {
        const cuentas = await lasCuentasDeLaAgenda(userId, cuentasPedidas);
        if (!cuentas) return { success: false, message: 'No autorizado.' };

        const list = await db.appointment.findMany({
            where: { userId: { in: cuentas } },
            include: {
                session: {
                    include: {
                        sessionTags: { include: { tag: { select: { id: true, name: true, color: true } } } },
                    },
                },
                service: true,
            },
            orderBy: { startTime: 'asc' },
        });

        let seguimientosCount: Record<string, number> = {};
        try {
            const jids = list.map(a => a.session.remoteJid).filter(Boolean);
            if (jids.length) {
                const rows = await db.seguimiento.findMany({
                    where: { remoteJid: { in: jids }, followUpStatus: 'pending' },
                    select: { remoteJid: true },
                });
                for (const r of rows) {
                    if (r.remoteJid) seguimientosCount[r.remoteJid] = (seguimientosCount[r.remoteJid] ?? 0) + 1;
                }
            }
        } catch (segErr) {
            console.error('Error cargando seguimientos:', segErr);
        }

        return {
            success: true,
            message: 'Citas obtenidas correctamente.',
            data: list,
            seguimientosCount,
        };
    } catch (error) {
        console.error('Error al obtener citas:', error);
        return {
            success: false,
            message: 'Error al obtener las citas.',
        };
    }
}

//Crear una cita
export async function createAppointment(input: CreateAppointmentInput): Promise<AppointmentOperationResponse> {
    const {
        userId,
        sessionId: requestedSessionId,
        pushName,
        phone,
        instanceName,
        startTime,
        endTime,
        timezone,
        serviceId,
    } = input;
    const normalizedPushName = pushName.trim();

    if (!userId || !normalizedPushName || !phone || !instanceName || !startTime || !endTime || !timezone || !serviceId) {
        return {
            success: false,
            message: 'Faltan campos requeridos.',
        };
    }

    const start = parseISO(startTime);
    const end = parseISO(endTime);
    if (isBefore(end, start)) {
        return {
            success: false,
            message: 'La hora final no puede ser menor a la hora inicial.',
        };
    }

    try {
        // El servicio debe existir y pertenecer a la cuenta; si no, el create
        // fallaría con un error de clave foránea genérico. Avisamos claro.
        const service = await db.service.findFirst({
            where: { id: serviceId, userId },
            select: { id: true },
        });
        if (!service) {
            return {
                success: false,
                message: 'El servicio seleccionado ya no existe. Actualiza la página y vuelve a elegirlo.',
            };
        }

        // Validar tiempo mínimo de anticipación
        const userNotice = await db.user.findUnique({ where: { id: userId }, select: { minNoticeMinutes: true } });
        if (userNotice && userNotice.minNoticeMinutes > 0) {
            const earliestAllowed = addMinutes(new Date(), userNotice.minNoticeMinutes);
            if (isBefore(start, earliestAllowed)) {
                return { success: false, message: `Debes agendar con al menos ${userNotice.minNoticeMinutes} minutos de anticipación.` };
            }
        }
        let sessionId = requestedSessionId;

        if (sessionId) {
            const existingSession = await db.session.findFirst({
                where: {
                    id: sessionId,
                    userId,
                },
                select: {
                    id: true,
                    pushName: true,
                },
            });

            if (!existingSession) {
                return {
                    success: false,
                    message: 'No se encontr\u00f3 la sesi\u00f3n asociada a la cita.',
                };
            }

            if ((existingSession.pushName ?? '').trim() !== normalizedPushName) {
                await db.session.update({
                    where: { id: existingSession.id },
                    data: {
                        pushName: normalizedPushName,
                    },
                });
            }
        } else {
            const register = await registrarLaSesion({
                userId,
                remoteJid: phone,
                pushName: normalizedPushName,
                instanceId: instanceName,
            });

            if (!register.success || !register.data) {
                return {
                    success: false,
                    message: register.message || 'Error al registrar sesi\u00f3n.',
                };
            }

            sessionId = register.data.id;
        }

        // Serializa las citas concurrentes del MISMO usuario con un advisory lock por
        // transacción (se libera automáticamente al hacer commit/rollback). Evita el
        // doble agendamiento sin constraint de BD ni migración: una 2ª solicitud
        // simultánea espera a que la 1ª haga commit y entonces su verificación de
        // solape ya ve la cita recién creada. Citas de otros usuarios no se bloquean.
        const created = await db.$transaction(async (tx) => {
            // Candado anti-doble-reserva. Usamos $executeRaw (NO $queryRaw): la
            // función devuelve `void` y $queryRaw fallaba al deserializar el
            // resultado (error P2010). Si el candado no está disponible, seguimos
            // igual: la verificación de solape de abajo ya protege del doble
            // agendamiento en el caso normal.
            try {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appt:${userId}`}))`;
            } catch (lockErr) {
                console.warn('[createAppointment] advisory lock no disponible, continúo sin él:', lockErr);
            }

            const overlap = await tx.appointment.findFirst({
                where: {
                    userId,
                    status: { in: ['PENDIENTE', 'CONFIRMADA', 'ATENDIDA'] },
                    OR: [
                        {
                            startTime: {
                                lt: end,
                            },
                            endTime: {
                                gt: start,
                            },
                        },
                    ],
                },
            });

            if (overlap) return null;

            return tx.appointment.create({
                data: {
                    userId,
                    sessionId,
                    clientName: normalizedPushName,
                    startTime: start,
                    endTime: end,
                    timezone,
                    status: AppointmentStatus.PENDIENTE,
                    serviceId,
                },
            });
        });

        if (!created) {
            return {
                success: false,
                message: 'Ya existe una cita registrada en ese horario.',
            };
        }

        await writeAuditLog({
            userId,
            actorId: await getAuditActorId(),
            entityType: 'appointment',
            entityId: created.id,
            action: 'created',
            summary: `Creo cita para ${normalizedPushName}`,
            metadata: {
                sessionId,
                status: created.status,
                startTime: created.startTime.toISOString(),
                endTime: created.endTime.toISOString(),
                serviceId,
            },
        });

        // Sincronizar con Google Calendar (fire-and-forget: no bloquea ni rompe la cita).
        void syncAppointmentToCalendar(created.id).catch(() => {});

        // Los recordatorios de la agenda, en el MISMO sitio para los tres
        // caminos que crean una cita —el chat, el agente y la página pública—.
        // Antes solo los dos últimos los programaban, cada uno a su manera, y
        // una cita agendada desde el chat quedaba sin ninguno. Nunca lanza.
        const recordatorios = await programarLosRecordatoriosDeLaCita(created.id);
        if (recordatorios.motivo) {
            console.warn('[createAppointment] la cita quedó sin recordatorios', { citaId: created.id, motivo: recordatorios.motivo });
        }

        return {
            success: true,
            message: 'Cita creada exitosamente.',
            data: created,
        };
    } catch (error) {
        console.error('Error al crear la cita:', error);
        // Mensaje específico según el tipo de error para poder diagnosticar sin logs.
        const code = (error as { code?: string })?.code;
        let message = 'Error al crear la cita.';
        if (code === 'P2003') {
            message = 'El servicio o el contacto de la cita ya no existe. Actualiza la página y vuelve a intentarlo.';
        } else if (code === 'P2002') {
            message = 'Ya existe una cita con esos datos.';
        } else if (code) {
            message = `Error al crear la cita (${code}).`;
        } else {
            const raw = error instanceof Error ? error.message : String(error);
            if (raw) message = `Error al crear la cita: ${raw.slice(0, 140)}`;
        }
        return { success: false, message };
    }
}

//Actualizar estado de cita
/**
 * Avisa al cliente del cambio de estado de su cita.
 *
 * **El aviso sale de la cuenta DUEÑA de la cita**, con su clave y por su línea
 * (`laLineaDeLaNotificacionDeCita`): la de la conversación si es suya, y si no
 * su línea por QR. Nunca de quien pulsa: desde el tablero de la cuenta madre,
 * el aviso de una cita de una hija sale por la línea de la hija.
 *
 * Antes cogía `instancias[0]` a secas —que podía ser un canal de Meta o de
 * Telegram— y exigía la clave de Evolution, así que en una cuenta de Waha no
 * salía nunca; y el `catch` era mudo. Ahora devuelve si salió y por qué no.
 */
export async function sendAppointmentStatusNotification(
    appointmentId: string,
    status: AppointmentStatus,
): Promise<{ success: boolean; message: string; instanceName?: string }> {
    if (status === 'FINALIZADO' || status === 'DESCARTADO') {
        return { success: true, message: 'Este estado no se notifica.' };
    }
    try {
        const appt = await db.appointment.findUnique({
            where: { id: appointmentId },
            include: {
                session: true,
                service: true,
                user: {
                    select: {
                        apiKey: { select: { url: true, key: true } },
                        instancias: {
                            orderBy: { id: 'asc' },
                            select: { instanceName: true, instanceType: true },
                        },
                    },
                },
            },
        });
        if (!appt) return { success: false, message: 'La cita ya no existe.' };
        if (!(await laCuentaDeLaAccion(appt.userId))) return { success: false, message: 'No autorizado.' };

        const { esLineaDeWhatsappQr } = await import('@/lib/linea-de-whatsapp');
        const instanceName = laLineaDeLaNotificacionDeCita({
            lineaDeLaConversacion: appt.session?.instanceId,
            lineasDeLaDuena: (appt.user?.instancias ?? []).map((i) => ({
                instanceName: i.instanceName,
                esQr: esLineaDeWhatsappQr(i.instanceType),
            })),
        });
        if (!instanceName) {
            console.warn('[agenda] la cuenta dueña de la cita no tiene línea por la que avisar', {
                cita: appointmentId,
                cuenta: appt.userId,
            });
            return { success: false, message: 'La cuenta de esta cita no tiene una línea de WhatsApp conectada.' };
        }

        const { buildStatusOwnerMessage } = await import('@/app/(root)/schedule/helpers/buildStatusOwnerMessage');
        const { enviarConHistorial: sendMessageWithHistoryAction } = await import('@/lib/envio-con-historial.server');

        const message = buildStatusOwnerMessage({
            appointment: appt as unknown as import('@/app/(root)/schedule/helpers/normalizeAppointmentsToEvents').AppointmentWithSession,
            newStatus: status,
            userId: appt.userId,
        });

        // La clave de Evolution es la de la DUEÑA. En Waha y Meta no hace falta:
        // `sendMessageWithHistoryAction` resuelve el proveedor por la línea.
        const apiKeyUrl = appt.user?.apiKey?.url;
        const apiKeyValue = appt.user?.apiKey?.key;
        const result = await sendMessageWithHistoryAction({
            instanceName,
            url: apiKeyUrl ? `https://${apiKeyUrl}/message/sendText/${instanceName}` : undefined,
            apikey: apiKeyValue ?? undefined,
            remoteJid: appt.session.remoteJid,
            message,
            historyType: 'notification',
            additionalKwargs: { source: 'AgendaStatusChange', appointmentId, nextStatus: status },
        });

        if (!result.success) {
            console.warn('[agenda] no salió el aviso de cambio de estado', {
                cita: appointmentId,
                cuenta: appt.userId,
                linea: instanceName,
                motivo: result.message,
            });
            return { success: false, message: result.message || 'No se envió la notificación.', instanceName };
        }
        return { success: true, message: 'Notificación enviada.', instanceName };
    } catch (error) {
        console.error('[agenda] fallo al avisar del cambio de estado', {
            cita: appointmentId,
            error: error instanceof Error ? error.message : String(error),
        });
        return { success: false, message: 'Ocurrió un error al notificar la cita.' };
    }
}

/** Las automatizaciones de un estado: la MISMA función que Multiagenda. */
const triggerApptAutomations = dispararLasAutomatizacionesDeCita;

export async function updateAppointmentStatus(
    id: string,
    status: AppointmentStatus
): Promise<AppointmentOperationResponse> {
    try {
        if (!(await laCuentaDeLaCita(id))) {
            return { success: false, message: 'No autorizado.' };
        }

        const updated = await db.appointment.update({
            where: { id },
            data: { status },
            include: { session: true },
        });

        void triggerApptAutomations(updated.sessionId, status);

        // Al cancelar, quitar el evento de Google Calendar (y limpiar el eventId).
        if (status === 'CANCELADA' && (updated as any).googleEventId) {
            const eventId = (updated as any).googleEventId as string;
            void deleteCalendarEvent(updated.userId, eventId)
                .then(() => db.appointment.update({ where: { id }, data: { googleEventId: null } as any }))
                .catch(() => {});
        }

        await writeAuditLog({
            userId: updated.userId,
            actorId: await getAuditActorId(),
            entityType: 'appointment',
            entityId: id,
            action: 'status_changed',
            summary: `Cambio la cita a ${status}`,
            metadata: {
                status,
                sessionId: updated.sessionId,
            },
        });

        // Al cancelar: borrar seguimientos de la cita (appt-confirm-*, appt-reminder-*)
        // y los legacy reminder-* que correspondan a plantillas isSchedule=true de este usuario.
        if (status === 'CANCELADA') {
            const instancia = updated.session?.instanceId;
            const remoteJid = updated.session?.remoteJid;
            if (instancia && remoteJid) {
                // Formato nuevo: appt-reminder-{id} — identificación directa sin ambigüedad
                // Formato legacy: reminder-{id} — buscar cuáles pertenecen a esta cita
                // mediante reverse-lookup: extraer IDs de los seguimientos existentes
                // y verificar que su Reminders padre tenga isSchedule=true para este usuario.
                const legacyReminderSeguimientos = await db.seguimiento.findMany({
                    where: { instancia, remoteJid, idNodo: { startsWith: 'reminder-' } },
                    select: { idNodo: true },
                });
                const candidateIds = legacyReminderSeguimientos
                    .map((s) => s.idNodo?.replace(/^reminder-/, '') ?? '')
                    .filter(Boolean);
                const validLegacyIds = candidateIds.length > 0
                    ? (await db.reminders.findMany({
                        where: { id: { in: candidateIds }, userId: updated.userId, isSchedule: true },
                        select: { id: true },
                      })).map((r) => `reminder-${r.id}`)
                    : [];

                const orFilter = [
                    { idNodo: null },
                    { idNodo: "" },                                // registros viejos con idNodo vacío
                    { idNodo: { startsWith: 'appt-confirm-' } },
                    { idNodo: { startsWith: 'appt-reminder-' } },
                    ...(validLegacyIds.length > 0 ? [{ idNodo: { in: validLegacyIds } }] : []),
                ];
                await db.seguimiento.deleteMany({
                    where: { instancia, remoteJid, OR: orFilter },
                });
            }
        }

        return {
            success: true,
            message: 'Estado actualizado correctamente.',
            data: updated,
        };
    } catch (error) {
        console.error('Error al actualizar estado de la cita:', error);
        return {
            success: false,
            message: 'No se pudo actualizar el estado.',
        };
    }
}

export async function updateAppointmentDetails(
    id: string,
    data: { startTime?: string; endTime?: string; serviceId?: string; timezone?: string }
): Promise<AppointmentOperationResponse> {
    try {
        if (!(await laCuentaDeLaCita(id))) {
            return { success: false, message: 'No autorizado.' };
        }

        const updateData: Record<string, unknown> = {};
        if (data.startTime) updateData.startTime = new Date(data.startTime);
        if (data.endTime) updateData.endTime = new Date(data.endTime);
        if (data.serviceId) updateData.serviceId = data.serviceId;
        if (data.timezone) updateData.timezone = data.timezone;

        const updated = await db.appointment.update({
            where: { id },
            data: updateData,
            include: { service: { select: { name: true } } },
        });
        await writeAuditLog({
            userId: updated.userId,
            actorId: await getAuditActorId(),
            entityType: 'appointment',
            entityId: id,
            action: 'updated',
            summary: 'Actualizo los datos de la cita',
            metadata: {
                fields: Object.keys(updateData),
                startTime: updated.startTime.toISOString(),
                endTime: updated.endTime.toISOString(),
                serviceId: updated.serviceId,
            },
        });

        // Mover la cita en el tiempo rehace sus recordatorios, igual que
        // reagendar: sin esto al cliente le llegarían los de la hora vieja.
        if (data.startTime) {
            try {
                await reprogramarLosRecordatoriosDeLaCita(id);
            } catch (error) {
                console.error('[reagendar] no se pudieron reprogramar los recordatorios al editar la cita', { id, error });
            }
        }

        // Reflejar la reprogramación/cambio de servicio en Google Calendar.
        void updateAppointmentCalendarEvent(id).catch(() => {});

        return { success: true, message: 'Cita actualizada correctamente.', data: updated };
    } catch (error) {
        console.error('Error al actualizar cita:', error);
        return { success: false, message: 'Error al actualizar la cita.' };
    }
}

/**
 * Lo que el selector de «Reagendar» necesita saber de una cita: de qué cuenta
 * es (los huecos libres son los de SU agenda, no los de quien mira), en qué
 * zona se pintan las horas y cuánto dura —reagendar conserva la duración—.
 */
export async function datosParaReagendarAction(id: string): Promise<{
    success: boolean;
    message?: string;
    data?: {
        cuentaId: string;
        zona: string;
        duracionMinutos: number;
        inicio: string;
        fin: string;
        cliente: string;
        estado: AppointmentStatus;
    };
}> {
    try {
        if (!(await laCuentaDeLaCita(id))) return { success: false, message: 'No autorizado.' };
        const cita = await db.appointment.findUnique({
            where: { id },
            select: {
                userId: true,
                startTime: true,
                endTime: true,
                status: true,
                clientName: true,
                timezone: true,
                session: { select: { pushName: true } },
                user: { select: { timezone: true, meetingDuration: true } },
            },
        });
        if (!cita) return { success: false, message: 'La cita ya no existe.' };
        return {
            success: true,
            data: {
                cuentaId: cita.userId,
                zona: cita.user?.timezone || cita.timezone || 'America/Bogota',
                duracionMinutos: laDuracionDeLaCita(cita.startTime, cita.endTime, cita.user?.meetingDuration || 60),
                inicio: cita.startTime.toISOString(),
                fin: cita.endTime.toISOString(),
                cliente: (cita.clientName || cita.session?.pushName || '').trim(),
                estado: cita.status,
            },
        };
    } catch (error) {
        console.error('[reagendar] no se pudieron leer los datos de la cita', { id, error });
        return { success: false, message: 'No se pudo abrir la cita para reagendarla.' };
    }
}

/**
 * Reagendar: la MISMA cita a otra fecha y hora. Ver `lib/reagendar-cita.ts`.
 *
 * Se guarda la nueva franja en la fila que ya existe —su historial, su evento
 * de Google Calendar y su conversación se quedan—, se comprueba que no pise
 * otra cita de la cuenta (la misma comprobación que al agendar, sin contarse a
 * sí misma), y se rehacen sus recordatorios desde la nueva hora.
 */
export async function reagendarCitaAction(
    id: string,
    startTime: string,
    endTime: string,
): Promise<{
    success: boolean;
    message: string;
    data?: Appointment;
    recordatorios?: { borrados: number; creados: number; motivo?: string };
}> {
    try {
        if (!(await laCuentaDeLaCita(id))) {
            return { success: false, message: 'No autorizado.' };
        }
        const actual = await db.appointment.findUnique({
            where: { id },
            select: { userId: true, startTime: true, endTime: true, status: true },
        });
        if (!actual) return { success: false, message: 'La cita ya no existe.' };

        const nueva = comoFranjaNueva(startTime, endTime, { inicio: actual.startTime, fin: actual.endTime });
        if (!nueva.ok) return { success: false, message: nueva.motivo };
        const { inicio, fin } = nueva.franja;
        const estado = elEstadoAlReagendar(actual.status);

        // El mismo candado y la misma comprobación de solape que al agendar:
        // dos reagendamientos a la vez no pueden caer en el mismo hueco.
        const updated = await db.$transaction(async (tx) => {
            try {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appt:${actual.userId}`}))`;
            } catch (lockErr) {
                console.warn('[reagendar] advisory lock no disponible, continúo sin él:', lockErr);
            }
            const pisa = await tx.appointment.findFirst({
                where: {
                    userId: actual.userId,
                    id: { not: id },
                    status: { in: ['PENDIENTE', 'CONFIRMADA', 'ATENDIDA'] },
                    startTime: { lt: fin },
                    endTime: { gt: inicio },
                },
                select: { id: true },
            });
            if (pisa) return null;
            return tx.appointment.update({
                where: { id },
                data: { startTime: inicio, endTime: fin, status: estado },
            });
        });

        if (!updated) {
            return { success: false, message: 'Ya existe una cita registrada en ese horario.' };
        }

        await writeAuditLog({
            userId: updated.userId,
            actorId: await getAuditActorId(),
            entityType: 'appointment',
            entityId: id,
            action: 'rescheduled',
            summary: 'Reagendo la cita',
            metadata: {
                antes: { startTime: actual.startTime.toISOString(), endTime: actual.endTime.toISOString(), status: actual.status },
                ahora: { startTime: updated.startTime.toISOString(), endTime: updated.endTime.toISOString(), status: updated.status },
            },
        });

        // Si el estado volvió a Pendiente, corren sus automatizaciones como
        // en cualquier otro cambio de estado.
        if (estado !== actual.status) void triggerApptAutomations(updated.sessionId, estado);

        let recordatorios: { borrados: number; creados: number; motivo?: string };
        try {
            recordatorios = await reprogramarLosRecordatoriosDeLaCita(id);
        } catch (error) {
            console.error('[reagendar] la cita se movió pero no se reprogramaron sus recordatorios', { id, error });
            recordatorios = { borrados: 0, creados: 0, motivo: 'No se pudieron reprogramar los recordatorios.' };
        }

        void updateAppointmentCalendarEvent(id).catch(() => {});

        return {
            success: true,
            message: recordatorios.motivo
                ? `Cita reagendada. ${recordatorios.motivo}`
                : `Cita reagendada. ${recordatorios.creados} recordatorio(s) programado(s).`,
            data: updated,
            recordatorios,
        };
    } catch (error) {
        console.error('[reagendar] error al reagendar la cita', { id, error });
        return { success: false, message: 'No se pudo reagendar la cita.' };
    }
}

//Eliminar una cita
export async function deleteAppointment(id: string): Promise<AppointmentOperationResponse> {
    try {
        if (!(await laCuentaDeLaCita(id))) {
            return { success: false, message: 'No autorizado.' };
        }

        const deleted = await db.appointment.delete({ where: { id } });

        // Quitar el evento de Google Calendar asociado (si lo hay).
        void deleteCalendarEvent(deleted.userId, (deleted as any).googleEventId).catch(() => {});

        await writeAuditLog({
            userId: deleted.userId,
            actorId: await getAuditActorId(),
            entityType: 'appointment',
            entityId: id,
            action: 'deleted',
            summary: 'Elimino la cita',
            metadata: {
                sessionId: deleted.sessionId,
                status: deleted.status,
                startTime: deleted.startTime.toISOString(),
            },
        });

        return {
            success: true,
            message: 'Cita eliminada correctamente.',
        };
    } catch (error) {
        console.error('Error al eliminar la cita:', error);
        return {
            success: false,
            message: 'No se pudo eliminar la cita.',
        };
    }
}

// Configuración de agenda del usuario (timezone, duración, servicios)
export async function getUserScheduleConfig(userId: string): Promise<{
    success: boolean;
    data?: { timezone: string; meetingDuration: number; services: { id: string; name: string }[] };
    message?: string;
}> {
    try {
        const cuenta = await laCuentaDeLaAccion(userId);
        if (!cuenta) return { success: false, message: 'No autorizado.' };

        const [user, services] = await Promise.all([
            db.user.findUnique({
                where: { id: cuenta },
                select: { timezone: true, meetingDuration: true },
            }),
            db.service.findMany({
                where: { userId: cuenta },
                select: { id: true, name: true },
                orderBy: { order: 'asc' },
            }),
        ]);
        return {
            success: true,
            data: {
                timezone: user?.timezone ?? 'America/Bogota',
                meetingDuration: user?.meetingDuration ?? 30,
                services,
            },
        };
    } catch (error) {
        console.error('Error al obtener configuración de agenda:', error);
        return { success: false, message: 'Error al obtener configuración.' };
    }
}

// Obtener la cita más reciente de una sesión
export type SessionAppointmentCard = {
    id: string;
    status: AppointmentStatus;
    startTime: string;
    endTime: string;
    serviceName: string | null;
};

export async function getLatestAppointmentBySession(sessionId: number): Promise<{
    success: boolean;
    data?: SessionAppointmentCard | null;
    message?: string;
}> {
    try {
        if (!(await laCuentaDeLaConversacion(sessionId))) {
            return { success: false, message: 'No autorizado.' };
        }

        const appt = await db.appointment.findFirst({
            where: { sessionId },
            include: { service: { select: { name: true } } },
            orderBy: { startTime: 'desc' },
        });

        return {
            success: true,
            data: appt
                ? {
                      id: appt.id,
                      status: appt.status,
                      startTime: appt.startTime.toISOString(),
                      endTime: appt.endTime.toISOString(),
                      serviceName: appt.service?.name ?? null,
                  }
                : null,
        };
    } catch (error) {
        console.error('Error al obtener cita por sesión:', error);
        return { success: false, message: 'Error al obtener la cita.' };
    }
}

// Obtener todas las citas de una sesión
export async function getAppointmentsBySession(sessionId: number): Promise<{
    success: boolean;
    data?: SessionAppointmentCard[];
    message?: string;
}> {
    try {
        if (!(await laCuentaDeLaConversacion(sessionId))) {
            return { success: false, message: 'No autorizado.' };
        }

        const list = await db.appointment.findMany({
            where: { sessionId },
            include: { service: { select: { name: true } } },
            orderBy: { startTime: 'desc' },
        });

        return {
            success: true,
            data: list.map((a) => ({
                id: a.id,
                status: a.status,
                startTime: a.startTime.toISOString(),
                endTime: a.endTime.toISOString(),
                serviceName: a.service?.name ?? null,
            })),
        };
    } catch (error) {
        console.error('Error al obtener citas por sesión:', error);
        return { success: false, message: 'Error al obtener las citas.' };
    }
}

// Conteos de citas por estado
export async function getAppointmentStatusCounts(
    userId: string,
    cuentasPedidas?: string[] | null,
): Promise<{
    success: boolean;
    data?: { status: AppointmentStatus; count: number }[];
    message?: string;
}> {
    try {
        const cuentas = await lasCuentasDeLaAgenda(userId, cuentasPedidas);
        if (!cuentas) return { success: false, message: 'No autorizado.' };

        // La MISMA consulta que el numerito de Agenda en el menú.
        return { success: true, data: await lasCitasPorEstado(cuentas) };
    } catch (error) {
        console.error('Error al obtener conteos de citas:', error);
        return { success: false, message: 'Error al obtener conteos.' };
    }
}

// Tipo para el Kanban de agenda
export type AgendaKanbanCard = {
    id: string;
    status: AppointmentStatus;
    startTime: string;
    endTime: string;
    pushName: string | null;
    remoteJid: string;
    serviceName: string | null;
    tags: { id: number; name: string; color: string | null }[];
    /** La cuenta DUEÑA de la cita, para su insignia y para saber si es ajena. */
    cuentaId: string;
    /** La línea de la conversación: es la llave del color de la insignia. */
    linea: string | null;
};

// Obtener citas para el Kanban
export async function getAppointmentsForKanban(
    userId: string,
    cuentasPedidas?: string[] | null,
): Promise<{
    success: boolean;
    data?: AgendaKanbanCard[];
    message?: string;
}> {
    try {
        const cuentas = await lasCuentasDeLaAgenda(userId, cuentasPedidas);
        if (!cuentas) return { success: false, message: 'No autorizado.' };

        const list = await db.appointment.findMany({
            where: { userId: { in: cuentas } },
            include: {
                session: { select: { pushName: true, remoteJid: true, instanceId: true, sessionTags: { include: { tag: { select: { id: true, name: true, color: true } } } } } },
                service: { select: { name: true } },
            },
            orderBy: { startTime: 'asc' },
        });

        return {
            success: true,
            data: list.map((a) => ({
                id: a.id,
                status: a.status,
                startTime: a.startTime.toISOString(),
                endTime: a.endTime.toISOString(),
                pushName: a.clientName || a.session.pushName,
                remoteJid: a.session.remoteJid,
                serviceName: a.service?.name ?? null,
                tags: a.session.sessionTags.map((st) => ({ id: st.tag.id, name: st.tag.name, color: st.tag.color })),
                cuentaId: a.userId,
                linea: a.session.instanceId || null,
            })),
        };
    } catch (error) {
        console.error('Error al obtener citas para kanban:', error);
        return { success: false, message: 'Error al cargar el tablero.' };
    }
}
