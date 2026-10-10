import "server-only";

import type { AppointmentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { laZonaDeLaCuenta } from "@/lib/zona-de-la-cuenta";
import {
    ESTADOS_EN_ESPERA,
    ESTADOS_QUE_SE_PUEDEN_DESCARTAR,
    VENTANA_DE_LA_ESPERA_MIN,
    elAvisoDelCambio,
    elNodoDelCiclo,
    esUnRechazoLiteral,
    laContestacionAlNo,
    laContestacionAlSi,
    laDecisionDeLaLlamada,
    laEsperaConProrroga,
    laLlaveDelCiclo,
    laRespuestaDeAsistencia,
    losRecordatoriosDelCiclo,
    queHacerEnLaEspera,
    sePuedeDescartar,
    type PasoDeLaEspera,
} from "@/lib/ciclo-de-la-cita";
import {
    apuntarElCierre,
    apuntarElResultadoDeLaLlamada,
    apuntarLaAsistencia,
    apuntarLaDecision,
    apuntarQueEntroElCliente,
    elCicloEstaActivo,
    laFilaDelCiclo,
    lasCuentasConElCiclo,
    lasFilasDelCiclo,
    reclamarLaLlamada,
    type FilaDelCiclo,
} from "@/lib/ciclo-de-la-cita-db";
import { avisarALaCuenta, avisarAlClienteDelEstado, cambiarElEstadoDeLaCita, escribirleAlCliente } from "@/lib/estado-de-la-cita.server";
import { elEnlaceParaReagendar } from "@/app/(root)/schedule/helpers/buildStatusOwnerMessage";

/**
 * El ciclo automático de la cita, la parte que lee la base y manda. Las reglas
 * son de `lib/ciclo-de-la-cita.ts`; aquí solo se aplican. Cuatro entradas:
 *
 * 1. `losSeguimientosDelCiclo`: los cuatro recordatorios al agendar o
 *    reagendar (los escriben `programarLosRecordatoriosDeLaCita` y
 *    `reprogramarLosRecordatoriosDeLaCita`, en vez de las plantillas).
 * 2. `elTicDeLaEspera`: el reloj de cada minuto (lo pide el backend a
 *    `/api/ciclo-de-citas/tic`). Atendida, la llamada del minuto 5 y No
 *    asistida. Y `alEntrarElCliente`, que la sala llama al entrar el prospecto.
 * 3. `alEscribirElCliente`: lo que reenvía el backend de cada mensaje de un
 *    contacto con cita. El «Sí»/«No» del recordatorio y el rechazo literal.
 * 4. `alDecidirEnLaLlamada`: lo que la persona dijo en la llamada del minuto 5.
 *
 * Todo está detrás del interruptor de la cuenta (`cita_ciclo_ajustes`): sin él,
 * la Agenda funciona exactamente como antes.
 *
 * **La espera solo corre en el modo «Videollamada con IA»**: es el único en el
 * que la plataforma SABE si el prospecto entró (`cita_ciclo.clienteEntroEn`,
 * que apunta la sala al unirse; un asesor que entra no cuenta).
 * Con un enlace fijo (Meet, Zoom) no hay forma de verlo, y poner «No asistida»
 * a ciegas sería inventarse un dato; ahí salen los recordatorios y nada más.
 */

const CITA = {
    session: { select: { id: true, remoteJid: true, remoteJidAlt: true, instanceId: true, pushName: true, customName: true } },
    service: { select: { name: true } },
    user: { select: { timezone: true } },
} as const;
type CitaDelCiclo = Prisma.AppointmentGetPayload<{ include: typeof CITA }>;

function elNombre(cita: Pick<CitaDelCiclo, "clientName" | "session">): string {
    return (cita.clientName || cita.session?.customName || cita.session?.pushName || "").trim();
}

function elTelefono(cita: Pick<CitaDelCiclo, "session">): string {
    const jid = [cita.session?.remoteJid, cita.session?.remoteJidAlt].find((j) => j && !j.toLowerCase().endsWith("@lid"));
    return String(jid ?? "").replace(/@.*/, "").replace(/\D/g, "");
}

function laZona(cita: Pick<CitaDelCiclo, "timezone" | "user">): string {
    return laZonaDeLaCuenta(cita.user?.timezone, laZonaDeLaCuenta(cita.timezone));
}

/* ── 1. Los recordatorios ─────────────────────────────────────────────── */

export type SeguimientoDelCiclo = {
    idNodo: string;
    idempotencyKey: string;
    tipo: string;
    time: string;
    mensaje: string;
};

/**
 * Los seguimientos del ciclo de una cita, listos para escribir con la línea y
 * la clave de quien llama. `null` si la cuenta no tiene el ciclo encendido (y
 * entonces se programan las plantillas de siempre).
 */
export async function losSeguimientosDelCiclo(
    cuentaId: string,
    datos: { citaId: string; nombreDelCliente: string; inicio: Date; zona: string; servicio?: string | null; enlaceDeReunion?: string | null },
    ahora: Date = new Date(),
): Promise<SeguimientoDelCiclo[] | null> {
    const activo = await elCicloEstaActivo(cuentaId).catch((error) => {
        // Sin poder leer el interruptor, lo de siempre: las plantillas. Se dice.
        console.warn("[ciclo-de-la-cita] no se pudo leer el interruptor; van las plantillas", { cuenta: cuentaId, error: String(error) });
        return false;
    });
    if (!activo) return null;
    return losRecordatoriosDelCiclo(datos, ahora).map((r) => ({
        idNodo: elNodoDelCiclo(r.clave),
        idempotencyKey: laLlaveDelCiclo(datos.citaId, r.clave),
        tipo: r.tipo,
        time: r.cuando,
        mensaje: r.mensaje,
    }));
}

/* ── 2. La espera ─────────────────────────────────────────────────────── */

/** Las cuentas del ciclo que están en modo «Videollamada con IA». */
async function lasCuentasQueEsperan(): Promise<string[]> {
    const cuentas = await lasCuentasConElCiclo();
    if (cuentas.length === 0) return [];
    const { leerLosAjustes } = await import("@/lib/videollamada-ia-db");
    const conVideo: string[] = [];
    for (const cuenta of cuentas) {
        const ajustes = await leerLosAjustes(cuenta).catch(() => null);
        if (ajustes?.modo === "tavus") conVideo.push(cuenta);
    }
    return conVideo;
}

export type ResultadoDelTic = {
    cuentas: number;
    citas: number;
    pasos: Partial<Record<PasoDeLaEspera, number>>;
    fallos: number;
};

/**
 * Una vuelta del reloj. Mira las citas Pendientes y Confirmadas de las cuentas
 * que esperan, desde 15 minutos antes de la hora hasta el final de la ventana,
 * y aplica a cada una lo que diga `queHacerEnLaEspera`. Nunca lanza por una
 * cita: la siguiente sigue, y el fallo se cuenta y se dice.
 */
export async function elTicDeLaEspera(ahora: Date = new Date()): Promise<ResultadoDelTic> {
    const cuentas = await lasCuentasQueEsperan();
    const resultado: ResultadoDelTic = { cuentas: cuentas.length, citas: 0, pasos: {}, fallos: 0 };
    if (cuentas.length === 0) return resultado;

    const citas = await db.appointment.findMany({
        where: {
            userId: { in: cuentas },
            status: { in: [...ESTADOS_EN_ESPERA] as AppointmentStatus[] },
            startTime: {
                gte: new Date(ahora.getTime() - VENTANA_DE_LA_ESPERA_MIN * 60_000),
                lte: new Date(ahora.getTime() + 15 * 60_000),
            },
        },
        include: CITA,
        orderBy: { startTime: "asc" },
        take: 500,
    });
    resultado.citas = citas.length;
    if (citas.length === 0) return resultado;

    const filas = await lasFilasDelCiclo(citas.map((c) => c.id));

    // Trabajo en cola con pocos obreros: una llamada al servidor de llamadas o
    // un aviso lento no frena a las demás citas, y tampoco se lanzan 500 a la vez.
    const cola = [...citas];
    const obrero = async () => {
        for (let cita = cola.shift(); cita; cita = cola.shift()) {
            try {
                const paso = await aplicarLaEspera(cita, filas.get(cita.id) ?? null, ahora);
                resultado.pasos[paso] = (resultado.pasos[paso] ?? 0) + 1;
            } catch (error) {
                resultado.fallos++;
                console.error("[ciclo-de-la-cita] fallo al revisar una cita", { cita: cita.id, error: String(error) });
            }
        }
    };
    await Promise.all(Array.from({ length: 4 }, obrero));
    return resultado;
}

/**
 * El prospecto entró a la videollamada (la sala se unió de verdad, y no es un
 * asesor). Se apunta y la cita se revisa YA, sin esperar al reloj: la tarjeta
 * pasa a Atendida en el acto. Una cita de Multiagenda no es de este ciclo.
 */
export async function alEntrarElCliente(citaId: string, ahora: Date = new Date()): Promise<PasoDeLaEspera> {
    const cita = await db.appointment.findUnique({ where: { id: citaId }, include: CITA });
    if (!cita) return "nada";
    if (!(await elCicloEstaActivo(cita.userId))) return "nada";
    await apuntarQueEntroElCliente(cita.id, cita.userId);
    return aplicarLaEspera(cita, await laFilaDelCiclo(citaId), ahora);
}

async function aplicarLaEspera(cita: CitaDelCiclo, fila: FilaDelCiclo | null, ahora: Date): Promise<PasoDeLaEspera> {
    const paso = queHacerEnLaEspera(
        {
            estado: cita.status,
            inicio: cita.startTime,
            entroEn: fila?.clienteEntroEn ?? null,
            asistencia: fila?.asistencia ?? null,
            llamadaEn: fila?.llamadaEn ?? null,
            decision: fila?.decision ?? null,
            esperaHasta: fila?.esperaHasta ?? null,
        },
        ahora,
    );

    if (paso === "atendida") {
        const r = await cambiarElEstadoDeLaCita({
            citaId: cita.id,
            estado: "ATENDIDA",
            desde: ESTADOS_EN_ESPERA,
            actorId: null,
            resumen: "El sistema marcó la cita como Atendida: el prospecto entró a la reunión",
            metadata: { automatico: true, motivo: "entro" },
        });
        // Sin aviso al cliente: está DENTRO de la reunión, y el «gracias por
        // asistir» le llegaría en mitad de ella.
        if (r.cambiada) await apuntarElCierre(cita.id, cita.userId, "ATENDIDA");
        return paso;
    }

    if (paso === "no_asistida") {
        await ponerNoAsistida(cita, fila?.decision === "no_puede" ? "dijo_que_no_puede" : "no_entro");
        return paso;
    }

    if (paso === "llamar") {
        if (!(await reclamarLaLlamada(cita.id, cita.userId))) return "esperar"; // otra vuelta ya llamó
        const r = await pedirLaLlamadaDeEspera(cita);
        await apuntarElResultadoDeLaLlamada(cita.id, r.ok ? "lanzada" : `no salió: ${r.motivo}`);
        if (!r.ok) {
            // La espera sigue igual (minuto 10); la llamada que no salió se dice.
            console.warn("[ciclo-de-la-cita] la llamada del minuto 5 no salió", { cita: cita.id, cuenta: cita.userId, motivo: r.motivo });
        }
        return paso;
    }

    return paso;
}

async function ponerNoAsistida(cita: CitaDelCiclo, motivo: "no_entro" | "dijo_que_no_puede"): Promise<boolean> {
    const r = await cambiarElEstadoDeLaCita({
        citaId: cita.id,
        estado: "NO_ASISTIDA",
        desde: ESTADOS_EN_ESPERA,
        actorId: null,
        resumen:
            motivo === "no_entro"
                ? "El sistema marcó la cita como No asistida: el prospecto no se conectó en el tiempo de espera"
                : "El sistema marcó la cita como No asistida: en la llamada dijo que no puede asistir",
        metadata: { automatico: true, motivo },
    });
    if (!r.cambiada) return false;
    await apuntarElCierre(cita.id, cita.userId, "NO_ASISTIDA");
    // El aviso al cliente (con el enlace para reagendar) y el de la cuenta.
    await avisarAlClienteDelEstado(cita.id, "NO_ASISTIDA");
    await avisarALaCuenta(
        cita.id,
        elAvisoDelCambio({
            estado: "NO_ASISTIDA",
            nombreDelCliente: elNombre(cita),
            telefono: elTelefono(cita),
            inicio: cita.startTime,
            zona: laZona(cita),
            motivo,
        }),
        "CicloDeLaCita",
    );
    return true;
}

type ResultadoDeLaLlamada = { ok: true } | { ok: false; motivo: string };

/**
 * Pide al backend la llamada de voz del minuto 5. La lanza él porque es él
 * quien atiende la llamada (`/voicebot/resolve`): así el asistente sabe que es
 * la llamada de la espera y tiene la herramienta para contestar.
 */
async function pedirLaLlamadaDeEspera(cita: CitaDelCiclo): Promise<ResultadoDeLaLlamada> {
    const backend = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");
    if (!backend) return { ok: false, motivo: "BACKEND_URL no está configurada en la App." };
    if (!cita.session?.id) return { ok: false, motivo: "la cita no tiene conversación." };
    try {
        const { elEnlaceDeReunionDeLaCita } = await import("@/lib/videollamada-ia.server");
        const res = await fetch(`${backend}/citas/llamada-de-espera`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-secret": process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? "" },
            body: JSON.stringify({
                citaId: cita.id,
                sessionId: cita.session.id,
                nombre: elNombre(cita),
                inicio: cita.startTime.toISOString(),
                enlace: await elEnlaceDeReunionDeLaCita(cita.userId, cita.id).catch(() => null),
            }),
            signal: AbortSignal.timeout(20_000),
        });
        const cuerpo = (await res.json().catch(() => null)) as { ok?: boolean; motivo?: string } | null;
        if (res.ok && cuerpo?.ok) return { ok: true };
        return { ok: false, motivo: cuerpo?.motivo || `el backend respondió ${res.status}` };
    } catch (error) {
        return { ok: false, motivo: `no se pudo hablar con el backend: ${error instanceof Error ? error.message : String(error)}` };
    }
}

