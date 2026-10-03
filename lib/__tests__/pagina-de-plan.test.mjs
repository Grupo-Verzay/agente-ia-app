/**
 * La PÁGINA DE DETALLE de un plan (`/planes/<plan>`), armada EN VIVO desde el
 * panel de Planes.
 *
 * 1. **La regla** (pura): cómo se arman las funciones a partir de `features`
 *    y de lo guardado (apagar, renombrar, una función nueva), qué tutorial y
 *    qué categoría se deducen, la capacidad (créditos, catálogo, asistencia)
 *    con los datos del plan, el video, los botones y qué texto guardado ya no
 *    cuadra con el plan («12.000 créditos» en uno de 8.000, «Plan Intermedio»
 *    en el que hoy se llama Starter). Más un barrido del código.
 * 2. **Las acciones contra Postgres**: el panel guarda y la página lo refleja la
 *    próxima vez que se abre, sin texto fijo; guardar el detalle a medias NO
 *    borra lo que no llega; un plan apagado no se enseña; solo la casa guarda.
 * 3. **La pantalla real en Chromium** sobre el CSS del build: el orden pedido
 *    —hero con video, capacidad, funciones por categoría con su tutorial,
 *    preguntas— y nada de testimonios ni bloques genéricos. A 1440 y 390.
 *
 * `MODO=roto` corre contra `ANTES_REF` (88ade1f) y AFIRMA los fallos: la
 * página copiaba `features` tal cual (texto viejo incluido), enseñaba un plan
 * apagado con el nombre «Nivel 3», pintaba testimonios y estadísticas, y el
 * guardado parcial del detalle borraba los testimonios y las preguntas.
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
const ANTES_REF = process.env.ANTES_REF ?? "88ade1f";
const COMPONENTE = "app/(public)/planes/[slug]/_components/PlanDetailPage.tsx";
const PAGINA = "app/(public)/planes/[slug]/page.tsx";

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deAntes = (f) => {
    try {
        execFileSync("git", ["cat-file", "-e", `${ANTES_REF}:${f}`], { cwd: RAIZ, stdio: "ignore" });
        return execFileSync("git", ["show", `${ANTES_REF}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};

const hayBase = Boolean(process.env.DATABASE_URL);
const conBase = hayBase ? test : test.skip;
const cssDir = join(RAIZ, ".next", "static", "css");
const sello = Date.now().toString(36);
const CASA = { id: `pp-casa-${sello}`, effectiveId: `pp-casa-${sello}`, sessionUserId: `pp-casa-${sello}`, ownerId: null, advisorRole: null, role: "admin", rolDeLaPersona: "admin", porImpersonacion: false, email: `casa-${sello}@banco.test`, name: "Casa" };
const CLIENTE = { id: `pp-cli-${sello}`, effectiveId: `pp-cli-${sello}`, sessionUserId: `pp-cli-${sello}`, ownerId: null, advisorRole: null, role: "user", rolDeLaPersona: "user", porImpersonacion: false, email: `cli-${sello}@banco.test`, name: "Cliente" };

async function sembrarLasCuentas(db) {
    await db.planDetail.deleteMany({});
    await db.subscriptionPlan.deleteMany({});
    await db.$executeRawUnsafe(`DELETE FROM "plan_funciones"`).catch(() => {});
    for (const u of [CASA, CLIENTE]) {
        await db.user.create({ data: { id: u.id, email: u.email, name: u.name, role: u.role } });
    }
}

/** Sirve la página con el CSS del build y el harness dado, y la abre en Chromium. */
async function abrir(harness, datos, pintar) {
    const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
    const js = fs.readFileSync(harness, "utf8");
    const json = JSON.stringify(datos).replace(/</g, "\\u003c");
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>Object.assign(window, ${json});</script><script>${js}</script></body></html>`;
    const srv = http.createServer((_q, res) => { res.setHeader("content-type", "text/html"); res.end(html); });
    await new Promise((ok) => srv.listen(0, ok));
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    try {
        for (const [w, h] of [[1440, 900], [390, 844]]) {
            const pag = await nav.newPage({ viewport: { width: w, height: h } });
            // El video de YouTube no se pide fuera: no es lo que se mide.
            await pag.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
            const errores = [];
            pag.on("pageerror", (e) => errores.push(String(e)));
            await pag.goto(url);
            await pag.waitForFunction(() => window.listo === true);
            await pag.waitForTimeout(150);
            await pintar(pag, w, errores);
            await pag.close();
        }
    } finally {
        await nav.close();
        srv.close();
    }
}

if (ROTO) {
    // ─────────────────────────────────────────────────────────────────────────
    // ANTES: lo que había, afirmado
    // ─────────────────────────────────────────────────────────────────────────

    test("ANTES: no existía la regla de la página ni la tabla de funciones", () => {
        assert.ok(deAntes(PAGINA), "no se pudo leer ANTES_REF");
        assert.equal(deAntes("lib/pagina-de-plan.ts"), null);
        assert.equal(deAntes("lib/plan-funciones-db.ts"), null);
    });

    test("ANTES: la página pedía sesión y nombraba el plan con una tabla fija", () => {
        assert.equal(deAntes("middleware.ts").includes('"/planes/"'), false, "/planes/ no era pública");
        const pagina = deAntes(PAGINA);
        assert.ok(pagina.includes("PLAN_LABELS"), "el nombre salía de una tabla escrita a mano");
        assert.ok(pagina.includes("getPlanDetailBySlug"));
    });

    test("ANTES: la página copiaba features tal cual y pintaba testimonios, estadísticas y galería", () => {
        const c = deAntes(COMPONENTE);
        assert.ok(c.includes("plan.features.map"));
        assert.ok(c.includes("Lo que dicen nuestros clientes"));
        assert.ok(c.includes("stats.map") && c.includes("galleryImages"));
        assert.equal(c.includes('data-seccion="capacidad"'), false);
    });

    let m = null;
    if (hayBase) m = await import(join(COMPILADO, "entrada-de-pagina-de-plan-antes.js"));
    let planId = null;

    conBase("siembra", async () => {
        await sembrarLasCuentas(m.db);
        m.ponerAQuienMira(CASA);
        const r = await m.upsertSubscriptionPlan({
            plan: "intermedio", assistanceType: "IA", priceUSD: 49, credits: 8000, name: "Starter",
            features: ["Chats con IA", "12.000 créditos de IA", "Plan Intermedio con soporte"], isActive: false,
        });
        assert.equal(r.success, true, r.message);
        planId = (await m.db.subscriptionPlan.findFirst({ where: { plan: "intermedio", assistanceType: "IA" } })).id;
    });

    conBase("ANTES: un plan APAGADO se servía, con su texto viejo tal cual", async () => {
        const r = await m.getPlanDetailBySlug("intermedio", "IA");
        assert.equal(r.success, true, "se servía un plan apagado");
        assert.ok(r.plan.features.includes("12.000 créditos de IA"), "el texto que contradice los 8.000 créditos salía tal cual");
        assert.ok(r.plan.features.includes("Plan Intermedio con soporte"), "y el nombre viejo también");
        assert.equal("name" in r.plan, false, "el nombre del panel no llegaba a la página");
    });

    conBase("ANTES: guardar el video BORRABA los testimonios y las preguntas", async () => {
        m.ponerAQuienMira(CASA);
        await m.upsertPlanDetail(planId, {
            testimonials: [{ name: "Ana", role: "Dueña", company: "Tienda", text: "Excelente", rating: 5 }],
            faqs: [{ question: "¿Qué incluye?", answer: "Todo." }],
        });
        await m.upsertPlanDetail(planId, { videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
        const d = await m.db.planDetail.findUnique({ where: { subscriptionPlanId: planId } });
        assert.deepEqual(d.testimonials, [], "los testimonios se fueron");
        assert.deepEqual(d.faqs, [], "y las preguntas también");
    });

    const HARNESS_ANTES = join(COMPILADO, "harness-antes.js");
    const conNavegador = chromium && fs.existsSync(HARNESS_ANTES) ? test : test.skip;
    conNavegador("ANTES: la página pintaba testimonios, el texto viejo y «Nivel 3», sin resumen de capacidad", async () => {
        const plan = {
            id: "x", plan: "intermedio", assistanceType: "IA", priceUSD: 49, priceQuarterly: null, priceYearly: null,
            credits: 8000, features: ["Chats con IA", "12.000 créditos de IA", "Plan Intermedio con soporte"],
            description: null, isPopular: false, checkoutUrlMonthly: null, checkoutUrlQuarterly: null, checkoutUrlYearly: null,
        };
        const detalle = {
            heroTitle: null, heroSubtitle: null, heroImageUrl: null, heroBadge: null, videoUrl: null, videoTitle: null, videoThumbnailUrl: null,
            featureSections: [], galleryImages: [], faqs: [], stats: [{ value: "+500", label: "Clientes" }],
            testimonials: [{ name: "Ana", role: "Dueña", company: "Tienda", text: "Excelente servicio", rating: 5 }],
            meetingUrl: null, demoUrl: null, whatsappMessage: null, ctaTitle: null, ctaSubtitle: null, ctaButtonText: null,
            ctaButtonUrl: null, ctaSecondaryText: null, ctaSecondaryUrl: null, metaTitle: null, metaDescription: null, ogImageUrl: null,
        };
        await abrir(HARNESS_ANTES, { __plan: plan, __detalle: detalle, __etiqueta: "Nivel 3" }, async (pag, w, errores) => {
            const texto = await pag.evaluate(() => document.body.innerText);
            assert.ok(texto.includes("Lo que dicen nuestros clientes") && texto.includes("Excelente servicio"), `${w}: había testimonios`);
            assert.ok(texto.includes("12.000 créditos de IA"), `${w}: el texto viejo salía tal cual`);
            assert.ok(texto.includes("Nivel 3"), `${w}: el plan se llamaba «Nivel 3», no «Starter»`);
            assert.equal(await pag.locator('[data-seccion="capacidad"]').count(), 0, `${w}: no había resumen de capacidad`);
            assert.deepEqual(errores, []);
        });
    });
} else {
    const r = await import(join(COMPILADO, "pagina-de-plan.js"));
    const { GUIAS_PUBLICADAS } = await import(join(COMPILADO, "tutoriales-del-modulo.js"));
    const GUIAS = new Map(GUIAS_PUBLICADAS.map((g) => [g.modulo, `Guía de ${g.contenido.titulo}`]));

    // ─────────────────────────────────────────────────────────────────────────
    // 1. La regla, pura
    // ─────────────────────────────────────────────────────────────────────────

    const DATOS = r.losDatosDelPlan({ plan: "intermedio", name: "Starter", credits: 8000, priceUSD: 49, assistanceType: "IA" }, ["Lite", "Básico", "Starter", "Pro", "Enterprise"]);

    test("los datos del plan salen del plan: nombre del panel, créditos y el tope del catálogo", () => {
        assert.equal(DATOS.nombre, "Starter");
        assert.equal(DATOS.creditos, 8000);
        assert.equal(DATOS.catalogo, 25);
        assert.equal(r.elNombreDelPlan({ plan: "intermedio", name: "  " }), "Nivel 3");
        assert.equal(r.elNumero(15000), "15.000");
    });

    test("cada módulo que se sugiere como tutorial es una guía PUBLICADA", () => {
        const publicados = new Set(GUIAS_PUBLICADAS.map((g) => g.modulo));
        for (const mod of r.MODULOS_QUE_SE_SUGIEREN) assert.ok(publicados.has(mod), `«${mod}» no es una guía publicada`);
        for (const c of r.CATEGORIAS_DEL_PLAN) assert.ok(c.slug && c.nombre);
    });

    test("se sugiere la categoría y el tutorial por lo que dice la función", () => {
        assert.deepEqual(r.sugerirLaFuncion("Chats"), { categoria: "bandeja", tutorial: "chats" });
        assert.deepEqual(r.sugerirLaFuncion("Google Sheets"), { categoria: "integraciones", tutorial: "google-sheets" });
        assert.equal(r.sugerirLaFuncion("8.000 créditos de IA").categoria, r.CATEGORIA_CAPACIDAD);
        assert.deepEqual(r.sugerirLaFuncion("Agenda de citas"), { categoria: "contactos", tutorial: "agenda" });
        assert.deepEqual(r.sugerirLaFuncion("Capacitación del equipo"), { categoria: "entrenamiento", tutorial: "usuarios" });
        assert.deepEqual(r.sugerirLaFuncion("Algo que no encaja"), { categoria: r.CATEGORIA_GENERAL, tutorial: null });
    });

    test("las funciones: apagar, renombrar y una nueva por features se reflejan sin perder lo guardado", () => {
        const guardadas = r.comoFunciones([
            { id: "a", nombre: "Chats", descripcion: "Todo en un lugar", categoria: "bandeja", tutorial: "chats", activa: true },
            { id: "b", nombre: "Google Sheets", descripcion: "", categoria: "integraciones", tutorial: "google-sheets", activa: true },
            { id: "c", nombre: "Reportes", descripcion: "", categoria: "panel", tutorial: null, activa: false },
        ]);
        assert.deepEqual(r.losFeaturesDeLasFunciones(guardadas), ["Chats", "Google Sheets"]);
        // Lo guardado cuadra con features: se usa tal cual.
        assert.deepEqual(r.lasFuncionesDelPlan(["Chats", "Google Sheets"], guardadas).map((f) => f.id), ["a", "b", "c"]);
        // Alguien quitó Google Sheets de features y añadió una por otro camino.
        const otra = r.lasFuncionesDelPlan(["chats", "Tareas del equipo"], guardadas);
        assert.equal(otra[0].id, "a", "la misma función, aunque cambien mayúsculas");
        assert.equal(otra[0].descripcion, "Todo en un lugar", "conserva su descripción");
        assert.equal(otra[1].categoria, "herramientas", "la nueva se deduce");
        assert.equal(otra.some((f) => f.nombre === "Google Sheets"), false, "la quitada de features ya no está");
        assert.ok(otra.some((f) => f.id === "c" && !f.activa), "la apagada se conserva apagada");
        // Una categoría inventada cae en «Otras funciones».
        assert.equal(r.comoFunciones([{ nombre: "X", categoria: "lo-que-sea" }])[0].categoria, r.CATEGORIA_GENERAL);
        assert.equal(r.comoFunciones([{ nombre: "X", tutorial: "javascript:alert(1)" }])[0].tutorial, null);
    });

    test("el texto que contradice al plan se detecta; los datos vivos entre llaves no", () => {
        assert.deepEqual(r.losAvisosDelTexto("Incluye 12.000 créditos de IA", DATOS), ["Dice 12.000 créditos y el plan tiene 8.000."]);
        assert.deepEqual(r.losAvisosDelTexto("Incluye {creditos} créditos de IA", DATOS), []);
        assert.deepEqual(r.losAvisosDelTexto("Una conversación gasta 3.000-5.000 créditos", DATOS), [], "un rango no es la bolsa del plan");
        assert.ok(r.losAvisosDelTexto("¿Qué trae el Plan Intermedio?", DATOS)[0].includes("Intermedio"));
        assert.ok(r.losAvisosDelTexto("Hasta 100 productos", DATOS)[0].includes("25"));
        assert.equal(r.conLosDatosDelPlan("{plan}: {creditos} y {catalogo}", DATOS), "Starter: 8.000 y 25 productos");
        assert.equal(r.elTextoDelBoton("Quiero el Pro", "Comenzar ahora", DATOS), "Comenzar ahora", "un botón que nombra otro plan sale con el de siempre");
        assert.equal(r.elTextoDelBoton("Quiero {plan}", "Comenzar ahora", DATOS), "Quiero Starter");
    });

    test("las preguntas que salen: completas, sin contradecir al plan y con los datos vivos", () => {
        const salen = r.lasPreguntasQueSalen([
            { question: "¿Cuántos créditos?", answer: "Trae 12.000 créditos de IA." },
            { question: "¿Cuántos créditos trae {plan}?", answer: "Trae {creditos} créditos de IA." },
            { question: "Sin respuesta", answer: "" },
        ], DATOS);
        assert.deepEqual(salen, [{ question: "¿Cuántos créditos trae Starter?", answer: "Trae 8.000 créditos de IA." }]);
    });

    test("la capacidad: créditos, catálogo y asistencia, con los datos del plan", () => {
        const t = r.laCapacidadDelPlan(DATOS, []);
        assert.deepEqual(t.map((x) => [x.clave, x.valor]), [["creditos", "8.000"], ["catalogo", "Hasta 25"], ["asistencia", "IA 24/7"]]);
        const humano = r.losDatosDelPlan({ plan: "personalizado", credits: 0, priceUSD: 0, assistanceType: "HUMANO" }, []);
        const th = r.laCapacidadDelPlan(humano, [{ id: "z", nombre: "Asistencia humana 8 horas", descripcion: "", categoria: "capacidad", activa: true, tutorial: null }]);
        assert.deepEqual(th.map((x) => x.valor), ["0", "A la medida", "IA + humana"]);
        assert.equal(th[2].detalle, "Asistencia humana 8 horas", "la función de capacidad del plan dice el detalle");
        assert.equal(r.laCapacidadDelPlan(r.losDatosDelPlan({ plan: "lite", credits: 1, priceUSD: 1 }, []), [])[1].valor, "No incluido");
    });

    test("las funciones por categoría: en el orden de las categorías, sin las de capacidad ni las apagadas ni las viejas", () => {
        const f = r.comoFunciones([
            { id: "1", nombre: "Chats", categoria: "bandeja", tutorial: "chats" },
            { id: "2", nombre: "8.000 créditos de IA", categoria: "capacidad" },
            { id: "3", nombre: "Google Sheets", categoria: "integraciones", tutorial: "https://youtu.be/abc" },
            { id: "4", nombre: "Reportes", categoria: "panel", activa: false },
            { id: "5", nombre: "Hasta 12.000 créditos de IA", categoria: "general" },
            { id: "6", nombre: "Soporte", categoria: "general", tutorial: "un-modulo-que-no-existe" },
        ]);
        const g = r.lasFuncionesPorCategoria(f, DATOS, GUIAS);
        const orden = r.CATEGORIAS_DEL_PLAN.map((c) => c.slug);
        assert.deepEqual(g.map((x) => x.slug), ["bandeja", "integraciones", "general"].sort((a, b) => orden.indexOf(a) - orden.indexOf(b)));
        assert.deepEqual(g.flatMap((x) => x.funciones.map((y) => y.id)).sort(), ["1", "3", "6"]);
        assert.deepEqual(g.find((x) => x.slug === "bandeja").funciones[0].tutorial, { url: "/guia/chats", titulo: GUIAS.get("chats"), externo: false });
        assert.equal(g.find((x) => x.slug === "integraciones").funciones[0].tutorial.externo, true);
        assert.equal(g.find((x) => x.slug === "general").funciones[0].tutorial, null, "un módulo que no está publicado no da enlace");
    });

    test("el video: el enlace que se pega se convierte en el de insertar; lo que no sirve, nada", () => {
        assert.deepEqual(r.elVideoDelPlan("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=XYZ&t=1m30s"), { tipo: "iframe", url: "https://www.youtube.com/embed/dQw4w9WgXcQ?start=90" });
        assert.deepEqual(r.elVideoDelPlan("https://youtu.be/dQw4w9WgXcQ?si=abc"), { tipo: "iframe", url: "https://www.youtube.com/embed/dQw4w9WgXcQ" });
        assert.deepEqual(r.elVideoDelPlan("https://www.youtube.com/shorts/dQw4w9WgXcQ"), { tipo: "iframe", url: "https://www.youtube.com/embed/dQw4w9WgXcQ" });
        assert.deepEqual(r.elVideoDelPlan("https://vimeo.com/123456"), { tipo: "iframe", url: "https://player.vimeo.com/video/123456" });
        assert.deepEqual(r.elVideoDelPlan("/videos/plan.mp4"), { tipo: "archivo", url: "/videos/plan.mp4" });
        assert.equal(r.elVideoDelPlan("http://youtube.com/watch?v=dQw4w9WgXcQ"), null, "sin https no");
        assert.equal(r.elVideoDelPlan("//evil.test/x.mp4"), null);
        assert.equal(r.elVideoDelPlan("javascript:alert(1)"), null);
        assert.equal(r.elVideoDelPlan(""), null);
    });

    test("los botones: el registro con el plan, WhatsApp si es a consultar, y nunca un javascript:", () => {
        assert.equal(r.comoEnlaceDelBoton("javascript:alert(1)"), null);
        assert.equal(r.comoEnlaceDelBoton("//evil.test"), null);
        const b = r.losBotonesDelPlan(null, DATOS, {});
        assert.deepEqual(b.principal, { texto: "Comenzar ahora", url: "/register?plan=intermedio&a=IA", externo: false });
        assert.equal(b.secundario, null);
        const consulta = r.losDatosDelPlan({ plan: "personalizado", name: "Agencias", credits: 0, priceUSD: 0 }, []);
        const w = r.losBotonesDelPlan({ meetingUrl: "https://cal.test/demo" }, consulta, { whatsappNumber: "+57 300 111 2233" });
        assert.equal(w.principal.texto, "Contactar");
        assert.ok(w.principal.url.startsWith("https://wa.me/573001112233?text="));
        assert.ok(decodeURIComponent(w.principal.url).includes("plan Agencias"));
        assert.deepEqual(w.secundario, { texto: "Agendar una demo", url: "https://cal.test/demo", externo: true });
        assert.deepEqual(r.elPrecioQueSeEnsena(consulta), { texto: "A consultar", aConsultar: true });
        assert.deepEqual(r.elPrecioQueSeEnsena(DATOS), { texto: "$49", aConsultar: false });
    });

    test("qué plan se enseña: el del tipo pedido si está activo; si no, el otro; apagados, ninguno", () => {
        const planes = [
            { plan: "intermedio", assistanceType: "IA", isActive: false, id: "ia" },
            { plan: "intermedio", assistanceType: "HUMANO", isActive: true, id: "hu" },
        ];
        assert.equal(r.elPlanQueSeEnsena(planes, "intermedio", "IA").id, "hu");
        assert.equal(r.elPlanQueSeEnsena(planes.map((p) => ({ ...p, isActive: false })), "intermedio", "IA"), null);
    });

    test("barrido: la página pública es pública, en su orden, y sin testimonios ni marketing genérico", () => {
        assert.ok(crudo("middleware.ts").includes('"/planes/"'), "/planes/ tiene que estar entre las rutas sin sesión");
        const c = crudo(COMPONENTE);
        for (const fuera of ["testimonial", "Testimonio", "galleryImages", "featureSections", "Lo que dicen", "stats"]) {
            assert.equal(c.includes(fuera), false, `la página no puede pintar «${fuera}»`);
        }
        const secciones = [...c.matchAll(/data-seccion="([a-z]+)"/g)].map((x) => x[1]);
        assert.deepEqual(secciones, ["hero", "capacidad", "funciones", "preguntas"]);
        const pagina = crudo(PAGINA);
        assert.ok(pagina.includes("laPaginaDelPlan"));
        assert.equal(pagina.includes("PLAN_LABELS") || pagina.includes("getPlanDetailBySlug"), false);
        assert.ok(crudo("app/(root)/(protected)/admin/planes/_components/PlanesMain.tsx").includes("FuncionesDelPlanEditor"));
        assert.ok(crudo("lib/plan-funciones-db.ts").includes('CREATE TABLE IF NOT EXISTS "plan_funciones"'));
        assert.ok(crudo("actions/plan-detail-actions.ts").includes("CAMPOS_DE_TEXTO"), "el detalle se guarda campo a campo");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Las acciones contra Postgres: el panel guarda y la página lo refleja
    // ─────────────────────────────────────────────────────────────────────────

    let m = null;
    if (hayBase) m = await import(join(COMPILADO, "entrada-de-pagina-de-plan.js"));
    let paginaParaPintar = null;

    const FUNCIONES = () => [
        { id: "chats", nombre: "Chats", descripcion: "Todas tus conversaciones en una bandeja", categoria: "bandeja", tutorial: "chats", activa: true },
        { id: "sheets", nombre: "Google Sheets", descripcion: "Tu agente lee tu hoja", categoria: "integraciones", tutorial: "google-sheets", activa: true },
        { id: "reportes", nombre: "Reportes semanales", descripcion: "", categoria: "panel", tutorial: null, activa: false },
        { id: "creditos", nombre: "8.000 créditos de IA", descripcion: "", categoria: "capacidad", tutorial: null, activa: true },
        { id: "soporte", nombre: "Soporte prioritario", descripcion: "Te atendemos primero", categoria: "general", tutorial: "https://ayuda.test/soporte", activa: true },
    ];
    const guardar = (funciones, extra = {}) =>
        m.upsertSubscriptionPlan({ plan: "intermedio", assistanceType: "IA", priceUSD: 49, credits: 8000, name: "Starter", features: [], funciones, ...extra });
    const nombres = (p) => p.grupos.flatMap((g) => g.funciones.map((f) => f.nombre));
    let planId = null;

    conBase("siembra de las cuentas", async () => {
        await sembrarLasCuentas(m.db);
    });

    conBase("el panel guarda el plan con sus funciones; features son las encendidas, en su orden", async () => {
        m.ponerAQuienMira(CASA);
        const g = await guardar(FUNCIONES());
        assert.equal(g.success, true, g.message);
        const plan = await m.db.subscriptionPlan.findFirst({ where: { plan: "intermedio", assistanceType: "IA" } });
        planId = plan.id;
        assert.deepEqual(plan.features, ["Chats", "Google Sheets", "8.000 créditos de IA", "Soporte prioritario"]);
        const guardadas = await m.lasFuncionesGuardadas([planId]);
        assert.equal(guardadas.get(planId).length, 5, "la apagada se guarda también");
    });

    conBase("la página: nombre del panel, capacidad viva y funciones por categoría con su tutorial", async () => {
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.equal(p.nombre, "Starter");
        assert.deepEqual(p.capacidad.map((t) => t.valor), ["8.000", "Hasta 25", "IA 24/7"]);
        assert.deepEqual(nombres(p), ["Chats", "Google Sheets", "Soporte prioritario"], "ni la apagada ni la de capacidad");
        const chats = p.grupos.find((g) => g.slug === "bandeja").funciones[0];
        assert.equal(chats.tutorial.url, "/guia/chats");
        assert.equal(chats.descripcion, "Todas tus conversaciones en una bandeja");
        const soporte = p.grupos.find((g) => g.slug === "general").funciones[0];
        assert.deepEqual(soporte.tutorial, { url: "https://ayuda.test/soporte", titulo: "Ver tutorial", externo: true });
        assert.deepEqual(p.botones.principal.url, "/register?plan=intermedio&a=IA");
        assert.equal(p.otroTipo, null);
    });

    conBase("en vivo: apagar, renombrar, encender y editar una función se ven al volver a abrir", async () => {
        m.ponerAQuienMira(CASA);
        const f = FUNCIONES();
        f[0].nombre = "Chats en vivo";
        f[1].activa = false;
        f[2].activa = true;
        assert.equal((await guardar(f)).success, true);
        let p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.deepEqual(nombres(p), ["Reportes semanales", "Chats en vivo", "Soporte prioritario"], "por categoría, en el orden del menú: Panel antes que Bandeja");
        assert.equal(JSON.stringify(p).includes("Google Sheets"), false, "la apagada no sale por ningún lado");
        f[1].activa = true;
        f[1].descripcion = "Ahora también escribe en tu hoja";
        await guardar(f);
        p = await m.laPaginaDelPlan("intermedio", "IA");
        const sheets = p.grupos.find((g) => g.slug === "integraciones").funciones[0];
        assert.equal(sheets.descripcion, "Ahora también escribe en tu hoja");
        assert.equal(sheets.tutorial.url, "/guia/google-sheets");
    });

    conBase("en vivo también si features cambia por otro camino: la nueva se deduce y la quitada se va", async () => {
        await m.db.subscriptionPlan.update({ where: { id: planId }, data: { features: ["Chats en vivo", "Tareas del equipo"] } });
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.deepEqual(nombres(p), ["Chats en vivo", "Tareas del equipo"]);
        const tareas = p.grupos.find((g) => g.slug === "herramientas").funciones[0];
        assert.equal(tareas.tutorial.url, "/guia/tareas");
        assert.equal(p.grupos.find((g) => g.slug === "bandeja").funciones[0].descripcion, "Todas tus conversaciones en una bandeja", "la renombrada por otro camino conserva su descripción");
        // Se vuelve a dejar como estaba, por el panel.
        m.ponerAQuienMira(CASA);
        await guardar(FUNCIONES());
    });

    conBase("el detalle: video convertido, preguntas solo del plan y con los datos vivos", async () => {
        m.ponerAQuienMira(CASA);
        const d = await m.upsertPlanDetail(planId, {
            videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90",
            faqs: [
                { question: "¿Cuántos créditos trae?", answer: "Trae 12.000 créditos de IA al mes." },
                { question: "¿Cuántos créditos trae el plan {plan}?", answer: "Trae {creditos} créditos de IA cada mes." },
                { question: "¿Qué incluye el Plan Intermedio?", answer: "Lo de antes." },
            ],
        });
        assert.equal(d.success, true, d.message);
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.deepEqual(p.video, { tipo: "iframe", url: "https://www.youtube.com/embed/dQw4w9WgXcQ?start=90", titulo: "Así funciona el plan Starter", miniatura: null });
        assert.deepEqual(p.preguntas, [{ question: "¿Cuántos créditos trae el plan Starter?", answer: "Trae 8.000 créditos de IA cada mes." }]);
    });

    conBase("guardar el detalle a medias NO borra lo que no llega, y los testimonios no salen en la página", async () => {
        await m.db.planDetail.update({
            where: { subscriptionPlanId: planId },
            data: { testimonials: [{ name: "Ana", role: "Dueña", company: "Tienda", text: "Excelente servicio", rating: 5 }] },
        });
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertPlanDetail(planId, { videoTitle: "Mira el plan {plan} por dentro" })).success, true);
        const fila = await m.db.planDetail.findUnique({ where: { subscriptionPlanId: planId } });
        assert.equal(fila.testimonials.length, 1, "los testimonios guardados se quedan en la base");
        assert.equal(fila.faqs.length, 3, "las preguntas también");
        assert.equal(fila.videoUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90");
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.equal(p.video.titulo, "Mira el plan Starter por dentro");
        assert.equal(JSON.stringify(p).includes("Excelente servicio"), false, "pero la página no los enseña");
        paginaParaPintar = p;
    });

    conBase("cambiar los créditos en el panel cambia la página: la capacidad y la pregunta que antes no cuadraba", async () => {
        m.ponerAQuienMira(CASA);
        await guardar(FUNCIONES(), { credits: 12000 });
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.equal(p.capacidad[0].valor, "12.000");
        assert.deepEqual(p.preguntas.map((q) => q.answer), ["Trae 12.000 créditos de IA al mes.", "Trae 12.000 créditos de IA cada mes."]);
        await guardar(FUNCIONES());
    });

    conBase("un plan apagado no se enseña: se cae al otro tipo, y sin ninguno, la página no existe", async () => {
        m.ponerAQuienMira(CASA);
        const h = await m.upsertSubscriptionPlan({
            plan: "intermedio", assistanceType: "HUMANO", priceUSD: 99, credits: 8000, name: "Starter", features: [],
            funciones: [{ id: "x", nombre: "Asistencia humana en horario laboral", categoria: "capacidad", activa: true }],
        });
        assert.equal(h.success, true, h.message);
        assert.equal((await m.laPaginaDelPlan("intermedio", "IA")).otroTipo, "HUMANO");
        assert.equal((await m.toggleSubscriptionPlanActive(planId, false)).success, true);
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.equal(p.tipo, "HUMANO");
        assert.equal(p.capacidad[2].valor, "IA + humana");
        assert.equal(p.capacidad[2].detalle, "Asistencia humana en horario laboral");
        const humano = await m.db.subscriptionPlan.findFirst({ where: { plan: "intermedio", assistanceType: "HUMANO" } });
        await m.toggleSubscriptionPlanActive(humano.id, false);
        assert.equal(await m.laPaginaDelPlan("intermedio", "IA"), null);
        await m.toggleSubscriptionPlanActive(planId, true);
        assert.equal((await m.laPaginaDelPlan("intermedio", "IA")).tipo, "IA");
    });

    conBase("un plan de reseller y un nivel que no existe no tienen página", async () => {
        await m.db.subscriptionPlan.create({ data: { plan: "avanzado", assistanceType: "IA", isResellerPlan: true, priceUSD: 10, credits: 100, features: ["Algo"], isActive: true } });
        assert.equal(await m.laPaginaDelPlan("avanzado", "IA"), null);
        assert.equal(await m.laPaginaDelPlan("no-existe", "IA"), null);
    });

    conBase("solo la casa guarda: un cliente recibe «No autorizado» y no cambia nada", async () => {
        m.ponerAQuienMira(CLIENTE);
        assert.equal((await guardar([{ nombre: "Robada", activa: true }], { credits: 1 })).message, "No autorizado");
        assert.equal((await m.upsertPlanDetail(planId, { videoUrl: "https://evil.test/x" })).message, "No autorizado");
        const plan = await m.db.subscriptionPlan.findUnique({ where: { id: planId } });
        assert.equal(plan.credits, 8000);
        assert.ok(!plan.features.includes("Robada"));
        m.ponerAQuienMira(null);
        assert.equal((await m.toggleSubscriptionPlanActive(planId, false)).success, false);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. La pantalla real en Chromium
    // ─────────────────────────────────────────────────────────────────────────

    const HARNESS = join(COMPILADO, "harness.js");
    const hayNavegador = chromium && fs.existsSync(HARNESS) && fs.existsSync(cssDir);
    const conNavegador = hayNavegador && hayBase ? test : test.skip;

    conNavegador("la página en su orden: hero con video, capacidad, funciones con tutorial y preguntas; sin testimonios", async () => {
        assert.ok(paginaParaPintar, "la prueba de Postgres no dejó la página armada");
        await abrir(HARNESS, { __pagina: paginaParaPintar }, async (pag, w, errores) => {
            const secciones = await pag.$$eval("[data-seccion]", (n) => n.map((x) => x.getAttribute("data-seccion")));
            assert.deepEqual(secciones, ["hero", "capacidad", "funciones", "preguntas"], `${w}: el orden pedido`);
            const ys = await pag.$$eval("[data-seccion]", (n) => n.map((x) => x.getBoundingClientRect().top));
            assert.ok(ys.every((y, i) => i === 0 || y > ys[i - 1]), `${w}: y en ese orden en la pantalla`);
            assert.equal(await pag.locator('[data-seccion="hero"] [data-video="iframe"] iframe').getAttribute("src"), "https://www.youtube.com/embed/dQw4w9WgXcQ?start=90");
            assert.equal(await pag.locator("[data-nombre-del-plan]").innerText(), "Starter");
            assert.equal(await pag.locator("[data-capacidad]").count(), 3);
            assert.ok((await pag.locator('[data-capacidad="creditos"]').innerText()).includes("8.000"));
            assert.equal(await pag.locator("[data-funcion]").count(), 3, `${w}: Chats, Google Sheets y Soporte (Reportes está apagada)`);
            assert.equal(await pag.locator('a[data-tutorial="/guia/chats"]').count(), 1, `${w}: Chats lleva su tutorial`);
            const externo = pag.locator('a[data-tutorial="https://ayuda.test/soporte"]');
            assert.equal(await externo.getAttribute("target"), "_blank");
            assert.ok((await externo.getAttribute("rel")).includes("noopener"));
            assert.equal(await pag.locator("[data-pregunta]").count(), 1);
            const texto = await pag.evaluate(() => document.body.innerText);
            for (const fuera of ["Lo que dicen", "Excelente servicio", "Capturas del panel", "12.000 créditos", "Plan Intermedio", "8.000 créditos de IA"]) {
                assert.equal(texto.includes(fuera), false, `${w}: «${fuera}» no puede salir`);
            }
            const ancho = await pag.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth }));
            assert.ok(ancho.doc <= ancho.vw, `${w}: no se desplaza a lo ancho (${JSON.stringify(ancho)})`);
            assert.deepEqual(errores, [], `${w}: sin errores`);
        });
    });
}
