/**
 * La INTRODUCCIÓN del índice de la guía (el párrafo «Leads reúne a cada
 * persona…»), PINTADA en Chromium sobre el CSS del build, dentro del mismo
 * contenedor que la página (`max-w-5xl px-4 sm:px-6`) y con el vídeo encima,
 * a 390, 768, 1024, 1280 y 1440 px.
 *
 * Lo que se mide: que cada párrafo ocupa el ancho ENTERO del contenedor —el
 * mismo que el vídeo—, sin un hueco a la derecha, y que la página no desborda.
 * Con un texto largo de verdad: con uno corto el párrafo no llena la línea y la
 * medida no ejercería nada (se mide la caja del `<p>`, que es de bloque).
 *
 * `MODO=roto` pinta la introducción de ANTES_REF (con su `max-w-3xl`) y afirma
 * el fallo: en escritorio el párrafo se queda en 768 px y deja un hueco; en
 * tablet y móvil no cambia nada.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const RAIZ = path.resolve(import.meta.dirname, "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_INTRO_REF ?? "98a247c";

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

const GUIA_ANTES = path.join(RAIZ, "components/guia/.Guia-intro-antes.tsx");
const ENTRADA = path.join(RAIZ, ".banco-intro-guia-entry.tsx");
const SALIDA = path.join(RAIZ, "lib/__tests__/.compilado/intro-de-la-guia/harness.js");
try {
    if (ROTO) fs.writeFileSync(GUIA_ANTES, execSync(`git show ${ANTES}:components/guia/Guia.tsx`, { cwd: RAIZ }).toString());
    const origen = ROTO ? "@/components/guia/.Guia-intro-antes" : "@/components/guia/Guia";
    fs.writeFileSync(
        ENTRADA,
        `import React from "react";
         import { createRoot } from "react-dom/client";
         import { IntroduccionDeLaGuia } from "${origen}";
         import { GUIA_LEADS } from "@/lib/guia-leads";
         // El contenedor de app/guia/leads/page.tsx, con el vídeo como referencia de ancho.
         createRoot(document.getElementById("app")!).render(
             <div className="mx-auto w-full max-w-5xl space-y-10 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
                 <section data-demostracion><div data-video className="aspect-[16/10] w-full rounded-2xl bg-slate-900" /></section>
                 <IntroduccionDeLaGuia introduccion={{ titulo: GUIA_LEADS.titulo, subtitulo: GUIA_LEADS.subtitulo, descripcion: GUIA_LEADS.descripcion }} />
             </div>);
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

const fallos = [];
const exigir = (bien, que) => (bien ? console.log("  ok", que) : fallos.push(que));

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
try {
    for (const ancho of [390, 768, 1024, 1280, 1440]) {
        const p = await navegador.newPage({ viewport: { width: ancho, height: 900 } });
        p.on("pageerror", (e) => fallos.push(`${ancho}: error en la página: ${e.message}`));
        await p.route("**/*", (r) => (r.request().url().startsWith("http") ? r.fulfill({ status: 204, body: "" }) : r.continue()));
        await p.setContent(html);
        await p.waitForFunction(() => window.listo === true);
        const m = await p.evaluate(() => {
            const video = document.querySelector("[data-video]").getBoundingClientRect();
            const intro = document.querySelector("[data-introduccion-de-la-guia]");
            const parrafos = [...intro.querySelectorAll(":scope > div > p")].map((e) => {
                const r = e.getBoundingClientRect();
                return { izq: r.left, der: r.right, ancho: r.width, lineas: Math.round(r.height / parseFloat(getComputedStyle(e).lineHeight)) };
            });
            return { video: { izq: video.left, der: video.right, ancho: video.width }, parrafos, desborda: document.documentElement.scrollWidth > innerWidth };
        });
        const tag = `${ancho}px`;
        exigir(m.parrafos.length > 0 && m.parrafos.some((q) => q.lineas >= 2), `${tag}: hay párrafos de varias líneas que medir`);
        const llenos = m.parrafos.every((q) => Math.abs(q.izq - m.video.izq) < 1 && Math.abs(q.der - m.video.der) < 1);
        const hueco = Math.round(Math.max(...m.parrafos.map((q) => m.video.der - q.der)));
        if (ROTO) {
            // El fallo solo existe donde el contenedor mide más de 768 px.
            if (m.video.ancho > 768 + 1) exigir(!llenos && hueco > 100, `ANTES ${tag}: el párrafo se corta a 768 px y deja ${hueco} px de hueco`);
            else exigir(llenos, `ANTES ${tag}: en tablet/móvil ya llenaba el ancho`);
            continue;
        }
        exigir(llenos, `${tag}: cada párrafo ocupa el ancho entero del contenedor (${Math.round(m.video.ancho)} px, hueco ${hueco} px)`);
        exigir(!m.desborda, `${tag}: no desborda a lo ancho`);
        await p.close();
    }
} finally {
    await navegador.close();
}
if (fallos.length) {
    console.error(`\n${fallos.length} fallos:\n - ${fallos.join("\n - ")}`);
    process.exit(1);
}
console.log(`\nla introducción de la guía ${ROTO ? "de ANTES se cortaba en escritorio, como se esperaba" : "ocupa el ancho entero"}`);
