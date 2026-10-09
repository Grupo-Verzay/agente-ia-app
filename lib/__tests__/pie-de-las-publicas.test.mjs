/**
 * El pie de las tres pantallas públicas —la landing principal, la página de un
 * plan y la propuesta—, pintadas de VERDAD sobre el CSS del build:
 *
 * 1. El mismo texto en las tres: «© <año> Agente IA. Todos los derechos
 *    reservados.», con el año del sistema. La propuesta añade encima «Propuesta
 *    preparada por <negocio>, Agente IA» sin quitar el de los derechos.
 * 2. Una raya antes del pie en las tres, al ancho del CONTENIDO: empieza y
 *    acaba donde empieza y acaba el contenido del último bloque, nunca de lado
 *    a lado de la pantalla.
 * 3. Entre el último bloque y la raya, el MISMO aire que entre dos bloques de
 *    esa pantalla; y debajo de la raya, lo mismo en las tres.
 * 4. En la propuesta, «Servicios:» o «Productos:» va dentro de cada tarjeta,
 *    delante de su nombre, y no como título encima de la lista.
 *
 * `MODO=roto` pinta las mismas pantallas con el código de `ANTES_REF`
 * (20f8e50) —pinchado a un commit, nunca `origin/main`— y AFIRMA los fallos:
 * la raya de lado a lado en la landing y en el plan, el aire de más o de menos,
 * el plan sin «Todos los derechos reservados», la propuesta sin raya ni
 * derechos y con el título encima de la lista.
 *
 * Se levanta con `scripts/banco-pie-de-las-publicas.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
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
const ANTES = process.env.ANTES_REF ?? "20f8e50";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "pie-de-las-publicas");
const cssDir = join(RAIZ, ".next", "static", "css");
const conNavegador = chromium && process.env.CHROME_BIN && fs.existsSync(cssDir) ? test : test.skip;
const soloBueno = ROTO ? test.skip : test;

// En el teléfono (< 640 px) el contenedor de las públicas no lleva margen a los
// lados (`lib/ancho-de-la-landing.ts`) y la raya del pie conserva 16 px de
// sangría para no tocar el borde; desde `sm`, la raya es la del contenido.
const sangriaDelPie = (ventana) => (ventana < 640 ? 16 : 0);

const ANIO = new Date().getFullYear();
const DERECHOS = `© ${ANIO} Agente IA. Todos los derechos reservados.`;

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deAntes = (f) => {
    try {
        return execFileSync("git", ["show", `${ANTES}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const leer = (f) => (ROTO ? deAntes(f) : crudo(f));

const LANDING_F = "app/(public)/inicio/_components/LandingClient.tsx";
const PLAN_F = "app/(public)/planes/[slug]/_components/PlanDetailPage.tsx";
const PROPUESTA_F = "components/propuestas/PropuestaPublica.tsx";

/* ─── 1. Lo puro ──────────────────────────────────────────────────────── */

soloBueno("el texto de los derechos: siempre el mismo, con el año que se le pida o el del sistema", async () => {
    const pie = await import(pathToFileURL(join(COMPILADO, "pie.mjs")).href);
    assert.equal(pie.elTextoDeLosDerechos(2031), "© 2031 Agente IA. Todos los derechos reservados.");
    assert.equal(pie.elTextoDeLosDerechos(), DERECHOS, "sin año, el del sistema: se actualiza solo");
});

soloBueno("«preparada por»: el negocio y, detrás, la marca", async () => {
    const pie = await import(pathToFileURL(join(COMPILADO, "pie.mjs")).href);
    assert.equal(pie.elTextoDePreparadaPor("Verzay"), "Propuesta preparada por Verzay, Agente IA");
    assert.equal(pie.elTextoDePreparadaPor("  Clínica Sonrisa  "), "Propuesta preparada por Clínica Sonrisa, Agente IA");
    assert.equal(pie.elTextoDePreparadaPor(""), "Propuesta preparada por Agente IA", "sin negocio no queda una coma suelta");
    assert.equal(pie.elTextoDePreparadaPor(null), "Propuesta preparada por Agente IA");
    assert.equal(pie.elTextoDePreparadaPor("agente ia"), "Propuesta preparada por Agente IA", "la marca no se repite");
});

/* ─── 2. Barrido del código ───────────────────────────────────────────── */

