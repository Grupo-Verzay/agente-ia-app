/**
 * `getMacrosAction` de mentira, para el banco de la ruedita del menú «Macros»
 * de Chats. Devuelve las macros que el arnés deja en `window.__macros`: las
 * mismas de la guía, con sus nombres y colores, para medir la fila con los
 * nombres que de verdad se ven.
 */
export async function getMacrosAction() {
    const data = ((globalThis as any).__macros ?? []) as unknown[];
    return { success: true, data };
}
