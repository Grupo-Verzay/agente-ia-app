import "server-only";
import { elEnlaceDeReunionDeLaCita } from "@/lib/videollamada-ia.server";

import { db } from "@/lib/db";
import { laZonaDeLaCuenta } from "@/lib/zona-de-la-cuenta";
import { laLlaveDelRecordatorio, losRecordatoriosDeLaCita } from "@/lib/recordatorios-de-la-cita";
import { lasCredencialesDeLaLinea } from "@/lib/recordatorios-de-la-cita.server";
import { elIdNodoDelRecordatorio, losNumerosDelCliente, losQueTodaviaNoPasan } from "@/lib/reagendar-cita";
import { losSeguimientosDelCiclo } from "@/lib/ciclo-de-la-cita.server";
import { olvidarElCiclo } from "@/lib/ciclo-de-la-cita-db";

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
 * 5. **Se calculan con la MISMA regla que al agendar** (`losRecordatoriosDeLaCita`
 *    de `lib/recordatorios-de-la-cita.ts`: hora estricta `unidad-valor` y texto
 *    en la zona de la CUENTA) y **llevan la MISMA llave** (`appt-reminder:<cita>:<plantilla>`).
 *    Sin la llave, otra llamada a `programarLosRecordatoriosDeLaCita` sobre la
 *    misma cita no los reconocería y al cliente le llegaría cada uno dos veces.
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

    const datos = {
        nombreDelCliente: (cita.clientName || cita.session?.pushName || "").trim(),
        inicio: cita.startTime,
        zona: laZonaDeLaCuenta(cita.user?.timezone, laZonaDeLaCuenta(cita.timezone)),
        duracionMinutos: cita.user?.meetingDuration || 60,
        servicio: cita.service?.name ?? "",
        enlaceDeReunion: await elEnlaceDeReunionDeLaCita(cita.userId, cita.id),
    };

    // Con el ciclo automático encendido van SUS cuatro recordatorios en vez de
    // las plantillas (la misma decisión que al agendar), y su historia
    // —respuesta, llamada, prórroga— empieza de cero con la nueva hora.
    const delCiclo = vivos ? await losSeguimientosDelCiclo(cita.userId, { citaId: cita.id, ...datos }, ahora) : null;
    if (delCiclo) {
        await olvidarElCiclo(cita.id).catch((error) =>
            console.warn("[reagendar] no se pudo reiniciar el ciclo de la cita", { appointmentId, error: String(error) }),
        );
    }

    // La MISMA regla que al agendar: una sola función decide qué recordatorios
    // lleva una cita y qué dicen, con la hora en la zona de la cuenta.
    const calculados = delCiclo ? [] : losRecordatoriosDeLaCita(plantillas, datos, ahora);
    const programados = losQueTodaviaNoPasan(calculados, ahora);
    const filas = delCiclo
        ? delCiclo
        : programados.map((r) => ({
              idNodo: elIdNodoDelRecordatorio(r.plantillaId),
              idempotencyKey: laLlaveDelRecordatorio(cita.id, r.plantillaId),
              tipo: "text",
              time: r.cuando,
              mensaje: r.mensaje,
          }));

    // La línea y la clave salen de la base, como al agendar (la misma función).
    const { serverurl, apikey } = filas.length
        ? await lasCredencialesDeLaLinea(cita.userId, linea)
        : { serverurl: "", apikey: "" };

    const [borrados, creados] = await db.$transaction([
        db.seguimiento.deleteMany({
            where: {
                OR: [
                    // Los de ESTA cita por su llave, estén bajo la forma del número que estén.
                    { idempotencyKey: { startsWith: `appt-reminder:${cita.id}:` } },
                    {
                        instancia: linea,
                        remoteJid: { in: numeros },
                        OR: [
                            { idNodo: null },
                            { idNodo: "" },
                            { idNodo: { startsWith: "appt-reminder-" } },
                            ...(antiguosDeAgenda.length ? [{ idNodo: { in: antiguosDeAgenda } }] : []),
                        ],
                    },
                ],
            },
        }),
        db.seguimiento.createMany({
            data: filas.map((r) => ({
                idNodo: r.idNodo,
                idempotencyKey: r.idempotencyKey,
                serverurl,
                instancia: linea,
                apikey,
                remoteJid,
                mensaje: r.mensaje,
                tipo: r.tipo,
                time: r.time,
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
            vivos && !delCiclo && plantillas.length === 0
                ? "La cuenta no tiene recordatorios configurados en Agenda › Recordatorios."
                : undefined,
    };
}
