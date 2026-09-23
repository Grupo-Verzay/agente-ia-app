/**
 * Todo lo que se abre flotando en Chats cabe ENTERO y no queda tapado, sobre la
 * página SERVIDA.
 *
 * El caso reportado: la barra de reacciones de un mensaje abría siempre hacia
 * arriba, y con el mensaje pegado al borde de arriba del hilo la fila de emojis
 * quedaba fuera y no se podía pulsar. A zoom 80 % cabía, a 100 % no.
 *
 * Matriz: 1440, 1280 y 1024 px × zoom 100 % y 80 % × ficha de contacto cerrada
 * y abierta. En cada combinación:
 *
 * - **El menú de un mensaje** (reacciones + Copiar) con el mensaje al borde de
 *   ARRIBA del hilo, en MEDIO y al borde de ABAJO, de los dos lados (propio y
 *   del contacto). Tiene que quedar entero DENTRO DEL HILO —no encima de la
 *   cabecera ni de la barra de escribir— y cada emoji tiene que ser lo que hay
 *   en su punto (`elementFromPoint`): si algo lo tapa, no se puede pulsar.
 * - **Los demás flotantes**: los menús de la cabecera, el «⋯» de una tarjeta de
 *   la lista y el filtro de etiquetas. Enteros dentro de la ventana y sin nada
 *   encima.
 *
 * El zoom se emula como lo hace el navegador: a 80 % la ventana CSS mide
 * `ancho / 0,8` y cada píxel CSS ocupa 0,8 del dispositivo.
 *
 * `MODO=roto` (con un `.next` del commit de antes) tiene que FALLAR: ahí el
 * menú del mensaje era un `div` absoluto dentro del hilo y se recortaba.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3931";
const JID = process.env.CHAT_JID ?? "573001112233@s.whatsapp.net";
const LINEA = process.env.CHAT_LINEA ?? "BANCO_VENTAS";

// Los selectores son los que existen en los DOS builds —el de antes no tiene
// las marcas nuevas—, para que el modo roto mida el mismo caso y no falle por
// no encontrar un atributo.
const HILO = ".whatsapp-chat-background.overflow-y-auto";
const DISPARADOR = 'button[aria-label="Más opciones"]';
// El de antes era el `div.absolute` hermano del botón; el de ahora va en un
// portal y lleva su marca. (Con una lista de selectores `querySelector`
// devuelve el primero en orden del DOM, así que el de ahora se busca primero.)
const PANEL_DEL_MENSAJE = ["[data-panel-del-mensaje]", 'div.relative > button[aria-label="Más opciones"] + div.absolute'];

const VENTANAS = [
    { ancho: 1440, alto: 900 },
    { ancho: 1280, alto: 800 },
    { ancho: 1024, alto: 768 },
];
const ZOOMS = [1, 0.8];
const FICHAS = ["ficha cerrada", "ficha abierta"];
const POSICIONES = ["arriba", "medio", "abajo"];

const OTROS = [
    { nombre: "Macros", sel: 'button[title="Macros"]' },
    { nombre: "Acciones", sel: '[data-cabecera-de-chat] button:has-text("Acciones")' },
    { nombre: "Registros del lead", sel: 'button[title="Registros del lead"]' },
    { nombre: "Cita agendada", sel: 'button[title="Estado de cita"]' },
    { nombre: "«⋯» de la tarjeta", sel: '[data-columna-de-chats] button[aria-label="Más opciones del chat"]' },
    { nombre: "Filtro de etiquetas", sel: 'button[title="Filtrar por fecha o etiquetas"]' },
];

const fallos = [];
const filas = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
};

/**
 * Cierra lo que haya abierto. Escape para lo de Radix, y un `mousedown` en el
 * documento para el menú de ANTES —un `div` casero que no escuchaba Escape y se
 * cerraba con un clic fuera—: sin esto, en el modo roto el menú se quedaba
 * abierto tapando el siguiente mensaje y la sonda moría en un timeout, que no
 * es reproducir el fallo.
 */
