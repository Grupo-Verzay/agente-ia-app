import "server-only";

import { db } from "@/lib/db";
import { laLineaDeLaNotificacionDeCita } from "@/lib/agenda-de-la-familia";
import {
    elAvisoAlEquipo,
    elMensajeDeSeguimiento,
    type PedidoDeAtencion,
} from "@/lib/atencion-de-la-videollamada";
import { dispararLasAutomatizacionesDeCita } from "@/lib/automatizaciones-de-cita.server";
import { laCitaDeLaVideollamada } from "@/lib/cita-de-la-videollamada.server";
import { empujarAviso } from "@/lib/empujar-aviso";
import { esLineaDeWhatsappQr } from "@/lib/linea-de-whatsapp";
import { ESTADOS_DE_CITA_CERRADA } from "@/lib/registros-del-lead";
import { anotarElEnvio, laVideollamada, soltarElEnvio } from "@/lib/videollamada-ia-db";
import { elEnlaceDeReunionDeLaCita } from "@/lib/videollamada-ia.server";
import { elNombreDelProspecto } from "@/lib/videollamada-ia";

/**
 * Lo que la sala de la videollamada pide al servidor cuando el cliente pide un
 * humano, se nota incómodo, dice que no, o se acaba el tiempo. Todo sale de la
 * CITA (su cuenta, su conversación, su línea): del navegador solo llega qué
 * pasó (`comoPedidoDeAtencion`). Una vez por conversación de Tavus y tipo
 * (`videollamada_envios`), y si no sale, la marca se suelta. Nunca mudo.
 */

export type ResultadoDeAtencion = { ok: true; repetido?: boolean; avisados?: number } | { ok: false; motivo: string };

/** Los últimos diez dígitos: así se comparan dos teléfonos sin indicativo. */
function losDiez(telefono: string | null | undefined): string {
    return String(telefono ?? "").split("@")[0].replace(/\D/g, "").slice(-10);
}

/** Un número al que se puede escribir: 7 dígitos o más, y no el «0000000000» de fábrica. */
function esUnNumero(telefono: string | null | undefined): boolean {
    const d = String(telefono ?? "").replace(/\D/g, "");
    return d.length >= 7 && !/^0+$/.test(d);
}

type CitaConLinea = NonNullable<Awaited<ReturnType<typeof laCitaDeLaVideollamada>>>;

/** La línea y las claves de la cuenta dueña: la de la conversación si es suya. */
async function laLineaDeLaCuenta(cita: CitaConLinea) {
    const cuenta = await db.user.findUnique({
        where: { id: cita.userId },
        select: {
            apiKey: { select: { url: true, key: true } },
            instancias: { orderBy: { id: "asc" }, select: { instanceName: true, instanceType: true } },
        },
    });
    const instanceName = laLineaDeLaNotificacionDeCita({
        lineaDeLaConversacion: cita.session?.instanceId,
        lineasDeLaDuena: (cuenta?.instancias ?? []).map((i) => ({
            instanceName: i.instanceName,
            esQr: esLineaDeWhatsappQr(i.instanceType),
        })),
    });
    return { instanceName, apiKey: cuenta?.apiKey ?? null };
}

async function mandar(
    linea: Awaited<ReturnType<typeof laLineaDeLaCuenta>>,
    remoteJid: string,
    mensaje: string,
    datos: Record<string, unknown>,
): Promise<{ ok: boolean; motivo?: string }> {
    if (!linea.instanceName) return { ok: false, motivo: "la cuenta no tiene una línea de WhatsApp conectada" };
    const { enviarConHistorial } = await import("@/lib/envio-con-historial.server");
    const url = linea.apiKey?.url;
    const r = await enviarConHistorial({
        instanceName: linea.instanceName,
        url: url ? `https://${url}/message/sendText/${linea.instanceName}` : undefined,
        apikey: linea.apiKey?.key ?? undefined,
        remoteJid,
        message: mensaje,
        historyType: "notification",
        additionalKwargs: { source: "VideollamadaIA", ...datos },
    });
    return r.success ? { ok: true } : { ok: false, motivo: r.message || "no salió" };
}

/**
 * A quién se avisa: la dueña de la cuenta (su número de notificación y los
 * adicionales) y el asesor asignado a la conversación, si lo hay.
 */
async function elEquipoDeLaCita(cita: CitaConLinea): Promise<{ personas: string[]; telefonos: string[] }> {
    const sesion = cita.sessionId
        ? await db.session.findUnique({ where: { id: cita.sessionId }, select: { assignedAdvisorId: true } }).catch(() => null)
        : null;
    const personas = [cita.userId, sesion?.assignedAdvisorId ?? null].filter((p): p is string => !!p);
    const [usuarios, adicionales] = await Promise.all([
        db.user.findMany({ where: { id: { in: personas } }, select: { notificationNumber: true } }),
        db.userNotificationContact.findMany({ where: { userId: cita.userId }, select: { phone: true } }).catch(() => []),
    ]);
    const vistos = new Set<string>();
    const telefonos: string[] = [];
    for (const t of [...usuarios.map((u) => u.notificationNumber), ...adicionales.map((a) => a.phone)]) {
        if (!esUnNumero(t)) continue;
        const llave = losDiez(t);
        if (vistos.has(llave)) continue;
        vistos.add(llave);
        telefonos.push(String(t).replace(/\D/g, ""));
    }
    return { personas: [...new Set(personas)], telefonos };
}

