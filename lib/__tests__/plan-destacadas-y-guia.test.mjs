/**
 * La página pública de un plan (`/planes/<plan>`), cinco arreglos pedidos juntos:
 *
 * 1. **«Qué incluye este plan»** lleva el título CENTRADO y enseña de entrada
 *    las funciones DESTACADAS —el MISMO campo que decide la tarjeta corta de la
 *    landing, no uno nuevo—; el resto, en el orden del editor, detrás de «Ver
 *    todas las funciones». La flecha de abrir se distingue en oscuro.
 * 2. **Dentro de una función**, la fila de la guía va como la cabecera de la
 *    función: «Guía paso a paso» a la izquierda y «Ver guía» / «Ocultar guía» a
 *    la derecha.
 * 3. **Con la guía abierta el video de la función no se pinta**, ni encogido.
 * 4. **La guía desplegada sigue el TEMA de la App**: clara en claro, oscura en
 *    oscuro (antes, blanca fija).
 * 5. **La barra de arriba lleva «Inicio» a la derecha**, a la landing.
 *
 * Se monta la página de VERDAD bajo el `ThemeProvider` de next-themes y el
 * `.dark` del layout público, en Chromium sobre el CSS del build, a 1440 y 390.
 * `MODO=roto` pinta lo mismo con el código de `ANTES_REF` (15568a8) —pinchado a
 * un commit, nunca `origin/main`— y AFIRMA los fallos.
 *
 * Se levanta con `scripts/banco-plan-destacadas-y-guia.sh`.
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
const ANTES = process.env.ANTES_REF ?? "15568a8";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "plan-destacadas-y-guia");
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

/* ─── 1. Las reglas, sin navegador ────────────────────────────────────── */

test("reglas: de entrada salen las destacadas, y el resto en el orden del editor", async () => {
    if (ROTO) {
        assert.doesNotMatch(deAntes("lib/pagina-de-plan.ts") ?? "", /elRepartoDeLasFunciones/, "antes no había reparto");
        return;
    }
    const { comoFunciones, elRepartoDeLasFunciones, lasFuncionesQueSeEnsenan } = await import(join(COMPILADO, "reglas.mjs"));
    const fs_ = [1, 2, 3, 4, 5].map((n) => ({ id: `f${n}`, destacada: n % 2 === 1 }));
    const { deEntrada, resto } = elRepartoDeLasFunciones(fs_);
    assert.deepEqual(deEntrada.map((f) => f.id), ["f1", "f3", "f5"]);
    assert.deepEqual(resto.map((f) => f.id), ["f2", "f4"]);
    assert.deepEqual(elRepartoDeLasFunciones([]), { deEntrada: [], resto: [] });

    // El campo es el MISMO que el de la tarjeta corta: `destacada` de la función.
    const funciones = lasFuncionesQueSeEnsenan(comoFunciones(CRUDO), DATOS, new Map());
    assert.deepEqual(
        funciones.filter((f) => f.destacada).map((f) => f.id),
        CRUDO.filter((f) => f.destacada).map((f) => f.id),
        "las destacadas son las marcadas para la tarjeta corta",
    );
    // Una función de antes sin la marca nace destacada (la tarjeta no pierde nada).
    const sinMarca = lasFuncionesQueSeEnsenan(comoFunciones([{ id: "x", nombre: "X", descripcion: "", categoria: "general", activa: true, tutorial: null }]), DATOS, new Map());
    assert.equal(sinMarca[0]?.destacada, true);
});

