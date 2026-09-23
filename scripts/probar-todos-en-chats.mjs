/**
 * El contador de «Todos», en Chromium y sobre la página SERVIDA.
 *
 * Lo reportado en producción: al resolver una conversación sale de la lista y
 * la pastilla «Todos» no baja. Lo que hay que ver es el camino ENTERO —la
 * acción, lo que se pinta en memoria, el número y la recarga—, y eso solo se ve
 * con la App de verdad: el banco de `total-de-todos-db` prueba las funciones,
 * no quién las llama.
 *
 * Cuatro conversaciones en una línea (`sembrar-todos.mjs`), y se comprueba:
 *
 *  1. Al abrir, «Todos» = filas que se ven = 4.
 *  2. Resolver desde «Acciones» baja el número a 3 SIN recargar, y la fila se va.
 *  3. Recargando sigue en 3 (el `COUNT` del servidor no cuenta resueltas).
 *  4. Reabrir desde «Acciones» lo sube a 4 SIN recargar, y la fila vuelve.
 *  5. Resolver desde el menú de la FILA baja a 3 sin recargar.
 *
 * «Sin recargar» es con un plazo de 8 s: el reloj de sesiones va a 60 s, así
 * que lo que llegue dentro del plazo es lo que pinta la propia acción.
 *
 * Hace falta: `BASE`, `USUARIO`, `CLAVE`, `CHAT_JID`, `CHAT_LINEA`.
 * `MODO=roto` exige que FALLE (se corre con un `.next` del commit de antes).
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3931";
const USUARIO = process.env.USUARIO ?? "jefe@banco.test";
const CLAVE = process.env.CLAVE ?? "banco1234";
const JID = process.env.CHAT_JID ?? "573001112233@s.whatsapp.net";
const LINEA = process.env.CHAT_LINEA ?? "BANCO_VENTAS";
const ROTO = process.env.MODO === "roto";
const PLAZO_MS = 8000;

const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
    console.log(`${bien ? "ok  " : "FALLO"} ${que}`);
};

async function entrar(contexto) {
    const pagina = await contexto.newPage();
    await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);
    await pagina.fill('input[name="email"]', USUARIO);
    await pagina.fill('input[name="password"]', CLAVE);
    await pagina.click('button[type="submit"]');
    for (let i = 0; i < 120 && pagina.url().includes("/login"); i += 1) {
        await pagina.waitForTimeout(500);
    }
    if (pagina.url().includes("/login")) throw new Error("no se pudo entrar: la página sigue en /login");
    return pagina;
}

/** El número de la pastilla «Todos» (0 si no pinta insignia) y las filas que se ven. */
async function leer(pagina) {
    return pagina.evaluate(() => {
        const col = document.querySelector("[data-columna-de-chats]") ?? document;
        const boton = [...col.querySelectorAll("button")].find((b) =>
            [...b.querySelectorAll("span")].some((s) => s.textContent?.trim() === "Todos"),
        );
        const spans = boton ? [...boton.querySelectorAll("span")] : [];
        const insignia = spans.find((s) => /^\d+$/.test(s.textContent?.trim() ?? ""));
        const filas = new Set(
            [...col.querySelectorAll("[data-chat-id]")].map((f) => f.getAttribute("data-chat-id")),
        );
        return { todos: insignia ? Number(insignia.textContent.trim()) : 0, filas: filas.size, hayBoton: !!boton };
    });
}

async function esperarA(pagina, esperado) {
    const hasta = Date.now() + PLAZO_MS;
    let ultimo = await leer(pagina);
    while (Date.now() < hasta) {
        if (ultimo.todos === esperado && ultimo.filas === esperado) return ultimo;
        await pagina.waitForTimeout(250);
        ultimo = await leer(pagina);
    }
    return ultimo;
}

async function abrirAcciones(pagina) {
    const botones = await pagina.$$('[data-cabecera-de-chat] button:has-text("Acciones")');
    for (const b of botones) {
        if (await b.isVisible()) {
            await b.click();
            await pagina.waitForTimeout(400);
            return true;
        }
    }
    return false;
}

async function pulsarOpcion(pagina, texto) {
    const item = pagina.locator('[role="menuitem"]', { hasText: texto }).first();
    if (!(await item.count())) return false;
    await item.click();
    return true;
}

async function abrirChat(pagina) {
    await pagina.goto(`${BASE}/chats?jid=${encodeURIComponent(JID)}&instance=${encodeURIComponent(LINEA)}`, {
        waitUntil: "domcontentloaded",
    });
    await pagina.waitForSelector('[data-cabecera-de-chat] button:has-text("Acciones")', { timeout: 60000 });
    // Las sesiones llegan después que la lista; hasta entonces no hay nada que resolver.
    await pagina.waitForTimeout(3000);
}

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const pagina = await entrar(contexto);
await abrirChat(pagina);

// 1. De partida
const inicio = await esperarA(pagina, 4);
exigir(inicio.hayBoton, "la pastilla «Todos» se pinta");
exigir(inicio.todos === 4 && inicio.filas === 4, `al abrir, «Todos» = filas = 4 (todos ${inicio.todos}, filas ${inicio.filas})`);

// 2. Resolver desde «Acciones», sin recargar
exigir(await abrirAcciones(pagina), "se abre «Acciones»");
exigir(await pulsarOpcion(pagina, "Resolver conversación"), "hay «Resolver conversación»");
const tras = await esperarA(pagina, 3);
exigir(tras.filas === 3, `al resolver, la fila se va (filas ${tras.filas})`);
exigir(tras.todos === 3, `al resolver, «Todos» baja a 3 sin recargar (dice ${tras.todos})`);

// 3. Recargando
await abrirChat(pagina);
const recarga = await esperarA(pagina, 3);
exigir(recarga.todos === 3 && recarga.filas === 3, `recargando, «Todos» = filas = 3 (todos ${recarga.todos}, filas ${recarga.filas})`);

// 4. Reabrir desde «Acciones», sin recargar
exigir(await abrirAcciones(pagina), "se vuelve a abrir «Acciones»");
exigir(await pulsarOpcion(pagina, "Reabrir conversación"), "hay «Reabrir conversación»");
const reabierta = await esperarA(pagina, 4);
exigir(reabierta.filas === 4, `al reabrir, la fila vuelve (filas ${reabierta.filas})`);
exigir(reabierta.todos === 4, `al reabrir, «Todos» sube a 4 sin recargar (dice ${reabierta.todos})`);

// 5. Resolver desde el menú de la FILA de otra conversación
const otra = pagina.locator('[data-chat-id="573001112266@s.whatsapp.net"] button[aria-label="Más opciones del chat"]').first();
if (await otra.count()) {
    await otra.click();
    await pagina.waitForTimeout(400);
    exigir(await pulsarOpcion(pagina, "Marcar como resuelto"), "hay «Marcar como resuelto» en la fila");
    const fila = await esperarA(pagina, 3);
    exigir(fila.filas === 3, `desde la fila, la fila se va (filas ${fila.filas})`);
    exigir(fila.todos === 3, `desde la fila, «Todos» baja a 3 sin recargar (dice ${fila.todos})`);
} else {
    exigir(false, "está la fila de Diana con su menú");
}

await navegador.close();

if (ROTO) {
    if (fallos.length === 0) {
        console.error("MODO=roto: se esperaba reproducir el fallo y todo pasó");
        process.exit(1);
    }
    console.log(`MODO=roto: reproducido (${fallos.length} fallos)`);
    process.exit(0);
}
if (fallos.length) {
    console.error(`\n${fallos.length} fallo(s)`);
    process.exit(1);
}
console.log("\ntodo bien");
