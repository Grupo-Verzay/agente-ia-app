/**
 * Una COMPRA de Finanzas: qué es, cómo se abre y cómo se nombra.
 *
 * El acceso «Compras» abría Gastos con `?create=1`, que es el formulario de un
 * gasto cualquiera: «Nuevo gasto», sin ningún sitio donde decir a quién se le
 * compró. La lista de Proveedores existía y no la usaba nadie.
 *
 * # Una compra ES un gasto con proveedor, y no una tabla nueva
 *
 * `FinanceTransaction` solo conoce `SALE` y `EXPENSE`, y su esquema es del
 * BACKEND: añadirle un tipo o una columna desde la App es lo que reventó el
 * #360. Y no hace falta: la fila ya tiene `counterparty` (con quién) y
 * `reference`, y el formulario de gastos nunca escribía ninguno de los dos.
 * Así que una compra es un gasto con `counterparty` = el nombre del proveedor y
 * `reference` = `proveedor:<id>`, y sale en Gastos, en el resumen y en el
 * balance exactamente igual que cualquier otro gasto —que es lo que es: dinero
 * que sale—. La columna «Concepto» ya enseña el proveedor debajo
 * (`elProveedorDelGasto`).
 *
 * # Qué formulario abre la URL
 *
 * `?create=compra` abre una compra; `?create=1` sigue abriendo un gasto, como
 * siempre: el «Nuevo» del resumen y los enlaces que ya existan no cambian.
 */

export type FormularioDeGasto = "gasto" | "compra";

/** El valor de `?create=` que abre una compra (el de un gasto sigue siendo `1`). */
export const CREAR_UNA_COMPRA = "compra";

/** El que abre un gasto, el de siempre. */
export const CREAR_UN_GASTO = "1";

/**
 * Qué formulario abre la pantalla de Gastos al entrar, según su `?create=`.
 * Lo que no se reconozca no abre nada: un parámetro raro no puede abrir un
 * formulario que nadie pidió.
 */
export function elFormularioAlEntrar(create: string | readonly string[] | null | undefined): FormularioDeGasto | null {
    const valor = (Array.isArray(create) ? create[0] : create) as string | null | undefined;
    const limpio = (valor ?? "").trim().toLowerCase();
    if (limpio === CREAR_UNA_COMPRA) return "compra";
    if (limpio === CREAR_UN_GASTO) return "gasto";
    return null;
}

/**
 * La dirección sin su `?create=`, o `null` si no lo llevaba. La pantalla la
 * quita en cuanto abre el formulario: con el parámetro puesto, pulsar «Compras»
 * otra vez llevaría a la MISMA dirección y no abriría nada —y una recarga lo
 * volvería a abrir sin que nadie lo pidiera—. Lo demás (`month`, `cuentas`) se
 * queda como estaba.
 */
export function laDireccionSinCrear(ruta: string, busqueda: string): string | null {
    const params = new URLSearchParams(busqueda);
    if (!params.has("create")) return null;
    params.delete("create");
    const resto = params.toString();
    return resto ? `${ruta}?${resto}` : ruta;
}

const PREFIJO_DEL_PROVEEDOR = "proveedor:";

/** Lo que se guarda en `reference` de una compra: de qué proveedor de la lista es. */
export function laReferenciaDelProveedor(proveedorId: string): string {
    return `${PREFIJO_DEL_PROVEEDOR}${proveedorId}`;
}

/** El id del proveedor que guarda una compra, o `null` si no es una referencia de proveedor. */
export function elProveedorDeLaReferencia(reference: string | null | undefined): string | null {
    const ref = (reference ?? "").trim();
    if (!ref.startsWith(PREFIJO_DEL_PROVEEDOR)) return null;
    const id = ref.slice(PREFIJO_DEL_PROVEEDOR.length).trim();
    return id || null;
}

/**
 * Si un gasto es una compra: tiene proveedor. Se mira el NOMBRE (`counterparty`)
 * y no solo la referencia, para que un gasto con proveedor escrito por otro
 * camino también se abra como compra al editarlo, y no pierda ese dato.
 */
export function esUnaCompra(gasto: { counterparty?: string | null; reference?: string | null }): boolean {
    return Boolean((gasto.counterparty ?? "").trim()) || elProveedorDeLaReferencia(gasto.reference) !== null;
}

