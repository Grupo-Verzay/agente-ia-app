/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Crear flujos, sobre
 * la App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-flujos.mjs`).
 *
 * La MISMA forma que las demás guías: cada captura es una receta —abre esto,
 * pulsa aquello, resalta este elemento— y las marcas se dibujan encima de la
 * pantalla real. Lo que no depende de la pantalla —entrar, medir, marcar,
 * guardar, las miniaturas, el marco (el menú y la barra de arriba) y la
 * narración— viene del taller común (`taller-de-la-guia.mjs`). Aquí van solo
 * las recetas de Crear flujos: la lista y su editor.
 *
 * Los elementos se localizan por lo que la pantalla ya expone —las marcas
 * `data-*` de la lista (`data-fila-de-flujo`, `data-tarjeta-de-flujo`…) y del
 * editor (`data-nodo-de-flujo`, `data-agregar-accion`, `data-paleta-del-flujo`,
 * `data-accion`…)—, nunca por coordenadas.
 *
 * Las capturas CAMBIAN los datos (crean un flujo y le agregan pasos), así que
 * antes del vídeo se vuelve a sembrar: el vídeo sale del mismo punto de partida.
 *
 * Se lanza con `scripts/generar-guia-flujos.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-flujos.mjs";
import { guardarWav, mezclar, montarLaPista } from "./voz-de-la-guia.mjs";
import {
    LA_BARRA_DE_ARRIBA,
    caja,
    comprobarLasCapturas,
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
    quitarAvisos,
    rotulo,
    tomarLasMiniaturas,
    unir,
} from "./taller-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "flujos");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-flujos";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
/** Solo el vídeo: las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-flujos.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-flujos.json");
const SEMILLA = path.join(RAIZ, "scripts", "sembrar-guia-flujos.mjs");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Dónde está cada cosa                                                */
/* ------------------------------------------------------------------ */

const BARRA = "[data-barra-de-acciones]";
const LISTA = "[data-lista-de-flujos]";
const BUSCADOR = `${BARRA} [data-zona="buscador"] input`;
const NUEVO = `${BARRA} [data-zona="crear"] button`;
const HORARIO = 'button[title="Horario de envío de seguimientos"]';
const PASTILLAS = "[data-pastillas-de-flujos]";
const LIENZO = "[data-lienzo-de-flujo]";
const PANEL = "[data-panel-de-acciones]";
const PALETA = "[data-paleta-del-flujo]";

/** Una pastilla de tipo, por su nombre. */
const laPastilla = (p, nombre) => p.locator(`${PASTILLAS} [aria-label="${nombre}"]`).first();
/** Una fila de la lista (con su asa), por el nombre del flujo. */
const laFila = (p, nombre) => p.locator("[data-fila-de-flujo]", { hasText: nombre }).first();
const laTarjeta = (p, nombre) => laFila(p, nombre).locator("[data-tarjeta-de-flujo]");
/** Un paso del editor, por su tipo. */
const elNodo = (p, tipo) => p.locator(`[data-nodo-de-flujo="${tipo}"]`).first();
/** La caja de texto de un paso (sin abrir), la que dice «Clic para escribir». */
const laCajaDelTexto = (nodo) => nodo.locator(".cursor-pointer").first();
/** Una fila del panel «Selecciona una acción» (el del «+»), por su tipo. */
const laOpcion = (p, tipo) => p.locator(`${PANEL} [data-accion="${tipo}"]`).first();

/** El ratón, fuera de todo: un botón con el cursor encima sale resaltado. */
const apartar = (p) => p.mouse.move(p.viewportSize().width - 30, p.viewportSize().height - 30);

