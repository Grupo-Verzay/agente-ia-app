/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Catálogo, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-catalogo.mjs`). Mismo estándar y mismas piezas que la de
 * Leads: lo común vive en `taller-de-la-guia.mjs`; aquí solo está lo que es de
 * esta pantalla —qué se abre, qué se señala y qué se dice—.
 *
 * La pantalla es `/mis-catalogo` (Panel › Catálogo), y la mitad de lo que se
 * explica se VE en otro sitio: en el catálogo público que abre «Ver
 * catálogo». Por eso cada apartado tiene su «Así queda», fotografiado en esa
 * página con los datos de la tienda de ejemplo, y el vídeo va de la
 * configuración al catálogo y vuelve.
 *
 * Las imágenes de la tienda (portada, logo y fotos) las sirve el propio guion
 * (`imagenes-guia-catalogo.mjs`): no se sube nada a ningún sitio.
 *
 * Qué captura hace falta lo dice `lib/guia-catalogo.ts`: el script se niega a
 * terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-catalogo.sh`.
 */
import { createRequire } from "node:module";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { servirLasImagenes } from "./imagenes-guia-catalogo.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-catalogo.mjs";
import { guardarWav, mezclar, montarLaPista } from "./voz-de-la-guia.mjs";
import {
    LA_BARRA_DE_ARRIBA,
    caja,
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
    tomarLasMiniaturas,
    unir,
} from "./taller-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "catalogo");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-catalogo";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
/** Solo el vídeo (p. ej. al cambiar la narración): las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-catalogo.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-catalogo.json");

/** La ruta de la pantalla y el enlace corto que siembra la semilla. */
const PANTALLA = "/mis-catalogo";
const ENLACE = "cafe-del-monte";

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* La pantalla de configuración                                        */
/* ------------------------------------------------------------------ */

const CABECERA = "[data-cabecera-del-catalogo]";
const URL_PERSONALIZADA = "[data-url-personalizada]";
const CONFIGURACION = "[data-configuracion-del-catalogo]";
const PIE = "[data-pie-del-catalogo]";
/** Los cinco apartados, en el orden de la pantalla. */
const APARTADOS = ["basicos", "identidad", "textos", "redes", "opciones"];
const apartado = (clave) => `[data-seccion-del-catalogo="${clave}"]`;
const tituloDe = (p, clave) => p.locator(`${apartado(clave)} > button`);