export type TextosDelFormulario = {
    titulo: string;
    guardar: string;
    creado: string;
    actualizado: string;
    placeholderDelConcepto: string;
};

/** Cómo se nombra el formulario en cada modo. Un gasto se queda con sus textos de siempre. */
export function losTextosDelFormulario(modo: FormularioDeGasto, editando: boolean): TextosDelFormulario {
    if (modo === "compra") {
        return {
            titulo: editando ? "Editar compra" : "Nueva compra",
            guardar: editando ? "Guardar cambios" : "Guardar compra",
            creado: "Compra creada",
            actualizado: "Compra actualizada",
            placeholderDelConcepto: "Ej: Mercancía / Insumos / Materia prima",
        };
    }
    return {
        titulo: editando ? "Editar gasto" : "Nuevo gasto",
        guardar: editando ? "Guardar cambios" : "Guardar gasto",
        creado: "Gasto creado",
        actualizado: "Gasto actualizado",
        placeholderDelConcepto: "Ej: Nómina / Publicidad / Servidor",
    };
}

/**
 * Por qué no se guarda el formulario, o `null` si se puede guardar. En una
 * compra el proveedor es obligatorio —sin él es un gasto—, y se pregunta
 * PRIMERO: es lo primero del formulario. `proveedorActual` es el nombre que ya
 * tenía una compra guardada, que se puede conservar sin volver a elegirlo.
 */
export function porQueNoSeGuarda(
    modo: FormularioDeGasto,
    form: { accountId?: string | null; title?: string | null; amount?: string | null },
    proveedor: { id?: string | null; nombreActual?: string | null },
): string | null {
    if (modo === "compra" && !proveedor.id && !(proveedor.nombreActual ?? "").trim()) {
        return "Elige el proveedor";
    }
    if (!form.accountId) return "Selecciona una cuenta";
    if (!(form.title ?? "").trim()) return "Ingresa el concepto";
    if (!form.amount) return "Ingresa un monto";
    return null;
}

/**
 * El `proveedorId` que se le manda al servidor al guardar, o `undefined` si no
 * hay que mandar ninguno. Al EDITAR una compra que conserva su proveedor no se
 * manda: si ese proveedor se borró de la lista después, mandarlo haría que el
 * servidor rechazara la edición entera —y una compra vieja no se podría
 * corregir nunca—. Solo se manda cuando se elige uno distinto, que es cuando
 * hay algo nuevo que comprobar.
 */
export function elProveedorQueSeManda(
    modo: FormularioDeGasto,
    elegidoId: string | null | undefined,
    referenciaOriginal?: string | null,
): string | undefined {
    if (modo !== "compra" || !elegidoId) return undefined;
    if (elProveedorDeLaReferencia(referenciaOriginal) === elegidoId) return undefined;
    return elegidoId;
}

export type ProveedorDeLaLista = { id: string; name: string; code?: string | null; phone?: string | null };

/** Sin tildes ni mayúsculas, para comparar lo tecleado con un nombre. */
function sinTildes(texto: string): string {
    return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Los proveedores que casan con lo tecleado en el buscador: por nombre, código
 * o teléfono, sin tildes ni mayúsculas. Sin nada tecleado, todos, en su orden.
 * El filtro es este y no el de cmdk, para que lo que se ve y lo que decide si
 * se ofrece «crear» salgan de la misma comparación.
 */
export function losProveedoresQueCasan(tecleado: string, lista: readonly ProveedorDeLaLista[]): ProveedorDeLaLista[] {
    const buscado = sinTildes(tecleado);
    if (!buscado) return [...lista];
    return lista.filter((p) =>
        [p.name, p.code ?? "", p.phone ?? ""].some((campo) => sinTildes(campo).includes(buscado)),
    );
}

/**
 * Si lo tecleado en el buscador se puede crear como proveedor nuevo: hay
 * texto y no coincide con ninguno de la lista (sin mirar tildes ni
 * mayúsculas). Si ya existe, se elige; no se crea otro igual.
 */
export function sePuedeCrearElProveedor(tecleado: string, lista: readonly ProveedorDeLaLista[]): boolean {
    const buscado = sinTildes(tecleado);
    if (!buscado) return false;
    return !lista.some((p) => sinTildes(p.name) === buscado);
}
