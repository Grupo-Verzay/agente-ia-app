/**
 * El doble de `@google/genai`, inyectado con un alias de esbuild.
 *
 * Lo que este banco tiene que poder afirmar no es que Google conteste: es **con
 * qué se le llama** —la clave que se le pasa, el modelo, y si la imagen ya
 * generada viaja dentro de la petición— y qué se hace con lo que devuelve. Por
 * eso el doble APUNTA cada llamada en vez de limitarse a contestar.
 */

export interface LlamadaAGemini {
    clave: string;
    modelo: string;
    /** El texto del prompt, para poder leer las reglas de la red que se pidió. */
    prompt: string;
    /** `true` si la imagen ya creada viajó dentro de la petición. */
    conImagen: boolean;
}

export const gemini = {
    llamadas: [] as LlamadaAGemini[],
    /** Lo que contesta el modelo. Una cadena, o un `Error` para el camino que falla. */
    respuesta: "" as string | Error,
};

export function ponerLoQueDiceGemini(respuesta: string | Error) {
    gemini.respuesta = respuesta;
    gemini.llamadas = [];
}

export function loQueSeLePidioAGemini(): LlamadaAGemini[] {
    return gemini.llamadas;
}

type Parte = { text?: string; inlineData?: { data: string; mimeType: string } };

export class GoogleGenAI {
    private clave: string;

    constructor(opciones?: { apiKey?: string }) {
        this.clave = opciones?.apiKey ?? "";
    }

    models = {
        generateContent: async ({
            model,
            contents,
        }: {
            model: string;
            contents: { parts: Parte[] };
        }) => {
            const partes = contents?.parts ?? [];
            gemini.llamadas.push({
                clave: this.clave,
                modelo: model,
                prompt: partes.map((p) => p.text ?? "").join(""),
                conImagen: partes.some((p) => Boolean(p.inlineData?.data)),
            });

            if (gemini.respuesta instanceof Error) throw gemini.respuesta;
            return { candidates: [{ content: { parts: [{ text: gemini.respuesta }] } }] };
        },
    };
}
