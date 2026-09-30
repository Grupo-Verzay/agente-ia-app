/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Reuniones, sobre la
 * App servida de verdad (`next start`, sesiones reales, datos de
 * `sembrar-guia-reuniones.mjs`). Mismo camino que `capturar-guia-leads.mjs`:
 * cada captura es una receta —abre, pulsa, resalta— y las marcas se pintan con
 * la capa SVG de `herramientas-de-la-guia.mjs`, localizadas por lo que la
 * pantalla ya expone (`data-*` de la sala, `aria-label` de sus mandos), nunca
 * por coordenadas.
 *
 * # Tres personas, tres navegadores
 *
 * Una reunión con una sola persona no enseña nada: ni quién habla, ni la
 * puerta, ni la cuadrícula. Así que entran tres, cada una en SU proceso de
 * Chromium con su cámara y su micrófono de mentira (`camaras-de-la-guia.mjs`,
 * que es por proceso: Chromium toma la cámara de sus argumentos):
 *
 * - **Andrea Torres**, la dueña de la cuenta, que abre la reunión y la modera;
 * - **Sofía Rojas**, de su equipo, que entra directa;
 * - **Carlos Díaz**, un invitado sin cuenta, que llama a la puerta por el
 *   enlace. Es quien habla, así que la vista de orador lo pone en grande.
 *
 * Las conexiones son WebRTC de verdad entre los tres: lo que sale en la
 * captura es lo que ve cada uno.
 *
 * # Lo que NO se hace
 *
 * Grabar sí se empieza —la franja roja es parte de la guía—, pero **no se
 * para**: parar sube las partes al almacenamiento, que aquí no existe. Al
 * terminar se deja la base como estaba (`limpiarLaSala`).
 *
 * Qué captura hace falta lo dice `lib/guia-reuniones.ts`: el script se niega
 * a terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-reuniones.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { lasCamaras } from "./camaras-de-la-guia.mjs";
import { SALIDA as TAMANO_MINI, encuadreDeLaMiniatura } from "./encuadre-de-la-miniatura.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-reuniones.mjs";
import { RITMO, guardarWav, mezclar, montarLaPista, sintetizar, usaCedar } from "./voz-de-la-guia.mjs";
import { VOZ_CEDAR, llaveDeLaFrase, llenarLaCache } from "./voz-cedar.mjs";
import {
    caja,
    cerrarLoAbierto,
    desmarcar,
    despejar,
    elGuardado,
    elMarcoDeLaPantalla,
    elMenuAbierto,
    elMenuLateral,
    entrar,
    espera,
    holgura,
    marcar,
    mover,
    pulsar,
    quitarAvisos,
    rotulo,
    unir,
} from "./herramientas-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const sharp = require("sharp");
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.BASE ?? "http://localhost:3940";
const PUBLICO_PORT = Number(process.env.PUBLICO_PORT ?? 9000);
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "reuniones");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-reuniones";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-reuniones.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-reuniones.json");

/** El nombre de la reunión que se abre delante de la cámara. */
const LA_DEMO = "Demo para El Sol";
/** Las grabaciones que la semilla deja listas: son las únicas que se conservan al limpiar. */
const GRABACIONES_SEMBRADAS = ["grab-guia-capacitacion", "grab-guia-revision"];

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const db = new PrismaClient();
const tomadas = new Set();
const guardar = elGuardado({ salida: SALIDA, tomadas });
const focos = {};

/* ------------------------------------------------------------------ */
/* Los ficheros de las grabaciones de ejemplo                          */
/* ------------------------------------------------------------------ */

/**
 * La App cree que su almacenamiento está en `S3_PUBLIC_URL`
 * (`http://localhost:9000`): aquí se sirve lo que la semilla apunta, con
 * `Range`, que es lo que un `<video>` pide para leer los metadatos.
 */
const PUBLICOS = path.join(TMP, "publico", "guia-reuniones");
function servirLosFicheros() {
    mkdirSync(PUBLICOS, { recursive: true });
    const tipo = (f) => (f.endsWith(".webm") ? "video/webm" : "application/octet-stream");
    const servidor = http.createServer((req, res) => {
        const nombre = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, "");
        const fichero = path.join(TMP, "publico", nombre);
        if (!fichero.startsWith(path.join(TMP, "publico")) || !existsSync(fichero)) {
            res.writeHead(404, { "Access-Control-Allow-Origin": "*" });
            res.end();
            return;
        }
        const total = statSync(fichero).size;
        const rango = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
        const cabeceras = { "Content-Type": tipo(fichero), "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" };
        if (rango) {
            const desde = rango[1] ? Number(rango[1]) : 0;
            const hasta = rango[2] ? Math.min(Number(rango[2]), total - 1) : total - 1;
            res.writeHead(206, { ...cabeceras, "Content-Range": `bytes ${desde}-${hasta}/${total}`, "Content-Length": hasta - desde + 1 });
            createReadStream(fichero, { start: desde, end: hasta }).pipe(res);
            return;
        }
        res.writeHead(200, { ...cabeceras, "Content-Length": total });
        createReadStream(fichero).pipe(res);
    });
    return new Promise((r) => servidor.listen(PUBLICO_PORT, "127.0.0.1", () => r(servidor)));
}

/** Un audio de unos segundos: la grabación de solo audio. */
function unAudio(destino) {
    execFileSync("ffmpeg", [
        "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=6",
        "-af", "volume=0.05", "-c:a", "libopus", destino,
    ]);
}

/** El video de la grabación: la foto de la reunión, unos segundos, con su audio. */
function unVideo(foto, destino) {
    execFileSync("ffmpeg", [
        "-y", "-loglevel", "error",
        "-loop", "1", "-i", foto,
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
        "-t", "6", "-vf", "scale=1280:-2,format=yuv420p", "-r", "12",
        "-c:v", "libvpx", "-b:v", "900k", "-c:a", "libopus", "-shortest", destino,
    ]);
}

/* ------------------------------------------------------------------ */
/* La base                                                             */
/* ------------------------------------------------------------------ */

async function elCodigoDe(titulo) {
    for (let i = 0; i < 40; i += 1) {
        const [s] = await db.$queryRawUnsafe(
            `SELECT "codigo" FROM "salas_de_video" WHERE "titulo" = $1 ORDER BY "creadoEn" DESC LIMIT 1`,
            titulo,
        );
        if (s?.codigo) return s.codigo;
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`[guia] no aparece la reunión «${titulo}» en la base`);
}

/**
 * Deja la base como la sembró la semilla: fuera la reunión que se abrió
 * delante de la cámara, y fuera la grabación que se empezó y no se paró
 * (sin esto, la pestaña Grabaciones enseñaría una grabación «en curso»).
 */
