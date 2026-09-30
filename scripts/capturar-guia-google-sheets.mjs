/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Google Sheets,
 * sobre la App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-google-sheets.mjs`).
 *
 * La MISMA forma que las de Leads, Catálogo, Diagramas, Reuniones y Mis notas:
 * cada captura es una receta —abre esto, pulsa aquello, resalta este
 * elemento— y las marcas se dibujan encima de la pantalla real. Lo que no
 * depende de la pantalla —entrar, medir, marcar, guardar, las miniaturas, el
 * marco (el menú y la barra de arriba) y la narración— viene del taller común
 * (`taller-de-la-guia.mjs`). Aquí van solo las recetas de Google Sheets.
 *
 * ## La hoja de dentro es una hoja de EJEMPLO
 *
 * La pantalla incrusta la hoja de Google en un iframe (`docs.google.com`).
 * Desde donde se generan las guías no se llega a Google, y aunque se llegara,
 * la hoja de verdad pide una cuenta de Google con sesión. Así que las
 * peticiones a `docs.google.com` se contestan aquí con una hoja de ejemplo
 * (`HOJA_DE_EJEMPLO`): una rejilla neutra con sus pestañas abajo, sin marca de
 * nadie, con los datos de un negocio inventado. Todo lo DEMÁS —la tarjeta de
 * vincular, la barra de la hoja, los avisos, el guardado— es la pantalla de
 * verdad hablando con la base de verdad.
 *
 * Los elementos se localizan por las marcas que la pantalla ya expone
 * (`data-tarjeta-de-vincular`, `data-paso`, `data-boton`, `data-motivo`,
 * `data-barra-de-la-hoja`, `data-hoja-incrustada`…), nunca por coordenadas.
 *
 * Las capturas CAMBIAN los datos (vinculan, cambian y quitan la hoja), así que
 * se vuelve a sembrar antes de empezar y antes del vídeo: los dos salen de la
 * cuenta SIN hoja.
 *
 * Se lanza con `scripts/generar-guia-google-sheets.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-google-sheets.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "google-sheets");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-google-sheets";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
/** Solo el vídeo: las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-google-sheets.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-google-sheets.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/** La guía compilada por el lanzador: los enlaces que no sirven salen de ahí, no de una copia. */
const { ENLACES_QUE_NO_SIRVEN, PESTANA_DE_LAS_CITAS } = await import(
    new URL("../lib/__tests__/.compilado/guia-google-sheets/guia-google-sheets.mjs", import.meta.url).href
);

/* ------------------------------------------------------------------ */
/* La hoja de ejemplo                                                  */
/* ------------------------------------------------------------------ */

/** La hoja que se vincula en la guía, y la que la sustituye al cambiar de hoja. */
export const HOJA = "https://docs.google.com/spreadsheets/d/1mNegocioVentasYCitas2026HojaDeEjemplo0Guia/edit#gid=0";
export const OTRA_HOJA = "https://docs.google.com/spreadsheets/d/1pInventarioDeLaTienda2026HojaDeEjemplo1Guia/edit#gid=0";

const COLUMNAS_DE_LAS_CITAS = ["Formulario", "Fecha", "WhatsApp", "Nombre", "¿Qué servicio necesitas?", "¿Algún comentario?"];
const REGISTRO_CITA = {
    gid: "882034519",
    nombre: PESTANA_DE_LAS_CITAS,
    columnas: COLUMNAS_DE_LAS_CITAS,
    anchos: [130, 130, 140, 150, 190, 210],
    filas: [
        ["Agenda tu cita", "28/09/2026 09:14", "+57 300 555 0142", "Camila Andrade", "Limpieza dental", "Prefiero en la mañana"],
        ["Agenda tu cita", "29/09/2026 16:02", "+57 311 555 0187", "Juan Pérez", "Valoración", ""],
        ["Agenda tu cita", "30/09/2026 10:35", "+57 320 555 0119", "Laura Gómez", "Blanqueamiento", "¿Tienen parqueadero?"],
        ["Agenda tu cita", "30/09/2026 11:48", "+57 315 555 0163", "Andrés Ruiz", "Limpieza dental", ""],
        ["Agenda tu cita", "30/09/2026 15:20", "+57 301 555 0175", "Sofía Martínez", "Ortodoncia", "Es para mi hija"],
    ],
};

