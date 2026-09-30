/**
 * El orden propio, de mentira en el navegador: lo que se guarda se APUNTA en
 * `window.__guardado`, para que el banco compruebe que arrastrar pide guardar
 * la lista entera y en el orden nuevo.
 */
const w = globalThis as any;
export async function leerMiOrdenAction() { return { success: true as const, data: w.__orden ?? {} }; }
export async function guardarMiOrdenAction(tipo: string, ids: string[]) {
    (w.__guardado ??= []).push({ tipo, ids });
    return { success: true as const, data: null };
}
