import "server-only";

import { db } from "@/lib/db";
import { laClaveDelServidorDeLaCuenta } from "@/lib/clave-del-servidor.server";
import { getTimezoneFromPhone } from "@/lib/timezones";
import { elDiaElegido, losRecordatoriosDeLaCita, type DatosDeLaCita } from "@/lib/cita-publica";
import { elIdNodoDelRecordatorio, losNumerosDelCliente, losQueTodaviaNoPasan } from "@/lib/reagendar-cita";

/**
 * Rehace los recordatorios de una cita a partir de su hora ACTUAL: borra los
 * que tenga pendientes y programa los de la agenda de la cuenta (los mismos
 * que salen al agendar: 3 horas antes, 1 hora antes… lo que tenga
 * configurado en Agenda › Recordatorios), contados desde la nueva hora.
 *
 * Lo llaman los dos caminos que mueven una cita en el tiempo —reagendar y
 * editar sus datos con otra hora—. Con la reprogramación escrita en cada uno,
 * el día que se afine uno el otro dejaría al cliente recibiendo los
 * recordatorios de la hora vieja.
 *
 * Cuatro cosas que hay que mantener:
 *
 * 1. **Borrar y crear van en UNA transacción.** A medias, o el cliente se
 *    queda sin ningún recordatorio o le llegan los de las dos horas.
 * 2. **Se borran solo los recordatorios de CITA** —los mismos que borra
 *    cancelar: `appt-reminder-*`, los que la página pública deja con el
 *    `idNodo` vacío y los antiguos `reminder-*` de plantillas de agenda—. Los
 *    seguimientos de un flujo, del CRM o la confirmación (`appt-confirm-*`)
 *    no son recordatorios y se quedan.
 * 3. **El número se busca en todas sus formas** (`losNumerosDelCliente`): la
 *    ruta del agente lo guarda como se lo dieron, a veces solo dígitos.
 * 4. **Solo se programan los que todavía no han pasado.**
 */
export type ResultadoDeReprogramar = {
    borrados: number;
    creados: number;
    /** Por qué no se programó nada, cuando no se pudo. */
    motivo?: string;
};

