/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Cobros, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-cobros.mjs`).
 *
 * La MISMA receta que las demás guías y con las MISMAS piezas del taller
 * (`taller-de-la-guia.mjs`): cada captura es «abre esto, pulsa aquello, resalta
 * este elemento», y las marcas se localizan por lo que la pantalla ya expone
 * —los `data-filtro` de la barra, los `data-fila-de-cobro` y `data-zona` de la
 * cartera, los `data-campo` del formulario y de la configuración—, no por
 * coordenadas escritas a mano.
 *
 * Tres cosas que NO se hacen nunca, ni en las capturas ni en el vídeo:
 *   - **«Cobrar ahora» no se pulsa**: mandaría un WhatsApp. Se señala.
 *   - **Eliminar no se confirma**: la ventana se cierra con «Volver».
 *   - **La configuración no se guarda**: se cierra con «Cancelar».
 * Las capturas sí marcan un comprobante (y lo devuelven), confirman un pago y
 * crean una deuda, así que antes del vídeo se vuelve a sembrar.
 *
 * Sin bucket: `/api/upload` lo contesta la receta, como en Recordatorios.
 *
 * Qué captura hace falta lo dice `lib/guia-cobros.ts`: el script se niega a
 * terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-cobros.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-cobros.mjs";
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
const SALIDA = path.join(RAIZ, "public", "guia", "cobros");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-cobros";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
// Solo el vídeo (p. ej. al cambiar la narración): las imágenes se conservan del disco.
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-cobros.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-cobros.json");

/** La dirección con la que la receta contesta a `/api/upload` (aquí no hay bucket). */
const ARCHIVOS_DE_EJEMPLO = "https://archivos.ejemplo.co";

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/** Sin bucket: `/api/upload` lo contesta la receta, con el nombre del archivo. */
async function sinBucket(contexto) {
    await contexto.route("**/api/upload", async (ruta) => {
        const cuerpo = ruta.request().postDataBuffer()?.toString("latin1") ?? "";
        const nombre = /filename="([^"]+)"/.exec(cuerpo)?.[1] ?? "archivo";
        await ruta.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ url: `${ARCHIVOS_DE_EJEMPLO}/${encodeURIComponent(nombre)}` }),
        });
    });
    await contexto.route("**/api/upload/borrar", (ruta) =>
        ruta.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    );
}

/** Un PDF mínimo y válido, para adjuntarlo como cuenta de cobro. */
const UN_PDF = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const LA_CUENTA_DE_COBRO = { name: "cuenta-de-cobro-octubre.pdf", mimeType: "application/pdf", buffer: UN_PDF };

/* ------------------------------------------------------------------ */
/* Medir                                                               */
/* ------------------------------------------------------------------ */

const LA_CARTERA = '[data-zona="cartera"]';
const EL_BUSCADOR = 'input[placeholder="Buscar cliente…"]';
const elFiltro = (p, clave) => p.locator(`[data-filtro="${clave}"]`).first();
const EL_ACTUALIZAR = 'button[aria-label="Actualizar"]';
const LA_CONFIGURACION = 'button[aria-label="Configuración de cobros"]';
const EL_NUEVO = (p) => p.locator('[data-barra-de-acciones] [data-zona="crear"] button').first();
const EL_FORMULARIO = '[data-zona="formulario-de-cobro"]';
const LA_VENTANA_DE_AJUSTES = '[data-zona="configuracion"]';
const EL_HISTORIAL = '[data-zona="historial"]';
const enElFormulario = (p, campo) => p.locator(`${EL_FORMULARIO} [data-campo="${campo}"]`).first();
const enLosAjustes = (p, campo) => p.locator(`${LA_VENTANA_DE_AJUSTES} [data-campo="${campo}"]`).first();
const laConfirmacion = (p, que) => p.locator(`[data-confirmar="${que}"]`).first();

const laFila = (p, nombre) => p.locator(`${LA_CARTERA} [data-fila-de-cobro="${nombre}"]`).first();
const laCelda = (p, nombre, zona) => laFila(p, nombre).locator(`[data-zona="${zona}"]`).first();
const elMenuDe = (p, nombre) => p.locator(`button[aria-label="Acciones de ${nombre}"]`).first();
const elMenuAbierto = (p) => p.locator('[role="menu"]').last();
const laOpcion = (p, texto) => elMenuAbierto(p).getByRole("menuitem", { name: texto, exact: true }).first();

const COLUMNAS = ["cliente", "concepto", "monto", "vence", "estado", "ciclo"];
const FILTROS = ["todos", "comprobante", "vencida", "porVencer", "alDia"];

async function abrirLaPantalla(p) {
    await p.goto(`${BASE}/cobros`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${LA_CARTERA} [data-fila-de-cobro]`, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    // Los botones del borde tapan el «⋯» de cada fila.
    await esconderLosBotonesDelBorde(p);
    await queNadaSalgaRecortado(p);
}

