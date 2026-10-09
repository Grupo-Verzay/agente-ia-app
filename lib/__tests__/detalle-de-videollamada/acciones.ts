/**
 * Las acciones que el diálogo del detalle pide, para el banco
 * `scripts/banco-detalle-de-videollamada.sh`. La fila sale de `raw.call` TAL
 * COMO la deja la App (la transcripción de Tavus y la grabación de la sala),
 * leída con el `elCallRowDesdeLaFila` del árbol que se pinta: en modo roto,
 * el de antes.
 */
import { elCallRowDesdeLaFila } from "@/lib/fila-de-llamada";

export const TRANSCRIPCION =
    "Asistente: Hola, muy buenas, ¿me escuchas?\nCliente: Sí, perfecto.\nAsistente: Te enseño cómo se ven tus chats en Verzay.";
export const RESUMEN = "- El cliente vio la demo de Chats.\n- Quedó en crear su cuenta hoy.";

export function laFilaDeTavus(videoUrl: string | null) {
    return elCallRowDesdeLaFila({
        id: "v1",
        userId: "cuenta",
        instanceName: "linea",
        remoteJid: "573001112233@s.whatsapp.net",
        fromMe: true,
        pushName: "Alexis",
        messageTimestamp: new Date(Date.UTC(2026, 9, 9, 15, 0, 0)),
        raw: {
            call: {
                direction: "outgoing",
                isVideo: true,
                isBot: true,
                provider: "tavus",
                durationSecs: 312,
                transcript: TRANSCRIPCION,
                summary: RESUMEN,
                citaId: "cita-1",
                ...(videoUrl ? { hasRecording: true, recordingUrl: "/audio.webm", videoUrl } : { hasRecording: false }),
            },
        },
    });
}

let fila: ReturnType<typeof laFilaDeTavus> | null = null;
export function ponerLaFila(f: ReturnType<typeof laFilaDeTavus>) {
    fila = f;
}
export async function getCallDetailAction() {
    return fila;
}
export const reintentarLaTranscripcionAction = async () => ({ success: true as const });
