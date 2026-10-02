/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Mis tareas, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-tareas.mjs`).
 *
 * La MISMA receta que las demás guías y con las MISMAS piezas del taller
 * (`taller-de-la-guia.mjs`): cada captura es «abre esto, pulsa aquello, resalta
 * este elemento», y las marcas se localizan por lo que la pantalla ya expone
 * —los `data-zona` de la barra y de cada tarea, los `data-grupo` de la lista,
 * los `data-columna` del Kanban, los `data-campo` de las ventanas—, no por
 * coordenadas escritas a mano.
 *
 * Las capturas CAMBIAN los datos (crean y completan una tarea), así que antes
 * del vídeo se vuelve a sembrar. Cancelar y eliminar NO se confirman nunca: la
 * ventana se cierra con «Volver», en las capturas y en el vídeo. Y la tarea
 * nueva se crea SIN el recordatorio por WhatsApp: aquí no hay línea que lo
 * mande.
 *
 * Qué captura hace falta lo dice `lib/guia-tareas.ts`: el script se niega a
 * terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-tareas.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-tareas.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "tareas");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-tareas";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
// Solo el vídeo (p. ej. al cambiar la narración): las imágenes se conservan del disco.
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-tareas.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-tareas.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Medir                                                               */
/* ------------------------------------------------------------------ */

const LA_LISTA = '[data-zona="lista"]';
const EL_TABLERO = '[data-zona="kanban"]';
const laVista = (p, nombre) => p.locator('[data-zona="vista"] button', { hasText: nombre }).first();
const LAS_CIFRAS = '[data-zona="cifras"]';
const LAS_COMPLETADAS = '[data-zona="completadas"]';
const EL_BUSCADOR = 'input[placeholder="Buscar tarea..."]';
const EL_ACTUALIZAR = 'button[aria-label="Actualizar"]';
const EL_NUEVO = (p) => p.locator('[data-barra-de-acciones] [data-zona="crear"] button').first();
const LA_VENTANA = "[data-ventana-de-completar]";
const LA_FICHA = "[data-ficha-de-la-tarea]";
const EL_PANEL = (p) => p.locator("[data-hoja-lateral]").filter({ has: p.locator('[data-campo="descripcion"]') }).first();
const elCampo = (p, campo) => EL_PANEL(p).locator(`[data-campo="${campo}"]`).first();
const enLaVentana = (p, campo) => p.locator(`${LA_VENTANA} [data-campo="${campo}"]`).first();

const laTarea = (p, titulo) => p.locator(`${LA_LISTA} [data-tarea]`, { hasText: titulo }).first();
const laParte = (p, titulo, zona) => laTarea(p, titulo).locator(`[data-zona="${zona}"]`).first();
const elMandoDe = (p, titulo, aria) => laTarea(p, titulo).locator(`button[aria-label="${aria}"]`).first();
const elGrupo = (p, nombre) => p.locator(`${LA_LISTA} [data-grupo="${nombre}"]`).first();
const laColumna = (p, tipo) => p.locator(`${EL_TABLERO} [data-columna="${tipo}"]`).first();
const laCabeza = (p, tipo) => laColumna(p, tipo).locator("> div").first();

const COLUMNAS = ["Seguimiento", "Llamada", "Reunión", "Email", "Tarea"];

async function abrirLaPantalla(p) {
    await p.goto(`${BASE}/tareas`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${LA_LISTA} [data-tarea]`, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    // Los botones del borde tapan los mandos de la derecha de cada tarea.
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

async function laBarra(p) {
    return unir(await caja(p, '[data-zona="vista"]'), await caja(p, EL_BUSCADOR), await caja(p, `${LAS_CIFRAS} > *`), await caja(p, EL_NUEVO(p)));
}

const soltarElFoco = (p) => p.evaluate(() => document.activeElement?.blur?.());

/** La lista arriba del todo: lo que dejó desplazado la receta anterior no cuenta. */
async function alPrincipio(p) {
    await p.locator(LA_LISTA).first().evaluate((el) => {
        for (let n = el; n; n = n.parentElement) n.scrollTop = 0;
    });
    await espera(p, 250);
}

