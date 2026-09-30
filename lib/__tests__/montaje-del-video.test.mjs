/**
 * Los primeros segundos del VÍDEO DE VENTAS: las cinco tarjetas de ejemplo,
 * su cierre y la pantalla de la marca, pintados de VERDAD en Chromium con la
 * página del estudio (`laPaginaDelEstudio`) y el guion del montaje
 * (`window.__estudio.montaje` y `yCualquierNegocio`).
 *
 * Lo que se comprueba no se ve leyendo el código:
 *
 *   1. Cinco negocios y en su orden: tienda en línea, clínica, cursos,
 *      consultoría y agencia de viajes, en una fila centrada.
 *   2. Cada tarjeta abre con el encabezado de WhatsApp de verdad: compacto,
 *      neutro (sin franja de color), pegado arriba y con sus iconos (atrás,
 *      videollamada y llamada).
 *   3. Los mensajes arrancan PEGADOS al encabezado, no al fondo de la tarjeta.
 *   4. Cada tarjeta enseña un contenido distinto —imagen, nota de voz, video,
 *      PDF y ubicación—, cada uno del lado de quien lo manda (el PDF de la
 *      consultoría y el mapa del viaje los manda la IA), y las imágenes cargan.
 *   5. Lo que se VE de cada archivo, medido en los píxeles de la pantalla: la
 *      portada del video es una imagen con su botón de reproducir encima —no un
 *      recuadro negro con un punto—, y el mapa es un mapa.
 *   6. El cierre «y cualquier negocio que venda por WhatsApp» sale DESPUÉS del
 *      último mensaje de la última tarjeta, en UNA línea centrada DEBAJO de las
 *      cinco, dentro del cuadro y sin pisar los subtítulos.
 *   7. La pantalla de la marca: el logo, el nombre y la frase exacta, y nada
 *      más debajo (ni una píldora).
 *
 * `MODO=roto` pinta dos estudios de antes —pinchados a un commit, nunca
 * `origin/main`— y AFIRMA sus fallos:
 *
 *   - ANTES_MONTAJE: cinco negocios de otra época, una franja de color de 88 px
 *     con relleno arriba, los mensajes abajo del todo, casi todo en texto, sin
 *     cierre y con la lista de píldoras debajo de la marca.
 *   - ANTES_DEL_CIERRE: cuatro tarjetas, el PDF de la consultoría mandado por
 *     el cliente, ninguna ubicación, el cierre como una columna al lado de la
 *     cuarta tarjeta y la duración del video perdida sobre la portada clara.
 *   - El marco del celular de ANTES_MONTAJE (`.mini .marco` / `.mini .vid`,
 *     las mismas clases de una burbuja de video) pintado sobre las tarjetas de
 *     hoy: la portada del video de Cursos sale negra, sin su botón en el centro.
 *
 * `FOTOS_DEL_MONTAJE=<dir>` deja las fotos (montaje, cada tarjeta y la marca).
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const MODO = process.env.MODO ?? "bueno";
const ANTES = process.env.ANTES_MONTAJE ?? "1807a22";
const ANTES_DEL_CIERRE = process.env.ANTES_DEL_CIERRE ?? "a7e2b45";
const COMPILADO = path.join(RAIZ, "lib", "__tests__", ".compilado", "montaje-del-video");
const FOTOS = process.env.FOTOS_DEL_MONTAJE;

const { chromium } = require("playwright");
const sharp = require("sharp");
const ORIGEN = "http://estudio.test";
const HORA = "9:40 a. m.";
const LOS_DE_HOY = ["Tienda en línea", "Clínica", "Cursos", "Consultoría", "Agencia de viajes"];

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
        "scripts/video-de-ventas/narracion.mjs",
        "scripts/video-de-ventas/medios.mjs",
    ]) {
        const destino = path.join(dir, ruta);
        mkdirSync(path.dirname(destino), { recursive: true });
        writeFileSync(destino, execFileSync("git", ["show", `${ref}:${ruta}`], { cwd: RAIZ, maxBuffer: 64 << 20 }));
    }
    // Las fuentes con las que se dibujan los archivos: no cambian de una época a otra.
    cpSync(path.join(RAIZ, "scripts", "video-de-ventas", "fuentes"), path.join(dir, "scripts", "video-de-ventas", "fuentes"), { recursive: true });
    return path.join(dir, "scripts", "video-de-ventas");
}

/**
 * El estudio de una época, con los datos del montaje armados como los armaba
 * su guion. Sin `ref`, el de hoy.
 */
