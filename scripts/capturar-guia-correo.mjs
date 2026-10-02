/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Correos, sobre la
 * App servida de verdad (`next start`, sesión real, buzones de
 * `sembrar-guia-correo.mjs` y el Gmail fingido de `fingido-guia-correo.mjs`).
 *
 * La MISMA receta que las guías de Leads y Llamadas, con las MISMAS piezas del
 * taller (`taller-de-la-guia.mjs`): cada captura es «abre esto, pulsa aquello,
 * resalta este elemento», y las marcas se localizan por lo que la pantalla ya
 * expone —los `data-*` de la bandeja, de la fila y del correo abierto, los
 * `aria-label` y `title` de cada mando—, no por coordenadas.
 *
 * NADA sale a nadie: «Conectar Gmail» y «Conectar Outlook» se señalan sin
 * pulsarlos (llevarían a Google), «Desconectar» no se pulsa, la confirmación de
 * eliminar se cancela, y ninguna respuesta, reenvío ni correo nuevo se envía.
 * Las capturas sí marcan correos como leídos (abrirlos lo hace), así que antes
 * del vídeo se vuelve a sembrar y el Gmail fingido vuelve a sus correos de
 * partida.
 *
 * Se lanza con `scripts/generar-guia-correo.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-correo.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "correo");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-correo";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-correo.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-correo.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/** Un archivo de ejemplo para adjuntar a una respuesta: no sale de este equipo. */
const UN_ADJUNTO = {
    name: "cotizacion-plan-business.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1"),
};

const LA_BANDEJA = "[data-bandeja-de-correo]";
const LA_LISTA = "[data-lista-de-correos]";
const LA_CABECERA = "[data-cabecera-de-la-columna]";
const EL_SELECTOR = "[data-selector-de-canal]";
const EL_BUSCADOR = "[data-buscador-de-la-columna]";
const LA_CAJA_DE_BUSCAR = 'input[aria-label="Buscar correo"]';
const EL_CAMPO = "[data-campo-de-busqueda]";
const ACTUALIZAR = `${LA_CABECERA} button[aria-label="Actualizar"]`;
const LOS_PUNTOS = `${LA_CABECERA} button[aria-label="Más acciones"]`;
const LAS_PASTILLAS = "[data-fila-de-filtros]";
const pastilla = (cual) => `[data-pastilla-de-filtro="${cual}"]`;
const LA_FLECHA = "[data-flecha-de-la-fila]";
const fila = (id) => `[data-correo-fila="${id}"]`;
const LAS_FILAS = "[data-correo-fila]";
const LA_SELECCION = "[data-barra-de-la-seleccion]";
const enLaSeleccion = (atributo) => `${LA_SELECCION} [${atributo}]`;
const LA_LECTURA = "[data-lectura-de-correo]";
const mando = (cual) => `[data-mando-del-correo="${cual}"]`;
const LA_BARRA_DEL_CORREO = "[data-barra-del-correo]";
const LA_RESPUESTA = `${LA_BARRA_DEL_CORREO} textarea[aria-label="Respuesta"]`;
const LA_FIRMA = `${LA_BARRA_DEL_CORREO} button[aria-label="Firma del correo"]:visible`;
const ADJUNTAR = `${LA_BARRA_DEL_CORREO} button[aria-label="Adjuntar"]:visible`;
const EL_ARCHIVO = `${LA_BARRA_DEL_CORREO} input[type="file"]:not([accept])`;
const LO_ADJUNTADO = "[data-adjuntos-para-enviar]";
const EL_MENU = '[role="menu"]';

/** Los correos de ejemplo de cada cosa. */
const CON_ARCHIVO = "v1"; // Mariana Toro, de Ventas, con su PDF.
const DE_SOPORTE = "s2"; // Sofía Martínez, de Soporte: el buzón con firma.
const PARA_LA_FILA = "s2";

async function abrirLaBandeja(p) {
    await p.goto(`${BASE}/correo`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${LAS_FILAS}`, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
}

/** Las `n` primeras filas de la lista, con la cabecera encima. */
async function lasPrimeras(p, n) {
    const cajas = [await caja(p, LA_CABECERA)];
    for (let i = 0; i < n; i += 1) cajas.push(await caja(p, p.locator(LAS_FILAS).nth(i)));
    return unir(...cajas);
}

async function abrirElCorreo(p, id) {
    await p.locator(`${fila(id)} [data-abrir-correo]`).click();
    await p.locator(`${LA_LECTURA} [data-cuerpo-del-correo]`).waitFor({ state: "visible", timeout: 30000 });
    await reposar(p);
    await espera(p, 1500);
}

/** El ratón, a un sitio donde no enciende nada: una fila con el cursor encima enseña sus acciones. */
async function reposar(p) {
    const c = await caja(p, `${LA_LECTURA} [data-cuerpo-del-correo]`).catch(() => null);
    if (c) await p.mouse.move(c.x + c.w - 30, c.y + c.h - 30);
    await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
}

async function abrirMenu(p, disparador) {
    await p.locator(disparador).first().click();
    const menu = p.locator(EL_MENU).last();
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    return menu;
}

async function cerrarDialogos(p) {
    for (let i = 0; i < 4 && (await p.$('[role="dialog"]:visible, [role="alertdialog"]:visible')); i += 1) {
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }
}

