/** Tutoriales (`GuidesUrl`) de mentira: los pone el banco en `window.__guias`. */
const w = globalThis as any;
export async function getAllGuides() { return { success: true as const, data: w.__guias ?? [] }; }
export async function createGuide() { return { success: true as const, data: null }; }
export async function updateGuide() { return { success: true as const, data: null }; }
export async function deleteGuide() { return { success: true as const, data: null }; }
