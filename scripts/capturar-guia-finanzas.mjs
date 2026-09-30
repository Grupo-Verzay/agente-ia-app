/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Finanzas, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-finanzas.mjs`: una cafetería con ocho meses de movimientos).
 *
 * La MISMA forma que la de Leads, Catálogo, Diagramas, Reuniones y Mis notas:
 * cada captura es una receta —abre esto, pulsa aquello, resalta este
 * elemento— y las marcas se dibujan encima de la pantalla real. Lo que no
 * depende de la pantalla —entrar, medir, marcar, guardar, las miniaturas, el
 * marco (el menú y la barra de arriba) y la narración— viene del taller común
 * (`taller-de-la-guia.mjs`). Aquí van solo las recetas de Finanzas.
 *
 * Finanzas son SIETE pantallas —el resumen y seis subpantallas: Ventas,
 * Gastos, Clientes, Proveedores, Cuentas y Configuración—, y todas se
 * localizan por las marcas que exponen (`data-accesos-de-finanzas`,
 * `data-tabla-de-finanzas`, `data-filtro-de-periodo`, `data-accion-de-fila`,
 * `data-boton`…) y por los títulos de sus ventanas, nunca por coordenadas.
 *
 * Ninguna receta GUARDA nada: los formularios se abren, se rellenan para la
 * foto y se cierran con Escape. Así el vídeo sale del mismo punto de partida
 * que la primera captura, sin volver a sembrar.
 *
 * Se lanza con `scripts/generar-guia-finanzas.sh`.
 */
import { createRequire } from "node:module";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-finanzas.mjs";
import { guardarWav, mezclar, montarLaPista } from "./voz-de-la-guia.mjs";
import {
    LA_BARRA_DE_ARRIBA,
    caja,
    comprobarLasCapturas,
    conElDominioDeLaGuia,
    crearGuardar,
    dentro,
    desmarcar,
    despejar,
    dondeAcabaElMenu,
    elMarcoDeLaPantalla,
    elMenuLateral,
    empezarLaNarracion,
    entrar,
    escribirLaVozDelVideo,
    esconderLosBotonesDelBorde,
    espera,
    holgura,
    lasPartesDeArriba,
    loQuePintaElMenu,
    marcar,
    mover,
    prepararLaVoz,
    pulsar,
    rotulo,
    tomarLasMiniaturas,
    unir,
} from "./taller-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "finanzas");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-finanzas";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
/** Solo el vídeo: las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-finanzas.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-finanzas.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardarTalCual = crearGuardar({ salida: SALIDA, tomadas });
/*
 * Antes de cada foto se suelta el foco, salvo que haya una lista o un menú
 * abierto (esos viven en un popper y se cerrarían o cambiarían de fila).
 * Radix le da el foco a la X al abrir una ventana, y a un campo al escribir en
 * él: su anillo sale en la foto y se lee como una marca más que nadie puso.
 */
const guardar = async (p, ...resto) => {
    await p.evaluate(() => {
        if (document.querySelector("[data-radix-popper-content-wrapper]")) return;
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    return guardarTalCual(p, ...resto);
};

/* ------------------------------------------------------------------ */
/* Dónde está cada cosa                                                */
/* ------------------------------------------------------------------ */

const RESUMEN = "/dashboard/finance";
const PANTALLAS = {
    resumen: { ruta: RESUMEN, listo: "[data-resumen-anual]" },
    ventas: { ruta: `${RESUMEN}/sales`, listo: "[data-tabla-de-finanzas] tbody tr" },
    gastos: { ruta: `${RESUMEN}/expenses`, listo: "[data-tabla-de-finanzas] tbody tr" },
    clientes: { ruta: `${RESUMEN}/clients`, listo: "[data-tabla-de-finanzas] tbody tr" },
    proveedores: { ruta: `${RESUMEN}/providers`, listo: "[data-tabla-de-finanzas] tbody tr" },
    cuentas: { ruta: `${RESUMEN}/accounts`, listo: "[data-tabla-de-finanzas] tbody tr" },
    configuracion: { ruta: `${RESUMEN}/settings`, listo: "text=Configuración de Finanzas" },
};

const ACCESOS = "[data-accesos-de-finanzas]";
const acceso = (p, id) => p.locator(`[data-acceso-de-finanzas="${id}"]`).first();
const BARRA = "[data-barra-de-acciones]";
const zona = (p, nombre) => p.locator(`${BARRA} [data-zona="${nombre}"]`).first();
const TABLA = "[data-tabla-de-finanzas]";
const LA_TABLA = (p) => p.locator(`${TABLA} table`).first();
const FILAS = (p) => p.locator(`${TABLA} tbody tr`);
const laFila = (p, texto) => p.locator(`${TABLA} tbody tr`, { hasText: texto }).first();
/** Lo que ocupa un texto de verdad: el botón de una cabecera mide la celda entera. */
async function elTexto(locator) {
    await locator.waitFor({ state: "visible", timeout: 20000 });
    return locator.evaluate((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const b = r.getBoundingClientRect();
        return { x: b.left, y: b.top, w: b.width, h: b.height };
    });
}
const laCabecera = (p, texto) => p.locator(`${TABLA} thead th`, { hasText: texto }).first();
const FILTRO = "[data-filtro-de-periodo]";
/** La ventana abierta, por su título. */
const laVentana = (p, titulo) => p.locator('[role="dialog"]', { has: p.getByRole("heading", { name: titulo }) }).last();
/** El menú desplegable que se acaba de abrir (Radix lo pinta en un portal). */
const elMenu = (p) => p.locator('[role="menu"]').last();
/** La casilla de un campo de un formulario de Ventas o Gastos, por su rótulo (`MiniField`). */
const elCampo = (ventana, rotulo) =>
    ventana.locator("div.space-y-1", { has: ventana.page().locator("label", { hasText: new RegExp(`^${rotulo.replace(/[()]/g, "\\$&")}$`) }) }).first();
/** La casilla de un campo de la ficha de un contacto, por su rótulo (`<Label>`). */
const elCampoDeLaFicha = (ventana, rotulo) =>
    ventana.locator("div", { has: ventana.page().locator(`label:text-is("${rotulo}")`) }).filter({ has: ventana.page().locator("input, textarea, button[role='combobox']") }).last();

/** Las pestañas del Panel, arriba de la pantalla. */
const LAS_PESTANAS = (p) => p.locator(`nav a[href="${RESUMEN}"]`).first().locator("xpath=ancestor::div[contains(@class,'sticky')][1]");

/** El ratón, fuera de todo: un botón con el cursor encima sale resaltado. */
const apartar = (p) => p.mouse.move(p.viewportSize().width - 30, p.viewportSize().height - 30);

async function abrir(p, cual, { mes } = {}) {
    const { ruta, listo } = PANTALLAS[cual];
    await p.goto(`${BASE}${ruta}${mes ? `?month=${mes}` : ""}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(listo, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 1500);
    await despejar(p);
    // Los botones del borde (nota rápida, copiloto, equipo) son de TODAS las
    // pantallas: aquí tapan la columna de acciones de la tabla.
    await esconderLosBotonesDelBorde(p);
    await apartar(p);
}