test("barrido: las tres pintan el MISMO pie, sin año escrito a mano", () => {
    const landing = sinComentarios(leer(LANDING_F) ?? "");
    const plan = sinComentarios(leer(PLAN_F) ?? "");
    const propuesta = sinComentarios(leer(PROPUESTA_F) ?? "");
    if (ROTO) {
        assert.match(plan, /©\s*\{anio\}\s*\{pagina\.marca\}/, "antes el plan decía «© <año> <marca>», sin los derechos");
        assert.doesNotMatch(propuesta, /©/, "antes la propuesta no llevaba derechos");
        assert.match(propuesta, /data-titulo-items/, "antes la propuesta llevaba el título encima de la lista");
        assert.match(landing, /<footer className="border-t/, "antes la raya de la landing iba en el `footer`, de lado a lado");
        return;
    }
    for (const [f, codigo] of [[LANDING_F, landing], [PLAN_F, plan], [PROPUESTA_F, propuesta]]) {
        assert.match(codigo, /<PieDeLasPublicas\b/, `${f}: usa el pie compartido`);
        assert.doesNotMatch(codigo, /©\s*20\d\d/, `${f}: un año escrito a mano`);
        assert.doesNotMatch(codigo, /getFullYear/, `${f}: el año lo pone el pie, no la pantalla`);
        assert.doesNotMatch(codigo, /<footer\b/, `${f}: un pie propio`);
    }
    assert.doesNotMatch(propuesta, /data-titulo-items/, "la propuesta ya no lleva el título encima de la lista");
    assert.match(propuesta, /data-rotulo-del-item/, "cada tarjeta lleva «Servicios:» o «Productos:» delante de su nombre");
    // El aire de cada pantalla está escrito UNA vez, y es el de sus bloques.
    const lib = crudo("lib/pie-de-las-publicas.ts");
    assert.match(lib, /landing:\s*"pt-6"/);
    assert.match(lib, /plan:\s*"pt-8 sm:pt-10"/);
    assert.match(lib, /propuesta:\s*"mt-8"/);
    assert.match(crudo(PLAN_F), /ESPACIO_DEL_BLOQUE\s*=\s*"py-8 sm:py-10"/, "el aire entre bloques del plan es el que el pie copia");
});

/* ─── 3. En el navegador ──────────────────────────────────────────────── */

async function abrir(paquete, datos, pintar, { fondo = "bg-[#0a0f1a]" } = {}) {
    const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
    const js = fs.readFileSync(paquete, "utf8");
    const json = JSON.stringify(datos).replace(/</g, "\\u003c");
    const html =
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>` +
        `<body class="${fondo}"><div id="app"></div><script>window.process=window.process||{env:{}};Object.assign(window, ${json});</script>` +
        `<script type="module">${js}</script></body></html>`;
    const servidor = http.createServer((_q, r) => {
        r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        r.end(html);
    });
    await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${servidor.address().port}/`;
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN });
    try {
        for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
            const ctx = await nav.newContext({ viewport: { width: w, height: h } });
            const pag = await ctx.newPage();
            await pag.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
            const errores = [];
            pag.on("pageerror", (e) => errores.push(String(e?.message ?? e)));
            await pag.goto(url);
            await pag.waitForFunction(() => window.listo === true, null, { timeout: 15_000 });
            await pag.waitForTimeout(400);
            await pintar(pag, w, errores);
            await ctx.close();
        }
    } finally {
        await nav.close();
        servidor.close();
    }
}

/**
 * Lo que se mide de un pie, en la página: la raya (el primer elemento del pie,
 * él incluido, con borde de arriba), su ancho, cuánto aire queda debajo, y los
 * textos. `ultimo` y `penultimo` son los dos últimos bloques de contenido de
 * esa pantalla (selectores) y `caja` dice qué se mide de ellos: el borde
 * (`border`) o lo de dentro del relleno (`contenido`).
 */
