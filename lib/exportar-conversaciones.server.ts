import "server-only";

import { db } from "@/lib/db";
import { getPersistedMessages, resolveInstanceOwner } from "@/lib/chat-persistence";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";
import {
    aMensajeLegible,
    TOPE_DE_MENSAJES_POR_CONVERSACION,
    type MensajeLegible,
} from "@/lib/conversacion-legible";

/**
 * Leer UNA conversación entera de nuestra base, para exportarla o evaluarla.
 *
 * Va por `getPersistedMessages`, que es el lector de siempre: busca por las
 * TRES columnas de identidad (`remoteJid`, `remoteJidAlt`, `senderPn`) y
 * deduplica por el id de WhatsApp. Preguntar por una sola forma del contacto
 * «devuelve correcto y vacío», que es la regla de siempre de Chats.
 *
 * **No decide ningún acceso**: la lista de cuentas la pone quien llama, después
 * de haber comprobado que la línea se alcanza.
 */
const POR_PAGINA = 500;

export async function leerLaConversacion(params: {
    userIds: string[];
    instanceName: string;
    remoteJid: string;
    aliases?: string[];
    tope?: number;
}): Promise<{ mensajes: MensajeLegible[]; recortada: boolean }> {
    const tope = Math.max(1, Math.min(params.tope ?? TOPE_DE_MENSAJES_POR_CONVERSACION, TOPE_DE_MENSAJES_POR_CONVERSACION));
    const esGrupo = params.remoteJid.toLowerCase().endsWith("@g.us");
    const salida: MensajeLegible[] = [];
    let salta = 0;
    for (;;) {
        const pide = Math.min(POR_PAGINA, tope - salida.length + 1);
        const pagina = await getPersistedMessages({
            userIds: params.userIds,
            remoteJid: params.remoteJid,
            instanceName: params.instanceName,
            aliases: params.aliases ?? [],
            take: pide,
            skip: salta,
        });
        for (const ev of pagina) salida.push(aMensajeLegible(ev, { esGrupo }));
        salta += pagina.length;
        if (pagina.length < pide || salida.length > tope) break;
    }
    const recortada = salida.length > tope;
    return { mensajes: recortada ? salida.slice(0, tope) : salida, recortada };
}

/**
 * El nombre del contacto y de la línea, sacados de NUESTRA base y no del
 * navegador: el archivo lleva el nombre en la cabecera, y el que manda es el
 * mismo que pinta la bandeja (`customName` por encima de `pushName`).
 */
export async function losNombresDeLaConversacion(params: {
    duenoId: string;
    instanceName: string;
    instanceId: string | null;
    remoteJid: string;
    aliases?: string[];
}): Promise<{ contacto: string | null; linea: string; sessionId: number | null; asesorId: string | null }> {
    const candidatos = buildWhatsAppJidCandidates(params.remoteJid, params.aliases ?? []);
    const [sesion, instancia] = await Promise.all([
        db.session.findFirst({
            where: {
                userId: params.duenoId,
                ...(params.instanceId ? { instanceId: params.instanceId } : {}),
                OR: [{ remoteJid: { in: candidatos } }, { remoteJidAlt: { in: candidatos } }],
            },
            select: { id: true, customName: true, pushName: true, assignedAdvisorId: true },
            orderBy: { updatedAt: "desc" },
        }),
        db.instancia.findFirst({
            where: { instanceName: params.instanceName },
            select: { displayName: true },
        }),
    ]);
    return {
        contacto: sesion?.customName?.trim() || sesion?.pushName?.trim() || null,
        linea: instancia?.displayName?.trim() || params.instanceName,
        sessionId: sesion?.id ?? null,
        asesorId: sesion?.assignedAdvisorId ?? null,
    };
}

export { resolveInstanceOwner };
