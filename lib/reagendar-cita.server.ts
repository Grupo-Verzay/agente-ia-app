import "server-only";

import { db } from "@/lib/db";
import { laZonaDeLaCuenta } from "@/lib/zona-de-la-cuenta";
import {
    elNodoDelRecordatorio,
    laLlaveDelRecordatorio,
    losRecordatoriosDeLaCita,
} from "@/lib/recordatorios-de-la-cita";
import { lasCredencialesDeLaLinea } from "@/lib/recordatorios-de-la-cita.server";
import { losNumerosDelCliente } from "@/lib/reagendar-cita";

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
 *
 * Y lo que se programa sale de la MISMA regla que al agendar
 * (`lib/recordatorios-de-la-cita.ts`): la hora del texto en la zona de la
 * CUENTA, el instante en ISO, el `idNodo` `appt-reminder-{plantilla}` y la
 * llave única `appt-reminder:{cita}:{plantilla}`. Con una copia aquí, una cita
 * reagendada recibiría recordatorios distintos de una recién agendada.
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
            status: true,
            timezone: true,
            service: { select: { name: true } },
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

    // La MISMA regla que al agendar: zona de la cuenta, y solo lo que no pasó.
    const programados = losRecordatoriosDeLaCita(
        plantillas.map((p) => ({ id: String(p.id), time: p.time, description: p.description })),
        {
            nombreDelCliente: (cita.clientName || cita.session?.pushName || "").trim(),
            inicio: cita.startTime,
            zona: laZonaDeLaCuenta(cita.user?.timezone, laZonaDeLaCuenta(cita.timezone)),
            duracionMinutos: cita.user?.meetingDuration || 60,
            servicio: cita.service?.name ?? "",
        },
        ahora,
    );

    // La línea y la clave salen de la base, con la misma función que al agendar.
    const { serverurl, apikey } = programados.length
        ? await lasCredencialesDeLaLinea(cita.userId, linea)
        : { serverurl: "", apikey: "" };

    const [borradosPorNumero, borradosPorLlave, creados] = await db.$transaction([
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
        // Los de ESTA cita por su llave, estén bajo el número que estén: la llave
        // es única y un resto la dejaría sin poder volver a programarse.
        db.seguimiento.deleteMany({
            where: { idempotencyKey: { startsWith: `appt-reminder:${cita.id}:` } },
        }),
        db.seguimiento.createMany({
            data: programados.map((r) => ({
                idNodo: elNodoDelRecordatorio(r.plantillaId),
                idempotencyKey: laLlaveDelRecordatorio(cita.id, r.plantillaId),
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
    const borrados = { count: borradosPorNumero.count + borradosPorLlave.count };

    console.info("[reagendar] recordatorios de la cita reprogramados", {
        appointmentId,
        borrados: borrados.count,
        creados: creados.count,
        plantillas: plantillas.length,
        pasados: plantillas.length - programados.length,
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
