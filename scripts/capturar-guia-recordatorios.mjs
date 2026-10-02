/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Recordatorios,
 * sobre la App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-recordatorios.mjs`).
 *
 * La MISMA receta que la guía de Leads (`capturar-guia-leads.mjs`) y con las
 * MISMAS piezas del taller (`taller-de-la-guia.mjs`): cada captura es «abre
 * esto, pulsa aquello, resalta este elemento», y las marcas se localizan por
 * lo que la pantalla ya expone —los `data-zona` de la barra y de cada
 * recordatorio, los `data-campo` de la ventana, los `aria-label`—, no por
 * coordenadas escritas a mano.
 *
 * Dos cosas que no son de la App y conviene saber:
 *
 *   - **Subir un archivo** necesita el bucket, que aquí no hay. `/api/upload`
 *     lo contesta la propia receta con una dirección de ejemplo
 *     (`archivos.ejemplo.co`): todo lo demás —elegir el archivo, la vista previa,
 *     guardarlo con el recordatorio y la marca «Media» de la tarjeta— es de
 *     verdad. El banco no deja que esa dirección se cuele en otra parte.
 *   - **El micrófono** es el de mentira de Chromium (un pitido): la nota de voz
 *     se graba de verdad con él.
 *
 * Las capturas CAMBIAN los datos (crean un recordatorio), así que antes del
 * vídeo se vuelve a sembrar. Nada de lo que se hace aquí borra: las ventanas de
 * eliminar se CANCELAN, en las capturas y en el vídeo.
 *
 * Qué captura hace falta lo dice `lib/guia-recordatorios.ts`: el script se
 * niega a terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-recordatorios.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-recordatorios.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "recordatorios");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-recordatorios";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
// Solo el vídeo (p. ej. al cambiar la narración): las imágenes se conservan del disco.
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-recordatorios.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-recordatorios.json");

/** La dirección con la que la receta contesta a `/api/upload` (aquí no hay bucket). */
export const ARCHIVOS_DE_EJEMPLO = "https://archivos.ejemplo.co";

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/** Sin bucket: `/api/upload` lo contesta la receta, con el nombre del archivo. */
async function sinBucket(contexto) {
    await contexto.route("**/api/upload", async (ruta) => {
        const cuerpo = ruta.request().postDataBuffer()?.toString("latin1") ?? "";
        const nombre = /filename="([^"]+)"/.exec(cuerpo)?.[1] ?? "archivo";
        await ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: `${ARCHIVOS_DE_EJEMPLO}/${encodeURIComponent(nombre)}` }) });
    });
}

/** Un PDF mínimo y válido, para elegirlo como documento. */
const UN_PDF = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const EL_DOCUMENTO = { name: "cotizacion.pdf", mimeType: "application/pdf", buffer: UN_PDF };

async function abrirLaPantalla(p) {
    await p.goto(`${BASE}/reminders`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector('[data-zona="lista"] [data-recordatorio]', { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    // Los botones del borde tapan los mandos de la derecha de cada recordatorio.
    await esconderLosBotonesDelBorde(p);
    await queNadaSalgaRecortado(p);
}

/**
 * Un título que no cabe sale con «…» en la captura, y la guía enseñaría un
 * recordatorio que no se sabe cómo se llama. Se mira en la lista, en el tablero
 * y en la ventana: si algo no cabe, se acorta en la semilla.
 */
async function queNadaSalgaRecortado(p, dentro_ = "[data-caja-del-contenido]") {
    const recortados = await p.evaluate((sel) => {
        const fuera = [];
        for (const raiz of document.querySelectorAll(sel)) {
            for (const el of raiz.querySelectorAll(".truncate")) {
                if (el.getClientRects().length && el.scrollWidth > el.clientWidth + 1) fuera.push(el.textContent || "");
            }
        }
        return fuera;
    }, dentro_);
    if (recortados.length) throw new Error(`[guia] sale recortado con «…»: ${recortados.join(" · ")}`);
}

/* ------------------------------------------------------------------ */
/* Medir                                                               */
/* ------------------------------------------------------------------ */

const LA_LISTA = '[data-zona="lista"]';
const EL_TABLERO = '[data-zona="kanban"]';
const laVista = (p, nombre) => p.locator('[data-zona="vista"] button', { hasText: nombre }).first();
const LAS_CIFRAS = '[data-zona="cifras"]';
const EL_BUSCADOR = 'input[placeholder="Buscar por título, número o nombre..."]';
const EL_NUEVO = (p) => p.locator('[data-barra-de-acciones] [data-zona="crear"] button').first();
const LAS_MASIVAS = '[data-barra-de-acciones] [data-zona="acciones"] button';
const LA_VENTANA = "[data-ventana-de-recordatorio]";
const LA_ALERTA = '[role="alertdialog"]';
const EL_HISTORIAL = "[data-historial-de-envios]";

/** Un recordatorio de la LISTA, por su título. */
const laTarjeta = (p, titulo) => p.locator(`${LA_LISTA} [data-recordatorio]`, { hasText: titulo }).first();
const laParte = (p, titulo, zona) => laTarjeta(p, titulo).locator(`[data-zona="${zona}"]`).first();
const lasTarjetas = (p) => p.locator(`${LA_LISTA} [data-recordatorio]`);
const laColumna = (p, clave) => p.locator(`${EL_TABLERO} [data-columna="${clave}"]`);
const elCampo = (p, campo) => p.locator(`${LA_VENTANA} [data-campo="${campo}"]`).first();

async function laBarra(p) {
    return unir(await caja(p, '[data-zona="vista"]'), await caja(p, LAS_CIFRAS), await caja(p, EL_BUSCADOR), await caja(p, LAS_MASIVAS));
}

/** Las `n` primeras tarjetas de la lista, a todo lo ancho. */
async function lasPrimeras(p, n) {
    const cajas = [];
    for (let i = 0; i < n; i += 1) cajas.push(await caja(p, lasTarjetas(p).nth(i)));
    return unir(...cajas);
}

/**
 * La caja de una línea de la tarjeta, del ANCHO DE LO ESCRITO: las líneas de la
 * izquierda ocupan toda la tarjeta, y un recuadro de lado a lado se montaba
 * sobre las pastillas de la derecha.
 */
async function loEscrito(p, locator) {
    const c = await caja(p, locator);
    const derecha = await locator.evaluate((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        return r.getBoundingClientRect().right;
    });
    return { ...c, w: Math.max(20, derecha - c.x + 6) };
}

const soltarElFoco = (p) => p.evaluate(() => document.activeElement?.blur?.());

/** La lista arriba del todo: lo que dejó desplazado la receta anterior no cuenta. */
async function alPrincipio(p) {
    await p.locator(LA_LISTA).first().evaluate((el) => {
        for (let n = el; n; n = n.parentElement) n.scrollTop = 0;
    });
    await espera(p, 250);
}

/** Una caja después de traer el elemento a la vista (la ventana se desplaza por dentro). */
async function aLaVistaYMedir(p, locator) {
    await locator.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 250);
    return caja(p, locator);
}

/* ------------------------------------------------------------------ */
/* La ventana de crear                                                 */
/* ------------------------------------------------------------------ */

async function abrirLaVentana(p) {
    await EL_NUEVO(p).click();
    await p.waitForSelector(`${LA_VENTANA} [data-campo="titulo"] input`, { timeout: 15000 });
    await espera(p, 700);
}

async function cerrarLaVentana(p) {
    for (let i = 0; i < 3 && (await p.$(LA_VENTANA)); i += 1) {
        await p.locator(`${LA_VENTANA} button`, { hasText: "Cancelar" }).first().click().catch(() => {});
        await espera(p, 500);
    }
}

const elBotonDeArchivo = (p, nombre) => elCampo(p, "archivo").locator("button", { hasText: nombre }).first();
const elMando = (p, mando) => elCampo(p, "archivo").locator(`[data-mando="${mando}"]`).first();
const LA_VISTA_PREVIA = (p) => elCampo(p, "archivo").locator("div.rounded-md.border.bg-background").first();
const EL_DIA = (p) => elCampo(p, "fecha").locator("button").first();
const LAS_HORAS = (p) => elCampo(p, "fecha").locator("select");

/** El día que se elige en el calendario: dentro de tres días. */
function elDiaQueSeElige() {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d;
}

/** Elige un día en el calendario abierto (pasa de mes si hace falta). */
async function elegirElDia(p, calendario, d) {
    const hoy = new Date();
    if (d.getMonth() !== hoy.getMonth()) {
        await calendario.locator('button[name="next-month"]').click();
        await espera(p, 300);
    }
    return calendario.locator('button[name="day"]:not(.day-outside)', { hasText: new RegExp(`^${d.getDate()}$`) }).first();
}

/** Elige en un buscador de la ventana (contacto o flujo). */
async function elegirEnElBuscador(p, campo, texto, opcion) {
    await elCampo(p, campo).getByRole("combobox").click();
    const pop = p.locator("[data-radix-popper-content-wrapper]").filter({ has: p.locator("[cmdk-input]") }).last();
    await pop.waitFor({ state: "visible", timeout: 10000 });
    await pop.locator("[cmdk-input]").fill(texto);
    await espera(p, 400);
    return { pop, item: pop.locator("[cmdk-item]", { hasText: opcion }).first() };
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

/**
 * Una miniatura por sección, TODAS con la misma receta del taller: la zona que
 * la sección explica, nítida y en su recuadro; el resto, bajo el velo.
 */
async function miniaturas(p) {
    const focos = {};
    const mini = async (slug, zona, despues) => {
        Object.assign(focos, await tomarUnaMiniatura(p, slug, await zona(), { salida: SALIDA, tomadas }));
        await cerrarLoAbierto(p);
        if (despues) await despues();
    };

    await mini("vista-general", () => laBarra(p));
    await mini("lista", () => lasPrimeras(p, 4));
    await mini(
        "kanban",
        async () => {
            await laVista(p, "Kanban").click();
            await laColumna(p, "expired").waitFor({ state: "attached", timeout: 15000 });
            await espera(p, 800);
            return unir(await caja(p, laColumna(p, "pending")), await caja(p, laColumna(p, "tomorrow")));
        },
        async () => {
            await laVista(p, "Lista").click();
            await espera(p, 800);
        },
    );
    await mini(
        "crear",
        async () => {
            await abrirLaVentana(p);
            return unir(await caja(p, elCampo(p, "titulo")), await caja(p, elCampo(p, "mensaje")));
        },
    );
    await mini("adjunto-y-audio", () => aLaVistaYMedir(p, elCampo(p, "archivo")));
    await mini("fecha-y-repeticion", async () => unir(await aLaVistaYMedir(p, elCampo(p, "fecha")), await caja(p, elCampo(p, "repeticion"))));
    await mini("flujo", () => aLaVistaYMedir(p, elCampo(p, "flujo")), () => cerrarLaVentana(p));
    await mini(
        "historial",
        async () => {
            await laParte(p, "RENOVAR PLAN", "estado").click();
            const h = p.locator(EL_HISTORIAL);
            await h.waitFor({ state: "visible", timeout: 10000 });
            await espera(p, 700);
            return caja(p, h);
        },
        async () => {
            await p.keyboard.press("Escape");
            await espera(p, 500);
        },
    );
    await mini("editar-y-eliminar", () => aLaVistaYMedir(p, laParte(p, "CONFIRMAR CITA", "mandos")));

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
        { c: holgura(await lasPrimeras(p, 6), -8, vista), n: 4 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");

    // La barra de trabajo: sus cinco partes, en el orden de `PARTES_DE_LA_BARRA_DE_TRABAJO`.
    await marcar(p, [
        { c: await caja(p, '[data-zona="vista"]'), n: 1 },
        { c: await caja(p, LAS_CIFRAS), n: 2 },
        { c: await caja(p, EL_BUSCADOR), n: 3 },
        { c: await caja(p, EL_NUEVO(p)), n: 4 },
        { c: await caja(p, LAS_MASIVAS), n: 5 },
    ]);
    await guardar(p, "barra.webp", holgura(barra, 34, vista));
    await desmarcar(p);

    // Un recordatorio: sus nueve partes, en el orden de `PARTES_DE_UN_RECORDATORIO`.
    // Los de la izquierda llevan su número a la izquierda de la tarjeta; los de
    // la derecha, encima.
    const ejemplo = "RECORDAR CUOTA";
    const cTarjeta = await aLaVistaYMedir(p, laTarjeta(p, ejemplo));
    const izq = cTarjeta.x - 20;
    const arriba = cTarjeta.y - 22;
    const deLaIzquierda = ["titulo", "contacto", "telefono", "hora", "flujo"];
    const deLaDerecha = ["repeticion", "media", "estado", "mandos"];
    const marcas = [];
    // Las cinco de la izquierda son líneas pegadas: un recuadro por línea se
    // montaba sobre la de al lado y tachaba el texto. Va UNO alrededor de las
    // cinco, del ancho de lo escrito, y cada número a la altura de su línea.
    const lineas = [];
    for (const [i, z] of deLaIzquierda.entries()) {
        const c = await caja(p, laParte(p, ejemplo, z));
        lineas.push(c);
        marcas.push({ c, n: i + 1, sinRecuadro: true, numeroEn: { x: izq, y: c.y + c.h / 2 } });
    }
    const hastaDondeSeEscribe = await laTarjeta(p, ejemplo).evaluate((tarjeta, zonas) => {
        let derecha = 0;
        for (const z of zonas) {
            const el = tarjeta.querySelector(`[data-zona="${z}"]`);
            if (!el) continue;
            const r = document.createRange();
            r.selectNodeContents(el);
            derecha = Math.max(derecha, r.getBoundingClientRect().right);
        }
        return derecha;
    }, deLaIzquierda);
    const deLasLineas = unir(...lineas);
    marcas.push({ c: { ...deLasLineas, w: hastaDondeSeEscribe - deLasLineas.x + 8 } });
    for (const [i, z] of deLaDerecha.entries()) {
        const c = await caja(p, laParte(p, ejemplo, z));
        marcas.push({ c, n: deLaIzquierda.length + i + 1, numeroEn: { x: c.x + c.w / 2, y: arriba } });
    }
    await marcar(p, marcas, { atenuar: true });
    await guardar(p, "tarjeta.webp", holgura({ x: cTarjeta.x - 44, y: cTarjeta.y - 44, w: cTarjeta.w + 60, h: cTarjeta.h + 66 }, 10, vista));
    await desmarcar(p);

    // 2. La lista.
    await marcar(p, [{ c: await caja(p, LA_LISTA), texto: "Un recordatorio por fila", lado: "abajo" }]);
    await guardar(p, "lista.webp");
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, LAS_CIFRAS), texto: "Pendientes · Para hoy · Enviados · Vencidos", lado: "abajo" }]);
    await guardar(p, "lista-cifras.webp", zonaDeLaBarra);
    await desmarcar(p);
    await p.fill(EL_BUSCADOR, "laura");
    await espera(p, 1000);
    await marcar(p, [
        { c: await caja(p, EL_BUSCADOR) },
        { c: await caja(p, LA_LISTA), texto: "Los de Laura Méndez", lado: "abajo" },
    ]);
    await guardar(p, "lista-buscar.webp", holgura(unir(await caja(p, EL_BUSCADOR), await caja(p, LA_LISTA)), 40, vista));
    await desmarcar(p);
    await p.fill(EL_BUSCADOR, "");
    await espera(p, 1000);
    const cTelefono = await caja(p, laParte(p, "CONFIRMAR CITA", "telefono"));
    await marcar(p, [{ c: cTelefono, texto: "Abre su chat", lado: "derecha" }], { atenuar: true });
    await guardar(p, "lista-telefono.webp", holgura(await caja(p, laTarjeta(p, "CONFIRMAR CITA")), 30, vista));
    await desmarcar(p);

    // 3. El tablero Kanban: con la ventana más ancha caben las seis columnas.
    await marcar(p, [{ c: await caja(p, laVista(p, "Kanban")), texto: "Kanban", lado: "abajo" }]);
    await guardar(p, "kanban-boton.webp", zonaDeLaBarra);
    await desmarcar(p);
    await p.setViewportSize({ width: 1920, height: 900 });
    await espera(p, 600);
    await laVista(p, "Kanban").click();
    await laColumna(p, "expired").waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 1000);
    await queNadaSalgaRecortado(p);
    const claves = ["pending", "today", "tomorrow", "recurring", "sent", "expired"];
    const cColumnas = [];
    for (const k of claves) cColumnas.push(await caja(p, laColumna(p, k).locator("> div").first()));
    await marcar(p, cColumnas.map((c, i) => ({ c, n: i + 1 })));
    await guardar(p, "kanban.webp");
    await desmarcar(p);
    const enColumna = laColumna(p, "tomorrow").locator("[data-recordatorio]", { hasText: "CONFIRMAR CITA" }).first();
    const cEnColumna = await caja(p, enColumna);
    await marcar(p, [{ c: cEnColumna, texto: "Título, contacto, hora y envíos", lado: "derecha" }], { atenuar: true });
    await guardar(p, "kanban-tarjeta.webp", holgura(unir(await caja(p, laColumna(p, "tomorrow")), { ...cEnColumna, w: cEnColumna.w + 300 }), 10, p.viewportSize()));
    await desmarcar(p);
    const engranaje = laColumna(p, "recurring").locator('[data-boton="automatizaciones"]');
    await engranaje.click();
    const hoja = p.locator('[data-automatizaciones-del-grupo="recurring"]');
    await hoja.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 1200);
    await marcar(p, [{ c: await caja(p, engranaje), n: 1, borde: "abajo" }, { c: await caja(p, hoja), n: 2, esquina: "izquierda" }], { atenuar: true });
    await guardar(p, "kanban-engranaje.webp");
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 600);
    await p.setViewportSize({ width: 1440, height: 900 });
    await laVista(p, "Lista").click();
    await espera(p, 1200);

    // 4. Crear: la ventana, campo a campo. El recordatorio se crea DE VERDAD al final.
    await marcar(p, [{ c: await caja(p, EL_NUEVO(p)), texto: "Nuevo", lado: "abajo" }]);
    await guardar(p, "crear-boton.webp", zonaDeLaBarra);
    await desmarcar(p);
    await abrirLaVentana(p);
    const cVentana = () => caja(p, LA_VENTANA);
    await elCampo(p, "titulo").locator("input").pressSequentially("Pedido listo", { delay: 20 });
    await elCampo(p, "mensaje").locator("textarea").fill("Hola @client_name, tu pedido ya está listo para recoger en la tienda.");
    await marcar(p, [
        { c: await caja(p, elCampo(p, "titulo")), n: 1, esquina: "derecha" },
        { c: await caja(p, elCampo(p, "mensaje")), texto: "@client_name pone su nombre", lado: "derecha" },
    ]);
    await guardar(p, "crear-titulo.webp", holgura(await cVentana(), 40, vista));
    await desmarcar(p);

    // 5. Adjuntar: los cuatro tipos, un documento, y una nota de voz grabada ahí.
    const cArchivo = await aLaVistaYMedir(p, elCampo(p, "archivo"));
    const tipos = ["Imagen", "Video", "Audio", "Doc."];
    await marcar(p, await Promise.all(tipos.map(async (t, i) => ({ c: await caja(p, elBotonDeArchivo(p, t)), n: i + 1, lado: "arriba" }))));
    await guardar(p, "adjunto-botones.webp", holgura(unir(await cVentana(), cArchivo), 30, vista));
    await desmarcar(p);
    const [elector] = await Promise.all([p.waitForEvent("filechooser"), elBotonDeArchivo(p, "Doc.").click()]);
    await elector.setFiles(EL_DOCUMENTO);
    await LA_VISTA_PREVIA(p).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await queNadaSalgaRecortado(p, LA_VENTANA);
    await marcar(p, [{ c: await aLaVistaYMedir(p, LA_VISTA_PREVIA(p)), texto: "El archivo elegido", lado: "abajo" }]);
    await guardar(p, "adjunto-elegido.webp", holgura(await cVentana(), 30, vista));
    await desmarcar(p);
    // Se quita el documento: el recordatorio de las capturas lleva la nota de voz.
    await elCampo(p, "archivo").locator("button:has(svg.lucide-trash2), button:has(svg.lucide-trash-2)").first().click();
    await espera(p, 400);
    await elMando(p, "grabar").click();
    await elMando(p, "detener").waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 2600);
    await marcar(p, [
        // Números y no rótulos: el rótulo de debajo tapaba el tiempo y la ayuda.
        { c: await caja(p, elCampo(p, "archivo").locator("[data-mandos-del-grabador]")), n: 1 },
        { c: await caja(p, elCampo(p, "archivo").locator("[data-tiempo]")), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "adjunto-grabar.webp", holgura(await cVentana(), 30, vista));
    await desmarcar(p);
    await elMando(p, "detener").click();
    const escuchar = elCampo(p, "archivo").locator("audio[data-escuchar]");
    await escuchar.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    // Números y no rótulos: un rótulo debajo tapaba la duración y la ayuda.
    await marcar(p, [
        { c: await caja(p, escuchar), n: 1, esquina: "derecha" },
        { c: await caja(p, elMando(p, "usar")), n: 2 },
    ]);
    await guardar(p, "adjunto-grabacion.webp", holgura(await cVentana(), 30, vista));
    await desmarcar(p);
    await elMando(p, "usar").click();
    await LA_VISTA_PREVIA(p).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);

    // 6. Fecha, hora y repetición.
    const dia = elDiaQueSeElige();
    await aLaVistaYMedir(p, elCampo(p, "fecha"));
    await EL_DIA(p).click();
    const calendario = p.locator("[data-radix-popper-content-wrapper]").filter({ has: p.locator('button[name="day"]') }).last();
    await calendario.waitFor({ state: "visible", timeout: 10000 });
    const elDia = await elegirElDia(p, calendario, dia);
    await espera(p, 400);
    await marcar(p, [{ c: await caja(p, EL_DIA(p)), n: 1, borde: "abajo" }, { c: await caja(p, calendario), n: 2, esquina: "derecha" }], { atenuar: true });
    await guardar(p, "fecha-calendario.webp", holgura(unir(await caja(p, calendario), await caja(p, elCampo(p, "fecha"))), 40, vista));
    await desmarcar(p);
    await elDia.click();
    await espera(p, 400);
    await LAS_HORAS(p).nth(0).selectOption("10");
    await LAS_HORAS(p).nth(1).selectOption("30");
    await espera(p, 300);
    await marcar(p, [
        { c: await caja(p, LAS_HORAS(p).nth(0)), n: 1, lado: "arriba" },
        { c: await caja(p, LAS_HORAS(p).nth(1)), n: 2, lado: "arriba" },
    ]);
    await guardar(p, "fecha-hora.webp", holgura(await cVentana(), 30, vista));
    await desmarcar(p);
    await elCampo(p, "repeticion").getByRole("combobox").click();
    const repeticiones = p.locator('[role="listbox"]').last();
    await repeticiones.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await marcar(p, [{ c: await caja(p, elCampo(p, "repeticion").getByRole("combobox")), n: 1, borde: "abajo" }, { c: await caja(p, repeticiones), n: 2, esquina: "derecha" }], { atenuar: true });
    await guardar(p, "fecha-repeticion.webp", holgura(unir(await caja(p, repeticiones), await caja(p, elCampo(p, "repeticion"))), 40, vista));
    await desmarcar(p);
    await repeticiones.getByRole("option", { name: "Cada semana", exact: true }).click();
    await espera(p, 400);

    // El contacto: el buscador de leads.
    const contacto = await elegirEnElBuscador(p, "contacto", "Laura", "Laura Méndez");
    await espera(p, 300);
    await marcar(p, [{ c: await caja(p, elCampo(p, "contacto").getByRole("combobox")), n: 1, borde: "abajo" }, { c: await caja(p, contacto.pop), n: 2, esquina: "derecha" }], { atenuar: true });
    await guardar(p, "crear-contacto.webp", holgura(unir(await caja(p, contacto.pop), await caja(p, elCampo(p, "contacto"))), 40, vista));
    await desmarcar(p);
    await contacto.item.click();
    await espera(p, 400);

    // 7. El flujo asociado.
    const flujo = await elegirEnElBuscador(p, "flujo", "", "Confirmar cita");
    await espera(p, 300);
    await marcar(p, [{ c: await caja(p, elCampo(p, "flujo").getByRole("combobox")), n: 1, borde: "abajo" }, { c: await caja(p, flujo.pop), n: 2, esquina: "derecha" }], { atenuar: true });
    await guardar(p, "flujo-elegir.webp", holgura(unir(await caja(p, flujo.pop), await caja(p, elCampo(p, "flujo"))), 40, vista));
    await desmarcar(p);
    await flujo.item.click();
    await espera(p, 400);
    await queNadaSalgaRecortado(p, LA_VENTANA);
    await marcar(p, [{ c: await aLaVistaYMedir(p, elCampo(p, "flujo")), texto: "Arranca justo después del mensaje", lado: "arriba" }]);
    await guardar(p, "flujo-elegido.webp", holgura(await cVentana(), 30, vista));
    await desmarcar(p);

    // Crear: el recordatorio aparece en la lista.
    const crear = p.locator(`${LA_VENTANA} [data-boton="crear"]`);
    await crear.click();
    await p.waitForSelector("[data-sonner-toast]", { timeout: 20000 });
    await laTarjeta(p, "PEDIDO LISTO").waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1500);
    await queNadaSalgaRecortado(p);
    const nuevo = laTarjeta(p, "PEDIDO LISTO");
    await nuevo.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 400);
    await marcar(p, [{ c: await caja(p, nuevo), texto: "El recordatorio nuevo", lado: "abajo" }, { c: await caja(p, p.locator("[data-sonner-toast]").last()) }], { atenuar: true });
    await guardar(p, "crear-creado.webp");
    await desmarcar(p);
    await quitarAvisos(p);
    const cNuevo = await caja(p, nuevo);
    await marcar(
        p,
        [
            { c: await loEscrito(p, laParte(p, "PEDIDO LISTO", "hora")), n: 1, numeroEn: { x: cNuevo.x - 20, y: (await caja(p, laParte(p, "PEDIDO LISTO", "hora"))).y + 8 } },
            { c: await caja(p, laParte(p, "PEDIDO LISTO", "repeticion")), n: 2, numeroEn: { x: (await caja(p, laParte(p, "PEDIDO LISTO", "repeticion"))).x + 30, y: cNuevo.y - 22 } },
        ],
        { atenuar: true },
    );
    await guardar(p, "fecha-en-la-lista.webp", holgura({ x: cNuevo.x - 44, y: cNuevo.y - 44, w: cNuevo.w + 60, h: cNuevo.h + 66 }, 10, vista));
    await desmarcar(p);
    const cFlujo = await loEscrito(p, laParte(p, "PEDIDO LISTO", "flujo"));
    await marcar(p, [{ c: cFlujo, texto: "El flujo que arranca", lado: "derecha" }], { atenuar: true });
    await guardar(p, "flujo-en-la-lista.webp", holgura({ x: cNuevo.x - 44, y: cNuevo.y - 44, w: cNuevo.w + 60, h: cNuevo.h + 66 }, 10, vista));
    await desmarcar(p);

    // 8. El historial de envíos (el de uno que falló: así se ven los tres botones).
    const conFallo = "RENOVAR PLAN";
    const estado = laParte(p, conFallo, "estado");
    await estado.scrollIntoViewIfNeeded();
    await espera(p, 400);
    await marcar(p, [{ c: await caja(p, estado), texto: "Abre el historial", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "historial-boton.webp", holgura(await caja(p, laTarjeta(p, conFallo)), 30, vista));
    await desmarcar(p);
    await estado.click();
    const historial = p.locator(EL_HISTORIAL);
    await historial.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 800);
    const cHistorial = await caja(p, historial);
    await soltarElFoco(p);
    const cifras = historial.locator('[data-zona="cifras-del-historial"] > div');
    await marcar(p, await Promise.all([0, 1, 2, 3].map(async (i) => ({ c: await caja(p, cifras.nth(i)), n: i + 1, lado: "arriba" }))));
    await guardar(p, "historial-cifras.webp", holgura(cHistorial, 30, vista));
    await desmarcar(p);
    const envio = historial.locator("[data-envio]").first();
    await soltarElFoco(p);
    await marcar(p, [{ c: await caja(p, envio), texto: "Estado, intentos y por qué falló", lado: "abajo" }]);
    await guardar(p, "historial-envio.webp", holgura(cHistorial, 30, vista));
    await desmarcar(p);
    const botones = historial.locator('[data-zona="mandos-del-historial"] button');
    await soltarElFoco(p);
    await marcar(p, await Promise.all([0, 1, 2].map(async (i) => ({ c: await caja(p, botones.nth(i)), n: i + 1, lado: "abajo" }))));
    await guardar(p, "historial-mandos.webp", holgura(cHistorial, 30, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await historial.waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 400);

    // 9. Editar y eliminar: la ventana se CANCELA; nada de esta sección borra.
    const aEditar = "CONFIRMAR CITA";
    await laTarjeta(p, aEditar).scrollIntoViewIfNeeded();
    const lapiz = laTarjeta(p, aEditar).locator('[data-boton="editar"]');
    await marcar(p, [{ c: await caja(p, lapiz), texto: "Editar", lado: "abajo" }], { atenuar: true });
    await guardar(p, "editar-lapiz.webp", holgura(await caja(p, laTarjeta(p, aEditar)), 40, vista));
    await desmarcar(p);
    await lapiz.click();
    await p.waitForSelector(`${LA_VENTANA} [data-boton="guardar"]`, { timeout: 15000 });
    await espera(p, 800);
    await queNadaSalgaRecortado(p, LA_VENTANA);
    const guardarBoton = p.locator(`${LA_VENTANA} [data-boton="guardar"]`);
    await guardarBoton.scrollIntoViewIfNeeded();
    await marcar(p, [{ c: await caja(p, guardarBoton), texto: "Actualizar", lado: "arriba" }]);
    await guardar(p, "editar-ventana.webp", holgura(await cVentana(), 30, vista));
    await desmarcar(p);
    await cerrarLaVentana(p);
    const papelera = laTarjeta(p, aEditar).locator('[data-boton="eliminar"]');
    await papelera.click();
    const alerta = p.locator(LA_ALERTA);
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    const cAlerta = await caja(p, alerta);
    const cancelar = alerta.getByRole("button", { name: "Cancelar" });
    await marcar(p, [
        { c: await caja(p, cancelar), texto: "No cambia nada", lado: "abajo" },
        { c: await caja(p, alerta.getByRole("button", { name: "Eliminar" })), texto: "Lo borra para siempre", lado: "abajo" },
    ]);
    await guardar(p, "eliminar-confirmar.webp", holgura(unir(cAlerta, { ...cAlerta, y: cAlerta.y + cAlerta.h + 84, h: 1 }), 26, vista));
    await desmarcar(p);
    await cancelar.click();
    await alerta.waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 400);
    await p.locator(LAS_MASIVAS).first().click();
    const menuMasivas = p.locator('[role="menu"]').last();
    await menuMasivas.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cMenuMasivas = await caja(p, menuMasivas);
    await marcar(p, [
        { c: await caja(p, LAS_MASIVAS), n: 1 },
        { c: await caja(p, menuMasivas.getByRole("menuitem", { name: "Eliminar todos" })), n: 2 },
    ]);
    await guardar(p, "eliminar-todos.webp", holgura(unir(cMenuMasivas, await caja(p, LAS_MASIVAS), { ...cMenuMasivas, x: cMenuMasivas.x - 200 }), 26, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    await elMarcoDeLaPantalla(p, guardar, { modulo: "Automatizaciones", texto: "Recordatorios está en Automatizaciones" });
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/** Entre una frase y la siguiente, lo que respira una persona hablando (el de Leads). */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

/**
 * Como `pulsar`, pero sin su pausa: el cursor llega en pocos pasos y pulsa.
 * Para una escena con más acciones que palabras; lo de dentro de la ventana ya
 * está a la vista y destapado.
 */
async function tocar(p, locator) {
    const b = await locator.boundingBox();
    if (!b) throw new Error(`[guia] no se ve lo que el vídeo tenía que pulsar: ${locator}`);
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
    await p.mouse.down();
    await espera(p, 60);
    await p.mouse.up();
}

async function video(navegador, estado) {
    const dir = path.join(TMP, "video");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    // Las frases se sintetizan ANTES de grabar: así se sabe cuánto dura cada una.
    const voz = await prepararLaVoz(NARRACION, dir, comoSeDice);
    const ctx = await navegador.newContext({
        viewport: { width: 1280, height: 800 },
        locale: "es-CO",
        timezoneId: "America/Bogota",
        storageState: estado,
        permissions: ["microphone"],
    });
    await sinBucket(ctx);
    await ctx.addInitScript(CURSOR);
    const p = await ctx.newPage();
    // No `recordVideo`: estiraba el vídeo cada vez que el navegador pintaba
    // deprisa y la imagen se iba quedando detrás de la voz (ver la grabadora).
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirLaPantalla(p);
    await p.mouse.move(640, 400, { steps: 8 });
    // Lo grabado hasta aquí es la página cargando: el vídeo empieza justo
    // antes de la primera palabra.
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("programas un mensaje", 300);
    await mover(p, laTarjeta(p, "CONFIRMAR CITA"));
    await alDecir("a la hora que tú elijas", 200);
    await mover(p, laParte(p, "CONFIRMAR CITA", "hora"));

    // El menú: se abre con las dos flechas, se señala Automatizaciones y se
    // vuelve a recoger al empezar la frase de la barra de arriba.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const automatizaciones = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Automatizaciones" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Automatizaciones", 600);
    await mover(p, automatizaciones);

    const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // La lista: contacto, fecha y flujo; y el buscador.
    const buscador = p.locator(EL_BUSCADOR);
    await decir("lista");
    await alDecir("con su contacto");
    await mover(p, laParte(p, "RECORDAR CUOTA", "contacto"));
    await alDecir("su fecha");
    await mover(p, laParte(p, "RECORDAR CUOTA", "hora"));
    await alDecir("y su flujo");
    await mover(p, laParte(p, "RECORDAR CUOTA", "flujo"));
    await alDecir("con el buscador");
    await pulsar(p, buscador);
    await buscador.pressSequentially("laura", { delay: 110 });
    await alDecir("el nombre del contacto", 200);
    await mover(p, lasTarjetas(p).first());

    // El tablero: las seis columnas, de una en una.
    await decir("kanban");
    await buscador.fill("");
    await alDecir("Con Kanban");
    await pulsar(p, laVista(p, "Kanban"));
    await laColumna(p, "pending").waitFor({ state: "visible", timeout: 15000 });
    const cabeza = (k) => laColumna(p, k).locator("> div").first();
    await alDecir("los pendientes");
    await mover(p, cabeza("pending"));
    await alDecir("los de hoy");
    await mover(p, cabeza("today"));
    await alDecir("los de mañana");
    await mover(p, cabeza("tomorrow"));
    await alDecir("los que se repiten");
    await mover(p, cabeza("recurring"));
    await alDecir("los enviados");
    await mover(p, cabeza("sent"));
    await alDecir("y los vencidos");
    await mover(p, cabeza("expired"));

    // Crear: título, mensaje y contacto.
    const ventana = p.locator(LA_VENTANA);
    await decir("crear");
    await pulsar(p, laVista(p, "Lista"));
    await alDecir("Con Nuevo");
    await pulsar(p, EL_NUEVO(p));
    await ventana.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    // La frase dura menos de seis segundos para título, mensaje y contacto:
    // aquí el cursor va directo (`tocar`), sin la pausa de `pulsar`, o la
    // escena se come la frase y deja un hueco mudo antes de la siguiente.
    await alDecir("le pones un título");
    await tocar(p, elCampo(p, "titulo").locator("input"));
    await elCampo(p, "titulo").locator("input").pressSequentially("Pedido listo", { delay: 30 });
    await alDecir("el mensaje", 150);
    await tocar(p, elCampo(p, "mensaje").locator("textarea"));
    await elCampo(p, "mensaje").locator("textarea").pressSequentially("Hola @client_name, tu pedido está listo.", { delay: 12 });
    // El contacto queda debajo del pie fijo de la ventana: se trae al centro.
    await elCampo(p, "contacto").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await alDecir("eliges el contacto");
    await tocar(p, elCampo(p, "contacto").getByRole("combobox"));
    const contactos = p.locator("[data-radix-popper-content-wrapper]").filter({ has: p.locator("[cmdk-input]") }).last();
    await contactos.waitFor({ state: "visible", timeout: 10000 });
    await contactos.locator("[cmdk-input]").pressSequentially("Lau", { delay: 40 });
    await tocar(p, contactos.locator("[cmdk-item]", { hasText: "Laura Méndez" }).first());

    // Adjuntar: los tipos, y una nota de voz grabada ahí mismo.
    await decir("adjunto");
    await alDecir("una foto, un video");
    await mover(p, elBotonDeArchivo(p, "Imagen"));
    await alDecir("o un documento", 100);
    await mover(p, elBotonDeArchivo(p, "Doc."));
    // Grabar, detener y usar tardan más que lo que queda de la frase: se
    // empieza en «o grabar» y «Usar grabación» se pulsa ya con la frase de la
    // fecha sonando, o quedaba un hueco mudo de cuatro segundos.
    await alDecir("o grabar");
    await pulsar(p, elMando(p, "grabar"));
    await elMando(p, "detener").waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 900);
    await pulsar(p, elMando(p, "detener"));
    await elMando(p, "usar").waitFor({ state: "visible", timeout: 10000 });

    // Fecha, hora y repetición.
    const dia = elDiaQueSeElige();
    await decir("fecha");
    await pulsar(p, elMando(p, "usar"));
    await alDecir("la fecha en el calendario");
    await pulsar(p, EL_DIA(p));
    const calendario = p.locator("[data-radix-popper-content-wrapper]").filter({ has: p.locator('button[name="day"]') }).last();
    await calendario.waitFor({ state: "visible", timeout: 10000 });
    await pulsar(p, await elegirElDia(p, calendario, dia));
    await alDecir("la hora", 150);
    await LAS_HORAS(p).nth(0).selectOption("10");
    await LAS_HORAS(p).nth(1).selectOption("30");
    await alDecir("y si quieres");
    await pulsar(p, elCampo(p, "repeticion").getByRole("combobox"));
    const repeticiones = p.locator('[role="listbox"]').last();
    await repeticiones.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("cada semana", 0);
    await pulsar(p, repeticiones.getByRole("option", { name: "Cada semana", exact: true }));

    // El flujo, y al crearlo aparece en la lista.
    await decir("flujo");
    await alDecir("un flujo");
    await pulsar(p, elCampo(p, "flujo").getByRole("combobox"));
    const flujos = p.locator("[data-radix-popper-content-wrapper]").filter({ has: p.locator("[cmdk-input]") }).last();
    await flujos.waitFor({ state: "visible", timeout: 10000 });
    await pulsar(p, flujos.locator("[cmdk-item]", { hasText: "Confirmar cita" }).first());
    await alDecir("al crearlo");
    await pulsar(p, p.locator(`${LA_VENTANA} [data-boton="crear"]`));
    await laTarjeta(p, "PEDIDO LISTO").waitFor({ state: "visible", timeout: 30000 });
    await alDecir("aparece en la lista", 200);
    await mover(p, laTarjeta(p, "PEDIDO LISTO"));

    // El historial: el de uno que falló.
    const historial = p.locator(EL_HISTORIAL);
    await decir("historial");
    await alDecir("El botón de envíos");
    await pulsar(p, laParte(p, "RENOVAR PLAN", "estado"));
    await historial.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("qué salió");
    await mover(p, historial.locator('[data-zona="cifras-del-historial"]'));
    await alDecir("qué falló", 100);
    await mover(p, historial.locator("[data-envio]").first());
    await alDecir("reintentas o pausas");
    await mover(p, historial.locator('[data-zona="mandos-del-historial"] button').first());

    // Cierre: el lápiz y la papelera; la ventana se CANCELA.
    const alerta = p.locator(LA_ALERTA);
    await decir("cierre");
    await p.keyboard.press("Escape");
    await historial.waitFor({ state: "hidden", timeout: 10000 });
    await alDecir("Con el lápiz");
    await mover(p, laTarjeta(p, "CONFIRMAR CITA").locator('[data-boton="editar"]'));
    await alDecir("con la papelera");
    await pulsar(p, laTarjeta(p, "CONFIRMAR CITA").locator('[data-boton="eliminar"]'));
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("siempre con confirmación", 200);
    await pulsar(p, alerta.getByRole("button", { name: "Cancelar" }));
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
    // Qué voz lleva el vídeo publicado: el banco lo compara con el guion de hoy.
    escribirLaVozDelVideo("recordatorios", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
    console.log("  ✓ demostracion.webm", Math.round(statSync(destino).size / 1024), "KB,", colocados.length, "frases narradas");
}

/* ------------------------------------------------------------------ */

// El micrófono de mentira de Chromium: la nota de voz se graba de verdad con él.
const navegador = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
try {
    const ctx = await navegador.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        locale: "es-CO",
        timezoneId: "America/Bogota",
        permissions: ["microphone"],
    });
    await sinBucket(ctx);
    const p = await entrar(ctx, BASE);
    await abrirLaPantalla(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        // Las capturas crean un recordatorio: el vídeo sale del mismo punto de
        // partida que ellas.
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-recordatorios.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

// Las que la guía enseña tienen que estar TODAS (con una parte, lo demás se conserva del disco).
comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/recordatorios`);
