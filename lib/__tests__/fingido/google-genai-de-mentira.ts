/**
 * `@google/genai` de mentira, para el banco del cobro de IA. El modelo de texto
 * (el del copy) devuelve texto; cualquier otro devuelve una imagen. Apunta cada
 * llamada en el registro común y dice `usageMetadata` con los tokens puestos.
 */
import { llamadasALaIa, losTokensQueDice } from "./cliente-de-ia-de-mentira";

export class GoogleGenAI {
    private apiKey: string;
    constructor(opts: { apiKey: string }) {
        this.apiKey = opts.apiKey;
    }
    models = {
        generateContent: async (args: { model: string }) => {
            llamadasALaIa.push({ provider: "google", model: args.model, apiKey: this.apiKey });
            const t = losTokensQueDice();
            const texto = args.model === "gemini-2.5-flash";
            return {
                text: texto ? "Tu mejor aliado. Pídelo hoy." : undefined,
                candidates: [
                    {
                        content: {
                            parts: texto ? [{ text: "Tu mejor aliado. Pídelo hoy." }] : [{ inlineData: { data: "QUJD" } }],
                        },
                    },
                ],
                ...(t === undefined ? {} : { usageMetadata: { totalTokenCount: t } }),
            };
        },
        generateImages: async (args: { model: string }) => {
            llamadasALaIa.push({ provider: "google", model: args.model, apiKey: this.apiKey });
            return { generatedImages: [{ image: { imageBytes: "QUJD" } }] };
        },
    };
}
