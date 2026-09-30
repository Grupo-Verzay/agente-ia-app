/**
 * Los primeros segundos del VÍDEO DE VENTAS: las cuatro tarjetas de ejemplo,
 * su cierre y la pantalla de la marca, pintados de VERDAD en Chromium con la
 * página del estudio (`laPaginaDelEstudio`) y el guion del montaje
 * (`window.__estudio.montaje` y `yCualquierNegocio`).
 *
 * Lo que se comprueba no se ve leyendo el código:
 *
 *   1. Cuatro negocios y en su orden: tienda en línea, clínica, cursos y
 *      consultoría.
 *   2. Cada tarjeta abre con el encabezado de WhatsApp de verdad: compacto,
 *      neutro (sin franja de color), pegado arriba y con sus iconos (atrás,
 *      videollamada y llamada).
 *   3. Los mensajes arrancan PEGADOS al encabezado, no al fondo de la tarjeta.
 *   4. Cada tarjeta enseña un contenido distinto —nota de voz, PDF, video e
 *      imagen— y las imágenes cargan de verdad.
 *   5. El cierre «y cualquier negocio que venda por WhatsApp» sale DESPUÉS del
 *      último mensaje de la cuarta tarjeta, a su derecha y dentro del cuadro.
 *   6. La pantalla de la marca: el logo, el nombre y la frase exacta, y nada
 *      más debajo (ni una píldora).
 *
 * `MODO=roto` pinta el estudio de ANTES_MONTAJE —pinchado a un commit, nunca
 * `origin/main`— y AFIRMA los fallos: cinco tarjetas, una franja de color de
 * 88 px con relleno arriba, los mensajes abajo del todo, casi todo en texto,
 * sin cierre y con la lista de píldoras debajo de la marca.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const MODO = process.env.MODO ?? "bueno";
const ANTES = process.env.ANTES_MONTAJE ?? "1807a22";
const COMPILADO = path.join(RAIZ, "lib", "__tests__", ".compilado", "montaje-del-video");
const FOTOS = process.env.FOTOS_DEL_MONTAJE;

const { chromium } = require("playwright");
const ORIGEN = "http://estudio.test";
const HORA = "9:40 a. m.";

/** Los módulos del estudio de un commit, puestos en su sitio para que sus `import` resuelvan entre ellos. */
function elEstudioDe(ref) {
    const dir = path.join(COMPILADO, `antes-${ref}`);
    for (const ruta of [
        "scripts/cursor-de-la-guia.mjs",
        "scripts/voz-cedar.mjs",
        "scripts/voz-de-la-guia.mjs",
        "scripts/video-de-ventas/historia.mjs",
        "scripts/video-de-ventas/estudio.mjs",
        "scripts/video-de-ventas/banda-sonora.mjs",
    ]) {
        const destino = path.join(dir, ruta);
        mkdirSync(path.dirname(destino), { recursive: true });
        writeFileSync(destino, execFileSync("git", ["show", `${ref}:${ruta}`], { cwd: RAIZ, maxBuffer: 64 << 20 }));
    }
    return path.join(dir, "scripts", "video-de-ventas");
}

/** El estudio, con los datos del montaje armados como los armaba el guion de cada época. */
async function laPagina() {
    const archivos = {
        "verzay.png": path.join(RAIZ, "public", "icon-512.png"),
        "inter-latin.woff2": path.join(RAIZ, "scripts", "video-de-ventas", "fuentes", "inter-latin.woff2"),
    };
    const comun = {
        zona: "America/Bogota",
        clienta: { nombreCorto: "Laura", iniciales: "L", color: "#d9774f" },
        otros: [],
        logo: "/__estudio/medios/verzay.png",
        logoNegocio: "/__estudio/medios/logo-sonrie.png",
        portadaDoc: "/__estudio/medios/lista-de-precios.jpg",
        web: "verzay.com",
    };
    if (MODO === "roto") {
        const dir = elEstudioDe(ANTES);
        const historia = await import(pathToFileURL(path.join(dir, "historia.mjs")).href);
        const estudio = await import(pathToFileURL(path.join(dir, "estudio.mjs")).href);
        const datos = {
            ...comun,
            montaje: historia.NEGOCIOS_DEL_ARRANQUE.map((n) => ({ ...n, iniciales: historia.lasIniciales(n.contacto), mensajes: n.mensajes.map((m) => ({ ...m, hora: HORA })) })),
            chipsDeLaMarca: historia.CHIPS_DE_LA_MARCA,
        };
        return { html: estudio.laPaginaDelEstudio(datos), archivos, historia, estudio };
    }
    const historia = await import("../../scripts/video-de-ventas/historia.mjs");
    const estudio = await import("../../scripts/video-de-ventas/estudio.mjs");
    const medios = await import("../../scripts/video-de-ventas/medios.mjs");
    const dirMedios = path.join(COMPILADO, "medios");
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    try {
        await medios.generarLosMediosDelMontaje(dirMedios, nav);
    } finally {
        await nav.close();
    }
    for (const m of Object.values(historia.MEDIOS_DEL_MONTAJE)) archivos[m.archivo] = path.join(dirMedios, m.archivo);
    const datos = { ...comun, montaje: estudio.losNegociosDelMontaje(historia.NEGOCIOS_DEL_ARRANQUE, { hora: HORA }) };
    return { html: estudio.laPaginaDelEstudio(datos), archivos, historia, estudio };
}

