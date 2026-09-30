/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Mis macros, sobre
 * la App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-macros.mjs`).
 *
 * La MISMA forma que la de Leads, Catálogo, Diagramas y Mis notas: cada
 * captura es una receta —abre esto, pulsa aquello, resalta este elemento— y
 * las marcas se dibujan encima de la pantalla real. Lo que no depende de la
 * pantalla —entrar, medir, marcar, guardar, las miniaturas, el marco (el menú
 * y la barra de arriba) y la narración (`decir`/`alDecir`/`callar`)— viene
 * del taller común de las guías (`taller-de-la-guia.mjs`). Aquí van solo las
 * recetas de Mis macros.
 *
 * Los elementos se localizan por lo que la pantalla ya expone —los `title` y
 * `aria-label` de los botones, las zonas de `BarraDeAcciones` y las marcas
 * `data-*` de `MacrosManager` (`data-lista-de-macros`, `data-macro-de-la-lista`,
 * `data-editor-de-macro`, `data-accion-de-macro`, `data-agregar-accion`)—,
 * nunca por coordenadas: si un botón se mueve, la flecha se va con él.
 *
 * Las listas desplegables del editor son `<select>` nativos, y su lista
 * abierta la pinta el sistema, no la página: una foto sin cabeza no la ve. Por
 * eso cada captura enseña la acción YA configurada, que es lo que se lee.
 *
 * Las capturas CAMBIAN los datos (lanzar una macro en un chat suma una
 * ejecución), así que antes del vídeo se vuelve a sembrar: el vídeo sale del
 * mismo punto de partida que la primera captura.
 *
 * Se lanza con `scripts/generar-guia-macros.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-macros.mjs";
import { guardarWav, loQueSeCorta, mezclar, montarLaPista, tramosSinLosCortes } from "./voz-de-la-guia.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "macros");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-macros";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
/** Solo el vídeo: las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-macros.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-macros.json");

/** La conversación de ejemplo de la semilla, en su línea. */
const JID = "573004521876@s.whatsapp.net";
const LINEA = "VENTAS";
/** La macro que se lanza en el chat: no envía nada, así que no depende de ninguna línea conectada. */
const LA_QUE_SE_LANZA = "Marcar como caliente";

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Dónde está cada cosa                                                */
/* ------------------------------------------------------------------ */

const BARRA = "[data-barra-de-acciones]";
const zona = (nombre) => `${BARRA} [data-zona="${nombre}"]`;
const LISTA = "[data-lista-de-macros]";
const EDITOR = "[data-editor-de-macro]";

/** Una macro de la lista, por su nombre. */
const laFila = (p, nombre) => p.locator("[data-macro-de-la-lista]", { hasText: nombre }).first();
/** Un botón de la fila de una macro, por su `title`. */
const enLaFila = (p, nombre, titulo) => laFila(p, nombre).locator(`button[title="${titulo}"]`).first();
/** La acción `n` (desde 1) de la macro abierta en el editor. */
const laAccion = (p, n) => p.locator(`${EDITOR} li[data-accion-de-macro="${n}"]`);
/** El `<select>` del tipo de la acción `n`. */
const elTipo = (p, n) => p.locator(`${EDITOR} select[aria-label="Tipo de la acción ${n}"]`);
/** Lo que se configura de la acción `n` (su columna de campos, a la derecha del número). */
const laConfig = (p, n) => laAccion(p, n).locator(":scope > div.pl-7");
/** Una pastilla de la barra, por su nombre. */
// Las pastillas enseñan su icono y su número: el nombre va en su `aria-label`.
const laPastilla = (p, nombre) => p.locator(`${zona("filtros")} button[aria-label="${nombre}"]`).first();
/** El menú desplegable que se acaba de abrir (Radix lo pinta en un portal). */
const elMenu = (p) => p.locator('[role="menu"]').last();
/** El botón «Macros» de la cabecera de la conversación que SE VE (la cabecera lo pinta dos veces). */
const elBotonMacros = (p) => p.locator("[data-macros-de-chat]").filter({ visible: true }).first();

/** El ratón, fuera de todo: un botón con el cursor encima sale resaltado. */
const apartar = (p) => p.mouse.move(p.viewportSize().width - 30, p.viewportSize().height - 30);

/**
 * Cierra las VENTANAS que abren las miniaturas —el editor de una macro—, sin
 * guardar nada. El taller solo cierra menús y confirmaciones
 * (`cerrarLoAbierto`); el editor no lo es.
 */
async function cerrarLasVentanas(p) {
    for (let i = 0; i < 3; i += 1) {
        if (!(await p.$('[role="dialog"]'))) break;
        await p.keyboard.press("Escape");
        await espera(p, 350);
    }
}