async function laPagina(ref) {
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
    const dir = ref ? elEstudioDe(ref) : path.join(RAIZ, "scripts", "video-de-ventas");
    const historia = await import(pathToFileURL(path.join(dir, "historia.mjs")).href);
    const estudio = await import(pathToFileURL(path.join(dir, "estudio.mjs")).href);
    // La época de las cinco tarjetas de color: sin archivos y con las píldoras.
    if (typeof estudio.losNegociosDelMontaje !== "function") {
        const datos = {
            ...comun,
            montaje: historia.NEGOCIOS_DEL_ARRANQUE.map((n) => ({ ...n, iniciales: historia.lasIniciales(n.contacto), mensajes: n.mensajes.map((m) => ({ ...m, hora: HORA })) })),
            chipsDeLaMarca: historia.CHIPS_DE_LA_MARCA,
        };
        return { html: estudio.laPaginaDelEstudio(datos), archivos, historia, estudio };
    }
    const medios = await import(pathToFileURL(path.join(dir, "medios.mjs")).href);
    const dirMedios = path.join(COMPILADO, `medios-${ref ?? "hoy"}`);
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
    const tipos = [
        ["nota", "nota"],
        ["doc", "documento"],
        ["foto", "imagen"],
        ["vid", "video"],
        ["ubic", "ubicacion"],
    ];
    const tipoDe = (b) => tipos.find(([clase]) => b.classList.contains(clase))?.[1] ?? "texto";
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
        const conArchivo = burbujas.filter((b) => tipoDe(b) !== "texto");
        return {
            tipo: pie?.firstChild?.textContent?.trim() ?? "",
            cabeceraAlto: Math.round(rc.height),
            cabeceraArriba: Math.round(rc.top - rv.top),
            rellenoArriba: parseFloat(est.paddingTop),
            saturacion: saturacion(est.backgroundColor),
            iconos,
            primeraBajoLaCabecera: primera ? Math.round(primera.top - rc.bottom) : null,
            contenidos: conArchivo.map(tipoDe),
            // Quién manda cada archivo: «yo» es la IA (la burbuja verde, a la derecha).
            lados: conArchivo.map((b) => (b.classList.contains("yo") ? "ia" : "cliente")),
            imagenesCargadas: imagenes.every((i) => i.complete && i.naturalWidth > 0),
            // Lo que enseña una foto, un video o un mapa: con la forma del
            // archivo, no estirado a lo alto por los estilos de la pantalla.
            proporciones: [...muro.querySelectorAll(".bur.foto img, .bur.vid .marco, .bur.ubic img")].map((e) => {
                const r = e.getBoundingClientRect();
                return Math.round((r.width / r.height) * 100) / 100;
            }),
            caja: { x: rm.x, y: rm.y, w: rm.width, h: rm.height },
        };
    });
}

/**
 * Lo que se VE en un trozo de la pantalla, en sus píxeles: el brillo medio,
 * cuánto varía y qué parte es casi negra o casi blanca. Una portada que no se
 * pinta sale oscura y lisa aunque su `<img>` diga que cargó.
 */
