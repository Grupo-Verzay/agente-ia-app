/**
 * Las páginas públicas en el TELÉFONO: la landing principal, las dos de
 * resellers, la página de un plan y la propuesta, pintadas de VERDAD sobre el
 * CSS del build.
 *
 * Lo que se vio: el contenedor de todas (`ANCHO_DE_LA_LANDING`) dejaba 32 px en
 * blanco a cada lado en el teléfono (64 de 390: el 16 % de la pantalla), y en
 * la propuesta, de fondo claro, se notaba más. En la bandeja de Chats, dentro
 * de la App, el contenido llena el ancho. Lo que se pide:
 *
 * 1. Por debajo de 640 px, los bloques y las tarjetas llenan el ancho de la
 *    pantalla: sin margen a los lados, y sin esquinas redondeadas ni raya
 *    lateral que la pantalla corte.
 * 2. Nada se queda sin aire que lo necesite: ningún texto, mando ni icono a
 *    menos de 12 px del borde (un título suelto no puede tocar la pantalla), y
 *    la página no se desplaza hacia los lados.
 * 3. Una tarjeta DENTRO de otra (el plan dentro de un servicio de la propuesta)
 *    no se pega al borde: queda con su aire y sus esquinas.
 * 4. Desde 640 px (tableta y computador) NADA cambia: la posición y el tamaño de
 *    cada texto y de cada caja con fondo o borde son los mismos que con el
 *    código de `ANTES_REF`, medidos pantalla por pantalla.
 *
 * `MODO=roto` pinta las mismas pantallas con el código de `ANTES_REF` —pinchado
 * a un commit, nunca `origin/main`— y AFIRMA el fallo: 32 px de margen, ni un
 * bloque pegado al borde.
 *
 * Se levanta con `scripts/banco-landing-a-borde-en-movil.sh`.
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
const ANTES_REF = process.env.ANTES_REF ?? "fb40429";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "landing-a-borde");
const HOY = join(COMPILADO, "ahora.js");
const AYER = join(COMPILADO, "antes.js");
const CSS = process.env.CSS_FILE;
const conNavegador = chromium && process.env.CHROME_BIN && CSS && fs.existsSync(CSS) && fs.existsSync(ROTO ? AYER : HOY) ? test : test.skip;
const soloBueno = ROTO ? test.skip : test;

const PANTALLAS = ["landing", "resellers", "r", "plan", "propuesta"];
const MOVILES = [360, 390, 430];
const GRANDES = [640, 768, 1024, 1280, 1440];

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deAntes = (f) => {
    try {
        return execFileSync("git", ["show", `${ANTES_REF}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const LANDINGS = [
    "app/(public)/inicio/_components/LandingClient.tsx",
    "app/(public)/resellers/_components/ResellerLandingClient.tsx",
    "app/(public)/r/[slug]/_components/ResellerLandingClient.tsx",
];

/* ─── 1. El contenedor: lo escrito ────────────────────────────────────── */

test("el contenedor: sin relleno en el teléfono y el MISMO desde `sm`", () => {
    const hoy = crudo("lib/ancho-de-la-landing.ts");
    const antes = deAntes("lib/ancho-de-la-landing.ts") ?? "";
    const caja = (src, nombre) => src.match(new RegExp(`export const ${nombre} = "([^"]+)"`))?.[1];
    if (ROTO) {
        assert.equal(caja(antes, "ANCHO_DE_LA_LANDING"), "mx-auto max-w-6xl px-8 sm:px-12 lg:px-16", "antes el teléfono llevaba 32 px por lado");
        return;
    }
    assert.equal(caja(hoy, "ANCHO_DE_LA_LANDING"), "mx-auto max-w-6xl px-0 sm:px-12 lg:px-16", "en el teléfono, a ras de pantalla");
    assert.equal(caja(hoy, "ANCHO_DE_LA_LANDING_CON_SANGRIA"), "mx-auto max-w-6xl px-4 sm:px-12 lg:px-16", "las barras llevan 16 px en el teléfono");
    // Desde `sm`, la misma caja de siempre: lo que va tras `px-N ` es idéntico.
    const desdeSm = (c) => c.split(" ").filter((t) => /^(sm|lg):/.test(t) || /^(mx-auto|max-w-6xl)$/.test(t)).join(" ");
    assert.equal(desdeSm(caja(hoy, "ANCHO_DE_LA_LANDING")), desdeSm(caja(antes, "ANCHO_DE_LA_LANDING")), "tableta y computador, sin tocar");
    assert.equal(caja(hoy, "SANGRIA_DEL_TEXTO"), "px-4 sm:px-0", "el texto suelto: 16 px en el teléfono, 0 desde `sm`");
    assert.equal(caja(hoy, "BLOQUE_A_BORDE"), "max-sm:rounded-none max-sm:border-x-0", "la tarjeta pegada al borde: sin esquinas ni raya lateral, solo en el teléfono");
});