async function cerrar(p) {
    await p.keyboard.press("Escape");
    await p.evaluate(() => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
}

async function visible(p, sel) {
    for (const b of await p.$$(sel)) if (await b.isVisible()) return b;
    return null;
}

/**
 * El flotante abierto: su caja, la del hilo, la ventana, y si cada punto que
 * importa es SUYO (nada encima). Los puntos son los centros de sus opciones —
 * los emojis y «Copiar» en el menú del mensaje— y sus cuatro esquinas por
 * dentro.
 */
async function medirAbierto(p, selPanel) {
    return p.evaluate(({ sel, HILO }) => {
        const panel =
            (sel && sel.map((x) => document.querySelector(x)).find(Boolean)) ||
            document.querySelector("[data-radix-popper-content-wrapper] > [data-state='open']");
        if (!panel) return null;
        const r = panel.getBoundingClientRect();
        const hilo = Array.from(document.querySelectorAll(HILO)).find(
            (n) => n.getBoundingClientRect().width > 0,
        );
        const h = hilo?.getBoundingClientRect();
        const puntos = [];
        const opciones = panel.querySelectorAll("[role='menuitem'], button");
        for (const o of opciones) {
            const c = o.getBoundingClientRect();
            puntos.push({ que: (o.textContent || "").trim().slice(0, 12), x: c.left + c.width / 2, y: c.top + c.height / 2 });
        }
        for (const [x, y] of [
            [r.left + 4, r.top + 4],
            [r.right - 4, r.top + 4],
            [r.left + 4, r.bottom - 4],
            [r.right - 4, r.bottom - 4],
        ])
            puntos.push({ que: "esquina", x, y });
        const tapados = puntos
            .map((pt) => ({ pt, e: document.elementFromPoint(pt.x, pt.y) }))
            .filter(({ e }) => !e || !panel.contains(e))
            // Qué lo tapa: sin eso, un «tapado» no dice dónde mirar.
            .map(({ pt, e }) => `${pt.que} (${e ? `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)}` : "nada"})`);
        return {
            panel: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
            hilo: h ? { left: h.left, right: h.right, top: h.top, bottom: h.bottom } : null,
            ventana: { ancho: document.documentElement.clientWidth, alto: document.documentElement.clientHeight },
            tapados,
            reacciones: Array.from(panel.querySelectorAll("[role='menuitem'], button")).filter((n) =>
                (n.getAttribute("title") || "").startsWith("Reaccionar"),
            ).length,
        };
    }, { sel: selPanel, HILO });
}

/** Pone el botón «⋯» del mensaje `idx` al borde de arriba, en medio o abajo del hilo. */
async function colocarMensaje(p, idx, posicion) {
    return p.evaluate(
        ({ idx, posicion, HILO, DISPARADOR }) => {
            const hilo = Array.from(document.querySelectorAll(HILO)).find(
                (n) => n.getBoundingClientRect().width > 0,
            );
            const filas = hilo ? Array.from(hilo.querySelectorAll("[data-message-id]")) : [];
            const fila = filas[idx];
            const boton = fila?.querySelector(DISPARADOR);
            if (!hilo || !boton) return null;
            const h = hilo.getBoundingClientRect();
            const b = boton.getBoundingClientRect();
            const destino =
                posicion === "arriba" ? h.top + 10 : posicion === "abajo" ? h.bottom - 10 - b.height : h.top + h.height / 2;
            hilo.scrollTop += b.top - destino;
            const b2 = boton.getBoundingClientRect();
            return { top: Math.round(b2.top - h.top), fromMe: !!fila.querySelector(".group")?.classList.contains("justify-end") };
        },
        { idx, posicion, HILO, DISPARADOR },
    );
}

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });

