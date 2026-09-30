/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Diagramas, sobre
 * la App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-diagramas.mjs`). Es el mismo proceso que el de Leads
 * (`capturar-guia-leads.mjs`): cada captura es una receta —abre esto, pulsa
 * aquello, resalta este elemento— y volver a correrlo rehace las imágenes y
 * el vídeo con la pantalla de ese día.
 *
 * Lo que no depende de la pantalla —entrar, medir, marcar, guardar, las
 * miniaturas, el marco y la narración (`decir`/`alDecir`/`callar`)— viene del
 * taller común de las guías (`taller-de-la-guia.mjs`), el mismo de Leads y de
 * Catálogo: por eso las tres se leen como la misma guía. Aquí solo queda lo
 * propio de Diagramas: qué se abre, qué se señala y qué se dice.
 *
 * Todo lo que se crea para las capturas —el diagrama «Toma de pedidos»—
 * se BORRA al terminar: el vídeo lo vuelve a crear delante de la cámara, y un
 * nombre repetido no se deja crear.
 *
 * Se lanza con `scripts/generar-guia-diagramas.sh`.
 */
import { createRequire } from "node:module";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-diagramas.mjs";
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
    tomarLasMiniaturas,
    unir,
} from "./taller-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "diagramas");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-diagramas";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
/** Solo el vídeo (p. ej. al cambiar la narración): las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-diagramas.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-diagramas.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/** Los de la semilla que se usan en las recetas. */
const ESCAPARATE = { id: "guia_atencion", nombre: "Atención al cliente" };
const DE_LECTURA = { id: "guia_agencia_embudo", nombre: "Embudo aliado" };
const EDITABLE_RECIBIDO = "Guion de llamadas";
const PARA_MARCAR = ["Reserva de citas", "Borrador de campaña"];
/** El que se crea delante de la cámara (y en las capturas, y se borra después). */
const NUEVO = "Toma de pedidos";

/* ------------------------------------------------------------------ */
/* Abrir                                                               */
/* ------------------------------------------------------------------ */

async function abrirLaLista(p) {
    await p.goto(`${BASE}/diagramas`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`[title="${ESCAPARATE.nombre}"]`, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2000);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
    await queNadaSalgaRecortado(p);
}

/**
 * Un nombre que no cabe sale con «…» en la captura, y la guía enseñaría un
 * paso que no se sabe cómo se llama. Se mira en el lienzo y en la pastilla del
 * nombre del diagrama: si algo no cabe, se acorta en la semilla.
 */
async function queNadaSalgaRecortado(p) {
    const recortados = await p.evaluate(() => {
        // Solo el contenido: el menú y la barra de arriba de la plataforma
        // recortan a propósito (el buscador, el plan) y no son de esta guía.
        const raiz = document.querySelector("[data-caja-del-contenido]") ?? document;
        const fuera = [];
        for (const el of raiz.querySelectorAll(".react-flow__node input, .truncate")) {
            if (el.scrollWidth > el.clientWidth + 1) fuera.push(el.value || el.textContent || "");
        }
        for (const el of raiz.querySelectorAll(".line-clamp-2")) {
            if (el.scrollHeight > el.clientHeight + 1) fuera.push(el.textContent || "");
        }
        return fuera;
    });
    if (recortados.length) throw new Error(`[guia] sale recortado con «…»: ${recortados.join(" · ")}`);
}

async function abrirElDiagrama(p, id) {
    await p.goto(`${BASE}/diagramas/${id}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(".react-flow__node", { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2000);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
    await queNadaSalgaRecortado(p);
}

/* ------------------------------------------------------------------ */
/* La lista                                                            */
/* ------------------------------------------------------------------ */

/** La tarjeta de un diagrama (la `Card`), encontrada por su nombre. */
const laTarjeta = (p, nombre) =>
    p.locator(`[title="${nombre}"]`).first().locator('xpath=ancestor::div[contains(@class,"cursor-pointer")][1]');
/** Lo que envuelve a la tarjeta y lleva su asa. */
const elEnvoltorio = (p, nombre) => laTarjeta(p, nombre).locator("xpath=..");
const partesDeLaTarjeta = (p, nombre) => {
    const t = laTarjeta(p, nombre);
    return {
        tarjeta: t,
        asa: elEnvoltorio(p, nombre).locator('[aria-label="Reordenar"]'),
        nombre: t.locator("span.line-clamp-2"),
        casilla: p.getByRole("checkbox", { name: `Seleccionar ${nombre}` }),
        pasos: t.locator("span", { hasText: /^\d+ pasos?$/ }).first().locator("xpath=.."),
        equipo: t.locator(".border-t button").first(),
        carpeta: t.locator('button[title^="En "], button[title="Mover a una carpeta"]').first(),
        mas: t.locator('button[title="Más opciones"]'),
    };
};

/** Una caja recortada a otra (lo que asome fuera del marco se corta). */
function dentroDe(c, marco) {
    const x = Math.max(c.x, marco.x);
    const y = Math.max(c.y, marco.y);
    const r = Math.min(c.x + c.w, marco.x + marco.w);
    const b = Math.min(c.y + c.h, marco.y + marco.h);
    return { x, y, w: r - x, h: b - y };
}

/** La caja del TEXTO de un elemento, no la de su bloque: un bloque que se
 *  estira hasta su vecino daría un recuadro con media fila vacía. */
