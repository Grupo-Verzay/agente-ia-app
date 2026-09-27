import "server-only";

import { losTokensDelProveedor } from "@/lib/cobro-de-ia";
import { usarLaIaCobrando } from "@/lib/cobro-de-ia.server";

/**
 * Una llamada a `chat/completions` de OpenAI por `fetch`, COBRADA a la cuenta.
 *
 * La usan el generador del agente (`actions/generate-agent-flow.ts`) y el
 * simulador de chat (`actions/simulate-chat-actions.ts`), que hablan con OpenAI
 * a pelo y **caen a la llave de la plataforma** (`OPENAI_SYSTEM_API_KEY`) cuando
 * la cuenta no tiene la suya: sin cobro eso era IA que pagaba la casa entera.
 *
 * - Sin créditos no se hace la petición y se dice nombrando la cuenta.
 * - Una respuesta que no es 2xx **no se cobra**: OpenAI no la factura y
 *   devolverla como uso sería cobrar por un error.
 * - Lo que se cobra son los tokens de `usage` (o la estimación, nunca cero).
 */
export async function pedirAOpenAiCobrando(
    cuenta: string,
    donde: string,
    apiKey: string,
    cuerpo: { messages: { role: string; content: string }[]; [k: string]: unknown },
): Promise<{ ok: true; json: any } | { ok: false; error: string }> {
    const entrada = cuerpo.messages.map((m) => m.content).join("\n");
    try {
        const uso = await usarLaIaCobrando(cuenta, donde, async () => {
            const res = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify(cuerpo),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new ErrorDeOpenAi(`Error OpenAI ${res.status}: ${err?.error?.message ?? "desconocido"}`);
            }
            const json = await res.json();
            const salida = json?.choices?.[0]?.message?.content ?? "";
            return { valor: json, tokens: losTokensDelProveedor(json), entrada, salida };
        });
        if (!uso.ok) return { ok: false, error: uso.aviso };
        return { ok: true, json: uso.valor };
    } catch (err) {
        if (err instanceof ErrorDeOpenAi) return { ok: false, error: err.message };
        return { ok: false, error: `Error de red: ${(err as Error)?.message ?? "desconocido"}` };
    }
}

class ErrorDeOpenAi extends Error {}
