import "server-only";

/**
 * Lo que lee la base para que una RESERVA de Multiagenda (`booking_appointments`)
 * se comporte como una cita de Agenda al cambiar de estado y al reagendarla.
 *
 * Una reserva no guarda su conversación (`sessionId`) ni su línea: guarda el
 * teléfono del cliente tal cual llegó. De ahí salen las dos piezas de aquí:
 *
 * - **`laConversacionDeLaReserva`**: la conversación de ese cliente en la
 *   cuenta dueña del equipo, buscada por TODAS las formas del número
 *   (`losNumerosDelCliente`). Es lo que necesitan las automatizaciones —que el
 *   backend ejecuta sobre una conversación— y el aviso al cliente.
 * - **`reprogramarLosRecordatoriosDeLaReserva`**: borra los recordatorios de la
 *   reserva (`booking-reminder-*`, `booking-svc-reminder-*`) y, si sigue viva
 *   —Pendiente o Confirmada—, programa los que tocan desde su hora ACTUAL con la
 *   MISMA regla que al crearla (`losRecordatoriosDeLaReserva`). Cancelar la
 *   llama para quitarlos, y reagendar para rehacerlos: es la simetría exacta de
 *   `reprogramarLosRecordatoriosDeLaCita` de Agenda.
 */
import { db } from "@/lib/db";
import { laZonaDeLaCuenta } from "@/lib/zona-de-la-cuenta";
import { lasCredencialesDeLaLinea } from "@/lib/recordatorios-de-la-cita.server";
import { losNumerosDelCliente, losQueTodaviaNoPasan } from "@/lib/reagendar-cita";
import { laLineaDeLaNotificacionDeCita } from "@/lib/agenda-de-la-familia";
import { esLineaDeWhatsappQr } from "@/lib/linea-de-whatsapp";
import {
    PREFIJOS_DE_RECORDATORIO_DE_RESERVA,
    losRecordatoriosDeLaReserva,
} from "@/lib/recordatorios-de-la-reserva";

export type ConversacionDeLaReserva = {
    id: number;
    instanceId: string;
    remoteJid: string;
    pushName: string | null;
};

/**
 * La conversación del cliente de una reserva, en la cuenta dueña del equipo.
 * Si hay varias (el cliente escribe por dos líneas), la última que se movió.
 * `null` cuando el cliente nunca escribió: entonces no hay automatizaciones que
 * disparar, pero el aviso sí puede salir por la línea de la cuenta.
 */
export async function laConversacionDeLaReserva(
    cuentaId: string,
    telefono: string,
): Promise<ConversacionDeLaReserva | null> {
    const numeros = losNumerosDelCliente(telefono);
    if (!cuentaId || numeros.length === 0) return null;
    const fila = await db.session.findFirst({
        where: {
            userId: cuentaId,
            OR: [{ remoteJid: { in: numeros } }, { remoteJidAlt: { in: numeros } }],
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true, instanceId: true, remoteJid: true, pushName: true },
    });
    if (!fila) return null;
    return { id: fila.id, instanceId: fila.instanceId, remoteJid: fila.remoteJid, pushName: fila.pushName };
}

/** El JID al que se le escribe al cliente: el de su conversación, o su número. */
export function elJidDelCliente(telefono: string, conversacion: ConversacionDeLaReserva | null): string {
    if (conversacion?.remoteJid) return conversacion.remoteJid;
    const texto = String(telefono ?? "").trim();
    if (texto.includes("@")) return texto;
    return `${texto.replace(/\D/g, "")}@s.whatsapp.net`;
}

export type ResultadoDeReprogramarReserva = {
    borrados: number;
    creados: number;
    motivo?: string;
};

