/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Respuestas Rápidas,
 * sobre la App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-respuestas-rapidas.mjs`).
 *
 * La MISMA receta que la guía de Leads (`capturar-guia-leads.mjs`) y con las
 * MISMAS piezas del taller (`taller-de-la-guia.mjs`): cada captura es «abre
 * esto, pulsa aquello, resalta este elemento», y las marcas se localizan por
 * lo que la pantalla ya expone —los `data-zona` de la barra y de cada
 * respuesta, los `aria-label`—, no por coordenadas escritas a mano.
 *
 * Las capturas CAMBIAN los datos (crean dos respuestas, reordenan la lista),
 * así que antes del vídeo se vuelve a sembrar: el vídeo sale del mismo punto
 * de partida. Nada de lo que se hace aquí borra: la ventana de eliminar se
 * CANCELA, en las capturas y en el vídeo.
 *
 * Qué captura hace falta lo dice `lib/guia-respuestas-rapidas.ts`: el script
 * se niega a terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-respuestas-rapidas.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-respuestas-rapidas.mjs";
import { guardarWav, mezclar, montarLaPista } from "./voz-de-la-guia.mjs";
import {
    LA_BARRA_DE_ARRIBA,
    caja,
    cerrarLoAbierto,
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
    tomarUnaMiniatura,
    unir,
} from "./taller-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "respuestas-rapidas");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-respuestas-rapidas";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
// Solo el vídeo (p. ej. al cambiar la narración): las imágenes se conservan del disco.
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-respuestas-rapidas.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-respuestas-rapidas.json");

/** La conversación de la sección de Chats (la de `sembrar-barra.mjs`). */
const LINEA = "BANCO_VENTAS";
const JID = "573001112233@s.whatsapp.net";
const CLIENTA = "Mariana Toro";

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

async function abrirLaLista(p) {
    await p.goto(`${BASE}/auto-replies`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector('[data-zona="lista-de-respuestas"] [data-respuesta-rapida]', { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    // Los botones del borde tapan los mandos de la derecha de cada respuesta.
    await esconderLosBotonesDelBorde(p);
}

async function abrirElChat(p) {
    await p.goto(`${BASE}/chats?jid=${encodeURIComponent(JID)}&instance=${LINEA}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector('textarea[aria-label="Escribe tu mensaje"]', { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 3000);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
}

/* ------------------------------------------------------------------ */
/* Medir                                                               */
/* ------------------------------------------------------------------ */

const LA_LISTA = '[data-zona="lista-de-respuestas"]';
/** La fila entera de una respuesta —asa, casilla y tarjeta— por lo que dice. */
const laFila = (p, texto) => p.locator(`${LA_LISTA} > div`, { hasText: texto }).first();
const laTarjeta = (p, texto) => laFila(p, texto).locator("[data-respuesta-rapida]");
const laParte = (p, texto, zona) => laFila(p, texto).locator(`[data-zona="${zona}"]`).first();
const lasFilas = (p) => p.locator(`${LA_LISTA} > div`);
/**
 * La fila por su POSICIÓN, sacada una vez por lo que dice. Hace falta cuando
 * lo que la identifica deja de ser texto: al editar el atajo, la pastilla
 * «/horario» pasa a ser un campo, su valor no cuenta como texto y `hasText`
 * dejaría de encontrarla.
 */
async function fijarLaFila(p, texto) {
    const i = await lasFilas(p).evaluateAll((filas, t) => filas.findIndex((f) => (f.textContent ?? "").includes(t)), texto);
    if (i < 0) throw new Error(`[guia] no está la respuesta «${texto}»`);
    return lasFilas(p).nth(i);
}

const laPastilla = (p, nombre) => p.locator(`button[aria-pressed][aria-label="${nombre}"]`).first();
const LAS_PASTILLAS = ["Todas", "Texto simple", "Ejecutan flujo"];
const LA_CATEGORIA = '[data-zona="filtro-de-categoria"]';
const EL_BUSCADOR = 'input[aria-label="Buscar respuesta"]';
const EL_NUEVO = (p) => p.locator('[data-barra-de-acciones] [data-zona="crear"] button').first();
const LAS_MASIVAS = '[data-barra-de-acciones] [data-zona="acciones"] button';
const EL_DIALOGO = '[role="dialog"]';
const LA_ALERTA = '[role="alertdialog"]';
const LA_LISTA_ABIERTA = '[role="listbox"]';

async function lasPastillas(p) {
    return unir(...(await Promise.all(LAS_PASTILLAS.map((n) => caja(p, laPastilla(p, n))))));
}

async function laBarra(p) {
    return unir(await caja(p, EL_BUSCADOR), await caja(p, LAS_MASIVAS));
}

