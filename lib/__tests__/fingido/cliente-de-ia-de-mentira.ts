/**
 * `createAiClient` de mentira, para el banco del cobro de IA. Contesta siempre
 * lo mismo, dice los tokens que se le pongan y apunta cada llamada: así el
 * banco puede afirmar que SIN créditos la IA no se llama nunca, y que lo que
 * se descuenta son los tokens que dijo el proveedor.
 *
 * El mismo registro lo comparten los dobles de `openai` y `@google/genai`
 * (`openai-de-mentira.ts`, `google-genai-de-mentira.ts`) y el `fetch` que el
 * banco pone a OpenAI: una llamada es una llamada, venga por donde venga.
 */
export const llamadasALaIa: { provider: string; model: string; apiKey: string; donde?: string }[] = [];
let tokensQueDice: number | undefined = 321;

export function ponerTokensQueDice(n: number | undefined) {
    tokensQueDice = n;
}

export function losTokensQueDice(): number | undefined {
    return tokensQueDice;
}

export const createAiClient = (provider: string) => ({
    async complete(args: { apiKey: string; model: string; system: string; messages: { content: string }[] }) {
        llamadasALaIa.push({ provider, model: args.model, apiKey: args.apiKey });
        // Si le preguntan por el sentimiento, contesta una palabra de la lista.
        let content = /CÓMO SE SIENTE EL CLIENTE/.test(args.system) ? "negativo" : "Claro, con gusto te ayudo.";
        // El asistente de prompts (analizar instrucción) espera un JSON.
        if (/sectionKey/.test(args.system)) {
            content = '{"sectionKey":"faq","title":"Medios de pago","mainMessage":"Nequi y Bancolombia"}';
        }
        return { content, tokens: tokensQueDice };
    },
});
