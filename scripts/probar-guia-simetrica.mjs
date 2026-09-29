/**
 * La cuadrícula de secciones de la guía, PINTADA en Chromium sobre el CSS del
 * build, con 1..9 secciones a 390, 768, 1024 y 1440 px.
 *
 * Lo que la regla pura no puede decir: que las clases existen en el CSS
 * compilado (Tailwind solo genera lo que ve escrito) y que con ellas cada fila
 * queda LLENA de verdad — se miden las cajas, se agrupan por fila y cada fila
 * tiene que ocupar el ancho entero, sin un hueco, y con todas sus tarjetas del
 * mismo alto.
 *
 * `MODO=roto` pinta la cuadrícula del índice de ANTES_REF (sus tarjetas, sin
 * cierre) y afirma el fallo: con 7 secciones la última fila queda a medias.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const RAIZ = path.resolve(import.meta.dirname, "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "153f64f";

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

const GUIA_ANTES = path.join(RAIZ, "components/guia/.Guia-antes.tsx");
const ENTRADA = path.join(RAIZ, ".banco-guia-simetrica-entry.tsx");
const SALIDA = path.join(RAIZ, "lib/__tests__/.compilado/cierre-de-la-guia/harness.js");
try {
    if (ROTO) fs.writeFileSync(GUIA_ANTES, execSync(`git show ${ANTES}:components/guia/Guia.tsx`, { cwd: RAIZ }).toString());
    const cuadricula = ROTO
        ? `import { TarjetaDeSeccion } from "@/components/guia/.Guia-antes";
           // La cuadrícula del índice de ANTES, tal cual la escribía la página.
           const Cuadricula = ({ secciones }: any) => (
               <div data-cuadricula-de-secciones className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                   {secciones.map((s: any, i: number) => <TarjetaDeSeccion key={s.slug} seccion={s} numero={i + 1} />)}
               </div>);`
        : `import { CuadriculaDeSecciones } from "@/components/guia/Guia";
           const Cuadricula = ({ secciones }: any) => (
               <CuadriculaDeSecciones secciones={secciones} moduloPath="/guia/leads" contactoHref="https://wa.me/1" videoHref="#demostracion" />);`;
    fs.writeFileSync(
        ENTRADA,
        `import React from "react";
         import { createRoot } from "react-dom/client";
         import { SECCIONES } from "@/lib/guia-leads";
         ${cuadricula}
         const raiz = createRoot(document.getElementById("app")!);
         (window as any).pintar = (n: number) => {
             const secs = Array.from({ length: n }, (_, i) => ({ ...SECCIONES[i % SECCIONES.length], slug: "s" + i }));
             raiz.render(<div style={{ maxWidth: "64rem", margin: "0 auto", padding: "0 16px" }}><Cuadricula secciones={secs} /></div>);
         };
         (window as any).listo = true;`,
    );
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

const fallos = [];
const exigir = (bien, que) => (bien ? console.log("  ok", que) : fallos.push(que));

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
try {
    for (const ancho of [390, 768, 1024, 1440]) {
        const p = await navegador.newPage({ viewport: { width: ancho, height: 900 } });
        p.on("pageerror", (e) => fallos.push(`${ancho}: error en la página: ${e.message}`));
        await p.route("**/*", (r) => (r.request().url().startsWith("http") ? r.fulfill({ status: 204, body: "" }) : r.continue()));
        await p.setContent(html);
        await p.waitForFunction(() => window.listo === true);
        const columnas = ancho >= 1024 ? 3 : ancho >= 640 ? 2 : 1;
        for (const n of ROTO ? [7] : [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
            await p.evaluate((n) => window.pintar(n), n);
            await p.waitForTimeout(30);
            const m = await p.evaluate(() => {
                const g = document.querySelector("[data-cuadricula-de-secciones]");
                const gr = g.getBoundingClientRect();
                const gap = parseFloat(getComputedStyle(g).columnGap) || 0;
                const hijos = [...g.children]
                    .filter((e) => getComputedStyle(e).display !== "none")
                    .map((e) => {
                        const r = e.getBoundingClientRect();
                        return { tipo: e.getAttribute("data-tarjeta-de-cierre") ?? "seccion", x: r.left - gr.left, top: Math.round(r.top), w: r.width, h: r.height };
                    });
                return { ancho: gr.width, gap, hijos, desborda: document.documentElement.scrollWidth > innerWidth };
            });
            const filas = new Map();
            for (const h of m.hijos) filas.set(h.top, [...(filas.get(h.top) ?? []), h]);
            const tag = `${ancho}px (${columnas} col) · ${n} secciones`;
            const llenas = [...filas.values()].every((f) => {
                const ocupado = f.reduce((s, h) => s + h.w, 0) + m.gap * (f.length - 1);
                const mismoAlto = f.every((h) => Math.abs(h.h - f[0].h) < 1);
                return Math.abs(ocupado - m.ancho) < 2 && Math.abs(f[0].x) < 1 && mismoAlto;
            });
            if (ROTO) {
                const sinCierre = !m.hijos.some((h) => h.tipo !== "seccion");
                exigir(sinCierre, `ANTES ${tag}: no hay tarjetas de cierre`);
                if (columnas > 1) exigir(!llenas, `ANTES ${tag}: la última fila queda a medias`);
                continue;
            }
            exigir(llenas, `${tag}: cada fila llena el ancho, sin hueco, y del mismo alto`);
            const contacto = m.hijos.filter((h) => h.tipo === "contacto");
            const video = m.hijos.filter((h) => h.tipo === "video");
            exigir(contacto.length === 1, `${tag}: siempre un «Contáctanos»`);
            const huecos = (columnas - (n % columnas)) % columnas;
            exigir(video.length === (columnas > 1 && huecos === 2 ? 1 : 0), `${tag}: «Ver el vídeo» solo con dos huecos`);
            if (columnas > 1 && huecos === 0)
                exigir(Math.abs(contacto[0].w - m.ancho) < 2, `${tag}: sin huecos, «Contáctanos» a todo el ancho y en fila nueva`);
            exigir(contacto[0].top >= Math.max(...m.hijos.filter((h) => h.tipo === "seccion").map((h) => h.top)), `${tag}: el cierre va detrás de las secciones`);
            exigir(!m.desborda, `${tag}: no desborda a lo ancho`);
        }
        await p.close();
    }
} finally {
    await navegador.close();
}
if (fallos.length) {
    console.error(`\n${fallos.length} fallos:\n - ${fallos.join("\n - ")}`);
    process.exit(1);
}
console.log(`\nla cuadrícula de la guía ${ROTO ? "de ANTES falla como se esperaba" : "queda simétrica"}`);
