/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Multiagenda, sobre
 * la App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-multiagenda.mjs`).
 *
 * La MISMA receta que las demás guías (`capturar-guia-agenda.mjs`) y con las
 * MISMAS piezas del taller (`taller-de-la-guia.mjs`): cada captura es «abre
 * esto, pulsa aquello, resalta este elemento», y las marcas se localizan por
 * lo que la pantalla expone —los `data-*` de las pestañas, de las citas, de
 * las columnas, de los especialistas—, no por coordenadas.
 *
 * Nada de lo que se hace aquí borra, cancela ni reserva: la cancelación se
 * cierra con «Volver», los diálogos de crear se cancelan y en la página
 * pública NUNCA se pulsa «Confirmar cita». El vídeo sí pasa una cita a
 * Confirmada y arrastra otra: por eso antes del vídeo se vuelve a sembrar.
 *
 * Qué captura hace falta lo dice `lib/guia-multiagenda.ts`: el script se niega
 * a terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-multiagenda.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-multiagenda.mjs";
import { guardarWav, loQueSeCorta, mezclar, montarLaPista, tramosSinLosCortes } from "./voz-de-la-guia.mjs";
import {
    LA_BARRA_DE_ARRIBA,
    caja,
    cerrarLoAbierto,
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
    tomarUnaMiniatura,
    unir,
} from "./taller-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "multiagenda");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-multiagenda";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-multiagenda.json");
const MENU = path.join(RAIZ, "scripts", "menu-guia-multiagenda.json");

/** La cita que se abre en la guía: la de hoy a las 10 (`sembrar-guia-multiagenda.mjs`). */
const LA_CITA = "Mariana Toro";
/** La tarjeta que se arrastra en el Kanban (Pendiente, mañana a las 9). */
const LA_TARJETA = "Sofía Martínez";
/** El servicio y el especialista que se reservan en la página pública. */
const EL_SERVICIO_PUBLICO = "LIMPIEZA DENTAL";
const EL_ESPECIALISTA_PUBLICO = "Dra. Laura Méndez";

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Abrir                                                               */
/* ------------------------------------------------------------------ */

const LA_VISTA = "[data-schedule-view]";
const LAS_PESTANAS = "[data-pestanas-de-multiagenda]";
const LAS_CIFRAS = `${LA_VISTA} > div:first-child > :last-child`;
const EL_CONTENIDO = "[data-contenido-de-multiagenda]";
const laPestana = (p, v) => p.locator(`[data-pestana-de-multiagenda="${v}"]`);

/** Lo que tiene que haber pintado cada pestaña para darla por cargada. */
const LISTA_DE = {
    dashboard: "[data-columna-del-dia] [data-cita]",
    kanban: "[data-tarjeta-de-cita]",
    members: "[data-especialista]",
    services: "[data-servicio]",
    reminders: "[data-recordatorio]",
    form: "[data-pregunta-del-formulario]",
    settings: "[data-enlace-publico]",
};

async function abrirMultiagenda(p) {
    await p.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(LISTA_DE.dashboard, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
    await quitarAvisos(p);
}

async function irA(p, v) {
    await laPestana(p, v).click();
    await p.locator(LISTA_DE[v]).first().waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1200);
    await quitarAvisos(p);
}

const LA_LISTA_ABIERTA = '[role="listbox"]';
const LA_ALERTA = '[role="alertdialog"]';

const laCita = (p, nombre) => p.locator("[data-columna-del-dia] [data-cita]", { hasText: nombre }).first();
const LA_FICHA = "[data-ficha-de-la-cita]";

async function abrirLaFicha(p, nombre = LA_CITA) {
    await laCita(p, nombre).click();
    await p.locator(LA_FICHA).waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 700);
}

async function cerrarLaFicha(p) {
    for (let i = 0; i < 3 && (await p.locator(`${LA_FICHA}, [role="dialog"], ${LA_ALERTA}`).count()); i += 1) {
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

/** Lo que va a fotografiarse, centrado en la ventana. */
async function aLaVista(p, loc) {
    await loc.first().evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 500);
}

const laColumna = (p, estado) => p.locator(`[data-columna-de-estado="${estado}"]`);
const laTarjetaDe = (p, nombre) => p.locator("[data-tarjeta-de-cita]", { hasText: nombre }).first();
const elEspecialista = (p, nombre) => p.locator("[data-especialista]", { hasText: nombre }).first();
const elServicio = (p, nombre) => p.locator("[data-servicio]", { hasText: nombre }).first();
const elBloqueDe = (esp, bloque) => esp.locator(`[data-bloque-del-especialista="${bloque}"]`);

/** El próximo día de lunes a viernes después de hoy (`yyyy-MM-dd`), en la zona de la página. */
const elProximoDiaHabil = (p) =>
    p.evaluate(() => {
        const d = new Date();
        do d.setDate(d.getDate() + 1);
        while (d.getDay() === 0 || d.getDay() === 6);
        const dos = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
    });

async function abrirElEspecialista(p, nombre = EL_ESPECIALISTA_PUBLICO) {
    const esp = elEspecialista(p, nombre);
    if ((await esp.locator("[data-abrir-especialista]").getAttribute("aria-expanded")) !== "true") {
        await esp.locator("[data-abrir-especialista]").click();
    }
    await elBloqueDe(esp, "servicios").waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 600);
    return esp;
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

    await mini("vista-general", () => caja(p, LAS_PESTANAS));
    await mini("calendario", async () =>
        unir(await caja(p, '[data-columna-del-dia="manana"]'), await caja(p, '[data-columna-del-dia="tarde"]')),
    );
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
    await irA(p, "kanban");
    await mini("kanban", async () => unir(await caja(p, laColumna(p, "PENDIENTE")), await caja(p, laColumna(p, "CONFIRMADA"))));
    await irA(p, "members");
    await mini("especialistas", async () => {
        const cajas = [];
        for (let i = 0; i < 3; i += 1) cajas.push(await caja(p, p.locator("[data-especialista]").nth(i)));
        return unir(...cajas);
    });
    await irA(p, "services");
    await mini("servicios", async () => {
        const cajas = [];
        for (let i = 0; i < 3; i += 1) cajas.push(await caja(p, p.locator("[data-servicio]").nth(i)));
        return unir(...cajas);
    });
    await irA(p, "reminders");
    await mini("recordatorios", () => caja(p, p.locator("[data-recordatorios-del-servicio]").first()));
    await irA(p, "form");
    await mini("formulario", () => caja(p, p.locator("[data-formulario-del-servicio]").first()));
    await irA(p, "settings");
    await mini("ajustes", () => caja(p, '[data-tarjeta-de-ajustes="enlace"]'));
    const enlace = await p.locator("[data-enlace-publico]").inputValue();

    // La de la página pública se toma en la página pública.
    const ctx = await contextoPublico(p.context().browser());
    try {
        const q = await ctx.newPage();
        await abrirLaPaginaPublica(q, enlace);
        Object.assign(
            focos,
            await tomarUnaMiniatura(q, "pagina-publica", await caja(q, "[data-paso-publico]"), { salida: SALIDA, tomadas }),
        );
    } finally {
        await ctx.close();
    }

    await abrirMultiagenda(p);
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

    // Las siete pestañas, en su orden.
    const marcasDePestanas = [];
    const botones = p.locator(`${LAS_PESTANAS} [data-pestana-de-multiagenda]`);
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
    const cDia = await caja(p, "[data-calendario-de-multiagenda]");
    const cManana = await caja(p, '[data-columna-del-dia="manana"]');
    const cTarde = await caja(p, '[data-columna-del-dia="tarde"]');
    await marcar(p, [
        { c: await caja(p, p.locator(".fc-agendaToggle-button")), n: 1 },
        { c: await caja(p, p.locator(".fc-today-button")), n: 2 },
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

    // 3. El estado: el desplegable abierto, con Reagendar al final.
    await p.locator(LA_FICHA).getByRole("tab", { name: "Estado" }).click();
    await espera(p, 600);
    await p.locator(`${LA_FICHA} [role="combobox"]`).first().click();
    const lista = p.locator(LA_LISTA_ABIERTA).last();
    await lista.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    const cLista = await caja(p, lista);
    await marcar(p, [{ c: await caja(p, lista.locator("[data-opcion-reagendar]")), n: 1 }]);
    await guardar(p, "ficha-estado.webp", holgura(unir(await caja(p, LA_FICHA), cLista), 30, vista));
    await desmarcar(p);

    // Cancelar: se pide, y se cierra con «Volver». No se cancela nada.
    await lista.getByRole("option", { name: "Cancelada", exact: true }).click();
    await espera(p, 400);
    await p.locator(LA_FICHA).getByRole("button", { name: "Actualizar" }).click();
    const alerta = p.locator(LA_ALERTA).filter({ hasText: "Confirmar cancelación" });
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    const cAlerta = await caja(p, alerta);
    await marcar(p, [
        { c: await caja(p, alerta.getByRole("button", { name: "Volver" })), texto: "No cambia nada", lado: "abajo" },
        { c: await caja(p, alerta.locator("[data-confirmar-cancelacion]")), texto: "Cancela y quita sus recordatorios", lado: "abajo" },
    ]);
    await guardar(p, "cancelar.webp", holgura({ ...cAlerta, h: cAlerta.h + 70 }, 30, vista));
    await desmarcar(p);
    await alerta.getByRole("button", { name: "Volver" }).click();
    await espera(p, 500);
    await cerrarLaFicha(p);

    // Reagendar: se elige el hueco y NO se confirma.
    await abrirLaFicha(p);
    await p.locator(LA_FICHA).getByRole("tab", { name: "Estado" }).click();
    await espera(p, 500);
    await p.locator(`${LA_FICHA} [role="combobox"]`).first().click();
    await p.locator(LA_LISTA_ABIERTA).last().locator("[data-opcion-reagendar]").click();
    const reagendar = p.locator("[data-dialogo-reagendar]");
    await reagendar.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await reagendar.locator("[data-selector-fecha]").fill(await elProximoDiaHabil(p));
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

    // 4. Kanban.
    await abrirMultiagenda(p);
    await irA(p, "kanban");
    const barra = p.locator("[data-barra-del-kanban]");
    await marcar(p, [
        { c: await caja(p, barra.locator('[data-zona="buscador"]')), n: 1 },
        { c: await caja(p, barra.locator('[data-zona="servicios"]')), n: 2 },
        { c: await caja(p, barra.locator('[data-zona="estados"]')), n: 3, esquina: "derecha" },
        { c: await caja(p, laColumna(p, "PENDIENTE")), n: 4, esquina: "derecha" },
    ]);
    await guardar(p, "kanban.webp");
    await desmarcar(p);
    const tarjeta = laTarjetaDe(p, LA_TARJETA);
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
    await laColumna(p, "CONFIRMADA").locator("[data-automatizaciones-de-la-columna]").click();
    const hoja = p.locator("[data-panel-de-automatizaciones]");
    await hoja.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 1500);
    await soltarElFoco(p);
    await marcar(p, [{ c: await caja(p, hoja), texto: "Lo que pasa al entrar en Confirmada", lado: "izquierda" }]);
    await guardar(p, "kanban-automatizaciones.webp");
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 600);

    // 5. Especialistas.
    await irA(p, "members");
    const laura = elEspecialista(p, EL_ESPECIALISTA_PUBLICO);
    await marcar(p, [
        { c: await caja(p, "[data-cuantos-especialistas]"), n: 1 },
        { c: await caja(p, "[data-nuevo-especialista]"), n: 2, esquina: "derecha" },
        { c: await caja(p, laura.locator("[data-dias-que-atiende]")), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "especialistas.webp", holgura(await caja(p, `${EL_CONTENIDO}`), 8, vista));
    await desmarcar(p);

    await abrirElEspecialista(p);
    const servicios = elBloqueDe(laura, "servicios");
    await aLaVista(p, servicios);
    const marcado = servicios.locator("button", { hasText: "✓" }).first();
    await marcar(p, [
        { c: await caja(p, marcado), texto: "Lo atiende", lado: "abajo" },
        { c: await caja(p, servicios.locator("button", { hasText: "+" }).first()), texto: "No lo atiende", lado: "abajo" },
    ]);
    const cServicios = await caja(p, servicios);
    await guardar(p, "especialista-servicios.webp", holgura({ ...cServicios, y: cServicios.y - 70, h: cServicios.h + 140 }, 24, vista));
    await desmarcar(p);

    const disponibilidad = elBloqueDe(laura, "disponibilidad");
    const lunes = disponibilidad.locator('[data-dia-de-la-semana="1"]');
    await aLaVista(p, lunes);
    const domingo = disponibilidad.locator('[data-dia-de-la-semana="0"]');
    await marcar(p, [
        { c: await caja(p, lunes.locator('button[title="Añadir franja"]')), n: 1 },
        { c: await caja(p, lunes.locator('button[title="Duplicar franja"]').first()), n: 2, esquina: "derecha" },
        { c: await caja(p, lunes.locator('button[title="Eliminar franja"]').first()), n: 3, esquina: "derecha" },
    ]);
    const cDispo = unir(await caja(p, disponibilidad.locator("p").first()), await caja(p, lunes));
    await guardar(p, "especialista-disponibilidad.webp", holgura({ ...cDispo, h: cDispo.h + 260 }, 24, vista));
    await desmarcar(p);
    void domingo;

    const config = elBloqueDe(laura, "configuracion");
    await aLaVista(p, config);
    const campos = ["Duración de la reunión", "Enlace de reunión virtual", "Tiempo mínimo de anticipación"];
    const marcasConfig = [];
    for (const [i, t] of campos.entries()) marcasConfig.push({ c: await caja(p, config.getByText(t, { exact: true }).first()), n: i + 1, esquina: "derecha" });
    await marcar(p, marcasConfig);
    await guardar(p, "especialista-configuracion.webp", holgura(await caja(p, config), 24, vista));
    await desmarcar(p);

    // 6. Servicios.
    await abrirMultiagenda(p);
    await irA(p, "services");
    const valoracion = elServicio(p, "VALORACIÓN INICIAL");
    await marcar(p, [
        { c: await caja(p, "[data-cuantos-servicios]"), n: 1 },
        { c: await caja(p, "[data-nuevo-servicio]"), n: 2, esquina: "derecha" },
        { c: await caja(p, valoracion.locator("[data-abrir-servicio]")), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "servicios.webp", holgura(await caja(p, EL_CONTENIDO), 8, vista));
    await desmarcar(p);

    await p.locator("[data-nuevo-servicio]").click();
    const ventanaServicio = p.locator("[data-dialogo-de-servicio]");
    await ventanaServicio.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    const nombre = ventanaServicio.getByPlaceholder("Ej: Consulta médica");
    await nombre.fill("CONTROL DE RESINAS");
    const duracion = ventanaServicio.locator('input[type="number"]').first();
    await duracion.fill("40");
    const descripcion = ventanaServicio.getByPlaceholder("Breve descripción para el cliente");
    await descripcion.fill("Revisión de resinas y retoques");
    const mensaje = ventanaServicio.locator("textarea").last();
    await mensaje.fill("Tu @service_name quedó agendado para el @appointment_datetime. ¡Te esperamos!");
    await espera(p, 300);
    await soltarElFoco(p);
    await marcar(p, [
        { c: await caja(p, nombre), n: 1, esquina: "derecha" },
        { c: await caja(p, duracion), n: 2, esquina: "derecha" },
        { c: await caja(p, ventanaServicio.locator('input[type="color"]')), n: 3, esquina: "derecha" },
        { c: await caja(p, descripcion), n: 4, esquina: "derecha" },
        { c: await caja(p, mensaje), n: 5, esquina: "derecha" },
    ]);
    await guardar(p, "servicio-nuevo.webp", holgura(await caja(p, ventanaServicio), 40, vista));
    await desmarcar(p);
    await ventanaServicio.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 500);

    const limpieza = elServicio(p, "LIMPIEZA DENTAL");
    const cLimpieza = await caja(p, limpieza);
    await marcar(
        p,
        [
            { c: await caja(p, limpieza.locator('button[title="Editar servicio"]')), texto: "Editar", lado: "arriba" },
            { c: await caja(p, limpieza.locator('button[title="Eliminar servicio"]')), texto: "Eliminar", lado: "abajo" },
        ],
        { atenuar: true },
    );
    await guardar(p, "servicio-mandos.webp", holgura({ ...cLimpieza, y: cLimpieza.y - 50, h: cLimpieza.h + 110 }, 24, vista));
    await desmarcar(p);

    // 7. Recordatorios por servicio.
    await irA(p, "reminders");
    const bloque = p.locator("[data-recordatorios-del-servicio]").first();
    await marcar(p, [
        { c: await caja(p, "[data-buscador-de-recordatorios]"), n: 1 },
        { c: await caja(p, bloque.locator("[data-nuevo-recordatorio]")), n: 2, esquina: "derecha" },
        { c: await caja(p, bloque.locator("[data-recordatorio]").first()), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "recordatorios.webp", holgura(await caja(p, EL_CONTENIDO), 8, vista));
    await desmarcar(p);

    await bloque.locator("[data-nuevo-recordatorio]").click();
    const ventanaRecordatorio = p.locator("[data-dialogo-de-recordatorio]");
    await ventanaRecordatorio.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 800);
    const titulo = ventanaRecordatorio.getByPlaceholder("Ej: Recordatorio cita");
    await titulo.fill("Una hora antes");
    const texto = ventanaRecordatorio.getByPlaceholder(/te recordamos que/);
    await texto.fill("Hola @client_name, tu cita es en una hora. ¡Te esperamos!");
    await espera(p, 300);
    await soltarElFoco(p);
    await marcar(p, [
        { c: await caja(p, titulo), n: 1, esquina: "derecha" },
        { c: await caja(p, texto), n: 2, esquina: "derecha" },
        { c: await caja(p, ventanaRecordatorio.locator("[data-archivo-del-recordatorio]")), n: 3 },
    ]);
    await guardar(p, "recordatorio-nuevo.webp", holgura(await caja(p, ventanaRecordatorio), 30, vista));
    await desmarcar(p);
    const tiempo = ventanaRecordatorio.getByText("Cuánto antes de la cita").locator("xpath=../..");
    await aLaVista(p, tiempo);
    const unidad = tiempo.getByRole("combobox").first();
    await elegir(p, unidad, "Horas");
    await tiempo.locator('input[type="number"]').fill("1");
    await espera(p, 400);
    await soltarElFoco(p);
    await marcar(p, [
        { c: await caja(p, unidad), n: 1, borde: "abajo" },
        { c: await caja(p, tiempo.locator('input[type="number"]')), n: 2, borde: "abajo", esquina: "derecha" },
    ]);
    await guardar(p, "recordatorio-tiempo.webp", holgura(await caja(p, ventanaRecordatorio), 30, vista));
    await desmarcar(p);
    await ventanaRecordatorio.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 600);

    // 8. Formulario por servicio.
    await abrirMultiagenda(p);
    await irA(p, "form");
    const elFormulario = p.locator("[data-formulario-del-servicio]").first();
    const crear = elFormulario.locator('[data-zona="crear"] button').first();
    await marcar(p, [
        { c: await caja(p, p.getByPlaceholder("Buscar servicios...")), n: 1 },
        { c: await caja(p, elFormulario.locator("[data-pregunta-del-formulario]").first()), n: 2 },
        { c: await caja(p, crear), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "formulario.webp", holgura(await caja(p, EL_CONTENIDO), 8, vista));
    await desmarcar(p);

    const preguntas = elFormulario.locator("[data-pregunta-del-formulario]");
    const cPreguntas = unir(await caja(p, preguntas.first()), await caja(p, preguntas.last()));
    await marcar(p, [
        { c: await caja(p, preguntas.first().getByRole("switch").first()), texto: "Encendida o apagada", lado: "izquierda" },
    ]);
    await guardar(p, "formulario-preguntas.webp", holgura({ ...cPreguntas, x: cPreguntas.x - 240, w: cPreguntas.w + 240 }, 24, vista));
    await desmarcar(p);

    await crear.click();
    const campoPregunta = p.getByPlaceholder(/Cuántos mensajes/).first();
    await campoPregunta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await campoPregunta.fill("¿Cómo nos conociste?");
    const nueva = p.locator(EL_CONTENIDO).locator(".rounded-xl", { hasText: "Nueva pregunta" }).first();
    const tipo = nueva.getByRole("combobox").first();
    await elegir(p, tipo, "Selección");
    const opciones = p.getByPlaceholder(/1-10/).first();
    await opciones.fill("Instagram, Un amigo, Google");
    await espera(p, 400);
    await soltarElFoco(p);
    await marcar(p, [
        { c: await caja(p, campoPregunta), n: 1 },
        { c: await caja(p, tipo), n: 2 },
        { c: await caja(p, nueva.getByRole("switch").first()), n: 3, esquina: "derecha" },
        { c: await caja(p, opciones), n: 4 },
    ]);
    await guardar(p, "pregunta-nueva.webp", holgura(await caja(p, nueva), 30, vista));
    await desmarcar(p);

    // 9. Ajustes.
    await abrirMultiagenda(p);
    await irA(p, "settings");
    const tarjetaEnlace = p.locator('[data-tarjeta-de-ajustes="enlace"]');
    await marcar(p, [
        { c: await caja(p, "[data-copiar-enlace]"), n: 1 },
        { c: await caja(p, "[data-abrir-enlace]"), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "ajustes-enlace.webp", holgura(await caja(p, tarjetaEnlace), 24, vista));
    await desmarcar(p);
    const tarjetaAnticipacion = p.locator('[data-tarjeta-de-ajustes="anticipacion"]');
    await marcar(p, [
        { c: await caja(p, tarjetaAnticipacion.getByRole("combobox").first()), n: 1 },
        { c: await caja(p, tarjetaAnticipacion.locator('input[type="number"]').first()), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "ajustes-anticipacion.webp", holgura(await caja(p, tarjetaAnticipacion), 24, vista));
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, tarjetaAnticipacion), texto: "Para todo el equipo", lado: "derecha" }]);
    await guardar(p, "ajustes.webp", holgura(await caja(p, EL_CONTENIDO), 8, vista));
    await desmarcar(p);
    const enlace = await p.locator("[data-enlace-publico]").inputValue();

    // 10. La página pública, como la ve el cliente.
    await laPaginaPublica(p.context().browser(), enlace);

    await abrirMultiagenda(p);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Integraciones", texto: "Multiagenda está en Integraciones" });
}

/* ------------------------------------------------------------------ */
/* La página pública                                                   */
/* ------------------------------------------------------------------ */

/** Las banderas del selector de país vienen de fuera: se sirve una dibujada. */
const BANDERA =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="15" viewBox="0 0 4 3">' +
    '<rect width="4" height="1.5" fill="#FCD116"/><rect y="1.5" width="4" height=".75" fill="#003893"/>' +
    '<rect y="2.25" width="4" height=".75" fill="#CE1126"/></svg>';

async function contextoPublico(navegador, opciones = {}) {
    const ctx = await navegador.newContext({
        viewport: { width: 1280, height: 860 },
        deviceScaleFactor: 2,
        locale: "es-CO",
        timezoneId: "America/Bogota",
        ...opciones,
    });
    await conElDominioDeLaGuia(ctx, BASE);
    await ctx.route(/flagcdn|flagsapi/, (r) => r.fulfill({ status: 200, contentType: "image/svg+xml", body: BANDERA }));
    return ctx;
}

async function abrirLaPaginaPublica(q, enlace) {
    await q.goto(BASE + new URL(enlace, BASE).pathname, { waitUntil: "domcontentloaded" });
    await q.locator("[data-servicio-publico]").first().waitFor({ state: "visible", timeout: 60000 });
    await q.evaluate(() => document.fonts.ready);
    await espera(q, 1200);
}

/** El día hábil de mañana en adelante, en el calendario de la página pública. */
async function elDiaPublico(q) {
    const ymd = await elProximoDiaHabil(q);
    const dia = String(Number(ymd.slice(8, 10)));
    return q
        .locator('[data-paso-publico="fecha"] button[name="day"]:not([disabled])')
        .filter({ hasText: new RegExp(`^${dia}$`) })
        .filter({ hasNot: q.locator(".opacity-50") })
        .first();
}

async function laPaginaPublica(navegador, enlace) {
    const ctx = await contextoPublico(navegador);
    const q = await ctx.newPage();
    try {
        await abrirLaPaginaPublica(q, enlace);
        const vistaQ = q.viewportSize();
        // La página es una columna estrecha en medio: se recorta a ella.
        const laTarjeta = async () =>
            holgura(unir(await caja(q, "[data-encabezado-de-la-reserva]"), await caja(q, "[data-paso-publico]")), 40, vistaQ);

        // Servicio.
        await marcar(q, [
            { c: await caja(q, "[data-pasos-de-la-reserva]"), n: 1 },
            { c: await caja(q, q.locator("[data-servicio-publico]", { hasText: EL_SERVICIO_PUBLICO })), n: 2, esquina: "derecha" },
        ]);
        await guardar(q, "reserva-servicio.webp", await laTarjeta());
        await desmarcar(q);
        await q.locator("[data-servicio-publico]", { hasText: EL_SERVICIO_PUBLICO }).click();

        // Especialista.
        await q.locator("[data-especialista-publico]").first().waitFor({ state: "visible", timeout: 15000 });
        await espera(q, 600);
        const laura = q.locator("[data-especialista-publico]", { hasText: EL_ESPECIALISTA_PUBLICO });
        await marcar(q, [{ c: await caja(q, laura), n: 1, esquina: "derecha" }]);
        await guardar(q, "reserva-especialista.webp", await laTarjeta());
        await desmarcar(q);
        await laura.click();

        // Fecha y hora: elegir el día ya pasa solo a la hora.
        await q.locator('[data-paso-publico="fecha"]').waitFor({ state: "visible", timeout: 15000 });
        await espera(q, 500);
        await (await elDiaPublico(q)).click();
        const horas = q.locator("[data-hora-publica]");
        await horas.first().waitFor({ state: "visible", timeout: 20000 });
        await horas.nth(1).click();
        await espera(q, 500);
        await marcar(q, [
            { c: await caja(q, q.locator("[data-franja-publica]").first()), n: 1 },
            { c: await caja(q, horas.nth(1)), n: 2, esquina: "derecha" },
            { c: await caja(q, "[data-continuar-publico]"), n: 3, esquina: "derecha" },
        ]);
        await guardar(q, "reserva-hora.webp", await laTarjeta());
        await desmarcar(q);
        await q.locator("[data-continuar-publico]").click();

        // Formulario del servicio.
        await q.locator('[data-paso-publico="formulario"]').waitFor({ state: "visible", timeout: 15000 });
        await espera(q, 500);
        await elegir(q, q.locator('[data-paso-publico="formulario"] [role="combobox"]').first(), "Hace más de 6 meses");
        await q.locator('[data-paso-publico="formulario"]').getByRole("button", { name: /Continuar/ }).click();

        // Sus datos. NUNCA se pulsa «Confirmar cita».
        await q.getByPlaceholder("Tu nombre").waitFor({ state: "visible", timeout: 15000 });
        await q.getByPlaceholder("Tu nombre").fill("Laura Gómez");
        const pais = q.getByRole("combobox").filter({ hasText: "Selecciona un indicativo" }).first();
        if (await pais.count()) {
            await pais.click();
            await q.getByPlaceholder("Buscar país o código…").fill("Colombia");
            await espera(q, 300);
            await q.keyboard.press("Enter");
            await espera(q, 400);
        }
        await q.getByPlaceholder("Número").fill("3001234567");
        await espera(q, 500);
        await soltarElFoco(q);
        await marcar(q, [
            { c: await caja(q, q.getByPlaceholder("Tu nombre")), n: 1, esquina: "derecha" },
            { c: await caja(q, q.locator('[data-paso-publico="datos"] [role="combobox"]').first()), n: 2, esquina: "derecha" },
            { c: await caja(q, q.getByPlaceholder("Número")), n: 3, esquina: "derecha" },
            { c: await caja(q, "[data-confirmar-cita]"), n: 4, esquina: "derecha" },
        ]);
        await guardar(q, "reserva-datos.webp", await laTarjeta());
        await desmarcar(q);
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
    await conElDominioDeLaGuia(ctx, BASE);
    await ctx.route(/flagcdn|flagsapi/, (r) => r.fulfill({ status: 200, contentType: "image/svg+xml", body: BANDERA }));
    await ctx.addInitScript(CURSOR);
    const p = await ctx.newPage();
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, sinGrabarLaEspera, tramos, cortes } = empezarLaNarracion(p, voz, t0, {
        respiro: RESPIRO_ENTRE_FRASES_MS,
    });

    await abrirMultiagenda(p);
    await p.mouse.move(640, 400, { steps: 8 });
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("varios especialistas", 300);
    await mover(p, laPestana(p, "members"));
    await alDecir("los servicios que atiende", 200);
    await mover(p, laPestana(p, "services"));

    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const integraciones = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Integraciones" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Integraciones", 600);
    await mover(p, integraciones);

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
    await alDecir("las citas de todo el equipo", 200);
    await mover(p, p.locator('[data-columna-del-dia="manana"]'));
    await alDecir("con Semana");
    await pulsar(p, p.locator(".fc-semanaBtn-button"));

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

    // Kanban: se arrastra una tarjeta.
    await decir("kanban");
    await pulsar(p, laPestana(p, "kanban"));
    await laTarjetaDe(p, LA_TARJETA).waitFor({ state: "visible", timeout: 30000 });
    await alDecir("columnas por estado", 200);
    await mover(p, laColumna(p, "PENDIENTE"));
    await alDecir("las arrastras", 100);
    await arrastrar(p, laTarjetaDe(p, LA_TARJETA), laColumna(p, "CONFIRMADA"));
    await alDecir("el engranaje", 200);
    await mover(p, laColumna(p, "CONFIRMADA").locator("[data-automatizaciones-de-la-columna]"));

    // Especialistas.
    await decir("especialistas");
    await pulsar(p, laPestana(p, "members"));
    await elEspecialista(p, EL_ESPECIALISTA_PUBLICO).waitFor({ state: "visible", timeout: 30000 });
    await alDecir("abres a cada persona", 200);
    await pulsar(p, elEspecialista(p, EL_ESPECIALISTA_PUBLICO).locator("[data-abrir-especialista]"));
    const laura = elEspecialista(p, EL_ESPECIALISTA_PUBLICO);
    await elBloqueDe(laura, "servicios").waitFor({ state: "visible", timeout: 15000 });
    await alDecir("los servicios que atiende", 200);
    await mover(p, elBloqueDe(laura, "servicios").locator("button").first());
    await alDecir("sus franjas", 200);
    await mover(p, elBloqueDe(laura, "disponibilidad").locator('[data-dia-de-la-semana="1"]'));

    // Servicios.
    await decir("servicios");
    await pulsar(p, laPestana(p, "services"));
    await elServicio(p, "VALORACIÓN INICIAL").waitFor({ state: "visible", timeout: 30000 });
    await alDecir("con su duración", 200);
    await mover(p, elServicio(p, "VALORACIÓN INICIAL"));
    await alDecir("el mensaje", 200);
    await mover(p, elServicio(p, "LIMPIEZA DENTAL"));

    // Recordatorios.
    await decir("recordatorios");
    await pulsar(p, laPestana(p, "reminders"));
    await p.locator("[data-recordatorio]").first().waitFor({ state: "visible", timeout: 30000 });
    await alDecir("sus propios mensajes", 200);
    await mover(p, p.locator("[data-recordatorio]").first());
    await alDecir("cuánto antes", 200);
    await mover(p, p.locator("[data-recordatorio]").nth(1));

    // Formulario.
    await decir("formulario");
    await pulsar(p, laPestana(p, "form"));
    await p.locator("[data-pregunta-del-formulario]").first().waitFor({ state: "visible", timeout: 30000 });
    await alDecir("armas las preguntas", 200);
    await mover(p, p.locator("[data-pregunta-del-formulario]").first());

    // Ajustes.
    await decir("ajustes");
    await pulsar(p, laPestana(p, "settings"));
    await p.locator("[data-enlace-publico]").waitFor({ state: "visible", timeout: 30000 });
    await alDecir("copias tu enlace", 100);
    await mover(p, p.locator("[data-copiar-enlace]"));
    await alDecir("anticipación", 200);
    await mover(p, p.locator('[data-tarjeta-de-ajustes="anticipacion"]'));
    const enlace = await p.locator("[data-enlace-publico]").inputValue();

    // La página pública: la carga no se graba.
    await sinGrabarLaEspera(async () => {
        await abrirLaPaginaPublica(p, enlace);
        await p.mouse.move(640, 420, { steps: 2 });
        await espera(p, 300);
    });
    await decir("pagina");
    await alDecir("elige el servicio", 150);
    await pulsar(p, p.locator("[data-servicio-publico]", { hasText: EL_SERVICIO_PUBLICO }));
    await p.locator("[data-especialista-publico]").first().waitFor({ state: "visible", timeout: 15000 });
    await alDecir("el especialista", 150);
    await pulsar(p, p.locator("[data-especialista-publico]", { hasText: EL_ESPECIALISTA_PUBLICO }));
    await p.locator('[data-paso-publico="fecha"]').waitFor({ state: "visible", timeout: 15000 });
    await alDecir("el día y la hora", 150);
    await pulsar(p, await elDiaPublico(p));
    await p.locator("[data-hora-publica]").first().waitFor({ state: "visible", timeout: 20000 });
    await pulsar(p, p.locator("[data-hora-publica]").nth(1));
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
    for (const c of cortes) console.log(`  · sin grabar ${((c.hastaMs - c.desdeMs) / 1000).toFixed(1)} s de carga (en el ${(c.desdeMs / 1000).toFixed(1)} s)`);
    writeFileSync(path.join(TMP, "narracion.json"), JSON.stringify(colocados, null, 2));
    escribirLaVozDelVideo("multiagenda", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS, cortes });
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
    await conElDominioDeLaGuia(ctx, BASE);
    const p = await entrar(ctx, BASE);
    await abrirMultiagenda(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-multiagenda.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/multiagenda`);