test("reglas: la guía desplegada toma el tema de la App", async () => {
    if (ROTO) {
        assert.match(deAntes("components/guia/GuiaDesplegada.tsx") ?? "", /data-guia-tema="claro"/, "antes la guía era clara fija");
        return;
    }
    const { elTemaDeLaGuiaDesplegada } = await import(join(COMPILADO, "reglas.mjs"));
    assert.equal(elTemaDeLaGuiaDesplegada("light"), "claro");
    assert.equal(elTemaDeLaGuiaDesplegada("dark"), "oscuro");
    // Sin saberse todavía, oscura: la página del plan es oscura.
    assert.equal(elTemaDeLaGuiaDesplegada(undefined), "oscuro");
    // El CSS tiene la pareja oscura del atributo.
    assert.match(crudo("app/globals.css"), /\[data-guia-tema="oscuro"\]\s*\{/);
    // La de la landing sigue clara a propósito: sus capturas lo son.
    assert.match(crudo("components/guia/GuiaEnLaLanding.tsx"), /data-guia-tema="claro"/);
});

test("barrido: el bloque reutiliza la marca de la tarjeta corta y la barra lleva «Inicio»", () => {
    const pagina = sinComentarios(leer(PAGINA_DEL_PLAN) ?? "");
    if (ROTO) {
        assert.doesNotMatch(pagina, /data-ver-todas-las-funciones/, "antes no había «Ver todas las funciones»");
        assert.doesNotMatch(pagina, /data-ir-al-inicio/, "antes la barra no llevaba «Inicio»");
        assert.match(pagina, /data-video-compacto/, "antes el video se encogía al abrir la guía");
        return;
    }
    assert.match(pagina, /elRepartoDeLasFunciones\(/, "el bloque reparte con la regla compartida");
    assert.doesNotMatch(pagina, /data-video-compacto/, "el video ya no se encoge: no se pinta");
    assert.match(pagina, /href="\/inicio"[^>]*data-ir-al-inicio/, "«Inicio» lleva a la landing");
    // Ningún campo nuevo: la página no lee otra marca que `destacada`.
    assert.doesNotMatch(crudo("lib/pagina-de-plan.ts"), /enLaPaginaDeEntrada|deEntradaEnLaPagina/);
});

/* ─── 2. En el navegador ──────────────────────────────────────────────── */

async function abrir(datos, pintar, { anchos = [[1440, 900], [390, 844]], tema = "dark" } = {}) {
    const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
    const js = fs.readFileSync(join(COMPILADO, "plan.js"), "utf8");
    const json = JSON.stringify(datos).replace(/</g, "\\u003c");
    const html =
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>` +
        `<body><div id="app"></div><script>window.process=window.process||{env:{}};Object.assign(window, ${json});</script>` +
        `<script type="module">${js}</script></body></html>`;
    const servidor = http.createServer((_q, r) => {
        r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        r.end(html);
    });
    await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${servidor.address().port}/`;
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN });
    try {
        for (const [w, h] of anchos) {
            const ctx = await nav.newContext({ viewport: { width: w, height: h }, colorScheme: tema === "light" ? "light" : "dark" });
            // El tema que el cliente tiene puesto en la App (next-themes lo guarda aquí).
            await ctx.addInitScript((t) => {
                try {
                    localStorage.setItem("theme", t);
                } catch {}
            }, tema);
            const pag = await ctx.newPage();
            await pag.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
            const errores = [];
            pag.on("pageerror", (e) => errores.push(String(e?.message ?? e)));
            await pag.goto(url);
            await pag.waitForFunction(() => window.listo === true, null, { timeout: 15_000 });
            await pag.waitForTimeout(300);
            await pintar(pag, w, errores);
            await ctx.close();
        }
    } finally {
        await nav.close();
        servidor.close();
    }
}

/* El plan de ejemplo: seis funciones en el orden del editor, tres destacadas
   para la tarjeta corta y tres no. Dos con guía de la plataforma. */
