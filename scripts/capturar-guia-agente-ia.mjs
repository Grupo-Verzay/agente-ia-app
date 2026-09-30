/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Agente IA, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-agente-ia.mjs`).
 *
 * La MISMA forma que la de Leads, Catálogo, Diagramas, Reuniones y Mis notas:
 * cada captura es una receta —abre esto, pulsa aquello, resalta este
 * elemento— y las marcas se dibujan encima de la pantalla real. Lo que no
 * depende de la pantalla —entrar, medir, marcar, guardar, las miniaturas, el
 * marco (el menú y la barra de arriba) y la narración
 * (`decir`/`alDecir`/`callar`)— viene del taller común de las guías
 * (`taller-de-la-guia.mjs`). Aquí van solo las recetas de Agente IA: la
 * pantalla Y su editor interno, pestaña por pestaña.
 *
 * Los elementos se localizan por lo que la pantalla ya expone —los
 * `aria-label` y `title` de los botones, que son también lo que el banco
 * compara con la guía, y las marcas `data-*` de la pantalla (`data-canal`,
 * `data-barra-del-editor`, `data-editor-del-agente`, `data-bloque`,
 * `data-titulo-del-elemento`…)—, nunca por coordenadas: si un botón se mueve,
 * la flecha se va con él.
 *
 * Las capturas CAMBIAN los datos (guardan una versión con otro título), así
 * que antes del vídeo se vuelve a sembrar: el vídeo sale del mismo punto de
 * partida que la primera captura.
 *
 * Se lanza con `scripts/generar-guia-agente-ia.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-agente-ia.mjs";
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
    rotulo,
    tomarLasMiniaturas,
    unir,
} from "./taller-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "agente-ia");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-agente-ia";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
/** Solo el vídeo: las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-agente-ia.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-agente-ia.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Dónde está cada cosa                                                */
/* ------------------------------------------------------------------ */

const CANALES = "[data-canales-del-agente]";
const BARRA = "[data-barra-del-editor]";
const PROGRESO = "[data-progreso-del-agente]";
const EDITOR = "[data-editor-del-agente]";
const PREVIA = "[data-vista-previa]";
/** La pestaña abierta del editor (las cerradas no se pintan). */
const PANEL = `${EDITOR} [role="tabpanel"][data-state="active"]`;

/** Una pestaña del editor, por su nombre (el mismo de `TYPE_AI_LABELS`). */
const laPestana = (p, nombre) => p.locator(`${BARRA} button[aria-label="Cambiar a ${nombre}"]`);
/** Un canal de la fila de arriba, por su slug (`lib/channel-training.ts`). */
const elCanal = (p, slug) => p.locator(`${CANALES} [data-canal="${slug}"]`);
/** El bloque `i` (paso, pregunta, producto, extra o gestión) de la pestaña abierta. */
const elBloque = (p, i) => p.locator(`${PANEL} [data-bloque]`).nth(i);
/** Guardar, en cualquiera de sus dos caras («Guardar» en verde o «Todo guardado»). */
const elGuardar = (p) => p.locator(`${BARRA} button[aria-label="Guardar"], ${BARRA} button[aria-label="Todo guardado"]`).first();
const masOpciones = (p) => p.locator(`${BARRA} button[aria-label="Más opciones del agente"]`);
/** La tarjeta de un elemento dentro de un bloque, por su título (`TituloDelElemento`). */
const laTarjeta = (bloque, titulo) =>
    bloque.locator("div.rounded-lg.border", { has: bloque.page().locator("[data-titulo-del-elemento]", { hasText: titulo }) }).last();
/** Lo que se acaba de abrir en un portal (un menú, un desplegable o una ventana). */
// `:visible`: la pantalla deja montadas ventanas cerradas (el aviso de
// actualizaciones, los paneles laterales), y la última del DOM no tiene por
// qué ser la que se acaba de abrir.
const elMenu = (p) => p.locator('[role="menu"]:visible').last();
const loAbierto = (p) => p.locator('[role="dialog"]:visible').last();

/** El ratón, fuera de todo: un botón con el cursor encima sale resaltado. */
const apartar = (p) => p.mouse.move(p.viewportSize().width - 30, p.viewportSize().height - 30);

/**
 * Cierra lo que abren las recetas —un desplegable, una ventana, un menú, un
 * panel lateral— sin guardar nada. El taller solo cierra menús y
 * confirmaciones (`cerrarLoAbierto`); estas no lo son todas.
 */
async function cerrarLasVentanas(p) {
    for (let i = 0; i < 4; i += 1) {
        if (!(await p.$('[role="dialog"], [role="listbox"], [role="menu"]'))) break;
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }
    await soltarElFoco(p);
}

/**
 * Suelta el foco: el anillo que deja un desplegable cerrado, o el que Radix
 * pone en la «X» de una ventana recién abierta, se lee como otra marca.
 */
/** El sitio del número al final del borde de arriba de una caja: donde no
 *  está el rótulo del campo, que siempre va a la izquierda. */
const arribaALaDerecha = (c) => ({ x: c.x + c.w - 26, y: c.y - 5 });

const soltarElFoco = (p) => p.evaluate(() => document.activeElement?.blur?.());

