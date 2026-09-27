/**
 * `createAiClient` de mentira, para el banco del cobro de IA. Contesta siempre
 * lo mismo, dice los tokens que se le pongan y apunta cada llamada: así el
 * banco puede afirmar que SIN créditos la IA no se llama nunca, y que lo que
 * se descuenta son los tokens que dijo el proveedor.
 */
export const llamadasALaIa: { provider: string; model: string; apiKey: string }[] = [];
let tokensQueDice: number | undefined = 321;

export function ponerTokensQueDice(n: number | undefined) {
    tokensQueDice = n;
}

export const createAiClient = (provider: string) => ({
    async complete(args: { apiKey: string; model: string; system: string; messages: { content: string }[] }) {
        llamadasALaIa.push({ provider, model: args.model, apiKey: args.apiKey });
        // Si le preguntan por el sentimiento, contesta una palabra de la lista.
        const content = /CÓMO SE SIENTE EL CLIENTE/.test(args.system) ? "negativo" : "Claro, con gusto te ayudo.";
        return { content, tokens: tokensQueDice };
    },
});
