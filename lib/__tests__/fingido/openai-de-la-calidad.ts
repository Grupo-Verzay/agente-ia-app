/**
 * El doble del paquete `openai` para el banco de la CALIDAD SEMANAL.
 *
 * El corte semanal llama al runner SIN inyectar `pedir`, o sea por el camino
 * de verdad (`pedirALaIaDeVerdad` → `openai`). Este doble contesta la rúbrica:
 * una conversación donde escribe «Ana» sale con 100, cualquier otra con 50, y
 * así el mejor asesor se puede afirmar.
 */
export const pedidosALaIa: string[] = [];

class OpenAiDeLaCalidad {
    chat = {
        completions: {
            create: async ({ messages }: { messages?: { role: string; content: string }[] }) => {
                const texto = messages?.find((m) => m.role === "user")?.content ?? "";
                pedidosALaIa.push(texto);
                const nota = texto.includes("Ana") ? 100 : 50;
                const content = JSON.stringify({ saludo: nota, tono: nota, resolvio: "si", mejora: "Seguir así." });
                return { choices: [{ message: { content } }], usage: { total_tokens: 1000 } };
            },
        },
    };
    constructor(_opciones?: { apiKey?: string }) {}
}

export default OpenAiDeLaCalidad;
