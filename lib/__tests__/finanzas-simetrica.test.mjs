/**
 * La pantalla de Finanzas, SIMÉTRICA: lo que se arregló al documentarla.
 *
 * Documentar pantalla por pantalla destapó que las seis listas del módulo se
 * habían escrito cada una a su manera —tres tablas distintas, botones de fila
 * distintos, un filtro de fecha en unas y en otras no— y cinco fallos que no
 * daban ningún error:
 *
 *   1. La fila de accesos no llevaba al RESUMEN: desde Ventas, para volver a
 *      la pantalla de partida había que subir a la pestaña del Panel.
 *   2. El resumen anual solo cambiaba de mes, nunca de año: el diciembre
 *      pasado solo se veía escribiendo la dirección a mano.
 *   3. El eje de la gráfica escribía «850.0k», que no cabía y salía cortado
 *      por el borde («350.0k» donde decía 850).
 *   4. «Fijo» o «Variable» salía de la lista de una empresa de software —«API»,
 *      «Servidores»—, así que un «Arriendo» era variable.
 *   5. Las columnas de dinero llevaban la cifra a la derecha y el título a la
 *      izquierda: «Saldo» quedaba encima del hueco de la columna de al lado.
 *   6. En el detalle de una venta y de un gasto, la X de cerrar quedaba ENCIMA
 *      del botón de eliminar, y los dos detalles no se parecían.
 *   7. La columna «Concepto» de Gastos enseñaba el proveedor y no lo que se
 *      escribió en «Concepto».
 *   8. El código automático de un cliente era «cuántos hay + 1»: después de un
 *      borrado en bloque —que borraba de verdad, cuando el de uno en uno solo
 *      marca— el siguiente repetía el código de otro.
 *
 * Dos mitades: las REGLAS puras (`lib/accesos-de-finanzas.ts`,
 * `lib/periodo-de-finanzas.ts`, `lib/tabla-de-finanzas.ts`) y un BARRIDO del
 * código, que es lo único que dice si las pantallas las usan.
 *
 * `MODO=roto` lee `ANTES_FINANZAS_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma los fallos: tres tablas, accesos sin Resumen, un
 * resumen sin año, el eje con «.0» y un arriendo variable.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const MODO = process.env.MODO ?? "bueno";
const ANTES = process.env.ANTES_FINANZAS_REF ?? "ab6b110";
const FIN = "app/(root)/(protected)/dashboard/finance";
const COMPILADO = path.join(RAIZ, "lib/__tests__/.compilado/finanzas-simetrica");

const enAntes = (ruta) => {
    try {
        return execFileSync("git", ["show", `${ANTES}:${ruta}`], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};
const hoy = (ruta) => readFileSync(path.join(RAIZ, ruta), "utf8");
/** El código sin comentarios: lo que se busca no puede salir de la explicación del arreglo. */
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

const LISTAS_CON_FECHA = [`${FIN}/sales/_components/MainSales.tsx`, `${FIN}/expenses/_components/MainExpenses.tsx`, `${FIN}/accounts/_components/MainFinanceAccounts.tsx`];
const LISTAS = [...LISTAS_CON_FECHA, `${FIN}/_contacts/MainFinanceContacts.tsx`];

