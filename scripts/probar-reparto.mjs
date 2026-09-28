/**
 * La barra de Auto-asignación de Equipo, en la página SERVIDA: los tres modos
 * excluyentes, el campo de porcentaje por asesor, la suma, que una suma mala no
 * se guarda y que una buena sí (se relee tras recargar), y que la barra no
 * desborda a 1440/1280/1024.
 *
 *   BASE=http://localhost:3999 node scripts/probar-reparto.mjs
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(`${process.env.NODE_PATH ?? ""}/playwright`)); }

const BASE = process.env.BASE ?? "http://localhost:3999";
const fallos = [];
const exigir = (bien, que) => { if (!bien) fallos.push(que); console.log(`${bien ? "ok " : "MAL"} ${que}`); };

const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const p = await contexto.newPage();
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2500);
await p.fill('input[name="email"]', "jefe-reparto@banco.test");
await p.fill('input[name="password"]', "banco1234");
await p.click('button[type="submit"]');
for (let i = 0; i < 120 && p.url().includes("/login"); i++) await p.waitForTimeout(500);
await p.goto(`${BASE}/equipo`, { waitUntil: "networkidle" });
await p.keyboard.press("Escape").catch(() => {});

const grupo = p.locator('[data-grupo="modo-de-reparto"]');
await grupo.waitFor({ timeout: 30000 });
const modos = await grupo.locator('[role="radio"]').allTextContents();
exigir(JSON.stringify(modos) === JSON.stringify(["Máx. chats", "Ilimitado", "Por porcentaje"]), `tres modos: ${modos.join(" | ")}`);
exigir(await p.locator('[data-modo="maximo"][aria-checked="true"]').count() === 1, "arranca en Máx. chats");
exigir(await p.locator('[data-columna="porcentaje"]').count() === 0, "sin columna de porcentaje en Máx. chats");

// Simetría: los botones de modo miden lo mismo de alto que Tabla / Pipeline.
const altoModo = await p.locator('[data-modo="maximo"]').evaluate((e) => e.getBoundingClientRect().height);
const altoVista = await p.getByRole("button", { name: "Tabla" }).evaluate((e) => e.getBoundingClientRect().height);
exigir(Math.abs(altoModo - altoVista) < 0.5, `mismo alto que Tabla/Pipeline (${altoModo} vs ${altoVista})`);

await p.locator('[data-modo="porcentaje"]').click();
await p.waitForTimeout(1500);
exigir(await p.locator('[data-modo="porcentaje"][aria-checked="true"]').count() === 1, "Por porcentaje queda marcado (excluyente)");
exigir(await p.locator('[data-modo="maximo"][aria-checked="true"]').count() === 0, "Máx. chats se desmarca");
exigir(await p.locator('#max-chats').count() === 0, "el campo de Máx. chats desaparece");
const inputs = p.locator('[data-celda-porcentaje] input');
exigir(await inputs.count() === 3, "un campo de porcentaje por asesor");
const valores = await inputs.evaluateAll((es) => es.map((e) => Number(e.value)));
exigir(valores.reduce((a, b) => a + b, 0) === 100, `arranca a partes iguales sumando 100 (${valores})`);
exigir((await p.locator("[data-suma-del-reparto]").textContent()).includes("Suma 100%"), "la suma dice 100%");

// Suma mala: se avisa y no se guarda.
await inputs.nth(0).fill("10");
await inputs.nth(0).blur();
await p.waitForTimeout(800);
exigir((await p.locator("[data-suma-del-reparto]").textContent()).includes("debe ser 100%"), "suma mala avisa");

// Suma buena: 50/30/20 y se guarda.
await inputs.nth(0).fill("50");
await inputs.nth(1).fill("30");
await inputs.nth(2).fill("20");
await inputs.nth(2).blur();
await p.waitForTimeout(2000);

for (const ancho of [1440, 1280, 1024]) {
    await p.setViewportSize({ width: ancho, height: 900 });
    await p.waitForTimeout(300);
    const desborda = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    exigir(!desborda, `a ${ancho} la página no desborda a lo ancho`);
    await p.screenshot({ path: `/tmp/claude-0/equipo-${ancho}.png` });
}

await p.reload({ waitUntil: "networkidle" });
await p.locator('[data-grupo="modo-de-reparto"]').waitFor();
exigir(await p.locator('[data-modo="porcentaje"][aria-checked="true"]').count() === 1, "tras recargar sigue en Por porcentaje");
const guardados = await p.locator('[data-celda-porcentaje] input').evaluateAll((es) => es.map((e) => Number(e.value)));
exigir(JSON.stringify(guardados) === "[50,30,20]", `tras recargar lee 50/30/20 (${guardados})`);

await p.locator('[data-modo="ilimitado"]').click();
await p.waitForTimeout(1500);
await p.reload({ waitUntil: "networkidle" });
await p.locator('[data-grupo="modo-de-reparto"]').waitFor();
exigir(await p.locator('[data-modo="ilimitado"][aria-checked="true"]').count() === 1, "Ilimitado guardado y porcentaje apagado");
exigir(await p.locator('[data-columna="porcentaje"]').count() === 0, "en Ilimitado no hay columna de porcentaje");

await navegador.close();
if (fallos.length) { console.error(`\n${fallos.length} fallo(s)`); process.exit(1); }
console.log("\ntodo bien");
