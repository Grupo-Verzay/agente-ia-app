/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Follow-ups IA
 * (`/crm/rules`), sobre la App servida de verdad (`next start`, sesión real y
 * los datos de `sembrar-guia-follow-ups.mjs`).
 *
 * La MISMA receta que las demás guías y con las MISMAS piezas del taller
 * (`taller-de-la-guia.mjs`): cada captura es «abre esto, pulsa aquello, resalta
 * este elemento», y las marcas se localizan por lo que la pantalla expone —las
 * pestañas (`data-pestana`), los pasos del asistente (`data-paso`), las tarjetas
 * y los campos (`data-zona`)—, no por coordenadas escritas a mano.
 *
 * Los archivos de la biblioteca de ejemplo apuntan a `archivos.ejemplo.co`, y
 * los contesta este script (`ctx.route`): la guía no depende de ninguna web.
 *
 * Nada de lo que se guarda cambia: lo que se escribe para encender «Guardar»
 * se deshace con «Resetear cambios», el archivo que se elige en la biblioteca
 * no se sube y el desplegable del flujo se cierra sin elegir. Aun así, antes
 * del vídeo se vuelve a sembrar.
 *
 * Qué captura hace falta lo dice `lib/guia-follow-ups.ts`: el script se niega a
 * terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-follow-ups.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-follow-ups.mjs";
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
const sharp = require("sharp");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "follow-ups");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-follow-ups";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
// Solo el vídeo (p. ej. al cambiar la narración): las imágenes se conservan del disco.
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-follow-ups.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-follow-ups.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Los archivos de ejemplo de la biblioteca                            */
/* ------------------------------------------------------------------ */

/** Una imagen ilustrada, sin fotos de nadie: la guía es pública. */
async function unaImagen(titulo, de, a) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${de}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs>
        <rect width="800" height="600" fill="url(#g)"/>
        <rect x="80" y="170" width="640" height="260" rx="28" fill="#ffffff" opacity="0.92"/>
        <text x="400" y="300" font-family="DejaVu Sans, sans-serif" font-size="52" font-weight="700" text-anchor="middle" fill="#1e293b">${titulo}</text>
        <text x="400" y="365" font-family="DejaVu Sans, sans-serif" font-size="30" text-anchor="middle" fill="#475569">Mi Negocio · 2026</text>
    </svg>`;
    return sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toBuffer();
}

/** Un PDF de una página, lo justo para que el navegador lo reconozca. */
function unPdf() {
    return Buffer.from(
        "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
            "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
    );
}

/** Un audio de verdad: una frase de la caché de la voz Cedar. */
function unAudio() {
    const dir = path.join(RAIZ, "scripts", "voz-de-la-guia", "cedar");
    const primero = readdirSync(dir).find((f) => f.endsWith(".ogg"));
    return readFileSync(path.join(dir, primero));
}

async function servirLosArchivosDeEjemplo(ctx) {
    const catalogo = await unaImagen("Catálogo 2026", "#3b82f6", "#a855f7");
    const pdf = unPdf();
    const audio = unAudio();
    await ctx.route("https://archivos.ejemplo.co/**", (ruta) => {
        const url = ruta.request().url();
        if (url.endsWith(".jpg")) return ruta.fulfill({ status: 200, contentType: "image/jpeg", body: catalogo });
        if (url.endsWith(".pdf")) return ruta.fulfill({ status: 200, contentType: "application/pdf", body: pdf });
        if (url.endsWith(".mp3")) return ruta.fulfill({ status: 200, contentType: "audio/ogg", body: audio });
        return ruta.fulfill({ status: 404, body: "" });
    });
}

/* ------------------------------------------------------------------ */
/* Abrir y moverse                                                     */
/* ------------------------------------------------------------------ */

async function abrir(p) {
    await p.goto(`${BASE}/crm/rules`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector('[data-zona="pestanas"]', { timeout: 90000 });
    await p.waitForSelector('[data-zona="rol"]', { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
}

/** Lo primero que pinta cada pestaña: hasta que no está, la pestaña no ha cargado. */
const LO_PRIMERO_DE = { leadFunnel: '[data-zona="rol"]', leadStatus: '[data-zona="identidad"]', followUps: '[data-zona="regla"]' };

const laPestana = (p, v) => p.locator(`[data-pestana="${v}"]`).first();
const elPaso = (p, id) => p.locator(`[data-paso="${id}"]:visible`).first();
const zona = (p, z) => p.locator(`[data-zona="${z}"]:visible`).first();
const elPie = (p) => zona(p, "pie");
const elBoton = (p, nombre) => elPie(p).getByRole("button", { name: nombre, exact: true }).first();
const laRegla = (p) => zona(p, "regla");
const elInterruptor = (p, estado) => p.locator(`#rule-enabled-${estado}`).first();
const losCampos = (p, z) => p.locator(`[data-zona="${z}"]:visible [class~="space-y-4"] > div`);

