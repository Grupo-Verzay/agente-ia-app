/**
 * Cotizaciones de la IA: qué se cotiza, con qué precio, y cuándo NO se cotiza.
 *
 * Es puro —ni base, ni red— y lo usan la ruta que arma el PDF
 * (`/api/cotizacion-ia`) y el banco. La regla de la que cuelga todo:
 *
 * > **El precio sale del catálogo de Productos, nunca del modelo.** Lo que el
 * > cliente pide se empareja con los productos ACTIVOS de la cuenta; si algo no
 * > está —o pide condiciones que el catálogo no dice, como un descuento— no se
 * > genera la cotización: se escala a una persona. Una cotización con un precio
 * > inventado es un compromiso comercial que nadie autorizó.
 *
 * Y la mitad que se olvida: **ambiguo no es «no está»**. Si «camisa» casa con
 * tres productos, no hay nada que escalar: se le devuelven las opciones al
 * modelo para que le pregunte al cliente cuál. Escalar eso sería mandarle a un
 * asesor una pregunta que la propia IA sabe hacer.
 */

/* ------------------------------------------------------------------------ */
/* Ajustes de la cuenta                                                     */
/* ------------------------------------------------------------------------ */

/** Tope del cuadro de texto: lo que la cuenta escribe viaja al PDF y al modelo. */
export const TOPE_DE_INSTRUCCIONES = 4000;

export type AjustesDeCotizacion = {
    activa: boolean;
    instrucciones: string;
};

/** Apagada y sin texto: así nace toda cuenta. */
export const AJUSTES_POR_DEFECTO: AjustesDeCotizacion = { activa: false, instrucciones: "" };

/**
 * Lo que llega (de un formulario, de una fila) pasado a ajustes. Solo `true`
 * enciende: un valor raro nunca deja la función encendida sin que nadie lo
 * haya pedido, que es mandar PDFs a clientes.
 */
export function comoAjustes(raw: unknown): AjustesDeCotizacion {
    const r = (raw ?? {}) as { activa?: unknown; instrucciones?: unknown };
    const texto = typeof r.instrucciones === "string" ? r.instrucciones : "";
    return {
        activa: r.activa === true,
        instrucciones: texto.replace(/\r\n?/g, "\n").trim().slice(0, TOPE_DE_INSTRUCCIONES),
    };
}

/* ------------------------------------------------------------------------ */
/* Lo que pide el cliente                                                   */
/* ------------------------------------------------------------------------ */

export const TOPE_DE_LINEAS = 30;
export const TOPE_DE_CANTIDAD = 10000;

export type PedidoDelCliente = { producto: string; cantidad: number };

/**
 * Lo que manda el modelo, saneado. La cantidad es un entero entre 1 y
 * `TOPE_DE_CANTIDAD`; lo que no se entienda vale 1, que es lo que significa
 * «quiero una X» sin número. Un nombre vacío se descarta.
 */
export function comoPedidos(raw: unknown): PedidoDelCliente[] {
    if (!Array.isArray(raw)) return [];
    const salida: PedidoDelCliente[] = [];
    for (const item of raw) {
        const r = (item ?? {}) as { producto?: unknown; cantidad?: unknown };
        const producto = typeof r.producto === "string" ? r.producto.trim().slice(0, 200) : "";
        if (!producto) continue;
        const n = Math.floor(Number(r.cantidad));
        const cantidad = Number.isFinite(n) && n >= 1 ? Math.min(n, TOPE_DE_CANTIDAD) : 1;
        salida.push({ producto, cantidad });
        if (salida.length >= TOPE_DE_LINEAS) break;
    }
    return salida;
}

/* ------------------------------------------------------------------------ */
/* Emparejar con el catálogo                                                */
/* ------------------------------------------------------------------------ */

export type ProductoDelCatalogo = {
    id: string;
    title: string;
    sku?: string | null;
    price: number;
    description?: string | null;
};

/** Sin tildes, sin mayúsculas, sin signos, un solo espacio. */
export function normalizar(texto: string): string {
    return (texto ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9ñ]+/g, " ")
        .trim();
}

/** Palabras que no distinguen un producto de otro. */
const VACIAS = new Set([
    "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "o", "con", "para", "por", "en", "al",
]);

function palabras(texto: string): string[] {
    return normalizar(texto)
        .split(" ")
        .filter((p) => p.length >= 2 && !VACIAS.has(p));
}

