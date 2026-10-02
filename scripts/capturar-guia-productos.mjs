/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Productos, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-productos.mjs`). Mismo estándar y mismas piezas que la de
 * Leads y Catálogo: lo común vive en `taller-de-la-guia.mjs`; aquí solo está
 * lo que es de esta pantalla —qué se abre, qué se señala y qué se dice—.
 *
 * La pantalla es `/products` (Entrenamiento › Productos): la barra de trabajo,
 * la tabla y el formulario de un producto. Lo que se VE en el catálogo público
 * (la tarjeta rebajada, lo inactivo que no sale) se fotografía abriendo «Ver
 * catálogo», con las fotos de la tienda de ejemplo que sirve el propio guion
 * (`imagenes-guia-catalogo.mjs`): no se sube nada a ningún sitio.
 *
 * Las fotos del formulario son las del producto sembrado con cuatro: subir una
 * foto de verdad pide el bucket, que aquí no existe.
 *
 * Qué captura hace falta lo dice `lib/guia-productos.ts`: el script se niega a
 * terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-productos.sh`.
 */
import { createRequire } from "node:module";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { servirLasImagenes } from "./imagenes-guia-catalogo.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-productos.mjs";
import { guardarWav, loQueSeCorta, mezclar, montarLaPista, tramosSinLosCortes } from "./voz-de-la-guia.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "productos");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-productos";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
/** Solo el vídeo (p. ej. al cambiar la narración): las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-productos.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-productos.json");

const PANTALLA = "/products";

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* La pantalla                                                         */
/* ------------------------------------------------------------------ */

const BARRA = "[data-barra-de-acciones]";
const TABLA = "[data-tabla-de-productos]";
const FORMULARIO = "[data-formulario-del-producto]";
const PIE_DEL_FORMULARIO = "[data-pie-del-producto]";
const BUSCADOR = 'input[placeholder="Buscar producto..."]';
const CIFRAS = ["Total productos", "Activos", "Sin stock", "Cupos disponibles"];

const laFila = (p, titulo) => p.locator(`[data-fila-de-producto="${titulo}"]`);
const laCifra = (p, etiqueta) => p.locator(`${BARRA} [aria-label="${etiqueta}"]`).first();
const elCampo = (p, campo) => p.locator(`${FORMULARIO} [data-campo="${campo}"]`);
const elNuevo = (p) => p.locator(BARRA).getByRole("button", { name: "Nuevo" });
/** La celda de una columna de una fila, por el título de la cabecera. */
async function laCelda(p, titulo, columna) {
    const i = await p.locator(`${TABLA} thead th`).evaluateAll((ths, columna) => ths.findIndex((th) => th.textContent.trim() === columna), columna);
    return laFila(p, titulo).locator("td").nth(i);
}