/**
 * Un nombre que no cabe sale con «…» en la captura, y la guía enseñaría algo
 * que no se lee entero. Si algo no cabe, se acorta en la semilla.
 */
async function queNadaSalgaRecortado(p, dentro_ = "[data-caja-del-contenido]") {
    const recortados = await p.evaluate((sel) => {
        const fuera = [];
        for (const raiz of document.querySelectorAll(sel)) {
            for (const el of raiz.querySelectorAll(".truncate, .line-clamp-1, .line-clamp-2")) {
                if (!el.getClientRects().length) continue;
                if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) fuera.push(el.textContent || "");
            }
        }
        return fuera;
    }, dentro_);
    if (recortados.length) throw new Error(`[guia] sale recortado con «…»: ${recortados.join(" · ")}`);
}

const losFiltros = (p) => Promise.all(FILTROS.map((f) => caja(p, elFiltro(p, f))));

async function laBarra(p) {
    return unir(await caja(p, EL_BUSCADOR), ...(await losFiltros(p)), await caja(p, LA_CONFIGURACION), await caja(p, EL_NUEVO(p)));
}

const soltarElFoco = (p) => p.evaluate(() => document.activeElement?.blur?.());

/** La fila entera de una deuda (con su «⋯»). */
const laCajaDeLaFila = (p, nombre) => caja(p, laFila(p, nombre));

async function abrirElMenuDe(p, nombre) {
    await elMenuDe(p, nombre).click();
    await elMenuAbierto(p).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
}

async function cerrarElMenu(p) {
    await p.keyboard.press("Escape");
    await espera(p, 400);
}

async function abrirElFormulario(p) {
    await EL_NUEVO(p).click();
    await p.locator(EL_FORMULARIO).waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 700);
}

async function cerrarElFormulario(p) {
    await p.locator(EL_FORMULARIO).getByRole("button", { name: "Cancelar" }).click();
    await p.locator(EL_FORMULARIO).waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 400);
}

async function abrirLosAjustes(p) {
    await p.locator(LA_CONFIGURACION).click();
    await p.locator(LA_VENTANA_DE_AJUSTES).waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 700);
    await soltarElFoco(p);
}

async function cerrarLosAjustes(p) {
    await p.locator(LA_VENTANA_DE_AJUSTES).getByRole("button", { name: "Cancelar" }).click();
    await p.locator(LA_VENTANA_DE_AJUSTES).waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 400);
}

/** Lleva un elemento dentro de una ventana que desplaza a la vista, y lo mide. */
async function aLaVistaYMedir(p, locator) {
    await locator.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 300);
    return caja(p, locator);
}

/** Una fecha `yyyy-mm-dd` relativa a hoy, para el campo «Vence». */
function enDias(dias) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    const dos = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