/** Cierra ventanas y listas que abrió una receta, sin guardar nada. */
async function cerrarTodo(p) {
    for (let i = 0; i < 4; i += 1) {
        if (!(await p.$('[role="dialog"], [role="listbox"], [role="menu"], [role="alertdialog"], [data-radix-popper-content-wrapper]'))) break;
        await p.keyboard.press("Escape");
        await espera(p, 350);
    }
}

/** Una caja abierta `x` píxeles a cada lado y `y` arriba y abajo: su número no tapa el texto. */
const afuera = (c, x, y = 0) => ({ x: c.x - x, y: c.y - y, w: c.w + 2 * x, h: c.h + 2 * y });

/** La caja de una ventana abierta, para encuadrarla con un poco de aire. */
async function laCajaDeLaVentana(p, ventana) {
    await ventana.waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 450);
    return caja(p, ventana);
}

/**
 * El detalle de un movimiento: que la X de cerrar no tape ningún mando. Antes
 * quedaba encima del botón de Eliminar, y eso no da ningún error — solo se ve
 * en la foto. Aquí se mide y la receta se cae si vuelve a pasar.
 */
async function queLaXNoTapeNada(p, ventana) {
    const choques = await ventana.evaluate((v) => {
        const x = v.querySelector("[data-cerrar] button");
        if (!x) return ["no hay X"];
        const rx = x.getBoundingClientRect();
        const fuera = [];
        for (const b of v.querySelectorAll("[data-cabecera-del-detalle] button")) {
            const r = b.getBoundingClientRect();
            const seTocan = r.left < rx.right && rx.left < r.right && r.top < rx.bottom && rx.top < r.bottom;
            if (seTocan) fuera.push(b.getAttribute("aria-label") || b.textContent || "un botón");
        }
        return fuera;
    });
    if (choques.length) throw new Error(`La X del detalle tapa: ${choques.join(", ")}`);
}

/** Pulsa Nuevo (el azul de la barra) y espera su ventana. */
async function nuevo(p, titulo) {
    await zona(p, "crear").locator("button").first().click();
    const v = laVentana(p, titulo);
    await v.waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 600);
    return v;
}

/** Elige una opción de un `Select` de Radix dentro de una ventana. */
async function elegir(p, disparador, opcion) {
    await disparador.click();
    await p.getByRole("option", { name: opcion }).first().click();
    await espera(p, 300);
}

/** Un mes de la rejilla del resumen, por su nombre («julio»). */
const elMes = (p, nombre) => p.locator("[data-resumen-anual] a", { hasText: new RegExp(`^${nombre}`, "i") }).first();

