/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Conexión y Ajustes,
 * sobre la App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-conexion.mjs` y el servidor de WhatsApp de ejemplo de
 * `fingido-guia-conexion.mjs`).
 *
 * La MISMA receta que las demás guías (`capturar-guia-agenda.mjs`) y con las
 * MISMAS piezas del taller (`taller-de-la-guia.mjs`): cada captura es «abre
 * esta pestaña, resalta esta tarjeta», y las marcas se localizan por lo que la
 * pantalla expone —los `data-*` de las pestañas y de la ficha, el título de
 * cada tarjeta—, no por coordenadas.
 *
 * Nada de lo que se hace aquí guarda, cambia de plan ni cierra una sesión: los
 * formularios se abren y se cierran sin enviar.
 *
 * Qué captura hace falta lo dice `lib/guia-conexion.ts`: el script se niega a
 * terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-conexion.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-conexion.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "conexion");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-conexion";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-conexion.json");
const MENU = path.join(RAIZ, "scripts", "menu-guia-conexion.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Abrir                                                               */
/* ------------------------------------------------------------------ */

const LA_FICHA = "[data-tira-del-perfil]";
const LAS_PESTANAS = "[data-pestanas-del-perfil]";
const laPestana = (p, v) => p.locator(`[data-pestana-del-perfil="${v}"]`);
const elPanel = (p, v) => p.locator(`[data-panel-del-perfil="${v}"]`);
const laFicha = (p, que) => p.locator(`[data-ficha-del-perfil="${que}"]`);

/** La tarjeta de una pestaña por su título: la caja con borde más honda que lo contiene. */
const laTarjeta = (p, v, titulo) =>
    elPanel(p, v)
        .locator("div.rounded-lg.border, div.rounded-xl.border")
        .filter({ has: p.getByText(titulo, { exact: true }) })
        .last();

/** Lo que tiene que haber pintado cada pestaña para darla por cargada. */
const LO_QUE_CARGA = {
    conexion: "Mensajería WhatsApp (QR)",
    integraciones: "Proveedor de IA",
    preferencias: "Zona horaria",
    comportamiento: "Estado del agente",
    herramientas: "Herramientas IA",
    cuenta: "Plan actual",
    seguridad: "Cambio de correo",
    apariencia: "Tu logo",
};

async function abrirElPerfil(p) {
    await p.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(LAS_PESTANAS, { timeout: 90000 });
    await elPanel(p, "conexion").getByText(LO_QUE_CARGA.conexion, { exact: true }).first().waitFor({ state: "visible", timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
    await quitarAvisos(p);
}

async function irA(p, v) {
    await laPestana(p, v).click();
    await elPanel(p, v).getByText(LO_QUE_CARGA[v], { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1200);
}

/** Pone algo a la vista dentro del panel que se desplaza. */
async function verla(p, loc, block = "center") {
    await loc.first().evaluate((el, block) => el.scrollIntoView({ block }), block);
    await espera(p, 400);
}

/** Antes de una foto: el anillo de foco se lee como otra marca. */
const soltarElFoco = (p) => p.evaluate(() => document.activeElement?.blur?.());

/** La zona donde se pintan las pestañas: el contenido entero de la pantalla. */
const elContenido = async (p, v) => caja(p, elPanel(p, v));

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

async function miniaturas(p) {
    const focos = {};
    const mini = async (slug, zona) => {
        Object.assign(focos, await tomarUnaMiniatura(p, slug, await zona(), { salida: SALIDA, tomadas }));
        await cerrarLoAbierto(p);
    };

    await mini("vista-general", async () => unir(await caja(p, LA_FICHA), await caja(p, LAS_PESTANAS)));
    await mini("conexion", async () => {
        const qr = laTarjeta(p, "conexion", "Mensajería WhatsApp (QR)");
        await verla(p, qr, "start");
        return caja(p, qr);
    });
    await irA(p, "integraciones");
    await mini("integraciones", () => caja(p, laTarjeta(p, "integraciones", "Proveedor de IA")));
    await irA(p, "preferencias");
    await mini("preferencias", () => caja(p, laTarjeta(p, "preferencias", "Zona horaria")));
    await irA(p, "comportamiento");
    await mini("comportamiento", () => caja(p, laTarjeta(p, "comportamiento", "Estado del agente")));
    await irA(p, "herramientas");
    await mini("herramientas", async () => {
        const filas = elPanel(p, "herramientas").getByText("esencial");
        return unir(await caja(p, filas.nth(0).locator("xpath=ancestor::div[contains(@class,'border')][1]")), await caja(p, filas.nth(1).locator("xpath=ancestor::div[contains(@class,'border')][1]")));
    });
    await irA(p, "cuenta");
    await mini("cuenta", () => caja(p, laTarjeta(p, "cuenta", "Plan actual")));
    await irA(p, "seguridad");
    await mini("seguridad", () => caja(p, laTarjeta(p, "seguridad", "Cambio de correo")));
    await irA(p, "apariencia");
    await mini("apariencia", () => caja(p, laTarjeta(p, "apariencia", "Tema del panel")));

    await abrirElPerfil(p);
    await desmarcar(p);
    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();

    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las cinco zonas de `ZONAS_DE_LA_PANTALLA`.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cFicha = await caja(p, LA_FICHA);
    const cPestanas = await caja(p, LAS_PESTANAS);
    const cContenido = await elContenido(p, "conexion");
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: cFicha, n: 3 },
        { c: cPestanas, n: 4 },
        { c: dentro(cContenido, 4), n: 5 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // La ficha de la cuenta.
    await marcar(p, [
        { c: await caja(p, laFicha(p, "nombre")), n: 1 },
        { c: unir(await caja(p, laFicha(p, "licencia")), await caja(p, laFicha(p, "creditos"))), n: 2 },
        { c: await caja(p, laFicha(p, "cuenta")), n: 3 },
        { c: await caja(p, laFicha(p, "agente")), n: 4, esquina: "derecha" },
    ]);
    await guardar(p, "ficha.webp", holgura({ ...cFicha, y: cFicha.y - 30, h: cFicha.h + 40 }, 24, vista));
    await desmarcar(p);

    // Las ocho pestañas, en su orden.
    const marcasDePestanas = [];
    const botones = p.locator(`${LAS_PESTANAS} [data-pestana-del-perfil]`);
    const cuantas = await botones.count();
    for (let i = 0; i < cuantas; i += 1) marcasDePestanas.push({ c: await caja(p, botones.nth(i)), n: i + 1, sinRecuadro: true });
    await marcar(p, [{ c: cPestanas }, ...marcasDePestanas]);
    await guardar(p, "pestanas.webp", holgura({ ...cPestanas, y: cPestanas.y - 30, h: cPestanas.h + 40 }, 24, vista));
    await desmarcar(p);

    // 2. Conexión: los seis canales.
    const canales = [
        "Mensajería WhatsApp (QR)",
        "Llamadas WhatsApp (QR)",
        "WhatsApp Cloud API",
        "Mensajería Telegram",
        "Mensajería Facebook",
        "Mensajería Instagram",
    ];
    await verla(p, laTarjeta(p, "conexion", canales[0]), "start");
    const marcasDeCanales = [];
    for (const [i, t] of canales.entries()) {
        const c = await caja(p, laTarjeta(p, "conexion", t));
        if (c.y + c.h / 2 < vista.height) marcasDeCanales.push({ c, n: i + 1 });
    }
    await marcar(p, marcasDeCanales);
    await guardar(p, "conexion.webp");
    await desmarcar(p);

    const qr = laTarjeta(p, "conexion", "Mensajería WhatsApp (QR)");
    const cQr = await caja(p, qr);
    const botonesDeLaLinea = qr.locator("div.grid.grid-cols-2 > *");
    await marcar(p, [
        { c: await caja(p, qr.getByText(/^\+\d/).first()), n: 1, esquina: "derecha" },
        { c: await caja(p, botonesDeLaLinea.nth(0)), n: 2 },
        { c: await caja(p, botonesDeLaLinea.nth(1)), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "whatsapp-qr.webp", holgura(cQr, 30, vista));
    await desmarcar(p);

    const cloud = laTarjeta(p, "conexion", "WhatsApp Cloud API");
    await verla(p, cloud);
    const cCloud = await caja(p, cloud);
    await marcar(p, [{ c: await caja(p, cloud.getByRole("button").last()), texto: "Pega sus credenciales", lado: "abajo" }]);
    await guardar(p, "otro-canal.webp", holgura({ ...cCloud, h: cCloud.h + 50 }, 30, vista));
    await desmarcar(p);

    const llamadas = laTarjeta(p, "conexion", "Llamadas WhatsApp (QR)");
    await verla(p, llamadas);
    await guardar(p, "llamadas.webp", holgura(await caja(p, llamadas), 30, vista));

    // 3. Integraciones.
    await irA(p, "integraciones");
    const ia = laTarjeta(p, "integraciones", "Proveedor de IA");
    const avisos = laTarjeta(p, "integraciones", "Contactos de notificación");
    await verla(p, ia, "start");
    await marcar(p, [
        { c: await caja(p, ia), n: 1 },
        { c: await caja(p, avisos), n: 2 },
    ]);
    await guardar(p, "integraciones.webp");
    await desmarcar(p);

    await ia.getByRole("button", { name: /Configurar/ }).first().click();
    const dialogo = p.locator('[role="dialog"]').last();
    await dialogo.waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 900);
    await soltarElFoco(p);
    await guardar(p, "ia-clave.webp", holgura(await caja(p, dialogo), 40, vista));
    await p.keyboard.press("Escape");
    await espera(p, 600);

    await verla(p, avisos);
    const cAvisos = await caja(p, avisos);
    const telefonos = avisos.locator('input[type="tel"], input[placeholder*="57"], input[inputmode="tel"]');
    const marcasDeAvisos = [];
    if (await telefonos.count()) {
        marcasDeAvisos.push({ c: await caja(p, telefonos.first()), n: 1, esquina: "derecha" });
        if ((await telefonos.count()) > 1) marcasDeAvisos.push({ c: await caja(p, telefonos.nth(1)), n: 2, esquina: "derecha" });
    }
    const agregar = avisos.getByRole("button", { name: /Agregar/ }).first();
    if (await agregar.count()) marcasDeAvisos.push({ c: await caja(p, agregar), n: 3, esquina: "derecha" });
    await marcar(p, marcasDeAvisos);
    await guardar(p, "contactos.webp", holgura(cAvisos, 30, vista));
    await desmarcar(p);

    // 4. Preferencias.
    await irA(p, "preferencias");
    for (const [titulo, imagen] of [
        ["Zona horaria", "zona-horaria.webp"],
        ["Empresa", "empresa.webp"],
    ]) {
        const t = laTarjeta(p, "preferencias", titulo);
        await verla(p, t);
        await guardar(p, imagen, holgura(await caja(p, t), 30, vista));
    }
    const maps = laTarjeta(p, "preferencias", "URL de Google Maps");
    await verla(p, maps);
    await marcar(p, [
        { c: await caja(p, maps.getByRole("switch").first()), n: 1, esquina: "derecha" },
        { c: await caja(p, maps.locator("input").first()), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "maps.webp", holgura(await caja(p, maps), 30, vista));
    await desmarcar(p);

    // 5. Comportamiento.
    await irA(p, "comportamiento");
    const estado = laTarjeta(p, "comportamiento", "Estado del agente");
    await verla(p, estado);
    await marcar(p, [{ c: await caja(p, estado.getByRole("switch").first()), texto: "Enciende o apaga la IA", lado: "abajo" }]);
    await guardar(p, "estado-del-agente.webp", holgura({ ...(await caja(p, estado)), h: (await caja(p, estado)).h + 50 }, 30, vista));
    await desmarcar(p);

    const opciones = ["Permitir que la IA escale sola", "Apagar la IA al escalar", "Soltar si nadie responde"];
    const primera = elPanel(p, "comportamiento").getByText(opciones[0], { exact: true }).first();
    await verla(p, primera, "start");
    const marcasDeEscalado = [];
    for (const [i, o] of opciones.entries()) marcasDeEscalado.push({ c: await caja(p, elPanel(p, "comportamiento").getByText(o, { exact: true }).first()), n: i + 1 });
    await marcar(p, marcasDeEscalado);
    await guardar(p, "escalado.webp", holgura(unir(...marcasDeEscalado.map((m) => m.c)), 120, vista));
    await desmarcar(p);

    for (const [a, b, imagen] of [
        ["Encuesta de satisfacción", "Análisis de sentimiento", "encuesta.webp"],
        ["Reactivación automática", "Retraso de respuesta IA", "tiempos.webp"],
        ["Frase de reactivación", "Frase de desactivación", "frases.webp"],
    ]) {
        const ta = elPanel(p, "comportamiento").getByText(a, { exact: true }).first();
        const tb = elPanel(p, "comportamiento").getByText(b, { exact: true }).first();
        await verla(p, ta, "start");
        const ca = await caja(p, laTarjeta(p, "comportamiento", a));
        const cb = await caja(p, laTarjeta(p, "comportamiento", b));
        await marcar(p, [
            { c: ca, n: 1 },
            { c: cb, n: 2 },
        ]);
        await guardar(p, imagen, holgura(unir(ca, cb), 30, vista));
        await desmarcar(p);
        void tb;
    }

    const avanzadas = elPanel(p, "comportamiento").getByText("Funciones avanzadas", { exact: true }).first();
    await verla(p, avanzadas, "start");
    const operario = laTarjeta(p, "comportamiento", "Puente con operario");
    const dueno = laTarjeta(p, "comportamiento", "Modo Dueño por WhatsApp");
    const cOp = await caja(p, operario);
    const cDu = await caja(p, dueno);
    await marcar(p, [
        { c: cOp, n: 1 },
        { c: cDu, n: 2 },
    ]);
    await guardar(p, "avanzadas.webp", holgura(unir(await caja(p, avanzadas), cOp, cDu), 30, vista));
    await desmarcar(p);

    // 6. Herramientas.
    await irA(p, "herramientas");
    const herramientas = elPanel(p, "herramientas");
    await guardar(p, "herramientas.webp");
    const esencial = herramientas.getByText("esencial").first();
    const fila = esencial.locator("xpath=ancestor::div[contains(@class,'border')][1]");
    await verla(p, fila);
    const cFila = await caja(p, fila);
    await marcar(p, [
        { c: await caja(p, esencial), texto: "Esencial", lado: "arriba" },
        { c: await caja(p, fila.getByRole("switch").first()), texto: "Encender o apagar", lado: "derecha" },
    ]);
    await guardar(p, "herramienta-interruptor.webp", holgura({ ...cFila, y: cFila.y - 50, h: cFila.h + 60, w: cFila.w + 40 }, 24, vista));
    await desmarcar(p);
    const recargar = herramientas.locator('button[title="Recargar"]').first();
    await verla(p, recargar, "start");
    await marcar(p, [
        { c: await caja(p, fila.locator('button[title="Editar"]').first()), texto: "Su descripción", lado: "abajo" },
        { c: await caja(p, recargar), texto: "Recargar", lado: "abajo" },
    ]);
    await guardar(p, "herramienta-editar.webp", holgura(unir(await caja(p, recargar), await caja(p, fila)), 50, vista));
    await desmarcar(p);

    // 7. Cuenta.
    await irA(p, "cuenta");
    const plan = laTarjeta(p, "cuenta", "Plan actual");
    await verla(p, plan, "start");
    await guardar(p, "plan.webp", holgura(await caja(p, plan), 30, vista));
    const creditos = laTarjeta(p, "cuenta", "Créditos IA");
    await verla(p, creditos);
    await guardar(p, "creditos.webp", holgura(await caja(p, creditos), 30, vista));
    await abrirElBotonDelPlan(p);
    await espera(p, 600);
    const acciones = [];
    for (const [i, t] of ["Cambiar plan", "Comprar créditos", "Cancelar plan"].entries()) acciones.push({ c: await caja(p, p.getByText(t, { exact: true }).last()), n: i + 1 });
    await marcar(p, acciones);
    const cAcc = unir(...acciones.map((a) => a.c));
    await guardar(p, "plan-acciones.webp", holgura({ ...cAcc, x: cAcc.x - 200, w: cAcc.w + 260, h: cAcc.h + 90 }, 30, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await p.mouse.click(400, 300);
    await espera(p, 500);
    const sesion = laTarjeta(p, "cuenta", "Sesión activa");
    await verla(p, sesion);
    const cerrar = laTarjeta(p, "cuenta", "Cerrar sesión");
    await guardar(p, "sesiones.webp", holgura(unir(await caja(p, sesion), await caja(p, cerrar)), 30, vista));

    // 8. Seguridad.
    await irA(p, "seguridad");
    const correo = laTarjeta(p, "seguridad", "Cambio de correo");
    const clave = laTarjeta(p, "seguridad", "Seguridad");
    await verla(p, correo, "start");
    await marcar(p, [
        { c: await caja(p, correo), n: 1 },
        { c: await caja(p, clave), n: 2 },
    ]);
    await guardar(p, "seguridad.webp");
    await desmarcar(p);
    const marcasDeCorreo = [];
    for (const [i, t] of ["Nuevo correo", "Confirmar correo"].entries()) marcasDeCorreo.push({ c: await caja(p, correo.getByText(t, { exact: true }).first().locator("xpath=..")), n: i + 1, esquina: "derecha" });
    await marcar(p, marcasDeCorreo);
    await guardar(p, "correo.webp", holgura(await caja(p, correo), 30, vista));
    await desmarcar(p);
    await verla(p, clave);
    const marcasDeClave = [];
    for (const [i, t] of ["Contraseña actual", "Nueva contraseña", "Confirmar contraseña"].entries()) marcasDeClave.push({ c: await caja(p, clave.getByText(t, { exact: true }).first().locator("xpath=..")), n: i + 1, esquina: "derecha" });
    await marcar(p, marcasDeClave);
    await guardar(p, "contrasena.webp", holgura(await caja(p, clave), 30, vista));
    await desmarcar(p);

    // 9. Apariencia.
    await irA(p, "apariencia");
    const logo = laTarjeta(p, "apariencia", "Tu logo");
    await verla(p, logo);
    await marcar(p, [{ c: await caja(p, logo.getByRole("button", { name: /Subir logo/ }).first()), texto: "Subir logo", lado: "abajo" }]);
    await guardar(p, "logo.webp", holgura(await caja(p, logo), 60, vista));
    await desmarcar(p);
    const tema = laTarjeta(p, "apariencia", "Tema del panel");
    await verla(p, tema);
    await tema.locator('[role="combobox"]').first().click();
    const lista = p.locator('[role="listbox"]').last();
    await lista.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await guardar(p, "tema.webp", holgura(unir(await caja(p, tema), await caja(p, lista)), 30, vista));
    await p.keyboard.press("Escape");
    await espera(p, 400);
    for (const [titulo, imagen] of [
        ["Tamaño de letra", "letra.webp"],
        ["Modo de color", "modo-de-color.webp"],
    ]) {
        const t = laTarjeta(p, "apariencia", titulo);
        await verla(p, t);
        await soltarElFoco(p);
        await guardar(p, imagen, holgura(await caja(p, t), 30, vista));
    }

    await abrirElPerfil(p);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Conexión", texto: "Aquí entras a Conexión y Ajustes" });
}

/** El botón redondo de abajo a la derecha de Cuenta (`PlanSpeedDial`). */
async function abrirElBotonDelPlan(p) {
    const boton = p.locator("[data-acciones-del-plan]").first();
    await boton.click();
    await p.getByText("Cambiar plan", { exact: true }).last().waitFor({ state: "visible", timeout: 10000 });
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

    await abrirElPerfil(p);
    await p.mouse.move(640, 400, { steps: 8 });
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("conectas tus canales", 200);
    await mover(p, laTarjeta(p, "conexion", "Mensajería WhatsApp (QR)"));
    await alDecir("ocho pestañas", 200);
    await mover(p, p.locator(LAS_PESTANAS));

    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const entrada = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Conexión" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("la entrada del engranaje", 400);
    await mover(p, entrada);

    const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // Conexión.
    const qr = laTarjeta(p, "conexion", "Mensajería WhatsApp (QR)");
    await decir("conexion");
    await alDecir("tu línea de WhatsApp", 100);
    await mover(p, qr.getByText(/^\+\d/).first());
    await alDecir("las llamadas", 100);
    await mover(p, laTarjeta(p, "conexion", "Llamadas WhatsApp (QR)"));
    await alDecir("Cloud API", 100);
    await mover(p, laTarjeta(p, "conexion", "WhatsApp Cloud API"));
    await alDecir("Instagram", 100);
    await mover(p, laTarjeta(p, "conexion", "Mensajería Instagram"));

    // Integraciones.
    await decir("integraciones");
    await pulsar(p, laPestana(p, "integraciones"));
    await elPanel(p, "integraciones").getByText(LO_QUE_CARGA.integraciones, { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
    await alDecir("la clave de tu proveedor", 100);
    await mover(p, laTarjeta(p, "integraciones", "Proveedor de IA"));
    await alDecir("los números que reciben", 100);
    await mover(p, laTarjeta(p, "integraciones", "Contactos de notificación"));

    // Preferencias.
    await decir("preferencias");
    await pulsar(p, laPestana(p, "preferencias"));
    await elPanel(p, "preferencias").getByText(LO_QUE_CARGA.preferencias, { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
    await alDecir("tu zona horaria", 100);
    await mover(p, laTarjeta(p, "preferencias", "Zona horaria"));
    await alDecir("tu empresa", 100);
    await mover(p, laTarjeta(p, "preferencias", "Empresa"));
    await alDecir("Google Maps", 100);
    await mover(p, laTarjeta(p, "preferencias", "URL de Google Maps"));

    // Comportamiento.
    await decir("comportamiento");
    await pulsar(p, laPestana(p, "comportamiento"));
    await elPanel(p, "comportamiento").getByText(LO_QUE_CARGA.comportamiento, { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
    await alDecir("enciendes tu agente", 100);
    await mover(p, laTarjeta(p, "comportamiento", "Estado del agente").getByRole("switch").first());
    await alDecir("pasa el chat a un asesor", 100);
    await mover(p, elPanel(p, "comportamiento").getByText("Permitir que la IA escale sola", { exact: true }).first());
    await alDecir("los tiempos", 100);
    await mover(p, elPanel(p, "comportamiento").getByText("Reactivación automática", { exact: true }).first());

    // Herramientas.
    await decir("herramientas");
    await pulsar(p, laPestana(p, "herramientas"));
    await elPanel(p, "herramientas").getByText(LO_QUE_CARGA.herramientas, { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
    await alDecir("con un interruptor", 100);
    await mover(p, elPanel(p, "herramientas").getByRole("switch").first());

    // Cuenta.
    await decir("cuenta");
    await pulsar(p, laPestana(p, "cuenta"));
    await elPanel(p, "cuenta").getByText(LO_QUE_CARGA.cuenta, { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
    await alDecir("tu plan", 100);
    await mover(p, laTarjeta(p, "cuenta", "Plan actual"));
    await alDecir("los créditos de IA", 100);
    await mover(p, laTarjeta(p, "cuenta", "Créditos IA"));
    await alDecir("con este botón", 100);
    await pulsar(p, p.locator("[data-acciones-del-plan]").first());
    await espera(p, 800);
    await pulsar(p, p.locator("[data-acciones-del-plan]").first());

    // Seguridad.
    await decir("seguridad");
    await pulsar(p, laPestana(p, "seguridad"));
    await elPanel(p, "seguridad").getByText(LO_QUE_CARGA.seguridad, { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
    await alDecir("el correo", 100);
    await mover(p, laTarjeta(p, "seguridad", "Cambio de correo"));
    await alDecir("tu contraseña", 100);
    await mover(p, laTarjeta(p, "seguridad", "Seguridad"));

    // Apariencia.
    await decir("apariencia");
    await pulsar(p, laPestana(p, "apariencia"));
    await elPanel(p, "apariencia").getByText(LO_QUE_CARGA.apariencia, { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
    await alDecir("subes tu logo", 100);
    await mover(p, laTarjeta(p, "apariencia", "Tu logo"));
    await alDecir("los colores", 100);
    await mover(p, laTarjeta(p, "apariencia", "Tema del panel"));
    await alDecir("el tamaño de la letra", 100);
    await mover(p, laTarjeta(p, "apariencia", "Tamaño de letra"));
    await alDecir("claro u oscuro", 100);
    await mover(p, laTarjeta(p, "apariencia", "Modo de color"));
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
    escribirLaVozDelVideo("conexion", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
    await abrirElPerfil(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-conexion.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/conexion`);