async function llenarElFormulario(p) {
    await enElFormulario(p, "cliente").locator("input").fill("Diana Torres");
    await enElFormulario(p, "whatsapp").locator("input").fill("573004445566");
    await enElFormulario(p, "concepto").locator("input").fill("Plan de mantenimiento");
    await enElFormulario(p, "monto").locator("input").fill("95000");
    await enElFormulario(p, "vence").locator("input").fill(enDias(15));
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

async function miniaturas(p) {
    const focos = {};
    const mini = async (slug, zona, despues) => {
        Object.assign(focos, await tomarUnaMiniatura(p, slug, await zona(), { salida: SALIDA, tomadas }));
        await cerrarLoAbierto(p);
        if (despues) await despues();
    };

    await mini("vista-general", () => laBarra(p));
    await mini("cartera", async () =>
        unir(await caja(p, laCelda(p, "Marta Restrepo", "estado")), await caja(p, laCelda(p, "Valentina Ruiz", "estado")), await caja(p, laCelda(p, "Carlos Gómez", "estado"))),
    );
    await mini(
        "cobrar-ahora",
        async () => {
            await abrirElMenuDe(p, "Andrés Pérez");
            return caja(p, laOpcion(p, "Cobrar ahora"));
        },
        () => cerrarElMenu(p),
    );
    await mini("comprobante", () => caja(p, laCelda(p, "Marta Restrepo", "estado")));
    await mini(
        "confirmar-pago",
        async () => {
            await abrirElMenuDe(p, "Laura Méndez");
            await laOpcion(p, "Confirmar pago").click();
            await laConfirmacion(p, "confirmar").waitFor({ state: "visible", timeout: 10000 });
            await espera(p, 500);
            await soltarElFoco(p);
            return caja(p, laConfirmacion(p, "confirmar").getByRole("button", { name: "Sí, confirmar el pago" }));
        },
        async () => {
            // `cerrarLoAbierto` ya la pudo cerrar con Escape (que es «Volver»).
            const volver = laConfirmacion(p, "confirmar").getByRole("button", { name: "Volver" });
            if (await volver.isVisible()) await volver.click();
            await laConfirmacion(p, "confirmar").waitFor({ state: "hidden", timeout: 10000 });
            await espera(p, 300);
        },
    );
    await mini(
        "historial",
        async () => {
            await abrirElMenuDe(p, "Sara Castaño");
            await laOpcion(p, "Historial de ciclos").click();
            await p.locator(`${EL_HISTORIAL} [data-ciclo]`).first().waitFor({ state: "visible", timeout: 10000 });
            await espera(p, 500);
            await soltarElFoco(p);
            return unir(await caja(p, p.locator(`${EL_HISTORIAL} [data-ciclo]`).nth(0)), await caja(p, p.locator(`${EL_HISTORIAL} [data-ciclo]`).nth(1)));
        },
        async () => {
            await p.keyboard.press("Escape");
            await espera(p, 500);
        },
    );
    await mini(
        "crear",
        async () => {
            await abrirElFormulario(p);
            await soltarElFoco(p);
            return unir(await caja(p, enElFormulario(p, "cliente")), await caja(p, enElFormulario(p, "whatsapp")));
        },
        () => cerrarElFormulario(p),
    );
    await mini(
        "editar-y-eliminar",
        async () => {
            await abrirElMenuDe(p, "Julián Vargas");
            return unir(await caja(p, laOpcion(p, "Editar")), await caja(p, laOpcion(p, "Eliminar")));
        },
        () => cerrarElMenu(p),
    );
    await mini(
        "recordatorios",
        async () => {
            await abrirLosAjustes(p);
            return aLaVistaYMedir(p, p.locator(`${LA_VENTANA_DE_AJUSTES} [data-zona="cuando"]`));
        },
        () => cerrarLosAjustes(p),
    );
    await mini(
        "mensajes",
        async () => {
            await abrirLosAjustes(p);
            return aLaVistaYMedir(p, p.locator(`${LA_VENTANA_DE_AJUSTES} [data-mensaje="antes"]`));
        },
        () => cerrarLosAjustes(p),
    );

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
    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las cuatro zonas, en el orden de `ZONAS_DE_LA_PANTALLA`.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: barra, n: 3 },
        { c: holgura(await caja(p, LA_CARTERA), -8, vista), n: 4 },
    ]);
    await guardar(p, "vista-general.webp");
    await desmarcar(p);
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");

    // La barra de trabajo: sus cinco partes, en el orden de `PARTES_DE_LA_BARRA_DE_TRABAJO`.
    const cFiltros = unir(...(await losFiltros(p)));
    await marcar(p, [
        { c: await caja(p, EL_BUSCADOR), n: 1, lado: "abajo" },
        { c: cFiltros, n: 2, lado: "abajo" },
        { c: await caja(p, EL_ACTUALIZAR), n: 3, lado: "abajo" },
        { c: await caja(p, LA_CONFIGURACION), n: 4, lado: "abajo" },
        { c: await caja(p, EL_NUEVO(p)), n: 5, lado: "abajo" },
    ]);
    await guardar(p, "barra.webp", holgura(unir(barra, { ...barra, y: barra.y + 60, h: 1 }), 30, vista));
    await desmarcar(p);

    // Una deuda: sus seis columnas y su menú, en el orden de `COLUMNAS_DOCUMENTADAS`.
    // Las celdas van pegadas: un recuadro alrededor de la fila y cada número encima de su celda.
    const ejemplo = "Carlos Gómez";
    const cFila = await laCajaDeLaFila(p, ejemplo);
    const arriba = cFila.y - 20;
    const marcasDeLaFila = [{ c: cFila }];
    for (const [i, z] of [...COLUMNAS, "mandos"].entries()) {
        const c = await caja(p, laCelda(p, ejemplo, z));
        marcasDeLaFila.push({ c, n: i + 1, sinRecuadro: true, numeroEn: { x: c.x + Math.min(c.w / 2, 40), y: arriba } });
    }
    await marcar(p, marcasDeLaFila, { atenuar: true });
    await guardar(p, "fila.webp", holgura({ x: cFila.x - 10, y: cFila.y - 50, w: cFila.w + 20, h: cFila.h + 70 }, 10, vista));
    await desmarcar(p);

    // 2. La cartera y sus filtros.
    const cEstados = unir(...(await Promise.all(["Marta Restrepo", "Andrés Pérez", "Valentina Ruiz", "Carlos Gómez"].map((n) => caja(p, laCelda(p, n, "estado"))))));
    await marcar(p, [{ c: cEstados, texto: "Primero lo que te pide algo", lado: "derecha" }]);
    await guardar(p, "cartera.webp");
    await desmarcar(p);
    await marcar(p, (await losFiltros(p)).map((c, i) => ({ c, n: i + 1, lado: "abajo" })));
    await guardar(p, "filtros.webp", zonaDeLaBarra);
    await desmarcar(p);
    await elFiltro(p, "vencida").click();
    await espera(p, 800);
    const vencidas = await laFila(p, "Andrés Pérez").isVisible() ? ["Andrés Pérez", "Valentina Ruiz"] : [];
    await marcar(p, [
        { c: await caja(p, elFiltro(p, "vencida")), n: 1, lado: "abajo" },
        ...(vencidas.length
            ? [{ c: unir(...(await Promise.all(vencidas.map((n) => caja(p, laCelda(p, n, "vence")))))), texto: "Cuánto pasó de su fecha", lado: "derecha" }]
            : []),
    ]);
    await guardar(p, "filtro-vencidas.webp", holgura(unir(barra, await caja(p, LA_CARTERA)), 10, vista));
    await desmarcar(p);
    await elFiltro(p, "todos").click();
    await espera(p, 600);
    await p.fill(EL_BUSCADOR, "plan");
    await espera(p, 800);
    await marcar(p, [
        { c: await caja(p, EL_BUSCADOR), n: 1, lado: "abajo" },
        { c: holgura(await caja(p, LA_CARTERA), -8, vista), texto: "Lo que dice «plan»", lado: "derecha" },
    ]);
    await guardar(p, "buscar.webp", holgura(unir(await caja(p, EL_BUSCADOR), await caja(p, `${LA_CARTERA} table`)), 30, vista));
    await desmarcar(p);
    await p.fill(EL_BUSCADOR, "");
    await espera(p, 800);

    // 3. Cobrar ahora: se SEÑALA, no se pulsa (mandaría un WhatsApp).
    await abrirElMenuDe(p, "Andrés Pérez");
    const cMenu = await caja(p, elMenuAbierto(p));
    const cAndres = await laCajaDeLaFila(p, "Andrés Pérez");
    await marcar(p, [{ c: cMenu, texto: "Todo lo de esta deuda", lado: "izquierda" }]);
    await guardar(p, "menu-de-la-deuda.webp", holgura(unir(cMenu, cAndres), 30, vista));
    await desmarcar(p);
    await marcar(p, [{ c: await caja(p, laOpcion(p, "Cobrar ahora")), texto: "Manda el recordatorio ya", lado: "izquierda" }]);
    await guardar(p, "cobrar-ahora.webp", holgura(unir(cMenu, cAndres), 30, vista));
    await desmarcar(p);
    await cerrarElMenu(p);
    const cConcepto = await caja(p, laCelda(p, "Felipe Ríos", "concepto"));
    await marcar(p, [{ c: cConcepto, texto: "Un archivo que no salió", lado: "abajo" }], { atenuar: true });
    await guardar(p, "cobrar-aviso.webp", holgura(unir(await laCajaDeLaFila(p, "Felipe Ríos"), { ...cConcepto, y: cConcepto.y + cConcepto.h + 70, h: 1 }), 20, vista));
    await desmarcar(p);

    // 4. Llegó el comprobante: se marca en Valentina y se devuelve.
    await abrirElMenuDe(p, "Valentina Ruiz");
    await marcar(p, [{ c: await caja(p, laOpcion(p, "Llegó el comprobante")), texto: "Llegó el comprobante", lado: "izquierda" }]);
    await guardar(p, "comprobante-opcion.webp", holgura(unir(await caja(p, elMenuAbierto(p)), await laCajaDeLaFila(p, "Valentina Ruiz")), 30, vista));
    await desmarcar(p);
    await laOpcion(p, "Llegó el comprobante").click();
    await laCelda(p, "Valentina Ruiz", "estado").filter({ hasText: "Comprobante" }).waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 800);
    await quitarAvisos(p);
    const cValentina = await laCajaDeLaFila(p, "Valentina Ruiz");
    await marcar(p, [{ c: await caja(p, laCelda(p, "Valentina Ruiz", "estado")), texto: "Ya no se le recuerda", lado: "derecha" }], { atenuar: true });
    await guardar(p, "comprobante-fila.webp", holgura(unir(await laCajaDeLaFila(p, "Marta Restrepo"), cValentina), 40, vista));
    await desmarcar(p);
    await abrirElMenuDe(p, "Valentina Ruiz");
    await marcar(p, [{ c: await caja(p, laOpcion(p, "No era: volver a pendiente")), texto: "La devuelve como estaba", lado: "izquierda" }]);
    await guardar(p, "comprobante-volver.webp", holgura(unir(await caja(p, elMenuAbierto(p)), await laCajaDeLaFila(p, "Valentina Ruiz")), 30, vista));
    await desmarcar(p);
    await laOpcion(p, "No era: volver a pendiente").click();
    await laCelda(p, "Valentina Ruiz", "estado").filter({ hasNotText: "Comprobante" }).waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 800);
    await quitarAvisos(p);

    // 5. Confirmar el pago de Laura, DE VERDAD.
    await abrirElMenuDe(p, "Laura Méndez");
    await marcar(p, [{ c: await caja(p, laOpcion(p, "Confirmar pago")), texto: "Confirmar pago", lado: "izquierda" }]);
    await guardar(p, "confirmar-opcion.webp", holgura(unir(await caja(p, elMenuAbierto(p)), await laCajaDeLaFila(p, "Laura Méndez")), 30, vista));
    await desmarcar(p);
    await laOpcion(p, "Confirmar pago").click();
    const alerta = laConfirmacion(p, "confirmar");
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await soltarElFoco(p);
    const cAlerta = await caja(p, alerta);
    await marcar(p, [
        { c: await caja(p, alerta.getByRole("button", { name: "Volver" })), texto: "No cambia nada", lado: "abajo" },
        { c: await caja(p, alerta.getByRole("button", { name: "Sí, confirmar el pago" })), n: 1, lado: "abajo" },
    ]);
    await guardar(p, "confirmar-ventana.webp", holgura(unir(cAlerta, { ...cAlerta, y: cAlerta.y + cAlerta.h + 84, h: 1 }), 26, vista));
    await desmarcar(p);
    await alerta.getByRole("button", { name: "Sí, confirmar el pago" }).click();
    await laCelda(p, "Laura Méndez", "ciclo").filter({ hasText: "4" }).waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 1000);
    await quitarAvisos(p);
    const cLaura = await laCajaDeLaFila(p, "Laura Méndez");
    await marcar(p, [
        { c: await caja(p, laCelda(p, "Laura Méndez", "vence")), n: 1, lado: "abajo" },
        { c: await caja(p, laCelda(p, "Laura Méndez", "ciclo")), n: 2, lado: "abajo" },
    ], { atenuar: true });
    await guardar(p, "confirmar-hecho.webp", holgura({ ...cLaura, h: cLaura.h + 60 }, 20, vista));
    await desmarcar(p);

    // 6. El historial de ciclos.
    const cabezaCiclo = p.locator(`${LA_CARTERA} thead th`).nth(5);
    const celdasCiclo = await Promise.all(["Marta Restrepo", "Andrés Pérez", "Valentina Ruiz", "Carlos Gómez", "Sara Castaño"].map((n) => caja(p, laCelda(p, n, "ciclo"))));
    await marcar(p, [{ c: unir(await caja(p, cabezaCiclo), ...celdasCiclo), texto: "Pagos confirmados", lado: "izquierda" }]);
    await guardar(p, "historial-columna.webp", holgura(await caja(p, LA_CARTERA), 10, vista));
    await desmarcar(p);
    await abrirElMenuDe(p, "Sara Castaño");
    await marcar(p, [{ c: await caja(p, laOpcion(p, "Historial de ciclos")), texto: "Historial de ciclos", lado: "izquierda" }]);
    await guardar(p, "historial-opcion.webp", holgura(unir(await caja(p, elMenuAbierto(p)), await laCajaDeLaFila(p, "Sara Castaño")), 30, vista));
    await desmarcar(p);
    await laOpcion(p, "Historial de ciclos").click();
    await p.locator(`${EL_HISTORIAL} [data-ciclo]`).first().waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await soltarElFoco(p);
    const cHistorial = await caja(p, EL_HISTORIAL);
    await marcar(p, [{ c: await caja(p, p.locator(`${EL_HISTORIAL} [data-ciclo]`).first()), texto: "Monto, fecha y de qué vencimiento a cuál", lado: "abajo" }]);
    await guardar(p, "historial.webp", holgura(cHistorial, 16, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await p.locator(EL_HISTORIAL).waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 400);

    // 7. Crear una deuda: se crea DE VERDAD al final, con su archivo y sus datos de pago.
    await marcar(p, [{ c: await caja(p, EL_NUEVO(p)), texto: "Nuevo", lado: "abajo" }]);
    await guardar(p, "crear-boton.webp", zonaDeLaBarra);
    await desmarcar(p);
    await abrirElFormulario(p);
    await llenarElFormulario(p);
    await soltarElFoco(p);
    const cFormulario = await caja(p, EL_FORMULARIO);
    const camposDeArriba = ["cliente", "whatsapp", "concepto", "monto", "moneda", "vence", "licencia", "gracia"];
    await marcar(p, await Promise.all(camposDeArriba.map(async (c, i) => ({ c: await caja(p, enElFormulario(p, c)), n: i + 1, esquina: "derecha" }))));
    await guardar(p, "crear-ventana.webp", holgura(cFormulario, 10, vista));
    await desmarcar(p);
    await enElFormulario(p, "adjuntos").locator('input[type="file"]').setInputFiles(LA_CUENTA_DE_COBRO);
    await enElFormulario(p, "adjuntos").getByText(LA_CUENTA_DE_COBRO.name).first().waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 600);
    await soltarElFoco(p);
    await marcar(p, [{ c: await aLaVistaYMedir(p, enElFormulario(p, "adjuntos")), texto: "Sale con cada recordatorio", lado: "arriba" }]);
    await guardar(p, "crear-adjuntos.webp", holgura(await caja(p, EL_FORMULARIO), 10, vista));
    await desmarcar(p);
    await enElFormulario(p, "nota").locator("textarea").fill("Nequi 3004445566 a nombre de Diana Torres");
    await soltarElFoco(p);
    await marcar(p, [{ c: await aLaVistaYMedir(p, enElFormulario(p, "nota")), texto: "Va al final de cada mensaje", lado: "arriba" }]);
    await guardar(p, "crear-nota.webp", holgura(await caja(p, EL_FORMULARIO), 10, vista));
    await desmarcar(p);
    await p.locator(EL_FORMULARIO).getByRole("button", { name: "Crear" }).click();
    await p.locator(EL_FORMULARIO).waitFor({ state: "hidden", timeout: 20000 });
    await laFila(p, "Diana Torres").waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 1000);
    await quitarAvisos(p);

    // 8. Editar y eliminar: editar se cancela; eliminar se cierra con «Volver».
    await abrirElMenuDe(p, "Carlos Gómez");
    await laOpcion(p, "Editar").click();
    await p.locator(EL_FORMULARIO).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 700);
    await soltarElFoco(p);
    await marcar(p, [
        { c: await caja(p, enElFormulario(p, "monto")), n: 1, esquina: "derecha" },
        { c: await caja(p, enElFormulario(p, "vence")), n: 2, esquina: "derecha" },
        { c: await caja(p, p.locator(EL_FORMULARIO).getByRole("button", { name: "Guardar" })), n: 3, lado: "abajo" },
    ]);
    await guardar(p, "editar.webp", holgura(await caja(p, EL_FORMULARIO), 30, vista));
    await desmarcar(p);
    await cerrarElFormulario(p);
    await abrirElMenuDe(p, "Julián Vargas");
    await laOpcion(p, "Eliminar").click();
    const eliminar = laConfirmacion(p, "eliminar");
    await eliminar.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await soltarElFoco(p);
    const cEliminar = await caja(p, eliminar);
    await marcar(p, [
        { c: await caja(p, eliminar.getByRole("button", { name: "Volver" })), texto: "No cambia nada", lado: "abajo" },
        { c: await caja(p, eliminar.getByRole("button", { name: "Eliminar" })), n: 1, lado: "abajo" },
    ]);
    await guardar(p, "eliminar.webp", holgura(unir(cEliminar, { ...cEliminar, y: cEliminar.y + cEliminar.h + 84, h: 1 }), 26, vista));
    await desmarcar(p);
    await eliminar.getByRole("button", { name: "Volver" }).click();
    await eliminar.waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 400);

    // 9. La configuración: se abre, se enseña y se cierra con «Cancelar».
    await marcar(p, [{ c: await caja(p, LA_CONFIGURACION), texto: "Configuración", lado: "abajo" }]);
    await guardar(p, "configuracion-boton.webp", zonaDeLaBarra);
    await desmarcar(p);
    await abrirLosAjustes(p);
    const ajustes = p.locator(LA_VENTANA_DE_AJUSTES);
    const laLinea = ajustes.locator("p").filter({ hasText: /línea/ }).first();
    await marcar(p, [
        { c: await caja(p, laLinea), n: 1, esquina: "derecha" },
        { c: await caja(p, enLosAjustes(p, "pago")), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "configuracion.webp", holgura(await caja(p, ajustes), 10, vista));
    await desmarcar(p);
    await aLaVistaYMedir(p, ajustes.locator('[data-zona="cuando"]'));
    await marcar(p, [
        { c: await caja(p, enLosAjustes(p, "antes")), n: 1, lado: "abajo" },
        { c: await caja(p, enLosAjustes(p, "elDia")), n: 2, lado: "abajo" },
        { c: await caja(p, enLosAjustes(p, "despues")), n: 3, lado: "abajo" },
    ]);
    await guardar(p, "configuracion-cuando.webp", holgura(await caja(p, ajustes), 10, vista));
    await desmarcar(p);

    // 10. Los mensajes.
    await aLaVistaYMedir(p, ajustes.locator('[data-mensaje="elDia"]'));
    await marcar(p, await Promise.all(["antes", "elDia", "despues"].map(async (m, i) => ({ c: await caja(p, ajustes.locator(`[data-mensaje="${m}"]`)), n: i + 1, esquina: "derecha" }))));
    await guardar(p, "mensajes.webp", holgura(await caja(p, ajustes), 10, vista));
    await desmarcar(p);
    const variables = ajustes.locator('[data-campo="mensajes"] code');
    await variables.first().evaluate((el) => el.scrollIntoView({ block: "center" }));
    await espera(p, 300);
    const cVariables = unir(...(await Promise.all(Array.from({ length: await variables.count() }, (_, i) => caja(p, variables.nth(i))))));
    await marcar(p, [{ c: cVariables, texto: "Se cambian por los datos del cliente", lado: "abajo" }]);
    await guardar(p, "mensajes-variables.webp", holgura(await caja(p, ajustes), 10, vista));
    await desmarcar(p);
    const elGuardar = ajustes.getByRole("button", { name: "Guardar" });
    await marcar(p, [{ c: await aLaVistaYMedir(p, elGuardar), texto: "Guardar", lado: "arriba" }]);
    await guardar(p, "mensajes-guardar.webp", holgura(await caja(p, ajustes), 10, vista));
    await desmarcar(p);
    await cerrarLosAjustes(p);

    await elMarcoDeLaPantalla(p, guardar, { modulo: "Panel", texto: "Cobros está en Panel" });
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
    await sinBucket(ctx);
    await ctx.addInitScript(CURSOR);
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
    await alDecir("los clientes", 200);
    await mover(p, laCelda(p, "Carlos Gómez", "cliente"));
    await alDecir("por WhatsApp", 200);
    await mover(p, laCelda(p, "Carlos Gómez", "estado"));

    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const panel = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Panel" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Panel", 600);
    await mover(p, panel);

    const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    await decir("cartera");
    await alDecir("pone arriba");
    await mover(p, laCelda(p, "Marta Restrepo", "estado"));
    await alDecir("los comprobantes", 0);
    await mover(p, elFiltro(p, "comprobante"));
    await alDecir("las vencidas", 0);
    await pulsar(p, elFiltro(p, "vencida"));
    await alDecir("por vencer", 0);
    await mover(p, elFiltro(p, "porVencer"));
    await alDecir("al día", 0);
    await mover(p, elFiltro(p, "alDia"));
    await pulsar(p, elFiltro(p, "todos"));

    await decir("cobrarAhora");
    await alDecir("Con los tres puntos");
    await pulsar(p, elMenuDe(p, "Andrés Pérez"));
    await elMenuAbierto(p).waitFor({ state: "visible", timeout: 10000 });
    await alDecir("con Cobrar ahora", 200);
    // Se SEÑALA: pulsarlo mandaría un WhatsApp.
    await mover(p, laOpcion(p, "Cobrar ahora"));
    await alDecir("sin esperar", 0);
    await p.keyboard.press("Escape");

    await decir("comprobante");
    await alDecir("lo marcas", 0);
    await pulsar(p, elMenuDe(p, "Valentina Ruiz"));
    await elMenuAbierto(p).waitFor({ state: "visible", timeout: 10000 });
    await pulsar(p, laOpcion(p, "Llegó el comprobante"));
    await laCelda(p, "Valentina Ruiz", "estado").filter({ hasText: "Comprobante" }).waitFor({ state: "visible", timeout: 15000 });
    await alDecir("los recordatorios paran", 0);
    await mover(p, laCelda(p, "Valentina Ruiz", "estado"));

    const alerta = laConfirmacion(p, "confirmar");
    await decir("confirmar");
    await alDecir("Con Confirmar pago", 0);
    await pulsar(p, elMenuDe(p, "Valentina Ruiz"));
    await elMenuAbierto(p).waitFor({ state: "visible", timeout: 10000 });
    await pulsar(p, laOpcion(p, "Confirmar pago"));
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("queda al día", 0);
    await pulsar(p, alerta.getByRole("button", { name: "Sí, confirmar el pago" }));
    await laCelda(p, "Valentina Ruiz", "ciclo").filter({ hasText: "8" }).waitFor({ state: "visible", timeout: 20000 });
    await alDecir("al mes siguiente", 0);
    await mover(p, laCelda(p, "Valentina Ruiz", "vence"));

    await decir("historial");
    await alDecir("la columna Ciclo", 0);
    await mover(p, laCelda(p, "Valentina Ruiz", "ciclo"));
    await alDecir("en el historial", 0);
    await pulsar(p, elMenuDe(p, "Valentina Ruiz"));
    await elMenuAbierto(p).waitFor({ state: "visible", timeout: 10000 });
    await pulsar(p, laOpcion(p, "Historial de ciclos"));
    await p.locator(`${EL_HISTORIAL} [data-ciclo]`).first().waitFor({ state: "visible", timeout: 10000 });
    await alDecir("sus fechas", 0);
    await mover(p, p.locator(`${EL_HISTORIAL} [data-ciclo]`).first());

    await decir("crear");
    await p.keyboard.press("Escape");
    await p.locator(EL_HISTORIAL).waitFor({ state: "hidden", timeout: 10000 });
    await alDecir("Con Nuevo", 0);
    await pulsar(p, EL_NUEVO(p));
    await p.locator(EL_FORMULARIO).waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 400);
    await alDecir("el cliente", 0);
    await pulsar(p, enElFormulario(p, "cliente").locator("input"));
    await enElFormulario(p, "cliente").locator("input").pressSequentially("Diana Torres", { delay: 25 });
    await alDecir("su WhatsApp", 0);
    await pulsar(p, enElFormulario(p, "whatsapp").locator("input"));
    await enElFormulario(p, "whatsapp").locator("input").pressSequentially("573004445566", { delay: 20 });
    await alDecir("qué le cobras", 0);
    await pulsar(p, enElFormulario(p, "concepto").locator("input"));
    await enElFormulario(p, "concepto").locator("input").pressSequentially("Plan de mantenimiento", { delay: 20 });
    await alDecir("el monto", 0);
    await pulsar(p, enElFormulario(p, "monto").locator("input"));
    await enElFormulario(p, "monto").locator("input").pressSequentially("95000", { delay: 30 });
    await alDecir("cuándo vence", 0);
    await mover(p, enElFormulario(p, "vence"));
    await enElFormulario(p, "vence").locator("input").fill(enDias(15));
    await alDecir("su cuenta de cobro", 0);
    await mover(p, enElFormulario(p, "adjuntos"));
    await enElFormulario(p, "adjuntos").locator('input[type="file"]').setInputFiles(LA_CUENTA_DE_COBRO);
    await alDecir("sus propios datos de pago", 0);
    await pulsar(p, enElFormulario(p, "nota").locator("textarea"));
    await enElFormulario(p, "nota").locator("textarea").pressSequentially("Nequi 3004445566", { delay: 25 });

    const eliminar = laConfirmacion(p, "eliminar");
    await decir("editarYEliminar");
    await pulsar(p, p.locator(EL_FORMULARIO).getByRole("button", { name: "Crear" }));
    await p.locator(EL_FORMULARIO).waitFor({ state: "hidden", timeout: 20000 });
    await alDecir("la editas", 0);
    await pulsar(p, elMenuDe(p, "Julián Vargas"));
    await elMenuAbierto(p).waitFor({ state: "visible", timeout: 10000 });
    await mover(p, laOpcion(p, "Editar"));
    await alDecir("o la eliminas", 0);
    await pulsar(p, laOpcion(p, "Eliminar"));
    await eliminar.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("siempre con confirmación", 0);
    await pulsar(p, eliminar.getByRole("button", { name: "Volver" }));
    await eliminar.waitFor({ state: "hidden", timeout: 10000 });

    const ajustes = p.locator(LA_VENTANA_DE_AJUSTES);
    await decir("recordatorios");
    await alDecir("En Configuración", 0);
    await pulsar(p, p.locator(LA_CONFIGURACION));
    await ajustes.waitFor({ state: "visible", timeout: 15000 });
    await alDecir("cómo te pagan", 0);
    await mover(p, enLosAjustes(p, "pago"));
    await alDecir("unos días antes", 0);
    await mover(p, enLosAjustes(p, "antes"));
    await alDecir("el día que vence", 0);
    await mover(p, enLosAjustes(p, "elDia"));
    await alDecir("unos días después", 0);
    await mover(p, enLosAjustes(p, "despues"));

    await decir("mensajes");
    await alDecir("su mensaje", 0);
    await ajustes.locator('[data-mensaje="elDia"]').evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
    await espera(p, 500);
    await mover(p, ajustes.locator('[data-mensaje="antes"]'));
    await alDecir("con variables", 0);
    await mover(p, ajustes.locator('[data-campo="mensajes"] code').first());
    await alDecir("Así se cobra", 0);
    await pulsar(p, ajustes.getByRole("button", { name: "Cancelar" }));
    await ajustes.waitFor({ state: "hidden", timeout: 10000 });
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
    escribirLaVozDelVideo("cobros", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
    console.log("  ✓ demostracion.webm", Math.round(statSync(destino).size / 1024), "KB,", colocados.length, "frases narradas");
}

/* ------------------------------------------------------------------ */

const navegador = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    args: ["--lang=es-CO"],
    // El campo de fecha lo pinta el proceso de Chromium con SU idioma (la regla de Finanzas).
    env: { ...process.env, LANG: "es_CO.UTF-8", LANGUAGE: "es_CO:es" },
});
try {
    const ctx = await navegador.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        locale: "es-CO",
        timezoneId: "America/Bogota",
    });
    await sinBucket(ctx);
    const p = await entrar(ctx, BASE);
    await abrirLaPantalla(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        // Las capturas confirman un pago y crean una deuda: el vídeo sale del mismo punto de partida.
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-cobros.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/cobros`);