function medirElPie(pag, { ultimo, penultimo, caja }) {
    return pag.evaluate(({ ultimo, penultimo, caja }) => {
        const pie = document.querySelector("footer, [data-pie-de-pagina]");
        if (!pie) return { hay: false };
        const conBorde = [pie, ...pie.querySelectorAll("*")].find((el) => parseFloat(getComputedStyle(el).borderTopWidth) > 0) ?? null;
        const r = (el) => el.getBoundingClientRect();
        const dentro = (el) => {
            const b = r(el);
            const c = getComputedStyle(el);
            return {
                left: b.left + parseFloat(c.paddingLeft) + parseFloat(c.borderLeftWidth),
                right: b.right - parseFloat(c.paddingRight) - parseFloat(c.borderRightWidth),
                top: b.top + parseFloat(c.paddingTop),
                bottom: b.bottom - parseFloat(c.paddingBottom),
            };
        };
        const tomar = (sel) => {
            const el = typeof sel === "function" ? sel() : document.querySelector(sel);
            if (!el) return null;
            return caja === "contenido" ? dentro(el) : (({ left, right, top, bottom }) => ({ left, right, top, bottom }))(r(el));
        };
        const u = tomar(ultimo);
        const p = tomar(penultimo);
        const linea = conBorde ? r(conBorde) : null;
        const textoDelPie = pie.innerText.replace(/\s+/g, " ").trim();
        const derechos = pie.querySelector("[data-derechos]");
        const preparada = pie.querySelector("[data-preparada-por]");
        return {
            hay: true,
            ventana: document.documentElement.clientWidth,
            linea: linea ? { left: linea.left, right: linea.right, top: linea.top, ancho: linea.width } : null,
            colorDeLaLinea: conBorde ? getComputedStyle(conBorde).borderTopColor : null,
            debajo: conBorde ? parseFloat(getComputedStyle(conBorde).paddingBottom) : null,
            ultimo: u,
            penultimo: p,
            textoDelPie,
            derechos: derechos ? derechos.innerText.trim() : null,
            preparada: preparada ? preparada.innerText.trim() : null,
            preparadaArriba: preparada && derechos ? preparada.getBoundingClientRect().bottom <= derechos.getBoundingClientRect().top + 1 : null,
        };
    }, { ultimo, penultimo, caja });
}

/* La landing principal: sus dos últimos bloques son las preguntas y el
   llamado final, cada uno con su `ANCHO_DE_LA_LANDING` dentro. */
const LANDING = join(COMPILADO, "landing.js");

conNavegador("la landing principal: la raya al ancho del contenido, con el aire de entre bloques", async () => {
    await abrir(LANDING, {}, async (pag, w, errores) => {
        await pag.locator("section#faq").waitFor({ state: "attached", timeout: 10_000 });
        const m = await pag.evaluate(() => {
            const secciones = [...document.querySelectorAll("section")];
            const faq = document.querySelector("section#faq");
            const i = secciones.indexOf(faq);
            const ultima = secciones[secciones.length - 1];
            return { despuesDeFaq: secciones.length - 1 - i, ultimaTieneDiv: !!ultima.firstElementChild };
        });
        assert.equal(m.despuesDeFaq, 1, `${w}: detrás de las preguntas va un solo bloque, el llamado final`);
        const pie = await pag.evaluate(() => {
            const secciones = [...document.querySelectorAll("section")];
            const ultima = secciones[secciones.length - 1].firstElementChild;
            const faq = document.querySelector("section#faq").firstElementChild;
            const dentro = (el) => {
                const b = el.getBoundingClientRect();
                const c = getComputedStyle(el);
                return { left: b.left + parseFloat(c.paddingLeft), right: b.right - parseFloat(c.paddingRight), top: b.top, bottom: b.bottom };
            };
            const pie = document.querySelector("footer, [data-pie-de-pagina]");
            const conBorde = [pie, ...pie.querySelectorAll("*")].find((el) => parseFloat(getComputedStyle(el).borderTopWidth) > 0);
            const l = conBorde.getBoundingClientRect();
            return {
                ventana: document.documentElement.clientWidth,
                ultimo: dentro(ultima),
                penultimo: dentro(faq),
                linea: { left: l.left, right: l.right, top: l.top, ancho: l.width },
                debajo: parseFloat(getComputedStyle(conBorde).paddingBottom),
                texto: pie.innerText.replace(/\s+/g, " ").trim(),
                derechos: pie.querySelector("[data-derechos]")?.innerText.trim() ?? null,
            };
        });
        const entreBloques = pie.ultimo.top - pie.penultimo.bottom;
        const hastaLaRaya = pie.linea.top - pie.ultimo.bottom;
        if (ROTO) {
            assert.ok(pie.linea.ancho >= pie.ventana - 2, `${w}: antes la raya iba de lado a lado (${pie.linea.ancho} de ${pie.ventana})`);
            assert.ok(Math.abs(hastaLaRaya - entreBloques) > 4, `${w}: antes el aire hasta la raya (${hastaLaRaya}) no era el de entre bloques (${entreBloques})`);
            return;
        }
        const sangria = sangriaDelPie(w);
        assert.ok(pie.linea.ancho < pie.ventana - 2 * sangria - (sangria ? -1 : 40), `${w}: la raya no va de lado a lado (${pie.linea.ancho} de ${pie.ventana})`);
        assert.ok(Math.abs(pie.linea.left - (pie.ultimo.left + sangria)) <= 1, `${w}: la raya empieza donde el contenido (${pie.linea.left} vs ${pie.ultimo.left}+${sangria})`);
        assert.ok(Math.abs(pie.linea.right - (pie.ultimo.right - sangria)) <= 1, `${w}: la raya acaba donde el contenido (${pie.linea.right} vs ${pie.ultimo.right}-${sangria})`);
        assert.ok(Math.abs(hastaLaRaya - entreBloques) <= 1, `${w}: hasta la raya ${hastaLaRaya}px, entre bloques ${entreBloques}px`);
        assert.equal(pie.debajo, 24, `${w}: debajo de la raya, 24px`);
        assert.equal(pie.derechos, DERECHOS, `${w}: el texto de los derechos`);
        assert.deepEqual(errores, []);
    });
});