test("barrido: ninguna pantalla pública vuelve a escribir el margen a mano", () => {
    for (const f of LANDINGS) {
        const codigo = sinComentarios(ROTO ? deAntes(f) ?? "" : crudo(f));
        if (ROTO) {
            assert.match(codigo, /px-8 py-3 sm:px-12 lg:px-16/, `${f}: antes la barra escribía su margen de 32 px`);
            continue;
        }
        assert.doesNotMatch(codigo, /px-8 py-3 sm:px-12 lg:px-16/, `${f}: la barra usa ANCHO_DE_LA_LANDING_CON_SANGRIA`);
        assert.doesNotMatch(codigo, /mx-auto max-w-6xl px-/, `${f}: el ancho viene de lib/ancho-de-la-landing.ts`);
        assert.match(codigo, /BLOQUE_A_BORDE/, `${f}: sus tarjetas llevan BLOQUE_A_BORDE`);
        assert.match(codigo, /SANGRIA_DEL_TEXTO/, `${f}: su texto suelto lleva SANGRIA_DEL_TEXTO`);
    }
    for (const f of ["app/(public)/planes/[slug]/_components/PlanDetailPage.tsx", "components/propuestas/PropuestaPublica.tsx", "components/shared/PieDeLasPublicas.tsx"]) {
        const codigo = sinComentarios(ROTO ? deAntes(f) ?? "" : crudo(f));
        if (ROTO) {
            assert.doesNotMatch(codigo, /BLOQUE_A_BORDE|SANGRIA_DEL_TEXTO/, `${f}: antes no pegaba nada al borde`);
            continue;
        }
        assert.match(codigo, /BLOQUE_A_BORDE|SANGRIA_DEL_TEXTO/, `${f}: usa las piezas del borde`);
    }
});

/* ─── 2. En el navegador ──────────────────────────────────────────────── */

const SIN_MOVIMIENTO = `*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}[style*="translateY"]{transform:none!important;opacity:1!important}`;

function documento(js, cual) {
    const css = fs.readFileSync(CSS, "utf8");
    const bundle = fs.readFileSync(js, "utf8");
    return (
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>${SIN_MOVIMIENTO}</style></head>` +
        `<body class="${cual === "propuesta" ? "bg-white" : "bg-[#0a0f1a]"}"><div id="app"></div>` +
        `<script>window.process=window.process||{env:{}};window.__cual=${JSON.stringify(cual)};</script>` +
        `<script type="module">${bundle}</script></body></html>`
    );
}

/** Abre cada pantalla en cada ancho y le pasa la página a `medir`. */
async function recorrer(js, pantallas, anchos, medir) {
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN });
    const servidores = [];
    try {
        for (const cual of pantallas) {
            const servidor = http.createServer((_q, r) => {
                r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
                r.end(documento(js, cual));
            });
            await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
            servidores.push(servidor);
            const url = `http://127.0.0.1:${servidor.address().port}/`;
            for (const ancho of anchos) {
                // Alto de sobra: todo entra en la vista y los contadores y
                // los bloques que aparecen al verse terminan de pintarse.
                const ctx = await nav.newContext({ viewport: { width: ancho, height: 12_000 } });
                const pag = await ctx.newPage();
                await pag.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
                const errores = [];
                pag.on("pageerror", (e) => errores.push(String(e?.message ?? e)));
                await pag.goto(url);
                await pag.waitForFunction(() => window.listo === true, null, { timeout: 15_000 });
                await pag.waitForTimeout(2_000);
                await medir(pag, cual, ancho, errores);
                await ctx.close();
            }
        }
    } finally {
        await nav.close();
        servidores.forEach((s) => s.close());
    }
}

/**
 * Lo que se mide de una pantalla en el navegador:
 * - `desborda`: la página se desplaza hacia los lados;
 * - `pegados`: los bloques que tocan los dos bordes de la pantalla, con su
 *   radio de esquina y su raya lateral;
 * - `juntos`: texto, mandos e iconos a menos de 12 px del borde;
 * - `huella`: la posición y el tamaño de cada texto y de cada caja con fondo o
 *   borde, para comparar dos versiones de la misma pantalla.
 *
 * Quedan fuera lo que se pinta absoluto o fijo (los resplandores del fondo, el
 * botón de WhatsApp) y lo que se sale de una caja que lo recorta (la cinta de
 * integraciones): no son bloques ni texto de lectura.
 */
