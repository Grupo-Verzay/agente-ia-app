/**
 * Las cinco mejoras de la página de un plan y de la landing:
 *
 * 1. **Subir el video como archivo** (MP4, WebM o MOV) por
 *    `/api/upload-plan-video`, no solo pegar un enlace: la ruta es de la casa,
 *    decide qué es por los primeros BYTES y pasa el archivo al bucket sin
 *    guardarlo entero en memoria (va FUERA del middleware). La dirección que
 *    devuelve termina en la extensión de verdad, y por eso la página y la
 *    landing lo pintan con un `<video>`.
 * 2. **El botón de comenzar va SOLO al final**, en su sección «comenzar»,
 *    después de las preguntas frecuentes; ni en la barra fija de arriba ni
 *    junto al video, que es con lo que arranca la página.
 * 3. **«Para quién es este plan»** con un caso típico: lo escrito en el panel
 *    (`plan_para_quien`, tabla de la App) si no contradice al plan; si no, lo
 *    de fábrica de su nivel, campo por campo.
 * 4. **La línea discreta al plan inmediato superior**, si existe y se vende.
 * 5. **«Activa» y «destacada» son dos marcas**: apagar una función la quita
 *    del plan entero; destacarla solo decide si sale en la tarjeta CORTA de la
 *    landing. El detalle completo no cambia por eso.
 *
 * `MODO=roto` corre contra `ANTES_DE_LO_NUEVO` (fd21c8f) —pinchado a un
 * commit, nunca `origin/main`— y AFIRMA lo que faltaba: ninguna ruta para
 * subir video, dos botones de comenzar (uno en la barra fija), ni «para
 * quién», ni plan superior, y la tarjeta de la landing con TODAS las
 * funciones encendidas.
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
const ANTES = process.env.ANTES_DE_LO_NUEVO ?? "fd21c8f";
const COMPONENTE = "app/(public)/planes/[slug]/_components/PlanDetailPage.tsx";
const LANDING = "app/(public)/inicio/_components/LandingClient.tsx";
const MODAL = "app/(public)/inicio/_components/PlanDetailModal.tsx";
const EDITOR = "app/(root)/(protected)/admin/planes/_components/FuncionesDelPlanEditor.tsx";
const RUTA = "app/api/upload-plan-video/route.ts";

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
const CASA = { id: `pf-casa-${sello}`, effectiveId: `pf-casa-${sello}`, sessionUserId: `pf-casa-${sello}`, ownerId: null, advisorRole: null, role: "admin", rolDeLaPersona: "admin", porImpersonacion: false, email: `pf-casa-${sello}@banco.test`, name: "Casa" };
const CLIENTE = { id: `pf-cli-${sello}`, effectiveId: `pf-cli-${sello}`, sessionUserId: `pf-cli-${sello}`, ownerId: null, advisorRole: null, role: "user", rolDeLaPersona: "user", porImpersonacion: false, email: `pf-cli-${sello}@banco.test`, name: "Cliente" };

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

/**
 * Sirve una página con el CSS del build y un paquete, y la abre en Chromium a
 * 1440 y a 390. `modulo` para los paquetes ESM (los de la tarjeta, que salen
 * de `empaquetar-con-acciones-mudas`); la página de un plan es IIFE.
 */
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
            // El video subido vive en un bucket de mentira: no se pide fuera.
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

/** Un `Request` de verdad con el cuerpo en trozos, como llega a la ruta. */
function laPeticion(bytes, { tipo = "video/mp4", nombre = "plan.mp4", largo = bytes.length, trozo = 5 } = {}) {
    let i = 0;
    const cuerpo = new ReadableStream({
        pull(c) {
            if (i >= bytes.length) return c.close();
            c.enqueue(new Uint8Array(bytes.subarray(i, i + trozo)));
            i += trozo;
        },
    });
    return new Request("http://127.0.0.1/api/upload-plan-video", {
        method: "POST",
        body: cuerpo,
        duplex: "half",
        headers: { "content-length": String(largo), "content-type": tipo, "x-nombre-del-archivo": encodeURIComponent(nombre) },
    });
}

// Los primeros bytes de un MP4 (ISO BMFF, marca `isom`) y de un WebM (EBML).
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.from("\0\0\x02\0isomiso2mp41"), Buffer.alloc(40, 7)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81]), Buffer.alloc(40, 3)]);
const NO_ES_VIDEO = Buffer.concat([Buffer.from("%PDF-1.7 este no es un video"), Buffer.alloc(30, 1)]);

