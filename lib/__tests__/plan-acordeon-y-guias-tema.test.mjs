/**
 * Tres arreglos de la parte pública, en la misma prueba:
 *
 * 1. **«Qué incluye este plan» es un acordeón**, como las preguntas
 *    frecuentes: una función a la vez, y abierta enseña ahí mismo el video de
 *    su tutorial (la demostración de la guía o el reproductor del enlace). El
 *    texto es «Ver tutorial», nunca el nombre de la guía: antes salía «Guía de
 *    Agente IA» en funciones que no tienen nada que ver entre sí.
 * 2. **Los bloques de la página de un plan miden lo mismo que la landing**
 *    (`ANCHO_DE_LA_LANDING`), de arriba abajo, sin rayas entre ellos.
 * 3. **Las guías siguen el tema de la App** (`--guia-*`): oscuras con la App en
 *    oscuro, claras en claro, y la que va DENTRO de la landing siempre clara.
 *    El orden no cambia: video, resumen, tarjetas de secciones.
 *
 * `MODO=roto` pinta lo mismo con el código de `ANTES_REF` (2fda6a3) —pinchado a
 * un commit, nunca `origin/main`— y AFIRMA los fallos de antes.
 *
 * Se levanta con `scripts/banco-plan-acordeon-y-guias-tema.sh`.
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
const ANTES = process.env.ANTES_REF ?? "2fda6a3";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "plan-acordeon");
const cssDir = join(RAIZ, ".next", "static", "css");
const conNavegador = chromium && process.env.CHROME_BIN && fs.existsSync(cssDir) ? test : test.skip;

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

const PAGINA_DEL_PLAN = "app/(public)/planes/[slug]/_components/PlanDetailPage.tsx";
const LANDINGS = [
    "app/(public)/inicio/_components/LandingClient.tsx",
    "app/(public)/r/[slug]/_components/ResellerLandingClient.tsx",
    "app/(public)/resellers/_components/ResellerLandingClient.tsx",
];

/** Los ficheros que pintan una guía: las dos páginas de cada una, el layout, las piezas y la de la landing. */
function losFicherosDeLasGuias() {
    const guias = fs.readdirSync(join(RAIZ, "app", "guia"), { withFileTypes: true }).filter((d) => d.isDirectory());
    const lista = ["app/guia/layout.tsx", "components/guia/Guia.tsx", "components/guia/GuiaEnLaLanding.tsx"];
    for (const g of guias) {
        for (const f of [`app/guia/${g.name}/page.tsx`, `app/guia/${g.name}/[seccion]/page.tsx`]) {
            if (fs.existsSync(join(RAIZ, f))) lista.push(f);
        }
    }
    return lista;
}

/** Un color de Tailwind escrito a mano: lo que dejaba la guía blanca con la App en oscuro. */
const COLOR_A_MANO = /\b(?:bg|text|border|ring|from|to|via|divide|outline|decoration|fill|stroke)-(?:slate|white|blue|amber|gray|zinc|neutral|stone|black)(?:-\d{2,3})?(?:\/\d+)?\b/g;
/**
 * Lo que se queda igual en los dos temas, a propósito, porque va sobre una
 * superficie de color propia: el marco negro del video, el rótulo oscuro que
 * sale encima de una captura, el número blanco en su círculo azul y la tarjeta
 * azul de «Contáctanos». Ninguno es un fondo ni un texto de la página.
 */
const PERMITIDO = new Set([
    "bg-slate-900",
    "bg-slate-900/70",
    "text-white",
    "bg-white/15",
    "bg-blue-600",
    "from-blue-600",
    "to-blue-500",
    "border-blue-200",
    "border-blue-300",
    "text-blue-50",
    "bg-white",
    "text-blue-700",
]);

/* ─── 1. Lo puro, sin navegador ───────────────────────────────────────── */