/**
 * Dos palabras son la misma si son iguales o si una es la otra con un plural
 * pegado («camisa» / «camisas», «pantalon» / «pantalones»). Solo a partir de
 * cuatro letras: «te» y «tes» no son el mismo producto.
 */
function mismaPalabra(a: string, b: string): boolean {
    if (a === b) return true;
    const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
    return corta.length >= 4 && larga.startsWith(corta) && larga.length - corta.length <= 2;
}

function contieneTodas(de: string[], en: string[]): boolean {
    return de.length > 0 && de.every((p) => en.some((q) => mismaPalabra(p, q)));
}

export type Emparejado =
    | { tipo: "uno"; producto: ProductoDelCatalogo }
    | { tipo: "varios"; candidatos: ProductoDelCatalogo[] }
    | { tipo: "ninguno" };

/**
 * El producto del catálogo que corresponde a lo que pidió el cliente, en este
 * orden y parando en el primero que contesta:
 *
 * 1. El código (SKU) exacto.
 * 2. El nombre exacto (sin tildes ni mayúsculas).
 * 3. Los productos cuyo nombre contiene TODAS las palabras pedidas, o cuyas
 *    palabras están TODAS en lo pedido («quiero la camisa azul talla M» casa
 *    con «Camisa azul»). Uno es ese; varios son opciones; ninguno es que no
 *    está.
 */
export function emparejar(pedido: string, catalogo: ProductoDelCatalogo[]): Emparejado {
    const p = normalizar(pedido);
    if (!p) return { tipo: "ninguno" };

    const porSku = catalogo.filter((c) => c.sku && normalizar(c.sku) === p);
    if (porSku.length === 1) return { tipo: "uno", producto: porSku[0]! };

    const porNombre = catalogo.filter((c) => normalizar(c.title) === p);
    if (porNombre.length === 1) return { tipo: "uno", producto: porNombre[0]! };
    if (porNombre.length > 1) return { tipo: "varios", candidatos: porNombre };

    const pedidas = palabras(pedido);
    const candidatos = catalogo.filter((c) => {
        const delProducto = palabras(c.title);
        return contieneTodas(pedidas, delProducto) || contieneTodas(delProducto, pedidas);
    });
    if (candidatos.length === 1) return { tipo: "uno", producto: candidatos[0]! };
    if (candidatos.length > 1) {
        // Si uno de ellos tiene TODAS las palabras pedidas y es el más corto,
        // sigue siendo ambiguo: «camisa» con «Camisa azul» y «Camisa roja» no
        // dice cuál. Se pregunta.
        return { tipo: "varios", candidatos: candidatos.slice(0, 8) };
    }
    return { tipo: "ninguno" };
}

/* ------------------------------------------------------------------------ */
/* La decisión                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Palabras que en el nombre de lo pedido delatan una condición que el
 * catálogo no dice. El modelo ya tiene que marcar `pideCondicionesEspeciales`,
 * pero esto es la red de abajo: un «producto» que se llama «descuento 20%» no
 * puede salir como una línea de la cotización.
 */
const CONDICIONES_ESPECIALES = [
    "descuento", "rebaja", "precio especial", "promocion", "promo", "2x1", "3x2", "gratis", "regalo",
    "credito", "cuotas", "financiacion", "financiado", "al por mayor", "mayorista", "negociar", "negociable",
];

export function hablaDeCondicionesEspeciales(texto: string): boolean {
    const t = ` ${normalizar(texto)} `;
    return CONDICIONES_ESPECIALES.some((c) => t.includes(` ${normalizar(c)} `));
}

export type LineaDeCotizacion = {
    productoId: string;
    titulo: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
};

export type DecisionDeCotizacion =
    | { estado: "apagada" }
    | { estado: "vacia" }
    | { estado: "escalar"; motivo: string; faltan: string[] }
    | { estado: "aclarar"; opciones: Array<{ pedido: string; candidatos: string[] }> }
    | { estado: "lista"; lineas: LineaDeCotizacion[]; total: number };