/** Lo que se mide de cada tarjeta: el encabezado, el primer mensaje y el contenido. */
function medirLasTarjetas() {
    const saturacion = (color) => {
        const n = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        return n.length === 3 ? Math.max(...n) - Math.min(...n) : 0;
    };
    const tipoDe = (b) => (b.classList.contains("nota") ? "nota" : b.classList.contains("doc") ? "documento" : b.classList.contains("foto") ? "imagen" : b.classList.contains("vid") ? "video" : "texto");
    return [...document.querySelectorAll(".mini")].map((mini) => {
        // La pantalla del teléfono: el primer hijo de su marco. No por clase:
        // una burbuja de video también lleva `.vid` y `.marco` dentro.
        const vid = mini.firstElementChild.firstElementChild;
        const cab = vid.firstElementChild;
        const muro = mini.querySelector(".muro");
        const rv = vid.getBoundingClientRect();
        const rc = cab.getBoundingClientRect();
        const est = getComputedStyle(cab);
        const burbujas = [...muro.querySelectorAll(".bur")];
        const primera = burbujas[0]?.getBoundingClientRect();
        const iconos = [...cab.querySelectorAll("svg")].filter((s) => s.getBoundingClientRect().width > 0).length;
        const imagenes = [...muro.querySelectorAll("img")];
        const pie = mini.querySelector(".pie2");
        const rm = mini.getBoundingClientRect();
        return {
            tipo: pie?.firstChild?.textContent?.trim() ?? "",
            cabeceraAlto: Math.round(rc.height),
            cabeceraArriba: Math.round(rc.top - rv.top),
            rellenoArriba: parseFloat(est.paddingTop),
            saturacion: saturacion(est.backgroundColor),
            iconos,
            primeraBajoLaCabecera: primera ? Math.round(primera.top - rc.bottom) : null,
            contenidos: burbujas.map(tipoDe).filter((t) => t !== "texto"),
            imagenesCargadas: imagenes.every((i) => i.complete && i.naturalWidth > 0),
            // Lo que enseña una foto o un video: apaisado como el archivo, no
            // estirado a lo alto por los estilos de la pantalla de al lado.
            proporciones: [...muro.querySelectorAll(".bur.foto img, .bur.vid .marco")].map((e) => {
                const r = e.getBoundingClientRect();
                return Math.round((r.width / r.height) * 100) / 100;
            }),
            caja: { x: rm.x, y: rm.y, w: rm.width, h: rm.height },
        };
    });
}