async function abrirElCatalogo(p) {
    await p.goto(`${BASE}${PANTALLA}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(CONFIGURACION, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2000);
    await despejar(p);
    // Los botones del borde tapan «Ver catálogo» y el Guardar del pie.
    await esconderLosBotonesDelBorde(p);
}

/** El campo que va debajo de un rótulo de la configuración. */
const elCampo = (p, rotulo) =>
    p.locator(`${CONFIGURACION} div.space-y-1\\.5`, { has: p.locator("label", { hasText: rotulo }) }).locator("input, textarea").last();

/** La fila de un interruptor de «Opciones de visualización». */
const laFilaDe = (p, rotulo) => p.locator(`${apartado("opciones")} div.rounded-lg`, { hasText: rotulo }).first();

const estaAbierto = (p, clave) => p.evaluate((sel) => !document.querySelector(sel).children[1].classList.contains("hidden"), apartado(clave));

/** Deja abierto SOLO ese apartado (o ninguno), pulsando su título como lo haría una persona. */
async function soloAbierto(p, clave) {
    for (const k of APARTADOS) {
        if ((await estaAbierto(p, k)) !== (k === clave)) {
            await tituloDe(p, k).click();
            await espera(p, 250);
        }
    }
    if (clave) await p.locator(apartado(clave)).scrollIntoViewIfNeeded();
    await espera(p, 350);
}

/** Las pestañas del Panel, arriba de la pantalla. */
const LAS_PESTANAS = (p) => p.locator(`nav a[href="${PANTALLA}"]`).first().locator("xpath=ancestor::div[contains(@class,'sticky')][1]");

/* ------------------------------------------------------------------ */
/* El catálogo público                                                 */
/* ------------------------------------------------------------------ */

/** Abre el catálogo público con «Ver catálogo», en su pestaña, como un cliente. */
async function abrirElPublico(p) {
    const [publico] = await Promise.all([p.context().waitForEvent("page"), p.getByRole("button", { name: "Ver catálogo" }).click()]);
    await esperarAlPublico(publico);
    return publico;
}

async function esperarAlPublico(publico) {
    await publico.waitForSelector('input[placeholder="Buscar producto..."]', { timeout: 60000 });
    await publico.evaluate(() => document.fonts.ready);
    await publico.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
    await espera(publico, 800);
}

const laTarjeta = (pub, titulo) => pub.locator("div.group", { has: pub.locator("h3", { hasText: titulo }) }).first();
const LA_PORTADA = (pub) => pub.locator("main > div").first();
const LAS_CATEGORIAS = (pub) => pub.getByRole("button", { name: "Todos", exact: true }).locator("xpath=..");

/** La primera fila de tarjetas: de la foto al botón. */
async function laPrimeraFila(pub) {
    return pub.evaluate(() => {
        const tarjetas = [...document.querySelectorAll("div.group")];
        const arriba = tarjetas[0].getBoundingClientRect().top;
        const fila = tarjetas.filter((t) => Math.abs(t.getBoundingClientRect().top - arriba) < 4).map((t) => t.getBoundingClientRect());
        const x = Math.min(...fila.map((r) => r.left));
        return { x, y: arriba, w: Math.max(...fila.map((r) => r.right)) - x, h: Math.max(...fila.map((r) => r.bottom)) - arriba };
    });
}

/**
 * Una tarjeta y la de al lado, en su misma fila: lo que se fotografía de una
 * tarjeta. Sola, una tarjeta es mucho más alta que ancha y en la guía saldría
 * de más de un palmo; con su vecina (bajo el velo) el encuadre queda como el
 * de las demás capturas. Si la tarjeta no se ve entera, se trae al centro.
 */
async function conSuVecina(pub, titulo) {
    const tarjeta = laTarjeta(pub, titulo);
    let c = await caja(pub, tarjeta);
    const vista = pub.viewportSize();
    if (c.y < 0 || c.y + c.h > vista.height) {
        await tarjeta.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await espera(pub, 500);
        c = await caja(pub, tarjeta);
    }
    const otras = await pub.locator("div.group").filter({ has: pub.locator("h3") }).evaluateAll((els) =>
        els.map((e) => {
            const r = e.getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height };
        }),
    );
    const vecina = otras
        .filter((b) => Math.abs(b.y - c.y) < 4 && Math.abs(b.x - c.x) > 4)
        .sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
    return { tarjeta, c, zona: vecina ? unir(c, vecina) : c };
}

/** Una caja abierta `x` píxeles a cada lado y `y` arriba y abajo: su número no tapa el texto. */
const afuera = (c, x, y = 0) => ({ x: c.x - x, y: c.y - y, w: c.w + 2 * x, h: c.h + 2 * y });

/** Lo que ocupa un texto de verdad (un párrafo de bloque mide la fila entera). */
async function elTexto(pub, locator) {
    await locator.waitFor({ state: "visible", timeout: 20000 });
    return locator.evaluate((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const b = r.getBoundingClientRect();
        return { x: b.left, y: b.top, w: b.width, h: b.height };
    });
}

/** Los botones de categoría, de «Todos» al último (su contenedor mide la fila entera). */
async function lasCategorias(pub) {
    const botones = LAS_CATEGORIAS(pub).locator("button");
    const cajas = [];
    for (let i = 0; i < (await botones.count()); i += 1) cajas.push(await caja(pub, botones.nth(i)));
    return unir(...cajas);
}

/**
 * Lo alto de la ventana del catálogo público: la portada entera y la primera
 * fila de tarjetas, con su botón. A 900 el botón queda cortado.
 */
async function aLaAlturaDeLaPrimeraFila(pub) {
    const fila = await laPrimeraFila(pub);
    const alto = Math.min(1400, Math.ceil(fila.y + fila.h + 32));
    await pub.setViewportSize({ width: pub.viewportSize().width, height: alto });
    await espera(pub, 600);
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

async function miniaturas(p) {
    const laSeccion = (clave) => async () => {
        await soloAbierto(p, clave);
        return caja(p, apartado(clave));
    };
    const zonas = [
        ["vista-general", async () => unir(await caja(p, CABECERA), await caja(p, URL_PERSONALIZADA), await caja(p, CONFIGURACION))],
        ["ver-catalogo", async () => caja(p, p.getByRole("button", { name: "Ver catálogo" }))],
        ["url-personalizada", async () => caja(p, URL_PERSONALIZADA)],
        ["whatsapp", async () => {
            await soloAbierto(p, "basicos");
            return caja(p, elCampo(p, "Número WhatsApp"));
        }],
        ["identidad", laSeccion("identidad")],
        ["textos", laSeccion("textos")],
        ["redes", laSeccion("redes")],
        ["opciones", laSeccion("opciones")],
    ];
    await tomarLasMiniaturas(p, zonas, { salida: SALIDA, tomadas, focos: FOCOS });
    await soloAbierto(p, "basicos");
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();
    await soloAbierto(p, "basicos");
    await p.locator(CABECERA).scrollIntoViewIfNeeded();

    // Portada del vídeo: la pantalla limpia.
    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las seis zonas, en el orden de
    // `ZONAS_DE_LA_PANTALLA`. El menú y la barra de arriba van metidos unos
    // píxeles: pegados al borde, su recuadro se saldría.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const cPestanas = await caja(p, LAS_PESTANAS(p));
    const cArriba = unir(await caja(p, CABECERA), await caja(p, URL_PERSONALIZADA));
    const cConfiguracion = await caja(p, CONFIGURACION);
    const cPie = await caja(p, PIE);
    const bajoElMenu = await dondeAcabaElMenu(p);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: dentro(cPestanas, 4), n: 3 },
        { c: cArriba, n: 4 },
        { c: cConfiguracion, n: 5 },
        { c: cPie, n: 6 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // Las pestañas del Panel, con Catálogo señalada.
    const pestana = await caja(p, p.locator(`nav a[href="${PANTALLA}"]`).first());
    await marcar(p, [{ c: dentro(cPestanas, 4), soloLuz: true }, { c: pestana, texto: "Estás en Catálogo", lado: "abajo" }], { atenuar: true });
    // Arranca en el borde de las pestañas: con margen por arriba asomaría el
    // pie de los botones de la barra de arriba, cortado.
    const zonaPestanas = holgura({ ...cPestanas, h: cPestanas.h + 110 }, 12, vista);
    await guardar(p, "pestanas.webp", { ...zonaPestanas, y: cPestanas.y, h: zonaPestanas.h - (cPestanas.y - zonaPestanas.y) });
    await desmarcar(p);

    // Los cinco apartados, numerados; al entrar solo Datos básicos está abierto.
    const titulos = [];
    for (const k of APARTADOS) titulos.push(await caja(p, tituloDe(p, k)));
    // Cada recuadro se abre unos píxeles a los lados: su número va en la
    // esquina, y pegado al texto le taparía la primera letra.
    await marcar(p, titulos.map((c, i) => ({ c: afuera(c, 14, -2), n: i + 1 })));
    await guardar(p, "apartados.webp", holgura(cConfiguracion, 24, vista));
    await desmarcar(p);

    // El pie: el enlace público y Guardar.
    await marcar(p, [
        { c: await caja(p, p.locator(`${PIE} p`)), texto: "Tu catálogo público", lado: "arriba" },
        { c: await caja(p, p.locator(`${PIE} button`, { hasText: "Guardar" })), texto: "Guarda los cinco apartados", lado: "arriba" },
    ]);
    await guardar(p, "guardar.webp", holgura({ ...cPie, y: cPie.y - 110, h: cPie.h + 110 }, 16, vista));
    await desmarcar(p);

    // 2. Tu catálogo público.
    const cVer = await caja(p, p.getByRole("button", { name: "Ver catálogo" }));
    await marcar(p, [{ c: cVer, texto: "Lo abre en otra pestaña", lado: "abajo" }]);
    await guardar(p, "ver-catalogo.webp", holgura(unir(cArriba, { ...cVer, h: cVer.h + 90 }), 20, vista));
    await desmarcar(p);

    const pub = await abrirElPublico(p);
    await aLaAlturaDeLaPrimeraFila(pub);
    const vistaPub = pub.viewportSize();
    await catalogoPublico(pub, vistaPub);
    await pub.close();

    // 3. El enlace personalizado. Se escribe con tildes y espacios, como lo
    // escribe una persona: la pantalla lo deja en minúsculas y con guiones.
    const campoEnlace = p.locator(`${URL_PERSONALIZADA} input`);
    const guardarEnlace = p.locator(`${URL_PERSONALIZADA} button`, { hasText: "Guardar" });
    const cUrl = await caja(p, URL_PERSONALIZADA);
    const zonaUrl = holgura({ ...cUrl, h: cUrl.h + 70 }, 20, vista);
    await campoEnlace.fill("");
    await campoEnlace.pressSequentially("Café del Monte Centro", { delay: 20 });
    await espera(p, 300);
    await marcar(p, [
        { c: await caja(p, campoEnlace.locator("xpath=..")), texto: "Sin tildes y con guiones, solo", lado: "abajo" },
        { c: await caja(p, guardarEnlace), n: 1, esquina: "derecha" },
    ]);
    await guardar(p, "url-escribir.webp", zonaUrl);
    await desmarcar(p);
    await guardarEnlace.click();
    await p.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
    await espera(p, 1200);
    const activa = p.locator(`${URL_PERSONALIZADA} p`, { hasText: "URL activa" });
    await marcar(p, [
        { c: await elTexto(p, activa), texto: "Lista para compartir", lado: "derecha" },
        { c: await caja(p, p.locator("[data-sonner-toast]").last()) },
    ], { atenuar: true });
    await guardar(p, "url-activa.webp");
    await desmarcar(p);
    await quitarAvisos(p);

    // Un nombre que ya usa otra cuenta (la semilla le dio «tienda»).
    await campoEnlace.fill("");
    await campoEnlace.pressSequentially("tienda", { delay: 20 });
    await guardarEnlace.click();
    await p.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
    await espera(p, 1200);
    await marcar(p, [
        { c: await caja(p, campoEnlace.locator("xpath=..")), texto: "Otra cuenta ya lo usa", lado: "abajo" },
        { c: await caja(p, p.locator("[data-sonner-toast]").last()) },
    ], { atenuar: true });
    await guardar(p, "url-en-uso.webp");
    await desmarcar(p);
    await quitarAvisos(p);
    // Y se deja como estaba: el resto de capturas y el vídeo usan el de la semilla.
    await campoEnlace.fill("");
    await campoEnlace.pressSequentially(ENLACE, { delay: 10 });
    await guardarEnlace.click();
    await p.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
    await quitarAvisos(p);

    // 4 a 8. Cada apartado se fotografía IGUAL: la tarjeta de configuración
    // entera, con solo ese apartado abierto. Así se ve cuál de los cinco es, y
    // lo que va debajo (los otros apartados, cerrados) deja sitio al rótulo.
    // Se abre, se centra la tarjeta y SOLO ENTONCES se mide lo que se marca.
    const elApartado = async (clave) => {
        await soloAbierto(p, clave);
        await p.locator(CONFIGURACION).evaluate((el) => el.scrollIntoView({ block: "center" }));
        await espera(p, 400);
        return holgura(await caja(p, CONFIGURACION), 16, vista);
    };

    // 4. El botón de WhatsApp: el número, en Datos básicos.
    const zonaBasicos = await elApartado("basicos");
    await marcar(p, [{ c: await caja(p, elCampo(p, "Número WhatsApp")), texto: "Con el indicativo del país", lado: "abajo" }]);
    await guardar(p, "whatsapp-numero.webp", zonaBasicos);
    await desmarcar(p);

    // 5. Portada y color.
    const zonaIdentidad = await elApartado("identidad");
    await marcar(p, [{ c: await caja(p, elCampo(p, "URL de imagen de portada")), texto: "Una imagen ancha", lado: "abajo" }]);
    await guardar(p, "identidad-portada.webp", zonaIdentidad);
    const color = p.locator(`${apartado("identidad")} input[type="color"]`);
    await marcar(p, [{ c: unir(await caja(p, color), await caja(p, elCampo(p, "Color primario"))), texto: "El cuadro o el código", lado: "abajo" }]);
    await guardar(p, "identidad-color.webp", zonaIdentidad);
    await desmarcar(p);

    // 6. Los textos: el título y la descripción, y el del botón. Los números
    // son los mismos que en el «Así queda» (1 título, 2 descripción, 3 botón).
    const zonaTextos = await elApartado("textos");
    await marcar(p, [
        { c: await caja(p, elCampo(p, "Título principal")), n: 1, esquina: "derecha" },
        { c: await caja(p, elCampo(p, "Descripción / slogan")), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "textos-titulo.webp", zonaTextos);
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, elCampo(p, "Texto del botón WhatsApp")), n: 3, esquina: "derecha" }]);
    await guardar(p, "textos-boton.webp", zonaTextos);
    await desmarcar(p);

    // 7. Redes sociales.
    const zonaRedes = await elApartado("redes");
    const redes = [];
    for (const red of ["Instagram", "Facebook", "TikTok"]) redes.push(await caja(p, elCampo(p, red)));
    await marcar(p, redes.map((c, i) => ({ c, n: i + 1, esquina: "derecha" })));
    await guardar(p, "redes.webp", zonaRedes);
    await desmarcar(p);

    // 8. Opciones de visualización.
    const zonaOpciones = await elApartado("opciones");
    await marcar(p, [
        { c: await caja(p, laFilaDe(p, "Mostrar stock")), n: 1, esquina: "derecha" },
        { c: await caja(p, laFilaDe(p, "Mostrar SKU")), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "opciones.webp", zonaOpciones);
    await desmarcar(p);
    await soloAbierto(p, "basicos");

    // El «Así queda» de cada apartado, en el catálogo público.
    const pub2 = await abrirElPublico(p);
    await aLaAlturaDeLaPrimeraFila(pub2);
    await asiQueda(pub2, pub2.viewportSize());
    await pub2.close();

    // Lo que pasa al DEJAR algo vacío o apagado: se cambia en la pantalla, se
    // guarda, se fotografía el catálogo público y se deja como estaba.
    const tiktok = elCampo(p, "TikTok");
    await conUnCambio(p, {
        cambiar: async () => {
            await soloAbierto(p, "redes");
            await tiktok.fill("");
        },
        deshacer: async () => {
            await soloAbierto(p, "redes");
            await tiktok.fill("@cafedelmonte");
        },
        fotografiar: async (pub, v) => {
            if (await pub.locator('a[title="TikTok"]').count()) throw new Error("TikTok sigue saliendo con el campo vacío");
            const iconos = unir(...(await Promise.all(["Instagram", "Facebook"].map((red) => caja(pub, pub.locator(`a[title="${red}"]`))))));
            await marcar(pub, [{ c: iconos, texto: "Sin TikTok: su icono no sale", lado: "izquierda" }]);
            await guardar(pub, "redes-vacia.webp", encuadreDeLasRedes(iconos, v));
            await desmarcar(pub);
        },
    });
    const interruptores = () => [laFilaDe(p, "Mostrar stock"), laFilaDe(p, "Mostrar SKU")].map((f) => f.locator('[role="switch"]'));
    const ponerLosInterruptores = async (encendidos) => {
        await soloAbierto(p, "opciones");
        for (const s of interruptores()) {
            if (((await s.getAttribute("aria-checked")) === "true") !== encendidos) await s.click();
            await espera(p, 200);
        }
    };
    await conUnCambio(p, {
        cambiar: () => ponerLosInterruptores(false),
        deshacer: () => ponerLosInterruptores(true),
        fotografiar: async (pub, v) => {
            const { tarjeta, c, zona } = await conSuVecina(pub, "Café Tolima Clásico");
            if (await tarjeta.getByText(/unidades disponibles|SKU:|¡Últimas/).count()) throw new Error("la tarjeta sigue enseñando stock o SKU");
            await marcar(pub, [
                { c, soloLuz: true },
                { c: await caja(pub, tarjeta.locator("div.mt-auto")), texto: "Ni unidades, ni SKU, ni «¡Últimas!»", lado: "derecha" },
            ], { atenuar: true });
            await guardar(pub, "opciones-apagadas.webp", holgura(zona, 16, v));
            await desmarcar(pub);
        },
    });

    await elMarcoDeLaPantalla(p, guardar, { modulo: "Panel", texto: "Catálogo está en Panel" });
}

/** Lo que ve el cliente: la portada, el buscador y las categorías, y una tarjeta. */
async function catalogoPublico(pub, vista) {
    const cPortada = await caja(pub, LA_PORTADA(pub));
    const cFila = await laPrimeraFila(pub);
    await marcar(pub, [
        { c: dentro(cPortada, 8), n: 1 },
        { c: cFila, n: 2 },
    ]);
    await guardar(pub, "catalogo-publico.webp");
    await desmarcar(pub);

    // Buscar y filtrar: se toca una categoría y el contador lo dice.
    const buscador = pub.locator('input[placeholder="Buscar producto..."]');
    await pub.getByRole("button", { name: "Accesorios", exact: true }).click();
    await espera(pub, 700);
    const cBuscador = await caja(pub, buscador);
    const cCategorias = await lasCategorias(pub);
    const cuantos = pub.locator("p", { hasText: /productos? encontrados?/ }).first();
    const cFilaFiltrada = await laPrimeraFila(pub);
    await marcar(pub, [
        { c: cBuscador, n: 1 },
        { c: cCategorias, n: 2 },
        { c: await elTexto(pub, cuantos), texto: "Solo los de esa categoría", lado: "derecha" },
    ]);
    await guardar(pub, "catalogo-buscar.webp", holgura(unir(cBuscador, cCategorias, cFilaFiltrada), 24, vista));
    await desmarcar(pub);
    await pub.getByRole("button", { name: "Todos", exact: true }).click();
    await espera(pub, 700);

    // Una tarjeta, parte por parte: la de Nariño lleva descuento.
    const { tarjeta: t, c: cTarjeta, zona: zonaNarino } = await conSuVecina(pub, "Café Nariño Especial");
    await marcar(pub, [
        { c: cTarjeta, soloLuz: true },
        { c: await caja(pub, t.locator("span.absolute.bottom-3")), n: 1 },
        { c: await caja(pub, t.locator("h3")), n: 2, esquina: "derecha" },
        { c: await caja(pub, t.locator("span.text-2xl").locator("xpath=..")), n: 3, esquina: "derecha" },
        { c: await caja(pub, t.locator("span", { hasText: /^-\d+%$/ })), n: 4, esquina: "derecha" },
        { c: await caja(pub, t.locator('a[href^="https://wa.me"]')), n: 5, esquina: "derecha" },
    ], { atenuar: true });
    await guardar(pub, "catalogo-producto.webp", holgura(zonaNarino, 16, vista));
    await desmarcar(pub);
}

/**
 * La esquina de la portada donde salen las redes, con su rótulo: el MISMO
 * encuadre con las tres y con una menos, para que se comparen. La portada
 * entera deja los iconos del tamaño de una hormiga.
 */
function encuadreDeLasRedes(iconos, vista) {
    const derecha = Math.min(vista.width, iconos.x + iconos.w + 24);
    const x = Math.max(0, derecha - 560);
    return { x, y: 0, w: derecha - x, h: Math.min(vista.height, iconos.y + iconos.h + 48) };
}

/** Pulsa el Guardar de abajo y espera a que la pantalla diga que guardó. */
async function guardarLaConfiguracion(p) {
    await p.locator(`${PIE} button`, { hasText: "Guardar" }).click();
    await p.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
    await quitarAvisos(p);
}

/**
 * Cambia algo en la pantalla, lo guarda, fotografía el catálogo público como
 * lo ve el cliente, y lo DEJA COMO ESTABA: el resto de capturas y el vídeo
 * cuentan con la configuración de la semilla.
 */
async function conUnCambio(p, { cambiar, deshacer, fotografiar }) {
    await cambiar();
    await guardarLaConfiguracion(p);
    const pub = await abrirElPublico(p);
    try {
        await aLaAlturaDeLaPrimeraFila(pub);
        await fotografiar(pub, pub.viewportSize());
    } finally {
        await pub.close();
        await deshacer();
        await guardarLaConfiguracion(p);
    }
}

/** El «Así queda» de cada apartado, fotografiado en el catálogo público. */
async function asiQueda(pub, vista) {
    const cPortada = await caja(pub, LA_PORTADA(pub));
    const { tarjeta, c: cTarjeta, zona: zonaHuila } = await conSuVecina(pub, "Café Origen Huila");
    const boton = tarjeta.locator('a[href^="https://wa.me"]');

    // WhatsApp: el botón verde de una tarjeta. El rótulo va sobre la vecina,
    // que está bajo el velo: debajo del botón ya no queda tarjeta.
    await marcar(pub, [
        { c: cTarjeta, soloLuz: true },
        { c: await caja(pub, boton), texto: "Te escribe con el producto puesto", lado: "izquierda" },
    ], { atenuar: true });
    await guardar(pub, "whatsapp-boton.webp", holgura(zonaHuila, 16, vista));
    await desmarcar(pub);

    // Sin unidades, sin botón: la tarjeta agotada dice «Sin stock disponible».
    const { tarjeta: agotada, c: cAgotada, zona: zonaAgotada } = await conSuVecina(pub, "Café Molido Espresso");
    await marcar(pub, [
        { c: cAgotada, soloLuz: true },
        // Sin rótulo: a su lado está el botón verde de la vecina, y un rótulo
        // encima lo taparía a medias.
        { c: await caja(pub, agotada.locator("button", { hasText: "Sin stock disponible" })) },
    ], { atenuar: true });
    await guardar(pub, "whatsapp-sin-stock.webp", holgura(zonaAgotada, 16, vista));
    await desmarcar(pub);

    // Identidad: la portada, la categoría elegida y los precios, en el color.
    await marcar(pub, [
        { c: dentro(cPortada, 8), n: 1 },
        { c: await caja(pub, pub.getByRole("button", { name: "Todos", exact: true })), n: 2, esquina: "derecha" },
        { c: await caja(pub, tarjeta.locator("span.text-2xl")), n: 3, esquina: "derecha" },
    ]);
    await guardar(pub, "identidad-resultado.webp");
    await desmarcar(pub);

    // Textos: el título y la descripción sobre la portada; el texto del botón.
    await marcar(pub, [
        { c: await caja(pub, pub.locator("main h1")), n: 1, esquina: "derecha" },
        { c: await caja(pub, pub.locator("main h1 + p")), n: 2, esquina: "derecha" },
        { c: await caja(pub, boton), n: 3, esquina: "derecha" },
    ]);
    await guardar(pub, "textos-resultado.webp");
    await desmarcar(pub);

    // Redes: los iconos arriba a la derecha de la portada.
    const iconos = unir(...(await Promise.all(["Instagram", "Facebook", "TikTok"].map((red) => caja(pub, pub.locator(`a[title="${red}"]`))))));
    await marcar(pub, [{ c: iconos, texto: "Abren tus perfiles", lado: "izquierda" }]);
    await guardar(pub, "redes-resultado.webp", encuadreDeLasRedes(iconos, vista));
    await desmarcar(pub);

    // Opciones: unidades y SKU en una tarjeta con pocas unidades.
    // Va en la segunda fila: `conSuVecina` la trae al centro antes de medirla.
    const { tarjeta: pocas, c: cPocas, zona: zonaTolima } = await conSuVecina(pub, "Café Tolima Clásico");
    await marcar(pub, [
        { c: cPocas, soloLuz: true },
        // Los recuadros se abren a los lados: su número, en la esquina, taparía
        // la primera cifra y el signo de exclamación.
        { c: afuera(await caja(pub, pocas.locator("div.text-xs.text-gray-400").last()), 12, 3), n: 1 },
        { c: afuera(await caja(pub, pocas.locator("span", { hasText: /¡Últimas/ })), 14, 3), n: 2, esquina: "derecha" },
    ], { atenuar: true });
    await guardar(pub, "opciones-resultado.webp", holgura(zonaTolima, 16, vista));
    await desmarcar(pub);
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/** Entre una frase y la siguiente, lo que respira una persona hablando (el mismo de Leads). */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

/**
 * Sube la página (con la rueda, suave: el vídeo lo enseña) hasta que `locator`
 * quede a `arriba` px del borde de arriba. El ratón va primero a `sobre`, que
 * es lo que se desplaza.
 */
async function subirHasta(p, locator, { arriba = 160, sobre } = {}) {
    const b = await locator.boundingBox();
    const delta = Math.round(b.y - arriba);
    if (Math.abs(delta) < 24) return;
    if (sobre) await p.mouse.move(sobre.x, sobre.y, { steps: 10 });
    const pasos = Math.max(4, Math.round(Math.abs(delta) / 60));
    for (let i = 0; i < pasos; i += 1) {
        await p.mouse.wheel(0, delta / pasos);
        await espera(p, 28);
    }
    await espera(p, 250);
}

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
    await servirLasImagenes(ctx);
    await conElDominioDeLaGuia(ctx, BASE);
    const p = await ctx.newPage();
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirElCatalogo(p);
    await p.mouse.move(640, 400, { steps: 8 });
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("cómo se ve", 600);
    await mover(p, p.locator(CONFIGURACION));

    // El menú: se abre con las dos flechas, se señala Panel y se recoge al
    // empezar la frase de la barra, donde viven las flechas.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const panel = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Panel" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Panel", 600);
    await mover(p, panel);

    const [, , , buscarTodo, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // Ver catálogo: en el vídeo se abre en la MISMA pestaña (lo grabado es
    // esta página; una pestaña nueva no saldría en el vídeo).
    await p.evaluate(() => {
        window.open = (url) => {
            window.location.href = url;
            return null;
        };
    });
    const ver = p.getByRole("button", { name: "Ver catálogo" });
    await decir("verCatalogo");
    await pulsar(p, ver);
    await esperarAlPublico(p);
    await p.mouse.move(640, 300, { steps: 16 });

    const buscador = p.locator('input[placeholder="Buscar producto..."]');
    await decir("buscar");
    await pulsar(p, buscador);
    await buscador.pressSequentially("Huila", { delay: 110 });
    await alDecir("toca una categoría", 500);
    await buscador.fill("");
    await pulsar(p, p.getByRole("button", { name: "Accesorios", exact: true }));
    await alDecir("con Todos");
    await pulsar(p, p.getByRole("button", { name: "Todos", exact: true }));

    const botonVerde = laTarjeta(p, "Café Nariño Especial").locator('a[href^="https://wa.me"]');
    await decir("botonWhatsApp");
    await subirHasta(p, laTarjeta(p, "Café Nariño Especial"), { arriba: 90, sobre: { x: 640, y: 420 } });
    await alDecir("el botón verde", 500);
    await mover(p, botonVerde);

    // De vuelta a la configuración.
    const campoEnlace = p.locator(`${URL_PERSONALIZADA} input`);
    const guardarEnlace = p.locator(`${URL_PERSONALIZADA} button`, { hasText: "Guardar" });
    await decir("enlace");
    await p.goBack({ waitUntil: "domcontentloaded" });
    await p.waitForSelector(CONFIGURACION, { timeout: 60000 });
    await espera(p, 400);
    await alDecir("un enlace corto", 350);
    await pulsar(p, campoEnlace);
    await campoEnlace.fill("");
    await campoEnlace.pressSequentially("Café del Monte Centro", { delay: 45 });
    await alDecir("con este botón", 500);
    await pulsar(p, guardarEnlace);

    await decir("numero");
    await alDecir("el número de WhatsApp", 500);
    await mover(p, elCampo(p, "Número WhatsApp"));

    // Los apartados: se abre cada uno pulsando su título, y la página sube
    // con la rueda para que se vea lo que se abrió.
    const centro = { x: 760, y: 520 };
    const abrirApartado = async (clave) => {
        await subirHasta(p, tituloDe(p, clave), { arriba: 200, sobre: centro });
        await pulsar(p, tituloDe(p, clave));
        await espera(p, 300);
    };

    await decir("identidad");
    await abrirApartado("identidad");
    await alDecir("la imagen de portada", 400);
    await mover(p, elCampo(p, "URL de imagen de portada"));
    await alDecir("el color", 350);
    await mover(p, p.locator(`${apartado("identidad")} input[type="color"]`));

    await decir("textos");
    await abrirApartado("textos");
    await alDecir("el título", 350);
    await mover(p, elCampo(p, "Título principal"));
    await alDecir("la descripción", 350);
    await mover(p, elCampo(p, "Descripción / slogan"));
    await alDecir("lo que dice el botón", 350);
    await mover(p, elCampo(p, "Texto del botón WhatsApp"));

    await decir("redes");
    await abrirApartado("redes");
    await alDecir("tu Instagram", 350);
    await mover(p, elCampo(p, "Instagram"));
    await alDecir("tu Facebook", 300);
    await mover(p, elCampo(p, "Facebook"));
    await alDecir("tu TikTok", 300);
    await mover(p, elCampo(p, "TikTok"));

    await decir("opciones");
    await abrirApartado("opciones");
    await alDecir("las unidades disponibles", 400);
    await mover(p, laFilaDe(p, "Mostrar stock").locator('[role="switch"]'));
    await alDecir("el código", 350);
    await mover(p, laFilaDe(p, "Mostrar SKU").locator('[role="switch"]'));

    const guardarTodo = p.locator(`${PIE} button`, { hasText: "Guardar" });
    await decir("cierre");
    await subirHasta(p, p.locator(PIE), { arriba: 560, sobre: centro });
    await alDecir("pulsa Guardar", 500);
    await pulsar(p, guardarTodo);
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
    escribirLaVozDelVideo("catalogo", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
    await servirLasImagenes(ctx);
    await conElDominioDeLaGuia(ctx, BASE);
    const p = await entrar(ctx, BASE);
    await abrirElCatalogo(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) await video(navegador, estado);
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/catalogo`);