/* La página de un plan: sus dos últimos bloques son las preguntas y el cierre. */
const DATOS = { plan: "intermedio", nombre: "Business", creditos: 8000, catalogo: 25, precioUSD: 99, asistencia: "IA", nombresEnUso: ["Business"] };
const F = (id, nombre, descripcion, tutorial) => ({ id, nombre, descripcion, categoria: "general", activa: true, destacada: true, tutorial });
const CRUDO = [
    F("respuestas", "Respuestas automáticas por WhatsApp", "La IA contesta a tus clientes a cualquier hora.", "leads"),
    F("reportes", "Reportes semanales", "Un resumen cada lunes.", null),
];
const PAGINA = {
    plan: "intermedio",
    tipo: "IA",
    nombre: "Business",
    precio: { texto: "$99", aConsultar: false },
    video: { tipo: "archivo", url: "/videos/plan.mp4", titulo: "Así funciona Business", miniatura: null },
    paraQuien: { paraQuien: "Para negocios que atienden por WhatsApp todo el día.", caso: "Una clínica con tres asesores." },
    capacidad: [{ id: "creditos", icono: "creditos", titulo: "Créditos de IA", valor: "8.000", detalle: "Cada mes." }],
    funciones: [],
    preguntas: [{ question: "¿Puedo cambiar de plan?", answer: "Sí, cuando quieras." }],
    botones: { principal: { texto: "Comenzar con el plan Business", url: "/register?plan=nivel-3", externo: false }, secundario: null },
    planSuperior: { plan: "avanzado", tipo: "IA", nombre: "Pro", url: "/planes/nivel-4" },
    meta: { titulo: "Business", descripcion: "", imagen: null },
    marca: "Verzay",
    logo: null,
    favicon: null,
    orden: ["video", "paraquien", "capacidad", "funciones", "preguntas", "comenzar"],
};
const PLAN = join(COMPILADO, "plan.js");

