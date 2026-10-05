import "server-only";

import { db } from "@/lib/db";
import type { EtapaDeLaFila } from "@/lib/embudos";
import { lasEtapasDeLaBandeja } from "@/lib/etapas-de-la-bandeja.server";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { laCita, elTelefono } from "@/lib/videollamada-en-vivo.server";
import { esLaCuentaDeVerzy, laConversacionDelCrm, type MensajeDelCrm } from "@/lib/videollamada-crm";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";
import { laZonaDeLaCuenta } from "@/lib/zona-de-la-cuenta";

/**
 * El acceso de Verzy a la cuenta REAL «Verzay Ventas». No es una sesión de
 * navegador ni un token que viaje: es el SERVIDOR leyendo esa cuenta, por una
 * vista firmada con la cita (`/videollamada/vista/crm`). Así vale en cualquier
 * videollamada, sin login, y lo que llega al marco es solo la ficha del
 * prospecto de ESA cita, de solo lectura.
 *
 * La cuenta sale de `VERZY_CUENTA_ID` (el stack) y, si no está, de su nombre.
 */

const MEMORIA_MS = 10 * 60_000;
let recordada: { en: number; id: string | null } | null = null;

export async function laCuentaDeVerzy(ahora = Date.now()): Promise<{ id: string; nombre: string } | null> {
    const fija = String(process.env.VERZY_CUENTA_ID ?? "").trim();
    if (!fija && recordada && ahora - recordada.en < MEMORIA_MS && recordada.id) {
        const c = await db.user.findUnique({ where: { id: recordada.id }, select: { id: true, company: true, name: true, email: true } });
        if (c) return { id: c.id, nombre: nombreDeLaCuenta(c) };
    }
    if (fija) {
        const c = await db.user.findUnique({ where: { id: fija }, select: { id: true, company: true, name: true, email: true } });
        if (c) return { id: c.id, nombre: nombreDeLaCuenta(c) };
        console.warn("[videollamada] VERZY_CUENTA_ID no es ninguna cuenta; se busca por nombre", { id: fija });
    }
    const candidatas = await db.user.findMany({
        where: {
            ownerId: null,
            OR: [{ company: { contains: "ventas", mode: "insensitive" } }, { name: { contains: "ventas", mode: "insensitive" } }],
        },
        select: { id: true, company: true, name: true, email: true },
        take: 50,
    });
    const la = candidatas.find((c) => esLaCuentaDeVerzy(c.company) || esLaCuentaDeVerzy(c.name));
    recordada = { en: ahora, id: la?.id ?? null };
    if (!la) {
        console.warn("[videollamada] no se encontró la cuenta «Verzay Ventas»: pon VERZY_CUENTA_ID en el stack");
        return null;
    }
    return { id: la.id, nombre: nombreDeLaCuenta(la) };
}

export type CrmDelProspecto = {
    cuenta: string;
    nombre: string;
    telefono: string;
    encontrado: boolean;
    estado: string | null;
    puntaje: number | null;
    porQue: string | null;
    etapa: EtapaDeLaFila | null;
    etiquetas: { nombre: string; color: string | null }[];
    recordatorios: { cuando: string; tipo: string; texto: string }[];
    citas: { cuando: string; estado: string }[];
    conversacion: (MensajeDelCrm & { hora: string })[];
};

type FilaDeMensaje = { messageId: string | null; fromMe: boolean; content: string | null; messageTimestamp: bigint | number | null };

