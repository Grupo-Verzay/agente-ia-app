/**
 * El panel lateral EMPUJA el contenido en todas las pantallas, no solo en
 * Chats y Correo. Sobre la página SERVIDA, con sesión de verdad.
 *
 * En Agenda, Tareas, Leads y el Panel, a 1440, 1280 y 1024, con los tres
 * paneles del borde (nota rápida, copiloto y chat del equipo):
 *
 * 1. La caja del contenido se ESTRECHA lo que mide el panel, y el panel empieza
 *    justo donde acaba la caja: sin hueco y sin solape (±1 px).
 * 2. Arriba y abajo el panel coincide con la caja: se lee como una sola pieza.
 * 3. Lo que había en el filo derecho de la caja se SIGUE viendo: el punto justo
 *    a la izquierda del panel es de la caja, no del panel.
 * 4. La página no se desplaza a lo ancho.
 * 5. Al cerrar, la caja vuelve a su ancho.
 *
 * Y dos cosas que no pueden haber cambiado: en Chats el panel sigue DENTRO de
 * la bandeja (su regla propia), y por debajo de 1024 el panel se abre encima
 * sin reservar nada, como en Chats.
 *
 * Sale con 1 si algo no cuadra, 2 si no pudo ni medir. `MODO=roto` —con un
 * `.next` del commit de antes— tiene que salir con 1.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3932";
const USUARIO = process.env.USUARIO ?? "jefe@banco.test";
const CLAVE = process.env.CLAVE ?? "banco1234";
const TOL = 1.5;

const PANTALLAS = ["/schedule", "/tareas", "/sessions", "/panel"];
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
        await pagina.fill('input[name="email"]', USUARIO);
        await pagina.fill('input[name="password"]', CLAVE);
        await pagina.click('button[type="submit"]');
        for (let i = 0; i < 120 && pagina.url().includes("/login"); i += 1) await pagina.waitForTimeout(500);
        if (!pagina.url().includes("/login")) return pagina;
    }
    throw new Error("no se pudo entrar: la página sigue en /login");
}

async function apartarLoQueTapa(pagina) {
    for (let i = 0; i < 4; i += 1) {
        const capa = await pagina.$('div[data-state="open"].fixed.inset-0');
        if (!capa) break;
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

/** La caja del contenido: la marca de hoy o, en el «antes», la clase. */
function medir(hojaSel) {
    const caja = document.querySelector("[data-caja-del-contenido]") ?? document.querySelector(".app-module-content");
    const rc = caja?.getBoundingClientRect();
    const hoja = Array.from(document.querySelectorAll(hojaSel)).find((h) => {
        const r = h.getBoundingClientRect();
        return r.width > 0 && r.left < window.innerWidth - 20;
    });
    const rh = hoja?.getBoundingClientRect();
    let deLaCaja = null;
    if (rc && rh) {
        const x = Math.min(rc.right, rh.left) - 6;
        const y = rc.top + rc.height / 2;
        const n = document.elementFromPoint(x, y);
        deLaCaja = !!n && caja.contains(n) && !hoja.contains(n);
    }
    const bandeja = document.querySelector("[data-chat-view]")?.getBoundingClientRect();
    return {
        caja: rc && { l: rc.left, r: rc.right, t: rc.top, b: rc.bottom, w: rc.width },
        hoja: rh && { l: rh.left, r: rh.right, t: rh.top, b: rh.bottom, w: rh.width },
        bandeja: bandeja && { l: bandeja.left, r: bandeja.right, t: bandeja.top, b: bandeja.bottom },
        deLaCaja,
        desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
}

async function unPanel(pagina, panel, etiqueta, { reserva }) {
    await apartarLoQueTapa(pagina);
    const antes = await pagina.evaluate(medir, panel.hoja);
    if (!(await pulsarVisible(pagina, panel.abrir))) {
        console.error(`  ${etiqueta}: no se encontró el botón de ${panel.nombre}`);
        return false;
    }
    await pagina.waitForTimeout(900);
    const con = await pagina.evaluate(medir, panel.hoja);
    const fila = `${etiqueta} · ${panel.nombre}`;
    if (!con.caja || !con.hoja) {
        exigir(false, `${fila}: no se pudo medir la caja o la hoja`);
    } else if (reserva) {
        exigir(casi(con.caja.r, con.hoja.l), `${fila}: la caja acaba en ${con.caja.r.toFixed(1)} y el panel empieza en ${con.hoja.l.toFixed(1)} (tapa o deja hueco)`);
        exigir(casi(antes.caja.w - con.caja.w, con.hoja.w), `${fila}: la caja se estrechó ${(antes.caja.w - con.caja.w).toFixed(1)} y el panel mide ${con.hoja.w.toFixed(1)}`);
        exigir(casi(con.caja.t, con.hoja.t) && casi(con.caja.b, con.hoja.b), `${fila}: arriba/abajo no coinciden (caja ${con.caja.t.toFixed(1)}–${con.caja.b.toFixed(1)}, panel ${con.hoja.t.toFixed(1)}–${con.hoja.b.toFixed(1)})`);
        exigir(con.deLaCaja === true, `${fila}: el filo derecho del contenido queda debajo del panel`);
        exigir(!con.desborda, `${fila}: la página se desplaza a lo ancho`);
    } else {
        exigir(casi(antes.caja.w, con.caja.w), `${fila}: por debajo de 1024 no se reserva, y la caja cambió de ${antes.caja.w} a ${con.caja.w}`);
    }
    console.log(`  ${fila}: caja ${antes.caja?.w.toFixed(0)}→${con.caja?.w.toFixed(0)} · panel ${con.hoja?.l.toFixed(0)}–${con.hoja?.r.toFixed(0)} · filo visible ${con.deLaCaja}`);
    await pulsarVisible(pagina, panel.cerrar);
    await pagina.waitForTimeout(900);
    const despues = await pagina.evaluate(medir, panel.hoja);
    exigir(casi(despues.caja?.w, antes.caja?.w), `${fila}: al cerrar la caja no vuelve a su ancho (${despues.caja?.w} en vez de ${antes.caja?.w})`);
    return true;
}

const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
let medidos = 0;
try {
    const contexto = await navegador.newContext({ viewport: VENTANAS[0] });
    const pagina = await entrar(contexto);
    for (const v of VENTANAS) {
        await pagina.setViewportSize(v);
        for (const ruta of PANTALLAS) {
            await pagina.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded" });
            await pagina.waitForTimeout(2500);
            for (const panel of PANELES) {
                if (await unPanel(pagina, panel, `${v.width} ${ruta}`, { reserva: true })) medidos += 1;
            }
        }
        // Chats no puede haber cambiado: el panel sigue dentro de su bandeja.
        await pagina.goto(`${BASE}/chats`, { waitUntil: "domcontentloaded" });
        await pagina.waitForTimeout(3500);
        await apartarLoQueTapa(pagina);
        if (await pulsarVisible(pagina, PANELES[2].abrir)) {
            await pagina.waitForTimeout(900);
            const m = await pagina.evaluate(medir, PANELES[2].hoja);
            exigir(!!m.bandeja && casi(m.hoja?.r, m.bandeja.r) && casi(m.hoja?.t, m.bandeja.t),
                `${v.width} /chats: el panel ya no va dentro de la bandeja (panel ${m.hoja?.l}–${m.hoja?.r}, bandeja ${m.bandeja?.l}–${m.bandeja?.r})`);
            console.log(`  ${v.width} /chats · Chat del equipo: dentro de la bandeja ${m.bandeja && casi(m.hoja?.r, m.bandeja.r)}`);
            await pulsarVisible(pagina, PANELES[2].cerrar);
            await pagina.waitForTimeout(700);
            medidos += 1;
        }
    }
    // Por debajo de 1024 no se reserva: el panel se abre encima, como en Chats.
    await pagina.setViewportSize({ width: 900, height: 800 });
    await pagina.goto(`${BASE}/schedule`, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);
    if (await unPanel(pagina, PANELES[2], "900 /schedule", { reserva: false })) medidos += 1;
} catch (e) {
    console.error("no se pudo medir:", e.message);
    await navegador.close();
    process.exit(2);
}
await navegador.close();

if (medidos === 0) {
    console.error("no se midió ningún panel");
    process.exit(2);
}
if (fallos.length) {
    console.error(`\n${fallos.length} fallo(s):`);
    for (const f of fallos) console.error(" - " + f);
    process.exit(1);
}
console.log(`\nok: ${medidos} paneles medidos, el contenido se corre y sigue a la vista`);
