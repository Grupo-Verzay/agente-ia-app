/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de AI Imágenes, sobre
 * la App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-ai-imagenes.mjs`). Mismo estándar y mismas piezas que las de
 * Leads, Catálogo, Diagramas, Reuniones y Mis notas: lo común vive en
 * `taller-de-la-guia.mjs`; aquí solo está lo que es de esta pantalla —qué se
 * abre, qué se señala y qué se dice—.
 *
 * La pantalla es `/ai-image` y lo que genera lo contesta un Gemini FINGIDO,
 * cargado dentro de `next start` (`fingido-guia-ai-imagenes.mjs`): la acción
 * de servidor, el SDK de Google, el cobro de créditos y el panel del texto son
 * los de verdad; solo la respuesta de Google es de ejemplo.
 *
 * Las capturas son UNA historia seguida, como la vive un cliente: entra sin
 * clave, la configura, sube su producto, recorre los cuatro pasos, genera,
 * lee el texto del post y termina con el kit de landing. Por eso las
 * miniaturas se toman cuando se llega a su zona (`tomarUnaMiniatura`), como en
 * Reuniones, y no hay `SOLO_MINIATURAS`: la mitad solo existe después de
 * generar.
 *
 * Qué captura hace falta lo dice `lib/guia-ai-imagenes.ts`: el script se niega
 * a terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-ai-imagenes.sh`.
 */
import { createRequire } from "node:module";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-ai-imagenes.mjs";
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
    tomarUnaMiniatura,
    unir,
} from "./taller-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const sharp = require("sharp");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "ai-imagenes");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-ai-imagenes";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo el vídeo (p. ej. al cambiar la narración): las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-ai-imagenes.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-ai-imagenes.json");

if (process.env.SOLO_MINIATURAS === "1") {
    console.error("[guia] En AI Imágenes las miniaturas se toman a mitad de la historia (la mitad solo existe después de generar): no hay SOLO_MINIATURAS. Usa SIN_VIDEO=1.");
    process.exit(1);
}

/** La ruta de la pantalla. */
const PANTALLA = "/ai-image";
/** La foto del producto de ejemplo: un termo verde salvia (la misma que usan las imágenes de ejemplo). */
const PRODUCTO = path.join(RAIZ, "scripts", "guia-ai-imagenes", "producto.jpg");
/** La clave que se teclea: es de mentira, contesta el Gemini fingido. Va en un campo de contraseña. */
const CLAVE_DE_EJEMPLO = "AIzaSyGuiaDeEjemploNoEsUnaClaveReal000";
/** El ambiente y los detalles de la campaña de ejemplo. */
const IDEA_RAPIDA = "Mesa de mármol";
const DETALLES = "Termo de acero inoxidable de 750 ml, verde salvia, con tapa de bambú. Mantiene el frío 24 horas y el calor 12 horas.";
/** El estilo propio que se enseña al crearlo (no se guarda: la biblioteca queda como la sembró la semilla). */
const ESTILO_NUEVO = { nombre: "Luz de mañana", descripcion: "Luz suave de ventana, fondo de lino claro y sombras largas." };

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });
const focos = {};

/* ------------------------------------------------------------------ */
/* La pantalla                                                         */
/* ------------------------------------------------------------------ */

const GENERADOR = '[data-panel="generador"]';
const CABECERA_DEL_GENERADOR = `${GENERADOR} > div`;
const ZONA_CLAVE = '[data-zona="api-key"]';
const PASOS = '[data-zona="pasos"]';
const PASO_ABIERTO = '[data-zona="paso-abierto"]';
const PIE = '[data-zona="pie-del-paso"]';
const RESULTADO = '[data-zona="resultado"]';
const VISTA_PREVIA = '[data-panel="vista-previa"]';
const TEXTO_DEL_POST = '[data-panel="copy-del-anuncio"]';
const CAMPO_DEL_TEXTO = '[data-campo="copy-del-anuncio"]';
const BOTON_GENERAR = '[data-boton="generar"]';
const paso = (id) => `[data-paso="${id}"]`;
/**
 * La caja de las LETRAS de un elemento, no la del elemento: un párrafo mide
 * todo el ancho de su tarjeta aunque su frase acabe a la mitad.
 */
async function cajaDelTexto(p, selector) {
    await p.locator(selector).first().waitFor({ state: "visible", timeout: 20000 });
    const b = await p.locator(selector).first().evaluate((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const c = r.getBoundingClientRect();
        return { x: c.x, y: c.y, w: c.width, h: c.height };
    });
    if (!b.w || !b.h) throw new Error(`sin letras: ${selector}`);
    return b;
}

