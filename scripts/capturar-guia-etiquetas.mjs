/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Etiquetas, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-etiquetas.mjs` y la IA de ejemplo de
 * `fingido-guia-etiquetas.mjs`).
 *
 * La MISMA receta que la guía de Leads (`capturar-guia-leads.mjs`) y con las
 * MISMAS piezas del taller (`taller-de-la-guia.mjs`): cada captura es «abre
 * esto, pulsa aquello, resalta este elemento», y las marcas se localizan por
 * lo que la pantalla ya expone —los `data-zona` de la barra, del tablero y de
 * cada tarjeta, los `aria-label`—, no por coordenadas escritas a mano.
 *
 * Las capturas CAMBIAN los datos (mueven tarjetas, califican, crean, editan,
 * ordenan y eliminan una etiqueta), así que antes del vídeo se vuelve a
 * sembrar: el vídeo sale del mismo punto de partida. El vídeo no borra nada:
 * la ventana de eliminar se CANCELA.
 *
 * Qué captura hace falta lo dice `lib/guia-etiquetas.ts`: el script se niega a
 * terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-etiquetas.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-etiquetas.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "etiquetas");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-etiquetas";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
// Solo el vídeo (p. ej. al cambiar la narración): las imágenes se conservan del disco.
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-etiquetas.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-etiquetas.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Abrir                                                               */
/* ------------------------------------------------------------------ */

const EL_TABLERO = '[data-zona="tablero"]';
const LA_LISTA = '[data-zona="lista-de-etiquetas"]';

async function abrirElTablero(p) {
    await p.goto(`${BASE}/tags`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${EL_TABLERO} [data-tarjeta-del-tablero]`, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    // Los botones del borde tapan la última columna del tablero.
    await esconderLosBotonesDelBorde(p);
}

const laVista = (p, nombre) => p.locator('[data-zona="vista"] button', { hasText: nombre }).first();

async function aGestionar(p) {
    await laVista(p, "Gestionar").click();
    await p.waitForSelector(`${LA_LISTA} [data-etiqueta]`, { timeout: 30000 });
    await espera(p, 1000);
}

async function aKanban(p) {
    await laVista(p, "Kanban").click();
    await p.waitForSelector(`${EL_TABLERO} [data-tarjeta-del-tablero]`, { timeout: 60000 });
    await espera(p, 1500);
}

/* ------------------------------------------------------------------ */
/* Medir                                                               */
/* ------------------------------------------------------------------ */

const zona = (p, z) => p.locator(`[data-zona="${z}"]`).first();
const laColumna = (p, etiqueta) => p.locator(`[data-columna-de-etiqueta="${etiqueta}"]`).first();
const laCabecera = (p, etiqueta) => laColumna(p, etiqueta).locator('[data-zona="cabecera-de-columna"]');
const laTarjeta = (p, nombre) => p.locator(`${EL_TABLERO} [data-tarjeta-del-tablero="${nombre}"]`).first();
const laParteDeLaTarjeta = (p, nombre, z) => laTarjeta(p, nombre).locator(`[data-zona="${z}"]`).first();
const laCasilla = (p, nombre) => laTarjeta(p, nombre).getByRole("checkbox").first();
const elRango = (p, clave) => p.locator(`[data-zona="filtro-de-puntaje"] [data-rango="${clave}"]`).first();
const LAS_MASIVAS = 'button[aria-label="Acciones masivas"]';
const LA_SELECCION = '[data-zona="seleccion"]';
const EL_NUEVO = (p) => p.locator('[data-barra-de-acciones] [data-zona="crear"] button').first();
const LA_FILA_DE_CREAR = '[data-zona="crear-etiqueta"]';
const laEtiqueta = (p, nombre) => p.locator(`${LA_LISTA} [data-etiqueta="${nombre}"]`).first();
const EL_BUSCADOR_DE_ETIQUETAS = 'input[aria-label="Buscar etiqueta"]';
const LA_ALERTA = '[role="alertdialog"]';

/** La barra de trabajo de arriba: las vistas, las más usadas, el filtro y el «⋯». */
async function laBarra(p) {
    return unir(await caja(p, zona(p, "vista")), await caja(p, LAS_MASIVAS));
}

/** Lo que se ve del tablero: de la primera columna hasta el borde de la pantalla. */
async function loQueSeVeDelTablero(p) {
    const t = await caja(p, EL_TABLERO);
    const vista = p.viewportSize();
    return { x: t.x, y: t.y, w: Math.min(t.w, vista.width - t.x - 8), h: Math.min(t.h, vista.height - t.y - 8) };
}

