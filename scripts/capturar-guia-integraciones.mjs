/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Integrar URLs,
 * sobre la App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-integraciones.mjs`).
 *
 * La MISMA forma que la de Leads, Catálogo, Diagramas y Mis notas: cada
 * captura es una receta —abre esto, pulsa aquello, resalta este elemento— y
 * las marcas se dibujan encima de la pantalla real. Lo que no depende de la
 * pantalla —entrar, medir, marcar, guardar, las miniaturas, el marco (el menú y
 * la barra de arriba) y la narración (`decir`/`alDecir`/`callar`)— viene del
 * taller común de las guías (`taller-de-la-guia.mjs`). Aquí van solo las
 * recetas de Integrar URLs.
 *
 * Los elementos se localizan por lo que la pantalla ya expone —los `title` de
 * los botones de la fila, que son también lo que el banco compara con la guía,
 * y las marcas `data-*` de `MainIntegraciones` y de la cabecera de Chats—,
 * nunca por coordenadas.
 *
 * Las apps de ejemplo son de `mi-negocio.co` y NO se piden a la red: cada
 * contexto las contesta con una página de ejemplo (`lasAppsDeEjemplo`), así la
 * pestaña de la app en Chats sale llena y la guía no depende de una web ajena.
 *
 * Las capturas CAMBIAN los datos (agregan, editan y eliminan apps), así que
 * antes del vídeo se vuelve a sembrar: el vídeo sale del mismo punto de
 * partida que la primera captura.
 *
 * Se lanza con `scripts/generar-guia-integraciones.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-integraciones.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "integraciones");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-integraciones";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
/** Solo el vídeo: las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-integraciones.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-integraciones.json");
const SEMILLA = path.join(RAIZ, "scripts", "sembrar-guia-integraciones.mjs");

/** La conversación de la bandeja que se abre en las capturas y en el vídeo (la semilla la pone). */
const CHAT = `${BASE}/chats?jid=${encodeURIComponent("573004521876@s.whatsapp.net")}&instance=BANCO_VENTAS`;

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Las apps de ejemplo                                                 */
/* ------------------------------------------------------------------ */

/** Qué enseña cada app de ejemplo, por su subdominio. */
const PAGINAS = {
    pedidos: {
        titulo: "Nuevo pedido",
        cuerpo: `
          <label>Cliente<input value="María Fernanda López"></label>
          <label>Producto<select><option>Caja grande</option></select></label>
          <div class="dos"><label>Cantidad<input value="2"></label><label>Entrega<input value="Viernes"></label></div>
          <label>Notas<textarea>Entregar en la tarde.</textarea></label>
          <button>Registrar pedido</button>`,
    },
    cotizador: {
        titulo: "Cotizador",
        cuerpo: `
          <label>Producto<select><option>Caja grande</option></select></label>
          <div class="dos"><label>Cantidad<input value="200"></label><label>Ciudad<input value="Medellín"></label></div>
          <p class="total">Total estimado <b>$1.840.000</b></p>
          <button>Enviar cotización</button>`,
    },
    catalogo: {
        titulo: "Catálogo de productos",
        cuerpo: `<div class="rejilla">${["Caja grande", "Caja mediana", "Bolsa ecológica", "Papel de regalo"]
            .map((n, i) => `<div class="producto"><div class="foto" style="background:hsl(${210 + i * 30} 70% 88%)"></div><b>${n}</b><span>$${(12 + i * 4) * 1000}</span></div>`)
            .join("")}</div>`,
    },
    inventario: {
        titulo: "Inventario de bodega",
        cuerpo: `<table><tr><th>Producto</th><th>Unidades</th></tr>${[
            ["Caja grande", 340],
            ["Caja mediana", 125],
            ["Bolsa ecológica", 980],
        ]
            .map(([n, u]) => `<tr><td>${n}</td><td>${u}</td></tr>`)
            .join("")}</table>`,
    },
    agenda: {
        titulo: "Agenda de citas",
        cuerpo: `<div class="rejilla">${["9:00", "10:30", "12:00", "15:00"].map((h) => `<div class="producto"><b>${h}</b><span>Disponible</span></div>`).join("")}</div>`,
    },
};

