/**
 * Lo que comparten las listas de Finanzas —Ventas, Gastos, Clientes,
 * Proveedores y Cuentas— y que antes estaba escrito tres veces: cómo se pinta
 * un importe, cómo se llama una columna en el menú «Columnas», cómo se enseña
 * un contacto de WhatsApp y qué dice la confirmación de borrar una fila.
 *
 * Tres copias no fallan a la vez: se van separando. Ventas pintaba el total de
 * su detalle con `String(n)` —«COP$ 150000»— mientras Gastos lo formateaba
 * —«$ 150.000,00»—, y el menú de columnas de las tres tablas enseñaba el id
 * interno de cada columna («currencyCode», «occurredAt») en vez de su nombre.
 *
 * Puro: lo usan las pantallas y el banco.
 */

export type MonedaDeFinanzas = { code: string; symbol?: string | null; decimals?: number | null };

/**
 * Un importe con su moneda, como lo lee una persona. Si el navegador no
 * conoce el código —una moneda inventada—, sale con su símbolo y sus
 * decimales en vez de reventar.
 */
export function formatoDeDinero(monedas: readonly MonedaDeFinanzas[], codigo: string, valor: number): string {
    const meta = monedas.find((c) => c.code === codigo);
    const decimales = typeof meta?.decimals === "number" ? meta.decimals : 2;
    const numero = Number.isFinite(valor) ? valor : 0;
    try {
        return new Intl.NumberFormat("es-CO", {
            style: "currency",
            currency: codigo,
            minimumFractionDigits: decimales,
            maximumFractionDigits: decimales,
        }).format(numero);
    } catch {
        const simbolo = meta?.symbol ? `${meta.symbol} ` : "";
        return `${simbolo}${numero.toFixed(decimales)} ${codigo}`;
    }
}

/** Un importe guardado como texto, número o nada. Lo que no es un número vale 0. */
export function comoImporte(v: string | number | null | undefined): number {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(String(v));
    return Number.isFinite(n) ? n : 0;
}

/** El total de una venta: base + extra − descuento. */
export function elTotalDeLaVenta(v: {
    amount?: string | number | null;
    extra?: string | number | null;
    discount?: string | number | null;
}): number {
    return comoImporte(v.amount) + comoImporte(v.extra) - comoImporte(v.discount);
}

/**
 * Cómo se llama una columna en el menú «Columnas». Manda `meta.etiqueta`, que
 * es lo que declara una columna cuya cabecera no es un texto (un botón de
 * ordenar, por ejemplo); si no, la cabecera cuando es texto; y si tampoco, el
 * id. Enseñar el id a secas es enseñar el nombre de una variable.
 */
export function laEtiquetaDeLaColumna(columna: {
    id: string;
    columnDef: { header?: unknown; meta?: unknown };
}): string {
    const meta = columna.columnDef.meta as { etiqueta?: unknown } | undefined;
    if (typeof meta?.etiqueta === "string" && meta.etiqueta.trim()) return meta.etiqueta;
    const cabecera = columna.columnDef.header;
    if (typeof cabecera === "string" && cabecera.trim()) return cabecera;
    return columna.id;
}

// Auto-nombres que WhatsApp asigna a mensajes propios/salientes (no son el
// nombre real del contacto): "Você"=tú (pt), "You", "Tú"...
const NOMBRES_PROPIOS = new Set(["você", "voce", "tú", "tu", "you", "yo"]);

/** Solo el número de un JID, sin el `@s.whatsapp.net` ni el `:dispositivo`. */
export function elNumeroDelContacto(jid?: string | null): string {
    return (jid ?? "").replace(/@.*/, "").split(":")[0];
}

/**
 * El nombre que se enseña de un contacto: el suyo, o su número si no tiene o
 * si es un auto-nombre de WhatsApp («Você»). Nunca el `@jid` crudo.
 *
 * Vivía dentro de Clientes y Proveedores; el selector de contacto de Ventas
 * pintaba el `remoteJid` tal cual, con su `@s.whatsapp.net`.
 */
export function elNombreDelContacto(nombre?: string | null, jid?: string | null): string {
    const n = (nombre ?? "").trim();
    if (n && !NOMBRES_PROPIOS.has(n.toLowerCase())) return n;
    return elNumeroDelContacto(jid);
}

/**
 * La pregunta de la confirmación de borrar UNA fila. Con nombre, lo dice entre
 * comillas: «¿Eliminar la venta «Plan Pro»?». Sin nombre, solo qué es.
 */
export function laPreguntaDeBorrar(queEs: string, nombre?: string | null): string {
    const n = (nombre ?? "").trim();
    return n ? `¿Eliminar ${queEs} «${n}»?` : `¿Eliminar ${queEs}?`;
}

/**
 * El orden de los accesos de Finanzas: el que guardó la persona arrastrándolos,
 * y los accesos que no conocía —uno nuevo, como «Gastos»— en SU sitio, detrás
 * del que les precede en el orden de fábrica. Antes caían todos al final: quien
 * ya había ordenado sus accesos veía «Gastos» después de «Configuración», lejos
 * de «Ventas», y no lo encontraba. Lo que ya no existe se cae.
 */