/** El ratón fuera de la lista: encima de una fila salen sus mandos de pasar el ratón. */
async function apartar(p) {
    const v = p.viewportSize();
    await p.mouse.move(v.width - 40, v.height - 40);
    // Y sin foco: el anillo del último botón pulsado se lee como otra marca.
    await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
}

async function elegirBuzon(p, id) {
    await abrirMenu(p, EL_SELECTOR);
    await p.locator(`[data-opcion-del-selector="${id}"]`).first().click();
    await apartar(p);
    await espera(p, 2000);
}

async function filtrar(p, cual) {
    await p.locator(pastilla(cual)).click();
    await espera(p, 1800);
}

async function quitarLaSeleccion(p) {
    const quitar = p.locator(`${LA_SELECCION} [title="Quitar selección"]`);
    if (await quitar.count()) await quitar.first().click();
    await espera(p, 500);
}

async function marcarTres(p) {
    for (let i = 0; i < 3; i += 1) {
        await p.locator(`${LAS_FILAS} >> nth=${i}`).locator("[data-casilla-de-la-fila]").click();
        await espera(p, 250);
    }
    await p.locator(LA_SELECCION).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
}

/**
 * Botones pegados unos a otros: UN recuadro alrededor del grupo y cada número
 * encima (o debajo) del suyo. Un recuadro por botón se montaría sobre el de al
 * lado (la regla de la guía de Mis macros).
 */
