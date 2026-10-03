/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Reportes, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-reportes.mjs`).
 *
 * La MISMA receta que las demás guías y con las MISMAS piezas del taller
 * (`taller-de-la-guia.mjs`): cada captura es «abre esto, pulsa aquello,
 * resalta este elemento», y las marcas se localizan por lo que la pantalla ya
 * expone —los `data-zona` y `data-boton` de Reportes, los `data-pestana` del
 * CRM, los `data-fila-*` de Calidad—, no por coordenadas.
 *
 * «Generar reporte» se pulsa de verdad: la IA y el WhatsApp los contesta el
 * doble (`fingido-guia-reportes.mjs`), así que a nadie le llega nada. NADA se
 * borra: la papelera y «Eliminar todos» se abren y se cierran con «Volver».
 * Generar sí añade un reporte, así que antes del vídeo se vuelve a sembrar.
 *
 * Se lanza con `scripts/generar-guia-reportes.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-reportes.mjs";
import { guardarWav, loQueSeCorta, mezclar, montarLaPista, tramosSinLosCortes } from "./voz-de-la-guia.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "reportes");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-reportes";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-reportes.json");
const MENU = path.join(RAIZ, "scripts", "menu-guia-reportes.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

const RUTA = "/crm/reportes";
const LAS_PESTANAS_DEL_PANEL = (p) => p.locator(`nav a[href="${RUTA}"]`).first().locator("xpath=ancestor::div[contains(@class,'sticky')][1]");
const PESTANAS_CRM = "[data-pestanas-del-crm]";
const pestana = (p, nombre) => p.locator(`${PESTANAS_CRM} [data-pestana="${nombre}"]`);
const BARRA = '[data-zona="barra-de-reportes"]';
const boton = (p, b) => p.locator(`${BARRA} [data-boton="${b}"]`);
const LISTA = '[data-zona="lista-de-reportes"]';
const losReportes = (p) => p.locator(`${LISTA} [data-reporte]`);
const elReporte = (p, i) => losReportes(p).nth(i);
const cabecera = (r) => r.locator('[data-zona="cabecera-del-reporte"]');
const SIN_RESPUESTA = "[data-vista-sin-respuesta]";
const lasPreguntas = (p) => p.locator(`${SIN_RESPUESTA} [data-pregunta]`);
const CONFIRMAR = "[data-confirmar-borrado]";
const CALIDAD = "[data-vista-calidad]";
const POR_ASESOR = "[data-calidad-por-asesor]";
const CONVERSACIONES = "[data-calidad-conversaciones]";

/** El ratón, fuera de todo: un botón con el cursor encima sale resaltado. */
const apartar = (p) => p.mouse.move(p.viewportSize().width - 30, p.viewportSize().height - 30);

async function abrirReportes(p) {
    await p.goto(`${BASE}${RUTA}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${LISTA} [data-reporte]`, { timeout: 90000 });
    await p.waitForSelector(`${SIN_RESPUESTA} [data-pregunta]`, { timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2000);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
    await apartar(p);
}

async function abrirRegistros(p) {
    await pestana(p, "registros").click();
    await p.getByRole("tab", { name: /^Todos \(/ }).first().waitFor({ state: "visible", timeout: 60000 });
    await p.locator("table tbody tr").first().waitFor({ state: "visible", timeout: 60000 });
    await espera(p, 1500);
    await apartar(p);
}

async function abrirCalidad(p) {
    await pestana(p, "calidad").click();
    await p.locator(`${POR_ASESOR} [data-fila-asesor]`).first().waitFor({ state: "visible", timeout: 60000 });
    await p.locator(`${CONVERSACIONES} [data-fila-conversacion]`).first().waitFor({ state: "visible", timeout: 60000 });
    await espera(p, 1200);
    await apartar(p);
}

async function abrirElReporte(p, i) {
    const r = elReporte(p, i);
    if (!(await r.locator('[data-zona="contenido-del-reporte"]').count())) await cabecera(r).click();
    await r.locator('[data-zona="contenido-del-reporte"]').waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    return r;
}

async function cerrarElReporte(p, i) {
    const r = elReporte(p, i);
    if (await r.locator('[data-zona="contenido-del-reporte"]').count()) await cabecera(r).click();
    await espera(p, 300);
}

async function volver(p) {
    const d = p.locator(CONFIRMAR).last();
    if (await d.count()) {
        await d.getByRole("button", { name: "Volver" }).click();
        await d.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    }
    await espera(p, 300);
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

async function miniaturas(p) {
    const focos = {};
    const mini = async (slug, zonaDe, despues) => {
        Object.assign(focos, await tomarUnaMiniatura(p, slug, await zonaDe(), { salida: SALIDA, tomadas }));
        await cerrarLoAbierto(p);
        if (despues) await despues();
    };
    await abrirReportes(p);
    await mini("vista-general", () => caja(p, BARRA));
    await mini("generar", () => caja(p, boton(p, "generar")));
    await mini(
        "leer",
        async () => {
            const r = await abrirElReporte(p, 0);
            return caja(p, r.locator('[data-zona="metricas"]'));
        },
        () => cerrarElReporte(p, 0),
    );
    await mini("whatsapp", () => caja(p, cabecera(elReporte(p, 0))));
    await mini("exportar", () => caja(p, boton(p, "exportar")));
    await mini(
        "borrar",
        async () => {
            await elReporte(p, 0).locator('[data-zona="eliminar-reporte"]').click();
            await p.locator(CONFIRMAR).last().waitFor({ state: "visible", timeout: 10000 });
            await espera(p, 400);
            return caja(p, p.locator(CONFIRMAR).last());
        },
        () => volver(p),
    );
    await mini("ia-no-supo", async () => unir(await caja(p, '[data-zona="cabecera-sin-respuesta"]'), await caja(p, lasPreguntas(p).nth(1))));
    await abrirRegistros(p);
    await mini("registros", () => caja(p, p.getByRole("tablist").first()));
    await abrirCalidad(p);
    await mini("calidad-por-asesor", () => caja(p, POR_ASESOR));
    await mini("calidad-por-conversacion", async () => {
        const filas = p.locator(`${CONVERSACIONES} [data-fila-conversacion]`);
        return unir(await caja(p, `${CONVERSACIONES} thead`), await caja(p, filas.nth(3)));
    });
    await desmarcar(p);
    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();
    await abrirReportes(p);
    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las siete zonas de `ZONAS_DE_LA_PANTALLA`.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const cPestanas = await caja(p, LAS_PESTANAS_DEL_PANEL(p));
    const cCrm = await caja(p, PESTANAS_CRM);
    const cBarra = await caja(p, BARRA);
    const cLista = await caja(p, LISTA);
    const cSinRespuesta = await caja(p, '[data-zona="cabecera-sin-respuesta"]');
    const bajoElMenu = await dondeAcabaElMenu(p);
    const visibleAbajo = { ...cSinRespuesta, h: Math.max(20, Math.min(cSinRespuesta.h, vista.height - 12 - cSinRespuesta.y)) };
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: dentro(cPestanas, 4), n: 3 },
        { c: cCrm, n: 4 },
        { c: cBarra, n: 5 },
        { c: { ...cLista, h: Math.min(cLista.h, cSinRespuesta.y - cLista.y - 16) }, n: 6 },
        ...(cSinRespuesta.y < vista.height - 30 ? [{ c: visibleAbajo, n: 7 }] : []),
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // Las pestañas del Panel, con Reportes marcada.
    const enPanel = await caja(p, p.locator(`nav a[href="${RUTA}"]`).first());
    await marcar(p, [{ c: dentro(cPestanas, 4), soloLuz: true }, { c: enPanel, texto: "Estás en Reportes", lado: "abajo" }], { atenuar: true });
    const zonaPestanas = holgura({ ...cPestanas, h: cPestanas.h + 110 }, 12, vista);
    await guardar(p, "pestanas.webp", { ...zonaPestanas, y: cPestanas.y, h: zonaPestanas.h - (cPestanas.y - zonaPestanas.y) });
    await desmarcar(p);

    // Las pestañas del CRM, numeradas en su orden.
    const marcasCrm = [];
    const nombres = ["analiticas", "registros", "llamadas", "kanban", "reportes", "calidad"];
    for (let i = 0; i < nombres.length; i += 1) marcasCrm.push({ c: await caja(p, pestana(p, nombres[i])), n: i + 1, esquina: "derecha" });
    await marcar(p, marcasCrm, { atenuar: true });
    await guardar(p, "pestanas-del-crm.webp", holgura({ ...cCrm, h: cCrm.h + 40, w: Math.max(cCrm.w, 640) }, 24, vista));
    await desmarcar(p);

    // 2. Generar: la barra, el botón, y el reporte nuevo arriba.
    await marcar(p, [
        { c: await caja(p, boton(p, "exportar")), n: 1, esquina: "derecha" },
        { c: await caja(p, boton(p, "eliminar-todos")), n: 2, esquina: "derecha" },
        { c: await caja(p, boton(p, "actualizar")), n: 3, esquina: "derecha" },
        { c: await caja(p, boton(p, "generar")), n: 4, esquina: "derecha" },
    ]);
    await guardar(p, "barra.webp", holgura({ ...cBarra, y: cBarra.y - 30, h: cBarra.h + 60 }, 20, vista));
    await desmarcar(p);
    const cuantos = await losReportes(p).count();
    await marcar(p, [{ c: await caja(p, boton(p, "generar")), texto: "La IA escribe el de esta semana", lado: "abajo" }], { atenuar: true });
    await guardar(p, "generar.webp", holgura({ ...cBarra, h: cBarra.h + 200 }, 30, vista));
    await desmarcar(p);
    await boton(p, "generar").click();
    await p.waitForFunction((n) => document.querySelectorAll('[data-zona="lista-de-reportes"] [data-reporte]').length > n, cuantos, { timeout: 60000 });
    await p.waitForSelector("[data-sonner-toast]", { timeout: 30000 });
    await espera(p, 1200);
    await apartar(p);
    const nuevo = elReporte(p, 0);
    await marcar(p, [{ c: await caja(p, nuevo), texto: "El nuevo, el primero de la lista", lado: "abajo" }], { atenuar: true });
    await guardar(p, "generado.webp", holgura(unir(cBarra, await caja(p, elReporte(p, 2))), 24, vista));
    await desmarcar(p);
    // El aviso de «enviado por WhatsApp», mientras sigue a la vista.
    const aviso = p.locator("[data-sonner-toast]").last();
    if (await aviso.count()) {
        await marcar(p, [{ c: await caja(p, aviso), texto: "Generado y enviado", lado: "arriba" }]);
        await guardar(p, "aviso-enviado.webp");
        await desmarcar(p);
    }
    await quitarAvisos(p);

    // 3. Leer un reporte: la cabecera, abierto, métricas, calidad y actividad.
    const r0 = elReporte(p, 0);
    const c0 = cabecera(r0);
    await marcar(p, [
        { c: await caja(p, c0.locator("p.font-semibold").first()), n: 1 },
        { c: await caja(p, r0.locator('[data-zona="cifras-del-reporte"]')), n: 2 },
        { c: await caja(p, r0.locator('[data-zona="enviado"]')), n: 3, esquina: "derecha" },
        { c: await caja(p, r0.locator('[data-zona="eliminar-reporte"]')), n: 4, esquina: "derecha" },
    ]);
    await guardar(p, "cabecera.webp", holgura({ ...(await caja(p, c0)), h: (await caja(p, c0)).h + 50 }, 24, vista));
    await desmarcar(p);
    await abrirElReporte(p, 0);
    await r0.scrollIntoViewIfNeeded();
    await p.evaluate(() => {
        const r = document.querySelector('[data-zona="lista-de-reportes"] [data-reporte]');
        r?.scrollIntoView({ block: "start" });
        const caja = r?.closest(".overflow-y-auto");
        if (caja) caja.scrollTop -= 80;
    });
    await espera(p, 500);
    await marcar(p, [{ c: await caja(p, r0.locator('[data-zona="resumen"]')), texto: "Escrito por la IA", lado: "abajo" }]);
    await guardar(p, "abierto.webp");
    await desmarcar(p);
    await r0.locator('[data-zona="metricas"]').scrollIntoViewIfNeeded();
    await espera(p, 300);
    const cMetricas = await caja(p, r0.locator('[data-zona="metricas"]'));
    await marcar(p, [{ c: cMetricas }, { c: await caja(p, r0.locator('[data-zona="puntuacion"]')), soloLuz: true }]);
    await guardar(p, "metricas.webp", holgura(unir(cMetricas, await caja(p, r0.locator('[data-zona="puntuacion"]'))), 30, vista));
    await desmarcar(p);
    await r0.locator('[data-zona="actividad"]').scrollIntoViewIfNeeded();
    await espera(p, 300);
    const cCalidadR = await caja(p, r0.locator("[data-calidad-del-reporte]"));
    const cActividad = await caja(p, r0.locator('[data-zona="actividad"]'));
    await marcar(p, [{ c: cCalidadR, n: 1 }, { c: cActividad, n: 2 }]);
    await guardar(p, "calidad-y-actividad.webp", holgura(unir(cCalidadR, cActividad), 30, vista));
    await desmarcar(p);
    await cerrarElReporte(p, 0);
    await abrirReportes(p);

    // 4. WhatsApp: la marca «Enviado» y la lista con los de cada semana.
    const enviado = elReporte(p, 0).locator('[data-zona="enviado"]');
    await marcar(p, [{ c: await caja(p, enviado), texto: "Salió por WhatsApp", lado: "abajo" }], { atenuar: true });
    await guardar(p, "enviado.webp", holgura({ ...(await caja(p, cabecera(elReporte(p, 0)))), h: 140 }, 24, vista));
    await desmarcar(p);
    const marcasEnviados = [];
    const n = Math.min(4, await losReportes(p).count());
    for (let i = 0; i < n; i += 1) marcasEnviados.push({ c: await caja(p, elReporte(p, i).locator('[data-zona="enviado"]')) });
    await marcar(p, marcasEnviados, { atenuar: true });
    await guardar(p, "lista-enviados.webp", holgura(unir(cBarra, await caja(p, elReporte(p, n - 1))), 24, vista));
    await desmarcar(p);

    // 5. Exportar.
    await marcar(p, [{ c: await caja(p, boton(p, "exportar")), texto: "Todos en un Excel", lado: "abajo" }], { atenuar: true });
    await guardar(p, "exportar.webp", holgura({ ...cBarra, h: cBarra.h + 150 }, 30, vista));
    await desmarcar(p);
    const marcasFila = [
        { c: await caja(p, cabecera(elReporte(p, 0)).locator("p.font-semibold").first()), n: 1 },
        { c: await caja(p, elReporte(p, 0).locator('[data-zona="cifras-del-reporte"]')), n: 2 },
        { c: await caja(p, elReporte(p, 0).locator('[data-zona="enviado"]')), n: 3, esquina: "derecha" },
    ];
    await marcar(p, marcasFila);
    await guardar(p, "exportar-barra.webp", holgura({ ...(await caja(p, cabecera(elReporte(p, 0)))), h: 120 }, 24, vista));
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, boton(p, "exportar")), n: 1 }, { c: { ...cLista, h: Math.min(cLista.h, vista.height - cLista.y - 20) }, n: 2 }], { atenuar: true });
    await guardar(p, "exportar-lista.webp");
    await desmarcar(p);

    // 6. Borrar: la papelera, la confirmación (se cierra con «Volver»), y «Eliminar todos».
    const papelera = elReporte(p, 1).locator('[data-zona="eliminar-reporte"]');
    await marcar(p, [{ c: await caja(p, papelera), texto: "Borra este reporte", lado: "abajo" }], { atenuar: true });
    await guardar(p, "papelera.webp", holgura({ ...(await caja(p, cabecera(elReporte(p, 1)))), h: 140 }, 24, vista));
    await desmarcar(p);
    await papelera.click();
    const conf = p.locator(CONFIRMAR).last();
    await conf.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await marcar(p, [
        { c: await caja(p, conf.getByRole("button", { name: "Volver" })), n: 1, esquina: "izquierda" },
        { c: await caja(p, conf.getByRole("button", { name: "Eliminar" })), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "borrar-confirmar.webp", holgura(await caja(p, conf), 50, vista));
    await desmarcar(p);
    await volver(p);
    await marcar(p, [{ c: await caja(p, boton(p, "eliminar-todos")), texto: "Borra todos, también pregunta", lado: "abajo" }], { atenuar: true });
    await guardar(p, "eliminar-todos.webp", holgura({ ...cBarra, h: cBarra.h + 150 }, 30, vista));
    await desmarcar(p);

    // 7. Lo que la IA no supo responder.
    await p.locator(SIN_RESPUESTA).scrollIntoViewIfNeeded();
    await p.evaluate(() => document.querySelector("[data-vista-sin-respuesta]")?.scrollIntoView({ block: "start" }));
    await espera(p, 500);
    const cVista = await caja(p, SIN_RESPUESTA);
    await marcar(p, [{ c: await caja(p, '[data-zona="cabecera-sin-respuesta"]'), n: 1 }, { c: await caja(p, '[data-zona="lista-sin-respuesta"]'), n: 2 }]);
    await guardar(p, "sin-respuesta.webp", holgura({ ...cVista, h: Math.min(cVista.h, vista.height - cVista.y - 10) }, 20, vista));
    await desmarcar(p);
    const cPeriodos = await caja(p, '[data-zona="periodos-sin-respuesta"]');
    await marcar(p, [{ c: cPeriodos, texto: "Cuánto atrás mirar", lado: "abajo" }], { atenuar: true });
    await guardar(p, "sin-respuesta-periodos.webp", holgura({ ...cPeriodos, x: cPeriodos.x - 300, w: cPeriodos.w + 300, h: cPeriodos.h + 120 }, 20, vista));
    await desmarcar(p);
    const q0 = lasPreguntas(p).first();
    await marcar(p, [
        { c: await caja(p, q0.locator('[data-zona="veces"]')), n: 1, esquina: "izquierda" },
        { c: await caja(p, q0.locator("p").first()), n: 2 },
        { c: await caja(p, q0.locator('[data-zona="detalle-de-la-pregunta"]')), n: 3 },
    ]);
    await guardar(p, "sin-respuesta-pregunta.webp", holgura({ ...(await caja(p, q0)), h: (await caja(p, q0)).h + 40 }, 30, vista));
    await desmarcar(p);
    await q0.locator('[data-zona="variantes"]').click();
    await espera(p, 400);
    await marcar(p, [{ c: await caja(p, q0.locator("ul")), texto: "Otras formas de la misma pregunta", lado: "abajo" }]);
    await guardar(p, "sin-respuesta-variantes.webp", holgura({ ...(await caja(p, q0)), h: (await caja(p, q0)).h + 60 }, 30, vista));
    await desmarcar(p);
    await q0.locator('[data-zona="variantes"]').click();

    // 8. Registros.
    await abrirReportes(p);
    await marcar(p, [{ c: await caja(p, pestana(p, "registros")), texto: "Registros", lado: "abajo" }], { atenuar: true });
    await guardar(p, "registros.webp", holgura({ ...cCrm, h: cCrm.h + 100, w: Math.max(cCrm.w, 640) }, 24, vista));
    await desmarcar(p);
    await abrirRegistros(p);
    const lasPestanasDeTipo = p.getByRole("tablist").first();
    await p.getByRole("tab", { name: /^Pedidos \(/ }).first().click();
    await espera(p, 1500);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, lasPestanasDeTipo), soloLuz: true }, { c: await caja(p, p.getByRole("tab", { name: /^Pedidos \(/ }).first()), texto: "Solo los pedidos", lado: "abajo" }], {
        atenuar: true,
    });
    await guardar(p, "registros-tipos.webp", holgura({ ...(await caja(p, lasPestanasDeTipo)), h: 260 }, 20, vista));
    await desmarcar(p);
    await p.getByRole("tab", { name: /^Todos \(/ }).first().click();
    await espera(p, 1500);
    await apartar(p);
    const buscador = p.getByPlaceholder("Buscar en el CRM...").first();
    const cTabla = await caja(p, "table");
    await marcar(p, [{ c: await caja(p, buscador), n: 1 }, { c: { ...cTabla, h: Math.min(cTabla.h, vista.height - cTabla.y - 16) }, n: 2 }]);
    await guardar(p, "registros-tabla.webp");
    await desmarcar(p);
    const acciones = p.getByRole("button", { name: "Acciones del registro" }).first();
    const cAcciones = await caja(p, acciones);
    await acciones.click();
    const menu = p.locator('[role="menu"]').last();
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    const cMenu = await caja(p, menu);
    await marcar(p, [{ c: cAcciones, n: 1 }, { c: cMenu, n: 2, esquina: "derecha" }], { atenuar: true });
    await guardar(p, "registros-acciones.webp", holgura(unir(cMenu, cAcciones, { ...cMenu, x: cMenu.x - 380 }), 30, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 300);

    // 9. Calidad por asesor.
    await abrirCalidad(p);
    const cVistaCalidad = await caja(p, CALIDAD);
    await marcar(p, [{ c: await caja(p, pestana(p, "calidad")), n: 1, esquina: "derecha" }, { c: await caja(p, POR_ASESOR), n: 2 }, { c: { ...(await caja(p, CONVERSACIONES)), h: Math.min((await caja(p, CONVERSACIONES)).h, vista.height - (await caja(p, CONVERSACIONES)).y - 16) }, n: 3 }]);
    await guardar(p, "calidad.webp");
    await desmarcar(p);
    const barraCalidad = `${CALIDAD} [data-barra-de-acciones]`;
    const cBarraCalidad = await caja(p, barraCalidad);
    await marcar(p, [
        { c: await caja(p, p.getByPlaceholder("Buscar contacto o asesor")), n: 1 },
        { c: await caja(p, `${barraCalidad} [data-zona="filtros"]`), n: 2 },
        { c: await caja(p, p.getByRole("button", { name: "Evaluar ahora" })), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "calidad-barra.webp", holgura({ ...cBarraCalidad, y: cBarraCalidad.y - 20, h: cBarraCalidad.h + 50 }, 20, vista));
    await desmarcar(p);
    const cPorAsesor = await caja(p, POR_ASESOR);
    await marcar(p, [{ c: cPorAsesor }]);
    await guardar(p, "calidad-por-asesor.webp", holgura(cPorAsesor, 24, vista));
    await desmarcar(p);
    const andrea = p.locator(`${POR_ASESOR} [data-fila-asesor]`, { hasText: "Andrea" }).first();
    await andrea.click();
    await espera(p, 800);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, andrea), n: 1 }, { c: await caja(p, `${CALIDAD} [data-filtro-asesor]`), n: 2, esquina: "derecha" }], { atenuar: true });
    await guardar(p, "calidad-un-asesor.webp", holgura(unir(cBarraCalidad, cPorAsesor), 24, vista));
    await desmarcar(p);
    await p.locator(`${CALIDAD} [data-filtro-asesor]`).click();
    await espera(p, 600);

    // 10. Calidad conversación por conversación.
    await p.locator(CONVERSACIONES).scrollIntoViewIfNeeded();
    await espera(p, 400);
    const cConv = await caja(p, CONVERSACIONES);
    await marcar(p, [{ c: { ...cConv, h: Math.min(cConv.h, vista.height - cConv.y - 10) } }]);
    await guardar(p, "calidad-conversaciones.webp", holgura({ ...cConv, h: Math.min(cConv.h, vista.height - cConv.y - 10) }, 20, vista));
    await desmarcar(p);
    await p.locator(`${CALIDAD} [data-barra-de-acciones]`).locator("button", { hasText: "A mejorar" }).first().click();
    await espera(p, 800);
    await apartar(p);
    await marcar(p, [
        { c: await caja(p, p.locator(`${CALIDAD} [data-barra-de-acciones]`).locator("button", { hasText: "A mejorar" }).first()), n: 1, esquina: "derecha" },
        { c: await caja(p, CONVERSACIONES), n: 2 },
    ], { atenuar: true });
    await guardar(p, "calidad-a-mejorar.webp", holgura(unir(cBarraCalidad, await caja(p, CONVERSACIONES)), 20, vista));
    await desmarcar(p);
    const fila = p.locator(`${CONVERSACIONES} [data-fila-conversacion]`).first();
    // «Abrir» es un enlace, no un botón; y la columna de acciones es la última
    // de una tabla que se desplaza a lo ancho: se trae a la vista antes de medir.
    const abrirConv = fila.locator('[aria-label="Abrir la conversación"]');
    const exportarConv = fila.locator('[aria-label="Exportar la conversación"]');
    await abrirConv.scrollIntoViewIfNeeded();
    await espera(p, 300);
    await marcar(p, [
        { c: await caja(p, abrirConv), n: 1, esquina: "izquierda" },
        { c: await caja(p, exportarConv), n: 2, esquina: "derecha" },
    ], { atenuar: true });
    await guardar(p, "calidad-acciones.webp", holgura({ ...(await caja(p, fila)), y: (await caja(p, fila)).y - 60, h: (await caja(p, fila)).h + 120 }, 20, vista));
    await desmarcar(p);
    void cVistaCalidad;

    await abrirReportes(p);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Panel", texto: "Reportes está en Panel" });
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