async function losPixelesDe(pagina, selector) {
    const h = await pagina.$(selector);
    assert.ok(h, `no está ${selector}`);
    const { data, info } = await sharp(await h.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let suma = 0;
    let suma2 = 0;
    let negros = 0;
    let blancos = 0;
    const n = info.width * info.height;
    const brillos = new Uint8Array(n);
    for (let i = 0; i < data.length; i += 3) {
        const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        brillos[i / 3] = Math.round(l);
        suma += l;
        suma2 += l * l;
        if (l < 35) negros++;
        if (l > 235) blancos++;
    }
    const media = suma / n;
    return {
        media: Math.round(media),
        // El fondo de un trozo con texto encima: la mitad de sus píxeles.
        mediana: [...brillos].sort((a, b) => a - b)[Math.floor(n / 2)],
        desviacion: Math.round(Math.sqrt(Math.max(0, suma2 / n - media * media))),
        negros: negros / n,
        blancos: blancos / n,
        ancho: info.width,
        alto: info.height,
    };
}

/** El botón de reproducir de la portada del video de Cursos, medido en la página. */
function elBotonDelVideo() {
    const m = document.querySelector('.mini[data-negocio="cursos"] .bur.vid .marco');
    const p = m?.querySelector(".play");
    const svg = p?.querySelector("svg");
    const rm = m?.getBoundingClientRect();
    const rp = p?.getBoundingClientRect();
    const rs = svg?.getBoundingClientRect();
    return {
        hay: !!p,
        ancho: rp?.width ?? 0,
        icono: rs?.width ?? 0,
        centroX: rp && rm ? rp.left + rp.width / 2 - (rm.left + rm.width / 2) : 99,
        centroY: rp && rm ? rp.top + rp.height / 2 - (rm.top + rm.height / 2) : 99,
        color: svg ? getComputedStyle(svg).color : "",
        duracion: m?.querySelector(".dur")?.textContent?.trim() ?? "",
    };
}

/** Monta el estudio de una época en un navegador y deja el montaje corriendo. */
async function abrir(ref) {
    const fuente = await laPagina(ref);
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const ctx = await navegador.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const { servirElEstudio } = await import("../../scripts/video-de-ventas/estudio-servido.mjs");
    await servirElEstudio(ctx, { pagina: () => fuente.html, archivos: fuente.archivos });
    const pagina = await ctx.newPage();
    const errores = [];
    pagina.on("pageerror", (e) => errores.push(e.message));
    await pagina.goto(`${ORIGEN}/__estudio/estudio.html`, { waitUntil: "load" });
    await pagina.waitForFunction(() => window.__estudio?.listo);
    await pagina.evaluate(() => document.fonts.ready);
    await pagina.evaluate((planos) => window.__estudio.plano(planos.montaje), fuente.estudio.PLANOS);
    await pagina.evaluate(() => window.__estudio.montaje());
    return { fuente, navegador, pagina, errores };
}

if (MODO === "roto") {
    describe(`MODO=roto: el arranque del vídeo en ${ANTES}`, () => {
        let s;
        before(async () => {
            assert.ok(chromium, "sin playwright no hay banco: NODE_PATH tiene que llegar a /opt/node22/lib/node_modules");
            s = await abrir(ANTES);
            await s.pagina.waitForTimeout(5200);
        });
        after(async () => s?.navegador?.close());

        test("eran cinco negocios de otra época, con una franja de color y relleno arriba", async () => {
            const t = await s.pagina.evaluate(medirLasTarjetas);
            assert.equal(t.length, 5);
            assert.notDeepEqual(
                t.map((x) => x.tipo),
                LOS_DE_HOY,
                "ya eran los cinco de hoy",
            );
            assert.ok(t.every((x) => x.saturacion > 40), `las cabeceras no eran de color: ${t.map((x) => x.saturacion)}`);
            assert.ok(t.every((x) => x.cabeceraAlto >= 80 && x.rellenoArriba >= 20), "la cabecera ya era compacta");
            assert.ok(t.every((x) => x.iconos === 0), "la cabecera ya llevaba los iconos de WhatsApp");
        });

        test("los mensajes salían abajo del todo, y casi todo en texto", async () => {
            const t = await s.pagina.evaluate(medirLasTarjetas);
            assert.ok(t.every((x) => x.primeraBajoLaCabecera > 100), `el primer mensaje ya iba pegado arriba: ${t.map((x) => x.primeraBajoLaCabecera)}`);
            const vistos = new Set(t.flatMap((x) => x.contenidos));
            for (const falta of ["nota", "video", "imagen", "ubicacion"]) assert.equal(vistos.has(falta), false, `ya había ${falta}`);
        });

        test("no había cierre, y la marca llevaba su lista de píldoras debajo", async () => {
            const r = await s.pagina.evaluate(() => ({ cierre: !!document.querySelector(".cierreMontaje"), chips: document.querySelectorAll("#marca .chipsMarca > *").length }));
            assert.equal(r.cierre, false, "ya había cierre del arranque");
            assert.ok(r.chips >= 5, `la marca no tenía sus píldoras (${r.chips})`);
        });
    });

    describe(`MODO=roto: el arranque del vídeo en ${ANTES_DEL_CIERRE}`, () => {
        let s;
        before(async () => {
            s = await abrir(ANTES_DEL_CIERRE);
            const falta = await s.pagina.evaluate(() => window.__estudio.yCualquierNegocio());
            await s.pagina.waitForTimeout(falta + 1100);
            if (FOTOS) {
                await s.pagina.screenshot({ path: path.join(FOTOS, `montaje-${ANTES_DEL_CIERRE}.png`) });
                const cursos = await s.pagina.$('.mini[data-negocio="cursos"]');
                if (cursos) await cursos.screenshot({ path: path.join(FOTOS, `cursos-${ANTES_DEL_CIERRE}.png`) });
            }
        });
        after(async () => s?.navegador?.close());

        test("eran cuatro tarjetas, sin agencia de viajes ni ubicación", async () => {
            const t = await s.pagina.evaluate(medirLasTarjetas);
            assert.deepEqual(
                t.map((x) => x.tipo),
                ["Tienda en línea", "Clínica", "Cursos", "Consultoría"],
            );
            assert.equal(t.flatMap((x) => x.contenidos).includes("ubicacion"), false, "ya había una ubicación");
        });

        test("el PDF de la consultoría lo mandaba el cliente, no la IA", async () => {
            const t = await s.pagina.evaluate(medirLasTarjetas);
            const consultoria = t.find((x) => x.tipo === "Consultoría");
            assert.deepEqual(consultoria.contenidos, ["documento"]);
            assert.deepEqual(consultoria.lados, ["cliente"], "el PDF ya lo mandaba la IA");
        });

        test("el cierre era una columna al lado de la última tarjeta, no una línea debajo", async () => {
            const r = await s.pagina.evaluate(() => {
                const c = document.querySelector(".cierreMontaje").getBoundingClientRect();
                const ultima = [...document.querySelectorAll(".mini")].at(-1).getBoundingClientRect();
                return { izquierda: c.left, arriba: c.top, derechaDeLaUltima: ultima.right, abajoDeLaUltima: ultima.bottom, dentroDeLasTarjetas: !!document.querySelector(".tarjetas .cierreMontaje") };
            });
            assert.ok(r.dentroDeLasTarjetas, "el cierre ya iba fuera de la fila de tarjetas");
            assert.ok(r.izquierda >= r.derechaDeLaUltima, "el cierre ya no iba a la derecha");
            assert.ok(r.arriba < r.abajoDeLaUltima, "el cierre ya iba debajo");
        });

        test("la duración del video se perdía sobre la portada clara", async () => {
            const dur = await losPixelesDe(s.pagina, '.mini[data-negocio="cursos"] .bur.vid .marco .dur');
            assert.ok(dur.mediana >= 170, `la duración ya tenía su franja oscura (fondo con brillo ${dur.mediana})`);
        });
    });

    // El recuadro negro con un punto en el centro: el marco del celular de las
    // tarjetas se llamaba `.mini .marco` y su pantalla `.mini .vid`, las MISMAS
    // clases que lleva por dentro una burbuja de video. Ninguna tarjeta de
    // ANTES_MONTAJE llevaba un video, así que no se veía; en cuanto una lo
    // lleva, el marco del celular se le pinta encima a la portada. Se pintan las
    // tarjetas de hoy con esas dos reglas de ANTES_MONTAJE, sacadas de git.
    describe(`MODO=roto: el marco del celular de ${ANTES} con una burbuja de video dentro`, () => {
        let s;
        before(async () => {
            const estudio = execFileSync("git", ["show", `${ANTES}:scripts/video-de-ventas/estudio.mjs`], { cwd: RAIZ, maxBuffer: 64 << 20 }).toString();
            const reglas = estudio.split("\n").filter((l) => /^\.mini \.(marco|vid) \{/.test(l));
            assert.equal(reglas.length, 2, `no encuentro las dos reglas del marco en ${ANTES}: ${reglas}`);
            s = await abrir(null);
            await s.pagina.addStyleTag({ content: reglas.join("\n") });
            const falta = await s.pagina.evaluate(() => window.__estudio.yCualquierNegocio());
            await s.pagina.waitForTimeout(falta + 1100);
            if (FOTOS) {
                const cursos = await s.pagina.$('.mini[data-negocio="cursos"]');
                if (cursos) await cursos.screenshot({ path: path.join(FOTOS, `cursos-marco-${ANTES}.png`) });
            }
        });
        after(async () => s?.navegador?.close());

        test("la portada del video de Cursos salía negra, sin su imagen ni su botón de reproducir", async () => {
            const marco = await losPixelesDe(s.pagina, '.mini[data-negocio="cursos"] .bur.vid .marco');
            const b = await s.pagina.evaluate(elBotonDelVideo);
            const seVe = marco.negros < 0.2 && marco.media > 70 && Math.abs(b.centroX) <= 1 && Math.abs(b.centroY) <= 1;
            assert.equal(seVe, false, `la portada ya se veía (brillo ${marco.media}, ${Math.round(marco.negros * 100)} % negro, botón desplazado ${Math.round(b.centroX)},${Math.round(b.centroY)})`);
        });
    });
} else {
    describe("el arranque del vídeo de ventas, pintado", () => {
        let s;
        let pagina;
        let fuente;

        before(async () => {
            assert.ok(chromium, "sin playwright no hay banco: NODE_PATH tiene que llegar a /opt/node22/lib/node_modules");
            s = await abrir(null);
            ({ pagina, fuente } = s);
        });

        after(async () => {
            await s?.navegador?.close();
        });

        test("cinco negocios, en su orden, en una fila centrada dentro del cuadro", async () => {
            const t = await pagina.evaluate(medirLasTarjetas);
            assert.deepEqual(
                t.map((x) => x.tipo),
                LOS_DE_HOY,
            );
            for (const x of t) {
                assert.ok(x.caja.x >= 0 && x.caja.x + x.caja.w <= 1920, `la tarjeta «${x.tipo}» se sale por un lado`);
                assert.ok(x.caja.y + x.caja.h <= 1080, `la tarjeta «${x.tipo}» se sale por abajo`);
            }
            // Las cinco a la misma altura y con el mismo aire entre ellas, y el
            // conjunto centrado: una fila, no un reparto a ojo.
            const huecos = t.slice(1).map((x, i) => Math.round(x.caja.x - (t[i].caja.x + t[i].caja.w)));
            assert.equal(new Set(huecos).size, 1, `los huecos entre tarjetas no son iguales: ${huecos}`);
            assert.equal(new Set(t.map((x) => Math.round(x.caja.y))).size, 1, "las tarjetas no arrancan a la misma altura");
            const izquierda = t[0].caja.x;
            const derecha = 1920 - (t.at(-1).caja.x + t.at(-1).caja.w);
            assert.ok(Math.abs(izquierda - derecha) <= 2, `la fila no está centrada (${Math.round(izquierda)} a la izquierda, ${Math.round(derecha)} a la derecha)`);
        });

        test("el cierre NO sale antes del último mensaje de la última tarjeta", async () => {
            const falta = await pagina.evaluate(() => window.__estudio.yCualquierNegocio());
            assert.ok(falta > 1500, `el cierre saldría a los ${falta} ms, con la última tarjeta a medias`);
            await pagina.waitForTimeout(600);
            const antes = await pagina.evaluate(() => Number(getComputedStyle(document.querySelector(".cierreMontaje")).opacity));
            assert.ok(antes < 0.05, `el cierre ya se ve (${antes}) antes de que acaben las tarjetas`);
            await pagina.waitForTimeout(falta - 600 + 1100);
            if (FOTOS) {
                await pagina.screenshot({ path: path.join(FOTOS, "montaje.png") });
                const minis = await pagina.$$(".mini");
                for (const [i, m] of minis.entries()) await m.screenshot({ path: path.join(FOTOS, `tarjeta-${i + 1}.png`) });
            }
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

        test("cada tarjeta enseña un contenido distinto, del lado de quien lo manda, y sus imágenes cargan", async () => {
            const t = await pagina.evaluate(medirLasTarjetas);
            const porTarjeta = t.map((x) => x.contenidos);
            for (const [i, c] of porTarjeta.entries()) assert.equal(c.length, 1, `«${t[i].tipo}» lleva ${c.length} contenidos: ${c}`);
            assert.deepEqual(new Set(porTarjeta.flat()), new Set(["imagen", "nota", "video", "documento", "ubicacion"]));
            assert.deepEqual(porTarjeta.flat(), fuente.historia.NEGOCIOS_DEL_ARRANQUE.map((n) => n.medio));
            const lado = Object.fromEntries(t.map((x) => [x.tipo, x.lados[0]]));
            assert.equal(lado["Consultoría"], "ia", "el PDF de la consultoría lo manda el cliente, no la IA");
            assert.equal(lado["Agencia de viajes"], "ia", "la ubicación no la manda la IA");
            assert.equal(lado["Clínica"], "cliente", "la nota de voz es de la clienta");
            for (const x of t) assert.ok(x.imagenesCargadas, `«${x.tipo}»: una imagen no carga`);
            const prop = Object.fromEntries(t.map((x) => [x.tipo, x.proporciones]));
            assert.deepEqual(prop["Tienda en línea"], [1], `la foto del sofá no sale cuadrada: ${prop["Tienda en línea"]}`);
            assert.equal(prop["Cursos"].length, 1);
            assert.ok(prop["Cursos"][0] > 1.6 && prop["Cursos"][0] < 1.9, `el video no sale apaisado (${prop["Cursos"][0]})`);
            assert.equal(prop["Agencia de viajes"].length, 1);
            assert.ok(prop["Agencia de viajes"][0] > 1.6 && prop["Agencia de viajes"][0] < 1.9, `el mapa no sale apaisado (${prop["Agencia de viajes"][0]})`);
        });

        test("el video de Cursos se ve como un video de WhatsApp: su imagen de fondo y el botón de reproducir encima", async () => {
            const marco = await losPixelesDe(pagina, '.mini[data-negocio="cursos"] .bur.vid .marco');
            assert.ok(marco.ancho >= 180 && marco.alto >= 100, `la portada mide ${marco.ancho}×${marco.alto}`);
            assert.ok(marco.negros < 0.2, `la portada sale negra (${Math.round(marco.negros * 100)} % de píxeles casi negros)`);
            assert.ok(marco.media > 70 && marco.desviacion > 30, `la portada no enseña una imagen (brillo ${marco.media}, variación ${marco.desviacion})`);
            const b = await pagina.evaluate(elBotonDelVideo);
            assert.ok(b.hay, "la portada no lleva botón de reproducir");
            assert.ok(b.ancho >= 36, `el botón de reproducir mide ${b.ancho} px: se lee como un punto`);
            assert.ok(b.icono >= 18, `el triángulo de reproducir mide ${b.icono} px`);
            assert.ok(Math.abs(b.centroX) <= 1 && Math.abs(b.centroY) <= 1, "el botón no está en el centro de la portada");
            assert.equal(b.color, "rgb(255, 255, 255)", "el triángulo no es blanco");
            assert.match(b.duracion, /^\d+:\d{2}$/, "la portada no dice cuánto dura el video");
            // El triángulo se ve de verdad: dentro del botón hay píxeles blancos.
            const play = await losPixelesDe(pagina, '.mini[data-negocio="cursos"] .bur.vid .marco .play');
            assert.ok(play.blancos > 0.08, `el botón no enseña su triángulo blanco (${Math.round(play.blancos * 100)} % blanco)`);
            // La duración se lee: debajo del número, la franja oscura de WhatsApp,
            // no la portada clara tal cual.
            const dur = await losPixelesDe(pagina, '.mini[data-negocio="cursos"] .bur.vid .marco .dur');
            assert.ok(dur.mediana < 170, `la duración se pierde sobre la portada (fondo con brillo ${dur.mediana})`);
        });

        test("el nombre del PDF y el del lugar se leen enteros, sin cortarse", async () => {
            const r = await pagina.evaluate(() => {
                const pdf = document.querySelector('.mini[data-negocio="consultoria"] .bur.doc .ficha b');
                const lugar = document.querySelector('.mini[data-negocio="viajes"] .bur.ubic .lugar b');
                const lineas = (e) => {
                    const rango = document.createRange();
                    rango.selectNodeContents(e);
                    return new Set([...rango.getClientRects()].map((x) => Math.round(x.top))).size;
                };
                return { pdf: pdf.textContent, pdfCortado: pdf.scrollWidth > pdf.clientWidth + 1, lugarLineas: lineas(lugar) };
            });
            assert.equal(r.pdfCortado, false, `el nombre del PDF sale cortado con «…» («${r.pdf}»)`);
            assert.equal(r.lugarLineas, 1, `el nombre del lugar se parte en ${r.lugarLineas} líneas`);
        });

        test("el mapa de la agencia de viajes se ve, con el nombre y la dirección del punto de encuentro", async () => {
            const mapa = await losPixelesDe(pagina, '.mini[data-negocio="viajes"] .bur.ubic img');
            assert.ok(mapa.negros < 0.1 && mapa.media > 150, `el mapa no se pinta (brillo ${mapa.media}, ${Math.round(mapa.negros * 100)} % negro)`);
            const r = await pagina.evaluate(() => {
                const b = document.querySelector('.mini[data-negocio="viajes"] .bur.ubic');
                return { nombre: b.querySelector(".lugar b")?.textContent, direccion: b.querySelector(".lugar small")?.textContent };
            });
            const ubic = fuente.historia.NEGOCIOS_DEL_ARRANQUE.find((n) => n.id === "viajes").mensajes.find((m) => m.tipo === "ubicacion");
            assert.equal(r.nombre, ubic.nombre);
            assert.equal(r.direccion, ubic.direccion);
        });

        test("el cierre es UNA línea centrada debajo de las cinco tarjetas, dentro del cuadro, con su frase", async () => {
            const r = await pagina.evaluate(() => {
                const c = document.querySelector(".cierreMontaje");
                const b = c.getBoundingClientRect();
                // El texto: lo que ocupan sus letras, no la caja de lado a lado.
                const rango = document.createRange();
                rango.selectNodeContents(c);
                const lineas = [...rango.getClientRects()].map((x) => Math.round(x.top + x.height / 2));
                const texto = rango.getBoundingClientRect();
                const minis = [...document.querySelectorAll(".mini")].map((m) => m.getBoundingClientRect());
                const sub = getComputedStyle(document.querySelector("#subtitulo"));
                return {
                    opacidad: Number(getComputedStyle(c).opacity),
                    texto: c.textContent.trim(),
                    dentroDeLaFila: !!c.closest(".tarjetas"),
                    lineas: new Set(lineas.map((y) => Math.round(y / 10))).size,
                    alto: b.height,
                    fuente: parseFloat(getComputedStyle(c).fontSize),
                    centro: texto.left + texto.width / 2,
                    textoIzquierda: texto.left,
                    textoDerecha: texto.right,
                    arriba: texto.top,
                    abajo: texto.bottom,
                    abajoDeLasTarjetas: Math.max(...minis.map((m) => m.bottom)),
                    // Donde empieza la franja de los subtítulos: su margen de abajo más
                    // su alto con una línea (la pastilla puede estar vacía y medir 0).
                    subtituloArriba: window.innerHeight - parseFloat(sub.bottom) - 56,
                };
            });
            assert.ok(r.opacidad > 0.95, `el cierre no se ve (${r.opacidad})`);
            assert.equal(r.texto, fuente.historia.CIERRE_DEL_MONTAJE);
            assert.equal(r.dentroDeLaFila, false, "el cierre sigue dentro de la fila de tarjetas, como una columna más");
            assert.equal(r.lineas, 1, `el cierre se parte en ${r.lineas} líneas`);
            assert.ok(r.alto < r.fuente * 1.6, `el cierre ocupa ${Math.round(r.alto)} px de alto: no es una línea`);
            assert.ok(Math.abs(r.centro - 960) <= 3, `el cierre no está centrado (centro en ${Math.round(r.centro)})`);
            assert.ok(r.textoIzquierda >= 0 && r.textoDerecha <= 1920, "el cierre se sale del cuadro");
            assert.ok(r.arriba >= r.abajoDeLasTarjetas + 8, `el cierre se monta sobre las tarjetas (${Math.round(r.arriba)} frente a ${Math.round(r.abajoDeLasTarjetas)})`);
            assert.ok(r.abajo <= fuente.estudio.LIMITE_DE_ABAJO, `el cierre baja hasta ${Math.round(r.abajo)}: pisa la zona de los subtítulos`);
            assert.ok(r.abajo <= r.subtituloArriba, `el cierre (${Math.round(r.abajo)}) pisa los subtítulos (${Math.round(r.subtituloArriba)})`);
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
            assert.deepEqual(s.errores, []);
        });
    });
}