/* ── 3. Lo que escribe el cliente ─────────────────────────────────────── */

export type ResultadoDelMensaje = {
    /** `true` si el mensaje ERA la respuesta al recordatorio: el agente no lo contesta otra vez. */
    manejado: boolean;
    que: "asistencia_si" | "asistencia_no" | "descartada" | "nada";
};

/** Hasta cuánto después del inicio vale un «sí» o «no» al recordatorio. */
const RESPUESTA_HASTA_MIN = 10;

/**
 * Lo que escribió un contacto que tiene cita. Solo actúa con el ciclo
 * encendido, y solo con lo LITERAL: un «Sí»/«No» que es la respuesta al
 * recordatorio de una hora antes, o un rechazo explícito («no me interesa»).
 */
export async function alEscribirElCliente(input: { sessionId: number; texto: string }, ahora: Date = new Date()): Promise<ResultadoDelMensaje> {
    const nada: ResultadoDelMensaje = { manejado: false, que: "nada" };
    const texto = String(input.texto ?? "").trim();
    if (!input.sessionId || !texto) return nada;

    const citas = await db.appointment.findMany({
        where: {
            sessionId: input.sessionId,
            status: { in: [...ESTADOS_QUE_SE_PUEDEN_DESCARTAR] as AppointmentStatus[] },
            startTime: { gte: new Date(ahora.getTime() - 7 * 24 * 60 * 60_000) },
        },
        include: CITA,
        orderBy: { startTime: "asc" },
        take: 10,
    });
    if (citas.length === 0) return nada;
    if (!(await elCicloEstaActivo(citas[0].userId))) return nada;

    // 1) La respuesta al «¿Confirmas tu asistencia?»: la cita en espera cuya
    //    pregunta ya salió (una hora antes) y que todavía no ha pasado.
    const respuesta = laRespuestaDeAsistencia(texto);
    if (respuesta) {
        const enPregunta = citas.find((c) => {
            const desde = c.startTime.getTime() - 60 * 60_000;
            const hasta = c.startTime.getTime() + RESPUESTA_HASTA_MIN * 60_000;
            return (ESTADOS_EN_ESPERA as readonly string[]).includes(c.status) && ahora.getTime() >= desde && ahora.getTime() <= hasta;
        });
        if (enPregunta && (await apuntarLaAsistencia(enPregunta.id, enPregunta.userId, respuesta))) {
            await contestarLaAsistencia(enPregunta, respuesta);
            return { manejado: true, que: respuesta === "si" ? "asistencia_si" : "asistencia_no" };
        }
    }

    // 2) El rechazo literal: la cita más reciente que se puede descartar.
    if (esUnRechazoLiteral(texto)) {
        const cita = [...citas].reverse().find((c) => sePuedeDescartar(c.status));
        if (cita) {
            const r = await cambiarElEstadoDeLaCita({
                citaId: cita.id,
                estado: "DESCARTADO",
                desde: ESTADOS_QUE_SE_PUEDEN_DESCARTAR,
                actorId: null,
                resumen: "El sistema marcó la cita como Descartada: el cliente escribió que no le interesa",
                metadata: { automatico: true, motivo: "rechazo_literal", frase: texto.slice(0, 200) },
            });
            if (r.cambiada) {
                await apuntarElCierre(cita.id, cita.userId, "DESCARTADO");
                await avisarALaCuenta(
                    cita.id,
                    elAvisoDelCambio({
                        estado: "DESCARTADO",
                        nombreDelCliente: elNombre(cita),
                        telefono: elTelefono(cita),
                        inicio: cita.startTime,
                        zona: laZona(cita),
                        motivo: "rechazo_literal",
                        frase: texto,
                    }),
                    "CicloDeLaCita",
                );
                // El agente sigue contestando: despedirse con educación es suyo.
                return { manejado: false, que: "descartada" };
            }
        }
    }

    return nada;
}

