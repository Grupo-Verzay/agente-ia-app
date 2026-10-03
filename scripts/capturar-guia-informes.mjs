/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Informes
 * (`/crm/dashboard`), sobre la App servida de verdad (`next start`, sesión
 * real, datos de `sembrar-guia-informes.mjs`: una clínica con dos sucursales).
 *
 * La MISMA receta que las demás guías (`capturar-guia-conexion.mjs`) y con las
 * MISMAS piezas del taller (`taller-de-la-guia.mjs`): cada captura es «abre
 * esto, resalta esto», y las marcas se localizan por lo que la pantalla
 * expone —los `data-zona` de la barra y `data-seccion-de-informes` de cada
 * sección plegable—, no por coordenadas.
 *
 * Nada de lo que se hace aquí guarda nada: filtrar, buscar, plegar y elegir
 * cuentas cambian solo la vista, y todo se devuelve como estaba. Exportar se
 * señala y no se pulsa.
 *
 * Qué captura hace falta lo dice `lib/guia-informes.ts`: el script se niega a
 * terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-informes.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-informes.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "informes");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-informes";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-informes.json");
const MENU = path.join(RAIZ, "scripts", "menu-guia-informes.json");
const RUTA = "/crm/dashboard";

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Abrir                                                               */
/* ------------------------------------------------------------------ */

const zona = (p, z) => p.locator(`[data-zona="${z}"]`).first();
const LAS_PESTANAS = (p) => p.locator(`nav a[href="${RUTA}"]`).first().locator("xpath=ancestor::div[contains(@class,'sticky')][1]");
const laSeccion = (p, clave) => p.locator(`section[data-seccion-de-informes="${clave}"]`);
const suTitulo = (p, clave) => laSeccion(p, clave).locator("button[aria-expanded]").first();
const susTarjetas = (p, clave) => laSeccion(p, clave).locator("div.bg-card.shadow-sm");
const elSelectorDeCuentas = (p) => p.locator('[data-zona="cuentas"] button').first();

