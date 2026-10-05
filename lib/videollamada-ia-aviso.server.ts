import "server-only";

import { db } from "@/lib/db";
import { persistChatMessage } from "@/lib/chat-persistence";
import { usarLaIaCobrando } from "@/lib/cobro-de-ia.server";
import { laIaDeLaCuenta } from "@/lib/cliente-de-ia.server";
import { SUMMARY_SYSTEM } from "@/lib/grabacion-de-llamada.server";
import { conElNombreDeLaMarca } from "@/lib/nombres-de-la-marca";
import { laLineaDeWhatsappDeLaCuenta } from "@/lib/linea-de-whatsapp";
import { laTranscripcionDeTavus, queHaceElAvisoDeTavus } from "@/lib/videollamada-ia";
import {
    apuntarElMensaje,
    apuntarLaGrabacion,
    guardarLaTranscripcion,
    laVideollamada,
    marcarFinalizada,
} from "@/lib/videollamada-ia-db";

/**
 * Lo que se hace con un aviso de Tavus (su `callback_url`). Lo llama
 * `/api/videollamada/tavus` después de comprobar la firma de la cita.
 *
 * La transcripción entra al CRM IGUAL que una llamada de voz: una fila de
 * `chat_messages` con `messageType: 'call'` y su `raw.call` (`isVideo`,
 * `transcript`, `summary`), en la conversación de la cita. Así sale en la
 * burbuja de Chats y en CRM › Llamadas sin una pantalla nueva.
 */
export async function procesarElAvisoDeTavus(citaId: string, cuerpo: unknown): Promise<{ hecho: string }> {
    const aviso = queHaceElAvisoDeTavus(cuerpo);
    const fila = await laVideollamada(citaId);
    if (!fila) {
        console.warn("[videollamada] aviso de Tavus de una cita sin videollamada", { cita: citaId, evento: aviso.evento });
        return { hecho: "sin_videollamada" };
    }
    if (aviso.conversacionId && fila.conversacionId && aviso.conversacionId !== fila.conversacionId) {
        // Una conversación vieja de la misma cita (se volvió a crear): no pisa a la vigente.
        console.warn("[videollamada] aviso de otra conversación de la misma cita", { cita: citaId });
        return { hecho: "otra_conversacion" };
    }

    if (aviso.accion === "grabacion") {
        if (aviso.grabacionUrl) await apuntarLaGrabacion(citaId, aviso.grabacionUrl);
        return { hecho: "grabacion" };
    }
    if (aviso.accion === "terminada") {
        await marcarFinalizada(citaId);
        return { hecho: "terminada" };
    }
    if (aviso.accion !== "transcripcion") return { hecho: "ignorado" };

    const transcripcion = conElNombreDeLaMarca(laTranscripcionDeTavus(aviso.frases));
    if (!transcripcion) {
        await marcarFinalizada(citaId);
        console.info("[videollamada] Tavus terminó sin transcripción", { cita: citaId });
        return { hecho: "sin_texto" };
    }

    const resumen = await elResumen(fila.cuentaId, transcripcion);
    const escribio = await guardarLaTranscripcion(citaId, transcripcion, resumen);
    if (!escribio) return { hecho: "repetido" };

    try {
        const mensajeId = await anotarEnElCrm(citaId, transcripcion, resumen);
        if (mensajeId) await apuntarElMensaje(citaId, mensajeId);
    } catch (error) {
        console.error("[videollamada] no se pudo anotar la videollamada en el CRM", {
            cita: citaId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return { hecho: "transcripcion" };
}

/** El resumen con la IA de la cuenta, cobrado a ella. Sin IA o sin créditos: `null`, y se dice. */
async function elResumen(cuentaId: string, transcripcion: string): Promise<string | null> {
    try {
        const ia = await laIaDeLaCuenta(cuentaId);
        if (!ia.success || !ia.data) {
            console.info("[videollamada] sin IA para resumir", { cuenta: cuentaId, motivo: ia.message });
            return null;
        }
        const { provider, model, apiKey } = ia.data;
        const uso = await usarLaIaCobrando(cuentaId, "videollamada-resumen", async () => {
            const { OpenAiClient, GoogleAiClient } = await import("@/actions/open-ai-actions");
            const cliente = provider === "google" ? new GoogleAiClient() : new OpenAiClient();
            const r = await cliente.complete({
                apiKey,
                model,
                system: SUMMARY_SYSTEM,
                messages: [{ role: "user", content: transcripcion }],
            });
            return { valor: r.content, tokens: r.tokens, entrada: transcripcion, salida: r.content };
        });
        if (!uso.ok) return null;
        const resumen = conElNombreDeLaMarca(String(uso.valor ?? "").trim());
        return resumen || null;
    } catch (error) {
        console.warn("[videollamada] no salió el resumen", {
            cuenta: cuentaId,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

async function anotarEnElCrm(citaId: string, transcripcion: string, resumen: string | null): Promise<string | null> {
    const cita = await db.appointment.findUnique({
        where: { id: citaId },
        select: {
            userId: true,
            startTime: true,
            session: { select: { remoteJid: true, remoteJidAlt: true, instanceId: true, pushName: true } },
        },
    });
    if (!cita?.session) {
        console.warn("[videollamada] la cita no tiene conversación donde anotar", { cita: citaId });
        return null;
    }
    const linea =
        (await db.instancia.findFirst({
            where: {
                userId: cita.userId,
                OR: [{ instanceName: cita.session.instanceId }, { instanceId: cita.session.instanceId }],
            },
            select: { instanceName: true },
        })) ?? (await laLineaDeWhatsappDeLaCuenta(cita.userId)).linea;
    const instanceName = linea?.instanceName || cita.session.instanceId || "llamadas";

    const fila = await laVideollamada(citaId);
    const entro = fila?.entroEn ? new Date(fila.entroEn).getTime() : cita.startTime.getTime();
    const durationSecs = Math.max(0, Math.round((Date.now() - entro) / 1000));
    const grabacion = await db.$queryRaw<{ grabacionUrl: string | null }[]>`
        SELECT "grabacionUrl" FROM "videollamadas_ia" WHERE "citaId" = ${citaId} LIMIT 1
    `.catch(() => [] as { grabacionUrl: string | null }[]);
    const recordingUrl = grabacion[0]?.grabacionUrl ?? null;

    const messageId = `tavus_${citaId}`;
    await persistChatMessage({
        userId: cita.userId,
        instanceName,
        remoteJid: cita.session.remoteJid,
        remoteJidAlt: cita.session.remoteJidAlt ?? undefined,
        messageId,
        fromMe: true,
        messageType: "call",
        content: "Videollamada con IA realizada",
        raw: {
            call: {
                direction: "outgoing",
                isVideo: true,
                isBot: true,
                provider: "tavus",
                durationSecs,
                transcript: transcripcion,
                ...(resumen ? { summary: resumen } : {}),
                hasRecording: Boolean(recordingUrl),
                ...(recordingUrl ? { recordingUrl } : {}),
                citaId,
            },
        },
        messageTimestamp: new Date(),
    });
    console.info("[videollamada] anotada en el CRM", { cita: citaId, cuenta: cita.userId, instanceName });
    return messageId;
}