async function contestarLaAsistencia(cita: CitaDelCiclo, respuesta: "si" | "no"): Promise<void> {
    if (respuesta === "si") {
        await escribirleAlCliente(cita.id, laContestacionAlSi(elNombre(cita)), "CicloDeLaCita");
        return;
    }
    // «No»: no tiene sentido mandarle «está por comenzar» ni el enlace, y se le
    // ofrece reagendar. La cita NO se cancela: Cancelada la decide una persona.
    const borrados = await db.seguimiento.deleteMany({
        where: { idempotencyKey: { in: [laLlaveDelCiclo(cita.id, "30m"), laLlaveDelCiclo(cita.id, "0")] } },
    });
    console.info("[ciclo-de-la-cita] el cliente respondió que no asistirá", { cita: cita.id, recordatoriosQuitados: borrados.count });
    await escribirleAlCliente(cita.id, laContestacionAlNo(elNombre(cita), elEnlaceParaReagendar(cita.userId)), "CicloDeLaCita");
    await avisarALaCuenta(
        cita.id,
        `⚠️ *${elNombre(cita) || "El cliente"}* respondió que *NO* asistirá a su cita. Se le ofreció reagendar.` +
            (elTelefono(cita) ? `\n\n📱 *WhatsApp:* +${elTelefono(cita)}` : ""),
        "CicloDeLaCita",
    );
}