async function abrir(p, query = "") {
    await p.goto(`${BASE}${RUTA}${query}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector('[data-seccion-de-informes="sistema"]', { timeout: 90000 });
    // Las gráficas llegan después del primer pintado: «Cargando…» se va del badge.
    await p.waitForFunction(() => !document.querySelector('[data-zona="totales"]')?.textContent?.includes("Cargando"), null, { timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
    await quitarAvisos(p);
}

/** Pone una sección a la vista dentro de la caja que se desplaza. */
async function verla(p, loc, block = "start") {
    await loc.first().evaluate((el, block) => el.scrollIntoView({ block }), block);
    await espera(p, 500);
}

/** Lo que se VE de algo dentro de la caja de las secciones (recortado por ella). */
async function loQueSeVe(p, loc) {
    const c = await caja(p, loc);
    const marco = await caja(p, zona(p, "secciones-de-informes").locator("div.overflow-y-auto").first());
    const y = Math.max(c.y, marco.y);
    const fin = Math.min(c.y + c.h, marco.y + marco.h);
    return { x: c.x, y, w: c.w, h: Math.max(1, fin - y) };
}

/** Un recorte que no arranca encima del menú lateral (se colarían sus iconos a medias). */
const sinElMenu = (c, menu) => {
    const borde = menu.x + menu.w + 4;
    return c.x >= borde ? c : { ...c, x: borde, w: c.w - (borde - c.x) };
};

/** Antes de una foto: el anillo de foco se lee como otra marca. */
const soltarElFoco = (p) => p.evaluate(() => document.activeElement?.blur?.());

/** La fila de la barra: del buscador al resumen de totales. */
const laBarra = async (p) => unir(await caja(p, zona(p, "buscador")), await caja(p, zona(p, "totales")));

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

async function miniaturas(p) {
    const focos = {};
    const mini = async (slug, z) => {
        Object.assign(focos, await tomarUnaMiniatura(p, slug, await z(), { salida: SALIDA, tomadas }));
        await cerrarLoAbierto(p);
    };
    const deLaSeccion = (clave) => async () => {
        await verla(p, laSeccion(p, clave));
        return loQueSeVe(p, laSeccion(p, clave));
    };

    await mini("vista-general", async () => unir(await caja(p, zona(p, "pestanas-del-crm")), await laBarra(p)));
    await mini("periodo-y-cuentas", async () => unir(await caja(p, zona(p, "periodo")), await caja(p, elSelectorDeCuentas(p))));
    await mini("barra", () => laBarra(p));
    await mini("actividad", deLaSeccion("actividad"));
    await mini("leads-y-citas", deLaSeccion("leads"));
    await mini("llamadas-y-satisfaccion", deLaSeccion("llamadas"));
    await mini("sesiones-y-flujos", deLaSeccion("flujos"));
    await mini("ventas-y-creditos", deLaSeccion("ventas"));

    await abrir(p);
    await desmarcar(p);
    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();

    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las siete zonas de `ZONAS_DE_LA_PANTALLA`.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cPestanas = await caja(p, LAS_PESTANAS(p));
    const cVistas = await caja(p, zona(p, "pestanas-del-crm"));
    const cPeriodo = await caja(p, zona(p, "periodo"));
    const cCuentas = await caja(p, elSelectorDeCuentas(p));
    const cBarra = await laBarra(p);
    const cSecciones = await caja(p, zona(p, "secciones-de-informes"));
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: dentro(cPestanas, 4), n: 3 },
        { c: cVistas, n: 4 },
        { c: unir(cPeriodo, cCuentas), n: 5, esquina: "derecha" },
        { c: cBarra, n: 6 },
        { c: dentro(cSecciones, 4), n: 7 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // Las pestañas del Panel, con Estadísticas señalada.
    const pestana = await caja(p, p.locator(`nav a[href="${RUTA}"]`).first());
    await marcar(p, [{ c: dentro(cPestanas, 4), soloLuz: true }, { c: pestana, texto: "Estás en Informes", lado: "abajo" }], { atenuar: true });
    await guardar(p, "pestanas.webp", holgura({ ...cPestanas, h: cPestanas.h + 60 }, 12, vista));
    await desmarcar(p);

    // Las vistas del CRM, con Analíticas marcada.
    const analiticas = await caja(p, zona(p, "pestanas-del-crm").getByRole("button", { name: "Analíticas" }).first());
    await marcar(p, [{ c: cVistas, soloLuz: true }, { c: analiticas, texto: "Esta guía", lado: "abajo" }], { atenuar: true });
    await guardar(p, "vistas.webp", holgura({ ...cVistas, h: cVistas.h + 70 }, 24, vista));
    await desmarcar(p);

    // 2. El periodo y las cuentas.
    const botonesDelPeriodo = zona(p, "periodo").getByRole("button");
    const marcasDelPeriodo = [];
    for (let i = 0; i < (await botonesDelPeriodo.count()); i += 1) marcasDelPeriodo.push({ c: await caja(p, botonesDelPeriodo.nth(i)), n: i + 1, sinRecuadro: true });
    await marcar(p, [{ c: cPeriodo }, ...marcasDelPeriodo]);
    await guardar(p, "periodo.webp", sinElMenu(holgura({ ...unir(cVistas, cPeriodo, cCuentas), y: cPeriodo.y - 30, h: cPeriodo.h + 60 }, 24, vista), cMenuLateral));
    await desmarcar(p);

    await elSelectorDeCuentas(p).click();
    const menuDeCuentas = p.locator('[role="menu"]').last();
    await menuDeCuentas.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await guardar(p, "cuentas.webp", holgura(unir(cCuentas, await caja(p, menuDeCuentas)), 40, vista));
    await menuDeCuentas.getByText("Solo mi cuenta", { exact: true }).click();
    await p.waitForURL(/cuentas=/, { timeout: 30000 });
    await abrir(p, new URL(p.url()).search);
    const cSoloUna = await caja(p, elSelectorDeCuentas(p));
    await marcar(p, [{ c: cSoloUna, texto: "Solo tu cuenta", lado: "abajo" }, { c: await caja(p, zona(p, "totales")), texto: "Los números cambian", lado: "abajo" }]);
    const cFila = unir(await caja(p, zona(p, "pestanas-del-crm")), cSoloUna, await laBarra(p));
    await guardar(p, "cuentas-una.webp", sinElMenu(holgura({ ...cFila, h: cFila.h + 70 }, 16, vista), cMenuLateral));
    await desmarcar(p);
    await abrir(p);

    // 3. La barra: buscar, filtrar, secciones y exportar.
    const buscador = zona(p, "buscador").locator("input");
    await buscador.fill("citas");
    await espera(p, 900);
    await marcar(p, [{ c: await caja(p, zona(p, "buscador")), texto: "Escribe el nombre", lado: "abajo" }]);
    await guardar(p, "buscar.webp", holgura({ ...cBarra, h: Math.min(560, vista.height - cBarra.y - 20) }, 20, vista));
    await desmarcar(p);
    await buscador.fill("");
    await espera(p, 600);

    await zona(p, "filtros").click();
    const filtros = p.locator("[data-radix-popper-content-wrapper]").last();
    await filtros.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await soltarElFoco(p);
    await guardar(p, "filtros.webp", holgura(unir(await caja(p, zona(p, "filtros")), await caja(p, filtros)), 30, vista));
    await p.keyboard.press("Escape");
    await espera(p, 500);

    await zona(p, "secciones").click();
    const menuDeSecciones = p.locator('[role="menu"]').last();
    await menuDeSecciones.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await guardar(p, "secciones-menu.webp", holgura(unir(await caja(p, zona(p, "secciones")), await caja(p, menuDeSecciones)), 30, vista));
    await p.keyboard.press("Escape");
    await espera(p, 500);

    await soltarElFoco(p);
    await marcar(p, [{ c: await caja(p, zona(p, "exportar")), texto: "Descarga las cifras", lado: "abajo" }]);
    await guardar(p, "exportar.webp", holgura({ ...cBarra, h: cBarra.h + 80 }, 20, vista));
    await desmarcar(p);

    // Plegar: Actividad plegada y Rendimiento desplegado debajo.
    await suTitulo(p, "actividad").click();
    await espera(p, 700);
    await soltarElFoco(p);
    const cTitulo = await caja(p, suTitulo(p, "actividad"));
    await marcar(p, [{ c: { ...cTitulo, w: Math.min(cTitulo.w, 220) }, texto: "Pulsa para desplegar", lado: "derecha" }]);
    const cConPlegada = unir(await loQueSeVe(p, laSeccion(p, "actividad")), await loQueSeVe(p, laSeccion(p, "rendimiento")));
    await guardar(p, "plegar.webp", holgura({ ...cConPlegada, h: Math.min(cConPlegada.h, 360) }, 16, vista));
    await desmarcar(p);
    await suTitulo(p, "actividad").click();
    await espera(p, 700);

    // 4. Las secciones, en una ventana alta: así cada una cabe entera.
    await p.setViewportSize({ width: 1440, height: 1500 });
    await espera(p, 1200);
    const alta = p.viewportSize();
    const foto = async (nombre, clave, resaltar = []) => {
        await verla(p, laSeccion(p, clave));
        await soltarElFoco(p);
        const c = await loQueSeVe(p, laSeccion(p, clave));
        if (resaltar.length) {
            const cajas = [];
            for (const r of resaltar) cajas.push(await caja(p, r));
            await marcar(p, cajas.map((x) => ({ c: x })), { atenuar: true });
        }
        await guardar(p, nombre, holgura(c, 16, alta));
        await desmarcar(p);
    };
    await foto("actividad.webp", "actividad", [susTarjetas(p, "actividad").nth(0)]);
    await foto("registros.webp", "actividad", [susTarjetas(p, "actividad").nth(1)]);
    await foto("rendimiento.webp", "rendimiento");
    await foto("leads.webp", "leads", [susTarjetas(p, "leads").nth(0), susTarjetas(p, "leads").nth(1)]);
    await foto("seguimientos.webp", "leads", [susTarjetas(p, "leads").nth(2).locator("xpath=..")]);
    await foto("citas.webp", "citas");
    await foto("llamadas.webp", "llamadas");
    await foto("nps.webp", "satisfaccion");
    await foto("sentimiento.webp", "sentimiento");
    await foto("sesiones.webp", "sesiones");
    await foto("flujos.webp", "flujos");
    await foto("etiquetas.webp", "etiquetas");
    await foto("ventas.webp", "ventas");
    await foto("productos.webp", "productos");
    await foto("creditos.webp", "sistema");
    await p.setViewportSize(vista);
    await espera(p, 800);

    await abrir(p);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Panel", texto: "Informes está en Panel" });
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
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrir(p);
    await p.mouse.move(640, 400, { steps: 8 });
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("los números de tu negocio", 200);
    await mover(p, zona(p, "totales"));
    await alDecir("secciones que puedes plegar", 200);
    await mover(p, suTitulo(p, "actividad"));

    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const entrada = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Panel" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Panel", 400);
    await mover(p, entrada);

    const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // El periodo.
    const periodo = (t) => zona(p, "periodo").getByRole("button", { name: t }).first();
    await decir("periodo");
    await alDecir("siete", 200);
    await mover(p, periodo("7 días"));
    await alDecir("noventa días", 300);
    await pulsar(p, periodo("90 días"));
    await alDecir("o todo", 200);
    await mover(p, periodo("Todo"));
    await alDecir("se recalculan", 200);
    await mover(p, zona(p, "totales"));

    // Las cuentas.
    await decir("cuentas");
    await alDecir("en este botón", 300);
    await pulsar(p, elSelectorDeCuentas(p));
    await alDecir("solo la tuya", 300);
    await mover(p, p.locator('[role="menu"]').last().getByText("Solo mi cuenta", { exact: true }));
    await callar();
    await p.keyboard.press("Escape");

    // La barra.
    await decir("barra");
    await alDecir("buscas", 200);
    await mover(p, zona(p, "buscador"));
    await alDecir("filtras", 200);
    await mover(p, zona(p, "filtros"));
    await alDecir("eliges qué secciones", 200);
    await mover(p, zona(p, "secciones"));
    await alDecir("exportas", 200);
    await mover(p, zona(p, "exportar"));

    // Plegar.
    // El globo de «Exportar» se queda encima del título de Actividad mientras
    // el cursor siga en el botón: se aparta antes.
    await mover(p, laSeccion(p, "actividad").locator("div.bg-card.shadow-sm").first());
    await espera(p, 300);
    await decir("plegar");
    await alDecir("pulsando su título", 300);
    await pulsar(p, suTitulo(p, "actividad"));
    await espera(p, 900);
    await pulsar(p, suTitulo(p, "actividad"));

    // Las secciones, de arriba abajo.
    await decir("actividad");
    await alDecir("la actividad", 200);
    await mover(p, susTarjetas(p, "actividad").first());
    await alDecir("cómo trabaja tu agente", 200);
    await mover(p, suTitulo(p, "rendimiento"));
    await alDecir("tus leads", 200);
    await mover(p, susTarjetas(p, "leads").first());
    await alDecir("tus citas", 200);
    await mover(p, suTitulo(p, "citas"));

    await decir("clientes");
    await alDecir("tus llamadas", 200);
    await mover(p, suTitulo(p, "llamadas"));
    await alDecir("la nota que te ponen", 200);
    await mover(p, suTitulo(p, "satisfaccion"));
    await alDecir("un cliente se molestó", 200);
    await mover(p, suTitulo(p, "sentimiento"));

    await decir("cierre");
    await alDecir("tus sesiones", 200);
    await mover(p, suTitulo(p, "sesiones"));
    await alDecir("tus ventas y gastos", 200);
    await mover(p, suTitulo(p, "ventas"));
    await alDecir("tus productos", 200);
    await mover(p, suTitulo(p, "productos"));
    await alDecir("los créditos de IA", 200);
    await mover(p, suTitulo(p, "sistema"));
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
    escribirLaVozDelVideo("informes", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
    console.log("  ✓ demostracion.webm", Math.round(statSync(destino).size / 1024), "KB,", colocados.length, "frases narradas");
}

/* ------------------------------------------------------------------ */

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
    const p = await entrar(ctx, BASE);
    await abrir(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-informes.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/informes`);