for (const { ancho, alto } of VENTANAS) {
    for (const zoom of ZOOMS) {
        const contexto = await navegador.newContext({
            viewport: { width: Math.round(ancho / zoom), height: Math.round(alto / zoom) },
            deviceScaleFactor: zoom,
        });
        const p = await contexto.newPage();
        const etiqueta = `${ancho}@${Math.round(zoom * 100)}%`;
        console.error(`[sonda] ${etiqueta}`);
        await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
        await p.waitForTimeout(2000);
        await p.fill('input[name="email"]', process.env.USUARIO ?? "jefe@banco.test");
        await p.fill('input[name="password"]', process.env.CLAVE ?? "banco1234");
        await p.click('button[type="submit"]');
        for (let i = 0; i < 120 && p.url().includes("/login"); i++) await p.waitForTimeout(500);
        await p.goto(`${BASE}/chats?jid=${encodeURIComponent(JID)}&instance=${encodeURIComponent(LINEA)}`);
        await p.waitForSelector(`${HILO} [data-message-id]`, { timeout: 60000 });
        await p.waitForTimeout(1500);
        for (let i = 0; i < 4; i++) {
            if (!(await p.$('div[data-state="open"].fixed.inset-0'))) break;
            await p.keyboard.press("Escape");
            await p.waitForTimeout(250);
        }

        let anchoSinFicha = 0;
        for (const ficha of FICHAS) {
            if (ficha === "ficha abierta") {
                await (await visible(p, 'button[title="Ver ficha del contacto"]'))?.click();
                await p.waitForTimeout(900);
            }

            // La conversación abre con la última página (25). Se piden las
            // anteriores hasta tener hilo de sobra: a zoom 80 % el hilo mide
            // más de 900 px y con 25 el del medio no llega a ningún borde.
            for (let i = 0; i < 5; i++) {
                const n = await p.$$eval(`${HILO} [data-message-id]`, (x) => x.length);
                if (n >= 70) break;
                const mas = await visible(p, 'button:has-text("Cargar mensajes anteriores")');
                if (!mas) break;
                await mas.click();
                await p.waitForTimeout(1500);
            }
            const cuantos = await p.$$eval(`${HILO} [data-message-id]`, (n) => n.length);
            const anchoDelHilo = await p.$eval(HILO, (h) => Math.round(h.getBoundingClientRect().width));
            filas.push({ caso: `${etiqueta} · ${ficha}`, nota: `${cuantos} mensajes, hilo de ${anchoDelHilo} px` });
            if (ficha === "ficha abierta") {
                // La ficha es un hermano del flex: abierta, el hilo ENCOGE. Si no
                // encoge, la ficha no se abrió y el caso no se está ejerciendo.
                exigir(anchoDelHilo < anchoSinFicha - 100, `${etiqueta}: la ficha no se abrió (hilo de ${anchoDelHilo} px, sin ficha ${anchoSinFicha})`);
            } else {
                anchoSinFicha = anchoDelHilo;
            }
            exigir(cuantos >= 60, `${etiqueta} · ${ficha}: el hilo tiene ${cuantos} mensajes; sin hilo largo no hay borde que probar`);

            // Uno propio y uno del contacto, en las tres posiciones. Del MEDIO
            // del hilo: uno del final no puede subir al borde de arriba (no hay
            // más contenido debajo que desplazar) y el caso no se ejercería.
            const medio = Math.floor(cuantos / 2);
            for (const idx of [medio, medio + 1]) {
                for (const posicion of POSICIONES) {
                    const puesto = await colocarMensaje(p, idx, posicion);
                    exigir(!!puesto, `${etiqueta} · ${ficha}: el mensaje ${idx} no tiene menú`);
                    if (!puesto) continue;
                    await p.waitForTimeout(250);
                    // Que de verdad esté donde se pidió: si no, lo verde no
                    // diría nada del borde.
                    const donde = await colocarMensaje(p, idx, posicion);
                    const alto = await p.$eval(HILO, (h) => h.clientHeight);
                    const esperado = posicion === "arriba" ? 10 : posicion === "abajo" ? alto - 10 - 24 : alto / 2;
                    exigir(
                        Math.abs(donde.top - esperado) <= 30,
                        `${etiqueta} · ${ficha} · ${posicion}: el mensaje quedó a ${donde.top} px del borde y se pedía ${Math.round(esperado)}`,
                    );
                    const fila = (await p.$$(`${HILO} [data-message-id]`))[idx];
                    await fila.hover();
                    const boton = await fila.$(DISPARADOR);
                    await boton.click();
                    await p.waitForTimeout(350);
                    const m = await medirAbierto(p, PANEL_DEL_MENSAJE);
                    const caso = `${etiqueta} · ${ficha} · mensaje ${puesto.fromMe ? "propio" : "del contacto"} ${posicion}`;
                    exigir(!!m, `${caso}: el menú no se abrió`);
                    if (m) {
                        const { panel, hilo } = m;
                        exigir(m.reacciones === 6, `${caso}: salen ${m.reacciones} reacciones`);
                        exigir(
                            hilo &&
                                panel.top >= hilo.top - 1 &&
                                panel.bottom <= hilo.bottom + 1 &&
                                panel.left >= hilo.left - 1 &&
                                panel.right <= hilo.right + 1,
                            `${caso}: el menú se sale del hilo (panel ${Math.round(panel.top)}→${Math.round(panel.bottom)} · ${Math.round(panel.left)}→${Math.round(panel.right)}, hilo ${Math.round(hilo?.top)}→${Math.round(hilo?.bottom)} · ${Math.round(hilo?.left)}→${Math.round(hilo?.right)})`,
                        );
                        exigir(m.tapados.length === 0, `${caso}: tapado en ${m.tapados.join(", ")}`);
                        filas.push({
                            caso,
                            boton: donde.top,
                            lado: panel.bottom <= donde.top + (hilo?.top ?? 0) + 1 ? "arriba" : "abajo",
                            panel: `${Math.round(panel.top)}→${Math.round(panel.bottom)}`,
                            hilo: `${Math.round(hilo?.top)}→${Math.round(hilo?.bottom)}`,
                            tapados: m.tapados.length,
                        });
                    }
                    await cerrar(p);
                    await p.waitForTimeout(250);
                }
            }

            // Una reacción del menú al borde de ARRIBA se puede PULSAR de verdad.
            {
                const idx = Math.floor(cuantos / 2);
                await colocarMensaje(p, idx, "arriba");
                await p.waitForTimeout(250);
                const fila = (await p.$$(`${HILO} [data-message-id]`))[idx];
                await fila.hover();
                await (await fila.$(DISPARADOR)).click();
                await p.waitForTimeout(350);
                const emoji =
                    (await p.$(`${PANEL_DEL_MENSAJE[0]} [title^="Reaccionar"]`)) ??
                    (await p.$(`${PANEL_DEL_MENSAJE[1]} [title^="Reaccionar"]`));
                let pulsado = false;
                try {
                    await emoji.click({ timeout: 2000 });
                    pulsado = true;
                } catch {}
                await p.waitForTimeout(300);
                const cerrado = !(await p.$(PANEL_DEL_MENSAJE[0])) && !(await p.$(PANEL_DEL_MENSAJE[1]));
                exigir(pulsado && cerrado, `${etiqueta} · ${ficha}: la primera reacción, con el mensaje arriba, no se pudo pulsar`);
                if (!cerrado) await cerrar(p);
            }

            for (const o of OTROS) {
                const boton = await visible(p, o.sel);
                if (!boton) {
                    filas.push({ caso: `${etiqueta} · ${ficha} · ${o.nombre}`, nota: "no está en esta combinación" });
                    continue;
                }
                await boton.click();
                await p.waitForTimeout(500);
                const m = await medirAbierto(p, null);
                const caso = `${etiqueta} · ${ficha} · ${o.nombre}`;
                exigir(!!m, `${caso}: no se abrió`);
                if (m) {
                    const { panel, ventana } = m;
                    exigir(
                        panel.top >= -1 && panel.left >= -1 && panel.right <= ventana.ancho + 1 && panel.bottom <= ventana.alto + 1,
                        `${caso}: se sale de la ventana (${Math.round(panel.left)}→${Math.round(panel.right)} · ${Math.round(panel.top)}→${Math.round(panel.bottom)} en ${ventana.ancho}×${ventana.alto})`,
                    );
                    exigir(m.tapados.length === 0, `${caso}: tapado en ${m.tapados.join(", ")}`);
                    filas.push({ caso, panel: `${Math.round(panel.top)}→${Math.round(panel.bottom)}`, tapados: m.tapados.length });
                }
                await p.keyboard.press("Escape");
                await p.waitForTimeout(350);
            }
        }
        await contexto.close();
    }
}
await navegador.close();

console.table(filas);
if (fallos.length) {
    console.error(`\n${fallos.length} fallo(s):\n - ${fallos.join("\n - ")}`);
    process.exit(1);
}
console.log("\ntodo lo flotante de Chats cabe entero y sin tapar, a 1440/1280/1024, zoom 100 y 80, con y sin ficha");
