/**
 * La página de un plan arranca con el video y se arma por BLOQUES:
 *
 * 1. **Sin bloque de cabecera**: ni el tipo de asistencia, ni el nombre a la
 *    vista, ni la descripción, ni el precio arriba. El nombre queda para los
 *    lectores de pantalla (`sr-only`); el precio sale una vez, al final.
 * 2. **«Ver todo lo que incluye» de la landing lleva a la página**, sin la
 *    ventana intermedia (`PlanDetailModal` ya no existe). Dentro de la landing
 *    incrustada abre en otra pestaña, con `noopener`.
 * 3. **«Qué incluye» son tarjetas sueltas**, una por función y en una sola
 *    columna, en el orden del editor del panel: la categoría ya no agrupa.
 * 4. **Los seis bloques se reordenan desde el panel** (arrastrar o subir y
 *    bajar) y la página los pinta en ese orden. Se guarda en `plan_pagina`,
 *    tabla de la App; el orden de fábrica no guarda fila.
 * 5. **Los recuadros de catálogo y asistencia se editan desde el panel**, con
 *    sus datos vivos y un interruptor para apagarlos. Un plan sin catálogo no
 *    enseña ese recuadro (nunca «No incluido»), aunque se haya escrito.
 *
 * `MODO=roto` corre contra `ANTES_DE_LOS_BLOQUES` (0b7c21f) —pinchado a un
 * commit, nunca `origin/main`— y AFIRMA lo de antes: la cabecera con nombre y
 * precio encima del video, las funciones agrupadas por categoría, «No
 * incluido» en el plan sin catálogo y la ventana intermedia en la landing.
 *
 * Se levanta con `scripts/banco-pagina-de-plan.sh`.
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
const COMPILADO = join(AQUI, ".compilado", "pagina-de-plan");
const ANTES = process.env.ANTES_DE_LOS_BLOQUES ?? "0b7c21f";
const COMPONENTE = "app/(public)/planes/[slug]/_components/PlanDetailPage.tsx";
const LANDING = "app/(public)/inicio/_components/LandingClient.tsx";
const MODAL = "app/(public)/inicio/_components/PlanDetailModal.tsx";
const PANEL = "app/(root)/(protected)/admin/planes/_components/PlanDetailTab.tsx";
const REGLA = "lib/pagina-de-plan.ts";
const SERVIDOR = "lib/pagina-de-plan.server.ts";
const TABLA = "lib/plan-pagina-db.ts";
const ACCIONES = "actions/plan-detail-actions.ts";

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deAntes = (f) => {
    try {
        execFileSync("git", ["cat-file", "-e", `${ANTES}:${f}`], { cwd: RAIZ, stdio: "ignore" });
        return execFileSync("git", ["show", `${ANTES}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};

const hayBase = Boolean(process.env.DATABASE_URL);
const conBase = hayBase ? test : test.skip;
const cssDir = join(RAIZ, ".next", "static", "css");
const sello = Date.now().toString(36);
const CASA = { id: `pb-casa-${sello}`, effectiveId: `pb-casa-${sello}`, sessionUserId: `pb-casa-${sello}`, ownerId: null, advisorRole: null, role: "admin", rolDeLaPersona: "admin", porImpersonacion: false, email: `pb-casa-${sello}@banco.test`, name: "Casa" };
const CLIENTE = { id: `pb-cli-${sello}`, effectiveId: `pb-cli-${sello}`, sessionUserId: `pb-cli-${sello}`, ownerId: null, advisorRole: null, role: "user", rolDeLaPersona: "user", porImpersonacion: false, email: `pb-cli-${sello}@banco.test`, name: "Cliente" };

async function sembrar(db) {
    await db.planDetail.deleteMany({});
    await db.subscriptionPlan.deleteMany({});
    await db.$executeRawUnsafe(`DELETE FROM "plan_funciones"`).catch(() => {});
    await db.$executeRawUnsafe(`DELETE FROM "plan_para_quien"`).catch(() => {});
    await db.$executeRawUnsafe(`DELETE FROM "plan_pagina"`).catch(() => {});
    for (const u of [CASA, CLIENTE]) {
        await db.user.create({ data: { id: u.id, email: u.email, name: u.name, role: u.role } });
    }
}

/** La página o la tarjeta, servidas con el CSS del build y abiertas a 1440 y 390. */
async function abrir(paquete, datos, pintar, { modulo = false } = {}) {
    const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
    const js = fs.readFileSync(paquete, "utf8");
    const json = JSON.stringify(datos).replace(/</g, "\\u003c");
    const html =
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>` +
        `<body><div id="app"></div><script>window.process=window.process||{env:{}};Object.assign(window, ${json});</script>` +
        `<script${modulo ? ' type="module"' : ""}>${js}</script></body></html>`;
    const srv = http.createServer((_q, res) => { res.setHeader("content-type", "text/html"); res.end(html); });
    await new Promise((ok) => srv.listen(0, ok));
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    try {
        for (const [w, h] of [[1440, 900], [390, 844]]) {
            const pag = await nav.newPage({ viewport: { width: w, height: h } });
            await pag.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
            const errores = [];
            pag.on("pageerror", (e) => errores.push(String(e)));
            await pag.goto(url);
            await pag.waitForFunction(() => window.listo === true);
            await pag.waitForTimeout(200);
            await pintar(pag, w, errores);
            await pag.close();
        }
    } finally {
        await nav.close();
        srv.close();
    }
}

/** El editor del panel, en el orden en que se arrastró: Sheets primero, Chats después. */
const FUNCIONES = () => [
    { id: "sheets", nombre: "Google Sheets", descripcion: "Tus hojas conectadas", categoria: "integraciones", tutorial: "google-sheets", activa: true, destacada: true },
    { id: "chats", nombre: "Chats", descripcion: "Todas tus conversaciones", categoria: "bandeja", tutorial: "chats", activa: true, destacada: true },
    { id: "soporte", nombre: "Soporte prioritario", descripcion: "", categoria: "general", tutorial: null, activa: true, destacada: false },
    { id: "creditos", nombre: "8.000 créditos de IA", descripcion: "", categoria: "capacidad", tutorial: null, activa: true, destacada: true },
    { id: "reportes", nombre: "Reportes semanales", descripcion: "", categoria: "panel", tutorial: null, activa: false, destacada: false },
];

const INTERMEDIO = { plan: "intermedio", assistanceType: "IA", priceUSD: 49, credits: 8000, name: "Starter", features: [] };
const LITE = { plan: "lite", assistanceType: "IA", priceUSD: 19, credits: 2000, name: "Lite", features: ["Chats"] };

if (ROTO) {
    // ─────────────────────────────────────────────────────────────────────────
    // ANTES: lo que había, afirmado
    // ─────────────────────────────────────────────────────────────────────────

    test("ANTES: la página abría con un bloque que repetía tipo, nombre, descripción y precio, y el video iba dentro", () => {
        const c = deAntes(COMPONENTE);
        assert.ok(c, `no se pudo leer ${ANTES}`);
        const hero = c.slice(c.indexOf('data-seccion="hero"'), c.indexOf('data-seccion="paraquien"'));
        assert.ok(hero.length > 0, "había una sección «hero»");
        for (const marca of ["data-tipos", "data-nombre-del-plan", "data-descripcion", "data-precio"]) {
            assert.ok(hero.includes(marca), `el hero repetía ${marca}`);
        }
        assert.ok(hero.indexOf("data-precio") < hero.indexOf("<VideoDelPlan"), "el precio iba antes del video");
        assert.ok(c.includes("data-grupo"), "las funciones iban agrupadas por categoría");
        assert.equal(c.includes("orden.map"), false, "el orden de los bloques estaba fijo");
    });

    test("ANTES: el plan sin catálogo decía «No incluido», y no había dónde guardar orden ni recuadros", () => {
        assert.ok(/["'`]No incluido/.test(deAntes(REGLA)), "el recuadro del catálogo decía «No incluido»");
        assert.equal(deAntes(TABLA), null, "no existía plan_pagina");
        assert.equal(/\borden\b/.test(deAntes(ACCIONES)), false, "la acción no guardaba ningún orden");
        assert.equal(/recuadros/.test(deAntes(ACCIONES)), false, "ni los recuadros");
        assert.ok(deAntes(SERVIDOR).includes("lasFuncionesPorCategoria"), "la página agrupaba por categoría");
    });

    test("ANTES: «Ver todo lo que incluye» abría una ventana intermedia", () => {
        assert.ok(deAntes(MODAL), "existía PlanDetailModal");
        const l = deAntes(LANDING);
        assert.ok(l.includes("onOpenDetail") && l.includes("<PlanDetailModal"), "la tarjeta abría la ventana");
        assert.equal(l.includes("data-ver-el-plan"), false);
    });

    let m = null;
    if (hayBase) m = await import(join(COMPILADO, "entrada-bloques-antes.js"));

    conBase("siembra", async () => {
        await sembrar(m.db);
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertSubscriptionPlan({ ...INTERMEDIO, funciones: FUNCIONES() })).success, true);
        assert.equal((await m.upsertSubscriptionPlan(LITE)).success, true);
    });

    conBase("ANTES: el plan Lite enseñaba un recuadro de catálogo que decía «No incluido»", async () => {
        const p = await m.laPaginaDelPlan("lite", "IA");
        const catalogo = p.capacidad.find((t) => t.clave === "catalogo");
        assert.ok(catalogo, "el recuadro salía");
        assert.equal(catalogo.valor, "No incluido");
    });

    conBase("ANTES: la página traía grupos por categoría y ningún orden de bloques", async () => {
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.ok(Array.isArray(p.grupos) && p.grupos.length >= 2, `grupos: ${JSON.stringify(p.grupos)}`);
        assert.equal("funciones" in p, false);
        assert.equal("orden" in p, false);
        const ids = p.grupos.flatMap((g) => g.funciones.map((f) => f.id));
        assert.notDeepEqual(ids, ["sheets", "chats", "soporte"], "la categoría reordenaba lo que se arrastró en el editor");
        globalThis.__paginaDeAntes = { ...p, video: { tipo: "iframe", url: "https://www.youtube.com/embed/dQw4w9WgXcQ", titulo: "Así funciona", miniatura: null } };
    });

    const PAGINA = join(COMPILADO, "harness-bloques-antes.js");
    const TARJETA = join(COMPILADO, "tarjeta-bloques-antes.js");
    const conNavegador = chromium && fs.existsSync(PAGINA) && fs.existsSync(TARJETA) && fs.existsSync(cssDir) && hayBase ? test : test.skip;

    conNavegador("ANTES: lo primero de la página era el bloque de nombre y precio, encima del video; las funciones, por grupos", async () => {
        await abrir(PAGINA, { __pagina: globalThis.__paginaDeAntes }, async (pag, w, errores) => {
            const secciones = await pag.$$eval("[data-seccion]", (n) => n.map((x) => x.getAttribute("data-seccion")));
            assert.equal(secciones[0], "hero", `${w}: arrancaba con el hero`);
            const nombre = await pag.locator("[data-nombre-del-plan]").boundingBox();
            const video = await pag.locator("[data-video]").first().boundingBox();
            assert.ok(nombre && nombre.width > 10, `${w}: el nombre se veía`);
            assert.ok(nombre.y < video.y, `${w}: el nombre iba encima del video`);
            assert.ok(await pag.locator("[data-precio]").isVisible(), `${w}: y el precio`);
            assert.ok((await pag.locator("[data-grupo]").count()) >= 2, `${w}: funciones agrupadas`);
            assert.deepEqual(errores, []);
        });
    });

    conNavegador("ANTES: la tarjeta de la landing abría la ventana, no la página", async () => {
        const plan = { id: "x", plan: "intermedio", assistanceType: "IA", priceUSD: 49, credits: 8000, name: "Starter", isActive: true, features: ["Chats"] };
        await abrir(TARJETA, { __plan: plan }, async (pag, w, errores) => {
            assert.equal(await pag.locator("[data-ver-el-plan]").count(), 0, `${w}: no había enlace directo`);
            assert.equal(await pag.getByRole("button", { name: /Ver todo lo que incluye/ }).count(), 1, `${w}: era un botón que abría la ventana`);
            assert.deepEqual(errores, []);
        }, { modulo: true });
    });
} else {
    const r = await import(join(COMPILADO, "pagina-de-plan.js"));
    const DATOS = (plan, extra = {}) => r.losDatosDelPlan({ plan, name: "Starter", credits: 8000, priceUSD: 49, assistanceType: "IA", ...extra }, ["Lite", "Starter", "Pro"]);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. La regla, pura
    // ─────────────────────────────────────────────────────────────────────────

    test("el orden de los bloques: sin repetidos ni claves raras, y lo que falta entra detrás de su vecino", () => {
        assert.deepEqual(r.comoOrdenDeBloques(null), [...r.ORDEN_DE_FABRICA]);
        assert.deepEqual(r.comoOrdenDeBloques("video,comenzar"), [...r.ORDEN_DE_FABRICA], "lo que no es una lista es el de fábrica");
        assert.deepEqual(r.ORDEN_DE_FABRICA, ["video", "paraquien", "capacidad", "funciones", "preguntas", "comenzar"]);
        assert.deepEqual(r.comoOrdenDeBloques(["comenzar", "video"]), ["comenzar", "video", "paraquien", "capacidad", "funciones", "preguntas"]);
        assert.deepEqual(r.comoOrdenDeBloques(["preguntas", "preguntas", "hero", 3, "video"]), ["preguntas", "comenzar", "video", "paraquien", "capacidad", "funciones"]);
        assert.deepEqual(
            r.comoOrdenDeBloques(["video", "paraquien", "funciones", "capacidad", "comenzar"]),
            ["video", "paraquien", "funciones", "preguntas", "capacidad", "comenzar"],
            "un bloque nuevo no salta al principio",
        );
        for (const raro of [[], [null], ["x"], [{}]]) assert.equal(r.comoOrdenDeBloques(raro).length, 6, "siempre los seis");
        assert.equal(r.esElOrdenDeFabrica(r.comoOrdenDeBloques(null)), true);
        assert.equal(r.esElOrdenDeFabrica(["comenzar", "video", "paraquien", "capacidad", "funciones", "preguntas"]), false);
        assert.equal(r.esElOrdenDeFabrica(["video"]), false);
    });

    test("los recuadros: saneados, con tope, y solo un false explícito los apaga", () => {
        assert.deepEqual(r.comoRecuadros("basura"), { catalogo: { visible: true, titulo: "", valor: "", detalle: "" }, asistencia: { visible: true, titulo: "", valor: "", detalle: "" } });
        const s = r.comoRecuadros({ catalogo: { visible: "no", titulo: "  Tu   tienda \n", valor: "x".repeat(90), detalle: 7 }, asistencia: { visible: false } });
        assert.equal(s.catalogo.visible, true, "lo que no se entiende, sale");
        assert.equal(s.catalogo.titulo, "Tu tienda");
        assert.equal(s.catalogo.valor.length, r.TOPES_DEL_RECUADRO.valor);
        assert.equal(s.catalogo.detalle, "");
        assert.equal(s.asistencia.visible, false);
        assert.equal(r.esElRecuadroSinTocar(r.comoRecuadros(null).catalogo), true);
        assert.equal(r.esElRecuadroSinTocar(s.asistencia), false, "apagado no es «sin tocar»");
        assert.equal(r.esElRecuadroSinTocar(s.catalogo), false);
    });

    test("el catálogo: un plan sin catálogo no tiene recuadro, ni siquiera escrito; los demás, sí", () => {
        const lite = DATOS("lite", { name: "Lite", credits: 2000, priceUSD: 19 });
        assert.equal(r.elPlanTraeCatalogo(lite), false);
        assert.equal(r.elPlanTraeCatalogo(DATOS("intermedio")), true);
        assert.equal(r.elPlanTraeCatalogo(DATOS("personalizado")), true, "a la medida también trae catálogo");
        const escrito = { catalogo: { visible: true, titulo: "Tu tienda", valor: "Hasta 10", detalle: "Fotos" } };
        const tarjetas = r.laCapacidadDelPlan(lite, [], escrito);
        assert.deepEqual(tarjetas.map((t) => t.clave), ["creditos", "asistencia"]);
        assert.equal(JSON.stringify(tarjetas).includes("No incluido"), false, "nunca «No incluido»");
        assert.deepEqual(r.laCapacidadDelPlan(DATOS("personalizado"), []).find((t) => t.clave === "catalogo").valor, "A la medida");
    });

    test("lo escrito sale con los datos vivos; lo que contradice al plan cae en lo de fábrica y se avisa", () => {
        const datos = DATOS("intermedio");
        const fabrica = r.laCapacidadDelPlan(datos, []);
        assert.deepEqual(fabrica.map((t) => t.clave), ["creditos", "catalogo", "asistencia"]);
        assert.equal(fabrica.find((t) => t.clave === "catalogo").valor, "Hasta 25");
        const propio = r.laCapacidadDelPlan(datos, [], { catalogo: { titulo: "Tu tienda", valor: "Hasta {catalogo}", detalle: "Fotos y precios" }, asistencia: { valor: "Siempre a tiempo" } });
        assert.deepEqual(propio.find((t) => t.clave === "catalogo"), { clave: "catalogo", titulo: "Tu tienda", valor: "Hasta 25", detalle: "Fotos y precios" });
        assert.equal(propio.find((t) => t.clave === "asistencia").valor, "Siempre a tiempo");
        assert.equal(propio.find((t) => t.clave === "asistencia").titulo, "Asistencia", "el campo vacío es el de fábrica");
        const viejo = r.laCapacidadDelPlan(datos, [], { catalogo: { titulo: "Tu tienda", valor: "Hasta 50" } });
        assert.equal(viejo.find((t) => t.clave === "catalogo").valor, "Hasta 25", "un tope viejo no sale");
        assert.equal(viejo.find((t) => t.clave === "catalogo").titulo, "Tu tienda", "y no se lleva al título");
        assert.ok(r.losAvisosDelRecuadro("catalogo", { valor: "Hasta 50" }, datos).valor[0].includes("50"));
        assert.deepEqual(r.losAvisosDelRecuadro("catalogo", { valor: "Hasta {catalogo}" }, datos).valor, []);
        assert.ok(r.losAvisosDelRecuadro("asistencia", { detalle: "Trae 12.000 créditos de IA" }, datos).detalle.length > 0);
        const apagado = r.laCapacidadDelPlan(datos, [], { asistencia: { visible: false } });
        assert.deepEqual(apagado.map((t) => t.clave), ["creditos", "catalogo"], "apagada, la asistencia no sale");
        assert.equal(r.laCapacidadDelPlan(datos, [], { catalogo: { visible: false }, asistencia: { visible: false } })[0].clave, "creditos", "los créditos salen siempre, primero");
    });

    test("qué incluye: una tarjeta por función, en el orden del editor, sin las de capacidad ni las apagadas", () => {
        const f = r.comoFunciones(FUNCIONES());
        const salen = r.lasFuncionesQueSeEnsenan(f, DATOS("intermedio"), new Map([["google-sheets", "Guía de Google Sheets"]]));
        assert.deepEqual(salen.map((x) => x.id), ["sheets", "chats", "soporte"]);
        assert.deepEqual(salen[0].tutorial, { url: "/guia/google-sheets", titulo: "Guía de Google Sheets", externo: false });
        assert.equal(salen[1].tutorial, null, "una guía que no está publicada no lleva enlace");
    });

    test("barrido: la página arranca con los bloques, sin cabecera; el panel arrastra; la landing no tiene ventana", () => {
        const c = crudo(COMPONENTE);
        assert.ok(c.includes("pagina.orden.map"), "los bloques en el orden guardado");
        assert.ok(/<h1 className="sr-only"[^>]*data-nombre-del-plan/.test(c), "el nombre, solo para lectores de pantalla");
        assert.equal(c.includes('data-seccion="hero"'), false, "sin bloque de cabecera");
        for (const fuera of ["data-tipos", "data-descripcion", "data-insignia", "data-precio>", "data-grupo"]) {
            assert.equal(c.includes(fuera), false, `ya no está ${fuera}`);
        }
        assert.equal(/["'`]No incluido/.test(crudo(REGLA)), false, "ningún texto dice «No incluido»");
        assert.equal(crudo(SERVIDOR).includes("lasFuncionesPorCategoria"), false);
        const p = crudo(PANEL);
        for (const marca of ["data-orden-de-bloques", "data-bloque-del-orden", "data-subir-bloque", "data-bajar-bloque", "data-recuadro", "data-recuadro-visible", "data-recuadro-sin-catalogo", "data-campo-del-recuadro"]) {
            assert.ok(p.includes(marca), `el panel tiene ${marca}`);
        }
        assert.ok(p.includes("@dnd-kit/sortable"), "los bloques se arrastran");
        const t = crudo(TABLA);
        assert.ok(t.includes('CREATE TABLE IF NOT EXISTS "plan_pagina"'));
        assert.equal(/REFERENCES/i.test(t), false, "sin clave foránea");
        assert.ok(crudo(ACCIONES).includes("guardarLaPagina"));
        assert.equal(fs.existsSync(join(RAIZ, MODAL)), false, "ya no hay ventana intermedia");
        const l = crudo(LANDING);
        assert.equal(l.includes("PlanDetailModal") || l.includes("onOpenDetail"), false);
        assert.ok(l.includes("enOtraPestana={embed}"), "incrustada, abre en otra pestaña");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Las acciones contra Postgres
    // ─────────────────────────────────────────────────────────────────────────

    let m = null;
    if (hayBase) m = await import(join(COMPILADO, "entrada-de-pagina-de-plan.js"));
    const filas = async () => m.db.$queryRawUnsafe(`SELECT "orden", "recuadros" FROM "plan_pagina"`);
    let planId = null;
    let liteId = null;
    let paginaConVideo = null;
    let paginaReordenada = null;
    let paginaLite = null;
    const ORDEN_PROPIO = ["funciones", "capacidad", "video", "paraquien", "comenzar", "preguntas"];
    const RECUADROS = { catalogo: { visible: true, titulo: "Tu tienda", valor: "Hasta {catalogo}", detalle: "Fotos y precios" }, asistencia: { visible: true, titulo: "", valor: "IA siempre", detalle: "" } };

    conBase("siembra", async () => {
        await sembrar(m.db);
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertSubscriptionPlan({ ...INTERMEDIO, funciones: FUNCIONES() })).success, true);
        assert.equal((await m.upsertSubscriptionPlan(LITE)).success, true);
        planId = (await m.db.subscriptionPlan.findFirst({ where: { plan: "intermedio" } })).id;
        liteId = (await m.db.subscriptionPlan.findFirst({ where: { plan: "lite" } })).id;
    });

    conBase("de fábrica: los seis bloques en su orden, las funciones del editor sin grupos, y ni una fila guardada", async () => {
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.deepEqual(p.orden, [...r.ORDEN_DE_FABRICA]);
        assert.deepEqual(p.capacidad.map((t) => t.clave), ["creditos", "catalogo", "asistencia"]);
        assert.equal(p.capacidad[1].valor, "Hasta 25");
        assert.deepEqual(p.funciones.map((f) => f.id), ["sheets", "chats", "soporte"]);
        assert.equal("grupos" in p, false);
        const d = await m.getPlanDetailBySubscriptionPlanId(planId);
        assert.deepEqual(d.orden, [...r.ORDEN_DE_FABRICA]);
        assert.deepEqual(d.recuadros, r.comoRecuadros(null));
        assert.equal((await filas()).length, 0);
    });

    conBase("el orden guardado en el panel es el de la página", async () => {
        m.ponerAQuienMira(CASA);
        const g = await m.upsertPlanDetail(planId, { orden: ORDEN_PROPIO });
        assert.equal(g.success, true, g.message);
        assert.deepEqual((await m.laPaginaDelPlan("intermedio", "IA")).orden, ORDEN_PROPIO);
        assert.deepEqual((await m.getPlanDetailBySubscriptionPlanId(planId)).orden, ORDEN_PROPIO);
        assert.equal((await filas()).length, 1);
    });

    conBase("los recuadros escritos salen con los datos vivos, y guardarlos no mueve el orden", async () => {
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertPlanDetail(planId, { recuadros: RECUADROS })).success, true);
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.deepEqual(p.orden, ORDEN_PROPIO, "el orden se queda");
        assert.deepEqual(p.capacidad.find((t) => t.clave === "catalogo"), { clave: "catalogo", titulo: "Tu tienda", valor: "Hasta 25", detalle: "Fotos y precios" });
        assert.equal(p.capacidad.find((t) => t.clave === "asistencia").valor, "IA siempre");
        assert.equal((await m.getPlanDetailBySubscriptionPlanId(planId)).recuadros.catalogo.valor, "Hasta {catalogo}", "se guarda con su llave");
    });

    conBase("guardar el video no toca el orden ni los recuadros", async () => {
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertPlanDetail(planId, { videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", videoTitle: "Así funciona {plan}", faqs: [{ question: "¿Puedo cambiar?", answer: "Sí." }] })).success, true);
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.deepEqual(p.orden, ORDEN_PROPIO);
        assert.equal(p.capacidad.find((t) => t.clave === "catalogo").titulo, "Tu tienda");
        assert.equal(p.video.tipo, "iframe");
        paginaReordenada = p;
    });

    conBase("un tope de catálogo viejo guardado no sale; apagar la asistencia la quita; volver a lo de fábrica borra la fila", async () => {
        m.ponerAQuienMira(CASA);
        await m.upsertPlanDetail(planId, { recuadros: { catalogo: { visible: true, titulo: "", valor: "Hasta 50", detalle: "" }, asistencia: { visible: false } } });
        assert.equal((await filas())[0].recuadros.catalogo.valor, "Hasta 50", "se guarda, para que el panel diga por qué no sale");
        let p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.equal(p.capacidad.find((t) => t.clave === "catalogo").valor, "Hasta 25");
        assert.equal(p.capacidad.some((t) => t.clave === "asistencia"), false);
        await m.upsertPlanDetail(planId, { orden: [...r.ORDEN_DE_FABRICA], recuadros: r.comoRecuadros(null) });
        assert.equal((await filas()).length, 0, "lo de fábrica no guarda fila");
        p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.deepEqual(p.orden, [...r.ORDEN_DE_FABRICA]);
        assert.equal(p.capacidad.length, 3);
        paginaConVideo = p;
        // Para la pantalla: deja el orden propio y el catálogo escrito.
        await m.upsertPlanDetail(planId, { orden: ORDEN_PROPIO, recuadros: RECUADROS });
        paginaReordenada = await m.laPaginaDelPlan("intermedio", "IA");
    });

    conBase("un cliente no reordena ni escribe recuadros", async () => {
        m.ponerAQuienMira(CLIENTE);
        assert.equal((await m.upsertPlanDetail(planId, { orden: ["comenzar"], recuadros: { catalogo: { titulo: "Robado" } } })).message, "No autorizado");
        m.ponerAQuienMira(CASA);
        assert.deepEqual((await m.laPaginaDelPlan("intermedio", "IA")).orden, ORDEN_PROPIO);
        assert.equal((await m.getPlanDetailBySubscriptionPlanId(planId)).recuadros.catalogo.titulo, "Tu tienda");
    });

    conBase("el plan Lite no enseña recuadro de catálogo, ni con uno escrito y encendido", async () => {
        m.ponerAQuienMira(CASA);
        await m.upsertPlanDetail(liteId, { recuadros: { catalogo: { visible: true, titulo: "Tienda", valor: "Hasta 5", detalle: "x" } } });
        const p = await m.laPaginaDelPlan("lite", "IA");
        assert.deepEqual(p.capacidad.map((t) => t.clave), ["creditos", "asistencia"]);
        assert.equal(JSON.stringify(p).includes("No incluido"), false);
        paginaLite = p;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. La página y la tarjeta reales en Chromium
    // ─────────────────────────────────────────────────────────────────────────

    const HARNESS = join(COMPILADO, "harness.js");
    const TARJETA = join(COMPILADO, "tarjeta.js");
    const conNavegador = chromium && fs.existsSync(HARNESS) && fs.existsSync(TARJETA) && fs.existsSync(cssDir) && hayBase ? test : test.skip;

    conNavegador("la página arranca con el video: sin nombre ni precio arriba, y el precio una sola vez, al final", async () => {
        assert.ok(paginaConVideo, "la prueba de Postgres no dejó la página armada");
        await abrir(HARNESS, { __pagina: paginaConVideo }, async (pag, w, errores) => {
            const secciones = await pag.$$eval("[data-seccion]", (n) => n.map((x) => x.getAttribute("data-seccion")));
            assert.equal(secciones[0], "video", `${w}: lo primero es el video`);
            assert.equal(secciones.includes("hero"), false);
            const h1 = await pag.locator("[data-nombre-del-plan]").boundingBox();
            assert.ok(!h1 || h1.width <= 1, `${w}: el nombre no se ve (sr-only): ${JSON.stringify(h1)}`);
            assert.equal(await pag.locator("[data-precio]").count(), 0, `${w}: sin precio arriba`);
            assert.equal(await pag.locator("[data-precio-final]").count(), 1, `${w}: el precio, al final`);
            const barra = await pag.locator("div.sticky").boundingBox();
            const video = await pag.locator('[data-seccion="video"] [data-video]').boundingBox();
            assert.ok(video.y - (barra.y + barra.height) <= 48, `${w}: el video justo debajo de la barra (${video.y} vs ${barra.y + barra.height})`);
            const ancho = await pag.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth }));
            assert.ok(ancho.doc <= ancho.vw, `${w}: no se desplaza a lo ancho`);
            assert.deepEqual(errores, []);
        });
    });

    conNavegador("qué incluye: una tarjeta por función, una debajo de otra, en el orden del editor", async () => {
        await abrir(HARNESS, { __pagina: paginaConVideo }, async (pag, w, errores) => {
            assert.equal(await pag.locator("[data-grupo]").count(), 0, `${w}: sin grupos`);
            const cajas = await pag.$$eval("[data-funcion]", (n) => n.map((x) => {
                const b = x.getBoundingClientRect();
                return { id: x.getAttribute("data-funcion"), x: Math.round(b.left), w: Math.round(b.width), y: Math.round(b.top) };
            }));
            assert.deepEqual(cajas.map((c) => c.id), ["sheets", "chats", "soporte"], `${w}: el orden del editor`);
            assert.ok(cajas.every((c) => c.x === cajas[0].x && c.w === cajas[0].w), `${w}: una sola columna: ${JSON.stringify(cajas)}`);
            assert.ok(cajas[0].y < cajas[1].y && cajas[1].y < cajas[2].y, `${w}: de arriba abajo`);
            assert.equal(await pag.locator('[data-funcion="sheets"] [data-tutorial="/guia/google-sheets"]').count(), 1, `${w}: con su tutorial`);
            assert.deepEqual(errores, []);
        });
    });

    conNavegador("el orden del panel es el de la página, y los recuadros escritos se leen", async () => {
        assert.ok(paginaReordenada);
        await abrir(HARNESS, { __pagina: paginaReordenada }, async (pag, w, errores) => {
            const secciones = await pag.$$eval("[data-seccion]", (n) => n.map((x) => x.getAttribute("data-seccion")));
            assert.deepEqual(secciones, ORDEN_PROPIO, `${w}: el orden guardado`);
            const catalogo = await pag.locator('[data-capacidad="catalogo"]').innerText();
            assert.ok(catalogo.includes("Tu tienda") && catalogo.includes("Hasta 25") && catalogo.includes("Fotos y precios"), `${w}: ${catalogo}`);
            assert.ok((await pag.locator('[data-capacidad="asistencia"]').innerText()).includes("IA siempre"));
            assert.deepEqual(errores, []);
        });
    });

    conNavegador("el plan sin catálogo no enseña ese recuadro, ni «No incluido»", async () => {
        assert.ok(paginaLite);
        await abrir(HARNESS, { __pagina: paginaLite }, async (pag, w, errores) => {
            assert.equal(await pag.locator('[data-capacidad="catalogo"]').count(), 0, `${w}`);
            assert.equal(await pag.locator('[data-capacidad]').count(), 2);
            assert.equal((await pag.locator("body").innerText()).includes("No incluido"), false);
            assert.deepEqual(errores, []);
        });
    });

    conNavegador("la tarjeta de la landing lleva directo a la página; incrustada, en otra pestaña", async () => {
        const plan = { id: planId ?? "x", plan: "intermedio", assistanceType: "IA", priceUSD: 49, credits: 8000, name: "Starter", isActive: true, features: ["Chats"] };
        await abrir(TARJETA, { __plan: plan }, async (pag, w, errores) => {
            const a = pag.locator("[data-ver-el-plan]");
            assert.equal(await a.evaluate((n) => n.tagName), "A", `${w}: es un enlace`);
            assert.equal(await a.getAttribute("href"), "/planes/intermedio?tipo=IA");
            assert.equal(await a.getAttribute("target"), null, `${w}: en la landing, en la misma pestaña`);
            assert.equal(await pag.getByRole("button", { name: /Ver todo lo que incluye/ }).count(), 0, `${w}: ya no abre ninguna ventana`);
            assert.deepEqual(errores, []);
        }, { modulo: true });
        await abrir(TARJETA, { __plan: plan, __enOtraPestana: true }, async (pag, w, errores) => {
            const a = pag.locator("[data-ver-el-plan]");
            assert.equal(await a.getAttribute("target"), "_blank", `${w}: incrustada`);
            assert.ok((await a.getAttribute("rel")).includes("noopener"));
            assert.deepEqual(errores, []);
        }, { modulo: true });
    });
}