async function cajaDelTexto(loc) {
    const el = loc.first();
    await el.waitFor({ state: "visible", timeout: 20000 });
    return el.evaluate((n) => {
        const r = document.createRange();
        r.selectNodeContents(n);
        const b = r.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
}

const LA_BARRA_DE_TRABAJO = {
    titulo: '[data-zona="filtros"]',
    acciones: '[data-zona="acciones"] button',
};
const elNuevo = (p) => p.getByRole("button", { name: "Nuevo", exact: true });
const lasPestanas = (p) => p.locator("div.sticky", { has: p.locator('nav a[href="/diagramas"]') }).first();
const lasCarpetas = (p) => p.getByRole("button", { name: "Todas", exact: true }).locator("xpath=..");

/** Las tarjetas que se ven, unidas: la rejilla hasta donde llega. */
async function lasTarjetasALaVista(p) {
    return p.evaluate(() => {
        const r = [...document.querySelectorAll('[aria-label="Reordenar"]')]
            .map((b) => b.parentElement.getBoundingClientRect())
            .filter((q) => q.bottom > 0 && q.top < window.innerHeight);
        const x = Math.min(...r.map((q) => q.left));
        const y = Math.min(...r.map((q) => q.top));
        return { x, y, w: Math.max(...r.map((q) => q.right)) - x, h: Math.min(window.innerHeight - 8, Math.max(...r.map((q) => q.bottom))) - y };
    });
}

/** Abre un menú de Radix y devuelve su contenido quieto (la animación de entrada lo mueve). */
async function elMenuDe(p, disparador) {
    await disparador.click();
    const menu = p.locator('[role="menu"]').last();
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    return menu;
}

/* ------------------------------------------------------------------ */
/* El editor                                                           */
/* ------------------------------------------------------------------ */

const elNodo = (p, id) => p.locator(`.react-flow__node[data-id="${id}"]`);
/** El paso cuyo nombre es `nombre` (los que se crean nacen con el nombre de su tipo). */
async function elNodoLlamado(p, nombre) {
    const id = await p.evaluate(
        (n) => [...document.querySelectorAll(".react-flow__node")].find((el) => el.querySelector("input")?.value === n)?.getAttribute("data-id"),
        nombre,
    );
    if (!id) throw new Error(`[guia] no hay ningún paso llamado «${nombre}»`);
    return elNodo(p, id);
}
/** La caja de un paso: lo que se pulsa para escribirlo. */
const laCaja = (nodo) => nodo.locator('[role="button"][title^="Clic para escribir"]').first();
const elNombreDelPaso = (nodo) => nodo.locator("input").first();
const laSalida = (nodo, cual = "out") => nodo.locator(`.react-flow__handle[data-handleid="${cual}"]`);
const elMas = (nodo, cual = "out") => laSalida(nodo, cual).locator("xpath=..").locator('button[title="Agregar acción"]');
const laPaleta = (p) => p.locator('[data-radix-popper-content-wrapper]', { has: p.locator('[aria-label="Tipos de nodo"]') }).last();
const elControl = (p, nombre) => p.locator(`.react-flow__controls button[aria-label="${nombre}"]`);
const elGuardado = (p) => p.locator('button[title="Todo guardado"], button[title="Guardar ahora"]').first();
const elOrdenar = (p) => p.locator('button[title="Ordenar el diagrama en carriles horizontales"]');
const laPastillaDelNombre = (p) => p.locator('button[title="Volver a Diagramas"]').locator("xpath=..");
const elLienzo = (p) => p.locator(".react-flow").first();

/** Ajusta el lienzo a todo el diagrama, como el botón de los controles. */
async function verTodo(p) {
    await elControl(p, "Ver todo el diagrama").click();
    await espera(p, 700);
}

/** Pone un paso desde el «+» de `origen` (por su salida `cual`), eligiéndolo en la lista. */
async function ponerDesde(p, origen, cual, tipo, buscar) {
    await origen.hover();
    await espera(p, 250);
    await elMas(origen, cual).click({ force: true });
    const paleta = laPaleta(p);
    await paleta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    if (buscar) {
        await paleta.locator('input[aria-label="Buscar nodo"]').fill(buscar);
        await espera(p, 300);
    }
    await paleta.getByRole("option", { name: tipo, exact: true }).click();
    await espera(p, 900);
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

/**
 * Una por sección, con la receta de Leads: la zona nítida y en su recuadro, el
 * resto bajo el velo. Las de la lista se toman sobre la lista limpia; las del
 * editor, sobre el diagrama grande de la semilla, que no se toca.
 */
async function miniaturas(p) {
    await abrirLaLista(p);
    const zonas = [
        ["vista-general", async () => unir(await caja(p, LA_BARRA_DE_TRABAJO.titulo), await caja(p, LA_BARRA_DE_TRABAJO.acciones))],
        ["crear", async () => caja(p, elNuevo(p))],
        // Compartir: el menú «Con el equipo» ABIERTO, con su botón.
        [
            "compartir",
            async () => {
                const t = partesDeLaTarjeta(p, ESCAPARATE.nombre);
                return unir(await caja(p, t.equipo), await caja(p, await elMenuDe(p, t.equipo)));
            },
        ],
        ["carpetas-y-orden", async () => caja(p, lasCarpetas(p))],
        // Eliminar varios: dos marcadas y el menú de la barra abierto. No hace
        // falta desmarcarlas: la zona siguiente abre el editor, que las olvida.
        [
            "acciones-masivas",
            async () => {
                for (const n of PARA_MARCAR) await partesDeLaTarjeta(p, n).casilla.click();
                await espera(p, 400);
                const menu = await elMenuDe(p, p.locator(LA_BARRA_DE_TRABAJO.acciones).first());
                return unir(await caja(p, LA_BARRA_DE_TRABAJO.acciones), await caja(p, menu));
            },
        ],
        [
            "editor",
            async () => {
                await abrirElDiagrama(p, ESCAPARATE.id);
                return unir(await caja(p, laPastillaDelNombre(p)), await caja(p, elGuardado(p)));
            },
        ],
        // Agregar pasos: el «+» de la nota Idea (se ve sin pasar el cursor) con su lista abierta.
        [
            "agregar-pasos",
            async () => {
                const idea = elNodo(p, "a_idea");
                await elMas(idea).click();
                const paleta = laPaleta(p);
                await paleta.waitFor({ state: "visible", timeout: 10000 });
                await espera(p, 500);
                return unir(await caja(p, elMas(idea)), await caja(p, paleta));
            },
        ],
        // Escribir un paso: su ventana abierta, que es donde se escribe.
        [
            "editar-un-paso",
            async () => {
                await laCaja(elNodo(p, "a_cita")).click();
                const dlg = p.locator('[role="dialog"]').last();
                await dlg.waitFor({ state: "visible", timeout: 10000 });
                await espera(p, 600);
                return caja(p, dlg);
            },
        ],
        ["idea-y-libre", async () => caja(p, elNodo(p, "a_idea"))],
    ];
    // La lista de pasos y la ventana de un paso no son menús: se cierran con
    // Escape, sin guardar nada, antes de la zona siguiente.
    const cerrarLoDelEditor = async () => {
        if (!(await p.$('[role="dialog"], [data-radix-popper-content-wrapper]'))) return;
        await p.keyboard.press("Escape");
        await espera(p, 500);
    };
    await tomarLasMiniaturas(p, zonas, { salida: SALIDA, tomadas, focos: FOCOS, despues: cerrarLoDelEditor });
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();

    /* 1. La pantalla de un vistazo ------------------------------------ */
    await abrirLaLista(p);
    await guardar(p, "portada.webp");

    const cMenu = await caja(p, elMenuLateral(p));
    const cArriba = await caja(p, LA_BARRA_DE_ARRIBA);
    const cPestanas = await caja(p, lasPestanas(p));
    const cTitulo = await caja(p, LA_BARRA_DE_TRABAJO.titulo);
    const cNuevo = await caja(p, elNuevo(p));
    const cAcciones = await caja(p, LA_BARRA_DE_TRABAJO.acciones);
    const cBarra = unir(cTitulo, cAcciones);
    const cCarpetas = await caja(p, lasCarpetas(p));
    const bajoElMenu = await dondeAcabaElMenu(p);
    await marcar(p, [
        { c: dentro(cMenu, 6), n: 1, numeroEn: { x: cMenu.x + cMenu.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cArriba, 6), n: 2, esquina: "centro" },
        // El número de las pestañas, al final de su fila (a la izquierda
        // se montaría sobre el borde del menú).
        { c: dentro(cPestanas, 2), n: 3, numeroEn: { x: cPestanas.x + cPestanas.w - 34, y: cPestanas.y + cPestanas.h / 2 } },
        { c: cBarra, n: 4 },
        { c: cCarpetas, n: 5 },
        { c: await lasTarjetasALaVista(p), n: 6 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");

    // El título ajustado a su texto: la zona `filtros` se estira hasta
    // «Nuevo» y su recuadro señalaría media barra vacía.
    // «Nuevo» y «⋯» van pegados: los dos recuadros un poco metidos para que
    // no se monten, y el 3 en la esquina de fuera.
    await marcar(p, [
        { c: await cajaDelTexto(p.locator('[data-zona="filtros"] > div').first()), n: 1 },
        { c: dentro(cNuevo, 2), n: 2 },
        { c: dentro(cAcciones, 2), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "barra.webp", holgura(cBarra, 34, vista));
    await desmarcar(p);

    // La tarjeta: el resto de la lista bajo el velo, cada recuadro ajustado
    // a lo que señala y cada número en un hueco de la propia tarjeta, para no
    // montarse sobre las carpetas ni sobre la tarjeta de al lado.
    {
        const t = partesDeLaTarjeta(p, ESCAPARATE.nombre);
        const c = await caja(p, elEnvoltorio(p, ESCAPARATE.nombre));
        const parte = {
            asa: await caja(p, t.asa),
            nombre: await cajaDelTexto(t.nombre),
            casilla: await caja(p, t.casilla),
            pasos: await cajaDelTexto(t.pasos),
            equipo: await caja(p, t.equipo),
            carpeta: dentro(await caja(p, t.carpeta), 3),
            mas: dentro(await caja(p, t.mas), 3),
        };
        const medio = (q) => q.y + q.h / 2;
        await marcar(
            p,
            [
                { c, soloLuz: true },
                { c: parte.asa, n: 1 },
                { c: parte.nombre, n: 2, numeroEn: { x: parte.nombre.x + parte.nombre.w + 26, y: medio(parte.nombre) } },
                { c: parte.casilla, n: 3 },
                { c: parte.pasos, n: 4, numeroEn: { x: parte.pasos.x + parte.pasos.w + 26, y: medio(parte.pasos) } },
                { c: parte.equipo, n: 5, numeroEn: { x: parte.equipo.x + parte.equipo.w + 26, y: medio(parte.equipo) } },
                { c: parte.carpeta, n: 6, numeroEn: { x: parte.carpeta.x - 26, y: medio(parte.carpeta) } },
                { c: parte.mas, n: 7, esquina: "derecha" },
            ],
            { atenuar: true },
        );
        await guardar(p, "tarjeta.webp", holgura(c, 30, vista));
        await desmarcar(p);
    }

    await elMarcoDeLaPantalla(p, guardar, { modulo: "Panel", texto: "Diagramas está en Panel" });
    await abrirLaLista(p);

    /* 7. Carpetas, orden y opciones (sobre la lista, antes de crear nada) - */
    {
        const todas = p.getByRole("button", { name: "Todas", exact: true });
        const ventas = p.locator('[data-ui="badge"]', { hasText: "Ventas" }).first();
        const sueltas = p.getByRole("button", { name: /^Sin carpeta/ });
        const nueva = p.getByRole("button", { name: "Nueva carpeta" });
        const cFila = await caja(p, lasCarpetas(p));
        await marcar(p, [
            { c: await caja(p, todas), n: 1 },
            { c: await caja(p, ventas), n: 2 },
            { c: await caja(p, sueltas), n: 3 },
            { c: await caja(p, nueva), n: 4 },
        ]);
        await guardar(p, "carpetas-barra.webp", holgura(unir(cFila, { ...cFila, y: cFila.y - 50, h: 1 }), 30, vista));
        await desmarcar(p);

        await nueva.click();
        const dlg = p.locator('[role="dialog"]').last();
        await dlg.waitFor({ state: "visible", timeout: 10000 });
        await dlg.locator('input[placeholder="ej. Clientes 2026"]').fill("Clientes 2026");
        await espera(p, 500);
        await marcar(p, [
            { c: await caja(p, dlg.locator("input")) },
            { c: await caja(p, dlg.getByRole("button", { name: "Crear" })), texto: "Crear", lado: "abajo" },
        ]);
        await guardar(p, "carpetas-nueva.webp", holgura(await caja(p, dlg), 70, vista));
        await desmarcar(p);
        await dlg.getByRole("button", { name: "Cancelar" }).click();
        await espera(p, 500);

        const citas = partesDeLaTarjeta(p, "Reserva de citas");
        const menu = await elMenuDe(p, citas.carpeta);
        const cMenuCarpeta = await caja(p, menu);
        const cTarjeta = await caja(p, citas.tarjeta);
        // Rótulo arriba del botón y la lista solo recuadrada: dos números
        // pegados al mismo botón se montaban uno sobre otro.
        await marcar(p, [
            // A la izquierda, sobre el hueco vacío de la fila: arriba tapaba
            // el nombre de la tarjeta, y a la derecha su flecha cruzaría el «⋯».
            { c: await caja(p, citas.carpeta), texto: "Mover a una carpeta", lado: "izquierda" },
            { c: cMenuCarpeta },
        ], { atenuar: true });
        await guardar(p, "carpetas-mover.webp", holgura(unir(cTarjeta, cMenuCarpeta), 40, vista));
        await desmarcar(p);
        await cerrarLoAbierto(p);

        const escaparate = partesDeLaTarjeta(p, ESCAPARATE.nombre);
        const cEnvoltorio = await caja(p, elEnvoltorio(p, ESCAPARATE.nombre));
        // El rótulo ARRIBA, sobre la fila de carpetas bajo el velo: a la
        // derecha del asa tapaba el nombre de la tarjeta.
        const cAsa = await caja(p, escaparate.asa);
        await marcar(
            p,
            [{ c: cEnvoltorio, soloLuz: true }, { c: cAsa, texto: "Arrástrala desde aquí", lado: "arriba" }],
            { atenuar: true },
        );
        // El rótulo va centrado sobre el asa y mide ~200 px: el recorte lo
        // incluye entero, aunque asome el menú lateral bajo el velo.
        await guardar(p, "carpetas-reordenar.webp", holgura(unir(cEnvoltorio, { x: cAsa.x + cAsa.w / 2 - 120, y: cAsa.y - 90, w: 1, h: 1 }), 30, vista));
        await desmarcar(p);

        const opciones = await elMenuDe(p, escaparate.mas);
        const cOpciones = await caja(p, opciones);
        // A la derecha, sobre la tarjeta de al lado bajo el velo: arriba
        // tapaba la casilla, y a la izquierda su flecha cruzaría la carpeta.
        const cMas = await caja(p, escaparate.mas);
        await marcar(p, [{ c: cMas, texto: "Más opciones", lado: "derecha" }, { c: cOpciones }], { atenuar: true });
        await guardar(p, "tarjeta-opciones.webp", holgura(unir(cEnvoltorio, cOpciones, { x: cMas.x + cMas.w + 230, y: cMas.y, w: 1, h: 1 }), 30, vista));
        await desmarcar(p);
        await cerrarLoAbierto(p);
    }

    /* 6. Compartir ---------------------------------------------------- */
    {
        const t = partesDeLaTarjeta(p, ESCAPARATE.nombre);
        const menu = await elMenuDe(p, t.equipo);
        const opciones = menu.getByRole("menuitemradio");
        const cMenuEquipo = await caja(p, menu);
        // El menú entero a la luz (con su título) y cada opción un poco
        // metida: son contiguas y sus recuadros se montaban en la raya de
        // entre medias. El rótulo del botón, a su derecha, sobre el hueco
        // vacío de la fila: a la izquierda se salía del recorte.
        const marcas = [
            { c: cMenuEquipo, soloLuz: true },
            { c: await caja(p, t.equipo), texto: "Con el equipo", lado: "derecha" },
        ];
        for (let i = 0; i < 3; i += 1) {
            const o = dentro(await caja(p, opciones.nth(i)), 4);
            marcas.push({ c: o, n: i + 1, numeroEn: { x: o.x + o.w + 26, y: o.y + o.h / 2 } });
        }
        await marcar(p, marcas, { atenuar: true });
        await guardar(p, "compartir-equipo.webp", holgura(unir(await caja(p, t.tarjeta), cMenuEquipo, { ...cMenuEquipo, w: cMenuEquipo.w + 60 }), 40, vista));
        await desmarcar(p);
        await cerrarLoAbierto(p);

        const opcionesMas = await elMenuDe(p, t.mas);
        await opcionesMas.getByRole("menuitem", { name: "Compartir con otras cuentas" }).click();
        const dlg = p.locator('[role="dialog"]').last();
        await dlg.waitFor({ state: "visible", timeout: 10000 });
        await dlg.getByText("Clínica Sonrisa").waitFor({ state: "visible", timeout: 20000 });
        const buscar = dlg.locator('input[placeholder="Buscar por empresa, nombre o correo…"]');
        await buscar.fill("Clínica");
        await espera(p, 500);
        const filaClinica = dlg.locator("div.flex.items-center.justify-between", { hasText: "Clínica Sonrisa" }).first();
        await filaClinica.getByRole("switch").click();
        await espera(p, 500);
        await marcar(p, [
            { c: await caja(p, buscar), n: 1 },
            { c: dentro(await caja(p, filaClinica.getByRole("switch")), 2), n: 2, esquina: "derecha" },
            { c: dentro(await caja(p, filaClinica.locator("button[aria-pressed]").first().locator("xpath=..")), 2), n: 3 },
            { c: await caja(p, dlg.getByRole("button", { name: "Guardar" })), texto: "Lo comparte", lado: "abajo" },
        ]);
        await guardar(p, "compartir-cuentas.webp", holgura(unir(await caja(p, dlg), { ...(await caja(p, dlg)), h: (await caja(p, dlg)).h + 80 }), 30, vista));
        await desmarcar(p);
        await dlg.getByRole("button", { name: "Cancelar" }).click();
        await espera(p, 600);

        // El cursor fuera: se quedó sobre una tarjeta al cancelar y su borde
        // de «encima» se leía como una tercera marca.
        await p.mouse.move(vista.width / 2, vista.height - 4);
        await espera(p, 300);
        const leer = await caja(p, laTarjeta(p, DE_LECTURA.nombre));
        const editar = await caja(p, laTarjeta(p, EDITABLE_RECIBIDO));
        const marcaDe = (nombre) => laTarjeta(p, nombre).locator(".border-t span", { hasText: /^Compartido/ }).first();
        // Números junto a cada marca: los rótulos debajo tapaban la tarjeta
        // de abajo y el segundo se salía del recorte.
        const cLeer = await caja(p, marcaDe(DE_LECTURA.nombre));
        const cEditar = await caja(p, marcaDe(EDITABLE_RECIBIDO));
        await marcar(p, [
            { c: leer, soloLuz: true },
            { c: editar, soloLuz: true },
            { c: cLeer, n: 1, numeroEn: { x: cLeer.x + cLeer.w + 26, y: cLeer.y + cLeer.h / 2 } },
            { c: cEditar, n: 2, numeroEn: { x: cEditar.x + cEditar.w + 26, y: cEditar.y + cEditar.h / 2 } },
        ], { atenuar: true });
        await guardar(p, "compartir-recibido.webp", holgura(unir(leer, editar), 24, vista));
        await desmarcar(p);
    }

    /* 9. Eliminar varios ------------------------------------------------ */
    {
        for (const n of PARA_MARCAR) await partesDeLaTarjeta(p, n).casilla.click();
        // El cursor fuera: sobre la última casilla, esa tarjeta sale con el
        // fondo de «encima» y parece marcada de otra forma que la primera.
        await p.mouse.move(vista.width / 2, vista.height - 4);
        await espera(p, 500);
        const casillas = [];
        const tarjetas = [];
        for (const n of PARA_MARCAR) {
            const t = partesDeLaTarjeta(p, n);
            casillas.push(await caja(p, t.casilla));
            tarjetas.push(await caja(p, t.tarjeta));
        }
        await marcar(p, [...tarjetas.map((c) => ({ c })), ...casillas.map((c) => ({ c, texto: "Marcada", lado: "arriba" }))], { atenuar: true });
        await guardar(p, "masivas-marcar.webp", holgura(unir(...tarjetas, { ...tarjetas[0], y: tarjetas[0].y - 80, h: 1 }), 24, vista));
        await desmarcar(p);

        const menu = await elMenuDe(p, p.locator(LA_BARRA_DE_TRABAJO.acciones).first());
        const cMenuAcc = await caja(p, menu);
        const eliminar = menu.getByRole("menuitem", { name: /^Eliminar 2 diagramas/ });
        await marcar(p, [
            { c: cAcciones, n: 1 },
            { c: await caja(p, eliminar), n: 2, numeroEn: { x: cMenuAcc.x - 26, y: (await caja(p, eliminar)).y + 16 } },
        ], { atenuar: true });
        await guardar(p, "masivas-menu.webp", holgura(unir(cMenuAcc, cAcciones, { ...cMenuAcc, x: cMenuAcc.x - 300 }), 28, vista));
        await desmarcar(p);
        await eliminar.click();
        const alerta = p.locator('[role="alertdialog"]');
        await alerta.waitFor({ state: "visible", timeout: 10000 });
        await espera(p, 600);
        const cAlerta = await caja(p, alerta);
        const cancelar = alerta.getByRole("button", { name: "Cancelar" });
        await marcar(p, [
            { c: await caja(p, cancelar), texto: "No cambia nada", lado: "abajo" },
            { c: await caja(p, alerta.getByRole("button", { name: "Eliminar", exact: true })), texto: "Los borra", lado: "abajo" },
        ]);
        await guardar(p, "masivas-confirmar.webp", holgura(unir(cAlerta, { ...cAlerta, y: cAlerta.y + cAlerta.h + 84, h: 1 }), 26, vista));
        await desmarcar(p);
        await cancelar.click();
        await alerta.waitFor({ state: "hidden", timeout: 10000 });
        await espera(p, 400);
        for (const n of PARA_MARCAR) await partesDeLaTarjeta(p, n).casilla.click();
        await espera(p, 400);
    }

    /* 2. Crear un diagrama -------------------------------------------- */
    {
        await marcar(p, [{ c: cNuevo, texto: "+ Nuevo", lado: "abajo" }]);
        await guardar(p, "crear-boton.webp", holgura(unir(cBarra, { ...cNuevo, y: cNuevo.y + 110, h: 1 }), 22, vista));
        await desmarcar(p);
        await elNuevo(p).click();
        const dlg = p.locator('[role="dialog"]').last();
        await dlg.waitFor({ state: "visible", timeout: 10000 });
        await dlg.locator("input").fill(NUEVO);
        await espera(p, 500);
        const crear = dlg.getByRole("button", { name: "Crear", exact: true });
        // El campo solo recuadrado: su rótulo debajo caía entre los dos
        // botones y se leía como si señalara «Cancelar».
        await marcar(p, [
            { c: await caja(p, dlg.locator("input")) },
            { c: await caja(p, crear), texto: "Crear", lado: "abajo" },
        ]);
        await guardar(p, "crear-dialogo.webp", holgura(await caja(p, dlg), 70, vista));
        await desmarcar(p);
        await crear.click();
        await p.waitForSelector('.react-flow__node[data-id$="_decision"]', { timeout: 60000 });
        await espera(p, 2000);
        await despejar(p);
        await esconderLosBotonesDelBorde(p);
        await quitarAvisos(p);
        // El que se acaba de crear también: su nombre sale en la pastilla del
        // editor aquí y en el vídeo.
        await queNadaSalgaRecortado(p);
        const inicio = p.locator('.react-flow__node[data-id$="_inicio"]');
        const decision = p.locator('.react-flow__node[data-id$="_decision"]');
        await marcar(p, [
            { c: await caja(p, inicio), n: 1 },
            { c: await caja(p, decision), n: 2 },
        ]);
        await guardar(p, "crear-editor.webp");
        await desmarcar(p);
    }

    /* 4. Agregar y conectar pasos (sobre el diagrama recién creado) ----- */
    const decision = p.locator('.react-flow__node[data-id$="_decision"]');
    {
        const mas = elMas(decision, "yes");
        const cDecision = await caja(p, decision);
        // El rótulo ARRIBA: la Decisión nace cerca del borde derecho y a la
        // derecha del «+» se salía de la pantalla.
        const cMas = await caja(p, mas);
        await marcar(p, [{ c: cMas, texto: "Agrega el siguiente paso", lado: "arriba" }]);
        await guardar(p, "pasos-mas.webp", holgura(unir(cDecision, cMas, { x: cMas.x + cMas.w / 2 - 140, y: cMas.y - 90, w: 280, h: 1 }), 40, vista));
        await desmarcar(p);

        await mas.click();
        const paleta = laPaleta(p);
        await paleta.waitFor({ state: "visible", timeout: 10000 });
        await espera(p, 600);
        // La lista se corre hasta que se ve dónde empiezan las Acciones.
        const lista = paleta.locator('[aria-label="Tipos de nodo"]');
        const divisor = lista.getByText("Acciones", { exact: true }).locator("xpath=..");
        // …y se detiene en el borde de un paso: a medio paso, el primero de
        // arriba salía cortado.
        await lista.evaluate((el) => {
            el.scrollTop = 0;
            const arriba = el.getBoundingClientRect().top;
            const div = [...el.querySelectorAll("span")].find((s) => s.textContent === "Acciones")?.parentElement;
            const objetivo = div.getBoundingClientRect().top - arriba - el.clientHeight * 0.55;
            const pasos = [...el.querySelectorAll('[role="option"]')];
            const primero = pasos.find((o) => o.getBoundingClientRect().top - arriba >= objetivo) ?? pasos[0];
            el.scrollTop = primero.getBoundingClientRect().top - arriba - 8;
        });
        await espera(p, 400);
        const cPaleta = await caja(p, paleta);
        const cLista = await caja(p, lista);
        const cDivisor = await caja(p, divisor);
        const cBuscar = await caja(p, paleta.locator('input[aria-label="Buscar nodo"]'));
        const principales = { x: cLista.x + 8, y: cLista.y + 4, w: cLista.w - 20, h: cDivisor.y - cLista.y - 10 };
        const acciones = { x: cLista.x + 8, y: cDivisor.y, w: cLista.w - 20, h: cLista.y + cLista.h - cDivisor.y - 6 };
        const der = (q) => ({ x: q.x + q.w + 26, y: q.y + 16 });
        await marcar(p, [
            { c: cBuscar, n: 1, numeroEn: der(cBuscar) },
            { c: principales, n: 2, numeroEn: der(principales) },
            { c: acciones, n: 3, numeroEn: der(acciones) },
        ], { atenuar: true });
        await guardar(p, "pasos-paleta.webp", holgura(unir(cPaleta, { ...cPaleta, w: cPaleta.w + 60 }, cDecision), 30, vista));
        await desmarcar(p);

        await lista.evaluate((el) => (el.scrollTop = 0));
        await paleta.locator('input[aria-label="Buscar nodo"]').fill("cita");
        await espera(p, 500);
        const opcion = paleta.getByRole("option", { name: "Agendar la cita", exact: true });
        await marcar(p, [
            { c: cBuscar, texto: "Escribe una palabra", lado: "derecha" },
            // Debajo, sobre la lista vacía: a la derecha chocaba con los «+».
            { c: await caja(p, opcion), texto: "Elígelo", lado: "abajo" },
        ], { atenuar: true });
        await guardar(p, "pasos-buscar.webp", holgura(unir(cPaleta, { ...cPaleta, w: cPaleta.w + 250 }, cDecision), 30, vista));
        await desmarcar(p);
        await opcion.click();
        await p.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
        await espera(p, 900);
        await verTodo(p);
        const cita = await elNodoLlamado(p, "Agendar la cita");
        await marcar(p, [
            { c: await caja(p, cita), texto: "El paso nuevo", lado: "abajo" },
            { c: await caja(p, p.locator("[data-sonner-toast]").last()) },
        ], { atenuar: true });
        await guardar(p, "pasos-nuevo.webp");
        await desmarcar(p);
        await quitarAvisos(p);

        // Dos pasos más, para que se pueda enseñar una conexión arrastrada.
        await ponerDesde(p, decision, "no", "Escalar a humano");
        await quitarAvisos(p);
        await verTodo(p);
        await ponerDesde(p, await elNodoLlamado(p, "Agendar la cita"), "out", "Finalización del proceso", "final");
        await quitarAvisos(p);
        await verTodo(p);

        // Conectar arrastrando: la foto se toma CON la línea a medio camino.
        const escalar = await elNodoLlamado(p, "Escalar a humano");
        const fin = await elNodoLlamado(p, "Finalización del proceso");
        const desde = await caja(p, laSalida(escalar));
        const hasta = await caja(p, fin.locator('.react-flow__handle[data-handleid="in"]'));
        const x0 = desde.x + desde.w / 2;
        const y0 = desde.y + desde.h / 2;
        const x1 = hasta.x + hasta.w / 2;
        const y1 = hasta.y + hasta.h / 2;
        await p.mouse.move(x0, y0);
        await p.mouse.down();
        await p.mouse.move(x0 + (x1 - x0) * 0.35, y0 + (y1 - y0) * 0.35, { steps: 12 });
        await p.mouse.move(x0 + (x1 - x0) * 0.7, y0 + (y1 - y0) * 0.7, { steps: 12 });
        await espera(p, 300);
        // Números y no rótulos: el de la entrada tapaba los nombres de los
        // dos pasos de arriba, que es donde cae cualquier rótulo.
        await marcar(p, [
            { c: desde, n: 1, numeroEn: { x: desde.x + desde.w / 2, y: desde.y + desde.h + 28 } },
            { c: hasta, n: 2, numeroEn: { x: hasta.x + hasta.w / 2, y: hasta.y - 28 } },
        ]);
        await guardar(p, "pasos-conectar.webp", holgura(unir(await caja(p, escalar), await caja(p, fin), await caja(p, decision)), 90, vista));
        await desmarcar(p);
        await p.mouse.move(x1, y1, { steps: 8 });
        await p.mouse.up();
        await espera(p, 800);

        // Quitar una conexión: la que se acaba de hacer, seleccionada.
        const linea = await p.evaluate(() => {
            const bordes = [...document.querySelectorAll(".react-flow__edge")];
            const e = bordes.find((b) => b.getAttribute("data-id")?.startsWith("xy-edge") || b.getAttribute("aria-label")?.includes("Escalar")) ?? bordes[bordes.length - 1];
            return e?.getAttribute("data-id");
        });
        const camino = p.locator(`.react-flow__edge[data-id="${linea}"] path`).first();
        const cCamino = await caja(p, p.locator(`.react-flow__edge[data-id="${linea}"]`));
        await p.mouse.click(cCamino.x + cCamino.w / 2, cCamino.y + cCamino.h / 2);
        await espera(p, 500);
        const botonQuitar = p.locator('button[title="Eliminar conexión"]');
        if (!(await botonQuitar.isVisible())) await camino.click({ force: true });
        await botonQuitar.waitFor({ state: "visible", timeout: 5000 });
        // A la derecha, sobre el lienzo vacío: arriba tapaba la línea y los pasos.
        await marcar(p, [{ c: await caja(p, botonQuitar), texto: "Quita la conexión", lado: "derecha" }]);
        const cQuitar = await caja(p, botonQuitar);
        await guardar(p, "pasos-quitar.webp", holgura(unir(await caja(p, escalar), await caja(p, fin), cQuitar, { x: cQuitar.x + cQuitar.w + 230, y: cQuitar.y, w: 1, h: 1 }), 90, vista));
        await desmarcar(p);
        await p.mouse.click(vista.width - 40, vista.height - 40);
        await espera(p, 400);
    }

    /* 5. Escribir y cambiar un paso (sobre el mismo) ------------------- */
    {
        const cita = await elNodoLlamado(p, "Agendar la cita");
        const cCita = await caja(p, cita);
        const nombre = elNombreDelPaso(cita);
        // Con FOCO y no con el cursor encima: el cursor saca la barra de
        // Tamaño, Duplicar y Eliminar justo donde va el rótulo, y el foco
        // además enseña el borde de cuando se está escribiendo.
        await p.mouse.move(vista.width - 40, vista.height - 40);
        await nombre.focus();
        await espera(p, 400);
        await marcar(p, [{ c: await caja(p, nombre), texto: "El nombre se escribe aquí", lado: "arriba" }]);
        await guardar(p, "paso-nombre.webp", holgura(unir(cCita, { ...cCita, y: cCita.y - 90, h: 1 }), 70, vista));
        await desmarcar(p);
        await nombre.evaluate((el) => el.blur());

        await laCaja(cita).click();
        const dlg = p.locator('[role="dialog"]').last();
        await dlg.waitFor({ state: "visible", timeout: 10000 });
        const texto = dlg.locator('textarea[id^="texto-"]');
        await texto.fill("Le ofrecemos martes o jueves en la tarde");
        await espera(p, 500);
        await marcar(p, [
            { c: await caja(p, dlg.locator('input[id^="nombre-"]')), n: 1, esquina: "derecha" },
            { c: await caja(p, texto), n: 2, esquina: "derecha" },
            { c: await caja(p, dlg.getByRole("button", { name: "Listo" })), texto: "Listo", lado: "abajo" },
        ]);
        await guardar(p, "paso-dialogo.webp", holgura(await caja(p, dlg), 70, vista));
        await desmarcar(p);
        await dlg.getByRole("button", { name: "Listo" }).click();
        await espera(p, 800);

        // El cursor fuera (sacaba la barra del paso de abajo) y el rótulo a la
        // derecha: debajo tapaba el nombre del paso siguiente.
        await p.mouse.move(vista.width - 40, vista.height - 40);
        await espera(p, 300);
        const cCita2 = await caja(p, cita);
        const cTexto = await caja(p, cita.locator("p").first());
        await marcar(p, [{ c: cTexto, texto: "Lo que escribiste", lado: "derecha" }]);
        await guardar(p, "paso-texto.webp", holgura(unir(cCita2, cTexto, { x: cTexto.x + cTexto.w + 230, y: cTexto.y, w: 1, h: 1 }), 70, vista));
        await desmarcar(p);

        await laCaja(cita).hover();
        await espera(p, 500);
        const botones = ["Tamaño", "Duplicar nodo", "Eliminar nodo"].map((t) =>
            cita.locator(t === "Tamaño" ? 'button[title^="Tamaño"]' : `button[title="${t}"]`),
        );
        const cajas = [];
        for (const b of botones) cajas.push(await caja(p, b));
        await marcar(p, cajas.map((c, i) => ({ c, n: i + 1, numeroEn: { x: c.x + c.w / 2, y: c.y - 30 } })));
        await guardar(p, "paso-botones.webp", holgura(unir(cCita2, ...cajas, { ...cCita2, y: cCita2.y - 70, h: 1 }), 60, vista));
        await desmarcar(p);
        await p.mouse.move(vista.width - 40, vista.height - 40);
    }

    /* 3. El editor de un vistazo (sobre el diagrama grande de la semilla) - */
    await abrirElDiagrama(p, ESCAPARATE.id);
    {
        const cPastilla = await caja(p, laPastillaDelNombre(p));
        const cOrdenar = await caja(p, elOrdenar(p));
        const cGuardado = await caja(p, elGuardado(p));
        const cLienzo = await caja(p, elLienzo(p));
        const cControles = await caja(p, p.locator(".react-flow__controls"));
        const nodos = await p.evaluate(() => {
            const r = [...document.querySelectorAll(".react-flow__node")].map((n) => n.getBoundingClientRect());
            const x = Math.min(...r.map((q) => q.left));
            const y = Math.min(...r.map((q) => q.top));
            return { x, y, w: Math.max(...r.map((q) => q.right)) - x, h: Math.max(...r.map((q) => q.bottom)) - y };
        });
        await marcar(p, [
            { c: cPastilla, n: 1, esquina: "derecha" },
            { c: cOrdenar, n: 2, esquina: "derecha" },
            { c: cGuardado, n: 3 },
            // Acotado al lienzo a mano: `holgura` recibe la VENTANA, y con la
            // caja del lienzo le salía un ancho NaN y el recuadro no se pintaba.
            { c: dentroDe(holgura(nodos, 14, vista), dentro(cLienzo, 6)), n: 4 },
            { c: cControles, n: 5, esquina: "derecha" },
        ]);
        await guardar(p, "editor-vista.webp");
        await desmarcar(p);

        await marcar(p, [{ c: cGuardado, texto: "Todo está guardado", lado: "izquierda" }]);
        await guardar(p, "editor-guardado.webp", holgura(unir(cGuardado, { ...cGuardado, x: cGuardado.x - 360 }), 40, vista));
        await desmarcar(p);

        await marcar(p, [{ c: cOrdenar, texto: "Acomoda los pasos", lado: "abajo" }]);
        await guardar(p, "editor-ordenar.webp", holgura(unir(cOrdenar, { ...cOrdenar, x: cOrdenar.x - 240, w: cOrdenar.w + 480, h: cOrdenar.h + 110 }), 20, vista));
        await desmarcar(p);

        const botones = p.locator(".react-flow__controls button");
        const n = await botones.count();
        // Van pegados: un recuadro por botón se montaba en cada raya de
        // entre medias. Uno alrededor de los cuatro y un número por botón.
        const marcas = [{ c: cControles }];
        for (let i = 0; i < n; i += 1) {
            const c = await caja(p, botones.nth(i));
            marcas.push({ c, n: i + 1, sinRecuadro: true, numeroEn: { x: c.x + c.w + 30, y: c.y + c.h / 2 } });
        }
        await marcar(p, marcas);
        await guardar(p, "editor-controles.webp", holgura(unir(cControles, { ...cControles, w: cControles.w + 70, y: cControles.y - 60 }), 20, vista));
        await desmarcar(p);

        // La Decisión y sus tres salidas.
        const dec = elNodo(p, "a_decision");
        const cDec = await caja(p, dec);
        const salidas = [];
        for (const s of ["yes", "variante", "no"]) salidas.push(await caja(p, laSalida(dec, s)));
        const cDestinos = unir(await caja(p, elNodo(p, "a_cotizacion")), await caja(p, elNodo(p, "a_escalar")));
        // El recuadro va alrededor de la Decisión entera —su nombre, sus
        // tres salidas y su descripción—: alrededor de las salidas sola, la
        // flecha del rótulo cruzaba la descripción.
        await marcar(p, [
            { c: holgura(unir(cDec, ...salidas), 6, vista), texto: "Tres salidas: Sí · Variante · No", lado: "abajo" },
        ]);
        await guardar(p, "pasos-decision.webp", holgura(unir(cDec, cDestinos, { ...cDec, y: cDec.y + cDec.h + 120, h: 1 }), 40, vista));
        await desmarcar(p);
    }

    /* 6. La nota Idea y el paso Libre ----------------------------------- */
    {
        const idea = elNodo(p, "a_idea");
        const cIdea = await caja(p, idea);
        // El rótulo va debajo: a la derecha está su «+», que taparía.
        await marcar(p, [{ c: cIdea, texto: "Una nota para pensar", lado: "abajo" }]);
        // Con su «+» entero a la derecha: a medias se lee como un recorte.
        await guardar(p, "idea-nota.webp", holgura(unir(cIdea, { ...cIdea, y: cIdea.y + cIdea.h + 100, h: 1 }, { x: cIdea.x + cIdea.w + 70, y: cIdea.y, w: 1, h: 1 }), 40, vista));
        await desmarcar(p);

        await idea.hover();
        await espera(p, 500);
        const barra = idea.locator("div.nodrag.absolute").first();
        const emojis = idea.locator('button[title^="Poner "]');
        const herramientas = [
            'button[title="Escribir en la nota"]',
            'button[title="Negrita: marca la palabra con **"]',
            'button[title="Duplicar la nota"]',
            'button[title="Eliminar la nota"]',
        ];
        const cEmojis = unir(await caja(p, emojis.first()), await caja(p, emojis.last()));
        const cHerr = [];
        for (const s of herramientas) cHerr.push(await caja(p, idea.locator(s)));
        const colores = idea.locator('button[title="Color de la nota"]');
        const cColores = unir(await caja(p, colores.first()), await caja(p, colores.last()));
        const cBarraIdea = await caja(p, barra);
        // Las cuatro herramientas van pegadas y justo debajo empieza el texto
        // de la nota: un número por botón no cabe sin taparlo. Van en un solo
        // recuadro, con su número a la izquierda como los emojis.
        const cHerramientas = unir(...cHerr);
        await marcar(p, [
            { c: cEmojis, n: 1, numeroEn: { x: cEmojis.x - 26, y: cEmojis.y + cEmojis.h / 2 } },
            { c: cHerramientas, n: 2, numeroEn: { x: cHerramientas.x - 26, y: cHerramientas.y + cHerramientas.h / 2 } },
            { c: cColores, n: 3, numeroEn: { x: cColores.x + cColores.w + 26, y: cColores.y + cColores.h / 2 } },
        ]);
        // Arriba, justo sobre la barra: con más aire entran a medias los
        // nombres de los pasos de encima.
        const rHerr = holgura(unir(cBarraIdea, cIdea, { ...cBarraIdea, x: cBarraIdea.x - 40, w: cBarraIdea.w + 80 }), 40, vista);
        const arribaHerr = Math.max(0, cBarraIdea.y - 16);
        await guardar(p, "idea-herramientas.webp", { ...rHerr, y: arribaHerr, h: rHerr.y + rHerr.h - arribaHerr });
        await desmarcar(p);

        const punto = idea.locator(".react-flow__resize-control span").first();
        const cPunto = await caja(p, punto);
        await marcar(p, [{ c: cPunto, texto: "Estírala desde aquí", lado: "derecha" }]);
        // Arriba, justo debajo de la barra de la nota: seleccionada, la barra
        // sigue puesta, y cortada por la mitad se lee como un fallo. A la
        // derecha, lo justo para el rótulo: más allá asoma el paso de al lado.
        const rEstirar = holgura(unir(cIdea, { ...cPunto, w: 210 }), 50, vista);
        const arribaEstirar = Math.max(rEstirar.y, cBarraIdea.y + cBarraIdea.h + 3);
        await guardar(p, "idea-estirar.webp", { ...rEstirar, y: arribaEstirar, h: rEstirar.y + rEstirar.h - arribaEstirar });
        await desmarcar(p);
        await p.mouse.move(vista.width - 40, vista.height - 40);
        await espera(p, 300);

        // El Libre con icono: su ventana, con cada parte numerada; se cancela.
        await laCaja(elNodo(p, "a_envio")).click();
        const dlg = p.locator('[role="dialog"]').last();
        await dlg.waitFor({ state: "visible", timeout: 10000 });
        await espera(p, 600);
        // La ventana abre con el foco en «Qué pasa en este paso», y su borde
        // azul se leería como una marca más de la captura.
        await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
        await espera(p, 200);
        const modos = dlg.getByRole("button", { name: /^(icono|texto)$/i });
        const cModos = unir(await caja(p, modos.first()), await caja(p, modos.last()));
        const iconos = dlg.locator("div.grid.grid-cols-8");
        const cColoresLibre = await caja(p, dlg.locator('button[aria-label^="Color "]').first().locator("xpath=.."));
        const cLargo = await caja(p, dlg.locator('input[type="range"]'));
        const izqDe = (c) => ({ x: c.x - 26, y: c.y + c.h / 2 });
        await marcar(p, [
            { c: cModos, n: 1, numeroEn: izqDe(cModos) },
            { c: await caja(p, iconos), n: 2, numeroEn: izqDe(await caja(p, iconos)) },
            { c: cColoresLibre, n: 3, numeroEn: izqDe(cColoresLibre) },
            { c: cLargo, n: 4, numeroEn: izqDe(cLargo) },
        ]);
        await guardar(p, "libre-dialogo.webp", holgura(await caja(p, dlg), 50, vista));
        await desmarcar(p);
        await dlg.getByRole("button", { name: "Cancelar" }).click();
        await espera(p, 500);

        // El recuadro va alrededor del paso entero —nombre, caja y
        // descripción—: alrededor de la caja sola, la flecha cruzaba el
        // nombre de uno y la descripción del otro.
        const conTexto = await caja(p, elNodo(p, "a_vip"));
        const conIcono = await caja(p, elNodo(p, "a_envio"));
        const cFin = await caja(p, elNodo(p, "a_fin"));
        await marcar(p, [
            { c: conIcono, texto: "Con un icono", lado: "arriba" },
            { c: conTexto, texto: "Con un texto", lado: "abajo" },
        ]);
        // A la izquierda, poco margen: más allá asoma a medias la columna
        // de pasos de antes.
        const cEjemplo = unir(conTexto, conIcono, cFin);
        await guardar(p, "libre-ejemplo.webp", holgura({ x: cEjemplo.x - 30, y: cEjemplo.y - 110, w: cEjemplo.w + 90, h: cEjemplo.h + 220 }, 0, vista));
        await desmarcar(p);
    }

    /* Uno de solo lectura ---------------------------------------------- */
    await abrirElDiagrama(p, DE_LECTURA.id);
    {
        const marca = p.locator('[title="Este diagrama se comparte como solo lectura"]');
        // El nombre y su marca juntos: el recuadro de la marca sola se comía
        // la última letra del nombre, que va pegado a ella.
        const nombre = p.locator(`[title="${DE_LECTURA.nombre}"]`).first();
        await marcar(p, [{ c: unir(await caja(p, nombre), await caja(p, marca)), texto: "Solo puedes mirarlo", lado: "derecha" }]);
        await guardar(p, "compartir-lectura.webp");
        await desmarcar(p);
    }

    /* Lo creado para las capturas se borra: el vídeo lo vuelve a crear --- */
    await abrirLaLista(p);
    await borrarElNuevo(p);
}

/** Borra «Toma de pedidos» si existe (desde su «⋯», como lo haría una persona). */
async function borrarElNuevo(p) {
    if (!(await p.locator(`[title="${NUEVO}"]`).count())) return;
    const menu = await elMenuDe(p, partesDeLaTarjeta(p, NUEVO).mas);
    await menu.getByRole("menuitem", { name: "Eliminar" }).click();
    const alerta = p.locator('[role="alertdialog"]');
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await alerta.getByRole("button", { name: "Eliminar", exact: true }).click();
    await p.locator(`[title="${NUEVO}"]`).waitFor({ state: "detached", timeout: 20000 });
    await quitarAvisos(p);
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/**
 * Entre una frase y la siguiente, lo que respira una persona hablando: el
 * mismo de Leads. Queda escrito en `voz-de-la-guia/diagramas.json` con el vídeo.
 */
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
    // No `recordVideo`: estiraba el vídeo cada vez que el navegador pintaba
    // deprisa y la imagen se iba quedando detrás de la voz (ver la grabadora).
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirLaLista(p);
    await p.mouse.move(640, 400, { steps: 8 });
    // Lo grabado hasta aquí es la página cargando: el vídeo empieza justo
    // antes de la primera palabra.
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("paso a paso", 600);
    await p.mouse.move(760, 520, { steps: 30 });

    // El menú de la izquierda: se abre con las dos flechas, se señala Panel y
    // se vuelve a recoger al empezar la frase siguiente, que es la de la barra.
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

    const ventas = p.locator('[data-ui="badge"]', { hasText: "Ventas" }).first().locator("button").first();
    const todas = p.getByRole("button", { name: "Todas", exact: true });
    await decir("tarjetas");
    await mover(p, laTarjeta(p, ESCAPARATE.nombre));
    await alDecir("con Ventas");
    await pulsar(p, ventas);
    await alDecir("con Todas");
    await pulsar(p, todas);

    // Crear: el nombre se escribe delante de la cámara y se abre el editor.
    const nuevo = elNuevo(p);
    const dialogo = p.locator('[role="dialog"]').last();
    await decir("nuevo");
    await alDecir("Con el botón Nuevo");
    await pulsar(p, nuevo);
    await dialogo.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("le pones un nombre", 300);
    await dialogo.locator("input").pressSequentially(NUEVO, { delay: 55 });
    await alDecir("se abre el editor");
    await pulsar(p, dialogo.getByRole("button", { name: "Crear", exact: true }));
    await p.waitForSelector('.react-flow__node[data-id$="_decision"]', { timeout: 60000 });
    await esconderLosBotonesDelBorde(p);
    const inicio = p.locator('.react-flow__node[data-id$="_inicio"]');
    const decision = p.locator('.react-flow__node[data-id$="_decision"]');
    await alDecir("el Inicio", 250);
    await mover(p, inicio);
    await alDecir("una Decisión", 250);
    await mover(p, decision);

    // Agregar: el «+» del Sí, se busca «cita» y se elige; el lienzo se ajusta
    // para que se vea dónde quedó.
    const paleta = laPaleta(p);
    await decir("agregar");
    await alDecir("Con el más");
    await pulsar(p, elMas(decision, "yes"));
    await paleta.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("buscas su nombre", 250);
    await paleta.locator('input[aria-label="Buscar nodo"]').pressSequentially("cita", { delay: 90 });
    await alDecir("lo eliges");
    await pulsar(p, paleta.getByRole("option", { name: "Agendar la cita", exact: true }));
    await alDecir("queda puesto y conectado");
    await pulsar(p, elControl(p, "Ver todo el diagrama"));

    // Escribir: la caja del paso nuevo, el texto y «Listo».
    const cita = await elNodoLlamado(p, "Agendar la cita");
    await decir("escribir");
    await alDecir("Pulsas la caja");
    await pulsar(p, laCaja(cita));
    await dialogo.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("escribir lo que pasa", 250);
    await dialogo.locator('textarea[id^="texto-"]').pressSequentially("Le ofrecemos martes o jueves", { delay: 35 });
    await alDecir("con Listo");
    await pulsar(p, dialogo.getByRole("button", { name: "Listo" }));

    // Ordenar, el guardado, y de vuelta a la lista.
    await decir("ordenar");
    await alDecir("Ordenar acomoda");
    await pulsar(p, elOrdenar(p));
    await alDecir("se guarda solo");
    await mover(p, elGuardado(p));
    await alDecir("sin que tengas que hacer nada");
    await pulsar(p, p.locator('button[title="Volver a Diagramas"]'));

    // Compartir con el equipo, desde la tarjeta del que se acaba de crear.
    await p.locator(`[title="${NUEVO}"]`).first().waitFor({ state: "visible", timeout: 60000 });
    await esconderLosBotonesDelBorde(p);
    const nuestra = partesDeLaTarjeta(p, NUEVO);
    const menu = p.locator('[role="menu"]').last();
    const opcion = (nombre) => menu.getByRole("menuitemradio", { name: new RegExp(`^${nombre}`) });
    await decir("compartir");
    await alDecir("con quién de tu equipo");
    await pulsar(p, nuestra.equipo);
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("privado", 250);
    await mover(p, opcion("Privado"));
    await alDecir("solo lectura", 250);
    await mover(p, opcion("Solo lectura"));
    await alDecir("editable", 250);
    await mover(p, opcion("Editable"));

    // Y el «⋯»: se recorren sus opciones mientras se nombran, sin pulsar ninguna.
    const accion = (nombre) => menu.getByRole("menuitem", { name: nombre, exact: true });
    await decir("cierre");
    await p.keyboard.press("Escape");
    await alDecir("en los tres puntos");
    await pulsar(p, nuestra.mas);
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("lo renombras", 250);
    await mover(p, accion("Renombrar"));
    await alDecir("lo duplicas", 250);
    await mover(p, accion("Duplicar"));
    await alDecir("lo compartes con otras cuentas", 250);
    await mover(p, accion("Compartir con otras cuentas"));
    await alDecir("lo eliminas", 250);
    await mover(p, accion("Eliminar"));
    await alDecir("Así se trabaja");
    await p.keyboard.press("Escape");
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
    escribirLaVozDelVideo("diagramas", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) {
        try {
            await capturas(p);
        } catch (e) {
            // Lo que se veía cuando falló: sin esto, un plazo agotado no dice
            // qué había en pantalla.
            await p.screenshot({ path: path.join(TMP, "fallo.png") }).catch(() => {});
            console.error("  ✗ la pantalla al fallar:", path.join(TMP, "fallo.png"), "en", p.url());
            throw e;
        }
    }
    if (!SOLO_VIDEO) {
        await abrirLaLista(p);
        await borrarElNuevo(p);
    }
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) await video(navegador, estado);
} finally {
    await navegador.close();
}

// Las que la guía enseña tienen que estar TODAS.
comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/diagramas`);
