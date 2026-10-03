/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Embudos, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-embudos.mjs`).
 *
 * La MISMA receta que las demás guías y con las MISMAS piezas del taller
 * (`taller-de-la-guia.mjs`): cada captura es «abre esto, pulsa aquello, resalta
 * este elemento», y las marcas se localizan por lo que la pantalla ya expone
 * —los `data-columna` y `data-tarjeta` del tablero, los `data-selector` y
 * `data-filtro` de la barra, los `data-hoja` de los paneles—, no por
 * coordenadas escritas a mano.
 *
 * Nada se guarda ni se borra: «Nuevo», «Renombrar», «Eliminar», las etapas,
 * los asesores, vaciar y restaurar se abren, se fotografían y se CANCELAN. Lo
 * único que cambia los datos es arrastrar una tarjeta, así que antes del vídeo
 * se vuelve a sembrar.
 *
 * Qué captura hace falta lo dice `lib/guia-embudos.ts`: el script se niega a
 * terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-embudos.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-embudos.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "embudos");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-embudos";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
// Solo el vídeo (p. ej. al cambiar la narración): las imágenes se conservan del disco.
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-embudos.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-embudos.json");

/** Las siete columnas no caben en 1440: el tablero entero se fotografía en una ventana ancha. */
const ANCHA = { width: 2060, height: 900 };

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Medir                                                               */
/* ------------------------------------------------------------------ */

const LA_BARRA = "[data-barra-de-acciones]";
const EL_BUSCADOR = 'input[aria-label="Buscar conversación"]';
const LA_CUENTA = '[data-selector="cuenta"]';
const EL_EMBUDO = '[data-selector="embudo"]';
const EL_ASESOR = '[data-filtro="asesor"]';
const LO_SECUNDARIO = `${LA_BARRA} [data-zona="secundarias"]`;
const EL_NUEVO = (p) => p.locator(`${LA_BARRA} [data-zona="crear"] button`).first();
const LOS_TRES_PUNTOS = (p) => p.locator(`${LA_BARRA} [data-zona="acciones"] button[aria-label="Acciones"]`).first();
const LAS_PESTANAS = (p) => p.locator('nav a[href="/embudos"]').first().locator("xpath=ancestor::div[contains(@class,'sticky')][1]");

const laColumna = (p, nombre) => p.locator(`[data-columna="${nombre}"]`).first();
const laCabeza = (p, nombre) => laColumna(p, nombre).locator("[data-cabeza-de-columna]").first();
const elMando = (p, columna, aria) => laCabeza(p, columna).locator(`button[aria-label="${aria}"]`).first();
const laTarjeta = (p, nombre) => p.locator("[data-tarjeta]", { hasText: nombre }).first();
const laHoja = (p, nombre) => p.locator(`[data-hoja="${nombre}"]`).first();
const elMenuAbierto = (p) => p.locator('[role="menu"]').last();
const laOpcion = (p, nombre) => elMenuAbierto(p).getByRole("menuitem", { name: nombre }).first();
const laFilaDeEtapa = (p, i) => laHoja(p, "etapas").locator(`input[aria-label="Nombre de la etapa ${i}"]`).locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]");

const ETAPAS = ["Nuevo", "Contactado", "Interesado", "Cotizado", "Negociación", "Ganado", "Perdido"];

async function abrirLaPantalla(p) {
    await p.goto(`${BASE}/embudos`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("[data-tarjeta]", { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    // Los botones del borde tapan la última columna.
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
            for (const el of raiz.querySelectorAll("[data-tarjeta] .truncate, [data-tarjeta] .line-clamp-2, [data-cabeza-de-columna] .truncate")) {
                if (!el.getClientRects().length) continue;
                if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) fuera.push(el.textContent || "");
            }
        }
        return fuera;
    }, dentro_);
    if (recortados.length) throw new Error(`[guia] sale recortado con «…»: ${recortados.join(" · ")}`);
}

const soltarElFoco = (p) => p.evaluate(() => document.activeElement?.blur?.());

async function laBarraDeTrabajo(p) {
    return caja(p, LA_BARRA);
}

/** El tablero desplazado al principio: lo que dejó corrido la receta anterior no cuenta. */
async function alPrincipio(p) {
    await laColumna(p, "Nuevo").evaluate((el) => {
        for (let n = el.parentElement; n; n = n.parentElement) n.scrollLeft = 0;
    });
    await espera(p, 250);
}

async function aLaVista(p, locator) {
    await locator.evaluate((el) => el.scrollIntoView({ block: "nearest", inline: "center" }));
    await espera(p, 300);
}

async function ancha(p, hacer) {
    const antes = p.viewportSize();
    await p.setViewportSize(ANCHA);
    await espera(p, 900);
    await alPrincipio(p);
    try {
        await hacer();
    } finally {
        await p.setViewportSize(antes);
        await espera(p, 700);
    }
}

async function abrirElMenu(p, boton) {
    await boton.click();
    await elMenuAbierto(p).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
}

async function cerrarConEscape(p) {
    await p.keyboard.press("Escape");
    await espera(p, 500);
}

async function abrirLasEtapas(p) {
    await elMando(p, "Interesado", "Editar etapas").click();
    await laHoja(p, "etapas").waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 900);
    await soltarElFoco(p);
}

async function cancelarLaHoja(p, nombre, boton = "Cancelar") {
    const hoja = laHoja(p, nombre);
    await hoja.getByRole("button", { name: boton, exact: true }).click();
    await hoja.waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 400);
}

async function abrirAsesores(p) {
    await abrirElMenu(p, LOS_TRES_PUNTOS(p));
    await laOpcion(p, "Asignar asesores").click();
    await laHoja(p, "asesores").waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 900);
    await soltarElFoco(p);
}

async function abrirLaPapelera(p) {
    await aLaVista(p, laColumna(p, "Perdido"));
    await elMando(p, "Perdido", "Abrir la papelera").click();
    const hoja = laHoja(p, "papelera");
    await hoja.waitFor({ state: "visible", timeout: 10000 });
    await hoja.getByRole("button", { name: "Restaurar", exact: true }).first().waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 700);
    await soltarElFoco(p);
}

/** Arrastra una tarjeta a otra columna como lo haría una mano: despacio, y suelta en medio. */
async function arrastrar(p, tarjeta, columna, { pasos = 14, antesDeSoltar } = {}) {
    const c = await caja(p, tarjeta);
    const d = await caja(p, columna);
    await p.mouse.move(c.x + c.w - 18, c.y + c.h - 8, { steps: 6 });
    await p.mouse.down();
    await p.mouse.move(c.x + c.w - 8, c.y + c.h - 14, { steps: 4 });
    await p.mouse.move(d.x + d.w / 2, d.y + Math.min(d.h / 2, 260), { steps: pasos });
    await espera(p, 400);
    if (antesDeSoltar) await antesDeSoltar();
    await p.mouse.up();
    await espera(p, 1200);
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

    await mini("vista-general", () => laBarraDeTrabajo(p));
    await mini("tablero", async () => {
        await alPrincipio(p);
        return unir(await caja(p, laColumna(p, "Contactado")), await caja(p, laColumna(p, "Interesado")));
    });
    await mini("embudo-de-ventas", async () => {
        await alPrincipio(p);
        return unir(await caja(p, laCabeza(p, "Nuevo")), await caja(p, laCabeza(p, "Cotizado")));
    });
    await mini("selectores", async () => unir(await caja(p, LA_CUENTA), await caja(p, EL_EMBUDO), await caja(p, EL_ASESOR)));
    await mini(
        "crear-embudo",
        async () => {
            await EL_NUEVO(p).click();
            const dialogo = p.getByRole("dialog");
            await dialogo.waitFor({ state: "visible", timeout: 10000 });
            await dialogo.locator('input[aria-label="Nombre del embudo"]').fill("Soporte");
            await espera(p, 600);
            await soltarElFoco(p);
            return caja(p, dialogo);
        },
        async () => {
            await p.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
            await espera(p, 500);
        },
    );
    await mini(
        "etapas",
        async () => {
            await alPrincipio(p);
            await abrirLasEtapas(p);
            return unir(await caja(p, laFilaDeEtapa(p, 1)), await caja(p, laFilaDeEtapa(p, 3)));
        },
        () => cancelarLaHoja(p, "etapas"),
    );
    await mini(
        "asesores",
        async () => {
            await abrirAsesores(p);
            const filas = laHoja(p, "asesores").locator('button[aria-label^="Embudo de "]');
            return unir(await caja(p, filas.first()), await caja(p, filas.nth(2)));
        },
        () => cancelarLaHoja(p, "asesores"),
    );
    await mini("perdido", async () => {
        await aLaVista(p, laColumna(p, "Perdido"));
        return caja(p, laCabeza(p, "Perdido"));
    });

    await alPrincipio(p);
    await desmarcar(p);
    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    let vista = p.viewportSize();
    const barra = await laBarraDeTrabajo(p);

    // Portada del vídeo: la pantalla limpia.
    await alPrincipio(p);
    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las cinco zonas, en el orden de `ZONAS_DE_LA_PANTALLA`.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const cPestanas = await caja(p, LAS_PESTANAS(p));
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cTablero = unir(await caja(p, laColumna(p, "Nuevo")), { x: vista.width - 30, y: (await caja(p, laColumna(p, "Nuevo"))).y, w: 1, h: 1 });
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: dentro(cPestanas, 4), n: 3 },
        { c: barra, n: 4 },
        { c: { ...cTablero, h: Math.min(cTablero.h, vista.height - cTablero.y - 20) }, n: 5 },
    ]);
    await guardar(p, "vista-general.webp");
    await desmarcar(p);
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");

    // Las pestañas del Panel: Embudos encendida.
    const pestana = await caja(p, p.locator('nav a[href="/embudos"]').first());
    await marcar(p, [{ c: dentro(cPestanas, 4), soloLuz: true }, { c: pestana, texto: "Estás en Embudos", lado: "abajo" }], { atenuar: true });
    const zonaPestanas = holgura({ ...cPestanas, x: cPestanas.x - 40, w: cPestanas.w + 40, h: cPestanas.h + 110 }, 12, vista);
    await guardar(p, "pestanas.webp", { ...zonaPestanas, y: cPestanas.y, h: zonaPestanas.h - (cPestanas.y - zonaPestanas.y) });
    await desmarcar(p);

    // La barra de trabajo: sus siete partes, en el orden de `PARTES_DE_LA_BARRA_DE_TRABAJO`.
    await marcar(p, [
        { c: await caja(p, EL_BUSCADOR), n: 1 },
        { c: await caja(p, LA_CUENTA), n: 2 },
        { c: await caja(p, EL_EMBUDO), n: 3 },
        { c: await caja(p, EL_ASESOR), n: 4 },
        { c: await caja(p, LO_SECUNDARIO), n: 5 },
        { c: await caja(p, EL_NUEVO(p)), n: 6 },
        { c: await caja(p, LOS_TRES_PUNTOS(p)), n: 7 },
    ]);
    await guardar(p, "barra.webp", holgura(barra, 34, vista));
    await desmarcar(p);

    // 2. El tablero entero y sus siete etapas, en una ventana ancha.
    await ancha(p, async () => {
        const v = p.viewportSize();
        const cols = await Promise.all(ETAPAS.map((e) => caja(p, laColumna(p, e))));
        const todo = unir(...cols);
        // Sin aire por arriba: encima del tablero queda el borde de la barra de trabajo.
        const recorte = holgura({ ...todo, h: Math.min(todo.h, v.height - todo.y - 16) }, 16, v);
        await guardar(p, "tablero.webp", { ...recorte, y: todo.y - 4, h: recorte.h - (todo.y - 4 - recorte.y) });

        const cabezas = await Promise.all(ETAPAS.map((e) => caja(p, laCabeza(p, e))));
        await marcar(p, cabezas.map((c, i) => ({ c, n: i + 1, lado: "abajo" })));
        await guardar(p, "embudo-de-ventas.webp", holgura(unir(...cabezas, { ...cabezas[0], y: cabezas[0].y + 230, h: 1 }), 22, v));
        await desmarcar(p);

        await marcar(
            p,
            [
                { c: cabezas[0], texto: "Siempre la primera", lado: "abajo" },
                { c: cabezas[5], texto: "Ganado", lado: "abajo" },
                { c: cabezas[6], texto: "Perdido", lado: "abajo" },
            ],
            { atenuar: true },
        );
        await guardar(p, "etapas-del-sistema.webp", holgura(unir(...cabezas, { ...cabezas[0], y: cabezas[0].y + 150, h: 1 }), 22, v));
        await desmarcar(p);

        await marcar(p, [{ c: unir(cabezas[1], cabezas[4]), texto: "Estas son tuyas", lado: "abajo" }], { atenuar: true });
        await guardar(p, "etapas-libres.webp", holgura(unir(...cabezas, { ...cabezas[0], y: cabezas[0].y + 150, h: 1 }), 22, v));
        await desmarcar(p);
    });
    vista = p.viewportSize();

    // Una tarjeta.
    const ejemplo = laTarjeta(p, "Paula Castro");
    const cEjemplo = await caja(p, ejemplo);
    await marcar(p, [{ c: cEjemplo, texto: "Una conversación", lado: "derecha" }], { atenuar: true });
    await guardar(p, "tarjeta.webp", holgura(unir(cEjemplo, { ...cEjemplo, x: cEjemplo.x + cEjemplo.w + 230, w: 1 }), 30, vista));
    await desmarcar(p);

    // Arrastrar: la foto se toma CON la tarjeta en el aire, antes de soltarla.
    const deContactado = laTarjeta(p, "Carlos Gómez");
    const zonaArrastre = holgura(unir(await caja(p, laColumna(p, "Contactado")), await caja(p, laColumna(p, "Interesado"))), 18, vista);
    await arrastrar(p, deContactado, laColumna(p, "Interesado"), {
        antesDeSoltar: async () => {
            await guardar(p, "arrastrar.webp", { ...zonaArrastre, h: Math.min(zonaArrastre.h, 340, vista.height - zonaArrastre.y) });
        },
    });
    await laColumna(p, "Interesado").locator("[data-tarjeta]", { hasText: "Carlos Gómez" }).waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 800);

    // Buscar.
    await p.locator(EL_BUSCADOR).fill("Paula");
    await espera(p, 900);
    await marcar(p, [
        { c: await caja(p, EL_BUSCADOR), n: 1, lado: "abajo" },
        { c: await caja(p, laTarjeta(p, "Paula Castro")), n: 2, lado: "derecha" },
    ]);
    const cBuscar = unir(await caja(p, EL_BUSCADOR), await caja(p, laColumna(p, "Interesado")));
    await guardar(p, "buscar.webp", holgura({ ...cBuscar, w: cBuscar.w + 220, h: Math.min(cBuscar.h, 420) }, 24, vista));
    await desmarcar(p);
    await p.locator(EL_BUSCADOR).fill("");
    await espera(p, 700);

    // 3. Los selectores, con su menú abierto.
    for (const [boton, imagen, ancho] of [
        [EL_EMBUDO, "selector-embudo.webp", 320],
        [LA_CUENTA, "selector-cuenta.webp", 320],
        [EL_ASESOR, "filtro-asesor.webp", 320],
    ]) {
        const cBoton = await caja(p, boton);
        await abrirElMenu(p, p.locator(boton).first());
        await soltarElFoco(p);
        const cMenu = await caja(p, elMenuAbierto(p));
        await marcar(p, [{ c: cBoton, soloLuz: true }]);
        await guardar(p, imagen, holgura(unir(cBoton, cMenu, { ...cBoton, x: cBoton.x + ancho, w: 1 }), 22, vista));
        await desmarcar(p);
        await cerrarConEscape(p);
    }

    // 4. Crear, el «⋯», renombrar y eliminar: todo se abre y se CANCELA.
    await EL_NUEVO(p).click();
    let dialogo = p.getByRole("dialog");
    await dialogo.waitFor({ state: "visible", timeout: 10000 });
    await dialogo.locator('input[aria-label="Nombre del embudo"]').fill("Soporte");
    await espera(p, 500);
    await soltarElFoco(p);
    await marcar(p, [{ c: await caja(p, dialogo.getByRole("button", { name: "Crear" })), texto: "Crea el embudo", lado: "abajo" }]);
    await guardar(p, "crear-embudo.webp", holgura(unir(await caja(p, dialogo), { ...(await caja(p, dialogo)), y: (await caja(p, dialogo)).y + (await caja(p, dialogo)).h + 70, h: 1 }), 24, vista));
    await desmarcar(p);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 500);

    const cPuntos = await caja(p, LOS_TRES_PUNTOS(p));
    await abrirElMenu(p, LOS_TRES_PUNTOS(p));
    await soltarElFoco(p);
    const cMenuBarra = await caja(p, elMenuAbierto(p));
    await marcar(p, [{ c: cPuntos, soloLuz: true }]);
    await guardar(p, "menu-del-embudo.webp", holgura(unir(cPuntos, cMenuBarra), 24, vista));
    await desmarcar(p);

    await laOpcion(p, "Renombrar embudo").click();
    dialogo = p.getByRole("dialog");
    await dialogo.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await soltarElFoco(p);
    const cRenombrar = await caja(p, dialogo);
    await marcar(p, [{ c: await caja(p, dialogo.locator('input[aria-label="Nombre del embudo"]')), texto: "El nombre nuevo", lado: "abajo" }]);
    await guardar(p, "renombrar-embudo.webp", holgura(unir(cRenombrar, { ...cRenombrar, y: cRenombrar.y + cRenombrar.h + 40, h: 1 }), 24, vista));
    await desmarcar(p);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 500);

    await abrirElMenu(p, LOS_TRES_PUNTOS(p));
    await laOpcion(p, "Eliminar embudo").click();
    const alerta = p.locator('[role="alertdialog"]');
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await soltarElFoco(p);
    const cAlerta = await caja(p, alerta);
    await marcar(p, [
        { c: await caja(p, alerta.getByRole("button", { name: "Cancelar" })), texto: "No cambia nada", lado: "abajo" },
        { c: await caja(p, alerta.getByRole("button", { name: "Eliminar" })), texto: "Lo borra", lado: "abajo" },
    ]);
    await guardar(p, "eliminar-embudo.webp", holgura(unir(cAlerta, { ...cAlerta, y: cAlerta.y + cAlerta.h + 84, h: 1 }), 26, vista));
    await desmarcar(p);
    await alerta.getByRole("button", { name: "Cancelar" }).click();
    await alerta.waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 400);

    // 5. Las etapas.
    await alPrincipio(p);
    const engranaje = elMando(p, "Interesado", "Editar etapas");
    const cIntCabeza = await caja(p, laCabeza(p, "Interesado"));
    await marcar(p, [{ c: dentro(cIntCabeza, -2), soloLuz: true }, { c: await caja(p, engranaje), texto: "El engranaje", lado: "abajo" }], { atenuar: true });
    await guardar(p, "abrir-etapas.webp", holgura(unir(cIntCabeza, { ...cIntCabeza, y: cIntCabeza.y + 140, h: 1 }), 30, vista));
    await desmarcar(p);

    await abrirLasEtapas(p);
    const hoja = laHoja(p, "etapas");
    const cHoja = await caja(p, hoja);
    const fila1 = laFilaDeEtapa(p, 1);
    const fila2 = laFilaDeEtapa(p, 2);
    const fila3 = laFilaDeEtapa(p, 3);
    const cNombre2 = await caja(p, hoja.locator('input[aria-label="Nombre de la etapa 2"]'));
    const cFlechas3 = unir(await caja(p, fila3.locator('button[aria-label="Subir etapa"]')), await caja(p, fila3.locator('button[aria-label="Bajar etapa"]')));
    const cCandado = await caja(p, fila1.locator('[aria-label="Etapa del sistema"]'));
    await marcar(p, [
        { c: cNombre2, n: 1, numeroEn: { x: cNombre2.x + cNombre2.w - 18, y: cNombre2.y - 2 } },
        { c: cFlechas3, n: 2, numeroEn: { x: cFlechas3.x + cFlechas3.w + 14, y: cFlechas3.y - 6 } },
        { c: cCandado, n: 3, numeroEn: { x: cCandado.x - 18, y: cCandado.y + cCandado.h / 2 } },
    ]);
    await guardar(p, "etapas-nombre.webp", { ...cHoja, h: Math.min(cHoja.h, 620) });
    await desmarcar(p);

    const colores = fila2.locator('button[aria-label^="Color "]');
    await marcar(p, [
        { c: unir(await caja(p, colores.first()), await caja(p, fila2.locator('input[type="color"]'))), texto: "Su color", lado: "abajo" },
    ], { atenuar: true });
    await guardar(p, "etapas-color.webp", { ...cHoja, h: Math.min(cHoja.h, 620) });
    await desmarcar(p);

    const nueva = hoja.getByRole("button", { name: "Nueva etapa" });
    await nueva.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 400);
    await marcar(p, [
        { c: await caja(p, nueva), n: 1, lado: "arriba" },
        { c: await caja(p, hoja.getByRole("button", { name: "Guardar", exact: true })), n: 2, lado: "arriba" },
    ]);
    await guardar(p, "etapas-nueva.webp", cHoja);
    await desmarcar(p);
    await cancelarLaHoja(p, "etapas");

    // 6. Los asesores.
    const cPuntos2 = await caja(p, LOS_TRES_PUNTOS(p));
    await abrirElMenu(p, LOS_TRES_PUNTOS(p));
    await soltarElFoco(p);
    await marcar(p, [{ c: cPuntos2, soloLuz: true }, { c: await caja(p, laOpcion(p, "Asignar asesores")), texto: "Asignar asesores", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "asesores.webp", holgura(unir(cPuntos2, await caja(p, elMenuAbierto(p)), { ...cPuntos2, x: cPuntos2.x - 380, w: 1 }), 24, vista));
    await desmarcar(p);
    await laOpcion(p, "Asignar asesores").click();
    const hojaAsesores = laHoja(p, "asesores");
    await hojaAsesores.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 900);
    const elegir = hojaAsesores.locator('button[aria-label="Embudo de Laura Gómez"]');
    await elegir.click();
    const lista = p.locator('[role="listbox"]').last();
    await lista.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cHojaAsesores = await caja(p, hojaAsesores);
    const cLista = await caja(p, lista);
    await marcar(p, [{ c: await caja(p, elegir), soloLuz: true }, { c: cLista, texto: "Su embudo", lado: "abajo" }]);
    await guardar(p, "asesores-elegir.webp", { ...cHojaAsesores, h: Math.min(cHojaAsesores.h, cLista.y + cLista.h + 130 - cHojaAsesores.y) });
    await desmarcar(p);
    await cerrarConEscape(p);
    await cancelarLaHoja(p, "asesores");

    // Sus conversaciones lo siguen: Andrés usa Postventa, y filtrar por él lleva a ese embudo.
    await abrirElMenu(p, p.locator(EL_ASESOR).first());
    await laOpcion(p, /Andrés Ruiz/).click();
    await p.waitForSelector('[data-columna="Entregado"]', { timeout: 20000 });
    await espera(p, 1200);
    await alPrincipio(p);
    await soltarElFoco(p);
    await marcar(p, [
        { c: await caja(p, EL_EMBUDO), n: 1, lado: "abajo" },
        { c: await caja(p, EL_ASESOR), n: 2, lado: "abajo" },
    ]);
    const cPost = unir(await caja(p, LA_BARRA), await caja(p, laColumna(p, "Nuevo")));
    await guardar(p, "asesores-tablero.webp", holgura({ ...cPost, h: Math.min(cPost.h, vista.height - cPost.y - 20) }, 16, vista));
    await desmarcar(p);
    await abrirLaPantalla(p);

    // 7. Perdido y su papelera.
    await aLaVista(p, laColumna(p, "Perdido"));
    const cPerdido = await caja(p, laColumna(p, "Perdido"));
    const cVaciar = await caja(p, elMando(p, "Perdido", "Vaciar la columna"));
    const cAbrirPapelera = await caja(p, elMando(p, "Perdido", "Abrir la papelera"));
    await marcar(p, [
        { c: cVaciar, n: 1, numeroEn: { x: cVaciar.x + cVaciar.w / 2 + 8, y: cVaciar.y + cVaciar.h + 22 } },
        { c: cAbrirPapelera, n: 2, numeroEn: { x: cAbrirPapelera.x + cAbrirPapelera.w / 2 - 12, y: cAbrirPapelera.y + cAbrirPapelera.h + 22 } },
    ]);
    await guardar(p, "vaciar.webp", holgura({ ...cPerdido, h: Math.min(cPerdido.h, 360) }, 24, vista));
    await desmarcar(p);

    await elMando(p, "Perdido", "Vaciar la columna").click();
    const alertaVaciar = p.locator('[role="alertdialog"]');
    await alertaVaciar.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await soltarElFoco(p);
    await alertaVaciar.getByRole("button", { name: "Cancelar" }).click();
    await alertaVaciar.waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 400);

    // La hoja ocupa el alto entero: con la ventana entera quedaría casi toda en
    // blanco entre la lista y sus botones. Se fotografía en una más baja.
    await p.setViewportSize({ width: vista.width, height: 640 });
    await abrirLaPapelera(p);
    const hojaPapelera = laHoja(p, "papelera");
    await espera(p, 500);
    await p.mouse.move(4, 4);
    await espera(p, 300);
    const cPapelera = await caja(p, hojaPapelera);
    await guardar(p, "papelera.webp", cPapelera);
    await marcar(p, [
        { c: await caja(p, hojaPapelera.getByRole("button", { name: "Restaurar", exact: true }).first()), n: 1, lado: "izquierda" },
        { c: await caja(p, hojaPapelera.getByRole("button", { name: "Restaurar todo" })), n: 2, lado: "arriba" },
    ]);
    await guardar(p, "restaurar.webp", cPapelera);
    await desmarcar(p);
    await cancelarLaHoja(p, "papelera", "Cerrar");
    await p.setViewportSize(vista);
    await espera(p, 400);
    await alPrincipio(p);

    await elMarcoDeLaPantalla(p, guardar, { modulo: "Panel", texto: "Embudos está en Panel" });
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

    await abrirLaPantalla(p);
    await p.mouse.move(640, 400, { steps: 8 });
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("llegan nuevas", 200);
    await mover(p, laCabeza(p, "Nuevo"));
    await alDecir("se ganan", 100);
    await mover(p, laCabeza(p, "Negociación"));

    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const panel = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Panel" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Panel", 600);
    await mover(p, panel);

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
    await alDecir("Cada columna es una etapa");
    await mover(p, laCabeza(p, "Contactado"));
    await alDecir("cuántas conversaciones tiene", 0);
    await mover(p, laCabeza(p, "Contactado").locator('[data-ui="badge"], .rounded-full').first());
    await alDecir("cada tarjeta es un contacto", 0);
    await mover(p, laTarjeta(p, "Paula Castro"));

    await decir("arrastrar");
    await alDecir("arrastras su tarjeta", 0);
    await arrastrar(p, laTarjeta(p, "Carlos Gómez"), laColumna(p, "Interesado"), { pasos: 34 });
    await alDecir("los números se ponen al día", 0);
    await mover(p, laCabeza(p, "Interesado"));

    await decir("selectores");
    await alDecir("el embudo", 0);
    await mover(p, p.locator(EL_EMBUDO).first());
    await alDecir("la cuenta", 0);
    await mover(p, p.locator(LA_CUENTA).first());
    await alDecir("y el asesor", 0);
    await pulsar(p, p.locator(EL_ASESOR).first());
    await elMenuAbierto(p).waitFor({ state: "visible", timeout: 10000 });
    await alDecir("solo lo de una persona", 0);
    await pulsar(p, laOpcion(p, /Laura Gómez/));
    await espera(p, 1200);

    await decir("crear");
    await pulsar(p, p.locator(EL_ASESOR).first());
    await elMenuAbierto(p).waitFor({ state: "visible", timeout: 10000 });
    await pulsar(p, laOpcion(p, "Todos los asesores"));
    await alDecir("Con Nuevo");
    await pulsar(p, EL_NUEVO(p));
    const dialogo = p.getByRole("dialog");
    await dialogo.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("por ejemplo para soporte", 0);
    await dialogo.locator('input[aria-label="Nombre del embudo"]').pressSequentially("Soporte", { delay: 60 });
    await pulsar(p, dialogo.getByRole("button", { name: "Cancelar" }));
    await dialogo.waitFor({ state: "hidden", timeout: 10000 });
    await alDecir("en los tres puntos", 0);
    await pulsar(p, LOS_TRES_PUNTOS(p));
    await elMenuAbierto(p).waitFor({ state: "visible", timeout: 10000 });
    await alDecir("lo renombras", 0);
    await mover(p, laOpcion(p, "Renombrar embudo"));
    await alDecir("lo eliminas", 0);
    await mover(p, laOpcion(p, "Eliminar embudo"));
    await p.keyboard.press("Escape");

    const hoja = laHoja(p, "etapas");
    await decir("etapas");
    await alDecir("El engranaje");
    await pulsar(p, elMando(p, "Interesado", "Editar etapas"));
    await hoja.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("el nombre", 0);
    await mover(p, hoja.locator('input[aria-label="Nombre de la etapa 2"]'));
    await alDecir("el color", 0);
    await mover(p, laFilaDeEtapa(p, 2).locator('button[aria-label^="Color "]').nth(2));
    await alDecir("el orden", 0);
    await mover(p, laFilaDeEtapa(p, 2).locator('button[aria-label="Bajar etapa"]'));
    await alDecir("llevan candado", 0);
    await mover(p, laFilaDeEtapa(p, 1).locator('[aria-label="Etapa del sistema"]'));

    const hojaAsesores = laHoja(p, "asesores");
    await decir("asesores");
    await pulsar(p, hoja.getByRole("button", { name: "Cancelar", exact: true }));
    await hoja.waitFor({ state: "hidden", timeout: 10000 });
    await alDecir("En Asignar asesores", 0);
    await pulsar(p, LOS_TRES_PUNTOS(p));
    await elMenuAbierto(p).waitFor({ state: "visible", timeout: 10000 });
    await pulsar(p, laOpcion(p, "Asignar asesores"));
    await hojaAsesores.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("cada persona de tu equipo", 0);
    await mover(p, hojaAsesores.locator('button[aria-label="Embudo de Laura Gómez"]'));

    const hojaPapelera = laHoja(p, "papelera");
    await decir("perdido");
    await pulsar(p, hojaAsesores.getByRole("button", { name: "Cancelar", exact: true }));
    await hojaAsesores.waitFor({ state: "hidden", timeout: 10000 });
    await alDecir("se vacía", 0);
    await mover(p, elMando(p, "Perdido", "Vaciar la columna"));
    await alDecir("con su papelera", 0);
    await pulsar(p, elMando(p, "Perdido", "Abrir la papelera"));
    await hojaPapelera.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("lo recuperas durante treinta días", 0);
    await mover(p, hojaPapelera.getByRole("button", { name: "Restaurar", exact: true }).first());
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
    escribirLaVozDelVideo("embudos", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
    await abrirLaPantalla(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        // Las capturas arrastran una tarjeta: el vídeo sale del mismo punto de partida.
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-embudos.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/embudos`);