const DATOS = { plan: "intermedio", nombre: "Business", creditos: 8000, catalogo: 25, precioUSD: 99, asistencia: "IA", nombresEnUso: ["Business"] };
const F = (id, nombre, destacada, tutorial) => ({ id, nombre, descripcion: `Qué hace ${nombre}.`, categoria: "general", activa: true, destacada, tutorial });
const CRUDO = [
    F("respuestas", "Respuestas automáticas", true, "agente-ia"),
    F("catalogo", "Catálogo de productos", false, "agente-ia"),
    F("youtube", "Cómo vender más", true, "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    F("soporte", "Centro de soporte", false, "https://ayuda.test/soporte"),
    F("reportes", "Reportes semanales", true, null),
    F("citas", "Agenda de citas", false, null),
];
const DESTACADAS = ["respuestas", "youtube", "reportes"];
const RESTO = ["catalogo", "soporte", "citas"];
const PAGINA = {
    plan: "intermedio",
    tipo: "IA",
    nombre: "Business",
    precio: { texto: "$99", aConsultar: false },
    video: null,
    paraQuien: { paraQuien: "Para negocios que atienden por WhatsApp todo el día.", caso: "Una clínica con tres asesores." },
    capacidad: [{ id: "creditos", icono: "creditos", titulo: "Créditos de IA", valor: "8.000", detalle: "Cada mes." }],
    funciones: [],
    preguntas: [{ question: "¿Puedo cambiar de plan?", answer: "Sí, cuando quieras." }],
    botones: { principal: { texto: "Comenzar con el plan Business", url: "/register?plan=nivel-3", externo: false }, secundario: null },
    planSuperior: null,
    meta: { titulo: "Business", descripcion: "", imagen: null },
    marca: "Verzay",
    logo: null,
    favicon: null,
    orden: ["video", "paraquien", "capacidad", "funciones", "preguntas", "comenzar"],
};
const DATOS_DEL_PLAN = { __pagina: PAGINA, __crudo: CRUDO, __datos: DATOS };

/** Un color `rgb(…)` o `rgba(…)` → [r, g, b, a]. */
const rgba = (c) => {
    const n = (c.match(/[\d.]+/g) ?? []).map(Number);
    return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1];
};
const luminancia = ([r, g, b]) => {
    const l = (v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b);
};
const contraste = (a, b) => {
    const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};
/** El código de antes nacía con todo el bloque plegado: para llegar a una función hay que abrirlo. */
async function abrirElBloqueSiNace(pag) {
    const abrir = pag.locator("[data-abrir-que-incluye]");
    if ((await abrir.count()) > 0 && (await abrir.getAttribute("aria-expanded")) === "false") await abrir.click();
}
const visibles = (pag) => pag.locator("[data-funcion]").evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.getAttribute("data-funcion")));

conNavegador("«Qué incluye»: título centrado, las destacadas de entrada y el resto con «Ver todas las funciones»", async () => {
    await abrir(DATOS_DEL_PLAN, async (pag, w, errores) => {
        if (ROTO) {
            assert.equal(await pag.locator("[data-ver-todas-las-funciones]").count(), 0, `${w}: antes no había «Ver todas»`);
            assert.ok((await pag.locator("[data-abrir-que-incluye]").count()) > 0, `${w}: antes el bloque era un encabezado plegado`);
            assert.deepEqual(await visibles(pag), [], `${w}: antes no se veía ninguna función de entrada`);
            return;
        }
        // El título, centrado dentro del bloque.
        const titulo = pag.locator("[data-titulo-del-bloque]");
        const t = await titulo.evaluate((h) => {
            const r = document.createRange();
            r.selectNodeContents(h);
            const texto = r.getBoundingClientRect();
            const caja = h.closest("[data-que-incluye]").getBoundingClientRect();
            return { centroTexto: texto.left + texto.width / 2, centroCaja: caja.left + caja.width / 2, alinea: getComputedStyle(h).textAlign };
        });
        assert.ok(Math.abs(t.centroTexto - t.centroCaja) <= 2, `${w}: el título no está centrado (${t.centroTexto} / ${t.centroCaja})`);

        // De entrada: las destacadas, en su orden, y nada más.
        assert.deepEqual(await visibles(pag), DESTACADAS, `${w}: de entrada salen las destacadas`);
        assert.equal(await pag.locator("[data-que-incluye]").getAttribute("data-que-incluye"), "destacadas");
        assert.match(await pag.locator("[data-cuantas-funciones]").innerText(), /6 funciones/);

        // El botón, centrado, debajo de las destacadas.
        const boton = pag.locator("[data-ver-todas-las-funciones]");
        assert.equal((await boton.innerText()).trim(), "Ver todas las funciones");
        assert.equal(await boton.getAttribute("aria-expanded"), "false");
        const g = await boton.evaluate((b) => {
            const r = b.getBoundingClientRect();
            const caja = b.closest("[data-que-incluye]").getBoundingClientRect();
            const ultima = [...document.querySelectorAll('[data-lista-de-funciones="destacadas"] [data-funcion]')].pop().getBoundingClientRect();
            return { centro: r.left + r.width / 2, centroCaja: caja.left + caja.width / 2, arriba: r.top, finDeLaUltima: ultima.bottom };
        });
        assert.ok(Math.abs(g.centro - g.centroCaja) <= 2, `${w}: el botón no está centrado`);
        assert.ok(g.arriba > g.finDeLaUltima, `${w}: el botón va debajo de las destacadas`);

        // Al pulsarlo: el resto, en el orden del editor, debajo de las destacadas.
        await boton.click();
        assert.deepEqual(await visibles(pag), [...DESTACADAS, ...RESTO], `${w}: salen todas`);
        assert.equal((await boton.innerText()).trim(), "Ver menos funciones");
        assert.equal(await boton.getAttribute("aria-expanded"), "true");
        assert.equal(await pag.locator("[data-que-incluye]").getAttribute("data-que-incluye"), "todas");
        await boton.click();
        assert.deepEqual(await visibles(pag), DESTACADAS, `${w}: «Ver menos» las vuelve a recoger`);
        assert.deepEqual(errores, []);
    });
});

