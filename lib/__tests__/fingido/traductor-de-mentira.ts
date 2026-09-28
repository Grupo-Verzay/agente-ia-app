/**
 * `createAiClient` de mentira, para el banco de la traducción de Chats.
 *
 * Traduce de forma que se pueda afirmar hacia dónde: al español antepone
 * «[ES] », a cualquier otro idioma «[XX] » con el nombre que venga en la
 * instrucción. Apunta cada llamada, así el banco sabe cuántas se hicieron (y
 * que sin créditos no se hace ninguna).
 */
export const llamadasAlTraductor: { apiKey: string; system: string; texto: string }[] = [];
let tokensQueDice: number | undefined = 50;
let revienta = false;

export function ponerTokensDelTraductor(n: number | undefined) {
    tokensQueDice = n;
}

export function queReviente(si: boolean) {
    revienta = si;
}

export const createAiClient = (_provider: string) => ({
    async complete(args: { apiKey: string; model: string; system: string; messages: { content: string }[] }) {
        const texto = String(args.messages?.[args.messages.length - 1]?.content ?? "");
        llamadasAlTraductor.push({ apiKey: args.apiKey, system: args.system, texto });
        if (revienta) throw new Error("la IA no contestó");
        const destino = /Traduce al ([^ ]+) /.exec(args.system)?.[1] ?? "?";
        const marca = destino === "español" ? "ES" : destino.slice(0, 2).toUpperCase();
        return { content: `[${marca}] ${texto}`, tokens: tokensQueDice };
    },
});
