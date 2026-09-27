/**
 * La IA de la sugerencia, fingida: apunta a qué cuenta se le pidió y con qué
 * correo, y contesta. Lo que se prueba es que la ACCIÓN relee el correo del
 * proveedor y pregunta con la cuenta de quien trabaja —no lo que diga el
 * navegador—; la llamada a OpenAI o Google es la de Chats y no se repite aquí.
 */
const g = globalThis as any;
export const INSTRUCCION_DEL_CORREO = "fingida";
export async function pedirSugerenciaALaIa(cuentaId: string, correo: { de: string; asunto: string; texto: string }, borrador: string) {
    (g.__ia ??= []).push({ cuentaId, correo, borrador });
    if (g.__sinIa) return { ok: false as const, motivo: "La cuenta no tiene una IA configurada." };
    return { ok: true as const, texto: `Hola ${correo.de}, gracias por tu correo.` };
}