/** Los libros de ejemplo, por el id del enlace. La primera pestaña es la del enlace (`#gid=0`). */
const LIBROS = {
    "1mNegocioVentasYCitas2026HojaDeEjemplo0Guia": [
        {
            gid: "0",
            nombre: "Ventas",
            columnas: ["Fecha", "Cliente", "Producto", "Cantidad", "Total", "Estado"],
            anchos: [110, 160, 190, 90, 110, 120],
            filas: [
                ["22/09/2026", "Camila Andrade", "Kit de limpieza", "2", "$ 96.000", "Pagado"],
                ["23/09/2026", "Juan Pérez", "Cepillo eléctrico", "1", "$ 185.000", "Pagado"],
                ["24/09/2026", "Laura Gómez", "Enjuague bucal", "3", "$ 54.000", "Pendiente"],
                ["25/09/2026", "Andrés Ruiz", "Hilo dental x3", "2", "$ 38.000", "Pagado"],
                ["26/09/2026", "Sofía Martínez", "Kit de limpieza", "1", "$ 48.000", "Pagado"],
                ["27/09/2026", "Mateo López", "Cepillo eléctrico", "1", "$ 185.000", "Pendiente"],
                ["28/09/2026", "Valentina Díaz", "Pasta blanqueadora", "4", "$ 72.000", "Pagado"],
                ["29/09/2026", "Daniel Torres", "Enjuague bucal", "2", "$ 36.000", ""],
                ["30/09/2026", "Isabella Rojas", "Kit de limpieza", "1", "$ 48.000", "Pagado"],
            ],
        },
        {
            gid: "1571920533",
            nombre: "Clientes",
            columnas: ["Nombre", "WhatsApp", "Ciudad", "Último pedido"],
            anchos: [170, 150, 130, 130],
            filas: [
                ["Camila Andrade", "+57 300 555 0142", "Bogotá", "22/09/2026"],
                ["Juan Pérez", "+57 311 555 0187", "Medellín", "23/09/2026"],
                ["Laura Gómez", "+57 320 555 0119", "Cali", "24/09/2026"],
                ["Andrés Ruiz", "+57 315 555 0163", "Bogotá", "25/09/2026"],
                ["Sofía Martínez", "+57 301 555 0175", "Barranquilla", "26/09/2026"],
            ],
        },
        REGISTRO_CITA,
    ],
    "1pInventarioDeLaTienda2026HojaDeEjemplo1Guia": [
        {
            gid: "0",
            nombre: "Inventario",
            columnas: ["Producto", "Referencia", "Existencias", "Precio"],
            anchos: [190, 120, 110, 110],
            filas: [
                ["Kit de limpieza", "KL-01", "34", "$ 48.000"],
                ["Cepillo eléctrico", "CE-02", "12", "$ 185.000"],
                ["Enjuague bucal", "EB-03", "58", "$ 18.000"],
                ["Hilo dental x3", "HD-04", "40", "$ 19.000"],
                ["Pasta blanqueadora", "PB-05", "26", "$ 18.000"],
            ],
        },
        {
            gid: "402918337",
            nombre: "Proveedores",
            columnas: ["Proveedor", "Contacto", "Teléfono"],
            anchos: [190, 160, 150],
            filas: [
                ["Distribuidora Sonrisa", "Marta Cárdenas", "+57 604 555 0120"],
                ["Higiene Total", "Pedro Vargas", "+57 601 555 0148"],
            ],
        },
        REGISTRO_CITA,
    ],
};

/**
 * La página que se sirve en lugar de `docs.google.com`: una hoja de cálculo
 * neutra, con la rejilla (columnas por letra y filas por número), las celdas
 * editables y las pestañas abajo. Abre la pestaña del `#gid=` del enlace, que
 * es lo que hace la hoja de verdad.
 */
