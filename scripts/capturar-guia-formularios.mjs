/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Mis formularios,
 * sobre la App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-formularios.mjs`).
 *
 * La MISMA forma que la de Leads, Catálogo, Diagramas, Reuniones y Mis notas:
 * cada captura es una receta —abre esto, pulsa aquello, resalta este
 * elemento— y las marcas se dibujan encima de la pantalla real. Lo que no
 * depende de la pantalla —entrar, medir, marcar, guardar, las miniaturas, el
 * marco (el menú y la barra de arriba) y la narración
 * (`decir`/`alDecir`/`callar`)— viene del taller común de las guías
 * (`taller-de-la-guia.mjs`): por eso se leen como la misma guía. Aquí van
 * solo las recetas de Mis formularios, su editor, sus registros y el
 * formulario PÚBLICO, que es lo que ve el cliente.
 *
 * Los elementos se localizan por lo que la pantalla ya expone —los `title` y
 * `aria-label` de los botones, las marcas `data-*` de la lista, del editor y
 * de los registros—, nunca por coordenadas: si un botón se mueve, la flecha se
 * va con él.
 *
 * Las capturas CAMBIAN los datos (crean un formulario, le ponen preguntas,
 * WhatsApp y un enlace corto, mandan una respuesta, desactivan otro), así que
 * antes del vídeo se vuelve a sembrar: el vídeo sale del mismo punto de
 * partida que la primera captura. Nada de esto escribe en Google Sheets: el
 * formulario que recibe las respuestas de la guía no tiene hoja.
 *
 * Se lanza con `scripts/generar-guia-formularios.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-formularios.mjs";
import { guardarWav, mezclar, montarLaPista } from "./voz-de-la-guia.mjs";
import {
    DOMINIO_DE_LA_GUIA,
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
const SALIDA = path.join(RAIZ, "public", "guia", "formularios");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-formularios";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
/** Solo el vídeo: las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-formularios.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-formularios.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Dónde está cada cosa                                                */
/* ------------------------------------------------------------------ */

const LISTA = "[data-lista-de-formularios]";
const BARRA = "[data-barra-de-acciones]";
const CAMPOS = "[data-campos-del-formulario]";
const WHATSAPP = "[data-seccion-whatsapp]";
const URL_CORTA = "[data-seccion-url]";
const REGISTROS = "[data-lista-de-registros]";

/** La tarjeta de un formulario de la lista, por su slug. */
const laTarjeta = (p, slug) => p.locator(`[data-formulario="${slug}"]`).first();
/** Una cifra de la barra (que filtra la lista), por su nombre entero. */
const laPastilla = (p, nombre) => p.locator(`${BARRA} button[aria-label="${nombre}"]`).first();
/** El botón azul «Nuevo» de la barra: crea un formulario en la lista y un campo en el editor. */
const elBotonNuevo = (p) => p.locator(`${BARRA} [data-zona="crear"] button`).first();
/** El «⋯» de la barra (el editor y los registros). */
const losPuntos = (p) => p.locator(`${BARRA} [data-zona="acciones"] button[title="Acciones"]`).first();
/** El «⋯» de una tarjeta. */
const losPuntosDe = (p, slug) => laTarjeta(p, slug).locator('button[title="Más acciones"]');
/** El menú desplegable que se acaba de abrir (Radix lo pinta en un portal). */
const elMenu = (p) => p.locator('[role="menu"]').last();
/** La ventana que se acaba de abrir. */
const elDialogo = (p) => p.locator('[role="dialog"]').last();
/** Una opción de un menú abierto, por su texto. */
const laOpcion = (p, texto) => elMenu(p).getByRole("menuitem", { name: texto }).first();

/** El ratón, fuera de todo: un botón con el cursor encima sale resaltado. */
const apartar = (p) => p.mouse.move(p.viewportSize().width - 30, p.viewportSize().height - 30);

/** Un recuadro metido `px` por los lados: dos botones pegados no se montan uno encima del otro. */
const estrecho = (c, px) => ({ x: c.x + px, y: c.y, w: c.w - 2 * px, h: c.h });

/**
 * El recorte alrededor de una tarjeta: holgado a los lados y abajo, y CORTO
 * arriba. Con la misma holgura arriba se colaba media barra de trabajo
 * recortada, que no explica nada y se lee como un fallo de la foto.
 */
const alrededor = (c, vista, arriba = 12, resto = 30) => holgura({ x: c.x, y: c.y - arriba + resto, w: c.w, h: c.h + arriba - resto }, resto, vista);

/**
 * Suelta el foco que deja una ventana al abrirse (Radix enfoca su primer
 * botón, la equis): su anillo azul se lee como otra marca.
 */
const soltarElFoco = (p) => p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());

/**
 * Pone el cursor al FINAL de una caja de texto. Pulsar una variable del
 * mensaje de WhatsApp la añade al final y deja el foco en el botón: al volver
 * a la caja con `pressSequentially`, el cursor cae al principio y lo que se
 * escribe sale delante de todo.
 */
async function alFinal(p, caja) {
    await caja.click();
    await p.keyboard.press("Control+End");
}

/**
 * En el editor se lee la dirección de la página (`http://localhost:3940/f/…`):
 * en producción es la de la plataforma, y con HTTPS. El taller cambia el
 * dominio en el texto pintado (`conElDominioDeLaGuia`); esto cambia antes el
 * `http://` delante de él, que el taller no toca porque solo mira el host.
 * Solo el TEXTO: los enlaces siguen llevando a la App servida.
 */
async function conLaDireccionDeLaPlataforma(contexto) {
    const origen = new URL(BASE).origin;
    await contexto.addInitScript(
        ({ origen, dominio }) => {
            const arreglar = (nodo) => {
                const cambiar = (t) => {
                    if (t.data.includes(origen)) t.data = t.data.split(origen).join(dominio);
                };
                if (nodo.nodeType === Node.TEXT_NODE) return cambiar(nodo);
                if (nodo.nodeType !== Node.ELEMENT_NODE && nodo.nodeType !== Node.DOCUMENT_NODE) return;
                const recorrido = document.createTreeWalker(nodo, NodeFilter.SHOW_TEXT);
                for (let t = recorrido.nextNode(); t; t = recorrido.nextNode()) cambiar(t);
            };
            new MutationObserver((cambios) => {
                for (const c of cambios) {
                    if (c.type === "characterData") arreglar(c.target);
                    for (const n of c.addedNodes) arreglar(n);
                }
            }).observe(document, { childList: true, subtree: true, characterData: true });
        },
        { origen, dominio: `https://${DOMINIO_DE_LA_GUIA}` },
    );
    await conElDominioDeLaGuia(contexto, BASE);
}

