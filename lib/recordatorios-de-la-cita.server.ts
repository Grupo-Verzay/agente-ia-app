import "server-only";

/**
 * Programa los recordatorios de UNA cita. Es el único sitio que lo hace, y lo
 * llaman los tres caminos de `Appointment`: el chat (por `createAppointment`),
 * el agente de IA y la página pública. Antes el chat no programaba nada: la
 * cita quedaba en la agenda y al cliente no le llegaba ni un recordatorio.
 *
 * Idempotente por `seguimientos.idempotencyKey` (única): llamarla dos veces
 * para la misma cita no duplica. Nunca lanza —la cita ya está guardada y eso
 * manda—, pero tampoco es muda.
 */
import { db } from "@/lib/db";
import { laClaveDelServidorDeLaCuenta } from "@/lib/clave-del-servidor.server";
import { laZonaDeLaCuenta } from "@/lib/zona-de-la-cuenta";
import {
    elNodoDelRecordatorio,
    laLlaveDelRecordatorio,
    losRecordatoriosDeLaCita,
} from "@/lib/recordatorios-de-la-cita";

export type ResultadoDeLosRecordatorios = {
    /** Cuántos recordatorios tiene la cita ahora mismo (nuevos + los que ya estaban). */
    programados: number;
    nuevos: number;
    motivo?: string;
};

/** Con qué servidor y clave sale un mensaje por esa línea. La clave sale de la CUENTA, nunca de fuera. */
export async function lasCredencialesDeLaLinea(
    cuenta: string,
    linea: string,
): Promise<{ serverurl: string; apikey: string }> {
    const fila = await db.instancia.findFirst({
        where: { instanceName: linea, userId: cuenta },
        select: { userId: true, instanceId: true, instanceType: true, metaPhoneNumberId: true, metaAccessToken: true },
    }) ?? await db.instancia.findFirst({
        where: { instanceName: linea },
        select: { userId: true, instanceId: true, instanceType: true, metaPhoneNumberId: true, metaAccessToken: true },
    });

    if (String(fila?.instanceType ?? "").toLowerCase() === "meta") {
        return {
            serverurl: fila?.metaPhoneNumberId || fila?.instanceId || "",
            apikey: fila?.metaAccessToken || fila?.instanceId || "",
        };
    }
    const servidor = await laClaveDelServidorDeLaCuenta(fila?.userId ?? cuenta);
    return { serverurl: servidor?.url ?? "", apikey: servidor?.key ?? fila?.instanceId ?? "" };
}

export async function programarLosRecordatoriosDeLaCita(
    citaId: string,
    ahora: Date = new Date(),
): Promise<ResultadoDeLosRecordatorios> {
    try {
        const cita = await db.appointment.findUnique({
            where: { id: citaId },
            select: {
                id: true,
                userId: true,
                clientName: true,
                startTime: true,
                timezone: true,
                service: { select: { name: true } },
                session: { select: { remoteJid: true, instanceId: true, pushName: true } },
                user: { select: { timezone: true, meetingDuration: true } },
            },
        });
        if (!cita) return { programados: 0, nuevos: 0, motivo: "La cita no existe." };

        const linea = String(cita.session?.instanceId ?? "").trim();
        const remoteJid = String(cita.session?.remoteJid ?? "").trim();
        if (!linea || !remoteJid) {
            console.warn("[recordatorios-de-la-cita] la cita no tiene línea o número", { citaId });
            return { programados: 0, nuevos: 0, motivo: "La cita no tiene línea o número." };
        }

        const plantillas = await db.reminders.findMany({
            where: { userId: cita.userId, isCampaign: false, isSchedule: true },
            select: { id: true, time: true, description: true, title: true },
            orderBy: { id: "asc" },
        });

        const programados = losRecordatoriosDeLaCita(
            plantillas,
            {
                nombreDelCliente: (cita.clientName || cita.session?.pushName || "").trim(),
                inicio: cita.startTime,
                // La zona de la CUENTA; la de la cita solo si la cuenta no tiene.
                zona: laZonaDeLaCuenta(cita.user?.timezone, laZonaDeLaCuenta(cita.timezone)),
                duracionMinutos: cita.user?.meetingDuration || 60,
                servicio: cita.service?.name ?? "",
            },
            ahora,
        );
        if (!programados.length) return { programados: 0, nuevos: 0 };

        const { serverurl, apikey } = await lasCredencialesDeLaLinea(cita.userId, linea);

        let nuevos = 0;
        let hechos = 0;
        for (const r of programados) {
            const llave = laLlaveDelRecordatorio(cita.id, r.plantillaId);
            try {
                const ya = await db.seguimiento.findUnique({ where: { idempotencyKey: llave }, select: { id: true } });
                if (ya) {
                    hechos++;
                    continue;
                }
                await db.seguimiento.create({
                    data: {
                        idNodo: elNodoDelRecordatorio(r.plantillaId),
                        idempotencyKey: llave,
                        serverurl,
                        instancia: linea,
                        apikey,
                        remoteJid,
                        mensaje: r.mensaje,
                        tipo: "text",
                        time: r.cuando,
                    },
                });
                nuevos++;
                hechos++;
            } catch (error) {
                // P2002: otra llamada lo escribió entre la lectura y el insert. Ya está.
                if ((error as { code?: string })?.code === "P2002") {
                    hechos++;
                    continue;
                }
                console.error("[recordatorios-de-la-cita] no se pudo programar un recordatorio", { citaId, plantilla: r.plantillaId, error });
            }
        }
        return { programados: hechos, nuevos };
    } catch (error) {
        console.error("[recordatorios-de-la-cita] no se pudieron programar los recordatorios", { citaId, error });
        return { programados: 0, nuevos: 0, motivo: "No se pudieron programar los recordatorios." };
    }
}
