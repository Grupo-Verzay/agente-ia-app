import "server-only";

import { db } from "@/lib/db";
import { laLineaDeLaNotificacionDeCita } from "@/lib/agenda-de-la-familia";
import { esLineaDeWhatsappQr } from "@/lib/linea-de-whatsapp";
import { losNombresDeLosNiveles } from "@/lib/nombre-del-nivel";
import { elEnvioArmado, elNivelNombrado, type OrdenDeEnvio } from "@/lib/pantalla-del-avatar";
import { anotarElEnvio, soltarElEnvio } from "@/lib/videollamada-ia-db";
import { elOrigenPublico } from "@/lib/videollamada-ia.server";

/**
 * Lo que el avatar manda por WhatsApp DURANTE la videollamada (la web, la
 * página de un plan o el enlace para pagarlo). Sale al número del prospecto
 * de ESA cita, por la línea de su conversación —la misma regla que el aviso
 * de cambio de estado de una cita— y queda escrito en su chat. Cada enlace
 * sale UNA vez por cita (`anotarElEnvio`); si no sale, la marca se suelta
 * para poder reintentar. Nunca mudo.
 */
export type ResultadoDelEnvio =
    | { ok: true; repetido: boolean; enlace: string }
    | { ok: false; motivo: string };

export async function enviarDesdeLaVideollamada(citaId: string, orden: OrdenDeEnvio): Promise<ResultadoDelEnvio> {
    const cita = await db.appointment.findUnique({
        where: { id: citaId },
        select: {
            id: true,
            userId: true,
            session: { select: { remoteJid: true, instanceId: true } },
            user: {
                select: {
                    apiKey: { select: { url: true, key: true } },
                    instancias: { orderBy: { id: "asc" }, select: { instanceName: true, instanceType: true } },
                },
            },
        },
    });
    if (!cita) return { ok: false, motivo: "la cita no existe" };
    if (!cita.session?.remoteJid) {
        console.warn("[videollamada] no hay conversación a la que mandar el enlace", { cita: citaId });
        return { ok: false, motivo: "la cita no tiene una conversación de WhatsApp" };
    }

    const filas = await db.subscriptionPlan.findMany({
        select: { plan: true, name: true, isResellerPlan: true, updatedAt: true },
    });
    const nombres = losNombresDeLosNiveles(filas);
    const nivel = elNivelNombrado(orden.plan, nombres);
    const armado = elEnvioArmado(orden, {
        origen: elOrigenPublico(),
        nivel,
        nombreDelPlan: nivel ? (nombres[nivel] ?? null) : null,
    });
    if ("motivo" in armado) {
        console.warn("[videollamada] no se armó el envío", { cita: citaId, orden, motivo: armado.motivo });
        return { ok: false, motivo: armado.motivo };
    }

    const nuevo = await anotarElEnvio(citaId, armado.llave);
    if (!nuevo) return { ok: true, repetido: true, enlace: armado.enlace };

    const instanceName = laLineaDeLaNotificacionDeCita({
        lineaDeLaConversacion: cita.session.instanceId,
        lineasDeLaDuena: (cita.user?.instancias ?? []).map((i) => ({
            instanceName: i.instanceName,
            esQr: esLineaDeWhatsappQr(i.instanceType),
        })),
    });
    if (!instanceName) {
        await soltarElEnvio(citaId, armado.llave).catch(() => undefined);
        console.warn("[videollamada] la cuenta no tiene línea para mandar el enlace", { cita: citaId, cuenta: cita.userId });
        return { ok: false, motivo: "la cuenta no tiene una línea de WhatsApp conectada" };
    }

    const { enviarConHistorial } = await import("@/lib/envio-con-historial.server");
    const apiKeyUrl = cita.user?.apiKey?.url;
    try {
        const r = await enviarConHistorial({
            instanceName,
            url: apiKeyUrl ? `https://${apiKeyUrl}/message/sendText/${instanceName}` : undefined,
            apikey: cita.user?.apiKey?.key ?? undefined,
            remoteJid: cita.session.remoteJid,
            message: armado.mensaje,
            historyType: "notification",
            additionalKwargs: { source: "VideollamadaIA", citaId, que: orden.que, llave: armado.llave },
        });
        if (!r.success) throw new Error(r.message || "no salió");
        console.info("[videollamada] enlace mandado por WhatsApp", { cita: citaId, llave: armado.llave, linea: instanceName });
        return { ok: true, repetido: false, enlace: armado.enlace };
    } catch (error) {
        await soltarElEnvio(citaId, armado.llave).catch(() => undefined);
        const motivo = error instanceof Error ? error.message : String(error);
        console.warn("[videollamada] no salió el enlace por WhatsApp", { cita: citaId, llave: armado.llave, motivo });
        return { ok: false, motivo };
    }
}
