/**
 * Los cinco menús de la cabecera de la conversación, sobre la página SERVIDA.
 *
 * Macros, Etiquetas, Cita agendada, Registros del lead y Acciones, y además el
 * menú de llamar de la fila de iconos: todos tienen que nacer con su filo
 * DERECHO en el filo derecho del PANEL DE CONVERSACIÓN, sin margen, y crecer
 * hacia la izquierda. **El mismo filo para todos**: abrir uno tras otro no
 * mueve el borde derecho. No se alinean al botón que los abre.
 *
 * Se ejerce con la cabecera ancha, con la ficha de contacto abierta y con un
 * panel lateral («Nueva tarea») abierto, a cuatro anchuras. `MODO=roto` —con un
 * `.next` del commit de antes— tiene que FALLAR: ahí cada menú colgaba de su
 * botón (#905) y el filo saltaba de uno a otro.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3931";
const JID = process.env.CHAT_JID ?? "573001112233@s.whatsapp.net";
const LINEA = process.env.CHAT_LINEA ?? "BANCO_VENTAS";
const MARGEN = 8;

const MENUS = [
    { nombre: "Macros", sel: 'button[title="Macros"]' },
    { nombre: "Etiquetas", sel: '[data-cabecera-de-chat] button[role="combobox"]' },
    { nombre: "Cita agendada", sel: 'button[title="Estado de cita"]' },
    { nombre: "Registros del lead", sel: 'button[title="Registros del lead"]' },
    { nombre: "Acciones", sel: '[data-cabecera-de-chat] button:has-text("Acciones")' },
    { nombre: "Llamar", sel: '[data-cabecera-de-chat] button[title="Llamar"]', opcional: true },
];
const MARGEN_INTERIOR = 0;
const ESTADOS = ["sin panel", "ficha abierta", "panel lateral abierto"];

const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
};

async function visible(pagina, selector) {
    for (const b of await pagina.$$(selector)) if (await b.isVisible()) return b;
    return null;
}

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const filas = [];

for (const ancho of [1440, 1366, 1280, 1024]) {
    const contexto = await navegador.newContext({ viewport: { width: ancho, height: 850 } });
    const p = await contexto.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2500);
    await p.fill('input[name="email"]', process.env.USUARIO ?? "jefe@banco.test");
    await p.fill('input[name="password"]', process.env.CLAVE ?? "banco1234");
    await p.click('button[type="submit"]');
    for (let i = 0; i < 120 && p.url().includes("/login"); i++) await p.waitForTimeout(500);
    await p.goto(`${BASE}/chats?jid=${encodeURIComponent(JID)}&instance=${encodeURIComponent(LINEA)}`);
    await p.waitForSelector('button[title="Nueva tarea"]', { timeout: 60000 });
    await p.waitForTimeout(1500);
    for (let i = 0; i < 4; i++) {
        if (!(await p.$('div[data-state="open"].fixed.inset-0'))) break;
        await p.keyboard.press("Escape");
        await p.waitForTimeout(250);
    }

    for (const estado of ESTADOS) {
        if (estado === "ficha abierta") await (await visible(p, 'button[title="Ver ficha del contacto"]'))?.click();
        if (estado === "panel lateral abierto") await (await visible(p, 'button[title="Nueva tarea"]'))?.click();
        await p.waitForTimeout(900);

        const derechos = new Set();
        const altos = new Set();
        for (const m of MENUS) {
            const boton = await visible(p, m.sel);
            if (!boton && m.opcional) continue;
            // Llamar vive en la fila de iconos, que se recorta cuando la
            // conversación se estrecha: si en esta combinación queda tapado no
            // se puede pulsar, y lo que se mide aquí es dónde nace el menú, no
            // si la fila de iconos cabe. Se dice y se sigue.
            if (boton && m.opcional) {
                const alcanzable = await boton.evaluate((n) => {
                    n.scrollIntoView({ block: "nearest", inline: "nearest" });
                    const r = n.getBoundingClientRect();
                    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                    return !!e && (e === n || n.contains(e));
                });
                if (!alcanzable) {
                    filas.push({ ancho, estado, menu: m.nombre, nota: "tapado en esta anchura: no se mide" });
                    continue;
                }
            }
            exigir(!!boton, `${ancho} · ${estado}: no se encontró el botón de «${m.nombre}»`);
            if (!boton) continue;
            await boton.click();
            await p.waitForTimeout(600);
            const b = await boton.boundingBox();
            const r = await p.evaluate(() => {
                const c = document.querySelector("[data-radix-popper-content-wrapper] > [data-state='open']");
                const cab = Array.from(document.querySelectorAll("[data-cabecera-de-chat]")).find((n) => n.getBoundingClientRect().width > 0);
                const x = c?.getBoundingClientRect();
                const k = cab?.getBoundingClientRect();
                return x && k
                    ? {
                          left: Math.round(x.left),
                          right: Math.round(x.right),
                          top: Math.round(x.top),
                          cabRight: Math.round(k.right),
                          cabBottom: Math.round(k.bottom),
                          relleno: getComputedStyle(c).paddingTop,
                      }
                    : null;
            });
            exigir(!!r, `${ancho} · ${estado}: «${m.nombre}» no se abrió`);
            if (r) {
                const filo = Math.min(r.cabRight - MARGEN_INTERIOR, ancho);
                exigir(
                    Math.abs(r.right - filo) <= 1,
                    `${ancho} · ${estado}: «${m.nombre}» no tiene el filo de la conversación (panel ${r.left}→${r.right}, filo ${filo}, botón acaba en ${Math.round(b.x + b.width)})`,
                );
                exigir(r.left < r.right, `${ancho} · ${estado}: «${m.nombre}» no crece hacia la izquierda`);
                exigir(r.left >= MARGEN - 1 && r.right <= ancho + 1, `${ancho} · ${estado}: «${m.nombre}» se sale de la pantalla (${r.left}→${r.right})`);
                // Pegados, sin separación: el menú nace EN el borde de abajo de
                // la cabecera, y el relleno es el mismo en todos (p-2 = 8px).
                exigir(
                    Math.abs(r.top - r.cabBottom) <= 1,
                    `${ancho} · ${estado}: «${m.nombre}» no nace pegado a la cabecera (arriba ${r.top}, cabecera acaba en ${r.cabBottom})`,
                );
                exigir(r.relleno === "8px", `${ancho} · ${estado}: «${m.nombre}» lleva otro relleno (${r.relleno})`);
                derechos.add(r.right);
                altos.add(r.top);
                filas.push({ ancho, estado, menu: m.nombre, boton: Math.round(b.x + b.width), panel: `${r.left}→${r.right}`, filo, desfase: r.right - filo });
            }
            await p.keyboard.press("Escape");
            await p.waitForTimeout(400);
        }
        exigir(derechos.size <= 1, `${ancho} · ${estado}: los menús no comparten el filo derecho (${[...derechos].join(", ")})`);
        exigir(altos.size <= 1, `${ancho} · ${estado}: los menús no nacen a la misma altura (${[...altos].join(", ")})`);
    }
    await contexto.close();
}
await navegador.close();

console.table(filas);
if (fallos.length) {
    console.error(`\n${fallos.length} fallo(s):\n - ${fallos.join("\n - ")}`);
    process.exit(1);
}
console.log("\nlos menús de la cabecera comparten el filo de la conversación, con y sin panel lateral, en las cuatro anchuras");
