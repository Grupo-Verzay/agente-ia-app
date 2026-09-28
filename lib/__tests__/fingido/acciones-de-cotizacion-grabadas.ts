// Las acciones de Entrenamiento › Cotizaciones, grabadas en `window` para que
// el banco de navegador vea qué se guardó y cuándo.
type Ajustes = { activa: boolean; instrucciones: string };
const w = globalThis as unknown as { __guardados?: Array<{ cuentaId: string; ajustes: Ajustes }> };

export async function guardarAjustesDeCotizacionAction(cuentaId: string, ajustes: Ajustes) {
    (w.__guardados ??= []).push({ cuentaId, ajustes: { ...ajustes } });
    return { success: true, message: "Guardado.", data: { activa: ajustes.activa === true, instrucciones: String(ajustes.instrucciones ?? "").trim() } };
}
export async function leerAjustesDeCotizacionAction() {
    return { success: true, message: "", data: { activa: false, instrucciones: "" } };
}
