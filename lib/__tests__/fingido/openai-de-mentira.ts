/**
 * El doble del paquete `openai`, inyectado con un alias de esbuild.
 *
 * Cubre las **dos** cosas que la App le pide: la transcripción del audio
 * (`audio.transcriptions.create`) y el resumen (`chat.completions.create`,
 * que es lo que usa `OpenAiClient`). Con una sola de las dos, la mitad del
 * camino se quedaría sin ejercer y el banco saldría verde sin haber probado
 * que el resumen llega a la fila.
 */
import { laIa } from "./ia-de-mentira";

class OpenAiDeMentira {
    audio = {
        transcriptions: {
            create: async ({ model }: { file: unknown; model: string }) => {
                laIa.pedidos.push({ que: "transcribir" as const, modelo: model });
                return { text: laIa.transcripcion };
            },
        },
    };

    chat = {
        completions: {
            create: async ({ model }: { model: string }) => {
                laIa.pedidos.push({ que: "resumir" as const, modelo: model });
                return { choices: [{ message: { content: laIa.resumen } }] };
            },
        },
    };

    constructor(_opciones?: { apiKey?: string }) {}
}

export default OpenAiDeMentira;