async function limpiarLaSala(titulo) {
    const salas = await db.$queryRawUnsafe(`SELECT "id" FROM "salas_de_video" WHERE "titulo" = $1`, titulo);
    const ids = salas.map((s) => s.id);
    if (ids.length) {
        for (const tabla of ["grabaciones_de_reunion", "sala_mensajes", "sala_senales", "sala_participantes"]) {
            await db.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "salaId" = ANY($1::text[])`, ids);
        }
        await db.$executeRawUnsafe(`DELETE FROM "salas_de_video" WHERE "id" = ANY($1::text[])`, ids);
    }
    await db.$executeRawUnsafe(
        `DELETE FROM "grabaciones_de_reunion" WHERE NOT ("id" = ANY($1::text[]))`,
        GRABACIONES_SEMBRADAS,
    );
    await db.$executeRawUnsafe(
        `UPDATE "salas_de_video" SET "grabandoDesde" = NULL, "grabandoVistoEn" = NULL, "grabandoPor" = NULL`,
    );
}

/* ------------------------------------------------------------------ */
/* Las páginas                                                         */
/* ------------------------------------------------------------------ */

/** Los botones del borde (copiloto, equipo, nota) son de TODAS las pantallas: aquí no explican nada. */
const SIN_EL_BORDE = "[data-columna-del-borde]{display:none !important}";

async function abrirReuniones(p) {
    await p.goto(`${BASE}/reuniones`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("[data-lista-de-reuniones]", { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2000);
    await despejar(p);
    await p.addStyleTag({ content: SIN_EL_BORDE });
    await espera(p, 300);
}

const pestana = (p, nombre) =>
    p.locator("[data-zona='filtros'] button", { hasText: nombre }).first();
const laFila = (p, titulo) =>
    p.locator("[data-lista-de-reuniones] > div", { hasText: titulo }).first();
const elBotonDeCaducidad = (p) => p.locator('button[aria-label^="Reunión nueva"]').first();
const elBotonNuevo = (p) => p.getByRole("button", { name: /Nuevo/ }).first();

/** Los apartados de Panel: la barra de pestañas que sale encima de la pantalla. */
async function losApartados(p) {
    return p.evaluate(() => {
        const a = document.querySelector('nav a[href="/reuniones"]');
        const barra = a?.closest(".sticky") ?? a?.closest("nav");
        const r = barra.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
}

/** La sala entera, dentro de la plataforma. */
const SALA = "[data-sala-de-video]";
const CAJA = "[data-caja-del-video]";
const CABECERA = "[data-cabecera-de-la-sala]";
const MANDOS = "[data-mandos-de-la-sala]";
// Un mando que cambia de rótulo según su estado se pide con los dos, separados
// por «|»: la supresión de ruido, por ejemplo, puede nacer encendida.
const mando = (p, rotulo) =>
    p.locator(rotulo.split("|").map((r) => `[aria-label="${r}"]`).join(", ")).first();

/** Los recuadros con video que YA pinta: una cámara que no ha llegado sale negra. */
async function esperarAQueSeVean(p, cuantos) {
    await p.waitForFunction(
        (n) => {
            const v = [...document.querySelectorAll("[data-recuadro] video")].filter(
                (x) => x.videoWidth > 0 && x.readyState >= 2 && x.getBoundingClientRect().width > 0,
            );
            return v.length >= n;
        },
        cuantos,
        { timeout: 60000 },
    );
    await espera(p, 1200);
}

/** Enseña los mandos (se apartan solos a los 3,5 s sin mover el ratón). */
async function losMandosALaVista(p) {
    const v = p.viewportSize();
    await p.mouse.move(v.width / 2 - 40, v.height / 2 + 20, { steps: 4 });
    await p.mouse.move(v.width / 2, v.height / 2, { steps: 4 });
    await espera(p, 450);
}

/** La caja de la cabecera: su bloque de botones, no el degradado entero. */
async function losBotonesDeLaCabecera(p) {
    return p.evaluate((sel) => {
        const cab = document.querySelector(sel);
        const bloque = [...cab.children].find((c) => c.querySelector("button"));
        const r = bloque.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    }, CABECERA);
}

/** La pastilla de los mandos de abajo (no el degradado que la rodea). */
async function laBarraDeMandos(p) {
    return p.evaluate((sel) => {
        const m = document.querySelector(sel);
        const bloque = [...m.querySelectorAll("div")].find((d) => d.querySelectorAll("button").length >= 5);
        const r = bloque.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    }, MANDOS);
}

/** El recuadro de una persona, por su nombre en el pie. */
async function elRecuadroDe(p, nombre) {
    return p.evaluate((nombre) => {
        const r = [...document.querySelectorAll("[data-recuadro]")].find(
            (x) => x.getBoundingClientRect().width > 0 && (x.textContent || "").includes(nombre),
        );
        const b = r.getBoundingClientRect();
        return { x: b.left, y: b.top, w: b.width, h: b.height };
    }, nombre);
}

/**
 * La caja del TEXTO de un elemento, no la del elemento: un renglón que ocupa
 * toda la fila se marcaría de lado a lado, y el recuadro no diría qué señala.
 */
async function cajaDelTexto(loc) {
    await loc.waitFor({ state: "visible", timeout: 20000 });
    return loc.evaluate((el) => {
        const rango = document.createRange();
        rango.selectNodeContents(el);
        const b = rango.getBoundingClientRect();
        return { x: b.left - 4, y: b.top - 2, w: b.width + 8, h: b.height + 4 };
    });
}

/** El rótulo con el nombre, al pie del recuadro de esa persona. */
async function elNombreEnElRecuadro(p, nombre) {
    return p.evaluate((nombre) => {
        const r = [...document.querySelectorAll("[data-recuadro]")].find(
            (x) => x.getBoundingClientRect().width > 0 && (x.textContent || "").includes(nombre),
        );
        const hoja = [...r.querySelectorAll("span, p, div")]
            .filter((x) => x.children.length === 0 && (x.textContent || "").includes(nombre))
            .at(-1);
        // El rótulo es `flex-1` y ocupa todo el pie: se mide el TEXTO.
        const rango = document.createRange();
        rango.selectNodeContents(hoja);
        const b = rango.getBoundingClientRect();
        return { x: b.left - 4, y: b.top - 2, w: b.width + 8, h: b.height + 4 };
    }, nombre);
}

/** La franja de la sala de espera (la de «Dejar entrar»). */
async function laFranjaDeEspera(p) {
    return p.evaluate(() => {
        const boton = [...document.querySelectorAll("button")].find((b) => /Dejar entrar/.test(b.textContent || "") && !/No dejar/.test(b.getAttribute("aria-label") || ""));
        const franja = boton.closest(".shrink-0.border-b") ?? boton.parentElement.parentElement.parentElement;
        const r = franja.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

/**
 * Una miniatura: la zona que la sección explica, nítida y en su recuadro; el
 * resto bajo el velo; 16:9 y centrada (`encuadre-de-la-miniatura.mjs`). La
 * MISMA receta que las de Leads; lo único distinto es que aquí varias se
 * toman a mitad de la reunión, porque es donde está lo que enseñan.
 */
async function miniatura(p, slug, foco) {
    const vista = p.viewportSize();
    const e = encuadreDeLaMiniatura(foco, vista);
    await marcar(p, [{ c: foco }], { atenuar: true, escala: e.escala });
    const nombre = `mini-${slug}.webp`;
    const buf = await p.screenshot({ clip: { x: e.x, y: e.y, width: e.w, height: e.h } });
    await sharp(buf).resize(TAMANO_MINI.ancho, TAMANO_MINI.alto, { fit: "fill" }).webp({ quality: 84 }).toFile(path.join(SALIDA, nombre));
    tomadas.add(nombre);
    focos[nombre] = { x: (foco.x - e.x) / e.w, y: (foco.y - e.y) / e.h, w: foco.w / e.w, h: foco.h / e.h };
    console.log("  ✓", nombre);
    await desmarcar(p);
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

/** Los navegadores del equipo y del invitado, cada uno con su cámara. */
async function laOtraPersona(args, { email } = {}) {
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args });
    const ctx = await nav.newContext({
        viewport: { width: 1280, height: 800 },
        locale: "es-CO",
        timezoneId: "America/Bogota",
        permissions: ["camera", "microphone"],
    });
    const p = email ? await entrar(ctx, BASE, { email }) : await ctx.newPage();
    return { nav, p };
}

/** El invitado abre el enlace, pone su nombre y llama a la puerta. */
async function elInvitadoLlama(p, codigo, { capturar = false } = {}) {
    await p.goto(`${BASE}/reunion/${codigo}`, { waitUntil: "domcontentloaded" });
    const nombre = p.locator('input[placeholder="Tu nombre"]');
    await nombre.waitFor({ state: "visible", timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await nombre.fill("Carlos Díaz");
    await espera(p, 400);
    const boton = p.getByRole("button", { name: "Entrar", exact: true });
    if (capturar) {
        await marcar(p, [
            { c: await caja(p, nombre), texto: "Su nombre", lado: "izquierda" },
            { c: await caja(p, boton), texto: "Llama a la puerta", lado: "derecha" },
        ]);
        await guardar(p, "invitados-puerta.webp");
        await desmarcar(p);
    }
    await boton.click();
    await p.getByText("Esperando a que te dejen entrar").waitFor({ state: "visible", timeout: 60000 });
    await espera(p, 600);
    if (capturar) {
        const titulo = await caja(p, p.getByText("Esperando a que te dejen entrar"));
        await marcar(p, [{ c: titulo, texto: "Espera en la puerta", lado: "arriba" }]);
        await guardar(p, "invitados-esperando.webp");
        await desmarcar(p);
    }
}

/** Sofía, del equipo: entra directa desde su lista de Reuniones. */
async function elEquipoEntra(p, titulo) {
    await p.goto(`${BASE}/reuniones`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("[data-lista-de-reuniones]", { timeout: 90000 });
    await despejar(p);
    // La lista se pinta con lo que había al cargar: si la reunión nació un
    // instante después, se recarga una vez en vez de esperar a que aparezca.
    // Con tres navegadores y sus cámaras en la misma máquina el servidor va
    // lento, así que se insiste unas veces; y si no aparece, se deja una
    // captura de lo que ve Sofía: un plazo agotado a secas no dice por qué.
    const entrar = laFila(p, titulo).getByRole("button", { name: /Entrar/ });
    for (let intento = 0; ; intento += 1) {
        if (await entrar.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false)) break;
        if (intento === 4) {
            const foto = path.join(TMP, "sofia-sin-la-reunion.png");
            await p.screenshot({ path: foto }).catch(() => {});
            const lista = await p.locator("[data-lista-de-reuniones]").innerText().catch(() => "(sin lista)");
            throw new Error(`[guia] Sofía no ve «${titulo}» en su lista (${foto}): ${lista.slice(0, 300)}`);
        }
        await p.reload({ waitUntil: "domcontentloaded" });
        await p.waitForSelector("[data-lista-de-reuniones]", { timeout: 90000 });
        await despejar(p);
    }
    await entrar.click({ timeout: 60000 });
    await p.waitForSelector(`${SALA}`, { timeout: 60000 });
}

async function capturas(p, args) {
    const vista = p.viewportSize();

    // ── La lista ────────────────────────────────────────────────────────
    await guardar(p, "portada.webp");

    const cApartados = await losApartados(p);
    const cPestanas = unir(
        await caja(p, pestana(p, "Abiertas")),
        await caja(p, pestana(p, "Pasadas")),
        await caja(p, pestana(p, "Grabaciones")),
    );
    const cCaducidad = await caja(p, elBotonDeCaducidad(p));
    const cNuevo = await caja(p, elBotonNuevo(p));
    const cLista = await caja(p, "[data-lista-de-reuniones]");
    const cListaHastaLaUltima = unir(...(await Promise.all([0, 1, 2].map((i) => caja(p, p.locator("[data-lista-de-reuniones] > div").nth(i))))));
    await marcar(p, [
        { c: cApartados, n: 1 },
        { c: cPestanas, n: 2 },
        { c: cCaducidad, n: 3 },
        { c: cNuevo, n: 4 },
        { c: cListaHastaLaUltima, n: 5 },
    ]);
    await guardar(p, "vista-general.webp");
    await desmarcar(p);
    await miniatura(p, "vista-general", unir(cPestanas, cNuevo));

    // Una fila abierta: Entrar, copiar y el «⋯».
    const fila = laFila(p, "Reunión semanal del equipo");
    const cFila = await caja(p, fila);
    await marcar(p, [
        { c: await caja(p, fila.getByRole("button", { name: /Entrar/ })), n: 1 },
        { c: await caja(p, fila.getByRole("button", { name: "Copiar enlace" })), n: 2 },
        { c: await caja(p, fila.getByRole("button", { name: "Más acciones" })), n: 3 },
    ], { atenuar: true });
    await guardar(p, "abiertas-fila.webp", holgura({ ...cFila, y: cFila.y - 40, h: cFila.h + 80 }, 20, vista));
    await desmarcar(p);
    await miniatura(p, "reuniones-abiertas", cFila);

    await fila.getByRole("button", { name: "Más acciones" }).click();
    const menu = p.locator('[role="menu"]').first();
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await menu.getByRole("menuitem", { name: /Caducidad/ }).hover();
    const sub = p.locator('[role="menu"]').nth(1);
    await sub.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cMenu = await caja(p, menu);
    const cSub = await caja(p, sub);
    await marcar(p, [{ c: cMenu }, { c: cSub, texto: "Cuánto más vale, desde ahora", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "abiertas-caducidad.webp", holgura(unir(cFila, cMenu, cSub), 30, vista));
    await desmarcar(p);
    // Se cierra SOLO el submenú: Escape se lleva el menú entero en Radix.
    await p.keyboard.press("ArrowLeft");
    await espera(p, 300);
    if (!(await menu.isVisible().catch(() => false))) {
        await fila.getByRole("button", { name: "Más acciones" }).click();
        await menu.waitFor({ state: "visible", timeout: 10000 });
    }
    await p.mouse.move(5, 5);
    await espera(p, 300);
    const cMenu2 = await caja(p, menu);
    await marcar(p, [
        { c: await caja(p, menu.getByRole("menuitem", { name: "Regenerar enlace" })), texto: "Enlace nuevo", lado: "izquierda" },
        { c: await caja(p, menu.getByRole("menuitem", { name: "Revocar enlace" })), texto: "Cierra la reunión", lado: "izquierda" },
    ], { atenuar: true });
    await guardar(p, "abiertas-regenerar.webp", holgura(unir(cFila, cMenu2, { ...cMenu2, x: cMenu2.x - 220 }), 30, vista));
    await desmarcar(p);
    await cerrarLoAbierto(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    // ── Abrir una reunión ───────────────────────────────────────────────
    await elBotonDeCaducidad(p).click();
    const ajustes = p.locator("[data-radix-popper-content-wrapper]").last();
    await p.locator("#reunion-titulo").waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cAjustes = await caja(p, ajustes);
    const chips = await caja(p, ajustes.locator("button", { hasText: "No caduca" }).locator(".."));
    await marcar(p, [
        { c: await caja(p, elBotonDeCaducidad(p)), n: 1 },
        { c: chips, n: 2, esquina: "derecha" },
    ], { atenuar: true });
    await guardar(p, "abrir-caducidad.webp", holgura(unir(cAjustes, cNuevo, { ...cAjustes, x: cAjustes.x - 180 }), 30, vista));
    await desmarcar(p);
    await miniatura(p, "abrir-una-reunion", unir(await caja(p, elBotonDeCaducidad(p)), cAjustes));

    await p.locator("#reunion-titulo").fill(LA_DEMO);
    await ajustes.locator("button", { hasText: "7 días" }).click();
    await espera(p, 400);
    await marcar(p, [
        { c: await caja(p, "#reunion-titulo"), texto: "Para qué es", lado: "izquierda" },
        { c: await caja(p, ajustes.locator("button", { hasText: "7 días" })), texto: "Vale 7 días", lado: "izquierda" },
    ], { atenuar: true });
    await guardar(p, "abrir-nombre.webp", holgura(unir(cAjustes, cNuevo, { ...cAjustes, x: cAjustes.x - 180 }), 30, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    await marcar(p, [
        { c: await caja(p, elBotonDeCaducidad(p)), texto: "7 días", lado: "abajo" },
        { c: await caja(p, elBotonNuevo(p)), texto: "Abre la reunión", lado: "abajo" },
    ], { atenuar: true });
    const barra = unir(cPestanas, cNuevo);
    await guardar(p, "abrir-nuevo.webp", holgura({ ...barra, h: barra.h + 110 }, 24, vista));
    await desmarcar(p);

    await elBotonNuevo(p).click();
    await p.waitForSelector(SALA, { timeout: 60000 });
    await esperarAQueSeVean(p, 1);
    await losMandosALaVista(p);
    await guardar(p, "abrir-sala.webp");

    // El enlace: el botón de la cabecera, con su aviso de copiado.
    const codigo = await elCodigoDe(LA_DEMO);
    await mando(p, "Copiar el enlace de la reunión").click();
    await p.waitForSelector("[data-sonner-toast]", { timeout: 10000 }).catch(() => {});
    await espera(p, 600);
    const cCopiar = await caja(p, mando(p, "Copiar el enlace de la reunión"));
    const marcasDelEnlace = [{ c: cCopiar, texto: "Copia el enlace", lado: "abajo" }];
    const aviso = p.locator("[data-sonner-toast]").last();
    if (await aviso.count()) marcasDelEnlace.push({ c: await caja(p, aviso) });
    await marcar(p, marcasDelEnlace);
    await guardar(p, "invitados-enlace.webp", holgura({ x: vista.width - 620, y: cCopiar.y - 10, w: 620, h: 190 }, 0, vista));
    await desmarcar(p);
    await quitarAvisos(p);

    // ── El invitado y la puerta ─────────────────────────────────────────
    const invitado = await laOtraPersona(args.invitado);
    // Las capturas del invitado son de SU pestaña: la misma ventana que la guía.
    await invitado.p.setViewportSize({ width: 1440, height: 900 });
    await elInvitadoLlama(invitado.p, codigo, { capturar: true });

    const dejar = p.getByRole("button", { name: /^Dejar entrar/ }).first();
    await dejar.waitFor({ state: "visible", timeout: 60000 });
    await espera(p, 800);
    await losMandosALaVista(p);
    const cEspera = await laFranjaDeEspera(p);
    await marcar(p, [
        { c: await caja(p, dejar), texto: "Le deja pasar", lado: "izquierda" },
        { c: await caja(p, p.locator('[aria-label^="No dejar entrar"]').first()), texto: "No le deja", lado: "abajo" },
    ]);
    await guardar(p, "invitados-dejar-entrar.webp", holgura({ ...cEspera, h: cEspera.h + 150 }, 0, vista));
    await desmarcar(p);
    // La franja va de lado a lado de la reunión: entera, en una tarjeta sus
    // letras no se leen. Se enfoca su final, que es la decisión.
    {
        const cDejar = await caja(p, dejar);
        const desde = cDejar.x - 260;
        await miniatura(p, "invitados", { x: desde, y: cEspera.y, w: cEspera.x + cEspera.w - desde, h: cEspera.h });
    }
    await dejar.click();

    // Sofía entra directa: es del equipo.
    const equipo = await laOtraPersona(args.equipo, { email: "sofia@banco.test" });
    await elEquipoEntra(equipo.p, LA_DEMO);
    await esperarAQueSeVean(p, 3);
    await espera(p, 3000); // que el reparto de orador escoja a quien habla

    // ── La vista: orador, cabecera, cuadrícula ──────────────────────────
    await losMandosALaVista(p);
    // El recuadro grande llega a los bordes de la ventana: un rótulo fuera de
    // él no se vería. Se rotula su NOMBRE (abajo, dentro de la imagen) y la
    // franja de al lado.
    const cGrande = await elRecuadroDe(p, "Carlos Díaz");
    const cTira = unir(await elRecuadroDe(p, "Andrea Torres"), await elRecuadroDe(p, "Sofía Rojas"));
    await marcar(p, [
        { c: cGrande },
        { c: await elNombreEnElRecuadro(p, "Carlos Díaz"), texto: "Quien habla, en grande", lado: "arriba" },
        { c: cTira, texto: "Los demás, en la franja", lado: "izquierda" },
    ]);
    await guardar(p, "vista-orador.webp");
    await desmarcar(p);

    await losMandosALaVista(p);
    const cCab = await losBotonesDeLaCabecera(p);
    const cuadros = ["Ver a todos en cuadrícula", "Ocultar la franja de participantes", "Abrir el chat y la gente", "Suprimir el ruido de fondo del micrófono|Quitar la supresión de ruido", "Copiar el enlace de la reunión", "Grabar la reunión"];
    const cContador = await p.evaluate((sel) => {
        const s = document.querySelector(`${sel} span.tabular-nums`)?.parentElement;
        const r = s.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    }, CABECERA);
    const marcasCab = [{ c: cContador, n: 1, borde: "abajo" }];
    marcasCab.push({ c: unir(await caja(p, mando(p, cuadros[0])), await caja(p, mando(p, cuadros[1]))), n: 2, borde: "abajo" });
    for (const [i, r] of cuadros.slice(2).entries()) marcasCab.push({ c: await caja(p, mando(p, r)), n: i + 3, borde: "abajo" });
    const tamano = await p.evaluate((sel) => {
        const b = [...document.querySelectorAll(`${sel} button`)].filter((x) =>
            /Plegar a una pastilla|Pantalla completa|Ampliar|Salir de pantalla completa/.test(x.getAttribute("aria-label") || ""),
        );
        const r = b.map((x) => x.getBoundingClientRect());
        const x = Math.min(...r.map((q) => q.left));
        const y = Math.min(...r.map((q) => q.top));
        return { x, y, w: Math.max(...r.map((q) => q.right)) - x, h: Math.max(...r.map((q) => q.bottom)) - y };
    }, CABECERA);
    marcasCab.push({ c: tamano, n: 7, borde: "abajo" });
    await marcar(p, marcasCab, { atenuar: true });
    await guardar(p, "vista-cabecera.webp", holgura({ ...cCab, x: cCab.x - 60, w: cCab.w + 60, h: cCab.h + 40 }, 16, vista));
    await desmarcar(p);
    await miniatura(p, "vista-de-la-sala", cCab);

    // Los mandos de abajo.
    await losMandosALaVista(p);
    const cBarra = await laBarraDeMandos(p);
    const rotulosDeAbajo = ["Silenciar el micrófono", "Apagar la cámara", "Compartir la pantalla", "Levantar la mano", "Desenfocar o cambiar el fondo", "Salir de la reunión"];
    const marcasDeAbajo = [];
    for (const [i, r] of rotulosDeAbajo.entries()) {
        const b = p.locator(`${MANDOS} [aria-label="${r}"]`).first();
        marcasDeAbajo.push({ c: await caja(p, b), n: i + 1 });
    }
    await marcar(p, marcasDeAbajo, { atenuar: true });
    await guardar(p, "mandos.webp", holgura({ ...cBarra, x: cBarra.x - 140, w: cBarra.w + 280, y: cBarra.y - 70, h: cBarra.h + 70 }, 16, vista));
    await desmarcar(p);
    await miniatura(p, "mandos", cBarra);

    // La mano: la levanta el invitado, en su pestaña.
    await invitado.p.mouse.move(700, 450, { steps: 4 });
    await invitado.p.mouse.move(720, 460, { steps: 4 });
    await invitado.p.locator('[aria-label="Levantar la mano"]').first().click();
    const LA_MANO = '[data-recuadro] [aria-label^="Carlos Díaz"][aria-label$="ha levantado la mano"]';
    await p.locator(LA_MANO).first().waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 1500);
    await losMandosALaVista(p);
    // El recuadro llega a los bordes: se rotula la MANO, al pie, que es lo que
    // se ve; el anillo ámbar del recuadro se deja sin tapar.
    await marcar(p, [
        { c: unir(await caja(p, p.locator(LA_MANO).first()), await elNombreEnElRecuadro(p, "Carlos Díaz")), texto: "Pidió la palabra", lado: "arriba" },
    ]);
    await guardar(p, "mandos-mano.webp");
    await desmarcar(p);
    await invitado.p.mouse.move(700, 450, { steps: 4 });
    await invitado.p.locator('[aria-label="Bajar la mano"]').first().click().catch(() => {});

    // El fondo.
    await losMandosALaVista(p);
    await p.locator(`${MANDOS} [aria-label="Desenfocar o cambiar el fondo"]`).first().click();
    const menuFondo = p.locator('[role="menu"]').last();
    await menuFondo.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    const cFondo = await caja(p, menuFondo);
    const cBotonFondo = await caja(p, p.locator(`${MANDOS} [aria-label="Desenfocar o cambiar el fondo"]`).first());
    await marcar(p, [{ c: cBotonFondo }, { c: cFondo }], { atenuar: true });
    await guardar(p, "mandos-fondo.webp", holgura(unir(cFondo, cBotonFondo, { ...cFondo, x: cFondo.x - 200, w: cFondo.w + 400 }), 20, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 500);

    // La cuadrícula.
    await losMandosALaVista(p);
    await mando(p, "Ver a todos en cuadrícula").click();
    await espera(p, 1500);
    await losMandosALaVista(p);
    await guardar(p, "vista-cuadricula.webp");

    // Los mandos, escondidos: el ratón se queda quieto sobre la imagen.
    const v = p.viewportSize();
    await p.mouse.move(v.width / 2 - 200, v.height / 2 - 60, { steps: 6 });
    await p.waitForFunction((sel) => getComputedStyle(document.querySelector(sel)).opacity === "0", CABECERA, { timeout: 15000 });
    await espera(p, 400);
    await guardar(p, "mandos-escondidos.webp");

    // Moderar: el «⋯» del recuadro del invitado.
    await losMandosALaVista(p);
    const moderar = p.locator('[aria-label^="Moderar a Carlos"]').first();
    await moderar.click();
    const menuMod = p.locator('[role="menu"]').last();
    await menuMod.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cMod = await caja(p, menuMod);
    const cBtnMod = await caja(p, moderar);
    const cTile = await elRecuadroDe(p, "Carlos Díaz");
    await marcar(p, [{ c: cBtnMod, n: 1 }, { c: cMod, n: 2 }], { atenuar: true });
    await guardar(p, "moderar.webp", holgura(unir(cTile, cMod), 16, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    // El chat: un mensaje de cada lado.
    await losMandosALaVista(p);
    await mando(p, "Abrir el chat y la gente").click();
    const panel = p.locator("[data-panel-de-la-sala]");
    await panel.waitFor({ state: "visible", timeout: 10000 });
    const caja_ = panel.locator('textarea[placeholder="Escribe aquí…"]');
    await caja_.fill("Les comparto la propuesta ahora mismo.");
    await caja_.press("Enter");
    await invitado.p.mouse.move(700, 450, { steps: 4 });
    await invitado.p.locator('[aria-label="Abrir el chat y la gente"]').first().click();
    const cajaInv = invitado.p.locator('textarea[placeholder="Escribe aquí…"]');
    await cajaInv.waitFor({ state: "visible", timeout: 10000 });
    await cajaInv.fill("Perfecto, gracias. La reviso y le escribo.");
    await cajaInv.press("Enter");
    await p.getByText("La reviso y le escribo").waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 800);
    await losMandosALaVista(p);
    const cPanel = await caja(p, panel);
    await marcar(p, [{ c: cPanel, texto: "Solo lo ve quien está dentro", lado: "izquierda" }]);
    await guardar(p, "chat.webp");
    await desmarcar(p);
    // La mitad de ARRIBA del panel: las pestañas y los mensajes. Entero es una
    // tira de todo el alto que en 16:9 queda cortada por los dos lados.
    await miniatura(p, "chat-y-gente", { ...cPanel, h: Math.min(cPanel.h, 170) });

    await panel.getByRole("button", { name: /Gente/ }).click();
    await espera(p, 800);
    await losMandosALaVista(p);
    await marcar(p, [{ c: await caja(p, panel), texto: "Quién está dentro", lado: "izquierda" }]);
    await guardar(p, "gente.webp");
    await desmarcar(p);
    await panel.getByRole("button", { name: "Plegar el panel" }).click();
    await espera(p, 800);

    // Grabar: el menú, y la franja que ven todos.
    await losMandosALaVista(p);
    await mando(p, "Grabar la reunión").click();
    const menuGrabar = p.locator('[role="menu"]').last();
    await menuGrabar.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cGrabar = await caja(p, menuGrabar);
    const cBtnGrabar = await caja(p, mando(p, "Grabar la reunión"));
    await marcar(p, [{ c: cBtnGrabar, n: 1 }, { c: cGrabar, n: 2 }], { atenuar: true });
    await guardar(p, "grabar-menu.webp", holgura(unir(cGrabar, cBtnGrabar, { ...cGrabar, x: cGrabar.x - 260 }), 24, vista));
    await desmarcar(p);
    await miniatura(p, "grabar", unir(cGrabar, cBtnGrabar));
    await menuGrabar.getByRole("menuitem", { name: /solo el audio/ }).click();
    await p.getByText("Se está grabando esta reunión").first().waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1200);
    await losMandosALaVista(p);
    const franja = await caja(p, p.getByText("Se está grabando esta reunión").first().locator(".."));
    const parar = p.locator(`${CABECERA} [aria-label^="Parar la grabación"]`).first();
    await marcar(p, [
        { c: franja, texto: "La ven todos", lado: "abajo" },
        { c: await caja(p, parar), texto: "Parar", lado: "abajo" },
    ]);
    await guardar(p, "grabar-franja.webp", holgura({ x: 0, y: franja.y, w: vista.width, h: franja.h + 170 }, 0, vista));
    await desmarcar(p);

    // La foto de la reunión para la grabación de ejemplo (su miniatura).
    const fotoDeLaSala = path.join(TMP, "sala.png");
    await p.mouse.move(v.width / 2 - 200, v.height / 2 - 60, { steps: 4 });
    await p.waitForFunction((sel) => getComputedStyle(document.querySelector(sel)).opacity === "0", CABECERA, { timeout: 15000 }).catch(() => {});
    await p.locator(CAJA).screenshot({ path: fotoDeLaSala });
    unVideo(fotoDeLaSala, path.join(PUBLICOS, "capacitacion-video.webm"));

    // Plegar a una pastilla.
    await losMandosALaVista(p);
    await mando(p, "Plegar a una pastilla").click();
    const ampliar = p.locator('[aria-label="Ampliar la reunión"]').first();
    await ampliar.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 1000);
    const cPastilla = await caja(p, ampliar.locator("xpath=ancestor::*[contains(@class,'rounded')][1]"));
    await marcar(p, [{ c: cPastilla, texto: "La reunión sigue aquí", lado: "arriba" }]);
    await guardar(p, "vista-pastilla.webp");
    await desmarcar(p);

    // Fuera de la reunión: se cierran los otros dos y se deja la base limpia.
    await invitado.nav.close();
    await equipo.nav.close();
    await abrirReuniones(p);
    await limpiarLaSala(LA_DEMO);
    await abrirReuniones(p);

    // ── Pasadas y grabaciones ───────────────────────────────────────────
    await pestana(p, "Pasadas").click();
    await p.waitForSelector("[data-lista-de-reuniones='pasadas']", { timeout: 10000 });
    await espera(p, 600);
    const cPasadas = unir(...(await Promise.all([0, 1, 2, 3].map((i) => caja(p, p.locator("[data-lista-de-reuniones] > div").nth(i))))));
    await marcar(p, [
        { c: await caja(p, pestana(p, "Pasadas")), n: 1 },
        { c: cPasadas, n: 2 },
    ]);
    await guardar(p, "pasadas.webp");
    await desmarcar(p);
    const demo = laFila(p, "Demo con Óptica Visión");
    const cDemo = await caja(p, demo);
    await marcar(p, [
        { c: await caja(p, demo.locator("span.tabular-nums").first()), texto: "Cuándo fue", lado: "izquierda" },
        { c: await caja(p, demo.locator("span.font-medium").first()), texto: "Cuánto duró", lado: "arriba" },
        { c: await cajaDelTexto(demo.locator("p").nth(1)), texto: "Quién entró", lado: "derecha" },
    ], { atenuar: true });
    await guardar(p, "pasadas-fila.webp", holgura({ ...cDemo, y: cDemo.y - 70, h: cDemo.h + 140 }, 16, vista));
    await desmarcar(p);
    await miniatura(p, "pasadas", cDemo);
    const vacia = laFila(p, "Seguimiento del pedido");
    const cVacia = await caja(p, vacia);
    await marcar(p, [{ c: await cajaDelTexto(vacia.locator("p").nth(1)), texto: "No entró nadie", lado: "abajo" }], { atenuar: true });
    await guardar(p, "pasadas-vacia.webp", holgura({ ...cVacia, y: cVacia.y - 30, h: cVacia.h + 100 }, 16, vista));
    await desmarcar(p);

    await pestana(p, "Grabaciones").click();
    await p.waitForSelector("[data-grabacion]", { timeout: 10000 });
    await p.waitForFunction(() => [...document.querySelectorAll("[data-miniatura] video")].every((v) => v.readyState >= 1), null, { timeout: 15000 }).catch(() => {});
    await espera(p, 1500);
    const cGrabaciones = unir(...(await Promise.all([0, 1].map((i) => caja(p, p.locator("[data-grabacion]").nth(i))))));
    await marcar(p, [
        { c: await caja(p, pestana(p, "Grabaciones")), n: 1 },
        { c: cGrabaciones, n: 2 },
    ]);
    await guardar(p, "grabaciones.webp");
    await desmarcar(p);
    const capacitacion = p.locator("[data-grabacion='grab-guia-capacitacion']");
    await capacitacion.getByRole("button", { name: /Ver el texto/ }).click();
    await espera(p, 800);
    const cCap = await caja(p, capacitacion);
    await marcar(p, [{ c: cCap, texto: "Los puntos tratados y la transcripción", lado: "abajo" }], { atenuar: true });
    await guardar(p, "grabaciones-texto.webp", holgura({ ...cCap, h: cCap.h + 70 }, 16, vista));
    await desmarcar(p);
    await capacitacion.getByRole("button", { name: /Ocultar el texto/ }).click().catch(() => {});
    await pestana(p, "Abiertas").click();
    await espera(p, 500);

    // El marco de la pantalla: la barra de arriba y el menú con Panel.
    writeFileSync(MENU, JSON.stringify(await (await import("./herramientas-de-la-guia.mjs")).loQuePintaElMenu(p), null, 2) + "\n");
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Panel", rotulo: "Reuniones está en Panel" });
    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/** Entre una frase y la siguiente: lo mismo que en el vídeo de Leads. */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

async function video(navegador, estado, args) {
    const dir = path.join(TMP, "video");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    if (usaCedar()) await llenarLaCache(Object.values(NARRACION).map((n) => n.texto));
    const dicho = (texto) => (usaCedar() ? texto : comoSeDice(texto));
    const voz = Object.fromEntries(
        Object.entries(NARRACION).map(([id, n]) => [id, { ...n, audio: sintetizar(dicho(n.texto), path.join(dir, `${id}.wav`)) }]),
    );

    // Los otros dos llegan preparados: con la sesión abierta y la página
    // cargada, para que entren a tiempo de la frase que los nombra.
    const invitado = await laOtraPersona(args.invitado);
    const equipo = await laOtraPersona(args.equipo, { email: "sofia@banco.test" });

    const ctx = await navegador.newContext({
        viewport: { width: 1280, height: 800 },
        locale: "es-CO",
        timezoneId: "America/Bogota",
        storageState: estado,
        permissions: ["camera", "microphone", "clipboard-read", "clipboard-write"],
    });
    await ctx.addInitScript(CURSOR);
    const p = await ctx.newPage();
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const tramos = [];
    let calla = 0;
    let frase = null;
    const decir = async (id) => {
        await callar();
        const n = voz[id];
        await rotulo(p, n.rotulo);
        const ahora = Date.now();
        tramos.push({ texto: n.texto, audio: n.audio, inicioMs: ahora - t0 });
        frase = { texto: n.texto, inicio: ahora, ms: n.audio.ms };
        calla = ahora + n.audio.ms;
    };
    const alDecir = async (fragmento, adelanto = 450) => {
        const i = frase ? frase.texto.indexOf(fragmento) : -1;
        if (i < 0) throw new Error(`[guia] «${fragmento}» no está en la frase que suena: ${frase?.texto}`);
        const falta = frase.inicio + (frase.ms * i) / frase.texto.length - adelanto - Date.now();
        if (falta > 0) await espera(p, falta);
    };
    const callar = async (respiro = RESPIRO_ENTRE_FRASES_MS) => {
        const falta = calla + respiro - Date.now();
        if (calla && falta > 0) await espera(p, falta);
        calla = 0;
    };

    await abrirReuniones(p);
    await p.mouse.move(640, 400, { steps: 8 });
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("abres una videollamada", 600);
    await p.mouse.move(760, 520, { steps: 30 });

    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const panelDelMenu = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Panel" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Panel", 600);
    await mover(p, panelDelMenu);

    await decir("pestanas");
    await pulsar(p, flechas);
    await alDecir("las reuniones abiertas");
    await mover(p, pestana(p, "Abiertas"));
    await alDecir("las pasadas", 300);
    await pulsar(p, pestana(p, "Pasadas"));
    await alDecir("las grabaciones", 300);
    await pulsar(p, pestana(p, "Grabaciones"));
    await alDecir("cada una con su número", 300);
    await pulsar(p, pestana(p, "Abiertas"));

    await decir("abrir");
    await alDecir("cuánto tiempo vale el enlace");
    await pulsar(p, elBotonDeCaducidad(p));
    const ajustes = p.locator("[data-radix-popper-content-wrapper]").last();
    await p.locator("#reunion-titulo").waitFor({ state: "visible", timeout: 10000 });
    await pulsar(p, ajustes.locator("button", { hasText: "7 días" }));
    await alDecir("le pones un nombre", 300);
    await pulsar(p, p.locator("#reunion-titulo"));
    await p.locator("#reunion-titulo").pressSequentially(LA_DEMO, { delay: 35 });
    await alDecir("pulsas Nuevo", 300);
    await pulsar(p, elBotonNuevo(p));
    // La frase de la sala empieza YA, mientras la reunión se abre: esperar a
    // que la sala y su cámara estuvieran a la vista antes de hablar dejaba
    // dos segundos mudos (medido: 1,98 s).
    await decir("sala");

    // En cuanto la reunión existe, el invitado abre el enlace y Sofía entra:
    // van por su cuenta, a la vez que se sigue hablando.
    const codigo = await elCodigoDe(LA_DEMO);
    const llegaElInvitado = elInvitadoLlama(invitado.p, codigo);
    await p.waitForSelector(SALA, { timeout: 60000 });
    await esperarAQueSeVean(p, 1).catch(() => {});
    await losMandosALaVista(p);
    await alDecir("con este botón copias el enlace");
    await pulsar(p, mando(p, "Copiar el enlace de la reunión"));
    const entraElEquipo = elEquipoEntra(equipo.p, LA_DEMO);

    const dejar = p.getByRole("button", { name: /^Dejar entrar/ }).first();
    await decir("invitados");
    await llegaElInvitado;
    await dejar.waitFor({ state: "visible", timeout: 60000 });
    await mover(p, dejar);
    await alDecir("con Dejar entrar", 300);
    await pulsar(p, dejar);
    await entraElEquipo;
    // Que se vean las tres cámaras se espera DE FONDO, mientras se habla de
    // los mandos: esperado justo antes de la frase siguiente dejaba más de dos
    // segundos mudos en el vídeo (medido: 2,3 s).
    const tresVisibles = esperarAQueSeVean(p, 3).catch(() => {});

    await decir("mandos");
    const deAbajo = (r) => p.locator(`${MANDOS} [aria-label="${r}"]`).first();
    await alDecir("el micrófono", 300);
    await mover(p, deAbajo("Silenciar el micrófono"));
    await alDecir("la cámara", 300);
    await mover(p, deAbajo("Apagar la cámara"));
    await alDecir("compartir la pantalla", 300);
    await mover(p, deAbajo("Compartir la pantalla"));
    await alDecir("levantar la mano", 300);
    await mover(p, deAbajo("Levantar la mano"));
    await alDecir("el fondo", 300);
    await pulsar(p, deAbajo("Desenfocar o cambiar el fondo"));
    const menuFondo = p.locator('[role="menu"]').last();
    await menuFondo.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("que puedes desenfocar", 200);
    // Se SEÑALA la opción y se cierra el menú, sin elegirla: el desenfoque
    // corre un modelo de segmentación en el procesador y, con tres cámaras
    // en la misma máquina, el navegador se arrastra. Elegido aquí, lo que
    // quedaba del minuto se estiraba a más de cuatro (medido: 266 s).
    await mover(p, menuFondo.getByRole("menuitem", { name: /Desenfocar el fondo/ }));
    await p.keyboard.press("Escape");

    await decir("vista");
    await tresVisibles;
    await mover(p, p.locator("[data-recuadro]").first());
    await alDecir("con este botón", 300);
    await pulsar(p, mando(p, "Ver a todos en cuadrícula"));

    await decir("chat");
    await alDecir("Aquí se abre el chat", 200);
    await pulsar(p, mando(p, "Abrir el chat y la gente"));
    const panel = p.locator("[data-panel-de-la-sala]");
    const escribir = panel.locator('textarea[placeholder="Escribe aquí…"]');
    await escribir.waitFor({ state: "visible", timeout: 10000 });
    await escribir.pressSequentially("Les comparto la propuesta", { delay: 30 });
    await escribir.press("Enter");
    await alDecir("la lista de la gente", 300);
    await pulsar(p, panel.getByRole("button", { name: /Gente/ }));

    await decir("grabar");
    await pulsar(p, panel.getByRole("button", { name: "Plegar el panel" }));
    await alDecir("Con el botón redondo", 150);
    await pulsar(p, mando(p, "Grabar la reunión"));
    const menuGrabar = p.locator('[role="menu"]').last();
    await menuGrabar.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("solo el audio", 300);
    await pulsar(p, menuGrabar.getByRole("menuitem", { name: /solo el audio/ }));

    await decir("pastilla");
    await alDecir("la pliegas", 300);
    await pulsar(p, mando(p, "Plegar a una pastilla"));

    await decir("cierre");
    await alDecir("en Pasadas", 300);
    await pulsar(p, pestana(p, "Pasadas"));
    await alDecir("en Grabaciones", 300);
    await pulsar(p, pestana(p, "Grabaciones"));
    await callar(700);
    await rotulo(p, "");
    await espera(p, 500);

    const totalMs = Date.now() - t0;
    const grabado = await grabadora.parar();
    console.log(`  · grabados ${grabado.fotogramas} fotogramas (${(grabado.fotogramas / 25).toFixed(1)} s) de ${grabado.recibidos} pintados, en ${(totalMs / 1000).toFixed(1)} s`);
    await ctx.close();
    await invitado.nav.close();
    await equipo.nav.close();
    await limpiarLaSala(LA_DEMO);

    const { wav, colocados } = montarLaPista(tramos, totalMs);
    const pista = path.join(dir, "narracion.wav");
    guardarWav(pista, wav);
    const destino = path.join(SALIDA, "demostracion.webm");
    mezclar(mudo, pista, destino, { desdeMs });
    writeFileSync(path.join(TMP, "narracion.json"), JSON.stringify(colocados, null, 2));
    writeFileSync(
        path.join(import.meta.dirname, "voz-de-la-guia", "reuniones.json"),
        JSON.stringify(
            usaCedar()
                ? {
                      voz: VOZ_CEDAR.voz,
                      modelo: VOZ_CEDAR.modelo,
                      ritmo: { ...RITMO, respiroEntreFrasesMs: RESPIRO_ENTRE_FRASES_MS },
                      frases: Object.values(NARRACION).map((n) => llaveDeLaFrase(n.texto)),
                      empiezanEnMs: colocados.map((c) => c.inicioMs - desdeMs),
                  }
                : { voz: process.env.VOZ_GUIA, frases: [] },
            null,
            2,
        ) + "\n",
    );
    console.log("  ✓ demostracion.webm", Math.round(statSync(destino).size / 1024), "KB,", colocados.length, "frases narradas");
}

/* ------------------------------------------------------------------ */

const servidor = await servirLosFicheros();
unAudio(path.join(PUBLICOS, "capacitacion.webm"));
unAudio(path.join(PUBLICOS, "revision.webm"));

// Las cámaras de mentira se pintan con un navegador cualquiera.
const pintor = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const args = await lasCamaras(pintor, path.join(TMP, "camaras"));
await pintor.close();

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: args.anfitriona });
try {
    const ctx = await navegador.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        locale: "es-CO",
        timezoneId: "America/Bogota",
        permissions: ["camera", "microphone", "clipboard-read", "clipboard-write"],
    });
    const p = await entrar(ctx, BASE);
    await elMenuAbierto(p, false).catch(() => {});
    await abrirReuniones(p);
    if (!SOLO_VIDEO) await capturas(p, args);
    const estado = await ctx.storageState();
    // Las capturas dejan la sala en cuadrícula y con el panel abierto, y eso
    // se recuerda en `localStorage` («reunion:*»). El vídeo arranca como la
    // ve alguien que entra por primera vez: sin esas preferencias.
    for (const o of estado.origins ?? []) {
        o.localStorage = (o.localStorage ?? []).filter((x) => !x.name.startsWith("reunion:"));
    }
    await ctx.close();
    if (!SIN_VIDEO) await video(navegador, estado, args);
} finally {
    await navegador.close();
    servidor.close();
    await db.$disconnect();
}

const esperadas = JSON.parse(process.env.CAPTURAS_ESPERADAS ?? "[]");
const faltan = esperadas.filter((n) => !tomadas.has(n) && !(SOLO_VIDEO && existsSync(path.join(SALIDA, n))));
const sobran = readdirSync(SALIDA).filter((n) => n.endsWith(".webp") && !esperadas.includes(n));
if (sobran.length) console.warn("[guia] capturas que la guía no enseña:", sobran.join(", "));
if (faltan.length) {
    console.error("[guia] faltan capturas que la guía enseña:", faltan.join(", "));
    process.exit(1);
}
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO ? "" : " y el vídeo"} en public/guia/reuniones`);