export async function reprogramarLosRecordatoriosDeLaReserva(
    reservaId: string,
    ahora: Date = new Date(),
): Promise<ResultadoDeReprogramarReserva> {
    const reserva = await db.bookingAppointment.findUnique({
        where: { id: reservaId },
        select: {
            id: true,
            clientName: true,
            clientPhone: true,
            startTime: true,
            status: true,
            timezone: true,
            teamServiceId: true,
            teamService: { select: { name: true, duration: true, remindersConfig: true } },
            team: {
                select: {
                    userId: true,
                    user: {
                        select: {
                            timezone: true,
                            instancias: { orderBy: { id: "asc" }, select: { instanceName: true, instanceType: true } },
                        },
                    },
                },
            },
        },
    });
    if (!reserva) return { borrados: 0, creados: 0, motivo: "La cita ya no existe." };

    const cuenta = reserva.team.userId;
    const lineas = reserva.team.user?.instancias ?? [];
    const nombresDeLineas = lineas.map((l) => l.instanceName).filter(Boolean);
    const numeros = losNumerosDelCliente(reserva.clientPhone);
    if (numeros.length === 0 || nombresDeLineas.length === 0) {
        console.warn("[multiagenda] la cita no tiene número o la cuenta no tiene líneas: no se reprograman recordatorios", {
            reservaId,
        });
        return { borrados: 0, creados: 0, motivo: "La cita no tiene línea o número de WhatsApp." };
    }

    const filtroDeLosSuyos = {
        instancia: { in: nombresDeLineas },
        remoteJid: { in: numeros },
        OR: PREFIJOS_DE_RECORDATORIO_DE_RESERVA.map((p) => ({ idNodo: { startsWith: p } })),
    };

    // Por qué línea y a qué forma del número salen: la de los que ya tenía
    // (con la que se creó la reserva), y si no, la de su conversación o la
    // línea por QR de la cuenta.
    const previo = await db.seguimiento.findFirst({ where: filtroDeLosSuyos, select: { instancia: true, remoteJid: true } });
    const conversacion = previo ? null : await laConversacionDeLaReserva(cuenta, reserva.clientPhone);
    const linea = laLineaDeLaNotificacionDeCita({
        lineaDeLaConversacion: previo?.instancia ?? conversacion?.instanceId,
        lineasDeLaDuena: lineas.map((l) => ({ instanceName: l.instanceName, esQr: esLineaDeWhatsappQr(l.instanceType) })),
    });
    const remoteJid = previo?.remoteJid || reserva.clientPhone;

    // Una cancelada o terminada no lleva recordatorios: se borran y ya.
    const viva = reserva.status === "PENDIENTE" || reserva.status === "CONFIRMADA";

    const plantillas = viva
        ? await db.reminders.findMany({
              // La misma consulta que la ruta que crea la reserva.
              where: { userId: cuenta, isSchedule: true },
              select: { id: true, time: true, description: true, title: true },
              orderBy: { id: "asc" },
          })
        : [];

    const calculados = viva
        ? losRecordatoriosDeLaReserva(
              {
                  servicioId: reserva.teamServiceId,
                  delServicio: reserva.teamService?.remindersConfig,
                  plantillas,
                  datos: {
                      nombreDelCliente: (reserva.clientName || "").trim(),
                      inicio: reserva.startTime,
                      zona: laZonaDeLaCuenta(reserva.team.user?.timezone, laZonaDeLaCuenta(reserva.timezone)),
                      duracionMinutos: reserva.teamService?.duration ?? 60,
                      servicio: reserva.teamService?.name ?? "",
                  },
              },
              ahora,
          )
        : [];
    const programados = linea ? losQueTodaviaNoPasan(calculados, ahora) : [];
    if (viva && calculados.length && !linea) {
        console.warn("[multiagenda] la cuenta no tiene línea por la que mandar los recordatorios", { reservaId, cuenta });
    }

    const { serverurl, apikey } = programados.length && linea
        ? await lasCredencialesDeLaLinea(cuenta, linea)
        : { serverurl: "", apikey: "" };

    const [borrados, creados] = await db.$transaction([
        db.seguimiento.deleteMany({ where: filtroDeLosSuyos }),
        db.seguimiento.createMany({
            data: programados.map((r) => ({
                idNodo: r.idNodo,
                serverurl,
                instancia: linea as string,
                apikey,
                remoteJid,
                mensaje: r.mensaje,
                tipo: "text",
                time: r.cuando,
            })),
        }),
    ]);

    return {
        borrados: borrados.count,
        creados: creados.count,
        motivo: viva && !linea ? "La cuenta no tiene una línea de WhatsApp conectada." : undefined,
    };
}