export async function elCrmDelProspecto(citaId: string, ahora: Date = new Date()): Promise<CrmDelProspecto | null> {
    const cita = await laCita(citaId);
    if (!cita) return null;
    const cuenta = await laCuentaDeVerzy();
    if (!cuenta) return null;
    const zona = laZonaDeLaCuenta(cita.user?.timezone, laZonaDeLaCuenta(cita.timezone));
    const hora = (d: Date) => d.toLocaleString("es-CO", { timeZone: zona, dateStyle: "medium", timeStyle: "short" });
    const telefono = elTelefono(cita.session);
    const nombreDeLaCita = (cita.session?.customName || cita.clientName || cita.session?.pushName || "").trim() || "Prospecto";

    // Todas las identidades del contacto: las de su conversación y su número.
    const base = cita.session?.remoteJid || (telefono ? `${telefono}@s.whatsapp.net` : "");
    const identidades = base
        ? buildWhatsAppJidCandidates(base, [cita.session?.remoteJidAlt, telefono ? `${telefono}@s.whatsapp.net` : null])
        : [];
    const vacio: CrmDelProspecto = {
        cuenta: cuenta.nombre, nombre: nombreDeLaCita, telefono, encontrado: false, estado: null, puntaje: null,
        porQue: null, etapa: null, etiquetas: [], recordatorios: [], citas: [], conversacion: [],
    };
    if (!identidades.length) return vacio;

    const sesiones = await db.session.findMany({
        where: { userId: cuenta.id, OR: [{ remoteJid: { in: identidades } }, { remoteJidAlt: { in: identidades } }] },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
            id: true, userId: true, remoteJid: true, remoteJidAlt: true, pushName: true, customName: true,
            leadStatus: true, leadScore: true, leadScoreReason: true, assignedAdvisorId: true,
            sessionTags: { select: { tag: { select: { name: true, color: true } } } },
        },
    });
    const ses = sesiones[0];
    const todas = Array.from(new Set([...identidades, ...sesiones.flatMap((s) => [s.remoteJid, s.remoteJidAlt]).filter((j): j is string => !!j)]));

    const [etapas, lineas, citas, filas] = await Promise.all([
        ses ? lasEtapasDeLaBandeja([{ id: ses.id, userId: ses.userId, assignedAdvisorId: ses.assignedAdvisorId }]) : Promise.resolve(new Map()),
        db.instancia.findMany({ where: { userId: cuenta.id }, select: { instanceName: true, instanceId: true } }),
        sesiones.length
            ? db.appointment.findMany({
                where: { userId: cuenta.id, sessionId: { in: sesiones.map((s) => s.id) }, startTime: { gte: ahora } },
                orderBy: { startTime: "asc" },
                take: 5,
                select: { startTime: true, status: true },
            })
            : Promise.resolve([]),
        // Una rama por columna, cada una con su LIMIT: un OR sobre las tres no usa índice.
        db.$queryRaw<FilaDeMensaje[]>`
            (SELECT "messageId", "fromMe", "content", "messageTimestamp" FROM "chat_messages"
              WHERE "userId" = ${cuenta.id} AND "remoteJid" = ANY(${todas}::text[]) ORDER BY "messageTimestamp" DESC LIMIT 20)
            UNION ALL
            (SELECT "messageId", "fromMe", "content", "messageTimestamp" FROM "chat_messages"
              WHERE "userId" = ${cuenta.id} AND "remoteJidAlt" = ANY(${todas}::text[]) ORDER BY "messageTimestamp" DESC LIMIT 20)
            UNION ALL
            (SELECT "messageId", "fromMe", "content", "messageTimestamp" FROM "chat_messages"
              WHERE "userId" = ${cuenta.id} AND "senderPn" = ANY(${todas}::text[]) ORDER BY "messageTimestamp" DESC LIMIT 20)
        `.catch((error) => {
            console.warn("[videollamada] no se pudo leer la conversación del CRM", { cita: citaId, error });
            return [] as FilaDeMensaje[];
        }),
    ]);
    const nombresDeLinea = Array.from(new Set(lineas.flatMap((l) => [l.instanceName, l.instanceId]).filter(Boolean)));
    const pendientes = nombresDeLinea.length
        ? await db.seguimiento.findMany({
            where: { instancia: { in: nombresDeLinea }, remoteJid: { in: todas }, followUpStatus: "pending" },
            orderBy: { time: "asc" },
            take: 5,
            select: { time: true, tipo: true, mensaje: true },
        })
        : [];

    return {
        ...vacio,
        nombre: (ses?.customName || ses?.pushName || nombreDeLaCita).trim() || nombreDeLaCita,
        encontrado: !!ses,
        estado: ses?.leadStatus ?? null,
        puntaje: ses?.leadScore ?? null,
        porQue: ses?.leadScoreReason ?? null,
        etapa: ses ? etapas.get(ses.id) ?? null : null,
        etiquetas: ses ? ses.sessionTags.map((t) => ({ nombre: t.tag.name, color: t.tag.color })) : [],
        recordatorios: pendientes.map((s) => {
            const t = s.time ? new Date(s.time) : null;
            return {
                cuando: t && !Number.isNaN(t.getTime()) ? hora(t) : String(s.time ?? ""),
                tipo: s.tipo?.includes("ai-call") ? "Llamada" : "WhatsApp",
                texto: String(s.mensaje ?? "").slice(0, 160),
            };
        }),
        citas: citas.map((c) => ({ cuando: hora(c.startTime), estado: String(c.status) })),
        conversacion: laConversacionDelCrm(filas).map((m) => ({ ...m, hora: m.cuando ? hora(new Date(m.cuando * 1000)) : "" })),
    };
}
