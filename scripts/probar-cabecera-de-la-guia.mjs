/**
 * La BARRA de arriba de la guía pública, PINTADA en Chromium sobre el CSS del
 * build, a 360, 390, 768, 1024, 1280 y 1440 px.
 *
 * Lo que se mide (índice):
 *   - una sola fila compacta (56 px + su raya), con «Guía de la plataforma» a
 *     la izquierda, «▶ Demostración en 1 minuto» en el CENTRO y «Módulo Leads»
 *     a la derecha, los tres a la misma altura;
 *   - simetría: el centro de la demostración cae en el centro de la barra, y el
 *     hueco del lado izquierdo al borde es el mismo que el del derecho;
 *   - ningún texto recortado (la «Guía de la plataforma» se queda en su icono
 *     en un teléfono, a propósito) y la página no desborda;
 *   - el vídeo arranca JUSTO debajo de la barra, con el mismo aire arriba que
 *     a los lados, y entre la barra y el vídeo no hay ningún título.
 * Y en una sección (con «volver») la barra sigue siendo una fila sin centro.
 *
 * El contenedor y la sección del vídeo se leen de `app/guia/leads/page.tsx`
 * (sus clases), para medir lo que la página pinta y no una copia.
 *
 * `MODO=roto` pinta la barra y la página de ANTES_REF y afirma el fallo: la
 * barra sin la demostración y un título aparte encima del vídeo.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const RAIZ = path.resolve(import.meta.dirname, "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_CABECERA_REF ?? "9e38996";

const esbuildMain = (() => {
    try {
        return require.resolve("esbuild");
    } catch {
        const npx = path.join(process.env.HOME ?? "/root", ".npm", "_npx");
        for (const d of fs.readdirSync(npx)) {
            const m = path.join(npx, d, "node_modules", "esbuild", "lib", "main.js");
            if (fs.existsSync(m)) return m;
        }
        throw new Error("sin esbuild");
    }
})();
const { build } = require(esbuildMain);

const leer = (fichero) =>
    ROTO ? execSync(`git show ${ANTES}:${fichero}`, { cwd: RAIZ }).toString() : fs.readFileSync(path.join(RAIZ, fichero), "utf8");

// La página: de ahí salen el contenedor y la sección del vídeo, tal cual.
const pagina = leer("app/guia/leads/page.tsx");
const contenedor = pagina.match(/<div className="(mx-auto w-full max-w-5xl[^"]*)">/)?.[1];
const seccion = pagina.match(/<section id="demostracion"[^>]*className="([^"]*)"/)?.[1];
if (!contenedor || !seccion) throw new Error("no se encontró el contenedor o la sección del vídeo en la página");
// Lo que la página pinta entre el <section> y el vídeo (el título aparte, si lo hay).
const entreSeccionYVideo = pagina.slice(pagina.indexOf('<section id="demostracion"'), pagina.indexOf("<video"));
const tituloAparte = /Demostración en 1 minuto/.test(entreSeccionYVideo);
const cabeceraConDemo = /<CabeceraDeLaGuia[^>]*demostracion=/.test(pagina);

const GUIA_ANTES = path.join(RAIZ, "components/guia/.Guia-cabecera-antes.tsx");
const ENTRADA = path.join(RAIZ, ".banco-cabecera-guia-entry.tsx");
const SALIDA = path.join(RAIZ, "lib/__tests__/.compilado/cabecera-de-la-guia/harness.js");
try {
    if (ROTO) fs.writeFileSync(GUIA_ANTES, leer("components/guia/Guia.tsx"));
    const origen = ROTO ? "@/components/guia/.Guia-cabecera-antes" : "@/components/guia/Guia";
    const props = ROTO ? "" : `demostracion={{ href: "#demostracion", texto: "Demostración en 1 minuto" }} modulo="Leads"`;
    fs.writeFileSync(
        ENTRADA,
        `import React from "react";
         import { createRoot } from "react-dom/client";
         import { CabeceraDeLaGuia } from "${origen}";
         const vista = new URLSearchParams(location.search).get("vista");
         createRoot(document.getElementById("app")!).render(
             vista === "seccion"
                 ? <CabeceraDeLaGuia volver={{ href: "/guia/leads", texto: "Todas las secciones" }} />
                 : <>
                     <CabeceraDeLaGuia ${props} />
                     <div className=${JSON.stringify(contenedor)}>
                         <section id="demostracion" data-demostracion className=${JSON.stringify(seccion)}>
                             ${tituloAparte ? `<h2 data-titulo-aparte className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">Demostración en 1 minuto</h2>` : ""}
                             <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-sm">
                                 <div data-video className="block aspect-[16/10] w-full bg-slate-900" />
                             </div>
                         </section>
                     </div>
                   </>);
         (window as any).listo = true;`,
    );
    fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
    await build({
        entryPoints: [ENTRADA],
        bundle: true,
        format: "iife",
        outfile: SALIDA,
        jsx: "automatic",
        define: { "process.env.NODE_ENV": '"production"' },
        alias: { "@": RAIZ },
        logLevel: "error",
    });
} finally {
    fs.rmSync(ENTRADA, { force: true });
    fs.rmSync(GUIA_ANTES, { force: true });
}

const cssDir = path.join(RAIZ, ".next/static/css");
const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(path.join(cssDir, f), "utf8")).join("\n");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style><script>window.process={env:{}};</script></head><body class="bg-slate-50"><div id="app"></div>
<script>${fs.readFileSync(SALIDA, "utf8")}</script></body></html>`;
const ARCHIVO = path.join(path.dirname(SALIDA), "pagina.html");
fs.writeFileSync(ARCHIVO, html);

const fallos = [];
const exigir = (bien, que) => (bien ? console.log("  ok", que) : fallos.push(que));

if (ROTO) {
    exigir(tituloAparte, "ANTES: la página pinta «Demostración en 1 minuto» como título aparte encima del vídeo");
    exigir(!cabeceraConDemo, "ANTES: la barra de arriba no lleva la demostración");
} else {
    exigir(!tituloAparte, "no hay título aparte entre la sección y el vídeo");
    exigir(cabeceraConDemo, "la página le pasa la demostración a la barra");
}

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
try {
    for (const ancho of [360, 390, 768, 1024, 1280, 1440]) {
        for (const vista of ["indice", "seccion"]) {
            const p = await navegador.newPage({ viewport: { width: ancho, height: 800 } });
            p.on("pageerror", (e) => fallos.push(`${ancho} ${vista}: error en la página: ${e.message}`));
            await p.goto(`file://${ARCHIVO}?vista=${vista}`);
            await p.waitForFunction(() => window.listo === true);
            await p.evaluate(() => document.fonts.ready);
            const m = await p.evaluate(() => {
                const caja = (e) => {
                    if (!e) return null;
                    const r = e.getBoundingClientRect();
                    return { izq: r.left, der: r.right, arr: r.top, aba: r.bottom, ancho: r.width, medio: (r.top + r.bottom) / 2 };
                };
                const cab = document.querySelector("header");
                const fila = cab.firstElementChild;
                const estilo = getComputedStyle(fila);
                const textos = [...cab.querySelectorAll("span, a")]
                    .filter((e) => getComputedStyle(e).position !== "absolute" && e.children.length === 0 && e.textContent.trim())
                    .map((e) => ({ texto: e.textContent.trim(), recortado: e.scrollWidth > e.clientWidth + 1 }));
                const cent = [...cab.querySelectorAll("a, span")].find((e) => e.textContent.trim() === "Demostración en 1 minuto");
                const izq = cab.querySelector("svg");
                const der = [...cab.querySelectorAll("span")].find((e) => /^Módulo/.test(e.textContent.trim()));
                return {
                    cabecera: caja(cab),
                    relleno: parseFloat(estilo.paddingLeft),
                    fila: caja(fila),
                    centro: caja(cent),
                    iconoIzq: caja(izq),
                    derecho: caja(der),
                    textos,
                    video: caja(document.querySelector("[data-video]")?.parentElement),
                    gutter: (() => { const c = document.querySelector("[data-demostracion]")?.parentElement; return c ? parseFloat(getComputedStyle(c).paddingLeft) : 0; })(),
                    titulos: [...document.querySelectorAll("h1,h2,h3")].map((h) => h.textContent.trim()),
                    desborda: document.documentElement.scrollWidth > innerWidth,
                };
            });
            const tag = `${ancho}px ${vista}`;
            await p.close();
            if (ROTO) {
                if (vista === "indice") {
                    exigir(!m.centro, `ANTES ${tag}: la barra no tiene «Demostración en 1 minuto»`);
                    exigir(m.titulos.includes("Demostración en 1 minuto") && m.video.arr - m.cabecera.aba > 40,
                        `ANTES ${tag}: un título aparte empuja el vídeo ${Math.round(m.video.arr - m.cabecera.aba)} px bajo la barra`);
                }
                continue;
            }
            exigir(Math.round(m.cabecera.aba - m.cabecera.arr) === 57, `${tag}: la barra es una sola fila compacta (${Math.round(m.cabecera.aba - m.cabecera.arr)} px)`);
            exigir(m.textos.every((t) => !t.recortado), `${tag}: ningún texto recortado ${JSON.stringify(m.textos.filter((t) => t.recortado))}`);
            exigir(!m.desborda, `${tag}: no desborda a lo ancho`);
            const hIzq = m.iconoIzq.izq - m.fila.izq;
            const hDer = m.fila.der - m.derecho.der;
            // En una sección el lado izquierdo es el «volver», con su -ml-2 y su px-2: el icono queda en el relleno.
            exigir(Math.abs(hIzq - m.relleno) < 1 && Math.abs(hDer - m.relleno) < 1,
                `${tag}: el lado izquierdo y el derecho quedan a la misma distancia del borde (${hIzq.toFixed(1)} / ${hDer.toFixed(1)} px)`);
            exigir(Math.abs(m.iconoIzq.medio - m.derecho.medio) < 1, `${tag}: izquierda y derecha a la misma altura`);
            if (vista === "seccion") {
                exigir(!m.centro, `${tag}: en una sección la barra no ofrece la demostración`);
                continue;
            }
            exigir(!!m.centro, `${tag}: la barra lleva «Demostración en 1 minuto»`);
            const medioBarra = (m.fila.izq + m.fila.der) / 2;
            const medioCentro = (m.centro.izq + m.centro.der) / 2;
            exigir(Math.abs(medioBarra - medioCentro) < 1, `${tag}: la demostración cae en el centro de la barra (desvío ${(medioCentro - medioBarra).toFixed(1)} px)`);
            exigir(Math.abs(m.centro.medio - m.derecho.medio) < 1, `${tag}: los tres a la misma altura`);
            exigir(!m.titulos.includes("Demostración en 1 minuto"), `${tag}: ningún título repetido encima del vídeo`);
            const aireArriba = m.video.arr - m.cabecera.aba;
            const aireLado = m.gutter;
            exigir(Math.abs(aireArriba - aireLado) < 1.5, `${tag}: el vídeo arranca justo bajo la barra, con el aire de los lados (${aireArriba.toFixed(1)} / ${aireLado.toFixed(1)} px)`);
        }
    }
} finally {
    await navegador.close();
}
if (fallos.length) {
    console.error(`\n${fallos.length} fallos:\n - ${fallos.join("\n - ")}`);
    process.exit(1);
}
console.log(`\nla barra de la guía ${ROTO ? "de ANTES tenía el título aparte, como se esperaba" : "es una sola fila simétrica con la demostración"}`);