conNavegador("la flecha de abrir se distingue sobre el fondo oscuro", async () => {
    await abrir(DATOS_DEL_PLAN, async (pag, w) => {
        await abrirElBloqueSiNace(pag);
        // La flecha de la primera función con algo que abrir.
        const cabeza = pag.locator("[data-funcion='respuestas'] [data-cabeza-de-la-funcion]");
        const c = await cabeza.evaluate((b) => {
            const svg = [...b.querySelectorAll("svg")].pop();
            const color = getComputedStyle(svg).color;
            let fondo = "rgba(0, 0, 0, 0)";
            for (let e = b; e; e = e.parentElement) {
                const f = getComputedStyle(e).backgroundColor;
                // Un velo casi transparente (el `bg-white/[0.03]` de la fila) no es el fondo que se ve.
                const alfa = /rgba\([^)]*,\s*([\d.]+)\)/.exec(f);
                if (f !== "transparent" && (!alfa || Number(alfa[1]) >= 0.5)) {
                    fondo = f;
                    break;
                }
            }
            return { color, fondo, ancho: svg.getBoundingClientRect().width };
        });
        const [r, g, b] = rgba(c.color);
        const ratio = contraste([r, g, b], rgba(c.fondo).slice(0, 3));
        if (ROTO) {
            assert.ok(ratio < 8, `${w}: antes la flecha era un gris apagado (${ratio.toFixed(1)})`);
            return;
        }
        assert.ok(ratio >= 12, `${w}: la flecha casi no se distingue (contraste ${ratio.toFixed(1)}, ${c.color} sobre ${c.fondo})`);
        assert.equal(await pag.locator("[data-funcion='respuestas'] [data-flecha-del-desplegable]").count(), 1, `${w}: la flecha es la compartida`);
    });
});

