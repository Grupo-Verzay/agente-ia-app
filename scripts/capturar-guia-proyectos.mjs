/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Proyectos, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-proyectos.mjs`).
 *
 * La MISMA receta que las demás guías y con las MISMAS piezas del taller
 * (`taller-de-la-guia.mjs`): cada captura es «abre esto, pulsa aquello, resalta
 * este elemento», y las marcas se localizan por lo que la pantalla ya expone
 * —los `data-zona` de la barra y de cada tarjeta, los `data-proyecto`, los
 * `data-columna` del tablero, los `data-tarea` y los `data-campo` de las
 * ventanas—, no por coordenadas escritas a mano.
 *
 * Las capturas CAMBIAN los datos (crean un proyecto), así que antes del vídeo
 * se vuelve a sembrar. Eliminar —un proyecto o una tarea— NO se confirma nunca:
 * la ventana se cierra con «Cancelar» o «Volver». Y la ventana «Dar por hecha»
 * que sale al soltar una tarea en Hecho se CANCELA: la tarea vuelve a su sitio.
 *
 * Los archivos adjuntos de ejemplo viven en `archivos.ejemplo.co`, que no
 * existe: los contesta este guion (`servirLosAdjuntos`).
 *
 * Qué captura hace falta lo dice `lib/guia-proyectos.ts`: el script se niega a
 * terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-proyectos.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { laImagen } from "./imagenes-guia-catalogo.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-proyectos.mjs";
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
    rotulo,
    tomarUnaMiniatura,
    unir,
} from "./taller-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "proyectos");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-proyectos";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
// Solo el vídeo (p. ej. al cambiar la narración): las imágenes se conservan del disco.
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-proyectos.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-proyectos.json");
/** De dónde salen los adjuntos de ejemplo (el mismo de la semilla). */
const ARCHIVOS = "https://archivos.ejemplo.co";

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Los adjuntos de ejemplo                                             */
/* ------------------------------------------------------------------ */

/** Un PDF de una página, lo justo para que el navegador lo reconozca. */
const PDF = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

async function servirLosAdjuntos(contexto) {
    const portada = (await laImagen("portada.jpg")).datos;
    await contexto.route(`${ARCHIVOS}/**`, (ruta) => {
        const url = ruta.request().url();
        if (url.endsWith(".pdf")) return ruta.fulfill({ status: 200, contentType: "application/pdf", body: PDF });
        return ruta.fulfill({ status: 200, contentType: "image/jpeg", body: portada, headers: { "cache-control": "max-age=3600" } });
    });
}

/* ------------------------------------------------------------------ */
/* Medir                                                               */
/* ------------------------------------------------------------------ */

const LA_BARRA = "[data-barra-de-acciones]";
const EL_BUSCADOR = 'input[placeholder="Buscar proyecto..."]';
const LOS_FILTROS = '[data-zona="estado-y-responsable"]';
const LAS_CIFRAS = '[data-zona="cifras"]';
const LAS_CARPETAS = '[data-zona="carpetas"]';
const EL_NUEVO = (p) => p.locator(`${LA_BARRA} [data-zona="crear"] button`).first();
const elFiltro = (p, concepto) => p.locator(`${LOS_FILTROS} button[title="${concepto}"]`).first();
const LAS_PESTANAS = (p) =>
    p.locator('nav a[href="/proyectos"]').first().locator("xpath=ancestor::div[contains(@class,'sticky')][1]");
const laRejilla = (p) => p.locator("[data-proyecto]").first().locator("xpath=ancestor::div[contains(@class,'grid')][1]");

const elProyecto = (p, nombre) => p.locator(`[data-proyecto="${nombre}"]`).first();
const laParte = (p, nombre, zona) => elProyecto(p, nombre).locator(`[data-zona="${zona}"]`).first();
const laCarpeta = (p, nombre) => p.locator(`${LAS_CARPETAS} button`, { hasText: nombre }).first();
const elAsa = (p, nombre) =>
    elProyecto(p, nombre).locator("xpath=ancestor::*[.//button[@data-asa-de-orden]][1]").locator("button[data-asa-de-orden]").first();

const LA_VENTANA_PROYECTO = (p) => p.getByRole("dialog").filter({ has: p.locator('[data-campo="equipo"]') }).last();
const campoProyecto = (p, campo) => LA_VENTANA_PROYECTO(p).locator(`[data-campo="${campo}"]`).first();

