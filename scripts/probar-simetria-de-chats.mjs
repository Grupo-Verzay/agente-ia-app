/**
 * La simetría de Chats sobre la página SERVIDA, a 1440, 1280 y 1024.
 *
 * «Lo que en un panel se ve de una forma, en todos los demás se ve igual, no
 * parecido», con la conversación de WhatsApp como modelo. Eso son números:
 *
 * 1. **La raya de la cabecera** cae en el mismo píxel en la lista, en la
 *    conversación y en los siete paneles.
 * 2. **Las tres barras de escribir** —conversación, chat de equipo y copiloto—
 *    miden lo mismo, arrancan a la misma altura y acaban en la misma línea.
 * 3. **El copiloto** tiene su «+» con las sugerencias dentro y UN botón a la
 *    derecha: el micrófono con la caja vacía y la flecha con texto.
 * 4. **El relleno lateral** es el mismo en las tres, y 5. **el «+»** está a la
 *    misma distancia del filo que de la caja, la mínima.
 * 6. **La fila de botones** de «Crear recordatorio», «Nueva tarea» y la de
 *    «Contexto del lead» es un pie FIJO: con su raya, el alto de la barra de
 *    escribir y quieta mientras el cuerpo se desplaza.
 * 7. y 8. Los botones dicen «Crear» y «Cancelar», y crear va en AZUL en los dos.
 * 9. El pie del contexto: «No se envía al cliente» a la izquierda y los dos
 *    pulgares a la derecha, siempre.
 * 11. **Los cuatro menús de la columna** nacen justo DEBAJO de la raya —que se
 *    ve entera—, pegados a ella, anclados a su botón y dentro de la columna.
 *
 * Imprime una tabla con lo medido y falla (`exit 1`) si algo no cuadra. Un
 * fallo de la SONDA —no poder entrar, no encontrar la pantalla— sale con 2:
 * `MODO=roto` exige un 1, o sea que lo que falle sea la MEDIDA.
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

const PANELES = [
    { nombre: "Contacto", disparador: 'button[title="Ver ficha del contacto"]', hoja: '[data-panel="panel-ficha-de-contacto"]' },
    { nombre: "Contexto del lead", disparador: 'button[title="Ver contexto del lead"], button[title^="Score:"]', hoja: '[data-panel="panel-contexto-del-lead"]', pie: "contexto" },
    { nombre: "Recordatorio", disparador: 'button[title*="ecordatorio"]', hoja: '[data-panel="panel-crear-recordatorio"]', pie: "crear" },
    { nombre: "Nueva tarea", disparador: 'button[title="Nueva tarea"]', hoja: '[data-panel="panel-nueva-tarea"]', pie: "crear" },
    { nombre: "Enviar al equipo", menu: "Enviar al equipo", hoja: '[data-panel="panel-enviar-al-equipo"]' },
    { nombre: "Copiloto", disparador: 'button[aria-label="Abrir copiloto"]', hoja: "#ai-chat-sheet-desktop", barra: true },
    { nombre: "Chat del equipo", disparador: 'button[aria-label="Abrir chat del equipo"]', hoja: "#chat-equipo-escritorio", barra: true, canal: true },
];

const MENUS = [
    { nombre: "Canales", disparador: "[data-columna-de-chats] [data-cabecera-de-la-columna] button[title]:has(svg.lucide-chevron-down)" },
    { nombre: "Etiquetas y fechas", disparador: "[data-embudo]" },
    { nombre: "Asesores", disparador: 'button[title="Filtrar por asesor"]' },
    { nombre: "Más filtros (⌄)", disparador: "[data-pastillas-de-chats] button:has(svg.lucide-chevron-down)" },
];

const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
};
const casi = (a, b, tol = TOL) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
const r1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : n);

process.on("uncaughtException", (e) => {
    console.error("[sonda] no se pudo medir:", e?.message ?? e);
    process.exit(2);
});
process.on("unhandledRejection", (e) => {
    console.error("[sonda] no se pudo medir:", e?.message ?? e);
    process.exit(2);
});

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

/** Una barra de escribir medida: su caja, su relleno y los huecos del «+». */
function medirBarra(barra) {
    if (!barra) return null;
    const r = barra.getBoundingClientRect();
    const s = getComputedStyle(barra);
    const caja = barra.querySelector("textarea");
    const cr = caja?.getBoundingClientRect();
    // La fila es el primer antepasado de la caja que es hijo del marco.
    let fila = caja;
    while (fila && fila.parentElement !== barra) fila = fila.parentElement;
    // La zona del «+»: el primer hijo de la fila que ocupa sitio (la lista de
    // menciones del equipo es absoluta y va antes).
    const zona = Array.from(fila?.children ?? []).find(
        (c) => getComputedStyle(c).position !== "absolute" && c.getBoundingClientRect().width > 0,
    );
    const zr = zona?.getBoundingClientRect();
    // Lo que acompaña a la caja (en la conversación es ella misma; en las otras,
    // su envoltorio `relative flex-1`).
    let envoltorio = caja;
    while (envoltorio && envoltorio.parentElement !== fila) envoltorio = envoltorio.parentElement;
    const er = envoltorio?.getBoundingClientRect();
    const mas = barra.querySelector('button[aria-label="Herramientas de mensaje"], button[aria-label="Cerrar las herramientas"]');
    const mr = mas && mas.getBoundingClientRect().width > 0 ? mas.getBoundingClientRect() : null;
    // Los botones redondos de la derecha que se ven (dentro de la caja).
    const derecha = Array.from(barra.querySelectorAll("button"))
        .filter((b) => {
            const br = b.getBoundingClientRect();
            return br.width > 0 && cr && br.left >= cr.left && br.right <= cr.right + 1 && br.top >= cr.top - 1;
        })
        .map((b) => b.getAttribute("aria-label"));
    return {
        top: r.top,
        bottom: r.bottom,
        alto: r.height,
        izq: parseFloat(s.paddingLeft),
        der: parseFloat(s.paddingRight),
        arriba: parseFloat(s.paddingTop),
        raya: parseFloat(s.borderTopWidth),
        // Del filo al primer mando, del «+» (o de las herramientas) a la caja,
        // y de la caja al filo derecho.
        filoAlMas: zr ? zr.left - r.left : NaN,
        masACaja: zr && er ? er.left - zr.right : NaN,
        cajaAlFilo: er ? r.right - er.right : NaN,
        conMas: !!mr,
        derecha,
    };
}

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
    await pagina.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });

    // La raya y la barra de la conversación, sin panel.
    const base = await pagina.evaluate(
        ({ medirBarraSrc }) => {
            const medirBarra = new Function(`return (${medirBarraSrc})`)();
            const vis = (n) => n && n.getBoundingClientRect().width > 0;
            const cabConv = Array.from(document.querySelectorAll("[data-cabecera-de-chat] [data-cabecera-escritorio]")).find(vis);
            const cabLista = document.querySelector("[data-cabecera-de-la-columna]");
            const barra = Array.from(document.querySelectorAll('[data-barra="escribir"]')).find(
                (b) => vis(b) && !b.closest("[data-hoja-lateral]"),
            );
            return {
                rayaConv: cabConv?.getBoundingClientRect().bottom ?? NaN,
                rayaLista: cabLista?.getBoundingClientRect().bottom ?? NaN,
                barra: medirBarra(barra),
            };
        },
        { medirBarraSrc: medirBarra.toString() },
    );
    exigir(base.barra, `${v.width}: no se encontró la barra de escribir de la conversación`);
    exigir(casi(base.rayaConv, base.rayaLista), `${v.width}: la raya de la lista (${base.rayaLista}) y la de la conversación (${base.rayaConv}) no coinciden`);
    const bc = base.barra;
    if (bc) {
        tabla.push({ ventana: v.width, que: "barra · conversación", alto: r1(bc.alto), arriba: r1(bc.top), abajo: r1(bc.bottom), relleno: `${bc.izq}/${bc.der}/${bc.arriba}`, huecos: `${r1(bc.filoAlMas)}·${r1(bc.masACaja)}·${r1(bc.cajaAlFilo)}` });
        exigir(casi(bc.filoAlMas, bc.masACaja), `${v.width} conversación: el «+» no está a la misma distancia del filo (${r1(bc.filoAlMas)}) que de la caja (${r1(bc.masACaja)})`);
        exigir(bc.filoAlMas <= 6 + TOL, `${v.width} conversación: el «+» queda a ${r1(bc.filoAlMas)} px del filo; la separación es la mínima (6)`);
    }

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
        await pagina.waitForTimeout(1500);
        if (p.canal) {
            const canal = await pagina.$(`${p.hoja} [data-fila-de-canal]`);
            if (canal) {
                await canal.click();
                await pagina.waitForTimeout(1500);
            }
        }

        const m = await pagina.evaluate(
            ({ hojaSel, medirBarraSrc }) => {
                const medirBarra = new Function(`return (${medirBarraSrc})`)();
                const vis = (n) => n && n.getBoundingClientRect().width > 0;
                const hoja = Array.from(document.querySelectorAll(hojaSel)).find(
                    (h) => vis(h) && h.getAttribute("aria-hidden") !== "true" && h.getBoundingClientRect().left < window.innerWidth - 20,
                );
                const cab = hoja?.querySelector("[data-cabecera-del-panel]");
                const pie = hoja?.querySelector("[data-pie-del-panel]");
                const botones = pie ? Array.from(pie.children).filter(vis) : [];
                const conDesplazamiento = (n) => {
                    for (let a = n?.parentElement; a && a !== hoja; a = a.parentElement) {
                        const oy = getComputedStyle(a).overflowY;
                        if ((oy === "auto" || oy === "scroll") && a.scrollHeight > a.clientHeight) return true;
                    }
                    return false;
                };
                const pr = pie?.getBoundingClientRect();
                return {
                    raya: cab?.getBoundingClientRect().bottom ?? NaN,
                    hojaAbajo: hoja?.getBoundingClientRect().bottom ?? NaN,
                    barra: medirBarra(Array.from(hoja?.querySelectorAll('[data-barra="escribir"]') ?? []).find(vis) ?? null),
                    pie: pie
                        ? {
                              top: pr.top,
                              bottom: pr.bottom,
                              alto: pr.height,
                              raya: parseFloat(getComputedStyle(pie).borderTopWidth),
                              dentroDeUnDesplazamiento: conDesplazamiento(pie),
                              textos: botones.map((b) => b.innerText.trim()),
                              primero: botones[0]?.getBoundingClientRect().left - pr.left,
                              ultimo: pr.right - botones[botones.length - 1]?.getBoundingClientRect().right,
                              crear: (() => {
                                  const b = pie.querySelector('[data-boton="crear"]');
                                  return b ? getComputedStyle(b).backgroundColor : null;
                              })(),
                              pulgares: pie.querySelectorAll("[data-pulgares] button").length,
                              noSeEnvia: !!pie.querySelector("[data-no-se-envia]"),
                          }
                        : null,
                };
            },
            { hojaSel: p.hoja, medirBarraSrc: medirBarra.toString() },
        );

        const fila = { ventana: v.width, que: p.nombre, raya: `${r1(base.rayaConv)}/${r1(m.raya)}` };
        exigir(casi(m.raya, base.rayaConv), `${v.width} ${p.nombre}: la raya del panel (${m.raya}) no cae donde la de la conversación (${base.rayaConv})`);

        if (p.barra) {
            const b = m.barra;
            exigir(b, `${v.width} ${p.nombre}: no se encontró su barra de escribir`);
            if (b && bc) {
                fila.alto = r1(b.alto);
                fila.arriba = r1(b.top);
                fila.abajo = r1(b.bottom);
                fila.relleno = `${b.izq}/${b.der}/${b.arriba}`;
                fila.huecos = `${r1(b.filoAlMas)}·${r1(b.masACaja)}·${r1(b.cajaAlFilo)}`;
                fila.derecha = b.derecha.join(",");
                exigir(casi(b.alto, bc.alto), `${v.width} ${p.nombre}: la barra mide ${r1(b.alto)} y la de la conversación ${r1(bc.alto)}`);
                exigir(casi(b.top, bc.top), `${v.width} ${p.nombre}: la barra arranca en ${r1(b.top)} y la de la conversación en ${r1(bc.top)}`);
                exigir(casi(b.bottom, bc.bottom), `${v.width} ${p.nombre}: la barra acaba en ${r1(b.bottom)} y la de la conversación en ${r1(bc.bottom)}`);
                exigir(b.raya === bc.raya, `${v.width} ${p.nombre}: la raya de la barra no es la misma (${b.raya} vs ${bc.raya})`);
                exigir(
                    b.izq === bc.izq && b.der === bc.der && b.arriba === bc.arriba,
                    `${v.width} ${p.nombre}: el relleno (${fila.relleno}) no es el de la conversación (${bc.izq}/${bc.der}/${bc.arriba})`,
                );
                exigir(b.conMas, `${v.width} ${p.nombre}: la barra no tiene su «+»`);
                exigir(
                    casi(b.filoAlMas, b.masACaja) && casi(b.filoAlMas, bc.filoAlMas),
                    `${v.width} ${p.nombre}: el «+» no está a la misma distancia del filo y de la caja, ni a la de la conversación (${fila.huecos} vs ${r1(bc.filoAlMas)})`,
                );
                exigir(casi(b.cajaAlFilo, bc.cajaAlFilo), `${v.width} ${p.nombre}: la caja queda a ${r1(b.cajaAlFilo)} px del filo derecho y en la conversación a ${r1(bc.cajaAlFilo)}`);
                if (p.nombre === "Copiloto") {
                    exigir(b.derecha.length === 1, `${v.width} copiloto: a la derecha tiene que haber UN botón, hay ${b.derecha.length} (${b.derecha.join(", ")})`);
                }
            }
        }

        if (p.pie) {
            const q = m.pie;
            exigir(q, `${v.width} ${p.nombre}: no tiene su fila fija abajo`);
            if (q && bc) {
                fila.pie = `${r1(q.top)}→${r1(q.bottom)} (${r1(q.alto)})`;
                fila.textos = q.textos.join(" | ");
                exigir(!q.dentroDeUnDesplazamiento, `${v.width} ${p.nombre}: el pie está dentro de lo que se desplaza`);
                exigir(q.raya === 1, `${v.width} ${p.nombre}: el pie no lleva su raya encima (${q.raya})`);
                exigir(casi(q.alto, bc.alto), `${v.width} ${p.nombre}: el pie mide ${r1(q.alto)} y la barra de escribir ${r1(bc.alto)}`);
                exigir(casi(q.top, bc.top), `${v.width} ${p.nombre}: el pie arranca en ${r1(q.top)} y la barra de escribir en ${r1(bc.top)}`);
                exigir(casi(q.bottom, m.hojaAbajo), `${v.width} ${p.nombre}: el pie no está pegado abajo`);
                if (p.pie === "crear") {
                    exigir(
                        q.textos.length === 2 && q.textos[0] === "Cancelar" && q.textos[1] === "Crear",
                        `${v.width} ${p.nombre}: los botones dicen «${q.textos.join(" / ")}», no «Cancelar / Crear»`,
                    );
                    fila.crear = q.crear;
                } else {
                    exigir(q.noSeEnvia && q.pulgares === 2, `${v.width} ${p.nombre}: el pie no trae «No se envía al cliente» y los dos pulgares`);
                    exigir(q.textos[0]?.startsWith("No se envía al cliente"), `${v.width} ${p.nombre}: «No se envía al cliente» no va a la izquierda`);
                }
            }
        }
        tabla.push(fila);

        // La fila fija NO se mueve al desplazar lo de encima.
        if (p.pie && m.pie) {
            const antes = m.pie.top;
            await pagina.evaluate((hojaSel) => {
                const hoja = Array.from(document.querySelectorAll(hojaSel)).find((h) => h.getAttribute("aria-hidden") !== "true");
                for (const n of hoja?.querySelectorAll("*") ?? []) {
                    const oy = getComputedStyle(n).overflowY;
                    if (oy === "auto" || oy === "scroll") n.scrollTop = 99999;
                }
            }, p.hoja);
            await pagina.waitForTimeout(200);
            const despues = await pagina.evaluate((hojaSel) => {
                const hoja = Array.from(document.querySelectorAll(hojaSel)).find((h) => h.getAttribute("aria-hidden") !== "true");
                return hoja?.querySelector("[data-pie-del-panel]")?.getBoundingClientRect().top ?? NaN;
            }, p.hoja);
            exigir(casi(antes, despues), `${v.width} ${p.nombre}: el pie se movió al desplazar el cuerpo (${antes} → ${despues})`);
        }
    }

    // El copiloto: un botón a la derecha, el micrófono vacío y la flecha con texto.
    if (await pulsarVisible(pagina, 'button[aria-label="Abrir copiloto"]')) {
        await pagina.waitForTimeout(1200);
        const caja = await pagina.$("#ai-chat-sheet-desktop textarea");
        exigir(!!caja, `${v.width} copiloto: su caja de escribir es un <textarea>, como en las otras dos`);
        if (caja) {
            const derecha = async () =>
                pagina.evaluate(() => {
                    const hoja = document.querySelector("#ai-chat-sheet-desktop");
                    const t = hoja.querySelector("textarea").getBoundingClientRect();
                    return Array.from(hoja.querySelectorAll('[data-barra="escribir"] button'))
                        .filter((b) => {
                            const r = b.getBoundingClientRect();
                            return r.width > 0 && r.left >= t.left && r.right <= t.right + 1;
                        })
                        .map((b) => b.getAttribute("aria-label"));
                });
            const vacia = await derecha();
            await caja.fill("hola");
            await pagina.waitForTimeout(200);
            const conTexto = await derecha();
            await caja.fill("");
            tabla.push({ ventana: v.width, que: "copiloto · derecha", vacia: vacia.join(","), conTexto: conTexto.join(",") });
            exigir(vacia.length === 1 && /dictar/i.test(vacia[0] ?? ""), `${v.width} copiloto: con la caja vacía tiene que haber solo el micrófono (${vacia.join(", ")})`);
            exigir(conTexto.length === 1 && /enviar/i.test(conTexto[0] ?? ""), `${v.width} copiloto: con texto tiene que haber solo la flecha (${conTexto.join(", ")})`);
            // Las sugerencias viven en el «+», no sueltas encima de la caja.
            const sueltas = await pagina.evaluate(() =>
                Array.from(document.querySelectorAll("#ai-chat-sheet-desktop button")).filter(
                    (b) => b.getBoundingClientRect().width > 0 && /Sugerir respuesta|Resumir chat|Explicar pantalla/.test(b.innerText),
                ).length,
            );
            exigir(sueltas === 0, `${v.width} copiloto: hay ${sueltas} sugerencias sueltas encima de la caja`);
            await pulsarVisible(pagina, '#ai-chat-sheet-desktop button[aria-label="Herramientas de mensaje"]');
            await pagina.waitForTimeout(300);
            const dentro = await pagina.evaluate(
                () => document.querySelectorAll("#ai-chat-sheet-desktop [data-opciones-rapidas] button").length,
            );
            exigir(dentro >= 3, `${v.width} copiloto: el «+» no trae las sugerencias dentro (${dentro})`);
            await pagina.keyboard.press("Escape");
        }
        await pulsarVisible(pagina, 'button[aria-label="Cerrar copiloto"]');
        await pagina.waitForTimeout(800);
    }

    // Crear va en AZUL en los dos: el del recordatorio tiene que ser el color del de la tarea.
    const colores = tabla.filter((f) => f.ventana === v.width && f.crear).map((f) => f.crear);
    exigir(colores.length === 2 && colores[0] === colores[1], `${v.width}: «Crear» no es del mismo color en recordatorio y tarea (${colores.join(" vs ")})`);

    // 11. Los cuatro menús de la columna.
    for (const menu of MENUS) {
        await apartarLoQueTapa(pagina);
        const disparador = (await pagina.$$(menu.disparador))[0];
        exigir(!!disparador, `${v.width}: no se encontró el botón de «${menu.nombre}»`);
        if (!disparador) continue;
        await disparador.click();
        await pagina.waitForTimeout(500);
        const mm = await pagina.evaluate((sel) => {
            const d = document.querySelector(sel).getBoundingClientRect();
            const col = document.querySelector("[data-columna-de-chats]").getBoundingClientRect();
            const cab = document.querySelector("[data-cabecera-de-la-columna]");
            const cr = cab.getBoundingClientRect();
            const raya = parseFloat(getComputedStyle(cab).borderBottomWidth);
            const contenido = Array.from(
                document.querySelectorAll('[data-radix-popper-content-wrapper] > [data-state="open"]'),
            ).find((n) => n.getBoundingClientRect().width > 0);
            if (!contenido) return null;
            const r = contenido.getBoundingClientRect();
            // ¿Se ve la raya? Se pregunta al navegador qué hay en cada punto de
            // la raya por debajo del menú.
            let tapada = 0;
            for (let x = Math.ceil(r.left) + 2; x < r.right - 2; x += 8) {
                // En píxeles ENTEROS: el navegador redondea la coordenada al
                // preguntar, y con un medio píxel se asomaría a la fila de
                // debajo de la raya, que es justo donde el menú SÍ tiene que estar.
                for (let y = Math.round(cr.bottom - raya); y < Math.round(cr.bottom); y += 1) {
                    const el = document.elementFromPoint(x, y);
                    if (el && contenido.contains(el)) tapada += 1;
                }
            }
            return {
                d: { l: d.left, r: d.right },
                col: { l: col.left, r: col.right, mitad: (col.left + col.right) / 2 },
                raya: cr.bottom,
                menu: { l: r.left, r: r.right, t: r.top, ancho: r.width },
                tapada,
            };
        }, menu.disparador);
        exigir(!!mm, `${v.width}: «${menu.nombre}» no se abrió`);
        if (mm) {
            const izquierda = (mm.d.l + mm.d.r) / 2 <= mm.col.mitad;
            const anclado = izquierda ? casi(mm.menu.l, mm.d.l) : casi(mm.menu.r, mm.d.r);
            const pegadoAlFilo = casi(mm.menu.l, mm.col.l) || casi(mm.menu.r, mm.col.r);
            tabla.push({
                ventana: v.width,
                que: `menú · ${menu.nombre}`,
                nace: r1(mm.menu.t),
                raya: r1(mm.raya),
                menu: `${r1(mm.menu.l)}→${r1(mm.menu.r)}`,
                boton: `${r1(mm.d.l)}→${r1(mm.d.r)}`,
                columna: `${r1(mm.col.l)}→${r1(mm.col.r)}`,
            });
            exigir(casi(mm.menu.t, mm.raya), `${v.width} «${menu.nombre}»: nace en ${r1(mm.menu.t)} y la raya acaba en ${r1(mm.raya)} (tiene que nacer justo debajo, sin hueco)`);
            exigir(mm.tapada === 0, `${v.width} «${menu.nombre}»: el menú se come la raya divisoria`);
            exigir(mm.menu.l >= mm.col.l - TOL && mm.menu.r <= mm.col.r + TOL, `${v.width} «${menu.nombre}»: se sale de la columna (${r1(mm.menu.l)}→${r1(mm.menu.r)} en ${r1(mm.col.l)}→${r1(mm.col.r)})`);
            exigir(anclado || pegadoAlFilo, `${v.width} «${menu.nombre}»: no nace anclado a su botón (${izquierda ? "filo izquierdo" : "filo derecho"})`);
        }
        await pagina.keyboard.press("Escape");
        await pagina.waitForTimeout(300);
    }

    await contexto.close();
}

await navegador.close();
console.table(tabla);
if (fallos.length) {
    console.error(`\n${fallos.length} cosa(s) no cuadran:`);
    for (const f of fallos) console.error(" - " + f);
    process.exit(1);
}
console.log("\nTodo cuadra en las tres anchuras.");