async function abrirLaLista(p) {
    await p.goto(`${BASE}/workflow`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${LISTA} [data-fila-de-flujo]`, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 1500);
    await despejar(p);
    // Los botones del borde (nota rápida, copiloto, equipo) son de TODAS las
    // pantallas: aquí tapan el «⋯» de las tarjetas y no explican nada de esta.
    await esconderLosBotonesDelBorde(p);
    await apartar(p);
}

/** El id de un flujo, leído de su fila. */
const elIdDe = (p, nombre) => laFila(p, nombre).getAttribute("data-fila-de-flujo");

async function abrirElEditor(p, nombre) {
    await abrirLaLista(p);
    const id = await elIdDe(p, nombre);
    await p.goto(`${BASE}/workflow/${id}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${LIENZO} [data-nodo-de-flujo]`, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 1800);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
    await apartar(p);
}

/** Cierra lo que quede abierto (un menú, una ventana) sin guardar nada. */
async function cerrarLoAbierto(p) {
    for (let i = 0; i < 3; i += 1) {
        if (!(await p.$('[role="dialog"], [role="alertdialog"], [role="menu"], [data-panel-de-acciones]'))) break;
        await p.keyboard.press("Escape");
        await espera(p, 350);
    }
}

/** Espera al aviso de lo que se acaba de hacer y a que se vaya. */
async function trasElAviso(p) {
    await p.locator("[data-sonner-toast]").first().waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await quitarAvisos(p);
}

/** La ventana «Nuevo flujo», abierta y con el nombre escrito. */
async function laVentanaDeCrear(p, nombre) {
    await p.locator(NUEVO).click();
    const v = p.locator('[role="dialog"]').filter({ hasText: "NUEVO FLUJO" });
    await v.waitFor({ state: "visible", timeout: 10000 });
    await v.locator('input[placeholder="NOMBRE DEL FLUJO"]').fill(nombre);
    await espera(p, 400);
    await apartar(p);
    return v;
}

/** Abre el panel «Selecciona una acción» desde el «+» del último paso. */
async function abrirElMasDelUltimo(p) {
    await p.locator("[data-agregar-accion]").last().click();
    await p.locator(PANEL).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    return p.locator(PANEL);
}

/** Abre la lista de todos los pasos (el «+» azul de arriba a la derecha). */
async function abrirLaPaleta(p) {
    await p.locator('button[title="Agregar nodo"]').click();
    await p.locator(PALETA).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 700);
    await apartar(p);
    return p.locator(PALETA);
}

/**
 * Las pastillas de tipo. Su envoltorio va `display: contents` (no tiene caja
 * propia), así que se mide la unión de sus botones.
 */
async function lasPastillas(p) {
    const cs = await p.locator(`${PASTILLAS} button`).evaluateAll((bs) =>
        bs.map((b) => {
            const r = b.getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height };
        }),
    );
    if (!cs.length) throw new Error("sin pastillas de tipo");
    return unir(...cs);
}

/** La lista entera de tarjetas visibles. */
async function lasFilas(p) {
    const filas = await p.locator("[data-fila-de-flujo]").evaluateAll((fs) =>
        fs.map((f) => {
            const r = f.getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height };
        }),
    );
    return unir(...filas);
}

/** La ventana del portátil en la que se toman las fotos de detalle: a 1440 una tarjeta es una tira ilegible. */
const PORTATIL = { width: 1024, height: 720 };

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

async function miniaturas(p) {
    await tomarLasMiniaturas(
        p,
        [
            ["vista-general", async () => unir(await caja(p, BARRA), await lasFilas(p))],
            ["tipos", async () => lasPastillas(p)],
            ["crear", async () => caja(p, await laVentanaDeCrear(p, "PROMO DE TEMPORADA"))],
            ["palabras-clave", async () => caja(p, laTarjeta(p, "Pedido por WhatsApp"))],
            ["mas-acciones", async () => {
                await laTarjeta(p, "Pedido por WhatsApp").locator("[data-mas-acciones]").click();
                const menu = p.locator('[role="menu"]');
                await menu.waitFor({ state: "visible", timeout: 10000 });
                await espera(p, 400);
                await apartar(p);
                return unir(await caja(p, laTarjeta(p, "Pedido por WhatsApp").locator("[data-mas-acciones]")), await caja(p, menu));
            }],
        ],
        { salida: SALIDA, tomadas, focos: FOCOS, despues: () => cerrarLoAbierto(p) },
    );
    const focos = JSON.parse((await import("node:fs")).readFileSync(FOCOS, "utf8"));

    // Las del editor se toman con el flujo abierto, dentro de su zona.
    await abrirElEditor(p, "Pedido por WhatsApp");
    await tomarLasMiniaturas(
        p,
        [
            // Los primeros pasos, no el lienzo entero: el lienzo es tan alto como la
            // pantalla y su recuadro no cabe en una miniatura 16:9.
            ["el-editor", async () => {
                const nodos = p.locator("[data-nodo-de-flujo]");
                const n = Math.min(await nodos.count(), 3);
                return unir(...(await Promise.all(Array.from({ length: n }, (_, i) => caja(p, nodos.nth(i))))));
            }],
            ["agregar-pasos", async () => caja(p, await abrirElMasDelUltimo(p))],
            ["automatizaciones", async () => unir(await caja(p, elNodo(p, "tag-add")), await caja(p, elNodo(p, "notify-advisor")))],
            ["seguimientos", async () => caja(p, elNodo(p, "seguimiento-text"))],
            ["limites", async () => {
                const paleta = await abrirLaPaleta(p);
                return caja(p, paleta.locator("[data-sidebar=header], .p-4").first());
            }],
        ],
        { salida: SALIDA, tomadas, focos: `${FOCOS}.editor`, despues: () => cerrarLoAbierto(p) },
    );
    const delEditor = JSON.parse((await import("node:fs")).readFileSync(`${FOCOS}.editor`, "utf8"));
    rmSync(`${FOCOS}.editor`, { force: true });
    writeFileSync(FOCOS, JSON.stringify({ ...focos, ...delEditor }, null, 2) + "\n");
    await abrirLaLista(p);
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const grande = p.viewportSize();

    /* 1. La pantalla de un vistazo ----------------------------------- */
    await guardar(p, "portada.webp");

    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cFilas = await lasFilas(p);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: await caja(p, BARRA), n: 3 },
        { c: cFilas, n: 4 },
        { c: await caja(p, laTarjeta(p, "Pedido por WhatsApp")), n: 5, esquina: "derecha" },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    await p.setViewportSize(PORTATIL);
    await espera(p, 1200);
    const vista = PORTATIL;

    const cBarra = await caja(p, BARRA);
    await marcar(p, [
        { c: await caja(p, BUSCADOR), n: 1 },
        { c: await lasPastillas(p), n: 2 },
        { c: await caja(p, HORARIO), n: 3, esquina: "centro" },
        { c: await caja(p, NUEVO), n: 4, esquina: "derecha" },
    ]);
    await guardar(p, "barra.webp", holgura({ ...cBarra, x: cBarra.x - 8, w: cBarra.w + 16, y: cBarra.y - 16, h: cBarra.h + 24 }, 0, vista));
    await desmarcar(p);

    // Una tarjeta: los mandos van pegados, así que llevan solo su número.
    const fila = laFila(p, "Pedido por WhatsApp");
    const tarjeta = laTarjeta(p, "Pedido por WhatsApp");
    const cFila = await caja(p, fila);
    await marcar(
        p,
        [
            { c: await caja(p, fila.locator("[data-asa-de-flujo]")), n: 1, sinRecuadro: true, esquina: "centro", borde: "abajo" },
            { c: await caja(p, tarjeta.locator("[data-abrir-flujo]")), n: 2, sinRecuadro: true, esquina: "centro", borde: "abajo" },
            { c: await caja(p, tarjeta.locator("h3").first()), n: 3, esquina: "derecha" },
            { c: await caja(p, tarjeta.locator("[data-boton-editar]")), n: 4, sinRecuadro: true, esquina: "centro", borde: "abajo" },
            { c: await caja(p, tarjeta.locator("[data-mas-acciones]")), n: 5, sinRecuadro: true, esquina: "centro", borde: "abajo" },
        ],
        { atenuar: true },
    );
    await guardar(p, "tarjeta.webp", { x: cFila.x - 16, y: cFila.y - 18, w: cFila.w + 32, h: cFila.h + 54 });
    await desmarcar(p);

    /* 2. Los cuatro tipos -------------------------------------------- */
    await laPastilla(p, "Chatbot").click();
    await espera(p, 700);
    await apartar(p);
    await marcar(p, [{ c: await lasPastillas(p), soloLuz: true }, { c: await caja(p, laPastilla(p, "Chatbot")), texto: "Solo los de Chatbot", lado: "abajo" }], { atenuar: true });
    await guardar(p, "tipos-pastillas.webp", holgura({ x: cBarra.x, y: cBarra.y, w: cBarra.w, h: 220 }, 12, vista));
    await desmarcar(p);
    await laPastilla(p, "Chatbot").click();
    await espera(p, 700);
    await apartar(p);

    for (const [nombre, imagen, texto] of [
        ["Bienvenida", "tipo-inicio.webp", "La casita: es la bienvenida"],
        ["Cotización mayorista", "tipo-ia.webp", "Su disparador de IA"],
        ["Pedido por WhatsApp", "tipo-chatbot.webp", "Sus palabras clave"],
    ]) {
        const t = laTarjeta(p, nombre);
        const c = await caja(p, laFila(p, nombre));
        let zona;
        // La marca va a la derecha, en el hueco hasta «Editar»: abajo taparía la tarjeta de debajo.
        let lado = "derecha";
        if (imagen === "tipo-inicio.webp") zona = await caja(p, t.locator("h3").first().locator("xpath=.."));
        else if (imagen === "tipo-ia.webp") {
            zona = await caja(p, t.locator("[data-disparador-de-ia]"));
            lado = "abajo";
        } else zona = await caja(p, t.locator("p.truncate").first());
        await marcar(p, [{ c, soloLuz: true }, { c: zona, texto, lado }], { atenuar: true });
        await guardar(p, imagen, holgura({ ...c, h: c.h + 80 }, 14, vista));
        await desmarcar(p);
    }

    /* 3. Crear un flujo ---------------------------------------------- */
    const zonaDeArriba = { x: cBarra.x, y: cBarra.y - 10, w: cBarra.w, h: 260 };
    await marcar(p, [{ c: await caja(p, NUEVO), texto: "Crea un flujo", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "crear-boton.webp", holgura(zonaDeArriba, 8, vista));
    await desmarcar(p);

    const ventana = await laVentanaDeCrear(p, "PROMO DE TEMPORADA");
    const cVentana = await caja(p, ventana);
    const tipos = ventana.locator("button", { hasText: "Primera conexión" }).locator("xpath=..");
    await marcar(p, [
        { c: await caja(p, ventana.locator('input[placeholder="NOMBRE DEL FLUJO"]')), n: 1, esquina: "derecha" },
        { c: await caja(p, tipos), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "crear-ventana.webp", holgura(cVentana, 24, vista));
    await desmarcar(p);

    await ventana.getByRole("button", { name: /^Chatbot/ }).click();
    await espera(p, 400);
    const palabra = ventana.locator('input[placeholder="Escribe una palabra o frase y presiona Enter"]');
    await palabra.fill("promo");
    await palabra.press("Enter");
    await espera(p, 400);
    await apartar(p);
    await marcar(p, [
        { c: await caja(p, ventana.locator("select")), n: 1, esquina: "derecha" },
        { c: unir(await caja(p, palabra), await caja(p, ventana.locator("span", { hasText: "promo" }).first())), n: 2, esquina: "derecha" },
        { c: await caja(p, ventana.getByRole("button", { name: "Crear" })), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "crear-chatbot.webp", holgura(await caja(p, ventana), 24, vista));
    await desmarcar(p);

    await ventana.getByRole("button", { name: "Crear" }).click();
    await p.waitForURL(/\/workflow\/[^/?]+/, { timeout: 30000 });
    await p.waitForSelector(LIENZO, { timeout: 60000 });
    await espera(p, 2000);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
    await quitarAvisos(p);
    await apartar(p);
    // El botón ya dice lo que hace: se recuadra con su rótulo, sin otra etiqueta encima.
    await marcar(p, [{ c: unir(await caja(p, 'button[title="Agregar el primer paso"]'), await caja(p, p.getByText("Agrega el primer paso", { exact: true }).first())) }]);
    await guardar(p, "crear-listo.webp");
    await desmarcar(p);

    /* 4. Palabras clave y disparadores ------------------------------- */
    await abrirLaLista(p);
    // Editando, el nombre pasa a un campo y ya no es texto: la fila se fija por su id.
    const idPedido = await elIdDe(p, "Pedido por WhatsApp");
    const filaPedido = p.locator(`[data-fila-de-flujo="${idPedido}"]`);
    const tPedido = filaPedido.locator("[data-tarjeta-de-flujo]");
    await tPedido.locator("p.truncate").first().click();
    const editando = tPedido.locator('input[placeholder="Palabra o frase clave"]');
    await editando.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await apartar(p);
    const cTPedido = await caja(p, filaPedido);
    await marcar(
        p,
        [
            { c: await caja(p, tPedido.locator('input[placeholder="Nombre del flujo"]')), n: 1, esquina: "derecha" },
            { c: await caja(p, tPedido.locator("select")), n: 2, esquina: "derecha" },
            { c: await caja(p, editando), n: 3, esquina: "derecha" },
        ],
        { atenuar: true },
    );
    await guardar(p, "palabras-editar.webp", holgura({ ...cTPedido, h: cTPedido.h + 20 }, 16, vista));
    await desmarcar(p);

    await editando.fill("hacer un pedido");
    await editando.press("Enter");
    await espera(p, 500);
    await apartar(p);
    const nueva = tPedido.locator("span", { hasText: "hacer un pedido" }).first();
    await marcar(p, [{ c: await caja(p, filaPedido), soloLuz: true }, { c: await caja(p, nueva), texto: "Una palabra clave nueva", lado: "abajo" }], { atenuar: true });
    const cConPalabra = await caja(p, filaPedido);
    await guardar(p, "palabras-agregar.webp", holgura({ ...cConPalabra, h: cConPalabra.h + 80 }, 16, vista));
    await desmarcar(p);
    // Se guarda al salir del campo.
    await editando.blur();
    await trasElAviso(p);
    await abrirLaLista(p);

    const tIa = laTarjeta(p, "Cotización mayorista");
    const disparador = tIa.locator("[data-disparador-de-ia]");
    const cIa = await caja(p, laFila(p, "Cotización mayorista"));
    await marcar(
        p,
        [
            { c: await caja(p, disparador.locator('[role="switch"]')), n: 1, sinRecuadro: true, esquina: "centro", borde: "abajo" },
            { c: await caja(p, disparador.locator('[title="Editar disparador"]')), n: 2, sinRecuadro: true, esquina: "izquierda", borde: "abajo" },
            { c: await caja(p, disparador.locator('[title="Eliminar disparador"]')), n: 3, sinRecuadro: true, esquina: "derecha", borde: "abajo" },
            { c: await caja(p, disparador), soloLuz: true },
        ],
        { atenuar: true },
    );
    await guardar(p, "disparador-ia.webp", holgura({ ...cIa, h: cIa.h + 40 }, 16, vista));
    await desmarcar(p);

    await disparador.locator('[title="Editar disparador"]').click();
    const vDisparador = p.locator('[role="dialog"]').last();
    await vDisparador.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await apartar(p);
    const descripcion = vDisparador.locator("textarea").first();
    // El foco se queda en la X al abrir: su anillo se leería como otra marca.
    await p.evaluate(() => document.activeElement?.blur?.());
    await marcar(p, [{ c: await caja(p, descripcion) }]);
    await guardar(p, "disparador-editar.webp", holgura(await caja(p, vDisparador), 24, vista));
    await desmarcar(p);
    await cerrarLoAbierto(p);

    /* 9. Repeticiones, orden y eliminar (en la lista) ----------------- */
    await tPedido.locator("[data-mas-acciones]").click();
    const menu = p.locator('[role="menu"]');
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, menu), texto: "Más acciones del flujo", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "tarjeta-menu.webp", holgura(unir(await caja(p, menu), await caja(p, laFila(p, "Pedido por WhatsApp"))), 30, vista));
    await desmarcar(p);
    await menu.getByRole("menuitem", { name: "Repeticiones" }).click();
    const vRep = p.locator('[role="dialog"]').filter({ hasText: "REPETICIONES DEL FLUJO" });
    await vRep.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 1200);
    await apartar(p);
    await p.evaluate(() => document.activeElement?.blur?.());
    await guardar(p, "repeticiones.webp", holgura(await caja(p, vRep), 24, vista));
    await cerrarLoAbierto(p);

    await laFila(p, "Reactivar clientes").hover();
    await espera(p, 300);
    await marcar(p, [{ c: await caja(p, laFila(p, "Reactivar clientes")), soloLuz: true }, { c: await caja(p, laFila(p, "Reactivar clientes").locator("[data-asa-de-flujo]")), texto: "Agarra por aquí y arrastra", lado: "abajo" }], { atenuar: true });
    const cTodas = await lasFilas(p);
    await guardar(p, "ordenar.webp", holgura({ x: 0, y: cTodas.y, w: cTodas.x + cTodas.w, h: Math.min(cTodas.h + 90, vista.height - cTodas.y) }, 12, vista));
    await desmarcar(p);

    await laTarjeta(p, "Reactivar clientes").locator("[data-mas-acciones]").click();
    await p.locator('[role="menu"]').getByRole("menuitem", { name: "Eliminar" }).click();
    const alerta = p.locator('[role="alertdialog"]');
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, alerta.getByRole("button", { name: "Eliminar" })), texto: "Confirma para borrarlo", lado: "abajo" }]);
    const cAlerta = await caja(p, alerta);
    await guardar(p, "eliminar.webp", holgura({ x: cAlerta.x - 24, y: cAlerta.y - 14, w: cAlerta.w + 48, h: cAlerta.h + 14 + 64 }, 0, vista));
    await desmarcar(p);
    await cerrarLoAbierto(p);

    /* 8. El horario de envío (de la barra de trabajo) ---------------- */
    await p.locator(HORARIO).click();
    const vHorario = p.locator('[role="dialog"]').filter({ hasText: "HORARIO DE SEGUIMIENTOS" });
    await vHorario.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 800);
    const interruptor = vHorario.locator('[role="switch"]').first();
    if ((await interruptor.getAttribute("aria-checked")) !== "true") {
        await interruptor.click();
        await espera(p, 500);
    }
    await apartar(p);
    await p.evaluate(() => document.activeElement?.blur?.());
    await guardar(p, "horario.webp", holgura(await caja(p, vHorario), 24, vista));
    await cerrarLoAbierto(p);

    /* 5–8, 10. El editor -------------------------------------------- */
    await p.setViewportSize(grande);
    await abrirElEditor(p, "Pedido por WhatsApp");
    const cLienzo = await caja(p, LIENZO);
    const cNodos = unir(...(await Promise.all((await p.locator("[data-nodo-de-flujo]").all()).map((n) => caja(p, n)))));
    await marcar(p, [
        { c: cNodos, n: 1 },
        { c: await caja(p, "[data-boton-ordenar]"), n: 2, esquina: "derecha" },
        { c: await caja(p, 'button[title="Agregar nodo"]'), n: 3, esquina: "izquierda" },
        { c: await caja(p, `${LIENZO} .react-flow__controls`), n: 4, esquina: "derecha" },
    ]);
    await guardar(p, "editor.webp");
    await desmarcar(p);

    // Escribir en un paso de texto.
    const texto = elNodo(p, "text");
    await laCajaDelTexto(texto).click();
    const areaDeTexto = texto.locator("textarea");
    await areaDeTexto.waitFor({ state: "visible", timeout: 10000 });
    await areaDeTexto.fill("¡Gracias por tu pedido! 🛍️ En un momento te confirmamos el total y la entrega.");
    await espera(p, 400);
    await apartar(p);
    const cTexto = await caja(p, texto);
    await marcar(p, [{ c: await caja(p, areaDeTexto), texto: "Escribe aquí el mensaje", lado: "abajo" }], { atenuar: true });
    await guardar(p, "editor-texto.webp", holgura({ ...cTexto, x: cTexto.x - 60, w: cTexto.w + 120, y: cTexto.y - 40, h: cTexto.h + 150 }, 0, grande));
    await desmarcar(p);

    // El tope del mensaje: más de 1000 caracteres y el paso avisa.
    await areaDeTexto.fill("¡Gracias por tu pedido! ".repeat(45));
    const aviso = p.locator("[data-sonner-toast]").first();
    await aviso.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, aviso), texto: "Pasa del tope de caracteres", lado: "arriba" }]);
    await guardar(p, "limites-mensaje.webp", holgura({ ...(await caja(p, aviso)), y: (await caja(p, aviso)).y - 110, h: (await caja(p, aviso)).h + 130, x: (await caja(p, aviso)).x - 60, w: (await caja(p, aviso)).w + 80 }, 0, grande));
    await desmarcar(p);
    await areaDeTexto.blur();
    await espera(p, 800);
    await quitarAvisos(p);

    await texto.locator("[data-mas-del-nodo]").click();
    const menuDelNodo = p.locator('[role="menu"]');
    await menuDelNodo.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, menuDelNodo), texto: "Eliminar el paso", lado: "abajo" }], { atenuar: true });
    // El rótulo cae ~130 px por debajo del menú: la foto lo incluye entero.
    const cMenuDelNodo = unir(await caja(p, texto), await caja(p, menuDelNodo));
    await guardar(p, "editor-nodo-menu.webp", holgura({ ...cMenuDelNodo, h: cMenuDelNodo.h + 90 }, 60, grande));
    await desmarcar(p);
    await cerrarLoAbierto(p);

    await p.evaluate(() => document.activeElement?.blur?.());
    await marcar(p, [{ c: await caja(p, "[data-boton-ordenar]"), texto: "Pone los pasos en fila", lado: "abajo" }], { atenuar: true });
    await guardar(p, "editor-ordenar.webp", { x: cLienzo.x, y: cLienzo.y, w: cLienzo.w, h: Math.min(360, cLienzo.h) });
    await desmarcar(p);

    /* 6. Agregar pasos ------------------------------------------------ */
    const panel = await abrirElMasDelUltimo(p);
    await marcar(p, [{ c: await caja(p, panel), texto: "Elige el paso siguiente", lado: "izquierda" }, { c: await caja(p, p.locator("[data-agregar-accion]").last()) }], { atenuar: true });
    await guardar(p, "agregar-mas.webp");
    await desmarcar(p);
    await cerrarLoAbierto(p);

    const paleta = await abrirLaPaleta(p);
    const cPaleta = await caja(p, paleta);
    const grupos = [];
    for (const g of ["Nodos", "Acciones", "Automatizaciones", "Seguimientos"]) grupos.push(paleta.locator(`[data-grupo-de-la-paleta="${g}"]`));
    // Los grupos van pegados: el recuadro se mete 6 px para que no se monten,
    // y la foto acaba en el título del tercero, que es lo que dice que sigue.
    const cG3 = await caja(p, grupos[2]);
    await marcar(p, [
        { c: dentro(await caja(p, grupos[0]), 6), n: 1, esquina: "izquierda" },
        { c: dentro(await caja(p, grupos[1]), 6), n: 2, esquina: "izquierda" },
    ]);
    await guardar(p, "agregar-paleta.webp", holgura({ x: cPaleta.x - 40, y: cPaleta.y, w: cPaleta.w + 40, h: cG3.y + 44 - cPaleta.y }, 0, grande));
    await desmarcar(p);

    // Automatizaciones: el grupo entero, con sus candados.
    const auto = grupos[2];
    await auto.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 500);
    await marcar(p, [{ c: dentro(await caja(p, auto), 2), texto: "Ordenan tu CRM por ti", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "automatizaciones.webp", holgura({ ...cPaleta, x: cPaleta.x - 260, w: cPaleta.w + 260 }, 0, grande));
    await desmarcar(p);

    const bloqueadas = paleta.locator("[data-bloqueada]");
    await bloqueadas.first().evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 400);
    const cajasBloqueadas = [];
    for (const b of await bloqueadas.all()) {
        const c = await caja(p, b);
        if (c.y > 0 && c.y + c.h < grande.height) {
            // Dos bloqueadas seguidas van en UN recuadro: cada uno con el suyo se montan.
            const anterior = cajasBloqueadas[cajasBloqueadas.length - 1];
            if (anterior && c.y - (anterior.y + anterior.h) < 16) cajasBloqueadas[cajasBloqueadas.length - 1] = unir(anterior, c);
            else cajasBloqueadas.push(c);
        }
    }
    await marcar(p, [...cajasBloqueadas.map((c) => ({ c })), { c: cajasBloqueadas[0], texto: "No incluido en tu plan", lado: "izquierda", sinRecuadro: true }], { atenuar: true });
    await guardar(p, "limites-candados.webp", holgura({ ...cPaleta, x: cPaleta.x - 260, w: cPaleta.w + 260 }, 0, grande));
    await desmarcar(p);

    await paleta.evaluate((el) => el.querySelector("[data-sidebar=content]")?.scrollTo({ top: 0 }));
    await espera(p, 400);
    const cabecera = paleta.locator("p", { hasText: "Selecciona una acción" }).locator("xpath=..");
    await marcar(p, [{ c: await caja(p, cabecera), texto: "Cuántos llevas, y el tope", lado: "abajo" }], { atenuar: true });
    await guardar(p, "limites-contadores.webp", { x: cPaleta.x - 320, y: cPaleta.y, w: cPaleta.w + 320, h: 300 });
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await abrirElEditor(p, "Pedido por WhatsApp");

    /* 7. Automatizaciones: los dos pasos ------------------------------ */
    for (const [tipo, imagen, texto2] of [
        ["tag-add", "auto-tag.webp", "La etiqueta que se le pone"],
        ["notify-advisor", "auto-notificar.webp", "El aviso para el asesor"],
    ]) {
        const nodo = elNodo(p, tipo);
        const c = await caja(p, nodo);
        await marcar(p, [{ c, texto: texto2, lado: "abajo" }], { atenuar: true });
        await guardar(p, imagen, holgura({ x: c.x - 80, y: c.y - 50, w: c.w + 160, h: c.h + 140 }, 0, grande));
        await desmarcar(p);
    }

    /* 8. Seguimientos ------------------------------------------------- */
    const seg = elNodo(p, "seguimiento-text");
    const cSeg = await caja(p, seg);
    await marcar(p, [
        { c: await caja(p, seg.locator('[role="switch"]').first()), n: 1, esquina: "izquierda" },
        { c: await caja(p, seg.locator("footer, .pt-2").last()), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "seguimiento.webp", holgura({ x: cSeg.x - 60, y: cSeg.y - 40, w: cSeg.w + 120, h: cSeg.h + 80 }, 0, grande));
    await desmarcar(p);

    await abrirElEditor(p, "Reactivar clientes");
    const segs = await p.locator('[data-nodo-de-flujo^="seguimiento"]').all();
    const cajasSegs = [];
    for (const s of segs) cajasSegs.push(await caja(p, s));
    await marcar(p, [{ c: unir(...cajasSegs), texto: "Al día y a los tres días", lado: "abajo" }], { atenuar: true });
    await guardar(p, "seguimiento-cadena.webp");
    await desmarcar(p);

    /* 6. Un menú de opciones (la Bienvenida) -------------------------- */
    await abrirElEditor(p, "Bienvenida");
    const nodoMenu = elNodo(p, "menu");
    await marcar(p, [{ c: await caja(p, nodoMenu), texto: "Cada opción, su salida", lado: "abajo" }], { atenuar: true });
    await guardar(p, "nodo-menu.webp");
    await desmarcar(p);

    /* El marco: el menú y la barra de arriba ------------------------- */
    await abrirLaLista(p);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Creación de Flujos", texto: "Crear flujos está en Creación de Flujos" });
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/** Cuánto se respira entre una frase y la siguiente: el mismo de las otras guías. */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

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
    const p = await ctx.newPage();
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirLaLista(p);
    await p.mouse.move(640, 400, { steps: 8 });
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("respuestas automáticas", 500);
    await mover(p, laTarjeta(p, "Bienvenida"));
    await alDecir("envía sola", 400);
    await mover(p, laTarjeta(p, "Pedido por WhatsApp"));

    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const modulo = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Creación de Flujos" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Creación de Flujos", 600);
    await mover(p, modulo);

    const [, , , buscarTodo, , soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    await decir("tipos");
    await alDecir("Inicio da la bienvenida");
    await mover(p, laPastilla(p, "Inicio"));
    await alDecir("IA lo lanza", 200);
    await mover(p, laPastilla(p, "IA"));
    await alDecir("Chatbot responde", 200);
    await pulsar(p, laPastilla(p, "Chatbot"));
    await alDecir("y Flujo lo pones", 200);
    await pulsar(p, laPastilla(p, "Chatbot"));
    await mover(p, laPastilla(p, "Flujo"));

    await decir("crear");
    await alDecir("el botón Nuevo");
    await pulsar(p, p.locator(NUEVO));
    const ventana = p.locator('[role="dialog"]').filter({ hasText: "NUEVO FLUJO" });
    await ventana.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("le pones un nombre", 200);
    const nombre = ventana.locator('input[placeholder="NOMBRE DEL FLUJO"]');
    await pulsar(p, nombre);
    await nombre.pressSequentially("Promo de temporada", { delay: 40 });
    await alDecir("eliges el tipo", 300);
    await pulsar(p, ventana.getByRole("button", { name: /^Flujo/ }));
    await alDecir("al pulsar Crear", 300);
    await pulsar(p, ventana.getByRole("button", { name: "Crear" }));
    await p.waitForURL(/\/workflow\/[^/?]+/, { timeout: 30000 });
    const primero = p.locator('button[title="Agregar el primer paso"]');
    await primero.waitFor({ state: "visible", timeout: 60000 });
    await esconderLosBotonesDelBorde(p);

    await decir("editor");
    await alDecir("el más del centro", 300);
    await pulsar(p, primero);
    await p.locator(PANEL).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400); // la animación de abrir: un clic antes cae en la fila de al lado
    await alDecir("elige Texto", 200);
    await pulsar(p, laOpcion(p, "text"));
    const nodo = elNodo(p, "text");
    await nodo.waitFor({ state: "visible", timeout: 15000 });
    await alDecir("escribe el mensaje", 200);
    await pulsar(p, laCajaDelTexto(nodo));
    await nodo.locator("textarea").pressSequentially("¡Hola! Esta semana tienes 20% en todos los cafés ☕", { delay: 28 });

    await decir("agregar");
    await nodo.locator("textarea").blur();
    await alDecir("un más para agregar", 300);
    await pulsar(p, p.locator("[data-agregar-accion]").last());
    await p.locator(PANEL).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400); // la animación de abrir: un clic antes cae en la fila de al lado
    await alDecir("un menú", 200);
    await mover(p, laOpcion(p, "menu"));
    await alDecir("una pausa", 200);
    await mover(p, laOpcion(p, "node_pause"));
    await alDecir("etiquetar al cliente", 200);
    await pulsar(p, laOpcion(p, "tag-add"));
    await elNodo(p, "tag-add").waitFor({ state: "visible", timeout: 15000 });

    await decir("seguimientos");
    // El paso nuevo cae a la derecha y su "+" se queda fuera del lienzo: se
    // encuadra con el control del propio lienzo, como haría una persona.
    await pulsar(p, p.locator('button[aria-label="Ver todo el flujo"]'));
    await espera(p, 500);
    await alDecir("con los seguimientos", 200);
    await pulsar(p, p.locator("[data-agregar-accion]").last());
    await p.locator(PANEL).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400); // la animación de abrir: un clic antes cae en la fila de al lado
    await pulsar(p, laOpcion(p, "seguimiento-text"));
    const seg = elNodo(p, "seguimiento-text");
    await seg.waitFor({ state: "visible", timeout: 15000 });
    await pulsar(p, p.locator('button[aria-label="Ver todo el flujo"]'));
    await espera(p, 500);
    await alDecir("si el cliente no ha respondido", 200);
    await mover(p, seg.locator('[role="switch"]').first());

    await decir("cierre");
    await alDecir("Pulsa Ordenar", 200);
    await pulsar(p, p.locator("[data-boton-ordenar]"));
    await espera(p, 600);
    await pulsar(p, p.locator('button[aria-label="Ver todo el flujo"]'));
    await alDecir("ya trabaja solo", 300);
    await mover(p, p.locator(LIENZO));
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
    escribirLaVozDelVideo("flujos", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
    console.log("  ✓ demostracion.webm", Math.round(statSync(destino).size / 1024), "KB,", colocados.length, "frases narradas");
}

/* ------------------------------------------------------------------ */

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
try {
    const ctx = await navegador.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        locale: "es-CO",
        timezoneId: "America/Bogota",
    });
    const p = await entrar(ctx, BASE);
    await abrirLaLista(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        // Las capturas cambiaron los datos: el vídeo sale del punto de partida.
        if (!SOLO_VIDEO) execFileSync("node", [SEMILLA], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/flujos`);