const TIENDA = "Lanzamiento de la tienda en línea";
const ELTABLERO = '[data-zona="columnas"]';
const laColumna = (p, estado) => p.locator(`${ELTABLERO} [data-columna="${estado}"]`).first();
const laCabeza = (p, estado) => laColumna(p, estado).locator("> div").first();
const laTarea = (p, titulo) => p.locator(`${ELTABLERO} [data-tarea="${titulo}"]`).first();
const laParteDeLaTarea = (p, titulo, zona) => laTarea(p, titulo).locator(`[data-zona="${zona}"]`).first();
const EL_FILTRO_DE_VENCIMIENTO = 'button[aria-label="Filtrar por vencimiento"]';
const LA_VENTANA_TAREA = (p) => p.getByRole("dialog").filter({ has: p.locator('[data-campo="comentarios"]') }).last();
const campoTarea = (p, campo) => LA_VENTANA_TAREA(p).locator(`[data-campo="${campo}"]`).first();
const LA_TAREA_EJEMPLO = "Fotos de los productos";
const COLUMNAS = ["pending", "in_progress", "in_review", "done", "cancelled"];

const soltarElFoco = (p) => p.evaluate(() => document.activeElement?.blur?.());

async function abrirLaPantalla(p) {
    await p.goto(`${BASE}/proyectos`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("[data-proyecto]", { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    // Los botones del borde tapan la columna derecha de la rejilla.
    await esconderLosBotonesDelBorde(p);
    await queNadaSalgaRecortado(p);
}

/**
 * Un nombre que no cabe sale con «…» en la captura, y la guía enseñaría algo
 * que no se lee entero. Si algo no cabe, se acorta en la semilla.
 */
async function queNadaSalgaRecortado(p, dentro_ = "[data-caja-del-contenido]") {
    const recortados = await p.evaluate((sel) => {
        const fuera = [];
        for (const raiz of document.querySelectorAll(sel)) {
            for (const el of raiz.querySelectorAll(".truncate, .line-clamp-2")) {
                if (!el.getClientRects().length) continue;
                if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) fuera.push(el.textContent || "");
            }
        }
        return fuera;
    }, dentro_);
    if (recortados.length) throw new Error(`[guia] sale recortado con «…»: ${recortados.join(" · ")}`);
}

/** Pasa el ratón por la tarjeta: los botones de la esquina solo salen así. */
async function sobreLaTarjeta(p, nombre) {
    const c = await caja(p, elProyecto(p, nombre));
    await p.mouse.move(c.x + c.w / 2, c.y + c.h - 12);
    await espera(p, 400);
    return c;
}

async function abrirElTablero(p, nombre = TIENDA) {
    await laParte(p, nombre, "nombre").click();
    await laColumna(p, "pending").waitFor({ state: "visible", timeout: 30000 });
    await p.locator(`${ELTABLERO} [data-tarea]`).first().waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1200);
    await esconderLosBotonesDelBorde(p);
}

async function volverALaLista(p) {
    await p.locator('[data-zona="proyecto"] button[title="Volver"]').click();
    await p.waitForSelector("[data-proyecto]", { timeout: 30000 });
    await espera(p, 900);
}

async function abrirLaTarea(p, titulo = LA_TAREA_EJEMPLO) {
    await laTarea(p, titulo).click();
    await campoTarea(p, "comentarios").waitFor({ state: "visible", timeout: 15000 });
    // Los comentarios y los adjuntos llegan después de abrir.
    await campoTarea(p, "comentarios").getByText("Laura").first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await espera(p, 1200);
    await soltarElFoco(p);
}

async function cerrarLaTarea(p) {
    await LA_VENTANA_TAREA(p).getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 700);
}

/** Arrastra una tarjeta del tablero hasta una columna, con el ratón (dnd-kit pide 6 px). */
async function arrastrar(p, desde, hasta, pasos = 18) {
    const a = await desde.boundingBox();
    const b = await hasta.boundingBox();
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 12 });
    await p.mouse.down();
    await p.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 4, { steps: 4 });
    await p.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 120), { steps: pasos });
    await espera(p, 250);
    await p.mouse.up();
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

