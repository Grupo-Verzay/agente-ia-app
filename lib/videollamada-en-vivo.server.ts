import "server-only";

import { laCitaDeLaVideollamada } from "@/lib/cita-de-la-videollamada.server";
import { db } from "@/lib/db";
import { losNombresDeLosNiveles } from "@/lib/nombre-del-nivel";
import type { OrdenDeAgendar } from "@/lib/pantalla-del-avatar";
import { lasCredencialesDeLaLinea, programarLosRecordatoriosDeLaCita } from "@/lib/recordatorios-de-la-cita.server";
import { anotarElEnvio, soltarElEnvio } from "@/lib/videollamada-ia-db";
import {
    elAvisoDelPago,
    elInstanteDeLaAgenda,
    elMensajeDelRecordatorio,
    esElProspecto,
    laLlaveDeLaAgenda,
    PREFIJO_DEL_NODO,
    porQueNoSeAgenda,
    type EstadoDelPago,
} from "@/lib/videollamada-en-vivo";
import { laZonaDeLaCuenta } from "@/lib/zona-de-la-cuenta";

/**
 * Lo que la sala pide al servidor durante la videollamada. Todo sale de la
 * CITA (su cuenta, su conversación, su línea): del navegador solo llega el id
 * firmado y, al agendar, el tipo, la fecha y la nota ya validados.
 */

export async function laCita(citaId: string) {
    return laCitaDeLaVideollamada(citaId);
}

/** El teléfono de la conversación, nunca los dígitos de un `@lid`. */
export function elTelefono(s: { remoteJid: string; remoteJidAlt: string | null } | null | undefined): string {
    for (const jid of [s?.remoteJid, s?.remoteJidAlt]) {
        if (jid && !jid.endsWith("@lid") && !jid.endsWith("@g.us")) return jid.split("@")[0].replace(/\D/g, "");
    }
    return "";
}

/* ── Agendar ───────────────────────────────────────────────────────────── */

export type ResultadoDeAgendar =
    | { ok: true; repetido: boolean; tipo: OrdenDeAgendar["tipo"]; cuando: string }
    | { ok: false; motivo: string };

export async function agendarDesdeLaVideollamada(
    citaId: string,
    orden: OrdenDeAgendar,
    ahora: Date = new Date(),
): Promise<ResultadoDeAgendar> {
    const cita = await laCita(citaId);
    if (!cita) return { ok: false, motivo: "la cita no existe" };
    const zona = laZonaDeLaCuenta(cita.user?.timezone, laZonaDeLaCuenta(cita.timezone));
    const instante = elInstanteDeLaAgenda(orden.fechaHora, zona);
    const motivo = porQueNoSeAgenda(instante, ahora);
    if (motivo || !instante) return { ok: false, motivo: motivo ?? "la fecha no se entiende" };

    const llave = laLlaveDeLaAgenda(orden);
    const nuevo = await anotarElEnvio(citaId, llave);
    if (!nuevo) return { ok: true, repetido: true, tipo: orden.tipo, cuando: orden.fechaHora };

    try {
        if (orden.tipo === "cita" && cita.esReserva) {
            // Una reserva de Multiagenda es de un especialista: la siguiente se
            // agenda como recordatorio por WhatsApp, no como cita de Agenda.
            throw new Error("en Multiagenda la siguiente cita se agenda desde la página de reservas");
        }
        if (orden.tipo === "cita") {
            if (!cita.sessionId) throw new Error("la cita no tiene conversación");
            const duracion = Math.max(15 * 60_000, cita.endTime.getTime() - cita.startTime.getTime());
            const nueva = await db.appointment.create({
                data: {
                    userId: cita.userId,
                    sessionId: cita.sessionId,
                    clientName: cita.clientName,
                    startTime: instante,
                    endTime: new Date(instante.getTime() + duracion),
                    timezone: cita.timezone || zona,
                    serviceId: cita.serviceId,
                },
                select: { id: true },
            });
            await programarLosRecordatoriosDeLaCita(nueva.id).catch((error) =>
                console.warn("[videollamada] la cita nueva no programó recordatorios", { cita: nueva.id, error }),
            );
        } else {
            const linea = String(cita.session?.instanceId ?? "").trim();
            const remoteJid = String(cita.session?.remoteJid ?? "").trim();
            if (!linea || !remoteJid) throw new Error("la cita no tiene línea o número");
            const { serverurl, apikey } = await lasCredencialesDeLaLinea(cita.userId, linea);
            const nombre = (cita.session?.customName || cita.clientName || cita.session?.pushName || "").trim() || null;
            await db.seguimiento.create({
                data: {
                    idNodo: `${PREFIJO_DEL_NODO}${cita.id}`,
                    idempotencyKey: `videollamada:${cita.id}:${llave}`,
                    serverurl,
                    instancia: linea,
                    apikey,
                    remoteJid,
                    mensaje: orden.tipo === "recordatorio"
                        ? elMensajeDelRecordatorio(nombre, orden.nota)
                        : orden.nota || "Llamada acordada en la videollamada",
                    tipo: orden.tipo === "llamada" ? "seguimiento-ai-call" : "text",
                    time: instante.toISOString(),
                },
            });
        }
        console.info("[videollamada] siguiente paso agendado", { cita: citaId, tipo: orden.tipo, cuando: orden.fechaHora });
        return { ok: true, repetido: false, tipo: orden.tipo, cuando: orden.fechaHora };
    } catch (error) {
        await soltarElEnvio(citaId, llave).catch(() => undefined);
        const motivo = error instanceof Error ? error.message : String(error);
        console.warn("[videollamada] no se pudo agendar", { cita: citaId, orden, motivo });
        return { ok: false, motivo };
    }
}

