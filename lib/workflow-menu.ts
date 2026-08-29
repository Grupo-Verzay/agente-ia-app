/**
 * Las opciones de un nodo "Menú": una por línea, en orden.
 *
 * Esta regla tiene que ser LA MISMA que la del backend (`parseMenuOptions` en
 * workflow.service.ts), porque de ella salen dos cosas que deben cuadrar: los
 * conectores que se dibujan en el editor y las ramas que el motor elige al
 * ejecutar. Si aquí saliera una opción de más, esa rama se podría conectar en
 * pantalla y no llevaría a ningún sitio.
 */

/**
 * Tope de opciones. Más allá de esto el cliente ya no lee el menú, y además
 * cada opción necesita su propio conector dibujado en el flujo.
 */
export const MAX_OPCIONES_MENU = 10;

export function parseMenuOptions(raw?: string | null): string[] {
    if (!raw) return [];
    return raw
        .split("\n")
        .map((linea) => linea.trim())
        .filter((linea) => linea.length > 0)
        .slice(0, MAX_OPCIONES_MENU);
}

/**
 * El identificador del conector de la opción N (empezando en 1).
 *
 * Es el `sourceHandle` que se guarda en la arista y el que el motor busca al
 * decidir por dónde seguir.
 */
export function menuOptionHandle(numero: number): string {
    return `opt-${numero}`;
}

/** Cómo se le va a ver al cliente, para la vista previa del editor. */
export function buildMenuPreview(pregunta: string, opciones: string[]): string {
    const lista = opciones.map((opcion, i) => `${i + 1}) ${opcion}`).join("\n");
    const encabezado = pregunta.trim();
    return encabezado ? `${encabezado}\n\n${lista}` : lista;
}
