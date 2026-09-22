/**
 * Los paneles de Chats, en Chromium y sobre la página SERVIDA.
 *
 * No una maqueta: el build con `next start` contra una base de usar y tirar,
 * con sesión de verdad y una conversación abierta. Es lo que hizo falta para
 * cazar el #890: el arnés montaba los paneles colgando del layout, y en Chats
 * cuelgan de la CABECERA, que lleva `backdrop-blur-sm`. Un `backdrop-filter`
 * convierte a su nodo en el bloque contenedor de todo `position: fixed`, así
 * que el panel se colocaba contra la cabecera y no contra la ventana. Ninguna
 * maqueta que no monte esa cabecera lo ve.
 *
 * Dos preguntas, las dos del encargo:
 *
 * 1. **Los tres paneles de la cabecera** —Nueva tarea, Crear recordatorio y
 *    Contexto del lead— nacen pegados al filo derecho de la VENTANA, bajo la
 *    barra de arriba, empujan la conversación, cargan su contenido, se cierran
 *    con la equis, y ninguna instancia cerrada asoma.
 * 2. **Los tres de la columna** —Canales, Filtrar por asesor y el embudo con
 *    el rango de fechas y las etiquetas— miden lo MISMO, y menos que la
 *    columna.
 *
 * Hace falta: `BASE`, `USUARIO`, `CLAVE`, `CHAT_JID`, `CHAT_LINEA`.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3931";
const USUARIO = process.env.USUARIO ?? "jefe@banco.test";
const CLAVE = process.env.CLAVE ?? "banco1234";
const JID = process.env.CHAT_JID ?? "573001112233@s.whatsapp.net";
const LINEA = process.env.CHAT_LINEA ?? "BANCO_VENTAS";

const VENTANAS = [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
];

/** Los tres de la cabecera, por el `title` de su disparador. */
const DE_LA_CABECERA = [
    { nombre: "Nueva tarea", disparador: 'button[title="Nueva tarea"]', panel: "panel-nueva-tarea" },
    { nombre: "Crear recordatorio", disparador: 'button[title*="ecordatorio"]', panel: "panel-crear-recordatorio" },
    {
        nombre: "Contexto del lead",
        disparador: 'button[title="Ver contexto del lead"], button[title^="Score:"]',
        panel: "panel-contexto-del-lead",
    },
];

/** Los tres de la columna. */
const DE_LA_COLUMNA = [
    { nombre: "Canales", disparador: "[data-columna-de-chats] button[title]:has(svg.lucide-chevron-down)" },
    { nombre: "Filtrar por asesor", disparador: 'button[title="Filtrar por asesor"]' },
    { nombre: "Rango de fechas y etiquetas", disparador: 'button[aria-label="Filtros"]' },
];

const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
};

async function entrar(contexto) {
    const pagina = await contexto.newPage();
    await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    // Pulsando antes de que React hidrate, el formulario se envía a pelo y la
    // página se queda en /login.
    await pagina.waitForTimeout(2500);
    await pagina.fill('input[name="email"]', USUARIO);
    await pagina.fill('input[name="password"]', CLAVE);
    await pagina.click('button[type="submit"]');
    // Se sondea la URL en vez de `waitForURL`: el login navega en el cliente y
    // `waitForURL` se quedaba esperando un evento que ya había pasado.
    for (let i = 0; i < 120 && pagina.url().includes("/login"); i += 1) {
        await pagina.waitForTimeout(500);
    }
    if (pagina.url().includes("/login")) throw new Error("no se pudo entrar: la página sigue en /login");
    return pagina;
}

async function apartarLoQueTapa(pagina) {
    for (let i = 0; i < 4; i += 1) {
        const capa = await pagina.$('div[data-state="open"].fixed.inset-0');
        if (!capa) break;
        await pagina.keyboard.press("Escape");
        await pagina.waitForTimeout(250);
    }
}

/** El primer disparador VISIBLE: la cabecera pinta los botones dos veces. */
async function pulsarVisible(pagina, selector) {
    const todos = await pagina.$$(selector);
    for (const b of todos) {
        if (await b.isVisible()) {
            await b.click();
            return true;
        }
    }
    return false;
}

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const filas = [];