describe(MODO === "roto" ? `MODO=roto: el arranque del vídeo en ${ANTES}` : "el arranque del vídeo de ventas, pintado", () => {
    let navegador;
    let pagina;
    let fuente;
    const errores = [];

    before(async () => {
        assert.ok(chromium, "sin playwright no hay banco: NODE_PATH tiene que llegar a /opt/node22/lib/node_modules");
        fuente = await laPagina();
        navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
        const ctx = await navegador.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
        const { servirElEstudio } = await import("../../scripts/video-de-ventas/estudio-servido.mjs");
        await servirElEstudio(ctx, { pagina: () => fuente.html, archivos: fuente.archivos });
        pagina = await ctx.newPage();
        pagina.on("pageerror", (e) => errores.push(e.message));
        await pagina.goto(`${ORIGEN}/__estudio/estudio.html`, { waitUntil: "load" });
        await pagina.waitForFunction(() => window.__estudio?.listo);
        await pagina.evaluate(() => document.fonts.ready);
        await pagina.evaluate((planos) => window.__estudio.plano(planos.montaje), fuente.estudio.PLANOS);
        await pagina.evaluate(() => window.__estudio.montaje());
    });

    after(async () => {
        await navegador?.close();
    });

    if (MODO === "roto") {
        test("eran cinco tarjetas, con una franja de color y relleno arriba", async () => {
            await pagina.waitForTimeout(5200);
            const t = await pagina.evaluate(medirLasTarjetas);
            assert.equal(t.length, 5, "el arranque ya tenía cuatro tarjetas");
            assert.ok(t.every((x) => x.saturacion > 40), `las cabeceras no eran de color: ${t.map((x) => x.saturacion)}`);
            assert.ok(t.every((x) => x.cabeceraAlto >= 80 && x.rellenoArriba >= 20), "la cabecera ya era compacta");
            assert.ok(t.every((x) => x.iconos === 0), "la cabecera ya llevaba los iconos de WhatsApp");
        });

        test("los mensajes salían abajo del todo, y casi todo en texto", async () => {
            const t = await pagina.evaluate(medirLasTarjetas);
            assert.ok(t.every((x) => x.primeraBajoLaCabecera > 100), `el primer mensaje ya iba pegado arriba: ${t.map((x) => x.primeraBajoLaCabecera)}`);
            const vistos = new Set(t.flatMap((x) => x.contenidos));
            for (const falta of ["nota", "video", "imagen"]) assert.equal(vistos.has(falta), false, `ya había ${falta}`);
        });

        test("no había cierre, y la marca llevaba su lista de píldoras debajo", async () => {
            const r = await pagina.evaluate(() => ({ cierre: !!document.querySelector(".cierreMontaje"), chips: document.querySelectorAll("#marca .chipsMarca > *").length }));
            assert.equal(r.cierre, false, "ya había cierre del arranque");
            assert.ok(r.chips >= 5, `la marca no tenía sus píldoras (${r.chips})`);
        });
        return;
    }

    test("cuatro negocios, en su orden", async () => {
        const t = await pagina.evaluate(medirLasTarjetas);
        assert.deepEqual(
            t.map((x) => x.tipo),
            ["Tienda en línea", "Clínica", "Cursos", "Consultoría"],
        );
        for (const x of t) {
            assert.ok(x.caja.x >= 0 && x.caja.x + x.caja.w <= 1920, `la tarjeta «${x.tipo}» se sale por un lado`);
            assert.ok(x.caja.y + x.caja.h <= 1080, `la tarjeta «${x.tipo}» se sale por abajo`);
        }
    });

    test("el cierre NO sale antes del último mensaje de la cuarta tarjeta", async () => {
        const falta = await pagina.evaluate(() => window.__estudio.yCualquierNegocio());
        assert.ok(falta > 1500, `el cierre saldría a los ${falta} ms, con la cuarta tarjeta a medias`);
        await pagina.waitForTimeout(600);
        const antes = await pagina.evaluate(() => Number(getComputedStyle(document.querySelector(".cierreMontaje")).opacity));
        assert.ok(antes < 0.05, `el cierre ya se ve (${antes}) antes de que acaben las tarjetas`);
        await pagina.waitForTimeout(falta - 600 + 1100);
    });

    test("cada tarjeta abre con el encabezado de WhatsApp: compacto, neutro, pegado arriba y con sus iconos", async () => {
        const t = await pagina.evaluate(medirLasTarjetas);
        for (const x of t) {
            assert.ok(x.cabeceraAlto <= 60, `«${x.tipo}»: la cabecera mide ${x.cabeceraAlto} px`);
            assert.equal(x.cabeceraArriba, 0, `«${x.tipo}»: la cabecera no está pegada arriba`);
            assert.ok(x.rellenoArriba <= 2, `«${x.tipo}»: la cabecera deja ${x.rellenoArriba} px vacíos arriba`);
            assert.ok(x.saturacion <= 20, `«${x.tipo}»: la cabecera es una franja de color (saturación ${x.saturacion})`);
            assert.ok(x.iconos >= 3, `«${x.tipo}»: la cabecera lleva ${x.iconos} iconos (atrás, videollamada y llamada)`);
        }
    });

    test("los mensajes arrancan pegados al encabezado", async () => {
        const t = await pagina.evaluate(medirLasTarjetas);
        for (const x of t) {
            assert.notEqual(x.primeraBajoLaCabecera, null, `«${x.tipo}» no tiene mensajes`);
            assert.ok(x.primeraBajoLaCabecera >= 0 && x.primeraBajoLaCabecera <= 16, `«${x.tipo}»: el primer mensaje empieza ${x.primeraBajoLaCabecera} px debajo del encabezado`);
        }
    });

    test("cada tarjeta enseña un contenido distinto, y sus imágenes cargan", async () => {
        const t = await pagina.evaluate(medirLasTarjetas);
        const porTarjeta = t.map((x) => x.contenidos);
        for (const [i, c] of porTarjeta.entries()) assert.equal(c.length, 1, `«${t[i].tipo}» lleva ${c.length} contenidos: ${c}`);
        assert.deepEqual(new Set(porTarjeta.flat()), new Set(["nota", "documento", "video", "imagen"]));
        assert.deepEqual(porTarjeta.flat(), fuente.historia.NEGOCIOS_DEL_ARRANQUE.map((n) => n.medio));
        for (const x of t) assert.ok(x.imagenesCargadas, `«${x.tipo}»: una imagen no carga`);
        const prop = Object.fromEntries(t.map((x) => [x.tipo, x.proporciones]));
        assert.deepEqual(prop["Tienda en línea"], [1], `la foto del sofá no sale cuadrada: ${prop["Tienda en línea"]}`);
        assert.equal(prop["Cursos"].length, 1);
        assert.ok(prop["Cursos"][0] > 1.6 && prop["Cursos"][0] < 1.9, `el video no sale apaisado (${prop["Cursos"][0]})`);
    });

    test("el cierre sale a la derecha de la cuarta tarjeta, dentro del cuadro, con su frase", async () => {
        const r = await pagina.evaluate(() => {
            const c = document.querySelector(".cierreMontaje");
            const b = c.getBoundingClientRect();
            const texto = c.querySelector("div").getBoundingClientRect();
            const cuarta = [...document.querySelectorAll(".mini")].at(-1).getBoundingClientRect();
            return {
                opacidad: Number(getComputedStyle(c).opacity),
                texto: c.textContent.trim(),
                izquierda: b.left,
                derechaDeLaCuarta: cuarta.right,
                textoDerecha: texto.right,
                textoArriba: texto.top,
                textoAbajo: texto.bottom,
                cuartaArriba: cuarta.top,
                cuartaAbajo: cuarta.bottom,
            };
        });
        assert.ok(r.opacidad > 0.95, `el cierre no se ve (${r.opacidad})`);
        assert.equal(r.texto, fuente.historia.CIERRE_DEL_MONTAJE);
        assert.ok(r.izquierda >= r.derechaDeLaCuarta, "el cierre se monta sobre la cuarta tarjeta");
        assert.ok(r.textoDerecha <= 1920, `el cierre se sale del cuadro (${Math.round(r.textoDerecha)})`);
        assert.ok(r.textoArriba >= r.cuartaArriba && r.textoAbajo <= r.cuartaAbajo, "el cierre no está a la altura de las tarjetas");
        if (FOTOS) await pagina.screenshot({ path: path.join(FOTOS, "montaje.png") });
    });

    test("la marca: logo, nombre y la frase exacta, y ninguna píldora debajo", async () => {
        await pagina.evaluate((planos) => window.__estudio.plano(planos.marca), fuente.estudio.PLANOS);
        await pagina.waitForTimeout(1400);
        const r = await pagina.evaluate(() => {
            const m = document.querySelector("#marca");
            return {
                hijos: [...m.children].map((e) => e.className || e.tagName.toLowerCase()),
                lema: m.querySelector(".lema")?.textContent,
                chips: document.querySelectorAll(".chipsMarca").length,
            };
        });
        assert.equal(r.chips, 0, "sigue la lista de píldoras");
        assert.deepEqual(r.hijos, ["logo", "nombre", "lema"]);
        assert.equal(r.lema, "Inteligencia artificial que atiende, vende y agenda por WhatsApp");
        if (FOTOS) await pagina.screenshot({ path: path.join(FOTOS, "marca.png") });
    });

    test("ni un error en la página", () => {
        assert.deepEqual(errores, []);
    });
});