if (MODO === "roto") {
    describe("ANTES: cada lista de Finanzas iba por su cuenta", () => {
        test("la referencia es un commit de verdad", () => {
            assert.ok(enAntes(`${FIN}/page.tsx`), `ANTES_FINANZAS_REF (${ANTES}) no tiene la pantalla de Finanzas`);
        });

        test("había tres tablas distintas, y ninguna común", () => {
            for (const r of [`${FIN}/sales/_components/data-table.tsx`, `${FIN}/expenses/_components/data-table.tsx`, `${FIN}/_contacts/data-table.tsx`]) {
                assert.ok(enAntes(r), `${r} no existía`);
            }
            assert.equal(enAntes(`${FIN}/_components/TablaDeFinanzas.tsx`), null);
            assert.equal(enAntes(`${FIN}/_components/FiltroDePeriodo.tsx`), null);
        });

        test("la fila de accesos no llevaba al Resumen", () => {
            const atajos = enAntes(`${FIN}/_components/FinanceModuleShortcuts.tsx`);
            assert.ok(atajos);
            assert.doesNotMatch(atajos, /label: 'Resumen'/);
            assert.equal(enAntes("lib/accesos-de-finanzas.ts"), null);
        });

        test("el resumen anual no cambiaba de año", () => {
            const pagina = enAntes(`${FIN}/page.tsx`);
            assert.doesNotMatch(pagina, /elMesDeOtroAno|ChevronLeft/);
        });

        test("el eje escribía «850.0k» y un arriendo era variable", () => {
            const grafica = enAntes(`${FIN}/_components/FinanceMonthChart.tsx`);
            assert.match(grafica, /toFixed\(1\)\}k`/);
            const gastos = enAntes(`${FIN}/expenses/_components/columns.tsx`);
            assert.match(gastos, /new Set\(\['Nomina', 'Nómina', 'Salarios', 'Servidores', 'API', 'Herramientas'\]\)/);
            assert.doesNotMatch(gastos, /Arriendo/);
        });

        test("los dos detalles no se parecían, y la cabecera no dejaba sitio a la X", () => {
            assert.equal(enAntes("lib/detalle-de-finanzas.ts"), null);
            assert.match(enAntes(`${FIN}/expenses/_components/MainExpenses.tsx`), /sm:max-w-\[820px\] rounded-2xl"/);
            assert.match(enAntes(`${FIN}/sales/_components/MainSales.tsx`), /<div className="border-b bg-background\/95 p-4 sm:p-5">/);
        });

        test("el concepto de un gasto era el proveedor, y el código un conteo", () => {
            assert.match(enAntes(`${FIN}/expenses/_components/columns.tsx`), /row\.counterparty \|\| row\.title/);
            assert.match(enAntes("actions/finance-contacts-actions.ts"), /const count = await db\.financeContact\.count/);
            assert.match(enAntes("actions/borrado-en-bloque-actions.ts"), /db\.financeContact\.deleteMany/);
            assert.match(enAntes(`${FIN}/_contacts/MainFinanceContacts.tsx`), /'C-1 \(automático\)'/);
        });

        test("el «Nuevo» del resumen abría su menú FUERA de la pantalla: el botón no pasaba su ref", () => {
            assert.match(enAntes(`${FIN}/_components/BarraDeFinanzas.tsx`), /<DropdownMenuTrigger asChild>\s*<BotonDeCrear>/);
            assert.match(enAntes("components/shared/BarraDeAcciones.tsx"), /export function BotonDeCrear\(/);
            assert.doesNotMatch(enAntes("components/shared/BarraDeAcciones.tsx"), /forwardRef/);
        });
    });
} else {
    const accesos = await import(path.join(COMPILADO, "accesos-de-finanzas.mjs"));
    const periodo = await import(path.join(COMPILADO, "periodo-de-finanzas.mjs"));
    const tabla = await import(path.join(COMPILADO, "tabla-de-finanzas.mjs"));
    const detalle = await import(path.join(COMPILADO, "detalle-de-finanzas.mjs"));

    describe("los accesos de Finanzas", () => {
        test("empiezan por el Resumen, y la fila lleva a las seis pantallas", () => {
            assert.equal(accesos.ACCESOS_DE_FINANZAS[0].id, "summary");
            assert.equal(accesos.ACCESOS_DE_FINANZAS[0].etiqueta, "Resumen");
            const pantallas = accesos.ACCESOS_DE_FINANZAS.filter((a) => a.ruta.startsWith(accesos.RUTA_DE_FINANZAS) && !a.crea).map((a) => a.etiqueta);
            assert.deepEqual(pantallas, ["Resumen", "Clientes", "Proveedores", "Ventas", "Gastos", "Cuentas", "Configuración"]);
        });

        test("se marca la pantalla que se tiene delante, y solo una", () => {
            assert.equal(accesos.elAccesoActivo("/dashboard/finance"), "summary");
            assert.equal(accesos.elAccesoActivo("/dashboard/finance/"), "summary");
            assert.equal(accesos.elAccesoActivo("/dashboard/finance?month=2026-09"), "summary");
            assert.equal(accesos.elAccesoActivo("/dashboard/finance/sales"), "sales", "no «Recibos de caja», que comparte la ruta");
            assert.equal(accesos.elAccesoActivo("/dashboard/finance/expenses?create=1"), "expenses", "no «Compras»");
            assert.equal(accesos.elAccesoActivo("/dashboard/finance/sales/otra"), null, "con un «empieza por», el Resumen se encendería en todas");
            assert.equal(accesos.elAccesoActivo(null), null);
        });

        test("el enlace lleva el mes que se mira, y los atajos abren el formulario", () => {
            const porId = Object.fromEntries(accesos.ACCESOS_DE_FINANZAS.map((a) => [a.id, a]));
            assert.equal(accesos.elEnlaceDelAcceso(porId.sales, "2026-08"), "/dashboard/finance/sales?month=2026-08");
            assert.equal(accesos.elEnlaceDelAcceso(porId.purchases, "2026-08"), "/dashboard/finance/expenses?month=2026-08&create=1");
            assert.equal(accesos.elEnlaceDelAcceso(porId.products, "2026-08"), "/products");
            assert.equal(accesos.elEnlaceDelAcceso(porId.summary, ""), "/dashboard/finance");
        });

        test("un orden guardado antes de que existieran Resumen y Gastos los pone en SU sitio", () => {
            const guardado = ["clients", "products", "providers", "proposals", "sales", "purchases", "cash-receipts", "notes", "accounts", "settings", "borrado"];
            const orden = tabla.elOrdenDeLosAccesos(guardado, accesos.ORDEN_DE_LOS_ACCESOS);
            assert.equal(orden[0], "summary", "el Resumen, que no tiene nadie delante, va el primero");
            assert.equal(orden[orden.indexOf("sales") + 1], "expenses", "Gastos, detrás de Ventas y no al final");
            assert.ok(!orden.includes("borrado"), "lo que ya no existe se cae");
            assert.equal(orden.length, accesos.ORDEN_DE_LOS_ACCESOS.length);
        });
    });

    describe("el periodo y el año", () => {
        test("el mismo mes, otro año", () => {
            assert.equal(periodo.elMesDeOtroAno("2026-09", -1), "2025-09");
            assert.equal(periodo.elMesDeOtroAno("2026-01", 1), "2027-01");
            assert.equal(periodo.elMesDeOtroAno("NaN-09", -1), null, "un enlace a «NaN-09» abriría el mes de hoy sin decir por qué");
            assert.equal(periodo.elMesDeOtroAno("2026-09", 0.5), null);
        });

        test("se compara por DÍA, y los dos extremos cuentan", () => {
            const julio = periodo.unPeriodo("mes", "2026-07");
            assert.ok(periodo.dentroDelPeriodo("2026-07-01T00:00:00.000Z", julio));
            assert.ok(periodo.dentroDelPeriodo("2026-07-31T00:00:00.000Z", julio));
            assert.ok(!periodo.dentroDelPeriodo("2026-08-01T00:00:00.000Z", julio));
            assert.ok(!periodo.dentroDelPeriodo("2026-06-30T00:00:00.000Z", julio));
        });

        test("un rango al revés se endereza, no sale vacío", () => {
            const r = { ...periodo.unPeriodo("rango", "2026-09"), desde: "2026-09-20", hasta: "2026-09-10" };
            assert.deepEqual(periodo.losLimitesDelPeriodo(r), { desde: "2026-09-10", hasta: "2026-09-20" });
            assert.ok(periodo.dentroDelPeriodo("2026-09-15", r));
        });

        test("el botón nunca sale mudo", () => {
            assert.equal(periodo.elRotuloDelPeriodo(periodo.unPeriodo("todo"), "Todas"), "Todas");
            assert.equal(periodo.elRotuloDelPeriodo(periodo.unPeriodo("mes", "2026-09")), "septiembre 2026");
            assert.equal(periodo.elRotuloDelPeriodo({ ...periodo.unPeriodo("rango"), desde: "2026-09-01", hasta: "2026-09-15" }), "1 sep – 15 sep");
        });

        test("un movimiento nuevo nace en el mes que se está mirando", () => {
            const hoy_ = new Date(2026, 8, 30);
            assert.equal(periodo.laFechaDeUnoNuevo(periodo.unPeriodo("mes", "2026-07", hoy_), hoy_), "2026-07-01");
            assert.equal(periodo.laFechaDeUnoNuevo(periodo.unPeriodo("todo", null, hoy_), hoy_), "2026-09-30");
        });
    });

    describe("la tabla", () => {
        test("el eje de la gráfica: corto y sin «,0» de sobra", () => {
            assert.equal(tabla.elNumeroCortoDelEje(850_000), "850k");
            assert.equal(tabla.elNumeroCortoDelEje(3_400_000), "3,4M");
            assert.equal(tabla.elNumeroCortoDelEje(1_700_000), "1,7M");
            assert.equal(tabla.elNumeroCortoDelEje(999), "999");
            assert.equal(tabla.elNumeroCortoDelEje(Number.NaN), "0");
        });

        test("fijo o variable, sin tildes ni mayúsculas", () => {
            for (const c of ["Arriendo", "nomina", "Nómina", "Servicios públicos", "  SEGUROS "]) assert.equal(tabla.elTipoDelGasto(c), "Fijo", c);
            for (const c of ["Insumos", "Marketing", "", null]) assert.equal(tabla.elTipoDelGasto(c), "Variable", String(c));
        });

        test("el total de una venta es base más extra menos descuento", () => {
            assert.equal(tabla.elTotalDeLaVenta({ amount: "42000", extra: 8000, discount: "5000" }), 45000);
        });

        test("el concepto de un gasto es lo que se escribió; el proveedor, solo si no hay", () => {
            assert.equal(tabla.elConceptoDelGasto({ title: "Mantenimiento del tostador", counterparty: "Tostadores Pro" }), "Mantenimiento del tostador");
            assert.equal(tabla.elConceptoDelGasto({ title: "  ", counterparty: "Tostadores Pro" }), "Tostadores Pro");
            assert.equal(tabla.elConceptoDelGasto({}), "");
            assert.equal(tabla.elProveedorDelGasto({ title: "Arreglo", counterparty: "Tostadores Pro" }), "Tostadores Pro");
            assert.equal(tabla.elProveedorDelGasto({ title: "", counterparty: "Tostadores Pro" }), "", "repetido no dice nada");
        });

        test("el código automático sigue al más alto, y nunca repite", () => {
            assert.equal(tabla.elSiguienteCodigo("C", []), "C-1");
            assert.equal(tabla.elSiguienteCodigo("C", ["C-1", "C-2", "C-5"]), "C-6", "con huecos, sigue al más alto, no al conteo");
            assert.equal(tabla.elSiguienteCodigo("C", ["c-3", null, undefined, " C-4 "]), "C-5");
            assert.equal(tabla.elSiguienteCodigo("C", ["CLI-001", "P-9"]), "C-1", "otra forma u otro prefijo no chocan");
            assert.equal(tabla.elSiguienteCodigo("P", ["P-2", "C-7"]), "P-3");
            assert.equal(tabla.elPrefijoDelContacto("SUPPLIER"), "P");
            assert.equal(tabla.elPrefijoDelContacto("CLIENT"), "C");
            assert.match(tabla.elCodigoAutomatico("CLIENT"), /C-1, C-2…/);
            assert.doesNotMatch(tabla.elCodigoAutomatico("CLIENT"), /^C-1 \(/, "un número fijo que no iba a salir");
        });
    });

    describe("el detalle de un movimiento", () => {
        test("la cabecera deja a la X su sitio: distancia, lado y un hueco", () => {
            assert.equal(detalle.SITIO_PARA_LA_X, 48);
            assert.ok(detalle.SITIO_PARA_LA_X >= 16 + 16 + 8, "los mandos tienen que acabar antes de la X");
            assert.match(detalle.CABECERA_DEL_DETALLE, new RegExp(`(^| )pr-${detalle.SITIO_PARA_LA_X / 4}( |$)`), "la clase no dice el mismo número");
            assert.doesNotMatch(detalle.CABECERA_DEL_DETALLE, /(^| )(sm:)?p-\d/, "un p-* pisaría el pr-12");
        });

        test("la X cae a la altura de los botones de al lado", () => {
            const { telefono, desdeSm } = detalle.ARRIBA_DE_LA_CABECERA;
            assert.match(detalle.CABECERA_DEL_DETALLE, new RegExp(`(^| )pt-${telefono / 4}( |$)`));
            assert.match(detalle.CABECERA_DEL_DETALLE, new RegExp(`(^| )sm:pt-${desdeSm / 4}( |$)`));
            assert.equal(detalle.laAlturaDeLaX(telefono), 26);
            assert.equal(detalle.laAlturaDeLaX(desdeSm), 30);
            assert.ok(detalle.DIALOGO_DEL_DETALLE.includes(`[--cerrar-arriba:${detalle.laAlturaDeLaX(telefono)}px]`));
            assert.ok(detalle.DIALOGO_DEL_DETALLE.includes(`sm:[--cerrar-arriba:${detalle.laAlturaDeLaX(desdeSm)}px]`));
        });

        test("el «Nuevo» del resumen abre su menú donde se ve: el botón azul pasa su ref", () => {
        // Va dentro de un `DropdownMenuTrigger asChild`, y Radix ancla el menú
        // con la ref del hijo. Sin ella el menú se queda en translate(0,-200%).
        const barra = sinComentarios(hoy("components/shared/BarraDeAcciones.tsx"));
        assert.match(barra, /export const BotonDeCrear = React\.forwardRef</);
        assert.match(barra, /<Button\s+ref=\{ref\}/);
        assert.match(sinComentarios(hoy(`${FIN}/_components/BarraDeFinanzas.tsx`)), /<DropdownMenuTrigger asChild>\s*<BotonDeCrear>/);
    });

    test("entre la cabecera y el cuerpo no hay hueco de la rejilla: el aire lo pone el cuerpo", () => {
            assert.match(detalle.DIALOGO_DEL_DETALLE, /(^| )gap-0( |$)/, "sin gap-0 la rejilla de DialogContent mete 16 px de más");
            const lado = /(^| )sm:p-(\d+)( |$)/.exec(detalle.CUERPO_DEL_DETALLE)?.[2];
            const arriba = /(^| )sm:pl-(\d+)( |$)/.exec(detalle.CABECERA_DEL_DETALLE)?.[2];
            assert.equal(lado, arriba, "la cabecera y el cuerpo arrancan en columnas distintas");
        });
    });

    describe("el barrido: las pantallas usan las reglas", () => {
        test("no quedan las tres tablas de antes: las cuatro listas van por la común", () => {
            for (const r of [`${FIN}/sales/_components/data-table.tsx`, `${FIN}/expenses/_components/data-table.tsx`, `${FIN}/_contacts/data-table.tsx`]) {
                assert.ok(!existsSync(path.join(RAIZ, r)), `${r} sigue ahí`);
            }
            for (const r of LISTAS) assert.match(sinComentarios(hoy(r)), /<TablaDeFinanzas\b/, `${r} no pinta la tabla común`);
        });

        test("las listas con fecha llevan el MISMO filtro de periodo", () => {
            for (const r of LISTAS_CON_FECHA) {
                const t = sinComentarios(hoy(r));
                assert.match(t, /<FiltroDePeriodo\b/, `${r} sin el filtro de periodo`);
                assert.match(t, /filtrarPorPeriodo\(/, `${r} no filtra con la regla común`);
            }
        });

        test("los botones de una fila son los mismos en las cuatro", () => {
            for (const r of ["sales", "expenses", "accounts", "_contacts"]) {
                const f = r === "_contacts" ? `${FIN}/_contacts/columns.tsx` : `${FIN}/${r}/_components/columns.tsx`;
                assert.match(sinComentarios(hoy(f)), /<AccionesDeLaFila\b/, `${f} escribe sus propios botones`);
            }
        });

        test("la fila de accesos sale de la lista, y marca con la regla", () => {
            const atajos = sinComentarios(hoy(`${FIN}/_components/FinanceModuleShortcuts.tsx`));
            assert.match(atajos, /ACCESOS_DE_FINANZAS/);
            assert.match(atajos, /elAccesoActivo\(/);
            assert.doesNotMatch(atajos, /label: '(Clientes|Ventas|Gastos)'/, "la lista vuelve a estar escrita en el componente");
        });

        test("el resumen tiene flechas de año, y el eje usa el número corto", () => {
            const pagina = sinComentarios(hoy(`${FIN}/page.tsx`));
            assert.match(pagina, /elMesDeOtroAno\(mesActual, -1\)/);
            assert.match(pagina, /elMesDeOtroAno\(mesActual, 1\)/);
            assert.match(pagina, /data-anos-del-resumen/);
            const grafica = sinComentarios(hoy(`${FIN}/_components/FinanceMonthChart.tsx`));
            assert.match(grafica, /tickFormatter=\{\(v\) => elNumeroCortoDelEje\(Number\(v\)\)\}/);
            assert.doesNotMatch(grafica, /toFixed\(1\)\}k`/);
        });

        test("fijo o variable sale de la regla, no de una lista en la columna", () => {
            const gastos = sinComentarios(hoy(`${FIN}/expenses/_components/columns.tsx`));
            assert.match(gastos, /\belTipoDelGasto\b/);
            assert.doesNotMatch(gastos, /new Set\(\[/);
        });

        test("una columna de dinero lleva el título a la derecha, como su cifra", () => {
            const t = sinComentarios(hoy(`${FIN}/_components/TablaDeFinanzas.tsx`));
            assert.match(t, /alinear === 'derecha'\s*\?\s*'py-2 text-right'/);
            const cuentas = sinComentarios(hoy(`${FIN}/accounts/_components/columns.tsx`));
            for (const id of ["ventas", "gastos", "saldo"]) {
                assert.match(cuentas, new RegExp(`id: '${id}',\\s*header: '[^']+',\\s*meta: \\{ alinear: 'derecha' \\}`), `la columna «${id}» de Cuentas`);
            }
            assert.match(sinComentarios(hoy(`${FIN}/_components/ColumnasDeMovimientos.tsx`)), /meta: \{ etiqueta: 'Total', alinear: 'derecha' \}/);
        });

        test("los detalles de una venta y de un gasto tienen la MISMA forma", () => {
            for (const r of [`${FIN}/sales/_components/MainSales.tsx`, `${FIN}/expenses/_components/MainExpenses.tsx`]) {
                const t = sinComentarios(hoy(r));
                for (const k of ["DIALOGO_DEL_DETALLE", "CABECERA_DEL_DETALLE", "CUERPO_DEL_DETALLE", "REJILLA_DEL_DETALLE"]) {
                    assert.match(t, new RegExp(`className=\\{${k}\\}`), `${r} no usa ${k}`);
                }
                assert.match(t, /data-total-del-detalle/, `${r}: el total no va en su tarjeta`);
                assert.doesNotMatch(t, /sm:max-w-\[820px\]/, `${r}: un detalle más estrecho que el otro`);
            }
            const venta = sinComentarios(hoy(`${FIN}/sales/_components/MainSales.tsx`));
            const desglose = venta.slice(venta.indexOf("data-desglose-del-detalle"), venta.indexOf("</dl>", venta.indexOf("data-desglose-del-detalle")));
            assert.ok(desglose.length > 0, "el detalle de una venta no tiene su desglose");
            assert.doesNotMatch(desglose, /truncate/, "los importes del desglose se recortan con «…»");
        });

        test("Gastos enseña el concepto escrito, y el proveedor se sigue encontrando", () => {
            const columnas = sinComentarios(hoy(`${FIN}/expenses/_components/columns.tsx`));
            assert.match(columnas, /columnaDeConcepto<ExpenseRow>\(\(f\) => elConceptoDelGasto\(f\), \(f\) => f\.counterparty\)/);
            for (const r of [`${FIN}/expenses/_components/columns.tsx`, `${FIN}/expenses/_components/MainExpenses.tsx`]) {
                assert.doesNotMatch(sinComentarios(hoy(r)), /counterparty \|\| [a-zA-Z.]*title/, `${r}: el proveedor por delante del concepto`);
            }
            assert.match(sinComentarios(hoy(`${FIN}/_components/ColumnasDeMovimientos.tsx`)), /accessorFn: \(f\) => \[concepto\(f\), tambien\?\.\(f\)\]/);
        });

        test("el código de un contacto no se repite, y borrar en bloque solo marca", () => {
            const acciones = sinComentarios(hoy("actions/finance-contacts-actions.ts"));
            assert.match(acciones, /elSiguienteCodigo\(elPrefijoDelContacto\(kind\)/);
            assert.doesNotMatch(acciones, /financeContact\.count\(/);
            const bloque = sinComentarios(hoy("actions/borrado-en-bloque-actions.ts"));
            const trozo = bloque.slice(bloque.indexOf("eliminarContactosDeFinanzasAction"), bloque.indexOf("eliminarCuentasDeFinanzasAction"));
            assert.doesNotMatch(trozo, /financeContact\.deleteMany/, "borrar en bloque vuelve a borrar de verdad");
            assert.match(trozo, /status: "DELETED"/);
            assert.match(sinComentarios(hoy(`${FIN}/_contacts/MainFinanceContacts.tsx`)), /elCodigoAutomatico\(kind\)/);
        });

        test("la vista previa de una venta no se come el concepto con el desglose", () => {
            const venta = sinComentarios(hoy(`${FIN}/sales/_components/MainSales.tsx`));
            const desglose = /<p className="[^"]*" data-desglose-de-la-venta>/.exec(venta);
            assert.ok(desglose, "el desglose no tiene su línea propia");
            const total = venta.indexOf('<div className="shrink-0 text-right">');
            const cierreDelTotal = venta.indexOf("</div>", venta.indexOf("{enSuMoneda(total)}", total));
            assert.ok(desglose.index > cierreDelTotal, "el desglose vuelve a ir dentro de la columna del total, que no encoge");
            for (const r of [`${FIN}/sales/_components/MainSales.tsx`, `${FIN}/expenses/_components/MainExpenses.tsx`]) {
                const t = sinComentarios(hoy(r));
                for (const m of t.matchAll(/<Badge variant="outline" className="([^"]*)">\s*\{preview(?:Account|Category)Name\}/g)) {
                    assert.match(m[1], /whitespace-nowrap/, `${r}: la cuenta o la categoría se parte en dos líneas`);
                }
            }
        });
    });
}