function laPaginaDe(url) {
    const sub = new URL(url).hostname.split(".")[0];
    const pagina = PAGINAS[sub] ?? { titulo: "Mi app", cuerpo: "<p>Contenido de la app.</p>" };
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${pagina.titulo}</title><style>
      body{margin:0;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;background:#f6f7fb;color:#1f2937}
      header{background:#2563eb;color:#fff;padding:14px 22px;font-weight:600;font-size:16px}
      main{max-width:520px;margin:22px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px 22px;display:flex;flex-direction:column;gap:12px}
      label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#6b7280}
      input,select,textarea{font:inherit;color:#111827;border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;background:#fff}
      .dos{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      button{font:inherit;font-weight:600;background:#2563eb;color:#fff;border:0;border-radius:8px;padding:10px}
      .total{display:flex;justify-content:space-between;margin:4px 0;font-size:15px}
      .rejilla{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .producto{border:1px solid #e5e7eb;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:4px}
      .foto{height:70px;border-radius:8px}
      table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px;border-bottom:1px solid #e5e7eb}
    </style></head><body><header>${pagina.titulo}</header><main>${pagina.cuerpo}</main></body></html>`;
}

/** Contesta las apps de ejemplo sin salir a la red. Va en CADA contexto: el de las capturas y el del vídeo. */
async function lasAppsDeEjemplo(ctx) {
    await ctx.route(/^https:\/\/[a-z]+\.mi-negocio\.co\//, (route) =>
        route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: laPaginaDe(route.request().url()) }),
    );
}

/* ------------------------------------------------------------------ */
/* Dónde está cada cosa                                                */
/* ------------------------------------------------------------------ */

const BARRA = "[data-barra-de-acciones]";
const LISTA = "[data-lista-de-integraciones]";
const PIE = "[data-pie-de-integraciones]";
const VENTANA = "[data-ventana-de-integracion]";
const BUSCADOR = `${BARRA} [data-zona="buscador"] input`;
const NUEVO = `${BARRA} [data-zona="crear"] button`;

/** Una fila de la lista, por el nombre de su app. */
const laFila = (p, nombre) => p.locator("[data-fila-de-integracion]", { has: p.locator(`p[title="${nombre}"]`) }).first();
/** Un mando de una fila, por el nombre que enseña al posar el cursor. */
const elMando = (p, nombre, titulo) => laFila(p, nombre).locator(`[title="${titulo}"]`).first();
/** El asa de una fila (su `title` cambia con la búsqueda). */
const elAsa = (p, nombre) => laFila(p, nombre).locator("[data-asa-de-integracion]");
/** Una pestaña de la conversación, la que se VE: la cabecera pinta dos filas (móvil y escritorio). */
const laPestana = (p, texto) => p.locator("[data-pestana-del-chat]", { hasText: texto }).filter({ visible: true }).first();

/** El ratón, fuera de todo: un botón con el cursor encima sale resaltado. */
const apartar = (p) => p.mouse.move(p.viewportSize().width - 30, p.viewportSize().height - 30);

async function abrirIntegraciones(p) {
    await p.goto(`${BASE}/integraciones`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${LISTA} [data-fila-de-integracion]`, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 1500);
    await despejar(p);
    // Los botones del borde (nota rápida, copiloto, equipo) son de TODAS las
    // pantallas: aquí tapan los mandos de la fila y no explican nada de esta.
    await esconderLosBotonesDelBorde(p);
    await apartar(p);
}

async function abrirElChat(p) {
    await p.goto(CHAT, { waitUntil: "domcontentloaded" });
    await laPestana(p, "Mensajes").waitFor({ state: "visible", timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2000);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
    await apartar(p);
}

/** La ventana de crear o editar, ya abierta y quieta. */
async function laVentana(p) {
    const v = p.locator(VENTANA);
    await v.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    return v;
}

/** Abre «Nuevo» y deja escrito lo que se pida (sin guardar). */
async function nuevaConDatos(p, nombre, direccion) {
    await p.locator(NUEVO).click();
    const v = await laVentana(p);
    await v.locator("#intg-nombre").fill(nombre);
    await v.locator("#intg-url").fill(direccion);
    await apartar(p);
    return v;
}

/** Cierra la ventana de una app, un menú o una confirmación sin guardar nada. */
async function cerrarLasVentanas(p) {
    for (let i = 0; i < 3; i += 1) {
        if (!(await p.$('[role="dialog"], [role="alertdialog"], [role="menu"]'))) break;
        await p.keyboard.press("Escape");
        await espera(p, 350);
    }
}

/**
 * Espera a que salga el aviso de lo que se acaba de hacer y a que se vaya. La
 * fila se pinta al momento (antes de que conteste el servidor), así que
 * `quitarAvisos` a secas llegaba ANTES del aviso y la foto lo sacaba encima del
 * pie.
 */
async function trasElAviso(p) {
    await p.locator("[data-sonner-toast]").first().waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await quitarAvisos(p);
}

/** Suelta el foco del buscador: su anillo se lee como una marca más. */
const soltarElBuscador = (p) => p.locator(BUSCADOR).evaluate((el) => el.blur());

/** Las filas de la lista, de la primera a la última. */
async function lasFilas(p) {
    const filas = await p.locator("[data-fila-de-integracion]").evaluateAll((fs) =>
        fs.map((f) => {
            const r = f.getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height };
        }),
    );
    return unir(...filas);
}

/**
 * La ventana del portátil en la que se toman las fotos de la lista: a 1440 una
 * fila es una tira ilegible. Con 720 de alto queda sitio entre la última fila y
 * el pie para el rótulo de una marca: con menos, el rótulo caía encima del pie.
 */
const PORTATIL = { width: 1024, height: 720 };

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

/**
 * Una miniatura por sección, con la receta de todas las guías
 * (`tomarLasMiniaturas` del taller): aquí solo se dice qué zona explica cada
 * sección. Las de una ventana la abren y la dejan escrita; `despues` la
 * cierra sin guardar. La de los chats va la última: es la única que sale de
 * la pantalla de Integrar URLs.
 */
async function miniaturas(p) {
    await tomarLasMiniaturas(
        p,
        [
            ["vista-general", async () => unir(await caja(p, BARRA), await lasFilas(p))],
            ["agregar", async () => caja(p, await nuevaConDatos(p, "Agenda de citas", "agenda.mi-negocio.co"))],
            // La fila entera: con solo los dos botones la miniatura no dice de qué app son.
            ["abrir-y-editar", async () => caja(p, laFila(p, "Cotizador"))],
            ["ordenar-y-buscar", async () => unir(await caja(p, BUSCADOR), await caja(p, laFila(p, "Formulario de pedidos")), await caja(p, laFila(p, "Cotizador")))],
            ["eliminar", async () => {
                await elMando(p, "Inventario", "Eliminar").click();
                const alerta = p.locator('[role="alertdialog"]');
                await alerta.waitFor({ state: "visible", timeout: 10000 });
                await espera(p, 500);
                await apartar(p);
                return caja(p, alerta);
            }],
            ["cuando-no-abre", async () => {
                const v = await nuevaConDatos(p, "Hoja de precios", "hoja de precios");
                await v.getByRole("button", { name: "Agregar" }).click();
                await v.locator('[data-error-del-campo="direccion"]').waitFor({ state: "visible", timeout: 10000 });
                await espera(p, 300);
                await apartar(p);
                return caja(p, v);
            }],
            ["en-los-chats", async () => {
                await abrirElChat(p);
                await laPestana(p, "Formulario de pedidos").click();
                const marco = p.frameLocator("iframe").first();
                await marco.locator("button").first().waitFor({ state: "visible", timeout: 20000 });
                await espera(p, 800);
                await apartar(p);
                return unir(await caja(p, laPestana(p, "Formulario de pedidos")), await caja(p, "iframe"));
            }],
        ],
        { salida: SALIDA, tomadas, focos: FOCOS, despues: () => cerrarLasVentanas(p) },
    );
    await abrirIntegraciones(p);
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
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: await caja(p, BARRA), n: 3 },
        { c: await lasFilas(p), n: 4 },
        { c: holgura(await caja(p, PIE), 4, grande), n: 5, esquina: "centro" },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // Lo que es de la lista se fotografía en una ventana de PORTÁTIL: a 1440
    // la barra y cada fila salen en tiras tan largas que en la guía se leen
    // diminutas.
    await p.setViewportSize(PORTATIL);
    await espera(p, 1200);
    const vista = PORTATIL;

    const cBarra = await caja(p, BARRA);
    await marcar(p, [
        { c: await caja(p, BUSCADOR), n: 1 },
        { c: await caja(p, NUEVO), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "barra.webp", holgura(cBarra, 30, vista));
    await desmarcar(p);

    // Una fila: los mandos van pegados, así que llevan solo su número, debajo.
    const cFila = await caja(p, laFila(p, "Cotizador"));
    await marcar(
        p,
        [
            { c: await caja(p, elAsa(p, "Cotizador")), n: 1, sinRecuadro: true, esquina: "centro", borde: "abajo" },
            { c: await caja(p, laFila(p, "Cotizador").locator("[data-texto-de-la-fila]")), n: 2, esquina: "derecha" },
            { c: await caja(p, elMando(p, "Cotizador", "Abrir en nueva pestaña")), n: 3, sinRecuadro: true, esquina: "centro", borde: "abajo" },
            { c: await caja(p, elMando(p, "Cotizador", "Editar")), n: 4, sinRecuadro: true, esquina: "centro", borde: "abajo" },
            { c: await caja(p, elMando(p, "Cotizador", "Eliminar")), n: 5, sinRecuadro: true, esquina: "centro", borde: "abajo" },
        ],
        { atenuar: true },
    );
    await guardar(p, "fila.webp", { x: cFila.x - 16, y: cFila.y - 14, w: cFila.w + 32, h: cFila.h + 50 });
    await desmarcar(p);

    /* 2. Agregar una app --------------------------------------------- */
    const zonaDeArriba = { x: cBarra.x, y: cBarra.y - 10, w: cBarra.w, h: 250 };
    await marcar(p, [{ c: await caja(p, NUEVO), texto: "Agrega una app", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "agregar-boton.webp", holgura(zonaDeArriba, 8, vista));
    await desmarcar(p);

    // La dirección SIN «https://»: la guía dice que se le pone sola, y la
    // foto siguiente la enseña ya con él.
    const ventana = await nuevaConDatos(p, "Agenda de citas", "agenda.mi-negocio.co");
    await marcar(p, [
        { c: await caja(p, ventana.locator("#intg-nombre")), n: 1, esquina: "derecha" },
        { c: await caja(p, ventana.locator("#intg-url")), n: 2, esquina: "derecha" },
        { c: await caja(p, ventana.getByRole("button", { name: "Agregar" })), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "agregar-ventana.webp", holgura(await caja(p, ventana), 24, vista));
    await desmarcar(p);
    await ventana.getByRole("button", { name: "Agregar" }).click();
    await laFila(p, "Agenda de citas").waitFor({ state: "visible", timeout: 15000 });
    await trasElAviso(p);
    await apartar(p);

    const cLista = await lasFilas(p);
    await marcar(p, [{ c: await caja(p, laFila(p, "Agenda de citas")), texto: "La nueva, al final de la lista", lado: "abajo" }], { atenuar: true });
    await guardar(p, "agregar-lista.webp", holgura({ x: cLista.x, y: cLista.y, w: cLista.w, h: cLista.h + 90 }, 12, vista));
    await desmarcar(p);

    /* 3. Tu app dentro de los chats ---------------------------------- */
    await p.setViewportSize(grande);
    await abrirElChat(p);
    const cCabeceraDelChat = await caja(p, "[data-cabecera-de-chat]");
    const pestanasDeApps = [];
    for (const n of ["Formulario de pedidos", "Cotizador", "Catálogo de productos"]) pestanasDeApps.push(await caja(p, laPestana(p, n)));
    await marcar(
        p,
        [
            // Mensajes y Notas, a la luz y sin recuadro: son las de siempre, y
            // pegadas a las apps sus dos recuadros se leían como uno partido.
            { c: unir(await caja(p, laPestana(p, "Mensajes")), await caja(p, laPestana(p, "Notas"))), soloLuz: true },
            { c: unir(...pestanasDeApps), texto: "Tus apps, una pestaña cada una", lado: "abajo" },
        ],
        { atenuar: true },
    );
    // Un poco de la bandeja a la izquierda: sin ella, el recuadro de Mensajes sale cortado.
    await guardar(p, "chats-pestanas.webp", holgura({ ...cCabeceraDelChat, x: cCabeceraDelChat.x - 24, w: cCabeceraDelChat.w + 24, h: cCabeceraDelChat.h + 120 }, 0, grande));
    await desmarcar(p);

    await laPestana(p, "Formulario de pedidos").click();
    await p.frameLocator("iframe").first().locator("button").first().waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 800);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, laPestana(p, "Formulario de pedidos")) }, { c: dentro(await caja(p, "iframe"), 4), texto: "La app, en el sitio de la conversación", lado: "izquierda" }]);
    await guardar(p, "chats-app.webp");
    await desmarcar(p);

    await laPestana(p, "Mensajes").click();
    await espera(p, 1200);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, laPestana(p, "Mensajes")), texto: "Vuelve a la conversación", lado: "abajo" }], { atenuar: true });
    // El rótulo de Mensajes se centra en la pestaña y sale por la izquierda de la cabecera.
    await guardar(p, "chats-mensajes.webp", holgura({ ...cCabeceraDelChat, x: cCabeceraDelChat.x - 120, w: cCabeceraDelChat.w + 120, h: cCabeceraDelChat.h + 300 }, 0, grande));
    await desmarcar(p);

    /* 4. Abrir y editar ---------------------------------------------- */
    await p.setViewportSize(PORTATIL);
    await abrirIntegraciones(p);
    const cFilas = await lasFilas(p);
    await marcar(p, [{ c: await caja(p, elMando(p, "Catálogo de productos", "Abrir en nueva pestaña")), texto: "Abrir en nueva pestaña", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "abrir-boton.webp", holgura({ ...cFilas, h: cFilas.h + 30 }, 12, vista));
    await desmarcar(p);

    await elMando(p, "Cotizador", "Editar").click();
    const edicion = await laVentana(p);
    await apartar(p);
    await marcar(p, [
        { c: await caja(p, edicion.locator("#intg-nombre")), n: 1, esquina: "derecha" },
        { c: await caja(p, edicion.locator("#intg-url")), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "editar-ventana.webp", holgura(await caja(p, edicion), 24, vista));
    await desmarcar(p);
    await edicion.locator("#intg-nombre").fill("Cotizador de envíos");
    await edicion.getByRole("button", { name: "Guardar" }).click();
    await laFila(p, "Cotizador de envíos").waitFor({ state: "visible", timeout: 15000 });
    await trasElAviso(p);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, laFila(p, "Cotizador de envíos").locator("[data-texto-de-la-fila]")), texto: "Ya con el nombre nuevo", lado: "abajo" }], { atenuar: true });
    await guardar(p, "editar-guardado.webp", holgura({ ...cFilas, h: cFilas.h + 30 }, 12, vista));
    await desmarcar(p);

    /* 5. Ordenar y buscar -------------------------------------------- */
    const asa = elAsa(p, "Agenda de citas");
    await laFila(p, "Agenda de citas").hover();
    await espera(p, 300);
    await marcar(p, [{ c: await caja(p, laFila(p, "Agenda de citas")), soloLuz: true }, { c: await caja(p, asa), texto: "Agarra por aquí y arrastra", lado: "abajo" }], { atenuar: true });
    // Desde el borde izquierdo: el rótulo se centra en el asa, que está pegada al borde de la lista.
    await guardar(p, "ordenar-asa.webp", holgura({ x: 0, y: cFilas.y, w: cFilas.x + cFilas.w, h: cFilas.h + 90 }, 12, vista));
    await desmarcar(p);

    const buscador = p.locator(BUSCADOR);
    await buscador.fill("pedidos");
    await espera(p, 800);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, buscador), texto: "Por nombre o por dirección", lado: "derecha" }, { c: await lasFilas(p) }], { atenuar: true });
    await guardar(p, "buscar.webp", holgura({ x: cBarra.x, y: cBarra.y, w: cBarra.w, h: 200 }, 12, vista));
    await desmarcar(p);

    // Con la búsqueda puesta el pie queda a la vista: en una ventana baja la
    // foto no se come la pantalla vacía de en medio.
    await p.setViewportSize({ width: PORTATIL.width, height: 440 });
    await espera(p, 1000);
    await soltarElBuscador(p);
    await marcar(
        p,
        [
            { c: await caja(p, elAsa(p, "Formulario de pedidos")), texto: "Apagada mientras buscas", lado: "abajo" },
            { c: await caja(p, PIE), texto: "Borra la búsqueda para volver a ordenar", lado: "arriba" },
        ],
        { atenuar: true },
    );
    await guardar(p, "buscar-sin-ordenar.webp");
    await desmarcar(p);
    await buscador.fill("");
    await soltarElBuscador(p);
    await p.setViewportSize(PORTATIL);
    await espera(p, 1000);

    /* 6. Eliminar ---------------------------------------------------- */
    await apartar(p);
    // La que se agregó en la sección 2, igual que en el vídeo: es la última, y
    // su rótulo cae en el hueco de debajo sin tapar otra fila.
    await marcar(p, [{ c: await caja(p, elMando(p, "Agenda de citas", "Eliminar")), texto: "Eliminar", lado: "abajo" }], { atenuar: true });
    // Hasta el borde de la ventana: el rótulo, centrado en la papelera, sale por la derecha de la lista.
    await guardar(p, "eliminar-boton.webp", holgura({ ...cFilas, w: vista.width - cFilas.x - 12, h: cFilas.h + 90 }, 12, vista));
    await desmarcar(p);

    await elMando(p, "Agenda de citas", "Eliminar").click();
    const alerta = p.locator('[role="alertdialog"]');
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, alerta.getByRole("button", { name: "Cancelar" })), texto: "Cancelar no cambia nada", lado: "abajo" }]);
    const cAlerta = await caja(p, alerta);
    await guardar(p, "eliminar-confirmar.webp", holgura({ x: cAlerta.x - 24, y: cAlerta.y - 14, w: cAlerta.w + 48, h: cAlerta.h + 14 + 64 }, 0, vista));
    await desmarcar(p);
    await alerta.getByRole("button", { name: "Eliminar" }).click();
    await laFila(p, "Agenda de citas").waitFor({ state: "detached", timeout: 15000 });
    await trasElAviso(p);
    await apartar(p);
    const cSinInventario = await lasFilas(p);
    await marcar(p, [{ c: cSinInventario }, { c: await caja(p, PIE), texto: "Una menos", lado: "arriba" }], { atenuar: true });
    await guardar(p, "eliminar-listo.webp");
    await desmarcar(p);

    /* 7. Cuando una app no se abre ----------------------------------- */
    const rota = await nuevaConDatos(p, "Hoja de precios", "hoja de precios");
    await rota.getByRole("button", { name: "Agregar" }).click();
    const error = rota.locator('[data-error-del-campo="direccion"]');
    await error.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 300);
    await apartar(p);
    await marcar(p, [{ c: unir(await caja(p, rota.locator("#intg-url")), await caja(p, error)), texto: "Te dice qué corregir", lado: "derecha" }]);
    const cRota = await caja(p, rota);
    await guardar(p, "no-abre-ventana.webp", holgura({ ...cRota, w: cRota.w + 200 }, 24, vista));
    await desmarcar(p);
    await cerrarLasVentanas(p);

    // Una app guardada ANTES de las reglas de hoy: la semilla la pone aparte.
    execFileSync("node", [SEMILLA], { stdio: "inherit", env: { ...process.env, CON_UNA_ROTA: "1" } });
    await abrirIntegraciones(p);
    const cConLaRota = await lasFilas(p);
    await marcar(p, [{ c: await caja(p, laFila(p, "Hoja de precios").locator("[data-aviso-de-la-fila]")), texto: "Edítala con el lápiz", lado: "abajo" }], { atenuar: true });
    await guardar(p, "no-abre-fila.webp", holgura({ ...cConLaRota, h: cConLaRota.h + 90 }, 12, vista));
    await desmarcar(p);

    await marcar(p, [{ c: await caja(p, elMando(p, "Inventario", "Abrir en nueva pestaña")), texto: "Ábrela en su propia pestaña", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "no-abre-aparte.webp", holgura({ ...cConLaRota, h: cConLaRota.h + 30 }, 12, vista));
    await desmarcar(p);

    /* El marco: el menú y la barra de arriba ------------------------- */
    await p.setViewportSize(grande);
    await espera(p, 1000);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Apps Externas", texto: "Integrar URLs está en Apps Externas" });
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cuánto se respira entre una frase y la siguiente: lo justo para que no se
 * monten, y no más —el ritmo lo pone la voz, no el guion—. Es el mismo de las
 * otras guías. Queda escrito en `voz-de-la-guia/integraciones.json` con el
 * vídeo.
 */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

/** Arrastra una fila por su asa hasta el sitio de otra, como lo haría una persona. */
async function arrastrar(p, desde, hasta) {
    const a = await desde.boundingBox();
    const b = await hasta.boundingBox();
    if (!a || !b) throw new Error("[guia] no se ve la fila que el vídeo tenía que arrastrar");
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 18 });
    await espera(p, 200);
    await p.mouse.down();
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 8, { steps: 4 });
    await p.mouse.move(a.x + a.width / 2, b.y + 4, { steps: 30 });
    await espera(p, 250);
    await p.mouse.up();
    await espera(p, 400);
}