/** Las cabeceras de las primeras `n` columnas, en una caja. */
async function lasCabeceras(p, n) {
    const cabeceras = p.locator('[data-zona="cabecera-de-columna"]');
    const cajas = [];
    for (let i = 0; i < n; i += 1) cajas.push(await caja(p, cabeceras.nth(i)));
    return unir(...cajas);
}

/**
 * Arrastra una tarjeta con el RATÓN, como una persona: dnd-kit no arranca hasta
 * que el puntero se mueve unos píxeles. Se agarra por el borde de abajo de la
 * tarjeta —ni el nombre (un enlace) ni sus botones— y se suelta en medio de
 * las tarjetas de la columna de destino.
 */
async function arrastrarLaTarjeta(p, nombre, aColumna, { enVideo = false, soltar = true } = {}) {
    const t = await laTarjeta(p, nombre).boundingBox();
    const d = await laColumna(p, aColumna).locator('[data-zona="tarjetas"]').boundingBox();
    if (!t || !d) throw new Error(`[guia] no se ve lo que hay que arrastrar: ${nombre} → ${aColumna}`);
    const x0 = t.x + t.width - 18;
    const y0 = t.y + t.height - 8;
    await p.mouse.move(x0, y0, { steps: enVideo ? 18 : 4 });
    await p.mouse.down();
    await p.mouse.move(x0 + 10, y0 - 6, { steps: 4 });
    await p.mouse.move(d.x + d.width / 2, d.y + Math.min(120, d.height / 2), { steps: enVideo ? 34 : 14 });
    await espera(p, enVideo ? 400 : 300);
    if (soltar) await p.mouse.up();
}

/** Arrastra una etiqueta de la lista de Gestionar por su asa hasta el sitio de otra. */
async function arrastrarLaEtiqueta(p, nombre, sobre, { enVideo = false } = {}) {
    const a = await laEtiqueta(p, nombre).locator('[data-zona="asa"]').boundingBox();
    const d = await laEtiqueta(p, sobre).boundingBox();
    if (!a || !d) throw new Error(`[guia] no se ve la etiqueta que hay que ordenar: ${nombre}`);
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: enVideo ? 18 : 4 });
    await p.mouse.down();
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 8, { steps: 4 });
    await p.mouse.move(a.x + a.width / 2, d.y + d.height / 3, { steps: enVideo ? 30 : 12 });
    await espera(p, enVideo ? 350 : 250);
    await p.mouse.up();
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

/**
 * Una miniatura por sección, TODAS con la misma receta del taller: la zona que
 * la sección explica, nítida y en su recuadro; el resto, bajo el velo. Se
 * toman antes de las capturas, con los datos recién sembrados.
 */
