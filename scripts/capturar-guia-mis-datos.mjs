/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Mis datos, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-mis-datos.mjs`).
 *
 * La MISMA forma que la de Leads, Catálogo, Diagramas, Reuniones y Mis notas:
 * cada captura es una receta —abre esto, pulsa aquello, resalta este
 * elemento— y las marcas se dibujan encima de la pantalla real. Lo que no
 * depende de la pantalla —entrar, medir, marcar, guardar, las miniaturas, el
 * marco (el menú y la barra de arriba) y la narración— viene del taller común
 * de las guías (`taller-de-la-guia.mjs`). Aquí van solo las recetas de Mis
 * datos.
 *
 * Los elementos se localizan por las marcas `data-*` que la pantalla expone
 * (`data-cabecera-de-mis-datos`, `data-atajo`, `data-importar`…) y por sus
 * rótulos, nunca por coordenadas.
 *
 * Las hojas de Google que se importan las sirve `fingido-guia-mis-datos.mjs`
 * dentro del propio `next start`: este equipo no sale a internet, y una guía no
 * puede depender de una hoja que alguien puede cambiar.
 *
 * Las capturas CAMBIAN los datos (importan una hoja y un texto), así que antes
 * del vídeo se vuelve a sembrar: el vídeo sale del mismo punto de partida que
 * la primera captura.
 *
 * Se lanza con `scripts/generar-guia-mis-datos.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-mis-datos.mjs";