/** Redondea a centavos sin arrastrar el error de coma flotante. */
function aCentavos(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * Qué se hace con una petición de cotización. El orden importa:
 *
 * 1. **Apagada** manda sobre todo: la herramienta no debería existir, pero una
 *    llamada tardía no puede generar nada.
 * 2. **Condiciones especiales** antes que el catálogo: aunque todo exista, un
 *    descuento pedido no se puede resolver con los precios de lista.
 * 3. **Lo que no está** antes que lo ambiguo: si algo no existe, la cotización
 *    no se puede hacer entera aunque lo demás se aclare, y es un asesor quien
 *    tiene que contestar.
 * 4. Lo ambiguo se pregunta; lo demás se cotiza.
 */
export function decidirLaCotizacion(input: {
    activa: boolean;
    pedidos: PedidoDelCliente[];
    pideCondicionesEspeciales: boolean;
    detalleCondiciones?: string | null;
    catalogo: ProductoDelCatalogo[];
}): DecisionDeCotizacion {
    if (!input.activa) return { estado: "apagada" };
    if (input.pedidos.length === 0) return { estado: "vacia" };

    const condicion =
        input.pideCondicionesEspeciales ||
        hablaDeCondicionesEspeciales(input.detalleCondiciones ?? "") ||
        input.pedidos.some((p) => hablaDeCondicionesEspeciales(p.producto));
    if (condicion) {
        const detalle = (input.detalleCondiciones ?? "").trim();
        return {
            estado: "escalar",
            motivo: `El cliente pidió una cotización con condiciones especiales${detalle ? ` (${detalle.slice(0, 300)})` : ""}, que el catálogo no contempla.`,
            faltan: [],
        };
    }

    const faltan: string[] = [];
    const opciones: Array<{ pedido: string; candidatos: string[] }> = [];
    const lineas: LineaDeCotizacion[] = [];
    for (const pedido of input.pedidos) {
        const e = emparejar(pedido.producto, input.catalogo);
        if (e.tipo === "ninguno") {
            faltan.push(pedido.producto);
            continue;
        }
        if (e.tipo === "varios") {
            opciones.push({ pedido: pedido.producto, candidatos: e.candidatos.map((c) => c.title) });
            continue;
        }
        const precio = Number(e.producto.price);
        if (!Number.isFinite(precio) || precio < 0) {
            // Un precio que no se puede leer no se sustituye por otro: eso sería
            // inventarlo. Cuenta como que el dato no está.
            faltan.push(pedido.producto);
            continue;
        }
        const existente = lineas.find((l) => l.productoId === e.producto.id);
        if (existente) {
            existente.cantidad = Math.min(existente.cantidad + pedido.cantidad, TOPE_DE_CANTIDAD);
            existente.subtotal = aCentavos(existente.precioUnitario * existente.cantidad);
            continue;
        }
        lineas.push({
            productoId: e.producto.id,
            titulo: e.producto.title,
            cantidad: pedido.cantidad,
            precioUnitario: aCentavos(precio),
            subtotal: aCentavos(precio * pedido.cantidad),
        });
    }

    if (faltan.length > 0) {
        return {
            estado: "escalar",
            motivo: `El cliente pidió cotizar ${faltan.map((f) => `«${f}»`).join(", ")}, que no está en el catálogo de productos.`,
            faltan,
        };
    }
    if (opciones.length > 0) return { estado: "aclarar", opciones };

    const total = aCentavos(lineas.reduce((s, l) => s + l.subtotal, 0));
    return { estado: "lista", lineas, total };
}

/* ------------------------------------------------------------------------ */
/* Lo que se enseña                                                         */
/* ------------------------------------------------------------------------ */

/** «$ 150.000» o «$ 12.500,50», con el código de moneda si lo hay. */
export function elPrecio(n: number, moneda?: string | null): string {
    const cifra = n.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const codigo = (moneda ?? "").trim().toUpperCase();
    return codigo ? `$ ${cifra} ${codigo}` : `$ ${cifra}`;
}

/** El número que lleva la cotización: corto, legible y sin colisiones de un mismo día. */
export function elNumeroDeLaCotizacion(id: string, fecha: Date): string {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, "0");
    const d = String(fecha.getDate()).padStart(2, "0");
    const corto = id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5).toUpperCase();
    return `COT-${y}${m}${d}-${corto}`;
}

/** Los datos del negocio que van en la cabecera, sacados de Perfil del entrenamiento. */
export function losDatosDelNegocio(business: unknown): string[] {
    const b = (business ?? {}) as Record<string, unknown>;
    const campo = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
    return [
        campo("ubicacion"),
        campo("telefono") && `Tel: ${campo("telefono")}`,
        campo("email"),
        campo("sitio"),
    ].filter((x): x is string => Boolean(x));
}
