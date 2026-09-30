/** Manuales de mentira: los pone el banco en `window.__manuales`. */
const w = globalThis as any;
export async function getManuals() { return { success: true as const, data: w.__manuales ?? [] }; }
export async function createManual() { return { success: true as const, data: null }; }
export async function updateManual() { return { success: true as const, data: null }; }
export async function deleteManual() { return { success: true as const, data: null }; }