async function aLaVistaYMedir(p, locator) {
    await locator.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 250);
    return caja(p, locator);
}

/** Las `n` primeras tareas de un grupo, con su rótulo. */
async function elGrupoConSusTareas(p, nombre, n = 99) {
    const g = elGrupo(p, nombre);
    const tareas = g.locator("[data-tarea]");
    const cuantas = Math.min(n, await tareas.count());
    const cajas = [await caja(p, g.locator("> *").first())];
    for (let i = 0; i < cuantas; i += 1) cajas.push(await caja(p, tareas.nth(i)));
    return unir(...cajas);
}

async function abrirElPanel(p) {
    await EL_NUEVO(p).click();
    await elCampo(p, "descripcion").waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 900);
}

async function cerrarElPanel(p) {
    const cancelar = EL_PANEL(p).getByRole("button", { name: "Cancelar" });
    if (await cancelar.isVisible().catch(() => false)) await cancelar.click();
    await espera(p, 700);
}

/** El recordatorio por WhatsApp, apagado: aquí no hay línea que lo mande. */
async function sinRecordatorio(p) {
    const casilla = elCampo(p, "recordatorio").getByRole("checkbox");
    if ((await casilla.getAttribute("data-state")) === "checked") await casilla.click();
}

async function abrirElKanban(p) {
    await laVista(p, "Kanban").click();
    await laColumna(p, "Tarea").waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 1000);
}

