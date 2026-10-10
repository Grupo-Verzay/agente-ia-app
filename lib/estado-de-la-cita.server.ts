import "server-only";

import type { AppointmentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { dispararLasAutomatizacionesDeCita } from "@/lib/automatizaciones-de-cita.server";
import { laLineaDeLaNotificacionDeCita } from "@/lib/agenda-de-la-familia";
import { writeAuditLog } from "@/actions/audit-log-actions";
import { deleteCalendarEvent } from "@/actions/google-calendar-actions";

/**
 * Cambiar el estado de una cita de Agenda con TODO lo que conlleva, sin
 * sesión. Es UNA función y la llaman los dos caminos:
 *
 * - la acción del tablero (`updateAppointmentStatus`), DESPUÉS de su puerta;
 * - el ciclo automático de la cita (`lib/ciclo-de-la-cita.server.ts`), que no
 *   tiene a nadie mirando la pantalla.
 *
 * Con una copia en cada uno, el día que se añada algo al cambio de estado (una
 * limpieza, un aviso) el automático se quedaría atrás sin ningún error.
 *
 * **Aquí no hay puerta**: quien llama ya decidió que puede. Por eso vive en
 * `lib/` y no en `actions/` (un runner de sistema no es una acción).
 */

const CITA = { session: true } as const;
export type CitaConSesion = Prisma.AppointmentGetPayload<{ include: typeof CITA }>;

export type CambioDeEstado = {
    citaId: string;
    estado: AppointmentStatus;
    /**
     * Solo cambia si la cita está en uno de estos estados. Es lo que impide que
     * el reloj pise a una persona: si alguien la marcó Cancelada un segundo
     * antes, el «No asistida» automático no la toca. Sin `desde`, cambia siempre.
     */
    desde?: readonly AppointmentStatus[];
    /** Quién: la persona del tablero, o `null` para el sistema. */
    actorId: string | null;
    resumen?: string;
    metadata?: Record<string, unknown>;
};

export type ResultadoDelCambio = { cambiada: true; cita: CitaConSesion } | { cambiada: false; motivo: string };

export async function cambiarElEstadoDeLaCita(c: CambioDeEstado): Promise<ResultadoDelCambio> {
    if (c.desde) {
        const n = await db.appointment.updateMany({
            where: { id: c.citaId, status: { in: [...c.desde] } },
            data: { status: c.estado },
        });
        if (n.count === 0) return { cambiada: false, motivo: "La cita ya no está en un estado que se pueda cambiar solo." };
    } else {
        await db.appointment.update({ where: { id: c.citaId }, data: { status: c.estado } });
    }
    const cita = await db.appointment.findUnique({ where: { id: c.citaId }, include: CITA });
    if (!cita) return { cambiada: false, motivo: "La cita ya no existe." };

    void dispararLasAutomatizacionesDeCita(cita.sessionId, c.estado);

    // Al cancelar, quitar el evento de Google Calendar (y limpiar el eventId).
    if (c.estado === "CANCELADA" && cita.googleEventId) {
        const eventId = cita.googleEventId;
        void deleteCalendarEvent(cita.userId, eventId)
            .then(() => db.appointment.update({ where: { id: c.citaId }, data: { googleEventId: null } }))
            .catch((error) => console.warn("[agenda] no se pudo quitar el evento de Google al cancelar", { cita: c.citaId, error }));
    }

    await writeAuditLog({
        userId: cita.userId,
        actorId: c.actorId,
        entityType: "appointment",
        entityId: c.citaId,
        action: "status_changed",
        summary: c.resumen ?? `Cambio la cita a ${c.estado}`,
        metadata: { status: c.estado, sessionId: cita.sessionId, ...(c.metadata ?? {}) },
    });

    // Una cita que ya no se va a atender no lleva recordatorios pendientes.
    if (c.estado === "CANCELADA" || c.estado === "DESCARTADO") {
        await quitarLosRecordatoriosDeLaCita(cita).catch((error) =>
            console.warn("[agenda] no se pudieron quitar los recordatorios de la cita", { cita: c.citaId, estado: c.estado, error }),
        );
    }

    return { cambiada: true, cita };
}

/**
 * Borra los seguimientos de la cita: `appt-confirm-*`, `appt-reminder-*` (los
 * de las plantillas y los del ciclo automático), los que la página pública
 * dejó con el `idNodo` vacío y los antiguos `reminder-*` cuya plantilla es de
 * agenda y de esta cuenta.
 */
export async function quitarLosRecordatoriosDeLaCita(cita: Pick<CitaConSesion, "id" | "userId" | "session">): Promise<number> {
    const instancia = cita.session?.instanceId;
    const remoteJid = cita.session?.remoteJid;
    if (!instancia || !remoteJid) return 0;

    // Formato legacy: reminder-{id} — buscar cuáles pertenecen a esta cita
    // mediante reverse-lookup: su Reminders padre tiene isSchedule=true y es de esta cuenta.
    const legacy = await db.seguimiento.findMany({
        where: { instancia, remoteJid, idNodo: { startsWith: "reminder-" } },
        select: { idNodo: true },
    });
    const candidatos = legacy.map((s) => s.idNodo?.replace(/^reminder-/, "") ?? "").filter(Boolean);
    const legacyDeAgenda = candidatos.length
        ? (
              await db.reminders.findMany({
                  where: { id: { in: candidatos }, userId: cita.userId, isSchedule: true },
                  select: { id: true },
              })
          ).map((r) => `reminder-${r.id}`)
        : [];

    const borrados = await db.seguimiento.deleteMany({
        where: {
            OR: [
                { idempotencyKey: { startsWith: `appt-reminder:${cita.id}:` } },
                {
                    instancia,
                    remoteJid,
                    OR: [
                        { idNodo: null },
                        { idNodo: "" }, // registros viejos con idNodo vacío
                        { idNodo: { startsWith: "appt-confirm-" } },
                        { idNodo: { startsWith: "appt-reminder-" } },
                        ...(legacyDeAgenda.length > 0 ? [{ idNodo: { in: legacyDeAgenda } }] : []),
                    ],
                },
            ],
        },
    });
    return borrados.count;
}

/* ── Los avisos ────────────────────────────────────────────────────────── */

export type ResultadoDelAviso = { success: boolean; message: string; instanceName?: string };

/** La línea por la que se avisa de una cita: la de su conversación si es de la cuenta, si no su línea por QR. */
async function laLineaDeLaCita(citaId: string) {
    const cita = await db.appointment.findUnique({
        where: { id: citaId },
        include: {
            session: true,
            service: true,
            user: {
                select: {
                    apiKey: { select: { url: true, key: true } },
                    instancias: { orderBy: { id: "asc" }, select: { instanceName: true, instanceType: true } },
                },
            },
        },
    });
    if (!cita) return null;
    const { esLineaDeWhatsappQr } = await import("@/lib/linea-de-whatsapp");
    const instanceName = laLineaDeLaNotificacionDeCita({
        lineaDeLaConversacion: cita.session?.instanceId,
        lineasDeLaDuena: (cita.user?.instancias ?? []).map((i) => ({
            instanceName: i.instanceName,
            esQr: esLineaDeWhatsappQr(i.instanceType),
        })),
    });
    const url = cita.user?.apiKey?.url;
    return {
        cita,
        instanceName,
        // La clave de Evolution es la de la DUEÑA. En Waha y Meta no hace falta:
        // `enviarConHistorial` resuelve el proveedor por la línea.
        url: url && instanceName ? `https://${url}/message/sendText/${instanceName}` : undefined,
        apikey: cita.user?.apiKey?.key ?? undefined,
    };
}

/**
 * El aviso al CLIENTE del nuevo estado (el texto de `buildStatusOwnerMessage`).
 * Finalizado y Descartado no se avisan. Nunca lanza; dice si salió y por qué no.
 */
export async function avisarAlClienteDelEstado(citaId: string, estado: AppointmentStatus): Promise<ResultadoDelAviso> {
    if (estado === "FINALIZADO" || estado === "DESCARTADO") {
        return { success: true, message: "Este estado no se notifica." };
    }
    try {
        const linea = await laLineaDeLaCita(citaId);
        if (!linea) return { success: false, message: "La cita ya no existe." };
        const { cita, instanceName } = linea;
        if (!instanceName) {
            console.warn("[agenda] la cuenta dueña de la cita no tiene línea por la que avisar", { cita: citaId, cuenta: cita.userId });
            return { success: false, message: "La cuenta de esta cita no tiene una línea de WhatsApp conectada." };
        }

        const { buildStatusOwnerMessage } = await import("@/app/(root)/schedule/helpers/buildStatusOwnerMessage");
        const { enviarConHistorial } = await import("@/lib/envio-con-historial.server");

        const message = buildStatusOwnerMessage({
            appointment: cita as unknown as import("@/app/(root)/schedule/helpers/normalizeAppointmentsToEvents").AppointmentWithSession,
            newStatus: estado,
            userId: cita.userId,
        });

        const result = await enviarConHistorial({
            instanceName,
            url: linea.url,
            apikey: linea.apikey,
            remoteJid: cita.session.remoteJid,
            message,
            historyType: "notification",
            additionalKwargs: { source: "AgendaStatusChange", appointmentId: citaId, nextStatus: estado },
        });

        if (!result.success) {
            console.warn("[agenda] no salió el aviso de cambio de estado", {
                cita: citaId,
                cuenta: cita.userId,
                linea: instanceName,
                motivo: result.message,
            });
            return { success: false, message: result.message || "No se envió la notificación.", instanceName };
        }
        return { success: true, message: "Notificación enviada.", instanceName };
    } catch (error) {
        console.error("[agenda] fallo al avisar del cambio de estado", {
            cita: citaId,
            error: error instanceof Error ? error.message : String(error),
        });
        return { success: false, message: "Ocurrió un error al notificar la cita." };
    }
}

/** Un mensaje libre al cliente de la cita, por la línea de la cita. */
export async function escribirleAlCliente(citaId: string, texto: string, fuente: string): Promise<ResultadoDelAviso> {
    try {
        const linea = await laLineaDeLaCita(citaId);
        if (!linea?.instanceName || !linea.cita.session?.remoteJid) {
            console.warn("[ciclo-de-la-cita] no hay línea o número para escribirle al cliente", { cita: citaId, fuente });
            return { success: false, message: "La cita no tiene línea o número." };
        }
        const { enviarConHistorial } = await import("@/lib/envio-con-historial.server");
        const r = await enviarConHistorial({
            instanceName: linea.instanceName,
            url: linea.url,
            apikey: linea.apikey,
            remoteJid: linea.cita.session.remoteJid,
            message: texto,
            historyType: "notification",
            additionalKwargs: { source: fuente, recipient: "client", appointmentId: citaId },
        });
        if (!r.success) console.warn("[ciclo-de-la-cita] no salió el mensaje al cliente", { cita: citaId, fuente, motivo: r.message });
        return { success: r.success, message: r.message || "", instanceName: linea.instanceName };
    } catch (error) {
        console.error("[ciclo-de-la-cita] fallo al escribirle al cliente", { cita: citaId, fuente, error: String(error) });
        return { success: false, message: "Ocurrió un error al escribirle al cliente." };
    }
}

/**
 * Un aviso a la CUENTA (su número de notificaciones y sus contactos de
 * notificación), por la línea de la cita. Devuelve a cuántos les llegó.
 */
export async function avisarALaCuenta(citaId: string, texto: string, fuente: string): Promise<number> {
    try {
        const linea = await laLineaDeLaCita(citaId);
        if (!linea?.instanceName) {
            console.warn("[ciclo-de-la-cita] la cuenta no tiene línea para el aviso", { cita: citaId, fuente });
            return 0;
        }
        const [usuario, contactos] = await Promise.all([
            db.user.findUnique({ where: { id: linea.cita.userId }, select: { notificationNumber: true } }),
            db.userNotificationContact.findMany({ where: { userId: linea.cita.userId }, select: { phone: true } }).catch(() => []),
        ]);
        const telefonos: string[] = [];
        if (usuario?.notificationNumber) telefonos.push(usuario.notificationNumber);
        for (const c of contactos) if (c.phone && !telefonos.includes(c.phone)) telefonos.push(c.phone);
        if (telefonos.length === 0) {
            console.info("[ciclo-de-la-cita] la cuenta no tiene número de notificaciones", { cita: citaId, cuenta: linea.cita.userId });
            return 0;
        }

        const { enviarConHistorial } = await import("@/lib/envio-con-historial.server");
        let llegados = 0;
        await Promise.allSettled(
            telefonos.map(async (telefono) => {
                const destino = telefono.includes("@s.whatsapp.net") ? telefono : `${telefono.replace(/\D/g, "")}@s.whatsapp.net`;
                const r = await enviarConHistorial({
                    instanceName: linea.instanceName as string,
                    url: linea.url,
                    apikey: linea.apikey,
                    remoteJid: destino,
                    message: texto,
                    historyType: "notification",
                    // `recipient: "cuenta"` y no `owner`: con `owner` el texto se
                    // reformatea como «solicitud de asesor» y se pierde el motivo.
                    additionalKwargs: { source: fuente, recipient: "cuenta", appointmentId: citaId },
                });
                if (r.success) llegados++;
                else console.warn("[ciclo-de-la-cita] no llegó el aviso a la cuenta", { cita: citaId, fuente, motivo: r.message });
            }),
        );
        return llegados;
    } catch (error) {
        console.error("[ciclo-de-la-cita] fallo al avisar a la cuenta", { cita: citaId, fuente, error: String(error) });
        return 0;
    }
}