const FUNCIONES = () => [
    { id: "chats", nombre: "Chats", descripcion: "Todas tus conversaciones", categoria: "bandeja", tutorial: "chats", activa: true, destacada: true },
    { id: "sheets", nombre: "Google Sheets", descripcion: "", categoria: "integraciones", tutorial: "google-sheets", activa: true, destacada: false },
    { id: "reportes", nombre: "Reportes semanales", descripcion: "", categoria: "panel", tutorial: null, activa: false, destacada: true },
    { id: "creditos", nombre: "8.000 créditos de IA", descripcion: "", categoria: "capacidad", tutorial: null, activa: true, destacada: true },
    { id: "soporte", nombre: "Soporte prioritario", descripcion: "", categoria: "general", tutorial: null, activa: true, destacada: false },
];

if (ROTO) {
    // ─────────────────────────────────────────────────────────────────────────
    // ANTES: lo que faltaba, afirmado
    // ─────────────────────────────────────────────────────────────────────────

    test("ANTES: no había ruta para subir un video, ni regla, ni tabla de «para quién»", () => {
        assert.ok(deAntes(COMPONENTE), `no se pudo leer ${ANTES}`);
        assert.equal(deAntes(RUTA), null, "no existía /api/upload-plan-video");
        assert.equal(deAntes("lib/video-subido.ts"), null);
        assert.equal(deAntes("lib/plan-para-quien-db.ts"), null);
        assert.equal(deAntes("components/ui/video-uploader.tsx"), null, "el panel solo dejaba pegar un enlace");
        assert.equal(deAntes("middleware.ts").includes("upload-plan-video"), false);
    });

    test("ANTES: el botón de comenzar salía DOS veces, una en la barra fija de arriba; ni «para quién» ni plan superior", () => {
        const c = deAntes(COMPONENTE);
        assert.equal(c.match(/<BotonPrincipal\b/g)?.length, 2, "dos botones de comenzar");
        const barra = c.slice(c.indexOf("sticky top-0"), c.indexOf('data-seccion="hero"'));
        assert.ok(barra.includes("<BotonPrincipal"), "uno de ellos en la barra fija");
        const secciones = [...c.matchAll(/data-seccion="([a-z]+)"/g)].map((x) => x[1]);
        assert.deepEqual(secciones, ["hero", "capacidad", "funciones", "preguntas"], "sin «para quién» ni «comenzar»");
        assert.equal(c.includes("planSuperior"), false);
    });

    test("ANTES: una función solo podía estar encendida o apagada, y la tarjeta enseñaba todas", () => {
        assert.equal(/destacad/i.test(deAntes(EDITOR)), false, "no había marca de destacar");
        const l = deAntes(LANDING);
        assert.ok(l.includes("plan.features.map"), "la tarjeta pintaba todas las encendidas");
        assert.equal(l.includes("<video"), false, "y la landing no sabía pintar un video subido");
    });

    let m = null;
    if (hayBase) m = await import(join(COMPILADO, "entrada-antes-de-lo-nuevo.js"));
    let planId = null;

    conBase("siembra", async () => {
        await sembrar(m.db);
        m.ponerAQuienMira(CASA);
        const r = await m.upsertSubscriptionPlan({ plan: "intermedio", assistanceType: "IA", priceUSD: 49, credits: 8000, name: "Starter", features: [], funciones: FUNCIONES() });
        assert.equal(r.success, true, r.message);
        planId = (await m.db.subscriptionPlan.findFirst({ where: { plan: "intermedio", assistanceType: "IA" } })).id;
        await m.upsertSubscriptionPlan({ plan: "avanzado", assistanceType: "IA", priceUSD: 99, credits: 20000, name: "Pro", features: ["Todo"] });
    });

    conBase("ANTES: la tarjeta corta de la landing recibía TODAS las encendidas, sin marca de destacadas", async () => {
        const r = await m.getActiveSubscriptionPlans();
        const p = (r.data ?? r).find((x) => x.id === planId);
        assert.equal("destacadas" in p, false, "no existía la lista de la tarjeta corta");
        assert.ok(p.features.includes("Google Sheets") && p.features.includes("Soporte prioritario"));
        const guardadas = (await m.lasFuncionesGuardadas([planId])).get(planId);
        assert.equal(guardadas.some((f) => "destacada" in f), false, "la marca se perdía al guardar");
    });

    conBase("ANTES: el detalle no traía «para quién» y la página no conocía al plan superior", async () => {
        const d = await m.getPlanDetailBySubscriptionPlanId(planId);
        assert.equal("paraQuien" in d, false);
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.equal("paraQuien" in p, false, "la página no tenía «para quién es este plan»");
        assert.equal("planSuperior" in p, false, "ni la línea al plan Pro, que sí existe y se vende");
        globalThis.__paginaDeAntes = p;
    });

    const TARJETA_ANTES = join(COMPILADO, "tarjeta-antes.js");
    const PAGINA_ANTES = join(COMPILADO, "harness-lo-nuevo-antes.js");
    const conNavegador = chromium && fs.existsSync(TARJETA_ANTES) && fs.existsSync(PAGINA_ANTES) && fs.existsSync(cssDir) && hayBase ? test : test.skip;

    conNavegador("ANTES: la tarjeta pintaba todas las encendidas y no había pieza de video en la landing", async () => {
        const plan = { id: planId, plan: "intermedio", assistanceType: "IA", priceUSD: 49, credits: 8000, name: "Starter", isActive: true, features: ["Chats", "Google Sheets", "8.000 créditos de IA", "Soporte prioritario"] };
        await abrir(TARJETA_ANTES, { __plan: plan, __video: "https://s3.test/verzay-media/plan-videos/x.mp4" }, async (pag, w, errores) => {
            const items = await pag.$$eval('[data-banco="tarjeta"] ul li', (n) => n.map((x) => x.innerText.trim()));
            assert.ok(items.some((t) => t.includes("Google Sheets")) && items.some((t) => t.includes("Soporte prioritario")), `${w}: todas las encendidas: ${JSON.stringify(items)}`);
            assert.equal(await pag.locator('[data-banco="video"]').count(), 0, `${w}: la landing no tenía con qué pintar un archivo`);
            assert.deepEqual(errores, []);
        }, { modulo: true });
    });

    conNavegador("ANTES: la página tenía el botón en la barra fija y en el hero, y nada al final", async () => {
        await abrir(PAGINA_ANTES, { __pagina: globalThis.__paginaDeAntes }, async (pag, w, errores) => {
            assert.equal(await pag.locator('[data-boton="principal"]').count(), 2, `${w}: dos botones de comenzar`);
            assert.equal(await pag.locator('div.sticky [data-boton="principal"]').count(), 1, `${w}: uno fijo arriba`);
            assert.equal(await pag.locator('[data-seccion="hero"] [data-boton="principal"]').count(), 1, `${w}: otro junto al nombre y el precio`);
            assert.equal(await pag.locator('[data-seccion="comenzar"]').count(), 0);
            assert.equal(await pag.locator("[data-plan-superior]").count(), 0);
            assert.equal(await pag.locator('[data-seccion="paraquien"]').count(), 0);
            assert.deepEqual(errores, []);
        });
    });
} else {
    const r = await import(join(COMPILADO, "pagina-de-plan.js"));
    const v = await import(join(COMPILADO, "video-subido.js"));
    const DATOS = r.losDatosDelPlan({ plan: "intermedio", name: "Starter", credits: 8000, priceUSD: 49, assistanceType: "IA" }, ["Lite", "Básico", "Starter", "Pro", "Enterprise"]);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. La regla, pura
    // ─────────────────────────────────────────────────────────────────────────

    test("subir un video: tope, tipo y extensión, con el motivo dicho en palabras", () => {
        assert.equal(v.porQueNoSeSubeElVideo({ tamano: 0, tipo: "video/mp4", nombre: "a.mp4" }), "El archivo está vacío.");
        assert.equal(v.porQueNoSeSubeElVideo({ tamano: 200 * 1024 * 1024, tipo: "video/mp4", nombre: "a.mp4" }), "El video pesa 200 MB y el máximo es 150 MB. Comprímelo o súbelo a YouTube y pega el enlace.");
        assert.equal(v.porQueNoSeSubeElVideo({ tamano: 1000, tipo: "image/png", nombre: "a.png" }), "Solo se pueden subir videos en MP4, WebM o MOV.");
        assert.equal(v.porQueNoSeSubeElVideo({ tamano: 1000, tipo: "video/mp4", nombre: "a.mp4" }), null);
        assert.equal(v.porQueNoSeSubeElVideo({ tamano: 1000, tipo: "application/octet-stream", nombre: "plan.MOV" }), null, "el nombre basta si el navegador no sabe el tipo");
        assert.equal(v.porQueNoSeSubeElVideo({ tamano: v.TOPE_DEL_VIDEO_SUBIDO, tipo: "video/webm", nombre: "" }), null, "el tope justo cabe");
        assert.equal(v.laExtensionDelVideo("video/quicktime"), "mov");
        assert.equal(v.laExtensionDelVideo("video/mp4"), "mp4");
        assert.equal(v.laExtensionDelVideo("image/png"), null);
        assert.equal(v.elPesoLegible(2.5 * 1024 * 1024), "2,5 MB");
        assert.equal(v.elPesoLegible(v.TOPE_DEL_VIDEO_SUBIDO), "150 MB");
        assert.equal(v.elPesoLegible(Number.NaN), "0 MB");
    });

    test("el video subido se pinta con un <video>: la dirección del bucket termina en su extensión", () => {
        for (const ext of ["mp4", "webm", "mov"]) {
            const url = `https://s3.test/verzay-media/plan-videos/abc.${ext}`;
            assert.deepEqual(r.elVideoDelPlan(url), { tipo: "archivo", url });
        }
        assert.equal(r.elVideoDelPlan("https://www.youtube.com/watch?v=dQw4w9WgXcQ").tipo, "iframe", "el enlace de siempre sigue sirviendo");
        assert.equal(r.elVideoDelPlan("http://s3.test/x.mp4"), null, "sin https no");
    });

    test("«para quién es este plan»: lo de fábrica, lo escrito con datos vivos, y un campo viejo no se lleva al otro", () => {
        assert.deepEqual(r.elParaQuienQueSale(null, DATOS), r.PARA_QUIEN_DE_FABRICA.intermedio);
        const propio = r.elParaQuienQueSale({ paraQuien: "Para equipos que ya usan {plan} a diario", caso: "Trae 12.000 créditos de IA" }, DATOS);
        assert.equal(propio.paraQuien, "Para equipos que ya usan Starter a diario");
        assert.equal(propio.caso, r.PARA_QUIEN_DE_FABRICA.intermedio.caso, "el caso que contradice al plan cae en el de fábrica, solo él");
        const avisos = r.losAvisosDelParaQuien({ paraQuien: "", caso: "Trae 12.000 créditos de IA" }, DATOS);
        assert.deepEqual(avisos.paraQuien, []);
        assert.ok(avisos.caso[0].includes("12.000"));
        const largo = r.comoParaQuien({ paraQuien: "x".repeat(900), caso: "  dos   espacios  " });
        assert.equal(largo.paraQuien.length, r.TOPE_DEL_PARA_QUIEN);
        assert.equal(largo.caso, "dos espacios");
        assert.deepEqual(r.comoParaQuien("lo que sea"), { paraQuien: "", caso: "" });
        for (const nivel of ["lite", "basico", "intermedio", "avanzado", "enterprise", "personalizado"]) {
            const d = r.losDatosDelPlan({ plan: nivel, name: "X", credits: 1, priceUSD: 1 }, ["X"]);
            const f = r.PARA_QUIEN_DE_FABRICA[nivel];
            assert.ok(f.paraQuien && f.caso, `${nivel}: tiene los dos textos`);
            assert.deepEqual(r.losAvisosDelParaQuien(f, d), { paraQuien: [], caso: [] }, `${nivel}: lo de fábrica no se queda viejo`);
            assert.equal(/\d/.test(f.paraQuien + f.caso), false, `${nivel}: sin números que se queden viejos`);
        }
    });

    test("el plan inmediato superior: el siguiente nivel que se vende, del mismo tipo si lo hay", () => {
        const plan = (nivel, tipo, extra = {}) => ({ plan: nivel, assistanceType: tipo, isActive: true, isResellerPlan: false, name: null, ...extra });
        const intermedio = { plan: "intermedio", assistanceType: "IA" };
        assert.deepEqual(r.elPlanSuperior([plan("avanzado", "IA", { name: "Pro" }), plan("avanzado", "HUMANO")], intermedio), { plan: "avanzado", tipo: "IA", nombre: "Pro", url: "/planes/avanzado" });
        assert.deepEqual(r.elPlanSuperior([plan("avanzado", "IA", { isActive: false }), plan("avanzado", "HUMANO", { name: "Pro humano" })], intermedio), { plan: "avanzado", tipo: "HUMANO", nombre: "Pro humano", url: "/planes/avanzado?tipo=HUMANO" });
        assert.equal(r.elPlanSuperior([plan("avanzado", "IA", { isActive: false }), plan("enterprise", "IA", { name: "Ent" })], intermedio).plan, "enterprise", "un nivel apagado se salta");
        assert.equal(r.elPlanSuperior([plan("avanzado", "IA", { isResellerPlan: true })], intermedio), null, "un plan de reseller no se vende aquí");
        assert.equal(r.elPlanSuperior([plan("basico", "IA"), plan("lite", "IA")], intermedio), null, "uno de abajo no es superior");
        assert.equal(r.elPlanSuperior([plan("personalizado", "IA")], { plan: "personalizado", assistanceType: "IA" }), null, "del último, ninguno");
        assert.equal(r.elPlanSuperior([plan("avanzado", "IA")], { plan: "no-existe", assistanceType: "IA" }), null);
        assert.equal(r.elPlanSuperior([plan("avanzado", "IA")], intermedio).nombre, r.elNombreDelPlan({ plan: "avanzado" }), "sin nombre en el panel, el de fábrica");
    });

    test("activa y destacada son dos marcas: destacar solo decide la tarjeta corta, apagar quita la función de todo", () => {
        const f = r.comoFunciones(FUNCIONES());
        assert.equal(r.comoFunciones([{ nombre: "Sin marca" }])[0].destacada, true, "una función de antes sale destacada: la tarjeta no pierde nada");
        assert.deepEqual(r.losFeaturesDeLasFunciones(f), ["Chats", "Google Sheets", "8.000 créditos de IA", "Soporte prioritario"], "el plan completo: las encendidas, destacadas o no");
        assert.deepEqual(r.lasFuncionesDestacadas(f), ["Chats", "8.000 créditos de IA"], "la tarjeta: encendidas Y destacadas");
        assert.equal(r.lasFuncionesDestacadas(f).includes("Reportes semanales"), false, "una apagada no sale aunque esté marcada como destacada");
    });

    test("barrido: el botón de comenzar va solo al final, y cada pieza en su sitio", () => {
        const c = crudo(COMPONENTE);
        assert.equal(c.match(/<BotonPrincipal\b/g)?.length, 1, "un solo botón de comenzar");
        const barra = c.slice(c.indexOf("sticky top-0"), c.indexOf("data-bloques"));
        assert.ok(barra.length > 0, "la barra fija va antes de los bloques");
        assert.equal(barra.includes("<BotonPrincipal") || barra.includes("<BotonSecundario"), false, "nada de botones en la barra fija");
        assert.ok(c.indexOf("<BotonPrincipal") > c.indexOf('data-seccion="preguntas"'), "el botón va después de las preguntas");
        assert.ok(c.indexOf("<BotonPrincipal") > c.indexOf('data-seccion="comenzar"'));
        const secciones = [...c.matchAll(/data-seccion="([a-z]+)"/g)].map((x) => x[1]);
        assert.deepEqual(secciones, ["video", "paraquien", "capacidad", "funciones", "preguntas", "comenzar"]);
        assert.ok(c.includes("data-plan-superior"));

        const mw = crudo("middleware.ts");
        assert.ok(mw.includes('"/((?!.*\\\\..*|_next|api/upload-plan-video).*)"'), "la ruta va fuera del middleware");
        assert.ok(mw.includes('"/(api(?!/upload-plan-video)|trpc)(.*)"'));
        const ruta = crudo(RUTA);
        assert.ok(ruta.includes("quienMandaEnLaCasa"), "sin middleware delante, la puerta es suya");
        assert.ok(ruta.includes("Readable.fromWeb"), "el archivo fluye al bucket");
        assert.equal(/\.formData\(/.test(ruta), false, "nunca entero en memoria");
        assert.ok(crudo("app/(root)/(protected)/admin/planes/_components/PlanDetailTab.tsx").includes("<VideoUploader"));
        assert.ok(crudo("app/(root)/(protected)/admin/landing/_components/VerzayLanding.tsx").includes("<VideoUploader"));

        const e = crudo(EDITOR);
        assert.ok(e.includes("data-interruptor-de-funcion") && e.includes("data-destacar-funcion"), "dos controles separados");
        assert.ok(crudo(LANDING).includes("plan.destacadas ?? plan.features"), "la tarjeta corta enseña las destacadas");
        assert.equal(fs.existsSync(join(RAIZ, MODAL)), false, "ya no hay ventana intermedia: el enlace lleva a la página completa");
        assert.ok(crudo(LANDING).includes("data-ver-el-plan") && crudo(LANDING).includes("`/planes/${plan.plan}"), "«Ver todo lo que incluye» lleva directo a la página");
        const tabla = crudo("lib/plan-para-quien-db.ts");
        assert.ok(tabla.includes('CREATE TABLE IF NOT EXISTS "plan_para_quien"'));
        assert.equal(/REFERENCES/i.test(tabla), false, "sin clave foránea: es una tabla de la App");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Las acciones y la ruta contra Postgres
    // ─────────────────────────────────────────────────────────────────────────

    let m = null;
    if (hayBase) m = await import(join(COMPILADO, "entrada-de-pagina-de-plan.js"));
    const guardar = (funciones, extra = {}) =>
        m.upsertSubscriptionPlan({ plan: "intermedio", assistanceType: "IA", priceUSD: 49, credits: 8000, name: "Starter", features: [], funciones, ...extra });
    const nombres = (p) => p.funciones.map((f) => f.nombre);
    const laDeLaLanding = async (id) => (await m.getActiveSubscriptionPlans()).data.find((p) => p.id === id);
    let planId = null;
    let urlSubida = null;
    let paginaConTodo = null;
    let paginaDelPro = null;

    conBase("siembra", async () => {
        await sembrar(m.db);
        m.ponerAQuienMira(CASA);
        const g = await guardar(FUNCIONES());
        assert.equal(g.success, true, g.message);
        planId = (await m.db.subscriptionPlan.findFirst({ where: { plan: "intermedio", assistanceType: "IA" } })).id;
    });

    conBase("destacar: la tarjeta de la landing enseña solo las destacadas; el plan completo, todas las encendidas", async () => {
        const plan = await m.db.subscriptionPlan.findUnique({ where: { id: planId } });
        assert.deepEqual(plan.features, ["Chats", "Google Sheets", "8.000 créditos de IA", "Soporte prioritario"]);
        const landing = await laDeLaLanding(planId);
        assert.deepEqual(landing.destacadas, ["Chats", "8.000 créditos de IA"]);
        assert.deepEqual(landing.features, plan.features, "el detalle de la landing no cambia");
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.deepEqual(nombres(p), ["Chats", "Google Sheets", "Soporte prioritario"], "la página completa enseña las no destacadas");
        const guardadas = (await m.lasFuncionesGuardadas([planId])).get(planId);
        assert.equal(guardadas.find((f) => f.id === "sheets").destacada, false, "la marca se guarda");
    });

    conBase("destacar una más cambia SOLO la tarjeta; apagar una la quita de todo", async () => {
        m.ponerAQuienMira(CASA);
        const f = FUNCIONES();
        f[1].destacada = true;
        await guardar(f);
        assert.deepEqual((await laDeLaLanding(planId)).destacadas, ["Chats", "Google Sheets", "8.000 créditos de IA"]);
        assert.deepEqual((await m.db.subscriptionPlan.findUnique({ where: { id: planId } })).features, ["Chats", "Google Sheets", "8.000 créditos de IA", "Soporte prioritario"], "el plan sigue igual");
        f[0].activa = false;
        await guardar(f);
        const landing = await laDeLaLanding(planId);
        assert.equal(landing.destacadas.includes("Chats"), false, "apagada no sale en la tarjeta aunque siga marcada");
        assert.equal(landing.features.includes("Chats"), false, "ni en el plan");
        assert.equal(nombres(await m.laPaginaDelPlan("intermedio", "IA")).includes("Chats"), false, "ni en la página");
        await guardar(FUNCIONES());
    });

    conBase("«para quién»: sin escribir nada sale lo de fábrica; lo escrito sale con los datos vivos", async () => {
        let p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.deepEqual(p.paraQuien, r.PARA_QUIEN_DE_FABRICA.intermedio);
        assert.equal(await m.elParaQuienGuardado(planId), null);
        assert.equal((await m.getPlanDetailBySubscriptionPlanId(planId)).paraQuien, null);
        m.ponerAQuienMira(CASA);
        const g = await m.upsertPlanDetail(planId, { paraQuien: "Para clínicas que atienden con {plan}", caso: "Un consultorio que usa sus {creditos} créditos de IA al mes" });
        assert.equal(g.success, true, g.message);
        assert.deepEqual(await m.elParaQuienGuardado(planId), { paraQuien: "Para clínicas que atienden con {plan}", caso: "Un consultorio que usa sus {creditos} créditos de IA al mes" }, "se guarda lo escrito, con sus llaves");
        p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.deepEqual(p.paraQuien, { paraQuien: "Para clínicas que atienden con Starter", caso: "Un consultorio que usa sus 8.000 créditos de IA al mes" });
    });

    conBase("«para quién»: guardar otro campo no lo borra; un caso viejo cae en el de fábrica; vacío borra la fila", async () => {
        m.ponerAQuienMira(CASA);
        await m.upsertPlanDetail(planId, { videoTitle: "Así se ve {plan}" });
        assert.equal((await m.elParaQuienGuardado(planId)).paraQuien, "Para clínicas que atienden con {plan}", "guardar el título del video no lo toca");
        await m.upsertPlanDetail(planId, { caso: "Trae 12.000 créditos de IA" });
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.equal(p.paraQuien.paraQuien, "Para clínicas que atienden con Starter", "el otro campo se queda");
        assert.equal(p.paraQuien.caso, r.PARA_QUIEN_DE_FABRICA.intermedio.caso, "el que no cuadra con el plan no sale");
        assert.equal((await m.elParaQuienGuardado(planId)).caso, "Trae 12.000 créditos de IA", "pero sigue guardado, para que el panel diga por qué");
        await m.upsertPlanDetail(planId, { paraQuien: "", caso: "  " });
        assert.equal(await m.elParaQuienGuardado(planId), null);
        assert.equal(Number((await m.db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "plan_para_quien"`))[0].n), 0, "la fila se va");
        await m.upsertPlanDetail(planId, { paraQuien: "Para clínicas que atienden con {plan}" });
    });

    conBase("un cliente no escribe «para quién»", async () => {
        m.ponerAQuienMira(CLIENTE);
        assert.equal((await m.upsertPlanDetail(planId, { paraQuien: "Robado" })).message, "No autorizado");
        assert.equal((await m.elParaQuienGuardado(planId)).paraQuien, "Para clínicas que atienden con {plan}");
    });

    conBase("el plan superior: el siguiente que se vende; ninguno desde el último; apagarlo cae al otro tipo", async () => {
        m.ponerAQuienMira(CASA);
        assert.equal((await m.laPaginaDelPlan("intermedio", "IA")).planSuperior, null, "todavía no hay ninguno arriba");
        const pro = await m.upsertSubscriptionPlan({ plan: "avanzado", assistanceType: "IA", priceUSD: 99, credits: 20000, name: "Pro", features: ["Todo lo de Starter"] });
        assert.equal(pro.success, true, pro.message);
        assert.deepEqual((await m.laPaginaDelPlan("intermedio", "IA")).planSuperior, { plan: "avanzado", tipo: "IA", nombre: "Pro", url: "/planes/avanzado" });
        paginaDelPro = await m.laPaginaDelPlan("avanzado", "IA");
        assert.equal(paginaDelPro.planSuperior, null, "del más alto, ninguno");
        const proId = (await m.db.subscriptionPlan.findFirst({ where: { plan: "avanzado", assistanceType: "IA" } })).id;
        await m.upsertSubscriptionPlan({ plan: "avanzado", assistanceType: "HUMANO", priceUSD: 149, credits: 20000, name: "Pro con asesor", features: ["Todo"] });
        await m.toggleSubscriptionPlanActive(proId, false);
        assert.deepEqual((await m.laPaginaDelPlan("intermedio", "IA")).planSuperior, { plan: "avanzado", tipo: "HUMANO", nombre: "Pro con asesor", url: "/planes/avanzado?tipo=HUMANO" });
        await m.toggleSubscriptionPlanActive(proId, true);
    });

    conBase("subir el video: solo la casa, solo videos, y el tamaño se vigila", async () => {
        m.ponerAQuienMira(null);
        assert.equal((await m.subirElVideo(laPeticion(MP4))).status, 403, "sin sesión");
        m.ponerAQuienMira(CLIENTE);
        assert.equal((await m.subirElVideo(laPeticion(MP4))).status, 403, "un cliente tampoco");
        m.ponerAQuienMira(CASA);
        const png = await m.subirElVideo(laPeticion(MP4, { tipo: "image/png", nombre: "foto.png" }));
        assert.equal(png.status, 400);
        assert.equal((await png.json()).error, "Solo se pueden subir videos en MP4, WebM o MOV.");
        const grande = await m.subirElVideo(laPeticion(MP4, { largo: 200 * 1024 * 1024 }));
        assert.equal(grande.status, 413);
        assert.ok((await grande.json()).error.includes("150 MB"));
        const falso = await m.subirElVideo(laPeticion(NO_ES_VIDEO, { nombre: "plan.mp4" }));
        assert.equal(falso.status, 400, "un .mp4 que por dentro no es video");
        const demas = await m.subirElVideo(laPeticion(MP4, { largo: 20 }));
        assert.equal(demas.status, 500, "trae más bytes de los que dijo");
        assert.equal(m.videosSubidos.length, 0, "nada de eso llegó al bucket");
    });

    conBase("subir el video: un MP4 llega entero al bucket con su tipo, y un WebM con nombre .mp4 se guarda como WebM", async () => {
        m.ponerAQuienMira(CASA);
        const res = await m.subirElVideo(laPeticion(MP4));
        assert.equal(res.status, 200);
        const { url } = await res.json();
        assert.match(url, /^https:\/\/s3\.test\/verzay-media\/plan-videos\/[0-9a-f-]{36}\.mp4$/);
        const subido = m.videosSubidos.at(-1);
        assert.ok(subido.bytes.equals(MP4), "los mismos bytes, en orden");
        assert.equal(subido.tipo, "video/mp4");
        assert.equal(subido.largo, MP4.length);
        urlSubida = url;
        const webm = await m.subirElVideo(laPeticion(WEBM, { tipo: "application/octet-stream", nombre: "grabacion.mp4" }));
        assert.equal(webm.status, 200);
        assert.match((await webm.json()).url, /\.webm$/);
        assert.equal(m.videosSubidos.at(-1).tipo, "video/webm");
    });

    conBase("el video subido se guarda en el detalle y la página lo pinta como archivo, con preguntas y botón al final", async () => {
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertPlanDetail(planId, {
            videoUrl: urlSubida,
            faqs: [{ question: "¿Puedo cambiar de plan?", answer: "Sí, cuando quieras." }],
        })).success, true);
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.equal(p.video.tipo, "archivo");
        assert.equal(p.video.url, urlSubida);
        assert.equal(p.preguntas.length, 1);
        assert.equal(p.planSuperior.nombre, "Pro");
        paginaConTodo = p;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. La página y la tarjeta reales en Chromium
    // ─────────────────────────────────────────────────────────────────────────

    const HARNESS = join(COMPILADO, "harness.js");
    const TARJETA = join(COMPILADO, "tarjeta.js");
    const conNavegador = chromium && fs.existsSync(HARNESS) && fs.existsSync(TARJETA) && fs.existsSync(cssDir) && hayBase ? test : test.skip;

    conNavegador("la página: un solo botón de comenzar, al final; «para quién»; la línea al plan superior; el video subido", async () => {
        assert.ok(paginaConTodo, "la prueba de Postgres no dejó la página armada");
        await abrir(HARNESS, { __pagina: paginaConTodo }, async (pag, w, errores) => {
            const secciones = await pag.$$eval("[data-seccion]", (n) => n.map((x) => x.getAttribute("data-seccion")));
            assert.deepEqual(secciones, ["video", "paraquien", "capacidad", "funciones", "preguntas", "comenzar"], `${w}: el orden`);
            assert.equal(await pag.locator('[data-boton="principal"]').count(), 1, `${w}: un solo botón de comenzar`);
            assert.equal(await pag.locator('[data-seccion="comenzar"] [data-boton="principal"]').count(), 1, `${w}: y es el del final`);
            assert.equal(await pag.locator("div.sticky [data-boton]").count(), 0, `${w}: la barra fija no lleva botones`);
            assert.equal(await pag.locator('[data-seccion="video"] [data-boton]').count(), 0, `${w}: ni junto al video`);
            const yBoton = await pag.locator('[data-boton="principal"]').evaluate((n) => n.getBoundingClientRect().top + window.scrollY);
            const yPreguntas = await pag.locator('[data-seccion="preguntas"]').evaluate((n) => n.getBoundingClientRect().bottom + window.scrollY);
            assert.ok(yBoton > yPreguntas, `${w}: el botón cae debajo de las preguntas (${yBoton} > ${yPreguntas})`);
            assert.equal(await pag.locator('[data-seccion="video"] [data-video="archivo"] video').getAttribute("src"), urlSubida, `${w}: el video subido, con un <video>`);
            assert.equal((await pag.locator("[data-para-quien] p").innerText()).trim(), "Para clínicas que atienden con Starter");
            assert.equal((await pag.locator("[data-caso-tipico] p").innerText()).trim(), r.PARA_QUIEN_DE_FABRICA.intermedio.caso);
            const linea = pag.locator('[data-plan-superior="avanzado"] a');
            assert.equal(await linea.getAttribute("href"), "/planes/avanzado");
            assert.ok((await linea.innerText()).includes("Conoce el plan Pro"));
            const yLinea = await pag.locator("[data-plan-superior]").evaluate((n) => n.getBoundingClientRect().top + window.scrollY);
            assert.ok(yLinea > yBoton, `${w}: la línea va después del botón, discreta, al final`);
            const ancho = await pag.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth }));
            assert.ok(ancho.doc <= ancho.vw, `${w}: no se desplaza a lo ancho (${JSON.stringify(ancho)})`);
            assert.deepEqual(errores, [], `${w}: sin errores`);
        });
    });

    conNavegador("la página del plan más alto no invita a ninguno", async () => {
        await abrir(HARNESS, { __pagina: paginaDelPro }, async (pag, w, errores) => {
            assert.equal(await pag.locator("[data-plan-superior]").count(), 0, `${w}`);
            assert.equal(await pag.locator('[data-seccion="comenzar"] [data-boton="principal"]').count(), 1);
            assert.deepEqual(errores, []);
        });
    });

    conNavegador("la tarjeta corta de la landing enseña solo las destacadas, y el video subido se pinta con <video>", async () => {
        const landing = await laDeLaLanding(planId);
        await abrir(TARJETA, { __plan: landing, __video: urlSubida }, async (pag, w, errores) => {
            const items = await pag.$$eval("[data-banco=\"tarjeta\"] [data-funciones-de-la-tarjeta] li", (n) => n.map((x) => x.innerText.trim()));
            // La función de los créditos no se repite en la lista: el número va en
            // su pastilla, junto al precio (`losPuntosDeLaTarjeta`).
            assert.deepEqual(items, ["Chats"], `${w}: solo las destacadas`);
            assert.equal(await pag.locator('[data-banco="video"] video[data-video-de-la-landing="archivo"]').getAttribute("src"), urlSubida);
            assert.deepEqual(errores, [], `${w}: sin errores`);
        }, { modulo: true });
    });
}