for (const v of VENTANAS) {
    const contexto = await navegador.newContext({ viewport: v });
    const pagina = await entrar(contexto);
    await pagina.goto(`${BASE}/chats?jid=${encodeURIComponent(JID)}&instance=${encodeURIComponent(LINEA)}`, {
        waitUntil: "domcontentloaded",
    });
    await pagina.waitForSelector('button[title="Nueva tarea"]', { timeout: 60000 });
    await pagina.waitForTimeout(1500);
    await apartarLoQueTapa(pagina);

    // ── 1. Los tres de la cabecera ────────────────────────────────────────
    for (const p of DE_LA_CABECERA) {
        const antes = await pagina.evaluate(
            () => document.querySelector("[data-cabecera-de-chat]")?.getBoundingClientRect().right ?? null,
        );
        const pulsado = await pulsarVisible(pagina, p.disparador);
        exigir(pulsado, `${v.width}: no se encontró el disparador de «${p.nombre}»`);
        if (!pulsado) continue;
        await pagina.waitForTimeout(900);

        const m = await pagina.evaluate((id) => {
            const hojas = [...document.querySelectorAll("[data-panel]")];
            const abierta = document.querySelector(`[data-panel="${id}"][aria-hidden="false"]`);
            const asoman = hojas
                .filter((h) => h.getAttribute("aria-hidden") === "true")
                .filter((h) => {
                    const r = h.getBoundingClientRect();
                    return (
                        getComputedStyle(h).visibility !== "hidden" &&
                        r.width > 0 &&
                        r.left < window.innerWidth - 1 &&
                        r.right > 0
                    );
                })
                .map((h) => h.getAttribute("data-panel"));
            // Lo que mide la barra lo publica `MedidaDeLaBarra` en esta variable,
            // y es de ella de la que cuelga la franja.
            const alto = parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue("--alto-de-la-barra"),
            );
            const r = abierta?.getBoundingClientRect();
            const cuerpo = abierta?.querySelector(":scope > div:last-child");
            return {
                hay: !!abierta,
                left: r ? Math.round(r.left) : null,
                right: r ? Math.round(r.right) : null,
                top: r ? Math.round(r.top) : null,
                bottomBarra: Number.isFinite(alto) ? Math.round(alto) : null,
                conContenido: !!cuerpo && cuerpo.querySelectorAll("input, textarea, button, p").length > 0,
                cabecera: Math.round(document.querySelector("[data-cabecera-de-chat]")?.getBoundingClientRect().right ?? -1),
                ancho: window.innerWidth,
                asoman,
            };
        }, p.panel);

        filas.push({ ventana: v.width, panel: p.nombre, ...m, asoman: m.asoman.join(",") || "—" });
        exigir(m.hay, `${v.width}: «${p.nombre}» no se abrió`);
        exigir(m.right === m.ancho, `${v.width}: «${p.nombre}» no llega al filo derecho (${m.right} de ${m.ancho})`);
        exigir(
            m.bottomBarra === null || Math.abs(m.top - m.bottomBarra) <= 1,
            `${v.width}: «${p.nombre}» no nace bajo la barra (${m.top} vs ${m.bottomBarra})`,
        );
        exigir(m.conContenido, `${v.width}: «${p.nombre}» abrió vacío`);
        exigir(m.asoman.length === 0, `${v.width}: con «${p.nombre}» abierto asoman instancias cerradas: ${m.asoman}`);
        if (v.width >= 1024) {
            exigir(
                m.cabecera <= m.left + 1,
                `${v.width}: «${p.nombre}» tapa la conversación en vez de empujarla (cabecera acaba en ${m.cabecera}, panel empieza en ${m.left}; antes ${antes})`,
            );
        }

        await pagina.click(`[data-panel="${p.panel}"][aria-hidden="false"] header button[aria-label^="Cerrar"]`);
        await pagina.waitForTimeout(800);
        const sigue = await pagina.$(`[data-panel="${p.panel}"][aria-hidden="false"]`);
        exigir(!sigue, `${v.width}: la equis de «${p.nombre}» no cierra`);
    }

    // ── 2. Los tres de la columna ─────────────────────────────────────────
    const anchos = [];
    for (const p of DE_LA_COLUMNA) {
        const pulsado = await pulsarVisible(pagina, p.disparador);
        exigir(pulsado, `${v.width}: no se encontró el disparador de «${p.nombre}»`);
        if (!pulsado) continue;
        await pagina.waitForTimeout(500);
        const m = await pagina.evaluate(() => {
            const cont = document.querySelector("[data-radix-popper-content-wrapper] > [data-state='open']");
            const col = document.querySelector("[data-columna-de-chats]")?.getBoundingClientRect();
            const r = cont?.getBoundingClientRect();
            return {
                ancho: r ? Math.round(r.width) : null,
                left: r ? Math.round(r.left) : null,
                columna: col ? Math.round(col.width) : null,
                colLeft: col ? Math.round(col.left) : null,
            };
        });
        anchos.push(m.ancho);
        filas.push({ ventana: v.width, panel: p.nombre, ...m });
        exigir(m.ancho !== null, `${v.width}: «${p.nombre}» no se abrió`);
        exigir(m.ancho < m.columna, `${v.width}: «${p.nombre}» no es menor que la columna (${m.ancho} de ${m.columna})`);
        await pagina.keyboard.press("Escape");
        await pagina.waitForTimeout(400);
    }
    exigir(
        new Set(anchos).size === 1,
        `${v.width}: los paneles de la columna no miden lo mismo: ${anchos.join(" / ")}`,
    );

    await contexto.close();
}

await navegador.close();
console.table(filas);
if (fallos.length) {
    console.error("\nFALLOS:\n- " + fallos.join("\n- "));
    process.exit(1);
}
console.log("\nlos seis paneles, bien en las tres anchuras");