async function volverALaLista(p) {
    await laVista(p, "Lista").click();
    await p.waitForSelector(`${LA_LISTA} [data-tarea]`, { timeout: 15000 });
    await espera(p, 800);
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

    await mini("vista-general", () => laBarra(p));
    await mini("lista", async () => unir(await elGrupoConSusTareas(p, "Vencidas"), await elGrupoConSusTareas(p, "Hoy")));
    await mini("metricas", () => caja(p, `${LAS_CIFRAS} > *`));
    await mini(
        "kanban",
        async () => {
            await abrirElKanban(p);
            return unir(await caja(p, laColumna(p, "Seguimiento")), await caja(p, laColumna(p, "Llamada")));
        },
        () => volverALaLista(p),
    );
    await mini(
        "automatizaciones",
        async () => {
            await abrirElKanban(p);
            await laColumna(p, "Llamada").locator('[data-boton="automatizaciones"]').click();
            const hoja = p.locator('[data-automatizaciones-del-tipo="Llamada"]');
            await hoja.locator("[data-automatizacion]").first().waitFor({ state: "visible", timeout: 15000 });
            await espera(p, 800);
            return caja(p, hoja.locator("[data-automatizacion]").first());
        },
        async () => {
            await p.keyboard.press("Escape");
            await espera(p, 600);
            await volverALaLista(p);
        },
    );
    await mini(
        "crear",
        async () => {
            await abrirElPanel(p);
            return unir(await caja(p, elCampo(p, "tipo")), await caja(p, elCampo(p, "asignado")));
        },
        () => cerrarElPanel(p),
    );
    await mini(
        "completar",
        async () => {
            await elMandoDe(p, "SEGUIMIENTO DE LA PROPUESTA", "Completar tarea").click();
            await p.locator(LA_VENTANA).waitFor({ state: "visible", timeout: 10000 });
            await espera(p, 600);
            await soltarElFoco(p);
            return unir(await caja(p, enLaVentana(p, "tiempo")), await caja(p, enLaVentana(p, "rapidos")));
        },
        async () => {
            await p.locator(LA_VENTANA).getByRole("button", { name: "Cancelar" }).click();
            await espera(p, 500);
        },
    );
    await mini("cancelar-y-eliminar", () => aLaVistaYMedir(p, laParte(p, "REUNIÓN DE CIERRE", "mandos")));
    await mini(
        "ficha",
        async () => {
            await laParte(p, "PREPARAR EL CONTRATO", "titulo").click();
            await p.locator(LA_FICHA).waitFor({ state: "visible", timeout: 10000 });
            await espera(p, 800);
            await soltarElFoco(p);
            return caja(p, `${LA_FICHA} dl`);
        },
        async () => {
            await p.keyboard.press("Escape");
            await espera(p, 500);
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
    const barra = await laBarra(p);
    const zonaDeLaBarra = holgura(unir(barra, { ...barra, y: barra.y + 110, h: 1 }), 22, vista);

    // Portada del vídeo: la pantalla limpia.
    await alPrincipio(p);
    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las cuatro zonas, en el orden de `ZONAS_DE_LA_PANTALLA`.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: barra, n: 3 },
        { c: holgura(await caja(p, LA_LISTA), -8, vista), n: 4 },
    ]);
    await guardar(p, "vista-general.webp");
    await desmarcar(p);
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");

    // La barra de trabajo: sus seis partes, en el orden de `PARTES_DE_LA_BARRA_DE_TRABAJO`.
    await marcar(p, [
        { c: await caja(p, '[data-zona="vista"]'), n: 1 },
        { c: await caja(p, EL_BUSCADOR), n: 2 },
        { c: await caja(p, `${LAS_CIFRAS} > *`), n: 3 },
        { c: await caja(p, LAS_COMPLETADAS), n: 4 },
        { c: await caja(p, EL_ACTUALIZAR), n: 5 },
        { c: await caja(p, EL_NUEVO(p)), n: 6 },
    ]);
    await guardar(p, "barra.webp", holgura(barra, 34, vista));
    await desmarcar(p);

    // Una tarea: sus seis partes, en el orden de `PARTES_DE_UNA_TAREA`. Las
    // cuatro de la izquierda son líneas pegadas: un recuadro alrededor de las
    // cuatro y cada número a la altura de su línea.
    const ejemplo = "SEGUIMIENTO DE LA PROPUESTA";
    const cTarjeta = await aLaVistaYMedir(p, laTarea(p, ejemplo));
    const arriba = cTarjeta.y - 22;
    const marcas = [];
    // La caja de una línea es la de su TEXTO (un Range), no la del elemento:
    // el título y la fecha ocupan el ancho entero de la tarjeta, y el velo
    // abriría barras blancas de lado a lado.
    const lineas = await laTarea(p, ejemplo).evaluate((tarjeta) =>
        ["titulo", "contacto", "asesor", "fecha"].map((z) => {
            const r = document.createRange();
            r.selectNodeContents(tarjeta.querySelector(`[data-zona="${z}"]`));
            const b = r.getBoundingClientRect();
            return { x: b.x, y: b.y, w: b.width, h: b.height };
        }),
    );
    // Cada número a la derecha del texto de su línea: a la izquierda, cuatro
    // números en cuatro líneas pegadas se montan unos sobre otros.
    const derecha = Math.max(...lineas.map((c) => c.x + c.w));
    for (const [i, c] of lineas.entries()) {
        marcas.push({ c, n: i + 1, sinRecuadro: true, numeroEn: { x: derecha + 24 + (i % 2) * 30, y: c.y + c.h / 2 } });
    }
    const deLasLineas = unir(...lineas);
    marcas.push({ c: { ...deLasLineas, x: deLasLineas.x - 4, w: deLasLineas.w + 8 } });
    for (const [i, z] of ["tipo", "mandos"].entries()) {
        const c = await caja(p, laParte(p, ejemplo, z));
        marcas.push({ c, n: 5 + i, numeroEn: { x: c.x + c.w / 2, y: arriba } });
    }
    await marcar(p, marcas, { atenuar: true });
    await guardar(p, "tarjeta.webp", holgura({ x: cTarjeta.x - 44, y: cTarjeta.y - 44, w: cTarjeta.w + 60, h: cTarjeta.h + 66 }, 10, vista));
    await desmarcar(p);

    // 2. La lista, agrupada por fecha.
    await alPrincipio(p);
    const grupos = ["Vencidas", "Hoy", "Mañana", "Esta semana", "Más adelante"];
    const rotulosDeGrupo = [];
    for (const [i, g] of grupos.entries()) {
        const r = await caja(p, elGrupo(p, g).locator("> *").first());
        if (r.y + r.h < vista.height) rotulosDeGrupo.push({ c: r, n: i + 1, lado: "derecha" });
    }
    await marcar(p, rotulosDeGrupo);
    await guardar(p, "lista.webp");
    await desmarcar(p);
    const cVencidas = await elGrupoConSusTareas(p, "Vencidas");
    await marcar(p, [{ c: cVencidas, texto: "Ya pasó su hora: en rojo", lado: "abajo" }], { atenuar: true });
    await guardar(p, "lista-vencidas.webp", holgura(cVencidas, 50, vista));
    await desmarcar(p);
    await p.fill(EL_BUSCADOR, "llamar");
    await espera(p, 900);
    await marcar(p, [
        { c: await caja(p, EL_BUSCADOR) },
        { c: await caja(p, LA_LISTA), texto: "Las que dicen «llamar»", lado: "abajo" },
    ]);
    await guardar(p, "lista-buscar.webp", holgura(unir(await caja(p, EL_BUSCADOR), await caja(p, LA_LISTA)), 40, vista));
    await desmarcar(p);
    await p.fill(EL_BUSCADOR, "");
    await espera(p, 900);
    await p.locator(LAS_COMPLETADAS).click();
    await elGrupo(p, "Completadas").waitFor({ state: "visible", timeout: 10000 });
    const cCompletadas = await aLaVistaYMedir(p, elGrupo(p, "Completadas"));
    await marcar(p, [{ c: cCompletadas, texto: "Con su resultado", lado: "arriba" }], { atenuar: true });
    await guardar(p, "lista-completadas.webp", holgura(cCompletadas, 50, vista));
    await desmarcar(p);
    await p.locator(LAS_COMPLETADAS).click();
    await espera(p, 600);
    await alPrincipio(p);

    // 3. Las cifras.
    const pastillas = p.locator(`${LAS_CIFRAS} > * > *`);
    const cifras = [];
    for (let i = 0; i < Math.min(3, await pastillas.count()); i += 1) cifras.push({ c: await caja(p, pastillas.nth(i)), n: i + 1, lado: "abajo" });
    await marcar(p, cifras.length === 3 ? cifras : [{ c: await caja(p, `${LAS_CIFRAS} > *`), texto: "Pendientes · Vencidas · Para hoy", lado: "abajo" }]);
    await guardar(p, "cifras.webp", zonaDeLaBarra);
    await desmarcar(p);
    await marcar(p, [
        { c: await caja(p, `${LAS_CIFRAS} > *`), n: 1, lado: "abajo" },
        { c: await caja(p, elGrupo(p, "Vencidas").locator("> *").first()), n: 2, lado: "derecha" },
        { c: await caja(p, elGrupo(p, "Hoy").locator("> *").first()), n: 3, lado: "derecha" },
    ]);
    await guardar(p, "cifras-y-grupos.webp", holgura(unir(barra, await elGrupoConSusTareas(p, "Hoy")), 30, vista));
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, EL_ACTUALIZAR), texto: "Actualizar", lado: "abajo" }]);
    await guardar(p, "cifras-actualizar.webp", zonaDeLaBarra);
    await desmarcar(p);

    // 4. El Kanban: con la ventana más ancha caben todas las columnas.
    await marcar(p, [{ c: await caja(p, laVista(p, "Kanban")), texto: "Kanban", lado: "abajo" }]);
    await guardar(p, "kanban-boton.webp", zonaDeLaBarra);
    await desmarcar(p);
    await p.setViewportSize({ width: 1920, height: 900 });
    await espera(p, 600);
    await abrirElKanban(p);
    await queNadaSalgaRecortado(p);
    const cColumnas = [];
    for (const t of COLUMNAS) cColumnas.push(await caja(p, laCabeza(p, t)));
    await marcar(p, cColumnas.map((c, i) => ({ c, n: i + 1 })));
    await guardar(p, "kanban.webp");
    await desmarcar(p);
    const enColumna = laColumna(p, "Llamada").locator("[data-tarea]", { hasText: "AGENDAR LA DEMO" }).first();
    const cEnColumna = await caja(p, enColumna);
    await marcar(p, [{ c: cEnColumna, texto: "Contacto, asesor y fecha", lado: "derecha" }], { atenuar: true });
    await guardar(p, "kanban-tarjeta.webp", holgura(unir(await caja(p, laColumna(p, "Llamada")), { ...cEnColumna, w: cEnColumna.w + 300 }), 10, p.viewportSize()));
    await desmarcar(p);

    // 5. Las automatizaciones del tipo «Llamada».
    const engranaje = laColumna(p, "Llamada").locator('[data-boton="automatizaciones"]');
    await marcar(p, [{ c: await caja(p, engranaje), texto: "Automatizaciones", lado: "abajo" }], { atenuar: true });
    await guardar(p, "automatizaciones-engranaje.webp", holgura(unir(await caja(p, laCabeza(p, "Llamada")), { ...(await caja(p, laCabeza(p, "Llamada"))), h: 140 }), 30, p.viewportSize()));
    await desmarcar(p);
    await engranaje.click();
    const hoja = p.locator('[data-automatizaciones-del-tipo="Llamada"]');
    const automatizacion = hoja.locator("[data-automatizacion]").first();
    await automatizacion.waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 1000);
    await soltarElFoco(p);
    await marcar(p, [
        { c: await caja(p, automatizacion), n: 1, esquina: "izquierda" },
        { c: await caja(p, hoja.locator('input[placeholder="Nombre de la automatización..."]')), n: 2, borde: "abajo" },
    ]);
    await guardar(p, "automatizaciones.webp", holgura(await caja(p, hoja), 10, p.viewportSize()));
    await desmarcar(p);
    await automatizacion.getByRole("button", { name: "Agregar acción" }).click();
    const nueva = p.getByRole("dialog").filter({ hasText: "Nueva acción" }).last();
    await nueva.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    // Con un Select de Radix abierto lo de fuera es aria-hidden: se mide antes.
    const laVentanaNueva = await caja(p, nueva);
    await nueva.getByRole("combobox").first().click();
    const tipos = p.locator('[role="listbox"]').last();
    await tipos.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await marcar(p, [{ c: await caja(p, tipos), texto: "Qué hace la acción", lado: "derecha" }]);
    await guardar(p, "automatizaciones-accion.webp", holgura(unir(laVentanaNueva, await caja(p, tipos)), 20, p.viewportSize()));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 300);
    await nueva.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 400);
    await p.keyboard.press("Escape");
    await espera(p, 700);
    await p.setViewportSize({ width: 1440, height: 900 });
    await volverALaLista(p);

    // 6. Crear una tarea: se crea DE VERDAD al final.
    await marcar(p, [{ c: await caja(p, EL_NUEVO(p)), texto: "Nuevo", lado: "abajo" }]);
    await guardar(p, "crear-boton.webp", zonaDeLaBarra);
    await desmarcar(p);
    await abrirElPanel(p);
    await elCampo(p, "descripcion").locator("textarea").fill("Llamar para ofrecer el plan anual");
    await sinRecordatorio(p);
    await soltarElFoco(p);
    const campos = ["tipo", "descripcion", "fecha", "asignado", "recordatorio"];
    await marcar(p, await Promise.all(campos.map(async (c, i) => ({ c: await caja(p, elCampo(p, c)), n: i + 1, esquina: "derecha" }))));
    await guardar(p, "crear-panel.webp", holgura(await caja(p, EL_PANEL(p)), 10, vista));
    await desmarcar(p);
    await elCampo(p, "tipo").getByRole("combobox").click();
    const listaDeTipos = p.locator('[role="listbox"]').last();
    await listaDeTipos.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await marcar(p, [
        { c: await caja(p, listaDeTipos.getByRole("button", { name: "Agregar tipo" })), n: 1, lado: "izquierda" },
    ]);
    await guardar(p, "crear-tipo.webp", holgura(unir(await caja(p, listaDeTipos), await caja(p, elCampo(p, "tipo"))), 40, vista));
    await desmarcar(p);
    await listaDeTipos.getByRole("option", { name: "Llamada", exact: true }).click();
    await espera(p, 400);
    await EL_PANEL(p).locator('[data-boton="crear"]').click();
    const creada = laTarea(p, "OFRECER EL PLAN ANUAL");
    await creada.waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1200);
    await quitarAvisos(p);
    const cCreada = await aLaVistaYMedir(p, creada);
    await marcar(p, [{ c: cCreada, texto: "La tarea nueva, en Mañana", lado: "abajo" }], { atenuar: true });
    await guardar(p, "crear-lista.webp", holgura(unir(await caja(p, elGrupo(p, "Mañana").locator("> *").first()), cCreada, { ...cCreada, y: cCreada.y + cCreada.h + 70, h: 1 }), 30, vista));
    await desmarcar(p);
    await alPrincipio(p);

    // 7. Completar con tiempo y resultado, programando la siguiente.
    const aCompletar = "SEGUIMIENTO DE LA PROPUESTA";
    const verde = elMandoDe(p, aCompletar, "Completar tarea");
    await marcar(p, [{ c: await caja(p, verde), texto: "Completar", lado: "abajo" }], { atenuar: true });
    await guardar(p, "completar-boton.webp", holgura(await caja(p, laTarea(p, aCompletar)), 40, vista));
    await desmarcar(p);
    await verde.click();
    const ventana = p.locator(LA_VENTANA);
    await ventana.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await enLaVentana(p, "tiempo").locator("input").fill("20");
    await enLaVentana(p, "rapidos").getByRole("button", { name: "Interesado", exact: true }).click();
    await espera(p, 300);
    await soltarElFoco(p);
    await marcar(p, [
        { c: await caja(p, enLaVentana(p, "tiempo")), n: 1, esquina: "derecha" },
        { c: await caja(p, enLaVentana(p, "resultado")), n: 2, esquina: "derecha" },
        { c: await caja(p, enLaVentana(p, "rapidos")), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "completar-ventana.webp", holgura(await caja(p, ventana), 20, vista));
    await desmarcar(p);
    await enLaVentana(p, "siguiente").getByRole("checkbox").click();
    await espera(p, 400);
    await enLaVentana(p, "siguiente").getByRole("button", { name: "Próxima semana" }).click();
    await espera(p, 300);
    await soltarElFoco(p);
    await marcar(p, [{ c: await aLaVistaYMedir(p, enLaVentana(p, "siguiente")) }]);
    await guardar(p, "completar-siguiente.webp", holgura(await caja(p, ventana), 20, vista));
    await desmarcar(p);
    await ventana.getByRole("button", { name: "Marcar completada" }).click();
    await ventana.waitFor({ state: "hidden", timeout: 20000 });
    await espera(p, 1500);
    await quitarAvisos(p);
    await p.locator(LAS_COMPLETADAS).click();
    await elGrupo(p, "Completadas").waitFor({ state: "visible", timeout: 10000 });
    const hecha = laTarea(p, aCompletar);
    const cHecha = await aLaVistaYMedir(p, hecha);
    await marcar(p, [{ c: cHecha, texto: "Hecha, con su resultado", lado: "arriba" }], { atenuar: true });
    await guardar(p, "completar-hecha.webp", holgura(unir(cHecha, await caja(p, elGrupo(p, "Completadas").locator("> *").first())), 50, vista));
    await desmarcar(p);
    await p.locator(LAS_COMPLETADAS).click();
    await espera(p, 600);
    await alPrincipio(p);

    // 8. Cancelar y eliminar: la ventana se cierra con «Volver».
    const aCancelar = "REUNIÓN DE CIERRE";
    {
        const cX = await aLaVistaYMedir(p, elMandoDe(p, aCancelar, "Cancelar tarea"));
        const cPapelera = await caja(p, elMandoDe(p, aCancelar, "Eliminar tarea definitivamente"));
        await marcar(p, [
            { c: cX, n: 1, lado: "abajo" },
            { c: cPapelera, n: 2, lado: "abajo" },
        ], { atenuar: true });
        await guardar(p, "cancelar-botones.webp", holgura(await caja(p, laTarea(p, aCancelar)), 30, vista));
        await desmarcar(p);
    }
    for (const [mando, imagen, boton] of [
        ["Cancelar tarea", "cancelar-confirmar.webp", "Sí, cancelar la tarea"],
        ["Eliminar tarea definitivamente", "eliminar-confirmar.webp", "Eliminar"],
    ]) {
        await elMandoDe(p, aCancelar, mando).click();
        const alerta = p.locator('[role="alertdialog"]');
        await alerta.waitFor({ state: "visible", timeout: 10000 });
        await espera(p, 600);
        await soltarElFoco(p);
        const cAlerta = await caja(p, alerta);
        const volver = alerta.getByRole("button", { name: "Volver" });
        await marcar(p, [
            { c: await caja(p, volver), texto: "No cambia nada", lado: "abajo" },
            { c: await caja(p, alerta.getByRole("button", { name: boton })), n: 1, lado: "abajo" },
        ]);
        await guardar(p, imagen, holgura(unir(cAlerta, { ...cAlerta, y: cAlerta.y + cAlerta.h + 84, h: 1 }), 26, vista));
        await desmarcar(p);
        await volver.click();
        await alerta.waitFor({ state: "hidden", timeout: 10000 });
        await espera(p, 400);
    }

    // 9. La ficha de una tarea.
    const aAbrir = "PREPARAR EL CONTRATO";
    const titulo = laParte(p, aAbrir, "titulo");
    await marcar(p, [{ c: await aLaVistaYMedir(p, titulo), texto: "Pulsa el título", lado: "abajo" }], { atenuar: true });
    await guardar(p, "ficha-titulo.webp", holgura(await caja(p, laTarea(p, aAbrir)), 40, vista));
    await desmarcar(p);
    await titulo.click();
    const ficha = p.locator(LA_FICHA);
    await ficha.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 1000);
    await soltarElFoco(p);
    await guardar(p, "ficha.webp", holgura(await caja(p, ficha), 20, vista));
    await marcar(p, [{ c: await caja(p, ficha.getByRole("button", { name: "Felipe Ríos" })), texto: "Abre su conversación", lado: "derecha" }], { atenuar: true });
    await guardar(p, "ficha-contacto.webp", holgura(await caja(p, ficha), 20, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await ficha.waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 400);

    await elMarcoDeLaPantalla(p, guardar, { modulo: "Herramientas", texto: "Mis tareas está en Herramientas" });
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
    await alDecir("las llamadas", 300);
    await mover(p, laTarea(p, "LLAMAR PARA CONFIRMAR EL PEDIDO"));
    await alDecir("las reuniones", 200);
    await mover(p, laTarea(p, "REUNIÓN DE CIERRE"));

    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const herramientas = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Herramientas" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Herramientas", 600);
    await mover(p, herramientas);

    const [, , , buscarTodo, , soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    const cabezaDe = (g) => elGrupo(p, g).locator("> *").first();
    await decir("lista");
    await alDecir("arriba las vencidas");
    await mover(p, cabezaDe("Vencidas"));
    await alDecir("las de hoy", 100);
    await mover(p, cabezaDe("Hoy"));
    await alDecir("las de mañana", 100);
    await mover(p, cabezaDe("Mañana"));
    await alDecir("las de esta semana", 100);
    await mover(p, cabezaDe("Esta semana"));

    const pastilla = (i) => p.locator(`${LAS_CIFRAS} > * > *`).nth(i);
    await decir("metricas");
    await alDecir("pendientes");
    await mover(p, pastilla(0));
    await alDecir("se vencieron");
    await mover(p, pastilla(1));
    await alDecir("son para hoy");
    await mover(p, pastilla(2));

    await decir("kanban");
    await alDecir("Con Kanban");
    await pulsar(p, laVista(p, "Kanban"));
    await laColumna(p, "Tarea").waitFor({ state: "visible", timeout: 15000 });
    await alDecir("seguimientos");
    await mover(p, laCabeza(p, "Seguimiento"));
    await alDecir("llamadas", 0);
    await mover(p, laCabeza(p, "Llamada"));
    await alDecir("reuniones", 0);
    await mover(p, laCabeza(p, "Reunión"));
    await alDecir("correos", 0);
    await mover(p, laCabeza(p, "Email"));

    const hoja = p.locator('[data-automatizaciones-del-tipo="Llamada"]');
    await decir("automatizaciones");
    await alDecir("El engranaje");
    await pulsar(p, laColumna(p, "Llamada").locator('[data-boton="automatizaciones"]'));
    await hoja.locator("[data-automatizacion]").first().waitFor({ state: "visible", timeout: 15000 });
    await alDecir("avisar al asesor", 200);
    await mover(p, hoja.locator("[data-automatizacion]").first());

    await decir("crear");
    await p.keyboard.press("Escape");
    await hoja.waitFor({ state: "hidden", timeout: 10000 });
    await pulsar(p, laVista(p, "Lista"));
    await p.waitForSelector(`${LA_LISTA} [data-tarea]`, { timeout: 15000 });
    await alDecir("Con Nuevo");
    await pulsar(p, EL_NUEVO(p));
    await elCampo(p, "descripcion").waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 600);
    await alDecir("eliges el tipo");
    await pulsar(p, elCampo(p, "tipo").getByRole("combobox"));
    const listaDeTipos = p.locator('[role="listbox"]').last();
    await listaDeTipos.waitFor({ state: "visible", timeout: 10000 });
    await pulsar(p, listaDeTipos.getByRole("option", { name: "Llamada", exact: true }));
    await alDecir("escribes qué hay que hacer", 0);
    await pulsar(p, elCampo(p, "descripcion").locator("textarea"));
    await elCampo(p, "descripcion").locator("textarea").pressSequentially("Llamar para ofrecer el plan anual", { delay: 25 });
    await alDecir("y quién la hace", 0);
    await mover(p, elCampo(p, "asignado"));
    await sinRecordatorio(p);
    await alDecir("al crearla");
    await pulsar(p, EL_PANEL(p).locator('[data-boton="crear"]'));
    await laTarea(p, "OFRECER EL PLAN ANUAL").waitFor({ state: "visible", timeout: 30000 });
    await alDecir("aparece en su grupo", 100);
    await mover(p, laTarea(p, "OFRECER EL PLAN ANUAL"));

    const ventana = p.locator(LA_VENTANA);
    await decir("completar");
    await alDecir("Con el círculo verde");
    await pulsar(p, elMandoDe(p, "SEGUIMIENTO DE LA PROPUESTA", "Completar tarea"));
    await ventana.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("cuánto tiempo tomó", 0);
    await enLaVentana(p, "tiempo").locator("input").pressSequentially("20", { delay: 80 });
    await alDecir("su resultado", 0);
    await pulsar(p, enLaVentana(p, "rapidos").getByRole("button", { name: "Interesado", exact: true }));
    await alDecir("programas la siguiente", 0);
    await pulsar(p, enLaVentana(p, "siguiente").getByRole("checkbox"));
    await enLaVentana(p, "siguiente").getByRole("button", { name: "Próxima semana" }).waitFor({ state: "visible", timeout: 10000 });
    await alDecir("la próxima semana", 0);
    await pulsar(p, enLaVentana(p, "siguiente").getByRole("button", { name: "Próxima semana" }));

    const alerta = p.locator('[role="alertdialog"]');
    await decir("cierre");
    await pulsar(p, ventana.getByRole("button", { name: "Marcar completada" }));
    await ventana.waitFor({ state: "hidden", timeout: 20000 });
    await alDecir("La X la cancela");
    await mover(p, elMandoDe(p, "REUNIÓN DE CIERRE", "Cancelar tarea"));
    await alDecir("la papelera la elimina");
    await pulsar(p, elMandoDe(p, "REUNIÓN DE CIERRE", "Eliminar tarea definitivamente"));
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("siempre con confirmación", 200);
    await pulsar(p, alerta.getByRole("button", { name: "Volver" }));
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
    escribirLaVozDelVideo("tareas", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
    console.log("  ✓ demostracion.webm", Math.round(statSync(destino).size / 1024), "KB,", colocados.length, "frases narradas");
}

/* ------------------------------------------------------------------ */

const navegador = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    args: ["--lang=es-CO"],
    // El campo de fecha y hora lo pinta el proceso de Chromium con SU idioma:
    // hacen falta las dos cosas (la regla de la guía de Finanzas).
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
        // Las capturas crean y completan tareas: el vídeo sale del mismo punto de partida.
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-tareas.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/tareas`);