/** Las `n` primeras filas de la lista, a todo lo ancho. */
async function lasPrimeras(p, n) {
    const cajas = [];
    for (let i = 0; i < n; i += 1) cajas.push(await caja(p, lasFilas(p).nth(i)));
    return unir(...cajas);
}

/* ------------------------------------------------------------------ */
/* La ventana de crear                                                 */
/* ------------------------------------------------------------------ */

async function abrirLaVentana(p) {
    await EL_NUEVO(p).click();
    await p.waitForSelector(`${EL_DIALOGO} #name`, { timeout: 15000 });
    await espera(p, 600);
}

const elTipo = (p, nombre) => p.locator(`${EL_DIALOGO} button`, { hasText: nombre }).first();

/** Elige en un desplegable (Radix pinta la lista en un portal). */
async function elegir(p, disparador, opcion) {
    await (typeof disparador === "string" ? p.locator(disparador).first() : disparador).click();
    const lista = p.locator(LA_LISTA_ABIERTA).last();
    await lista.waitFor({ state: "visible", timeout: 10000 });
    await lista.getByRole("option", { name: opcion, exact: true }).click();
    await espera(p, 400);
}

async function cerrarLaVentana(p) {
    for (let i = 0; i < 3 && (await p.$(EL_DIALOGO)); i += 1) {
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

/**
 * Una miniatura por sección, TODAS con la misma receta del taller: la zona que
 * la sección explica, nítida y en su recuadro; el resto, bajo el velo. La de
 * Chats se toma en Chats, así que aquí se toman una a una
 * (`tomarUnaMiniatura`) y los focos se juntan al final.
 */
async function miniaturas(p) {
    const focos = {};
    const mini = async (slug, zona, despues) => {
        Object.assign(focos, await tomarUnaMiniatura(p, slug, await zona(), { salida: SALIDA, tomadas }));
        await cerrarLoAbierto(p);
        if (despues) await despues();
    };

    await mini("vista-general", () => laBarra(p));
    await mini(
        "crear-de-texto",
        async () => {
            await abrirLaVentana(p);
            return caja(p, EL_DIALOGO);
        },
        () => cerrarLaVentana(p),
    );
    await mini("crear-con-flujo", () => caja(p, laFila(p, "Medios de pago")));
    await mini("editar", async () => unir(await caja(p, laParte(p, "horario", "cabecera-de-la-respuesta")), await caja(p, laParte(p, "horario", "mensaje").locator("h3"))));
    await mini("filtrar-y-buscar", async () => unir(await caja(p, EL_BUSCADOR), await caja(p, LA_CATEGORIA)));
    await mini("ordenar", async () => {
        const asas = [];
        for (let i = 0; i < 4; i += 1) asas.push(await caja(p, lasFilas(p).nth(i).locator('[data-zona="asa"]')));
        return unir(...asas);
    });
    await mini("eliminar", async () => {
        const trigger = laParte(p, "comprobante", "mas-acciones");
        await trigger.click();
        const menu = p.locator('[role="menu"]').last();
        await menu.waitFor({ state: "visible", timeout: 10000 });
        await espera(p, 500);
        return unir(await caja(p, trigger), await caja(p, menu));
    });

    await abrirElChat(p);
    await mini(
        "usar-en-un-chat",
        async () => {
            const caja_ = p.locator('textarea[aria-label="Escribe tu mensaje"]');
            await caja_.click();
            await caja_.pressSequentially("/env", { delay: 60 });
            const sugerencias = p.locator('[data-zona="sugerencias-de-respuestas"]');
            await sugerencias.waitFor({ state: "visible", timeout: 10000 });
            await espera(p, 400);
            return unir(await caja(p, sugerencias), await caja(p, caja_));
        },
        async () => {
            await p.locator('textarea[aria-label="Escribe tu mensaje"]').fill("");
            await espera(p, 300);
        },
    );
    await abrirLaLista(p);

    await desmarcar(p);
    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();
    const barra = await laBarra(p);
    const zonaDeLaBarra = holgura(unir(barra, { ...barra, y: barra.y + 110, h: 1 }), 22, vista);

    // Portada del vídeo: la pantalla limpia.
    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las cuatro zonas, en el orden de
    // `ZONAS_DE_LA_PANTALLA`. El menú y la barra de arriba van metidos unos
    // píxeles: pegados al borde, su recuadro se montaría sobre el del vecino.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cLista = await lasPrimeras(p, 7);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: barra, n: 3 },
        { c: cLista, n: 4 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");

    // La barra de trabajo: sus cinco partes, en el orden de `PARTES_DE_LA_BARRA_DE_TRABAJO`.
    await marcar(p, [
        { c: await caja(p, EL_BUSCADOR), n: 1 },
        { c: await lasPastillas(p), n: 2 },
        { c: await caja(p, LA_CATEGORIA), n: 3 },
        { c: await caja(p, EL_NUEVO(p)), n: 4 },
        { c: await caja(p, LAS_MASIVAS), n: 5 },
    ]);
    await guardar(p, "barra.webp", holgura(barra, 34, vista));
    await desmarcar(p);

    // Una respuesta: sus siete partes, en el orden de `PARTES_DE_UNA_RESPUESTA`.
    // Las tres primeras van pegadas: su número va ENCIMA de la fila, y el del
    // mensaje debajo, así ningún número tapa lo que numera.
    const ejemplo = "precios";
    const cFila = await caja(p, laFila(p, ejemplo));
    const cAsa = await caja(p, laParte(p, ejemplo, "asa"));
    const cCasilla = await caja(p, laParte(p, ejemplo, "casilla"));
    const cTipo = await caja(p, laFila(p, ejemplo).locator('[title="Texto simple"]'));
    const cAtajo = await caja(p, laParte(p, ejemplo, "atajo"));
    const cCategoria = await caja(p, laParte(p, ejemplo, "categoria"));
    const cMensaje = await caja(p, laParte(p, ejemplo, "mensaje").locator("h3"));
    const cMandos = await caja(p, laParte(p, ejemplo, "mas-acciones"));
    const arriba = cFila.y - 22;
    await marcar(
        p,
        [
            { c: cAsa, n: 1, numeroEn: { x: cAsa.x + cAsa.w / 2, y: arriba } },
            { c: cCasilla, n: 2, numeroEn: { x: cCasilla.x + cCasilla.w / 2 + 8, y: arriba }, sinRecuadro: true },
            { c: cTipo, n: 3, numeroEn: { x: cTipo.x + cTipo.w / 2 + 12, y: arriba } },
            { c: cAtajo, n: 4, numeroEn: { x: cAtajo.x + cAtajo.w / 2, y: arriba } },
            { c: cCategoria, n: 5, numeroEn: { x: cCategoria.x + cCategoria.w / 2, y: arriba } },
            { c: cMensaje, n: 6, numeroEn: { x: cMensaje.x + cMensaje.w / 2, y: cFila.y + cFila.h + 22 } },
            { c: cMandos, n: 7, numeroEn: { x: cMandos.x + cMandos.w / 2, y: arriba } },
        ],
        { atenuar: true },
    );
    await guardar(p, "tarjeta.webp", holgura({ ...cFila, y: cFila.y - 44, h: cFila.h + 88 }, 16, vista));
    await desmarcar(p);

    // 2. Crear una respuesta de texto.
    await marcar(p, [{ c: await caja(p, EL_NUEVO(p)), texto: "Nuevo", lado: "abajo" }]);
    await guardar(p, "crear-boton.webp", zonaDeLaBarra);
    await desmarcar(p);
    await abrirLaVentana(p);
    const cVentana = () => caja(p, EL_DIALOGO);
    await marcar(p, [{ c: await caja(p, elTipo(p, "Texto simple")), texto: "Viene marcado", lado: "abajo" }]);
    await guardar(p, "crear-texto-tipo.webp", holgura(await cVentana(), 40, vista));
    await p.locator(`${EL_DIALOGO} #name`).pressSequentially("cotizacion", { delay: 20 });
    await marcar(p, [{ c: await caja(p, `${EL_DIALOGO} #name`), texto: "Lo que tecleas tras «/»", lado: "abajo" }]);
    await guardar(p, "crear-texto-atajo.webp", holgura(await cVentana(), 40, vista));
    await elegir(p, `${EL_DIALOGO} #category`, "Ventas");
    await p.locator(`${EL_DIALOGO} #phrase`).fill("Te preparo la cotización y te la envío en unos minutos por aquí mismo.");
    await marcar(p, [
        { c: await caja(p, `${EL_DIALOGO} #category`), n: 1, esquina: "derecha" },
        { c: await caja(p, `${EL_DIALOGO} #phrase`), n: 2, esquina: "derecha" },
        { c: await caja(p, p.getByRole("button", { name: "Crear", exact: true })), texto: "Crear", lado: "abajo" },
    ]);
    await guardar(p, "crear-texto-mensaje.webp", holgura(await cVentana(), 60, vista));
    await desmarcar(p);
    await p.getByRole("button", { name: "Crear", exact: true }).click();
    await p.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
    await laFila(p, "/cotizacion").waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1200);
    await marcar(
        p,
        [
            { c: await caja(p, lasFilas(p).first()), texto: "La nueva, la primera de la lista", lado: "abajo" },
            { c: await caja(p, p.locator("[data-sonner-toast]").last()) },
        ],
        { atenuar: true },
    );
    await guardar(p, "crear-texto-creada.webp");
    await desmarcar(p);
    await quitarAvisos(p);

    // 3. Una que ejecuta un flujo.
    await abrirLaVentana(p);
    await elTipo(p, "Ejecutar flujo").click();
    await espera(p, 500);
    await marcar(p, [{ c: await caja(p, elTipo(p, "Ejecutar flujo")), texto: "Ejecutar flujo", lado: "abajo" }]);
    await guardar(p, "crear-flujo-tipo.webp", holgura(await cVentana(), 40, vista));
    await p.locator(`${EL_DIALOGO} #name`).fill("Bienvenida al cliente");
    await elegir(p, `${EL_DIALOGO} #workflow`, "Bienvenida");
    await marcar(p, [
        { c: await caja(p, `${EL_DIALOGO} #name`), n: 1, esquina: "derecha" },
        { c: await caja(p, `${EL_DIALOGO} #workflow`), n: 2, esquina: "derecha" },
        { c: await caja(p, p.getByRole("button", { name: "Crear", exact: true })), texto: "Crear", lado: "abajo" },
    ]);
    await guardar(p, "crear-flujo-campos.webp", holgura(await cVentana(), 60, vista));
    await desmarcar(p);
    await p.getByRole("button", { name: "Crear", exact: true }).click();
    await p.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
    await laFila(p, "Bienvenida al cliente").waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1200);
    const nueva = "Bienvenida al cliente";
    await marcar(
        p,
        [
            { c: await caja(p, laFila(p, nueva).locator('[data-zona="flujo"]')), texto: "El flujo que ejecuta", lado: "abajo" },
            { c: await caja(p, laFila(p, nueva).locator('[title="Ejecuta un flujo"]')), n: 1 },
        ],
        { atenuar: true },
    );
    await guardar(p, "crear-flujo-creada.webp", holgura(await lasPrimeras(p, 4), 60, vista));
    await desmarcar(p);
    await quitarAvisos(p);
    await marcar(p, [{ c: await caja(p, laParte(p, nueva, "editar-flujo")), texto: "Abre el flujo en su editor", lado: "abajo" }], { atenuar: true });
    await guardar(p, "flujo-editar.webp", holgura(await lasPrimeras(p, 4), 60, vista));
    await desmarcar(p);

    // 4. Editar, sin abrir ninguna ventana.
    const aEditar = "horario";
    const filaFija = await fijarLaFila(p, aEditar);
    const zonaDeEditar = async () => holgura(unir(await caja(p, filaFija), { ...(await caja(p, filaFija)), h: 200 }), 30, vista);
    await laParte(p, aEditar, "mensaje").click();
    const cuadro = laFila(p, aEditar).locator('textarea[aria-label="Mensaje"]');
    await cuadro.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await marcar(p, [{ c: await caja(p, cuadro), texto: "Enter guarda · Escape cancela", lado: "abajo" }]);
    await guardar(p, "editar-mensaje.webp", await zonaDeEditar());
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 500);
    await laParte(p, aEditar, "atajo").click();
    const atajo = filaFija.locator('input[aria-label="Atajo"]');
    await atajo.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await marcar(p, [{ c: await caja(p, atajo), texto: "El atajo, listo para cambiarlo", lado: "abajo" }]);
    await guardar(p, "editar-atajo.webp", await zonaDeEditar());
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 500);
    await laParte(p, aEditar, "categoria").click();
    let lista = p.locator(LA_LISTA_ABIERTA).last();
    await lista.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cCategoriaDeLaFila = await caja(p, laParte(p, aEditar, "categoria"));
    const cLista_ = await caja(p, lista);
    await marcar(p, [{ c: cCategoriaDeLaFila, n: 1 }, { c: cLista_, n: 2, esquina: "derecha" }], { atenuar: true });
    await guardar(p, "editar-categoria.webp", holgura(unir(cCategoriaDeLaFila, cLista_, await caja(p, laFila(p, aEditar))), 30, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 500);
    const conFlujo = "Medios de pago";
    const selectorDelFlujo = laFila(p, conFlujo).locator('[aria-label="Flujo que ejecuta"]');
    await selectorDelFlujo.click();
    lista = p.locator(LA_LISTA_ABIERTA).last();
    await lista.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cSelector = await caja(p, selectorDelFlujo);
    const cFlujos = await caja(p, lista);
    await marcar(p, [{ c: cSelector, n: 1 }, { c: cFlujos, n: 2, esquina: "derecha" }], { atenuar: true });
    await guardar(p, "editar-flujo.webp", holgura(unir(cSelector, cFlujos, await caja(p, laFila(p, conFlujo))), 30, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 500);

    // 5. Filtrar y buscar.
    const cPastillas = await lasPastillas(p);
    await marcar(p, await Promise.all(LAS_PASTILLAS.map(async (n, i) => ({ c: await caja(p, laPastilla(p, n)), n: i + 1 }))));
    await guardar(p, "filtros-pastillas.webp", zonaDeLaBarra);
    await desmarcar(p);
    await laPastilla(p, "Ejecutan flujo").click();
    await espera(p, 1200);
    await marcar(p, [
        { c: await caja(p, laPastilla(p, "Ejecutan flujo")), texto: "Filtro puesto", lado: "abajo" },
        { c: await caja(p, '[data-zona="aviso-de-filtro"]'), texto: "Cuántas ves de cuántas hay", lado: "arriba" },
    ]);
    await guardar(p, "filtros-activo.webp");
    await desmarcar(p);
    await laPastilla(p, "Todas").click();
    await espera(p, 1000);
    await p.locator(LA_CATEGORIA).click();
    lista = p.locator(LA_LISTA_ABIERTA).last();
    await lista.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cDesplegable = await caja(p, lista);
    await marcar(p, [{ c: await caja(p, LA_CATEGORIA), n: 1 }, { c: cDesplegable, n: 2, esquina: "derecha" }]);
    await guardar(p, "filtros-categoria.webp", holgura(unir(cPastillas, cDesplegable, await caja(p, EL_BUSCADOR)), 30, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 500);
    await p.fill(EL_BUSCADOR, "envio");
    await espera(p, 1200);
    await marcar(p, [
        { c: await caja(p, EL_BUSCADOR) },
        { c: await caja(p, LA_LISTA), texto: "Sin tildes, y las encuentra igual", lado: "abajo" },
    ]);
    await guardar(p, "buscar-resultado.webp");
    await p.fill(EL_BUSCADOR, "reembolso");
    await espera(p, 1200);
    const vacia = p.locator('[data-zona="lista-vacia"]');
    await marcar(p, [
        { c: await caja(p, EL_BUSCADOR) },
        { c: await caja(p, vacia.getByRole("button", { name: "Quitar filtros" })), texto: "Vuelve a enseñarlas todas", lado: "abajo" },
    ]);
    await guardar(p, "buscar-vacio.webp");
    await desmarcar(p);
    await vacia.getByRole("button", { name: "Quitar filtros" }).click();
    await espera(p, 1200);

    // 6. Ordenar: se arrastra por el asa.
    const cinco = await lasPrimeras(p, 6);
    await marcar(p, [{ c: await caja(p, lasFilas(p).nth(2).locator('[data-zona="asa"]')), texto: "Agarra por aquí", lado: "derecha" }]);
    await guardar(p, "ordenar-asa.webp", holgura(cinco, 30, vista));
    await desmarcar(p);
    await arrastrar(p, lasFilas(p).nth(4).locator('[data-zona="asa"]'), lasFilas(p).nth(1));
    await p.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
    await espera(p, 1200);
    await marcar(
        p,
        [
            { c: await caja(p, lasFilas(p).nth(1)), texto: "En su sitio nuevo", lado: "abajo" },
            { c: await caja(p, p.locator("[data-sonner-toast]").last()) },
        ],
        { atenuar: true },
    );
    await guardar(p, "ordenar-guardado.webp");
    await desmarcar(p);
    await quitarAvisos(p);
    await p.fill(EL_BUSCADOR, "pago");
    await espera(p, 1200);
    const asaApagada = lasFilas(p).first().locator('[data-zona="asa"]');
    await asaApagada.click();
    await p.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
    await espera(p, 1200);
    await marcar(p, [
        { c: await caja(p, asaApagada), texto: "Apagada con la búsqueda puesta", lado: "derecha" },
        { c: await caja(p, p.locator("[data-sonner-toast]").last()) },
    ]);
    await guardar(p, "ordenar-bloqueado.webp");
    await desmarcar(p);
    await quitarAvisos(p);
    await p.fill(EL_BUSCADOR, "");
    await espera(p, 1200);

    // 7. Eliminar: la ventana se CANCELA; nada de esta sección borra.
    const aBorrar = "comprobante";
    const puntos = laParte(p, aBorrar, "mas-acciones");
    await puntos.click();
    const menu = p.locator('[role="menu"]').last();
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cMenu = await caja(p, menu);
    const cPuntos = await caja(p, puntos);
    await marcar(p, [{ c: cPuntos, n: 1 }, { c: await caja(p, menu.getByRole("menuitem", { name: "Eliminar" })), n: 2, esquina: "derecha" }], { atenuar: true });
    await guardar(p, "eliminar-menu.webp", holgura(unir(cMenu, cPuntos, await caja(p, laFila(p, aBorrar))), 30, vista));
    await desmarcar(p);
    await menu.getByRole("menuitem", { name: "Eliminar" }).click();
    const alerta = p.locator(LA_ALERTA);
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    const cAlerta = await caja(p, alerta);
    const cancelar = alerta.getByRole("button", { name: "Cancelar" });
    await marcar(p, [
        { c: await caja(p, cancelar), texto: "No cambia nada", lado: "abajo" },
        { c: await caja(p, alerta.getByRole("button", { name: "Eliminar" })), texto: "La borra para siempre", lado: "abajo" },
    ]);
    await guardar(p, "eliminar-confirmar.webp", holgura(unir(cAlerta, { ...cAlerta, y: cAlerta.y + cAlerta.h + 84, h: 1 }), 26, vista));
    await desmarcar(p);
    await cancelar.click();
    await alerta.waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 400);

    // Varias a la vez: tres casillas y el «⋯» de la barra.
    const marcadas = ["horario", "garantia", "seguimiento"];
    for (const t of marcadas) await laParte(p, t, "casilla").locator("button, [role=checkbox]").first().click();
    await espera(p, 500);
    const cCasillas = [];
    for (const t of marcadas) cCasillas.push(await caja(p, laParte(p, t, "casilla")));
    await marcar(p, cCasillas.map((c, i) => ({ c, n: i + 1, esquina: "derecha" })));
    await guardar(p, "masivas-marcar.webp", holgura(await lasPrimeras(p, 12), 20, vista));
    await desmarcar(p);
    await p.locator(LAS_MASIVAS).first().click();
    const menuMasivas = p.locator('[role="menu"]').last();
    await menuMasivas.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cMenuMasivas = await caja(p, menuMasivas);
    await marcar(p, [
        { c: await caja(p, menuMasivas.getByRole("menuitem", { name: /^Eliminar/ })), texto: "Borra las marcadas", lado: "izquierda" },
        { c: await caja(p, menuMasivas.getByRole("menuitem", { name: /Marcar todas|Desmarcar todas/ })), n: 1, numeroEn: { x: cMenuMasivas.x - 20, y: cMenuMasivas.y + cMenuMasivas.h / 2 } },
    ]);
    await guardar(p, "masivas-menu.webp", holgura(unir(cMenuMasivas, await caja(p, LAS_MASIVAS), { ...cMenuMasivas, x: cMenuMasivas.x - 420 }), 26, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    // 8. Usarlas en un chat.
    await abrirElChat(p);
    const escribir = p.locator('textarea[aria-label="Escribe tu mensaje"]');
    const zonaDelChat = async () => {
        const c = await caja(p, escribir);
        return holgura({ x: c.x - 40, y: c.y - 260, w: c.w + 120, h: c.h + 300 }, 0, vista);
    };
    await escribir.click();
    await escribir.pressSequentially("/env", { delay: 60 });
    const sugerencias = p.locator('[data-zona="sugerencias-de-respuestas"]');
    await sugerencias.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await marcar(p, [
        { c: await caja(p, sugerencias), texto: "Las que coinciden con el atajo", lado: "arriba" },
        { c: await caja(p, escribir), n: 1 },
    ]);
    await guardar(p, "chat-barra.webp", await zonaDelChat());
    await desmarcar(p);
    await sugerencias.locator("button", { hasText: "/envio" }).first().dispatchEvent("mousedown");
    await espera(p, 800);
    await marcar(p, [{ c: await caja(p, escribir), texto: "El mensaje, listo para enviar", lado: "arriba" }]);
    await guardar(p, "chat-listo.webp", await zonaDelChat());
    await desmarcar(p);
    await escribir.fill("");
    await espera(p, 300);
    const rayo = p.locator('button[aria-label="Enviar workflow o respuesta rápida"]').filter({ visible: true }).first();
    await rayo.click();
    const panel = p.locator('[data-radix-popper-content-wrapper]').filter({ hasText: "Atajos" }).last();
    await panel.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 700);
    const cRayo = await caja(p, rayo);
    const cPanel = await caja(p, panel);
    await marcar(p, [{ c: cRayo, n: 1 }, { c: cPanel, n: 2, esquina: "derecha" }], { atenuar: true });
    await guardar(p, "chat-atajos.webp", holgura(unir(cRayo, cPanel), 40, vista));
    await desmarcar(p);
    const deFlujo = panel.locator('[cmdk-item]', { hasText: "Medios de pago" }).first();
    await deFlujo.scrollIntoViewIfNeeded();
    await espera(p, 400);
    await marcar(p, [{ c: await caja(p, deFlujo), texto: "Ejecuta su flujo", lado: "derecha" }], { atenuar: true });
    await guardar(p, "chat-atajos-flujo.webp", holgura(unir(cRayo, cPanel, { ...cPanel, w: cPanel.w + 240 }), 40, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    await abrirLaLista(p);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Automatizaciones", texto: "Respuestas Rápidas está en Automatizaciones" });
}

/**
 * Arrastra con el RATÓN, como una persona: dnd-kit escucha el puntero y no
 * arranca hasta que se mueve unos píxeles, así que se baja, se mueve en pasos
 * cortos y se suelta sobre la fila de destino.
 */
async function arrastrar(p, asa, destino, { enVideo = false } = {}) {
    const a = await asa.boundingBox();
    const d = await destino.boundingBox();
    if (!a || !d) throw new Error("[guia] no se ve lo que hay que arrastrar");
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: enVideo ? 18 : 4 });
    await p.mouse.down();
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 8, { steps: 4 });
    await p.mouse.move(a.x + a.width / 2, d.y + d.height / 3, { steps: enVideo ? 30 : 12 });
    await espera(p, enVideo ? 350 : 250);
    await p.mouse.up();
}

/**
 * Trae una fila a la vista con la RUEDA, como una persona. `mover` y `pulsar`
 * del vídeo no desplazan nada —el ratón se lleva a la caja de la fila—, así que
 * una fila por debajo del borde de la ventana no se puede pulsar: el ratón se
 * mueve fuera de la pantalla y el clic no cae en ninguna parte. A 1280×800,
 * con la respuesta recién creada arriba, «comprobante» queda debajo del borde.
 */
async function aLaVista(p, fila, margen = 60) {
    const alto = p.viewportSize()?.height ?? 800;
    for (let i = 0; i < 12; i += 1) {
        const b = await fila.boundingBox();
        if (!b) throw new Error(`[guia] no está la fila que el vídeo tenía que traer: ${fila}`);
        const sobra = b.y + b.height + margen - alto;
        if (sobra <= 0) return;
        await p.mouse.wheel(0, Math.min(sobra, 160));
        await espera(p, 120);
    }
    throw new Error(`[guia] la fila no llega a la vista con la rueda: ${fila}`);
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/** Entre una frase y la siguiente, lo que respira una persona hablando (el de Leads). */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

async function video(navegador, estado) {
    const dir = path.join(TMP, "video");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    // Las frases se sintetizan ANTES de grabar: así se sabe cuánto dura cada una.
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
    // La narración enlaza las frases: lo de detrás de `decir` ocurre MIENTRAS
    // suena, y `alDecir` pulsa en la palabra que lo nombra.
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirLaLista(p);
    await p.mouse.move(640, 400, { steps: 8 });
    // Lo grabado hasta aquí es la página cargando: el vídeo empieza justo
    // antes de la primera palabra.
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("los mensajes que escribes", 600);
    await mover(p, laTarjeta(p, "precios"));
    await alDecir("desde cualquier chat", 300);
    await mover(p, laTarjeta(p, "envio"));

    // El menú: se abre con las dos flechas, se señala Automatizaciones y se
    // vuelve a recoger al empezar la frase de la barra de arriba.
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

    // Crear: la ventana, el tipo, el atajo, la categoría y el mensaje.
    const ventana = p.locator(EL_DIALOGO).last();
    await decir("crear");
    await pulsar(p, EL_NUEVO(p));
    await ventana.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("eliges Texto simple", 250);
    await mover(p, elTipo(p, "Texto simple"));
    await alDecir("le pones un atajo corto");
    await pulsar(p, ventana.locator("#name"));
    await ventana.locator("#name").pressSequentially("cotizacion", { delay: 45 });
    await alDecir("la categoría");
    await pulsar(p, ventana.locator("#category"));
    const categorias = p.locator(LA_LISTA_ABIERTA).last();
    await categorias.waitFor({ state: "visible", timeout: 10000 });
    await pulsar(p, categorias.getByRole("option", { name: "Ventas", exact: true }));
    await alDecir("y el mensaje", 300);
    await pulsar(p, ventana.locator("#phrase"));
    await ventana.locator("#phrase").pressSequentially("Te preparo la cotización ahora mismo.", { delay: 22 });
    await alDecir("y al crearla");
    await pulsar(p, ventana.getByRole("button", { name: "Crear", exact: true }));
    await laFila(p, "/cotizacion").waitFor({ state: "visible", timeout: 30000 });
    await alDecir("sale la primera", 300);
    await mover(p, laTarjeta(p, "/cotizacion"));

    // Una de flujo: en vez del mensaje, el flujo que ejecuta.
    const pago = "Medios de pago";
    await decir("flujo");
    await alDecir("ejecuta un flujo");
    await mover(p, laFila(p, pago).locator('[data-zona="flujo"]'));
    await alDecir("como esta de Medios de pago", 300);
    await mover(p, laFila(p, pago).locator('[title="Ejecuta un flujo"]'));

    // Editar: el mensaje se pulsa, se corrige y Enter guarda.
    const aEditar = "horario";
    const cuadro = laFila(p, aEditar).locator('textarea[aria-label="Mensaje"]');
    await decir("editar");
    await alDecir("pulsas el mensaje");
    await pulsar(p, laParte(p, aEditar, "mensaje").locator("h3"));
    await cuadro.waitFor({ state: "visible", timeout: 10000 });
    await p.keyboard.press("End");
    await alDecir("lo corriges", 200);
    await cuadro.pressSequentially(" ¡Te esperamos!", { delay: 45 });
    await alDecir("con Enter", 200);
    await p.keyboard.press("Enter");

    // Filtrar: Ejecutan flujo, y Todas lo quita.
    await decir("filtrar");
    await alDecir("con Ejecutan flujo");
    await pulsar(p, laPastilla(p, "Ejecutan flujo"));
    await alDecir("y con Todas");
    await pulsar(p, laPastilla(p, "Todas"));

    // Buscar: sin tildes.
    const buscador = p.locator(EL_BUSCADOR);
    await decir("buscar");
    await pulsar(p, buscador);
    await buscador.pressSequentially("envio", { delay: 110 });
    await alDecir("aunque no escribas", 250);
    await mover(p, lasFilas(p).first());

    // Ordenar: se vacía el buscador y se arrastra una por el asa.
    await decir("ordenar");
    await buscador.fill("");
    await lasFilas(p).nth(4).waitFor({ state: "visible", timeout: 10000 });
    await alDecir("las arrastras por el asa");
    await arrastrar(p, lasFilas(p).nth(5).locator('[data-zona="asa"]'), lasFilas(p).nth(1), { enVideo: true });
    await alDecir("se guarda solo", 200);
    await mover(p, lasFilas(p).nth(1));

    // Eliminar: los tres puntos, la ventana, y se CANCELA.
    const puntos = laParte(p, "comprobante", "mas-acciones");
    const menu = p.locator('[role="menu"]').last();
    const alerta = p.locator(LA_ALERTA);
    await decir("eliminar");
    await aLaVista(p, laFila(p, "comprobante"));
    await alDecir("desde sus tres puntos");
    await pulsar(p, puntos);
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await pulsar(p, menu.getByRole("menuitem", { name: "Eliminar" }));
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("antes de borrarla", 300);
    await pulsar(p, alerta.getByRole("button", { name: "Cancelar" }));

    // Chats: la pestaña de arriba, la conversación, «/env» y la sugerencia.
    const escribir = p.locator('textarea[aria-label="Escribe tu mensaje"]');
    await decir("chat");
    await alerta.waitFor({ state: "hidden", timeout: 10000 });
    await pulsar(p, p.locator('[data-bandeja="chats"]').first());
    const fila = p.locator(`[data-chat-id="${JID}"] button`, { hasText: CLIENTA }).first();
    await fila.waitFor({ state: "visible", timeout: 60000 });
    await esconderLosBotonesDelBorde(p);
    await alDecir("abres la conversación", 300);
    await pulsar(p, fila);
    await escribir.waitFor({ state: "visible", timeout: 30000 });
    await alDecir("tecleas la barra");
    await pulsar(p, escribir);
    await escribir.pressSequentially("/env", { delay: 130 });
    const sugerencia = p.locator('[data-zona="sugerencias-de-respuestas"] button', { hasText: "/envio" }).first();
    await sugerencia.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("el mensaje queda listo", 250);
    await mover(p, sugerencia);
    await sugerencia.dispatchEvent("mousedown");

    // El rayo: el panel de Atajos, con las de flujo.
    const rayo = p.locator('button[aria-label="Enviar workflow o respuesta rápida"]').filter({ visible: true }).first();
    const panel = p.locator("[data-radix-popper-content-wrapper]").filter({ hasText: "Atajos" }).last();
    await decir("cierre");
    await pulsar(p, rayo);
    await panel.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("también las que ejecutan un flujo", 250);
    await mover(p, panel.locator("[cmdk-item]", { hasText: "Medios de pago" }).first());
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
    // Qué voz lleva el vídeo publicado: el banco lo compara con el guion de hoy.
    escribirLaVozDelVideo("respuestas-rapidas", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
        // Las capturas crean y reordenan respuestas: el vídeo sale del mismo
        // punto de partida que ellas.
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-respuestas-rapidas.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

// Las que la guía enseña tienen que estar TODAS (con una parte, lo demás se conserva del disco).
comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/respuestas-rapidas`);