const RESPIRO_ENTRE_FRASES_MS = 250;
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
    const { decir, alDecir, callar, tramos, cortes } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    try {
        await abrirReportes(p);
        await p.mouse.move(640, 400, { steps: 8 });
        const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
        await decir("intro");
        await alDecir("cada semana", 300);
        await mover(p, elReporte(p, 0));
        await alDecir("con un resumen", 300);
        await mover(p, cabecera(elReporte(p, 0)).locator("p.font-semibold").first());

        const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
        const panel = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Panel" }).first();
        await decir("menu");
        await alDecir("con estas dos flechas");
        await pulsar(p, flechas);
        await alDecir("dentro de Panel", 500);
        await mover(p, panel);

        const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
        void ayuda; // la frase de la barra no la nombra: la misma de todas las guías
        await decir("barraDeArriba");
        await pulsar(p, flechas);
        await alDecir("el buscador general");
        await mover(p, buscarTodo.first());
        await alDecir("el botón de soporte");
        await mover(p, soporte.first());
        await alDecir("tus notificaciones");
        await mover(p, campana.first());

        // Generar: de verdad (lo contesta el doble).
        const cuantos = await losReportes(p).count();
        await decir("generar");
        await alDecir("Generar reporte", 100);
        await pulsar(p, boton(p, "generar"));
        await p.waitForFunction((n) => document.querySelectorAll('[data-zona="lista-de-reportes"] [data-reporte]').length > n, cuantos, { timeout: 60000 });
        await alDecir("el primero de la lista", 100);
        await mover(p, elReporte(p, 0));

        // Leer.
        await decir("leer");
        await alDecir("Al abrirlo", 100);
        await pulsar(p, cabecera(elReporte(p, 0)));
        await alDecir("las métricas", 100);
        await mover(p, elReporte(p, 0).locator('[data-zona="metricas"]'));
        await alDecir("la calidad", 100);
        await mover(p, elReporte(p, 0).locator("[data-calidad-del-reporte]"));
        await alDecir("la actividad", 100);
        await mover(p, elReporte(p, 0).locator('[data-zona="actividad"]'));
        await pulsar(p, cabecera(elReporte(p, 0)));

        // WhatsApp.
        await decir("whatsapp");
        await alDecir("la marca verde", 100);
        await mover(p, elReporte(p, 0).locator('[data-zona="enviado"]'));
        await alDecir("cada semana", 100);
        await mover(p, elReporte(p, 2).locator('[data-zona="enviado"]'));

        // Exportar y borrar: la papelera se abre y se cierra con «Volver».
        await decir("exportar");
        await alDecir("Exportar", 100);
        await mover(p, boton(p, "exportar"));
        await alDecir("con la papelera", 100);
        await pulsar(p, elReporte(p, 1).locator('[data-zona="eliminar-reporte"]'));
        const conf = p.locator(CONFIRMAR).last();
        await conf.waitFor({ state: "visible", timeout: 10000 });
        await alDecir("te pregunta", 200);
        await pulsar(p, conf.getByRole("button", { name: "Volver" }));
        await conf.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});

        // Lo que la IA no supo.
        await decir("iaNoSupo");
        await alDecir("Debajo", 100);
        await mover(p, lasPreguntas(p).first());
        await alDecir("cuántas veces", 100);
        await mover(p, lasPreguntas(p).first().locator('[data-zona="veces"]'));

        // Registros.
        await decir("registros");
        await alDecir("Registros", 100);
        await pulsar(p, pestana(p, "registros"));
        await p.getByRole("tab", { name: /^Pedidos \(/ }).first().waitFor({ state: "visible", timeout: 60000 });
        await alDecir("pedidos", 100);
        await pulsar(p, p.getByRole("tab", { name: /^Pedidos \(/ }).first());
        await alDecir("pagos", 100);
        await pulsar(p, p.getByRole("tab", { name: /^Pagos \(/ }).first());

        // Calidad.
        await decir("calidad");
        await alDecir("Calidad", 100);
        await pulsar(p, pestana(p, "calidad"));
        await p.locator(`${POR_ASESOR} [data-fila-asesor]`).first().waitFor({ state: "visible", timeout: 60000 });
        await alDecir("pulsa uno", 100);
        await pulsar(p, p.locator(`${POR_ASESOR} [data-fila-asesor]`, { hasText: "Andrea" }).first());
        await alDecir("sus conversaciones", 100);
        await mover(p, p.locator(`${CONVERSACIONES} [data-fila-conversacion]`).first());
        await callar(700);
        await rotulo(p, "");
        await espera(p, 500);

        const totalMs = Date.now() - t0;
        const grabado = await grabadora.parar();
        console.log(`  · grabados ${grabado.fotogramas} fotogramas (${(grabado.fotogramas / 25).toFixed(1)} s) de ${grabado.recibidos} pintados, en ${(totalMs / 1000).toFixed(1)} s`);
        await ctx.close();

        const { wav, colocados } = montarLaPista(tramosSinLosCortes(tramos, cortes), totalMs - loQueSeCorta(cortes));
        const pista = path.join(dir, "narracion.wav");
        guardarWav(pista, wav);
        const destino = path.join(SALIDA, "demostracion.webm");
        mezclar(mudo, pista, destino, { desdeMs });
        writeFileSync(path.join(TMP, "narracion.json"), JSON.stringify(colocados, null, 2));
        escribirLaVozDelVideo("reportes", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS, cortes });
        console.log("  ✓ demostracion.webm", Math.round(statSync(destino).size / 1024), "KB,", colocados.length, "frases narradas");
    } catch (e) {
        await p.screenshot({ path: path.join(TMP, "error-del-video.png") }).catch(() => {});
        console.error("[guia] el vídeo se cayó en", p.url(), "— foto en", path.join(TMP, "error-del-video.png"));
        throw e;
    }
}

/* ------------------------------------------------------------------ */

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--lang=es-CO"] });
try {
    const ctx = await navegador.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        locale: "es-CO",
        timezoneId: "America/Bogota",
    });
    const p = await entrar(ctx, BASE);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-reportes.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/reportes`);
