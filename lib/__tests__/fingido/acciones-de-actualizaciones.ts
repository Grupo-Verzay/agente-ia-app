/**
 * Las acciones de actualizaciones para la ventana en el NAVEGADOR: un doble que
 * guarda estado como lo guardaría la base —una pendiente hasta que se marca— y
 * APUNTA cada marca, para poder afirmar con qué se despidió la persona.
 */
type A = { id: string; texto: string; archivo: unknown; publicadaEn: string; publicadaPor: string | null };

const w = window as unknown as {
    __pendiente: A | null;
    __marcas: { id: string; como: string }[];
};
w.__marcas ??= [];

export async function miActualizacionPendienteAction() {
    return w.__pendiente ?? null;
}

export async function marcarActualizacionVistaAction(id: string, como: string) {
    w.__marcas.push({ id, como });
    if (w.__pendiente?.id === id) w.__pendiente = null;
    return { success: true };
}