async function miniaturas(p) {
    const focos = {};
    const mini = async (slug, zonaDeLaMini, despues) => {
        Object.assign(focos, await tomarUnaMiniatura(p, slug, await zonaDeLaMini(), { salida: SALIDA, tomadas }));
        await cerrarLoAbierto(p);
        if (despues) await despues();
    };

    await mini("vista-general", () => laBarra(p));
    await mini("el-tablero", () => lasCabeceras(p, 3));
    await mini("arrastrar", async () => unir(await caja(p, laTarjeta(p, "Mateo Gómez")), await caja(p, laCabecera(p, "INTERESADO"))));
    await mini("calificar-con-ia", () => caja(p, laTarjeta(p, "Camila Rojas")));
    await mini("filtrar-por-puntaje", () => caja(p, zona(p, "filtro-de-puntaje")));
    await mini(
        "seleccion-multiple",
        async () => {
            await laCasilla(p, "Mateo Gómez").click();
            await laCasilla(p, "Nicolás Moreno").click();
            await p.locator(LA_SELECCION).waitFor({ state: "visible", timeout: 10000 });
            await espera(p, 500);
            return caja(p, LA_SELECCION);
        },
        async () => {
            await p.locator(`${LA_SELECCION} button[title="Quitar selección"]`).click();
            await espera(p, 400);
        },
    );

    await aGestionar(p);
    await mini(
        "crear-etiqueta",
        async () => {
            await EL_NUEVO(p).click();
            await p.locator(LA_FILA_DE_CREAR).waitFor({ state: "visible", timeout: 10000 });
            await p.locator(`${LA_FILA_DE_CREAR} input[aria-label="Nombre de la etiqueta"]`).fill("VIP");
            await espera(p, 400);
            return caja(p, LA_FILA_DE_CREAR);
        },
        async () => {
            await p.locator(LA_FILA_DE_CREAR).getByRole("button", { name: "Cancelar" }).click();
            await espera(p, 400);
        },
    );
    await mini("editar-etiqueta", () => caja(p, laEtiqueta(p, "COTIZADO").getByRole("button", { name: "Editar COTIZADO" })));
    await mini("ordenar-etiquetas", async () => {
        const asas = [];
        for (const n of ["NUEVO", "INTERESADO", "COTIZADO", "CLIENTE"]) asas.push(await caja(p, laEtiqueta(p, n).locator('[data-zona="asa"]')));
        return unir(...asas);
    });
    await mini("eliminar-etiqueta", () => caja(p, laEtiqueta(p, "SOPORTE").getByRole("button", { name: "Eliminar SOPORTE" })));
    await aKanban(p);

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
    const cTablero = await loQueSeVeDelTablero(p);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: barra, n: 3 },
        { c: dentro(cTablero, 4), n: 4 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");

    // La barra de trabajo: sus cuatro partes, en el orden de `PARTES_DE_LA_BARRA_DE_TRABAJO`.
    await marcar(p, [
        { c: await caja(p, zona(p, "vista")), n: 1 },
        { c: await caja(p, zona(p, "mas-usadas").locator("> *").first()), n: 2 },
        { c: await caja(p, zona(p, "filtro-de-puntaje")), n: 3 },
        { c: await caja(p, LAS_MASIVAS), n: 4 },
    ]);
    await guardar(p, "barra.webp", holgura(barra, 34, vista));
    await desmarcar(p);

    // La barra del tablero: sus cuatro partes.
    const barraDelTablero = await caja(p, zona(p, "barra-del-tablero"));
    await marcar(p, [
        { c: await caja(p, zona(p, "buscador")), n: 1 },
        { c: await caja(p, zona(p, "contador")), n: 2 },
        { c: await caja(p, zona(p, "actualizar")), n: 3 },
        { c: await caja(p, zona(p, "puntuar-todos")), n: 4 },
    ]);
    await guardar(p, "barra-del-tablero.webp", holgura(barraDelTablero, 34, vista));
    await desmarcar(p);

    // Las acciones masivas: el «⋯» abierto, y se cierra sin tocar nada.
    await p.locator(LAS_MASIVAS).click();
    const menuMasivas = p.locator('[role="menu"]').last();
    await menuMasivas.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cMenuMasivas = await caja(p, menuMasivas);
    await marcar(p, [{ c: await caja(p, LAS_MASIVAS), n: 1 }, { c: cMenuMasivas, n: 2, esquina: "izquierda" }], { atenuar: true });
    await guardar(p, "acciones-masivas.webp", holgura(unir(cMenuMasivas, await caja(p, LAS_MASIVAS), { ...cMenuMasivas, x: cMenuMasivas.x - 120 }), 26, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    // 2. El tablero.
    await marcar(p, [{ c: await caja(p, laColumna(p, "Sin etiqueta")), texto: "Los que no tienen ninguna", lado: "abajo" }], { atenuar: true });
    await guardar(p, "columnas.webp");
    await desmarcar(p);
    const cabecera = laCabecera(p, "INTERESADO");
    const cCab = await caja(p, cabecera);
    const partesDeLaCabecera = [];
    for (const z of ["cuantos", "seleccionar-columna", "automatizaciones"]) partesDeLaCabecera.push(await caja(p, cabecera.locator(`[data-zona="${z}"]`)));
    await marcar(p, partesDeLaCabecera.map((c, i) => ({ c, n: i + 1, numeroEn: { x: c.x + c.w / 2, y: cCab.y + cCab.h + 18 } })));
    await guardar(p, "cabecera-de-columna.webp", holgura({ ...cCab, h: cCab.h + 40 }, 30, vista));
    await desmarcar(p);

    // Una tarjeta: sus seis partes, en el orden del paso «Una tarjeta».
    const ejemplo = "Camila Rojas";
    const cTarjeta = await caja(p, laTarjeta(p, ejemplo));
    const izquierda = cTarjeta.x - 22;
    const derecha = cTarjeta.x + cTarjeta.w + 22;
    const parte = async (z) => caja(p, laParteDeLaTarjeta(p, ejemplo, z));
    const cCasilla = await caja(p, laCasilla(p, ejemplo));
    const cContacto = await parte("contacto");
    const cPuntaje = await parte("puntaje");
    const cPuntuar = await parte("puntuar");
    const cMotivo = await parte("motivo");
    const cEstado = await parte("estado");
    await marcar(
        p,
        [
            { c: cCasilla, n: 1, numeroEn: { x: izquierda, y: cCasilla.y + cCasilla.h / 2 } },
            { c: cContacto, n: 2, numeroEn: { x: cContacto.x + cContacto.w / 2, y: cTarjeta.y - 18 } },
            { c: cPuntaje, n: 3, numeroEn: { x: cPuntaje.x + cPuntaje.w / 2, y: cTarjeta.y - 18 } },
            { c: cPuntuar, n: 4, numeroEn: { x: derecha, y: cPuntuar.y + cPuntuar.h / 2 } },
            { c: cMotivo, n: 5, numeroEn: { x: derecha, y: cMotivo.y + cMotivo.h / 2 } },
            { c: cEstado, n: 6, numeroEn: { x: izquierda, y: cEstado.y + cEstado.h / 2 } },
        ],
        { atenuar: true },
    );
    await guardar(p, "tarjeta.webp", holgura({ x: cTarjeta.x - 44, y: cTarjeta.y - 40, w: cTarjeta.w + 88, h: cTarjeta.h + 70 }, 10, vista));
    await desmarcar(p);

    // Las automatizaciones de una etiqueta: el panel se abre y se cierra.
    await cabecera.locator('[data-zona="automatizaciones"]').click();
    const panel = p.locator('[role="dialog"]').last();
    await panel.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 1500);
    await marcar(p, [{ c: dentro(await caja(p, panel), 4), texto: "Lo que pasa solo al entrar en INTERESADO", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "automatizaciones.webp");
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await panel.waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 500);

    // 3. Arrastrar: Mateo, de NUEVO a INTERESADO.
    const zonaDeArrastrar = async () => holgura(unir(await caja(p, laColumna(p, "NUEVO")), await caja(p, laColumna(p, "INTERESADO"))), 10, vista);
    const antesDeArrastrar = await zonaDeArrastrar();
    await arrastrarLaTarjeta(p, "Mateo Gómez", "INTERESADO", { soltar: false });
    await marcar(p, [{ c: await caja(p, laColumna(p, "INTERESADO").locator('[data-zona="tarjetas"]')), texto: "Suéltala aquí", lado: "abajo" }]);
    await guardar(p, "arrastrar-agarrar.webp", antesDeArrastrar);
    await desmarcar(p);
    await p.mouse.up();
    await espera(p, 1500);
    await marcar(p, [{ c: await caja(p, laColumna(p, "INTERESADO").locator('[data-tarjeta-del-tablero="Mateo Gómez"]')), texto: "Ya es INTERESADO", lado: "abajo" }], { atenuar: true });
    await guardar(p, "arrastrar-soltar.webp", await zonaDeArrastrar());
    await desmarcar(p);
    // Andrés, de NUEVO a «Sin etiqueta».
    await arrastrarLaTarjeta(p, "Andrés Pérez", "Sin etiqueta");
    await espera(p, 1500);
    await marcar(p, [{ c: await caja(p, laColumna(p, "Sin etiqueta").locator('[data-tarjeta-del-tablero="Andrés Pérez"]')), texto: "Ya no tiene NUEVO", lado: "abajo" }], { atenuar: true });
    await guardar(p, "arrastrar-sin-etiqueta.webp", holgura(unir(await caja(p, laColumna(p, "Sin etiqueta")), await caja(p, laColumna(p, "NUEVO"))), 10, vista));
    await desmarcar(p);

    // 4. Calificar con IA: Paula, que todavía no tiene puntaje.
    const aCalificar = "Paula Ríos";
    const zonaDeLaTarjeta = async (n) => {
        const c = await caja(p, laTarjeta(p, n));
        return holgura({ x: c.x - 30, y: c.y - 30, w: c.w + 60, h: c.h + 90 }, 0, vista);
    };
    await marcar(p, [{ c: await caja(p, laParteDeLaTarjeta(p, aCalificar, "puntuar")), texto: "Calificar con IA", lado: "abajo" }]);
    await guardar(p, "calificar-uno.webp", await zonaDeLaTarjeta(aCalificar));
    await desmarcar(p);
    await laParteDeLaTarjeta(p, aCalificar, "puntuar").click();
    await laParteDeLaTarjeta(p, aCalificar, "puntaje").waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1000);
    await quitarAvisos(p);
    await marcar(p, [
        { c: await caja(p, laParteDeLaTarjeta(p, aCalificar, "puntaje")), n: 1 },
        { c: await caja(p, laParteDeLaTarjeta(p, aCalificar, "motivo")), n: 2, esquina: "derecha" },
    ], { atenuar: true });
    await guardar(p, "calificar-resultado.webp", await zonaDeLaTarjeta(aCalificar));
    await desmarcar(p);
    await zona(p, "puntuar-todos").click();
    await p.locator("[data-sonner-toast]", { hasText: /calificad/ }).first().waitFor({ state: "visible", timeout: 60000 });
    await espera(p, 1200);
    await marcar(p, [
        { c: await caja(p, zona(p, "puntuar-todos")), texto: "Califica a todos los que faltan", lado: "abajo" },
        { c: await caja(p, p.locator("[data-sonner-toast]").last()) },
    ]);
    await guardar(p, "calificar-todos.webp");
    await desmarcar(p);
    await quitarAvisos(p);

    // 5. Filtrar por puntaje.
    const filtro = zona(p, "filtro-de-puntaje");
    const rangos = ["bajo", "medio", "moderado", "alto", "listo"];
    await marcar(p, await Promise.all(rangos.map(async (r, i) => ({ c: await caja(p, elRango(p, r)), n: i + 1 }))));
    await guardar(p, "filtro-rangos.webp", holgura(await caja(p, filtro), 40, vista));
    await desmarcar(p);
    await elRango(p, "listo").click();
    await espera(p, 1500);
    await marcar(p, [
        { c: await caja(p, elRango(p, "listo")), texto: "Filtro puesto", lado: "abajo" },
        { c: await loQueSeVeDelTablero(p) },
    ]);
    await guardar(p, "filtro-puesto.webp");
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, elRango(p, "listo")), texto: "Otro clic y vuelven todos", lado: "abajo" }]);
    await guardar(p, "filtro-quitar.webp", zonaDeLaBarra);
    await desmarcar(p);
    await elRango(p, "listo").click();
    await espera(p, 1500);

    // 6. Varios a la vez: tres casillas, la barra, etiquetar y eliminar (se CANCELA).
    const marcados = ["Nicolás Moreno", "Daniela Torres", "Felipe Vargas"];
    for (const n of marcados) await laCasilla(p, n).click();
    await p.locator(LA_SELECCION).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    const cCasillas = [];
    for (const n of marcados) cCasillas.push(await caja(p, laCasilla(p, n)));
    await marcar(p, cCasillas.map((c, i) => ({ c, n: i + 1, esquina: "derecha" })), { atenuar: false });
    await guardar(p, "seleccion-casillas.webp");
    await desmarcar(p);
    const sel = p.locator(LA_SELECCION);
    const cSel = await caja(p, sel);
    const enSel = (selector) => caja(p, sel.locator(selector).first());
    const debajo = cSel.y + cSel.h + 18;
    const mandos = [
        await enSel('button[title="Quitar selección"]'),
        await enSel("span[title]"),
        await enSel('button[title^="Seleccionar los"]'),
        await enSel('button[title="Agregar etiqueta"]'),
        await enSel('button[aria-label="Eliminar contactos"]'),
    ];
    await marcar(p, mandos.map((c, i) => ({ c, n: i + 1, numeroEn: { x: c.x + c.w / 2, y: debajo } })));
    await guardar(p, "seleccion-barra.webp", holgura({ ...cSel, h: cSel.h + 40 }, 30, vista));
    await desmarcar(p);
    await sel.locator('button[title="Agregar etiqueta"]').click();
    const menuEtiquetas = p.locator('[role="menu"]').last();
    await menuEtiquetas.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cMenuEtiquetas = await caja(p, menuEtiquetas);
    await marcar(p, [{ c: await enSel('button[title="Agregar etiqueta"]'), n: 1 }, { c: cMenuEtiquetas, n: 2, esquina: "derecha" }], { atenuar: true });
    await guardar(p, "seleccion-etiquetar.webp", holgura(unir(cMenuEtiquetas, cSel), 30, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);
    await sel.locator('button[aria-label="Eliminar contactos"]').click();
    const alertaContactos = p.locator(LA_ALERTA);
    await alertaContactos.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    const cAlertaContactos = await caja(p, alertaContactos);
    const cancelarContactos = alertaContactos.getByRole("button", { name: "Cancelar" });
    await marcar(p, [
        { c: await caja(p, cancelarContactos), texto: "No cambia nada", lado: "abajo" },
        { c: await caja(p, alertaContactos.getByRole("button", { name: /^Eliminar/ })), texto: "Los borra para siempre", lado: "abajo" },
    ]);
    await guardar(p, "seleccion-eliminar.webp", holgura(unir(cAlertaContactos, { ...cAlertaContactos, y: cAlertaContactos.y + cAlertaContactos.h + 84, h: 1 }), 26, vista));
    await desmarcar(p);
    await cancelarContactos.click();
    await alertaContactos.waitFor({ state: "hidden", timeout: 10000 });
    await sel.locator('button[title="Quitar selección"]').click();
    await espera(p, 500);

    // 7. Crear una etiqueta: en Gestionar.
    await aGestionar(p);
    const laListaEntera = async () => holgura(unir(await caja(p, '[data-barra-de-acciones] [data-zona="crear"]'), await caja(p, LA_LISTA)), 24, vista);
    await marcar(p, [{ c: await caja(p, laVista(p, "Gestionar")), texto: "Gestionar", lado: "abajo" }, { c: await caja(p, LA_LISTA) }]);
    await guardar(p, "gestionar.webp");
    await desmarcar(p);
    await EL_NUEVO(p).click();
    const fila = p.locator(LA_FILA_DE_CREAR);
    await fila.waitFor({ state: "visible", timeout: 10000 });
    await fila.locator('input[aria-label="Nombre de la etiqueta"]').pressSequentially("vip", { delay: 40 });
    await espera(p, 400);
    await marcar(p, [
        { c: await caja(p, EL_NUEVO(p)), n: 1 },
        { c: await caja(p, fila.locator('input[aria-label="Nombre de la etiqueta"]')), texto: "Sale en mayúsculas", lado: "abajo" },
    ]);
    await guardar(p, "crear-formulario.webp", holgura(unir(await caja(p, fila), await caja(p, EL_NUEVO(p))), 40, vista));
    await desmarcar(p);
    await fila.locator('button[aria-label="Color #F59E0B"]').click();
    await espera(p, 300);
    const cColores = unir(...(await Promise.all([0, 1, 2, 3, 4, 5].map((i) => caja(p, fila.locator('[data-zona="colores"] button').nth(i))))));
    await marcar(p, [
        { c: cColores, n: 1 },
        { c: await caja(p, fila.locator('input[aria-label="Color personalizado"]')), n: 2 },
        { c: await caja(p, fila.getByRole("button", { name: "Guardar" })), texto: "Guardar", lado: "abajo" },
    ]);
    await guardar(p, "crear-colores.webp", holgura(await caja(p, fila), 50, vista));
    await desmarcar(p);
    await fila.getByRole("button", { name: "Guardar" }).click();
    await laEtiqueta(p, "VIP").waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1200);
    await quitarAvisos(p);
    await marcar(p, [{ c: await caja(p, laEtiqueta(p, "VIP")), texto: "La nueva, al final", lado: "abajo" }], { atenuar: true });
    await guardar(p, "crear-resultado.webp", await laListaEntera());
    await desmarcar(p);

    // 8. Editar: SOPORTE pasa a POSVENTA.
    await marcar(p, [{ c: await caja(p, laEtiqueta(p, "SOPORTE").getByRole("button", { name: "Editar SOPORTE" })), texto: "Editar", lado: "abajo" }], { atenuar: true });
    await guardar(p, "editar-boton.webp", await laListaEntera());
    await desmarcar(p);
    await laEtiqueta(p, "SOPORTE").getByRole("button", { name: "Editar SOPORTE" }).click();
    const editar = p.locator('[data-zona="editar-etiqueta"]');
    await editar.waitFor({ state: "visible", timeout: 10000 });
    const nombre = editar.locator('input[aria-label="Nombre de la etiqueta"]');
    await nombre.fill("");
    await nombre.pressSequentially("posventa", { delay: 40 });
    await editar.locator('button[aria-label="Color #A855F7"]').click();
    await espera(p, 400);
    await marcar(p, [
        { c: await caja(p, nombre), n: 1 },
        { c: await caja(p, editar.locator('[data-zona="colores"]')), n: 2 },
        { c: await caja(p, editar.getByRole("button", { name: "Guardar" })), texto: "Guardar", lado: "abajo" },
    ]);
    await guardar(p, "editar-formulario.webp", holgura(await caja(p, editar), 50, vista));
    await desmarcar(p);
    await editar.getByRole("button", { name: "Guardar" }).click();
    await laEtiqueta(p, "POSVENTA").waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1200);
    await quitarAvisos(p);
    await marcar(p, [{ c: await caja(p, laEtiqueta(p, "POSVENTA")), texto: "Con su nombre nuevo", lado: "abajo" }], { atenuar: true });
    await guardar(p, "editar-resultado.webp", await laListaEntera());
    await desmarcar(p);

    // 9. Ordenar: POSVENTA sube a la segunda.
    await marcar(p, [{ c: await caja(p, laEtiqueta(p, "POSVENTA").locator('[data-zona="asa"]')), texto: "Agarra por aquí", lado: "derecha" }]);
    await guardar(p, "ordenar-asa.webp", await laListaEntera());
    await desmarcar(p);
    await arrastrarLaEtiqueta(p, "POSVENTA", "INTERESADO");
    await p.locator("[data-sonner-toast]", { hasText: "Orden actualizado" }).first().waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 1200);
    await marcar(p, [
        { c: await caja(p, laEtiqueta(p, "POSVENTA")), texto: "En su sitio nuevo", lado: "abajo" },
        { c: await caja(p, p.locator("[data-sonner-toast]").last()) },
    ], { atenuar: true });
    await guardar(p, "ordenar-resultado.webp");
    await desmarcar(p);
    await quitarAvisos(p);
    await aKanban(p);
    await marcar(p, [{ c: await lasCabeceras(p, 4), texto: "Las columnas, en el mismo orden", lado: "abajo" }], { atenuar: true });
    await guardar(p, "ordenar-tablero.webp", holgura(await lasCabeceras(p, 4), 60, vista));
    await desmarcar(p);
    await aGestionar(p);
    await p.fill(EL_BUSCADOR_DE_ETIQUETAS, "co");
    await espera(p, 1000);
    await marcar(p, [
        { c: await caja(p, EL_BUSCADOR_DE_ETIQUETAS) },
        { c: await caja(p, zona(p, "no-se-ordena")), texto: "Quita la búsqueda para ordenar", lado: "abajo" },
    ]);
    await guardar(p, "ordenar-con-busqueda.webp", await laListaEntera());
    await desmarcar(p);
    await p.fill(EL_BUSCADOR_DE_ETIQUETAS, "");
    await espera(p, 800);

    // 10. Eliminar: VIP, la que se creó en la sección de crear.
    await marcar(p, [{ c: await caja(p, laEtiqueta(p, "VIP").getByRole("button", { name: "Eliminar VIP" })), texto: "La papelera", lado: "abajo" }], { atenuar: true });
    await guardar(p, "eliminar-boton.webp", await laListaEntera());
    await desmarcar(p);
    await laEtiqueta(p, "VIP").getByRole("button", { name: "Eliminar VIP" }).click();
    const alerta = p.locator(LA_ALERTA);
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    const cAlerta = await caja(p, alerta);
    await marcar(p, [
        { c: await caja(p, alerta.getByRole("button", { name: "Cancelar" })), texto: "No cambia nada", lado: "abajo" },
        { c: await caja(p, alerta.getByRole("button", { name: "Eliminar" })), texto: "La borra", lado: "abajo" },
    ]);
    await guardar(p, "eliminar-confirmar.webp", holgura(unir(cAlerta, { ...cAlerta, y: cAlerta.y + cAlerta.h + 84, h: 1 }), 26, vista));
    await desmarcar(p);
    await alerta.getByRole("button", { name: "Eliminar" }).click();
    await laEtiqueta(p, "VIP").waitFor({ state: "detached", timeout: 30000 });
    await espera(p, 1500);
    await quitarAvisos(p);
    await marcar(p, [{ c: await caja(p, LA_LISTA), texto: "Ya no está", lado: "abajo" }], { atenuar: true });
    await guardar(p, "eliminar-resultado.webp", await laListaEntera());
    await desmarcar(p);

    await abrirElTablero(p);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Contactos", texto: "Etiquetas está en Contactos" });
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
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirElTablero(p);
    await p.mouse.move(640, 400, { steps: 8 });
    // Lo grabado hasta aquí es la página cargando: el vídeo empieza justo
    // antes de la primera palabra.
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("repartidos en un tablero", 300);
    await mover(p, laCabecera(p, "NUEVO"));
    await alDecir("una columna por cada etiqueta", 200);
    await mover(p, laCabecera(p, "COTIZADO"));

    // El menú: se abre con las dos flechas, se señala Contactos y se vuelve a
    // recoger al empezar la frase de la barra de arriba.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const contactos = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Contactos" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Contactos", 600);
    await mover(p, contactos);

    const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // El tablero: la columna «Sin etiqueta», una tarjeta, su puntaje y su estado.
    await decir("tablero");
    await alDecir("Cada columna es una etiqueta");
    await mover(p, laCabecera(p, "INTERESADO"));
    await alDecir("la primera junta", 200);
    await mover(p, laCabecera(p, "Sin etiqueta"));
    await alDecir("cada tarjeta es un contacto", 200);
    await mover(p, laParteDeLaTarjeta(p, "Camila Rojas", "contacto"));
    await alDecir("con su puntaje", 150);
    await mover(p, laParteDeLaTarjeta(p, "Camila Rojas", "puntaje"));
    await alDecir("y su estado", 150);
    await mover(p, laParteDeLaTarjeta(p, "Camila Rojas", "estado"));

    // Arrastrar: Nicolás, de NUEVO a COTIZADO.
    await decir("arrastrar");
    await alDecir("arrastras su tarjeta");
    await arrastrarLaTarjeta(p, "Nicolás Moreno", "COTIZADO", { enVideo: true });
    await alDecir("se guarda al soltarla", 200);
    await mover(p, laColumna(p, "COTIZADO").locator('[data-tarjeta-del-tablero="Nicolás Moreno"]'));

    // Calificar: Sofía, que todavía no tiene puntaje.
    await decir("calificar");
    await alDecir("Con el destello");
    await pulsar(p, laParteDeLaTarjeta(p, "Sofía Herrera", "puntuar"));
    await laParteDeLaTarjeta(p, "Sofía Herrera", "puntaje").waitFor({ state: "visible", timeout: 30000 });
    await alDecir("un puntaje del cero al cien", 200);
    await mover(p, laParteDeLaTarjeta(p, "Sofía Herrera", "puntaje"));
    await alDecir("con el motivo debajo", 150);
    await mover(p, laParteDeLaTarjeta(p, "Sofía Herrera", "motivo"));

    // Filtrar: Listo, y otra vez Listo lo quita.
    await decir("filtrar");
    await alDecir("con Listo");
    await pulsar(p, elRango(p, "listo"));
    await alDecir("pulsándolo otra vez");
    await pulsar(p, elRango(p, "listo"));

    // Varios a la vez: dos casillas, y la etiqueta de la barra (se abre y se cierra).
    await decir("seleccion");
    await alDecir("Si marcas varias");
    await pulsar(p, laCasilla(p, "Mateo Gómez"));
    await pulsar(p, laCasilla(p, "Daniela Torres"));
    const sel = p.locator(LA_SELECCION);
    await sel.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("sale una barra", 150);
    await mover(p, sel);
    await alDecir("ponerles una etiqueta", 200);
    await pulsar(p, sel.locator('button[title="Agregar etiqueta"]'));
    await p.locator('[role="menu"]').last().waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await p.keyboard.press("Escape");
    await pulsar(p, sel.locator('button[title="Quitar selección"]'));

    // Gestionar: crear una etiqueta.
    const fila = p.locator(LA_FILA_DE_CREAR);
    await decir("crear");
    await alDecir("En Gestionar");
    await pulsar(p, laVista(p, "Gestionar"));
    await p.waitForSelector(`${LA_LISTA} [data-etiqueta]`, { timeout: 30000 });
    await alDecir("pulsas Nuevo");
    await pulsar(p, EL_NUEVO(p));
    await fila.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("le pones nombre", 150);
    await pulsar(p, fila.locator('input[aria-label="Nombre de la etiqueta"]'));
    await fila.locator('input[aria-label="Nombre de la etiqueta"]').pressSequentially("vip", { delay: 120 });
    await alDecir("eliges un color", 150);
    await pulsar(p, fila.locator('button[aria-label="Color #F59E0B"]'));
    await alDecir("y la guardas");
    await pulsar(p, fila.getByRole("button", { name: "Guardar" }));
    await laEtiqueta(p, "VIP").waitFor({ state: "visible", timeout: 30000 });
    await mover(p, laEtiqueta(p, "VIP"));

    // Editar: SOPORTE cambia de color y se guarda.
    const editar = p.locator('[data-zona="editar-etiqueta"]');
    await decir("editar");
    await alDecir("Con Editar");
    await pulsar(p, laEtiqueta(p, "SOPORTE").getByRole("button", { name: "Editar SOPORTE" }));
    await editar.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("o el color", 150);
    await pulsar(p, editar.locator('button[aria-label="Color #A855F7"]'));
    await alDecir("la conservan", 100);
    await pulsar(p, editar.getByRole("button", { name: "Guardar" }));

    // Ordenar: VIP sube por su asa.
    await decir("ordenar");
    await laEtiqueta(p, "VIP").waitFor({ state: "visible", timeout: 10000 });
    await alDecir("arrastrándolas por el asa");
    await arrastrarLaEtiqueta(p, "VIP", "INTERESADO", { enVideo: true });
    await alDecir("siguen ese mismo orden", 200);
    await mover(p, laEtiqueta(p, "VIP"));

    // La papelera: la ventana se abre y se CANCELA.
    const alerta = p.locator(LA_ALERTA);
    await decir("cierre");
    await alDecir("la papelera");
    await pulsar(p, laEtiqueta(p, "VIP").getByRole("button", { name: "Eliminar VIP" }));
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("tus contactos no se tocan", 200);
    await pulsar(p, alerta.getByRole("button", { name: "Cancelar" }));
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
    escribirLaVozDelVideo("etiquetas", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
    await abrirElTablero(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        // Las capturas mueven, califican y cambian etiquetas: el vídeo sale del
        // mismo punto de partida que ellas.
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-etiquetas.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

// Las que la guía enseña tienen que estar TODAS (con una parte, lo demás se conserva del disco).
comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/etiquetas`);
