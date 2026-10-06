/**
 * OpenAI del banco. Contesta según la clave, como la de verdad:
 * «sk-buena…» transcribe, «sk-sinsaldo…» da 429 insufficient_quota y
 * cualquier otra 401 invalid_api_key. Apunta cada clave usada.
 */
const usadas = (): string[] =>
  ((globalThis as unknown as { __clavesUsadas?: string[] }).__clavesUsadas ??= []);

class ErrorDeOpenAi extends Error {
  status: number; code: string;
  constructor(status: number, code: string) { super(`${status} ${code}`); this.status = status; this.code = code; }
}

export default class OpenAI {
  apiKey: string;
  constructor(o: { apiKey: string }) { this.apiKey = o.apiKey; }
  audio = {
    transcriptions: {
      create: async () => {
        usadas().push(this.apiKey);
        if (this.apiKey.startsWith("sk-buena")) return { text: "hola, quiero una cita" };
        if (this.apiKey.startsWith("sk-sinsaldo")) throw new ErrorDeOpenAi(429, "insufficient_quota");
        throw new ErrorDeOpenAi(401, "invalid_api_key");
      },
    },
  };
}
