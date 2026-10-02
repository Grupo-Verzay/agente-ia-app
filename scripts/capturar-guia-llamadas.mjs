/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Llamadas, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-llamadas.mjs`).
 *
 * La MISMA receta que la guía de Leads y con las MISMAS piezas del taller
 * (`taller-de-la-guia.mjs`): cada captura es «abre esto, pulsa aquello,
 * resalta este elemento», y las marcas se localizan por lo que la pantalla ya
 * expone —los `data-zona` de la barra, los `data-boton` de la ventana de
 * llamar, los `title` y `aria-label` de cada fila—, no por coordenadas.
 *
 * NADIE se llama: «Llamar» y «Llamar IA» se señalan y la ventana se cierra. Las
 * capturas sí ponen un resultado, un nombre, un callback y el mensaje al no
 * contestar, así que antes del vídeo se vuelve a sembrar.
 *
 * La grabación de ejemplo la contesta este script (`ctx.route`) con un audio
 * propio de la casa: la guía no depende de ningún bucket.
 *
 * Se lanza con `scripts/generar-guia-llamadas.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-llamadas.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "llamadas");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-llamadas";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-llamadas.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-llamadas.json");

/** La grabación de ejemplo (la misma dirección que escribe la semilla). */
const GRABACION = "http://localhost:9000/guia/llamada-de-ejemplo.ogg";
/** Un audio de la casa, sacado de la caché de la voz: ni una voz de nadie. */
const AUDIO_DE_EJEMPLO = (() => {
    const dir = path.join(RAIZ, "scripts", "voz-de-la-guia", "cedar");
    const ogg = readdirSync(dir).filter((f) => f.endsWith(".ogg")).sort()[0];
    return readFileSync(path.join(dir, ogg));
})();

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

async function servirLaGrabacion(ctx) {
    await ctx.route(GRABACION, (route) =>
        route.fulfill({ status: 200, contentType: "audio/ogg", body: AUDIO_DE_EJEMPLO, headers: { "accept-ranges": "bytes" } }),
    );
}

const LA_TABLA = "table[data-tabla-de-llamadas]";
const lasFilas = (p) => p.locator(`${LA_TABLA} tbody tr`);
/** La fila de una llamada por lo que dice (su nombre o su número). */
const laFila = (p, texto) => lasFilas(p).filter({ hasText: texto }).first();
const elNumero = (fila) => fila.locator('button[title="Abrir chat del contacto"]');
const elNombre = (fila) => fila.locator('button[title="Editar el nombre del contacto"]');
const elDetalle = (fila) => fila.locator('button[title="Ver detalle de la llamada"]');
const elResultado = (fila) => fila.locator("button[data-resultado]");
const susPuntos = (fila) => fila.getByRole("button", { name: "Acciones", exact: true });

const LA_BARRA = "[data-barra-de-acciones]";
const zona = (z) => `${LA_BARRA} [data-zona="${z}"]`;
const EL_BUSCADOR = `${zona("buscador")} input`;
const LA_DIRECCION = '[data-grupo="direccion"]';
const laDireccion = (p, nombre) => p.locator(`${LA_DIRECCION} button`, { hasText: nombre }).first();
const ACTUALIZAR = 'button[aria-label="Actualizar"]';
const EL_LLAMAR = '[data-boton="abrir-llamar"]';
const LOS_PUNTOS_DE_LA_BARRA = `${zona("acciones")} button`;
const LA_VENTANA = '[data-dialogo="llamar"]';
const EL_DETALLE = "[data-detalle-de-llamada]";
const EL_MENU = '[role="menu"]';

/** Una llamada de ejemplo para cada cosa. */
const CON_DETALLE = "Mariana Toro";
const SIN_RESULTADO = "Jorge Méndez";

