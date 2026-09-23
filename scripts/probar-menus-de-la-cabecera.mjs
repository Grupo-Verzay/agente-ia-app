/**
 * Los cinco menús de la cabecera de la conversación, sobre la página SERVIDA.
 *
 * Macros, Etiquetas, Cita agendada, Registros del lead y Acciones: cada uno
 * tiene que nacer con su filo DERECHO en el filo derecho de SU botón y crecer
 * hacia la izquierda. Solo se separa del botón si a su izquierda se saldría de
 * la PANTALLA, y entonces lo justo: su borde izquierdo en el margen.
 *
 * Se ejerce con la cabecera ancha, con la ficha de contacto abierta y con un
 * panel lateral («Nueva tarea») abierto, a cuatro anchuras. Es la mitad que
 * cazó el fallo: a 1024 con un panel abierto la conversación mide 260 px y la
 * regla vieja —acotar contra el borde de la CABECERA— corría la cita +103 px,
 * Macros +93 y Registros +47 a la derecha de su botón.
 *
 * El botón se mide DESPUÉS de pulsarlo: la fila de iconos se desplaza en
 * horizontal y Playwright la mueve al hacer clic, así que medirlo antes da un
 * sitio que ya no es el suyo.
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
];
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

        for (const m of MENUS) {
            const boton = await visible(p, m.sel);
            exigir(!!boton, `${ancho} · ${estado}: no se encontró el botón de «${m.nombre}»`);
            if (!boton) continue;
            await boton.click();
            await p.waitForTimeout(600);
            const b = await boton.boundingBox();
            const r = await p.evaluate(() => {
                const c = document.querySelector("[data-radix-popper-content-wrapper] > [data-state='open']");
                const x = c?.getBoundingClientRect();
                return x ? { left: Math.round(x.left), right: Math.round(x.right), top: Math.round(x.top) } : null;
            });
            const derecho = Math.round(b.x + b.width);
            exigir(!!r, `${ancho} · ${estado}: «${m.nombre}» no se abrió`);
            if (r) {
                const pegadoAlBoton = Math.abs(r.right - derecho) <= 1;
                const corridoLoJusto = Math.abs(r.left - MARGEN) <= 1 && r.right > derecho;
                exigir(
                    pegadoAlBoton || corridoLoJusto,
                    `${ancho} · ${estado}: «${m.nombre}» no cuelga de su botón (panel ${r.left}→${r.right}, botón acaba en ${derecho})`,
                );
                exigir(r.left < derecho, `${ancho} · ${estado}: «${m.nombre}» no crece hacia la izquierda`);
                exigir(r.left >= MARGEN - 1 && r.right <= ancho - MARGEN + 1, `${ancho} · ${estado}: «${m.nombre}» se sale de la pantalla (${r.left}→${r.right})`);
                filas.push({ ancho, estado, menu: m.nombre, boton: derecho, panel: `${r.left}→${r.right}`, desfase: r.right - derecho });
            }
            await p.keyboard.press("Escape");
            await p.waitForTimeout(400);
        }
    }
    await contexto.close();
}
await navegador.close();

console.table(filas);
if (fallos.length) {
    console.error(`\n${fallos.length} fallo(s):\n - ${fallos.join("\n - ")}`);
    process.exit(1);
}
console.log("\nlos cinco menús de la cabecera cuelgan de su botón, con y sin panel lateral, en las cuatro anchuras");