conNavegador("la página de un plan: el mismo texto, y la raya al ancho del contenido con el aire de entre bloques", async () => {
    await abrir(PLAN, { __pagina: PAGINA, __crudo: CRUDO, __datos: DATOS }, async (pag, w, errores) => {
        const m = await medirElPie(pag, {
            ultimo: '[data-seccion="comenzar"] [data-ancho-del-bloque]',
            penultimo: '[data-seccion="preguntas"] [data-ancho-del-bloque]',
            caja: "contenido",
        });
        assert.ok(m.hay && m.linea, `${w}: hay pie con raya`);
        const entreBloques = m.ultimo.top - m.penultimo.bottom;
        const hastaLaRaya = m.linea.top - m.ultimo.bottom;
        if (ROTO) {
            assert.ok(m.linea.ancho >= m.ventana - 2, `${w}: antes la raya iba de lado a lado (${m.linea.ancho} de ${m.ventana})`);
            assert.doesNotMatch(m.textoDelPie, /Todos los derechos reservados/, `${w}: antes el plan no decía los derechos («${m.textoDelPie}»)`);
            assert.ok(Math.abs(hastaLaRaya - entreBloques) > 4, `${w}: antes el aire hasta la raya (${hastaLaRaya}) no era el de entre bloques (${entreBloques})`);
            return;
        }
        // El último bloque del plan (el cierre) ya lleva su sangría de 16 px en el
        // teléfono (`ANCHO_DE_LA_LANDING_CON_SANGRIA`): su contenido empieza donde la raya.
        const sangria = sangriaDelPie(w);
        assert.ok(m.linea.ancho < m.ventana - 2 * sangria - (sangria ? -1 : 40), `${w}: la raya no va de lado a lado (${m.linea.ancho} de ${m.ventana})`);
        assert.ok(Math.abs(m.linea.left - m.ultimo.left) <= 1, `${w}: la raya empieza donde el contenido (${m.linea.left} vs ${m.ultimo.left})`);
        assert.ok(Math.abs(m.linea.right - m.ultimo.right) <= 1, `${w}: la raya acaba donde el contenido (${m.linea.right} vs ${m.ultimo.right})`);
        assert.ok(Math.abs(hastaLaRaya - entreBloques) <= 1, `${w}: hasta la raya ${hastaLaRaya}px, entre bloques ${entreBloques}px`);
        assert.equal(m.debajo, 24, `${w}: debajo de la raya, 24px`);
        assert.equal(m.derechos, DERECHOS, `${w}: el texto de los derechos`);
        assert.equal(m.preparada, null, `${w}: «preparada por» es solo de la propuesta`);
        assert.deepEqual(errores, []);
    });
});

/* La propuesta: el hero y las tarjetas, más condiciones y pago, para que haya
   varios bloques que comparar. Uno de servicios y otro de productos. */
const PROPUESTA = {
    token: "t".repeat(32),
    cliente: "Clínica Dental Sonrisa",
    empresa: "Grupo Sonrisa SAS",
    fecha: "2026-09-28",
    vigencia: null,
    tipoDeItems: "servicios",
    nota: "",
    metodoPago: "Transferencia",
    medioPago: "Bancolombia",
    moneda: "COP",
    servicios: [
        { nombre: "Plan Business", alcance: "Agente de IA configurado", inversion: 1500000 },
        { nombre: "Landing", alcance: "Una página con formulario", inversion: 800000 },
    ],
    mantenimientoMensual: null,
    mantenimientoDescripcion: "",
    condiciones: "50% al iniciar y 50% al entregar.",
    actualizadaEn: "2026-09-28T12:00:00.000Z",
    negocio: { nombre: "Verzay", logo: null, eslogan: "Automatiza tu negocio con IA" },
};
const DE_PRODUCTOS = {
    ...PROPUESTA,
    tipoDeItems: "productos",
    servicios: [
        { nombre: "Silla ergonómica", alcance: "Negra", inversion: 400000 },
        { nombre: "Escritorio", alcance: "Roble", inversion: 900000 },
    ],
};
const PROPUESTA_JS = join(COMPILADO, "propuesta.js");
const VENTANA = (propuesta) => ({ __roto: false, __propuesta: propuesta, __planes: [], __crudo: [], __datos: DATOS });

async function medirLaPropuesta(pag) {
    const bloques = await pag.evaluate(() =>
        [...document.querySelectorAll("[data-propuesta] > section")].map((s) => {
            const b = s.getBoundingClientRect();
            return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
        }),
    );
    const m = await medirElPie(pag, { ultimo: "[data-propuesta] > section:last-of-type", penultimo: "[data-propuesta] > section:nth-last-of-type(2)", caja: "border" });
    const titulos = await pag.locator("[data-titulo-del-item]").allInnerTexts();
    const tituloEncima = await pag.locator("[data-titulo-items]").count();
    return { bloques, m, titulos: titulos.map((t) => t.replace(/\s+/g, " ").trim()), tituloEncima };
}