async function abrirLaLista(p) {
    await p.goto(`${BASE}/crm/llamadas`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${LA_TABLA} tbody tr`, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
}

async function laBarra(p) {
    return unir(await caja(p, EL_BUSCADOR), await caja(p, LOS_PUNTOS_DE_LA_BARRA));
}

/** Las `n` primeras filas del historial, con su cabecera. */
async function lasPrimeras(p, n) {
    const cajas = [await caja(p, `${LA_TABLA} thead`)];
    for (let i = 0; i < n; i += 1) cajas.push(await caja(p, lasFilas(p).nth(i)));
    return unir(...cajas);
}

async function abrirLaVentanaDeLlamar(p) {
    await p.locator(EL_LLAMAR).click();
    await p.waitForSelector(`${LA_VENTANA} #llamar-numero`, { timeout: 15000 });
    await espera(p, 700);
}

async function cerrarDialogos(p) {
    for (let i = 0; i < 4 && (await p.$('[role="dialog"], [role="alertdialog"]')); i += 1) {
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }
}

async function abrirElDetalle(p, texto) {
    await elDetalle(laFila(p, texto)).click();
    const d = p.locator(EL_DETALLE).last();
    await d.waitFor({ state: "visible", timeout: 15000 });
    await d.locator('[data-bloque="transcripcion"] p, [data-bloque="transcripcion"] div').first().waitFor({ timeout: 15000 });
    await espera(p, 1500);
    return d;
}

async function abrirSusPuntos(p, texto) {
    const puntos = susPuntos(laFila(p, texto));
    // Se mide ANTES de abrir: con el menú abierto, Radix esconde lo de fuera (aria-hidden).
    const cPuntos = await caja(p, puntos);
    await puntos.click();
    const menu = p.locator(EL_MENU).last();
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    return { cPuntos, menu };
}

async function abrirLosPuntosDeLaBarra(p) {
    await p.locator(LOS_PUNTOS_DE_LA_BARRA).first().click();
    const menu = p.locator(EL_MENU).last();
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    return menu;
}

async function abrirElMensaje(p) {
    const menu = await abrirLosPuntosDeLaBarra(p);
    await menu.getByRole("menuitem", { name: "Mensaje al no contestar" }).click();
    const d = p.locator('[role="dialog"]').filter({ hasText: "Mensaje al no contestar" }).last();
    await d.locator("#missed-call-enabled").waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 600);
    return d;
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
    await mini("vista-general", () => laBarra(p));
    await mini(
        "llamar",
        async () => {
            await abrirLaVentanaDeLlamar(p);
            return caja(p, LA_VENTANA);
        },
        () => cerrarDialogos(p),
    );
    await mini("historial", async () => unir(await caja(p, EL_BUSCADOR), await caja(p, LA_DIRECCION)));
    await mini("abrir-el-chat", () => caja(p, elNumero(laFila(p, CON_DETALLE))));
    await mini("resultado", async () => unir(await caja(p, elResultado(laFila(p, CON_DETALLE))), await caja(p, elResultado(laFila(p, "Andrés Gómez")))));
    await mini("callback", async () => {
        const { cPuntos, menu } = await abrirSusPuntos(p, "Camila Rojas");
        return unir(cPuntos, await caja(p, menu));
    });
    await mini(
        "detalle",
        async () => {
            const d = await abrirElDetalle(p, CON_DETALLE);
            return caja(p, d);
        },
        () => cerrarDialogos(p),
    );
    await mini(
        "mensaje-al-no-contestar",
        async () => {
            const d = await abrirElMensaje(p);
            return caja(p, d);
        },
        () => cerrarDialogos(p),
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
    const zonaDeLaBarra = holgura(unir(barra, { ...barra, y: barra.y + 120, h: 1 }), 22, vista);

    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las cuatro zonas de `ZONAS_DE_LA_PANTALLA`.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: barra, n: 3 },
        { c: await lasPrimeras(p, 9), n: 4 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");

    // La barra de trabajo: sus cinco partes, en el orden de `PARTES_DE_LA_BARRA_DE_TRABAJO`.
    await marcar(p, [
        { c: await caja(p, EL_BUSCADOR), n: 1 },
        { c: await caja(p, LA_DIRECCION), n: 2 },
        { c: await caja(p, ACTUALIZAR), n: 3 },
        { c: await caja(p, EL_LLAMAR), n: 4 },
        { c: await caja(p, LOS_PUNTOS_DE_LA_BARRA), n: 5 },
    ]);
    await guardar(p, "barra.webp", holgura(barra, 34, vista));
    await desmarcar(p);

    // Una llamada: sus siete columnas, numeradas ENCIMA de la fila.
    const fila = laFila(p, CON_DETALLE);
    const cFila = await caja(p, fila);
    const celdas = fila.locator("td");
    // Los números van ENCIMA de la cabecera: sobre ella tapaban su nombre.
    const cCabeza = await caja(p, `${LA_TABLA} thead`);
    const arriba = cCabeza.y - 18;
    const marcas = [];
    for (let i = 0; i < 7; i += 1) {
        const c = await caja(p, celdas.nth(i));
        marcas.push({ c: dentro(c, 2), n: i + 1, numeroEn: { x: c.x + Math.min(c.w / 2, 60), y: arriba } });
    }
    await marcar(p, marcas, { atenuar: true });
    await guardar(p, "fila.webp", holgura({ ...cFila, y: cCabeza.y - 40, h: cFila.y + cFila.h - cCabeza.y + 60 }, 16, vista));
    await desmarcar(p);

    // 2. Llamar o llamar con IA: se señala, nunca se pulsa.
    await marcar(p, [{ c: await caja(p, EL_LLAMAR), texto: "Llamar", lado: "abajo" }]);
    await guardar(p, "llamar-boton.webp", zonaDeLaBarra);
    await desmarcar(p);
    await abrirLaVentanaDeLlamar(p);
    const cVentana = () => caja(p, LA_VENTANA);
    await p.locator(`${LA_VENTANA} #llamar-numero`).pressSequentially("573001234567", { delay: 20 });
    await espera(p, 400);
    await marcar(p, [{ c: await caja(p, `${LA_VENTANA} #llamar-numero`) }]);
    await guardar(p, "llamar-numero.webp", holgura(await cVentana(), 60, vista));
    await marcar(p, [{ c: await caja(p, '[data-boton="llamar"]'), texto: "Hablas tú", lado: "abajo" }]);
    await guardar(p, "llamar-tu.webp", holgura(await cVentana(), 60, vista));
    await marcar(p, [{ c: await caja(p, '[data-boton="llamar-ia"]'), texto: "Habla el asistente", lado: "abajo" }]);
    await guardar(p, "llamar-ia.webp", holgura(await cVentana(), 60, vista));
    await desmarcar(p);
    await cerrarDialogos(p);

    // 3. El historial: dirección, buscar, ordenar y actualizar.
    await laDireccion(p, "Salientes").click();
    await espera(p, 900);
    await marcar(p, [{ c: await caja(p, laDireccion(p, "Salientes")), texto: "Solo las que hiciste", lado: "abajo" }]);
    await guardar(p, "historial-filtro.webp");
    await desmarcar(p);
    await laDireccion(p, "Todas").click();
    await espera(p, 900);
    await p.fill(EL_BUSCADOR, "Mariana");
    await espera(p, 900);
    await marcar(p, [{ c: await caja(p, EL_BUSCADOR) }, { c: await caja(p, lasFilas(p).first()), texto: "Solo sus llamadas", lado: "abajo" }]);
    await guardar(p, "historial-buscar.webp", holgura(unir(barra, await caja(p, lasFilas(p).first()), { ...(await caja(p, lasFilas(p).first())), h: 140 }), 40, vista));
    await desmarcar(p);
    await p.fill(EL_BUSCADOR, "");
    await espera(p, 900);
    const fecha = p.locator(`${LA_TABLA} thead button`, { hasText: "Duración" }).first();
    await fecha.click();
    await espera(p, 900);
    await marcar(p, [{ c: await caja(p, fecha) }], { atenuar: false });
    await guardar(p, "historial-ordenar.webp", holgura(await lasPrimeras(p, 6), 30, vista));
    await desmarcar(p);
    await fecha.click();
    await espera(p, 400);
    await p.locator(`${LA_TABLA} thead button`, { hasText: "Fecha" }).first().click();
    await espera(p, 400);
    await p.locator(`${LA_TABLA} thead button`, { hasText: "Fecha" }).first().click();
    await espera(p, 900);
    await abrirLaLista(p);
    await marcar(p, [{ c: await caja(p, ACTUALIZAR), texto: "Trae las nuevas", lado: "abajo" }]);
    await guardar(p, "historial-actualizar.webp", zonaDeLaBarra);
    await desmarcar(p);

    // 4. Abrir el chat: el número azul y sus tres puntos.
    const numero = elNumero(laFila(p, CON_DETALLE));
    await marcar(p, [{ c: await caja(p, numero), texto: "Abre su chat", lado: "derecha" }], { atenuar: true });
    await guardar(p, "chat-numero.webp", holgura(await lasPrimeras(p, 4), 30, vista));
    await desmarcar(p);
    {
        const { cPuntos, menu } = await abrirSusPuntos(p, CON_DETALLE);
        const cMenu = await caja(p, menu);
        await marcar(p, [{ c: cPuntos, n: 1 }, { c: await caja(p, menu.getByRole("menuitem", { name: "Abrir chat" })), n: 2, esquina: "derecha" }], {
            atenuar: true,
        });
        await guardar(p, "chat-menu.webp", holgura(unir(cMenu, cPuntos, { ...cMenu, x: cMenu.x - 380 }), 30, vista));
        await desmarcar(p);
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }
    await numero.click();
    await p.waitForURL(/\/chats/, { timeout: 60000 });
    await p.locator("[data-hilo-de-chat] [data-message-id]").first().waitFor({ state: "visible", timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await apartarLoQueTapa(p);
    await esconderLosBotonesDelBorde(p);
    await marcar(p, [{ c: await caja(p, "[data-hilo-de-chat]"), texto: "Su conversación, lista para escribirle", lado: "abajo" }]);
    await guardar(p, "chat-abierto.webp");
    await desmarcar(p);
    await abrirLaLista(p);

    // 5. El resultado: marcarlo, las cinco opciones, la propuesta de la IA y el nombre.
    const sinResultado = elResultado(laFila(p, SIN_RESULTADO));
    await marcar(p, [{ c: await caja(p, sinResultado), texto: "Marcar resultado", lado: "abajo" }], { atenuar: true });
    await guardar(p, "resultado-marcar.webp", holgura(await lasPrimeras(p, 8), 30, vista));
    await desmarcar(p);
    const cSinResultado = await caja(p, sinResultado);
    const cFilaSinResultado = await caja(p, laFila(p, SIN_RESULTADO));
    await sinResultado.click();
    let menu = p.locator(EL_MENU).last();
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cOpciones = await caja(p, menu);
    await marcar(p, [{ c: cSinResultado, n: 1 }, { c: cOpciones, n: 2, esquina: "derecha" }], { atenuar: true });
    await guardar(p, "resultado-opciones.webp", holgura(unir(cOpciones, cFilaSinResultado), 40, vista));
    await desmarcar(p);
    await menu.getByRole("menuitem", { name: "Interesado", exact: true }).click();
    await espera(p, 1500);
    await quitarAvisos(p);
    const deIa = elResultado(laFila(p, CON_DETALLE));
    await marcar(p, [{ c: await caja(p, deIa), texto: "El destello: lo propuso la IA", lado: "abajo" }], { atenuar: true });
    await guardar(p, "resultado-ia.webp", holgura(await lasPrimeras(p, 5), 30, vista));
    await desmarcar(p);
    // Por su POSICIÓN: al empezar a escribir, la fila deja de decir «Poner nombre».
    const textos = await lasFilas(p).allInnerTexts();
    const sinNombre = lasFilas(p).nth(textos.findIndex((t) => t.includes("Poner nombre")));
    await elNombre(sinNombre).click();
    const campo = sinNombre.locator('input[placeholder="Nombre del contacto"]');
    await campo.waitFor({ state: "visible", timeout: 10000 });
    await campo.pressSequentially("Daniela Herrera", { delay: 20 });
    await espera(p, 400);
    await campo.evaluate((el) => { el.scrollLeft = 0; });
    await marcar(p, [{ c: await caja(p, campo), texto: "Enter lo guarda", lado: "abajo" }], { atenuar: true });
    await guardar(p, "resultado-nombre.webp", holgura(unir(await caja(p, sinNombre), { ...(await caja(p, sinNombre)), y: (await caja(p, sinNombre)).y - 160 }, { ...(await caja(p, sinNombre)), h: 110 }), 30, vista));
    await desmarcar(p);
    await p.keyboard.press("Enter");
    await espera(p, 1500);
    await quitarAvisos(p);

    // 6. El callback.
    {
        const { cPuntos, menu: m } = await abrirSusPuntos(p, "Camila Rojas");
        const cMenu = await caja(p, m);
        await marcar(p, [{ c: cPuntos, n: 1 }, { c: await caja(p, m.getByRole("menuitem", { name: "Agendar callback" })), n: 2, esquina: "derecha" }], {
            atenuar: true,
        });
        await guardar(p, "callback-menu.webp", holgura(unir(cMenu, cPuntos, { ...cMenu, x: cMenu.x - 380 }), 30, vista));
        await desmarcar(p);
        await m.getByRole("menuitem", { name: "Agendar callback" }).click();
    }
    const cb = p.locator('[role="dialog"]').filter({ hasText: "Agendar callback" }).last();
    await cb.locator('input[type="datetime-local"]').waitFor({ state: "visible", timeout: 10000 });
    await cb.locator('input[placeholder="Motivo o detalle del callback"]').fill("Quiere hablar el lunes del catálogo");
    await espera(p, 500);
    await marcar(p, [
        { c: await caja(p, cb.locator('input[type="datetime-local"]')), n: 1, esquina: "derecha" },
        { c: await caja(p, cb.locator('input[placeholder="Motivo o detalle del callback"]')), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "callback-ventana.webp", holgura(await caja(p, cb), 50, vista));
    await desmarcar(p);
    await cb.getByRole("button", { name: "Agendar" }).click();
    await p.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
    await espera(p, 900);
    await marcar(p, [{ c: await caja(p, p.locator("[data-sonner-toast]").last()), texto: "Queda en Mis tareas", lado: "arriba" }]);
    await guardar(p, "callback-listo.webp");
    await desmarcar(p);
    await quitarAvisos(p);

    // 7. El detalle: abrirlo, la grabación, el resumen y la transcripción.
    const detalle = elDetalle(laFila(p, CON_DETALLE));
    await marcar(p, [{ c: await caja(p, detalle), texto: "Abre la llamada entera", lado: "abajo" }], { atenuar: true });
    await guardar(p, "detalle-abrir.webp", holgura(await lasPrimeras(p, 4), 30, vista));
    await desmarcar(p);
    const d = await abrirElDetalle(p, CON_DETALLE);
    const cD = await caja(p, d);
    const grabacion = d.locator("div", { hasText: "Grabación" }).filter({ has: p.locator("audio") }).last();
    await marcar(p, [{ c: await caja(p, grabacion) }]);
    await guardar(p, "detalle-grabacion.webp", holgura(cD, 30, vista));
    await marcar(p, [{ c: await caja(p, d.locator('[data-bloque="resumen"]')) }]);
    await guardar(p, "detalle-resumen.webp", holgura(cD, 30, vista));
    await marcar(p, [{ c: await caja(p, d.locator('[data-bloque="transcripcion"]')) }]);
    await guardar(p, "detalle-transcripcion.webp", holgura(cD, 30, vista));
    await desmarcar(p);
    await cerrarDialogos(p);

    // 8. El mensaje al no contestar.
    const cPuntosBarra = await caja(p, LOS_PUNTOS_DE_LA_BARRA);
    menu = await abrirLosPuntosDeLaBarra(p);
    const cMenuBarra = await caja(p, menu);
    await marcar(p, [
        { c: cPuntosBarra, n: 1 },
        { c: await caja(p, menu.getByRole("menuitem", { name: "Mensaje al no contestar" })), n: 2, numeroEn: { x: cMenuBarra.x - 20, y: cMenuBarra.y + 50 } },
    ]);
    await guardar(p, "mensaje-menu.webp", holgura(unir(cMenuBarra, cPuntosBarra, { ...cMenuBarra, x: cMenuBarra.x - 420 }), 30, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);
    const m = await abrirElMensaje(p);
    await m.locator("#missed-call-enabled").click();
    await m.locator("textarea").fill("Hola, te llamé y no pude comunicarme contigo. ¿A qué hora te queda bien que te vuelva a llamar?");
    await espera(p, 500);
    await marcar(p, [
        { c: await caja(p, m.locator("#missed-call-enabled")), n: 1, esquina: "derecha" },
        { c: await caja(p, m.locator("textarea")), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "mensaje-ventana.webp", holgura(await caja(p, m), 50, vista));
    await marcar(p, [{ c: await caja(p, m.getByRole("button", { name: "Guardar" })), texto: "Guardar", lado: "abajo" }]);
    await guardar(p, "mensaje-guardar.webp", holgura(unir(await caja(p, m), { ...(await caja(p, m)), h: (await caja(p, m)).h + 70 }), 30, vista));
    await desmarcar(p);
    await m.getByRole("button", { name: "Guardar" }).click();
    await espera(p, 1500);
    await quitarAvisos(p);
    await cerrarDialogos(p);

    await abrirLaLista(p);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Bandeja", texto: "Llamadas está en Bandeja" });
}

/** La «Guía rápida» de Chats se abre sola la primera vez, con un velo encima. */
async function apartarLoQueTapa(p) {
    for (let i = 0; i < 8; i += 1) {
        if (!(await p.$('div[data-state="open"].fixed.inset-0'))) return;
        const cerrar = p.locator('[role="dialog"] button:has-text("Close")').first();
        if (await cerrar.count()) await cerrar.click({ force: true }).catch(() => {});
        else await p.keyboard.press("Escape");
        await espera(p, 400);
    }
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
    // La «Guía rápida» de Chats se da por vista: si no, su ventana se come el primer clic.
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem("chat-onboarding-shown", "1");
        } catch {
            /* sin almacenamiento, se aparta a mano */
        }
    });
    await servirLaGrabacion(ctx);
    const p = await ctx.newPage();
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, sinGrabarLaEspera, tramos, cortes } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    try {
        await abrirLaLista(p);
        await p.mouse.move(640, 400, { steps: 8 });
        const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
        await decir("intro");
        await alDecir("llamas a tus clientes", 300);
        await mover(p, p.locator(EL_LLAMAR));
        await alDecir("revisas cada llamada", 300);
        await mover(p, laFila(p, CON_DETALLE));

        // El menú: se abre con las dos flechas, se señala Bandeja y se vuelve a recoger.
        const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
        const bandeja = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Bandeja" }).first();
        await decir("menu");
        await alDecir("con estas dos flechas");
        await pulsar(p, flechas);
        await alDecir("dentro de Bandeja", 500);
        await mover(p, bandeja);

        const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
        await decir("barraDeArriba");
        await pulsar(p, flechas);
        await alDecir("el buscador general");
        await mover(p, buscarTodo.first());
        await alDecir("el botón de soporte");
        await mover(p, soporte.first());
        await alDecir("tus notificaciones");
        await mover(p, campana.first());

        // Llamar: la ventana, el número, y los dos botones SEÑALADOS. Se cierra sin llamar.
        const ventana = p.locator(LA_VENTANA).last();
        await decir("llamar");
        await pulsar(p, p.locator(EL_LLAMAR));
        await ventana.waitFor({ state: "visible", timeout: 10000 });
        await alDecir("escribes el número", 200);
        await pulsar(p, ventana.locator("#llamar-numero"));
        await ventana.locator("#llamar-numero").pressSequentially("573001234567", { delay: 55 });
        await alDecir("con Llamar hablas tú", 200);
        await mover(p, ventana.locator('[data-boton="llamar"]'));
        await alDecir("con Llamar IA", 200);
        await mover(p, ventana.locator('[data-boton="llamar-ia"]'));
        await alDecir("habla con tu cliente", 400);
        await p.keyboard.press("Escape");
        await ventana.waitFor({ state: "hidden", timeout: 10000 });

        // El historial: dirección y buscador.
        const buscador = p.locator(EL_BUSCADOR);
        await decir("historial");
        await alDecir("con Salientes", 100);
        await pulsar(p, laDireccion(p, "Salientes"));
        await alDecir("con Entrantes", 100);
        await pulsar(p, laDireccion(p, "Entrantes"));
        await alDecir("y con el buscador", 100);
        await pulsar(p, laDireccion(p, "Todas"));
        await pulsar(p, buscador);
        await buscador.pressSequentially("Mariana", { delay: 90 });

        // Abrir el chat: el número azul; la carga de Chats no se graba.
        await decir("chat");
        await alDecir("el número azul", 200);
        await mover(p, elNumero(laFila(p, CON_DETALLE)));
        await sinGrabarLaEspera(async () => {
            await elNumero(laFila(p, CON_DETALLE)).click();
            await p.waitForURL(/\/chats/, { timeout: 60000 });
            await p.locator("[data-hilo-de-chat] [data-message-id]").first().waitFor({ state: "visible", timeout: 90000 });
            await p.getByText("Cargando mensajes…").waitFor({ state: "hidden", timeout: 60000 });
            await p.evaluate(() => document.fonts.ready);
            await apartarLoQueTapa(p);
            await esconderLosBotonesDelBorde(p);
            await p.mouse.move(800, 500, { steps: 2 });
            await espera(p, 400);
        });
        await decir("chatAbierto");
        await alDecir("su conversación ya abierta", 200);
        await mover(p, p.locator("[data-hilo-de-chat] [data-message-id]").last());

        // De vuelta: tampoco se graba la carga.
        await sinGrabarLaEspera(async () => {
            await abrirLaLista(p);
            await p.mouse.move(640, 400, { steps: 2 });
            await espera(p, 300);
        });

        // El resultado: el de la IA y marcar uno.
        await decir("resultado");
        await alDecir("en Resultado", 100);
        await pulsar(p, elResultado(laFila(p, SIN_RESULTADO)));
        const opciones = p.locator(EL_MENU).last();
        await opciones.waitFor({ state: "visible", timeout: 10000 });
        await pulsar(p, opciones.getByRole("menuitem", { name: "Volver a llamar", exact: true }));
        await alDecir("lleva un destello", 100);
        await mover(p, elResultado(laFila(p, CON_DETALLE)));

        // El callback: sus tres puntos, la ventana, y se cancela.
        await decir("callback");
        await alDecir("en sus tres puntos", 100);
        await pulsar(p, susPuntos(laFila(p, "Camila Rojas")));
        const menuFila = p.locator(EL_MENU).last();
        await menuFila.waitFor({ state: "visible", timeout: 10000 });
        await pulsar(p, menuFila.getByRole("menuitem", { name: "Agendar callback" }));
        const cb = p.locator('[role="dialog"]').filter({ hasText: "Agendar callback" }).last();
        await cb.waitFor({ state: "visible", timeout: 10000 });
        await alDecir("con fecha y hora", 100);
        await mover(p, cb.locator('input[type="datetime-local"]'));
        await alDecir("te queda como tarea", 200);
        await mover(p, cb.getByRole("button", { name: "Agendar" }));
        await cerrarDialogos(p);

        // El detalle: grabación, resumen y transcripción.
        await decir("detalle");
        await alDecir("al pulsar el detalle", 100);
        await pulsar(p, elDetalle(laFila(p, CON_DETALLE)));
        const d = p.locator(EL_DETALLE).last();
        await d.waitFor({ state: "visible", timeout: 10000 });
        await alDecir("la grabación", 100);
        await mover(p, d.locator("audio").locator(".."));
        await alDecir("el resumen", 100);
        await mover(p, d.locator('[data-bloque="resumen"] p').first());
        await alDecir("y la transcripción", 100);
        await mover(p, d.locator('[data-bloque="transcripcion"]'));
        await cerrarDialogos(p);

        // El mensaje al no contestar: se abre y se cancela.
        await decir("mensaje");
        await alDecir("en los tres puntos de la barra", 100);
        await pulsar(p, p.locator(LOS_PUNTOS_DE_LA_BARRA).first());
        const menuBarra = p.locator(EL_MENU).last();
        await menuBarra.waitFor({ state: "visible", timeout: 10000 });
        await pulsar(p, menuBarra.getByRole("menuitem", { name: "Mensaje al no contestar" }));
        const cfg = p.locator('[role="dialog"]').filter({ hasText: "Mensaje al no contestar" }).last();
        await cfg.locator("#missed-call-enabled").waitFor({ state: "visible", timeout: 10000 });
        await alDecir("quien no te contesta", 100);
        await mover(p, cfg.locator("#missed-call-enabled"));
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
        mezclar(mudo, pista, destino, { desdeMs, cortes });
        for (const c of cortes) console.log(`  · sin grabar ${((c.hastaMs - c.desdeMs) / 1000).toFixed(1)} s de carga`);
        writeFileSync(path.join(TMP, "narracion.json"), JSON.stringify(colocados, null, 2));
        escribirLaVozDelVideo("llamadas", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS, cortes });
        console.log("  ✓ demostracion.webm", Math.round(statSync(destino).size / 1024), "KB,", colocados.length, "frases narradas");
    } catch (e) {
        await p.screenshot({ path: path.join(TMP, "error-del-video.png") }).catch(() => {});
        console.error("[guia] el vídeo se cayó en", p.url(), "— foto en", path.join(TMP, "error-del-video.png"));
        throw e;
    }
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
    await servirLaGrabacion(ctx);
    const p = await entrar(ctx, BASE);
    await abrirLaLista(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-llamadas.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/llamadas`);