function laHojaDeEjemplo(url) {
    const id = /\/spreadsheets\/d\/([^/]+)/.exec(url)?.[1] ?? "";
    const libro = LIBROS[id] ?? LIBROS["1mNegocioVentasYCitas2026HojaDeEjemplo0Guia"];
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hoja</title><style>
html,body{margin:0;height:100%;background:#fff;color:#1f2937;font:13px Arial,Helvetica,sans-serif}
.hoja{display:flex;flex-direction:column;height:100%}
.rejilla{flex:1;overflow:hidden}
table{border-collapse:collapse;table-layout:fixed}
th,td{border:1px solid #e3e5e8;height:25px;padding:0 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
thead th{background:#f4f5f7;color:#6b7280;font-weight:400;text-align:center}
tbody th{background:#f4f5f7;color:#6b7280;font-weight:400;text-align:center}
tr[data-encabezados] td{font-weight:700;background:#f9fafb}
td{cursor:cell}
td:focus{outline:2px solid #2563eb;outline-offset:-2px}
.pestanas{display:flex;align-items:stretch;gap:2px;height:38px;border-top:1px solid #e3e5e8;background:#f4f5f7;padding:0 10px}
.pestanas button{border:0;background:transparent;padding:0 18px;font:inherit;color:#4b5563;cursor:pointer}
.pestanas button[aria-selected=true]{background:#fff;color:#065f46;font-weight:700;box-shadow:inset 0 -3px 0 #10b981}
</style></head><body><div class="hoja"><div class="rejilla"><table data-tabla></table></div>
<div class="pestanas" data-pestanas role="tablist"></div></div><script>
const LIBRO = ${JSON.stringify(libro)};
const LETRAS = "ABCDEFGHIJ";
const tabla = document.querySelector("[data-tabla]");
const barra = document.querySelector("[data-pestanas]");
function pintar(gid) {
  const hoja = LIBRO.find((h) => h.gid === gid) ?? LIBRO[0];
  const n = Math.max(hoja.columnas.length + 2, 8);
  const anchos = [42, ...hoja.anchos, ...Array(n - hoja.anchos.length).fill(100)];
  let h = "<colgroup>" + anchos.map((w) => '<col style="width:' + w + 'px">').join("") + "</colgroup>";
  h += "<thead><tr><th></th>" + Array.from({ length: n }, (_, i) => "<th>" + LETRAS[i] + "</th>").join("") + "</tr></thead><tbody>";
  const filas = [hoja.columnas, ...hoja.filas];
  for (let r = 0; r < 40; r++) {
    const f = filas[r] ?? [];
    const marca = r === 0 ? " data-encabezados" : r < filas.length ? " data-fila" : "";
    h += "<tr" + marca + "><th>" + (r + 1) + "</th>" + Array.from({ length: n }, (_, i) => '<td contenteditable="true">' + (f[i] ?? "") + "</td>").join("") + "</tr>";
  }
  tabla.innerHTML = h + "</tbody>";
  barra.innerHTML = LIBRO.map((p) => '<button role="tab" data-pestana="' + p.nombre + '" aria-selected="' + (p.gid === hoja.gid) + '">' + p.nombre + "</button>").join("");
  for (const b of barra.querySelectorAll("button")) b.onclick = () => pintar(LIBRO.find((p) => p.nombre === b.dataset.pestana).gid);
}
pintar((/gid=(\\d+)/.exec(location.hash) ?? [])[1] ?? LIBRO[0].gid);
</script></body></html>`;
}

/** Contesta las peticiones a Google con la hoja de ejemplo, en TODO el contexto (el iframe incluido). */
async function conLaHojaDeEjemplo(contexto) {
    await contexto.route(/^https:\/\/docs\.google\.com\//, (route) =>
        route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: laHojaDeEjemplo(route.request().url()) }),
    );
    // «Copiar link» y el botón del correo escriben en el portapapeles.
    await contexto.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
}

/* ------------------------------------------------------------------ */
/* Dónde está cada cosa                                                */
/* ------------------------------------------------------------------ */

const TARJETA = "[data-tarjeta-de-vincular]";
const PASO_COMPARTIR = `${TARJETA} [data-paso="compartir"]`;
const PASO_ENLACE = `${TARJETA} [data-paso="enlace"]`;
const CAMPO = `${PASO_ENLACE} input`;
const MOTIVO = `${PASO_ENLACE} [data-motivo]`;
const SIN_HOJA = "[data-sin-hoja]";
const LA_HOJA = "[data-hoja-vinculada]";
const BARRA = "[data-barra-de-la-hoja]";
const IFRAME = "[data-hoja-incrustada]";

/** Un botón de la pantalla, por su marca `data-boton`. */
const boton = (p, marca) => p.locator(`[data-boton="${marca}"]`).first();
/** Lo que hay DENTRO de la hoja incrustada. */
const enLaHoja = (p, selector) => p.frameLocator(IFRAME).locator(selector).first();
const laPestanaDeLaHoja = (p, nombre) => enLaHoja(p, `[data-pestana="${nombre}"]`);
/** La última fila CON DATOS: debajo la rejilla sigue con filas vacías, así que `:last-of-type` no la encuentra. */
const laUltimaFila = (p) => p.frameLocator(IFRAME).locator("[data-fila]").last();
/** El pie de la tarjeta: los botones Cancelar / Quitar hoja / Guardar. */
const PIE = `${TARJETA} > div:last-child`;

/** El ratón, fuera de todo: un botón con el cursor encima sale resaltado. */
const apartar = (p) => p.mouse.move(p.viewportSize().width - 30, p.viewportSize().height - 30);

async function abrirGoogleSheets(p) {
    await p.goto(`${BASE}/google-sheets`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("[data-pantalla-de-google-sheets]", { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2000);
    await despejar(p);
    // Los botones del borde (nota rápida, copiloto, equipo) son de TODAS las
    // pantallas: aquí tapan la hoja y no explican nada de Google Sheets.
    await esconderLosBotonesDelBorde(p);
}

/** Vuelve a la cuenta SIN hoja (la semilla) y recarga la pantalla. */
async function sinHoja(p) {
    execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-google-sheets.mjs")], { stdio: "inherit" });
    await abrirGoogleSheets(p);
    await p.locator(TARJETA).waitFor({ state: "visible", timeout: 20000 });
}

/** Espera a que la hoja incrustada esté pintada, con su pestaña abierta. */
async function laHojaCargada(p, pestana = null) {
    await p.locator(LA_HOJA).waitFor({ state: "visible", timeout: 20000 });
    await enLaHoja(p, "[data-fila]").waitFor({ state: "visible", timeout: 20000 });
    if (pestana) await laPestanaDeLaHoja(p, pestana).waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 600);
}

/** Pone un texto en el campo del enlace como lo haría pegarlo. */
async function pegarEnElCampo(p, texto) {
    const campo = p.locator(CAMPO);
    await campo.click();
    await p.keyboard.press("Control+A");
    await p.keyboard.insertText(texto);
    await espera(p, 300);
}

/** Vincula una hoja por la pantalla: la pega y pulsa Guardar. */
async function vincular(p, enlace) {
    await pegarEnElCampo(p, enlace);
    await boton(p, "guardar").click();
    await laHojaCargada(p);
    await quitarAvisos(p);
}

/** Abre la tarjeta con «Cambiar hoja» (la hoja sigue debajo). */
async function abrirLaTarjeta(p) {
    await boton(p, "cambiar").click();
    await p.locator(TARJETA).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
}

/** Cierra lo que haya abierto una miniatura: la confirmación de quitar y la tarjeta. */
async function volverALaHoja(p) {
    if (await p.$('[role="alertdialog"]')) {
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }
    if ((await p.$(TARJETA)) && (await p.$(LA_HOJA))) {
        await boton(p, "cancelar").click();
        await espera(p, 400);
    }
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

/**
 * Una miniatura por sección, con la receta de todas las guías
 * (`tomarLasMiniaturas` del taller): aquí solo se dice qué zona explica cada
 * sección. Se toman con la hoja vinculada; las que necesitan la tarjeta, la
 * confirmación o un aviso lo abren en su propia receta, y `volverALaHoja` lo
 * cierra detrás.
 */
async function miniaturas(p) {
    await sinHoja(p);
    await vincular(p, HOJA);
    await apartar(p);
    await tomarLasMiniaturas(
        p,
        [
            ["vista-general", async () => {
                const barra = await caja(p, BARRA);
                return { x: barra.x, y: barra.y, w: barra.w, h: 360 };
            }],
            ["vincular", async () => {
                await abrirLaTarjeta(p);
                return caja(p, PASO_COMPARTIR);
            }],
            ["tu-hoja", async () => {
                const hoja = await caja(p, IFRAME);
                return { x: hoja.x, y: hoja.y, w: Math.min(hoja.w, 820), h: Math.min(hoja.h, 330) };
            }],
            ["copiar-enlace", async () => caja(p, boton(p, "copiar-enlace"))],
            ["cambiar-de-hoja", async () => {
                await abrirLaTarjeta(p);
                return unir(await caja(p, PASO_ENLACE), await caja(p, PIE));
            }],
            ["quitar-la-hoja", async () => {
                await abrirLaTarjeta(p);
                await boton(p, "quitar").click();
                const dialogo = p.locator("[data-confirmar-quitar]");
                await dialogo.waitFor({ state: "visible", timeout: 10000 });
                await espera(p, 500);
                return caja(p, dialogo);
            }],
            ["enlace-que-no-sirve", async () => {
                await abrirLaTarjeta(p);
                await pegarEnElCampo(p, ENLACES_QUE_NO_SIRVEN[0].ejemplo);
                await boton(p, "guardar").click();
                await p.locator(MOTIVO).waitFor({ state: "visible", timeout: 10000 });
                await apartar(p);
                return caja(p, PASO_ENLACE);
            }],
            ["respuestas-de-citas", async () => {
                await laPestanaDeLaHoja(p, PESTANA_DE_LAS_CITAS).click();
                await espera(p, 500);
                await apartar(p);
                const encabezados = await caja(p, enLaHoja(p, "[data-encabezados]"));
                const ultima = await caja(p, laUltimaFila(p));
                // Hasta la última columna CON datos: el resto de la fila son celdas vacías.
                const anchoDeLosDatos = REGISTRO_CITA.anchos.reduce((a, b) => a + b, 42);
                return { x: encabezados.x, y: encabezados.y, w: anchoDeLosDatos, h: ultima.y + ultima.h - encabezados.y };
            }],
        ],
        { salida: SALIDA, tomadas, focos: FOCOS, despues: () => volverALaHoja(p) },
    );
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();
    // Los recortes de la tarjeta arrancan en el borde del CONTENIDO: con la
    // holgura a secas asomaba el borde del apartado activo del menú lateral,
    // una tira azul pegada al filo que se lee como otra marca.
    const cContenido = await caja(p, "[data-caja-del-contenido]");
    const enElContenido = (z) => {
        const x = Math.max(z.x, cContenido.x);
        return { ...z, x, w: z.x + z.w - x };
    };

    /* Vincular, desde la cuenta SIN hoja ------------------------------ */
    await sinHoja(p);
    await apartar(p);
    const cTarjeta = await caja(p, TARJETA);
    await marcar(p, [
        { c: cTarjeta, texto: "La tarjeta de vincular", lado: "abajo" },
        { c: dentro(await caja(p, SIN_HOJA), 4) },
    ]);
    await guardar(p, "vincular-vacia.webp");
    await desmarcar(p);

    // El correo, con su botón de copiar.
    const cCompartir = await caja(p, PASO_COMPARTIR);
    await marcar(p, [{ c: cCompartir }, { c: await caja(p, boton(p, "copiar-correo")), texto: "Copia el correo", lado: "abajo" }], { atenuar: true });
    await guardar(p, "vincular-correo.webp", enElContenido(holgura(cTarjeta, 16, vista)));
    await desmarcar(p);

    // Los dos enlaces que NO sirven, con el aviso que sale de verdad.
    for (const [ejemplo, nombre] of [
        [ENLACES_QUE_NO_SIRVEN[0].ejemplo, "no-sirve-documento.webp"],
        [ENLACES_QUE_NO_SIRVEN[1].ejemplo, "no-sirve-publicado.webp"],
    ]) {
        await pegarEnElCampo(p, ejemplo);
        await boton(p, "guardar").click();
        await p.locator(MOTIVO).waitFor({ state: "visible", timeout: 10000 });
        await apartar(p);
        await marcar(p, [{ c: await caja(p, CAMPO) }, { c: await caja(p, MOTIVO), texto: "Por qué no se guardó", lado: "abajo" }], { atenuar: true });
        await guardar(p, nombre, enElContenido(holgura(unir(cTarjeta, { x: cTarjeta.x, y: cTarjeta.y + cTarjeta.h, w: cTarjeta.w, h: 70 }), 16, vista)));
        await desmarcar(p);
    }

    // El enlace bueno en el campo: el aviso se va al escribir.
    await pegarEnElCampo(p, HOJA);
    await apartar(p);
    const cCampo = await caja(p, CAMPO);
    await marcar(p, [{ c: cCampo, n: 1, esquina: "derecha" }, { c: await caja(p, boton(p, "guardar")), n: 2 }], { atenuar: true });
    await guardar(p, "no-sirve-corregido.webp", enElContenido(holgura(cTarjeta, 16, vista)));
    await desmarcar(p);

    await marcar(p, [{ c: cCampo, texto: "El enlace de tu hoja", lado: "abajo" }], { atenuar: true });
    await guardar(p, "vincular-enlace.webp", enElContenido(holgura(cTarjeta, 16, vista)));
    await desmarcar(p);

    await marcar(
        p,
        [
            { c: await caja(p, boton(p, "guardar")), texto: "Guardar", lado: "izquierda" },
            { c: await caja(p, boton(p, "cancelar")) },
        ],
        { atenuar: true },
    );
    await guardar(p, "vincular-guardar.webp", enElContenido(holgura(cTarjeta, 16, vista)));
    await desmarcar(p);

    await boton(p, "guardar").click();
    await laHojaCargada(p);
    await p.locator("[data-sonner-toast]").first().waitFor({ state: "visible", timeout: 10000 });
    await apartar(p);
    // El rótulo va en el aviso de «Hoja vinculada», abajo a la derecha, que es
    // lo que confirma el paso; alrededor de la hoja entera no hay sitio.
    const vinculada = p.locator("[data-sonner-toast]", { hasText: "Hoja vinculada" }).first();
    await vinculada.waitFor({ state: "visible", timeout: 10000 });
    await marcar(p, [
        { c: dentro(await caja(p, LA_HOJA), 4) },
        { c: await caja(p, vinculada), texto: "Tu hoja, dentro de la plataforma", lado: "arriba" },
    ]);
    await guardar(p, "vincular-lista.webp");
    await desmarcar(p);
    await quitarAvisos(p);
    await apartar(p);

    /* La pantalla de un vistazo --------------------------------------- */
    // Portada del vídeo: la pantalla con la hoja vinculada.
    await guardar(p, "portada.webp");
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cBarra = await caja(p, BARRA);
    const cHoja = await caja(p, IFRAME);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: dentro(cBarra, 3), n: 3 },
        { c: dentro(cHoja, 6), n: 4 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // La barra de la hoja, en una ventana de PORTÁTIL: a 1440 va de lado a
    // lado y sus tres botones se leerían diminutos en la página de la guía.
    await p.setViewportSize({ width: 1024, height: 700 });
    await espera(p, 1200);
    await apartar(p);
    const cBarraPortatil = await caja(p, BARRA);
    const numerados = [];
    for (const [i, marca] of ["abrir", "copiar-enlace", "cambiar"].entries()) numerados.push({ c: await caja(p, boton(p, marca)), n: i + 1, borde: "abajo", esquina: "centro" });
    await marcar(p, numerados, { atenuar: true });
    await guardar(p, "barra-de-la-hoja.webp", holgura({ x: cBarraPortatil.x, y: cBarraPortatil.y, w: cBarraPortatil.w, h: cBarraPortatil.h + 22 }, 12, p.viewportSize()));
    await desmarcar(p);
    await p.setViewportSize(vista);
    await espera(p, 1200);
    await apartar(p);

    /* Tu hoja dentro de la plataforma --------------------------------- */
    const cHojaEntera = await caja(p, IFRAME);
    await marcar(p, [{ c: dentro(cHojaEntera, 4) }]);
    await guardar(p, "hoja-dentro.webp");
    await desmarcar(p);

    const cPestanas = await caja(p, enLaHoja(p, "[data-pestanas]"));
    const pestanasConDatos = unir(
        await caja(p, laPestanaDeLaHoja(p, "Ventas")),
        await caja(p, laPestanaDeLaHoja(p, PESTANA_DE_LAS_CITAS)),
    );
    await marcar(p, [{ c: pestanasConDatos, texto: "Las pestañas de tu hoja", lado: "arriba" }], { atenuar: true });
    await guardar(p, "hoja-pestanas.webp", holgura({ x: cHojaEntera.x, y: cPestanas.y - 190, w: 820, h: cPestanas.h + 190 }, 12, vista));
    await desmarcar(p);

    const cSoloBarra = holgura({ x: cBarra.x, y: cBarra.y, w: cBarra.w, h: cBarra.h + 90 }, 12, vista);
    await marcar(p, [{ c: await caja(p, boton(p, "abrir")), texto: "Abrir en Google Sheets", lado: "abajo" }], { atenuar: true });
    await guardar(p, "hoja-abrir.webp", cSoloBarra);
    await desmarcar(p);

    /* Copiar el enlace ------------------------------------------------- */
    await marcar(p, [{ c: await caja(p, boton(p, "copiar-enlace")), texto: "Copiar link", lado: "abajo" }], { atenuar: true });
    await guardar(p, "copiar-boton.webp", cSoloBarra);
    await desmarcar(p);

    await pulsar(p, boton(p, "copiar-enlace"));
    const aviso = p.locator("[data-sonner-toast]", { hasText: "Enlace copiado" }).first();
    await aviso.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, boton(p, "copiar-enlace")) }, { c: await caja(p, aviso) }], { atenuar: true });
    await guardar(p, "copiar-hecho.webp");
    await desmarcar(p);
    await quitarAvisos(p);
    await apartar(p);

    const cEnlace = await caja(p, `${BARRA} [title^="https://docs.google.com"]`);
    // El rótulo cuelga del FINAL del enlace: centrado caería sobre los
    // encabezados «Cantidad» y «Total»; ahí cae sobre columnas vacías.
    const finDelEnlace = { x: cEnlace.x + cEnlace.w - 60, y: cEnlace.y, w: 20, h: cEnlace.h };
    await marcar(p, [{ c: cEnlace }, { c: finDelEnlace, sinRecuadro: true, texto: "El enlace de tu hoja", lado: "abajo" }], { atenuar: true });
    await guardar(p, "copiar-enlace-visible.webp", cSoloBarra);
    await desmarcar(p);

    /* Las respuestas de tus citas ------------------------------------- */
    await laPestanaDeLaHoja(p, PESTANA_DE_LAS_CITAS).click();
    await espera(p, 600);
    await apartar(p);
    const cCitas = await caja(p, laPestanaDeLaHoja(p, PESTANA_DE_LAS_CITAS));
    await marcar(p, [{ c: cCitas, texto: PESTANA_DE_LAS_CITAS, lado: "arriba" }], { atenuar: true });
    await guardar(p, "citas-pestana.webp", holgura({ x: cHojaEntera.x, y: cPestanas.y - 190, w: 820, h: cPestanas.h + 190 }, 12, vista));
    await desmarcar(p);

    const cEncabezados = await caja(p, enLaHoja(p, "[data-encabezados]"));
    const cUltimaFila = await caja(p, laUltimaFila(p));
    const anchoDeLosDatos = REGISTRO_CITA.anchos.reduce((a, b) => a + b, 42);
    const cColumnas = { x: cEncabezados.x + 42, y: cEncabezados.y, w: 130 * 2 + 140 + 150, h: cEncabezados.h };
    const cFilas = { x: cEncabezados.x, y: cEncabezados.y, w: anchoDeLosDatos, h: cUltimaFila.y + cUltimaFila.h - cEncabezados.y };
    // Numeradas, no con un rótulo: cualquier rótulo cae encima de las filas,
    // que son justo lo que el paso enseña. Las filas se ven sin recuadro.
    // Los dos recuadros, metidos hacia dentro por el lado que comparten: con
    // su holgura se montarían uno sobre otro en la raya entre D y E.
    const cPreguntas = { x: cColumnas.x + cColumnas.w, y: cEncabezados.y, w: anchoDeLosDatos - 42 - cColumnas.w, h: cEncabezados.h };
    const cLuz = { ...cFilas, h: cFilas.h - 5 }; // hasta el borde de la última fila, sin asomar la siguiente
    await marcar(
        p,
        [
            { c: cLuz, soloLuz: true },
            { c: { ...cColumnas, w: cColumnas.w - 8 }, n: 1 },
            { c: { ...cPreguntas, x: cPreguntas.x + 8, w: cPreguntas.w - 8 }, n: 2 },
        ],
        { atenuar: true },
    );
    await guardar(p, "citas-filas.webp", holgura({ x: cHojaEntera.x, y: cEncabezados.y - 40, w: anchoDeLosDatos + 40, h: cFilas.h + 150 }, 12, vista));
    await desmarcar(p);
    await laPestanaDeLaHoja(p, "Ventas").click();
    await espera(p, 400);

    /* Cambiar de hoja -------------------------------------------------- */
    await apartar(p);
    await marcar(p, [{ c: await caja(p, boton(p, "cambiar")), texto: "Cambiar hoja", lado: "abajo" }], { atenuar: true });
    await guardar(p, "cambiar-boton.webp", cSoloBarra);
    await desmarcar(p);

    await abrirLaTarjeta(p);
    const cTarjetaAbierta = await caja(p, TARJETA);
    await marcar(p, [
        { c: cTarjetaAbierta },
        { c: await caja(p, CAMPO), texto: "El enlace de la hoja actual", lado: "arriba" },
        { c: dentro(await caja(p, LA_HOJA), 4) },
    ]);
    await guardar(p, "cambiar-tarjeta.webp");
    await desmarcar(p);

    // Las respuestas de las citas: la hoja tiene que estar compartida con el correo del paso 1.
    await marcar(p, [{ c: await caja(p, PASO_COMPARTIR), texto: "Compártela como Editor", lado: "arriba" }], { atenuar: true });
    await guardar(p, "citas-compartir.webp", enElContenido(holgura(cTarjetaAbierta, 16, vista)));
    await desmarcar(p);

    await marcar(p, [{ c: await caja(p, boton(p, "cancelar")), texto: "Cancelar no cambia nada", lado: "derecha" }], { atenuar: true });
    await guardar(p, "cambiar-cancelar.webp", enElContenido(holgura(cTarjetaAbierta, 16, vista)));
    await desmarcar(p);
    await boton(p, "cancelar").click();
    await espera(p, 500);

    await abrirLaTarjeta(p);
    await pegarEnElCampo(p, OTRA_HOJA);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, CAMPO), n: 1, esquina: "derecha" }, { c: await caja(p, boton(p, "guardar")), n: 2 }], { atenuar: true });
    await guardar(p, "cambiar-guardar.webp", enElContenido(holgura(await caja(p, TARJETA), 16, vista)));
    await desmarcar(p);
    await boton(p, "guardar").click();
    await laHojaCargada(p, "Inventario");
    await quitarAvisos(p);

    /* El marco: el menú y la barra de arriba ------------------------- */
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Integraciones", texto: "Google Sheets está en Integraciones" });

    /* Quitar la hoja --------------------------------------------------- */
    await abrirLaTarjeta(p);
    const cTarjetaParaQuitar = await caja(p, TARJETA);
    await marcar(p, [{ c: await caja(p, boton(p, "quitar")), texto: "Quitar hoja", lado: "derecha" }], { atenuar: true });
    await guardar(p, "quitar-boton.webp", enElContenido(holgura({ x: cTarjetaParaQuitar.x, y: cTarjetaParaQuitar.y, w: cTarjetaParaQuitar.w, h: cTarjetaParaQuitar.h + 90 }, 16, vista)));
    await desmarcar(p);

    await boton(p, "quitar").click();
    const confirmar = p.locator("[data-confirmar-quitar]");
    await confirmar.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    const cConfirmar = await caja(p, confirmar);
    await marcar(p, [{ c: await caja(p, boton(p, "confirmar-quitar")), texto: "Quitar hoja", lado: "abajo" }]);
    await guardar(p, "quitar-confirmar.webp", holgura({ x: cConfirmar.x - 24, y: cConfirmar.y - 14, w: cConfirmar.w + 48, h: cConfirmar.h + 14 + 70 }, 0, vista));
    await desmarcar(p);

    await boton(p, "confirmar-quitar").click();
    await p.locator(SIN_HOJA).waitFor({ state: "visible", timeout: 20000 });
    await quitarAvisos(p);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, TARJETA) }, { c: dentro(await caja(p, SIN_HOJA), 4), texto: "Sin hoja otra vez", lado: "arriba" }]);
    await guardar(p, "quitar-listo.webp");
    await desmarcar(p);
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cuánto se respira entre una frase y la siguiente: lo justo para que no se
 * monten, y no más —el ritmo lo pone la voz, no el guion—. Es el mismo de
 * Leads, Catálogo, Diagramas, Reuniones y Mis notas. Queda escrito en
 * `voz-de-la-guia/google-sheets.json` con el vídeo.
 */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

/**
 * El vídeo: qué se hace en pantalla mientras suena cada frase de
 * `narracion-guia-google-sheets.mjs`. Empieza en la cuenta SIN hoja y la
 * vincula delante de la cámara.
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
    await conLaHojaDeEjemplo(ctx);
    await ctx.addInitScript(CURSOR);
    const p = await ctx.newPage();
    // No `recordVideo`: estiraba el vídeo cada vez que el navegador pintaba
    // deprisa y la imagen se iba quedando detrás de la voz (ver la grabadora).
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirGoogleSheets(p);
    await p.locator(TARJETA).waitFor({ state: "visible", timeout: 20000 });
    await p.mouse.move(640, 400, { steps: 8 });
    // Lo grabado hasta aquí es la página cargando: el vídeo empieza justo
    // antes de la primera palabra.
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("vinculas tu hoja", 600);
    await mover(p, p.locator(TARJETA));
    await alDecir("dentro de la plataforma", 400);
    await mover(p, p.locator(SIN_HOJA));

    // El menú de la izquierda: se abre con las dos flechas, se señala dónde
    // está Google Sheets y se vuelve a recoger al empezar la frase siguiente,
    // que es la de la barra donde viven las flechas.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const integraciones = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Integraciones" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Integraciones", 600);
    await mover(p, integraciones);

    const [, , , buscarTodo, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // Vincular: copiar el correo, pegar el enlace y guardar.
    await decir("compartir");
    await alDecir("copias este correo", 500);
    await pulsar(p, boton(p, "copiar-correo"));
    await alDecir("como Editor", 400);
    await mover(p, p.locator(`${PASO_COMPARTIR} p`).first());

    await decir("pegar");
    await alDecir("pegas aquí", 500);
    await pulsar(p, p.locator(CAMPO));
    await p.keyboard.insertText(HOJA);
    await alDecir("pulsas Guardar", 500);
    await pulsar(p, boton(p, "guardar"));

    // La hoja: aparece, se edita una celda, se cambia de pestaña, y Abrir.
    await decir("hoja");
    await laHojaCargada(p);
    await alDecir("aparece aquí mismo", 300);
    await mover(p, enLaHoja(p, "[data-fila]:nth-of-type(4) td:nth-of-type(3)"));
    await alDecir("la editas sin salir", 400);
    // La celda de Estado de Daniel Torres, que está en blanco.
    const celda = enLaHoja(p, "[data-fila]:nth-of-type(9) td:nth-of-type(6)");
    await pulsar(p, celda);
    await p.keyboard.type("Pagado", { delay: 55 });
    await alDecir("cambias de pestaña abajo", 400);
    await pulsar(p, laPestanaDeLaHoja(p, "Clientes"));
    await alDecir("con Abrir", 400);
    await mover(p, boton(p, "abrir"));

    await decir("copiar");
    await alDecir("Copiar link", 450);
    await pulsar(p, boton(p, "copiar-enlace"));

    // Cambiar de hoja: vuelve la tarjeta con el enlace puesto, y se cancela.
    await decir("cambiar");
    await alDecir("Cambiar hoja", 450);
    await pulsar(p, boton(p, "cambiar"));
    await alDecir("tu enlace puesto", 350);
    await mover(p, p.locator(CAMPO));
    await alDecir("o cancelas", 450);
    await pulsar(p, boton(p, "cancelar"));

    // Un enlace que no sirve: el aviso con su motivo.
    await decir("noSirve");
    await alDecir("Si pegas un enlace", 500);
    await pulsar(p, boton(p, "cambiar"));
    await pulsar(p, p.locator(CAMPO));
    await p.keyboard.press("Control+A");
    await p.keyboard.insertText(ENLACES_QUE_NO_SIRVEN[0].ejemplo);
    await alDecir("te dice por qué", 450);
    await pulsar(p, boton(p, "guardar"));
    await alDecir("no lo guarda", 300);
    await mover(p, p.locator(MOTIVO));

    // Las respuestas de las citas, en su pestaña.
    await decir("cierre");
    await alDecir("cada vez que un cliente", 450);
    await pulsar(p, boton(p, "cancelar"));
    await alDecir("Registro cita", 450);
    await pulsar(p, laPestanaDeLaHoja(p, PESTANA_DE_LAS_CITAS));
    await alDecir("Así se trabaja", 350);
    await mover(p, enLaHoja(p, "[data-fila]:nth-of-type(3)"));
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
    escribirLaVozDelVideo("google-sheets", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
    await conLaHojaDeEjemplo(ctx);
    const p = await entrar(ctx, BASE);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        // Las capturas cambiaron los datos: el vídeo sale del punto de partida.
        execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-google-sheets.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

// Las que la guía enseña tienen que estar TODAS. Con SOLO_MINIATURAS o
// SOLO_VIDEO, lo demás se conserva del disco: basta con que esté.
comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/google-sheets`);
