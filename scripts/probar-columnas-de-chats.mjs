/**
 * Las TRES columnas de Chats —la lista, la conversación y el panel de la
 * derecha— sobre la página SERVIDA, a 1440, 1280 y 1024.
 *
 * Lo que se pide es que se lean como una sola pieza, y eso son números:
 *
 * 1. **Las cabeceras miden lo mismo** en las tres, con sus dos filas al mismo
 *    alto (32 y 28) y al MISMO centro vertical fila por fila.
 * 2. **El respiro de arriba es el mismo**: la distancia entre la barra de la
 *    plataforma y el borde de arriba de cada columna.
 * 3. **La raya de la cabecera del panel cae a la altura de la de la
 *    conversación** (la de debajo de Macros y Acciones), en los siete paneles:
 *    contacto, contexto del lead, recordatorio, nueva tarea, enviar al equipo,
 *    copiloto y chat del equipo.
 * 4. **Los dos separadores son el mismo**: lista | conversación y
 *    conversación | panel, con el mismo ancho y el mismo color, y sin hueco.
 * 5. **El chat del equipo enseña UNA vista**: la lista de canales y directos,
 *    o el chat de uno, con su buscador, su caja de escribir y la flecha de
 *    volver. En la lista no asoma nada del chat.
 * 6. **La lista crece dentro de su área**: con muchos canales y directos se
 *    desplaza por dentro, sin mover la cabecera ni salirse del panel.
 *
 * Imprime una tabla con lo medido, y falla (`exit 1`) si algo no cuadra.
 * `MODO=roto` —con un `.next` del commit de antes— tiene que FALLAR.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3931";
const USUARIO = process.env.USUARIO ?? "jefe@banco.test";
const CLAVE = process.env.CLAVE ?? "banco1234";
const JID = process.env.CHAT_JID ?? "573001112233@s.whatsapp.net";
const LINEA = process.env.CHAT_LINEA ?? "BANCO_VENTAS";
const TOL = 1;

const VENTANAS = [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
];

/**
 * Los siete paneles. `abrir` devuelve si se pudo; `hoja` es el selector de su
 * hoja de escritorio.
 */
const PANELES = [
    { nombre: "Contacto", disparador: 'button[title="Ver ficha del contacto"]', hoja: '[data-panel="panel-ficha-de-contacto"]' },
    {
        nombre: "Contexto del lead",
        disparador: 'button[title="Ver contexto del lead"], button[title^="Score:"]',
        hoja: '[data-panel="panel-contexto-del-lead"]',
    },
    { nombre: "Recordatorio", disparador: 'button[title*="ecordatorio"]', hoja: '[data-panel="panel-crear-recordatorio"]' },
    { nombre: "Nueva tarea", disparador: 'button[title="Nueva tarea"]', hoja: '[data-panel="panel-nueva-tarea"]' },
    { nombre: "Enviar al equipo", menu: "Enviar al equipo", hoja: '[data-panel="panel-enviar-al-equipo"]' },
    { nombre: "Copiloto", disparador: 'button[aria-label="Abrir copiloto"]', hoja: "#ai-chat-sheet-desktop" },
    { nombre: "Chat del equipo", disparador: 'button[aria-label="Abrir chat del equipo"]', hoja: "#chat-equipo-escritorio" },
];

const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
};
const casi = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= TOL;

