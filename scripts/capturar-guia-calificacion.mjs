/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Calificación, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-calificacion.mjs` y la IA de ejemplo de
 * `fingido-guia-calificacion.mjs`).
 *
 * La MISMA receta que la guía de Leads (`capturar-guia-leads.mjs`) y con las
 * MISMAS piezas del taller (`taller-de-la-guia.mjs`): cada captura es «abre
 * esto, pulsa aquello, resalta este elemento», y las marcas se localizan por
 * lo que la pantalla ya expone —los `data-zona` de la barra, del tablero y de
 * cada tarjeta, los `aria-label`—, no por coordenadas escritas a mano.
 *
 * Las capturas CAMBIAN los datos (mueven tarjetas, califican y crean una
 * automatización), así que antes del vídeo se vuelve a sembrar: el vídeo sale
 * del mismo punto de partida. Ni las capturas ni el vídeo borran nada: la
 * ventana de una acción nueva se CANCELA.
 *
 * Qué captura hace falta lo dice `lib/guia-calificacion.ts`: el script se niega a
 * terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-calificacion.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-calificacion.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "calificacion");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-calificacion";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
// Solo el vídeo (p. ej. al cambiar la narración): las imágenes se conservan del disco.
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-calificacion.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-calificacion.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Abrir                                                               */
/* ------------------------------------------------------------------ */

const PANTALLA = "/crm/kanban";
/** Dónde vive la pantalla en el menú (`MODULO_DE_CALIFICACION` de la guía; el banco lo compara). */
const MODULO_DE_CALIFICACION = "Panel";
const EL_TABLERO = '[data-zona="tablero"]';

async function abrirElTablero(p) {
    await p.goto(`${BASE}${PANTALLA}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${EL_TABLERO} [data-tarjeta-del-tablero]`, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    // Los botones del borde tapan la última columna del tablero.
    await esconderLosBotonesDelBorde(p);
    await queNadaSalgaRecortado(p);
}

/** Un nombre que no cabe sale con «…» y la guía enseñaría un contacto que no se sabe quién es. */
async function queNadaSalgaRecortado(p) {
    const recortados = await p.evaluate((sel) => {
        const fuera = [];
        for (const el of document.querySelectorAll(`${sel} [data-tarjeta-del-tablero] .truncate`)) {
            if (el.scrollWidth > el.clientWidth + 1) fuera.push(el.textContent || "");
        }
        return fuera;
    }, EL_TABLERO);
    if (recortados.length) throw new Error(`[guia] sale recortado con «…»: ${recortados.join(" · ")}`);
}

/* ------------------------------------------------------------------ */
/* Medir                                                               */
/* ------------------------------------------------------------------ */

const zona = (p, z) => p.locator(`[data-zona="${z}"]`).first();
const laColumna = (p, id) => p.locator(`[data-columna-de-calificacion="${id}"]`).first();
const laCabecera = (p, id) => laColumna(p, id).locator('[data-zona="cabecera-de-columna"]');
const laTarjeta = (p, nombre) => p.locator(`${EL_TABLERO} [data-tarjeta-del-tablero="${nombre}"]`).first();
const laParteDeLaTarjeta = (p, nombre, z) => laTarjeta(p, nombre).locator(`[data-zona="${z}"]`).first();
const elRango = (p, clave) => p.locator(`[data-zona="filtro-de-puntaje"] [data-rango="${clave}"]`).first();
const EL_BUSCADOR = 'input[aria-label="Buscar contacto"]';
const LAS_PESTANAS = (p) => p.locator(`nav a[href="${PANTALLA}"]`).first().locator("xpath=ancestor::div[contains(@class,'sticky')][1]");
const EL_PANEL = '[role="dialog"]';

/** La barra de trabajo: las pestañas del CRM y el filtro por puntaje. */
async function laBarra(p) {
    return unir(await caja(p, zona(p, "pestanas-del-crm")), await caja(p, zona(p, "filtro-de-puntaje")));
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

/** Dos columnas vecinas, en una caja recortada a la pantalla. */
async function lasDosColumnas(p, a, b) {
    return holgura(unir(await caja(p, laColumna(p, a)), await caja(p, laColumna(p, b))), 10, p.viewportSize());
}

/**
 * Arrastra una tarjeta con el RATÓN, como una persona: dnd-kit no arranca hasta
 * que el puntero se mueve unos píxeles. Se agarra por el borde de abajo de la
 * tarjeta —ni el nombre ni sus botones— y se suelta en medio de las tarjetas
 * de la columna de destino.
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

/** La tarjeta de `nombre` ya en la columna `id`. */
const enLaColumna = (p, id, nombre) => laColumna(p, id).locator(`[data-tarjeta-del-tablero="${nombre}"]`).first();

async function abrirLasAutomatizaciones(p, id) {
    await laCabecera(p, id).locator('[data-zona="automatizaciones"]').click();
    const panel = p.locator(EL_PANEL).last();
    await panel.waitFor({ state: "visible", timeout: 10000 });
    await panel.locator('[data-zona="nueva-automatizacion"]').waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1000);
    return panel;
}

async function cerrarElPanel(p) {
    await p.keyboard.press("Escape");
    await p.locator(EL_PANEL).last().waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await espera(p, 500);
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

async function miniaturas(p) {
    const focos = {};
    const mini = async (slug, zonaDeLaMini, despues) => {
        Object.assign(focos, await tomarUnaMiniatura(p, slug, await zonaDeLaMini(), { salida: SALIDA, tomadas }));
        await cerrarLoAbierto(p);
        if (despues) await despues();
    };

    await mini("vista-general", () => laBarra(p));
    await mini("el-tablero", () => lasCabeceras(p, 3));
    await mini(
        "buscar",
        async () => {
            await p.fill(EL_BUSCADOR, "Laura");
            await espera(p, 800);
            return caja(p, zona(p, "barra-del-tablero"));
        },
        async () => {
            await p.fill(EL_BUSCADOR, "");
            await espera(p, 800);
        },
    );
    await mini("arrastrar", async () => unir(await caja(p, laTarjeta(p, "Laura Méndez")), await caja(p, laCabecera(p, "CALIENTE"))));
    await mini("calificar-con-ia", () => caja(p, laTarjeta(p, "Camila Rojas")));
    await mini("filtrar-por-puntaje", () => caja(p, zona(p, "filtro-de-puntaje")));
    await mini(
        "automatizaciones",
        async () => {
            const panel = await abrirLasAutomatizaciones(p, "CALIENTE");
            return caja(p, panel.locator('[data-zona="automatizacion"]').first());
        },
        () => cerrarElPanel(p),
    );

    await desmarcar(p);
    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();
    const barra = await laBarra(p);

    // Portada del vídeo: la pantalla limpia.
    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las seis zonas, en el orden de `ZONAS_DE_LA_PANTALLA`.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const cPestanas = await caja(p, LAS_PESTANAS(p));
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cBarraDelTablero = await caja(p, zona(p, "barra-del-tablero"));
    const cTablero = await loQueSeVeDelTablero(p);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: dentro(cPestanas, 4), n: 3 },
        { c: barra, n: 4 },
        { c: cBarraDelTablero, n: 5 },
        { c: dentro(cTablero, 4), n: 6 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // Las pestañas del Panel, con Calificación señalada.
    const pestana = await caja(p, p.locator(`nav a[href="${PANTALLA}"]`).first());
    await marcar(p, [{ c: dentro(cPestanas, 4), soloLuz: true }, { c: pestana, texto: "Estás en Calificación", lado: "abajo" }], { atenuar: true });
    const zonaPestanas = holgura({ ...cPestanas, h: cPestanas.h + 110 }, 12, vista);
    await guardar(p, "pestanas.webp", { ...zonaPestanas, y: cPestanas.y, h: zonaPestanas.h - (cPestanas.y - zonaPestanas.y) });
    await desmarcar(p);

    // La barra de trabajo: sus dos partes.
    await marcar(p, [
        { c: await caja(p, zona(p, "pestanas-del-crm")), n: 1 },
        { c: await caja(p, zona(p, "filtro-de-puntaje")), n: 2 },
    ]);
    await guardar(p, "barra.webp", holgura(barra, 34, vista));
    await desmarcar(p);

    // La barra del tablero: sus cuatro partes.
    await marcar(p, [
        { c: await caja(p, zona(p, "buscador")), n: 1 },
        { c: await caja(p, zona(p, "contador")), n: 2 },
        { c: await caja(p, zona(p, "actualizar")), n: 3 },
        { c: await caja(p, zona(p, "puntuar-todos")), n: 4 },
    ]);
    await guardar(p, "barra-del-tablero.webp", holgura(cBarraDelTablero, 34, vista));
    await desmarcar(p);

    // 2. El tablero: las seis columnas, la cabecera de una y una tarjeta.
    await marcar(p, [{ c: await caja(p, laColumna(p, "SIN_CLASIFICAR")), texto: "Los que aún no tienen etapa", lado: "abajo" }], { atenuar: true });
    await guardar(p, "columnas.webp");
    await desmarcar(p);
    const cabecera = laCabecera(p, "CALIENTE");
    const cCab = await caja(p, cabecera);
    const partesDeLaCabecera = [];
    for (const z of ["cuantos", "automatizaciones"]) partesDeLaCabecera.push(await caja(p, cabecera.locator(`[data-zona="${z}"]`)));
    await marcar(p, partesDeLaCabecera.map((c, i) => ({ c, n: i + 1, numeroEn: { x: c.x + c.w / 2, y: cCab.y + cCab.h + 18 } })));
    await guardar(p, "cabecera-de-columna.webp", holgura({ ...cCab, h: cCab.h + 40 }, 30, vista));
    await desmarcar(p);

    // Una tarjeta: sus ocho partes, en el orden de `PARTES_DE_UNA_TARJETA`.
    const ejemplo = "Camila Rojas";
    const cTarjeta = await caja(p, laTarjeta(p, ejemplo));
    const izquierda = cTarjeta.x - 22;
    const derecha = cTarjeta.x + cTarjeta.w + 22;
    const partes = ["contacto", "puntaje", "seguimientos", "tiempo", "puntuar", "motivo", "razon", "etiquetas"];
    const lados = { contacto: derecha, puntaje: izquierda, seguimientos: izquierda, tiempo: izquierda, puntuar: derecha, motivo: derecha, razon: izquierda, etiquetas: derecha };
    const marcas = [];
    for (const [i, z] of partes.entries()) {
        const c = await caja(p, laParteDeLaTarjeta(p, ejemplo, z));
        marcas.push({ c, n: i + 1, numeroEn: { x: lados[z], y: c.y + c.h / 2 } });
    }
    // Las tres de la fila de medidas van pegadas: sus números se escalonan en
    // el margen para no montarse unos sobre otros.
    const medidas = marcas.slice(1, 4);
    medidas.forEach((m, k) => { m.numeroEn = { x: izquierda - (2 - k) * 28, y: m.c.y + m.c.h / 2 }; });
    await marcar(p, marcas, { atenuar: true });
    await guardar(p, "tarjeta.webp", holgura({ x: cTarjeta.x - 110, y: cTarjeta.y - 40, w: cTarjeta.w + 154, h: cTarjeta.h + 70 }, 10, vista));
    await desmarcar(p);

    // 3. Buscar: «Laura», el contador y la X.
    await p.fill(EL_BUSCADOR, "Laura");
    await espera(p, 1000);
    const zonaDeBuscar = holgura(unir(await caja(p, zona(p, "barra-del-tablero")), await loQueSeVeDelTablero(p)), 10, vista);
    await marcar(p, [{ c: await caja(p, zona(p, "buscador")), texto: "Escribe un nombre o un número", lado: "abajo" }, { c: await caja(p, laTarjeta(p, "Laura Méndez")) }]);
    await guardar(p, "buscar-escribir.webp", zonaDeBuscar);
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, zona(p, "contador")), texto: "1 de los que hay", lado: "abajo" }]);
    await guardar(p, "buscar-contador.webp", holgura(cBarraDelTablero, 60, vista));
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, 'button[aria-label="Borrar la búsqueda"]'), texto: "Vacía la búsqueda", lado: "abajo" }]);
    await guardar(p, "buscar-borrar.webp", holgura(cBarraDelTablero, 60, vista));
    await desmarcar(p);
    await p.click('button[aria-label="Borrar la búsqueda"]');
    await espera(p, 1000);

    // 4. Arrastrar: Laura, de Tibio a Caliente.
    const antesDeArrastrar = await lasDosColumnas(p, "TIBIO", "CALIENTE");
    await arrastrarLaTarjeta(p, "Laura Méndez", "CALIENTE", { soltar: false });
    await marcar(p, [{ c: await caja(p, laColumna(p, "CALIENTE").locator('[data-zona="tarjetas"]')), texto: "Suéltala aquí", lado: "abajo" }]);
    await guardar(p, "arrastrar-agarrar.webp", antesDeArrastrar);
    await desmarcar(p);
    await p.mouse.up();
    await enLaColumna(p, "CALIENTE", "Laura Méndez").waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 1500);
    await quitarAvisos(p);
    await marcar(p, [{ c: await caja(p, enLaColumna(p, "CALIENTE", "Laura Méndez")), texto: "Ya es Caliente", lado: "abajo" }], { atenuar: true });
    await guardar(p, "arrastrar-soltar.webp", await lasDosColumnas(p, "TIBIO", "CALIENTE"));
    await desmarcar(p);
    // Nicolás, de Frío a Descartado: sus seguimientos pendientes se cancelan.
    await p.locator(EL_TABLERO).evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await espera(p, 600);
    await arrastrarLaTarjeta(p, "Nicolás Moreno", "DESCARTADO");
    await enLaColumna(p, "DESCARTADO", "Nicolás Moreno").waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 1500);
    await quitarAvisos(p);
    await marcar(p, [{ c: await caja(p, enLaColumna(p, "DESCARTADO", "Nicolás Moreno")), texto: "Sin seguimientos pendientes", lado: "abajo" }], { atenuar: true });
    await guardar(p, "arrastrar-descartado.webp", holgura(await caja(p, laColumna(p, "DESCARTADO")), 10, vista));
    await desmarcar(p);
    await p.locator(EL_TABLERO).evaluate((el) => { el.scrollLeft = 0; });
    await espera(p, 600);

    // 5. Calificar con IA: Paula, que todavía no tiene puntaje.
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
        { c: await caja(p, zona(p, "puntuar-todos")) },
        { c: await caja(p, p.locator("[data-sonner-toast]").last()) },
    ]);
    await guardar(p, "calificar-todos.webp");
    await desmarcar(p);
    await quitarAvisos(p);

    // 6. Filtrar por puntaje: los cinco, Alto puesto y otro clic lo quita.
    const filtro = zona(p, "filtro-de-puntaje");
    const rangos = ["bajo", "medio", "moderado", "alto", "listo"];
    await marcar(p, await Promise.all(rangos.map(async (r, i) => ({ c: await caja(p, elRango(p, r)), n: i + 1 }))));
    await guardar(p, "filtro-rangos.webp", holgura(await caja(p, filtro), 40, vista));
    await desmarcar(p);
    await elRango(p, "alto").click();
    await espera(p, 1500);
    await marcar(p, [
        { c: await caja(p, elRango(p, "alto")), texto: "Filtro puesto", lado: "abajo" },
        { c: await loQueSeVeDelTablero(p) },
    ]);
    await guardar(p, "filtro-puesto.webp");
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, elRango(p, "alto")), texto: "Otro clic y vuelven todos", lado: "abajo" }]);
    await guardar(p, "filtro-quitar.webp", holgura(unir(barra, { ...barra, y: barra.y + 110, h: 1 }), 22, vista));
    await desmarcar(p);
    await elRango(p, "alto").click();
    await espera(p, 1500);

    // 7. Automatizaciones: el engranaje de Caliente, crear una, una acción nueva (se CANCELA) y la lista.
    const engranaje = laCabecera(p, "CALIENTE").locator('[data-zona="automatizaciones"]');
    await marcar(p, [{ c: await caja(p, engranaje), texto: "Sus automatizaciones", lado: "abajo" }], { atenuar: true });
    await guardar(p, "automatizaciones-abrir.webp", holgura({ ...(await caja(p, laCabecera(p, "CALIENTE"))), h: 120 }, 40, vista));
    await desmarcar(p);
    const panel = await abrirLasAutomatizaciones(p, "CALIENTE");
    const nueva = panel.locator('[data-zona="nueva-automatizacion"]');
    await nueva.locator('input[aria-label="Nombre de la automatización"]').pressSequentially("Seguimiento a calientes", { delay: 30 });
    await espera(p, 400);
    await marcar(p, [
        { c: await caja(p, nueva.locator("input")), n: 1 },
        { c: await caja(p, nueva.getByRole("button", { name: "Crear" })), n: 2 },
    ]);
    await guardar(p, "automatizaciones-crear.webp", holgura(await caja(p, panel), 0, vista));
    await desmarcar(p);
    await nueva.getByRole("button", { name: "Crear" }).click();
    const creada = panel.locator('[data-zona="automatizacion"]', { hasText: "Seguimiento a calientes" });
    await creada.waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 1000);
    await quitarAvisos(p);
    await creada.locator('[data-zona="agregar-accion"]').click();
    const dialogo = p.locator('[role="dialog"]', { hasText: "Nueva acción" }).last();
    await dialogo.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    const cDialogo = await caja(p, dialogo);
    await marcar(p, [
        { c: await caja(p, dialogo.getByRole("combobox").first()), texto: "Qué hacer", lado: "derecha" },
        { c: await caja(p, dialogo.locator('input[type="number"]')), texto: "Cuántos minutos esperar", lado: "derecha" },
    ]);
    await guardar(p, "automatizaciones-accion.webp", holgura(cDialogo, 30, vista));
    await desmarcar(p);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await dialogo.waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 500);
    const ejemploDeAutomatizacion = panel.locator('[data-zona="automatizacion"]').first();
    const cAuto = await caja(p, ejemploDeAutomatizacion);
    await marcar(p, [
        { c: await caja(p, ejemploDeAutomatizacion.locator('[data-zona="encendida"]')), n: 1 },
        { c: await caja(p, ejemploDeAutomatizacion.locator('[data-zona="acciones"]')), n: 2, esquina: "izquierda" },
        { c: await caja(p, ejemploDeAutomatizacion.locator('[data-zona="eliminar-automatizacion"]')), n: 3 },
    ]);
    await guardar(p, "automatizaciones-lista.webp", holgura(cAuto, 30, vista));
    await desmarcar(p);
    await cerrarElPanel(p);

    await abrirElTablero(p);
    await elMarcoDeLaPantalla(p, guardar, { modulo: MODULO_DE_CALIFICACION, texto: "Calificación está en Panel" });
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

    await abrirElTablero(p);
    await p.mouse.move(640, 400, { steps: 8 });
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("ordenados en un tablero", 300);
    await mover(p, laCabecera(p, "FRIO"));
    await alDecir("listos para comprar", 200);
    await mover(p, laCabecera(p, "CALIENTE"));

    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const elModulo = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: MODULO_DE_CALIFICACION }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Panel", 600);
    await mover(p, elModulo);

    const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    await decir("tablero");
    await alDecir("Sin clasificar", 100);
    await mover(p, laCabecera(p, "SIN_CLASIFICAR"));
    await alDecir("Tibio", 100);
    await mover(p, laCabecera(p, "TIBIO"));
    await alDecir("cada tarjeta es un contacto", 200);
    await mover(p, laParteDeLaTarjeta(p, "Camila Rojas", "contacto"));
    await alDecir("con su puntaje", 150);
    await mover(p, laParteDeLaTarjeta(p, "Camila Rojas", "puntaje"));
    await alDecir("el tiempo que lleva", 150);
    await mover(p, laParteDeLaTarjeta(p, "Camila Rojas", "tiempo"));

    await decir("buscar");
    await alDecir("Con el buscador");
    await pulsar(p, p.locator(EL_BUSCADOR));
    await p.locator(EL_BUSCADOR).pressSequentially("Laura", { delay: 110 });
    await alDecir("el contador", 150);
    await mover(p, zona(p, "contador"));
    await pulsar(p, p.locator('button[aria-label="Borrar la búsqueda"]'));

    await decir("arrastrar");
    await alDecir("arrastras su tarjeta");
    await arrastrarLaTarjeta(p, "Santiago Díaz", "CALIENTE", { enVideo: true });
    await alDecir("se guarda al soltarla", 200);
    await mover(p, enLaColumna(p, "CALIENTE", "Santiago Díaz"));

    await decir("calificar");
    await alDecir("Con el destello");
    await pulsar(p, laParteDeLaTarjeta(p, "Sofía Herrera", "puntuar"));
    await laParteDeLaTarjeta(p, "Sofía Herrera", "puntaje").waitFor({ state: "visible", timeout: 30000 });
    await alDecir("un puntaje del cero al cien", 200);
    await mover(p, laParteDeLaTarjeta(p, "Sofía Herrera", "puntaje"));
    await alDecir("con el motivo debajo", 150);
    await mover(p, laParteDeLaTarjeta(p, "Sofía Herrera", "motivo"));
    await alDecir("con Calificar con IA", 100);
    await mover(p, zona(p, "puntuar-todos"));

    await decir("filtrar");
    await alDecir("con Alto");
    await pulsar(p, elRango(p, "alto"));
    await alDecir("pulsándolo otra vez");
    await pulsar(p, elRango(p, "alto"));

    await decir("automatizaciones");
    await alDecir("con el engranaje");
    await pulsar(p, laCabecera(p, "CALIENTE").locator('[data-zona="automatizaciones"]'));
    const panel = p.locator(EL_PANEL).last();
    await panel.locator('[data-zona="automatizacion"]').first().waitFor({ state: "visible", timeout: 30000 });
    await alDecir("enviarle un mensaje", 100);
    await mover(p, panel.locator('[data-zona="accion"]').nth(1));
    await alDecir("avisar a tu asesor", 100);
    await mover(p, panel.locator('[data-zona="accion"]').nth(2));
    await callar(700);
    await p.keyboard.press("Escape");
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
    escribirLaVozDelVideo("calificacion", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
        // Las capturas mueven, califican y crean: el vídeo sale del mismo punto de partida.
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-calificacion.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/calificacion`);
