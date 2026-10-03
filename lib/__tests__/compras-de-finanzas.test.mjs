/**
 * Compras de Finanzas: las reglas (`lib/compras-de-finanzas.ts`, puras) y un
 * barrido del código.
 *
 * El acceso «Compras» abría Gastos con `?create=1` —el formulario «Nuevo
 * gasto», sin proveedor—. Ahora pide `?create=compra` y la pantalla abre
 * «Nueva compra», con el proveedor elegido de la lista de Proveedores. El
 * barrido comprueba que la pantalla, el enlace y las acciones pasan por esas
 * reglas, y no por una copia.
 *
 * `MODO=roto` lee los mismos ficheros de `ANTES_REF` —pinchado a un commit,
 * nunca `origin/main`— con `git show` y AFIRMA el fallo: el acceso abría un
 * gasto, no había formulario de compra ni selector de proveedor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "fd21c8f";

const GASTOS = "app/(root)/(protected)/dashboard/finance/expenses";
const PANTALLA = `${GASTOS}/_components/MainExpenses.tsx`;
const PAGINA = `${GASTOS}/page.tsx`;
const SELECTOR = `${GASTOS}/_components/SelectorDeProveedor.tsx`;
const ACCIONES = "actions/finance-expenses-actions.ts";
const ACCESOS = "lib/accesos-de-finanzas.ts";

/** El fichero de hoy, o el de `ANTES_REF` en modo roto (`null` si no existía). */
function leer(ruta) {
    if (!ROTO) return readFileSync(ruta, "utf8");
    try {
        return execFileSync("git", ["show", `${ANTES}:${ruta}`], { stdio: ["ignore", "pipe", "ignore"] }).toString();
    } catch {
        return null;
    }
}

