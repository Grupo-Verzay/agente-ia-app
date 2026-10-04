/**
 * Las acciones de Propuestas de mentira, para pintar la pantalla en Chromium
 * sin servidor. Apuntan lo que se pidió y contestan como la de verdad.
 */
export const pedidas: { accion: string; args: unknown[] }[] = [];
const ok = (data: unknown) => ({ success: true as const, data });
let n = 0;
function plantilla(raw: any, id?: string) {
    return {
        id: id ?? `pl-nueva-${++n}`,
        nombre: String(raw?.nombre ?? ""),
        precio: Number(String(raw?.precio ?? "0").replace(/\./g, "")) || 0,
        moneda: raw?.moneda ?? "COP",
        caracteristicas: String(raw?.caracteristicas ?? "").split("\n").filter(Boolean),
        plan: raw?.plan ?? null,
        creadaEn: new Date().toISOString(),
        actualizadaEn: new Date().toISOString(),
    };
}
export async function crearPlantillaAction(raw: unknown) { pedidas.push({ accion: "crearPlantilla", args: [raw] }); return ok(plantilla(raw)); }
export async function editarPlantillaAction(id: string, raw: unknown) { pedidas.push({ accion: "editarPlantilla", args: [id, raw] }); return ok(plantilla(raw, id)); }
export async function borrarPlantillaAction(id: string) { pedidas.push({ accion: "borrarPlantilla", args: [id] }); return ok(null); }
export async function crearPropuestaAction(raw: unknown) { pedidas.push({ accion: "crearPropuesta", args: [raw] }); return { success: false as const, message: "banco" }; }
export async function editarPropuestaAction(id: string, raw: unknown) { pedidas.push({ accion: "editarPropuesta", args: [id, raw] }); return { success: false as const, message: "banco" }; }
export async function borrarPropuestaAction(id: string) { pedidas.push({ accion: "borrarPropuesta", args: [id] }); return ok(null); }
export async function enviarPropuestaPorWhatsappAction() { return { success: false as const, message: "banco" }; }
export async function ponerEsloganAction(e: string) { return ok(e); }

/** El plan que trae una plantilla enlazada. Se puede cambiar desde el banco. */
export let planDeMentira: any = null;
export function ponerElPlan(p: any) { planDeMentira = p; }
export async function cargarPlanEnLaPropuestaAction(id: string) {
    pedidas.push({ accion: "cargarPlan", args: [id] });
    if (!planDeMentira) return { success: false as const, message: "Esa plantilla no está enlazada a un plan del panel de Planes." };
    return ok({ plan: planDeMentira, avisos: planDeMentira.activo ? [] : [`El plan «${planDeMentira.nombre}» está apagado.`] });
}