/** Abre Agente IA en un canal. Un canal con candado no tiene editor: se espera su aviso. */
async function abrirAgente(p, canal = "whatsapp") {
    await p.goto(`${BASE}/ia/${canal}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${BARRA}, ${CANALES} ~ * h2, h2:has-text("Canal no habilitado")`, { timeout: 120000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    // Los botones del borde (nota rápida, copiloto, equipo) son de TODAS las
    // pantallas: aquí tapan la vista previa y no explican nada de Agente IA.
    await esconderLosBotonesDelBorde(p);
    await apartar(p);
}

/** Abre una pestaña del editor, arriba del todo. */
async function abrirPestana(p, nombre) {
    await laPestana(p, nombre).click();
    await p.locator(PANEL).first().waitFor({ state: "visible", timeout: 20000 });
    await p.locator(EDITOR).evaluate((e) => (e.scrollTop = 0));
    await espera(p, 900);
    await apartar(p);
}

/**
 * Deja abierto SOLO el bloque `i` de la pestaña (o ninguno con `null`): una
 * captura con tres bloques abiertos no dice cuál se está explicando.
 */
async function soloAbierto(p, i) {
    for (let n = 0; n < 12; n += 1) {
        const abierto = p.locator(`${PANEL} [data-bloque] button[title="Colapsar"]`).first();
        if (!(await abierto.count())) break;
        await abierto.click();
        await espera(p, 300);
    }
    if (i !== null) {
        await elBloque(p, i).locator('button[title="Expandir"]').first().click();
        await espera(p, 600);
    }
    await apartar(p);
}

/**
 * Sube (o baja) el editor hasta que el elemento quede a `margen` px de su
 * borde de arriba. `suave` es para el vídeo, que tiene que verse moverse.
 */
async function alPrincipio(p, locator, margen = 16, suave = false) {
    await locator.evaluate(
        (el, { margen, suave }) => {
            const ed = el.closest("[data-editor-del-agente]");
            const d = el.getBoundingClientRect().top - ed.getBoundingClientRect().top - margen;
            ed.scrollBy({ top: d, behavior: suave ? "smooth" : "instant" });
        },
        { margen, suave },
    );
    await espera(p, suave ? 800 : 400);
}

/** Un recuadro metido `px` por los lados: dos botones pegados no se montan uno encima del otro. */
const estrecho = (c, px) => ({ x: c.x + px, y: c.y, w: c.w - 2 * px, h: c.h });

/** Una caja con aire abajo: ahí va el rótulo de una marca con `lado: "abajo"`. */
const conAireAbajo = (c, px) => ({ ...c, h: c.h + px });

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

/**
 * Una miniatura por sección, con la receta de todas las guías
 * (`tomarLasMiniaturas` del taller): aquí solo se dice qué zona explica cada
 * sección, y cada zona deja antes la pantalla como hace falta.
 */
async function miniaturas(p) {
    await tomarLasMiniaturas(
        p,
        [
            ["vista-general", async () => unir(await caja(p, CANALES), await caja(p, BARRA))],
            ["canales", async () => caja(p, CANALES)],
            ["perfil", async () => {
                await abrirPestana(p, "Perfil");
                return caja(p, `${PANEL} form > div.grid`);
            }],
            ["pasos", async () => {
                await abrirPestana(p, "Inicio");
                await soloAbierto(p, null);
                return unir(await caja(p, elBloque(p, 0)), await caja(p, elBloque(p, 3)));
            }],
            // Lo que ofrece «Agregar acción», abierto: cerrado es un botón azul
            // que no dice nada.
            ["elementos", async () => {
                await soloAbierto(p, 2);
                const agregar = elBloque(p, 2).getByRole("button", { name: "Agregar acción" });
                await alPrincipio(p, agregar, 120);
                await agregar.click();
                const menu = loAbierto(p);
                await menu.waitFor({ state: "visible", timeout: 10000 });
                await espera(p, 500);
                await apartar(p);
                return unir(await caja(p, agregar), await caja(p, menu));
            }],
            ["conocimiento", async () => {
                await abrirPestana(p, "Preguntas");
                await soloAbierto(p, null);
                return unir(await caja(p, elBloque(p, 0)), await caja(p, elBloque(p, 2)));
            }],
            ["palabras-clave", async () => {
                await abrirPestana(p, "Palabras clave");
                const reglas = p.locator(`${PANEL} div:has(> [title="Arrastrar regla"])`);
                return unir(await caja(p, reglas.first()), await caja(p, reglas.last()));
            }],
            ["gestion", async () => {
                await abrirPestana(p, "Gestión");
                await soloAbierto(p, 0);
                return caja(p, laTarjeta(elBloque(p, 0), "Captura de datos"));
            }],
            ["cotizaciones", async () => {
                await abrirPestana(p, "Cotizaciones");
                return caja(p, `${PANEL} [data-pestana="cotizaciones"]`);
            }],
            ["guardar-y-opciones", async () => {
                await masOpciones(p).click();
                await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
                await espera(p, 500);
                await apartar(p);
                return unir(await caja(p, elGuardar(p)), await caja(p, elMenu(p)));
            }],
        ],
        { salida: SALIDA, tomadas, focos: FOCOS, despues: () => cerrarLasVentanas(p) },
    );
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();

    /* 1. La pantalla de un vistazo ----------------------------------- */
    await abrirAgente(p);
    await abrirPestana(p, "Inicio");
    await soloAbierto(p, 2);
    // Portada del vídeo: la pantalla con un paso abierto y sus elementos.
    await guardar(p, "portada.webp");

    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cCanales = await caja(p, CANALES);
    const cBarra = await caja(p, BARRA);
    const cEditor = await caja(p, EDITOR);
    const cPrevia = await caja(p, PREVIA);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: cCanales, n: 3 },
        { c: dentro(cBarra, 3), n: 4 },
        { c: dentro(cEditor, 6), n: 5 },
        { c: dentro(cPrevia, 6), n: 6 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // Los canales: la fila entera, y el que se edita señalado.
    await abrirPestana(p, "Perfil");
    // Sin rótulo: debajo de la fila están las pestañas del editor, y un rótulo
    // ahí tapaba «Inicio». El que se edita ya se lee: es el que va en blanco.
    await marcar(p, [{ c: cCanales }], { atenuar: true });
    await guardar(p, "canales.webp", holgura(unir(cCanales, cBarra), 12, vista));
    await desmarcar(p);

    // La barra del editor, en una ventana más estrecha: a 1440 es una tira
    // tan larga que sus pestañas se leerían diminutas en la página de la guía.
    await p.setViewportSize({ width: 1180, height: 760 });
    await espera(p, 1200);
    {
        const b = await caja(p, BARRA);
        const pestanas = unir(await caja(p, laPestana(p, "Perfil")), await caja(p, laPestana(p, "Cotizaciones")));
        await marcar(
            p,
            [
                { c: pestanas, n: 1 },
                { c: estrecho(await caja(p, elGuardar(p)), 2), n: 2, esquina: "centro" },
                { c: estrecho(await caja(p, masOpciones(p)), 2), n: 3, esquina: "centro" },
                { c: await caja(p, PROGRESO), n: 4, borde: "abajo" },
            ],
            { atenuar: true },
        );
        // Con aire a la izquierda y abajo: los números 1 y 4 van en esas esquinas.
        const cProgreso = await caja(p, PROGRESO);
        const arriba = b.y - 26;
        const abajo = Math.max(b.y + b.h, cProgreso.y + cProgreso.h) + 22;
        await guardar(p, "barra-del-editor.webp", { x: b.x - 22, y: arriba, w: p.viewportSize().width - (b.x - 22), h: abajo - arriba });
        await desmarcar(p);
    }
    await p.setViewportSize(vista);
    await espera(p, 1200);

    // La vista previa, con un trozo del editor al lado para que se vea de dónde sale.
    // El rótulo va a la altura del hueco entre dos tarjetas del perfil: a media
    // altura de la vista previa caía encima de un campo.
    {
        const campos = p.locator(`${PANEL} form > div.grid`).first().locator(":scope > *");
        const c3 = await caja(p, campos.nth(3));
        const c5 = await caja(p, campos.nth(5));
        const hueco = (c3.y + c3.h + c5.y) / 2;
        await marcar(
            p,
            [
                { c: dentro(cPrevia, 6) },
                { c: { x: cPrevia.x + 6, y: hueco - 1, w: 1, h: 2 }, texto: "Lo que lee tu agente", lado: "izquierda", sinRecuadro: true },
            ],
            { atenuar: true },
        );
    }
    await guardar(p, "vista-previa.webp", { x: cPrevia.x - 380, y: cBarra.y, w: vista.width - (cPrevia.x - 380), h: vista.height - cBarra.y });
    await desmarcar(p);

    /* 2. Los canales -------------------------------------------------- */
    // Con el editor debajo: WhatsApp tiene su entrenamiento entero.
    const zonaDeCanales = { x: cCanales.x - 12, y: cCanales.y - 12, w: cEditor.w + 24, h: 420 };
    // Sin rótulo: debajo están las pestañas del editor y lo taparía.
    await marcar(p, [{ c: await caja(p, elCanal(p, "whatsapp")) }], { atenuar: true });
    await guardar(p, "canales-whatsapp.webp", zonaDeCanales);
    await desmarcar(p);

    await abrirAgente(p, "llamadas");
    await marcar(p, [{ c: await caja(p, elCanal(p, "llamadas")) }], { atenuar: true });
    await guardar(p, "canales-otro.webp", zonaDeCanales);
    await desmarcar(p);

    await abrirAgente(p, "telegram");
    {
        const aviso = p.getByRole("heading", { name: "Canal no habilitado" }).locator("xpath=..");
        const cAviso = await caja(p, aviso);
        await marcar(
            p,
            [
                { c: await caja(p, elCanal(p, "telegram")), texto: "Con candado", lado: "abajo" },
                { c: await caja(p, p.getByRole("link", { name: "Ir a Conexión" })), texto: "Dónde activarlo", lado: "derecha" },
            ],
            { atenuar: true },
        );
        await guardar(p, "canales-bloqueado.webp", holgura({ x: cCanales.x, y: cCanales.y, w: cCanales.w, h: cAviso.y + cAviso.h - cCanales.y }, 12, vista));
        await desmarcar(p);
    }

    /* 3. El perfil ------------------------------------------------------ */
    await abrirAgente(p);
    await abrirPestana(p, "Perfil");
    {
        const campos = p.locator(`${PANEL} form > div.grid`).first().locator(":scope > *");
        const seis = unir(await caja(p, campos.nth(0)), await caja(p, campos.nth(5)));
        await marcar(p, [{ c: seis }], { atenuar: true });
        await guardar(p, "perfil-datos.webp", { x: cEditor.x, y: cEditor.y, w: vista.width - cEditor.x, h: Math.min(vista.height - cEditor.y, seis.y + seis.h + 20 - cEditor.y) });
        await desmarcar(p);
    }

    {
        const selector = p.locator(`${PANEL} button[role="combobox"]`, { hasText: "Seleccionar campos" });
        await alPrincipio(p, selector, 160);
        await selector.click();
        const lista = loAbierto(p);
        await lista.getByPlaceholder("Buscar campo...").waitFor({ state: "visible", timeout: 10000 });
        await espera(p, 500);
        await apartar(p);
        const cTarjeta = await caja(p, selector.locator("xpath=../.."));
        const cLista = await caja(p, lista);
        await marcar(p, [{ c: await caja(p, selector) }, { c: cLista }], { atenuar: true });
        await guardar(p, "perfil-campos.webp", holgura(unir(cTarjeta, cLista), 24, vista));
        await desmarcar(p);
        await cerrarLasVentanas(p);
    }

    {
        const firma = p.locator(`${PANEL} input[placeholder="Ej. Asistente Virtual"]`).locator("xpath=../..");
        const notas = p.locator(`${PANEL} textarea[placeholder="Aclaraciones, tono, restricciones..."]`).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
        await p.locator(EDITOR).evaluate((e) => (e.scrollTop = e.scrollHeight));
        await espera(p, 500);
        const cFirma = await caja(p, firma);
        const cNotas = await caja(p, notas);
        await marcar(
            p,
            [
                { c: cFirma, n: 1 },
                { c: cNotas, n: 2 },
            ],
            { atenuar: true },
        );
        const arriba = cFirma.y - 100;
        await guardar(p, "perfil-firma.webp", { x: cEditor.x, y: arriba, w: vista.width - cEditor.x, h: cNotas.y + cNotas.h + 18 - arriba });
        await desmarcar(p);
    }

    /* 4. Los pasos ------------------------------------------------------ */
    await abrirPestana(p, "Inicio");
    await soloAbierto(p, 0);
    {
        const bienvenida = elBloque(p, 0);
        const modos = unir(
            await caja(p, bienvenida.locator("button", { hasText: "obligatoria" })),
            await caja(p, bienvenida.locator("button", { hasText: "inteligente" })),
        );
        await marcar(p, [{ c: modos, texto: "Elige cómo saluda", lado: "abajo" }], { atenuar: true });
        await guardar(p, "pasos-bienvenida.webp", holgura(conAireAbajo(unir(await caja(p, bienvenida.locator(":scope > div").first()), modos), 110), 14, vista));
        await desmarcar(p);
    }

    await soloAbierto(p, 1);
    const paso = elBloque(p, 1);
    await alPrincipio(p, paso, 12);
    {
        const titulo = paso.locator('input[placeholder="Título del paso"]');
        const objetivo = paso.locator("textarea").first();
        const cTitulo = await caja(p, titulo);
        const cObjetivo = await caja(p, objetivo);
        await marcar(
            p,
            [
                { c: cTitulo, texto: "Su título", lado: "derecha" },
                { c: cObjetivo, texto: "Lo que debe lograr en esta etapa", lado: "abajo" },
            ],
            { atenuar: true },
        );
        await guardar(p, "pasos-paso.webp", holgura(unir(await caja(p, paso.locator(":scope > div").first()), conAireAbajo(cObjetivo, 90)), 14, vista));
        await desmarcar(p);
    }

    {
        const plantillas = paso.getByRole("button", { name: "Plantillas" });
        await plantillas.click();
        const panel = loAbierto(p);
        await panel.getByRole("button", { name: "Aplicar" }).waitFor({ state: "visible", timeout: 10000 });
        // Se elige una del medio, para que a la derecha se vea el modelo elegido.
        await panel.locator("div.w-52 button").nth(1).click();
        await espera(p, 500);
        await apartar(p);
        const cPanel = await caja(p, panel);
        await marcar(
            p,
            [
                { c: await caja(p, plantillas) },
                { c: cPanel },
                { c: await caja(p, panel.getByRole("button", { name: "Aplicar" })), texto: "Llena el paso", lado: "izquierda" },
            ],
            { atenuar: true },
        );
        await guardar(p, "pasos-plantillas.webp", holgura(unir(await caja(p, plantillas), cPanel), 24, vista));
        await desmarcar(p);
        await cerrarLasVentanas(p);
    }

    {
        const motor = paso.locator("[data-motor-de-flujo]");
        if ((await motor.getAttribute("aria-expanded")) !== "true") await motor.click();
        await espera(p, 500);
        const caja2 = paso.locator("div.border-dashed", { has: p.locator("[data-motor-de-flujo]") });
        await alPrincipio(p, caja2, 90);
        await apartar(p);
        const cMotor = await caja(p, caja2);
        await marcar(p, [{ c: cMotor }], { atenuar: true });
        await guardar(p, "pasos-motor.webp", holgura({ x: cMotor.x, y: cMotor.y - 86, w: cMotor.w, h: cMotor.h + 86 }, 14, vista));
        await desmarcar(p);
    }

    await soloAbierto(p, null);
    await p.locator(EDITOR).evaluate((e) => (e.scrollTop = 0));
    await espera(p, 400);
    {
        const agregar = p.locator(`${PANEL} button`, { hasText: "Agregar paso" });
        const cabecera = paso.locator(":scope > div").first();
        await marcar(
            p,
            [
                { c: await caja(p, paso.locator('[title="Arrastrar paso"]')), n: 1 },
                // Un recuadro para los tres: sueltos, sus tres huecos del velo
                // se leían como tres manchas blancas.
                { c: unir(await caja(p, paso.locator('button[title="Expandir"]')), await caja(p, paso.locator('button[title="Eliminar paso"]'))) },
                { c: await caja(p, paso.locator('button[title="Expandir"]')), n: 2, sinRecuadro: true, esquina: "centro" },
                { c: await caja(p, paso.locator('button[title="Duplicar paso"]')), n: 3, sinRecuadro: true, esquina: "centro" },
                { c: await caja(p, paso.locator('button[title="Eliminar paso"]')), n: 4, sinRecuadro: true, esquina: "centro" },
                { c: await caja(p, agregar), texto: "Suma un paso al final", lado: "izquierda" },
            ],
            { atenuar: true },
        );
        await guardar(p, "pasos-mandos.webp", holgura(unir(await caja(p, elBloque(p, 0)), await caja(p, cabecera), await caja(p, agregar)), 16, vista));
        await desmarcar(p);
    }

    /* 5. Acciones y respuestas de un paso ------------------------------- */
    await soloAbierto(p, 2);
    const ofrecer = elBloque(p, 2);
    {
        const agregar = ofrecer.getByRole("button", { name: "Agregar acción" });
        await alPrincipio(p, agregar, 120);
        await agregar.click();
        const menu = loAbierto(p);
        await menu.waitFor({ state: "visible", timeout: 10000 });
        await espera(p, 500);
        await apartar(p);
        const cMenu = await caja(p, menu);
        await marcar(p, [{ c: await caja(p, agregar) }, { c: cMenu }], { atenuar: true });
        await guardar(p, "elementos-menu.webp", holgura(unir(await caja(p, agregar), cMenu, { x: cEditor.x, y: cMenu.y, w: 1, h: 1 }), 20, vista));
        await desmarcar(p);
        await cerrarLasVentanas(p);
    }

    {
        const flujo = laTarjeta(ofrecer, "Ejecutar flujo");
        await alPrincipio(p, flujo, 60);
        const cFlujo = await caja(p, flujo);
        await marcar(p, [{ c: cFlujo, texto: "El flujo que lanza en este paso", lado: "abajo" }], { atenuar: true });
        await guardar(p, "elementos-flujo.webp", holgura(conAireAbajo(cFlujo, 84), 18, vista));
        await desmarcar(p);
    }

    {
        const respuesta = laTarjeta(ofrecer, "RESPUESTA");
        const nota = laTarjeta(ofrecer, "NOTA INTERNA");
        await alPrincipio(p, respuesta, 30);
        const cRespuesta = await caja(p, respuesta);
        const cNota = await caja(p, nota);
        await marcar(
            p,
            [
                { c: cRespuesta, n: 1 },
                { c: cNota, n: 2 },
            ],
            { atenuar: true },
        );
        const z = unir(cRespuesta, cNota);
        await guardar(p, "elementos-nota.webp", holgura(z, 20, vista));
        await desmarcar(p);
    }

    /* 6. Preguntas, productos y extras ---------------------------------- */
    for (const [pestana, imagen] of [
        ["Preguntas", "preguntas.webp"],
        ["Productos", "productos.webp"],
        ["Extras", "extras.webp"],
    ]) {
        await abrirPestana(p, pestana);
        await soloAbierto(p, 0);
        const agregar = p.locator(`${PANEL} button`, { hasText: `Agregar ${pestana === "Preguntas" ? "pregunta" : pestana === "Productos" ? "producto" : "extra"}` }).last();
        const cBloque = await caja(p, elBloque(p, 0));
        await marcar(
            p,
            [
                { c: cBloque, n: 1 },
                { c: await caja(p, agregar), n: 2 },
            ],
            { atenuar: true },
        );
        const cPanel = await caja(p, PANEL);
        await guardar(p, imagen, holgura(cPanel, 10, vista));
        await desmarcar(p);
    }

    /* 7. Palabras clave -------------------------------------------------- */
    await abrirPestana(p, "Palabras clave");
    {
        const reglas = p.locator(`${PANEL} div:has(> [title="Arrastrar regla"])`);
        const cReglas = unir(await caja(p, reglas.first()), await caja(p, reglas.last()));
        const pista = p.locator(`${PANEL} span`, { hasText: "Cada regla intercepta mensajes" }).locator("xpath=..");
        await marcar(p, [{ c: cReglas }, { c: await caja(p, pista), texto: "Antes que la IA", lado: "abajo" }], { atenuar: true });
        const cPanel = await caja(p, PANEL);
        await guardar(p, "palabras-clave.webp", holgura(conAireAbajo(cPanel, 70), 10, vista));
        await desmarcar(p);
    }

    {
        await p.locator(`${PANEL} button`, { hasText: "Agregar regla" }).last().click();
        const formulario = p.locator(`${PANEL} div.rounded-lg.border`, { hasText: "Tipo de coincidencia" }).last();
        await formulario.waitFor({ state: "visible", timeout: 10000 });
        const palabras = formulario.locator("div.min-h-9.rounded-md.border");
        const entrada = palabras.locator("input");
        for (const palabra of ["envío", "domicilio"]) {
            await entrada.click();
            await entrada.pressSequentially(palabra, { delay: 20 });
            await p.keyboard.press("Enter");
        }
        await formulario.locator("textarea").fill("Enviamos a toda Colombia. En Medellín llega el mismo día si pides antes de las 12 m.");
        await espera(p, 400);
        await apartar(p);
        await alPrincipio(p, formulario, 16);
        const cForm = await caja(p, formulario);
        // Los números no van en la esquina de arriba a la izquierda: ahí está
        // el rótulo de cada campo («Tipo de coincidencia», «Palabras clave»,
        // «Respuesta exacta») y el círculo tapaba su primera letra.
        const cTipo = await caja(p, formulario.locator('button[role="combobox"]').first());
        const cPalabras = await caja(p, palabras);
        const cRespuesta = await caja(p, formulario.locator("textarea"));
        await marcar(
            p,
            [
                { c: cTipo, n: 1, borde: "abajo" },
                { c: cPalabras, n: 2, numeroEn: arribaALaDerecha(cPalabras) },
                { c: cRespuesta, n: 3, numeroEn: arribaALaDerecha(cRespuesta) },
            ],
            { atenuar: true },
        );
        await guardar(p, "palabras-clave-nueva.webp", holgura(cForm, 14, vista));
        await desmarcar(p);

        await formulario.getByRole("button", { name: "Escalar a asesor" }).click();
        await espera(p, 500);
        await apartar(p);
        const escalar = formulario.getByRole("button", { name: "Escalar a asesor" });
        const aviso = formulario.locator("div[class*='amber']").last();
        const cForm2 = await caja(p, formulario);
        await marcar(p, [{ c: unir(await caja(p, escalar), await caja(p, aviso)) }], { atenuar: true });
        await guardar(p, "palabras-clave-escalar.webp", holgura(cForm2, 14, vista));
        await desmarcar(p);
        await formulario.getByRole("button", { name: "Cancelar" }).click();
        await espera(p, 500);
    }

    /* 8. Gestión --------------------------------------------------------- */
    await abrirPestana(p, "Gestión");
    await soloAbierto(p, 0);
    {
        const bloque = elBloque(p, 0);
        const captura = laTarjeta(bloque, "Captura de datos");
        const cCaptura = await caja(p, captura);
        await marcar(p, [{ c: cCaptura }], { atenuar: true });
        await guardar(p, "gestion.webp", holgura(unir(await caja(p, bloque.locator(":scope > div").first()), cCaptura), 14, vista));
        await desmarcar(p);

        const tipo = captura.locator('button[role="combobox"]').first();
        await tipo.click();
        const lista = p.locator('[role="listbox"]').last();
        await lista.waitFor({ state: "visible", timeout: 10000 });
        await espera(p, 500);
        await apartar(p);
        const cLista = await caja(p, lista);
        // Un recuadro para el selector y su lista, que van pegados.
        await marcar(p, [{ c: unir(await caja(p, tipo), cLista) }], { atenuar: true });
        await guardar(p, "gestion-tipo.webp", holgura(unir(cCaptura, cLista), 16, vista));
        await desmarcar(p);
        await cerrarLasVentanas(p);

        const entrada = captura.locator('input[placeholder^="Ej.: cc"]');
        await entrada.click();
        await entrada.pressSequentially("telefono", { delay: 30 });
        await apartar(p);
        // Igual que arriba: encima del campo está «Campos/datos:», así que el
        // 1 va al final del borde y el 2 a la derecha de su botón.
        const cEntrada = await caja(p, entrada);
        await marcar(
            p,
            [
                { c: cEntrada, n: 1, numeroEn: arribaALaDerecha(cEntrada) },
                { c: await caja(p, captura.locator('button[aria-label="Agregar campo"]')), n: 2, esquina: "derecha" },
            ],
            { atenuar: true },
        );
        await guardar(p, "gestion-campos.webp", holgura(cCaptura, 14, vista));
        await desmarcar(p);
        await entrada.fill("");
    }

    /* 9. Cotizaciones ------------------------------------------------------ */
    await abrirPestana(p, "Cotizaciones");
    {
        const tarjeta = p.locator(`${PANEL} [data-pestana="cotizaciones"]`);
        const cTarjeta = await caja(p, tarjeta);
        const interruptor = tarjeta.getByRole("switch", { name: "Activar cotizaciones automáticas" });
        const estado = interruptor.locator("xpath=preceding-sibling::span[1]");
        const cSwitch = unir(await caja(p, estado), await caja(p, interruptor));
        await marcar(p, [{ c: { x: cSwitch.x - 6, y: cSwitch.y - 2, w: cSwitch.w + 8, h: cSwitch.h + 4 }, texto: "Enciéndelas aquí", lado: "izquierda" }], { atenuar: true });
        await guardar(p, "cotizaciones-activar.webp", holgura(cTarjeta, 14, vista));
        await desmarcar(p);

        const condiciones = tarjeta.locator("#cotizaciones-instrucciones");
        await marcar(p, [{ c: await caja(p, condiciones), texto: "Va al final de cada cotización", lado: "abajo" }], { atenuar: true });
        await guardar(p, "cotizaciones-condiciones.webp", holgura(conAireAbajo(cTarjeta, 60), 14, vista));
        await desmarcar(p);

        await marcar(p, [{ c: await caja(p, tarjeta.locator("p").first()) }], { atenuar: true });
        await guardar(p, "cotizaciones-catalogo.webp", holgura(cTarjeta, 14, vista));
        await desmarcar(p);
    }

    /* 10. Guardar y más opciones ------------------------------------------ */
    await abrirPestana(p, "Inicio");
    await soloAbierto(p, 1);
    {
        // Un cambio de verdad: Guardar se pone en verde.
        const titulo = paso.locator('input[placeholder="Título del paso"]');
        await titulo.click();
        await p.keyboard.press("End");
        await titulo.pressSequentially(" DEL CLIENTE", { delay: 25 });
        await p.locator(`${BARRA} button[aria-label="Guardar"]`).waitFor({ state: "visible", timeout: 15000 });
        await apartar(p);
        const cGuardar = await caja(p, elGuardar(p));
        await marcar(p, [{ c: cGuardar, texto: "Hay cambios sin guardar", lado: "izquierda" }], { atenuar: true });
        await guardar(p, "guardar.webp", { x: vista.width - 620, y: cCanales.y - 8, w: 620, h: cGuardar.y + cGuardar.h + 40 - (cCanales.y - 8) });
        await desmarcar(p);
        // Se guarda: nace la tercera versión, la que enseña el historial.
        await elGuardar(p).click();
        await p.locator(`${BARRA} button[aria-label="Todo guardado"]`).waitFor({ state: "visible", timeout: 30000 });
        await espera(p, 800);
    }

    const abrirOpcion = async (nombre) => {
        await masOpciones(p).click();
        await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
        await elMenu(p).getByRole("menuitem", { name: nombre }).click();
        await espera(p, 1500);
    };

    await masOpciones(p).click();
    await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    {
        const cMenu = await caja(p, elMenu(p));
        await marcar(p, [{ c: cMenu }], { atenuar: true });
        await guardar(p, "menu-opciones.webp", holgura(unir(await caja(p, elGuardar(p)), cMenu, { x: cMenu.x - 160, y: cMenu.y, w: 1, h: 1 }), 20, vista));
        await desmarcar(p);
        await cerrarLasVentanas(p);
    }

    await abrirOpcion("IA Prompts");
    {
        const ventana = loAbierto(p);
        await ventana.waitFor({ state: "visible", timeout: 15000 });
        await espera(p, 1200);
        await soltarElFoco(p);
        await apartar(p);
        await guardar(p, "ia-prompts.webp", holgura(await caja(p, ventana), 18, vista));
        await cerrarLasVentanas(p);
    }

    await abrirOpcion("Historial de versiones");
    {
        const panel = loAbierto(p);
        // El ÚLTIMO «Restaurar»: debajo queda el hueco donde va el rótulo; con
        // el primero, el rótulo tapaba la versión de debajo.
        const restaurar = panel.getByRole("button", { name: "Restaurar" }).last();
        await restaurar.waitFor({ state: "visible", timeout: 20000 });
        await espera(p, 800);
        await soltarElFoco(p);
        await apartar(p);
        const cPanel = await caja(p, panel);
        await marcar(p, [{ c: await caja(p, restaurar), texto: "Vuelve a esta versión", lado: "abajo" }]);
        await guardar(p, "historial.webp", { x: cPanel.x - 12, y: 0, w: vista.width - cPanel.x + 12, h: Math.min(vista.height, 620) });
        await desmarcar(p);
        await cerrarLasVentanas(p);
    }

    await abrirOpcion("Métricas del agente");
    {
        const panel = loAbierto(p);
        await panel.waitFor({ state: "visible", timeout: 15000 });
        await p.waitForFunction(() => !document.querySelector('[role="dialog"] .animate-spin'), null, { timeout: 30000 }).catch(() => {});
        await espera(p, 1200);
        await soltarElFoco(p);
        await apartar(p);
        const cPanel = await caja(p, panel);
        const cDatos = await caja(p, panel.locator("div.p-4.space-y-5").first());
        await guardar(p, "metricas.webp", { x: cPanel.x - 12, y: 0, w: vista.width - cPanel.x + 12, h: Math.min(vista.height, cDatos.y + cDatos.h + 16) });
        await cerrarLasVentanas(p);
    }

    /* El marco: el menú y la barra de arriba ------------------------- */
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Entrenamiento", texto: "Agente IA está en Entrenamiento" });
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cuánto se respira entre una frase y la siguiente: lo justo para que no se
 * monten, y no más —el ritmo lo pone la voz, no el guion—. Es el mismo de las
 * demás guías. Queda escrito en `voz-de-la-guia/agente-ia.json` con el vídeo.
 */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

/**
 * El vídeo: qué se hace en pantalla mientras suena cada frase de
 * `narracion-guia-agente-ia.mjs`. La voz se coloca con `empezarLaNarracion`
 * del taller y se graba con la grabadora de todas las guías.
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
    await ctx.addInitScript(CURSOR);
    const p = await ctx.newPage();
    // No `recordVideo`: estiraba el vídeo cada vez que el navegador pintaba
    // deprisa y la imagen se iba quedando detrás de la voz (ver la grabadora).
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirAgente(p);
    await p.mouse.move(640, 420, { steps: 8 });
    // Lo grabado hasta aquí es la página cargando: el vídeo empieza justo
    // antes de la primera palabra.
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("cómo atender", 400);
    await mover(p, p.locator(`${PANEL} input`).first());
    await alDecir("a la derecha", 300);
    await mover(p, p.locator(PREVIA));

    // El menú de la izquierda: se abre con las dos flechas, se señala dónde
    // está Agente IA y se vuelve a recoger al empezar la frase siguiente,
    // que es la de la barra donde viven las flechas.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const entrenamiento = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Entrenamiento" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Entrenamiento", 600);
    await mover(p, entrenamiento);

    const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // Los canales: WhatsApp es la base; los apagados, con candado.
    await decir("canales");
    await mover(p, p.locator(CANALES));
    await alDecir("WhatsApp es la base", 300);
    await mover(p, elCanal(p, "whatsapp"));
    await alDecir("salen con candado", 300);
    await mover(p, elCanal(p, "telegram"));

    // El perfil: el nombre y los horarios del negocio.
    await decir("perfil");
    await pulsar(p, laPestana(p, "Perfil"));
    await alDecir("su nombre", 300);
    await mover(p, p.locator(`${PANEL} input[placeholder="Ej. Holi Print RD"]`));
    await alDecir("sus horarios", 300);
    await mover(p, p.locator(`${PANEL} input[placeholder^="Ej. Lun"]`));

    // Los pasos: la bienvenida y un paso que se abre.
    await decir("pasos");
    await pulsar(p, laPestana(p, "Inicio"));
    await alDecir("la bienvenida", 300);
    await mover(p, elBloque(p, 0).locator("[data-titulo-del-paso]"));
    await alDecir("cada etapa", 300);
    await pulsar(p, elBloque(p, 2).locator("[data-titulo-del-paso]"));

    // Lo que hace un paso: «Agregar acción», un flujo y la nota interna.
    const ofrecer = elBloque(p, 2);
    const agregar = ofrecer.getByRole("button", { name: "Agregar acción" });
    await decir("elementos");
    await alPrincipio(p, agregar, 260, true);
    await alDecir("agregar acción", 250);
    await pulsar(p, agregar);
    await alDecir("ejecutar un flujo", 250);
    await mover(p, loAbierto(p).getByText("Ejecutar flujo").first());
    await alDecir("una nota interna", 250);
    await p.keyboard.press("Escape");
    await mover(p, laTarjeta(ofrecer, "NOTA INTERNA"));

    // Lo que sabe responder: preguntas, productos y extras.
    await decir("conocimiento");
    await alDecir("En Preguntas", 200);
    await pulsar(p, laPestana(p, "Preguntas"));
    await alDecir("Productos y Extras", 250);
    await pulsar(p, laPestana(p, "Productos"));
    await alDecir("tu catálogo", 250);
    await mover(p, elBloque(p, 0));

    // Palabras clave: una que responde y otra que escala.
    const reglas = p.locator(`${PANEL} div:has(> [title="Arrastrar regla"])`);
    await decir("palabrasClave");
    await pulsar(p, laPestana(p, "Palabras clave"));
    await alDecir("respondes al instante", 250);
    await mover(p, reglas.first());
    await alDecir("a un asesor", 250);
    await mover(p, reglas.last());

    // Gestión: la captura de datos de un pedido.
    await decir("gestion");
    await pulsar(p, laPestana(p, "Gestión"));
    await alDecir("qué datos pide", 250);
    await pulsar(p, elBloque(p, 0).locator("[data-titulo-del-paso], button[title='Expandir']").first());
    await alDecir("un pedido", 250);
    await mover(p, laTarjeta(elBloque(p, 0), "Captura de datos").locator('button[role="combobox"]').first());

    // Cotizaciones: el interruptor y lo que explica.
    await decir("cotizaciones");
    await alDecir("si activas las cotizaciones", 200);
    await pulsar(p, laPestana(p, "Cotizaciones"));
    await mover(p, p.getByRole("switch", { name: "Activar cotizaciones automáticas" }));
    await alDecir("un PDF", 250);
    await mover(p, p.locator(`${PANEL} [data-pestana="cotizaciones"] p`).first());

    // Guardar y el historial de versiones.
    await decir("cierre");
    await alDecir("guardas", 250);
    await mover(p, elGuardar(p));
    await alDecir("en el historial", 250);
    await pulsar(p, masOpciones(p));
    await espera(p, 350);
    await pulsar(p, elMenu(p).getByRole("menuitem", { name: "Historial de versiones" }));
    await alDecir("cualquier versión anterior", 300);
    await mover(p, loAbierto(p).getByRole("button", { name: "Restaurar" }).first());
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
    escribirLaVozDelVideo("agente-ia", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
    await abrirAgente(p);
    try {
        if (!SOLO_VIDEO && process.env.SIN_MINIATURAS !== "1") await miniaturas(p);
        if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    } catch (e) {
        // Con DEPURAR=1 se deja una foto de cómo estaba la pantalla al caerse.
        if (process.env.DEPURAR === "1") await p.screenshot({ path: path.join(TMP, "fallo.png") }).catch(() => {});
        throw e;
    }
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        // Las capturas cambiaron los datos: el vídeo sale del punto de partida.
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-agente-ia.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

// Las que la guía enseña tienen que estar TODAS. Con SOLO_MINIATURAS o
// SOLO_VIDEO, lo demás se conserva del disco: basta con que esté.
comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO || process.env.SIN_MINIATURAS === "1" });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/agente-ia`);