async function abrirMacros(p) {
    await p.goto(`${BASE}/macros`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${LISTA} [data-macro-de-la-lista]`, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 1500);
    await despejar(p);
    // Los botones del borde (nota rápida, copiloto, equipo) son de TODAS las
    // pantallas: aquí tapan la lista y no explican nada de Mis macros.
    await esconderLosBotonesDelBorde(p);
    await queNadaSalgaRecortado(p);
}

/**
 * Un nombre que no cabe sale con «…» en la captura, y la guía enseñaría una
 * macro que no se sabe cómo se llama. Se mira en la lista y en el menú
 * «Macros» de un chat (`dentro`): si algo no cabe, se acorta en la semilla,
 * como en la guía de Diagramas.
 */
async function queNadaSalgaRecortado(p, dentro = "[data-caja-del-contenido]") {
    const recortados = await p.evaluate((sel) => {
        // Solo el contenido: el menú y la barra de arriba de la plataforma
        // recortan a propósito (el buscador) y no son de esta guía.
        const fuera = [];
        for (const raiz of document.querySelectorAll(sel)) {
            for (const el of raiz.querySelectorAll(".truncate")) {
                if (el.scrollWidth > el.clientWidth + 1) fuera.push(el.textContent || "");
            }
        }
        return fuera;
    }, dentro);
    if (recortados.length) throw new Error(`[guia] sale recortado con «…»: ${recortados.join(" · ")}`);
}

/** Vuelve a Mis macros si no está ahí (una miniatura del chat se va a otra pantalla). */
async function enMacros(p) {
    if (!new URL(p.url()).pathname.startsWith("/macros")) await abrirMacros(p);
}

/**
 * La «Guía rápida» del copiloto se abre sola la primera vez en Chats, y su velo
 * se come los clics de la lista entera.
 */
async function apartarLoQueTapa(p) {
    for (let i = 0; i < 8; i += 1) {
        if (!(await p.$('div[data-state="open"].fixed.inset-0'))) return;
        const cerrar = p.locator('[role="dialog"] button:has-text("Close")').first();
        if (await cerrar.count()) await cerrar.click({ force: true }).catch(() => {});
        else await p.keyboard.press("Escape");
        await espera(p, 400);
    }
}

/**
 * La conversación ya enseña sus mensajes: sin «Cargando mensajes…» y con
 * burbujas pintadas en el hilo. Es lo que se espera sin grabar antes de que la
 * voz diga «en cualquier conversación de Chats».
 */
async function laConversacionCargada(p) {
    await p.locator("[data-hilo-de-chat] [data-message-id]").first().waitFor({ state: "visible", timeout: 60000 });
    await p.getByText("Cargando mensajes…").waitFor({ state: "hidden", timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
}

/** La conversación de ejemplo, abierta en Chats. */
async function abrirElChat(p) {
    await p.goto(`${BASE}/chats?jid=${encodeURIComponent(JID)}&instance=${LINEA}`, { waitUntil: "domcontentloaded" });
    await elBotonMacros(p).waitFor({ state: "visible", timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await apartarLoQueTapa(p);
    await esconderLosBotonesDelBorde(p);
    await apartar(p);
}

/** Abre el menú «Macros» de la conversación y espera a que salgan las macros. */
async function abrirElMenuDeMacros(p) {
    // Lanzar una macro deja el menú abierto mientras corre: con él abierto,
    // Radix aparta el puntero de todo lo demás y el botón no se puede pulsar.
    if ((await elBotonMacros(p).getAttribute("aria-expanded")) === "true") {
        await p.keyboard.press("Escape");
        await p.waitForFunction(() => !document.querySelector('[data-macros-de-chat][aria-expanded="true"]'), null, { timeout: 5000 });
        await espera(p, 300);
    }
    await elBotonMacros(p).click();
    const menu = elMenu(p);
    await menu.getByText(LA_QUE_SE_LANZA).waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 500);
    await apartar(p);
    await queNadaSalgaRecortado(p, '[role="menu"]');
    return menu;
}

/** Abre el editor de una macro de la lista (con el lápiz de su fila). */
async function abrirElEditor(p, nombre) {
    await enLaFila(p, nombre, "Editar").click();
    await p.locator(EDITOR).waitFor({ state: "visible", timeout: 10000 });
    await p.waitForFunction(
        (n) => document.querySelector('[data-editor-de-macro] input[placeholder="Ej: Cierre Ganado"]')?.value === n,
        nombre,
        { timeout: 10000 },
    );
    await espera(p, 600);
    await apartar(p);
}

/** Cierra el editor SIN guardar. */
async function cerrarElEditor(p) {
    await p.locator(EDITOR).getByRole("button", { name: "Cancelar" }).click();
    await p.locator(EDITOR).waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 300);
}

/** Lo que hay debajo del número de una acción, en su columna (la etiqueta «Color» y sus círculos, etc.). */
const alLadoDe = (locator) => locator.locator("xpath=following-sibling::*[1]");

/**
 * La foto de una acción de una macro guardada: se abre su editor, se marca lo
 * que se pida —por defecto, la acción entera— y se recorta a su alrededor. El
 * editor se queda abierto para la siguiente foto de la misma macro.
 */
/** Desplaza la ventana hasta que el elemento quede en medio. */
const alCentro = (loc) => loc.evaluate((el) => el.scrollIntoView({ block: "center" }));

async function laFotoDeLaAccion(p, { macro, n, archivo, marcas }) {
    const abierta = await p
        .locator(`${EDITOR} input[placeholder="Ej: Cierre Ganado"]`)
        .inputValue()
        .catch(() => null);
    if (abierta !== macro) {
        if (abierta !== null) await cerrarElEditor(p);
        await abrirElEditor(p, macro);
    }
    const accion = laAccion(p, n);
    // Al centro, no «si hace falta»: con `scrollIntoViewIfNeeded` una acción
    // alta se quedaba a medias detrás del pie fijo de la ventana (Guardar).
    await alCentro(accion);
    await espera(p, 250);
    const c = await caja(p, accion);
    await marcar(p, marcas ? await marcas(c) : [{ c }]);
    await guardar(p, archivo, holgura(c, 28, p.viewportSize()));
    await desmarcar(p);
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

/**
 * Una miniatura por sección, con la receta de todas las guías
 * (`tomarLasMiniaturas` del taller): aquí solo se dice qué zona explica cada
 * sección. Las de las acciones se toman con la macro abierta en su editor, y
 * la del chat con el menú «Macros» abierto en la conversación de ejemplo.
 */
async function miniaturas(p) {
    const editor = async (macro) => {
        await enMacros(p);
        await abrirElEditor(p, macro);
    };
    await tomarLasMiniaturas(
        p,
        [
            ["vista-general", async () => {
                await enMacros(p);
                return unir(await caja(p, BARRA), await caja(p, LISTA));
            }],
            ["crear-una-macro", async () => {
                await editor("Dar la bienvenida");
                return caja(p, EDITOR);
            }],
            ["responder", async () => {
                await editor("Enviar datos de pago");
                await alCentro(laAccion(p, 3));
                return caja(p, laAccion(p, 3));
            }],
            ["otra-linea", async () => {
                await editor("Aviso desde Soporte");
                return caja(p, laAccion(p, 1));
            }],
            ["clasificar-y-enrutar", async () => {
                await editor("Dar la bienvenida");
                return unir(await caja(p, laAccion(p, 2)), await caja(p, laAccion(p, 3)));
            }],
            ["tareas-y-cierre", async () => {
                await editor("Enviar datos de pago");
                // La última de la macro: sin centrarla queda detrás del pie
                // fijo de la ventana (Cancelar y Guardar).
                await alCentro(laAccion(p, 5));
                return caja(p, laAccion(p, 5));
            }],
            ["buscar-y-ordenar", async () => {
                await enMacros(p);
                return unir(await caja(p, zona("buscador")), await caja(p, zona("filtros")));
            }],
            ["activar-duplicar-eliminar", async () => {
                await enMacros(p);
                await enLaFila(p, "Pasar a soporte", "Más acciones").click();
                await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
                await espera(p, 400);
                await apartar(p);
                return unir(await caja(p, laFila(p, "Pasar a soporte")), await caja(p, elMenu(p)));
            }],
            ["acciones-masivas", async () => {
                await enMacros(p);
                await p.locator(`${zona("acciones")} button[title="Acciones"]`).click();
                await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
                await espera(p, 400);
                await apartar(p);
                return unir(await caja(p, zona("acciones")), await caja(p, elMenu(p)));
            }],
            // La última: se va a Chats, y las demás viven en Mis macros.
            ["usar-en-un-chat", async () => {
                await abrirElChat(p);
                const menu = await abrirElMenuDeMacros(p);
                return unir(await caja(p, elBotonMacros(p)), await caja(p, menu));
            }],
        ],
        { salida: SALIDA, tomadas, focos: FOCOS, despues: () => cerrarLasVentanas(p) },
    );
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();
    await enMacros(p);

    /* 1. La pantalla de un vistazo ----------------------------------- */
    // Portada del vídeo: la lista entera, sin nada abierto.
    await guardar(p, "portada.webp");

    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cBarra = await caja(p, BARRA);
    const cLista = await caja(p, LISTA);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: cBarra, n: 3 },
        { c: cLista, n: 4 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // La barra de trabajo, con sus cuatro partes en su orden.
    await marcar(p, [
        { c: await caja(p, zona("buscador")), n: 1 },
        { c: await caja(p, zona("filtros")), n: 2 },
        { c: await caja(p, zona("crear")), n: 3 },
        { c: await caja(p, zona("acciones")), n: 4 },
    ]);
    await guardar(p, "barra-de-trabajo.webp", holgura(cBarra, 34, vista));
    await desmarcar(p);

    // Una macro de la lista, con sus siete partes. Las tres de la izquierda van
    // pegadas y son pequeñas: solo su número, fuera de la pieza —sobre el borde
    // de arriba de la fila, y el de la casilla sobre el de abajo, para que no
    // se monten—. Puesto encima de la pieza, el número la tapaba entera. Los
    // tres botones de la derecha, igual: su número sobre el borde de arriba.
    const unaFila = laFila(p, "Enviar datos de pago");
    const cFila = await caja(p, unaFila);
    const cAsa = await caja(p, unaFila.locator('button[title="Arrastrar para reordenar"]'));
    const cCasilla = await caja(p, unaFila.locator('button[role="checkbox"]'));
    const cColor = await caja(p, unaFila.locator("span.h-3.w-3.rounded-full"));
    const cNombre = await caja(p, unaFila.locator("div.min-w-0.flex-1"));
    const arriba = (c) => ({ x: c.x + c.w / 2, y: cFila.y });
    const abajo = (c) => ({ x: c.x + c.w / 2, y: cFila.y + cFila.h });
    const cEditar = await caja(p, unaFila.locator('button[title="Editar"]'));
    const cEliminar = await caja(p, unaFila.locator('button[title="Eliminar"]'));
    const cMas = await caja(p, unaFila.locator('button[title="Más acciones"]'));
    await marcar(p, [
        { c: cAsa, n: 1, sinRecuadro: true, numeroEn: arriba(cAsa) },
        { c: cCasilla, n: 2, sinRecuadro: true, numeroEn: abajo(cCasilla) },
        { c: cColor, n: 3, sinRecuadro: true, numeroEn: arriba(cColor) },
        { c: cNombre, n: 4, esquina: "centro" },
        { c: cEditar, n: 5, sinRecuadro: true, numeroEn: arriba(cEditar) },
        { c: cEliminar, n: 6, sinRecuadro: true, numeroEn: arriba(cEliminar) },
        { c: cMas, n: 7, sinRecuadro: true, numeroEn: arriba(cMas) },
    ]);
    await guardar(p, "una-macro.webp", holgura(cFila, 34, vista));
    await desmarcar(p);

    /* 2. Crear una macro --------------------------------------------- */
    const cCrear = await caja(p, zona("crear"));
    await marcar(p, [{ c: cCrear, texto: "Nuevo", lado: "abajo" }], { atenuar: true });
    // La mitad derecha de la barra y lo de debajo, donde cae el rótulo.
    await guardar(p, "crear-boton.webp", holgura({ x: cBarra.x + cBarra.w - 560, y: cBarra.y, w: 560, h: cBarra.h + 110 }, 16, vista));
    await desmarcar(p);

    await p.locator(zona("crear")).locator("button").first().click();
    const editor = p.locator(EDITOR);
    await editor.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const nombre = editor.locator('input[placeholder="Ej: Cierre Ganado"]');
    await nombre.fill("Cita confirmada");
    const colores = alLadoDe(editor.getByText("Color", { exact: true }));
    await colores.locator("button").nth(2).click();
    await apartar(p);
    await espera(p, 300);
    const cEditor = await caja(p, editor);
    const cVacio = await caja(p, editor.getByText("Aún no hay acciones", { exact: false }));
    await marcar(p, [
        // Los números a la derecha: a la izquierda taparían «Nombre» y «Color».
        { c: await caja(p, nombre), n: 1, esquina: "derecha" },
        { c: await caja(p, colores), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "crear-nombre.webp", holgura({ x: cEditor.x, y: cEditor.y, w: cEditor.w, h: cVacio.y + cVacio.h - cEditor.y }, 20, vista));
    await desmarcar(p);

    // Tres acciones: un mensaje, una etiqueta y resolver.
    const agregar = editor.locator("[data-agregar-accion]");
    for (let i = 0; i < 3; i += 1) await agregar.click();
    await laConfig(p, 1).locator("textarea").fill("¡Tu cita quedó confirmada! Te esperamos.");
    await elTipo(p, 2).selectOption("ADD_TAG");
    await laConfig(p, 2).locator("select").selectOption({ label: "Cliente nuevo" });
    await elTipo(p, 3).selectOption("RESOLVE");
    await apartar(p);
    await espera(p, 400);
    const cAcciones = unir(await caja(p, laAccion(p, 1)), await caja(p, laAccion(p, 3)), await caja(p, agregar));
    // Solo «Agregar acción»: el orden ya lo dicen los números de la propia
    // pantalla, y tres recuadros pegados se leían como uno solo.
    await marcar(p, [{ c: await caja(p, agregar) }]);
    await guardar(p, "crear-acciones.webp", holgura(cAcciones, 22, vista));
    await desmarcar(p);

    // Subir, Bajar y Quitar de la acción del medio: van pegados, así que un
    // recuadro alrededor de los tres y cada número por su lado.
    const mandos = (t) => laAccion(p, 2).locator(`button[title="${t}"]`);
    const cSubir = await caja(p, mandos("Subir"));
    const cBajar = await caja(p, mandos("Bajar"));
    const cQuitar = await caja(p, mandos("Quitar"));
    // Los botones miden menos que un número: cada número va FUERA, encima o
    // debajo del suyo, alternando para que no se monten entre ellos.
    const encima = (c) => ({ x: c.x + c.w / 2, y: c.y - 17 });
    const debajo = (c) => ({ x: c.x + c.w / 2, y: c.y + c.h + 17 });
    await marcar(p, [
        { c: unir(cSubir, cBajar, cQuitar) },
        { c: cSubir, n: 1, sinRecuadro: true, numeroEn: encima(cSubir) },
        { c: cBajar, n: 2, sinRecuadro: true, numeroEn: debajo(cBajar) },
        { c: cQuitar, n: 3, sinRecuadro: true, numeroEn: encima(cQuitar) },
    ]);
    await guardar(p, "crear-ordenar.webp", holgura(await caja(p, laAccion(p, 2)), 36, vista));
    await desmarcar(p);

    // Una cuarta acción a medias: «Guardar» la marca en rojo y dice qué falta.
    await agregar.click();
    await elTipo(p, 4).selectOption("ASSIGN_ADVISOR");
    await editor.getByRole("button", { name: "Guardar" }).click();
    await laAccion(p, 4).locator("[data-falta-en-la-accion]").waitFor({ state: "visible", timeout: 10000 });
    await apartar(p);
    await espera(p, 400);
    const cFalta = await caja(p, laAccion(p, 4));
    // El rótulo a la derecha del motivo en rojo: encima de la acción taparía
    // la de arriba, y debajo, «Agregar acción».
    // Se mide el TEXTO y no su caja: la caja ocupa el ancho de la acción, y el
    // rótulo a su derecha caía fuera de la ventana y salía cortado.
    const cMotivo = await laAccion(p, 4)
        .locator("[data-falta-en-la-accion]")
        .evaluate((el) => {
            const r = document.createRange();
            r.selectNodeContents(el);
            const b = r.getBoundingClientRect();
            return { x: b.x, y: b.y, w: b.width, h: b.height };
        });
    await marcar(p, [{ c: cFalta }, { c: cMotivo, texto: "Lo que le falta", lado: "derecha", sinRecuadro: true }], { atenuar: true });
    const cGuardar = await caja(p, editor.getByRole("button", { name: "Guardar" }));
    await guardar(p, "crear-falta.webp", holgura({ x: cEditor.x, y: cFalta.y - 90, w: cEditor.w, h: cGuardar.y + cGuardar.h - (cFalta.y - 90) }, 12, vista));
    await desmarcar(p);
    await cerrarElEditor(p);
    await quitarAvisos(p);

    /* 3. Acciones que responden -------------------------------------- */
    await laFotoDeLaAccion(p, { macro: "Dar la bienvenida", n: 1, archivo: "responder-mensaje.webp" });
    await laFotoDeLaAccion(p, { macro: "Venta cerrada", n: 1, archivo: "responder-rapida.webp" });
    await laFotoDeLaAccion(p, {
        macro: "Enviar datos de pago",
        n: 3,
        archivo: "responder-archivo.webp",
        marcas: async () => {
            const cfg = laConfig(p, 3);
            return [
                // Uno por esquina, para que los tres números no se apilen.
                { c: await caja(p, cfg.locator("label").first()), n: 1 },
                { c: await caja(p, cfg.locator("[data-grabador]")), n: 2, esquina: "derecha" },
                { c: await caja(p, cfg.locator("textarea")), n: 3, borde: "abajo" },
            ];
        },
    });
    await laFotoDeLaAccion(p, { macro: "Pedir valoración", n: 1, archivo: "responder-flujo.webp" });

    /* 4. Enviar por otra línea --------------------------------------- */
    await laFotoDeLaAccion(p, {
        macro: "Aviso desde Soporte",
        n: 1,
        archivo: "otra-linea-elegir.webp",
        marcas: async () => [{ c: await caja(p, laConfig(p, 1).locator("select").first()) }],
    });
    await laFotoDeLaAccion(p, {
        macro: "Aviso desde Soporte",
        n: 1,
        archivo: "otra-linea-mensaje.webp",
        marcas: async () => [{ c: await caja(p, laConfig(p, 1).locator("textarea")) }],
    });
    // La línea de Meta: sus dos formas de enviar. Se cambia la línea y el
    // modo, se fotografía y se cierra SIN guardar.
    await laConfig(p, 1).locator("select").first().selectOption("OFICIAL");
    const plantilla = laConfig(p, 1).getByRole("button", { name: "Plantilla de Meta" });
    await plantilla.waitFor({ state: "visible", timeout: 10000 });
    await laConfig(p, 1).getByRole("button", { name: "Texto libre" }).click();
    await laConfig(p, 1).getByText("En líneas de Meta", { exact: false }).waitFor({ state: "visible", timeout: 10000 });
    await apartar(p);
    await espera(p, 500);
    const cMeta = await caja(p, laAccion(p, 1));
    // Los dos botones van pegados: un recuadro alrededor de los dos y cada
    // número por fuera de su lado, que encima taparían el rótulo del otro.
    const cPlantilla = await caja(p, plantilla);
    const cLibre = await caja(p, laConfig(p, 1).getByRole("button", { name: "Texto libre" }));
    await marcar(p, [
        { c: unir(cPlantilla, cLibre) },
        { c: cPlantilla, n: 1, sinRecuadro: true, numeroEn: { x: cPlantilla.x - 20, y: cPlantilla.y + cPlantilla.h / 2 } },
        { c: cLibre, n: 2, sinRecuadro: true, numeroEn: { x: cLibre.x + cLibre.w + 20, y: cLibre.y + cLibre.h / 2 } },
    ]);
    await guardar(p, "otra-linea-meta.webp", holgura(cMeta, 28, vista));
    await desmarcar(p);
    await cerrarElEditor(p);
    await quitarAvisos(p);

    /* 5. Clasificar y asignar ---------------------------------------- */
    await laFotoDeLaAccion(p, { macro: "Dar la bienvenida", n: 2, archivo: "clasificar-etiqueta.webp" });
    await laFotoDeLaAccion(p, { macro: "Dar la bienvenida", n: 3, archivo: "clasificar-asesor.webp" });
    await laFotoDeLaAccion(p, { macro: "Marcar como caliente", n: 2, archivo: "clasificar-calificacion.webp" });

    /* 6. Tareas, notas y cierre -------------------------------------- */
    await laFotoDeLaAccion(p, { macro: "Marcar como caliente", n: 3, archivo: "tareas-nota.webp" });
    await laFotoDeLaAccion(p, {
        macro: "Enviar datos de pago",
        n: 5,
        archivo: "tareas-tarea.webp",
        marcas: async () => {
            const cfg = laConfig(p, 5);
            return [
                { c: await caja(p, cfg.locator("input").first()), n: 1 },
                { c: await caja(p, cfg.locator("select").first()), n: 2 },
                { c: await caja(p, cfg.locator('input[type="number"]').locator("xpath=..")), n: 3, esquina: "derecha" },
                { c: await caja(p, cfg.locator("select").nth(1)), n: 4, borde: "abajo" },
            ];
        },
    });
    await laFotoDeLaAccion(p, { macro: "Pasar a soporte", n: 3, archivo: "tareas-agente.webp" });
    // Esperar y Resolver, las dos últimas de «Venta cerrada»: una foto con las dos.
    await laFotoDeLaAccion(p, { macro: "Venta cerrada", n: 4, archivo: "tareas-esperar.webp" });
    {
        const c4 = await caja(p, laAccion(p, 4));
        const c5 = await caja(p, laAccion(p, 5));
        await marcar(p, [
            { c: c4, n: 1 },
            { c: c5, n: 2 },
        ]);
        await guardar(p, "tareas-esperar.webp", holgura(unir(c4, c5), 28, vista));
        await desmarcar(p);
    }
    await cerrarElEditor(p);

    /* 8. Buscar y ordenar -------------------------------------------- */
    const cBuscador = await caja(p, zona("buscador"));
    const cFiltros = await caja(p, zona("filtros"));
    // El trozo de la barra con el buscador y las pastillas, y la primera fila.
    const recorteDeLaBusqueda = async () => {
        const c1 = await caja(p, p.locator("[data-macro-de-la-lista]").first());
        return holgura({ x: cBarra.x, y: cBarra.y, w: cFiltros.x + cFiltros.w - cBarra.x + 120, h: c1.y + c1.h - cBarra.y }, 22, vista);
    };
    await laPastilla(p, "Inactivas").click();
    await p.waitForFunction(() => document.querySelectorAll("[data-macro-de-la-lista]").length === 1, null, { timeout: 10000 });
    await apartar(p);
    await espera(p, 400);
    await marcar(p, [{ c: cFiltros }, { c: await caja(p, p.locator("[data-macro-de-la-lista]").first()) }]);
    await guardar(p, "buscar-pastillas.webp", await recorteDeLaBusqueda());
    await desmarcar(p);
    await laPastilla(p, "Todas").click();

    const buscador = p.locator(`${zona("buscador")} input`);
    await buscador.fill("promocion");
    await p.waitForFunction(() => document.querySelectorAll("[data-macro-de-la-lista]").length === 1, null, { timeout: 10000 });
    await apartar(p);
    await espera(p, 400);
    await marcar(p, [
        { c: cBuscador, texto: "Sin tildes también", lado: "derecha" },
        { c: await caja(p, p.locator("[data-macro-de-la-lista]").first()) },
    ]);
    await guardar(p, "buscar-resultado.webp", await recorteDeLaBusqueda());
    await desmarcar(p);
    await buscador.fill("");
    await p.waitForFunction(() => document.querySelectorAll("[data-macro-de-la-lista]").length > 1, null, { timeout: 10000 });
    await espera(p, 400);

    const primera = p.locator("[data-macro-de-la-lista]").first();
    const cPrimera = await caja(p, primera);
    const tres = unir(cPrimera, await caja(p, p.locator("[data-macro-de-la-lista]").nth(2)));
    // Solo el recuadro: un rótulo a la derecha del asa caía encima del nombre
    // de la macro, y el paso ya dice «los puntos de su izquierda».
    await marcar(p, [{ c: await caja(p, primera.locator('button[title="Arrastrar para reordenar"]')) }], { atenuar: true });
    await guardar(p, "buscar-arrastrar.webp", holgura({ x: tres.x, y: tres.y, w: 620, h: tres.h }, 22, vista));
    await desmarcar(p);

    /* 9. Editar, duplicar, desactivar y eliminar --------------------- */
    const cVenta = await caja(p, laFila(p, "Venta cerrada"));
    await marcar(p, [{ c: await caja(p, enLaFila(p, "Venta cerrada", "Editar")), texto: "Editar", lado: "abajo" }], { atenuar: true });
    await guardar(p, "editar-boton.webp", holgura({ x: cVenta.x + cVenta.w - 560, y: cVenta.y, w: 560, h: cVenta.h * 2 + 70 }, 16, vista));
    await desmarcar(p);

    const conSuMenu = async (macro) => {
        await enLaFila(p, macro, "Más acciones").click();
        const menu = elMenu(p);
        await menu.waitFor({ state: "visible", timeout: 10000 });
        await espera(p, 400);
        await apartar(p);
        return menu;
    };
    let menu = await conSuMenu("Pasar a soporte");
    const cSoporte = await caja(p, laFila(p, "Pasar a soporte"));
    // Dos opciones pegadas: con un recuadro cada una se montaban. Va UNO
    // alrededor de las dos, y cada número a la izquierda de SU opción.
    {
        const cDuplicar = await caja(p, menu.getByRole("menuitem", { name: "Duplicar" }));
        const cDesactivar = await caja(p, menu.getByRole("menuitem", { name: "Desactivar" }));
        await marcar(p, [
            { c: unir(cDuplicar, cDesactivar) },
            { c: cDuplicar, n: 1, sinRecuadro: true, numeroEn: { x: cDuplicar.x - 22, y: cDuplicar.y + cDuplicar.h / 2 } },
            { c: cDesactivar, n: 2, sinRecuadro: true, numeroEn: { x: cDesactivar.x - 22, y: cDesactivar.y + cDesactivar.h / 2 } },
        ]);
    }
    {
        const cMenu = await caja(p, menu);
        await guardar(p, "mas-acciones.webp", holgura({ x: cSoporte.x + cSoporte.w - 520, y: cSoporte.y, w: 520, h: cMenu.y + cMenu.h - cSoporte.y }, 22, vista));
    }
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 300);

    menu = await conSuMenu("Promoción de octubre");
    const cPromo = await caja(p, laFila(p, "Promoción de octubre"));
    const cActivar = await caja(p, menu.getByRole("menuitem", { name: "Activar" }));
    await marcar(p, [{ c: cPromo }, { c: cActivar, texto: "Activar", lado: "izquierda" }], { atenuar: true });
    {
        const cMenu = await caja(p, menu);
        await guardar(p, "macro-inactiva.webp", holgura(unir(cPromo, cMenu), 22, vista));
    }
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 300);

    await enLaFila(p, "Venta cerrada", "Eliminar").click();
    const confirmar = p.locator('[role="dialog"]').filter({ hasText: "Eliminar macro" }).last();
    await confirmar.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, confirmar.getByRole("button", { name: "Cancelar" })), texto: "Cancelar no cambia nada", lado: "abajo" }]);
    {
        const c = await caja(p, confirmar);
        await guardar(p, "eliminar-confirmar.webp", holgura({ x: c.x - 24, y: c.y - 14, w: c.w + 48, h: c.h + 14 + 64 }, 0, vista));
    }
    await desmarcar(p);
    await confirmar.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 400);

    /* 10. Acciones masivas ------------------------------------------- */
    const marcadas = ["Dar la bienvenida", "Enviar datos de pago"];
    for (const m of marcadas) await laFila(p, m).locator('button[role="checkbox"]').click();
    await apartar(p);
    await espera(p, 300);
    const cCuatro = unir(await caja(p, p.locator("[data-macro-de-la-lista]").first()), await caja(p, p.locator("[data-macro-de-la-lista]").nth(3)));
    await marcar(p, [
        { c: await caja(p, laFila(p, marcadas[0]).locator('button[role="checkbox"]')) },
        { c: await caja(p, laFila(p, marcadas[1]).locator('button[role="checkbox"]')) },
    ]);
    await guardar(p, "masivas-marcar.webp", holgura({ x: cCuatro.x, y: cCuatro.y, w: 620, h: cCuatro.h }, 22, vista));
    await desmarcar(p);

    await p.locator(`${zona("acciones")} button[title="Acciones"]`).click();
    menu = elMenu(p);
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await apartar(p);
    // Las dos opciones van pegadas: un recuadro alrededor de las dos y cada
    // número a la izquierda de la suya, en el orden en que se ven.
    const cEliminarTodas = await caja(p, menu.getByRole("menuitem", { name: "Eliminar todas" }));
    const cEliminarDos = await caja(p, menu.getByRole("menuitem", { name: /Eliminar 2 macros/ }));
    await marcar(p, [
        { c: unir(cEliminarTodas, cEliminarDos) },
        { c: cEliminarTodas, n: 1, sinRecuadro: true, numeroEn: { x: cEliminarTodas.x - 22, y: cEliminarTodas.y + cEliminarTodas.h / 2 } },
        { c: cEliminarDos, n: 2, sinRecuadro: true, numeroEn: { x: cEliminarDos.x - 22, y: cEliminarDos.y + cEliminarDos.h / 2 } },
    ]);
    {
        const cMenu = await caja(p, menu);
        const cAcc = await caja(p, zona("acciones"));
        const c = unir(cMenu, cAcc);
        await guardar(p, "masivas-menu.webp", holgura({ x: c.x - 180, y: cBarra.y, w: c.w + 180, h: c.y + c.h - cBarra.y }, 22, vista));
    }
    await desmarcar(p);
    await menu.getByRole("menuitem", { name: /Eliminar 2 macros/ }).click();
    const alerta = p.locator('[role="alertdialog"]');
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, alerta.getByRole("button", { name: "Cancelar" })), texto: "Cancelar no cambia nada", lado: "abajo" }]);
    {
        const c = await caja(p, alerta);
        await guardar(p, "masivas-confirmar.webp", holgura({ x: c.x - 24, y: c.y - 14, w: c.w + 48, h: c.h + 14 + 64 }, 0, vista));
    }
    await desmarcar(p);
    await alerta.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 400);
    for (const m of marcadas) await laFila(p, m).locator('button[role="checkbox"]').click();

    /* 7. Lanzar una macro en un chat ---------------------------------- */
    // Al final: lanzarla suma una ejecución, y las fotos de la lista de arriba
    // enseñan los números de la semilla.
    await abrirElChat(p);
    const cCabeceraDelChat = await caja(p, "[data-cabecera-de-chat]");
    const cMacros = await caja(p, elBotonMacros(p));
    await marcar(p, [{ c: cMacros, texto: "Macros", lado: "abajo" }], { atenuar: true });
    await guardar(p, "usar-boton.webp", holgura({ x: cCabeceraDelChat.x, y: cCabeceraDelChat.y, w: cCabeceraDelChat.w, h: cCabeceraDelChat.h + 110 }, 12, vista));
    await desmarcar(p);

    menu = await abrirElMenuDeMacros(p);
    let cMenuDelChat = await caja(p, menu);
    await marcar(p, [{ c: cMenuDelChat }]);
    await guardar(p, "usar-menu.webp", holgura(unir(cMacros, cMenuDelChat, { x: cMenuDelChat.x - 260, y: cCabeceraDelChat.y, w: 1, h: 1 }), 20, vista));
    await desmarcar(p);

    // Se lanza la que no envía nada: etiqueta, calificación y nota interna.
    await menu.getByRole("menuitem", { name: LA_QUE_SE_LANZA }).click();
    const aviso = p.locator("[data-sonner-toast]", { hasText: "Macro aplicada" }).first();
    await aviso.waitFor({ state: "visible", timeout: 30000 });
    await apartar(p);
    await espera(p, 500);
    const cAviso = await caja(p, aviso);
    await marcar(p, [{ c: cAviso, texto: "Qué se hizo", lado: "arriba" }]);
    await guardar(p, "usar-resultado.webp", holgura({ x: cAviso.x - 360, y: cAviso.y - 150, w: cAviso.w + 360, h: cAviso.h + 150 }, 20, vista));
    await desmarcar(p);
    await quitarAvisos(p);

    menu = await abrirElMenuDeMacros(p);
    cMenuDelChat = await caja(p, menu);
    await marcar(p, [{ c: await caja(p, menu.getByRole("menuitem", { name: "Gestionar macros" })), texto: "Gestionar macros", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "usar-gestionar.webp", holgura(unir(cMacros, cMenuDelChat, { x: cMenuDelChat.x - 280, y: cCabeceraDelChat.y, w: 1, h: 1 }), 20, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");

    /* El marco: el menú y la barra de arriba ------------------------- */
    await abrirMacros(p);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Automatizaciones", texto: "Mis macros está en Automatizaciones" });
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cuánto se respira entre una frase y la siguiente: lo justo para que no se
 * monten, y no más —el ritmo lo pone la voz, no el guion—. Es el mismo de
 * Leads, Catálogo, Diagramas y Mis notas. Queda escrito en
 * `voz-de-la-guia/macros.json` con el vídeo.
 */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

/**
 * El vídeo: qué se hace en pantalla mientras suena cada frase de
 * `narracion-guia-macros.mjs`. La voz se coloca con `empezarLaNarracion` del
 * taller y se graba con la grabadora de todas las guías.
 */
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
    // No `recordVideo`: estiraba el vídeo cada vez que el navegador pintaba
    // deprisa y la imagen se iba quedando detrás de la voz (ver la grabadora).
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, sinGrabarLaEspera, tramos, cortes } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    // Si el vídeo se cae a medias, una foto de cómo estaba la pantalla: el
    // error de Playwright solo dice qué esperaba, no qué había.
    let desdeMs = 0;
    try {
    await abrirMacros(p);
    await p.mouse.move(640, 400, { steps: 8 });
    // Lo grabado hasta aquí es la página cargando: el vídeo empieza justo
    // antes de la primera palabra.
    desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("en un solo botón", 300);
    await mover(p, laFila(p, "Venta cerrada"));
    await alDecir("una y otra vez", 300);
    await mover(p, laFila(p, "Enviar datos de pago"));

    // El menú de la izquierda: se abre con las dos flechas, se señala dónde
    // está Mis macros y se vuelve a recoger al empezar la frase siguiente,
    // que es la de la barra donde viven las flechas.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const automatizaciones = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Automatizaciones" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Automatizaciones", 600);
    await mover(p, automatizaciones);

    const [, , , buscarTodo, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // La lista: el color, las acciones y las veces que se ha usado.
    const unaFila = laFila(p, "Dar la bienvenida");
    await decir("lista");
    await alDecir("con su color", 300);
    await mover(p, unaFila.locator("span.h-3.w-3.rounded-full"));
    await alDecir("cuántas acciones tiene", 300);
    await mover(p, unaFila.locator("div.min-w-0.flex-1 p").nth(1));

    // Crear: el nombre, el color y la primera acción.
    const editor = p.locator(EDITOR);
    const agregar = editor.locator("[data-agregar-accion]");
    await decir("crear");
    await alDecir("Con Nuevo");
    await pulsar(p, p.locator(zona("crear")).locator("button").first());
    await editor.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("un nombre", 300);
    const nombre = editor.locator('input[placeholder="Ej: Cierre Ganado"]');
    await pulsar(p, nombre);
    await nombre.pressSequentially("Cita confirmada", { delay: 45 });
    await alDecir("eliges su color", 300);
    await pulsar(p, alLadoDe(editor.getByText("Color", { exact: true })).locator("button").nth(2));
    await alDecir("le agregas acciones", 300);
    await pulsar(p, agregar);

    // Qué puede hacer: se van poniendo acciones mientras se nombran.
    const conTipo = async (n, tipo) => {
        await mover(p, elTipo(p, n));
        await elTipo(p, n).selectOption(tipo);
    };
    await decir("acciones");
    await alDecir("enviar un mensaje", 200);
    await pulsar(p, laConfig(p, 1).locator("textarea"));
    await p.keyboard.type("¡Tu cita quedó confirmada!", { delay: 25 });
    await alDecir("poner una etiqueta", 200);
    await pulsar(p, agregar);
    await conTipo(2, "ADD_TAG");
    await laConfig(p, 2).locator("select").selectOption({ label: "Cliente nuevo" });
    await alDecir("cambiar la calificación", 200);
    await pulsar(p, agregar);
    await conTipo(3, "CHANGE_STAGE");
    await laConfig(p, 3).locator("select").selectOption("CALIENTE");
    await alDecir("resolver la conversación", 200);
    await pulsar(p, agregar);
    await conTipo(4, "RESOLVE");
    await pulsar(p, editor.getByRole("button", { name: "Guardar" }));
    await editor.waitFor({ state: "hidden", timeout: 10000 });

    // En Chats: el botón «Macros», la macro y lo que se hizo.
    //
    // Abrir Chats tarda unos segundos (la bandeja, y después «Cargando
    // mensajes…»). Grabado, la frase decía «en cualquier conversación de Chats»
    // encima de la lista de macros y de una conversación en blanco: la voz iba
    // por delante de la imagen. Así que la carga NO se graba (`sinGrabarLaEspera`):
    // se abre la conversación, se espera a que sus mensajes estén pintados, y la
    // frase empieza con la pantalla ya entera.
    await sinGrabarLaEspera(async () => {
        await p.goto(`${BASE}/chats?jid=${encodeURIComponent(JID)}&instance=${LINEA}`, { waitUntil: "domcontentloaded" });
        await elBotonMacros(p).waitFor({ state: "visible", timeout: 60000 });
        await laConversacionCargada(p);
        await apartarLoQueTapa(p);
        await esconderLosBotonesDelBorde(p);
        // El cursor es un dibujo de la página, así que la navegación lo borró:
        // un movimiento lo vuelve a poner donde estaba el ratón.
        await p.mouse.move(700, 470, { steps: 2 });
        await espera(p, 300);
    });
    await decir("chat");
    await alDecir("pulsas Macros");
    await pulsar(p, elBotonMacros(p));
    const menu = elMenu(p);
    await menu.getByText(LA_QUE_SE_LANZA).waitFor({ state: "visible", timeout: 30000 });
    await alDecir("eliges la tuya", 200);
    await pulsar(p, menu.getByRole("menuitem", { name: LA_QUE_SE_LANZA }));

    // El aviso se va solo a los cuatro segundos, y la frase que lo nombra
    // empieza cuando acaba la de ahora. El ratón va a él en cuanto sale: con
    // el cursor encima, el aviso se queda (sonner para su reloj).
    const aviso = p.locator("[data-sonner-toast]", { hasText: "Macro aplicada" }).first();
    await aviso.waitFor({ state: "visible", timeout: 30000 });
    // Entra deslizándose desde abajo: medido a medias, el ratón se quedaba
    // DEBAJO del aviso ya asentado, y sin el cursor encima se iba solo.
    await espera(p, 700);
    await mover(p, aviso);
    await decir("resultado");
    await alDecir("qué se hizo", 200);
    await aviso.waitFor({ state: "visible", timeout: 5000 });
    await alDecir("cuál y por qué", 200);
    await pulsar(p, elBotonMacros(p));
    await elMenu(p).getByRole("menuitem", { name: "Gestionar macros" }).waitFor({ state: "visible", timeout: 30000 });

    // De vuelta: filtrar, buscar y arrastrar.
    const buscador = p.locator(`${zona("buscador")} input`);
    await decir("buscar");
    await alDecir("Gestionar macros");
    await pulsar(p, elMenu(p).getByRole("menuitem", { name: "Gestionar macros" }));
    await p.waitForSelector(`${LISTA} [data-macro-de-la-lista]`, { timeout: 30000 });
    await alDecir("activas e inactivas", 200);
    await pulsar(p, laPastilla(p, "Inactivas"));
    await alDecir("por su nombre", 200);
    await pulsar(p, laPastilla(p, "Todas"));
    await pulsar(p, buscador);
    await buscador.pressSequentially("pago", { delay: 90 });
    await alDecir("las arrastras", 200);
    await buscador.fill("");
    // Se arrastra la cuarta a la segunda posición, con el ratón de verdad.
    const asa = laFila(p, LA_QUE_SE_LANZA).locator('button[title="Arrastrar para reordenar"]');
    await mover(p, asa);
    const desde = await asa.boundingBox();
    const hasta = await laFila(p, "Dar la bienvenida").boundingBox();
    await p.mouse.down();
    await p.mouse.move(desde.x + desde.width / 2, desde.y + desde.height / 2 - 12, { steps: 6 });
    await p.mouse.move(desde.x + desde.width / 2, hasta.y + hasta.height / 2, { steps: 26 });
    await espera(p, 200);
    await p.mouse.up();

    // El menú de la fila: duplicar, desactivar y eliminar (sin pulsar ninguno).
    await decir("cierre");
    await alDecir("desde su menú", 200);
    await pulsar(p, enLaFila(p, "Pasar a soporte", "Más acciones"));
    const suMenu = elMenu(p);
    await suMenu.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("las duplicas", 200);
    await mover(p, suMenu.getByRole("menuitem", { name: "Duplicar" }));
    await alDecir("las desactivas", 200);
    await mover(p, suMenu.getByRole("menuitem", { name: "Desactivar" }));
    await alDecir("o las eliminas", 200);
    await p.keyboard.press("Escape");
    await mover(p, enLaFila(p, "Pasar a soporte", "Eliminar"));
    await callar(700);
    await rotulo(p, "");
    await espera(p, 500);

    } catch (e) {
        await p.screenshot({ path: path.join(TMP, "error-del-video.png") }).catch(() => {});
        console.error("[guia] el vídeo se cayó en", p.url(), "— foto en", path.join(TMP, "error-del-video.png"));
        throw e;
    }
    const totalMs = Date.now() - t0;
    const grabado = await grabadora.parar();
    console.log(`  · grabados ${grabado.fotogramas} fotogramas (${(grabado.fotogramas / 25).toFixed(1)} s) de ${grabado.recibidos} pintados, en ${(totalMs / 1000).toFixed(1)} s`);
    await ctx.close();

    // La voz se monta ya SIN los cortes: la frase que viene después de una
    // carga se adelanta lo que tardó la carga, igual que la imagen.
    const { wav, colocados } = montarLaPista(tramosSinLosCortes(tramos, cortes), totalMs - loQueSeCorta(cortes));
    const pista = path.join(dir, "narracion.wav");
    guardarWav(pista, wav);
    const destino = path.join(SALIDA, "demostracion.webm");
    mezclar(mudo, pista, destino, { desdeMs, cortes });
    for (const c of cortes) console.log(`  · sin grabar ${((c.hastaMs - c.desdeMs) / 1000).toFixed(1)} s de carga (en el ${(c.desdeMs / 1000).toFixed(1)} s)`);
    writeFileSync(path.join(TMP, "narracion.json"), JSON.stringify(colocados, null, 2));
    escribirLaVozDelVideo("macros", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS, cortes });
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
        acceptDownloads: true,
    });
    const p = await entrar(ctx, BASE);
    await abrirMacros(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    // El vídeo pasa por Chats: se visita antes aquí, para que la «Guía rápida»
    // del copiloto (que sale sola la primera vez) no aparezca en medio del vídeo.
    if (SOLO_VIDEO) await abrirElChat(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        // Las capturas cambiaron los datos: el vídeo sale del punto de partida.
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-macros.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

// Las que la guía enseña tienen que estar TODAS. Con SOLO_MINIATURAS o
// SOLO_VIDEO, lo demás se conserva del disco: basta con que esté.
comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/macros`);
