/**
 * Lo único que este banco NO puede ejercer de verdad: OpenAI.
 *
 * Transcribir y resumir salen de la red, así que el banco no puede llamarlos
 * —ni debe: costaría dinero y devolvería algo distinto en cada vuelta—. Se
 * sustituye **el paquete `openai`**, que es la frontera más externa que hay:
 * por encima siguen corriendo `transcribe`, `summarize`, `OpenAiClient` y todo
 * el camino de `grabacion-de-llamada.server` sin tocar una línea.
 *
 * El estado vive aquí, aparte del propio doble, para que el banco lo mueva
 * importándolo por su nombre en vez de por el alias de esbuild.
 */

/** Lo que el doble contesta. Se cambia desde el banco antes de cada caso. */
export const laIa = {
    transcripcion: "Operador: buenas tardes.\nCliente: hola, sí, me interesa.",
    resumen: "- El cliente confirma interés.\nPróximo paso: Hacer seguimiento.",
    /** Para poder afirmar que de verdad se le pidió, y con qué. */
    pedidos: [] as { que: "transcribir" | "resumir"; modelo: string; pista?: string }[],
};

export function ponerLoQueDiceLaIa(input: { transcripcion?: string; resumen?: string }): void {
    if (input.transcripcion !== undefined) laIa.transcripcion = input.transcripcion;
    if (input.resumen !== undefined) laIa.resumen = input.resumen;
}

export function loQueSeLePidioALaIa(): { que: string; modelo: string; pista?: string }[] {
    return laIa.pedidos.slice();
}

export function olvidarLoPedido(): void {
    laIa.pedidos.length = 0;
}
