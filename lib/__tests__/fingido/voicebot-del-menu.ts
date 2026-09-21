/**
 * `startBotCallAction` apuntado: anota con qué número y con qué LÍNEA se llamó.
 *
 * Es lo único que hay que poder afirmar de la opción «Llamar con IA»: la acción
 * de verdad habla con el servidor de llamadas, y lo que este banco discute no
 * es lo que hace allí sino **qué se le entrega desde la conversación abierta**.
 */
export async function startBotCallAction(phone: string, lineaDeLaConversacion?: string | null) {
    const w = globalThis as unknown as { __llamadasIa?: { phone: string; linea: string | null }[] };
    (w.__llamadasIa ??= []).push({ phone, linea: lineaDeLaConversacion ?? null });
    return { success: true };
}