function medirLaPantalla(pag) {
    return pag.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const describir = (el) => `${el.tagName.toLowerCase()}.${(el.getAttribute("class") || "").split(/\s+/).slice(0, 6).join(".")} «${(el.innerText || "").replace(/\s+/g, " ").slice(0, 36)}»`;
        // Lo que se mueve o se desplaza dentro de una caja que lo recorta (la cinta
        // de integraciones, un texto truncado) no es maqueta: se sale de su caja
        // a propósito.
        const enMovimiento = (el, b) => {
            for (let p = el; p && p !== document.body; p = p.parentElement) {
                const c = getComputedStyle(p);
                if (c.animationName !== "none") return true;
                if (p !== el && /(hidden|clip|auto|scroll)/.test(c.overflowX)) {
                    const a = p.getBoundingClientRect();
                    if (b.left < a.left - 0.5 || b.right > a.right + 0.5) return true;
                }
            }
            return false;
        };
        const redondo = (n) => Math.round(n * 100) / 100;
        const pegados = [];
        const juntos = [];
        const textos = [];
        const cajas = [];
        for (const el of document.querySelectorAll("#app *")) {
            const b = el.getBoundingClientRect();
            const c = getComputedStyle(el);
            if (c.display === "none" || c.visibility === "hidden" || c.position === "absolute" || c.position === "fixed") continue;
            if (b.width < 2 || b.height < 2 || enMovimiento(el, b)) continue;
            const radio = parseFloat(c.borderTopLeftRadius) + parseFloat(c.borderBottomLeftRadius);
            const raya = parseFloat(c.borderLeftWidth) + parseFloat(c.borderRightWidth);
            const conFondo = c.backgroundColor !== "rgba(0, 0, 0, 0)" || c.backgroundImage !== "none";
            const esCaja = radio > 0 || raya > 0 || conFondo || parseFloat(c.borderTopWidth) > 0;
            if (esCaja && !el.closest("[data-chat-quieto]")) cajas.push([redondo(b.left), redondo(b.top), redondo(b.width), redondo(b.height)]);
            if (b.left <= 0.5 && b.right >= W - 0.5 && (radio > 0 || raya > 0)) pegados.push({ radio, raya, d: describir(el) });

            const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
            const mando = el.matches("button, a, input, select, textarea") && (raya > 0 || conFondo);
            const icono = el.matches("svg, img");
            if (!(propio || mando || icono)) continue;
            const recorta = /(hidden|clip)/.test(c.overflowX);
            let izq = b.left;
            let der = b.right;
            if (propio && !mando && !icono) {
                const rango = document.createRange();
                const rects = [];
                for (const n of el.childNodes) {
                    if (n.nodeType === 3 && n.textContent.trim()) {
                        rango.selectNodeContents(n);
                        rects.push(...rango.getClientRects());
                    }
                }
                if (rects.length) {
                    if (!recorta) {
                        izq = Math.min(...rects.map((r) => r.left));
                        der = Math.max(...rects.map((r) => r.right));
                    }
                    for (const r of rects) textos.push([redondo(r.left), redondo(r.top), redondo(r.width), redondo(r.height)]);
                }
            }
            if (izq < 12 || der > W - 12) juntos.push({ izq: Math.round(izq), der: Math.round(W - der), d: describir(el) });
        }
        return { ancho: W, desborda: document.documentElement.scrollWidth > W, pegados, juntos, huella: { textos, cajas } };
    });
}

conNavegador("en el teléfono los bloques llenan el ancho, sin esquinas cortadas, y el texto no toca el borde", async () => {
    await recorrer(ROTO ? AYER : HOY, PANTALLAS, MOVILES, async (pag, cual, ancho, errores) => {
        const m = await medirLaPantalla(pag);
        const donde = `${cual} a ${ancho}`;
        assert.deepEqual(errores, [], `${donde}: errores en la página`);
        if (ROTO) {
            assert.deepEqual(m.pegados, [], `${donde}: antes ningún bloque llegaba al borde (dejaba 32 px por lado)`);
            return;
        }
        assert.equal(m.desborda, false, `${donde}: la página se desplaza hacia los lados`);
        assert.deepEqual(m.pegados, [], `${donde}: un bloque pegado a los dos bordes conserva esquina o raya lateral:\n${m.pegados.map((p) => `  r${p.radio} b${p.raya} ${p.d}`).join("\n")}`);
        assert.deepEqual(m.juntos, [], `${donde}: texto, mando o icono a menos de 12 px del borde:\n${m.juntos.map((j) => `  izq ${j.izq} der ${j.der} ${j.d}`).join("\n")}`);
    });
});

