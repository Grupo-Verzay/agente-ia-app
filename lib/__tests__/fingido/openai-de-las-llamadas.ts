/**
 * El doble del paquete `openai`, inyectado con un alias de esbuild.
 *
 * Cubre las **dos** cosas que la App le pide: la transcripción del audio
 * (`audio.transcriptions.create`) y el resumen (`chat.completions.create`,
 * que es lo que usa `OpenAiClient`). Con una sola de las dos, la mitad del
 * camino se quedaría sin ejercer y el banco saldría verde sin haber probado
 * que el resumen llega a la fila.
 *
 * Vive aparte del `openai-de-mentira.ts` del banco del cobro de IA, que
 * contesta otras cosas: compartiendo fichero, el #993 lo reescribió y los
 * bancos de llamadas se quedaron sin `audio.transcriptions` sin enterarse.
 * Apunta además con QUÉ CLAVE se pidió, que es la mitad de «quién paga».
 */
import { laIa } from "./ia-de-mentira";

class OpenAiDeMentira {
    audio = {
        transcriptions: {
            create: async ({ model, prompt }: { file: unknown; model: string; prompt?: string }) => {
                // El `prompt` se apunta porque es la MITAD de arriba del
                // arreglo del nombre de la marca: sin el vocabulario, Whisper
                // escribe «Versailles» y la red de abajo tiene que trabajar
                // siempre.
                laIa.pedidos.push({ que: "transcribir" as const, modelo: model, pista: prompt ?? "", clave: this.apiKey });
                return { text: laIa.transcripcion };
            },
        },
    };

    chat = {
        completions: {
            create: async ({ model, messages }: { model: string; messages?: { role: string; content: string }[] }) => {
                const sistema = messages?.find((m) => m.role === "system")?.content ?? "";
                if (sistema.includes("Clasifica el resultado")) {
                    laIa.pedidos.push({ que: "clasificar" as const, modelo: model, clave: this.apiKey });
                    return { choices: [{ message: { content: laIa.resultado } }] };
                }
                laIa.pedidos.push({ que: "resumir" as const, modelo: model, clave: this.apiKey });
                return { choices: [{ message: { content: laIa.resumen } }] };
            },
        },
    };

    private apiKey: string;
    constructor(opciones?: { apiKey?: string }) {
        this.apiKey = opciones?.apiKey ?? "";
    }
}

export default OpenAiDeMentira;