conNavegador("la guía de una función: «Guía paso a paso» a la izquierda, «Ver guía» / «Ocultar guía» a la derecha, y sin video", async () => {
    await abrir(DATOS_DEL_PLAN, async (pag, w, errores) => {
        await abrirElBloqueSiNace(pag);
        await pag.locator("[data-funcion='respuestas'] [data-cabeza-de-la-funcion]").click();
        const cuerpo = pag.locator("[data-funcion='respuestas'] [data-cuerpo-de-la-funcion]");
        await cuerpo.waitFor();
        if (ROTO) {
            const boton = cuerpo.locator("[data-ver-la-guia]");
            assert.equal((await boton.innerText()).trim(), "Ver la guía paso a paso", `${w}: antes el enlace decía otra cosa`);
            assert.equal(await cuerpo.locator("[data-titulo-de-la-guia]").count(), 0, `${w}: antes no había título a la izquierda`);
            await boton.click();
            await pag.waitForTimeout(300);
            assert.equal(await cuerpo.locator('[data-video-compacto="si"]').count(), 1, `${w}: antes el video solo se encogía`);
            return;
        }
        const fila = cuerpo.locator("[data-fila-de-la-guia]");
        const titulo = fila.locator("[data-titulo-de-la-guia]");
        const boton = fila.locator("[data-ver-la-guia]");
        assert.equal((await titulo.innerText()).trim(), "Guía paso a paso");
        assert.equal((await boton.innerText()).trim(), "Ver guía");
        // El título pegado a la izquierda de la fila y el botón a la derecha.
        const p = await fila.evaluate((f) => {
            const r = f.getBoundingClientRect();
            const t = f.querySelector("[data-titulo-de-la-guia]").getBoundingClientRect();
            const b = f.querySelector("[data-ver-la-guia]").getBoundingClientRect();
            return { izq: t.left - r.left, der: r.right - b.right, solape: t.right > b.left, misma: Math.abs(t.top + t.height / 2 - (b.top + b.height / 2)) };
        });
        assert.ok(p.izq <= 1, `${w}: el título no arranca a la izquierda (${p.izq})`);
        assert.ok(p.der <= 1, `${w}: «Ver guía» no va a la derecha (${p.der})`);
        assert.ok(!p.solape, `${w}: el título y el botón se montan`);
        assert.ok(p.misma <= 2, `${w}: no van en la misma línea`);

        // El video de la función, antes de abrir la guía.
        assert.equal(await cuerpo.locator("[data-caja-del-video]").count(), 1, `${w}: la función enseña su video`);

        await boton.click();
        assert.equal((await boton.innerText()).trim(), "Ocultar guía");
        assert.equal(await boton.getAttribute("aria-expanded"), "true");
        await cuerpo.locator("[data-guia]").waitFor({ timeout: 10_000 });
        // El video desaparece del todo: ni encogido ni con su hueco al lado.
        assert.equal(await cuerpo.locator("[data-caja-del-video]").count(), 0, `${w}: con la guía abierta el video no se pinta`);
        assert.equal(await cuerpo.locator("[data-video-del-tutorial]").count(), 0);
        const guia = await cuerpo.locator("[data-guia]").evaluate((g) => {
            const r = g.getBoundingClientRect();
            const c = g.closest("[data-cuerpo-de-la-funcion]").getBoundingClientRect();
            return { ancho: r.width, anchoDelCuerpo: c.width };
        });
        assert.ok(guia.ancho >= guia.anchoDelCuerpo - 48, `${w}: la guía no ocupa el ancho (${guia.ancho} de ${guia.anchoDelCuerpo})`);

        await boton.click();
        assert.equal((await boton.innerText()).trim(), "Ver guía");
        assert.equal(await cuerpo.locator("[data-guia]").count(), 0);
        assert.equal(await cuerpo.locator("[data-caja-del-video]").count(), 1, `${w}: al ocultarla vuelve el video`);
        assert.deepEqual(errores, []);
    });
});

/** Abre la guía de «Respuestas automáticas» y devuelve el tema que tomó y sus colores. */
async function laGuiaAbierta(pag) {
    await abrirElBloqueSiNace(pag);
    await pag.locator("[data-funcion='respuestas'] [data-cabeza-de-la-funcion]").click();
    const cuerpo = pag.locator("[data-funcion='respuestas'] [data-cuerpo-de-la-funcion]");
    await cuerpo.locator("[data-ver-la-guia]").click();
    const guia = cuerpo.locator("[data-guia]");
    await guia.waitFor({ timeout: 10_000 });
    await guia.locator("[data-seccion]").first().waitFor({ timeout: 10_000 }).catch(() => {});
    return guia.evaluate((g) => {
        const tarjeta = g.querySelector("[data-seccion]");
        const titulo = g.querySelector("h1, h2");
        return {
            tema: g.getAttribute("data-guia-tema"),
            fondo: getComputedStyle(g).backgroundColor,
            texto: titulo ? getComputedStyle(titulo).color : getComputedStyle(g).color,
            tarjeta: tarjeta ? getComputedStyle(tarjeta).backgroundColor : null,
        };
    });
}