export async function reprogramarLosRecordatoriosDeLaCita(
    appointmentId: string,
    ahora: Date = new Date(),
): Promise<ResultadoDeReprogramar> {
    const cita = await db.appointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            userId: true,
            clientName: true,
            startTime: true,
            endTime: true,
            status: true,
            service: { select: { name: true, messageText: true } },
            session: { select: { remoteJid: true, remoteJidAlt: true, instanceId: true, pushName: true } },
            user: { select: { timezone: true, meetingDuration: true } },
        },
    });
    if (!cita) return { borrados: 0, creados: 0, motivo: "La cita ya no existe." };

    const linea = String(cita.session?.instanceId ?? "").trim();
    const remoteJid = String(cita.session?.remoteJid ?? "").trim();
    if (!linea || !remoteJid) {
        console.warn("[reagendar] la cita no tiene línea o número: no se reprograman recordatorios", {
            appointmentId,
        });
        return { borrados: 0, creados: 0, motivo: "La cita no tiene línea o número de WhatsApp." };
    }

    const numeros = losNumerosDelCliente(remoteJid, cita.session?.remoteJidAlt);

    // Los antiguos `reminder-{id}` solo cuentan si su plantilla es de agenda y
    // de esta cuenta: es la misma comprobación que hace cancelar.
    const antiguos = await db.seguimiento.findMany({
        where: { instancia: linea, remoteJid: { in: numeros }, idNodo: { startsWith: "reminder-" } },
        select: { idNodo: true },
    });
    const candidatos = antiguos.map((s) => s.idNodo?.replace(/^reminder-/, "") ?? "").filter(Boolean);
    const antiguosDeAgenda = candidatos.length
        ? (
              await db.reminders.findMany({
                  where: { id: { in: candidatos }, userId: cita.userId, isSchedule: true },
                  select: { id: true },
              })
          ).map((r) => `reminder-${r.id}`)
        : [];

    // Una cita cancelada o terminada no lleva recordatorios: se borran y no se
    // programan otros. Reagendar la devuelve a Pendiente ANTES de llamar aquí.
    const vivos = cita.status === "PENDIENTE" || cita.status === "CONFIRMADA";

    const plantillas = vivos
        ? await db.reminders.findMany({
              // `isCampaign` admite nulo, y en SQL `NOT (x = true)` con x nulo
              // es nulo: ni `false` a secas ni un `NOT` dejarían pasar las
              // plantillas viejas. Se nombran las dos.
              where: { userId: cita.userId, isSchedule: true, OR: [{ isCampaign: false }, { isCampaign: null }] },
              select: { id: true, description: true, time: true },
              orderBy: { id: "asc" },
          })
        : [];

    const zonaDelDueno = cita.user?.timezone || "America/Bogota";
    const telefono = remoteJid.replace(/@.*/, "").replace(/\D/g, "");
    const datos: DatosDeLaCita = {
        nombreDelCliente: (cita.clientName || cita.session?.pushName || "").trim(),
        telefonoDelCliente: telefono,
        inicio: cita.startTime,
        fin: cita.endTime,
        diaElegido: elDiaElegido(null, cita.startTime, zonaDelDueno),
        zonaDelDueno,
        zonaDelCliente: telefono ? getTimezoneFromPhone(telefono, zonaDelDueno) : zonaDelDueno,
        duracionMinutos: cita.user?.meetingDuration || 60,
        servicio: cita.service,
    };

    // Una por plantilla, para saber de cuál sale cada una (su `idNodo`).
    const calculados = plantillas.flatMap((p) =>
        losRecordatoriosDeLaCita([p], datos).map((r) => ({ ...r, plantillaId: p.id })),
    );
    const programados = losQueTodaviaNoPasan(calculados, ahora);

    // La línea y la clave salen de la base, como al agendar: Meta usa su
    // número y su token; el resto, el servidor de la cuenta dueña.
    let serverurl = "";
    let apikey = "";
    if (programados.length) {
        const instancia = await db.instancia.findFirst({
            where: { userId: cita.userId, instanceName: linea },
            select: { instanceId: true, instanceType: true, metaPhoneNumberId: true, metaAccessToken: true },
        });
        const esMeta = String(instancia?.instanceType ?? "").toLowerCase() === "meta";
        const servidor = await laClaveDelServidorDeLaCuenta(cita.userId);
        if (esMeta) {
            serverurl = instancia?.metaPhoneNumberId || instancia?.instanceId || "";
            apikey = instancia?.metaAccessToken || servidor?.key || instancia?.instanceId || "";
        } else {
            serverurl = servidor?.url ?? "";
            apikey = servidor?.key ?? instancia?.instanceId ?? "";
        }
    }

    const [borrados, creados] = await db.$transaction([
        db.seguimiento.deleteMany({
            where: {
                instancia: linea,
                remoteJid: { in: numeros },
                OR: [
                    { idNodo: null },
                    { idNodo: "" },
                    { idNodo: { startsWith: "appt-reminder-" } },
                    ...(antiguosDeAgenda.length ? [{ idNodo: { in: antiguosDeAgenda } }] : []),
                ],
            },
        }),
        db.seguimiento.createMany({
            data: programados.map((r) => ({
                idNodo: elIdNodoDelRecordatorio(r.plantillaId),
                serverurl,
                instancia: linea,
                apikey,
                remoteJid,
                mensaje: r.mensaje,
                tipo: "text",
                time: r.cuando,
            })),
        }),
    ]);

    console.info("[reagendar] recordatorios de la cita reprogramados", {
        appointmentId,
        borrados: borrados.count,
        creados: creados.count,
        plantillas: plantillas.length,
        pasados: calculados.length - programados.length,
    });

    return {
        borrados: borrados.count,
        creados: creados.count,
        motivo:
            vivos && plantillas.length === 0
                ? "La cuenta no tiene recordatorios configurados en Agenda › Recordatorios."
                : undefined,
    };
}