/** La marca de «una vez»: por conversación de Tavus, así otra reunión de la misma cita vuelve a avisar. */
async function laLlave(citaId: string, pedido: PedidoDeAtencion): Promise<string> {
    const fila = await laVideollamada(citaId).catch(() => null);
    const conversacion = fila?.conversacionId ?? "sin-conversacion";
    return `atencion:${pedido.tipo}:${conversacion}${pedido.tipo === "reagendada" ? `:${pedido.cuando}` : ""}`;
}

async function avisarAlEquipo(cita: CitaConLinea, pedido: PedidoDeAtencion): Promise<ResultadoDeAtencion> {
    const enlace = await elEnlaceDeReunionDeLaCita(cita.userId, cita.id).catch(() => null);
    const aviso = elAvisoAlEquipo(pedido, { nombre: elNombreDelProspecto(cita), enlace });
    if (!aviso) return { ok: false, motivo: "no es un aviso para el equipo" };
    const { personas, telefonos } = await elEquipoDeLaCita(cita);

    // El empuje llega aunque la App esté cerrada; nunca lanza.
    const empuje = await empujarAviso(personas, {
        titulo: aviso.titulo,
        texto: aviso.texto.replace(/\*/g, ""),
        url: enlace ?? "/schedule",
        etiqueta: `videollamada-${cita.id}`,
    });

    const linea = await laLineaDeLaCuenta(cita);
    let avisados = 0;
    const fallos: string[] = [];
    for (const telefono of telefonos) {
        const r = await mandar(linea, `${telefono}@s.whatsapp.net`, aviso.texto, { citaId: cita.id, atencion: pedido.tipo }).catch(
            (error) => ({ ok: false, motivo: error instanceof Error ? error.message : String(error) }),
        );
        if (r.ok) avisados++;
        else fallos.push(r.motivo ?? "no salió");
    }
    if (!avisados && !empuje.enviados) {
        const motivo = telefonos.length ? fallos[0] ?? "no salió" : "la cuenta no tiene número de notificación ni avisos en el navegador";
        console.warn("[videollamada] el aviso al equipo no llegó a nadie", { cita: cita.id, tipo: pedido.tipo, motivo });
        return { ok: false, motivo };
    }
    console.info("[videollamada] aviso al equipo", {
        cita: cita.id,
        tipo: pedido.tipo,
        whatsapp: avisados,
        empuje: empuje.enviados,
        fallos: fallos.length,
    });
    return { ok: true, avisados: avisados + empuje.enviados };
}

/** El NO explícito: la cita pasa a Descartado (y sus automatizaciones, como en el tablero). */
async function descartarLaCita(cita: CitaConLinea): Promise<ResultadoDeAtencion> {
    if ((ESTADOS_DE_CITA_CERRADA as readonly string[]).includes(cita.status)) {
        console.info("[videollamada] la cita ya estaba cerrada; no se descarta", { cita: cita.id, estado: cita.status });
        return { ok: true, repetido: true };
    }
    if (cita.esReserva) {
        await db.bookingAppointment.update({ where: { id: cita.id }, data: { status: "DESCARTADO" } });
    } else {
        await db.appointment.update({ where: { id: cita.id }, data: { status: "DESCARTADO" } });
    }
    void dispararLasAutomatizacionesDeCita(cita.sessionId, "DESCARTADO");
    console.info("[videollamada] el cliente dijo que no: la cita queda Descartado", { cita: cita.id, reserva: cita.esReserva });
    return { ok: true };
}

/** Se acabó el tiempo: el seguimiento pasa al WhatsApp del cliente. */
async function seguirPorWhatsapp(cita: CitaConLinea): Promise<ResultadoDeAtencion> {
    const remoteJid = cita.session?.remoteJid;
    if (!remoteJid) return { ok: false, motivo: "la cita no tiene una conversación de WhatsApp" };
    const r = await mandar(await laLineaDeLaCuenta(cita), remoteJid, elMensajeDeSeguimiento(elNombreDelProspecto(cita)), {
        citaId: cita.id,
        atencion: "seguimiento",
    });
    if (!r.ok) {
        console.warn("[videollamada] no salió el seguimiento por WhatsApp al cerrar", { cita: cita.id, motivo: r.motivo });
        return { ok: false, motivo: r.motivo ?? "no salió" };
    }
    console.info("[videollamada] reunión cerrada por tiempo: el seguimiento sigue por WhatsApp", { cita: cita.id });
    return { ok: true };
}

export async function atenderDesdeLaVideollamada(citaId: string, pedido: PedidoDeAtencion): Promise<ResultadoDeAtencion> {
    const cita = await laCitaDeLaVideollamada(citaId);
    if (!cita) return { ok: false, motivo: "la cita no existe" };

    const llave = await laLlave(citaId, pedido);
    const nuevo = await anotarElEnvio(citaId, llave);
    if (!nuevo) return { ok: true, repetido: true };

    try {
        const r =
            pedido.tipo === "descartado"
                ? await descartarLaCita(cita)
                : pedido.tipo === "seguimiento"
                  ? await seguirPorWhatsapp(cita)
                  : await avisarAlEquipo(cita, pedido);
        if (!r.ok) await soltarElEnvio(citaId, llave).catch(() => undefined);
        return r;
    } catch (error) {
        await soltarElEnvio(citaId, llave).catch(() => undefined);
        const motivo = error instanceof Error ? error.message : String(error);
        console.warn("[videollamada] no se pudo atender el pedido de la sala", { cita: citaId, tipo: pedido.tipo, motivo });
        return { ok: false, motivo };
    }
}