function enFila(cajas, { desde = 1, lado = "arriba", y } = {}) {
    const grupo = unir(...cajas);
    return [
        { c: grupo },
        ...cajas.map((c, i) => ({
            c,
            sinRecuadro: true,
            n: desde + i,
            numeroEn: { x: c.x + c.w / 2, y: y ?? (lado === "arriba" ? grupo.y - 24 : grupo.y + grupo.h + 24) },
        })),
    ];
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
    await mini("vista-general", () => lasPrimeras(p, 4));
    await mini("conectar", async () => {
        const c = await caja(p, LOS_PUNTOS);
        const menu = await abrirMenu(p, LOS_PUNTOS);
        return unir(c, await caja(p, menu));
    });
    await mini("buzones", async () => {
        const c = await caja(p, EL_SELECTOR);
        const menu = await abrirMenu(p, EL_SELECTOR);
        return unir(c, await caja(p, menu));
    });
    await mini("buscar", async () => unir(await caja(p, EL_BUSCADOR), await caja(p, EL_CAMPO)));
    await mini("filtros", () => caja(p, LAS_PASTILLAS));
    await mini(
        "seleccion",
        async () => {
            await marcarTres(p);
            return caja(p, LA_SELECCION);
        },
        () => quitarLaSeleccion(p),
    );
    await abrirElCorreo(p, CON_ARCHIVO);
    await mini("leer", async () => unir(await caja(p, "[data-cabecera-del-correo]"), await caja(p, "[data-adjuntos-del-correo]")));
    await mini("responder", () => caja(p, LA_BARRA_DEL_CORREO));
    await mini(
        "reenviar",
        async () => {
            await p.locator(mando("reenviar")).click();
            await p.locator("[data-reenviar-a] input").waitFor({ state: "visible", timeout: 10000 });
            await p.locator("[data-reenviar-a] input").fill("contabilidad@minegocio.co");
            await espera(p, 400);
            return caja(p, LA_BARRA_DEL_CORREO);
        },
        async () => {
            await p.locator('button[aria-label="Cancelar el reenvío"]').click();
            await espera(p, 400);
        },
    );
    await mini(
        "nuevo-correo",
        async () => {
            await abrirMenu(p, LA_FLECHA);
            await p.locator("[data-nuevo-correo]").first().click();
            await p.locator("[data-redactar-correo]").waitFor({ state: "visible", timeout: 10000 });
            await espera(p, 600);
            return unir(await caja(p, "[data-redactar-correo] [data-desde-que-buzon]"), await caja(p, '[data-redactar-correo] input[aria-label="Asunto"]'));
        },
        async () => {
            await p.locator(`[data-redactar-correo] ${mando("eliminar")}`).click();
            await espera(p, 600);
        },
    );
    await desmarcar(p);
    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();
    const conElCorreo = holgura(await caja(p, LA_BANDEJA), 0, vista);

    // 1. La pantalla de un vistazo, con un correo abierto.
    await abrirElCorreo(p, CON_ARCHIVO);
    await guardar(p, "portada.webp");
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cArriba = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cArriba, 6), n: 2, esquina: "centro" },
        { c: dentro(await caja(p, LA_LISTA), 4), n: 3 },
        { c: dentro(await caja(p, LA_LECTURA), 4), n: 4 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // La cabecera de la lista: sus seis partes, de `PARTES_DE_LA_CABECERA` más las pastillas.
    const cCabecera = await caja(p, LA_CABECERA);
    await marcar(p, [
        { c: await caja(p, EL_SELECTOR), n: 1 },
        { c: await caja(p, EL_BUSCADOR), n: 2, lado: "abajo" },
        { c: await caja(p, EL_CAMPO), n: 3 },
        { c: await caja(p, ACTUALIZAR), n: 4 },
        { c: await caja(p, LOS_PUNTOS), n: 5 },
        { c: await caja(p, LAS_PASTILLAS), n: 6, numeroEn: { x: cCabecera.x - 14, y: (await caja(p, LAS_PASTILLAS)).y + 14 } },
    ]);
    await guardar(p, "lista.webp", holgura(cCabecera, 40, vista));
    await desmarcar(p);

    // Un correo de la lista: sus cuatro partes.
    {
        const f = p.locator(fila(PARA_LA_FILA));
        const cFila = await caja(p, f);
        const nombre = await caja(p, f.locator("[data-abrir-correo] span[title]").first());
        const asunto = await caja(p, f.getByText("Cambio de número de WhatsApp").first());
        const hora = await caja(p, f.locator("[data-hora-de-la-fila]"));
        const marcasDeLaFila = unir(await caja(p, f.locator("[data-chips-de-la-fila]")), await caja(p, f.locator("[data-sin-leer]")));
        await marcar(
            p,
            [
                { c: dentro(unir(await caja(p, f.locator("[data-casilla-de-la-fila]")), nombre), 3), n: 1, numeroEn: { x: cFila.x - 16, y: nombre.y + nombre.h / 2 } },
                { c: dentro(asunto, 2), n: 2, numeroEn: { x: cFila.x - 16, y: asunto.y + asunto.h / 2 } },
                { c: hora, n: 3, numeroEn: { x: cFila.x + cFila.w + 16, y: hora.y + hora.h / 2 } },
                { c: marcasDeLaFila, n: 4, numeroEn: { x: cFila.x + cFila.w + 16, y: marcasDeLaFila.y + marcasDeLaFila.h / 2 } },
            ],
            { atenuar: true },
        );
        await guardar(p, "fila.webp", holgura(cFila, 46, vista));
        await desmarcar(p);
    }

    // 2. Conectar: el «⋯», la ventana y el formulario de dominio propio. Nada se conecta.
    {
        const cPuntos = await caja(p, LOS_PUNTOS);
        const menu = await abrirMenu(p, LOS_PUNTOS);
        const opcion = menu.getByRole("menuitem", { name: "Conectar otro correo" });
        await marcar(p, [{ c: cPuntos, n: 1 }, { c: await caja(p, opcion), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "conectar-menu.webp", holgura(unir(cPuntos, await caja(p, menu), cCabecera), 40, vista));
        await desmarcar(p);
        await opcion.click();
    }
    const dialogo = p.locator('[role="dialog"]').filter({ has: p.locator("[data-conectar-correo]") }).last();
    await dialogo.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await marcar(p, [
        { c: await caja(p, dialogo.getByRole("button", { name: "Conectar Gmail" })), n: 1, esquina: "derecha" },
        { c: await caja(p, dialogo.getByRole("button", { name: "Conectar Outlook" })), n: 2, esquina: "derecha" },
        { c: await caja(p, dialogo.getByRole("button", { name: "Conectar correo de dominio propio" })), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "conectar-dialogo.webp", holgura(await caja(p, dialogo), 40, vista));
    await desmarcar(p);
    await dialogo.getByRole("button", { name: "Conectar correo de dominio propio" }).click();
    const imap = dialogo.locator("[data-formulario-imap]");
    await imap.waitFor({ state: "visible", timeout: 10000 });
    await imap.locator("#correo-direccion").fill("hola@miempresa.co");
    await imap.locator("#correo-contrasena").fill("contrasena-de-ejemplo");
    await imap.locator("#correo-imap").fill("mail.miempresa.co");
    await imap.locator("#correo-smtp").fill("mail.miempresa.co");
    await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await espera(p, 500);
    await marcar(p, [{ c: await caja(p, imap) }]);
    await guardar(p, "conectar-dominio.webp", holgura(await caja(p, dialogo), 40, vista));
    await desmarcar(p);
    await cerrarDialogos(p);

    // 3. Varios buzones: el selector, Todas, uno solo y desconectar (sin pulsarlo).
    {
        const cSelector = await caja(p, EL_SELECTOR);
        const menu = await abrirMenu(p, EL_SELECTOR);
        await marcar(p, [{ c: cSelector, n: 1 }, { c: await caja(p, menu), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "buzones-selector.webp", holgura(unir(cSelector, await caja(p, menu), cCabecera), 40, vista));
        await desmarcar(p);
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }
    {
        const insignias = p.locator(`${LAS_FILAS} [data-insignia-de-linea]`);
        const marcas = [];
        for (let i = 0; i < 4; i += 1) marcas.push({ c: await caja(p, insignias.nth(i)) });
        marcas[1].texto = "De qué buzón llegó";
        marcas[1].lado = "derecha";
        await marcar(p, marcas, { atenuar: true });
        await guardar(p, "buzones-unificada.webp", holgura(await lasPrimeras(p, 5), 30, vista));
        await desmarcar(p);
    }
    await elegirBuzon(p, "guia-buzon-soporte");
    await marcar(p, [{ c: await caja(p, EL_SELECTOR), texto: "Solo Soporte", lado: "derecha" }]);
    await guardar(p, "buzones-uno.webp", holgura(await lasPrimeras(p, 4), 30, vista));
    await desmarcar(p);
    await elegirBuzon(p, "");
    {
        const cPuntos = await caja(p, LOS_PUNTOS);
        const menu = await abrirMenu(p, LOS_PUNTOS);
        const desconectar = menu.getByRole("menuitem").filter({ hasText: "Desconectar" });
        const cajas = [];
        for (let i = 0; i < (await desconectar.count()); i += 1) cajas.push(await caja(p, desconectar.nth(i)));
        await marcar(p, [{ c: cPuntos, n: 1 }, { c: unir(...cajas), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "buzones-desconectar.webp", holgura(unir(cPuntos, await caja(p, menu), cCabecera), 40, vista));
        await desmarcar(p);
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }

    // 4. Buscar: escribir, el campo y solo el remitente.
    await p.fill(LA_CAJA_DE_BUSCAR, "cotizacion");
    await espera(p, 1000);
    await marcar(p, [{ c: await caja(p, EL_BUSCADOR) }, { c: await caja(p, p.locator(LAS_FILAS).first()), texto: "Encuentra «Cotización»", lado: "abajo" }]);
    await guardar(p, "buscar-escribir.webp", holgura(unir(cCabecera, await caja(p, p.locator(LAS_FILAS).first()), { ...cCabecera, h: cCabecera.h + 200 }), 30, vista));
    await desmarcar(p);
    await p.fill(LA_CAJA_DE_BUSCAR, "");
    await espera(p, 800);
    {
        const cCampo = await caja(p, EL_CAMPO);
        const menu = await abrirMenu(p, EL_CAMPO);
        await marcar(p, [{ c: cCampo, n: 1 }, { c: await caja(p, menu), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "buscar-campo.webp", holgura(unir(cCampo, await caja(p, menu), cCabecera), 40, vista));
        await desmarcar(p);
        await menu.locator('[data-campo="remitente"]').click();
        await apartar(p);
        await espera(p, 500);
    }
    await p.fill(LA_CAJA_DE_BUSCAR, "Jorge");
    await espera(p, 1000);
    await marcar(p, [{ c: await caja(p, EL_BUSCADOR) }, { c: await caja(p, p.locator(LAS_FILAS).first()), texto: "Todo lo que mandó Jorge", lado: "abajo" }]);
    await guardar(p, "buscar-remitente.webp", holgura(unir(cCabecera, { ...cCabecera, h: cCabecera.h + 200 }), 30, vista));
    await desmarcar(p);
    await p.fill(LA_CAJA_DE_BUSCAR, "");
    await abrirMenu(p, EL_CAMPO);
    await p.locator('[data-campo="todo"]').first().click();
    await apartar(p);
    await espera(p, 800);

    // 5. Las pastillas: las cuatro, Sin leer, Archivados y la flecha.
    {
        const cajas = [];
        for (const cual of ["destacados", "todos", "sinLeer", "archivados"]) cajas.push(await caja(p, pastilla(cual)));
        await apartar(p);
        await marcar(p, enFila(cajas, { y: unir(...cajas).y + unir(...cajas).h + 10 }));
        await guardar(p, "filtros-pastillas.webp", holgura(unir(cCabecera, { ...cCabecera, h: cCabecera.h + 30 }), 40, vista));
        await desmarcar(p);
    }
    await filtrar(p, "sinLeer");
    await marcar(p, [{ c: await caja(p, pastilla("sinLeer")) }]);
    await guardar(p, "filtros-sin-leer.webp", holgura(await lasPrimeras(p, 3), 30, vista));
    await desmarcar(p);
    await filtrar(p, "archivados");
    await p.locator(`${LAS_FILAS}`).first().waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 800);
    await marcar(p, [{ c: await caja(p, pastilla("archivados")) }]);
    await guardar(p, "filtros-archivados.webp", holgura(await lasPrimeras(p, 2), 30, vista));
    await desmarcar(p);
    await filtrar(p, "todos");
    {
        const cFlecha = await caja(p, LA_FLECHA);
        const menu = await abrirMenu(p, LA_FLECHA);
        await marcar(p, [{ c: cFlecha, n: 1 }, { c: await caja(p, menu), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "filtros-flecha.webp", holgura(unir(cFlecha, await caja(p, menu), cCabecera), 40, vista));
        await desmarcar(p);
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }

    // 6. Varios a la vez: marcar tres, la barra, leído / no leído y eliminar (se cancela).
    await marcarTres(p);
    {
        const cajas = [];
        for (let i = 0; i < 3; i += 1) cajas.push(await caja(p, p.locator(LAS_FILAS).nth(i)));
        await marcar(p, cajas.map((c) => ({ c })), { atenuar: true });
        await guardar(p, "seleccion-casilla.webp", holgura(await lasPrimeras(p, 4), 30, vista));
        await desmarcar(p);
    }
    const cBarraSel = await caja(p, LA_SELECCION);
    const botonesDeLaSeleccion = [
        enLaSeleccion('title="Marcar como leído / no leído"'),
        enLaSeleccion('aria-label="Exportar correos"'),
        enLaSeleccion('aria-label="Destacar"'),
        enLaSeleccion('aria-label="Archivar correos"'),
        enLaSeleccion('aria-label="Eliminar correos"'),
    ];
    {
        const cajas = [];
        for (const b of botonesDeLaSeleccion) cajas.push(await caja(p, b));
        await marcar(p, [...enFila(cajas.slice(0, 4), { lado: "abajo" }), { c: cajas[4], n: 5, numeroEn: { x: cajas[4].x + cajas[4].w / 2, y: cajas[4].y + cajas[4].h + 24 } }]);
        await guardar(p, "seleccion-barra.webp", holgura(unir(cBarraSel, cCabecera), 40, vista));
        await desmarcar(p);
    }
    {
        const cLeido = await caja(p, botonesDeLaSeleccion[0]);
        const menu = await abrirMenu(p, botonesDeLaSeleccion[0]);
        await marcar(p, [{ c: cLeido, n: 1 }, { c: await caja(p, menu), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "seleccion-leido.webp", holgura(unir(cLeido, await caja(p, menu), cCabecera), 40, vista));
        await desmarcar(p);
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }
    await p.locator(botonesDeLaSeleccion[4]).click();
    const confirmar = p.locator('[role="alertdialog"]').last();
    await confirmar.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await marcar(p, [{ c: await caja(p, confirmar) }]);
    await guardar(p, "seleccion-eliminar.webp", holgura(await caja(p, confirmar), 60, vista));
    await desmarcar(p);
    await confirmar.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 500);
    await quitarLaSeleccion(p);

    // 7. Leer: abrirlo, los mandos, los archivos, el «⋯» y sin abrirlo.
    await abrirElCorreo(p, CON_ARCHIVO);
    await marcar(p, [{ c: await caja(p, fila(CON_ARCHIVO)), n: 1 }, { c: dentro(await caja(p, LA_LECTURA), 4), n: 2 }], { atenuar: true });
    await guardar(p, "leer-abrir.webp", conElCorreo);
    await desmarcar(p);
    const cCabeceraDelCorreo = await caja(p, "[data-cabecera-del-correo]");
    {
        const cajas = [];
        for (const cual of ["responder", "reenviar", "noLeido", "destacar", "eliminar", "mas"]) cajas.push(await caja(p, mando(cual)));
        // Los números van DEBAJO, en la fila de «Para», que a la derecha está
        // vacía: encima caerían sobre la barra de arriba y justo debajo, sobre la fecha.
        await marcar(p, enFila(cajas, { y: cCabeceraDelCorreo.y + cCabeceraDelCorreo.h + 18 }));
        await guardar(p, "leer-mandos.webp", holgura(unir(cCabeceraDelCorreo, { ...cCabeceraDelCorreo, h: cCabeceraDelCorreo.h + 70 }), 20, vista));
        await desmarcar(p);
    }
    await marcar(p, [{ c: await caja(p, "[data-adjuntos-del-correo]") }]);
    await guardar(p, "leer-adjuntos.webp", holgura(unir(cCabeceraDelCorreo, await caja(p, "[data-cuerpo-del-correo]")), 20, vista));
    await desmarcar(p);
    {
        const cMas = await caja(p, mando("mas"));
        const menu = await abrirMenu(p, mando("mas"));
        await marcar(p, [{ c: cMas, n: 1 }, { c: await caja(p, menu), n: 2, esquina: "izquierda" }], { atenuar: true });
        await guardar(p, "leer-mas.webp", holgura(unir(cMas, await caja(p, menu), cCabeceraDelCorreo), 40, vista));
        await desmarcar(p);
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }
    {
        const otra = p.locator(fila("v2"));
        await otra.hover();
        await espera(p, 600);
        await marcar(p, [{ c: await caja(p, otra.locator("[data-acciones-de-la-fila]")), texto: "Archivar, eliminar y más", lado: "abajo" }], { atenuar: true });
        await guardar(p, "leer-fila.webp", holgura(await lasPrimeras(p, 5), 30, vista));
        await desmarcar(p);
        await p.mouse.move(vista.width - 40, vista.height - 40);
    }

    // 8. Responder, en un correo de Soporte (el buzón con firma). No se envía.
    await abrirElCorreo(p, DE_SOPORTE);
    await p.locator(mando("responder")).click();
    await espera(p, 600);
    const cBarra = () => caja(p, LA_BARRA_DEL_CORREO);
    const zonaDeLaBarra = async () => {
        const b = await cBarra();
        return holgura(unir(b, { ...b, y: b.y - 220, h: 1 }), 20, vista);
    };
    await marcar(p, [{ c: await cBarra(), texto: "Aquí escribes tu respuesta", lado: "arriba" }]);
    await guardar(p, "responder-barra.webp", await zonaDeLaBarra());
    await desmarcar(p);
    await p.locator(LA_RESPUESTA).fill("Hola Sofía, ya actualizamos el número de la clínica. Te adjunto la confirmación.");
    await p.locator(EL_ARCHIVO).setInputFiles(UN_ADJUNTO);
    await p.locator(LO_ADJUNTADO).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    // El 2 primero: así el número del clip queda ENCIMA del recuadro de lo adjuntado.
    await marcar(p, [{ c: await caja(p, LO_ADJUNTADO), n: 2, esquina: "derecha" }, { c: await caja(p, ADJUNTAR), n: 1, borde: "abajo" }]);
    await guardar(p, "responder-adjuntar.webp", await zonaDeLaBarra());
    await desmarcar(p);
    {
        const cFirma = await caja(p, LA_FIRMA);
        await p.locator(LA_FIRMA).click();
        const ventana = p.locator('[role="dialog"]').filter({ hasText: "Firma de" }).last();
        await ventana.waitFor({ state: "visible", timeout: 10000 });
        await espera(p, 500);
        await marcar(p, [{ c: await caja(p, ventana), n: 2, esquina: "derecha" }, { c: cFirma, n: 1 }], { atenuar: true });
        await guardar(p, "responder-firma.webp", holgura(unir(cFirma, await caja(p, ventana), await cBarra()), 30, vista));
        await desmarcar(p);
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }
    await marcar(p, [{ c: await caja(p, 'button[aria-label="Enviar respuesta"]'), texto: "Envía (o Ctrl + Enter)", lado: "arriba" }]);
    await guardar(p, "responder-enviar.webp", await zonaDeLaBarra());
    await desmarcar(p);
    await p.locator(LA_RESPUESTA).fill("");

    // 9. Reenviar el de Mariana, con su PDF. Se cancela sin enviar.
    await abrirElCorreo(p, CON_ARCHIVO);
    await p.locator(mando("reenviar")).click();
    const reenviarA = p.locator('[data-reenviar-a] input[aria-label="Reenviar a"]');
    await reenviarA.waitFor({ state: "visible", timeout: 10000 });
    await reenviarA.fill("contabilidad@minegocio.co");
    await espera(p, 400);
    await marcar(p, [{ c: await caja(p, "[data-reenviar-a]"), texto: "A quién se lo mandas", lado: "arriba" }]);
    await guardar(p, "reenviar-destino.webp", await zonaDeLaBarra());
    await desmarcar(p);
    await p.locator(LA_RESPUESTA).fill("Te reenvío la cotización que pidió Mariana, con sus requisitos.");
    await espera(p, 400);
    await marcar(p, [{ c: await caja(p, LA_RESPUESTA), texto: "Va arriba del correo original", lado: "arriba" }]);
    await guardar(p, "reenviar-mensaje.webp", await zonaDeLaBarra());
    await desmarcar(p);
    await marcar(p, [
        { c: await caja(p, 'button[aria-label="Reenviar correo"]'), n: 1, lado: "arriba" },
        { c: await caja(p, 'button[aria-label="Cancelar el reenvío"]'), n: 2, lado: "arriba" },
    ]);
    await guardar(p, "reenviar-enviar.webp", await zonaDeLaBarra());
    await desmarcar(p);
    await p.locator('button[aria-label="Cancelar el reenvío"]').click();
    await p.locator(LA_RESPUESTA).fill("");
    await espera(p, 400);

    // 10. Un correo nuevo: la flecha, el formulario y enviar (se descarta).
    {
        const cFlecha = await caja(p, LA_FLECHA);
        const menu = await abrirMenu(p, LA_FLECHA);
        await marcar(p, [{ c: cFlecha, n: 1 }, { c: await caja(p, p.locator("[data-nuevo-correo]").first()), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "nuevo-abrir.webp", holgura(unir(cFlecha, await caja(p, menu), cCabecera), 40, vista));
        await desmarcar(p);
        await p.locator("[data-nuevo-correo]").first().click();
    }
    const redactar = p.locator("[data-redactar-correo]");
    await redactar.waitFor({ state: "visible", timeout: 10000 });
    await redactar.locator('input[aria-label="Para"]').fill("camila.rojas@estudiocamila.co");
    await redactar.locator('input[aria-label="Asunto"]').fill("Descuento por pago anual");
    await redactar.locator('textarea[aria-label="Mensaje"]').fill("Hola Camila, sí: pagando el año completo tienes dos meses de regalo. ¿Te envío el enlace de pago?");
    await espera(p, 500);
    await p.mouse.move(vista.width - 80, vista.height - 160);
    {
        const desde = await caja(p, redactar.locator("[data-desde-que-buzon]"));
        const campos = [];
        for (const sel of ['input[aria-label="Para"]', 'input[aria-label="Asunto"]', 'textarea[aria-label="Mensaje"]']) campos.push(dentro(await caja(p, redactar.locator(sel)), 3));
        // Los números de los campos, DENTRO de su caja y a la derecha: ahí no hay texto.
        const dentroALaDerecha = (c, n) => ({ c, n, numeroEn: { x: c.x + c.w - 26, y: c.y + Math.min(c.h / 2, 22) } });
        await marcar(p, [
            { c: desde, n: 1, numeroEn: { x: desde.x + desde.w + 24, y: desde.y + desde.h / 2 } },
            ...campos.map((c, i) => dentroALaDerecha(c, i + 2)),
        ]);
    }
    await guardar(p, "nuevo-formulario.webp", conElCorreo);
    await desmarcar(p);
    await marcar(p, [
        { c: await caja(p, redactar.locator('button[aria-label="Enviar correo"]')), n: 1, lado: "arriba" },
        { c: await caja(p, redactar.locator(mando("eliminar"))), n: 2, borde: "abajo", esquina: "izquierda" },
    ]);
    await guardar(p, "nuevo-enviar.webp", conElCorreo);
    await desmarcar(p);
    await redactar.locator(mando("eliminar")).click();
    await espera(p, 600);
    await quitarAvisos(p);

    await abrirLaBandeja(p);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Bandeja", texto: "Correos está en Bandeja" });
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
    // La «Guía rápida» se da por vista: si no, su ventana se come el primer clic.
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem("chat-onboarding-shown", "1");
        } catch {
            /* sin almacenamiento, se aparta a mano */
        }
    });
    const p = await ctx.newPage();
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos, cortes } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    try {
        await abrirLaBandeja(p);
        await p.mouse.move(640, 400, { steps: 8 });
        const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
        await decir("intro");
        await alDecir("lees y respondes", 300);
        await mover(p, p.locator(LAS_FILAS).first());
        await alDecir("todos tus buzones", 300);
        await mover(p, p.locator(EL_SELECTOR));

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

        // Conectar: el «⋯» y la ventana; los botones se SEÑALAN, nunca se pulsan.
        await decir("conectar");
        await alDecir("en los tres puntos", 200);
        await pulsar(p, p.locator(LOS_PUNTOS));
        const menu = p.locator(EL_MENU).last();
        await menu.waitFor({ state: "visible", timeout: 10000 });
        await alDecir("Conectar otro correo", 200);
        await pulsar(p, menu.getByRole("menuitem", { name: "Conectar otro correo" }));
        const dialogo = p.locator('[role="dialog"]').filter({ has: p.locator("[data-conectar-correo]") }).last();
        await dialogo.waitFor({ state: "visible", timeout: 10000 });
        await alDecir("Gmail y Outlook", 200);
        await mover(p, dialogo.getByRole("button", { name: "Conectar Gmail" }));
        await mover(p, dialogo.getByRole("button", { name: "Conectar Outlook" }));
        await alDecir("tu propio dominio", 200);
        await mover(p, dialogo.getByRole("button", { name: "Conectar correo de dominio propio" }));
        await alDecir("con sus datos", 200);
        await p.keyboard.press("Escape");
        await dialogo.waitFor({ state: "hidden", timeout: 10000 });

        // Varios buzones: Todas, la marca de cada correo, y uno solo.
        await decir("buzones");
        await alDecir("el selector de arriba", 200);
        await pulsar(p, p.locator(EL_SELECTOR));
        await alDecir("los junta en Todas", 200);
        await pulsar(p, p.locator('[data-opcion-del-selector=""]').first());
        await alDecir("la marca de su buzón", 200);
        await mover(p, p.locator(`${LAS_FILAS} [data-insignia-de-linea]`).first());
        await alDecir("eliges uno", 200);
        await pulsar(p, p.locator(EL_SELECTOR));
        await pulsar(p, p.locator('[data-opcion-del-selector="guia-buzon-soporte"]').first());
        await alDecir("solo lo suyo", 200);
        await mover(p, p.locator(LAS_FILAS).first());

        // Buscar: de vuelta a Todas, escribir y elegir el campo.
        await decir("buscar");
        await pulsar(p, p.locator(EL_SELECTOR));
        await pulsar(p, p.locator('[data-opcion-del-selector=""]').first());
        await alDecir("mientras escribes", 300);
        const buscador = p.locator(LA_CAJA_DE_BUSCAR);
        await pulsar(p, buscador);
        await buscador.pressSequentially("cotizacion", { delay: 60 });
        await alDecir("con el botón de al lado", 200);
        await pulsar(p, p.locator(EL_CAMPO));
        const campos = p.locator(EL_MENU).last();
        await campos.waitFor({ state: "visible", timeout: 10000 });
        await alDecir("en el remitente", 200);
        await mover(p, campos.locator('[data-campo="remitente"]'));
        await alDecir("o en el asunto", 200);
        await mover(p, campos.locator('[data-campo="asunto"]'));
        await pulsar(p, campos.locator('[data-campo="todo"]'));
        await buscador.fill("");

        // Las pastillas y la flecha.
        await decir("filtros");
        await alDecir("Destacados", 200);
        await pulsar(p, p.locator(pastilla("destacados")));
        await alDecir("Sin leer", 200);
        await pulsar(p, p.locator(pastilla("sinLeer")));
        await alDecir("Archivados", 200);
        await pulsar(p, p.locator(pastilla("archivados")));
        await alDecir("la flecha del final", 200);
        await pulsar(p, p.locator(pastilla("todos")));
        await pulsar(p, p.locator(LA_FLECHA));
        await alDecir("y Anclados", 400);
        await p.keyboard.press("Escape");

        // Varios a la vez: marcar tres y recorrer la barra. Nada se elimina.
        await decir("seleccion");
        await alDecir("Marca varios correos", 200);
        for (let i = 0; i < 3; i += 1) {
            const f = p.locator(LAS_FILAS).nth(i);
            await mover(p, f.locator("[data-casilla-de-la-fila]"));
            await pulsar(p, f.locator("[data-casilla-de-la-fila]"));
        }
        await alDecir("la barra cambia", 200);
        await mover(p, p.locator(LA_SELECCION));
        await alDecir("como leídos", 200);
        await mover(p, p.locator(enLaSeleccion('title="Marcar como leído / no leído"')));
        await alDecir("los destacas", 200);
        await mover(p, p.locator(enLaSeleccion('aria-label="Destacar"')));
        await alDecir("los archivas", 200);
        await mover(p, p.locator(enLaSeleccion('aria-label="Archivar correos"')));
        await alDecir("los exportas", 200);
        await mover(p, p.locator(enLaSeleccion('aria-label="Exportar correos"')));
        await alDecir("los eliminas", 200);
        await mover(p, p.locator(enLaSeleccion('aria-label="Eliminar correos"')));
        await pulsar(p, p.locator(`${LA_SELECCION} [title="Quitar selección"]`));

        // Leer: abrir el de Mariana, sus archivos y los mandos.
        await decir("leer");
        await alDecir("Al abrir un correo", 200);
        await pulsar(p, p.locator(`${fila(CON_ARCHIVO)} [data-abrir-correo]`));
        await p.locator(`${LA_LECTURA} [data-cuerpo-del-correo]`).waitFor({ state: "visible", timeout: 30000 });
        await alDecir("con sus archivos", 200);
        await mover(p, p.locator("[data-adjuntos-del-correo]"));
        await alDecir("arriba tienes responder", 200);
        await mover(p, p.locator(mando("responder")));
        await alDecir("destacar", 200);
        await mover(p, p.locator(mando("destacar")));
        await alDecir("y más", 200);
        await mover(p, p.locator(mando("mas")));

        // Responder: escribir, el clip y la firma. No se envía.
        const respuesta = p.locator(LA_RESPUESTA);
        await decir("responder");
        await alDecir("escribes abajo", 200);
        await pulsar(p, respuesta);
        await respuesta.pressSequentially("Hola Mariana, te envío la cotización.", { delay: 45 });
        await alDecir("con el clip", 200);
        await mover(p, p.locator(ADJUNTAR));
        await alDecir("la firma de ese buzón", 200);
        await mover(p, p.locator(LA_FIRMA));
        await respuesta.fill("");

        // Reenviar: a quién y unas líneas; se cancela sin enviar.
        await decir("reenviar");
        await alDecir("Con Reenviar", 200);
        await pulsar(p, p.locator(mando("reenviar")));
        const reenviarA = p.locator('[data-reenviar-a] input[aria-label="Reenviar a"]');
        await reenviarA.waitFor({ state: "visible", timeout: 10000 });
        await pulsar(p, reenviarA);
        await reenviarA.pressSequentially("contabilidad@minegocio.co", { delay: 35 });
        await alDecir("unas líneas tuyas", 200);
        await pulsar(p, respuesta);
        await respuesta.pressSequentially("Te la reenvío.", { delay: 45 });
        await alDecir("van incluidos", 300);
        await mover(p, p.locator("[data-adjuntos-del-correo]"));
        await pulsar(p, p.locator('button[aria-label="Cancelar el reenvío"]'));
        await respuesta.fill("");

        // Un correo nuevo: la flecha, de qué buzón sale y sus campos. Se descarta.
        await decir("nuevo");
        await alDecir("en la flecha", 200);
        await pulsar(p, p.locator(LA_FLECHA));
        await pulsar(p, p.locator("[data-nuevo-correo]").first());
        const redactar = p.locator("[data-redactar-correo]");
        await redactar.waitFor({ state: "visible", timeout: 10000 });
        await alDecir("desde qué buzón sale", 200);
        await mover(p, redactar.locator("[data-desde-que-buzon]"));
        await alDecir("para quién", 200);
        await pulsar(p, redactar.locator('input[aria-label="Para"]'));
        await redactar.locator('input[aria-label="Para"]').pressSequentially("camila.rojas@estudiocamila.co", { delay: 25 });
        await alDecir("el asunto", 100);
        await pulsar(p, redactar.locator('input[aria-label="Asunto"]'));
        await redactar.locator('input[aria-label="Asunto"]').pressSequentially("Descuento anual", { delay: 35 });
        await alDecir("y tu mensaje", 100);
        await pulsar(p, redactar.locator('textarea[aria-label="Mensaje"]'));
        await redactar.locator('textarea[aria-label="Mensaje"]').pressSequentially("Hola Camila…", { delay: 45 });
        await alDecir("Así se trabaja", 200);
        await mover(p, redactar.locator('button[aria-label="Enviar correo"]'));
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
        writeFileSync(path.join(TMP, "narracion.json"), JSON.stringify(colocados, null, 2));
        escribirLaVozDelVideo("correo", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS, cortes });
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
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem("chat-onboarding-shown", "1");
        } catch {
            /* se aparta a mano */
        }
    });
    const p = await entrar(ctx, BASE);
    try {
        await abrirLaBandeja(p);
        if (!SOLO_VIDEO) await miniaturas(p);
        if (!SOLO_MINIATURAS && !SOLO_VIDEO) {
            execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-correo.mjs")], { stdio: "inherit" });
            await abrirLaBandeja(p);
            await capturas(p);
        }
    } catch (e) {
        await p.screenshot({ path: path.join(TMP, "error.png") }).catch(() => {});
        console.error("[guia] las capturas se cayeron en", p.url(), "— foto en", path.join(TMP, "error.png"));
        throw e;
    }
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-correo.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/correo`);