const zona = (nombre) => `[data-zona="${nombre}"]`;

async function abrirLaPantalla(p) {
    await p.goto(`${BASE}${PANTALLA}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(GENERADOR, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 1800);
    await despejar(p);
    // Los botones del borde tapan la columna de la vista previa.
    await esconderLosBotonesDelBorde(p);
}

/** Abre un paso pulsando su botón, como lo haría una persona, y espera a que sea el abierto. */
async function irAlPaso(p, id) {
    await p.locator(paso(id)).click();
    await p.waitForSelector(`${paso(id)}[aria-current="step"]`, { timeout: 10000 });
    await espera(p, 450);
}

/** El botón de un pie o de una zona, por lo que dice. */
const elBoton = (p, dentroDe, texto) => p.locator(`${dentroDe} button`, { hasText: texto }).first();

/** Configura la clave con la ventana de «Configurar», como un cliente. */
async function ponerLaClave(p, { antesDeGuardar } = {}) {
    await elBoton(p, ZONA_CLAVE, "Configurar").click();
    const dialogo = p.locator('[role="dialog"]', { hasText: "Configura tu API key de Google" });
    await dialogo.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await dialogo.locator('input[type="password"]').pressSequentially(CLAVE_DE_EJEMPLO, { delay: 8 });
    if (antesDeGuardar) await antesDeGuardar(dialogo);
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await p.locator(ZONA_CLAVE, { hasText: "configurada" }).waitFor({ state: "visible", timeout: 20000 });
    await quitarAvisos(p);
}

/** Si la cuenta no tiene clave (la semilla la deja sin ella), se pone. */
async function conLaClavePuesta(p) {
    if (await p.locator(ZONA_CLAVE, { hasText: "Configurar" }).count()) await ponerLaClave(p);
}

/** Espera a que la tanda termine: el botón vuelve a decir «Generar…» y el texto de la vista está escrito. */
async function esperarLaTanda(p, { plazo = 180000 } = {}) {
    await p.waitForFunction((sel) => /Generando/.test(document.querySelector(sel)?.textContent ?? ""), BOTON_GENERAR, { timeout: 15000 }).catch(() => {});
    await p.waitForFunction((sel) => !/Generando/.test(document.querySelector(sel)?.textContent ?? ""), BOTON_GENERAR, { timeout: plazo });
    await p.waitForFunction((sel) => (document.querySelector(sel)?.value ?? "").trim().length > 20, CAMPO_DEL_TEXTO, { timeout: 30000 });
    const fallo = p.locator(`${PIE} [role="alert"]`);
    if (await fallo.count()) throw new Error(`[guia] la tanda terminó con un error: ${await fallo.first().innerText()}`);
    await espera(p, 700);
}

/** Un botón de la fila de formatos de la vista previa. */
const elFormatoDeLaVista = (p, formato) => p.locator(`${zona("formatos-de-la-vista")} [data-formato="${formato}"]`);

/** Deja la vista previa en un formato y una variante, y espera a que la imagen esté pintada. */
async function verLaVista(p, { formato = "1:1", variante = 1 } = {}) {
    await elFormatoDeLaVista(p, formato).click();
    await espera(p, 300);
    const botonVariante = p.locator(`${zona("variantes-de-la-vista")} button[aria-label="Variante ${variante}"]`);
    if (await botonVariante.count()) await botonVariante.click();
    await laImagenPintada(p);
}

async function laImagenPintada(p) {
    await p.waitForFunction(
        (sel) => {
            const img = document.querySelector(`${sel} img`);
            return img && img.complete && img.naturalWidth > 0;
        },
        zona("imagen-generada"),
        { timeout: 20000 },
    );
    // La imagen entra con una animación (`motion`): se deja terminar.
    await espera(p, 700);
}

/** La parte VISIBLE de la fila de etapas del kit: la fila mide sus diez botones, el panel no. */
async function laFilaDeEtapasVisible(p) {
    const fila = await caja(p, zona("etapas-de-la-vista"));
    const panel = await caja(p, VISTA_PREVIA);
    const x = Math.max(fila.x, panel.x + 16);
    const r = Math.min(fila.x + fila.w, panel.x + panel.w - 16);
    return { x, y: fila.y, w: r - x, h: fila.h - 8 };
}

/** La foto del producto, girada: el «otro ángulo» de «Varias fotos a la vez». */
async function otroAngulo() {
    const destino = path.join(TMP, "producto-otro-angulo.jpg");
    await sharp(PRODUCTO).flop().jpeg({ quality: 90 }).toFile(destino);
    return destino;
}

const miniatura = async (p, slug, foco) => {
    Object.assign(focos, await tomarUnaMiniatura(p, slug, foco, { salida: SALIDA, tomadas }));
};

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();
    const cCabeceraGen = await caja(p, CABECERA_DEL_GENERADOR);
    const cPasos = await caja(p, PASOS);
    const cGenerador = await caja(p, GENERADOR);

    /* --- Tu API key de Google: la cuenta entra sin ella ---------------- */
    const cClave = await caja(p, ZONA_CLAVE);
    // El encuadre de la clave: la cabecera del generador y los pasos. Sin
    // rótulo: a la izquierda del botón tapaba el aviso y debajo, los pasos.
    const zonaClave = holgura({ ...cCabeceraGen, h: cPasos.y + cPasos.h - cCabeceraGen.y }, 16, vista);
    await miniatura(p, "api-key", cClave);
    await marcar(p, [
        { c: cClave, soloLuz: true },
        { c: await caja(p, elBoton(p, ZONA_CLAVE, "Configurar")) },
    ], { atenuar: true });
    await guardar(p, "api-key-aviso.webp", zonaClave);
    await desmarcar(p);

    await ponerLaClave(p, {
        antesDeGuardar: async (dialogo) => {
            const cDialogo = await caja(p, dialogo);
            await marcar(p, [
                { c: cDialogo, soloLuz: true },
                { c: await caja(p, dialogo.locator('input[type="password"]')), texto: "Pega aquí tu API key", lado: "derecha" },
                { c: await caja(p, dialogo.getByText("Obtener mi API key en Google AI Studio")), texto: "Para sacar una", lado: "derecha" },
                { c: await caja(p, dialogo.getByRole("button", { name: "Guardar" })) },
            ], { atenuar: true });
            await guardar(p, "api-key-dialogo.webp", holgura({ ...cDialogo, w: cDialogo.w + 300 }, 24, vista));
            await desmarcar(p);
        },
    });
    const cClaveLista = await caja(p, ZONA_CLAVE);
    await marcar(p, [
        { c: cClaveLista, soloLuz: true },
        { c: await caja(p, elBoton(p, ZONA_CLAVE, "Cambiar")) },
    ], { atenuar: true });
    await guardar(p, "api-key-lista.webp", zonaClave);
    await desmarcar(p);

    // Portada del vídeo: la pantalla limpia, con la clave puesta, como arranca el vídeo.
    await guardar(p, "portada.webp");

    /* --- Sube tu producto ---------------------------------------------- */
    const dropzone = p.locator(`${zona("producto")} button`, { hasText: "Haz clic para subir imágenes" });
    const cDropzone = await caja(p, dropzone);
    await marcar(p, [{ c: cDropzone, texto: "Pulsa y elige la foto", lado: "abajo" }], { atenuar: true });
    await guardar(p, "producto-subir.webp", holgura(cGenerador, 12, vista));
    await desmarcar(p);

    await p.locator(`${zona("producto")} input[type="file"]`).setInputFiles(PRODUCTO);
    await p.getByRole("img", { name: "Producto 1" }).first().waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 800);
    const insignias = p.locator(`${zona("producto")} .absolute.left-3.top-3`);
    const siguiente = elBoton(p, PIE, "Siguiente");
    await marcar(p, [
        { c: await caja(p, insignias), n: 1, esquina: "derecha" },
        { c: await caja(p, siguiente), n: 2 },
    ]);
    await guardar(p, "producto-cargado.webp", holgura(cGenerador, 12, vista));
    await desmarcar(p);
    const cFotoCargada = await caja(p, p.locator(`${zona("producto")} > div.relative`).first());
    await miniatura(p, "producto", { ...cFotoCargada, h: Math.min(cFotoCargada.h, 420), y: cFotoCargada.y });

    await p.locator(`${zona("producto")} input[type="file"]`).setInputFiles(await otroAngulo());
    await p.locator(`${zona("producto")} button[aria-label="Ver el producto 2"]`).waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 800);
    const agregar = p.locator(`${zona("producto")} button`, { hasText: "Agregar más imágenes" });
    const miniaturas = unir(
        await caja(p, p.locator(`${zona("producto")} button[aria-label="Ver el producto 1"]`)),
        await caja(p, p.locator(`${zona("producto")} button[aria-label="Quitar el producto 2"]`)),
    );
    // Las dos piezas van pegadas: se ciñen para que sus recuadros no se monten,
    // y el 2 va abajo, donde no hay nada.
    await marcar(p, [
        { c: dentro(await caja(p, agregar), 3), n: 1 },
        { c: dentro(miniaturas, 3), n: 2, borde: "abajo" },
    ]);
    const cProducto = await caja(p, zona("producto"));
    await guardar(p, "producto-varios.webp", holgura({ ...cProducto, y: cProducto.y + cProducto.h - 240, h: 240 }, 24, vista));
    await desmarcar(p);
    // Se deja un solo producto: el resto de la historia (y la tanda) es de uno.
    await p.locator(`${zona("producto")} button[aria-label="Quitar el producto 2"]`).click();
    await espera(p, 500);

    /* --- La campaña ---------------------------------------------------- */
    await irAlPaso(p, "campaign");
    const cModo = await caja(p, zona("texto-y-modo"));
    await marcar(p, [
        { c: dentro(await caja(p, '[data-interruptor="texto"]'), 5), n: 1 },
        { c: dentro(await caja(p, '[data-interruptor="kit"]'), 5), n: 2 },
    ]);
    await guardar(p, "campana-interruptores.webp", holgura(unir(cPasos, cModo), 20, vista));
    await desmarcar(p);

    const cFormatos = await caja(p, zona("formatos-a-generar"));
    await marcar(p, [{ c: cFormatos }]);
    await guardar(p, "campana-formatos.webp", holgura(cFormatos, 28, vista));
    await desmarcar(p);

    await p.locator(zona("estructura")).scrollIntoViewIfNeeded();
    await espera(p, 400);
    const cEstructura = await caja(p, zona("estructura"));
    const cHero = await caja(p, `${zona("estructura")} [data-etapa="hero"]`);
    const cTrust = await caja(p, `${zona("estructura")} [data-etapa="trust"]`);
    await marcar(p, [
        { c: cEstructura, soloLuz: true },
        // Los números van al LADO de su botón, en el margen de la tarjeta: arriba
        // taparían el título y abajo, la fila siguiente.
        { c: cHero, n: 1, numeroEn: { x: cHero.x - 8, y: cHero.y + cHero.h / 2 } },
        { c: cTrust, n: 10, numeroEn: { x: cTrust.x + cTrust.w + 8, y: cTrust.y + cTrust.h / 2 } },
        // El rótulo va a la DERECHA de la frase, en su misma línea: la frase es
        // un párrafo de todo el ancho, y apuntando a su centro la flecha caía
        // en un hueco vacío.
        { c: await cajaDelTexto(p, `${zona("estructura")} > p`), texto: "Para qué sirve la que eliges", lado: "derecha", sinRecuadro: true },
    ], { atenuar: true });
    await guardar(p, "campana-estructura.webp", holgura(cEstructura, 20, vista));
    await desmarcar(p);

    // El ambiente y los detalles del ejemplo.
    await p.locator(`${zona("adn")} [data-idea="${IDEA_RAPIDA}"]`).click();
    await p.locator("#custom-prompt").fill(DETALLES);
    await p.locator(zona("detalles")).scrollIntoViewIfNeeded();
    await espera(p, 400);
    const cAdn = await caja(p, zona("adn"));
    const cDetalles = await caja(p, zona("detalles"));
    await marcar(p, [
        // Los números a la derecha: a la izquierda taparían «ADN visual» y
        // «Detalles específicos». Las dos primeras piezas van pegadas: se ciñen.
        { c: dentro(await caja(p, "#visual-dna"), 3), n: 1, esquina: "derecha" },
        { c: dentro(await caja(p, `${zona("adn")} .grid`), 3), n: 2, esquina: "derecha", borde: "abajo" },
        { c: await caja(p, "#custom-prompt"), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "campana-adn.webp", holgura(unir(cAdn, cDetalles), 20, vista));
    await desmarcar(p);

    await p.locator(zona("texto-y-modo")).scrollIntoViewIfNeeded();
    await espera(p, 400);
    await miniatura(p, "campana", unir(await caja(p, zona("formatos-a-generar")), await caja(p, zona("estructura"))));

    /* --- El estilo ----------------------------------------------------- */
    await irAlPaso(p, "style");
    await p.locator('[data-estilo="premium"] > button').click();
    await espera(p, 400);
    const cEstilos = await caja(p, zona("estilos"));
    await marcar(p, [
        { c: cEstilos, soloLuz: true },
        // Sin rótulo: arriba taparía «Crear estilo». El paso dice que lleva su chulito.
        { c: await caja(p, '[data-estilo="premium"] > button') },
    ], { atenuar: true });
    await guardar(p, "estilo-elegir.webp", holgura(unir(await caja(p, zona("biblioteca")), cEstilos), 20, vista));
    await desmarcar(p);
    await miniatura(p, "estilo", cEstilos);

    await p.locator('[data-boton="crear-estilo"]').click();
    const nuevo = p.locator(zona("nuevo-estilo"));
    await nuevo.waitFor({ state: "visible", timeout: 10000 });
    await nuevo.locator("input").pressSequentially(ESTILO_NUEVO.nombre, { delay: 10 });
    await nuevo.locator("textarea").pressSequentially(ESTILO_NUEVO.descripcion, { delay: 6 });
    // Se suelta el foco: el anillo del campo se leería como otra marca.
    await p.evaluate(() => document.activeElement?.blur());
    await espera(p, 600);
    const cNuevo = await caja(p, nuevo);
    await marcar(p, [
        { c: cNuevo, soloLuz: true },
        { c: await caja(p, nuevo.getByRole("button", { name: "Guardar estilo" })), texto: "Lo deja en tu biblioteca", lado: "derecha" },
    ], { atenuar: true });
    await guardar(p, "estilo-crear.webp", holgura(unir(await caja(p, zona("biblioteca")), cNuevo), 20, vista));
    await desmarcar(p);
    // No se guarda: la biblioteca queda como la sembró la semilla.
    await nuevo.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 600);

    await p.locator('[data-boton="borrar-estilo"]').first().click();
    const confirmar = p.locator('[role="alertdialog"]');
    await confirmar.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cConfirmar = await caja(p, confirmar);
    await marcar(p, [
        { c: cConfirmar, soloLuz: true },
        { c: await caja(p, confirmar.locator('[data-boton="confirmar-borrar-estilo"]')), texto: "No se puede deshacer", lado: "abajo" },
    ], { atenuar: true });
    await guardar(p, "estilo-borrar.webp", holgura({ ...cConfirmar, h: cConfirmar.h + 90 }, 24, vista));
    await desmarcar(p);
    await confirmar.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 500);

    /* --- El motor ------------------------------------------------------ */
    await irAlPaso(p, "engine");
    const cModelos = await caja(p, zona("modelos"));
    const modelos = p.locator(`${zona("modelos")} [data-modelo]`);
    const cajasModelo = [];
    for (let i = 0; i < (await modelos.count()); i += 1) cajasModelo.push(await caja(p, modelos.nth(i)));
    await marcar(p, cajasModelo.map((c, i) => ({ c: dentro(c, 5), n: i + 1 })));
    await guardar(p, "motor-modelo.webp", holgura(cModelos, 22, vista));
    await desmarcar(p);
    await miniatura(p, "motor", cModelos);

    await p.getByRole("button", { name: "Una variante más" }).click();
    await p.locator(zona("calidad")).scrollIntoViewIfNeeded();
    await espera(p, 400);
    const cVariantes = await caja(p, zona("variantes"));
    const cCalidad = await caja(p, zona("calidad"));
    await marcar(p, [
        { c: dentro(cVariantes, 5), n: 1 },
        { c: dentro(cCalidad, 5), n: 2 },
    ]);
    await guardar(p, "motor-variantes.webp", holgura(unir(cVariantes, cCalidad), 20, vista));
    await desmarcar(p);

    await p.locator(zona("resumen")).scrollIntoViewIfNeeded();
    await espera(p, 400);
    const tarjetasResumen = p.locator(`${zona("resumen")} > div`);
    const cResumen = await caja(p, zona("resumen"));
    await marcar(p, [
        { c: dentro(await caja(p, tarjetasResumen.nth(0)), 5), n: 1 },
        { c: dentro(await caja(p, tarjetasResumen.nth(1)), 5), n: 2 },
    ]);
    await guardar(p, "motor-resumen.webp", holgura(cResumen, 22, vista));
    await desmarcar(p);

    /* --- Generar y descargar ------------------------------------------- */
    const cPie = await caja(p, PIE);
    // Sin rótulo, como «Generar kit»: arriba taparía el texto del motor.
    await marcar(p, [{ c: await caja(p, BOTON_GENERAR) }]);
    await guardar(p, "generar-boton.webp", holgura({ ...cPie, y: cPie.y - 130, h: cPie.h + 130 }, 16, vista));
    await desmarcar(p);
    await miniatura(p, "generar", cPie);

    await p.locator(BOTON_GENERAR).click();
    await esperarLaTanda(p);

    await verLaVista(p, { formato: "1:1", variante: 2 });
    const cVista = await caja(p, VISTA_PREVIA);
    // Las dos filas van pegadas: cada recuadro metido hacia dentro y su número
    // al LADO, en el margen de la tarjeta —en la esquina, el 2 caía encima del
    // recuadro del 1—.
    const cFormatosVista = dentro(await caja(p, zona("formatos-de-la-vista")), 3);
    const cVariantesVista = dentro(await caja(p, zona("variantes-de-la-vista")), 3);
    await marcar(p, [
        { c: cFormatosVista, n: 1, numeroEn: { x: cFormatosVista.x - 10, y: cFormatosVista.y + cFormatosVista.h / 2 } },
        { c: cVariantesVista, n: 2, numeroEn: { x: cVariantesVista.x - 10, y: cVariantesVista.y + cVariantesVista.h / 2 } },
    ]);
    await guardar(p, "generar-vista.webp", holgura(cVista, 14, vista));
    await desmarcar(p);

    await marcar(p, [{ c: await caja(p, '[data-boton="descargar-imagen"]'), texto: "Baja la que ves", lado: "izquierda" }]);
    await guardar(p, "generar-descargar.webp", holgura({ ...cVista, h: Math.min(cVista.h, 330) }, 14, vista));
    await desmarcar(p);

    /* --- El texto del post --------------------------------------------- */
    await verLaVista(p, { formato: "1:1", variante: 1 });
    const cTexto = await caja(p, TEXTO_DEL_POST);
    const subtitulo = p.locator(`${TEXTO_DEL_POST} p`, { hasText: "Adaptado a" }).first();
    await marcar(p, [
        // Una línea de texto suelta: sin holgura, el brillo del recuadro toca las letras.
        { c: holgura(await caja(p, subtitulo), 4, vista) },
        { c: await caja(p, CAMPO_DEL_TEXTO) },
    ]);
    await guardar(p, "texto-escrito.webp", holgura(cTexto, 14, vista));
    await desmarcar(p);
    await miniatura(p, "texto-del-post", cTexto);

    await verLaVista(p, { formato: "9:16" });
    await p.waitForFunction((sel) => /Adaptado a Story \/ WhatsApp|WhatsApp/.test(document.querySelector(sel)?.textContent ?? ""), TEXTO_DEL_POST, { timeout: 10000 });
    const cResultado = await caja(p, RESULTADO);
    await marcar(p, [
        { c: await caja(p, elFormatoDeLaVista(p, "9:16")) },
        // Una línea de texto suelta: sin holgura, el brillo del recuadro toca las letras.
        { c: holgura(await caja(p, subtitulo), 4, vista) },
        { c: await caja(p, CAMPO_DEL_TEXTO) },
    ], { atenuar: true });
    // Solo la columna del resultado: un rótulo a la izquierda caería sobre el generador.
    await guardar(p, "texto-whatsapp.webp", holgura(cResultado, 14, vista));
    await desmarcar(p);

    const cCabeceraTexto = await caja(p, `${TEXTO_DEL_POST} > div`);
    await marcar(p, [
        { c: dentro(await caja(p, '[data-boton="copiar-copy"]'), 3), n: 1 },
        { c: dentro(await caja(p, '[data-boton="regenerar-copy"]'), 3), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "texto-copiar.webp", holgura({ ...cTexto, h: Math.min(cTexto.h, cCabeceraTexto.h + 150) }, 16, vista));
    await desmarcar(p);

    /* --- La pantalla de un vistazo ------------------------------------- */
    // Con un anuncio ya generado: la foto del producto a la izquierda, el
    // anuncio y su texto a la derecha.
    await irAlPaso(p, "images");
    await verLaVista(p, { formato: "1:1", variante: 1 });
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cClaveVG = await caja(p, ZONA_CLAVE);
    const cPasosVG = await caja(p, PASOS);
    const cAbierto = await caja(p, PASO_ABIERTO);
    const cVistaVG = await caja(p, VISTA_PREVIA);
    const cTextoVG = await caja(p, TEXTO_DEL_POST);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: cClaveVG, n: 3 },
        { c: dentro(cPasosVG, 4), n: 4 },
        { c: dentro(cAbierto, 6), n: 5 },
        { c: dentro(cVistaVG, 4), n: 6 },
        { c: dentro(cTextoVG, 4), n: 7 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);
    await miniatura(p, "vista-general", cPasosVG);

    const botonesPaso = p.locator(`${PASOS} [data-paso]`);
    const cajasPaso = [];
    for (let i = 0; i < (await botonesPaso.count()); i += 1) cajasPaso.push(await caja(p, botonesPaso.nth(i)));
    // Los cuatro van pegados: se ciñen. Sin números: cada paso ya lleva el
    // suyo, y encima del botón el círculo tapaba la tilde de «Campaña».
    await marcar(p, cajasPaso.map((c) => ({ c: dentro(c, 5) })));
    await guardar(p, "pasos.webp", holgura({ ...cPasosVG, y: cPasosVG.y - 12, h: cPasosVG.h + 24 }, 18, vista));
    await desmarcar(p);

    await marcar(p, [{ c: dentro(cVistaVG, 4) }, { c: dentro(cTextoVG, 4) }]);
    await guardar(p, "resultado.webp", holgura(await caja(p, RESULTADO), 14, vista));
    await desmarcar(p);

    /* --- El kit de landing --------------------------------------------- */
    await irAlPaso(p, "campaign");
    await p.locator('[data-interruptor="kit"] [role="switch"]').click();
    await p.locator(zona("kit-activado")).waitFor({ state: "visible", timeout: 10000 });
    await p.locator(zona("texto-y-modo")).scrollIntoViewIfNeeded();
    await espera(p, 500);
    const cKit = await caja(p, '[data-interruptor="kit"]');
    const cKitActivado = await caja(p, zona("kit-activado"));
    await marcar(p, [
        { c: dentro(cKit, 5), n: 1 },
        { c: dentro(cKitActivado, 5), n: 2 },
    ]);
    await guardar(p, "kit-modo.webp", holgura(unir(await caja(p, zona("texto-y-modo")), cKitActivado), 20, vista));
    await desmarcar(p);

    // El kit se genera con una variante: diez imágenes, no veinte.
    await irAlPaso(p, "engine");
    await p.getByRole("button", { name: "Una variante menos" }).click();
    await espera(p, 300);
    // Como en «Generar imagen»: encima del pie, el resumen, y no media fila de
    // tarjetas de calidad cortada por el borde de la zona que se desplaza.
    await p.locator(zona("resumen")).scrollIntoViewIfNeeded();
    await espera(p, 300);
    const cPieKit = await caja(p, PIE);
    await marcar(p, [{ c: await caja(p, BOTON_GENERAR) }]);
    await guardar(p, "kit-generar.webp", holgura({ ...cPieKit, y: cPieKit.y - 130, h: cPieKit.h + 130 }, 16, vista));
    await desmarcar(p);

    await p.locator(BOTON_GENERAR).click();
    await esperarLaTanda(p, { plazo: 240000 });
    // Una etapa del principio, con la fila al principio: así la fila se lee
    // desde «1. Hero Section» y solo se corta por la derecha, que es por donde
    // sigue. Y no es Hero, para que se vea una imagen distinta de la tanda.
    // La elegida es la SEGUNDA: la tercera quedaba partida por el borde de la
    // fila, y la pestaña que se está enseñando tiene que leerse entera.
    const dolor = p.locator(`${zona("etapas-de-la-vista")} [data-etapa="pain"]`);
    await dolor.click();
    await p.evaluate((sel) => {
        const fila = document.querySelector(sel)?.closest("[data-radix-scroll-area-viewport]");
        if (fila) fila.scrollLeft = 0;
    }, zona("etapas-de-la-vista"));
    await laImagenPintada(p);
    await p.waitForFunction((sel) => (document.querySelector(sel)?.value ?? "").trim().length > 20, CAMPO_DEL_TEXTO, { timeout: 30000 });
    await espera(p, 500);
    const cFila = await laFilaDeEtapasVisible(p);
    await marcar(p, [
        { c: cFila, n: 1 },
        { c: dentro(await caja(p, TEXTO_DEL_POST), 4), n: 2 },
    ]);
    await guardar(p, "kit-etapas.webp", holgura(await caja(p, RESULTADO), 14, vista));
    await desmarcar(p);
    await miniatura(p, "kit-landing", unir(cFila, await caja(p, zona("imagen-generada"))));

    /* --- El marco: el menú y la barra de arriba ------------------------- */
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Apps Externas", texto: "AI imágenes está en Apps Externas" });

    await desmarcar(p);
    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/** Entre una frase y la siguiente, lo que respira una persona hablando (el mismo de Leads). */
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
        // «Copiar texto» escribe en el portapapeles: sin el permiso, el vídeo
        // enseñaría el aviso de que el navegador no dejó copiar.
        permissions: ["clipboard-read", "clipboard-write"],
    });
    await ctx.addInitScript(CURSOR);
    await conElDominioDeLaGuia(ctx, BASE);
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
    await alDecir("la foto de tu producto", 500);
    await mover(p, p.locator(PASO_ABIERTO));
    await alDecir("anuncios listos", 400);
    await mover(p, p.locator(VISTA_PREVIA));

    // El menú: se abre con las dos flechas, se señala Apps Externas y se
    // recoge al empezar la frase de la barra, donde viven las flechas.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const appsExternas = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Apps Externas" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Apps Externas", 600);
    await mover(p, appsExternas);

    const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    await decir("apiKey");
    await alDecir("tu API key", 400);
    await mover(p, p.locator(ZONA_CLAVE));
    await alDecir("con Cambiar", 450);
    await mover(p, elBoton(p, ZONA_CLAVE, "Cambiar"));

    // Paso 1: la foto, elegida con el diálogo de archivos del navegador.
    const dropzone = p.locator(`${zona("producto")} button`, { hasText: "Haz clic para subir imágenes" });
    const siguiente = elBoton(p, PIE, "Siguiente");
    await decir("producto");
    await alDecir("subes la foto", 500);
    const eligiendo = p.waitForEvent("filechooser", { timeout: 15000 });
    await pulsar(p, dropzone);
    await (await eligiendo).setFiles(PRODUCTO);
    await p.getByRole("img", { name: "Producto 1" }).first().waitFor({ state: "visible", timeout: 20000 });
    await alDecir("con Siguiente", 450);
    await pulsar(p, siguiente);

    await decir("campana");
    await alDecir("los formatos", 400);
    await mover(p, p.locator(zona("formatos-a-generar")));
    await alDecir("la etapa de venta", 400);
    await mover(p, p.locator(`${zona("estructura")} [data-etapa="hero"]`));
    await alDecir("una mesa de mármol", 550);
    await pulsar(p, p.locator(`${zona("adn")} [data-idea="${IDEA_RAPIDA}"]`));

    await decir("estilo");
    await pulsar(p, siguiente);
    await alDecir("aquí, Premium", 550);
    await pulsar(p, p.locator('[data-estilo="premium"] > button'));

    await decir("motor");
    await pulsar(p, siguiente);
    await alDecir("el modelo de inteligencia", 400);
    await mover(p, p.locator(`${zona("modelos")} [data-modelo]`).first());
    await alDecir("cuántas variantes", 400);
    await mover(p, p.getByRole("button", { name: "Una variante más" }));

    await decir("generar");
    await alDecir("Generar imagen", 600);
    await pulsar(p, p.locator(BOTON_GENERAR));
    await alDecir("en la vista previa", 400);
    await mover(p, p.locator(zona("imagen-generada")));

    await decir("texto");
    await mover(p, p.locator(TEXTO_DEL_POST));
    // Lo que se pulsa a continuación tiene que existir: la tanda termina
    // mientras la frase suena.
    await p.waitForFunction((sel) => !/Generando/.test(document.querySelector(sel)?.textContent ?? ""), BOTON_GENERAR, { timeout: 60000 });
    await alDecir("al pasar a WhatsApp", 500);
    await pulsar(p, elFormatoDeLaVista(p, "9:16"));
    await alDecir("sin hashtags", 400);
    await mover(p, p.locator(CAMPO_DEL_TEXTO));
    await alDecir("con este botón", 450);
    await pulsar(p, p.locator('[data-boton="copiar-copy"]'));

    await decir("cierre");
    await alDecir("la flecha de arriba", 450);
    await mover(p, p.locator('[data-boton="descargar-imagen"]'));
    await alDecir("en la campaña", 450);
    await pulsar(p, p.locator(paso("campaign")));
    await alDecir("enciendes el kit", 450);
    await pulsar(p, p.locator('[data-interruptor="kit"] [role="switch"]'));
    await alDecir("las diez imágenes", 450);
    await mover(p, p.locator(zona("etapas-de-la-vista")).locator("button").nth(2));
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
    escribirLaVozDelVideo("ai-imagenes", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
    await conElDominioDeLaGuia(ctx, BASE);
    const p = await entrar(ctx, BASE);
    await abrirLaPantalla(p);
    if (SOLO_VIDEO) await conLaClavePuesta(p);
    else await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO) await video(navegador, estado);
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO ? "" : " y el vídeo"} en public/guia/ai-imagenes`);