/**
 * Al enviar un formulario con WhatsApp encendido la página se va a
 * `api.whatsapp.com`, que desde aquí no existe. Un 204 deja la página donde
 * está —la del «¡Registro enviado!», que es la que se enseña—.
 */
const sinSalirAWhatsapp = (contexto) =>
    contexto.route(/api\.whatsapp\.com|wa\.me/, (r) => r.fulfill({ status: 204, body: "" }));

/**
 * Cierra las VENTANAS que abren las miniaturas —crear, configuración, la
 * lista de un selector—, sin guardar nada. El taller solo cierra menús y
 * confirmaciones (`cerrarLoAbierto`); estas no lo son.
 */
async function cerrarLasVentanas(p) {
    for (let i = 0; i < 3; i += 1) {
        if (!(await p.$('[role="dialog"], [role="listbox"]'))) break;
        await p.keyboard.press("Escape");
        await espera(p, 350);
    }
}

async function lista(p) {
    await p.goto(`${BASE}/mis-formularios`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${LISTA} [data-formulario]`, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 1500);
    await despejar(p);
    // Los botones del borde (nota rápida, copiloto, equipo) son de TODAS las
    // pantallas: aquí tapan la esquina de las tarjetas y no explican nada de
    // Mis formularios.
    await esconderLosBotonesDelBorde(p);
    await apartar(p);
}

/** El editor de un formulario, entrando por su tarjeta, como lo abre un cliente. */
async function editor(p, slug) {
    await lista(p);
    await laTarjeta(p, slug).getByRole("link", { name: "Editar" }).click();
    await p.waitForSelector(CAMPOS, { timeout: 60000 });
    await espera(p, 1200);
    await apartar(p);
}

/** Los registros de un formulario, entrando por su tarjeta. */
async function registros(p, slug) {
    await lista(p);
    await laTarjeta(p, slug).getByRole("link", { name: "Registros" }).click();
    await p.waitForSelector(REGISTROS, { timeout: 60000 });
    await espera(p, 1200);
    await apartar(p);
}

/** Pulsa una cifra de la barra y espera a que la lista se ponga al día. */
async function filtrar(p, nombre) {
    await laPastilla(p, nombre).click();
    await p.waitForFunction((n) => document.querySelector(`button[aria-label="${n}"]`)?.getAttribute("aria-pressed") === "true", nombre, { timeout: 20000 });
    await espera(p, 1000);
    await apartar(p);
}

/** Abre el «⋯» de una tarjeta y devuelve su menú ya quieto. */
async function elMenuDe(p, slug) {
    await losPuntosDe(p, slug).click();
    const m = elMenu(p);
    await m.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    return m;
}

/** Un campo del formulario PÚBLICO, por su pregunta. */
const elCampoPublico = (p, pregunta) => p.locator("form label", { hasText: pregunta }).first().locator("xpath=..");

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

/**
 * Una miniatura por sección, con la receta de todas las guías
 * (`tomarLasMiniaturas` del taller): aquí solo se dice qué zona explica cada
 * sección. Van en el orden que menos navega; el banco las compara sin orden.
 */
async function miniaturas(p) {
    await lista(p);
    await tomarLasMiniaturas(
        p,
        [
            ["vista-general", async () => unir(await caja(p, BARRA), await caja(p, LISTA))],
            [
                "crear",
                async () => {
                    await elBotonNuevo(p).click();
                    const d = elDialogo(p);
                    await d.waitFor({ state: "visible", timeout: 10000 });
                    await p.locator("#form-title").fill("Solicitud de evento");
                    await espera(p, 500);
                    await apartar(p);
                    return caja(p, d);
                },
            ],
            ["compartir", async () => unir(await caja(p, laTarjeta(p, "inscripcion-de-clientes")), await caja(p, await elMenuDe(p, "inscripcion-de-clientes")))],
            // La de activar va sobre la que está APAGADA: su menú ofrece «Activar», y
            // no sale igual que la de compartir (una tarjeta activa con su menú).
            ["activar-y-eliminar", async () => unir(await caja(p, laTarjeta(p, "reserva-de-mesa")), await caja(p, await elMenuDe(p, "reserva-de-mesa")))],
            [
                "editor",
                async () => {
                    // El editor ENTERO —barra, campos, WhatsApp y enlace—, sobre
                    // la encuesta, que es corta; la de campos va sobre la
                    // inscripción, que tiene de todo: no salen iguales.
                    await editor(p, "encuesta-de-satisfaccion");
                    return unir(await caja(p, BARRA), await caja(p, URL_CORTA));
                },
            ],
            [
                "campos",
                async () => {
                    await editor(p, "inscripcion-de-clientes");
                    return caja(p, CAMPOS);
                },
            ],
            [
                "whatsapp",
                async () => {
                    await p.locator(WHATSAPP).scrollIntoViewIfNeeded();
                    await espera(p, 500);
                    return caja(p, WHATSAPP);
                },
            ],
            [
                "url",
                async () => {
                    await p.locator(URL_CORTA).scrollIntoViewIfNeeded();
                    await espera(p, 500);
                    return caja(p, URL_CORTA);
                },
            ],
            [
                "google-sheets",
                async () => {
                    await editor(p, "solicitud-de-cotizacion");
                    await losPuntos(p).click();
                    await laOpcion(p, "Configuración").click();
                    const d = elDialogo(p);
                    await d.waitFor({ state: "visible", timeout: 10000 });
                    await espera(p, 600);
                    await apartar(p);
                    await soltarElFoco(p);
                    return unir(await caja(p, d.locator('input[placeholder^="https://docs.google.com"]')), await caja(p, d.locator("[data-ayuda-de-la-hoja]")));
                },
            ],
            [
                "registros",
                async () => {
                    await registros(p, "solicitud-de-cotizacion");
                    return unir(await caja(p, BARRA), await caja(p, p.locator(`${REGISTROS} [data-registro]`).nth(3)));
                },
            ],
        ],
        { salida: SALIDA, tomadas, focos: FOCOS, despues: () => cerrarLasVentanas(p) },
    );
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p, navegador) {
    const vista = p.viewportSize();

    /* 1. La pantalla de un vistazo ----------------------------------- */
    await lista(p);
    // Portada del vídeo: la lista entera.
    await guardar(p, "portada.webp");

    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cBarra = await caja(p, BARRA);
    const cLista = await caja(p, LISTA);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: cBarra, n: 3 },
        { c: cLista, n: 4 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // La barra de trabajo, en una ventana de PORTÁTIL: a 1440 es una tira
    // tan larga que en la guía sus botones se leerían diminutos. Las tres
    // cifras van pegadas: un recuadro para las tres y un número debajo de
    // cada una.
    await p.setViewportSize({ width: 1024, height: 700 });
    await espera(p, 1200);
    const cifras = [];
    for (const nombre of ["Todos los formularios", "Activos", "Inactivos"]) cifras.push(await caja(p, laPastilla(p, nombre)));
    await marcar(p, [
        { c: await caja(p, `${BARRA} [data-zona="buscador"] input`), n: 1 },
        { c: unir(...cifras) },
        ...cifras.map((c, i) => ({ c, n: i + 2, sinRecuadro: true, esquina: "centro", borde: "abajo" })),
        { c: await caja(p, elBotonNuevo(p)), n: 5 },
    ]);
    // Abajo, lo justo para los números: más abajo empiezan las tarjetas, que
    // a este ancho salen con el título cortado.
    const cBarraChica = await caja(p, BARRA);
    const recorteBarra = holgura(cBarraChica, 20, p.viewportSize());
    recorteBarra.h = cBarraChica.y + cBarraChica.h + 18 - recorteBarra.y;
    await guardar(p, "barra.webp", recorteBarra);
    await desmarcar(p);
    await p.setViewportSize(vista);
    await espera(p, 1200);

    // La tarjeta, con sus seis partes. La insignia y el «⋯» van pegados: el
    // «⋯» lleva solo su número.
    const tarjeta = laTarjeta(p, "inscripcion-de-clientes");
    const cTarjeta = await caja(p, tarjeta);
    await marcar(p, [
        { c: unir(await caja(p, tarjeta.locator("h3")), await caja(p, tarjeta.locator("p.font-mono"))), n: 1 },
        { c: await caja(p, tarjeta.getByText("Activo", { exact: true })), n: 2 },
        { c: await caja(p, losPuntosDe(p, "inscripcion-de-clientes")), n: 3, sinRecuadro: true, esquina: "derecha", borde: "abajo" },
        { c: await caja(p, tarjeta.locator("span", { hasText: "campos" }).locator("xpath=..")), n: 4 },
        { c: estrecho(await caja(p, tarjeta.getByRole("link", { name: "Editar" })), 3), n: 5 },
        { c: estrecho(await caja(p, tarjeta.getByRole("link", { name: "Registros" })), 3), n: 6 },
    ]);
    await guardar(p, "tarjeta.webp", alrededor(cTarjeta, vista));
    await desmarcar(p);

    /* 2. Crear un formulario ----------------------------------------- */
    await marcar(p, [{ c: await caja(p, elBotonNuevo(p)), texto: "Nuevo", lado: "izquierda" }], { atenuar: true });
    await guardar(p, "crear-boton.webp", holgura({ ...cBarra, h: cBarra.h + 100 }, 16, vista));
    await desmarcar(p);

    await elBotonNuevo(p).click();
    const dCrear = elDialogo(p);
    await dCrear.waitFor({ state: "visible", timeout: 10000 });
    await p.locator("#form-title").pressSequentially("Solicitud de evento", { delay: 25 });
    await p.locator("#form-desc").fill("Cuéntanos tu evento y te enviamos la propuesta por WhatsApp.");
    await espera(p, 500);
    await apartar(p);
    // Los números a la DERECHA de cada campo: a la izquierda, encima, va su
    // nombre, y un número en esa esquina se lo come.
    await marcar(p, [
        { c: await caja(p, "#form-title"), n: 1, esquina: "derecha" },
        { c: await caja(p, "#form-slug"), n: 2, esquina: "derecha" },
        { c: await caja(p, "#form-desc"), n: 3, esquina: "derecha" },
        { c: await caja(p, "#form-sheets"), n: 4, esquina: "derecha" },
    ]);
    await guardar(p, "crear-dialogo.webp", holgura(await caja(p, dCrear), 24, vista));
    await desmarcar(p);

    await dCrear.getByRole("button", { name: "Crear formulario" }).click();
    await laTarjeta(p, "solicitud-de-evento").waitFor({ state: "visible", timeout: 20000 });
    await quitarAvisos(p);
    await apartar(p);
    const nueva = laTarjeta(p, "solicitud-de-evento");
    const cNueva = await caja(p, nueva);
    await marcar(p, [{ c: cNueva }, { c: estrecho(await caja(p, nueva.getByRole("link", { name: "Editar" })), 3) }], { atenuar: true });
    await guardar(p, "crear-creado.webp", holgura({ x: cLista.x, y: cBarra.y, w: cLista.w, h: cNueva.y + cNueva.h - cBarra.y + 6 }, 16, vista));
    await desmarcar(p);

    /* 3. El editor ---------------------------------------------------- */
    // Sobre la encuesta, que es corta: se ve el editor entero sin bajar.
    await editor(p, "encuesta-de-satisfaccion");
    const cNuevoE = await caja(p, elBotonNuevo(p));
    const cPuntosE = await caja(p, losPuntos(p));
    await marcar(p, [
        { c: await caja(p, p.locator(`${BARRA} a`, { hasText: "Volver" })), n: 1 },
        { c: unir(await caja(p, "#toolbar-active"), await caja(p, 'label[for="toolbar-active"]')), n: 2, esquina: "derecha" },
        { c: dentro(cNuevoE, 2), n: 3 },
        { c: dentro(cPuntosE, 2), n: 4, esquina: "derecha" },
        { c: await caja(p, CAMPOS), n: 5 },
        { c: await caja(p, WHATSAPP), n: 6 },
        { c: await caja(p, URL_CORTA), n: 7 },
    ]);
    await guardar(p, "editor.webp");
    await desmarcar(p);

    await losPuntos(p).click();
    const mEditor = elMenu(p);
    await mEditor.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, mEditor) }], { atenuar: true });
    await guardar(p, "editor-menu.webp", holgura(unir(cPuntosE, await caja(p, mEditor), { ...cNuevoE, x: cNuevoE.x - 240 }), 24, vista));
    await desmarcar(p);

    await laOpcion(p, "Configuración").click();
    const dConfig = elDialogo(p);
    await dConfig.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await apartar(p);
    await soltarElFoco(p);
    await marcar(p, [{ c: await caja(p, dConfig.getByRole("button", { name: "Guardar" })) }]);
    await guardar(p, "configuracion.webp", holgura(await caja(p, dConfig), 24, vista));
    await desmarcar(p);
    await dConfig.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 500);

    /* 4. Las preguntas ----------------------------------------------- */
    // La lista, sobre el formulario de inscripción, que tiene de todo.
    await editor(p, "inscripcion-de-clientes");
    const primera = p.locator('[data-campo="1"]');
    const cPrimera = await caja(p, primera);
    const cSegunda = await caja(p, p.locator('[data-campo="2"]'));
    const cAsa = await caja(p, primera.locator('[title="Arrastra para ordenar"]'));
    const cRequerido = await caja(p, primera.getByText("Requerido", { exact: true }));
    const cEditar = await caja(p, primera.locator('button[title="Editar campo"]'));
    const cEliminar = await caja(p, primera.locator('button[title="Eliminar campo"]'));
    // Los cuatro números en el hueco entre la primera fila y la segunda, bajo
    // lo que señalan: pegados a piezas tan pequeñas, en cualquier esquina se
    // comen la letra de al lado.
    const hueco = (c) => ({ x: c.x + c.w / 2, y: (cPrimera.y + cPrimera.h + cSegunda.y) / 2 });
    await marcar(p, [
        { c: cAsa, n: 1, numeroEn: hueco(cAsa) },
        { c: cRequerido, n: 2, numeroEn: hueco(cRequerido) },
        { c: unir(cEditar, cEliminar) },
        { c: cEditar, n: 3, sinRecuadro: true, numeroEn: hueco(cEditar) },
        { c: cEliminar, n: 4, sinRecuadro: true, numeroEn: hueco(cEliminar) },
    ]);
    await guardar(p, "campos-lista.webp", holgura(await caja(p, CAMPOS), 16, vista));
    await desmarcar(p);

    // Las preguntas nuevas, sobre el formulario recién creado.
    await editor(p, "solicitud-de-evento");
    await elBotonNuevo(p).click();
    let dCampo = elDialogo(p);
    await dCampo.waitFor({ state: "visible", timeout: 10000 });
    const pregunta = () => dCampo.locator('input[placeholder="ej. ¿Cuál es tu nombre?"]');
    const tipo = () => dCampo.locator('button[role="combobox"]');
    await pregunta().fill("Nombre completo");
    await dCampo.locator("#field-required").click();
    await dCampo.locator('input[placeholder="Texto de ayuda dentro del campo..."]').fill("Escribe tu nombre y apellido");
    await espera(p, 500);
    await apartar(p);
    // Cada número en la esquina donde NO está su nombre: la pregunta, el tipo y
    // la ayuda lo llevan encima a la izquierda; «Obligatorio», a la derecha.
    await marcar(p, [
        { c: await caja(p, pregunta()), n: 1, esquina: "derecha" },
        { c: await caja(p, tipo()), n: 2, esquina: "derecha" },
        { c: await caja(p, dCampo.locator("#field-required").locator("xpath=..")), n: 3 },
        { c: await caja(p, dCampo.locator('input[placeholder="Texto de ayuda dentro del campo..."]')), n: 4, esquina: "derecha" },
    ]);
    await guardar(p, "campo-nuevo.webp", holgura(await caja(p, dCampo), 24, vista));
    await desmarcar(p);
    await dCampo.getByRole("button", { name: "Agregar" }).click();
    await p.locator('[data-campo="1"]').waitFor({ state: "visible", timeout: 20000 });
    await quitarAvisos(p);

    await elBotonNuevo(p).click();
    dCampo = elDialogo(p);
    await dCampo.waitFor({ state: "visible", timeout: 10000 });
    await pregunta().fill("Tipo de evento");
    // Una ventana más alta para esta foto: a 900 la lista de tipos no cabe,
    // se abre hacia arriba tapando la ventana y deja los últimos detrás de una
    // flecha. Con sitio sale entera, debajo de su campo.
    await p.setViewportSize({ width: vista.width, height: 1320 });
    await espera(p, 800);
    await tipo().click();
    const tipos = p.locator('[role="listbox"]');
    await tipos.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, tipos) }]);
    await guardar(p, "campo-tipos.webp", holgura(unir(await caja(p, dCampo), await caja(p, tipos)), 20, p.viewportSize()));
    await desmarcar(p);

    await tipos.getByRole("option", { name: "Selección simple" }).click();
    await p.setViewportSize(vista);
    await espera(p, 800);
    const opciones = dCampo.locator("textarea");
    await opciones.fill("Cumpleaños\nBoda\nEvento empresarial");
    await espera(p, 400);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, tipo()) }, { c: await caja(p, opciones), texto: "Una por línea", lado: "abajo" }]);
    await guardar(p, "campo-opciones.webp", holgura({ ...(await caja(p, dCampo)), h: (await caja(p, dCampo)).h + 70 }, 20, vista));
    await desmarcar(p);
    await dCampo.getByRole("button", { name: "Agregar" }).click();
    await p.locator('[data-campo="2"]').waitFor({ state: "visible", timeout: 20000 });
    await quitarAvisos(p);

    /* 5. WhatsApp ------------------------------------------------------ */
    const wp = p.locator(WHATSAPP);
    await wp.scrollIntoViewIfNeeded();
    await wp.locator("#wp-enabled").click();
    await espera(p, 600);
    await wp.scrollIntoViewIfNeeded();
    await apartar(p);
    await marcar(p, [{ c: unir(await caja(p, wp.locator('label[for="wp-enabled"]')), await caja(p, wp.locator("#wp-enabled"))) }]);
    await guardar(p, "whatsapp-activar.webp", holgura(await caja(p, wp), 16, vista));
    await desmarcar(p);

    const numero = wp.locator('input[placeholder="ej. 573001234567"]');
    const mensaje = wp.locator("textarea");
    const variable = (pregunta) => wp.locator("button", { hasText: `{{${pregunta}}}` });
    await numero.fill("573001234567");
    await mensaje.fill("Hola, soy ");
    await variable("Nombre completo").click();
    await alFinal(p, mensaje);
    await p.keyboard.type(" y quiero cotizar un evento: ", { delay: 10 });
    await variable("Tipo de evento").click();
    await espera(p, 500);
    await wp.scrollIntoViewIfNeeded();
    await apartar(p);
    await marcar(p, [
        { c: await caja(p, numero), n: 1, esquina: "derecha" },
        { c: await caja(p, mensaje), n: 2, esquina: "derecha" },
        { c: await caja(p, variable("Nombre completo").locator("xpath=..")), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "whatsapp-mensaje.webp", holgura(await caja(p, wp), 16, vista));
    await desmarcar(p);

    const guardarWp = wp.getByRole("button", { name: "Guardar WhatsApp" });
    await marcar(p, [
        { c: await caja(p, wp.getByText("Vista previa del enlace:").locator("xpath=..")) },
        { c: await caja(p, guardarWp), texto: "Guardar WhatsApp", lado: "izquierda" },
    ]);
    await guardar(p, "whatsapp-guardar.webp", holgura(await caja(p, wp), 16, vista));
    await desmarcar(p);
    await guardarWp.click();
    await wp.getByRole("button", { name: "Guardado" }).waitFor({ state: "visible", timeout: 20000 });
    await quitarAvisos(p);

    /* 6. El enlace corto ---------------------------------------------- */
    const url = p.locator(URL_CORTA);
    await url.scrollIntoViewIfNeeded();
    const nombreCorto = url.locator('input[placeholder="nombre-formulario"]');
    await nombreCorto.pressSequentially("eventos", { delay: 40 });
    await espera(p, 400);
    // Al centro: al guardar la tarjeta crece por abajo (sale el enlace en
    // azul), y pegada al borde de la ventana ese enlace quedaría cortado.
    await url.evaluate((e) => e.scrollIntoView({ block: "center" }));
    await soltarElFoco(p);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, nombreCorto.locator("xpath=..")) }]);
    await guardar(p, "url-escribir.webp", holgura({ ...(await caja(p, url)), h: (await caja(p, url)).h + 16 }, 16, vista));
    await desmarcar(p);

    await url.getByRole("button", { name: "Guardar" }).click();
    const enlaceAzul = url.locator('a[title="Abrir el formulario"]').locator("xpath=..");
    await enlaceAzul.waitFor({ state: "visible", timeout: 20000 });
    await quitarAvisos(p);
    await url.evaluate((e) => e.scrollIntoView({ block: "center" }));
    await soltarElFoco(p);
    await apartar(p);
    await marcar(p, [
        { c: await caja(p, enlaceAzul) },
        { c: await caja(p, url.locator('a[title="Abrir el formulario"]')), texto: "Lo abre", lado: "izquierda", sinRecuadro: true },
    ]);
    await guardar(p, "url-guardada.webp", holgura({ ...(await caja(p, url)), h: (await caja(p, url)).h + 16 }, 16, vista));
    await desmarcar(p);

    await lista(p);
    const conNombre = laTarjeta(p, "solicitud-de-evento");
    await marcar(p, [{ c: await caja(p, conNombre) }, { c: await caja(p, conNombre.locator("p.font-mono")) }], { atenuar: true });
    await guardar(p, "url-tarjeta.webp", alrededor(await caja(p, conNombre), vista));
    await desmarcar(p);

    /* 7. Compartir y lo que ve el cliente ----------------------------- */
    const mCompartir = await elMenuDe(p, "inscripcion-de-clientes");
    await marcar(p, [{ c: await caja(p, mCompartir), soloLuz: true }, { c: await caja(p, laOpcion(p, "Copiar enlace")) }], { atenuar: true });
    await guardar(p, "compartir-copiar.webp", alrededor(unir(await caja(p, laTarjeta(p, "inscripcion-de-clientes")), await caja(p, mCompartir)), vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    await elFormularioPublico(navegador);

    /* 8. Google Sheets (el de cotizaciones, que tiene hoja) ------------ */
    await editor(p, "solicitud-de-cotizacion");
    await losPuntos(p).click();
    await laOpcion(p, "Configuración").click();
    const dHoja = elDialogo(p);
    await dHoja.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await soltarElFoco(p);
    await apartar(p);
    const cHoja = await caja(p, dHoja.locator('input[placeholder^="https://docs.google.com"]'));
    await marcar(p, [{ c: dentro(cHoja, 2) }], { atenuar: true });
    await guardar(p, "sheets-url.webp", holgura(await caja(p, dHoja), 24, vista));
    await desmarcar(p);
    await marcar(p, [{ c: holgura(await caja(p, dHoja.locator("[data-ayuda-de-la-hoja]")), 6, vista) }], { atenuar: true });
    await guardar(p, "sheets-compartir.webp", holgura(await caja(p, dHoja), 24, vista));
    await desmarcar(p);
    await dHoja.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 400);

    /* 9. Los registros ------------------------------------------------ */
    await registros(p, "solicitud-de-cotizacion");
    const filas = p.locator(`${REGISTROS} [data-registro]`);
    const cBarraR = await caja(p, BARRA);
    const cuatroFilas = unir(cBarraR, await caja(p, filas.nth(3)));

    await filtrar(p, "Sincronizados");
    await marcar(p, [{ c: await caja(p, laPastilla(p, "Sincronizados")) }, { c: await caja(p, filas.first().getByText("Sincronizado", { exact: true })) }]);
    await guardar(p, "sheets-sincronizado.webp", holgura(unir(cBarraR, await caja(p, filas.nth(2))), 16, vista));
    await desmarcar(p);

    await filtrar(p, "Todos los registros");
    const cifrasR = [];
    for (const nombre of ["Todos los registros", "Sincronizados", "Pendientes", "Con error"]) cifrasR.push(await caja(p, laPastilla(p, nombre)));
    await marcar(p, [
        { c: await caja(p, p.locator(`${BARRA} a`, { hasText: "Volver" })), n: 1 },
        { c: unir(...cifrasR) },
        ...cifrasR.map((c, i) => ({ c, n: i + 2, sinRecuadro: true, esquina: "centro", borde: "abajo" })),
        { c: dentro(await caja(p, `${BARRA} button[title="Actualizar"]`), 2), n: 6 },
        { c: dentro(await caja(p, losPuntos(p)), 2), n: 7, esquina: "derecha" },
    ]);
    await guardar(p, "registros.webp", holgura(cuatroFilas, 16, vista));
    await desmarcar(p);

    // Una fila sincronizada, con sus cinco partes.
    const fila = p.locator(`${REGISTROS} [data-registro]`, { has: p.getByText("Sincronizado", { exact: true }) }).first();
    const cFila = await caja(p, fila);
    const cVer = await caja(p, fila.locator('button[title="Ver detalle"]'));
    const cBorrar = await caja(p, fila.locator('button[title="Eliminar registro"]'));
    const cIcono = await caja(p, fila.locator("div.h-10.w-10").first());
    const cTexto = await caja(p, fila.locator("div.flex-1.min-w-0").first());
    const cEstado = await caja(p, fila.locator("span.shrink-0").first());
    // Los números van en el borde de arriba de la fila, encima de lo que
    // señalan: dentro taparían el nombre y el estado.
    const arriba = (c) => ({ x: c.x + c.w / 2, y: cFila.y });
    await marcar(p, [
        { c: cIcono, n: 1 },
        { c: cTexto, n: 2, numeroEn: arriba(cTexto) },
        { c: cEstado, n: 3, numeroEn: arriba(cEstado) },
        { c: unir(cVer, cBorrar) },
        { c: cVer, n: 4, sinRecuadro: true, numeroEn: arriba(cVer) },
        { c: cBorrar, n: 5, sinRecuadro: true, numeroEn: arriba(cBorrar) },
    ], { atenuar: true });
    await guardar(p, "registro-fila.webp", holgura({ ...cFila, y: cFila.y - 24, h: cFila.h + 36 }, 16, vista));
    await desmarcar(p);

    await fila.locator('button[title="Ver detalle"]').click();
    const dDetalle = elDialogo(p);
    await dDetalle.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await soltarElFoco(p);
    await apartar(p);
    await guardar(p, "registro-detalle.webp", holgura(await caja(p, dDetalle), 20, vista));
    await p.keyboard.press("Escape");
    await espera(p, 500);

    await filtrar(p, "Con error");
    const conError = filas.first();
    await marcar(p, [
        { c: await caja(p, laPastilla(p, "Con error")) },
        { c: await caja(p, conError.locator('button[title="Reintentar en Google Sheets"]')), texto: "Reintentar en Google Sheets", lado: "abajo" },
    ]);
    const cConError = await caja(p, conError);
    await guardar(p, "registros-error.webp", holgura(unir(cBarraR, { ...cConError, h: cConError.h + 80 }), 16, vista));
    await desmarcar(p);

    await filtrar(p, "Todos los registros");
    await losPuntos(p).click();
    const mRegistros = elMenu(p);
    await mRegistros.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, mRegistros), soloLuz: true }, { c: await caja(p, laOpcion(p, "Exportar CSV")) }], { atenuar: true });
    // Arriba, justo desde la barra de Registros: más arriba está la barra de
    // la plataforma, que aquí no dice nada.
    const recorteExportar = holgura(unir(await caja(p, losPuntos(p)), await caja(p, mRegistros), { x: cBarraR.x + cBarraR.w - 620, y: cBarraR.y, w: 1, h: 1 }), 24, vista);
    const arribaDeLaBarra = cBarraR.y - 8;
    recorteExportar.h -= arribaDeLaBarra - recorteExportar.y;
    recorteExportar.y = arribaDeLaBarra;
    await guardar(p, "registros-exportar.webp", recorteExportar);
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    /* 10. Activar, desactivar y eliminar ------------------------------ */
    await lista(p);
    const mDesactivar = await elMenuDe(p, "encuesta-de-satisfaccion");
    await marcar(p, [{ c: await caja(p, mDesactivar), soloLuz: true }, { c: await caja(p, laOpcion(p, "Desactivar")) }], { atenuar: true });
    await guardar(p, "desactivar.webp", alrededor(unir(await caja(p, laTarjeta(p, "encuesta-de-satisfaccion")), await caja(p, mDesactivar)), vista));
    await desmarcar(p);
    await laOpcion(p, "Desactivar").click();
    await p.waitForFunction(() => document.querySelector('[data-formulario="encuesta-de-satisfaccion"]')?.textContent.includes("Inactivo"), null, { timeout: 20000 });
    await quitarAvisos(p);

    await filtrar(p, "Inactivos");
    const apagada = laTarjeta(p, "encuesta-de-satisfaccion");
    await marcar(p, [{ c: await caja(p, laPastilla(p, "Inactivos")) }, { c: await caja(p, apagada.getByText("Inactivo", { exact: true })) }]);
    await guardar(p, "inactivo.webp", holgura(unir(await caja(p, BARRA), await caja(p, LISTA)), 16, vista));
    await desmarcar(p);

    await filtrar(p, "Todos los formularios");
    await elMenuDe(p, "solicitud-de-evento");
    await laOpcion(p, "Eliminar").click();
    const alerta = p.locator('[role="alertdialog"]');
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, alerta.getByRole("button", { name: "Cancelar" })), texto: "Cancelar no cambia nada", lado: "abajo" }]);
    const cAlerta = await caja(p, alerta);
    await guardar(p, "eliminar.webp", holgura({ x: cAlerta.x - 24, y: cAlerta.y - 14, w: cAlerta.w + 48, h: cAlerta.h + 14 + 64 }, 0, vista));
    await desmarcar(p);
    await alerta.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 500);

    /* El marco: el menú y la barra de arriba ------------------------- */
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Apps Externas", texto: "Mis formularios está en Apps Externas" });
}

/**
 * El formulario PÚBLICO, como lo abre un cliente: sin sesión, en su propio
 * navegador. La ventana se estira hasta el alto del formulario para que salga
 * entero en una foto.
 */
async function elFormularioPublico(navegador) {
    const ctx = await navegador.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2, locale: "es-CO", timezoneId: "America/Bogota" });
    await sinSalirAWhatsapp(ctx);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/f/inscripcion`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("form button[type=submit]", { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 1200);
    const alto = await p.evaluate(() => Math.ceil(document.querySelector("main").getBoundingClientRect().height));
    await p.setViewportSize({ width: 900, height: alto });
    await espera(p, 800);
    await guardar(p, "publico.webp");

    const enviar = p.locator("form button[type=submit]");
    await enviar.click();
    await p.getByText("Este campo es requerido").first().waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await p.mouse.move(5, 5);
    const nombre = elCampoPublico(p, "Nombre completo");
    await marcar(p, [{ c: await caja(p, nombre), texto: "Se marca en rojo", lado: "derecha" }]);
    const cNombre = await caja(p, nombre);
    const cTelefono = await caja(p, elCampoPublico(p, "Teléfono"));
    await guardar(p, "publico-obligatorio.webp", holgura({ x: 0, y: cNombre.y - 150, w: 900, h: cTelefono.y + cTelefono.h - cNombre.y + 190 }, 0, p.viewportSize()));
    await desmarcar(p);

    await nombre.locator("input").fill("Laura Martínez");
    await elCampoPublico(p, "Teléfono").locator("input").fill("573015550123");
    await elCampoPublico(p, "Servicio de interés").locator("select").selectOption({ label: "Instalación" });
    await p.getByLabel("Recomendación").check();
    await p.locator("form input[type=checkbox]").last().check();
    await enviar.click();
    await p.getByText("¡Registro enviado!").waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 2200);
    const cMarca = await caja(p, "main > div");
    const cExito = await caja(p, p.getByText("¡Registro enviado!").locator("xpath=.."));
    await guardar(p, "publico-enviado.webp", holgura({ x: 150, y: cMarca.y, w: 600, h: cExito.y + cExito.h - cMarca.y }, 40, p.viewportSize()));
    await ctx.close();
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cuánto se respira entre una frase y la siguiente: lo justo para que no se
 * monten, y no más —el ritmo lo pone la voz, no el guion—. Es el mismo de las
 * demás guías. Queda escrito en `voz-de-la-guia/formularios.json` con el vídeo.
 */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

/**
 * El vídeo: qué se hace en pantalla mientras suena cada frase de
 * `narracion-guia-formularios.mjs`. La voz se coloca con `empezarLaNarracion`
 * del taller y se graba con la grabadora de todas las guías. Crea un
 * formulario de verdad, le pone una pregunta, WhatsApp y un enlace corto, lo
 * llena como cliente y lo desactiva: nada que no se pueda deshacer.
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
    await conLaDireccionDeLaPlataforma(ctx);
    await sinSalirAWhatsapp(ctx);
    const p = await ctx.newPage();
    // No `recordVideo`: estiraba el vídeo cada vez que el navegador pintaba
    // deprisa y la imagen se iba quedando detrás de la voz (ver la grabadora).
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await lista(p);
    await p.mouse.move(640, 400, { steps: 8 });
    // Lo grabado hasta aquí es la página cargando: el vídeo empieza justo
    // antes de la primera palabra.
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("formularios que tus clientes", 500);
    await mover(p, laTarjeta(p, "inscripcion-de-clientes").locator("h3"));
    await alDecir("todas sus respuestas", 400);
    await mover(p, laTarjeta(p, "inscripcion-de-clientes").getByRole("link", { name: "Registros" }));

    // El menú de la izquierda: se abre con las dos flechas, se señala dónde
    // está Mis formularios y se vuelve a recoger al empezar la frase
    // siguiente, que es la de la barra donde viven las flechas.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const appsExternas = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Apps Externas" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Apps Externas", 600);
    await mover(p, appsExternas);

    const [, , , buscarTodo, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // La lista: una tarjeta por formulario, y las cifras que la filtran.
    await decir("lista");
    await alDecir("es una tarjeta", 400);
    await mover(p, laTarjeta(p, "solicitud-de-cotizacion"));
    await alDecir("los activos", 400);
    await pulsar(p, laPastilla(p, "Activos"));
    await alDecir("los inactivos", 400);
    await pulsar(p, laPastilla(p, "Inactivos"));

    // Crear: el título, y el enlace que se escribe solo.
    await decir("crear");
    await pulsar(p, laPastilla(p, "Todos los formularios"));
    await alDecir("el botón Nuevo", 500);
    await pulsar(p, elBotonNuevo(p));
    await elDialogo(p).waitFor({ state: "visible", timeout: 10000 });
    await alDecir("un título", 400);
    await pulsar(p, p.locator("#form-title"));
    await p.locator("#form-title").pressSequentially("Solicitud de evento", { delay: 40 });
    await alDecir("se escribe solo", 300);
    await mover(p, p.locator("#form-slug"));
    await alDecir("crear formulario", 500);
    await pulsar(p, elDialogo(p).getByRole("button", { name: "Crear formulario" }));
    await laTarjeta(p, "solicitud-de-evento").waitFor({ state: "visible", timeout: 20000 });

    // Las preguntas, en el editor del recién creado.
    await decir("campos");
    await pulsar(p, laTarjeta(p, "solicitud-de-evento").getByRole("link", { name: "Editar" }));
    await p.waitForSelector(CAMPOS, { timeout: 60000 });
    const editorUrl = p.url();
    await alDecir("agregas las preguntas", 400);
    await pulsar(p, elBotonNuevo(p));
    const dCampo = elDialogo(p);
    await dCampo.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("escribes la pregunta", 400);
    const pregunta = dCampo.locator('input[placeholder="ej. ¿Cuál es tu nombre?"]');
    await pulsar(p, pregunta);
    await pregunta.pressSequentially("Nombre completo", { delay: 40 });
    await alDecir("el tipo de campo", 400);
    await pulsar(p, dCampo.locator('button[role="combobox"]'));
    await espera(p, 700);
    await p.keyboard.press("Escape");
    await alDecir("si es obligatoria", 400);
    await pulsar(p, dCampo.locator("#field-required"));
    await pulsar(p, dCampo.getByRole("button", { name: "Agregar" }));
    await p.locator('[data-campo="1"]').waitFor({ state: "visible", timeout: 20000 });

    // WhatsApp: encenderlo, el número y el mensaje con su variable.
    const wp = p.locator(WHATSAPP);
    await decir("whatsapp");
    await wp.scrollIntoViewIfNeeded();
    await alDecir("la redirección a WhatsApp", 400);
    await pulsar(p, wp.locator("#wp-enabled"));
    const numero = wp.locator('input[placeholder="ej. 573001234567"]');
    await numero.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("pasa a tu chat", 400);
    await pulsar(p, numero);
    await numero.pressSequentially("573001234567", { delay: 30 });
    await alDecir("un mensaje ya escrito", 400);
    await pulsar(p, wp.locator("textarea"));
    await wp.locator("textarea").pressSequentially("Hola, soy ", { delay: 40 });
    await alDecir("con sus respuestas", 400);
    await pulsar(p, wp.locator("button", { hasText: "{{Nombre completo}}" }));
    await pulsar(p, wp.getByRole("button", { name: "Guardar WhatsApp" }));
    // Las acciones de una página van en fila: sin esperar a que el WhatsApp
    // quede guardado, el enlace corto se pediría detrás de su recarga.
    await wp.getByRole("button", { name: "Guardado" }).waitFor({ state: "visible", timeout: 20000 });

    // El enlace corto.
    const url = p.locator(URL_CORTA);
    const nombreCorto = url.locator('input[placeholder="nombre-formulario"]');
    await decir("url");
    // Al centro: abajo a la derecha sigue el aviso «WhatsApp guardado», y
    // pegado al borde el botón Guardar quedaba DEBAJO de él (el clic se lo
    // llevaba el aviso y el enlace no se guardaba).
    await url.evaluate((e) => e.scrollIntoView({ block: "center" }));
    await alDecir("la URL personalizada", 400);
    await pulsar(p, nombreCorto);
    await alDecir("un enlace corto", 300);
    await nombreCorto.pressSequentially("eventos", { delay: 50 });
    await alDecir("fácil de compartir", 400);
    const guardarUrl = url.getByRole("button", { name: "Guardar" });
    if ((await nombreCorto.inputValue()) !== "eventos") throw new Error(`el enlace corto quedó en «${await nombreCorto.inputValue()}»`);
    await pulsar(p, guardarUrl);
    try {
        await url.locator('a[title="Abrir el formulario"]').waitFor({ state: "visible", timeout: 20000 });
    } catch (e) {
        await p.screenshot({ path: path.join(TMP, "url-no-guardo.png") });
        const avisos = await p.locator("[data-sonner-toast]").allInnerTexts();
        throw new Error(`el enlace corto no se guardó (avisos: ${JSON.stringify(avisos)}): ${e.message}`);
    }

    // Lo que ve el cliente: el mismo formulario, abierto por su enlace.
    await decir("publico");
    await p.goto(`${BASE}/f/eventos`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("form button[type=submit]", { timeout: 60000 });
    await alDecir("lo llena", 400);
    const campoNombre = elCampoPublico(p, "Nombre completo").locator("input");
    await pulsar(p, campoNombre);
    await campoNombre.pressSequentially("Laura Martínez", { delay: 45 });
    await alDecir("enviar formulario", 500);
    await pulsar(p, p.locator("form button[type=submit]"));
    await p.getByText("¡Registro enviado!").waitFor({ state: "visible", timeout: 20000 });
    await alDecir("y listo", 300);
    await mover(p, p.getByText("¡Registro enviado!"));

    // La respuesta, en Registros.
    await decir("registros");
    await p.goto(`${editorUrl}/registros`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${REGISTROS} [data-registro]`, { timeout: 60000 });
    await esconderLosBotonesDelBorde(p);
    const fila = p.locator(`${REGISTROS} [data-registro]`).first();
    await alDecir("llega a Registros", 300);
    await mover(p, fila.locator("div.flex-1.min-w-0").first());
    await alDecir("su estado en Google Sheets", 400);
    await mover(p, fila.locator("div.h-10.w-10").first());
    await alDecir("ver detalle", 500);
    await pulsar(p, fila.locator('button[title="Ver detalle"]'));
    await elDialogo(p).waitFor({ state: "visible", timeout: 10000 });
    await alDecir("todo lo que contestó", 300);
    await mover(p, elDialogo(p).getByText("Laura Martínez"));

    // Desactivarlo desde su editor: se pausa sin perder nada.
    await decir("cierre");
    await p.keyboard.press("Escape");
    await p.goto(editorUrl, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(CAMPOS, { timeout: 60000 });
    await esconderLosBotonesDelBorde(p);
    await alDecir("lo desactivas", 400);
    await pulsar(p, p.locator("#toolbar-active"));
    await alDecir("Así se trabaja", 300);
    await mover(p, p.locator('label[for="toolbar-active"]'));
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
    escribirLaVozDelVideo("formularios", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
        acceptDownloads: true,
    });
    await conLaDireccionDeLaPlataforma(ctx);
    const p = await entrar(ctx, BASE);
    await lista(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p, navegador);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        // Las capturas cambiaron los datos: el vídeo sale del punto de partida.
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-formularios.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

// Las que la guía enseña tienen que estar TODAS. Con SOLO_MINIATURAS o
// SOLO_VIDEO, lo demás se conserva del disco: basta con que esté.
comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/formularios`);