/* ── 4. Lo que la persona dijo en la llamada ──────────────────────────── */

export type ResultadoDeLaDecision = { ok: boolean; mensaje: string };

/**
 * La herramienta de la llamada del minuto 5. Lo que devuelve es la frase que
 * el asistente le dice a la persona, así que va en su idioma.
 */
export async function alDecidirEnLaLlamada(input: { citaId: string; args: unknown }, ahora: Date = new Date()): Promise<ResultadoDeLaDecision> {
    const leida = laDecisionDeLaLlamada(input.args);
    if (!leida) return { ok: false, mensaje: "No entendí la respuesta. Pregúntale si va a entrar, si necesita unos minutos o si no puede asistir." };

    const cita = await db.appointment.findUnique({ where: { id: String(input.citaId ?? "") }, include: CITA });
    if (!cita) return { ok: false, mensaje: "No encuentro la cita." };
    if (!(ESTADOS_EN_ESPERA as readonly string[]).includes(cita.status)) {
        return { ok: true, mensaje: "Gracias, ya quedó anotado." };
    }

    const esperaHasta = leida.decision === "mas_tiempo" ? laEsperaConProrroga(cita.startTime, ahora, leida.minutos ?? 0) : null;
    await apuntarLaDecision(cita.id, cita.userId, leida.decision, esperaHasta);

    if (leida.decision === "no_puede") {
        // Diga lo que diga —también «la cancelo»—: No asistida, nunca Cancelada.
        await ponerNoAsistida(cita, "dijo_que_no_puede");
        return { ok: true, mensaje: "Entendido. Le envío por WhatsApp un enlace para que elija otro horario." };
    }
    if (leida.decision === "mas_tiempo") {
        return { ok: true, mensaje: `Perfecto, le esperamos ${leida.minutos} minutos más. El enlace está en su WhatsApp.` };
    }
    return { ok: true, mensaje: "Perfecto, le esperamos en la reunión. El enlace está en su WhatsApp." };
}
