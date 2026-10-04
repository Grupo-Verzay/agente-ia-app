/**
 * PLANTILLAS DE PLANES de Propuestas comerciales.
 *
 * 1. **La regla** (pura): qué se acepta al guardar una plantilla y cómo se
 *    carga en una propuesta —una COPIA en cadenas nuevas, que sustituye las
 *    filas en blanco y conserva lo escrito—.
 * 2. **Las acciones contra Postgres**: sin tope de cuántas (se crean más de las
 *    seis de la marca), editar y borrar, otra cuenta ni un agente tocan nada, y
 *    la propuesta hecha con una plantilla no cambia al editar o borrar la
 *    plantilla, ni la plantilla al editar la propuesta.
 * 3. **La pantalla real en Chromium** sobre el CSS del build: la sección
 *    «Plantillas de planes», crear una, cargarla en una propuesta, editarla ahí
 *    y comprobar que la plantilla sigue igual. A 1440/1024/390.
 *
 * `MODO=roto` lee el código de `ANTES_REF` (f8057cb) y AFIRMA que no había
 * plantillas: ni módulo, ni acciones, ni selector en el formulario.
 *
 * Se levanta con `scripts/banco-plantillas-de-planes.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    // Sin navegador no se finge: se salta y se dice.
}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "plantillas");
const HARNESS = join(AQUI, ".compilado", "harness-plantillas.js");
const ANTES_REF = process.env.ANTES_REF ?? "f8057cb";
const FORM = "app/(root)/(protected)/panel/propuestas/_components/FormularioDePropuesta.tsx";
const CLIENTE = "app/(root)/(protected)/panel/propuestas/_components/PropuestasClient.tsx";

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deAntes = (f) => {
    try {
        execFileSync("git", ["cat-file", "-e", `${ANTES_REF}:${f}`], { cwd: RAIZ, stdio: "ignore" });
        return execFileSync("git", ["show", `${ANTES_REF}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};

if (ROTO) {
    test("ANTES: no existía el módulo de plantillas", () => {
        assert.ok(deAntes("lib/propuestas.ts"), "no se pudo leer ANTES_REF");
        assert.equal(deAntes("lib/plantillas-de-planes.ts"), null);
    });
    test("ANTES: no había acciones ni tabla de plantillas", () => {
        const acc = deAntes("actions/propuestas-actions.ts");
        assert.equal(acc.includes("crearPlantillaAction"), false);
        assert.equal(deAntes("lib/propuestas-db.ts").includes("propuestas_plantillas"), false);
    });
    test("ANTES: la propuesta no podía cargar un plan ni había sección de plantillas", () => {
        assert.equal(deAntes(FORM).includes("cargarPlantilla"), false);
        assert.equal(deAntes(CLIENTE).includes("Plantillas de planes"), false);
    });
} else {
    const r = await import(join(COMPILADO, "plantillas-de-planes.js"));

    // ─────────────────────────────────────────────────────────────────────────
    // 1. La regla, pura
    // ─────────────────────────────────────────────────────────────────────────

    test("se acepta una plantilla y se sanea", () => {
        const v = r.comoPlantilla({
            nombre: "  Business   Plus ",
            precio: "1.200.000",
            moneda: "usd",
            caracteristicas: "- 3 líneas\n\n• Agente de IA\r\n✓ CRM  y   embudos\n   ",
        });
        assert.equal(v.ok, true, v.motivo);
        assert.deepEqual(v.datos, { nombre: "Business Plus", precio: 1200000, moneda: "USD", caracteristicas: ["3 líneas", "Agente de IA", "CRM y embudos"], plan: null });
        assert.deepEqual(r.comoPlantilla({ nombre: "Lite", precio: 0 }).datos.caracteristicas, [], "sin características también vale");
        assert.equal(r.comoPlantilla({ nombre: "Lite", precio: 0 }).datos.precio, 0, "cero SÍ es un precio");
    });

    test("lo que falta o no se entiende se rechaza con su motivo", () => {
        assert.match(r.comoPlantilla({ nombre: " ", precio: 1 }).motivo, /nombre/);
        assert.match(r.comoPlantilla({ nombre: "X", precio: "" }).motivo, /precio de «X»/);
        assert.match(r.comoPlantilla({ nombre: "X", precio: "mucho" }).motivo, /no es un importe/);
        assert.match(r.comoPlantilla({ nombre: "X", precio: 1, moneda: "BTC" }).motivo, /moneda/);
        assert.equal(r.comoPlantilla(null).ok, false);
    });

    test("cargar es COPIAR: cadenas nuevas, las filas en blanco se sustituyen y lo escrito se queda", () => {
        const pl = { nombre: "Starter", precio: 250000, caracteristicas: ["1 línea", "IA"] };
        const vacia = r.conLaPlantillaCargada([{ nombre: "", alcance: "", inversion: "" }], pl, 30);
        assert.equal(vacia.cabe, true);
        assert.deepEqual(vacia.filas, [{ nombre: "Starter", alcance: "1 línea\nIA", inversion: "250000" }]);
        vacia.filas[0].nombre = "Starter a medida";
        vacia.filas[0].alcance += "\nextra";
        assert.deepEqual(pl, { nombre: "Starter", precio: 250000, caracteristicas: ["1 línea", "IA"] }, "editar la fila no toca la plantilla");
        const conAlgo = r.conLaPlantillaCargada([{ nombre: "Landing", alcance: "", inversion: "800000" }, { nombre: "", alcance: "", inversion: "" }], pl, 30);
        assert.deepEqual(conAlgo.filas.map((f) => f.nombre), ["Landing", "Starter"]);
        const llena = Array.from({ length: 3 }, (_, i) => ({ nombre: `S${i}`, alcance: "", inversion: "1" }));
        assert.equal(r.conLaPlantillaCargada(llena, pl, 3).cabe, false, "el tope de la propuesta se respeta");
    });

    test("las plantillas se ordenan como una escalera de planes", () => {
        const l = r.ordenarPlantillas([{ nombre: "Business", precio: 800 }, { nombre: "Lite", precio: 99 }, { nombre: "Básico", precio: 99 }]);
        assert.deepEqual(l.map((p) => p.nombre), ["Básico", "Lite", "Business"]);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Barrido
    // ─────────────────────────────────────────────────────────────────────────

    test("la tabla es de la App, sin tope de cuántas y acotada por cuenta", () => {
        const db = crudo("lib/propuestas-db.ts");
        assert.ok(db.includes('CREATE TABLE IF NOT EXISTS "propuestas_plantillas"'));
        const lista = db.slice(db.indexOf("export async function lasPlantillasDe"), db.indexOf("export async function crearPlantilla"));
        assert.equal(/LIMIT/.test(lista), false, "sin tope de cuántas");
        for (const f of ["editarPlantilla", "borrarPlantilla"]) {
            const cuerpo = db.slice(db.indexOf(`export async function ${f}`));
            assert.ok(cuerpo.slice(0, 900).includes('"cuentaId" = $2'), `${f} va acotada por la cuenta`);
        }
    });

    test("la propuesta guarda la copia, no el id de la plantilla", () => {
        const reglas = crudo("lib/propuestas.ts");
        assert.equal(/plantilla/i.test(reglas), false, "la propuesta no sabe nada de plantillas");
        assert.ok(crudo(FORM).includes("conLaPlantillaCargada"));
    });

    test("las tres acciones pasan por la misma puerta que las propuestas", () => {
        const acc = crudo("actions/propuestas-actions.ts");
        for (const a of ["crearPlantillaAction", "editarPlantillaAction", "borrarPlantillaAction"]) {
            const cuerpo = acc.slice(acc.indexOf(`export async function ${a}`), acc.indexOf(`export async function ${a}`) + 400);
            assert.ok(cuerpo.includes("await quienManda()"), `${a} pregunta quién manda`);
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Las acciones contra Postgres
    // ─────────────────────────────────────────────────────────────────────────

    const hayBase = Boolean(process.env.DATABASE_URL);
    const conBase = hayBase ? test : test.skip;
    let m = null;
    if (hayBase) m = await import(join(COMPILADO, "entrada-de-plantillas-de-planes.js"));

    const sello = Date.now().toString(36);
    const A = `pl-a-${sello}`;
    const B = `pl-b-${sello}`;
    const AGENTE = `pl-ag-${sello}`;
    const DUENO_A = { id: A, sessionUserId: A, role: "user", ownerId: null, name: "Cuenta A" };
    const DUENO_B = { id: B, sessionUserId: B, role: "user", ownerId: null, name: "Cuenta B" };
    const AGENTE_A = { id: AGENTE, sessionUserId: AGENTE, role: "user", ownerId: A, advisorRole: "agente", name: "Ag" };
    const PLANES = [["Lite", 99000], ["Básico", 150000], ["Starter", 250000], ["Esencial", 400000], ["Business", 800000], ["Enterprise", 2500000], ["Pro Plus", 1200000], ["Mega", 5000000]];
    let creadas = [];

    conBase("siembra de las cuentas", async () => {
        for (const [id, extra] of [[A, {}], [B, {}], [AGENTE, { ownerId: A, advisorRole: "agente" }]]) {
            await m.db.user.create({ data: { id, email: `${id}@banco.test`, name: id, ...extra } });
        }
    });

    conBase("se crean tantas como se necesiten, más de las seis de la marca", async () => {
        m.ponerAQuienMira(DUENO_A);
        for (const [nombre, precio] of PLANES) {
            const x = await m.crearPlantillaAction({ nombre, precio: String(precio), caracteristicas: `${nombre}: 1 línea\nAgente de IA` });
            assert.equal(x.success, true, x.message);
            creadas.push(x.data);
        }
        const l = await m.listarPropuestasAction();
        assert.equal(l.success, true);
        assert.equal(l.data.plantillas.length, PLANES.length);
        assert.deepEqual(l.data.plantillas.map((p) => p.nombre), [...PLANES].sort((a, b) => a[1] - b[1]).map((p) => p[0]));
    });

    conBase("editar y eliminar una plantilla", async () => {
        m.ponerAQuienMira(DUENO_A);
        const lite = creadas.find((p) => p.nombre === "Lite");
        const e = await m.editarPlantillaAction(lite.id, { nombre: "Lite 2026", precio: "119.000", moneda: "COP", caracteristicas: "1 línea\nSoporte" });
        assert.equal(e.success, true, e.message);
        assert.deepEqual([e.data.nombre, e.data.precio, e.data.caracteristicas], ["Lite 2026", 119000, ["1 línea", "Soporte"]]);
        const mega = creadas.find((p) => p.nombre === "Mega");
        assert.equal((await m.borrarPlantillaAction(mega.id)).success, true);
        const l = await m.listarPropuestasAction();
        assert.equal(l.data.plantillas.length, PLANES.length - 1);
        assert.equal(l.data.plantillas.some((p) => p.id === mega.id), false);
        assert.match((await m.editarPlantillaAction(lite.id, { nombre: "", precio: 1 })).message, /nombre/);
    });

    conBase("otra cuenta ni un agente ven ni tocan las plantillas de A", async () => {
        const business = creadas.find((p) => p.nombre === "Business");
        m.ponerAQuienMira(DUENO_B);
        assert.equal((await m.listarPropuestasAction()).data.plantillas.length, 0);
        assert.equal((await m.editarPlantillaAction(business.id, { nombre: "Robada", precio: 1 })).success, false);
        assert.equal((await m.borrarPlantillaAction(business.id)).success, false);
        m.ponerAQuienMira(AGENTE_A);
        assert.equal((await m.crearPlantillaAction({ nombre: "X", precio: 1 })).success, false);
        assert.equal((await m.borrarPlantillaAction(business.id)).success, false);
        m.ponerAQuienMira(null);
        assert.equal((await m.crearPlantillaAction({ nombre: "X", precio: 1 })).success, false);
        m.ponerAQuienMira(DUENO_A);
        const sigue = (await m.listarPropuestasAction()).data.plantillas.find((p) => p.id === business.id);
        assert.equal(sigue.nombre, "Business");
    });

    conBase("la propuesta hecha con una plantilla es independiente de ella, en los dos sentidos", async () => {
        m.ponerAQuienMira(DUENO_A);
        const business = (await m.listarPropuestasAction()).data.plantillas.find((p) => p.nombre === "Business");
        const antes = JSON.stringify(business);
        const { filas } = m.conLaPlantillaCargada([{ nombre: "", alcance: "", inversion: "" }], business, 30);
        const p = await m.crearPropuestaAction({ cliente: "Ana", fecha: "2026-09-29", moneda: "COP", servicios: filas });
        assert.equal(p.success, true, p.message);
        assert.deepEqual(p.data.servicios, [{ nombre: "Business", alcance: "Business: 1 línea\nAgente de IA", inversion: 800000 }]);
        // Se edita la propuesta: la plantilla no se entera.
        const e = await m.editarPropuestaAction(p.data.id, {
            cliente: "Ana", fecha: "2026-09-29", moneda: "COP",
            servicios: [{ nombre: "Business a medida", alcance: "Solo CRM", inversion: "650.000" }],
        });
        assert.equal(e.success, true, e.message);
        const tras = (await m.listarPropuestasAction()).data.plantillas.find((x) => x.id === business.id);
        assert.equal(JSON.stringify(tras), antes, "editar la propuesta no cambió la plantilla");
        // Se edita y se borra la plantilla: la propuesta no se entera.
        await m.editarPlantillaAction(business.id, { nombre: "Business 2027", precio: "999.000", caracteristicas: "Otra cosa" });
        let prop = (await m.listarPropuestasAction()).data.propuestas.find((x) => x.id === p.data.id);
        assert.deepEqual(prop.servicios, [{ nombre: "Business a medida", alcance: "Solo CRM", inversion: 650000 }]);
        await m.borrarPlantillaAction(business.id);
        prop = (await m.listarPropuestasAction()).data.propuestas.find((x) => x.id === p.data.id);
        assert.equal(prop.servicios[0].nombre, "Business a medida", "borrar la plantilla no toca la propuesta");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. La pantalla real en Chromium
    // ─────────────────────────────────────────────────────────────────────────

    const cssDir = join(RAIZ, ".next", "static", "css");
    const hayNavegador = chromium && fs.existsSync(HARNESS) && fs.existsSync(cssDir);
    const conNavegador = hayNavegador ? test : test.skip;

    /**
     * Las dos secciones viven en el carril de la barra, que en un teléfono se
     * desplaza con flechas encima de sus bordes: se lleva la pastilla a la vista
     * como lo hace una persona (desplazando el carril) y se pulsa.
     */
    async function irA(pag, seccion) {
        const sel = `[data-seccion="${seccion}"]`;
        // Un diálogo que se está cerrando sigue con su velo encima un instante.
        await pag.waitForFunction(() => !document.querySelector('[role="dialog"], [data-state="closed"][class*="fixed inset-0"]'));
        await pag.$eval(sel, (el) => el.scrollIntoView({ inline: "center", block: "nearest" }));
        const alcanzable = await pag.$eval(sel, (el) => {
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return el.contains(top) ? true : `${window.innerWidth}: encima está ${top?.outerHTML.slice(0, 160)}`;
        });
        assert.equal(alcanzable, true, `la pastilla «${seccion}» no se puede pulsar ni desplazando el carril`);
        await pag.$eval(sel, (el) => el.click());
    }

    conNavegador("la sección de plantillas y cargar un plan en la propuesta, simétrico y sin salirse", async () => {
        const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
        const js = fs.readFileSync(HARNESS, "utf8");
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>${js}</script></body></html>`;
        const srv = http.createServer((_q, res) => { res.setHeader("content-type", "text/html"); res.end(html); });
        await new Promise((ok) => srv.listen(0, ok));
        const url = `http://127.0.0.1:${srv.address().port}/`;
        const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
        try {
            for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
                const pag = await nav.newPage({ viewport: { width: w, height: h } });
                const errores = [];
                pag.on("pageerror", (e) => errores.push(String(e)));
                await pag.goto(url);
                await pag.waitForFunction(() => window.listo === true);

                // La barra mide lo mismo en las dos secciones: es la misma.
                const barra = () => pag.evaluate(() => document.querySelector("[data-barra-de-acciones]")?.getBoundingClientRect().height ?? -1);
                const altoPropuestas = await barra();
                await irA(pag, "Plantillas de planes");
                await pag.waitForSelector("[data-seccion-plantillas]");
                assert.equal(await barra(), altoPropuestas, `${w}: la barra no cambia de alto al cambiar de sección`);
                const filas = await pag.$$eval("[data-plantilla-fila]", (n) => n.map((x) => x.querySelector("button").textContent));
                assert.deepEqual(filas, ["Lite", "Básico", "Starter", "Esencial", "Business", "Pro Plus", "Enterprise"], `${w}: las siete, en orden de precio`);

                // Crear una plantilla desde la sección.
                await pag.getByRole("button", { name: "Nuevo", exact: true }).click();
                await pag.fill("#plantilla-nombre", "Premium");
                await pag.fill("#plantilla-precio", "3.000.000");
                await pag.fill("#plantilla-caracteristicas", "5 líneas\nSoporte 24/7");
                const dlg = await pag.evaluate(() => {
                    const d = document.querySelector('[role="dialog"]').getBoundingClientRect();
                    return { l: d.left, r: d.right, vw: window.innerWidth, doc: document.documentElement.scrollWidth };
                });
                assert.ok(dlg.l >= 0 && dlg.r <= dlg.vw + 0.5 && dlg.doc <= dlg.vw, `${w}: el diálogo de la plantilla cabe (${JSON.stringify(dlg)})`);
                await pag.getByRole("button", { name: "Crear", exact: true }).click();
                await pag.waitForFunction(() => document.querySelectorAll("[data-plantilla-fila]").length === 8);

                // Nueva propuesta: cargar un plan y editarlo ahí.
                await irA(pag, "Propuestas");
                await pag.getByRole("button", { name: "Nuevo", exact: true }).click();
                await pag.waitForSelector("[data-cargar-plan]");
                const opciones = await pag.$$eval("[data-cargar-plan] option", (o) => o.length - 1);
                assert.equal(opciones, 8, `${w}: el selector ofrece todas las plantillas`);
                await pag.selectOption("[data-cargar-plan]", "pl-5");
                const fila = await pag.evaluate(() => {
                    const f = document.querySelectorAll("[data-servicio-del-formulario]");
                    const x = f[0];
                    return {
                        n: f.length,
                        nombre: x.querySelector("input").value,
                        inversion: x.querySelectorAll("input")[1].value,
                        alcance: x.querySelector("textarea").value,
                        total: document.querySelector("[data-total-del-formulario]").textContent,
                    };
                });
                assert.deepEqual(
                    { n: fila.n, nombre: fila.nombre, inversion: fila.inversion, alcance: fila.alcance },
                    { n: 1, nombre: "Business", inversion: "800000", alcance: "Business: 1 línea de WhatsApp\nAgente de IA entrenado\nCRM y embudos" },
                    `${w}: la fila en blanco se autorrellena con el plan`,
                );
                assert.match(fila.total, /800\.000/);
                // Se edita en la propuesta.
                const nombreFila = pag.locator("[data-servicio-del-formulario] input").first();
                await nombreFila.fill("Business a medida");
                await pag.locator("[data-servicio-del-formulario] textarea").first().fill("Solo CRM");
                // Un segundo plan se añade detrás, sin pisar lo editado.
                await pag.selectOption("[data-cargar-plan]", "pl-1");
                const nombres = await pag.$$eval("[data-servicio-del-formulario]", (n) => n.map((x) => x.querySelector("input").value));
                assert.deepEqual(nombres, ["Business a medida", "Lite"]);
                const intactas = await pag.evaluate(() => JSON.stringify(window.plantillasVivas) === JSON.stringify(window.plantillasDeInicio));
                assert.ok(intactas, `${w}: editar la propuesta no tocó ninguna plantilla`);
                const form = await pag.evaluate(() => {
                    const d = document.querySelector('[role="dialog"]').getBoundingClientRect();
                    const sel = document.querySelector("[data-cargar-plan]").getBoundingClientRect();
                    return { l: d.left, r: d.right, sl: sel.left, sr: sel.right, vw: window.innerWidth, doc: document.documentElement.scrollWidth };
                });
                assert.ok(form.l >= 0 && form.r <= form.vw + 0.5 && form.doc <= form.vw, `${w}: el formulario de la propuesta cabe`);
                assert.ok(form.sl >= form.l && form.sr <= form.r + 0.5, `${w}: el selector de plan cabe dentro del diálogo`);
                await pag.keyboard.press("Escape");
                await irA(pag, "Plantillas de planes");
                const sigue = await pag.$$eval("[data-plantilla-fila]", (n) => n.map((x) => x.querySelector("button").textContent));
                assert.ok(sigue.includes("Business") && !sigue.includes("Business a medida"), `${w}: la plantilla Business sigue igual`);
                assert.deepEqual(errores, [], `${w}: sin errores en la página`);
                await pag.close();
            }
        } finally {
            await nav.close();
            srv.close();
        }
    });
}