async function entrar(contexto) {
    const pagina = await contexto.newPage();
    // Dos intentos: el primer arranque de un `next start` en frío puede tardar
    // en hidratar el formulario, y un envío a pelo se queda en /login.
    for (let intento = 0; intento < 2 && !pagina.url().includes("/chats"); intento += 1) {
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

async function pulsarVisible(pagina, selector) {
    for (const b of await pagina.$$(selector)) {
        if (await b.isVisible()) {
            await b.click();
            return true;
        }
    }
    return false;
}

async function apartarLoQueTapa(pagina) {
    for (let i = 0; i < 4; i += 1) {
        const capa = await pagina.$('div[data-state="open"].fixed.inset-0');
        if (!capa) break;
        await pagina.keyboard.press("Escape");
        await pagina.waitForTimeout(250);
    }
}

/** Todo lo que se mide de las tres columnas, con el panel `hojaSel` abierto. */
function medir(hojaSel) {
    const caja = (n) => {
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height, c: (r.top + r.bottom) / 2 };
    };
    const visible = (n) => {
        if (!n) return false;
        const r = n.getBoundingClientRect();
        const s = getComputedStyle(n);
        return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    };
    const estilo = (n) => (n ? getComputedStyle(n) : null);

    const bandeja = document.querySelector("[data-chat-view]");
    // Las columnas son los hijos de la bandeja: la lista y la conversación.
    const hijos = Array.from(bandeja?.children ?? []).filter(visible);
    const colLista = hijos[0];
    const colConv = hijos[1];

    const cabLista = document.querySelector("[data-cabecera-de-la-columna]") ??
        document.querySelector("[data-columna-de-chats]")?.firstElementChild;
    const cabConv = Array.from(document.querySelectorAll("[data-cabecera-de-chat]")).find(visible);
    const cabConvEsc = cabConv?.querySelector("[data-cabecera-escritorio]");

    const hoja = Array.from(document.querySelectorAll(hojaSel)).find((h) => {
        const r = h.getBoundingClientRect();
        return visible(h) && h.getAttribute("aria-hidden") !== "true" && r.left < window.innerWidth - 20;
    });
    // La cabecera del panel: la de antes no llevaba marca, así que se toma el
    // primer hijo de la hoja que no sea el cuerpo.
    const cabPanel = hoja?.querySelector("[data-cabecera-del-panel]") ??
        hoja?.querySelector(":scope > header") ??
        hoja?.querySelector("header");

    const filas = (cab) => Array.from(cab?.children ?? []).filter(visible).map(caja);

    const alto = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--alto-de-la-barra"));
    const sLista = estilo(colLista);
    const sConv = estilo(colConv);
    const sHoja = estilo(hoja);

    return {
        ventana: window.innerWidth,
        barra: alto,
        lista: caja(colLista),
        conv: caja(colConv),
        hoja: caja(hoja),
        cabLista: caja(cabLista),
        cabConv: caja(cabConvEsc),
        cabPanel: caja(cabPanel),
        bordeCabConv: cabConvEsc ? parseFloat(getComputedStyle(cabConvEsc).borderBottomWidth) : NaN,
        bordeCabPanel: cabPanel ? parseFloat(getComputedStyle(cabPanel).borderBottomWidth) : NaN,
        filasLista: filas(cabLista),
        filasConv: filas(cabConvEsc),
        filasPanel: filas(cabPanel),
        sep1: {
            ancho: parseFloat(sLista?.borderRightWidth ?? "0") + parseFloat(sConv?.borderLeftWidth ?? "0"),
            color: parseFloat(sLista?.borderRightWidth ?? "0") > 0 ? sLista?.borderRightColor : sConv?.borderLeftColor,
        },
        sep2: {
            ancho: parseFloat(sConv?.borderRightWidth ?? "0") + parseFloat(sHoja?.borderLeftWidth ?? "0"),
            color: parseFloat(sHoja?.borderLeftWidth ?? "0") > 0 ? sHoja?.borderLeftColor : sConv?.borderRightColor,
            sombra: sHoja?.boxShadow ?? null,
            radio: sHoja?.borderTopLeftRadius ?? null,
        },
    };
}

// Un fallo de la SONDA —no poder entrar, un selector que no aparece— sale con
// 2, no con 1: el modo roto exige un 1, o sea que lo que falle sea la MEDIDA.
// Sin esa distinción, un login que no entra se leería como «reproduce el
// fallo» sin haber medido nada.
process.on("uncaughtException", (e) => {
    console.error("[sonda] no se pudo medir:", e?.message ?? e);
    process.exit(2);
});
process.on("unhandledRejection", (e) => {
    console.error("[sonda] no se pudo medir:", e?.message ?? e);
    process.exit(2);
});

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const tabla = [];

for (const v of VENTANAS) {
    const contexto = await navegador.newContext({ viewport: v });
    const pagina = await entrar(contexto);
    await pagina.goto(`${BASE}/chats?jid=${encodeURIComponent(JID)}&instance=${encodeURIComponent(LINEA)}`, {
        waitUntil: "domcontentloaded",
    });
    await pagina.waitForSelector('button[title="Nueva tarea"]', { timeout: 60000 });
    await pagina.waitForTimeout(1500);
    await apartarLoQueTapa(pagina);
    // Arranca sin vista recordada del chat del equipo: tiene que abrir en la lista.
    await pagina.evaluate(() => {
        for (const k of Object.keys(localStorage)) if (k.startsWith("equipo_ultimo_canal_")) localStorage.removeItem(k);
    });

    for (const p of PANELES) {
        let abierto = false;
        if (p.menu) {
            await pulsarVisible(pagina, 'button:has-text("Acciones")');
            await pagina.waitForTimeout(400);
            const item = await pagina.$(`[role="menuitem"]:has-text("${p.menu}")`);
            if (item) {
                await item.click();
                abierto = true;
            } else await pagina.keyboard.press("Escape");
        } else abierto = await pulsarVisible(pagina, p.disparador);
        exigir(abierto, `${v.width}: no se pudo abrir «${p.nombre}»`);
        if (!abierto) continue;
        await pagina.waitForTimeout(1300);

        const m = await pagina.evaluate(medir, p.hoja);
        const fila = { ventana: v.width, panel: p.nombre };
        if (!m.hoja || !m.cabPanel || !m.cabConv || !m.cabLista) {
            exigir(false, `${v.width}: «${p.nombre}»: no se encontró alguna de las tres cabeceras`);
            tabla.push({ ...fila, nota: "sin medir" });
        } else {
            // 2. Respiro superior: las tres columnas empiezan en el mismo píxel.
            const respiro = [m.lista.t, m.conv.t, m.hoja.t].map((t) => Math.round((t - m.barra) * 10) / 10);
            fila.respiro = respiro.join("/");
            exigir(
                casi(respiro[0], respiro[1]) && casi(respiro[0], respiro[2]),
                `${v.width} ${p.nombre}: el respiro de arriba no es el mismo (lista/conversación/panel = ${fila.respiro})`,
            );

            // 1. Alto de las dos filas, y su centro vertical fila por fila.
            const alto = (fs, i) => (fs[i] ? Math.round(fs[i].h) : NaN);
            fila.filas = [m.filasLista, m.filasConv, m.filasPanel].map((fs) => `${alto(fs, 0)}+${alto(fs, 1)}`).join(" | ");
            fila.cabeceras = [m.cabLista.h, m.cabConv.h, m.cabPanel.h].map(Math.round).join("/");
            exigir(
                casi(m.cabLista.h, m.cabConv.h) && casi(m.cabConv.h, m.cabPanel.h),
                `${v.width} ${p.nombre}: las cabeceras no miden lo mismo (${fila.cabeceras})`,
            );
            for (const i of [0, 1]) {
                const fs = [m.filasLista[i], m.filasConv[i], m.filasPanel[i]];
                exigir(fs.every(Boolean), `${v.width} ${p.nombre}: a alguna cabecera le falta la fila ${i + 1}`);
                if (!fs.every(Boolean)) continue;
                exigir(
                    fs.every((f) => casi(f.h, fs[0].h)),
                    `${v.width} ${p.nombre}: la fila ${i + 1} no mide lo mismo en las tres (${fs.map((f) => Math.round(f.h)).join("/")})`,
                );
                exigir(
                    fs.every((f) => casi(f.c, fs[0].c)),
                    `${v.width} ${p.nombre}: la fila ${i + 1} no está al mismo centro (${fs.map((f) => f.c.toFixed(1)).join("/")})`,
                );
            }

            // 3. La raya de la cabecera del panel, a la altura de la de la conversación.
            fila.raya = `${Math.round(m.cabConv.b - m.barra)}/${Math.round(m.cabPanel.b - m.barra)}`;
            exigir(
                casi(m.cabConv.b, m.cabPanel.b) && casi(m.bordeCabConv, m.bordeCabPanel),
                `${v.width} ${p.nombre}: la raya de la cabecera del panel no cae donde la de la conversación (${fila.raya}, bordes ${m.bordeCabConv}/${m.bordeCabPanel})`,
            );

            // 4. Los dos separadores: mismo ancho, mismo color y sin hueco.
            fila.sep1 = `${m.sep1.ancho}px ${m.sep1.color}`;
            fila.sep2 = `${m.sep2.ancho}px ${m.sep2.color}`;
            fila.hueco = `${Math.round(m.conv.l - m.lista.r)}/${Math.round(m.hoja.l - m.conv.r)}`;
            exigir(
                m.sep1.ancho === m.sep2.ancho && m.sep1.color === m.sep2.color,
                `${v.width} ${p.nombre}: los separadores no son el mismo (${fila.sep1} vs ${fila.sep2})`,
            );
            exigir(
                casi(m.lista.r, m.conv.l) && casi(m.conv.r, m.hoja.l),
                `${v.width} ${p.nombre}: hay hueco entre columnas (lista→conv, conv→panel = ${fila.hueco})`,
            );
            exigir(
                m.sep2.sombra === "none",
                `${v.width} ${p.nombre}: el panel lleva sombra, y la raya se lee distinta (${m.sep2.sombra})`,
            );
        }

        // 5 y 6. El chat del equipo: una vista por vez, y la lista que crece.
        if (p.nombre === "Chat del equipo") {
            const equipo = await pagina.evaluate((hojaSel) => {
                const hoja = document.querySelector(hojaSel);
                const vis = (n) => {
                    if (!n) return false;
                    const r = n.getBoundingClientRect();
                    const s = getComputedStyle(n);
                    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
                };
                const lista = hoja?.querySelector("[data-lista-de-canales]");
                const cab = hoja?.querySelector("[data-cabecera-del-panel]");
                const hr = hoja?.getBoundingClientRect();
                const lr = lista?.getBoundingClientRect();
                return {
                    vista: hoja?.querySelector("[data-vista-del-equipo]")?.getAttribute("data-vista-del-equipo") ?? null,
                    listaVisible: vis(lista),
                    chatVisible: vis(hoja?.querySelector("[data-vista-chat]")),
                    escribirVisible: vis(hoja?.querySelector('[data-barra="escribir"]')),
                    buscadorVisible: vis(hoja?.querySelector("[data-buscador-del-equipo]")),
                    volverVisible: vis(hoja?.querySelector('[data-boton="volver-a-la-lista"]')),
                    filas: hoja?.querySelectorAll("[data-fila-de-canal], [data-lista='directos'] button").length ?? 0,
                    listaCabe: lista ? lista.scrollHeight > lista.clientHeight : false,
                    listaDentro: lr && hr ? lr.bottom <= hr.bottom + 1 : false,
                    hojaSinDesborde: hoja ? hoja.scrollHeight <= hoja.clientHeight + 1 : false,
                    cabTop: cab?.getBoundingClientRect().top ?? null,
                };
            }, p.hoja);
            tabla.push({
                ventana: v.width,
                panel: "Equipo · lista",
                vista: equipo.vista,
                filas: equipo.filas,
                desplaza: equipo.listaCabe,
                chat: equipo.chatVisible || equipo.escribirVisible || equipo.buscadorVisible,
            });
            exigir(equipo.vista === "lista" && equipo.listaVisible, `${v.width}: el chat del equipo no abre en la lista (${equipo.vista})`);
            exigir(
                !equipo.chatVisible && !equipo.escribirVisible && !equipo.buscadorVisible && !equipo.volverVisible,
                `${v.width}: en la vista de lista asoma algo del chat (hilo ${equipo.chatVisible}, escribir ${equipo.escribirVisible}, buscador ${equipo.buscadorVisible}, volver ${equipo.volverVisible})`,
            );
            exigir(equipo.filas >= 60, `${v.width}: la lista no trae los canales y directos sembrados (${equipo.filas})`);
            exigir(equipo.listaCabe, `${v.width}: con ${equipo.filas} filas la lista no se desplaza dentro de su área`);
            exigir(equipo.listaDentro && equipo.hojaSinDesborde, `${v.width}: la lista se sale del panel`);

            // Desplazarse DENTRO de la lista no mueve la cabecera.
            const lista = await pagina.$(`${p.hoja} [data-lista-de-canales]`);
            if (lista) {
                const b = await lista.boundingBox();
                await pagina.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
                await pagina.mouse.wheel(0, 2000);
                await pagina.waitForTimeout(400);
                const tras = await pagina.evaluate((sel) => {
                    const hoja = document.querySelector(sel);
                    return {
                        scroll: hoja?.querySelector("[data-lista-de-canales]")?.scrollTop ?? 0,
                        cabTop: hoja?.querySelector("[data-cabecera-del-panel]")?.getBoundingClientRect().top ?? null,
                    };
                }, p.hoja);
                exigir(tras.scroll > 0, `${v.width}: la rueda no desplaza la lista`);
                exigir(tras.cabTop === equipo.cabTop, `${v.width}: desplazar la lista movió la cabecera`);
            }

            // Elegir un canal: el panel pasa ENTERO al chat.
            const canal = await pagina.$(`${p.hoja} [data-fila-de-canal="area"]`);
            exigir(!!canal, `${v.width}: no hay ningún canal que elegir en la lista`);
            if (canal) {
                await canal.click();
                await pagina.waitForTimeout(1500);
                const chat = await pagina.evaluate((sel) => {
                    const hoja = document.querySelector(sel);
                    const vis = (n) => {
                        if (!n) return false;
                        const r = n.getBoundingClientRect();
                        const s = getComputedStyle(n);
                        return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
                    };
                    return {
                        vista: hoja?.querySelector("[data-vista-del-equipo]")?.getAttribute("data-vista-del-equipo") ?? null,
                        lista: vis(hoja?.querySelector("[data-lista-de-canales]")),
                        escribir: vis(hoja?.querySelector('[data-barra="escribir"]')),
                        buscador: vis(hoja?.querySelector("[data-buscador-del-equipo]")),
                        volver: vis(hoja?.querySelector('[data-boton="volver-a-la-lista"]')),
                        nombre: hoja?.querySelector("[data-nombre-del-canal]")?.textContent ?? null,
                        volverTop: hoja?.querySelector('[data-boton="volver-a-la-lista"]')?.getBoundingClientRect().top ?? null,
                        cabBottom: hoja?.querySelector("[data-cabecera-del-panel]")?.getBoundingClientRect().bottom ?? null,
                        escribirBottom: hoja?.querySelector('[data-barra="escribir"]')?.getBoundingClientRect().bottom ?? null,
                        hojaBottom: hoja?.getBoundingClientRect().bottom ?? null,
                    };
                }, p.hoja);
                tabla.push({
                    ventana: v.width,
                    panel: "Equipo · chat",
                    vista: chat.vista,
                    canal: chat.nombre,
                    lista: chat.lista,
                    buscador: chat.buscador,
                    escribir: chat.escribir,
                });
                exigir(chat.vista === "chat" && !chat.lista, `${v.width}: al elegir un canal la lista sigue a la vista`);
                exigir(chat.buscador && chat.escribir, `${v.width}: el chat no trae su buscador y su caja de escribir`);
                exigir(
                    chat.volver && chat.volverTop !== null && chat.volverTop < chat.cabBottom,
                    `${v.width}: no hay flecha de volver arriba, en la cabecera`,
                );
                exigir(
                    chat.escribirBottom !== null && chat.escribirBottom <= chat.hojaBottom + 1,
                    `${v.width}: la caja de escribir se sale del panel`,
                );

                // Y la medida de la cabecera con el chat delante: misma raya.
                const mc = await pagina.evaluate(medir, p.hoja);
                exigir(
                    mc.cabPanel && casi(mc.cabConv.b, mc.cabPanel.b),
                    `${v.width}: con el chat del equipo abierto la raya se mueve (${mc.cabConv?.b} vs ${mc.cabPanel?.b})`,
                );

                await pulsarVisible(pagina, `${p.hoja} [data-boton="volver-a-la-lista"]`);
                await pagina.waitForTimeout(600);
                const vuelta = await pagina.evaluate(
                    (sel) => document.querySelector(sel)?.querySelector("[data-vista-del-equipo]")?.getAttribute("data-vista-del-equipo"),
                    p.hoja,
                );
                exigir(vuelta === "lista", `${v.width}: la flecha no vuelve a la lista (${vuelta})`);
            }
        }

        tabla.push(fila);
        // Cerrar: la equis de su cabecera.
        const cerrado =
            (await pulsarVisible(pagina, `${p.hoja} button[aria-label^="Cerrar"]`)) ||
            (await pulsarVisible(pagina, 'button[aria-label="Cerrar copiloto"]'));
        exigir(cerrado, `${v.width}: la equis de «${p.nombre}» no está`);
        await pagina.waitForTimeout(900);
    }
    await contexto.close();
}

await navegador.close();
console.table(tabla);
if (fallos.length) {
    console.error(`\n${fallos.length} fallos:\n- ${fallos.join("\n- ")}`);
    process.exit(1);
}
console.log("\nlas tres columnas cuadran en las tres anchuras");