async function miniaturas(p) {
    const focos = {};
    const mini = async (slug, zona, despues) => {
        Object.assign(focos, await tomarUnaMiniatura(p, slug, await zona(), { salida: SALIDA, tomadas }));
        await cerrarLoAbierto(p);
        if (despues) await despues();
    };

    await mini("vista-general", () => caja(p, LA_BARRA));
    await mini("buscar-y-filtrar", async () => unir(await caja(p, EL_BUSCADOR), await caja(p, LOS_FILTROS)));
    await mini("carpetas-y-orden", () => caja(p, LAS_CARPETAS));
    await mini(
        "crear",
        async () => {
            await EL_NUEVO(p).click();
            await campoProyecto(p, "nombre").waitFor({ state: "visible", timeout: 15000 });
            await espera(p, 700);
            await soltarElFoco(p);
            return unir(await caja(p, campoProyecto(p, "nombre")), await caja(p, campoProyecto(p, "fecha")));
        },
        async () => {
            await LA_VENTANA_PROYECTO(p).getByRole("button", { name: "Cancelar" }).click();
            await espera(p, 600);
        },
    );
    await mini("editar-compartir-eliminar", async () => {
        await sobreLaTarjeta(p, TIENDA);
        return caja(p, laParte(p, TIENDA, "mandos"));
    });
    await p.mouse.move(5, 500);
    await abrirElTablero(p);
    await mini("tablero", async () => unir(await caja(p, laColumna(p, "pending")), await caja(p, laColumna(p, "in_progress"))));
    await mini("vencimiento", async () =>
        unir(await caja(p, EL_FILTRO_DE_VENCIMIENTO), await caja(p, laParteDeLaTarea(p, LA_TAREA_EJEMPLO, "vencimiento"))),
    );
    await mini("tarea", () => caja(p, laTarea(p, LA_TAREA_EJEMPLO)));
    await mini(
        "adjuntos-y-comentarios",
        async () => {
            await abrirLaTarea(p);
            // Los comentarios siguen por debajo del pliegue: la zona es lo que
            // SE VE, o el recuadro se saldría de la miniatura.
            const z = unir(await caja(p, campoTarea(p, "adjuntos")), await caja(p, campoTarea(p, "comentarios")));
            const alto = p.viewportSize().height - 16;
            return { ...z, h: Math.min(z.h, alto - z.y) };
        },
        () => cerrarLaTarea(p),
    );
    await volverALaLista(p);

    await desmarcar(p);
    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();
    const barra = await caja(p, LA_BARRA);
    const zonaDeLaBarra = holgura(unir(barra, { ...barra, y: barra.y + 120, h: 1 }), 22, vista);
    await p.mouse.move(5, 500);

    // Portada del vídeo: la pantalla limpia.
    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las cinco zonas, en el orden de `ZONAS_DE_LA_PANTALLA`.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const cPestanas = await caja(p, LAS_PESTANAS(p));
    const bajoElMenu = await dondeAcabaElMenu(p);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: dentro(cPestanas, 4), n: 3 },
        { c: barra, n: 4 },
        { c: holgura(await caja(p, laRejilla(p)), -6, vista), n: 5 },
    ]);
    await guardar(p, "vista-general.webp");
    await desmarcar(p);
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");

    // La barra de trabajo: sus cinco partes, en el orden de `PARTES_DE_LA_BARRA_DE_TRABAJO`.
    await marcar(p, [
        { c: await caja(p, EL_BUSCADOR), n: 1, lado: "abajo" },
        { c: await caja(p, LOS_FILTROS), n: 2, lado: "abajo" },
        { c: await caja(p, LAS_CIFRAS), n: 3, lado: "abajo" },
        { c: await caja(p, LAS_CARPETAS), n: 4, lado: "abajo" },
        { c: await caja(p, EL_NUEVO(p)), n: 5, lado: "abajo" },
    ]);
    await guardar(p, "barra.webp", zonaDeLaBarra);
    await desmarcar(p);

    // Una tarjeta: sus cinco partes, en el orden de `PARTES_DE_UN_PROYECTO`.
    const cTarjeta = await caja(p, elProyecto(p, TIENDA));
    await marcar(
        p,
        [
            { c: await caja(p, laParte(p, TIENDA, "nombre")), n: 1, lado: "izquierda" },
            { c: await caja(p, laParte(p, TIENDA, "estado")), n: 2, lado: "arriba" },
            { c: await caja(p, laParte(p, TIENDA, "etapas")), n: 3, lado: "izquierda" },
            { c: await caja(p, laParte(p, TIENDA, "equipo")), n: 4, lado: "izquierda" },
            { c: await caja(p, laParte(p, TIENDA, "vence")), n: 5, lado: "derecha" },
        ],
        { atenuar: true },
    );
    await guardar(p, "tarjeta.webp", holgura(cTarjeta, 50, vista));
    await desmarcar(p);

    // 2. Buscar y filtrar.
    await p.fill(EL_BUSCADOR, "web");
    await espera(p, 900);
    await marcar(p, [
        { c: await caja(p, EL_BUSCADOR), texto: "«web»", lado: "abajo" },
        { c: await caja(p, laRejilla(p)), texto: "Solo lo que coincide", lado: "derecha", sinRecuadro: false },
    ]);
    await guardar(p, "buscar.webp", holgura(unir(barra, await caja(p, elProyecto(p, "Rediseño de la web"))), 40, vista));
    await desmarcar(p);
    await p.fill(EL_BUSCADOR, "");
    await espera(p, 900);

    for (const [concepto, imagen] of [
        ["Estado", "filtro-estado.webp"],
        ["Responsable", "filtro-responsable.webp"],
    ]) {
        // Con un menú de Radix abierto, lo de fuera es aria-hidden: se mide antes.
        const cBoton = await caja(p, elFiltro(p, concepto));
        await elFiltro(p, concepto).click();
        const menu = p.locator('[role="menu"]').last();
        await menu.waitFor({ state: "visible", timeout: 10000 });
        await espera(p, 500);
        const cMenu = await caja(p, menu);
        await marcar(p, [{ c: cBoton }, { c: cMenu, texto: concepto, lado: "derecha" }]);
        await guardar(p, imagen, holgura(unir(cBoton, cMenu, { ...cMenu, w: cMenu.w + 200 }), 30, vista));
        await desmarcar(p);
        await p.keyboard.press("Escape");
        await espera(p, 500);
    }

    await marcar(p, [{ c: await caja(p, LAS_CIFRAS), texto: "Las cuatro cifras", lado: "abajo" }]);
    await guardar(p, "cifras.webp", zonaDeLaBarra);
    await desmarcar(p);

    // 3. Carpetas y orden.
    await laCarpeta(p, "Clientes").click();
    await espera(p, 900);
    await marcar(p, [
        { c: await caja(p, LAS_CARPETAS), texto: "Clientes: solo sus proyectos", lado: "abajo" },
    ]);
    await guardar(p, "carpetas.webp", holgura(unir(barra, await caja(p, laRejilla(p))), 10, vista));
    await desmarcar(p);
    await laCarpeta(p, "Todas").click();
    await espera(p, 900);

    {
        const cT = await sobreLaTarjeta(p, "Capacitación del equipo");
        const boton = elProyecto(p, "Capacitación del equipo").locator('[data-zona="mandos"] button').first();
        const cBoton = await caja(p, boton);
        await boton.click();
        const menu = p.locator('[role="menu"]').last();
        await menu.waitFor({ state: "visible", timeout: 10000 });
        await espera(p, 500);
        const cMenu = await caja(p, menu);
        await marcar(p, [{ c: cBoton }, { c: cMenu, texto: "¿A qué carpeta va?", lado: "derecha" }]);
        await guardar(p, "mover-a-carpeta.webp", holgura(unir(cT, cMenu, { ...cMenu, w: cMenu.w + 220 }), 30, vista));
        await desmarcar(p);
        await p.keyboard.press("Escape");
        await espera(p, 500);
    }

    {
        const cT = await sobreLaTarjeta(p, TIENDA);
        await marcar(p, [{ c: await caja(p, elAsa(p, TIENDA)), texto: "Agárrala aquí", lado: "izquierda" }], { atenuar: true });
        await guardar(p, "ordenar.webp", holgura(cT, 60, vista));
        await desmarcar(p);
        await p.mouse.move(5, 500);
    }

    // 4. Crear un proyecto: se crea DE VERDAD al final.
    await marcar(p, [{ c: await caja(p, EL_NUEVO(p)), texto: "Nuevo", lado: "abajo" }]);
    await guardar(p, "crear-boton.webp", zonaDeLaBarra);
    await desmarcar(p);
    await EL_NUEVO(p).click();
    await campoProyecto(p, "nombre").waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 700);
    await campoProyecto(p, "nombre").locator("input").fill("Feria de proveedores");
    await campoProyecto(p, "descripcion").locator("textarea").fill("Stand, invitaciones y material para la feria de marzo.");
    await campoProyecto(p, "responsable").locator("select").selectOption({ label: "Sofía Martínez" });
    await soltarElFoco(p);
    const ventanaProyecto = LA_VENTANA_PROYECTO(p);
    const cVentanaProyecto = await caja(p, ventanaProyecto);
    const campos = ["nombre", "descripcion", "estado", "fecha", "responsable", "equipo"];
    const marcasCampos = [];
    for (const [i, c] of campos.entries()) marcasCampos.push({ c: await caja(p, campoProyecto(p, c)), n: i + 1, lado: "izquierda" });
    await marcar(p, marcasCampos);
    await guardar(p, "crear-ventana.webp", holgura(unir(cVentanaProyecto, { ...cVentanaProyecto, x: cVentanaProyecto.x - 40 }), 16, vista));
    await desmarcar(p);
    for (const persona of ["Laura Gómez", "Andrés Ruiz"]) {
        await campoProyecto(p, "equipo").getByRole("button", { name: persona }).click();
        await espera(p, 250);
    }
    await soltarElFoco(p);
    await marcar(p, [{ c: await caja(p, campoProyecto(p, "equipo")), texto: "Quiénes trabajan en él", lado: "abajo" }], { atenuar: true });
    await guardar(p, "crear-equipo.webp", holgura(cVentanaProyecto, 16, vista));
    await desmarcar(p);
    await ventanaProyecto.getByRole("button", { name: "Crear proyecto" }).click();
    await elProyecto(p, "Feria de proveedores").waitFor({ state: "visible", timeout: 30000 });
    await ventanaProyecto.waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
    await espera(p, 1500);
    await elProyecto(p, "Feria de proveedores").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 400);
    await p.mouse.move(5, 500);
    await marcar(p, [{ c: await caja(p, elProyecto(p, "Feria de proveedores")), texto: "Recién creado", lado: "arriba" }], { atenuar: true });
    await guardar(p, "crear-listo.webp");
    await desmarcar(p);
    await laRejilla(p).evaluate((el) => (el.scrollTop = 0));
    await espera(p, 400);

    // 5. Los botones de la tarjeta.
    {
        const cT = await sobreLaTarjeta(p, TIENDA);
        const botones = laParte(p, TIENDA, "mandos").locator("button");
        const marcas = [];
        for (let i = 0; i < 4; i += 1) marcas.push({ c: await caja(p, botones.nth(i)), n: i + 1, lado: "arriba" });
        await marcar(p, marcas, { atenuar: true });
        await guardar(p, "mandos.webp", holgura(cT, 50, vista));
        await desmarcar(p);
    }
    for (const [aria, imagen, cerrar] of [
        [`Editar ${TIENDA}`, "editar.webp", "Cancelar"],
        [`Compartir ${TIENDA}`, "compartir.webp", null],
        [`Eliminar ${TIENDA}`, "eliminar.webp", "Cancelar"],
    ]) {
        await sobreLaTarjeta(p, TIENDA);
        await p.locator(`button[aria-label="${aria}"]`).click();
        const ventana = p.locator('[role="dialog"], [role="alertdialog"]').last();
        await ventana.waitFor({ state: "visible", timeout: 15000 });
        await espera(p, 1000);
        await soltarElFoco(p);
        await guardar(p, imagen, holgura(await caja(p, ventana), 24, vista));
        if (cerrar) await ventana.getByRole("button", { name: cerrar }).click();
        else await p.keyboard.press("Escape");
        await ventana.waitFor({ state: "hidden", timeout: 10000 });
        await espera(p, 500);
    }
    await p.mouse.move(5, 500);

    // 6. El tablero.
    await abrirElTablero(p);
    const cCabezas = [];
    for (const [i, c] of COLUMNAS.entries()) cCabezas.push({ c: await caja(p, laCabeza(p, c)), n: i + 1, lado: "abajo" });
    await marcar(p, [...cCabezas, { c: await caja(p, '[data-zona="proyecto"] button[title="Volver"]'), texto: "Volver", lado: "derecha" }]);
    await guardar(p, "tablero.webp");
    await desmarcar(p);

    const nueva = p.locator('[data-zona="mandos-del-tablero"]').getByRole("button", { name: "Nueva tarea" });
    const mas = laCabeza(p, "in_progress").locator('button[title^="Añadir tarea en"]');
    await marcar(p, [
        { c: await caja(p, nueva), n: 1, lado: "abajo" },
        { c: await caja(p, mas), n: 2, lado: "abajo" },
    ]);
    await guardar(p, "tablero-nueva.webp", holgura(unir(await caja(p, '[data-zona="cabecera-del-tablero"]'), await caja(p, laCabeza(p, "in_progress"))), 24, vista));
    await desmarcar(p);

    // Soltar una tarea en Hecho: sale «Dar por hecha», y se cancela.
    await arrastrar(p, laTarea(p, "Montar el catálogo"), laColumna(p, "done"));
    const hecha = p.getByRole("dialog").filter({ hasText: "Dar por hecha" }).last();
    await hecha.waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 700);
    await soltarElFoco(p);
    await marcar(p, [{ c: await caja(p, hecha), texto: "¿Cuánto tiempo tomó?", lado: "abajo" }]);
    await guardar(p, "tablero-hecho.webp", holgura(await caja(p, hecha), 70, vista));
    await desmarcar(p);
    await hecha.getByRole("button", { name: "Cancelar" }).click();
    await hecha.waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 900);

    {
        const col = laColumna(p, "pending");
        const tarjetas = col.locator("[data-tarea]");
        const marcas = [];
        for (let i = 0; i < Math.min(3, await tarjetas.count()); i += 1) marcas.push({ c: await caja(p, tarjetas.nth(i)), n: i + 1, lado: "derecha" });
        await marcar(p, marcas, { atenuar: true });
        await guardar(p, "tablero-orden.webp", holgura(unir(await caja(p, col), { ...(await caja(p, col)), w: 380 }), 20, vista));
        await desmarcar(p);
    }

    // 7. Vencimiento: los tres colores, el filtro y «Solo vencidas».
    {
        const rojo = laParteDeLaTarea(p, "Fotos de los productos", "vencimiento");
        const ambar = laParteDeLaTarea(p, "Llamar al proveedor de empaques", "vencimiento");
        const gris = laParteDeLaTarea(p, "Configurar la pasarela de pago", "vencimiento");
        await marcar(p, [
            { c: await caja(p, rojo), texto: "Se pasó", lado: "abajo" },
            { c: await caja(p, ambar), texto: "Vence mañana", lado: "abajo" },
            { c: await caja(p, gris), texto: "Falta más", lado: "abajo" },
        ]);
        await guardar(p, "vencimiento-colores.webp", holgura(unir(await caja(p, laColumna(p, "pending")), await caja(p, laColumna(p, "in_progress"))), 10, vista));
        await desmarcar(p);
    }
    const cFiltro = await caja(p, EL_FILTRO_DE_VENCIMIENTO);
    await p.locator(EL_FILTRO_DE_VENCIMIENTO).click();
    const opciones = p.locator('[role="listbox"]').last();
    await opciones.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cOpciones = await caja(p, opciones);
    await marcar(p, [{ c: cFiltro }, { c: cOpciones, texto: "Vencimiento", lado: "izquierda" }]);
    await guardar(p, "vencimiento-filtro.webp", holgura(unir(cFiltro, cOpciones, { ...cOpciones, x: cOpciones.x - 220 }), 30, vista));
    await desmarcar(p);
    await opciones.getByRole("option", { name: "Solo vencidas" }).click();
    await espera(p, 1000);
    await marcar(p, [{ c: await caja(p, EL_FILTRO_DE_VENCIMIENTO), texto: "Solo vencidas", lado: "abajo" }]);
    await guardar(p, "vencimiento-vencidas.webp");
    await desmarcar(p);
    await p.locator(EL_FILTRO_DE_VENCIMIENTO).click();
    await p.locator('[role="listbox"]').last().getByRole("option", { name: "Todas" }).click();
    await espera(p, 900);

    // 8. La tarjeta de una tarea y su ventana.
    {
        const cT = await caja(p, laTarea(p, LA_TAREA_EJEMPLO));
        const partes = ["titulo", "tipo", "vencimiento", "responsable", "adjuntos"];
        const marcas = [];
        for (const [i, z] of partes.entries()) {
            const c = await caja(p, laParteDeLaTarea(p, LA_TAREA_EJEMPLO, z));
            marcas.push({ c, n: i + 1, sinRecuadro: i > 0, numeroEn: i === 0 ? undefined : { x: c.x + c.w / 2, y: cT.y + cT.h + 18 } });
        }
        marcas.push({ c: unir(...marcas.slice(1).map((m) => m.c)) });
        await marcar(p, marcas, { atenuar: true });
        await guardar(p, "tarea-tarjeta.webp", holgura({ ...cT, h: cT.h + 40 }, 40, vista));
        await desmarcar(p);
    }
    await abrirLaTarea(p);
    const ventana = LA_VENTANA_TAREA(p);
    const cVentana = await caja(p, ventana);
    {
        // Solo los cinco de arriba: comentarios y responsable quedan bajo el
        // pliegue y tienen sus propias capturas.
        const campos = ["titulo", "detalle", "tipo", "fecha", "adjuntos"];
        const marcas = [];
        for (const [i, c] of campos.entries()) {
            marcas.push({ c: await caja(p, campoTarea(p, c)), n: i + 1, lado: "izquierda" });
        }
        await marcar(p, marcas);
        await guardar(p, "tarea-ventana.webp", holgura({ ...cVentana, x: cVentana.x - 40, w: cVentana.w + 40 }, 12, vista));
        await desmarcar(p);
    }
    await marcar(p, [
        { c: await caja(p, campoTarea(p, "tipo")), n: 1, lado: "izquierda" },
        { c: await caja(p, campoTarea(p, "fecha")), n: 2, lado: "derecha" },
    ], { atenuar: true });
    await guardar(p, "tarea-tipo.webp", holgura(cVentana, 12, vista));
    await desmarcar(p);

    await campoTarea(p, "adjuntos").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 500);
    await marcar(p, [{ c: await caja(p, campoTarea(p, "adjuntos")), texto: "Una imagen y un PDF", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "adjuntos.webp", holgura(cVentana, 12, vista));
    await desmarcar(p);

    await campoTarea(p, "comentarios").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 500);
    await marcar(p, [{ c: await caja(p, campoTarea(p, "comentarios")), texto: "La conversación del equipo", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "comentarios.webp", holgura(cVentana, 12, vista));
    await desmarcar(p);

    await campoTarea(p, "responsable").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 500);
    await marcar(p, [{ c: await caja(p, campoTarea(p, "responsable")), texto: "Quién la lleva", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "tarea-responsable.webp", holgura(cVentana, 12, vista));
    await desmarcar(p);

    await ventana.getByRole("button", { name: "Eliminar" }).click();
    const alerta = p.locator('[role="alertdialog"]');
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await soltarElFoco(p);
    await guardar(p, "tarea-eliminar.webp", holgura(await caja(p, alerta), 24, vista));
    await alerta.getByRole("button", { name: "Volver" }).click();
    await alerta.waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 400);
    await cerrarLaTarea(p);
    await volverALaLista(p);

    await elMarcoDeLaPantalla(p, guardar, { modulo: "Panel", texto: "Proyectos está en Panel" });
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
    await servirLosAdjuntos(ctx);
    await ctx.addInitScript(CURSOR);
    const p = await ctx.newPage();
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirLaPantalla(p);
    await p.mouse.move(640, 400, { steps: 8 });
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("su estado", 200);
    await mover(p, laParte(p, TIENDA, "estado"));
    await alDecir("su equipo", 100);
    await mover(p, laParte(p, TIENDA, "equipo"));
    await alDecir("cuánto trabajo", 200);
    await mover(p, laParte(p, TIENDA, "etapas"));

    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const panel = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Panel" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Panel", 600);
    await mover(p, panel);

    const [, , , buscarTodo, , soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    await decir("filtros");
    await alDecir("Con el buscador");
    await pulsar(p, p.locator(EL_BUSCADOR));
    await p.locator(EL_BUSCADOR).pressSequentially("web", { delay: 90 });
    await alDecir("estos dos desplegables", 300);
    await p.locator(EL_BUSCADOR).fill("");
    await pulsar(p, elFiltro(p, "Estado"));
    await p.locator('[role="menu"]').last().waitFor({ state: "visible", timeout: 10000 });
    await alDecir("por quién lo lleva", 200);
    await p.keyboard.press("Escape");
    await mover(p, elFiltro(p, "Responsable"));

    await decir("carpetas");
    await alDecir("pulsa una");
    await pulsar(p, laCarpeta(p, "Clientes"));
    await alDecir("solo los suyos", 0);
    await espera(p, 400);
    await pulsar(p, laCarpeta(p, "Todas"));
    await alDecir("por su asa");
    await sobreLaTarjeta(p, TIENDA);
    await mover(p, elAsa(p, TIENDA));

    await decir("crear");
    await alDecir("Con Nuevo");
    await pulsar(p, EL_NUEVO(p));
    await campoProyecto(p, "nombre").waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 500);
    await alDecir("le pones nombre", 0);
    await pulsar(p, campoProyecto(p, "nombre").locator("input"));
    await campoProyecto(p, "nombre").locator("input").pressSequentially("Feria de proveedores", { delay: 35 });
    await alDecir("la fecha límite", 0);
    await mover(p, campoProyecto(p, "fecha"));
    await alDecir("quién es el responsable", 0);
    await pulsar(p, campoProyecto(p, "responsable").locator("select"));
    await campoProyecto(p, "responsable").locator("select").selectOption({ label: "Sofía Martínez" });
    await alDecir("quiénes trabajan", 0);
    await pulsar(p, campoProyecto(p, "equipo").getByRole("button", { name: "Laura Gómez" }));
    await pulsar(p, campoProyecto(p, "equipo").getByRole("button", { name: "Andrés Ruiz" }));
    await callar();
    await pulsar(p, LA_VENTANA_PROYECTO(p).getByRole("button", { name: "Crear proyecto" }));
    // La frase arranca mientras se guarda: esperar al proyecto en silencio
    // dejaba un hueco mudo de más de un segundo.
    await decir("tablero");
    await elProyecto(p, "Feria de proveedores").waitFor({ state: "visible", timeout: 30000 });
    await alDecir("Al pulsar una tarjeta");
    await pulsar(p, laParte(p, TIENDA, "nombre"));
    await laColumna(p, "pending").waitFor({ state: "visible", timeout: 30000 });
    await p.locator(`${ELTABLERO} [data-tarea]`).first().waitFor({ state: "visible", timeout: 30000 });
    await esconderLosBotonesDelBorde(p);
    await alDecir("por columnas", 100);
    await mover(p, laCabeza(p, "pending"));
    await alDecir("a hecho", 100);
    await mover(p, laCabeza(p, "done"));
    await alDecir("arrastrándolas", 500);
    await arrastrar(p, laTarea(p, "Textos de la página de inicio"), laColumna(p, "in_progress"), 28);

    await decir("vencimiento");
    await alDecir("en rojo");
    await mover(p, laParteDeLaTarea(p, "Fotos de los productos", "vencimiento"));
    await alDecir("en ámbar");
    await mover(p, laParteDeLaTarea(p, "Llamar al proveedor de empaques", "vencimiento"));
    await alDecir("con este filtro");
    await pulsar(p, p.locator(EL_FILTRO_DE_VENCIMIENTO));
    const opciones = p.locator('[role="listbox"]').last();
    await opciones.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("solo con las vencidas", 300);
    await pulsar(p, opciones.getByRole("option", { name: "Solo vencidas" }));

    await decir("tarea");
    await alDecir("Al abrir una tarea");
    await pulsar(p, laTarea(p, LA_TAREA_EJEMPLO));
    await campoTarea(p, "comentarios").waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 400);
    await alDecir("su tipo", 0);
    await mover(p, campoTarea(p, "tipo"));
    await alDecir("para cuándo es", 0);
    await mover(p, campoTarea(p, "fecha"));
    await alDecir("quién la lleva", 0);
    await mover(p, campoTarea(p, "responsable"));
    await alDecir("sus archivos", 0);
    await mover(p, campoTarea(p, "adjuntos"));
    await alDecir("la conversación", 0);
    await mover(p, campoTarea(p, "comentarios"));

    await decir("cierre");
    await pulsar(p, LA_VENTANA_TAREA(p).getByRole("button", { name: "Cancelar" }));
    await alDecir("La flecha", 200);
    await pulsar(p, p.locator('[data-zona="proyecto"] button[title="Volver"]'));
    await p.waitForSelector("[data-proyecto]", { timeout: 30000 });
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
    escribirLaVozDelVideo("proyectos", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
    console.log("  ✓ demostracion.webm", Math.round(statSync(destino).size / 1024), "KB,", colocados.length, "frases narradas");
}

/* ------------------------------------------------------------------ */

const navegador = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    args: ["--lang=es-CO"],
    // El campo de fecha lo pinta el proceso de Chromium con SU idioma: hacen
    // falta las dos cosas (la regla de la guía de Finanzas).
    env: { ...process.env, LANG: "es_CO.UTF-8", LANGUAGE: "es_CO:es" },
});
try {
    const ctx = await navegador.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        locale: "es-CO",
        timezoneId: "America/Bogota",
    });
    await servirLosAdjuntos(ctx);
    const p = await entrar(ctx, BASE);
    await abrirLaPantalla(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        // Las capturas crean un proyecto: el vídeo sale del mismo punto de partida.
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-proyectos.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/proyectos`);