async function abrirProductos(p, q = "") {
    await p.goto(`${BASE}${PANTALLA}${q ? `?q=${encodeURIComponent(q)}` : ""}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(TABLA, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 30000 });
    await espera(p, 1500);
    await despejar(p);
    // Los botones del borde tapan «Ver catálogo» y el Guardar del formulario.
    await esconderLosBotonesDelBorde(p);
}

/** Abre el formulario (de un producto, o el de Nuevo) y espera a que se pinte. */
async function abrirElFormulario(p, titulo) {
    if (titulo) await laFila(p, titulo).locator("[data-editar-producto]").click();
    else await elNuevo(p).click();
    await p.waitForSelector(FORMULARIO, { timeout: 15000 });
    await p.waitForFunction((sel) => [...document.querySelectorAll(`${sel} img`)].every((i) => i.complete), FORMULARIO, { timeout: 15000 });
    await espera(p, 600);
    return p.locator(FORMULARIO);
}

async function cerrarElFormulario(p) {
    await p.keyboard.press("Escape");
    await p.waitForSelector(FORMULARIO, { state: "detached", timeout: 10000 });
    // Al cerrar, el foco vuelve al lápiz de la fila y su anillo saldría en la foto.
    await sinFoco(p);
}

/** Escribe en la tabla y espera a que la búsqueda (con su espera de 400 ms) llegue. */
async function buscar(p, texto) {
    const campo = p.locator(BUSCADOR);
    await campo.fill(texto);
    await p.waitForURL((u) => (u.searchParams.get("q") ?? "") === texto, { timeout: 15000 });
    await espera(p, 1500);
}

/** Abre el catálogo público con «Ver catálogo», en su pestaña, como el dueño. */
async function abrirElPublico(p) {
    const [publico] = await Promise.all([p.context().waitForEvent("page"), p.locator("[data-ver-catalogo]").click()]);
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

/** Una tarjeta y la de al lado, en su misma fila (el mismo encuadre que la guía de Catálogo). */
async function conSuVecina(pub, titulo) {
    const tarjeta = laTarjeta(pub, titulo);
    await tarjeta.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(pub, 500);
    const c = await caja(pub, tarjeta);
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

/**
 * Suelta el foco y aparta el ratón: un anillo de foco o un globo que quedó de
 * la receta anterior se lee como otra marca.
 */
async function sinFoco(p) {
    await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    const v = p.viewportSize();
    await p.mouse.move(v.width - 6, v.height - 6);
    // Un globo de Radix no siempre se va al apartar el ratón: Escape lo cierra.
    if (await p.locator("[data-radix-popper-content-wrapper]").count()) await p.keyboard.press("Escape");
    await p.locator('[role="tooltip"]').waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    await espera(p, 300);
}

/** Una caja abierta `x` píxeles a cada lado: su número no tapa el texto. */
const afuera = (c, x, y = 0) => ({ x: c.x - x, y: c.y - y, w: c.w + 2 * x, h: c.h + 2 * y });

/** Las filas de arriba de la tabla: la cabecera y las `n` primeras. */
async function lasPrimerasFilas(p, n) {
    const cabecera = await caja(p, `${TABLA} thead`);
    const filas = p.locator(`${TABLA} tbody tr`);
    const ultima = await caja(p, filas.nth(Math.min(n, await filas.count()) - 1));
    return { x: cabecera.x, y: cabecera.y, w: cabecera.w, h: ultima.y + ultima.h - cabecera.y };
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

async function miniaturas(p) {
    const conFormulario = (titulo, campo) => async () => {
        await abrirElFormulario(p, titulo);
        return caja(p, campo ? elCampo(p, campo) : FORMULARIO);
    };
    const zonas = [
        ["vista-general", async () => unir(await caja(p, BARRA), await lasPrimerasFilas(p, 3))],
        ["buscar", async () => caja(p, BUSCADOR)],
        ["cifras", async () => unir(...(await Promise.all(CIFRAS.map((e) => caja(p, laCifra(p, e))))))],
        ["ver-catalogo", async () => caja(p, "[data-ver-catalogo]")],
        ["crear", async () => caja(p, elNuevo(p))],
        ["fotos", conFormulario("Café Origen Huila 500 g", "Fotos")],
        ["precio", async () => {
            await abrirElFormulario(p, "Café Nariño Especial 500 g");
            return unir(await caja(p, elCampo(p, "Precio")), await caja(p, elCampo(p, "Precio antes")));
        }],
        ["categoria-y-codigo", async () => {
            await abrirElFormulario(p, "Café Origen Huila 500 g");
            return unir(await caja(p, elCampo(p, "Categoría")), await caja(p, elCampo(p, "Código")));
        }],
        ["inventario", conFormulario("Café Tolima Clásico 250 g", "Inventario")],
        ["editar-y-eliminar", async () => caja(p, (await laCelda(p, "Café Origen Huila 500 g", "Acciones")).locator("div").first())],
    ];
    await tomarLasMiniaturas(p, zonas, {
        salida: SALIDA,
        tomadas,
        focos: FOCOS,
        // Lo que abrió una miniatura (el formulario) se cierra antes de la siguiente.
        despues: async () => {
            if (await p.locator(FORMULARIO).count()) await cerrarElFormulario(p);
        },
    });
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();

    // Portada del vídeo: la pantalla limpia (las miniaturas dejan el foco puesto).
    await sinFoco(p);
    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las cuatro zonas, en el orden de
    // `ZONAS_DE_LA_PANTALLA`. El menú y la barra de arriba van metidos unos
    // píxeles: pegados al borde, su recuadro se saldría.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const cBarra = await caja(p, BARRA);
    const cTabla = await caja(p, TABLA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: cBarra, n: 3 },
        { c: dentro(cTabla, 4), n: 4 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // La barra de trabajo, sus cinco partes.
    const partes = [
        await caja(p, BUSCADOR),
        unir(...(await Promise.all(CIFRAS.map((e) => caja(p, laCifra(p, e)))))),
        await caja(p, "[data-cupo-del-plan]"),
        await caja(p, "[data-ver-catalogo]"),
        await caja(p, elNuevo(p)),
    ];
    // Las piezas van pegadas: un recuadro por pieza se montaría con el de al
    // lado. Va uno alrededor de la barra y cada número bajo su pieza.
    await marcar(p, [{ c: afuera(cBarra, 2, 2) }, ...partes.map((c, i) => ({ c, n: i + 1, sinRecuadro: true, borde: "abajo", esquina: "centro" }))]);
    await guardar(p, "barra-de-trabajo.webp", holgura({ ...cBarra, h: cBarra.h + 24 }, 18, vista));
    await desmarcar(p);

    // La tabla: la cabecera y las primeras filas, con las columnas señaladas.
    const zonaTabla = await lasPrimerasFilas(p, 4);
    await marcar(p, [{ c: await caja(p, `${TABLA} thead`) }]);
    await guardar(p, "tabla.webp", holgura(zonaTabla, 12, vista));
    await desmarcar(p);

    // 2. Buscar: por nombre, y por categoría.
    await buscar(p, "Nariño");
    let cBuscador = await caja(p, BUSCADOR);
    await marcar(p, [
        { c: cBuscador, n: 1 },
        { c: await caja(p, laFila(p, "Café Nariño Especial 500 g")), texto: "Solo lo que coincide", lado: "abajo" },
    ]);
    await guardar(p, "buscar-escribir.webp", holgura(unir(cBarra, await lasPrimerasFilas(p, 1), { ...cBarra, h: cBarra.h + 260 }), 16, vista));
    await desmarcar(p);

    await buscar(p, "origen");
    cBuscador = await caja(p, BUSCADOR);
    await marcar(p, [
        { c: cBuscador, n: 1 },
        { c: await caja(p, `${TABLA} tbody`), texto: "Los tres cafés de la categoría", lado: "abajo" },
    ]);
    await guardar(p, "buscar-categoria.webp", holgura(unir(cBarra, await lasPrimerasFilas(p, 3), { ...cBarra, h: cBarra.h + 420 }), 16, vista));
    await desmarcar(p);

    await buscar(p, "");
    await marcar(p, [
        { c: await caja(p, BUSCADOR) },
    ]);
    await guardar(p, "buscar-todos.webp", holgura(unir(cBarra, await lasPrimerasFilas(p, 5)), 16, vista));
    await desmarcar(p);

    // 3. Las cifras, numeradas; su nombre al pasar el ratón; el cupo.
    const cajasCifras = [];
    for (const e of CIFRAS) cajasCifras.push(await caja(p, laCifra(p, e)));
    const zonaCifras = holgura(unir(...cajasCifras, await caja(p, "[data-cupo-del-plan]"), { ...cBarra, h: cBarra.h + 60 }), 20, vista);
    await marcar(p, [{ c: afuera(unir(...cajasCifras), 4, 3) }, ...cajasCifras.map((c, i) => ({ c, n: i + 1, sinRecuadro: true, borde: "abajo", esquina: "centro" }))]);
    await guardar(p, "cifras.webp", zonaCifras);
    await desmarcar(p);

    await laCifra(p, "Sin stock").hover();
    await p.waitForSelector('[role="tooltip"]', { timeout: 10000 });
    await espera(p, 400);
    await marcar(p, [{ c: await caja(p, laCifra(p, "Sin stock")) }]);
    await guardar(p, "cifras-nombre.webp", holgura(unir(cajasCifras[2], await caja(p, p.locator('[role="tooltip"]').first()), { ...cBarra, h: cBarra.h + 70 }), 30, vista));
    await desmarcar(p);
    await sinFoco(p);

    await marcar(p, [{ c: afuera(await caja(p, "[data-cupo-del-plan]"), 6, 3) }]);
    await guardar(p, "cupo.webp", holgura({ ...cBarra, h: cBarra.h + 110 }, 16, vista));
    await desmarcar(p);

    // 4. Ver catálogo: el botón, el catálogo público y lo inactivo.
    const cVer = await caja(p, "[data-ver-catalogo]");
    await marcar(p, [{ c: cVer }]);
    await guardar(p, "ver-catalogo.webp", holgura({ ...cBarra, h: cBarra.h + 110 }, 16, vista));
    await desmarcar(p);

    const pub = await abrirElPublico(p);
    const vistaPub = pub.viewportSize();
    const { tarjeta: huila, c: cHuila, zona: zonaHuila } = await conSuVecina(pub, "Café Origen Huila");
    await marcar(pub, [
        { c: cHuila, soloLuz: true },
        { c: await caja(pub, huila.locator('a[href^="https://wa.me"]')) },
    ], { atenuar: true });
    await guardar(pub, "catalogo-publico.webp", holgura(zonaHuila, 16, vistaPub));
    await desmarcar(pub);
    if (await pub.locator("h3", { hasText: "Caja Regalo" }).count()) throw new Error("un producto inactivo sale en el catálogo público");

    // 7. El precio de antes, tachado y con su descuento.
    const { tarjeta: narino, c: cNarino, zona: zonaNarino } = await conSuVecina(pub, "Café Nariño Especial");
    await marcar(pub, [
        { c: cNarino, soloLuz: true },
        { c: afuera(await caja(pub, narino.locator("span.text-2xl").locator("xpath=..")), 6, 3), n: 1, esquina: "derecha" },
        { c: afuera(await caja(pub, narino.locator("span", { hasText: /^-\d+%$/ })), 6, 3), n: 2, esquina: "derecha" },
    ], { atenuar: true });
    await guardar(pub, "precio-catalogo.webp", holgura(zonaNarino, 16, vistaPub));
    await desmarcar(pub);
    await pub.close();

    const estado = await laCelda(p, "Caja Regalo Degustación", "Estado");
    await laFila(p, "Caja Regalo Degustación").scrollIntoViewIfNeeded();
    await marcar(p, [
        { c: await caja(p, laFila(p, "Caja Regalo Degustación")), soloLuz: true },
        { c: afuera(await caja(p, estado.locator("div, span").first()), 6, 4) },
    ], { atenuar: true });
    await guardar(p, "catalogo-inactivo.webp", holgura(await caja(p, laFila(p, "Caja Regalo Degustación")), 60, vista));
    await desmarcar(p);
    await p.locator(`${TABLA} > div > div`).first().evaluate((el) => el.scrollTo({ top: 0 }));
    await espera(p, 300);

    // 5. Crear: el botón, el formulario lleno y el producto en la tabla.
    await marcar(p, [{ c: afuera(await caja(p, elNuevo(p)), 4, 2) }]);
    await guardar(p, "crear-nuevo.webp", holgura({ ...cBarra, h: cBarra.h + 110 }, 16, vista));
    await desmarcar(p);

    await abrirElFormulario(p, null);
    const nombre = elCampo(p, "Nombre").locator("input");
    await nombre.fill("Café Sierra Nevada 500 g");
    await elCampo(p, "Precio").locator("input").pressSequentially("45000", { delay: 15 });
    await elCampo(p, "Categoría").locator("input").fill("Café de origen");
    await sinFoco(p);
    const cFormulario = await caja(p, FORMULARIO);
    await marcar(p, [
        { c: afuera(await caja(p, elCampo(p, "Activo")), 6, 4), n: 1 },
        { c: await caja(p, elCampo(p, "Fotos")), n: 2 },
        { c: await caja(p, elCampo(p, "Nombre")), n: 3 },
        { c: unir(await caja(p, elCampo(p, "Precio")), await caja(p, elCampo(p, "Precio antes"))), n: 4 },
        { c: unir(await caja(p, elCampo(p, "Categoría")), await caja(p, elCampo(p, "Código"))), n: 5 },
    ]);
    await guardar(p, "crear-formulario.webp", holgura(cFormulario, 16, vista));
    await desmarcar(p);

    // El recuadro de agregar una foto (6), en el mismo formulario.
    const agregar = elCampo(p, "Fotos").locator("label");
    await marcar(p, [{ c: await caja(p, agregar) }]);
    await guardar(p, "fotos-agregar.webp", holgura(unir(await caja(p, elCampo(p, "Fotos")), await caja(p, elCampo(p, "Nombre"))), 30, vista));
    await desmarcar(p);

    // El código: uno que ya usa otro producto.
    const codigo = elCampo(p, "Código").locator("input");
    await codigo.fill("CDM-HUI-500");
    await codigo.blur();
    await p.waitForSelector(`${FORMULARIO} p.text-destructive`, { timeout: 15000 });
    await espera(p, 400);
    await marcar(p, [{ c: afuera(await caja(p, elCampo(p, "Código")), 6, 4) }]);
    await guardar(p, "codigo.webp", holgura(unir(await caja(p, elCampo(p, "Precio")), await caja(p, elCampo(p, "Inventario"))), 24, vista));
    await desmarcar(p);
    await codigo.fill("CDM-SIE-500");
    await codigo.blur();
    await espera(p, 1200);

    await elCampo(p, "Categoría").scrollIntoViewIfNeeded();
    await marcar(p, [{ c: afuera(await caja(p, elCampo(p, "Categoría")), 6, 4) }]);
    await guardar(p, "categoria.webp", holgura(unir(await caja(p, elCampo(p, "Precio")), await caja(p, elCampo(p, "Inventario"))), 24, vista));
    await desmarcar(p);

    // Las etiquetas: dos, con Enter y con el botón verde.
    const etiqueta = elCampo(p, "Etiquetas").locator("input");
    await etiqueta.scrollIntoViewIfNeeded();
    await etiqueta.fill("nuevo");
    await etiqueta.press("Enter");
    await etiqueta.fill("oferta");
    await elCampo(p, "Etiquetas").getByRole("button", { name: "Agregar etiqueta" }).click();
    await sinFoco(p);
    await marcar(p, [
        { c: await caja(p, elCampo(p, "Etiquetas").getByRole("button", { name: "Agregar etiqueta" })), n: 1, esquina: "derecha" },
        { c: await caja(p, elCampo(p, "Etiquetas").locator("div.flex-wrap")) },
    ]);
    await guardar(p, "etiquetas.webp", holgura(unir(await caja(p, elCampo(p, "Inventario")), await caja(p, elCampo(p, "Etiquetas")), { ...(await caja(p, elCampo(p, "Etiquetas"))), h: (await caja(p, elCampo(p, "Etiquetas"))).h + 70 }), 24, vista));
    await desmarcar(p);

    // Guardar, y el producto nuevo en la tabla.
    await p.locator(PIE_DEL_FORMULARIO).getByRole("button", { name: "Guardar" }).click();
    await p.waitForSelector(FORMULARIO, { state: "detached", timeout: 20000 });
    await laFila(p, "Café Sierra Nevada 500 g").waitFor({ timeout: 20000 });
    await espera(p, 800);
    await laFila(p, "Café Sierra Nevada 500 g").scrollIntoViewIfNeeded();
    // El aviso «Producto creado» cae encima de la fila: se espera a que se vaya.
    await quitarAvisos(p);
    await sinFoco(p);
    await marcar(p, [{ c: await caja(p, laFila(p, "Café Sierra Nevada 500 g")) }]);
    await guardar(p, "crear-guardado.webp");
    await desmarcar(p);
    await quitarAvisos(p);
    await p.locator(`${TABLA} > div > div`).first().evaluate((el) => el.scrollTo({ top: 0 }));
    await espera(p, 300);

    // 6. Las fotos del producto con cuatro, y la X para quitar una.
    await abrirElFormulario(p, "Café Origen Huila 500 g");
    const cFotos = await caja(p, elCampo(p, "Fotos"));
    const zonaFotos = holgura(unir(cFotos, await caja(p, elCampo(p, "Nombre"))), 30, vista);
    await marcar(p, [
        { c: afuera(await caja(p, elCampo(p, "Fotos").locator("span", { hasText: "Principal" })), 4, 3) },
        { c: await caja(p, elCampo(p, "Fotos").locator("p")), n: 1, esquina: "derecha" },
    ]);
    await guardar(p, "fotos-cuatro.webp", zonaFotos);
    await desmarcar(p);
    const segunda = elCampo(p, "Fotos").locator("div.group").nth(1);
    await segunda.hover();
    await espera(p, 500);
    await marcar(p, [{ c: afuera(await caja(p, segunda.getByRole("button", { name: "Quitar la foto 2" })), 4, 4) }]);
    await guardar(p, "fotos-quitar.webp", zonaFotos);
    await desmarcar(p);
    await cerrarElFormulario(p);

    // 7. El precio y el de antes, en el producto rebajado.
    await abrirElFormulario(p, "Café Nariño Especial 500 g");
    const zonaPrecio = holgura(unir(await caja(p, elCampo(p, "Nombre")), await caja(p, elCampo(p, "Código"))), 24, vista);
    await marcar(p, [{ c: afuera(await caja(p, elCampo(p, "Precio")), 6, 4) }]);
    await guardar(p, "precio.webp", zonaPrecio);
    await desmarcar(p);
    await marcar(p, [{ c: afuera(await caja(p, elCampo(p, "Precio antes")), 6, 4) }]);
    await guardar(p, "precio-antes.webp", zonaPrecio);
    await desmarcar(p);
    await cerrarElFormulario(p);

    // 9. El inventario: sin límite, controlado y agotado.
    const elInventario = async (titulo, imagen, texto) => {
        await abrirElFormulario(p, titulo);
        await elCampo(p, "Inventario").scrollIntoViewIfNeeded();
        const c = await caja(p, elCampo(p, "Inventario"));
        await marcar(p, [{ c: afuera(c, 6, 4) }]);
        await guardar(p, imagen, holgura({ ...c, y: c.y - 70, h: c.h + 150 }, 24, vista));
        await desmarcar(p);
        await cerrarElFormulario(p);
    };
    await elInventario("Molino Manual de Café", "inventario-sin-limite.webp", "Apagado: nunca se agota");
    await elInventario("Café Tolima Clásico 250 g", "inventario-controlado.webp", "Encendido: quedan 6");

    const filaAgotada = laFila(p, "Café Molido Espresso 250 g");
    await filaAgotada.scrollIntoViewIfNeeded();
    await marcar(p, [
        { c: await caja(p, filaAgotada), soloLuz: true },
        { c: afuera(await caja(p, (await laCelda(p, "Café Molido Espresso 250 g", "Stock")).locator("span")), 8, 4) },
    ], { atenuar: true });
    await guardar(p, "inventario-agotado.webp", holgura(await caja(p, filaAgotada), 60, vista));
    await desmarcar(p);
    await p.locator(`${TABLA} > div > div`).first().evaluate((el) => el.scrollTo({ top: 0 }));
    await espera(p, 300);

    // 10. Editar, ordenar y eliminar.
    await abrirElFormulario(p, "Café Origen Huila 500 g");
    await marcar(p, [{ c: afuera(await caja(p, `${FORMULARIO} h2`), 6, 4) }]);
    await guardar(p, "editar.webp", holgura(await caja(p, FORMULARIO), 16, vista));
    await desmarcar(p);
    await cerrarElFormulario(p);

    const filaHuila = laFila(p, "Café Origen Huila 500 g");
    await marcar(p, [
        { c: await caja(p, filaHuila), soloLuz: true },
        { c: afuera(await caja(p, filaHuila.locator("[data-asa-de-producto]")), 3, 3) },
    ], { atenuar: true });
    await guardar(p, "ordenar.webp", holgura(await lasPrimerasFilas(p, 3), 12, vista));
    await desmarcar(p);

    await filaHuila.locator("[data-eliminar-producto]").click();
    const confirmar = p.getByRole("dialog").filter({ hasText: "Eliminar producto" });
    await confirmar.waitFor({ timeout: 10000 });
    await espera(p, 500);
    await marcar(p, [{ c: afuera(await caja(p, confirmar.getByRole("button", { name: "Eliminar" })), 4, 4) }]);
    await guardar(p, "eliminar.webp", holgura(await caja(p, confirmar), 30, vista));
    await desmarcar(p);
    await confirmar.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 500);

    await elMarcoDeLaPantalla(p, guardar, { modulo: "Entrenamiento", texto: "Productos está en Entrenamiento" });
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
    });
    await ctx.addInitScript(CURSOR);
    await servirLasImagenes(ctx);
    await conElDominioDeLaGuia(ctx, BASE);
    const p = await ctx.newPage();
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, sinGrabarLaEspera, tramos, cortes } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirProductos(p);
    await p.mouse.move(640, 400, { steps: 8 });
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("su foto", 600);
    await mover(p, laFila(p, "Café Origen Huila 500 g").locator("img"));

    // El menú: se abre con las dos flechas, se señala Entrenamiento y se
    // recoge al empezar la frase de la barra, donde viven las flechas.
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

    const buscador = p.locator(BUSCADOR);
    await decir("buscar");
    await pulsar(p, buscador);
    await alDecir("su categoría", 900);
    await buscador.pressSequentially("origen", { delay: 110 });
    await alDecir("al borrarlo", 300);
    await buscador.fill("");
    await mover(p, p.locator(TABLA));

    await decir("cifras");
    await alDecir("cuántos productos tienes", 500);
    await mover(p, laCifra(p, "Total productos"));
    await alDecir("cuántos están activos", 400);
    await mover(p, laCifra(p, "Activos"));
    await alDecir("cuántos se agotaron", 400);
    await mover(p, laCifra(p, "Sin stock"));
    await alDecir("cuántos te quedan en tu plan", 400);
    await mover(p, p.locator("[data-cupo-del-plan]"));

    // Ver catálogo: en el vídeo se abre en la MISMA pestaña (lo grabado es
    // esta página; una pestaña nueva no saldría en el vídeo).
    await p.evaluate(() => {
        window.open = (url) => {
            window.location.href = url;
            return null;
        };
    });
    await decir("verCatalogo");
    await pulsar(p, p.locator("[data-ver-catalogo]"));
    await esperarAlPublico(p);
    await alDecir("cada producto activo", 400);
    await mover(p, laTarjeta(p, "Café Origen Huila"));

    // De vuelta a la tabla: lo que tarda en cargar no sale en el vídeo.
    await sinGrabarLaEspera(async () => {
        await p.goBack({ waitUntil: "domcontentloaded" });
        await p.waitForSelector(TABLA, { timeout: 60000 });
        await esconderLosBotonesDelBorde(p);
        await espera(p, 600);
    });

    await decir("nuevo");
    await alDecir("pulsa Nuevo", 500);
    await pulsar(p, elNuevo(p));
    await p.waitForSelector(FORMULARIO, { timeout: 15000 });
    await alDecir("escribe el nombre", 300);
    const nombre = elCampo(p, "Nombre").locator("input");
    await pulsar(p, nombre);
    await nombre.pressSequentially("Café Cauca 250 g", { delay: 55 });
    const precio = elCampo(p, "Precio").locator("input");
    await pulsar(p, precio);
    await precio.pressSequentially("27000", { delay: 70 });
    const categoria = elCampo(p, "Categoría").locator("input");
    await pulsar(p, categoria);
    await categoria.pressSequentially("Café de origen", { delay: 45 });

    await decir("detalles");
    await alDecir("cuatro fotos", 500);
    await mover(p, elCampo(p, "Fotos").locator("label"));
    await alDecir("el código", 400);
    const codigo = elCampo(p, "Código").locator("input");
    await pulsar(p, codigo);
    await codigo.pressSequentially("CDM-CAU-250", { delay: 40 });
    await alDecir("este interruptor", 500);
    await pulsar(p, elCampo(p, "Inventario").getByRole("switch", { name: "Controlar el inventario" }));
    const unidades = elCampo(p, "Inventario").locator("input[inputmode=numeric]");
    await unidades.fill("");
    await unidades.pressSequentially("12", { delay: 90 });
    await alDecir("una descripción", 500);
    const descripcion = elCampo(p, "Descripción").locator("textarea");
    // Pegada al pie del formulario: se trae al centro, con su desplazamiento suave.
    await descripcion.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
    await espera(p, 500);
    await pulsar(p, descripcion);
    await descripcion.pressSequentially("Notas de caramelo.", { delay: 40 });

    await decir("guardar");
    await pulsar(p, p.locator(PIE_DEL_FORMULARIO).getByRole("button", { name: "Guardar" }));
    await laFila(p, "Café Cauca 250 g").waitFor({ timeout: 20000 });
    await alDecir("aparece en la tabla", 300);
    await mover(p, laFila(p, "Café Cauca 250 g"));

    // La tabla bajó hasta la fila nueva: se sube para que la primera se vea entera.
    await p.locator(`${TABLA} > div > div`).first().evaluate((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
    await espera(p, 600);
    const filaHuila = laFila(p, "Café Origen Huila 500 g");
    await decir("editar");
    await alDecir("Con el lápiz", 500);
    await mover(p, filaHuila.locator("[data-editar-producto]"));
    await alDecir("el asa de la izquierda", 400);
    await mover(p, filaHuila.locator("[data-asa-de-producto]"));
    await alDecir("la papelera", 400);
    await pulsar(p, filaHuila.locator("[data-eliminar-producto]"));
    const confirmar = p.getByRole("dialog").filter({ hasText: "Eliminar producto" });
    await confirmar.waitFor({ timeout: 10000 });
    await alDecir("después de confirmar", 300);
    await mover(p, confirmar.getByRole("button", { name: "Eliminar" }));
    // Se cancela: el vídeo no borra nada.
    await pulsar(p, confirmar.getByRole("button", { name: "Cancelar" }));

    await decir("cierre");
    await mover(p, filaHuila.locator("[data-asa-de-producto]"));
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
    writeFileSync(path.join(TMP, "narracion.json"), JSON.stringify(colocados, null, 2));
    escribirLaVozDelVideo("productos", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS, cortes });
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
    await abrirProductos(p);
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
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/productos`);