/** Quita los comentarios, que dicen a propósito cómo era antes. */
function sinComentarios(codigo) {
    return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

if (ROTO) {
    test("antes: el acceso «Compras» abría el formulario de un GASTO (create=1)", () => {
        const accesos = leer(ACCESOS);
        assert.ok(accesos, "accesos-de-finanzas.ts tenía que existir");
        const fila = accesos.split("\n").find((l) => l.includes('id: "purchases"'));
        assert.ok(fila, "la fila de Compras tenía que existir");
        assert.doesNotMatch(fila, /queCrea/);
        assert.match(accesos, /create=1/);
    });

    test("antes: no había reglas de compra ni selector de proveedor", () => {
        assert.equal(leer("lib/compras-de-finanzas.ts"), null);
        assert.equal(leer(SELECTOR), null);
    });

    test("antes: el formulario decía siempre «Nuevo gasto» y no pedía proveedor", () => {
        const pantalla = sinComentarios(leer(PANTALLA));
        assert.match(pantalla, /'Nuevo gasto'/);
        // El proveedor solo se LEÍA en el detalle; el formulario no tenía dónde elegirlo.
        assert.doesNotMatch(pantalla, /SelectorDeProveedor|label="Proveedor"|>Proveedor</);
        assert.doesNotMatch(pantalla, /proveedorId/);
    });

    test("antes: la página solo sabía abrir un gasto (autoOpenCreate === \"1\")", () => {
        const pagina = leer(PAGINA);
        assert.match(pagina, /autoOpenCreate=/);
        assert.doesNotMatch(pagina, /SUPPLIER/);
    });

    test("antes: las acciones no conocían el proveedor de una compra", () => {
        const acciones = leer(ACCIONES);
        assert.doesNotMatch(acciones, /proveedorId/);
        assert.doesNotMatch(acciones, /SUPPLIER/);
    });
} else {
    const c = await import("./.compilado/compras-de-finanzas/compras-de-finanzas.js");
    const ac = await import("./.compilado/compras-de-finanzas/accesos-de-finanzas.js");

    test("?create= decide el formulario: compra, gasto, o ninguno", () => {
        assert.equal(c.elFormularioAlEntrar("compra"), "compra");
        assert.equal(c.elFormularioAlEntrar(" Compra "), "compra");
        assert.equal(c.elFormularioAlEntrar(["compra", "1"]), "compra");
        assert.equal(c.elFormularioAlEntrar("1"), "gasto");
        assert.equal(c.elFormularioAlEntrar(undefined), null);
        assert.equal(c.elFormularioAlEntrar(""), null);
        assert.equal(c.elFormularioAlEntrar("cualquier-cosa"), null);
        assert.equal(c.CREAR_UNA_COMPRA, "compra");
        assert.equal(c.CREAR_UN_GASTO, "1");
    });

    test("la dirección pierde su ?create= y conserva lo demás", () => {
        assert.equal(
            c.laDireccionSinCrear("/dashboard/finance/expenses", "?month=2026-10&create=compra"),
            "/dashboard/finance/expenses?month=2026-10",
        );
        assert.equal(c.laDireccionSinCrear("/x", "?create=1"), "/x");
        assert.equal(c.laDireccionSinCrear("/x", "?cuentas=a%2Cb&create=compra&month=2026-09"), "/x?cuentas=a%2Cb&month=2026-09");
        assert.equal(c.laDireccionSinCrear("/x", "?month=2026-10"), null);
        assert.equal(c.laDireccionSinCrear("/x", ""), null);
    });

    test("la referencia del proveedor va y vuelve, y lo que no es una no cuenta", () => {
        assert.equal(c.laReferenciaDelProveedor("abc"), "proveedor:abc");
        assert.equal(c.elProveedorDeLaReferencia("proveedor:abc"), "abc");
        assert.equal(c.elProveedorDeLaReferencia(c.laReferenciaDelProveedor("x-1")), "x-1");
        assert.equal(c.elProveedorDeLaReferencia("proveedor:"), null);
        assert.equal(c.elProveedorDeLaReferencia("FAC-001"), null);
        assert.equal(c.elProveedorDeLaReferencia(null), null);
    });

    test("es una compra si tiene proveedor, por nombre o por referencia", () => {
        assert.equal(c.esUnaCompra({ counterparty: "Finca La Esperanza" }), true);
        assert.equal(c.esUnaCompra({ reference: "proveedor:abc" }), true);
        assert.equal(c.esUnaCompra({ counterparty: "  ", reference: "FAC-1" }), false);
        assert.equal(c.esUnaCompra({}), false);
    });

    test("los textos: una compra se nombra compra, y un gasto se queda como siempre", () => {
        assert.equal(c.losTextosDelFormulario("compra", false).titulo, "Nueva compra");
        assert.equal(c.losTextosDelFormulario("compra", true).titulo, "Editar compra");
        assert.equal(c.losTextosDelFormulario("compra", false).guardar, "Guardar compra");
        assert.equal(c.losTextosDelFormulario("compra", false).creado, "Compra creada");
        assert.equal(c.losTextosDelFormulario("gasto", false).titulo, "Nuevo gasto");
        assert.equal(c.losTextosDelFormulario("gasto", true).titulo, "Editar gasto");
        assert.equal(c.losTextosDelFormulario("gasto", false).guardar, "Guardar gasto");
        assert.equal(c.losTextosDelFormulario("gasto", false).creado, "Gasto creado");
    });

    test("en una compra el proveedor se pide PRIMERO; un gasto no lo pide", () => {
        const lleno = { accountId: "a", title: "Café", amount: "1000" };
        assert.equal(c.porQueNoSeGuarda("compra", lleno, {}), "Elige el proveedor");
        assert.equal(c.porQueNoSeGuarda("compra", {}, {}), "Elige el proveedor");
        assert.equal(c.porQueNoSeGuarda("compra", lleno, { id: "p1" }), null);
        assert.equal(c.porQueNoSeGuarda("compra", lleno, { nombreActual: "Finca" }), null);
        assert.equal(c.porQueNoSeGuarda("gasto", lleno, {}), null);
        assert.equal(c.porQueNoSeGuarda("gasto", { title: "x", amount: "1" }, {}), "Selecciona una cuenta");
        assert.equal(c.porQueNoSeGuarda("gasto", { accountId: "a", amount: "1" }, {}), "Ingresa el concepto");
        assert.equal(c.porQueNoSeGuarda("gasto", { accountId: "a", title: "x" }, {}), "Ingresa un monto");
    });

    test("al editar, el proveedor solo se manda si CAMBIÓ", () => {
        assert.equal(c.elProveedorQueSeManda("compra", "p1"), "p1");
        assert.equal(c.elProveedorQueSeManda("compra", "p1", "proveedor:p1"), undefined);
        assert.equal(c.elProveedorQueSeManda("compra", "p2", "proveedor:p1"), "p2");
        assert.equal(c.elProveedorQueSeManda("compra", null, "proveedor:p1"), undefined);
        assert.equal(c.elProveedorQueSeManda("gasto", "p1"), undefined);
    });

    test("el buscador de proveedores: nombre, código o teléfono, sin tildes", () => {
        const lista = [
            { id: "1", name: "Finca La Esperanza", code: "P-1", phone: "573001" },
            { id: "2", name: "Empaques del Valle", code: "P-2", phone: null },
            { id: "3", name: "Tostadores Pro", code: "P-4" },
        ];
        assert.deepEqual(c.losProveedoresQueCasan("", lista).map((p) => p.id), ["1", "2", "3"]);
        assert.deepEqual(c.losProveedoresQueCasan("ESPERANZA", lista).map((p) => p.id), ["1"]);
        assert.deepEqual(c.losProveedoresQueCasan("p-2", lista).map((p) => p.id), ["2"]);
        assert.deepEqual(c.losProveedoresQueCasan("5730", lista).map((p) => p.id), ["1"]);
        assert.deepEqual(c.losProveedoresQueCasan("ñandú", [{ id: "9", name: "Nandú" }]).map((p) => p.id), ["9"]);
    });

    test("se ofrece crear solo lo que no existe ya (sin tildes ni mayúsculas)", () => {
        const lista = [{ id: "1", name: "Café Andino" }];
        assert.equal(c.sePuedeCrearElProveedor("", lista), false);
        assert.equal(c.sePuedeCrearElProveedor("   ", lista), false);
        assert.equal(c.sePuedeCrearElProveedor("cafe andino", lista), false);
        assert.equal(c.sePuedeCrearElProveedor("Café Andino ", lista), false);
        assert.equal(c.sePuedeCrearElProveedor("Café", lista), true);
    });

    test("el acceso «Compras» abre una compra; «Gastos» y «Recibos de caja» siguen igual", () => {
        const porId = Object.fromEntries(ac.ACCESOS_DE_FINANZAS.map((a) => [a.id, a]));
        assert.equal(
            ac.elEnlaceDelAcceso(porId.purchases, "2026-10"),
            "/dashboard/finance/expenses?month=2026-10&create=compra",
        );
        assert.equal(ac.elEnlaceDelAcceso(porId.expenses, "2026-10"), "/dashboard/finance/expenses?month=2026-10");
        assert.equal(
            ac.elEnlaceDelAcceso(porId["cash-receipts"], "2026-10"),
            "/dashboard/finance/sales?month=2026-10&create=1",
        );
        // Y lo que abre ese enlace es una compra.
        const enlace = new URL(ac.elEnlaceDelAcceso(porId.purchases, "2026-10"), "http://x");
        assert.equal(c.elFormularioAlEntrar(enlace.searchParams.get("create")), "compra");
        // Un atajo no se enciende: al entrar a Gastos solo se marca «Gastos».
        assert.equal(ac.elAccesoActivo("/dashboard/finance/expenses"), "expenses");
    });

    test("barrido: la pantalla de Gastos pasa por las reglas, y no por una copia", () => {
        const pantalla = sinComentarios(readFileSync(PANTALLA, "utf8"));
        assert.match(pantalla, /<SelectorDeProveedor/);
        assert.match(pantalla, /losTextosDelFormulario\(/);
        assert.match(pantalla, /porQueNoSeGuarda\(/);
        assert.match(pantalla, /elProveedorQueSeManda\(/);
        assert.match(pantalla, /esUnaCompra\(/);
        // El título no está escrito a mano: sale de los textos.
        assert.doesNotMatch(pantalla, /'Nuevo gasto'|"Nuevo gasto"|>Nuevo gasto</);
        assert.doesNotMatch(pantalla, /autoOpenCreate/);
        assert.match(pantalla, /data-formulario-de-gasto=\{modo\}/);
        // Abrir quita el ?create= (o pulsar «Compras» otra vez no abriría nada),
        // y sin él el formulario se puede volver a abrir.
        assert.match(pantalla, /laDireccionSinCrear\(window\.location\.pathname, window\.location\.search\)/);
        assert.match(pantalla, /if \(!formularioAlEntrar\) \{\s*didAutoOpenCreate\.current = false;/);
    });

    test("barrido: la página lee ?create= con la regla y trae los PROVEEDORES de la cuenta", () => {
        const pagina = sinComentarios(readFileSync(PAGINA, "utf8"));
        assert.match(pagina, /formularioAlEntrar=\{elFormularioAlEntrar\(searchParams\?\.create\)\}/);
        assert.match(pagina, /getFinanceContacts\(user\.id, "SUPPLIER"\)/);
        assert.match(pagina, /proveedores=\{proveedores\}/);
        // Una lista que no se pudo leer no tumba Gastos.
        assert.match(pagina, /getFinanceContacts\([^)]*\)\.catch\(/);
    });

    test("barrido: el selector crea el proveedor por la MISMA acción que Proveedores", () => {
        const selector = sinComentarios(readFileSync(SELECTOR, "utf8"));
        assert.match(selector, /createFinanceContact\('SUPPLIER'/);
        assert.match(selector, /losProveedoresQueCasan\(/);
        assert.match(selector, /sePuedeCrearElProveedor\(/);
        assert.match(selector, /<Command shouldFilter=\{false\}>/);
    });

    test("barrido: el servidor busca el proveedor en la lista de la cuenta, al crear y al editar", () => {
        const acciones = sinComentarios(readFileSync(ACCIONES, "utf8"));
        assert.match(acciones, /kind: 'SUPPLIER', status: 'ACTIVE'/);
        const crear = acciones.slice(acciones.indexOf("export async function createExpense"));
        const editar = acciones.slice(acciones.indexOf("export async function updateExpense"));
        assert.match(crear.slice(0, crear.indexOf("export async function", 10)), /elProveedorDeLaCompra\(userId, data\.proveedorId\)/);
        assert.match(editar.slice(0, editar.indexOf("export async function", 10)), /elProveedorDeLaCompra\(userId, data\.proveedorId\)/);
        // Lo guarda el servidor: el nombre y la referencia salen de la fila del proveedor.
        assert.match(acciones, /laReferenciaDelProveedor\(/);
        // Editar ya no copia todo lo que llegue (antes: `...data`).
        const cuerpo = editar.slice(0, editar.indexOf("export async function", 10));
        assert.doesNotMatch(cuerpo, /\.\.\.data\b/);
    });

    test("barrido: el acceso «Compras» pide la compra con la constante, no a mano", () => {
        const accesos = sinComentarios(readFileSync(ACCESOS, "utf8"));
        const fila = accesos.split("\n").find((l) => l.includes('id: "purchases"'));
        assert.match(fila, /queCrea: CREAR_UNA_COMPRA/);
    });
}
