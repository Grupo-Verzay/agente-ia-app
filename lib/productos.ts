/**
 * Las REGLAS de la pantalla de Productos (`/products`), puras: las usan el
 * formulario, la acción que lista y la guía pública (`lib/guia-productos.ts`).
 *
 * Salieron al documentar la pantalla, y las tres eran fallos que no daban
 * ningún error:
 *
 * 1. **Un producto nuevo se guardaba AGOTADO.** El interruptor de inventario
 *    nacía en «Sin límite» (-1) y el formulario en 0, así que guardar sin tocar
 *    el interruptor creaba un producto con 0 unidades: en el catálogo salía
 *    «Sin stock» y su botón de WhatsApp desaparecía.
 * 2. **«Sin stock» contaba los de inventario sin límite** (`stock <= 0` cuenta
 *    el -1).
 * 3. **Guardar sin categoría no hacía nada**: el esquema la exige y el
 *    formulario no enseñaba el error.
 */

/** El inventario «sin límite»: el producto nunca se agota. */
export const SIN_LIMITE = -1;

/** Con qué inventario se abre el formulario: el del producto, o «sin límite» si es nuevo. */
export function elInventarioAlAbrir(stock: number | null | undefined): number {
    return typeof stock === "number" && Number.isInteger(stock) && stock >= SIN_LIMITE ? stock : SIN_LIMITE;
}

/** Si un producto está agotado: CERO unidades. El -1 es sin límite y no se agota nunca. */
export function estaAgotado(stock: number): boolean {
    return stock === 0;
}

/** Lo que dice la columna Stock de la tabla. */
export function elInventarioQueSeLee(stock: number): string {
    return stock < 0 ? "Sin límite" : String(stock);
}

/** Dónde mira el buscador: el nombre, el código y la categoría, sin mirar mayúsculas. */
export function dondeBusca(q: string) {
    const contiene = { contains: q, mode: "insensitive" as const };
    return [{ title: contiene }, { sku: contiene }, { category: contiene }];
}

/** Los campos que el esquema puede rechazar, con el nombre que les da la pantalla. */
const NOMBRE_DEL_CAMPO: Record<string, string> = {
    title: "Nombre",
    category: "Categoría",
    price: "Precio",
    comparePrice: "Precio antes",
    sku: "Código",
    stock: "Inventario",
    description: "Descripción",
    images: "Fotos",
    tags: "Etiquetas",
};

/** El aviso cuando Guardar no puede guardar: nombra los campos, en el orden del formulario. */
export function porQueNoSeGuardaElProducto(errores: Record<string, unknown>): string {
    const campos = Object.keys(NOMBRE_DEL_CAMPO).filter((k) => k in errores).map((k) => NOMBRE_DEL_CAMPO[k]);
    if (!campos.length) return "Revisa el formulario: hay un campo que no vale.";
    return campos.length === 1 ? `Revisa el campo ${campos[0]}.` : `Revisa los campos ${campos.slice(0, -1).join(", ")} y ${campos.at(-1)}.`;
}

/**
 * El orden COMPLETO tras arrastrar en un trozo de la lista (una página, o con
 * una búsqueda puesta). Las filas movidas se reparten en los MISMOS sitios que
 * ocupaban en la lista entera, en su orden nuevo; las demás no se mueven.
 *
 * Antes se escribía `order = 0..n` sobre el trozo: arrastrar en la página 2
 * ponía esas filas por delante de la página 1, y con una búsqueda las
 * escondidas se quedaban empatadas con las de arriba.
 */
export function elOrdenCompleto(todos: string[], reordenados: string[]): string[] {
    const movidos = new Set(reordenados.filter((id) => todos.includes(id)));
    const cola = reordenados.filter((id) => movidos.has(id));
    let i = 0;
    return todos.map((id) => (movidos.has(id) ? cola[i++] : id));
}