/* ── La ficha del prospecto ────────────────────────────────────────────── */

export type FichaDelProspecto = {
    nombre: string;
    telefono: string;
    estado: string | null;
    puntaje: number | null;
    porQue: string | null;
    servicio: string | null;
    citaEl: string;
    resumen: string | null;
};

export async function laFichaDelProspecto(citaId: string): Promise<FichaDelProspecto | null> {
    const cita = await laCita(citaId);
    if (!cita) return null;
    const ultimo = cita.session?.id
        ? await db.crmFollowUp.findFirst({
            where: { sessionId: cita.session.id, summarySnapshot: { not: null } },
            orderBy: { createdAt: "desc" },
            select: { summarySnapshot: true },
        }).catch(() => null)
        : null;
    const zona = laZonaDeLaCuenta(cita.user?.timezone, laZonaDeLaCuenta(cita.timezone));
    return {
        nombre: (cita.session?.customName || cita.clientName || cita.session?.pushName || "").trim() || "Prospecto",
        telefono: elTelefono(cita.session),
        estado: cita.session?.leadStatus ?? null,
        puntaje: cita.session?.leadScore ?? null,
        porQue: cita.session?.leadScoreReason ?? null,
        servicio: cita.service?.name ?? null,
        citaEl: cita.startTime.toLocaleString("es-CO", { timeZone: zona, dateStyle: "full", timeStyle: "short" }),
        resumen: ultimo?.summarySnapshot ?? null,
    };
}

/* ── Los resultados de la casa (solo cifras agregadas) ─────────────────── */

export type ResultadosDeLaCasa = { negocios: number; conversaciones: number; citas: number; dias: number };
const DIAS_DE_LOS_RESULTADOS = 30;
const MEMORIA_DE_LOS_RESULTADOS_MS = 10 * 60_000;
let recordados: { en: number; valor: ResultadosDeLaCasa } | null = null;

export async function losResultadosDeLaCasa(ahora: Date = new Date()): Promise<ResultadosDeLaCasa> {
    if (recordados && ahora.getTime() - recordados.en < MEMORIA_DE_LOS_RESULTADOS_MS) return recordados.valor;
    const desde = new Date(ahora.getTime() - DIAS_DE_LOS_RESULTADOS * 86_400_000);
    const [negocios, conversaciones, citas] = await Promise.all([
        db.userBilling.count({ where: { accessStatus: "ACTIVE" } }),
        db.session.count({ where: { createdAt: { gte: desde } } }),
        db.appointment.count({ where: { createdAt: { gte: desde } } }),
    ]);
    const valor = { negocios, conversaciones, citas, dias: DIAS_DE_LOS_RESULTADOS };
    recordados = { en: ahora.getTime(), valor };
    return valor;
}

/* ── ¿Ya pagó? ─────────────────────────────────────────────────────────── */

export type NovedadesDelPago = { estado: EstadoDelPago; aviso: string | null };

export async function lasNovedadesDelPago(citaId: string): Promise<NovedadesDelPago> {
    const cita = await laCita(citaId);
    const telefono = elTelefono(cita?.session);
    if (!cita || telefono.length < 7) return { estado: "nada", aviso: null };
    const fin = telefono.slice(-10);
    const candidatas = await db.user.findMany({
        where: { notificationNumber: { endsWith: fin }, createdAt: { gte: cita.createdAt } },
        select: {
            notificationNumber: true,
            createdAt: true,
            plan: true,
            billing: { select: { billingStatus: true, lastPaymentAt: true } },
        },
        take: 5,
    });
    const suyas = candidatas.filter((c) => esElProspecto(c, telefono, cita.createdAt));
    if (!suyas.length) return { estado: "nada", aviso: null };
    const pagada = suyas.find((c) => c.billing?.billingStatus === "PAID" || !!c.billing?.lastPaymentAt);
    if (!pagada) return { estado: "registrado", aviso: elAvisoDelPago("registrado", null) };
    const filas = await db.subscriptionPlan.findMany({ select: { plan: true, name: true, isResellerPlan: true, updatedAt: true } });
    const nombre = losNombresDeLosNiveles(filas)[pagada.plan] ?? null;
    return { estado: "pagado", aviso: elAvisoDelPago("pagado", nombre) };
}