async function aLaPestana(p, v) {
    await laPestana(p, v).click();
    await p.waitForSelector(`${LO_PRIMERO_DE[v]}:visible`, { timeout: 30000 });
    await espera(p, 900);
}

async function alPaso(p, id, espero) {
    await elPaso(p, id).click();
    if (espero) await p.locator(`${espero}:visible`).first().waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 700);
}

/** Trae a la vista algo de dentro del contenido (que se desplaza solo) y lo mide. */
async function aLaVista(p, loc) {
    const l = typeof loc === "string" ? p.locator(loc).first() : loc;
    await l.scrollIntoViewIfNeeded();
    await espera(p, 350);
    return caja(p, l);
}

/** Lo que se ve del contenido con aire arriba y a la izquierda: el número de una tarjeta asoma por su esquina. */
function conAireArriba(c) {
    const x = Math.max(0, c.x - 18);
    const y = Math.max(0, c.y - 18);
    return { x, y, w: c.w + (c.x - x), h: c.h + (c.y - y) };
}

/** Lo que se ve del contenido: recortado a la pantalla, sin el pie. */
async function loQueSeVeDelContenido(p) {
    const c = await caja(p, zona(p, "contenido"));
    const vista = p.viewportSize();
    return { x: c.x, y: c.y, w: Math.min(c.w, vista.width - c.x - 8), h: Math.min(c.h, vista.height - c.y - 8) };
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

async function miniaturas(p) {
    const focos = {};
    const mini = async (slug, zonaDeLaMini, despues) => {
        Object.assign(focos, await tomarUnaMiniatura(p, slug, await zonaDeLaMini(), { salida: SALIDA, tomadas }));
        await cerrarLoAbierto(p);
        if (despues) await despues();
    };

    await mini("vista-general", async () => unir(await caja(p, zona(p, "pestanas")), await caja(p, zona(p, "pasos"))));
    await mini("sintetizador", () => aLaVista(p, zona(p, "rol")));
    await aLaPestana(p, "leadStatus");
    await mini("clasificacion", () => aLaVista(p, zona(p, "identidad")));
    await aLaPestana(p, "followUps");
    await mini("follow-ups-por-estado", () => caja(p, zona(p, "pasos")));
    await mini("tiempos-e-intentos", async () => unir(await aLaVista(p, zona(p, "espera")), await caja(p, zona(p, "intentos"))));
    await mini("horario", async () => unir(await aLaVista(p, zona(p, "desde")), await caja(p, zona(p, "hasta")), await caja(p, zona(p, "dias"))));
    await mini("mensajes", async () => unir(await aLaVista(p, zona(p, "objetivo")), await caja(p, zona(p, "respaldo"))));
    await alPaso(p, "TIBIO", '[data-regla="TIBIO"]');
    await mini(
        "biblioteca",
        async () => {
            await zona(p, "abrir-biblioteca").click();
            await p.locator('[data-zona="archivos"] [data-archivo]').first().waitFor({ state: "visible", timeout: 30000 });
            await espera(p, 1200);
            return aLaVista(p, zona(p, "archivos"));
        },
        async () => {
            await zona(p, "abrir-biblioteca").click();
            await espera(p, 500);
        },
    );
    await alPaso(p, "CALIENTE", '[data-regla="CALIENTE"]');
    await mini("flujo-por-estado", () => aLaVista(p, zona(p, "flujo")));
    await alPaso(p, "summary", '[data-zona="estados-configurados"]');
    await mini("resumen-y-guardar", async () => unir(await caja(p, zona(p, "estados-configurados")), await caja(p, elBoton(p, "Guardar reglas"))));

    await desmarcar(p);
    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
    await abrir(p);
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();

    // Portada del vídeo: la pantalla limpia.
    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las cinco zonas de `ZONAS_DE_LA_PANTALLA`.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cPestanas = await caja(p, zona(p, "pestanas"));
    const cPasos = await caja(p, zona(p, "pasos"));
    const cPie = await caja(p, elPie(p));
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: cPestanas, n: 3 },
        { c: cPasos, n: 4 },
        { c: cPie, n: 5 },
    ]);
    await guardar(p, "vista-general.webp");
    await desmarcar(p);
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");

    // Las tres pestañas, numeradas.
    const pestanas = [];
    for (const v of ["leadFunnel", "leadStatus", "followUps"]) pestanas.push(await caja(p, laPestana(p, v)));
    await marcar(p, pestanas.map((c, i) => ({ c, n: i + 1 })));
    await guardar(p, "pestanas.webp", holgura(unir(...pestanas), 40, vista));
    await desmarcar(p);

    // Los pasos arriba y los botones abajo.
    await marcar(p, [
        { c: cPasos, texto: "Los pasos: pulsa cualquiera", lado: "derecha" },
        { c: await caja(p, elBoton(p, "Anterior")) },
        { c: await caja(p, elBoton(p, "Siguiente")) },
        { c: await caja(p, elBoton(p, "Guardar sintetizador")), texto: "Guarda", lado: "arriba" },
    ], { atenuar: true });
    await guardar(p, "pasos-y-botones.webp");
    await desmarcar(p);

    // 2. El sintetizador, paso a paso.
    const rol = zona(p, "rol");
    const cRol = await aLaVista(p, rol);
    const camposDelRol = losCampos(p, "rol");
    const marcasDelRol = [];
    for (let i = 0; i < 3; i += 1) marcasDelRol.push({ c: await caja(p, camposDelRol.nth(i)), n: i + 1 });
    await marcar(p, marcasDelRol);
    await guardar(p, "sintetizador-marco.webp", holgura(cRol, 24, vista));
    await desmarcar(p);

    await alPaso(p, "rules", '[data-zona="reglas"]');
    await marcar(p, [
        { c: await aLaVista(p, zona(p, "reglas")), n: 1 },
        { c: await caja(p, zona(p, "cierre")), n: 2 },
    ]);
    await guardar(p, "sintetizador-reglas.webp", await loQueSeVeDelContenido(p));
    await desmarcar(p);

    await alPaso(p, "types", '[data-zona="tipo"]');
    const tipos = p.locator('[data-zona="tipo"]:visible');
    await tipos.first().scrollIntoViewIfNeeded();
    const marcasDeTipos = [];
    const contenido = await loQueSeVeDelContenido(p);
    for (let i = 0; i < (await tipos.count()); i += 1) {
        const c = await caja(p, tipos.nth(i));
        if (c.y + c.h <= contenido.y + contenido.h) marcasDeTipos.push({ c, n: i + 1, sinRecuadro: true });
    }
    await marcar(p, marcasDeTipos);
    await guardar(p, "sintetizador-tipos.webp", conAireArriba(contenido));
    await desmarcar(p);

    await alPaso(p, "preview", '[data-zona="prompt-generado"]');
    const resumen = zona(p, "resumen");
    await marcar(p, [
        { c: await aLaVista(p, resumen.locator("> div").last().locator("> div").first()), n: 1 },
        { c: await caja(p, zona(p, "prompt-generado").locator("textarea")), n: 2 },
    ]);
    await guardar(p, "sintetizador-previsualizacion.webp", await loQueSeVeDelContenido(p));
    await desmarcar(p);

    // Guardar: se escribe algo para que los botones se enciendan, y se deshace.
    await alPaso(p, "base", '[data-zona="rol"]');
    const primerCampo = losCampos(p, "rol").first().locator("textarea");
    await primerCampo.click();
    await p.keyboard.press("Control+End");
    await p.keyboard.type(" Responde siempre en español.");
    await espera(p, 500);
    await p.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    const botonesDeGuardar = [
        { c: await caja(p, elBoton(p, "Resetear cambios")), n: 1 },
        { c: await caja(p, elBoton(p, "Restaurar valores de fábrica")), n: 2 },
        { c: await caja(p, elBoton(p, "Guardar sintetizador")), n: 3 },
    ];
    await marcar(p, botonesDeGuardar, { atenuar: true });
    await guardar(p, "sintetizador-guardar.webp", holgura(await caja(p, elPie(p)), 50, vista));
    await desmarcar(p);
    await elBoton(p, "Resetear cambios").click();
    await espera(p, 800);
    await quitarAvisos(p);

    // 3. La clasificación de leads.
    await aLaPestana(p, "leadStatus");
    const cIdentidad = await aLaVista(p, zona(p, "identidad"));
    const camposDeIdentidad = losCampos(p, "identidad");
    const marcasDeIdentidad = [];
    for (let i = 0; i < 3; i += 1) marcasDeIdentidad.push({ c: await caja(p, camposDeIdentidad.nth(i)), n: i + 1 });
    await marcar(p, marcasDeIdentidad);
    await guardar(p, "clasificacion-marco.webp", holgura(cIdentidad, 24, vista));
    await desmarcar(p);

    for (const [paso, cual, nombre] of [
        ["definitions", "definicion", "clasificacion-definiciones.webp"],
        ["criteria", "criterio", "clasificacion-criterios.webp"],
    ]) {
        await alPaso(p, paso, `[data-zona="${cual}"]`);
        const tarjetas = p.locator(`[data-zona="${cual}"]:visible`);
        await tarjetas.first().scrollIntoViewIfNeeded();
        await espera(p, 300);
        const visto = await loQueSeVeDelContenido(p);
        const marcas = [];
        for (let i = 0; i < (await tarjetas.count()); i += 1) {
            const c = await caja(p, tarjetas.nth(i));
            if (c.y + c.h <= visto.y + visto.h) marcas.push({ c, n: marcas.length + 1, sinRecuadro: true });
        }
        await marcar(p, marcas);
        await guardar(p, nombre, conAireArriba(visto));
        await desmarcar(p);
    }

    await alPaso(p, "preview", '[data-zona="prompt-generado"]');
    await marcar(p, [
        { c: await caja(p, zona(p, "prompt-generado")), texto: "Lo que leerá la IA", lado: "izquierda" },
        { c: await caja(p, elBoton(p, "Guardar clasificación")), texto: "Publícalo", lado: "arriba" },
    ], { atenuar: true });
    await guardar(p, "clasificacion-previsualizacion.webp");
    await desmarcar(p);

    // 4. Los follow-ups por estado.
    await aLaPestana(p, "followUps");
    const cPasosDeEstados = await caja(p, zona(p, "pasos"));
    await marcar(p, [{ c: cPasosDeEstados, texto: "Un paso por estado, y el resumen al final", lado: "derecha" }], { atenuar: true });
    await guardar(p, "estados.webp", holgura(unir(cPasosDeEstados, await caja(p, laRegla(p))), 20, vista));
    await desmarcar(p);

    const cRegla = await caja(p, laRegla(p));
    const cabeceraDeLaRegla = { x: cRegla.x, y: cRegla.y, w: cRegla.w, h: 96 };
    await marcar(p, [{ c: unir(await caja(p, zona(p, "activa")), await caja(p, elInterruptor(p, "FRIO"))) }]);
    await guardar(p, "activa.webp", holgura(cabeceraDeLaRegla, 40, vista));
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, zona(p, "restaurar")), texto: "Vuelve a lo de fábrica", lado: "abajo" }]);
    await guardar(p, "restaurar.webp", holgura(cabeceraDeLaRegla, 40, vista));
    await desmarcar(p);

    // 5. Tiempos e intentos.
    const filaDeTiempos = unir(await aLaVista(p, zona(p, "espera")), await caja(p, zona(p, "hasta")));
    await marcar(p, [{ c: await caja(p, zona(p, "espera")), }]);
    await guardar(p, "espera.webp", holgura(filaDeTiempos, 40, vista));
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, zona(p, "intentos")), }]);
    await guardar(p, "intentos.webp", holgura(filaDeTiempos, 40, vista));
    await desmarcar(p);

    await alPaso(p, "summary", '[data-zona="estados-configurados"]');
    const lineas = p.locator("[data-estado-del-resumen] p.text-sm");
    const marcasDeLineas = [];
    for (let i = 0; i < (await lineas.count()); i += 1) marcasDeLineas.push({ c: await caja(p, lineas.nth(i)) });
    await marcar(p, marcasDeLineas, { atenuar: true });
    await guardar(p, "tiempos-en-el-resumen.webp", holgura(await caja(p, zona(p, "estados-configurados")), 20, vista));
    await desmarcar(p);

    // 6. Horario y días.
    await alPaso(p, "FRIO", '[data-regla="FRIO"]');
    const fila = unir(await aLaVista(p, zona(p, "espera")), await caja(p, zona(p, "hasta")), await caja(p, zona(p, "dias")));
    await marcar(p, [
        { c: await caja(p, zona(p, "desde")), n: 1 },
        { c: await caja(p, zona(p, "hasta")), n: 2 },
    ]);
    await guardar(p, "desde-hasta.webp", holgura(fila, 40, vista));
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, zona(p, "dias")), }]);
    await guardar(p, "dias.webp", holgura(fila, 40, vista));
    await desmarcar(p);

    await alPaso(p, "summary", '[data-zona="resumen-general"]');
    const cResumenGeneral = await caja(p, zona(p, "resumen-general"));
    await marcar(p, [{ c: await caja(p, zona(p, "resumen-general").locator("[class~='rounded-2xl']").first()), texto: "Tu zona horaria", lado: "arriba" }], { atenuar: true });
    await guardar(p, "zona-horaria.webp", holgura(cResumenGeneral, 30, vista));
    await desmarcar(p);

    // 7. Los mensajes.
    await alPaso(p, "FRIO", '[data-regla="FRIO"]');
    const filaDeMensajes = unir(await aLaVista(p, zona(p, "objetivo")), await caja(p, zona(p, "respaldo")));
    for (const [z, nombre] of [
        ["objetivo", "objetivo.webp", "Qué quieres conseguir"],
        ["prompt", "prompt.webp", "Cómo escribe la IA"],
        ["respaldo", "respaldo.webp", "Si la IA no puede"],
    ]) {
        await marcar(p, [{ c: await caja(p, zona(p, z)) }]);
        await guardar(p, nombre, holgura(filaDeMensajes, 44, vista));
        await desmarcar(p);
    }

    // 8. La biblioteca de archivos (en Tibio, que tiene tres).
    await alPaso(p, "TIBIO", '[data-regla="TIBIO"]');
    const abrirBiblioteca = zona(p, "abrir-biblioteca");
    const cAbrir = await aLaVista(p, abrirBiblioteca);
    await marcar(p, [{ c: cAbrir, texto: "Ábrela", lado: "arriba" }]);
    await guardar(p, "biblioteca-abrir.webp", holgura(unir(cAbrir, await caja(p, zona(p, "flujo"))), 40, vista));
    await desmarcar(p);

    await abrirBiblioteca.click();
    await p.locator('[data-zona="archivos"] [data-archivo]').first().waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1500);
    const agregar = zona(p, "agregar-archivo");
    await agregar.locator('input[type="file"]').setInputFiles({
        name: "foto-del-local.jpg",
        mimeType: "image/jpeg",
        buffer: await unaImagen("Nuestro local", "#10b981", "#0ea5e9"),
    });
    await espera(p, 800);
    const bloques = agregar.locator("> div");
    const nombre = agregar.locator("input:not([type='file'])").first();
    const descripcion = agregar.locator("textarea").first();
    await nombre.fill("Foto del local");
    await descripcion.fill("Para quien pregunta dónde estamos.");
    await espera(p, 400);
    const cAgregar = await aLaVista(p, agregar);
    await marcar(p, [
        { c: await caja(p, agregar.locator("> .space-y-2").first()), n: 1 },
        { c: await caja(p, nombre), n: 2 },
        { c: await caja(p, descripcion), n: 3 },
        { c: await caja(p, agregar.getByRole("button", { name: "Guardar en biblioteca" })), n: 4 },
    ]);
    await guardar(p, "biblioteca-agregar.webp", holgura(cAgregar, 24, vista));
    await desmarcar(p);
    void bloques;

    const cArchivos = await aLaVista(p, zona(p, "archivos"));
    await marcar(p, [{ c: cArchivos, texto: "Los archivos de Tibio", lado: "arriba" }], { atenuar: true });
    await guardar(p, "biblioteca-archivos.webp", holgura(cArchivos, 40, vista));
    await desmarcar(p);
    // Se cierra: el archivo elegido no se sube.
    await abrirBiblioteca.scrollIntoViewIfNeeded();
    await abrirBiblioteca.click();
    await espera(p, 500);

    // 9. El flujo por estado (en Caliente, que ya tiene uno).
    await alPaso(p, "CALIENTE", '[data-regla="CALIENTE"]');
    const flujo = zona(p, "flujo");
    const cFlujo = await aLaVista(p, flujo);
    const contexto = holgura(unir(cFlujo, await caja(p, zona(p, "respaldo"))), 30, vista);
    await marcar(p, [{ c: cFlujo, texto: "Disparar un flujo", lado: "abajo" }]);
    await guardar(p, "flujo-panel.webp", contexto);
    await desmarcar(p);

    await flujo.locator("button[role='combobox']").click();
    const lista = p.locator('[role="listbox"]').last();
    await lista.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cLista = await caja(p, lista);
    await marcar(p, [{ c: await caja(p, flujo.locator("button[role='combobox']")), n: 1 }, { c: cLista, n: 2 }]);
    await guardar(p, "flujo-elegir.webp", holgura(unir(cFlujo, cLista), 30, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    await marcar(p, [{ c: await caja(p, flujo.getByRole("button", { name: "Quitar flujo" })), texto: "Quitar", lado: "abajo" }]);
    await guardar(p, "flujo-quitar.webp", holgura(cFlujo, 50, vista));
    await desmarcar(p);

    // 10. El resumen y guardar.
    await alPaso(p, "summary", '[data-zona="estados-configurados"]');
    await marcar(p, [
        { c: await caja(p, zona(p, "resumen-general")), n: 1 },
        { c: await caja(p, zona(p, "estados-configurados")), n: 2 },
    ]);
    await guardar(p, "resumen.webp", conAireArriba(await loQueSeVeDelContenido(p)));
    await desmarcar(p);

    // Un cambio para que se enciendan los botones, y se deshace.
    await alPaso(p, "FRIO", '[data-regla="FRIO"]');
    await zona(p, "dias").getByRole("button", { name: "Sab", exact: true }).click();
    await espera(p, 500);
    const cDelPie = await caja(p, elPie(p));
    await marcar(p, [{ c: await caja(p, elBoton(p, "Guardar reglas")), texto: "Guardar reglas", lado: "arriba" }], { atenuar: true });
    await guardar(p, "guardar.webp", holgura(cDelPie, 60, vista));
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, elBoton(p, "Resetear cambios")), texto: "Resetear cambios", lado: "arriba" }], { atenuar: true });
    await guardar(p, "resetear.webp", holgura(cDelPie, 60, vista));
    await desmarcar(p);
    await elBoton(p, "Resetear cambios").click();
    await espera(p, 800);
    await quitarAvisos(p);

    await abrir(p);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Creación de Flujos", texto: "Follow-ups IA está en Creación de Flujos" });
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
    await servirLosArchivosDeEjemplo(ctx);
    await ctx.addInitScript(CURSOR);
    const p = await ctx.newPage();
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrir(p);
    await p.mouse.move(640, 400, { steps: 8 });
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("cómo la IA resume", 200);
    await mover(p, laPestana(p, "leadFunnel"));
    await alDecir("cómo clasifica", 150);
    await mover(p, laPestana(p, "leadStatus"));
    await alDecir("cuándo les vuelve a escribir", 150);
    await mover(p, laPestana(p, "followUps"));

    // El menú y la barra de arriba, como en todas las guías.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const grupo = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Creación de Flujos" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Creación de Flujos", 600);
    await mover(p, grupo);

    const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // El sintetizador: sus cuatro pasos.
    await decir("sintetizador");
    await alDecir("un asistente de cuatro pasos");
    await mover(p, zona(p, "pasos"));
    await alDecir("las reglas globales");
    await pulsar(p, elPaso(p, "rules"));
    await alDecir("los tipos de registro");
    await pulsar(p, elPaso(p, "types"));
    await alDecir("la previsualización");
    await pulsar(p, elPaso(p, "preview"));

    // La clasificación.
    await decir("clasificacion");
    await alDecir("Clasificación de leads");
    await pulsar(p, laPestana(p, "leadStatus"));
    await zona(p, "identidad").waitFor({ state: "visible", timeout: 30000 });
    await alDecir("qué significa en tu negocio", 150);
    await pulsar(p, elPaso(p, "definitions"));
    await alDecir("las señales para reconocerlo");
    await pulsar(p, elPaso(p, "criteria"));

    // Los follow-ups por estado.
    await decir("estados");
    await alDecir("en Follow-ups");
    await pulsar(p, laPestana(p, "followUps"));
    await laRegla(p).waitFor({ state: "visible", timeout: 30000 });
    await alDecir("un interruptor", 100);
    await mover(p, elInterruptor(p, "FRIO"));

    await decir("tiempos");
    await alDecir("cuánto esperar", 100);
    await mover(p, zona(p, "espera"));
    await alDecir("cuántas veces insistir");
    await mover(p, zona(p, "intentos"));

    await decir("horario");
    await alDecir("a qué horas", 100);
    await mover(p, zona(p, "desde"));
    await mover(p, zona(p, "hasta"));
    await alDecir("qué días");
    await mover(p, zona(p, "dias"));

    await decir("mensajes");
    await alDecir("el objetivo", 100);
    await mover(p, zona(p, "objetivo"));
    await alDecir("cómo quieres que escriba", 100);
    await mover(p, zona(p, "prompt"));
    await alDecir("un mensaje de respaldo");
    await mover(p, zona(p, "respaldo"));

    // La biblioteca, en Tibio.
    await decir("biblioteca");
    await alDecir("En la biblioteca");
    await pulsar(p, elPaso(p, "TIBIO"));
    await p.locator('[data-regla="TIBIO"]:visible').waitFor({ state: "visible", timeout: 30000 });
    await pulsar(p, zona(p, "abrir-biblioteca"));
    await p.locator('[data-zona="archivos"] [data-archivo]').first().waitFor({ state: "visible", timeout: 30000 });
    await alDecir("que la IA puede mandar", 100);
    await mover(p, zona(p, "archivos"));

    // El flujo, en Caliente.
    await decir("flujo");
    await alDecir("disparar un flujo");
    await pulsar(p, elPaso(p, "CALIENTE"));
    await p.locator('[data-regla="CALIENTE"]:visible').waitFor({ state: "visible", timeout: 30000 });
    await mover(p, zona(p, "flujo"));
    await alDecir("eliges uno de tus flujos", 100);
    await pulsar(p, zona(p, "flujo").locator("button[role='combobox']"));
    await p.locator('[role="listbox"]').last().waitFor({ state: "visible", timeout: 10000 });
    await alDecir("cuando un lead pasa", 300);
    await p.keyboard.press("Escape");

    // El resumen, y guardar.
    await decir("cierre");
    await alDecir("el resumen");
    await pulsar(p, elPaso(p, "summary"));
    await zona(p, "estados-configurados").waitFor({ state: "visible", timeout: 30000 });
    await alDecir("una línea por estado", 100);
    await mover(p, zona(p, "estados-configurados"));
    await alDecir("Guardar reglas");
    await mover(p, elBoton(p, "Guardar reglas"));
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
    escribirLaVozDelVideo("follow-ups", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
    await servirLosArchivosDeEjemplo(ctx);
    const p = await entrar(ctx, BASE);
    await abrir(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-follow-ups.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/follow-ups`);