import { guardarWav, mezclar, montarLaPista } from "./voz-de-la-guia.mjs";
import {
    LA_BARRA_DE_ARRIBA,
    caja,
    comprobarLasCapturas,
    conElDominioDeLaGuia,
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
const SALIDA = path.join(RAIZ, "public", "guia", "mis-datos");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-mis-datos";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
/** Solo el vídeo: las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-mis-datos.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-mis-datos.json");

/** La pantalla, y la hoja de clientes que sirve `fingido-guia-mis-datos.mjs`. */
const PANTALLA = "/my-data";
const HOJA_DE_CLIENTES = "https://docs.google.com/spreadsheets/d/1GuiaMisDatosClientesDeEjemplo/edit#gid=0";
/** Uno de los números sembrados: el buscador lo encuentra. */
const UN_NUMERO = "573004522013";

/** El texto que se pega en la base de conocimiento: tres temas, con `###`. */
const TEXTO_DE_LA_BASE = [
    "### Horario de fin de año",
    "Del 24 al 31 de diciembre atendemos de 9:00 a. m. a 2:00 p. m.",
    "",
    "### Cambio de producto",
    "Tienes 15 días desde que recibes tu pedido para cambiarlo, con su empaque.",
    "",
    "### Tarjeta de regalo",
    "Desde $50.000. Se envía por WhatsApp y vale por 6 meses.",
].join("\n");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardarTodo = crearGuardar({ salida: SALIDA, tomadas });
const guardar = guardarTodo;

/* ------------------------------------------------------------------ */
/* Dónde está cada cosa                                                */
/* ------------------------------------------------------------------ */

const CABECERA = "[data-cabecera-de-mis-datos]";
const PORTADA = "[data-portada-de-mis-datos]";
const VOLVER = "[data-volver]";
const tarjeta = (id) => `[data-tarjeta-de-seccion="${id}"]`;
const atajo = (id) => `[data-atajo="${id}"]`;
const pestanas = (id) => `[data-pestanas-de-la-seccion="${id}"]`;
const elMenuDe = (id) => `[data-menu-de-la-seccion="${id}"]`;
const importar = (id) => `[data-importar="${id}"]`;
const gestionar = (id) => `[data-gestionar="${id}"]`;
const resultado = (id) => `[data-resultado-de-la-importacion="${id}"]`;

/** Una pestaña (Importar o Gestionar) de la opción abierta. */
const laPestana = (p, id, rotulo) => p.locator(`${pestanas(id)} [role="tab"]`, { hasText: rotulo }).first();
/** El menú desplegable que se acaba de abrir (Radix lo pinta en un portal). */
const elMenu = (p) => p.locator('[role="menu"]').last();
/** La lista de un selector abierto. */
const laLista = (p) => p.locator('[role="listbox"]').last();
/** Un botón por su rótulo, dentro de algo. */
const elBoton = (p, dentroDe, rotulo) => p.locator(`${dentroDe} button`, { hasText: rotulo }).first();
/** Un bloque de la lista de la base de conocimiento, por su título. */
const elBloque = (p, titulo) => p.locator(`[data-bloque="${titulo}"]`).first();

/** El ratón, fuera de todo: un botón con el cursor encima sale resaltado. */
const apartar = (p) => p.mouse.move(p.viewportSize().width - 30, p.viewportSize().height - 30);

async function abrirMisDatos(p) {
    await p.goto(`${BASE}${PANTALLA}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(PORTADA, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2000);
    await despejar(p);
    // Los botones del borde son de TODAS las pantallas: aquí tapan el «⋯» de
    // cada opción y no explican nada de Mis datos.
    await esconderLosBotonesDelBorde(p);
}

/** Abre una opción con su acceso de la cabecera, en la pestaña pedida. */
async function laOpcion(p, id, pestana = "Importar") {
    await p.locator(atajo(id)).click();
    await p.locator(pestanas(id)).waitFor({ state: "visible", timeout: 20000 });
    await laPestana(p, id, pestana).click();
    await p.locator(pestana === "Importar" ? importar(id) : gestionar(id)).waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 700);
    await apartar(p);
}

/** Vuelve a la portada con la flecha de la cabecera. */
async function aLaPortada(p) {
    if (await p.locator(VOLVER).count()) await p.locator(VOLVER).click();
    await p.waitForSelector(PORTADA, { timeout: 20000 });
    await espera(p, 500);
}

/** Espera a que la tabla de datos importados tenga filas. */
async function laTablaCargada(p) {
    await p.waitForSelector(`${gestionar("sheets")} tbody [data-editar-y-eliminar]`, { timeout: 30000 });
    await espera(p, 600);
}

/** Espera a que la lista de bloques tenga bloques. */
async function losBloquesCargados(p) {
    await p.waitForSelector("[data-lista-de-bloques] [data-bloque]", { timeout: 30000 });
    await espera(p, 600);
}

/** Lo que ocupa un texto de verdad (un párrafo de bloque mide la fila entera). */
async function elTexto(p, locator) {
    await locator.waitFor({ state: "visible", timeout: 20000 });
    return locator.evaluate((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const b = r.getBoundingClientRect();
        return { x: b.left, y: b.top, w: b.width, h: b.height };
    });
}

/** La caja visible del contenido, de la cabecera hacia abajo (lo de la derecha del menú). */
async function elContenido(p) {
    const c = await caja(p, CABECERA);
    const vista = p.viewportSize();
    return { x: c.x, y: c.y, w: c.w, h: vista.height - c.y };
}

/** Una caja abierta `x` píxeles a cada lado y `y` arriba y abajo: su número no tapa el texto. */
const afuera = (c, x, y = 0) => ({ x: c.x - x, y: c.y - y, w: c.w + 2 * x, h: c.h + 2 * y });

/** Recorta una zona a lo que de verdad se ve en la ventana. */
function enLaVentana(c, vista) {
    const x = Math.max(0, c.x);
    const y = Math.max(0, c.y);
    return { x, y, w: Math.min(vista.width, c.x + c.w) - x, h: Math.min(vista.height, c.y + c.h) - y };
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

async function miniaturas(p) {
    const zonas = [
        ["vista-general", async () => {
            await aLaPortada(p);
            return unir(await caja(p, CABECERA), await caja(p, tarjeta("sheets")), await caja(p, tarjeta("knowledge")));
        }],
        ["google-sheets", async () => {
            await laOpcion(p, "sheets", "Importar");
            await p.locator(importar("sheets")).evaluate((el) => el.scrollIntoView({ block: "start" }));
            await espera(p, 300);
            return caja(p, p.locator(`${importar("sheets")} > div`).first());
        }],
        ["datos-importados", async () => {
            await laOpcion(p, "sheets", "Gestionar");
            await laTablaCargada(p);
            const c = await caja(p, p.locator(`${gestionar("sheets")} > div`).first());
            return enLaVentana(c, p.viewportSize());
        }],
        ["base-de-conocimiento", async () => {
            await laOpcion(p, "knowledge", "Importar");
            return caja(p, p.locator(`${importar("knowledge")} > div`).first());
        }],
        ["bloques", async () => {
            await laOpcion(p, "knowledge", "Gestionar");
            await losBloquesCargados(p);
            const c = await caja(p, p.locator(`${gestionar("knowledge")} > div`).first());
            return enLaVentana(c, p.viewportSize());
        }],
        ["acciones", async () => {
            await p.locator(elMenuDe("knowledge")).click();
            await elMenu(p).waitFor({ state: "visible" });
            await espera(p, 500);
            return unir(await caja(p, elMenuDe("knowledge")), await caja(p, elMenu(p)));
        }],
    ];
    await tomarLasMiniaturas(p, zonas, { salida: SALIDA, tomadas, focos: FOCOS });
    await aLaPortada(p);
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();
    await aLaPortada(p);
    await apartar(p);
    // Un recorte que empieza unos píxeles dentro del menú de la izquierda deja
    // una rayita de su opción activa en el borde: se lee como un fallo.
    const cMenu0 = await caja(p, elMenuLateral(p));
    const bordeDelMenu = cMenu0.x + cMenu0.w + 1;
    const guardar = (pp, nombre, c) => guardarTodo(pp, nombre, c && c.x < bordeDelMenu ? { ...c, x: bordeDelMenu, w: c.w - (bordeDelMenu - c.x) } : c);

    // Portada del vídeo: la pantalla limpia.
    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las cuatro zonas, en el orden de
    // `ZONAS_DE_LA_PANTALLA`. El menú y la barra de arriba van metidos unos
    // píxeles: pegados al borde, su recuadro se saldría.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cBarra = await caja(p, LA_BARRA_DE_ARRIBA);
    const cCabecera = await caja(p, CABECERA);
    const cOpciones = unir(await caja(p, tarjeta("sheets")), await caja(p, tarjeta("knowledge")));
    const bajoElMenu = await dondeAcabaElMenu(p);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cBarra, 6), n: 2, esquina: "centro" },
        { c: dentro(cCabecera, 4), n: 3 },
        { c: cOpciones, n: 4 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // La cabecera, con Google Sheets abierta: su acceso sale en azul.
    await laOpcion(p, "sheets", "Importar");
    const cCab = await caja(p, CABECERA);
    const cTitulo = await elTexto(p, p.locator(`${CABECERA} h2`));
    const cAtajos = unir(await caja(p, atajo("sheets")), await caja(p, atajo("knowledge")));
    // Los dos accesos van pegados: UN recuadro para los dos, y cada número sin
    // el suyo (dos recuadros de 9 px se montarían en el hueco de en medio).
    await marcar(p, [
        { c: afuera(cTitulo, 6, 4), n: 1 },
        { c: afuera(cAtajos, 4, 4) },
        { c: await caja(p, atajo("sheets")), n: 2, sinRecuadro: true },
        { c: await caja(p, atajo("knowledge")), n: 3, esquina: "derecha", sinRecuadro: true },
        { c: afuera(await caja(p, atajo("sheets")), 4, 4), texto: "La opción abierta, en azul", lado: "izquierda", sinRecuadro: true },
    ]);
    // La cabecera y la fila de sus pestañas; la tarjeta de debajo, fuera (cortada
    // a media línea se lee como una captura rota).
    const cFila = unir(await caja(p, `${pestanas("sheets")} [role="tablist"]`), await caja(p, elMenuDe("sheets")));
    await guardar(p, "cabecera.webp", holgura(unir(cCab, cFila), 10, vista));
    await desmarcar(p);

    // Dentro de una opción: la flecha de volver, las dos pestañas y el «⋯».
    const cPestanas = await caja(p, pestanas("sheets"));
    await marcar(p, [
        { c: await caja(p, VOLVER), n: 1 },
        { c: await caja(p, `${pestanas("sheets")} [role="tablist"]`), n: 2 },
        { c: await caja(p, elMenuDe("sheets")), n: 3, esquina: "derecha" },
    ]);
    // Hasta el título de la tarjeta de debajo, entero: cortar su descripción a
    // media línea se lee como una captura rota.
    const cTituloDeLaTarjeta = await caja(p, p.locator(`${importar("sheets")} > div > div`).first());
    const cDentro = holgura(unir(cCab, cPestanas, cTituloDeLaTarjeta), 12, vista);
    await guardar(p, "dentro.webp", { ...cDentro, h: cDentro.h - 6 });
    await desmarcar(p);

    // 2. Importar desde Google Sheets.
    const tarjetaDeImportar = p.locator(`${importar("sheets")} > div`).first();
    const enlace = p.locator("#sheet-url");
    await enlace.fill(HOJA_DE_CLIENTES);
    await espera(p, 400);
    const cEnlace = unir(await caja(p, enlace), await caja(p, p.locator(`${importar("sheets")} button[title="Pegar desde portapapeles"]`)));
    // El rótulo va hacia el final del campo, donde no hay texto que tapar.
    await marcar(p, [
        { c: cEnlace },
        { c: { x: cEnlace.x + cEnlace.w - 320, y: cEnlace.y, w: 200, h: cEnlace.h }, texto: "El enlace de tu hoja", lado: "abajo", sinRecuadro: true },
    ]);
    await guardar(p, "sheets-enlace.webp", holgura(await caja(p, tarjetaDeImportar), 16, vista));
    await desmarcar(p);

    // El tipo de datos, con su lista abierta.
    const tipo = p.locator("[data-tipo-de-datos] [role='combobox']");
    await tipo.click();
    await laLista(p).waitFor({ state: "visible" });
    await espera(p, 400);
    await marcar(p, [{ c: await caja(p, tipo), soloLuz: true }, { c: await caja(p, laLista(p)), texto: "Clientes o catálogo", lado: "derecha" }]);
    await guardar(p, "sheets-tipo.webp", holgura(await caja(p, tarjetaDeImportar), 16, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    // Ver columnas de la hoja: la vista previa, con la columna del número elegida.
    await elBoton(p, importar("sheets"), "Ver columnas de la hoja").click();
    await p.waitForSelector("[data-vista-previa]", { timeout: 30000 });
    await espera(p, 800);
    await quitarAvisos(p);
    await tarjetaDeImportar.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await espera(p, 400);
    const cPrevia = await caja(p, "[data-vista-previa]");
    await marcar(p, [
        { c: await caja(p, "[data-vista-previa] [role='combobox']"), n: 1, esquina: "derecha" },
        { c: await caja(p, "[data-vista-previa-tabla]"), n: 2, esquina: "derecha" },
    ]);
    const cTipo = await caja(p, "[data-tipo-de-datos]");
    const cColumnas = holgura(unir(cTipo, cPrevia), 20, vista);
    await guardar(p, "sheets-columnas.webp", { ...cColumnas, y: cTipo.y - 10, h: cColumnas.h - (cTipo.y - 10 - cColumnas.y) });
    await desmarcar(p);

    // Iniciar importación: el registro de actividad y el resumen.
    await elBoton(p, importar("sheets"), "Iniciar importación").click();
    await p.waitForSelector(resultado("sheets"), { timeout: 60000 });
    await espera(p, 800);
    await quitarAvisos(p);
    // Al centro y no pegado al borde de abajo: el recuadro necesita su aire.
    await p.locator("[data-registro-de-actividad]").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 500);
    const cRegistro = await caja(p, "[data-registro-de-actividad]");
    const cResultado = await caja(p, resultado("sheets"));
    // Las dos cajas van pegadas al menú lateral, y el recorte no puede empezar
    // antes que él: el número a la izquierda saldría cortado. A la derecha, y el
    // recuadro por dentro de la caja para que su trazo se vea entero.
    await marcar(p, [
        { c: dentro(cRegistro, 6), n: 1, esquina: "derecha" },
        { c: dentro(cResultado, 6), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "sheets-resultado.webp", holgura(unir(cRegistro, cResultado), 24, vista));
    await desmarcar(p);

    // 3. Los datos importados.
    await laPestana(p, "sheets", "Gestionar").click();
    await laTablaCargada(p);
    await apartar(p);
    const laCard = p.locator(`${gestionar("sheets")} > div`).first();
    const cabeceras = p.locator(`${gestionar("sheets")} thead th`);
    const columnas = [];
    for (let i = 1; i <= 4; i += 1) columnas.push(await caja(p, cabeceras.nth(i)));
    // Las cuatro cabeceras van pegadas: UN recuadro para la fila y un número por
    // columna, sin recuadro (cuatro recuadros de 9 px se montarían).
    await marcar(p, [{ c: dentro(unir(...columnas), 2) }, ...columnas.map((c, i) => ({ c: dentro(c, 2), n: i + 1, sinRecuadro: true }))]);
    await guardar(p, "datos-tabla.webp", holgura(enLaVentana(await caja(p, laCard), vista), 12, vista));
    await desmarcar(p);

    // Buscar y elegir columnas.
    const buscador = p.locator(`${gestionar("sheets")} [data-zona="buscador"] input`);
    await buscador.fill(UN_NUMERO);
    await espera(p, 600);
    await marcar(p, [
        { c: await caja(p, buscador), n: 1 },
        { c: await caja(p, elBoton(p, `${gestionar("sheets")} [data-zona="secundarias"]`, "Columnas")), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "datos-buscar.webp", holgura(enLaVentana(await caja(p, laCard), vista), 12, vista));
    await desmarcar(p);
    await buscador.fill("");
    await espera(p, 500);

    // Crear un registro a mano.
    await elBoton(p, `${gestionar("sheets")} [data-zona="crear"]`, "Nuevo").click();
    const ventana = p.locator('[role="dialog"]').last();
    await ventana.waitFor({ state: "visible" });
    await p.locator("#remoteJid").fill("573118884521");
    const claves = ventana.locator('input[placeholder="Clave (ej: nombre)"]');
    const valores = ventana.locator('input[placeholder="Valor"]');
    await claves.nth(0).fill("NOMBRE");
    await valores.nth(0).fill("Laura Pineda");
    await elBoton(p, '[role="dialog"]', "Agregar campo").click();
    await claves.nth(1).fill("PLAN");
    await valores.nth(1).fill("Premium");
    await espera(p, 400);
    await apartar(p);
    await marcar(p, [
        { c: await caja(p, "#remoteJid"), n: 1 },
        { c: unir(await caja(p, claves.nth(0)), await caja(p, valores.nth(1))), n: 2 },
        { c: await caja(p, elBoton(p, '[role="dialog"]', "Agregar campo")), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "datos-nuevo.webp", holgura(await caja(p, ventana), 16, vista));
    await desmarcar(p);
    await elBoton(p, '[role="dialog"]', "Cancelar").click();
    await espera(p, 600);

    // Editar y eliminar: el lápiz y la papelera de una fila, y el «⋯» de la
    // barra con dos filas marcadas.
    const filas = p.locator(`${gestionar("sheets")} tbody tr`);
    await filas.nth(0).locator('[role="checkbox"]').click();
    await filas.nth(1).locator('[role="checkbox"]').click();
    await espera(p, 400);
    await apartar(p);
    // El lápiz y la papelera van pegados: un recuadro para los dos y el número
    // encima de cada uno.
    await marcar(p, [
        { c: unir(await caja(p, filas.nth(2).locator('button[title="Editar"]')), await caja(p, filas.nth(2).locator('button[title="Eliminar"]'))) },
        { c: await caja(p, filas.nth(2).locator('button[title="Editar"]')), n: 1, esquina: "centro", sinRecuadro: true },
        { c: await caja(p, filas.nth(2).locator('button[title="Eliminar"]')), n: 2, esquina: "centro", sinRecuadro: true },
        { c: await caja(p, `${gestionar("sheets")} [data-zona="acciones"] button`), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "datos-fila.webp", holgura(enLaVentana(await caja(p, laCard), vista), 12, vista));
    await desmarcar(p);
    await filas.nth(0).locator('[role="checkbox"]').click();
    await filas.nth(1).locator('[role="checkbox"]').click();
    await espera(p, 300);

    // Cargar más: el pie de la tabla.
    const pie = p.locator(`${gestionar("sheets")} [data-pie-de-la-tabla]`);
    await pie.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 500);
    const cPie = await elTexto(p, pie);
    const cargarMas = elBoton(p, gestionar("sheets"), "Cargar más");
    await marcar(p, [
        { c: afuera(cPie, 6, 4), n: 1 },
        { c: await caja(p, cargarMas), n: 2, esquina: "derecha" },
    ]);
    const cFondo = await caja(p, pie.locator("xpath=.."));
    const cCargarMas = await caja(p, cargarMas);
    const cDelPie = unir(cFondo, cCargarMas);
    await guardar(p, "datos-cargar-mas.webp", holgura({ ...cDelPie, y: cDelPie.y - 180, h: cDelPie.h + 180 }, 16, vista));
    await desmarcar(p);

    // 4. La base de conocimiento.
    await laOpcion(p, "knowledge", "Importar");
    const tarjetaDeLaBase = p.locator(`${importar("knowledge")} > div`).first();
    const texto = p.locator("#kb-text");
    await texto.fill(TEXTO_DE_LA_BASE);
    await espera(p, 400);
    // El rótulo va a la derecha de la etiqueta del campo: encima del texto
    // pegado taparía justo lo que se enseña.
    const cEtiqueta = await elTexto(p, p.locator(`${importar("knowledge")} label[for="kb-text"]`));
    await marcar(p, [{ c: await caja(p, texto) }, { c: afuera(cEtiqueta, 4, 2), texto: "Un tema por sección", lado: "derecha", sinRecuadro: true }]);
    await guardar(p, "kb-pegar.webp", holgura(await caja(p, tarjetaDeLaBase), 16, vista));
    await desmarcar(p);

    // El separador, con su lista abierta.
    const separador = p.locator("[data-separador] [role='combobox']");
    await separador.click();
    await laLista(p).waitFor({ state: "visible" });
    await espera(p, 400);
    const cListaSep = await caja(p, laLista(p));
    await marcar(p, [{ c: cListaSep }, { c: await caja(p, separador), texto: "Automático, o uno solo", lado: "derecha", sinRecuadro: true }]);
    await guardar(p, "kb-separador.webp", holgura(unir(await caja(p, tarjetaDeLaBase), cListaSep), 16, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    // Importar y dividir: el resumen con los bloques creados.
    await elBoton(p, importar("knowledge"), "Importar y dividir").click();
    await p.waitForSelector(resultado("knowledge"), { timeout: 60000 });
    await espera(p, 800);
    await quitarAvisos(p);
    await p.locator(resultado("knowledge")).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 500);
    const cRes = await caja(p, resultado("knowledge"));
    const creados = p.locator(`${resultado("knowledge")} [data-bloques-creados]`);
    await marcar(p, [{ c: dentro(cRes, 6) }, { c: await elTexto(p, creados), texto: "Un bloque por tema", lado: "derecha", sinRecuadro: true }]);
    // Desde el botón que lo produjo: cortar el selector de encima a media línea se lee como un fallo.
    await guardar(p, "kb-resultado.webp", holgura(unir(await caja(p, elBoton(p, importar("knowledge"), "Importar y dividir")), cRes), 20, vista));
    await desmarcar(p);

    // 5. Los bloques.
    await laPestana(p, "knowledge", "Gestionar").click();
    await losBloquesCargados(p);
    await apartar(p);
    const laCardDeBloques = p.locator(`${gestionar("knowledge")} > div`).first();
    const cDescripcion = await elTexto(p, p.locator(`${gestionar("knowledge")} [data-cuenta-de-bloques]`));
    const primero = p.locator("[data-lista-de-bloques] [data-bloque]").first();
    await marcar(p, [
        { c: afuera(cDescripcion, 0, 4), n: 1, esquina: "derecha" },
        { c: await caja(p, primero), n: 2 },
    ]);
    await guardar(p, "bloques-lista.webp", holgura(enLaVentana(await caja(p, laCardDeBloques), vista), 12, vista));
    await desmarcar(p);

    // El interruptor: el bloque inactivo de la semilla.
    const inactivo = elBloque(p, "Promoción de temporada");
    await inactivo.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 500);
    await marcar(p, [
        { c: await caja(p, inactivo), soloLuz: true },
        { c: await caja(p, inactivo.locator('[role="switch"]')), n: 1 },
        { c: afuera(await caja(p, inactivo.locator("text=Inactivo")), 4, 2), n: 2, esquina: "derecha" },
    ], { atenuar: true });
    const cInactivo = await caja(p, inactivo);
    // El bloque de encima, ENTERO (cortado a media línea se lee como un fallo),
    // para que se vea la diferencia con uno activo.
    const cAnterior = await inactivo.evaluate((el) => {
        const r = el.previousElementSibling?.getBoundingClientRect();
        return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
    });
    await guardar(p, "bloques-interruptor.webp", holgura(cAnterior ? unir(cAnterior, cInactivo) : cInactivo, 28, vista));
    await desmarcar(p);

    // Crear un bloque: la ventana con sus cuatro campos.
    await laCardDeBloques.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await elBoton(p, `${gestionar("knowledge")} [data-zona="crear"]`, "Nuevo").click();
    const ventanaDeBloque = p.locator('[role="dialog"]').last();
    await ventanaDeBloque.waitFor({ state: "visible" });
    await p.locator("#kb-title").fill("Cuidado de la piel grasa");
    await p.locator("#kb-keywords").fill("piel grasa, brillo, poros");
    await p.locator("#kb-category").fill("FAQs");
    await p.locator("#kb-content").fill("Limpia dos veces al día con un gel suave y usa un sérum ligero sin aceites.");
    await espera(p, 400);
    await apartar(p);
    const campos = ["#kb-title", "#kb-keywords", "#kb-category", "#kb-content"];
    const cajasDeCampos = [];
    for (const c of campos) cajasDeCampos.push(await caja(p, c));
    await marcar(p, cajasDeCampos.map((c, i) => ({ c, n: i + 1, esquina: "derecha" })));
    await guardar(p, "bloques-nuevo.webp", holgura(await caja(p, ventanaDeBloque), 16, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 600);

    // Buscar, editar y eliminar.
    const buscarBloque = p.locator(`${gestionar("knowledge")} [data-zona="buscador"] input`);
    await buscarBloque.fill("pago");
    await espera(p, 600);
    const encontrado = p.locator("[data-lista-de-bloques] [data-bloque]").first();
    await marcar(p, [
        { c: await caja(p, buscarBloque), n: 1 },
        { c: unir(await caja(p, encontrado.locator('button[title="Editar"]')), await caja(p, encontrado.locator('button[title="Eliminar"]'))) },
        { c: await caja(p, encontrado.locator('button[title="Editar"]')), n: 2, esquina: "centro", sinRecuadro: true },
        { c: await caja(p, encontrado.locator('button[title="Eliminar"]')), n: 3, esquina: "centro", sinRecuadro: true },
    ]);
    await guardar(p, "bloques-buscar.webp", holgura(enLaVentana(await caja(p, laCardDeBloques), vista), 12, vista));
    await desmarcar(p);
    await buscarBloque.fill("");
    await espera(p, 400);

    // 6. Las acciones de cada opción.
    await laOpcion(p, "sheets", "Importar");
    await p.locator(elMenuDe("sheets")).click();
    await elMenu(p).waitFor({ state: "visible" });
    await espera(p, 600);
    let cMenu = await caja(p, elMenu(p));
    await marcar(p, [{ c: await caja(p, elMenuDe("sheets")), soloLuz: true }, { c: cMenu, soloLuz: true }], { atenuar: true });
    await guardar(p, "acciones-sheets.webp", holgura(unir(await caja(p, pestanas("sheets")), cMenu), 8, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    await laOpcion(p, "knowledge", "Importar");
    await p.locator(elMenuDe("knowledge")).click();
    await elMenu(p).waitFor({ state: "visible" });
    await espera(p, 800);
    cMenu = await caja(p, elMenu(p));
    await marcar(p, [{ c: await caja(p, elMenuDe("knowledge")), soloLuz: true }, { c: cMenu, soloLuz: true }], { atenuar: true });
    await guardar(p, "acciones-base.webp", holgura(unir(await caja(p, pestanas("knowledge")), cMenu), 8, vista));
    await desmarcar(p);

    // Siempre pide confirmación: la ventana de una acción, y se CANCELA.
    await elMenu(p).locator('[role="menuitem"]', { hasText: "Desactivar todos los bloques" }).click();
    const confirmar = p.locator('[role="alertdialog"], [role="dialog"]').last();
    await confirmar.waitFor({ state: "visible" });
    await espera(p, 600);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, confirmar), soloLuz: true }], { atenuar: true });
    await guardar(p, "acciones-confirmar.webp", holgura(await caja(p, confirmar), 24, vista));
    await desmarcar(p);
    await confirmar.locator("button", { hasText: "Cancelar" }).click();
    await espera(p, 500);

    await aLaPortada(p);
    // El marco enseña el menú: aquí no se recorta.
    await elMarcoDeLaPantalla(p, guardarTodo, { modulo: "Integraciones", texto: "Mis datos está en Integraciones" });
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/** Entre una frase y la siguiente, lo que respira una persona hablando (el mismo de Leads). */
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
    await conElDominioDeLaGuia(ctx, BASE);
    const p = await ctx.newPage();
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirMisDatos(p);
    await p.mouse.move(640, 400, { steps: 8 });
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("la información de tu negocio", 600);
    await mover(p, p.locator(PORTADA).locator("h3").first());

    // El menú: se abre con las dos flechas, se señala Integraciones y se
    // recoge al empezar la frase de la barra, donde viven las flechas.
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

    await decir("opciones");
    await alDecir("Google Sheets", 500);
    await mover(p, p.locator(tarjeta("sheets")).locator("h4"));
    await alDecir("Base de conocimiento", 500);
    await mover(p, p.locator(tarjeta("knowledge")).locator("h4"));

    // Google Sheets: el enlace, el tipo y las columnas.
    const enlace = p.locator("#sheet-url");
    await decir("sheets");
    await pulsar(p, p.locator(tarjeta("sheets")).locator("h4"));
    await p.locator(importar("sheets")).waitFor({ state: "visible", timeout: 20000 });
    await alDecir("pegas el enlace", 350);
    await pulsar(p, enlace);
    await enlace.pressSequentially(HOJA_DE_CLIENTES, { delay: 12 });
    await alDecir("clientes o un catálogo", 500);
    await mover(p, p.locator("[data-tipo-de-datos] [role='combobox']"));
    await alDecir("revisas sus columnas", 500);
    await pulsar(p, elBoton(p, importar("sheets"), "Ver columnas de la hoja"));
    await p.waitForSelector("[data-vista-previa]", { timeout: 30000 });
    await mover(p, p.locator("[data-vista-previa] [role='combobox']"));

    await decir("importar");
    await alDecir("Iniciar importación", 350);
    await pulsar(p, elBoton(p, importar("sheets"), "Iniciar importación"));
    await p.waitForSelector(resultado("sheets"), { timeout: 60000 });
    await alDecir("el resumen", 500);
    await p.locator(resultado("sheets")).evaluate((el) => el.scrollIntoView({ block: "end", behavior: "smooth" }));
    await espera(p, 500);
    await mover(p, p.locator(resultado("sheets")).locator("p", { hasText: "Creados" }));
    await alDecir("cuántos se actualizaron", 300);
    await mover(p, p.locator(resultado("sheets")).locator("p", { hasText: "Actualizados" }));

    // Gestionar: buscar, el lápiz y Nuevo.
    await decir("gestionar");
    await alDecir("En Gestionar", 350);
    await pulsar(p, laPestana(p, "sheets", "Gestionar"));
    await laTablaCargada(p);
    const buscador = p.locator(`${gestionar("sheets")} [data-zona="buscador"] input`);
    await alDecir("lo buscas por número", 450);
    await pulsar(p, buscador);
    await buscador.pressSequentially(UN_NUMERO, { delay: 45 });
    await alDecir("con el lápiz", 450);
    await mover(p, p.locator(`${gestionar("sheets")} tbody button[title="Editar"]`).first());
    await alDecir("un registro nuevo", 450);
    await mover(p, elBoton(p, `${gestionar("sheets")} [data-zona="crear"]`, "Nuevo"));

    // La base de conocimiento: pegar el texto y dividirlo.
    const texto = p.locator("#kb-text");
    await decir("base");
    await alDecir("En Base de conocimiento", 450);
    await pulsar(p, p.locator(atajo("knowledge")));
    await p.locator(importar("knowledge")).waitFor({ state: "visible", timeout: 20000 });
    await alDecir("pegas el texto", 400);
    await pulsar(p, texto);
    await texto.fill(TEXTO_DE_LA_BASE);
    await alDecir("Importar y dividir", 450);
    await pulsar(p, elBoton(p, importar("knowledge"), "Importar y dividir"));
    await p.waitForSelector(resultado("knowledge"), { timeout: 60000 });

    // Los bloques: el interruptor y Nuevo.
    await decir("bloques");
    await alDecir("En Gestionar", 350);
    await pulsar(p, laPestana(p, "knowledge", "Gestionar"));
    await losBloquesCargados(p);
    const inactivo = elBloque(p, "Promoción de temporada");
    await alDecir("el interruptor", 500);
    await inactivo.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
    await espera(p, 450);
    await mover(p, inactivo.locator('[role="switch"]'));
    await alDecir("con Nuevo", 450);
    // Las pestañas al centro, no arriba: la cabecera de Mis datos va fija y
    // taparía el «⋯» de la opción, que es lo siguiente que se pulsa.
    await p.locator(pestanas("knowledge")).evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
    await espera(p, 450);
    await mover(p, elBoton(p, `${gestionar("knowledge")} [data-zona="crear"]`, "Nuevo"));

    // El «⋯» de la opción: se abre, se enseña y se cierra sin tocar nada.
    await decir("acciones");
    await alDecir("los tres puntos", 450);
    await pulsar(p, p.locator(elMenuDe("knowledge")));
    await elMenu(p).waitFor({ state: "visible" });
    await alDecir("sobre todos sus datos", 300);
    await mover(p, elMenu(p).locator('[role="menuitem"]').first());
    await alDecir("siempre con confirmación", 200);
    await p.keyboard.press("Escape");

    await decir("cierre");
    await alDecir("Así se trabaja", 450);
    await pulsar(p, p.locator(VOLVER));
    await p.waitForSelector(PORTADA, { timeout: 20000 });
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
    escribirLaVozDelVideo("mis-datos", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
    await conElDominioDeLaGuia(ctx, BASE);
    const p = await entrar(ctx, BASE);
    await abrirMisDatos(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        // Las capturas importaron una hoja y un texto: el vídeo sale del punto de partida.
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-mis-datos.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

// Las que la guía enseña tienen que estar TODAS. Con SOLO_MINIATURAS o
// SOLO_VIDEO, lo demás se conserva del disco: basta con que esté.
comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/mis-datos`);
