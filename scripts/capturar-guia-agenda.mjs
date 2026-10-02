/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Agenda, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-agenda.mjs`).
 *
 * La MISMA receta que las demás guías (`capturar-guia-respuestas-rapidas.mjs`)
 * y con las MISMAS piezas del taller (`taller-de-la-guia.mjs`): cada captura
 * es «abre esto, pulsa aquello, resalta este elemento», y las marcas se
 * localizan por lo que la pantalla expone —los `data-*` de las pestañas, de
 * las citas, de las columnas, los `aria-label`—, no por coordenadas.
 *
 * Las capturas CAMBIAN los datos (pasan una cita a Confirmada, crean un
 * servicio, una pregunta y un recordatorio), así que antes del vídeo se vuelve
 * a sembrar. Nada de lo que se hace aquí borra ni reserva: la cancelación y la
 * reserva pública se dejan sin confirmar.
 *
 * Qué captura hace falta lo dice `lib/guia-agenda.ts`: el script se niega a
 * terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-agenda.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-agenda.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "agenda");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-agenda";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-agenda.json");
const MENU = path.join(RAIZ, "scripts", "menu-guia-agenda.json");

/** La cita que se abre en la guía: la de hoy a las 10 (`sembrar-guia-agenda.mjs`). */
const LA_CITA = "Mariana Toro";

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Abrir                                                               */
/* ------------------------------------------------------------------ */

const LA_VISTA = "[data-schedule-view]";
const LAS_PESTANAS = "[data-pestanas-de-agenda]";
const LAS_CIFRAS = `${LA_VISTA} > div:first-child > :last-child`;
const EL_CONTENIDO = `${LA_VISTA} > div:nth-child(2)`;
const laPestana = (p, v) => p.locator(`[data-pestana-de-agenda="${v}"]`);

/** Lo que tiene que haber pintado cada pestaña para darla por cargada. */
const LISTA_DE = {
    dashboard: "[data-columna-del-dia] [data-cita]",
    availability: '[data-dia-de-disponibilidad="1"] button[title="Eliminar periodo"]',
    kanban: "[data-tarjeta-de-cita]",
    services: "[data-servicio-de-agenda]",
    reminders: "[data-schedule-view] h3, [data-schedule-view] [data-recordatorio]",
    form: "[data-pregunta-del-formulario]",
    registros: "[data-registro-de-reserva]",
    settings: '[data-ajuste-de-agenda="google-calendar"]',
};

async function abrirLaAgenda(p) {
    await p.goto(`${BASE}/schedule`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(LISTA_DE.dashboard, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
    // «Agenda cargada con éxito» sale en cada carga: se espera a que se vaya.
    await quitarAvisos(p);
}

async function irA(p, v) {
    await laPestana(p, v).click();
    await p.locator(LISTA_DE[v]).first().waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1200);
    await quitarAvisos(p);
}

const LA_LISTA_ABIERTA = '[role="listbox"]';
const EL_DIALOGO = '[role="dialog"]';
const LA_ALERTA = '[role="alertdialog"]';

/** La tarjeta de una cita en la vista Día. */
const laCita = (p, nombre) => p.locator("[data-columna-del-dia] [data-cita]", { hasText: nombre }).first();
const LA_FICHA = "[data-ficha-de-la-cita]";

async function abrirLaFicha(p, nombre = LA_CITA) {
    await laCita(p, nombre).click();
    await p.locator(LA_FICHA).waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 700);
}

async function cerrarLaFicha(p) {
    for (let i = 0; i < 3 && (await p.locator(`${LA_FICHA}, ${EL_DIALOGO}, ${LA_ALERTA}`).count()); i += 1) {
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }
}

async function elegir(p, disparador, opcion) {
    await (typeof disparador === "string" ? p.locator(disparador).first() : disparador).click();
    const lista = p.locator(LA_LISTA_ABIERTA).last();
    await lista.waitFor({ state: "visible", timeout: 10000 });
    await lista.getByRole("option", { name: opcion, exact: true }).click();
    await espera(p, 400);
}

/** Antes de una foto: el anillo de foco se lee como otra marca. */
const soltarElFoco = (p) => p.evaluate(() => document.activeElement?.blur?.());

const elDia = (p, d) => p.locator(`[data-dia-de-disponibilidad="${d}"]`);
const laColumna = (p, estado) => p.locator(`[data-columna-de-agenda="${estado}"]`);
const laTarjetaDe = (p, nombre) => p.locator("[data-tarjeta-de-cita]", { hasText: nombre }).first();
const elServicio = (p, nombre) => p.locator("[data-servicio-de-agenda]", { hasText: nombre }).first();
const elRegistro = (p, i = 0) => p.locator("[data-registro-de-reserva]").nth(i);

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

    await mini("vista-general", () => caja(p, LAS_PESTANAS));
    await mini("calendario", async () => unir(await caja(p, '[data-columna-del-dia="manana"]'), await caja(p, '[data-columna-del-dia="tarde"]')));
    await mini(
        "estado-y-reagendar",
        async () => {
            await abrirLaFicha(p);
            await p.locator(LA_FICHA).getByRole("tab", { name: "Estado" }).click();
            await espera(p, 500);
            return caja(p, LA_FICHA);
        },
        () => cerrarLaFicha(p),
    );
    await irA(p, "availability");
    await mini("disponibilidad", async () => unir(await caja(p, elDia(p, 1)), await caja(p, elDia(p, 6))));
    await mini("enlace-publico", () => caja(p, "[data-enlace-de-reserva]"));
    await irA(p, "kanban");
    await mini("kanban", async () => unir(await caja(p, laColumna(p, "PENDIENTE")), await caja(p, laColumna(p, "CONFIRMADA"))));
    await irA(p, "services");
    await mini("servicios", async () => {
        const cajas = [];
        for (let i = 0; i < 3; i += 1) cajas.push(await caja(p, p.locator("[data-servicio-de-agenda]").nth(i)));
        return unir(...cajas);
    });
    await irA(p, "reminders");
    await mini("recordatorios", async () => {
        const cajas = [];
        for (let i = 0; i < 3; i += 1) cajas.push(await caja(p, p.locator(`${EL_CONTENIDO} [data-recordatorio]`).nth(i)));
        return unir(...cajas);
    });
    await irA(p, "form");
    await mini("formulario-y-registros", async () => {
        const cajas = [];
        for (let i = 0; i < 3; i += 1) cajas.push(await caja(p, p.locator("[data-pregunta-del-formulario]").nth(i)));
        return unir(...cajas);
    });
    await irA(p, "settings");
    await mini("ajustes", () => caja(p, '[data-ajuste-de-agenda="reunion"]'));

    await abrirLaAgenda(p);
    await desmarcar(p);
    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();

    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las cuatro zonas de `ZONAS_DE_LA_PANTALLA`.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cPestanas = await caja(p, LAS_PESTANAS);
    const cContenido = await caja(p, EL_CONTENIDO);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: cPestanas, n: 3 },
        { c: dentro(cContenido, 4), n: 4 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // Las ocho pestañas, en su orden.
    const marcasDePestanas = [];
    const botones = p.locator(`${LAS_PESTANAS} [data-pestana-de-agenda]`);
    const cuantas = await botones.count();
    for (let i = 0; i < cuantas; i += 1) marcasDePestanas.push({ c: await caja(p, botones.nth(i)), n: i + 1, sinRecuadro: true });
    await marcar(p, [{ c: cPestanas }, ...marcasDePestanas]);
    await guardar(p, "pestanas.webp", holgura({ ...cPestanas, y: cPestanas.y - 30, h: cPestanas.h + 40 }, 24, vista));
    await desmarcar(p);

    // Las cifras.
    const cCifras = await caja(p, LAS_CIFRAS);
    await marcar(p, [{ c: cCifras, texto: "Citas por estado", lado: "izquierda" }]);
    await guardar(p, "cifras.webp", holgura({ ...cCifras, x: cCifras.x - 260, w: cCifras.w + 260 }, 24, vista));
    await desmarcar(p);

    // 2. El calendario: Día.
    const cDia = await caja(p, "[data-calendario-de-agenda]");
    const cManana = await caja(p, '[data-columna-del-dia="manana"]');
    const cTarde = await caja(p, '[data-columna-del-dia="tarde"]');
    await marcar(p, [
        { c: await caja(p, p.locator(".fc-agendaToggle-button")), n: 1 },
        { c: await caja(p, p.locator(".fc-today-button")), n: 2 },
        // Sin rótulo para las columnas: ya dicen MAÑANA y TARDE, y debajo no
        // queda pantalla donde ponerlo (el rótulo salía cortado).
    ]);
    await guardar(p, "calendario-dia.webp", holgura(unir(cDia, cManana, cTarde), 16, vista));
    await desmarcar(p);

    // Semana.
    await p.locator(".fc-semanaBtn-button").click();
    await espera(p, 1500);
    await marcar(p, [{ c: await caja(p, p.locator(".fc-semanaBtn-button")), texto: "Semana", lado: "abajo" }]);
    await guardar(p, "calendario-semana.webp", holgura(await caja(p, EL_CONTENIDO), 8, vista));
    await desmarcar(p);
    await p.locator(".fc-agendaToggle-button").click();
    await p.waitForSelector(LISTA_DE.dashboard, { timeout: 15000 });
    await espera(p, 1200);

    // La ficha: Detalles.
    await abrirLaFicha(p);
    const cFicha = await caja(p, LA_FICHA);
    await marcar(p, [
        { c: await caja(p, p.locator(LA_FICHA).getByRole("tab", { name: "Detalles" })), n: 1 },
        { c: await caja(p, p.locator(LA_FICHA).getByRole("tab", { name: "Estado" })), n: 2 },
    ]);
    await guardar(p, "ficha-detalles.webp", holgura(cFicha, 40, vista));
    await desmarcar(p);

    // 3. El estado: el desplegable abierto.
    await p.locator(LA_FICHA).getByRole("tab", { name: "Estado" }).click();
    await espera(p, 600);
    const disparador = p.locator(`${LA_FICHA} [role="combobox"]`).first();
    await disparador.click();
    const lista = p.locator(LA_LISTA_ABIERTA).last();
    await lista.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    const cLista = await caja(p, lista);
    await marcar(p, [
        { c: await caja(p, lista.locator("[data-opcion-reagendar]")), n: 1 },
    ]);
    await guardar(p, "ficha-estado.webp", holgura(unir(await caja(p, LA_FICHA), cLista), 30, vista));
    await desmarcar(p);
    await lista.getByRole("option", { name: "Cancelada", exact: true }).click();
    await espera(p, 400);
    await p.locator(LA_FICHA).getByRole("button", { name: "Actualizar" }).click();
    const alerta = p.locator(LA_ALERTA).filter({ hasText: "Confirmar cancelación" });
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    const cAlerta = await caja(p, alerta);
    await marcar(p, [
        { c: await caja(p, alerta.getByRole("button", { name: "Volver" })), texto: "No cambia nada", lado: "abajo" },
        { c: await caja(p, alerta.getByRole("button", { name: "Sí, cancelar la cita" })), texto: "Cancela y quita sus recordatorios", lado: "abajo" },
    ]);
    await guardar(p, "cancelar.webp", holgura({ ...cAlerta, h: cAlerta.h + 70 }, 30, vista));
    await desmarcar(p);
    await alerta.getByRole("button", { name: "Volver" }).click();
    await espera(p, 500);
    await cerrarLaFicha(p);

    // Reagendar.
    await abrirLaFicha(p);
    await p.locator(LA_FICHA).getByRole("tab", { name: "Estado" }).click();
    await espera(p, 500);
    await p.locator(`${LA_FICHA} [role="combobox"]`).first().click();
    await p.locator(LA_LISTA_ABIERTA).last().locator("[data-opcion-reagendar]").click();
    const reagendar = p.locator("[data-dialogo-reagendar]");
    await reagendar.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    // El día de mañana: así hay huecos que enseñar.
    const manana = await p.evaluate(() => {
        const d = new Date();
        d.setDate(d.getDate() + (d.getDay() === 6 ? 2 : 1));
        return d.toISOString().slice(0, 10);
    });
    await reagendar.locator("[data-selector-fecha]").fill(manana);
    await reagendar.locator("[data-hueco]").first().waitFor({ state: "visible", timeout: 15000 });
    await reagendar.locator("[data-hueco]").nth(2).click();
    await espera(p, 500);
    await marcar(p, [
        { c: await caja(p, reagendar.locator("[data-selector-fecha]")), n: 1, esquina: "derecha" },
        { c: await caja(p, reagendar.locator("[data-hueco]").nth(2)), n: 2 },
        { c: await caja(p, reagendar.locator("[data-confirmar-reagendar]")), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "reagendar.webp", holgura(await caja(p, reagendar), 40, vista));
    await desmarcar(p);
    await cerrarLaFicha(p);

    // 4. Disponibilidad.
    await irA(p, "availability");
    const cLunes = await caja(p, elDia(p, 1));
    const cDomingo = await caja(p, elDia(p, 0));
    await marcar(p, [
        { c: cLunes, texto: "Mañana y tarde", lado: "derecha" },
        { c: cDomingo, texto: "Sin periodos: no disponible", lado: "derecha" },
    ]);
    await guardar(p, "disponibilidad.webp", holgura(unir(cLunes, cDomingo, await caja(p, "[data-enlace-de-reserva]")), 24, vista));
    await desmarcar(p);
    // Los tres mandos de un periodo, sin abrir el desplegable: abierto tapa
    // la fila y los tres números se amontonan en la misma esquina.
    const combos = elDia(p, 1).locator('[role="combobox"]');
    const cAnadir = await caja(p, elDia(p, 1).locator('button[aria-label^="Añadir periodo el"]'));
    await marcar(p, [
        { c: cAnadir, n: 1 },
        { c: await caja(p, combos.nth(0)), n: 2, esquina: "derecha" },
        { c: await caja(p, combos.nth(1)), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "disponibilidad-periodo.webp", holgura({ ...cLunes, y: cLunes.y - 30, h: cLunes.h + 60 }, 24, vista));
    await desmarcar(p);
    const duplicar = elDia(p, 1).locator('button[title="Duplicar periodo"]').first();
    const eliminar = elDia(p, 1).locator('button[title="Eliminar periodo"]').first();
    await marcar(p, [
        { c: await caja(p, duplicar), texto: "Duplicar periodo", lado: "arriba" },
        { c: await caja(p, eliminar), texto: "Eliminar periodo", lado: "abajo" },
    ]);
    await guardar(p, "disponibilidad-mandos.webp", holgura({ ...cLunes, y: cLunes.y - 50, h: cLunes.h + 110 }, 24, vista));
    await desmarcar(p);

    // 5. El enlace público.
    const cEnlace = await caja(p, "[data-enlace-de-reserva]");
    await marcar(p, [
        { c: await caja(p, p.locator("[data-enlace-de-reserva]").getByRole("button", { name: "Ver página citas" })), n: 1 },
        { c: await caja(p, p.locator("[data-enlace-de-reserva]").getByRole("button", { name: "Copiar enlace" })), n: 2 },
    ]);
    await guardar(p, "enlace-botones.webp", holgura({ ...cEnlace, x: cEnlace.x - 300, w: cEnlace.w + 300, h: cEnlace.h + 120 }, 24, vista));
    await desmarcar(p);
    const enlace = await p.locator("[data-enlace-de-reserva]").getAttribute("data-enlace-de-reserva");
    await laPaginaPublica(p, enlace);

    // 6. Kanban.
    await abrirLaAgenda(p);
    await irA(p, "kanban");
    const cBuscar = await caja(p, 'input[aria-label="Buscar cita"]');
    const cEtiquetas = await caja(p, p.locator("button", { hasText: "Primera vez" }).first());
    await marcar(p, [
        { c: cBuscar, n: 1 },
        { c: cEtiquetas, n: 2, esquina: "derecha" },
        { c: await caja(p, laColumna(p, "PENDIENTE")), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "kanban.webp");
    await desmarcar(p);
    const tarjeta = laTarjetaDe(p, "Sofía Martínez");
    const cTarjeta = await caja(p, tarjeta);
    await marcar(
        p,
        [
            { c: cTarjeta, texto: "Arrástrala a otra columna", lado: "derecha" },
            { c: await caja(p, tarjeta.locator("[data-reagendar-tarjeta]")), n: 1, borde: "abajo", esquina: "derecha" },
        ],
        { atenuar: true },
    );
    await guardar(p, "kanban-tarjeta.webp", holgura({ ...cTarjeta, w: cTarjeta.w + 320, y: cTarjeta.y - 40, h: cTarjeta.h + 80 }, 24, vista));
    await desmarcar(p);
    await laColumna(p, "CONFIRMADA").locator("[data-automatizaciones-de-columna]").click();
    const hoja = p.locator(EL_DIALOGO).last();
    await hoja.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 1500);
    await marcar(p, [{ c: await caja(p, hoja), texto: "Lo que pasa al entrar en Confirmada", lado: "izquierda" }]);
    await guardar(p, "kanban-automatizaciones.webp");
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 600);

    // 7. Servicios.
    await irA(p, "services");
    const cBuscarServicio = await caja(p, 'input[aria-label="Buscar servicio"]');
    const cNuevo = await caja(p, "[data-nuevo-servicio]");
    await marcar(p, [
        { c: cBuscarServicio, n: 1 },
        { c: cNuevo, n: 2 },
        { c: await caja(p, elServicio(p, "VALORACIÓN INICIAL")), n: 3 },
    ]);
    await guardar(p, "servicios.webp");
    await desmarcar(p);
    await p.locator("[data-nuevo-servicio]").click();
    const ventanaServicio = p.locator(EL_DIALOGO).last();
    await ventanaServicio.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    const nombre = ventanaServicio.locator("input").first();
    await nombre.fill("ORTODONCIA");
    await ventanaServicio.locator("textarea").first().fill("¡Hola! Tu cita de ortodoncia quedó agendada. Trae tus radiografías.");
    await espera(p, 300);
    await marcar(p, [
        { c: await caja(p, nombre), n: 1, esquina: "derecha" },
        { c: await caja(p, ventanaServicio.locator("textarea").first()), n: 2, esquina: "derecha" },
        { c: await caja(p, ventanaServicio.getByRole("button", { name: "Guardar" })), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "servicio-nuevo.webp", holgura(await caja(p, ventanaServicio), 50, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 500);
    const servicio = elServicio(p, "LIMPIEZA DENTAL");
    const cServicio = await caja(p, servicio);
    await marcar(
        p,
        [
            { c: await caja(p, servicio.locator('button[title="Editar"]')), texto: "Editar", lado: "arriba" },
            { c: await caja(p, servicio.locator('button[title="Eliminar"]')), texto: "Eliminar", lado: "abajo" },
        ],
        { atenuar: true },
    );
    await guardar(p, "servicio-mandos.webp", holgura({ ...cServicio, y: cServicio.y - 50, h: cServicio.h + 110 }, 24, vista));
    await desmarcar(p);

    // 8. Recordatorios.
    await irA(p, "reminders");
    const nuevoRecordatorio = p.locator(`${EL_CONTENIDO} [data-barra-de-acciones] [data-zona="crear"] button`).first();
    await marcar(p, [
        { c: await caja(p, p.locator(`${EL_CONTENIDO} [data-barra-de-acciones] input`).first()), n: 1 },
        { c: await caja(p, nuevoRecordatorio), n: 2, esquina: "derecha" },
        // Solo el texto: el `span` se estira hasta los mandos de la derecha.
        {
            c: await p.getByText("3 horas antes", { exact: true }).first().evaluate((el) => {
                const r = document.createRange();
                r.selectNodeContents(el);
                const b = r.getBoundingClientRect();
                return { x: b.x - 22, y: b.y - 2, w: b.width + 26, h: b.height + 4 };
            }),
            texto: "Cuándo sale",
            lado: "derecha",
        },
    ]);
    await guardar(p, "recordatorios.webp");
    await desmarcar(p);
    await nuevoRecordatorio.click();
    const ventanaRecordatorio = p.locator("[data-ventana-de-recordatorio]");
    await ventanaRecordatorio.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 800);
    await ventanaRecordatorio.getByPlaceholder("Ej: Recordatorio cita").fill("Dos horas antes");
    const mensaje = ventanaRecordatorio.locator("textarea").first();
    await mensaje.fill("Hola {{nombre}}, te esperamos en dos horas. Si no puedes venir, avísanos.");
    await espera(p, 300);
    await marcar(p, [
        { c: await caja(p, ventanaRecordatorio.getByPlaceholder("Ej: Recordatorio cita")), n: 1, esquina: "derecha" },
        { c: await caja(p, mensaje), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "recordatorio-nuevo.webp", holgura(await caja(p, ventanaRecordatorio), 30, vista));
    await desmarcar(p);
    // El bloque entero (rótulo, unidad y número), con 2 horas elegidas.
    const tiempo = ventanaRecordatorio.getByText("Cuánto antes de la cita").locator("xpath=../..");
    await tiempo.scrollIntoViewIfNeeded();
    const unidad = tiempo.getByRole("combobox").first();
    await elegir(p, unidad, "Horas");
    await tiempo.locator('input[type="number"]').fill("2");
    await espera(p, 400);
    await marcar(p, [
        { c: await caja(p, unidad), n: 1, borde: "abajo" },
        { c: await caja(p, tiempo.locator('input[type="number"]')), n: 2, borde: "abajo", esquina: "derecha" },
    ]);
    await guardar(p, "recordatorio-tiempo.webp", holgura(await caja(p, ventanaRecordatorio), 30, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 600);
    if (await ventanaRecordatorio.count()) {
        await ventanaRecordatorio.getByRole("button", { name: /Cancelar|Cerrar/ }).first().click().catch(() => {});
        await espera(p, 500);
    }

    // 9. Formulario y registros.
    await abrirLaAgenda(p);
    await irA(p, "form");
    await marcar(p, [
        { c: await caja(p, p.locator("[data-pregunta-del-formulario]").first()), n: 1 },
        { c: await caja(p, p.locator(`${EL_CONTENIDO} [data-barra-de-acciones] [data-zona="crear"] button`).first()), n: 2 },
    ]);
    await guardar(p, "formulario.webp");
    await desmarcar(p);
    await p.locator(`${EL_CONTENIDO} [data-barra-de-acciones] [data-zona="crear"] button`).first().click();
    const nueva = p.locator(EL_CONTENIDO).locator("div", { hasText: "Nueva pregunta" }).last();
    // Ojo: «Buscar pregunta…» también lleva «pregunta»; el campo de la
    // pregunta nueva se busca por su ejemplo.
    const campoPregunta = p.getByPlaceholder(/Cuántos mensajes/).first();
    await campoPregunta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await campoPregunta.fill("¿Cómo nos conociste?");
    const tipo = p.locator(`${EL_CONTENIDO} [role="combobox"]`).first();
    await elegir(p, tipo, "Selección");
    const opciones = p.getByPlaceholder(/1-10/).first();
    await opciones.fill("Instagram, Un amigo, Google");
    await espera(p, 400);
    const formNueva = p.locator(EL_CONTENIDO).locator(".rounded-xl", { hasText: "Nueva pregunta" }).first();
    const cNueva = await caja(p, formNueva);
    await marcar(p, [
        { c: await caja(p, campoPregunta), n: 1 },
        { c: await caja(p, tipo), n: 2 },
        { c: await caja(p, formNueva.getByRole("switch").first()), n: 3, esquina: "derecha" },
        { c: await caja(p, opciones), n: 4 },
    ]);
    await guardar(p, "pregunta-nueva.webp", holgura(cNueva, 30, vista));
    await desmarcar(p);
    void nueva;

    await abrirLaAgenda(p);
    await irA(p, "registros");
    await marcar(p, [
        { c: await caja(p, LAS_CIFRAS), n: 1 },
        { c: await caja(p, elRegistro(p, 0)), n: 2 },
    ]);
    await guardar(p, "registros.webp");
    await desmarcar(p);
    await elRegistro(p, 0).locator('button[title="Ver detalle"]').click();
    const detalle = p.locator(EL_DIALOGO).last();
    await detalle.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 800);
    await soltarElFoco(p);
    await guardar(p, "registro-detalle.webp", holgura(await caja(p, detalle), 40, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 500);

    // 10. Ajustes.
    await irA(p, "settings");
    const reunion = p.locator('[data-ajuste-de-agenda="reunion"]');
    const cReunion = await caja(p, reunion);
    await marcar(p, [
        { c: await caja(p, reunion.getByText("Duración de la reunión").locator("xpath=..")), n: 1, esquina: "derecha" },
        { c: await caja(p, reunion.locator("#meetingUrl")), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "ajustes-reunion.webp", holgura(cReunion, 24, vista));
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, reunion.getByText("Tiempo mínimo de anticipación").locator("xpath=..")), texto: "El aviso mínimo", lado: "abajo" }], { atenuar: true });
    await guardar(p, "ajustes-anticipacion.webp", holgura(cReunion, 24, vista));
    await desmarcar(p);
    const google = p.locator('[data-ajuste-de-agenda="google-calendar"]');
    const pasos = ["Comparte tu calendario con este correo", "ID de tu calendario", "Sincronización activa"];
    const marcasDeGoogle = [];
    for (const [i, t] of pasos.entries()) marcasDeGoogle.push({ c: await caja(p, google.getByText(t).first()), n: i + 1, esquina: "derecha" });
    await marcar(p, marcasDeGoogle);
    await guardar(p, "ajustes-google-calendar.webp", holgura(await caja(p, google), 24, vista));
    await desmarcar(p);

    await abrirLaAgenda(p);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Contactos", texto: "Agenda está en Contactos" });
}

/**
 * La página PÚBLICA de reserva, en una pestaña sin sesión, como la ve el
 * cliente. Se recorre hasta el último paso y NO se confirma: la cita no se crea.
 */
async function laPaginaPublica(p, enlace) {
    const ctx = await p.context().browser().newContext({
        viewport: { width: 1280, height: 860 },
        deviceScaleFactor: 2,
        locale: "es-CO",
        timezoneId: "America/Bogota",
    });
    // Las banderas del selector de país vienen de fuera: sin red, se tapan.
    // Las banderas vienen de fuera, y aquí no hay salida: se sirve una
    // dibujada (la de Colombia, que es el país del ejemplo).
    const bandera =
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="15" viewBox="0 0 4 3">' +
        '<rect width="4" height="1.5" fill="#FCD116"/><rect y="1.5" width="4" height=".75" fill="#003893"/>' +
        '<rect y="2.25" width="4" height=".75" fill="#CE1126"/></svg>';
    await ctx.route(/flagcdn|flagsapi/, (r) => r.fulfill({ status: 200, contentType: "image/svg+xml", body: bandera }));
    const q = await ctx.newPage();
    try {
        await q.goto(BASE + new URL(enlace, BASE).pathname, { waitUntil: "domcontentloaded" });
        await q.getByText("Selecciona un servicio").first().waitFor({ state: "visible", timeout: 60000 });
        await q.evaluate(() => document.fonts.ready);
        await espera(q, 1200);
        await elegir(q, q.getByRole("combobox").first(), "LIMPIEZA DENTAL");
        await q.getByRole("button", { name: "Continuar" }).click();
        await espera(q, 800);
        const dias = q.locator('button[name="day"]:not([disabled]), [role="gridcell"] button:not([disabled])');
        // Elegir el día ya pasa solo a la hora: no hay «Continuar» que pulsar.
        await dias.nth(1).click();
        await espera(q, 500);
        const hora = q.getByRole("button", { name: /\d\d:\d\d\s?(a|p)\.?\s?m/i });
        await hora.first().waitFor({ state: "visible", timeout: 20000 });
        await hora.nth(1).click();
        await espera(q, 500);
        const vistaQ = q.viewportSize();
        // La página es una columna estrecha en medio: se recorta a ella.
        const laTarjetaPublica = async () =>
            holgura(unir(await caja(q, q.getByText("Agendar con").first()), await caja(q, q.getByRole("button", { name: /Continuar|Confirmar/ }).first())), 56, vistaQ);
        await marcar(q, [
            { c: await caja(q, q.getByText("Hora", { exact: true }).first()), n: 1 },
            { c: await caja(q, hora.nth(1)), n: 2 },
        ]);
        await guardar(q, "reserva-hora.webp", await laTarjetaPublica());
        await desmarcar(q);
        await q.getByRole("button", { name: "Continuar" }).click();
        await espera(q, 800);
        // Formulario: la primera pregunta es de selección.
        if (await q.getByText("Seleccionar...").count()) await elegir(q, q.getByRole("combobox").first(), "Sí");
        const textos = q.locator("input:not([type=hidden]), textarea");
        const n = await textos.count();
        for (let i = 0; i < n; i += 1) {
            const t = textos.nth(i);
            if (await t.isVisible()) await t.fill("La sensibilidad en los dientes");
        }
        await q.getByRole("button", { name: "Continuar" }).click();
        await q.getByPlaceholder("Tu nombre").waitFor({ state: "visible", timeout: 15000 });
        await q.getByPlaceholder("Tu nombre").fill("Laura Méndez");
        const pais = q.getByRole("combobox").filter({ hasText: "Selecciona un indicativo" }).first();
        await pais.click();
        await q.getByPlaceholder("Buscar país o código…").fill("Colombia");
        await espera(q, 300);
        await q.keyboard.press("Enter");
        await espera(q, 400);
        await q.getByLabel("Número de WhatsApp").fill("3001234567");
        await espera(q, 500);
        const confirmar = q.getByRole("button", { name: "Confirmar" });
        await marcar(q, [
            { c: await caja(q, q.getByPlaceholder("Tu nombre")), n: 1 },
            { c: await caja(q, q.getByRole("combobox").filter({ hasText: "Colombia" }).first()), n: 2 },
            { c: await caja(q, q.getByLabel("Número de WhatsApp")), n: 3 },
            { c: await caja(q, confirmar), n: 4, esquina: "derecha" },
        ]);
        await guardar(q, "reserva-datos.webp", await laTarjetaPublica());
        await desmarcar(q);
        void vistaQ;
    } finally {
        await ctx.close();
    }
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

    await abrirLaAgenda(p);
    await p.mouse.move(640, 400, { steps: 8 });
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("las citas de tus clientes", 300);
    await mover(p, laCita(p, LA_CITA));
    await alDecir("en qué horarios atiendes", 200);
    await mover(p, laPestana(p, "availability"));
    await alDecir("compartes un enlace", 200);
    await mover(p, laPestana(p, "dashboard"));

    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const contactos = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Contactos" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Contactos", 600);
    await mover(p, contactos);

    const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // El calendario: Día y Semana.
    await decir("calendario");
    await alDecir("el día de hoy", 200);
    await mover(p, p.locator('[data-columna-del-dia="manana"]'));
    await alDecir("con Semana");
    await pulsar(p, p.locator(".fc-semanaBtn-button"));
    await alDecir("cada color", 300);
    await mover(p, p.locator(".fc-event").first());

    // La ficha y el estado.
    await decir("estado");
    await pulsar(p, p.locator(".fc-agendaToggle-button"));
    await laCita(p, LA_CITA).waitFor({ state: "visible", timeout: 15000 });
    await alDecir("Al pulsar una cita", 100);
    await pulsar(p, laCita(p, LA_CITA));
    const ficha = p.locator(LA_FICHA);
    await ficha.waitFor({ state: "visible", timeout: 15000 });
    await alDecir("en Estado");
    await pulsar(p, ficha.getByRole("tab", { name: "Estado" }));
    await pulsar(p, ficha.locator('[role="combobox"]').first());
    const estados = p.locator(LA_LISTA_ABIERTA).last();
    await estados.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("la pasas a Confirmada", 200);
    await pulsar(p, estados.getByRole("option", { name: "Confirmada", exact: true }));
    await alDecir("también puedes reagendarla", 100);
    await pulsar(p, ficha.locator('[role="combobox"]').first());
    await estados.waitFor({ state: "visible", timeout: 10000 });
    await mover(p, estados.locator("[data-opcion-reagendar]"));
    await p.keyboard.press("Escape");
    await espera(p, 300);
    await pulsar(p, ficha.getByRole("button", { name: "Actualizar" }));
    await ficha.waitFor({ state: "hidden", timeout: 10000 });

    // Disponibilidad y el enlace.
    await decir("disponibilidad");
    await pulsar(p, laPestana(p, "availability"));
    await elDia(p, 1).waitFor({ state: "visible", timeout: 30000 });
    await alDecir("cada día", 200);
    await mover(p, elDia(p, 1));
    await alDecir("uno o varios periodos", 200);
    await mover(p, elDia(p, 1).locator('button[title="Duplicar periodo"]').first());

    await decir("enlace");
    await alDecir("Copiar enlace", 100);
    await mover(p, p.locator("[data-enlace-de-reserva]").getByRole("button", { name: "Copiar enlace" }));
    await alDecir("tu cliente elige", 300);
    await mover(p, p.locator("[data-enlace-de-reserva]").getByRole("button", { name: "Ver página citas" }));

    // Kanban: se arrastra una tarjeta.
    await decir("kanban");
    await pulsar(p, laPestana(p, "kanban"));
    await laTarjetaDe(p, "Sofía Martínez").waitFor({ state: "visible", timeout: 30000 });
    await alDecir("columnas por estado", 200);
    await mover(p, laColumna(p, "PENDIENTE"));
    await alDecir("la arrastras", 100);
    await arrastrar(p, laTarjetaDe(p, "Sofía Martínez"), laColumna(p, "CONFIRMADA"));

    // Servicios.
    await decir("servicios");
    await pulsar(p, laPestana(p, "services"));
    await elServicio(p, "VALORACIÓN INICIAL").waitFor({ state: "visible", timeout: 30000 });
    await alDecir("lo que ofreces", 200);
    await mover(p, elServicio(p, "VALORACIÓN INICIAL"));
    await alDecir("con el mensaje", 200);
    await mover(p, elServicio(p, "LIMPIEZA DENTAL"));

    // Recordatorios.
    await decir("recordatorios");
    await pulsar(p, laPestana(p, "reminders"));
    await p.locator(EL_CONTENIDO).getByText("Un día antes").first().waitFor({ state: "visible", timeout: 30000 });
    await alDecir("un día antes", 100);
    await mover(p, p.locator(EL_CONTENIDO).getByText("Un día antes").first());

    // Formulario y registros.
    await decir("formulario");
    await pulsar(p, laPestana(p, "form"));
    await p.locator("[data-pregunta-del-formulario]").first().waitFor({ state: "visible", timeout: 30000 });
    await alDecir("las preguntas", 200);
    await mover(p, p.locator("[data-pregunta-del-formulario]").first());
    await alDecir("en Registros");
    await pulsar(p, laPestana(p, "registros"));
    await elRegistro(p, 0).waitFor({ state: "visible", timeout: 30000 });
    await alDecir("lo que contestó", 200);
    await mover(p, elRegistro(p, 0));

    // Ajustes.
    await decir("ajustes");
    await pulsar(p, laPestana(p, "settings"));
    await p.locator('[data-ajuste-de-agenda="reunion"]').waitFor({ state: "visible", timeout: 30000 });
    await alDecir("cuánto dura cada cita", 100);
    await mover(p, p.locator('[data-ajuste-de-agenda="reunion"]').getByText("Duración de la reunión").first());
    await alDecir("tu enlace de reunión", 100);
    await mover(p, p.locator("#meetingUrl"));
    await alDecir("conectas tu Google Calendar", 100);
    await mover(p, p.locator('[data-ajuste-de-agenda="google-calendar"]'));
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
    escribirLaVozDelVideo("agenda", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
    console.log("  ✓ demostracion.webm", Math.round(statSync(destino).size / 1024), "KB,", colocados.length, "frases narradas");
}

/** Arrastra con el ratón, como una persona: dnd-kit no arranca hasta que se mueve unos píxeles. */
async function arrastrar(p, que, destino) {
    const a = await que.boundingBox();
    const d = await destino.boundingBox();
    if (!a || !d) throw new Error("[guia] no se ve lo que hay que arrastrar");
    await p.mouse.move(a.x + a.width / 2, a.y + 20, { steps: 18 });
    await p.mouse.down();
    await p.mouse.move(a.x + a.width / 2 + 8, a.y + 24, { steps: 4 });
    await p.mouse.move(d.x + d.width / 2, d.y + 140, { steps: 30 });
    await espera(p, 350);
    await p.mouse.up();
    await espera(p, 800);
}

/* ------------------------------------------------------------------ */

// Los campos de fecha los pinta el proceso de Chromium con SU idioma: hacen
// falta `--lang` y `LANG` (la regla de la guía de Finanzas).
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
    await abrirLaAgenda(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-agenda.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/agenda`);