conNavegador("la propuesta: raya, derechos y «preparada por», con el aire de entre bloques", async () => {
    await abrir(PROPUESTA_JS, VENTANA(PROPUESTA), async (pag, w, errores) => {
        const { bloques, m, titulos, tituloEncima } = await medirLaPropuesta(pag);
        assert.ok(bloques.length >= 4, `${w}: hay varios bloques (${bloques.length})`);
        if (ROTO) {
            assert.equal(m.linea, null, `${w}: antes la propuesta no llevaba raya antes del pie`);
            assert.doesNotMatch(m.textoDelPie ?? "", /©|derechos reservados/, `${w}: antes no decía los derechos`);
            assert.equal(tituloEncima, 1, `${w}: antes la lista llevaba «Servicios» encima`);
            return;
        }
        // El aire entre bloques es UNO (32 px), y es el que hay hasta la raya.
        const huecos = bloques.slice(1).map((b, i) => Math.round(b.top - bloques[i].bottom));
        assert.ok(huecos.every((h) => Math.abs(h - huecos[0]) <= 1), `${w}: los bloques no están igual de separados (${huecos})`);
        const hastaLaRaya = m.linea.top - m.ultimo.bottom;
        assert.ok(Math.abs(hastaLaRaya - huecos[0]) <= 1, `${w}: hasta la raya ${hastaLaRaya}px, entre bloques ${huecos[0]}px`);
        const sangria = sangriaDelPie(w);
        assert.ok(Math.abs(m.linea.left - (bloques[0].left + sangria)) <= 1 && Math.abs(m.linea.right - (bloques[0].right - sangria)) <= 1, `${w}: la raya va al ancho del contenido (${m.linea.left}–${m.linea.right} vs ${bloques[0].left}–${bloques[0].right}, sangría ${sangria})`);
        assert.ok(m.linea.ancho < m.ventana - (sangria ? 2 * sangria - 1 : 20), `${w}: la raya no va de lado a lado`);
        assert.equal(m.debajo, 24, `${w}: debajo de la raya, 24px`);
        assert.equal(m.derechos, DERECHOS, `${w}: el texto de los derechos`);
        assert.equal(m.preparada, "Propuesta preparada por Verzay, Agente IA", `${w}: la línea de quién la preparó`);
        assert.equal(m.preparadaArriba, true, `${w}: «preparada por» va encima de los derechos`);
        // El título va DENTRO de cada tarjeta, no encima de la lista.
        assert.equal(tituloEncima, 0, `${w}: sin título encima de la lista`);
        assert.deepEqual(titulos, ["Servicios: Plan Business", "Servicios: Landing"], `${w}: cada tarjeta dice qué es`);
        assert.deepEqual(errores, []);
    }, { fondo: "" });
});

conNavegador("la propuesta de productos: «Productos:» delante de cada nombre", async () => {
    await abrir(PROPUESTA_JS, VENTANA(DE_PRODUCTOS), async (pag, w, errores) => {
        const { titulos, tituloEncima } = await medirLaPropuesta(pag);
        if (ROTO) {
            assert.equal(tituloEncima, 1, `${w}: antes la lista llevaba «Productos» encima`);
            return;
        }
        assert.equal(tituloEncima, 0);
        assert.deepEqual(titulos, ["Productos: Silla ergonómica", "Productos: Escritorio"]);
        assert.deepEqual(errores, []);
    }, { fondo: "" });
});

conNavegador("las tres dicen los derechos con LAS MISMAS palabras, y el pie mide lo mismo debajo de la raya", async () => {
    if (ROTO) return; // Los fallos de antes, uno a uno, ya los afirman las de arriba.
    const vistos = [];
    await abrir(PLAN, { __pagina: PAGINA, __crudo: CRUDO, __datos: DATOS }, async (pag, w) => {
        if (w === 1440) vistos.push(await medirElPie(pag, { ultimo: "body", penultimo: "body", caja: "border" }));
    });
    await abrir(PROPUESTA_JS, VENTANA(PROPUESTA), async (pag, w) => {
        if (w === 1440) vistos.push(await medirElPie(pag, { ultimo: "body", penultimo: "body", caja: "border" }));
    }, { fondo: "" });
    await abrir(LANDING, {}, async (pag, w) => {
        if (w !== 1440) return;
        await pag.locator("section#faq").waitFor({ state: "attached", timeout: 10_000 });
        vistos.push(await medirElPie(pag, { ultimo: "body", penultimo: "body", caja: "border" }));
    });
    assert.equal(vistos.length, 3);
    assert.deepEqual(vistos.map((v) => v.derechos), [DERECHOS, DERECHOS, DERECHOS]);
    assert.deepEqual(vistos.map((v) => v.debajo), [24, 24, 24]);
});