export function elOrdenDeLosAccesos<T extends string>(guardado: readonly unknown[], porDefecto: readonly T[]): T[] {
    const conocidos = new Set<string>(porDefecto);
    const orden = guardado.filter((id): id is T => typeof id === "string" && conocidos.has(id));
    const vistos = new Set<string>(orden);
    const resultado = [...orden];
    porDefecto.forEach((id, i) => {
        if (vistos.has(id)) return;
        // Detrás del más cercano que le precede y ya esté puesto; si no hay
        // ninguno, el primero.
        let donde = 0;
        for (let j = i - 1; j >= 0; j -= 1) {
            const k = resultado.indexOf(porDefecto[j]);
            if (k >= 0) {
                donde = k + 1;
                break;
            }
        }
        resultado.splice(donde, 0, id);
        vistos.add(id);
    });
    return resultado;
}

/**
 * Las categorías de gasto que se pagan igual todos los meses. La lista era
 * la de una empresa de software —«API», «Servidores», «Herramientas»— y un
 * gasto de «Arriendo» salía «Variable». Se compara sin tildes ni mayúsculas:
 * «Nómina» y «nomina» son la misma categoría escrita por dos personas.
 */
export const CATEGORIAS_DE_GASTO_FIJO = [
    "Nómina",
    "Salarios",
    "Arriendo",
    "Alquiler",
    "Renta",
    "Servicios públicos",
    "Internet",
    "Seguros",
    "Servidores",
    "API",
    "Herramientas",
] as const;

const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const FIJAS = new Set(CATEGORIAS_DE_GASTO_FIJO.map(sinTildes));

/** «Fijo» o «Variable» según la categoría del gasto. Sin categoría, variable. */
export function elTipoDelGasto(categoria?: string | null): "Fijo" | "Variable" {
    if (!categoria) return "Variable";
    return FIJAS.has(sinTildes(categoria)) ? "Fijo" : "Variable";
}

/**
 * El número corto del eje de la gráfica: «850k», «3,4M». Sin el «,0» de
 * sobra: «850.0k» pedía más ancho del que tiene el eje y la primera cifra
 * salía cortada por el borde izquierdo de la tarjeta (se leía «350.0k» donde
 * decía 850).
 */
export function elNumeroCortoDelEje(n: number): string {
    if (!Number.isFinite(n)) return "0";
    const abs = Math.abs(n);
    const corto = (v: number, sufijo: string) => `${v.toFixed(1).replace(/\.0$/, "").replace(".", ",")}${sufijo}`;
    if (abs >= 1_000_000_000) return corto(n / 1_000_000_000, "B");
    if (abs >= 1_000_000) return corto(n / 1_000_000, "M");
    if (abs >= 1_000) return corto(n / 1_000, "k");
    return `${Math.round(n)}`;
}

/**
 * El concepto de un gasto: lo que se escribió en «Concepto» (`title`), y el
 * proveedor (`counterparty`) solo si no hay concepto.
 *
 * Iba al revés —`counterparty || title`— en la columna, en el detalle y en el
 * «¿Eliminar…?»: el formulario escribe `title`, así que en un gasto que traía
 * además el proveedor, la columna «Concepto» enseñaba el proveedor y lo que se
 * había escrito no salía por ningún lado. En Ventas la columna ya era `title`.
 */
export function elConceptoDelGasto(g: { title?: string | null; counterparty?: string | null }): string {
    return String(g.title ?? "").trim() || String(g.counterparty ?? "").trim();
}

/**
 * El proveedor de un gasto, para enseñarlo aparte en su detalle. Vacío si no
 * hay, o si es lo mismo que el concepto: repetido no dice nada.
 */
export function elProveedorDelGasto(g: { title?: string | null; counterparty?: string | null }): string {
    const proveedor = String(g.counterparty ?? "").trim();
    return proveedor && proveedor !== elConceptoDelGasto(g) ? proveedor : "";
}

/**
 * El código que se le pone solo a un contacto nuevo: `C-` para un cliente y
 * `P-` para un proveedor, con el número que sigue al MÁS ALTO que ya exista.
 *
 * Era `cuántos hay + 1`, y eso repetía códigos: borrar en bloque quitaba filas
 * de verdad, el conteo bajaba y el siguiente contacto nacía con el código de
 * uno que ya estaba —dos «C-3» en la misma lista—. Se cuentan también los
 * borrados, así que un código no se reutiliza nunca. Los códigos escritos a
 * mano con otra forma («CLI-001») no cuentan: no chocan con los automáticos.
 */
export function elSiguienteCodigo(prefijo: "C" | "P", codigos: readonly (string | null | undefined)[]): string {
    const forma = new RegExp(`^${prefijo}-(\\d+)$`, "i");
    let mayor = 0;
    for (const c of codigos) {
        const m = forma.exec(String(c ?? "").trim());
        if (m) mayor = Math.max(mayor, Number(m[1]));
    }
    return `${prefijo}-${mayor + 1}`;
}

/** El prefijo del código de un contacto de Finanzas según su tipo. */
export function elPrefijoDelContacto(tipo: "CLIENT" | "SUPPLIER"): "C" | "P" {
    return tipo === "SUPPLIER" ? "P" : "C";
}

/**
 * Lo que dice la caja del código vacía. Decía «C-1 (automático)» con cinco
 * clientes dentro, o sea un número que no iba a salir: dice cómo se numera.
 */
export function elCodigoAutomatico(tipo: "CLIENT" | "SUPPLIER"): string {
    const p = elPrefijoDelContacto(tipo);
    return `Se pone solo: ${p}-1, ${p}-2…`;
}
