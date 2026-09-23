/**
 * Los márgenes de las dos cabeceras de Chats, sobre la página SERVIDA.
 *
 * La columna de chats y el panel de conversación tienen cada uno su cabecera
 * de dos filas. Lo que se pide es que se lean como UNA pantalla:
 *
 * 1. **Un solo margen interior** (`MARGEN`, el de la fila de Macros y
 *    Acciones) a la izquierda, a la derecha, arriba y abajo, en las DOS
 *    cabeceras.
 * 2. **El mismo filo derecho** para la última pieza de la fila de iconos (la
 *    ficha de contacto) y para Acciones.
 * 3. **La misma altura** en las dos cabeceras, y sus dos filas en la misma
 *    línea horizontal.
 * 4. **Los menús de la cabecera pegados al filo derecho** del panel de
 *    conversación, sin margen.
 *
 * Imprime una tabla con lo medido, y falla (`exit 1`) si algo no cuadra.
 * `MODO=roto` —con un `.next` del commit de antes— tiene que FALLAR.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3931";
const JID = process.env.CHAT_JID ?? "573001112233@s.whatsapp.net";
const LINEA = process.env.CHAT_LINEA ?? "BANCO_VENTAS";
const MARGEN = Number(process.env.MARGEN ?? 6);
const TOLERANCIA = 1;
const LADO = Number(process.env.LADO ?? 28);

const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
};
const casi = (a, b) => Math.abs(a - b) <= TOLERANCIA;

async function visible(pagina, selector) {
    for (const b of await pagina.$$(selector)) if (await b.isVisible()) return b;
    return null;
}

/** Todo lo que se mide, en una sola pasada del navegador. */
function medir() {
    const caja = (n) => {
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height };
    };
    const esVisible = (n) => {
        const r = n.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const s = getComputedStyle(n);
        return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0;
    };
    /** Lo que de verdad se VE: hojas con caja, recortadas por sus antepasados. */
    const loQueSeVe = (raiz) => {
        const cr = raiz.getBoundingClientRect();
        let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
        for (const n of raiz.querySelectorAll("button, img, svg, input, h2, span, a, [role=combobox]")) {
            if (!esVisible(n)) continue;
            if (n.closest("[aria-hidden=true]") && !n.matches("svg")) continue;
            if (n.closest("[data-medida], [data-medida-menu]")) continue;
            const x = n.getBoundingClientRect();
            // Recortado por la cabecera, que es `overflow-hidden`.
            const L = Math.max(x.left, cr.left), R = Math.min(x.right, cr.right);
            const T = Math.max(x.top, cr.top), B = Math.min(x.bottom, cr.bottom);
            if (R <= L || B <= T) continue;
            l = Math.min(l, L); r = Math.max(r, R); t = Math.min(t, T); b = Math.max(b, B);
        }
        return { l, r, t, b };
    };

    const columna = document.querySelector("[data-columna-de-chats]");
    const cabCol = document.querySelector("[data-cabecera-de-la-columna]") ?? columna?.firstElementChild;
    const cabConv = Array.from(document.querySelectorAll("[data-cabecera-de-chat]")).find((n) => n.getBoundingClientRect().width > 0);
    const escritorio = cabConv?.querySelector("[data-cabecera-escritorio]") ??
        Array.from(cabConv?.children ?? []).find((n) => n.getBoundingClientRect().width > 0 && getComputedStyle(n).display === "flex");

    const filasCol = Array.from(cabCol?.children ?? []).filter(esVisible);
    const filasConv = Array.from(escritorio?.children ?? []).filter(esVisible);

    const fila1 = filasConv[0];
    const avatar = fila1?.querySelector("span.relative, [class*='rounded-full']");
    const botonesFila1 = Array.from(fila1?.querySelectorAll("button") ?? []).filter(esVisible);
    const ultimoIcono = botonesFila1[botonesFila1.length - 1];
    // El TEXTO de la primera pestaña, que es lo que se ve (su caja lleva
    // `px-4`, el ancho del subrayado).
    const pestana = escritorio?.querySelector("[data-pestana-del-chat]");
    const rango = document.createRange();
    if (pestana?.firstChild) rango.selectNodeContents(pestana);
    const textoPestana = pestana ? rango.getBoundingClientRect() : null;
    const acciones = Array.from(cabConv?.querySelectorAll("button") ?? []).find((b) => esVisible(b) && b.textContent?.trim() === "Acciones");

    return {
        col: caja(cabCol),
        conv: caja(escritorio),
        convBordeAbajo: escritorio ? parseFloat(getComputedStyle(escritorio).borderBottomWidth) : 0,
        colBordeAbajo: cabCol ? parseFloat(getComputedStyle(cabCol).borderBottomWidth) : 0,
        colVe: cabCol ? loQueSeVe(cabCol) : null,
        convVe: escritorio ? loQueSeVe(escritorio) : null,
        colFilas: filasCol.map(caja),
        convFilas: filasConv.map(caja),
        colFilasVe: filasCol.map(loQueSeVe),
        convFilasVe: filasConv.map(loQueSeVe),
        avatar: caja(avatar),
        ultimoIcono: caja(ultimoIcono),
        acciones: caja(acciones),
        convPanel: caja(cabConv),
        textoPestana: textoPestana ? { l: textoPestana.left } : { l: NaN },
        // Los controles de icono de la fila de arriba de las dos cabeceras: el
        // embudo, asesores y grupos en la columna; todo lo pulsable de la fila
        // de la conversación menos el lápiz, que va pegado al nombre.
        controles: [
            ...Array.from(filasCol[0]?.querySelectorAll('[data-embudo], button[title="Filtrar por asesor"], button[title="Solo grupos"]') ?? [])
                .filter(esVisible).map((b) => ({ donde: "columna", que: b.getAttribute("title") ?? b.getAttribute("aria-label"), ...caja(b) })),
            ...Array.from(fila1?.querySelectorAll("button") ?? [])
                .filter((b) => esVisible(b) && b.getAttribute("title") !== "Editar contacto")
                .map((b) => ({ donde: "conversación", que: b.getAttribute("title") ?? b.getAttribute("aria-label") ?? b.textContent?.trim(), ...caja(b) })),
        ],
    };
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

    for (const estado of ["sin panel", "ficha abierta"]) {
    if (estado === "ficha abierta") {
        await (await visible(p, 'button[title="Ver ficha del contacto"]'))?.click();
        await p.waitForTimeout(900);
    }
    const m = await p.evaluate(medir);
    const r = (x) => Math.round(x * 10) / 10;
    const fila = {
        ancho,
        estado,
        "alto col": r(m.col.h),
        "alto conv": r(m.conv.h),
        "col izq": r(m.colVe.l - m.col.l),
        "col der": r(m.col.r - m.colVe.r),
        // En vertical el margen es el de las FILAS: cada fila mide lo mismo en
        // las dos cabeceras y lo de dentro va centrado en ella.
        "col arriba": r(m.colFilas[0].t - m.col.t),
        "col abajo": r(m.col.b - m.colBordeAbajo - m.colFilas[m.colFilas.length - 1].b),
        "conv izq (avatar)": r(m.avatar.l - m.conv.l),
        "conv der (ficha)": r(m.conv.r - m.ultimoIcono.r),
        "conv der (Acciones)": r(m.conv.r - m.acciones.r),
        "conv izq (pestaña)": r(m.textoPestana.l - m.conv.l),
        "conv arriba": r(m.convFilas[0].t - m.conv.t),
        "conv abajo": r(m.conv.b - m.convBordeAbajo - m.convFilas[m.convFilas.length - 1].b),
    };
    filas.push(fila);

    const cual = (k) => `${ancho} · ${estado}: «${k}» mide ${fila[k]}, se pide ${MARGEN}`;
    for (const k of ["col izq", "col der", "conv izq (avatar)", "conv izq (pestaña)", "conv der (ficha)", "conv der (Acciones)", "col arriba", "col abajo", "conv arriba", "conv abajo"]) {
        exigir(casi(fila[k], MARGEN), cual(k));
    }
    exigir(casi(m.col.h, m.conv.h), `${ancho} · ${estado}: las cabeceras no miden lo mismo (columna ${r(m.col.h)}, conversación ${r(m.conv.h)})`);
    exigir(casi(m.col.t, m.conv.t), `${ancho} · ${estado}: las cabeceras no empiezan a la misma altura (${r(m.col.t)} / ${r(m.conv.t)})`);
    exigir(casi(m.ultimoIcono.r, m.acciones.r), `${ancho} · ${estado}: la ficha acaba en ${r(m.ultimoIcono.r)} y Acciones en ${r(m.acciones.r)}`);
    // Los controles de icono: la misma caja (28 de alto, 28 de ancho como
    // mínimo) y el mismo centro vertical en las dos cabeceras.
    const centros = [];
    for (const c of m.controles) {
        exigir(casi(c.h, LADO), `${ancho} · ${estado}: ${c.donde} «${c.que}» mide ${r(c.h)} de alto, se pide ${LADO}`);
        exigir(c.w >= LADO - TOLERANCIA, `${ancho} · ${estado}: ${c.donde} «${c.que}» mide ${r(c.w)} de ancho, menos de ${LADO}`);
        centros.push((c.t + c.b) / 2);
    }
    exigir(m.controles.filter((c) => c.donde === "columna").length >= 2, `${ancho} · ${estado}: no se encontraron los controles de la columna`);
    if (centros.length) exigir(Math.max(...centros) - Math.min(...centros) <= 1, `${ancho} · ${estado}: los controles no comparten centro vertical (${r(Math.min(...centros))}–${r(Math.max(...centros))})`);
    fila["controles (alto)"] = [...new Set(m.controles.map((c) => r(c.h)))].join("/");

    // Las dos filas de cada cabecera en la misma línea horizontal.
    for (let i = 0; i < 2; i++) {
        const a = m.colFilasVe[i], b = m.convFilasVe[i];
        if (!a || !b) { exigir(false, `${ancho} · ${estado}: falta la fila ${i + 1} de alguna cabecera`); continue; }
        const ca = (a.t + a.b) / 2, cb = (b.t + b.b) / 2;
        exigir(Math.abs(ca - cb) <= 2, `${ancho} · ${estado}: la fila ${i + 1} no cae en la misma línea (columna ${r(ca)}, conversación ${r(cb)})`);
    }

    // Los menús: pegados al filo derecho de la conversación, sin margen.
    for (const sel of ['button[title="Macros"]', '[data-cabecera-de-chat] button:has-text("Acciones")']) {
        const b = await visible(p, sel);
        if (!b) { exigir(false, `${ancho} · ${estado}: no está ${sel}`); continue; }
        await b.click();
        await p.waitForTimeout(600);
        const d = await p.evaluate(() => {
            const c = document.querySelector("[data-radix-popper-content-wrapper] > [data-state='open']");
            const k = Array.from(document.querySelectorAll("[data-cabecera-de-chat]")).find((n) => n.getBoundingClientRect().width > 0);
            return c && k ? { right: c.getBoundingClientRect().right, cab: k.getBoundingClientRect().right } : null;
        });
        exigir(!!d, `${ancho} · ${estado}: ${sel} no abrió su menú`);
        if (d) {
            fila[sel.includes("Macros") ? "menú Macros → filo" : "menú Acciones → filo"] = r(d.cab - d.right);
            exigir(casi(d.right, Math.min(d.cab, ancho)), `${ancho} · ${estado}: el menú de ${sel} acaba en ${r(d.right)} y el filo de la conversación está en ${r(d.cab)}`);
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
console.log(`\nlas dos cabeceras comparten margen (${MARGEN} px), alto y filos; los menús van pegados al filo derecho`);