/** Pasa el ratón por la gráfica hasta que salga la cajita de un día con cifras. */
async function unDiaDeLaGrafica(p, dia = 0.55) {
    const g = await caja(p, p.locator("[data-grafica-del-mes] .recharts-wrapper").first());
    const x = g.x + g.w * dia;
    await p.mouse.move(x, g.y + g.h * 0.5, { steps: 12 });
    await espera(p, 600);
    const tip = p.locator(".recharts-tooltip-wrapper").first();
    await tip.waitFor({ state: "visible", timeout: 10000 });
    return caja(p, tip);
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

/**
 * La caja de lo que SE VE de un elemento: su rectángulo recortado por cada
 * antepasado que desplaza y por la ventana. `boundingBox` da el elemento
 * entero, y en Finanzas lo que más importa se desplaza: la fila de accesos por
 * los lados, una tabla ancha (Proveedores) también, y una lista larga por
 * debajo de la ventana. Con la caja entera el recuadro de la miniatura se
 * salía de la imagen, y su borde no se veía.
 */
async function cajaVisible(p, selector) {
    const el = typeof selector === "string" ? p.locator(selector).first() : selector;
    await el.waitFor({ state: "visible", timeout: 20000 });
    return el.evaluate((nodo) => {
        const r = nodo.getBoundingClientRect();
        let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
        for (let a = nodo.parentElement; a && a !== document.documentElement; a = a.parentElement) {
            const s = getComputedStyle(a);
            if (/(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY)) {
                const b = a.getBoundingClientRect();
                x0 = Math.max(x0, b.left); y0 = Math.max(y0, b.top);
                x1 = Math.min(x1, b.right); y1 = Math.min(y1, b.bottom);
            }
        }
        x0 = Math.max(x0, 0); y0 = Math.max(y0, 0);
        x1 = Math.min(x1, innerWidth); y1 = Math.min(y1, innerHeight);
        return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
    });
}

/** Cuántas filas de una lista enseña su miniatura: las de arriba, que es lo que se lee primero. */
const FILAS_EN_LA_MINIATURA = 8;

async function miniaturas(p) {
    const laTabla = (cual) => async () => {
        await abrir(p, cual);
        return cajaVisible(p, LA_TABLA(p));
    };
    // Una lista larga (Ventas, Gastos) no cabe en una tarjeta 16:9: su zona es
    // la cabecera y las primeras filas.
    const lasPrimerasFilas = (cual) => async () => {
        await abrir(p, cual);
        const filas = FILAS(p);
        const ultima = Math.min(FILAS_EN_LA_MINIATURA, await filas.count()) - 1;
        return unir(await cajaVisible(p, p.locator(`${TABLA} thead`).first()), await cajaVisible(p, filas.nth(ultima)));
    };
    const zonas = [
        ["vista-general", async () => {
            await abrir(p, "resumen");
            return unir(await cajaVisible(p, ACCESOS), await cajaVisible(p, BARRA), await cajaVisible(p, "[data-resumen-anual]"), await cajaVisible(p, "[data-grafica-del-mes]"));
        }],
        ["resumen", async () => {
            await abrir(p, "resumen");
            return caja(p, "[data-resumen-anual]");
        }],
        ["ventas", lasPrimerasFilas("ventas")],
        ["gastos", lasPrimerasFilas("gastos")],
        ["periodo", async () => {
            await abrir(p, "ventas");
            await p.locator(FILTRO).click();
            await p.locator('[data-grupo="periodo"] button', { hasText: "Mes" }).click();
            await espera(p, 500);
            const contenido = p.locator("[data-radix-popper-content-wrapper]").last();
            return unir(await caja(p, FILTRO), await caja(p, contenido));
        }],
        ["clientes", laTabla("clientes")],
        ["proveedores", laTabla("proveedores")],
        ["cuentas", laTabla("cuentas")],
        ["configuracion", async () => {
            await abrir(p, "configuracion");
            return caja(p, p.locator("div.rounded-xl, div.rounded-lg", { has: p.getByText("Configuración de Finanzas") }).last());
        }],
        ["acciones", async () => {
            await abrir(p, "ventas");
            const casillas = p.getByRole("checkbox", { name: "Seleccionar venta" });
            await casillas.nth(0).click();
            await casillas.nth(1).click();
            await espera(p, 300);
            return unir(await caja(p, FILAS(p).nth(0)), await caja(p, FILAS(p).nth(1)));
        }],
    ];
    await tomarLasMiniaturas(p, zonas, { salida: SALIDA, tomadas, focos: FOCOS, despues: () => cerrarTodo(p) });
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();

    /* --- 1. La pantalla de un vistazo -------------------------------- */
    await abrir(p, "resumen");
    await guardar(p, "portada.webp");

    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const cPestanas = await caja(p, LAS_PESTANAS(p));
    const cAccesos = await caja(p, ACCESOS);
    const cBarra = await caja(p, BARRA);
    const cResumen = await caja(p, "[data-resumen-anual]");
    const cGrafica = await caja(p, "[data-grafica-del-mes]");
    const bajoElMenu = await dondeAcabaElMenu(p);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: dentro(cPestanas, 4), n: 3 },
        { c: cAccesos, n: 4 },
        { c: cBarra, n: 5 },
        { c: cResumen, n: 6 },
        { c: dentro(cGrafica, 2), n: 7 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // Las pestañas del Panel, con Finanzas señalada.
    const pestana = await caja(p, p.locator(`nav a[href="${RESUMEN}"]`).first());
    await marcar(p, [{ c: dentro(cPestanas, 4), soloLuz: true }, { c: pestana, texto: "Estás en Finanzas", lado: "abajo" }], { atenuar: true });
    const zonaPestanas = holgura({ ...cPestanas, h: cPestanas.h + 110 }, 12, vista);
    await guardar(p, "pestanas.webp", { ...zonaPestanas, y: cPestanas.y, h: zonaPestanas.h - (cPestanas.y - zonaPestanas.y) });
    await desmarcar(p);

    // Los accesos, con el Resumen marcado.
    await marcar(p, [
        { c: cAccesos, soloLuz: true },
        { c: await caja(p, acceso(p, "summary")), texto: "La pantalla en la que estás", lado: "abajo" },
    ], { atenuar: true });
    // Desde el borde de la pantalla: el rótulo, centrado bajo «Resumen», que
    // es el primero, asoma a la izquierda de la fila.
    const zonaAccesos = holgura({ ...cAccesos, h: cAccesos.h + 100 }, 14, vista);
    await guardar(p, "accesos.webp", { ...zonaAccesos, x: 0, w: zonaAccesos.w + zonaAccesos.x });
    await desmarcar(p);

    /* --- 2. El resumen del año --------------------------------------- */
    // El mes en rojo va en la misma fila que septiembre (la de abajo): así
    // los dos rótulos caen debajo de la rejilla y no tapan ninguna cifra.
    const julio = elMes(p, "julio");
    const septiembre = elMes(p, "septiembre");
    await marcar(p, [
        { c: cResumen, soloLuz: true },
        { c: await caja(p, julio), texto: "En rojo: gastó más de lo que vendió", lado: "abajo" },
        { c: await caja(p, septiembre), texto: "El mes que ves abajo", lado: "abajo" },
    ], { atenuar: true });
    await guardar(p, "resumen-anual.webp", holgura({ ...cResumen, h: cResumen.h + 90 }, 16, vista));
    await desmarcar(p);

    const anos = p.locator("[data-anos-del-resumen]");
    await marcar(p, [
        { c: cResumen, soloLuz: true },
        { c: await caja(p, anos.locator('a[aria-label^="Ver 2025"]')), n: 1 },
        { c: await caja(p, anos.locator('a[aria-label^="Ver 2027"]')), n: 2, esquina: "derecha" },
    ], { atenuar: true });
    await guardar(p, "resumen-anos.webp", holgura(cResumen, 16, vista));
    await desmarcar(p);

    // Un día de la segunda mitad y sin picos cerca: la cajita sale a su
    // derecha y el rótulo a la izquierda, sobre líneas bajas.
    const tip = await unDiaDeLaGrafica(p, 0.73);
    await marcar(p, [{ c: cGrafica, soloLuz: true }, { c: afuera(tip, 2, 2), texto: "Las cifras de ese día", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "resumen-grafica.webp", holgura(cGrafica, 16, vista));
    await desmarcar(p);
    await apartar(p);

    await zona(p, "crear").locator("button").first().click();
    await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    const cMenuNuevo = await caja(p, elMenu(p));
    // Sin la ref del botón, Radix dejaba el menú en translate(0,-200%): FUERA
    // de la pantalla. Una captura de un menú que no se ve no es un fallo que
    // se note en la guía; aquí se corta.
    const alto = p.viewportSize()?.height ?? 900;
    if (cMenuNuevo.y < 0 || cMenuNuevo.y + cMenuNuevo.h > alto || cMenuNuevo.y < cBarra.y) {
        throw new Error(`el menú de «Nuevo» se abrió fuera de su sitio: ${JSON.stringify(cMenuNuevo)}`);
    }
    const cBuscador = await caja(p, zona(p, "buscador"));
    // En el orden en que lo cuenta el texto: primero Nuevo, luego el buscador.
    await marcar(p, [
        { c: afuera(cMenuNuevo, 2, 2), n: 1, esquina: "derecha" },
        { c: cBuscador, n: 2 },
    ]);
    // 16 px más arriba: el número del buscador se cortaba contra el borde.
    await guardar(p, "resumen-nuevo.webp", holgura(unir({ ...cBarra, y: cBarra.y - 16, h: cBarra.h + 16 }, cMenuNuevo, { ...cBarra, h: cBarra.h + 150 }), 16, vista));
    await desmarcar(p);
    await cerrarTodo(p);

    /* --- 3. Ventas ---------------------------------------------------- */
    await abrir(p, "ventas");
    const cTablaVentas = await caja(p, LA_TABLA(p));
    // Numerado y no con un rótulo: la tabla va llena de cifras y cualquier
    // rótulo encima de ella tapa el total de otra venta.
    await marcar(p, [
        { c: await caja(p, p.locator(`${TABLA} thead tr`).first()), n: 1 },
        { c: await caja(p, FILAS(p).nth(1)), n: 2 },
    ]);
    await guardar(p, "ventas-lista.webp");
    await desmarcar(p);

    const venta = await nuevo(p, "Nueva venta");
    await venta.locator('button[role="combobox"]').first().click();
    await p.getByRole("option", { name: /Café Origen Huila/ }).first().click();
    await espera(p, 400);
    await elegir(p, elCampo(venta, "Categoría").locator('button[role="combobox"]'), "Ventas");
    const cVenta = await laCajaDeLaVentana(p, venta);
    // Los campos son una rejilla de dos columnas: el recuadro abarca las dos,
    // o su borde caería encima de los rótulos de la columna de la derecha.
    const izquierda = unir(await caja(p, elCampo(venta, "Producto")), await caja(p, elCampo(venta, "Contacto")), await caja(p, elCampo(venta, "Categoría")));
    const vistaPrevia = venta.locator("div.rounded-xl", { has: p.getByText("Concepto", { exact: true }) }).first();
    await marcar(p, [
        { c: afuera(izquierda, 6, 0), n: 1 },
        { c: await caja(p, vistaPrevia), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "ventas-nueva.webp", holgura(cVenta, 12, vista));
    await desmarcar(p);

    await elCampo(venta, "Extra").locator("input").fill("8000");
    await elCampo(venta, "Descuento").locator("input").fill("5000");
    await espera(p, 300);
    const total = unir(await caja(p, vistaPrevia.locator("div.shrink-0.text-right")), await caja(p, vistaPrevia.locator("[data-desglose-de-la-venta]")));
    // El campo entero (rótulo y caja) METIDO 3 px hacia dentro, con su número
    // en el centro de arriba: abierto hacia fuera, los recuadros de dos filas
    // se tocaban (las filas van a 20 px) y los números caían uno encima de
    // otro; solo con la caja, la raya de arriba tachaba el rótulo.
    const laCajaDelImporte = async (rotulo) => afuera(await caja(p, elCampo(venta, rotulo)), -3, -3);
    await marcar(p, [
        { c: await laCajaDelImporte("Monto (base)"), n: 1, esquina: "centro" },
        { c: await laCajaDelImporte("Extra"), n: 2, esquina: "centro" },
        { c: await laCajaDelImporte("Descuento"), n: 3, esquina: "centro" },
        { c: afuera(total, 4, 4), n: 4, esquina: "derecha" },
    ]);
    await guardar(p, "ventas-importes.webp", holgura(cVenta, 12, vista));
    await desmarcar(p);
    await cerrarTodo(p);

    await zona(p, "buscador").locator("input").fill("Catering");
    await espera(p, 600);
    await laFila(p, "Catering").click();
    const detalle = laVentana(p, "Detalle de la venta");
    const cDetalle = await laCajaDeLaVentana(p, detalle);
    await queLaXNoTapeNada(p, detalle);
    const soportes = detalle.locator("div.space-y-2", { has: p.getByText("Soportes", { exact: true }) }).first();
    await marcar(p, [
        { c: await caja(p, soportes), texto: "La factura que adjuntaste", lado: "arriba" },
    ]);
    await guardar(p, "ventas-detalle.webp", holgura(cDetalle, 12, vista));
    await desmarcar(p);
    await cerrarTodo(p);

    /* --- 4. Gastos ---------------------------------------------------- */
    await abrir(p, "gastos");
    // El rótulo arriba, en el hueco de la barra: debajo tapaba el tipo de la
    // segunda fila, que es justo lo que viene a explicar.
    await marcar(p, [{ c: afuera(await caja(p, laCabecera(p, "Tipo")), 4, 2), texto: "Fijo o variable", lado: "arriba" }]);
    await guardar(p, "gastos-lista.webp");
    await desmarcar(p);

    const cTablaGastos = await caja(p, LA_TABLA(p));
    // La pastilla, no la celda: la celda es ancha y el recuadro quedaba lejos
    // de lo que señala.
    const fijo = p.locator(`${TABLA} tbody td`, { hasText: /^Fijo$/ }).first().locator("> *").first();
    const variable = p.locator(`${TABLA} tbody td`, { hasText: /^Variable$/ }).first().locator("> *").first();
    await marcar(p, [
        { c: cTablaGastos, soloLuz: true },
        { c: afuera(await caja(p, fijo), 2, 2), n: 1 },
        { c: afuera(await caja(p, variable), 2, 2), n: 2 },
    ], { atenuar: true });
    await guardar(p, "gastos-tipo.webp", holgura({ ...cTablaGastos, h: Math.min(cTablaGastos.h, 520) }, 16, vista));
    await desmarcar(p);

    const gasto = await nuevo(p, "Nuevo gasto");
    await elCampo(gasto, "Concepto").locator("input").fill("Bolsas de empaque");
    await elCampo(gasto, "Monto").locator("input").fill("120000");
    await elegir(p, elCampo(gasto, "Categoría").locator('button[role="combobox"]'), "Insumos");
    const cGasto = await laCajaDeLaVentana(p, gasto);
    const camposDelGasto = ["Concepto", "Monto", "Cuenta", "Categoría", "Descripción"];
    const marcasGasto = [];
    // Número en el CENTRO del borde de arriba: en la esquina izquierda tapaba
    // la primera letra de su rótulo, y en la derecha —con dos columnas— caía en
    // el hueco entre ellas, encima del rótulo del campo de al lado. Y el
    // recuadro METIDO 3 px, como en Ventas: abierto, los de dos filas se tocaban.
    for (const [i, r] of camposDelGasto.entries()) marcasGasto.push({ c: afuera(await caja(p, elCampo(gasto, r)), -3, -3), n: i + 1, esquina: "centro" });
    await marcar(p, marcasGasto);
    await guardar(p, "gastos-nuevo.webp", holgura(cGasto, 12, vista));
    await desmarcar(p);
    await cerrarTodo(p);

    await laFila(p, "Arriendo").click();
    const detalleGasto = laVentana(p, "Detalle del gasto");
    const cDetalleGasto = await laCajaDeLaVentana(p, detalleGasto);
    await queLaXNoTapeNada(p, detalleGasto);
    const editarEliminar = unir(
        await caja(p, detalleGasto.getByRole("button", { name: "Editar" }).first()),
        await caja(p, detalleGasto.getByRole("button", { name: "Eliminar" }).first()),
    );
    // El rótulo a la izquierda: debajo se salía por el borde de la ventana.
    await marcar(p, [{ c: afuera(editarEliminar, 4, 4), texto: "Editar o eliminar desde aquí", lado: "izquierda" }]);
    await guardar(p, "gastos-detalle.webp", holgura(cDetalleGasto, 12, vista));
    await desmarcar(p);
    await cerrarTodo(p);

    /* --- 5. Filtrar por fecha ---------------------------------------- */
    await abrir(p, "ventas");
    const cFiltro = await caja(p, FILTRO);
    // A la derecha, en el hueco de la barra: debajo tapaba la primera fila.
    await marcar(p, [{ c: afuera(cFiltro, 2, 2), texto: "Dice lo que estás viendo", lado: "derecha" }]);
    await guardar(p, "periodo-boton.webp", holgura({ ...cBarra, h: cBarra.h + 220 }, 16, vista));
    await desmarcar(p);

    await p.locator(FILTRO).click();
    const popover = p.locator("[data-radix-popper-content-wrapper]").last();
    await popover.waitFor({ state: "visible" });
    await p.locator('[data-grupo="periodo"] button', { hasText: "Mes" }).click();
    await espera(p, 600);
    // Los números donde no hay texto: el 1 encima de «Mes» y el 2 debajo de la
    // caja del mes. En la esquina tapaban «Todo» y «Rango».
    await marcar(p, [
        // Subido 1 px y no más: el número cabe entre «Filtrar por fecha» y la
        // palabra «Mes»; más alto tapaba el rótulo, más bajo la palabra.
        { c: afuera(await caja(p, p.locator('[data-grupo="periodo"] button', { hasText: "Mes" })), 3, 1), n: 1, esquina: "centro" },
        { c: await caja(p, popover.locator('input[type="month"]')), n: 2, borde: "abajo" },
        { c: afuera(await caja(p, FILTRO), 2, 2), texto: "Solo ese mes", lado: "derecha" },
    ]);
    await guardar(p, "periodo-mes.webp", holgura(unir(await caja(p, BARRA), await caja(p, popover), { ...cBarra, h: cBarra.h + 330 }), 16, vista));
    await desmarcar(p);

    await p.locator('[data-grupo="periodo"] button', { hasText: "Rango" }).click();
    await espera(p, 600);
    const fechas = popover.locator('input[type="date"]');
    // Números abajo, donde la ventanita tiene hueco: arriba tapaban «Desde» y
    // «Hasta», y el rótulo de Todo tapaba «Mes» y «Rango».
    await marcar(p, [
        { c: await caja(p, fechas.nth(0)), n: 1, borde: "abajo" },
        { c: await caja(p, fechas.nth(1)), n: 2, borde: "abajo", esquina: "derecha" },
        { c: await caja(p, p.locator('[data-grupo="periodo"] button', { hasText: "Todo" })), n: 3, borde: "abajo" },
    ]);
    await guardar(p, "periodo-rango.webp", holgura(unir(await caja(p, BARRA), await caja(p, popover), { ...cBarra, h: cBarra.h + 330 }), 16, vista));
    await desmarcar(p);
    await p.locator('[data-grupo="periodo"] button', { hasText: "Todo" }).click();
    await cerrarTodo(p);

    /* --- 6 y 7. Clientes y Proveedores -------------------------------- */
    for (const [cual, singular, titulo, codigo] of [
        ["clientes", "cliente", "Nuevo cliente", "C-1"],
        ["proveedores", "proveedor", "Nuevo proveedor", "P-1"],
    ]) {
        await abrir(p, cual);
        // Numerado, como la lista de Ventas: un rótulo encima de la tabla
        // tapaba los datos de otra fila.
        await marcar(p, [
            { c: await caja(p, p.locator(`${TABLA} thead tr`).first()), n: 1 },
            { c: await caja(p, FILAS(p).nth(1)), n: 2 },
        ]);
        await guardar(p, `${cual}-lista.webp`);
        await desmarcar(p);

        const ficha = await nuevo(p, titulo);
        const cFicha = await laCajaDeLaVentana(p, ficha);
        // La caja del código dice cómo se numera («Se pone solo: C-1, C-2…»):
        // se busca por eso y se comprueba que lo diga.
        const codigoInput = ficha.locator(`input[placeholder*="${codigo}, "]`).first();
        const nombre = ficha.locator("input").nth(1);
        // Números y no rótulos: un rótulo en una ficha tan llena tapaba el
        // campo de al lado. El 1 va abajo, donde no hay texto.
        // En el centro de abajo: en la esquina tapaba la «T» de «Teléfono».
        const marcasFicha = [
            // Metidos 3 px: abiertos, su raya de arriba rozaba las letras con
            // cola del rótulo («Opcional», «apellido») y se tocaban en medio.
            { c: afuera(await caja(p, codigoInput), -3, -3), n: 1, borde: "abajo", esquina: "centro" },
            { c: afuera(await caja(p, nombre), -3, -3), n: 2, esquina: "derecha" },
        ];
        if (cual === "clientes") {
            const whatsapp = ficha.locator('button[role="combobox"]').first();
            if (await whatsapp.count()) marcasFicha.push({ c: afuera(await caja(p, whatsapp), -3, -3), n: 3, esquina: "derecha" });
        }
        await marcar(p, marcasFicha);
        await guardar(p, `${cual}-nuevo.webp`, holgura(cFicha, 12, vista));
        await desmarcar(p);
        await cerrarTodo(p);

        await p.locator(`${BARRA} [data-boton="campos"]`).click();
        const campos = laVentana(p, "Configurar campos");
        const cCampos = await laCajaDeLaVentana(p, campos);
        const fila = campos.locator('[title="Obligatorio"]').first().locator("xpath=..");
        // El interruptor con su palabra, metido 3 px a los lados: abiertos, los
        // dos recuadros se tocaban y el del 2 tapaba el punto de «Oblig.»; solo
        // con el interruptor, su raya tachaba la primera letra de la palabra.
        const interruptor = (titulo) => campos.locator(`[title="${titulo}"]`).first();
        await marcar(p, [
            { c: afuera(await caja(p, interruptor("Obligatorio")), -3, 0), n: 1 },
            { c: afuera(await caja(p, interruptor("Visible")), -3, 0), n: 2, esquina: "derecha" },
            { c: await caja(p, campos.getByRole("button", { name: "Agregar campo" })), texto: cual === "clientes" ? "Añade los tuyos" : `Solo para cada ${singular}`, lado: "derecha" },
        ]);
        await guardar(p, `${cual}-campos.webp`, holgura(cCampos, 12, vista));
        await desmarcar(p);
        void fila;
        await cerrarTodo(p);
    }

    /* --- 8. Cuentas --------------------------------------------------- */
    await abrir(p, "cuentas");
    // El rótulo de cada columna y no la celda entera: las tres celdas van
    // pegadas, así que sus recuadros se montaban y el 1 caía sobre el filtro.
    const elRotulo = async (t) => afuera(await elTexto(laCabecera(p, t).getByText(t, { exact: true })), 6, 4);
    await marcar(p, [
        { c: await elRotulo("Ventas"), n: 1, esquina: "derecha" },
        { c: await elRotulo("Gastos"), n: 2, esquina: "derecha" },
        { c: await elRotulo("Saldo"), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "cuentas-lista.webp");
    await desmarcar(p);

    await laFila(p, "Bancolombia").click();
    const movimientos = laVentana(p, "Movimientos de «Bancolombia»");
    const cMov = await laCajaDeLaVentana(p, movimientos);
    await marcar(p, [
        // El 1 a la derecha, donde la línea de totales ya no tiene texto; y el
        // rótulo a la derecha del grupo: a la izquierda tapaba el título y la
        // «V» de «Ventas», y debajo el tipo de la primera fila.
        { c: await caja(p, movimientos.locator("[data-totales-de-la-cuenta]")), n: 1, esquina: "derecha" },
        { c: await caja(p, movimientos.locator('[data-grupo="movimientos"]')), texto: "Todos, Ventas o Gastos", lado: "derecha" },
    ]);
    await guardar(p, "cuentas-movimientos.webp", holgura(cMov, 12, vista));
    await desmarcar(p);
    await cerrarTodo(p);

    const cuenta = await nuevo(p, "Nueva cuenta");
    await cuenta.locator('input[placeholder^="Ej: Caja"]').fill("Daviplata");
    const cCuenta = await laCajaDeLaVentana(p, cuenta);
    const bloque = (texto) => cuenta.locator("div.space-y-1", { has: p.getByText(texto, { exact: true }) }).first();
    // Los controles y no el bloque entero (rótulo y ayuda): con los bloques,
    // los cuatro recuadros se tocaban unos con otros.
    await marcar(p, [
        { c: await caja(p, bloque("Nombre").locator("input")), n: 1 },
        { c: await caja(p, bloque("Tipo").locator('button[role="combobox"]')), n: 2, esquina: "derecha" },
        { c: await caja(p, bloque("Moneda de la cuenta").locator('button[role="combobox"]')), n: 3 },
        { c: await caja(p, cuenta.locator("div.rounded-xl", { has: p.getByText("Cuenta predeterminada", { exact: true }) }).first()), n: 4 },
    ]);
    await guardar(p, "cuentas-nueva.webp", holgura(cCuenta, 12, vista));
    await desmarcar(p);
    await cerrarTodo(p);

    const estrella = laFila(p, "Nequi").locator('[data-accion-de-fila="Marcar como predeterminada"]');
    const cTablaCuentas = await caja(p, LA_TABLA(p));
    await marcar(p, [
        { c: cTablaCuentas, soloLuz: true },
        { c: afuera(await caja(p, estrella), 2, 2), texto: "La marca como predeterminada", lado: "izquierda" },
    ], { atenuar: true });
    await guardar(p, "cuentas-predeterminada.webp", holgura(cTablaCuentas, 16, vista));
    await desmarcar(p);

    /* --- 9. Configuración -------------------------------------------- */
    await abrir(p, "configuracion");
    const tarjeta = p.locator("div.rounded-xl, div.rounded-lg", { has: p.getByText("Configuración de Finanzas") }).last();
    const cTarjeta = await caja(p, tarjeta);
    const selector = tarjeta.locator('button[role="combobox"]');
    await marcar(p, [{ c: await caja(p, selector), texto: "Tu moneda preferida", lado: "abajo" }]);
    await guardar(p, "configuracion.webp", holgura({ ...cTarjeta, h: cTarjeta.h + 120 }, 20, vista));
    await desmarcar(p);

    // Se ELIGE otra moneda y se enseña el resultado: con la lista abierta, el
    // desplegable tapaba justo el botón de Guardar que se quería señalar. Y
    // Guardar va apagado hasta que la moneda cambia, así que sin elegir otra
    // saldría gris. NO se guarda: la demo sigue en su moneda.
    await selector.click();
    const lista = p.locator('[role="listbox"]').last();
    await lista.waitFor({ state: "visible" });
    await lista.getByRole("option", { name: /^USD/ }).click();
    await lista.waitFor({ state: "hidden" });
    const guardarMoneda = tarjeta.getByRole("button", { name: "Guardar" });
    await guardarMoneda.waitFor({ state: "visible" });
    if (await guardarMoneda.isDisabled()) throw new Error("Guardar sigue apagado después de elegir otra moneda");
    await espera(p, 300);
    await marcar(p, [
        // Metidos 3 px: abiertos, la raya del 1 tachaba «Moneda preferida» y
        // el número del 2 caía encima de la raya del 1. El 2, abajo.
        { c: afuera(await caja(p, selector), -3, -3), n: 1, esquina: "derecha" },
        { c: afuera(await caja(p, guardarMoneda), -3, -3), n: 2, esquina: "derecha", borde: "abajo" },
    ]);
    await guardar(p, "configuracion-lista.webp", holgura({ ...cTarjeta, h: cTarjeta.h + 40 }, 20, vista));
    await desmarcar(p);
    await cerrarTodo(p);

    await abrir(p, "cuentas");
    await laFila(p, "Bancolombia").locator('[data-accion-de-fila="Editar"]').click();
    const editar = laVentana(p, "Editar cuenta");
    const cEditar = await laCajaDeLaVentana(p, editar);
    await marcar(p, [
        { c: await caja(p, editar.locator("div.space-y-1", { has: p.getByText("Moneda de la cuenta", { exact: true }) }).first()), texto: "La moneda de esta cuenta", lado: "abajo" },
    ]);
    await guardar(p, "configuracion-cuenta.webp", holgura(cEditar, 12, vista));
    await desmarcar(p);
    await cerrarTodo(p);

    /* --- 10. Marcar, editar y eliminar ------------------------------- */
    await abrir(p, "ventas");
    const acciones = FILAS(p).nth(0).locator("[data-acciones-de-la-fila]");
    const cFilas = unir(await caja(p, FILAS(p).nth(0)), await caja(p, FILAS(p).nth(4)));
    const cEditarFila = await caja(p, acciones.locator('[data-accion-de-fila="Editar"]'));
    const cEliminarFila = await caja(p, acciones.locator('[data-accion-de-fila="Eliminar"]'));
    await marcar(p, [
        { c: cFilas, soloLuz: true },
        // Un recuadro para los dos y cada número en su esquina: los botones van
        // a 8 px uno del otro, así que dos recuadros se montaban.
        { c: unir(cEditarFila, cEliminarFila) },
        { c: cEditarFila, n: 1, sinRecuadro: true },
        { c: cEliminarFila, n: 2, esquina: "derecha", sinRecuadro: true },
    ], { atenuar: true });
    await guardar(p, "acciones-fila.webp", holgura({ ...cFilas, y: cFilas.y - 60, h: cFilas.h + 60 }, 16, vista));
    await desmarcar(p);

    const casillas = p.getByRole("checkbox", { name: "Seleccionar venta" });
    for (const i of [0, 1, 2]) await casillas.nth(i).click();
    await espera(p, 300);
    // Se mide ANTES de abrir el menú: con él abierto, Radix deja lo de fuera en
    // `aria-hidden` y `getByRole` ya no encuentra la casilla.
    const cTodo = afuera(await caja(p, p.getByRole("checkbox", { name: "Seleccionar todo lo que se ve" })), 3, 3);
    await zona(p, "acciones").locator("button").first().click();
    await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await marcar(p, [
        { c: cTodo, n: 1 },
        { c: afuera(await caja(p, elMenu(p)), 2, 2), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "acciones-marcar.webp");
    await desmarcar(p);
    await cerrarTodo(p);

    await abrir(p, "ventas");
    await p.locator(`${BARRA} [data-boton="columnas"]`).click();
    await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    const cColumnas = await caja(p, elMenu(p));
    await marcar(p, [{ c: afuera(cColumnas, 2, 2), texto: "Enseña o esconde cada columna", lado: "izquierda" }]);
    await guardar(p, "acciones-columnas.webp", holgura(unir(cBarra, cColumnas, { ...cBarra, h: cBarra.h + cColumnas.h + 30 }), 16, vista));
    await desmarcar(p);
    await cerrarTodo(p);

    await abrir(p, "resumen");
    await zona(p, "acciones").locator("button").first().click();
    await elMenu(p).getByRole("menuitem", { name: "Vaciar contabilidad" }).click();
    const vaciar = p.locator('[role="alertdialog"]').last();
    await vaciar.waitFor({ state: "visible", timeout: 10000 });
    await vaciar.locator("input").fill("VACIAR");
    await espera(p, 500);
    // Números y no un rótulo: la ventana ya lo dice («Escribe VACIAR…») y el
    // rótulo de abajo se montaba sobre el botón rojo.
    await marcar(p, [
        { c: afuera(await caja(p, vaciar.locator("input")), -3, -3), n: 1 },
        { c: await caja(p, vaciar.getByRole("button", { name: "Vaciar contabilidad" })), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "vaciar.webp", holgura(await caja(p, vaciar), 14, vista));
    await desmarcar(p);
    // Nunca se confirma: se cierra sin vaciar nada.
    await cerrarTodo(p);

    await abrir(p, "resumen");
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Panel", texto: "Finanzas está en Panel" });
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/** Entre una frase y la siguiente, lo que respira una persona hablando (el mismo de Leads). */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

/** Espera a que una pantalla de Finanzas esté pintada tras pulsar su acceso. */
async function llegar(p, cual) {
    await p.waitForURL((u) => u.pathname === PANTALLAS[cual].ruta, { timeout: 60000 });
    await p.waitForSelector(PANTALLAS[cual].listo, { timeout: 60000 });
    await esconderLosBotonesDelBorde(p);
    await espera(p, 350);
}

/** Pulsa un acceso de Finanzas; si la fila no cabe, primero lo trae a la vista (se desplaza, se ve). */
async function irA(p, id, cual) {
    const a = acceso(p, id);
    await a.evaluate((el) => el.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" }));
    await espera(p, 350);
    await pulsar(p, a);
    await llegar(p, cual);
}

async function video(navegador, estado) {
    const dir = path.join(TMP, "video");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    const voz = await prepararLaVoz(NARRACION, dir, comoSeDice);
    const ctx = await navegador.newContext({
        viewport: { width: 1280, height: 800 },
        locale: "es-CO",
        timezoneId: "America/Bogota",
        storageState: estado,
    });
    await ctx.addInitScript(CURSOR);
    await conElDominioDeLaGuia(ctx, BASE);
    const p = await ctx.newPage();
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrir(p, "resumen");
    await p.mouse.move(640, 400, { steps: 8 });
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("las ventas", 500);
    await mover(p, p.locator("[data-resumen-anual]"));

    // El menú: se abre con las dos flechas, se señala Panel y se recoge al
    // empezar la frase de la barra, donde viven las flechas.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const panel = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Panel" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Panel", 600);
    await mover(p, panel);

    const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    await decir("accesos");
    await alDecir("Ventas", 300);
    await mover(p, acceso(p, "sales"));
    await alDecir("Gastos", 300);
    await mover(p, acceso(p, "expenses"));
    await alDecir("Cuentas", 300);
    await mover(p, acceso(p, "accounts"));

    await decir("resumen");
    await alDecir("un mes en rojo", 450);
    await mover(p, elMes(p, "julio"));
    await alDecir("con estas flechas", 450);
    await mover(p, p.locator('[data-anos-del-resumen] a[aria-label^="Ver 2027"]'));

    await decir("grafica");
    await alDecir("Pulsa un mes", 300);
    await pulsar(p, elMes(p, "agosto"));
    await p.waitForURL((u) => u.searchParams.get("month") === "2026-08", { timeout: 60000 });
    await p.waitForSelector("[data-grafica-del-mes] .recharts-wrapper", { timeout: 60000 });
    await esconderLosBotonesDelBorde(p);
    await alDecir("día a día", 400);
    await unDiaDeLaGrafica(p, 0.35);
    await espera(p, 300);
    await unDiaDeLaGrafica(p, 0.6);

    await decir("ventas");
    await irA(p, "sales", "ventas");
    await alDecir("su total", 350);
    await mover(p, laCabecera(p, "Total"));
    await alDecir("la cuenta", 350);
    await mover(p, laCabecera(p, "Cuenta"));

    await decir("nuevaVenta");
    await pulsar(p, zona(p, "crear").locator("button").first());
    const venta = laVentana(p, "Nueva venta");
    await venta.waitFor({ state: "visible", timeout: 20000 });
    await alDecir("el producto", 350);
    await pulsar(p, venta.locator('button[role="combobox"]').first());
    await pulsar(p, p.getByRole("option", { name: /Café Origen Huila/ }).first());
    await alDecir("el monto", 350);
    await mover(p, elCampo(venta, "Monto (base)").locator("input"));
    await alDecir("y la cuenta", 350);
    await mover(p, elCampo(venta, "Cuenta").locator('button[role="combobox"]'));
    await alDecir("a la derecha", 350);
    await mover(p, venta.locator("div.shrink-0.text-right").first());

    await decir("gastos");
    await p.keyboard.press("Escape");
    await espera(p, 400);
    await irA(p, "expenses", "gastos");
    await alDecir("fijo o variable", 400);
    await mover(p, p.locator(`${TABLA} tbody td`, { hasText: /^Fijo$/ }).first());

    await decir("periodo");
    await alDecir("el botón de fecha", 350);
    await pulsar(p, p.locator(FILTRO));
    await alDecir("un solo mes", 350);
    await pulsar(p, p.locator('[data-grupo="periodo"] button', { hasText: "Mes" }));
    await alDecir("un rango", 350);
    await pulsar(p, p.locator('[data-grupo="periodo"] button', { hasText: "Rango" }));

    // El filtro se cierra MIENTRAS empieza la frase siguiente, no callado: volver
    // a «Todo» y cerrarlo después de la frase dejaba 1,4 s mudos en el vídeo. No
    // hace falta devolverlo a «Todo»: la frase se va a Clientes, que no lo hereda.
    await decir("contactos");
    await p.keyboard.press("Escape");
    await irA(p, "clients", "clientes");
    await alDecir("en Proveedores", 300);
    await irA(p, "providers", "proveedores");
    await alDecir("los campos", 400);
    await mover(p, p.locator(`${BARRA} [data-boton="campos"]`));

    await decir("cuentas");
    await irA(p, "accounts", "cuentas");
    await alDecir("y su saldo", 400);
    await mover(p, laCabecera(p, "Saldo"));

    await decir("cierre");
    await irA(p, "settings", "configuracion");
    await alDecir("la moneda", 400);
    await mover(p, p.locator('button[role="combobox"]').first());
    await callar(700);
    await rotulo(p, "");
    await espera(p, 500);

    const totalMs = Date.now() - t0;
    const grabado = await grabadora.parar();
    console.log(`  · grabados ${grabado.fotogramas} fotogramas (${(grabado.fotogramas / 25).toFixed(1)} s) de ${grabado.recibidos} pintados, en ${(totalMs / 1000).toFixed(1)} s`);
    await ctx.close();

    const { wav, colocados } = montarLaPista(tramos, totalMs);
    const pista = path.join(dir, "narracion.wav");
    guardarWav(pista, wav);
    const destino = path.join(SALIDA, "demostracion.webm");
    mezclar(mudo, pista, destino, { desdeMs });
    writeFileSync(path.join(TMP, "narracion.json"), JSON.stringify(colocados, null, 2));
    escribirLaVozDelVideo("finanzas", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
    console.log("  ✓ demostracion.webm", Math.round(statSync(destino).size / 1024), "KB,", colocados.length, "frases narradas");
}

/* ------------------------------------------------------------------ */

// En español de Colombia de verdad: `locale` del contexto cambia el idioma de
// la página, pero las cajas de fecha y de mes las pinta Chromium con el idioma
// del PROCESO, y salían «09/30/2026» y «September 2026». Hacen falta las dos
// cosas: `--lang` y `LANG`.
const navegador = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    args: ["--lang=es-CO"],
    env: { ...process.env, LANG: "es_CO.UTF-8", LANGUAGE: "es_CO:es" },
});
try {
    const ctx = await navegador.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        locale: "es-CO",
        timezoneId: "America/Bogota",
    });
    await conElDominioDeLaGuia(ctx, BASE);
    const p = await entrar(ctx, BASE);
    await abrir(p, "resumen");
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) await video(navegador, estado);
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/finanzas`);
