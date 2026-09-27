/**
 * El paquete `openai` de mentira, para el banco del cobro de IA. Apunta cada
 * llamada en el mismo registro que `createAiClient` y devuelve `usage` con los
 * tokens que el banco le ponga (o sin `usage`, para probar la estimación).
 */
import { llamadasALaIa, losTokensQueDice } from "./cliente-de-ia-de-mentira";

export default class OpenAI {
    private apiKey: string;
    constructor(opts: { apiKey: string }) {
        this.apiKey = opts.apiKey;
    }
    chat = {
        completions: {
            create: async (body: { model: string; messages: { content: string }[] }) => {
                llamadasALaIa.push({ provider: "openai", model: body.model, apiKey: this.apiKey });
                const todo = body.messages.map((m) => m.content).join("\n");
                const content = /Lead Score/.test(todo) ? '{"score":72,"reason":"interesado"}' : "{}";
                const t = losTokensQueDice();
                return {
                    choices: [{ message: { content } }],
                    ...(t === undefined ? {} : { usage: { total_tokens: t } }),
                };
            },
        },
    };
}