/**
 * El vídeo: qué se hace en pantalla mientras suena cada frase de
 * `narracion-guia-integraciones.mjs`. La voz se coloca con
 * `empezarLaNarracion` del taller y se graba con la grabadora de todas las
 * guías.
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
    await lasAppsDeEjemplo(ctx);
    await ctx.addInitScript(CURSOR);
    const p = await ctx.newPage();
    // No `recordVideo`: estiraba el vídeo cada vez que el navegador pintaba
    // deprisa y la imagen se iba quedando detrás de la voz (ver la grabadora).
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirIntegraciones(p);
    await p.mouse.move(640, 400, { steps: 8 });
    // Lo grabado hasta aquí es la página cargando: el vídeo empieza justo
    // antes de la primera palabra.
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("tus apps web favoritas", 600);
    await mover(p, laFila(p, "Formulario de pedidos"));
    await alDecir("dentro de cada chat", 400);
    await mover(p, laFila(p, "Catálogo de productos"));

    // El menú de la izquierda: se abre con las dos flechas, se señala dónde
    // está Integrar URLs y se vuelve a recoger al empezar la frase siguiente,
    // que es la de la barra donde viven las flechas.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const appsExternas = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Apps Externas" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Apps Externas", 600);
    await mover(p, appsExternas);

    const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // Agregar: la ventana, el nombre, la dirección y «Agregar».
    await decir("agregar");
    await alDecir("el botón Nuevo");
    await pulsar(p, p.locator(NUEVO));
    const ventana = await laVentana(p);
    await alDecir("le pones un nombre", 300);
    await pulsar(p, ventana.locator("#intg-nombre"));
    await ventana.locator("#intg-nombre").pressSequentially("Agenda de citas", { delay: 40 });
    await alDecir("pegas su dirección", 300);
    await pulsar(p, ventana.locator("#intg-url"));
    await ventana.locator("#intg-url").fill("https://agenda.mi-negocio.co");
    await alDecir("al pulsar Agregar", 400);
    await pulsar(p, ventana.getByRole("button", { name: "Agregar" }));
    await laFila(p, "Agenda de citas").waitFor({ state: "visible", timeout: 15000 });
    await alDecir("queda en la lista", 300);
    await mover(p, laFila(p, "Agenda de citas"));

    // En los chats: la pestaña de la app y la app abierta dentro.
    await decir("enLosChats");
    await alDecir("abre cualquier chat", 200);
    await p.goto(CHAT, { waitUntil: "domcontentloaded" });
    await laPestana(p, "Mensajes").waitFor({ state: "visible", timeout: 90000 });
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
    await alDecir("una pestaña más", 400);
    await mover(p, laPestana(p, "Formulario de pedidos"));
    await alDecir("al lado de Mensajes", 300);
    await mover(p, laPestana(p, "Mensajes"));
    await alDecir("se abre ahí mismo", 400);
    await pulsar(p, laPestana(p, "Formulario de pedidos"));
    await p.frameLocator("iframe").first().locator("button").first().waitFor({ state: "visible", timeout: 20000 });
    await alDecir("sin salir de la conversación", 300);
    await mover(p, p.locator("iframe").first());

    // De vuelta: abrir aparte y editar.
    await decir("editar");
    await abrirIntegraciones(p);
    await alDecir("con la flecha", 400);
    await mover(p, elMando(p, "Cotizador", "Abrir en nueva pestaña"));
    await alDecir("con el lápiz", 400);
    await pulsar(p, elMando(p, "Cotizador", "Editar"));
    const edicion = await laVentana(p);
    await alDecir("el nombre o la dirección", 300);
    await mover(p, edicion.locator("#intg-url"));

    // Ordenar: la última, arriba del todo; y el buscador.
    await decir("ordenar");
    await p.keyboard.press("Escape");
    await espera(p, 300);
    await alDecir("por sus puntos", 500);
    await arrastrar(p, elAsa(p, "Agenda de citas"), laFila(p, "Formulario de pedidos"));
    await alDecir("con el buscador", 400);
    const buscador = p.locator(BUSCADOR);
    await pulsar(p, buscador);
    await buscador.pressSequentially("pedidos", { delay: 90 });
    await alDecir("por su nombre", 300);
    await mover(p, laFila(p, "Formulario de pedidos"));

    // Eliminar: la papelera y la confirmación.
    await decir("cierre");
    await buscador.fill("");
    await alDecir("pulsa la papelera", 450);
    await pulsar(p, elMando(p, "Agenda de citas", "Eliminar"));
    const alerta = p.locator('[role="alertdialog"]');
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("y confirma", 350);
    await pulsar(p, alerta.getByRole("button", { name: "Eliminar" }));
    await alDecir("deja de salir en tus chats", 300);
    await mover(p, p.locator(PIE));
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
    escribirLaVozDelVideo("integraciones", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
    await lasAppsDeEjemplo(ctx);
    const p = await entrar(ctx, BASE);
    await abrirIntegraciones(p);
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

// Las que la guía enseña tienen que estar TODAS. Con SOLO_MINIATURAS o
// SOLO_VIDEO, lo demás se conserva del disco: basta con que esté.
comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/integraciones`);