conNavegador("la guía desplegada sigue el tema de la App: oscura en oscuro", async () => {
    await abrir(
        DATOS_DEL_PLAN,
        async (pag, w) => {
            const g = await laGuiaAbierta(pag);
            if (ROTO) {
                assert.equal(g.tema, "claro", `${w}: antes la guía era clara aunque la App fuera oscura`);
                assert.ok(luminancia(rgba(g.fondo)) > 0.8, `${w}: antes el fondo era blanco`);
                return;
            }
            assert.equal(g.tema, "oscuro", `${w}: con la App en oscuro, la guía en oscuro`);
            assert.ok(luminancia(rgba(g.fondo)) < 0.05, `${w}: el fondo de la guía no es oscuro (${g.fondo})`);
            assert.ok(contraste(rgba(g.texto), rgba(g.fondo)) >= 7, `${w}: el título no se lee sobre el fondo oscuro`);
        },
        { tema: "dark" },
    );
});

conNavegador("la guía desplegada sigue el tema de la App: clara en claro", async () => {
    await abrir(
        DATOS_DEL_PLAN,
        async (pag, w) => {
            const g = await laGuiaAbierta(pag);
            assert.equal(g.tema, "claro", `${w}: con la App en claro, la guía en claro`);
            assert.ok(luminancia(rgba(g.fondo)) > 0.8, `${w}: el fondo de la guía no es claro (${g.fondo})`);
            if (!ROTO) assert.ok(contraste(rgba(g.texto), rgba(g.fondo)) >= 7, `${w}: el título no se lee sobre el fondo claro`);
        },
        { tema: "light" },
    );
});

conNavegador("la barra de arriba: «Volver a planes» a la izquierda e «Inicio» a la derecha", async () => {
    await abrir(DATOS_DEL_PLAN, async (pag, w) => {
        if (ROTO) {
            // Antes el enlace no llevaba marca: se busca por lo que dice.
            assert.equal(await pag.getByRole("link", { name: "Volver a planes" }).count(), 1);
            assert.equal(await pag.locator("[data-ir-al-inicio]").count(), 0, `${w}: antes no había «Inicio»`);
            assert.equal(await pag.getByRole("link", { name: "Inicio", exact: true }).count(), 0, `${w}: antes no había «Inicio»`);
            return;
        }
        assert.equal(await pag.locator("[data-volver-a-planes]").count(), 1);
        const inicio = pag.locator("[data-ir-al-inicio]");
        assert.equal((await inicio.innerText()).trim(), "Inicio");
        assert.equal(await inicio.getAttribute("href"), "/inicio");
        const p = await pag.locator("[data-ancho-de-la-barra]").evaluate((b) => {
            const r = b.getBoundingClientRect();
            const v = b.querySelector("[data-volver-a-planes]").getBoundingClientRect();
            const i = b.querySelector("[data-ir-al-inicio]").getBoundingClientRect();
            const estilo = getComputedStyle(b);
            return {
                izq: v.left - r.left - parseFloat(estilo.paddingLeft),
                der: r.right - parseFloat(estilo.paddingRight) - i.right,
                misma: Math.abs(v.top + v.height / 2 - (i.top + i.height / 2)),
                ancho: document.documentElement.scrollWidth - window.innerWidth,
            };
        });
        assert.ok(Math.abs(p.izq) <= 1, `${w}: «Volver a planes» no va pegado a la izquierda`);
        assert.ok(Math.abs(p.der) <= 1, `${w}: «Inicio» no va pegado a la derecha`);
        assert.ok(p.misma <= 2, `${w}: no van en la misma línea`);
        assert.ok(p.ancho <= 0, `${w}: la página se desborda a lo ancho`);
    });
});
