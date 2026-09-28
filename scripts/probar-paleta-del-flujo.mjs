/**
 * La paleta «Selecciona una acción» del creador de flujos es una COLUMNA del
 * contenido, no una hoja pegada a la ventana. Sobre la página SERVIDA, con
 * sesión de verdad y la paleta abierta, a 1440, 1280 y 1024:
 *
 * 1. Sin ningún panel, la paleta acaba en el filo derecho de la caja del
 *    contenido y empieza donde empieza la caja: no tapa la barra de arriba.
 * 2. Con cada panel del borde (nota rápida, copiloto, chat del equipo) la
 *    paleta se CORRE con el contenido: acaba justo donde empieza el panel,
 *    sin hueco ni solape, y su contenido se VE — el centro de la paleta y su
 *    primera acción son de la paleta, no del panel que tenía encima.
 * 3. La página no se desplaza a lo ancho, y al cerrar vuelve a su sitio.
 *
 * Sale con 1 si algo no cuadra y 2 si no pudo ni medir. `MODO=roto` —con un
 * `.next` del commit de antes— tiene que salir con 1.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3932";
const FLUJO = process.env.FLUJO;
const TOL = 1.5;
const VENTANAS = [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
];
const PANELES = [
    { nombre: "Nota rápida", abrir: 'button[aria-label="Abrir la nota rápida"]', cerrar: 'button[aria-label="Cerrar la nota rápida"]', hoja: '[data-panel="panel-nota-rapida"]' },
    { nombre: "Copiloto", abrir: 'button[aria-label="Abrir copiloto"]', cerrar: 'button[aria-label="Cerrar copiloto"]', hoja: "#ai-chat-sheet-desktop" },
    { nombre: "Chat del equipo", abrir: 'button[aria-label="Abrir chat del equipo"]', cerrar: 'button[aria-label="Cerrar chat del equipo"]', hoja: "#chat-equipo-escritorio" },
];

const fallos = [];
const exigir = (bien, que) => { if (!bien) fallos.push(que); };
const casi = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= TOL;

async function entrar(contexto) {
    const pagina = await contexto.newPage();
    for (let intento = 0; intento < 2; intento += 1) {
        await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
        await pagina.waitForTimeout(2500 + intento * 3000);
        await pagina.fill('input[name="email"]', "jefe@banco.test");
        await pagina.fill('input[name="password"]', "banco1234");
        await pagina.click('button[type="submit"]');
        for (let i = 0; i < 120 && pagina.url().includes("/login"); i += 1) await pagina.waitForTimeout(500);
        if (!pagina.url().includes("/login")) return pagina;
    }
    throw new Error("no se pudo entrar");
}

async function apartarLoQueTapa(pagina) {
    for (let i = 0; i < 4; i += 1) {
        if (!(await pagina.$('div[data-state="open"].fixed.inset-0'))) break;
        await pagina.keyboard.press("Escape");
        await pagina.waitForTimeout(250);
    }
}

async function pulsarVisible(pagina, selector) {
    for (const b of await pagina.$$(selector)) {
        if (await b.isVisible()) { await b.click(); return true; }
    }
    return false;
}

/** La paleta es el `[data-sidebar=sidebar]` que dice «Selecciona una acción». */
function medir(hojaSel) {
    const interior = Array.from(document.querySelectorAll('[data-sidebar="sidebar"]'))
        .find((n) => n.textContent?.includes("Selecciona una acción"));
    const paleta = interior?.parentElement;
    const rp = paleta?.getBoundingClientRect();
    const caja = document.querySelector("[data-caja-del-contenido]") ?? document.querySelector(".app-module-content");
    const rc = caja?.getBoundingClientRect();
    const hoja = hojaSel && Array.from(document.querySelectorAll(hojaSel)).find((h) => {
        const r = h.getBoundingClientRect();
        return r.width > 0 && r.left < window.innerWidth - 20;
    });
    const rh = hoja?.getBoundingClientRect();
    const deLaPaleta = (x, y) => {
        const n = document.elementFromPoint(x, y);
        return !!n && !!paleta && paleta.contains(n);
    };
    const accion = Array.from(interior?.querySelectorAll("button") ?? []).find((b) => b.textContent?.trim() === "Texto");
    const ra = accion?.getBoundingClientRect();
    return {
        paleta: rp && { l: rp.left, r: rp.right, t: rp.top, b: rp.bottom, w: rp.width },
        caja: rc && { l: rc.left, r: rc.right, t: rc.top, b: rc.bottom },
        hoja: rh && { l: rh.left, r: rh.right },
        centroVisible: rp ? deLaPaleta(rp.left + rp.width / 2, rp.top + rp.height / 2) : false,
        accionVisible: ra ? deLaPaleta(ra.left + ra.width / 2, ra.top + ra.height / 2) : false,
        desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
}

const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
let medidos = 0;
try {
    if (!FLUJO) throw new Error("falta FLUJO");
    const contexto = await navegador.newContext({ viewport: VENTANAS[0] });
    const pagina = await entrar(contexto);
    // La paleta abre según su cookie: se abre de entrada.
    await contexto.addCookies([{ name: "workflow_sidebar_state", value: "true", url: BASE }]);
    for (const v of VENTANAS) {
        await pagina.setViewportSize(v);
        await pagina.goto(`${BASE}/workflow/${FLUJO}`, { waitUntil: "domcontentloaded" });
        await pagina.waitForTimeout(3500);
        await apartarLoQueTapa(pagina);
        const sin = await pagina.evaluate(medir, null);
        if (!sin.paleta || !sin.caja) throw new Error(`${v.width}: no se encontró la paleta o la caja`);
        exigir(casi(sin.paleta.r, sin.caja.r), `${v.width} sin panel: la paleta acaba en ${sin.paleta.r.toFixed(1)} y la caja en ${sin.caja.r.toFixed(1)}`);
        exigir(sin.paleta.t >= sin.caja.t - TOL, `${v.width} sin panel: la paleta empieza en ${sin.paleta.t.toFixed(1)}, por encima de la caja (${sin.caja.t.toFixed(1)}): tapa la barra`);
        exigir(sin.centroVisible && sin.accionVisible, `${v.width} sin panel: la paleta no se ve`);
        console.log(`  ${v.width} sin panel: paleta ${sin.paleta.l.toFixed(0)}–${sin.paleta.r.toFixed(0)} · ${sin.paleta.t.toFixed(0)}–${sin.paleta.b.toFixed(0)}`);
        for (const panel of PANELES) {
            const fila = `${v.width} · ${panel.nombre}`;
            if (!(await pulsarVisible(pagina, panel.abrir))) { exigir(false, `${fila}: no se encontró el botón`); continue; }
            await pagina.waitForTimeout(900);
            const con = await pagina.evaluate(medir, panel.hoja);
            exigir(!!con.hoja && casi(con.paleta?.r, con.hoja.l), `${fila}: la paleta acaba en ${con.paleta?.r.toFixed(1)} y el panel empieza en ${con.hoja?.l.toFixed(1)} (queda debajo o deja hueco)`);
            exigir(casi(con.paleta?.w, sin.paleta.w), `${fila}: la paleta cambió de ancho (${sin.paleta.w} → ${con.paleta?.w})`);
            exigir(con.centroVisible, `${fila}: el centro de la paleta queda tapado`);
            exigir(con.accionVisible, `${fila}: la acción «Texto» de la paleta queda tapada`);
            exigir(!con.desborda, `${fila}: la página se desplaza a lo ancho`);
            console.log(`  ${fila}: paleta ${con.paleta?.l.toFixed(0)}–${con.paleta?.r.toFixed(0)} · panel ${con.hoja?.l.toFixed(0)} · se ve ${con.centroVisible && con.accionVisible}`);
            await pulsarVisible(pagina, panel.cerrar);
            await pagina.waitForTimeout(900);
            const despues = await pagina.evaluate(medir, null);
            exigir(casi(despues.paleta?.r, sin.paleta.r), `${fila}: al cerrar la paleta no vuelve a su sitio`);
            medidos += 1;
        }
    }
} catch (e) {
    console.error("no se pudo medir:", e.message);
    await navegador.close();
    process.exit(2);
}
await navegador.close();
if (medidos === 0) { console.error("no se midió nada"); process.exit(2); }
if (fallos.length) {
    console.error(`\n${fallos.length} fallo(s):`);
    for (const f of fallos) console.error(" - " + f);
    process.exit(1);
}
console.log(`\nok: ${medidos} paneles medidos, la paleta se corre con el contenido y se ve entera`);