test("lo puro: «Ver tutorial», qué video se mete y que cada guía tenga su demostración", { skip: ROTO }, async () => {
    const p = await import(pathToFileURL(join(COMPILADO, "puro.mjs")).href);
    assert.equal(p.TEXTO_DEL_TUTORIAL, "Ver tutorial");

    // La demostración de cada guía publicada existe: es lo que se abre en el desplegable.
    for (const g of p.GUIAS_PUBLICADAS) {
        assert.ok(fs.existsSync(join(RAIZ, "public", "guia", g.modulo, "demostracion.webm")), `falta la demostración de ${g.modulo}`);
        assert.ok(fs.existsSync(join(RAIZ, "public", "guia", g.modulo, "portada.webp")), `falta la portada de ${g.modulo}`);
    }

    // Solo se mete en la página lo que se deja: un reproductor conocido o un archivo.
    const yt = p.elVideoDelTutorial("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(yt?.tipo, "iframe");
    assert.match(yt.url, /^https:\/\/www\.youtube\.com\/embed\//);
    assert.equal(p.elVideoDelTutorial("https://ayuda.test/soporte"), null, "una web cualquiera no se inserta");
    assert.equal(p.elVideoDelTutorial("javascript:alert(1)"), null);
    assert.equal(p.elVideoDelTutorial("https://archivos.test/curso.mp4")?.tipo, "archivo");

    // Una guía: su demostración, y el texto genérico, nunca el nombre de la guía.
    const guias = new Set(p.GUIAS_PUBLICADAS.map((g) => g.modulo));
    const t = p.elTutorialDeLaFuncion("agente-ia", guias);
    assert.equal(t.titulo, "Ver tutorial");
    assert.equal(t.externo, false);
    assert.deepEqual(t.video, { tipo: "archivo", url: "/guia/agente-ia/demostracion.webm" });
    assert.equal(t.portada, "/guia/agente-ia/portada.webp");
    assert.equal(p.elTutorialDeLaFuncion("no-existe", guias), null);
    assert.equal(p.elTutorialDeLaFuncion("https://ayuda.test/soporte", guias)?.titulo, "Ver tutorial");
});

/* ─── 2. Barrido del código ───────────────────────────────────────────── */

test("barrido: los bloques del plan y las tres landings usan el MISMO ancho, sin rayas entre bloques", () => {
    const pagina = sinComentarios(leer(PAGINA_DEL_PLAN));
    if (ROTO) {
        assert.doesNotMatch(pagina, /ANCHO_DE_LA_LANDING/, "antes cada bloque llevaba su ancho");
        assert.match(pagina, /max-w-3xl/);
        assert.match(pagina, /max-w-5xl/);
        assert.match(pagina, /divide-y/, "antes había rayas entre bloques");
        return;
    }
    assert.match(crudo("lib/ancho-de-la-landing.ts"), /export const ANCHO_DE_LA_LANDING = "mx-auto max-w-6xl/);
    for (const l of LANDINGS) {
        assert.match(sinComentarios(crudo(l)), /ANCHO_DE_LA_LANDING/, `${l} no usa el ancho común`);
        assert.doesNotMatch(sinComentarios(crudo(l)), /mx-auto max-w-6xl px-8/, `${l} vuelve a escribir el ancho a mano`);
    }
    assert.doesNotMatch(pagina, /max-w-(?:3xl|4xl|5xl)/, "ningún bloque más angosto");
    assert.doesNotMatch(pagina, /divide-y/, "sin rayas entre bloques");
    const secciones = pagina.match(/data-seccion="[a-z]+"/g) ?? [];
    const anchos = pagina.match(/data-ancho-del-bloque/g) ?? [];
    assert.equal(secciones.length, 6);
    assert.equal(anchos.length, secciones.length, "cada bloque lleva su caja de ancho");
});

test("barrido: ninguna guía pinta un color a mano (siguen el tema de la App)", () => {
    const ficheros = losFicherosDeLasGuias();
    assert.ok(ficheros.length >= 60, `se esperaban las ~70 páginas de guía, hay ${ficheros.length}`);
    const conColor = [];
    for (const f of ficheros) {
        const s = leer(f);
        if (s == null) continue;
        const colores = [...new Set((sinComentarios(s).match(COLOR_A_MANO) ?? []).filter((c) => !PERMITIDO.has(c)))];
        if (colores.length) conColor.push(`${f}: ${colores.slice(0, 4).join(" ")}`);
    }
    if (ROTO) {
        assert.ok(conColor.length >= 60, `antes casi todas llevaban slate a mano (${conColor.length})`);
        return;
    }
    assert.deepEqual(conColor, [], "una guía con colores a mano se queda blanca en oscuro");
    const css = crudo("app/globals.css");
    assert.match(css, /:root,\s*\[data-guia-tema="claro"\]\s*\{[^}]*--guia-fondo:/, "el claro, también fuera de la guía");
    assert.match(css, /\.dark\s*,\s*\[data-guia-tema="oscuro"\]\s*\{[^}]*--guia-fondo:/, "el oscuro, bajo la clase de next-themes y bajo su marca");
    const tw = crudo("tailwind.config.ts");
    assert.match(tw, /guia:\s*\{/, "Tailwind conoce los colores guia-*");
    assert.match(sinComentarios(crudo("components/guia/GuiaEnLaLanding.tsx")), /data-guia-tema="claro"/, "la de la landing, siempre clara");
});

/* ─── 3. En el navegador ──────────────────────────────────────────────── */

async function abrir(paquete, datos, pintar, anchos = [[1440, 900], [390, 844]]) {
    const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
    const js = fs.readFileSync(paquete, "utf8");
    const json = JSON.stringify(datos).replace(/</g, "\\u003c");
    const html =
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>` +
        `<body><div id="app"></div><script>window.process=window.process||{env:{}};Object.assign(window, ${json});</script>` +
        `<script>${js}</script></body></html>`;
    const servidor = http.createServer((_q, r) => {
        r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        r.end(html);
    });
    await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${servidor.address().port}/`;
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN });
    try {
        for (const [w, h] of anchos) {
            const pag = await nav.newPage({ viewport: { width: w, height: h } });
            await pag.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
            const errores = [];
            pag.on("pageerror", (e) => errores.push(String(e?.message ?? e)));
            await pag.goto(url);
            await pag.waitForFunction(() => window.listo === true, null, { timeout: 15_000 });
            await pag.waitForTimeout(250);
            await pintar(pag, w, errores);
            await pag.close();
        }
    } finally {
        await nav.close();
        servidor.close();
    }
}

/** La luminancia de un color `rgb(…)`: menos de 0,2 es oscuro. */
const luz = (rgb) => {
    const [r, g, b] = rgb
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((c) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/* El plan de ejemplo: tres funciones distintas con la MISMA guía, un video de
   YouTube, una web que no se deja insertar y una sin tutorial. */
const DATOS = { plan: "intermedio", nombre: "Business", creditos: 8000, catalogo: 25, precioUSD: 99, asistencia: "IA", nombresEnUso: ["Business"] };
const F = (id, nombre, descripcion, tutorial) => ({ id, nombre, descripcion, categoria: "general", activa: true, destacada: true, tutorial });
const CRUDO = [
    F("respuestas", "Respuestas automáticas por WhatsApp", "La IA contesta a tus clientes a cualquier hora.", "agente-ia"),
    F("catalogo", "Catálogo de productos", "Tus productos con su precio y su foto.", "agente-ia"),
    F("seguimientos", "Seguimientos", "", "agente-ia"),
    F("youtube", "Cómo vender más", "Un video corto.", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    F("soporte", "Centro de soporte", "Escríbenos cuando quieras.", "https://ayuda.test/soporte"),
    F("reportes", "Reportes semanales", "Un resumen cada lunes.", null),
];
const PAGINA = {
    plan: "intermedio",
    tipo: "IA",
    nombre: "Business",
    precio: { texto: "$99 USD/mes", aConsultar: false },
    video: { tipo: "archivo", url: "/videos/plan.mp4", titulo: "Así funciona Business", miniatura: null },
    paraQuien: { paraQuien: "Para negocios que atienden por WhatsApp todo el día.", caso: "Una clínica con tres asesores." },
    capacidad: [
        { id: "creditos", icono: "creditos", titulo: "Créditos de IA", valor: "8.000", detalle: "Cada mes." },
        { id: "catalogo", icono: "catalogo", titulo: "Catálogo", valor: "Hasta 25", detalle: "Productos." },
        { id: "asistencia", icono: "asistencia", titulo: "Asistencia", valor: "IA 24/7", detalle: "Todos los días." },
    ],
    funciones: [],
    preguntas: [
        { question: "¿Puedo cambiar de plan?", answer: "Sí, cuando quieras." },
        { question: "¿Hay permanencia?", answer: "No." },
    ],
    botones: { principal: { texto: "Comenzar con el plan Business", url: "/register?plan=nivel-3", externo: false }, secundario: null },
    planSuperior: { plan: "avanzado", tipo: "IA", nombre: "Pro", url: "/planes/nivel-4" },
    meta: { titulo: "Business", descripcion: "", imagen: null },
    marca: "Verzay",
    logo: null,
    favicon: null,
    orden: ["video", "paraquien", "capacidad", "funciones", "preguntas", "comenzar"],
};

conNavegador("el plan: todos los bloques miden lo que la landing, sin rayas", async () => {
    const HARNESS = join(COMPILADO, "plan.js");
    await abrir(HARNESS, { __pagina: PAGINA, __crudo: CRUDO, __datos: DATOS }, async (pag, w, errores) => {
        assert.deepEqual(errores, []);
        const m = await pag.evaluate(() => {
            const main = document.querySelector("main");
            const secciones = [...document.querySelectorAll("section[data-seccion]")].map((s) => {
                const c = s.firstElementChild.getBoundingClientRect();
                return { s: s.dataset.seccion, left: Math.round(c.left), width: Math.round(c.width) };
            });
            return { secciones, divide: main.className.includes("divide-y") };
        });
        assert.equal(m.secciones.length, 6, "los seis bloques se pintan");
        const anchos = new Set(m.secciones.map((x) => x.width));
        const lados = new Set(m.secciones.map((x) => x.left));
        if (ROTO) {
            assert.ok(w < 800 || anchos.size > 1, `antes los bloques medían distinto a ${w} (${[...anchos]})`);
            assert.equal(m.divide, true, "antes había rayas entre bloques");
            return;
        }
        assert.equal(anchos.size, 1, `a ${w} todos los bloques miden lo mismo: ${JSON.stringify(m.secciones)}`);
        assert.equal(lados.size, 1, `a ${w} todos arrancan en el mismo píxel`);
        assert.equal(m.divide, false, "sin rayas entre bloques");
        // Y es el ancho de la landing: una caja con la misma clase mide lo mismo.
        const ancho = await pag.evaluate((clase) => {
            const sonda = document.createElement("div");
            sonda.className = clase;
            sonda.innerHTML = "&nbsp;";
            document.querySelector("main").appendChild(sonda);
            const r = sonda.getBoundingClientRect();
            sonda.remove();
            return { left: Math.round(r.left), width: Math.round(r.width) };
        }, crudo("lib/ancho-de-la-landing.ts").match(/ANCHO_DE_LA_LANDING = "([^"]+)"/)[1]);
        assert.equal(ancho.width, [...anchos][0], `a ${w} el ancho es el de la landing`);
        assert.equal(ancho.left, [...lados][0]);
        if (w >= 1440) assert.equal(ancho.width, 1152, "max-w-6xl en escritorio");
    });
});

conNavegador("el plan: «Qué incluye» es un acordeón con el tutorial dentro, y dice «Ver tutorial»", async () => {
    const HARNESS = join(COMPILADO, "plan.js");
    await abrir(HARNESS, { __pagina: PAGINA, __crudo: CRUDO, __datos: DATOS }, async (pag, w, errores) => {
        assert.deepEqual(errores, []);
        const textos = await pag.evaluate(() => [...document.querySelectorAll("[data-tutorial]")].map((e) => e.textContent.trim()));
        const cuerpo = await pag.evaluate(() => document.body.innerText);
        if (ROTO) {
            const repetidas = textos.filter((t) => t === "Guía de Agente IA").length;
            assert.equal(repetidas, 3, `antes tres funciones distintas decían «Guía de Agente IA» (${textos})`);
            assert.equal(await pag.locator("[data-cabeza-de-la-funcion]").count(), 0, "antes no se desplegaba nada");
            assert.equal(await pag.locator("[data-video-del-tutorial]").count(), 0, "antes el tutorial sacaba de la página");
            return;
        }
        assert.ok(textos.length >= 5, `cada función con tutorial lo ofrece (${textos.length})`);
        assert.ok(textos.every((t) => t === "Ver tutorial"), `siempre «Ver tutorial»: ${textos}`);
        assert.doesNotMatch(cuerpo, /Guía de /, "nunca el nombre de una guía");

        // Cerradas al entrar.
        assert.equal(await pag.locator("[data-cuerpo-de-la-funcion]").count(), 0);
        // Las que no son destacadas van detrás de «Ver todas las funciones».
        { const todas = pag.locator("[data-ver-todas-las-funciones]"); if (await todas.count()) await todas.click(); }

        // Abrir una: se ve su video ahí mismo, con su portada, y el enlace para abrirla entera.
        const respuestas = pag.locator('[data-funcion="respuestas"]');
        await respuestas.locator("button[data-cabeza-de-la-funcion]").click();
        assert.equal(await respuestas.getAttribute("data-abierta"), "si");
        assert.equal(await respuestas.locator("button[data-cabeza-de-la-funcion]").getAttribute("aria-expanded"), "true");
        const video = respuestas.locator('video[data-video-del-tutorial="archivo"]');
        assert.equal(await video.count(), 1, "el video de la guía, dentro del desplegable");
        assert.equal(await video.getAttribute("src"), "/guia/agente-ia/demostracion.webm");
        assert.equal(await video.getAttribute("poster"), "/guia/agente-ia/portada.webp");
        assert.ok((await video.boundingBox()).width > 200, "el video se ve");
        // Una guía de la plataforma se DESPLIEGA ahí mismo: es un botón, no un
        // enlace a otra pestaña (lo prueba entero `banco-plan-guia-dentro.sh`).
        const verLaGuia = respuestas.locator("button[data-ver-la-guia]");
        assert.equal(await verLaGuia.count(), 1, "«Ver guía» es un botón");
        assert.equal(await respuestas.locator("a[data-abrir-tutorial]").count(), 0, "una guía nunca abre otra pestaña");
        assert.equal(pag.url().startsWith("http://127.0.0.1"), true, "no sale de la página");

        // Abrir otra cierra la anterior, como las preguntas frecuentes.
        const yt = pag.locator('[data-funcion="youtube"]');
        await yt.locator("button[data-cabeza-de-la-funcion]").click();
        assert.equal(await respuestas.getAttribute("data-abierta"), "no", "una a la vez");
        const iframe = yt.locator('iframe[data-video-del-tutorial="iframe"]');
        assert.equal(await iframe.count(), 1, "el reproductor de YouTube, ahí mismo");
        assert.match(await iframe.getAttribute("src"), /^https:\/\/www\.youtube\.com\/embed\//);

        // Una web que no se deja insertar: solo el enlace, en otra pestaña.
        const soporte = pag.locator('[data-funcion="soporte"]');
        await soporte.locator("button[data-cabeza-de-la-funcion]").click();
        assert.equal(await soporte.locator("[data-video-del-tutorial]").count(), 0);
        assert.equal(await soporte.locator("a[data-abrir-tutorial]").getAttribute("target"), "_blank");

        // Volver a pulsar la abierta la cierra.
        await soporte.locator("button[data-cabeza-de-la-funcion]").click();
        assert.equal(await pag.locator("[data-cuerpo-de-la-funcion]").count(), 0);

        // Sin tutorial: se abre a su descripción, sin «Ver tutorial».
        const reportes = pag.locator('[data-funcion="reportes"]');
        assert.equal(await reportes.locator("[data-tutorial]").count(), 0);
        await reportes.locator("button[data-cabeza-de-la-funcion]").click();
        assert.match(await reportes.locator("[data-descripcion-de-la-funcion]").innerText(), /resumen cada lunes/);

        // «Ver tutorial» va a la derecha, en la línea del nombre, también en el teléfono.
        const fila = await pag.locator('[data-funcion="catalogo"] [data-fila-de-la-funcion]').evaluate((e) => {
            const n = e.querySelector("[data-nombre-de-la-funcion]").getBoundingClientRect();
            const t = e.querySelector("[data-tutorial]").getBoundingClientRect();
            return { nombre: n.right, tutorial: t.left, mismaLinea: Math.abs(n.top + n.height / 2 - (t.top + t.height / 2)) < 12 };
        });
        assert.ok(fila.tutorial >= fila.nombre, `a ${w} el tutorial va a la derecha`);
        assert.ok(fila.mismaLinea, `a ${w} en la misma línea`);
        const desborda = await pag.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        assert.equal(desborda, false, `a ${w} nada desborda`);
    });
});

for (const vista of ["indice", "seccion"]) {
    conNavegador(`la guía (${vista}): sigue el tema de la App, oscuro y claro`, async () => {
        const HARNESS = join(COMPILADO, "guia.js");
        for (const oscuro of [true, false]) {
            await abrir(HARNESS, { __vista: vista, __oscuro: oscuro }, async (pag, w, errores) => {
                assert.deepEqual(errores, []);
                const c = await pag.evaluate(() => {
                    const g = document.querySelector("[data-guia]");
                    const s = getComputedStyle(g);
                    const titulo = document.querySelector("h1, h2");
                    const tarjeta = document.querySelector("[data-tarjeta-de-seccion], [data-paso]");
                    return {
                        fondo: s.backgroundColor,
                        texto: s.color,
                        titulo: getComputedStyle(titulo).color,
                        tarjeta: tarjeta ? getComputedStyle(tarjeta).backgroundColor : null,
                    };
                });
                if (ROTO) {
                    if (oscuro) assert.ok(luz(c.fondo) > 0.8, `antes, con la App en oscuro, la guía seguía blanca (${c.fondo})`);
                    return;
                }
                if (oscuro) {
                    assert.ok(luz(c.fondo) < 0.05, `en oscuro el fondo es oscuro (${c.fondo})`);
                    assert.ok(luz(c.titulo) > 0.8, `y el título claro (${c.titulo})`);
                } else {
                    assert.ok(luz(c.fondo) > 0.9, `en claro el fondo es claro (${c.fondo})`);
                    assert.ok(luz(c.titulo) < 0.05, `y el título oscuro (${c.titulo})`);
                }
                if (vista === "indice") {
                    // El orden no cambia: el video, el resumen, las tarjetas (y no son un acordeón).
                    const orden = await pag.evaluate(() => {
                        const y = (s) => document.querySelector(s)?.getBoundingClientRect().top ?? null;
                        return {
                            video: y("[data-video-de-la-guia]"),
                            intro: y("[data-introduccion-de-la-guia]"),
                            tarjetas: y("[data-cuadricula-de-secciones]"),
                            acordeon: document.querySelectorAll("[data-cuadricula-de-secciones] [aria-expanded]").length,
                            visibles: [...document.querySelectorAll("[data-tarjeta-de-seccion]")].filter((t) => t.getBoundingClientRect().height > 40).length,
                        };
                    });
                    assert.ok(orden.video < orden.intro && orden.intro < orden.tarjetas, `video, resumen, tarjetas: ${JSON.stringify(orden)}`);
                    assert.equal(orden.acordeon, 0, "las tarjetas no son un acordeón");
                    assert.ok(orden.visibles >= 5, "las tarjetas se ven como hoy");
                }
                const desborda = await pag.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
                assert.equal(desborda, false, `a ${w} nada desborda`);
            });
        }
    });
}

conNavegador("la guía dentro de la landing sigue clara aunque la App esté en oscuro", async () => {
    const HARNESS = join(COMPILADO, "guia.js");
    await abrir(HARNESS, { __vista: "landing", __oscuro: true }, async (pag, w, errores) => {
        assert.deepEqual(errores, []);
        await pag.waitForSelector("[data-guia] [data-video-de-la-guia]", { timeout: 10_000 });
        const c = await pag.evaluate(() => {
            const g = document.querySelector("[data-guia]");
            const h = g.querySelector("h2");
            return { fondo: getComputedStyle(g).backgroundColor, titulo: getComputedStyle(h).color };
        });
        assert.ok(luz(c.fondo) > 0.9, `clara dentro de la landing oscura (${c.fondo})`);
        assert.ok(luz(c.titulo) < 0.05, `con su texto oscuro (${c.titulo})`);
    });
});
