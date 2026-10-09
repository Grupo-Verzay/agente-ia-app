/**
 * «Todo incluido, sin sorpresas» en la página de cada plan:
 *
 * 1. **Un bloque nuevo, editable POR PLAN** en el panel (Planes › Página de
 *    detalle): un título —de fábrica «Todo incluido, sin sorpresas»— y un
 *    texto libre con lo que el plan trae sin costo adicional. Aparte de «Qué
 *    incluye este plan», que lista las funciones.
 * 2. **Sale entero y a la vista**, sin desplegar nada, DESPUÉS de «Preguntas
 *    frecuentes» y ANTES del precio con «Comenzar con el plan». Un orden ya
 *    guardado (de seis bloques) lo recibe en ese sitio, sin tocarlo.
 *    **En tarjetas**: una por línea, con el aspecto de los recuadros de
 *    capacidad; dos columnas en computador y tablet, una en el móvil.
 * 3. **Una propuesta que carga el plan lo hereda**: en el alcance de la fila
 *    que se copia y en la página pública de la propuesta, leído en vivo.
 *
 * `MODO=roto` lee el código de ANTES_REF —pinchado a un commit, nunca
 * `origin/main`— y AFIRMA que nada de esto existía; y el de
 * ANTES_TARJETAS_REF, y AFIRMA que el texto salía en una sola caja.
 *
 * Se levanta con `scripts/banco-plan-todo-incluido.sh`.
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
const COMPILADO = join(AQUI, ".compilado", "plan-todo-incluido");
const ANTES = process.env.ANTES_REF ?? "8302e3e";
// El último commit en que el texto salía en UNA caja, sin tarjetas.
const ANTES_TARJETAS = process.env.ANTES_TARJETAS_REF ?? "7343076";

const PAGINA = "app/(public)/planes/[slug]/_components/PlanDetailPage.tsx";
const PANEL = "app/(root)/(protected)/admin/planes/_components/PlanDetailTab.tsx";
const REGLA = "lib/pagina-de-plan.ts";
const SERVIDOR = "lib/pagina-de-plan.server.ts";
const TABLA = "lib/plan-todo-incluido-db.ts";
const ACCIONES = "actions/plan-detail-actions.ts";
const PROPUESTA = "components/propuestas/PlanEnLaPropuesta.tsx";
const PROPUESTA_SERVIDOR = "lib/plan-de-la-propuesta.server.ts";

const deAntes = (f, ref = ANTES) => {
    try {
        execFileSync("git", ["cat-file", "-e", `${ref}:${f}`], { cwd: RAIZ, stdio: "ignore" });
        return execFileSync("git", ["show", `${ref}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};

const TEXTO = [
    "Instalación y configuración inicial de tu línea de WhatsApp.",
    "Capacitación de tu equipo en una sesión en vivo.",
    "Soporte por WhatsApp y todas las actualizaciones del plan {plan}.",
    "Sin pagos extra ni cobros por usuario.",
].join("\n");
const TEXTO_VIVO = TEXTO.replace("{plan}", "Starter");

if (ROTO) {
    // ─────────────────────────────────────────────────────────────────────────
    // ANTES: lo que había, afirmado
    // ─────────────────────────────────────────────────────────────────────────

    test("ANTES: la página no tenía el bloque: sus bloques eran seis y del de preguntas se pasaba al precio", () => {
        const regla = deAntes(REGLA);
        assert.ok(regla, `no se pudo leer ${ANTES}`);
        assert.ok(regla.includes(`"video" | "paraquien" | "capacidad" | "funciones" | "preguntas" | "comenzar"`), "seis bloques");
        assert.equal(/incluido"/.test(regla.slice(regla.indexOf("export type BloqueDeLaPagina"), regla.indexOf("export const ORDEN_DE_FABRICA"))), false);
        assert.equal(regla.includes("Todo incluido, sin sorpresas"), false);
        const pagina = deAntes(PAGINA);
        assert.equal(pagina.includes("data-todo-incluido"), false, "la página no lo pintaba");
        assert.equal(pagina.includes('case "incluido"'), false);
    });

    test("ANTES: no había dónde escribirlo ni dónde guardarlo", () => {
        assert.equal(deAntes(TABLA), null, "no existía plan_todo_incluido");
        assert.equal(/todoIncluido/.test(deAntes(ACCIONES)), false, "la acción no lo guardaba");
        assert.equal(/todoIncluido/.test(deAntes(SERVIDOR)), false, "la página no lo leía");
        assert.equal(deAntes(PANEL).includes("todoIncluido"), false, "el panel no tenía el campo");
    });

    test("ANTES: una propuesta que cargaba el plan no lo heredaba", () => {
        assert.equal(/todoIncluido/.test(deAntes(PROPUESTA)), false, "el plan en la propuesta no lo pintaba");
        assert.equal(/todoIncluido/.test(deAntes(PROPUESTA_SERVIDOR)), false, "ni se leía al cargar el plan");
    });

    test("ANTES: el texto salía en UNA caja con sus saltos de línea, no en tarjetas", () => {
        const pagina = deAntes(PAGINA, ANTES_TARJETAS);
        assert.ok(pagina, `no se pudo leer ${ANTES_TARJETAS}`);
        const bloque = pagina.slice(pagina.indexOf("export function BloqueTodoIncluido"), pagina.indexOf("export function RecuadrosDeCapacidad"));
        assert.ok(bloque.includes("whitespace-pre-line"), "el texto entero en un párrafo");
        assert.ok(bloque.includes("data-texto-del-todo-incluido"), "una sola caja de texto");
        assert.equal(bloque.includes("data-tarjeta-del-todo-incluido"), false, "sin tarjetas");
        assert.equal(bloque.includes("sm:grid-cols-2"), false, "sin dos columnas");
        assert.equal(deAntes(REGLA, ANTES_TARJETAS).includes("lasTarjetasDelTodoIncluido"), false, "nada partía el texto en líneas");
    });
} else {
    const r = await import(join(COMPILADO, "pagina-de-plan.js"));
    const pr = await import(join(COMPILADO, "plan-de-la-propuesta.js"));
    const DATOS = (extra = {}) => r.losDatosDelPlan({ plan: "intermedio", name: "Starter", credits: 8000, priceUSD: 49, assistanceType: "IA", ...extra }, ["Lite", "Starter", "Pro"]);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. La regla, pura
    // ─────────────────────────────────────────────────────────────────────────

    test("el bloque va después de «Preguntas frecuentes» y antes de «Comenzar», también en un orden ya guardado", () => {
        const f = r.ORDEN_DE_FABRICA;
        assert.equal(f.indexOf("incluido"), f.indexOf("preguntas") + 1);
        assert.equal(f.indexOf("comenzar"), f.indexOf("incluido") + 1);
        // Un orden guardado antes de que existiera (seis bloques) lo recibe detrás de las preguntas.
        assert.deepEqual(
            r.comoOrdenDeBloques(["video", "paraquien", "capacidad", "funciones", "preguntas", "comenzar"]),
            ["video", "paraquien", "capacidad", "funciones", "preguntas", "incluido", "comenzar"],
        );
        assert.deepEqual(
            r.comoOrdenDeBloques(["funciones", "preguntas", "comenzar", "video", "paraquien", "capacidad"]),
            ["funciones", "preguntas", "incluido", "comenzar", "video", "paraquien", "capacidad"],
        );
        const b = r.BLOQUES_DE_LA_PAGINA.find((x) => x.clave === "incluido");
        assert.equal(b.nombre, "Todo incluido, sin sorpresas");
    });

    test("sin texto no sale; el título vacío es el de fábrica; los datos vivos se cambian", () => {
        assert.equal(r.elTodoIncluidoQueSale(null, DATOS()), null);
        assert.equal(r.elTodoIncluidoQueSale({ titulo: "Sin costo extra", texto: "   " }, DATOS()), null, "el título solo no dice nada");
        assert.deepEqual(r.elTodoIncluidoQueSale({ titulo: "", texto: TEXTO }, DATOS()), { titulo: "Todo incluido, sin sorpresas", texto: TEXTO_VIVO });
        assert.deepEqual(
            r.elTodoIncluidoQueSale({ titulo: "Lo que el plan {plan} trae gratis", texto: "Incluye {creditos} créditos." }, DATOS()),
            { titulo: "Lo que el plan Starter trae gratis", texto: "Incluye 8.000 créditos." },
        );
    });

    test("el texto conserva sus saltos de línea, sin espacios ni líneas vacías de más, y topado", () => {
        const g = r.comoTodoIncluido({ titulo: "  Todo   incluido  ", texto: "  Uno  \r\n\r\n\r\n\r\n   Dos\t\t y tres  " });
        assert.deepEqual(g, { titulo: "Todo incluido", texto: "Uno\n\nDos y tres" });
        assert.equal(r.comoTodoIncluido({ texto: "x".repeat(9000) }).texto.length, r.TOPE_DEL_TEXTO_DEL_TODO_INCLUIDO);
        assert.equal(r.comoTodoIncluido({ titulo: "x".repeat(900) }).titulo.length, r.TOPE_DEL_TITULO_DEL_TODO_INCLUIDO);
        assert.deepEqual(r.comoTodoIncluido("basura"), { titulo: "", texto: "" });
    });

    test("el texto se parte en tarjetas, una por línea: sin líneas vacías ni viñetas", () => {
        assert.deepEqual(r.lasTarjetasDelTodoIncluido(TEXTO_VIVO), [
            "Instalación y configuración inicial de tu línea de WhatsApp.",
            "Capacitación de tu equipo en una sesión en vivo.",
            "Soporte por WhatsApp y todas las actualizaciones del plan Starter.",
            "Sin pagos extra ni cobros por usuario.",
        ]);
        assert.deepEqual(r.lasTarjetasDelTodoIncluido("- Uno\n\n• Dos\r\n  ✓ Tres\n*  Cuatro\n-\n–"), ["Uno", "Dos", "Tres", "Cuatro"]);
        assert.deepEqual(r.lasTarjetasDelTodoIncluido("Un guion-medio y *énfasis* se quedan"), ["Un guion-medio y *énfasis* se quedan"]);
        assert.deepEqual(r.lasTarjetasDelTodoIncluido(""), []);
        // Solo viñetas: nada que pintar, y entonces el bloque no sale.
        assert.equal(r.elTodoIncluidoQueSale({ titulo: "", texto: "-\n•\n✓" }, DATOS()), null);
        assert.deepEqual(r.elTodoIncluidoQueSale({ titulo: "", texto: "- Soporte incluido." }, DATOS()), { titulo: "Todo incluido, sin sorpresas", texto: "- Soporte incluido." });
    });

    test("lo que contradice al plan no sale y el panel dice por qué", () => {
        // Un texto con otros créditos está viejo: no sale.
        assert.equal(r.elTodoIncluidoQueSale({ texto: "Trae 12.000 créditos de IA." }, DATOS()), null);
        assert.ok(r.losAvisosDelTodoIncluido({ texto: "Trae 12.000 créditos de IA." }, DATOS()).texto[0].includes("12.000"));
        // Un título que nombra otro plan sale como el de fábrica; el texto sigue.
        const s = r.elTodoIncluidoQueSale({ titulo: "Todo lo del plan Pro", texto: "Soporte incluido." }, DATOS());
        assert.deepEqual(s, { titulo: "Todo incluido, sin sorpresas", texto: "Soporte incluido." });
        assert.ok(r.losAvisosDelTodoIncluido({ titulo: "Todo lo del plan Pro" }, DATOS()).titulo.length > 0);
        // El texto largo SÍ puede comparar con otro plan: no se le exige como a un botón.
        assert.ok(r.elTodoIncluidoQueSale({ texto: "Lo mismo que Pro en soporte." }, DATOS()));
    });

    test("el alcance de la fila que carga el plan termina con el bloque, y una lista larga de funciones no lo deja fuera", () => {
        const base = { capacidad: [{ titulo: "Créditos de IA", valor: "8.000" }], funciones: ["Chats", "CRM"] };
        const sin = pr.elAlcanceDelPlan(base, 3000);
        assert.equal(pr.elAlcanceDelPlan({ ...base, todoIncluido: null }, 3000), sin, "sin bloque, lo de siempre");
        const con = pr.elAlcanceDelPlan({ ...base, todoIncluido: { titulo: "Todo incluido, sin sorpresas", texto: TEXTO_VIVO } }, 3000);
        assert.equal(con, `${sin}\n\nTodo incluido, sin sorpresas:\n${TEXTO_VIVO}`);
        const muchas = { ...base, funciones: Array.from({ length: 400 }, (_, i) => `Función número ${i + 1}`) };
        const largo = pr.elAlcanceDelPlan({ ...muchas, todoIncluido: { titulo: "Todo incluido, sin sorpresas", texto: TEXTO_VIVO } }, 3000);
        assert.ok(largo.length <= 3000, `${largo.length}`);
        assert.ok(largo.endsWith(TEXTO_VIVO), "el bloque entra entero");
        assert.ok(/…y \d+ más/.test(largo), "lo que no cabe de las funciones se dice");
        const corto = pr.elAlcanceDelPlan({ ...base, todoIncluido: { titulo: "T", texto: "palabra ".repeat(800) } }, 3000);
        assert.ok(corto.length <= 3000 && corto.endsWith("…"), "un texto que no cabe se corta en una palabra y lo dice");
        assert.ok(corto.startsWith(sin), "las funciones siguen");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Las acciones contra Postgres
    // ─────────────────────────────────────────────────────────────────────────

    const hayBase = Boolean(process.env.DATABASE_URL);
    const conBase = hayBase ? test : test.skip;
    const sello = Date.now().toString(36);
    const CASA = { id: `ti-casa-${sello}`, effectiveId: `ti-casa-${sello}`, sessionUserId: `ti-casa-${sello}`, ownerId: null, advisorRole: null, role: "admin", rolDeLaPersona: "admin", porImpersonacion: false, email: `ti-casa-${sello}@banco.test`, name: "Casa" };
    const CLIENTE = { id: `ti-cli-${sello}`, effectiveId: `ti-cli-${sello}`, sessionUserId: `ti-cli-${sello}`, ownerId: null, advisorRole: null, role: "user", rolDeLaPersona: "user", porImpersonacion: false, email: `ti-cli-${sello}@banco.test`, name: "Cliente" };
    const INTERMEDIO = { plan: "intermedio", assistanceType: "IA", priceUSD: 49, credits: 8000, name: "Starter", features: ["Chats", "CRM y embudos"] };
    const LITE = { plan: "lite", assistanceType: "IA", priceUSD: 19, credits: 2000, name: "Lite", features: ["Chats"] };
    const REF = { nivel: "intermedio", asistencia: "IA" };

    let m = null;
    if (hayBase) m = await import(join(COMPILADO, "entrada-de-todo-incluido.js"));
    let planId = null;
    let liteId = null;
    let paginaConBloque = null;
    let planDeLaPropuesta = null;
    const filas = async () => m.db.$queryRawUnsafe(`SELECT "subscriptionPlanId", "titulo", "texto" FROM "plan_todo_incluido"`);

    conBase("siembra", async () => {
        await m.db.planDetail.deleteMany({});
        await m.db.subscriptionPlan.deleteMany({});
        for (const t of ["plan_funciones", "plan_funciones_maestras", "plan_para_quien", "plan_pagina", "plan_todo_incluido"]) {
            await m.db.$executeRawUnsafe(`DELETE FROM "${t}"`).catch(() => {});
        }
        for (const u of [CASA, CLIENTE]) await m.db.user.create({ data: { id: u.id, email: u.email, name: u.name, role: u.role } });
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertSubscriptionPlan(INTERMEDIO)).success, true);
        assert.equal((await m.upsertSubscriptionPlan(LITE)).success, true);
        planId = (await m.db.subscriptionPlan.findFirst({ where: { plan: "intermedio" } })).id;
        liteId = (await m.db.subscriptionPlan.findFirst({ where: { plan: "lite" } })).id;
    });

    conBase("sin escribir nada, la página no lo enseña pero el orden ya le guarda su sitio", async () => {
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.equal(p.todoIncluido, null);
        assert.equal(p.orden.indexOf("incluido"), p.orden.indexOf("preguntas") + 1);
        const d = await m.getPlanDetailBySubscriptionPlanId(planId);
        assert.equal(d.todoIncluido, null);
    });

    conBase("el panel lo guarda POR PLAN, y la página lo lee en vivo", async () => {
        m.ponerAQuienMira(CASA);
        const g = await m.upsertPlanDetail(planId, {
            todoIncluidoTitulo: "",
            todoIncluidoTexto: TEXTO,
            faqs: [{ question: "¿Puedo cambiar de plan?", answer: "Sí, cuando quieras." }],
        });
        assert.equal(g.success, true, g.message);
        const d = await m.getPlanDetailBySubscriptionPlanId(planId);
        assert.deepEqual(d.todoIncluido, { titulo: "", texto: TEXTO }, "se guarda con su llave");
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.deepEqual(p.todoIncluido, { titulo: "Todo incluido, sin sorpresas", texto: TEXTO_VIVO });
        assert.equal((await m.laPaginaDelPlan("lite", "IA")).todoIncluido, null, "el otro plan no lo hereda");
        assert.equal((await filas()).length, 1);
        paginaConBloque = p;
    });

    conBase("un título propio, y otro plan con el suyo, independientes", async () => {
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertPlanDetail(liteId, { todoIncluidoTitulo: "Sin letra pequeña", todoIncluidoTexto: "Soporte por correo." })).success, true);
        const lite = await m.laPaginaDelPlan("lite", "IA");
        assert.deepEqual(lite.todoIncluido, { titulo: "Sin letra pequeña", texto: "Soporte por correo." });
        assert.deepEqual((await m.laPaginaDelPlan("intermedio", "IA")).todoIncluido.texto, TEXTO_VIVO, "el primero sigue igual");
    });

    conBase("guardar otra cosa (el video, el orden) no lo borra", async () => {
        m.ponerAQuienMira(CASA);
        await m.upsertPlanDetail(planId, { videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
        await m.upsertPlanDetail(planId, { orden: ["comenzar", "video"] });
        const p = await m.laPaginaDelPlan("intermedio", "IA");
        assert.equal(p.todoIncluido.texto, TEXTO_VIVO);
        await m.upsertPlanDetail(planId, { orden: [...r.ORDEN_DE_FABRICA], videoUrl: "" });
    });

    conBase("un cliente no lo escribe", async () => {
        m.ponerAQuienMira(CLIENTE);
        assert.equal((await m.upsertPlanDetail(planId, { todoIncluidoTexto: "Robado" })).message, "No autorizado");
        m.ponerAQuienMira(CASA);
        assert.equal((await m.laPaginaDelPlan("intermedio", "IA")).todoIncluido.texto, TEXTO_VIVO);
    });

    conBase("una propuesta que carga la plantilla del plan lo hereda: en el alcance y en su página pública", async () => {
        const cargado = await m.elPlanParaCargar(REF, "https://app.test");
        assert.deepEqual(cargado.todoIncluido, { titulo: "Todo incluido, sin sorpresas", texto: TEXTO_VIVO });
        const fila = m.laFilaDelPlan(cargado, "USD", m.TOPE_DE_ALCANCE);
        assert.ok(fila.alcance.endsWith(`Todo incluido, sin sorpresas:\n${TEXTO_VIVO}`), fila.alcance);
        assert.ok(fila.alcance.includes("Qué incluye este plan:"), "junto con lo demás del plan");
        const [enLaPropuesta] = await m.losPlanesDeLaPropuesta([REF], "https://app.test");
        assert.deepEqual(enLaPropuesta.todoIncluido, { titulo: "Todo incluido, sin sorpresas", texto: TEXTO_VIVO });
        planDeLaPropuesta = enLaPropuesta;
    });

    conBase("vaciar los dos campos lo quita de la página y de la base", async () => {
        m.ponerAQuienMira(CASA);
        await m.upsertPlanDetail(liteId, { todoIncluidoTitulo: "", todoIncluidoTexto: "" });
        assert.equal((await m.laPaginaDelPlan("lite", "IA")).todoIncluido, null);
        assert.deepEqual((await filas()).map((f) => f.subscriptionPlanId), [planId]);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. La pantalla real en Chromium
    // ─────────────────────────────────────────────────────────────────────────

    const HARNESS = join(COMPILADO, "harness.js");
    const cssDir = join(RAIZ, ".next", "static", "css");
    const conNavegador = chromium && fs.existsSync(HARNESS) && fs.existsSync(cssDir) && hayBase ? test : test.skip;

    async function abrir(datos, pintar, tamanos = [[1440, 900], [390, 844]]) {
        const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
        const js = fs.readFileSync(HARNESS, "utf8");
        const json = JSON.stringify(datos).replace(/</g, "\\u003c");
        const html =
            `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>` +
            `<body><div id="app"></div><script>window.process=window.process||{env:{}};Object.assign(window, ${json});</script>` +
            `<script>${js}</script></body></html>`;
        const srv = http.createServer((_q, res) => { res.setHeader("content-type", "text/html"); res.end(html); });
        await new Promise((ok) => srv.listen(0, ok));
        const url = `http://127.0.0.1:${srv.address().port}/`;
        const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
        try {
            for (const [w, h] of tamanos) {
                const pag = await nav.newPage({ viewport: { width: w, height: h } });
                await pag.route(/^https?:\/\/(?!127\.0\.0\.1)/, (q) => q.abort());
                const errores = [];
                pag.on("pageerror", (e) => errores.push(String(e)));
                await pag.goto(url);
                await pag.waitForFunction(() => window.listo === true);
                await pag.waitForTimeout(250);
                await pintar(pag, w, errores);
                assert.deepEqual(errores, [], `${w}: sin errores`);
                await pag.close();
            }
        } finally {
            await nav.close();
            srv.close();
        }
    }

    // Lo que se mide de una tarjeta, para compararla con los recuadros de capacidad.
    const ASPECTO = (n) => {
        const c = getComputedStyle(n);
        return {
            borde: `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`,
            fondo: c.backgroundColor,
            radio: c.borderTopLeftRadius,
            relleno: `${c.paddingTop} ${c.paddingRight} ${c.paddingBottom} ${c.paddingLeft}`,
        };
    };

    // Las cajas de las tarjetas: cuántas columnas y filas distintas ocupan.
    const REJILLA = (cuadros) => {
        const lefts = new Set(cuadros.map((c) => Math.round(c.x)));
        const tops = new Set(cuadros.map((c) => Math.round(c.y)));
        return { columnas: lefts.size, filas: tops.size };
    };

    const TAMANOS = [[1440, 900], [1024, 768], [768, 1024], [390, 844]];

    conNavegador("la página: el bloque entre las preguntas y el precio, en tarjetas a la vista sin pulsar nada", async () => {
        assert.ok(paginaConBloque, "la prueba de Postgres no dejó la página armada");
        await abrir({ __que: "pagina", __pagina: paginaConBloque }, async (pag, w) => {
            const secciones = await pag.$$eval("[data-seccion]", (n) => n.map((x) => x.getAttribute("data-seccion")));
            assert.equal(secciones.indexOf("incluido"), secciones.indexOf("preguntas") + 1, `${w}: ${secciones}`);
            assert.equal(secciones.indexOf("comenzar"), secciones.indexOf("incluido") + 1, `${w}: ${secciones}`);
            const bloque = pag.locator('[data-seccion="incluido"]');
            assert.equal(await bloque.locator("[data-titulo-del-todo-incluido]").innerText(), "Todo incluido, sin sorpresas");
            // Una tarjeta por línea, en su orden, y ya no una sola caja con todo el texto.
            const tarjetas = bloque.locator("[data-tarjeta-del-todo-incluido]");
            assert.equal(await tarjetas.count(), 4, `${w}: cuatro tarjetas`);
            assert.equal(await bloque.locator("[data-texto-del-todo-incluido]").count(), 0, `${w}: sin la caja única`);
            const textos = (await tarjetas.allInnerTexts()).map((t) => t.trim());
            assert.deepEqual(textos, TEXTO_VIVO.split("\n"), `${w}: cada línea en su tarjeta`);
            assert.equal(await bloque.locator("button, [aria-expanded]").count(), 0, `${w}: nada que desplegar`);
            // Que no estén cortadas: cada tarjeta mide lo que su contenido.
            const cortes = await tarjetas.evaluateAll((ns) => ns.map((n) => n.scrollHeight - n.clientHeight));
            assert.ok(cortes.every((c) => c <= 1), `${w}: sin recortar (${cortes})`);
            // Cuadrícula: 2 columnas por 2 filas desde la tablet; una columna y 4 filas apiladas en el móvil.
            const cajas = await tarjetas.evaluateAll((ns) => ns.map((n) => { const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }));
            const { columnas, filas } = REJILLA(cajas);
            if (w >= 768) {
                assert.deepEqual({ columnas, filas }, { columnas: 2, filas: 2 }, `${w}: dos por dos (${JSON.stringify(cajas)})`);
                assert.ok(cajas[0].y === cajas[1].y && cajas[2].y === cajas[3].y && cajas[2].y > cajas[0].y, `${w}: se leen de izquierda a derecha`);
                assert.ok(cajas[0].x < cajas[1].x && cajas[0].x === cajas[2].x, `${w}: columnas alineadas`);
                assert.ok(Math.abs(cajas[0].w - cajas[1].w) <= 1, `${w}: del mismo ancho`);
                // Las dos de una fila miden lo mismo de alto.
                assert.ok(Math.abs(cajas[0].h - cajas[1].h) <= 1 && Math.abs(cajas[2].h - cajas[3].h) <= 1, `${w}: filas parejas`);
            } else {
                assert.deepEqual({ columnas, filas }, { columnas: 1, filas: 4 }, `${w}: una debajo de otra (${JSON.stringify(cajas)})`);
                assert.ok(cajas.every((c, k) => k === 0 || c.y > cajas[k - 1].y + cajas[k - 1].h - 1), `${w}: apiladas sin montarse`);
                const margen = await pag.evaluate(() => window.innerWidth);
                assert.ok(cajas[0].w > margen - 80, `${w}: a todo el ancho del bloque (${cajas[0].w})`);
            }
            // El mismo aspecto que los recuadros de capacidad (Créditos IA, Multimedia, Agenda…).
            const recuadro = pag.locator("[data-capacidad]").first();
            assert.ok((await pag.locator("[data-capacidad]").count()) > 0, `${w}: hay recuadros con los que comparar`);
            assert.deepEqual(await tarjetas.first().evaluate(ASPECTO), await recuadro.evaluate(ASPECTO), `${w}: mismo borde, fondo, radio y relleno`);
            // Entre las preguntas y el precio, también en la pantalla.
            const yPreguntas = (await pag.locator('[data-seccion="preguntas"]').boundingBox()).y;
            const yPrecio = (await pag.locator("[data-precio-final]").boundingBox()).y;
            const y = (await bloque.boundingBox()).y;
            assert.ok(yPreguntas < y && y < yPrecio, `${w}: ${yPreguntas} < ${y} < ${yPrecio}`);
            // A la vista sobre el fondo oscuro: el texto es claro.
            const color = await tarjetas.first().locator("p").evaluate((n) => getComputedStyle(n).color);
            const [rr, gg, bb] = color.match(/\d+(\.\d+)?/g).map(Number);
            assert.ok(rr + gg + bb > 600, `${w}: el texto se lee (${color})`);
            const ancho = await pag.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            assert.ok(ancho <= 0, `${w}: sin desplazamiento a lo ancho (${ancho})`);
            await pag.screenshot({ path: join(COMPILADO, `pagina-${w}.png`), fullPage: true });
        }, TAMANOS);
    });

    conNavegador("la página: con tres líneas la última ocupa las dos columnas, con una sola va a todo el ancho, y las viñetas se quitan", async () => {
        assert.ok(paginaConBloque, "la prueba de Postgres no dejó la página armada");
        const con = (texto) => ({ __que: "pagina", __pagina: { ...paginaConBloque, todoIncluido: { titulo: "Todo incluido, sin sorpresas", texto } } });
        const medir = (pag) => pag.locator("[data-tarjeta-del-todo-incluido]").evaluateAll((ns) => ns.map((n) => { const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width }; }));
        await abrir(con("- Instalación inicial\n\n• Capacitación en vivo\n✓ Soporte por WhatsApp"), async (pag, w) => {
            const textos = (await pag.locator("[data-tarjeta-del-todo-incluido]").allInnerTexts()).map((t) => t.trim());
            assert.deepEqual(textos, ["Instalación inicial", "Capacitación en vivo", "Soporte por WhatsApp"], `${w}: sin viñetas ni líneas vacías`);
            const c = await medir(pag);
            if (w >= 768) {
                assert.equal(c[0].y, c[1].y, `${w}: las dos primeras en una fila`);
                assert.ok(c[2].y > c[0].y && Math.round(c[2].x) === Math.round(c[0].x), `${w}: la tercera debajo`);
                assert.ok(c[2].w > c[0].w * 1.9, `${w}: la tercera, a todo el ancho (${c[2].w} vs ${c[0].w})`);
            } else {
                assert.equal(REJILLA(c).columnas, 1, `${w}: una columna`);
            }
        }, TAMANOS);
        await abrir(con("Soporte incluido."), async (pag, w) => {
            const c = await medir(pag);
            assert.equal(c.length, 1);
            const bloque = await pag.locator("[data-tarjetas-del-todo-incluido]").boundingBox();
            assert.ok(Math.abs(c[0].w - bloque.width) <= 1, `${w}: una sola tarjeta ocupa el ancho del bloque (${c[0].w} de ${bloque.width})`);
        }, TAMANOS);
    });

    conNavegador("la propuesta: el plan cargado enseña las tarjetas después de «Qué incluye» y antes del precio", async () => {
        assert.ok(planDeLaPropuesta, "la prueba de Postgres no dejó el plan de la propuesta");
        await abrir({ __que: "propuesta", __planDeLaPropuesta: planDeLaPropuesta }, async (pag, w) => {
            const plan = pag.locator("[data-plan-en-la-propuesta]");
            const bloque = plan.locator("[data-todo-incluido]");
            assert.equal(await bloque.count(), 1);
            const tarjetas = bloque.locator("[data-tarjeta-del-todo-incluido]");
            assert.deepEqual((await tarjetas.allInnerTexts()).map((t) => t.trim()), TEXTO_VIVO.split("\n"), `${w}: una tarjeta por línea`);
            const cajas = await tarjetas.evaluateAll((ns) => ns.map((n) => { const b = n.getBoundingClientRect(); return { x: b.x, y: b.y }; }));
            const { columnas, filas } = REJILLA(cajas);
            assert.deepEqual({ columnas, filas }, w >= 768 ? { columnas: 2, filas: 2 } : { columnas: 1, filas: 4 }, `${w}: ${JSON.stringify(cajas)}`);
            const orden = await plan.evaluate((n) => {
                const y = (s) => n.querySelector(s)?.getBoundingClientRect().top ?? null;
                return { funciones: y("[data-que-incluye]"), incluido: y("[data-todo-incluido]"), precio: y("[data-precio-del-plan]") };
            });
            assert.ok(orden.funciones < orden.incluido && orden.incluido < orden.precio, `${w}: ${JSON.stringify(orden)}`);
            // Con el tema del dispositivo, el mismo aspecto que los recuadros de capacidad.
            if ((await plan.locator("[data-capacidad]").count()) > 0) {
                assert.deepEqual(await tarjetas.first().evaluate(ASPECTO), await plan.locator("[data-capacidad]").first().evaluate(ASPECTO), `${w}: mismo aspecto`);
            }
            const ancho = await pag.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            assert.ok(ancho <= 0, `${w}: sin desplazamiento a lo ancho (${ancho})`);
            await pag.screenshot({ path: join(COMPILADO, `propuesta-${w}.png`), fullPage: true });
        }, TAMANOS);
    });

    conNavegador("el panel: el bloque se edita en su sitio del orden y guardar manda el título y el texto", async () => {
        await abrir({ __que: "panel", todoIncluidoGuardado: { titulo: "", texto: "Soporte incluido." } }, async (pag, w) => {
            const indice = await pag.$$eval("[data-bloque-del-formulario]", (n) => n.map((x) => x.getAttribute("data-bloque-del-formulario")));
            assert.equal(indice.indexOf("incluido"), indice.indexOf("preguntas") + 1, `${w}: ${indice}`);
            assert.equal(indice.indexOf("comenzar"), indice.indexOf("incluido") + 1, `${w}: ${indice}`);
            const bloque = pag.locator('[data-bloque-del-formulario="incluido"]');
            const titulo = bloque.locator('[data-campo-del-detalle="todoIncluidoTitulo"]');
            const texto = bloque.locator('[data-campo-del-detalle="todoIncluidoTexto"]');
            assert.equal(await titulo.getAttribute("placeholder"), "Todo incluido, sin sorpresas");
            assert.equal((await texto.getAttribute("placeholder")).split("\n").length, 4, "el ejemplo enseña una línea por tarjeta");
            assert.equal(await texto.inputValue(), "Soporte incluido.", "lo guardado llega al campo");
            await titulo.fill("Sin letra pequeña");
            await texto.fill(TEXTO);
            await pag.locator("[data-guardar-detalle]").click();
            await pag.waitForFunction(() => window.pedidas.some((p) => p.accion === "guardar"));
            const enviado = await pag.evaluate(() => window.pedidas.filter((p) => p.accion === "guardar").at(-1).args[1]);
            assert.equal(enviado.todoIncluidoTitulo, "Sin letra pequeña");
            assert.equal(enviado.todoIncluidoTexto, TEXTO);
            await bloque.screenshot({ path: join(COMPILADO, `panel-${w}.png`) });
        }, [[1280, 900]]);
    });
}
