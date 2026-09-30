// Las acciones de la configuración de la ficha, fingidas para el navegador: la
// lista de campos sale de `window.__campos`, que pone cada prueba.
export async function getContactFieldsConfig(): Promise<unknown> {
    return (window as any).__campos ?? [];
}
export async function saveContactFieldsConfig(_userId: string, campos: unknown) {
    (window as any).guardado = campos;
    return { success: true as const, message: "" };
}
