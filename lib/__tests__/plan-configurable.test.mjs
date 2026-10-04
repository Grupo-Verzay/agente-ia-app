/**
 * La tarjeta de la landing y la página de un plan, la cuarta vuelta:
 *
 * 1. **La tarjeta se lee de arriba abajo**: precio, los créditos resaltados
 *    junto a él («N créditos de IA incluidos»), los puntos clave, «Ver todo lo
 *    que incluye» destacado y «Comenzar ahora» al final. La descripción corta
 *    deja de ir apagada.
 * 2. **La landing abre en Mensual** (`elPeriodoDeEntrada`), también la de un
 *    reseller y /planes: trimestral o anual los elige quien quiera el descuento.
 * 3. **El párrafo de «¿Tienes un equipo o eres una agencia?» arranca donde
 *    arranca el ícono**, en escritorio y en el teléfono.
 * 4. **Los créditos dicen «incluidos», nunca «gratis»** (`conCreditosIncluidos`,
 *    al pintar: la base no se toca).
 * 5. **Los recuadros de capacidad son una LISTA del panel**: cuántos, cuáles,
 *    con qué ícono y qué dato, por plan e independientes de las funciones. Lo
 *    que no tiene dato no sale; nunca «No incluido».
 * 6. **El tutorial va a la derecha, en la línea del nombre** de la función.
 * 7. **Los títulos no repiten el nombre del plan** («Qué incluye este plan»,
 *    «Preguntas frecuentes»).
 * 8. **El video va en su marco**, distinto del fondo de la página.
 *
 * `MODO=roto` corre contra `ANTES_DE_LO_CONFIGURABLE` (df810cd) —pinchado a un
 * commit, nunca `origin/main`— y AFIRMA lo de antes.
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
const ANTES = process.env.ANTES_DE_LO_CONFIGURABLE ?? "df810cd";
const COMPONENTE = "app/(public)/planes/[slug]/_components/PlanDetailPage.tsx";
const LANDING = "app/(public)/inicio/_components/LandingClient.tsx";
const RESELLER = "app/(public)/r/[slug]/_components/ResellerLandingClient.tsx";
const PLANES = "app/(root)/planes/_components/PlanesClient.tsx";

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deAntes = (f) => {
    try {
        execFileSync("git", ["cat-file", "-e", `${ANTES}:${f}`], { cwd: RAIZ, stdio: "ignore" });
        return execFileSync("git", ["show", `${ANTES}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};
/** El código sin comentarios: lo que se lee en un comentario no se pinta. */
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
/** El trozo de `PlanCard`, de su firma a la función siguiente. */
const laTarjeta = (s) => {
    const i = s.search(/function PlanCard\(/);
    const j = s.slice(i + 1).search(/\n(export )?function /);
    return s.slice(i, j < 0 ? undefined : i + 1 + j);
};

const hayBase = Boolean(process.env.DATABASE_URL);
const conBase = hayBase ? test : test.skip;
const cssDir = join(RAIZ, ".next", "static", "css");
const sello = Date.now().toString(36);
const CASA = { id: `pc-casa-${sello}`, effectiveId: `pc-casa-${sello}`, sessionUserId: `pc-casa-${sello}`, ownerId: null, advisorRole: null, role: "admin", rolDeLaPersona: "admin", porImpersonacion: false, email: `pc-casa-${sello}@banco.test`, name: "Casa" };
const CLIENTE = { id: `pc-cli-${sello}`, effectiveId: `pc-cli-${sello}`, sessionUserId: `pc-cli-${sello}`, ownerId: null, advisorRole: null, role: "user", rolDeLaPersona: "user", porImpersonacion: false, email: `pc-cli-${sello}@banco.test`, name: "Cliente" };

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

/** Luminancia relativa de un `rgb(...)`: para comparar si un texto va más apagado que otro. */
const luz = (rgb) => {
    const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const FUNCIONES = () => [
    { id: "sheets", nombre: "Google Sheets", descripcion: "Tus hojas conectadas", categoria: "integraciones", tutorial: "google-sheets", activa: true, destacada: true },
    { id: "chats", nombre: "Chats", descripcion: "Todas tus conversaciones", categoria: "bandeja", tutorial: "chats", activa: true, destacada: true },
    { id: "asis", nombre: "Asistencia IA 24/7 - Humano hrs-L/V", descripcion: "", categoria: "capacidad", tutorial: null, activa: true, destacada: true },
];

const INTERMEDIO = { plan: "intermedio", assistanceType: "IA", priceUSD: 49, credits: 8000, name: "Starter", features: [] };
const HUMANO = { plan: "intermedio", assistanceType: "HUMANO", priceUSD: 99, credits: 8000, name: "Starter", features: [] };

/** Cuatro recuadros escritos en el panel, en este orden. */
const CUATRO = [
    { id: "usuarios", icono: "usuarios", titulo: "Usuarios", valor: "3 usuarios", detalle: "Para todo tu equipo" },
    { id: "creditos", icono: "creditos", titulo: "Créditos de IA", valor: "{creditos}", detalle: "Incluidos cada mes" },
    { id: "lineas", icono: "lineas", titulo: "Líneas", valor: "2 líneas de WhatsApp", detalle: "" },
    { id: "soporte", icono: "soporte", titulo: "Soporte", valor: "Prioritario", detalle: "Por WhatsApp" },
];

const TARJETA_PLAN = {
    id: "x", plan: "intermedio", assistanceType: "IA", priceUSD: 49, credits: 8000, name: "Starter", isActive: true,
    description: "Para negocios que ya venden por WhatsApp",
    features: ["Chats", "8.000 créditos totalmente gratis IA", "Agenda"],
};

if (ROTO) {
    // ─────────────────────────────────────────────────────────────────────────
    // ANTES: lo que había, afirmado
    // ─────────────────────────────────────────────────────────────────────────

    test("ANTES: la landing abría en Anual y la tarjeta ponía «Ver todo» debajo de «Comenzar ahora»", () => {
        const l = deAntes(LANDING);
        assert.ok(l, `no se pudo leer ${ANTES}`);
        assert.equal(/elPeriodoDeEntrada/.test(l), false, "no había regla de entrada");
        assert.ok(/includes\("yearly"\)/.test(l), "elegía el anual primero");
        const t = sinComentarios(laTarjeta(l));
        assert.ok(t.indexOf("data-ver-el-plan") > t.indexOf("Comenzar ahora"), "«Ver todo» iba después del botón");
        assert.equal(t.includes("data-creditos-de-la-tarjeta"), false, "los créditos no se resaltaban");
    });

    test("ANTES: los títulos repetían el nombre del plan, el tutorial iba debajo y el video no tenía marco", () => {
        const c = deAntes(COMPONENTE);
        assert.ok(c);
        assert.ok(/Qué incluye[^<]*\{pagina\.nombre\}/.test(c), "«Qué incluye el plan X»");
        assert.ok(/Preguntas frecuentes[^<]*\{pagina\.nombre\}/.test(c), "«Preguntas frecuentes sobre X»");
        assert.equal(c.includes("data-marco-del-video"), false);
        assert.equal(c.includes("data-fila-de-la-funcion"), false);
    });

    let m = null;
    if (hayBase) m = await import(join(COMPILADO, "entrada-configurable-antes.js"));

    conBase("siembra", async () => {
        await sembrar(m.db);
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertSubscriptionPlan({ ...INTERMEDIO, funciones: FUNCIONES() })).success, true);
        assert.equal((await m.upsertSubscriptionPlan({ ...HUMANO, funciones: FUNCIONES() })).success, true);
    });

    conBase("ANTES: los recuadros eran siempre los tres fijos; una lista del panel no cambiaba nada", async () => {
        m.ponerAQuienMira(CASA);
        const id = (await m.db.subscriptionPlan.findFirst({ where: { plan: "intermedio", assistanceType: "IA" } })).id;
        await m.upsertPlanDetail(id, { recuadros: CUATRO });
        let p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.deepEqual(p.capacidad.map((t) => t.clave), ["creditos", "catalogo", "asistencia"]);
        await m.upsertPlanDetail(id, { recuadros: [] });
        p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.equal(p.capacidad.length, 3, "ni vaciándola se quitaban");
    });

    conBase("ANTES: el recuadro de asistencia copiaba el nombre de la función de capacidad", async () => {
        const p = await m.laPaginaDelPlan("intermedio", "HUMANO");
        const asis = p.capacidad.find((t) => t.clave === "asistencia");
        assert.equal(asis.detalle, "Asistencia IA 24/7 - Humano hrs-L/V", "dependía de la configuración de funciones");
        globalThis.__paginaDeAntes = await (async () => {
            const id = (await m.db.subscriptionPlan.findFirst({ where: { plan: "intermedio", assistanceType: "IA" } })).id;
            await m.upsertPlanDetail(id, { videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", videoTitle: "Así funciona", faqs: [{ question: "¿Puedo cambiar?", answer: "Sí." }] });
            return m.laPaginaDelPlan("intermedio", "IA");
        })();
    });

    const PAGINA = join(COMPILADO, "harness-configurable-antes.js");
    const TARJETA = join(COMPILADO, "tarjeta-configurable-antes.js");
    const conNavegador = chromium && fs.existsSync(PAGINA) && fs.existsSync(TARJETA) && fs.existsSync(cssDir) && hayBase ? test : test.skip;

    conNavegador("ANTES: en la página el tutorial iba DEBAJO del nombre, y los títulos llevaban el nombre del plan", async () => {
        assert.ok(globalThis.__paginaDeAntes);
        await abrir(PAGINA, { __pagina: globalThis.__paginaDeAntes }, async (pag, w) => {
            const nombre = await pag.locator('[data-funcion="sheets"]').getByText("Google Sheets", { exact: true }).boundingBox();
            const tut = await pag.locator('[data-funcion="sheets"] [data-tutorial]').boundingBox();
            assert.ok(tut.y >= nombre.y + nombre.height - 1, `${w}: debajo (${tut.y} vs ${nombre.y + nombre.height})`);
            const titulos = await pag.$$eval("h2", (n) => n.map((x) => x.textContent));
            assert.ok(titulos.some((t) => /Qué incluye.*Starter/.test(t)), `${w}: ${titulos}`);
        });
    });

    conNavegador("ANTES: la tarjeta decía «gratis», la descripción iba apagada y el párrafo de agencias no arrancaba con el ícono", async () => {
        await abrir(TARJETA, { __plan: TARJETA_PLAN, __agencias: "con-whatsapp" }, async (pag, w) => {
            const texto = await pag.locator('[data-banco="tarjeta"]').innerText();
            assert.ok(/créditos totalmente gratis/i.test(texto), `${w}: decía «gratis»`);
            const ver = await pag.locator("[data-ver-el-plan]").boundingBox();
            const boton = await pag.getByRole("button", { name: /Comenzar ahora/ }).boundingBox();
            assert.ok(ver.y > boton.y, `${w}: «Ver todo» debajo del botón`);
            const desc = await pag.getByText(TARJETA_PLAN.description).evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
            assert.ok(desc <= 12, `${w}: la descripción, a ${desc}px`);
            const icono = await pag.locator('[data-banco="agencias"] div.h-12.w-12').boundingBox();
            const parrafo = await pag.locator('[data-banco="agencias"] p', { hasText: "Tenemos planes" }).boundingBox();
            assert.ok(parrafo.x - icono.x >= 50, `${w}: el párrafo arrancaba ${parrafo.x - icono.x}px a la derecha del ícono`);
        }, { modulo: true });
    });
} else {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. Las reglas, sin base
    // ─────────────────────────────────────────────────────────────────────────

    const t = await import(join(COMPILADO, "tarjeta-de-plan.js"));
    const c = await import(join(COMPILADO, "creditos-incluidos.js"));
    const r = await import(join(COMPILADO, "pagina-de-plan.js"));
    const DATOS = (plan, extra = {}) => r.losDatosDelPlan({ plan, name: "Starter", credits: 8000, priceUSD: 49, assistanceType: "IA", ...extra }, ["Lite", "Starter", "Pro"]);

    test("la landing abre en Mensual si existe; si no, en el siguiente", () => {
        assert.equal(t.elPeriodoDeEntrada(["monthly", "quarterly", "yearly"]), "monthly");
        assert.equal(t.elPeriodoDeEntrada(["yearly", "monthly"]), "monthly", "el orden de la lista no manda");
        assert.equal(t.elPeriodoDeEntrada(["yearly", "quarterly"]), "quarterly");
        assert.equal(t.elPeriodoDeEntrada(["yearly"]), "yearly");
        assert.equal(t.elPeriodoDeEntrada([]), "monthly");
    });

    test("los créditos dicen «incluidos», y lo que no es de créditos se queda como está", () => {
        assert.equal(c.conCreditosIncluidos("8.000 créditos totalmente gratis IA"), "8.000 créditos de IA incluidos");
        assert.equal(c.conCreditosIncluidos("12.000 créditos de IA gratis"), "12.000 créditos de IA incluidos");
        assert.equal(c.conCreditosIncluidos("Créditos gratis"), "Créditos incluidos");
        assert.equal(c.conCreditosIncluidos("Prueba gratis 7 días"), "Prueba gratis 7 días");
        assert.equal(c.conCreditosIncluidos("Cuenta adicional gratis"), "Cuenta adicional gratis");
        assert.deepEqual(t.losPuntosDeLaTarjeta(["Chats", "8.000 créditos totalmente gratis IA", "Agenda"], 8000), ["Chats", "Agenda"], "la línea que repite los créditos se quita: ya van junto al precio");
        assert.equal(t.losCreditosDeLaTarjeta(8000), "8.000 créditos de IA incluidos");
        assert.equal(t.losCreditosDeLaTarjeta(0), null);
    });

    test("los recuadros: los que diga el panel, en su orden, e independientes de las funciones", () => {
        assert.equal(r.laCapacidadDelPlan.length, 2, "ya no recibe las funciones");
        const datos = DATOS("intermedio");
        const propios = r.laCapacidadDelPlan(datos, CUATRO);
        assert.deepEqual(propios.map((x) => x.id), ["usuarios", "creditos", "lineas", "soporte"]);
        assert.equal(propios[1].valor, "8.000", "con el dato vivo");
        assert.deepEqual(propios.map((x) => x.icono), ["usuarios", "creditos", "lineas", "soporte"]);
        assert.deepEqual(r.laCapacidadDelPlan(datos, []), [], "una lista vacía: el resumen no sale");
        for (const valor of ["", "No incluido", "0", "Sin catálogo"]) {
            assert.deepEqual(r.laCapacidadDelPlan(datos, [{ ...CUATRO[0], valor }]), [], `«${valor}» no sale`);
        }
        const humano = r.laCapacidadDelPlan(DATOS("intermedio", { assistanceType: "HUMANO" }));
        assert.equal(humano.find((x) => x.id === "asistencia").valor, "IA + humana");
        assert.equal(JSON.stringify(r.laCapacidadDelPlan(DATOS("lite", { credits: 2000 }))).includes("No incluido"), false);
    });

    test("barrido: las tres landings abren en Mensual, la tarjeta en su orden, sin «gratis» en los créditos", () => {
        for (const f of [LANDING, RESELLER, PLANES]) {
            const s = crudo(f);
            assert.ok(s.includes("elPeriodoDeEntrada"), `${f} usa la regla`);
            assert.equal(/useState<BillingPeriod>\("yearly"\)/.test(s), false, `${f} no abre en Anual`);
        }
        const tarjeta = sinComentarios(laTarjeta(crudo(LANDING)));
        const orden = ["data-precio-de-la-tarjeta", "data-creditos-de-la-tarjeta", "data-funciones-de-la-tarjeta", "data-ver-el-plan", "Comenzar ahora"].map((x) => tarjeta.indexOf(x));
        assert.ok(orden.every((i) => i > 0), `todo está: ${orden}`);
        assert.deepEqual([...orden].sort((a, b) => a - b), orden, "precio, créditos, puntos, «Ver todo», «Comenzar ahora»");
        for (const f of [LANDING, RESELLER, COMPONENTE]) {
            const s = sinComentarios(crudo(f));
            assert.equal(/créditos[^"'`\n<]{0,40}gratis|gratis[^"'`\n<]{0,40}créditos/i.test(s), false, `${f}: ningún «créditos gratis»`);
        }
        const p = crudo(COMPONENTE);
        assert.ok(p.includes(">Qué incluye este plan<") && p.includes(">Preguntas frecuentes<"));
        // El cierre ya no lleva título («Empieza con el plan X» se fue): el nombre
        // va en el botón verde «Comenzar con el plan X», y el h1 es solo para
        // lectores de pantalla.
        assert.equal(/<h2[^>]*>(?!Empieza)[^<]*\{pagina\.nombre\}/.test(p), false, "ningún título de sección repite el nombre del plan");
        assert.ok(p.includes("data-marco-del-video") && p.includes("data-fila-de-la-funcion"));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Las acciones contra Postgres
    // ─────────────────────────────────────────────────────────────────────────

    let m = null;
    if (hayBase) m = await import(join(COMPILADO, "entrada-de-pagina-de-plan.js"));
    const filas = async () => m.db.$queryRawUnsafe(`SELECT "orden", "recuadros" FROM "plan_pagina"`);
    let planId = null;
    let paginaConCuatro = null;
    let paginaSinResumen = null;

    conBase("siembra", async () => {
        await sembrar(m.db);
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertSubscriptionPlan({ ...INTERMEDIO, funciones: FUNCIONES() })).success, true);
        assert.equal((await m.upsertSubscriptionPlan({ ...HUMANO, funciones: FUNCIONES() })).success, true);
        planId = (await m.db.subscriptionPlan.findFirst({ where: { plan: "intermedio", assistanceType: "IA" } })).id;
        assert.equal((await m.upsertPlanDetail(planId, { videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", videoTitle: "Así funciona {plan}", faqs: [{ question: "¿Puedo cambiar?", answer: "Sí." }] })).success, true);
    });

    conBase("cuatro recuadros del panel salen los cuatro, en su orden y con el dato vivo", async () => {
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertPlanDetail(planId, { recuadros: CUATRO })).success, true);
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.deepEqual(p.capacidad.map((x) => x.id), ["usuarios", "creditos", "lineas", "soporte"]);
        assert.equal(p.capacidad[1].valor, "8.000");
        assert.equal((await m.getPlanDetailBySubscriptionPlanId(planId)).recuadros.length, 4, "el panel los lee igual");
        paginaConCuatro = p;
    });

    conBase("cambiar las funciones no mueve los recuadros", async () => {
        m.ponerAQuienMira(CASA);
        const antes = (await m.laPaginaDelPlan("intermedio", "IA")).capacidad;
        const otras = FUNCIONES().filter((f) => f.id !== "asis").map((f) => ({ ...f, nombre: `${f.nombre} nuevo` }));
        assert.equal((await m.upsertSubscriptionPlan({ ...INTERMEDIO, funciones: otras })).success, true);
        assert.deepEqual((await m.laPaginaDelPlan("intermedio", "IA")).capacidad, antes);
        const h = await m.laPaginaDelPlan("intermedio", "HUMANO");
        const asis = h.capacidad.find((x) => x.id === "asistencia");
        assert.notEqual(asis.detalle, "Asistencia IA 24/7 - Humano hrs-L/V", "el recuadro no copia una función");
        assert.equal(asis.valor, "IA + humana");
    });

    conBase("quitar un recuadro lo quita; vaciar la lista quita el resumen y se guarda vacía", async () => {
        m.ponerAQuienMira(CASA);
        await m.upsertPlanDetail(planId, { recuadros: CUATRO.slice(0, 3) });
        assert.equal((await m.laPaginaDelPlan("intermedio", "IA")).capacidad.length, 3);
        await m.upsertPlanDetail(planId, { recuadros: [] });
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.deepEqual(p.capacidad, []);
        assert.deepEqual((await filas())[0].recuadros, [], "una lista vacía es una decisión");
        paginaSinResumen = p;
    });

    conBase("un cliente no escribe recuadros, y lo de fábrica no guarda fila", async () => {
        m.ponerAQuienMira(CLIENTE);
        assert.equal((await m.upsertPlanDetail(planId, { recuadros: CUATRO })).message, "No autorizado");
        m.ponerAQuienMira(CASA);
        assert.deepEqual((await m.laPaginaDelPlan("intermedio", "IA")).capacidad, []);
        await m.upsertPlanDetail(planId, { orden: [...r.ORDEN_DE_FABRICA], recuadros: r.losRecuadrosDeFabrica(r.losDatosDelPlan({ plan: "intermedio", name: "Starter", credits: 8000, priceUSD: 49, assistanceType: "IA" }, [])) });
        assert.equal((await filas()).length, 0);
        assert.deepEqual((await m.laPaginaDelPlan("intermedio", "IA")).capacidad.map((x) => x.id), ["creditos", "catalogo", "asistencia"]);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. La página y la tarjeta reales en Chromium
    // ─────────────────────────────────────────────────────────────────────────

    const HARNESS = join(COMPILADO, "harness.js");
    const TARJETA = join(COMPILADO, "tarjeta.js");
    const conNavegador = chromium && fs.existsSync(HARNESS) && fs.existsSync(TARJETA) && fs.existsSync(cssDir) && hayBase ? test : test.skip;

    conNavegador("la página: cuatro recuadros con su ícono, el tutorial a la derecha del nombre, títulos sin el plan y el video en su marco", async () => {
        assert.ok(paginaConCuatro, "la prueba de Postgres no dejó la página armada");
        await abrir(HARNESS, { __pagina: paginaConCuatro }, async (pag, w, errores) => {
            const cajas = await pag.$$eval("[data-capacidad]", (n) => n.map((x) => ({ id: x.getAttribute("data-capacidad"), icono: x.getAttribute("data-icono"), y: Math.round(x.getBoundingClientRect().top), t: x.textContent })));
            assert.deepEqual(cajas.map((x) => x.id), ["usuarios", "creditos", "lineas", "soporte"], `${w}`);
            assert.ok(cajas.every((x) => x.icono), `${w}: cada uno con su ícono`);
            if (w === 1440) assert.ok(cajas.every((x) => x.y === cajas[0].y), `${w}: en una fila: ${JSON.stringify(cajas)}`);
            assert.ok(cajas[1].t.includes("8.000"));
            assert.equal((await pag.locator("body").innerText()).includes("No incluido"), false);

            // «Qué incluye» nace plegado: se abre antes de medir sus filas.
            await pag.locator("[data-abrir-que-incluye]").click();
            const fila = await pag.locator('[data-funcion="sheets"] [data-fila-de-la-funcion]').boundingBox();
            const nombre = await pag.locator('[data-funcion="sheets"] [data-nombre-de-la-funcion]').boundingBox();
            const tut = await pag.locator('[data-funcion="sheets"] [data-tutorial]').boundingBox();
            assert.ok(tut.y < nombre.y + nombre.height && tut.y + tut.height > nombre.y, `${w}: en la línea del nombre (${JSON.stringify({ nombre, tut })})`);
            assert.ok(tut.x > nombre.x, `${w}: a la derecha`);
            assert.ok(Math.abs(tut.x + tut.width - (fila.x + fila.width)) <= 2, `${w}: pegado al borde derecho`);

            // El encabezado plegable lleva además «N funciones»: se lee solo su título.
            const titulos = await pag.$$eval("h2", (n) => n.map((x) => (x.querySelector("[data-titulo-del-bloque]") ?? x).textContent.trim()));
            assert.ok(titulos.includes("Qué incluye este plan") && titulos.includes("Preguntas frecuentes"), `${w}: ${titulos}`);
            assert.equal(titulos.filter((x) => !x.startsWith("Empieza")).some((x) => x.includes("Starter")), false, `${w}: sin el nombre del plan`);

            assert.equal(await pag.locator("[data-marco-del-video] [data-video]").count(), 1, `${w}: el video, dentro de su marco`);
            const fondos = await pag.evaluate(() => {
                const marco = document.querySelector("[data-marco-del-video]");
                const dentro = [...marco.querySelectorAll("*")].map((n) => getComputedStyle(n).backgroundColor).find((b) => b !== "rgba(0, 0, 0, 0)" && !b.startsWith("rgb(0, 0, 0"));
                return { pagina: getComputedStyle(document.querySelector("[data-pagina-de-plan]")).backgroundColor, marco: dentro ?? getComputedStyle(marco).backgroundImage };
            });
            assert.notEqual(fondos.marco, fondos.pagina, `${w}: el marco no es el fondo de la página: ${JSON.stringify(fondos)}`);
            const ancho = await pag.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth }));
            assert.ok(ancho.doc <= ancho.vw, `${w}: no se desplaza a lo ancho`);
            assert.deepEqual(errores, []);
        });
    });

    conNavegador("con la lista vacía no hay resumen de capacidad, ni «No incluido»", async () => {
        assert.ok(paginaSinResumen);
        await abrir(HARNESS, { __pagina: paginaSinResumen }, async (pag, w, errores) => {
            assert.equal(await pag.locator('[data-seccion="capacidad"]').count(), 0, `${w}`);
            assert.equal(await pag.locator("[data-capacidad]").count(), 0);
            assert.equal((await pag.locator("body").innerText()).includes("No incluido"), false);
            assert.deepEqual(errores, []);
        });
    });

    conNavegador("la tarjeta: precio, créditos resaltados, puntos, «Ver todo» destacado y «Comenzar ahora» al final", async () => {
        await abrir(TARJETA, { __plan: TARJETA_PLAN, __agencias: "con-whatsapp" }, async (pag, w, errores) => {
            const y = async (loc) => (await loc.boundingBox()).y;
            const orden = [
                await y(pag.locator("[data-precio-de-la-tarjeta]")),
                await y(pag.locator("[data-creditos-de-la-tarjeta]")),
                await y(pag.locator("[data-funciones-de-la-tarjeta]")),
                await y(pag.locator("[data-ver-el-plan]")),
                await y(pag.getByRole("button", { name: /Comenzar ahora/ })),
            ];
            assert.deepEqual([...orden].sort((a, b) => a - b), orden, `${w}: de arriba abajo ${orden}`);

            const creditos = pag.locator("[data-creditos-de-la-tarjeta]");
            assert.equal((await creditos.innerText()).trim(), "8.000 créditos de IA incluidos");
            assert.ok(Number(await creditos.evaluate((n) => getComputedStyle(n).fontWeight)) >= 600, `${w}: los créditos, resaltados`);
            const texto = await pag.locator('[data-banco="tarjeta"]').innerText();
            assert.equal(/gratis/i.test(texto), false, `${w}: ni un «gratis»: ${texto}`);
            assert.ok(texto.includes("Chats") && texto.includes("Agenda"));

            const desc = await pag.locator("[data-descripcion-de-la-tarjeta]").evaluate((n) => ({ px: parseFloat(getComputedStyle(n).fontSize), color: getComputedStyle(n).color }));
            const nota = await pag.getByText("Facturado mensualmente").evaluate((n) => getComputedStyle(n).color);
            assert.ok(desc.px >= 14, `${w}: la descripción a ${desc.px}px`);
            assert.ok(luz(desc.color) > luz(nota), `${w}: la descripción más clara que la nota (${desc.color} vs ${nota})`);

            const ver = await pag.locator("[data-ver-el-plan]").evaluate((n) => ({ px: parseFloat(getComputedStyle(n).fontSize), peso: Number(getComputedStyle(n).fontWeight), borde: getComputedStyle(n).borderTopWidth }));
            assert.ok(ver.px >= 14 && ver.peso >= 600 && parseFloat(ver.borde) >= 1, `${w}: «Ver todo» destacado: ${JSON.stringify(ver)}`);

            const icono = await pag.locator('[data-banco="agencias"] div.h-12.w-12').boundingBox();
            const parrafo = await pag.locator('[data-banco="agencias"] p', { hasText: "Tenemos planes" }).boundingBox();
            assert.ok(Math.abs(parrafo.x - icono.x) <= 2, `${w}: el párrafo arranca con el ícono (${parrafo.x} vs ${icono.x})`);
            const ancho = await pag.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth }));
            assert.ok(ancho.doc <= ancho.vw, `${w}: no se desplaza a lo ancho`);
            assert.deepEqual(errores, []);
        }, { modulo: true });
    });
}