conNavegador("el primer nivel de cada pantalla llega de borde a borde, y lo de dentro no", async () => {
    // Las tarjetas que tienen que llenar el ancho a 390 px, y las que van
    // DENTRO de otra y se quedan con su aire. Todo con atributos que ya existen.
    const llenan = {
        propuesta: ["[data-hero]", "[data-items] > ol > li", "[data-mantenimiento]", "[data-nota]", "[data-condiciones]", "[data-pago]"],
        plan: ["[data-marco-del-video]", "[data-para-quien]", "[data-caso-tipico]", "[data-capacidad]", "[data-funcion]", "[data-pregunta]", "[data-tarjeta-del-todo-incluido]"],
        landing: ["[data-bloque-de-agencias]", "section#faq .overflow-hidden"],
    };
    const dentro = {
        propuesta: ["[data-plan-en-la-propuesta] [data-capacidad]", "[data-plan-en-la-propuesta] [data-funcion]", "[data-plan-en-la-propuesta] [data-tarjeta-del-todo-incluido]", "[data-plan-en-la-propuesta] [data-marco-del-video]"],
    };
    await recorrer(ROTO ? AYER : HOY, ["landing", "plan", "propuesta"], [390], async (pag, cual, ancho) => {
        for (const sel of llenan[cual] ?? []) {
            const cajas = await pag.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const b = e.getBoundingClientRect(); return { izq: b.left, der: innerWidth - b.right }; }), sel);
            assert.ok(cajas.length > 0, `${cual}: no hay «${sel}» que medir`);
            for (const c of cajas) {
                if (ROTO) assert.ok(c.izq >= 31 && c.der >= 31, `${cual} ${sel}: antes dejaba ${Math.round(c.izq)}/${Math.round(c.der)} px a los lados`);
                else assert.ok(c.izq <= 0.5 && c.der <= 0.5, `${cual} ${sel}: deja ${Math.round(c.izq)}/${Math.round(c.der)} px a los lados`);
            }
        }
        if (ROTO) return;
        for (const sel of dentro[cual] ?? []) {
            const cajas = await pag.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const b = e.getBoundingClientRect(); const c = getComputedStyle(e); return { izq: b.left, der: innerWidth - b.right, radio: parseFloat(c.borderTopLeftRadius) }; }), sel);
            assert.ok(cajas.length > 0, `${cual}: no hay «${sel}» que medir`);
            for (const c of cajas) {
                assert.ok(c.izq >= 16 && c.der >= 16, `${cual} ${sel}: una tarjeta de dentro se pegó al borde (${Math.round(c.izq)}/${Math.round(c.der)})`);
                assert.ok(c.radio > 0, `${cual} ${sel}: una tarjeta de dentro perdió sus esquinas`);
            }
        }
    });
});

const comparar = (a, b) => {
    if (a.length !== b.length) return `${a.length} contra ${b.length} elementos`;
    for (let i = 0; i < a.length; i++) {
        if (a[i].some((v, k) => Math.abs(v - b[i][k]) > 0.02)) return `el elemento ${i}: ${JSON.stringify(a[i])} contra ${JSON.stringify(b[i])}`;
    }
    return null;
};

conNavegador("desde 640 px NADA cambia: cada texto y cada caja, en el mismo sitio y del mismo tamaño que antes", async () => {
    if (ROTO) return; // Aquí se compara contra el código de antes: no hay «roto» de lo que no cambia.
    assert.ok(fs.existsSync(AYER), "falta el paquete de antes (lo compila el banco)");
    const huellas = { ahora: {}, antes: {} };
    for (const [que, js] of [["ahora", HOY], ["antes", AYER]]) {
        await recorrer(js, PANTALLAS, GRANDES, async (pag, cual, ancho) => {
            const m = await medirLaPantalla(pag);
            huellas[que][`${cual} a ${ancho}`] = { ...m.huella, desborda: m.desborda };
        });
    }
    for (const clave of Object.keys(huellas.ahora)) {
        const t = comparar(huellas.ahora[clave].textos, huellas.antes[clave].textos);
        assert.equal(t, null, `${clave}: los TEXTOS se movieron — ${t}`);
        const c = comparar(huellas.ahora[clave].cajas, huellas.antes[clave].cajas);
        assert.equal(c, null, `${clave}: las CAJAS se movieron — ${c}`);
        assert.equal(huellas.ahora[clave].desborda, huellas.antes[clave].desborda, `${clave}: la página se desplaza hacia los lados distinto que antes`);
        assert.ok(huellas.ahora[clave].textos.length > 20, `${clave}: casi no hay texto que comparar (${huellas.ahora[clave].textos.length})`);
    }
});
