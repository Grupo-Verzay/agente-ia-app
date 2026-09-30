/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Usuarios, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-usuarios.mjs`).
 *
 * La MISMA forma que la de Leads, Catálogo, Diagramas, Reuniones y Mis notas:
 * cada captura es una receta —abre esto, pulsa aquello, resalta este
 * elemento— y las marcas se dibujan encima de la pantalla real. Lo que no
 * depende de la pantalla —entrar, medir, marcar, guardar, las miniaturas, el
 * marco (el menú y la barra de arriba) y la narración (`decir`/`alDecir`/
 * `callar`)— viene del taller común de las guías (`taller-de-la-guia.mjs`):
 * por eso todas se leen como la misma guía. Aquí van solo las recetas de
 * Usuarios.
 *
 * Los elementos se localizan por lo que la pantalla ya expone —las marcas
 * `data-*` de `team-client.tsx` (las mismas con las que el banco compara la
 * guía con el código), los `aria-label` y los rótulos de los botones—, nunca
 * por coordenadas: si un mando se mueve, la flecha se va con él.
 *
 * Las capturas CAMBIAN los datos (crean a una persona, cambian el modo de
 * reparto, reasignan un contacto, reparten los sin asesor), así que antes del
 * vídeo se vuelve a sembrar: el vídeo sale del mismo punto de partida que la
 * primera captura. Lo que no se deshace —eliminar a alguien, devolver sus
 * leads— se abre y se CANCELA, en las capturas y en el vídeo.
 *
 * Se lanza con `scripts/generar-guia-usuarios.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-usuarios.mjs";
import { guardarWav, mezclar, montarLaPista } from "./voz-de-la-guia.mjs";
import {
    LA_BARRA_DE_ARRIBA,
    caja,
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
    tomarLasMiniaturas,
    unir,
} from "./taller-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "usuarios");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-usuarios";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
/** Solo el vídeo: las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-usuarios.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-usuarios.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Dónde está cada cosa                                                */
/* ------------------------------------------------------------------ */

const BARRA = "[data-barra-de-acciones]";
const AUTO = "[data-auto-asignacion]";
const TABLA = "[data-tabla-del-equipo]";
const GRAFICAS = "[data-graficas-del-equipo]";
const MODOS = '[data-grupo="modo-de-reparto"]';
const VISTAS = '[data-grupo="vista"]';
const ASIGNAR = '[data-accion="asignar-sin-atender"]';
const CREAR = `${BARRA} [data-zona="crear"]`;
const ACCIONES = `${BARRA} [data-zona="acciones"]`;
const SUMA = "[data-suma-del-reparto]";

/** La fila de una persona en la tabla, por su nombre. */
const laFila = (p, nombre) => p.locator("[data-fila-del-asesor]", { hasText: nombre }).first();
/** El «⋯» de la fila de una persona. */
const suMenu = (p, nombre) => laFila(p, nombre).locator("[data-menu-del-asesor]");
/** Un modo de reparto (`maximo`, `ilimitado`, `porcentaje`). */
const elModo = (p, modo) => p.locator(`${MODOS} [data-modo="${modo}"]`);
/** Tabla o Pipeline. */
const laVista = (p, vista) => p.locator(`${VISTAS} [data-vista="${vista}"]`);
/** La columna de una persona en el Pipeline (o `sin-asignar`). */
const laColumna = (p, id) => p.locator(`[data-columna-del-asesor="${id}"]`);
/** Una tarjeta del Pipeline, por el nombre del contacto. */
const laTarjeta = (p, nombre) => p.locator("[data-tarjeta-del-contacto]", { hasText: nombre }).first();
/** El menú desplegable que se acaba de abrir (Radix lo pinta en un portal). */
const elMenu = (p) => p.locator('[role="menu"]').last();
/** La ventana (diálogo o panel lateral) que se acaba de abrir. */
const laVentana = (p) => p.locator('[role="dialog"]').last();
/** La confirmación que se acaba de abrir. */
const laAlerta = (p) => p.locator('[role="alertdialog"]').last();

/** Suelta el foco que deja un control cerrado: su anillo se leería como una marca. */
const soltarElFoco = (p) => p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());

/** El ratón, fuera de todo: un botón con el cursor encima sale resaltado. */
const apartar = (p) => p.mouse.move(p.viewportSize().width - 30, p.viewportSize().height - 30);

async function abrirEquipo(p) {
    await p.goto(`${BASE}/equipo`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${TABLA} [data-fila-del-asesor]`, { timeout: 90000 });
    await p.waitForSelector(`${GRAFICAS}`, { timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2000);
    await despejar(p);
    // Los botones del borde (nota rápida, copiloto, equipo) son de TODAS las
    // pantallas: aquí tapan el final de la tabla y no explican nada de Usuarios.
    await esconderLosBotonesDelBorde(p);
}

/**
 * Cierra las VENTANAS que abren las recetas —crear, editar, módulos, el panel
 * de automatizaciones, la lista de un desplegable—, sin guardar nada. El
 * taller solo cierra menús y confirmaciones (`cerrarLoAbierto`); estas no lo
 * son.
 */
async function cerrarLasVentanas(p) {
    for (let i = 0; i < 4; i += 1) {
        if (!(await p.$('[role="dialog"], [role="listbox"], [role="alertdialog"], [role="menu"]'))) break;
        await p.keyboard.press("Escape");
        await espera(p, 350);
    }
}

/** El contenido de la vista Tabla (tabla y gráficas) se desplaza por dentro: vuelve arriba. */
async function arriba(p) {
    await p.evaluate(() => {
        const t = document.querySelector("[data-tabla-del-equipo]");
        let n = t?.parentElement;
        while (n && n !== document.body) {
            if (n.scrollHeight > n.clientHeight + 2) n.scrollTop = 0;
            n = n.parentElement;
        }
    });
    await espera(p, 300);
}

/** Vuelve la pantalla a como abre: vista Tabla, modo Máx. chats, sin ventanas, arriba del todo. */
async function comoAlAbrir(p) {
    await cerrarLasVentanas(p);
    if (await p.$("[data-columna-del-asesor]")) {
        await laVista(p, "tabla").click();
        await p.waitForSelector(TABLA, { timeout: 20000 });
        await espera(p, 800);
    }
    if ((await elModo(p, "porcentaje").getAttribute("aria-checked")) === "true") {
        await elModo(p, "maximo").click();
        await p.waitForSelector("#max-chats", { timeout: 10000 });
        await quitarAvisos(p);
    }
    await arriba(p);
    await apartar(p);
}

/** Abre el «⋯» de una persona y espera a que el menú esté quieto. */
async function abrirSuMenu(p, nombre) {
    await suMenu(p, nombre).click();
    await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
}

/** Pulsa una opción del «⋯» de una persona y espera a que se abra lo que abre. */
async function suOpcion(p, nombre, opcion, rol = '[role="dialog"]') {
    await abrirSuMenu(p, nombre);
    await elMenu(p).getByRole("menuitem", { name: opcion }).click();
    const abierto = p.locator(rol).last();
    await abierto.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    await apartar(p);
    // La ventana abre con el foco en su primer botón (la equis): su anillo
    // se leería como otra marca.
    await soltarElFoco(p);
    return abierto;
}

/**
 * Vuelve a poner los datos de ejemplo y abre la pantalla otra vez. Hace falta
 * antes del Pipeline: cambiar de modo con la auto-asignación encendida REPARTE
 * lo que estaba sin asesor (y lo dice), así que después de las recetas del
 * reparto la columna Sin asignar se queda vacía y no habría nada que arrastrar.
 */
async function conLoPendienteDeVuelta(p) {
    // Sin tocar al equipo: la persona creada en «Crear un usuario» sigue en él.
    execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-usuarios.mjs")], {
        stdio: "ignore",
        env: { ...process.env, CONSERVAR_EQUIPO: "1" },
    });
    await abrirEquipo(p);
}

/** Cambia a la vista Pipeline y espera a que las columnas tengan sus tarjetas. */
async function alPipeline(p) {
    await laVista(p, "pipeline").click();
    await p.waitForSelector('[data-columna-del-asesor="sin-asignar"] [data-tarjeta-del-contacto]', { timeout: 30000 });
    await espera(p, 900);
    await apartar(p);
}

/* ------------------------------------------------------------------ */
/* Medir                                                               */
/* ------------------------------------------------------------------ */

/** Una columna entera de la tabla —su cabecera y sus celdas—, por el texto de la cabecera. */
async function laColumnaDeLaTabla(p, cabecera) {
    return p.evaluate(
        ({ tabla, cabecera }) => {
            const ths = [...document.querySelectorAll(`${tabla} thead th`)];
            const i = ths.findIndex((th) => th.textContent.trim() === cabecera);
            if (i < 0) throw new Error(`no hay columna «${cabecera}»`);
            const celdas = [ths[i], ...[...document.querySelectorAll(`${tabla} tbody tr`)].map((tr) => tr.children[i])];
            const r = celdas.map((c) => c.getBoundingClientRect());
            const x = Math.min(...r.map((q) => q.left));
            const y = Math.min(...r.map((q) => q.top));
            return { x, y, w: Math.max(...r.map((q) => q.right)) - x, h: Math.max(...r.map((q) => q.bottom)) - y };
        },
        { tabla: TABLA, cabecera },
    );
}

/** Una celda de una fila, por el texto de la cabecera de su columna. */
async function laCelda(p, nombre, cabecera) {
    return p.evaluate(
        ({ tabla, nombre, cabecera }) => {
            const ths = [...document.querySelectorAll(`${tabla} thead th`)];
            const i = ths.findIndex((th) => th.textContent.trim() === cabecera);
            const tr = [...document.querySelectorAll(`${tabla} tbody tr`)].find((f) => f.textContent.includes(nombre));
            const q = tr.children[i].getBoundingClientRect();
            return { x: q.left, y: q.top, w: q.width, h: q.height };
        },
        { tabla: TABLA, nombre, cabecera },
    );
}

/** Las iniciales de una persona (el círculo con su punto de disponible). */
const susIniciales = (p, nombre) => laFila(p, nombre).locator("td").first().locator("div.relative").first();

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

/**
 * Una miniatura por sección, con la receta de todas las guías
 * (`tomarLasMiniaturas` del taller): aquí solo se dice qué zona explica cada
 * sección. Lo que se abre para una (una ventana, el modo por porcentaje, el
 * Pipeline) se deshace después (`comoAlAbrir`).
 */
async function miniaturas(p) {
    await tomarLasMiniaturas(
        p,
        [
            ["vista-general", async () => unir(await caja(p, BARRA), await caja(p, TABLA))],
            ["crear-usuario", async () => {
                await p.locator(CREAR).getByRole("button").click();
                await laVentana(p).waitFor({ state: "visible", timeout: 10000 });
                await espera(p, 600);
                await apartar(p);
                return caja(p, laVentana(p));
            }],
            ["rol-y-disponibilidad", async () => unir(await laColumnaDeLaTabla(p, "Rol"), await laColumnaDeLaTabla(p, "Disponible"))],
            ["auto-asignacion", async () => caja(p, AUTO)],
            ["por-porcentaje", async () => {
                await elModo(p, "porcentaje").click();
                await p.waitForSelector('[data-columna="porcentaje"]', { timeout: 10000 });
                await quitarAvisos(p);
                return unir(await caja(p, MODOS), await caja(p, SUMA), await laColumnaDeLaTabla(p, "Porcentaje"));
            }],
            ["medir-al-equipo", async () => {
                await p.locator(GRAFICAS).scrollIntoViewIfNeeded();
                await espera(p, 500);
                return caja(p, GRAFICAS);
            }],
            ["pipeline", async () => {
                await conLoPendienteDeVuelta(p);
                await alPipeline(p);
                return unir(await caja(p, laColumna(p, "sin-asignar")), await caja(p, p.locator("[data-columna-del-asesor]").nth(2)));
            }],
            ["que-ve-cada-usuario", async () => {
                await abrirSuMenu(p, "Andrés Ruiz");
                return unir(await caja(p, suMenu(p, "Andrés Ruiz")), await caja(p, elMenu(p)));
            }],
            ["editar-y-quitar", async () => caja(p, await suOpcion(p, "Andrés Ruiz", "Editar asesor"))],
            ["asignar-y-mas", async () => unir(await caja(p, ASIGNAR), await caja(p, ACCIONES))],
        ],
        { salida: SALIDA, tomadas, focos: FOCOS, despues: () => comoAlAbrir(p) },
    );
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();

    /* 1. La pantalla de un vistazo ----------------------------------- */
    await comoAlAbrir(p);
    // Portada del vídeo: la pantalla tal como abre.
    await guardar(p, "portada.webp");

    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cBarra = await caja(p, BARRA);
    const cTabla = await caja(p, TABLA);
    const cGraficas = await caja(p, GRAFICAS);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: cBarra, n: 3 },
        { c: cTabla, n: 4 },
        { c: cGraficas, n: 5 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // La barra de trabajo, con sus cinco mandos. Pegados unos a otros, los
    // números van DEBAJO, al centro de cada uno.
    const partes = [
        await caja(p, AUTO),
        await caja(p, VISTAS),
        await caja(p, ASIGNAR),
        await caja(p, `${CREAR} button`),
        await caja(p, `${ACCIONES} button`),
    ];
    await marcar(p, partes.map((c, i) => ({ c, n: i + 1, esquina: "centro", borde: "abajo" })), { atenuar: true });
    await guardar(p, "barra.webp", { x: cBarra.x - 10, y: cBarra.y - 10, w: cBarra.w + 20, h: cBarra.h + 36 });
    await desmarcar(p);

    await marcar(p, [{ c: cTabla }], { atenuar: true });
    await guardar(p, "tabla.webp", holgura(cTabla, 18, vista));
    await desmarcar(p);

    // La zona de arriba —la barra y las primeras filas—, donde viven casi todas
    // las recetas de abajo.
    const zonaDeArriba = { x: cBarra.x, y: cBarra.y, w: cBarra.w, h: cTabla.y + cTabla.h - cBarra.y };

    /* 2. Crear un usuario -------------------------------------------- */
    const nuevo = p.locator(`${CREAR} button`);
    await marcar(p, [{ c: await caja(p, nuevo), texto: "Nuevo", lado: "abajo" }], { atenuar: true });
    await guardar(p, "crear-boton.webp", holgura({ ...zonaDeArriba, h: cBarra.h + 110 }, 10, vista));
    await desmarcar(p);

    await nuevo.click();
    const crear = laVentana(p);
    await crear.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await crear.locator("#adv-name").fill("Camilo Ortiz");
    await crear.locator("#adv-email").fill("camilo@banco.test");
    await crear.locator("#adv-pw").fill("banco1234");
    await apartar(p);
    await espera(p, 300);
    await marcar(p, [
        { c: await caja(p, crear.locator("#adv-name")), n: 1, esquina: "derecha" },
        { c: await caja(p, crear.locator("#adv-email")), n: 2, esquina: "derecha" },
        { c: await caja(p, crear.locator("#adv-pw")), n: 3, esquina: "derecha" },
        { c: await caja(p, crear.locator("#adv-role")), n: 4, esquina: "derecha" },
    ]);
    await guardar(p, "crear-formulario.webp", holgura(await caja(p, crear), 24, vista));
    await desmarcar(p);

    await crear.locator("#adv-role").click();
    const roles = p.locator('[role="listbox"]').last();
    await roles.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    const cRoles = await caja(p, roles);
    await marcar(p, [{ c: cRoles }], { atenuar: true });
    await guardar(p, "crear-rol.webp", holgura(unir(await caja(p, crear), cRoles), 24, vista));
    await desmarcar(p);
    await roles.getByRole("option", { name: /^Agente/ }).click();
    await espera(p, 400);

    await crear.getByRole("button", { name: "Crear asesor" }).click();
    await laFila(p, "Camilo Ortiz").waitFor({ state: "visible", timeout: 20000 });
    await quitarAvisos(p);
    await espera(p, 800);
    await apartar(p);
    const cTablaConCamilo = await caja(p, TABLA);
    await marcar(p, [{ c: cTablaConCamilo, soloLuz: true }, { c: await caja(p, laFila(p, "Camilo Ortiz")) }], { atenuar: true });
    await guardar(p, "crear-listo.webp", holgura(cTablaConCamilo, 18, vista));
    await desmarcar(p);

    /* 3. Rol y disponibilidad ---------------------------------------- */
    // Se mide ANTES de abrir: con la lista abierta, Radix marca lo de fuera
    // con aria-hidden y `getByRole` deja de encontrar el disparador.
    const rolDeAndres = laFila(p, "Andrés Ruiz").getByRole("combobox");
    const cRolAndres = await caja(p, rolDeAndres);
    await rolDeAndres.click();
    const lista = p.locator('[role="listbox"]').last();
    await lista.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    const cLista = await caja(p, lista);
    await marcar(p, [{ c: cRolAndres }, { c: cLista }], { atenuar: true });
    await guardar(p, "rol.webp", holgura(unir(await caja(p, laFila(p, "Andrés Ruiz")), await caja(p, laFila(p, "Sofía Martínez")), cLista, cRolAndres), 18, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);
    // Cerrada la lista, el disparador se queda con el foco y su anillo se
    // leería como otra marca en las fotos de abajo.
    await soltarElFoco(p);

    const cDisponible = await laColumnaDeLaTabla(p, "Disponible");
    const cSwitchValeria = await caja(p, laFila(p, "Valeria Torres").getByRole("switch"));
    await marcar(
        p,
        [
            { c: cDisponible },
            { c: cSwitchValeria, sinRecuadro: true, texto: "Apagado: no recibe chats nuevos", lado: "derecha" },
        ],
        { atenuar: true },
    );
    await guardar(p, "disponible.webp", holgura(await caja(p, TABLA), 14, vista));
    await desmarcar(p);

    // Solo los recuadros: un rótulo al lado de unas iniciales cae encima del
    // nombre, y lo que dice cada color ya lo dice el texto del paso.
    const cLaura = await caja(p, susIniciales(p, "Laura Gómez"));
    const cValeria = await caja(p, susIniciales(p, "Valeria Torres"));
    await marcar(p, [{ c: cLaura }, { c: cValeria }], { atenuar: true });
    const cAsesor = await laColumnaDeLaTabla(p, "Asesor");
    await guardar(p, "disponible-punto.webp", holgura({ x: cAsesor.x, y: cAsesor.y, w: cAsesor.w + 120, h: cAsesor.h }, 10, vista));
    await desmarcar(p);

    /* 4. Repartir los chats solos ------------------------------------ */
    const interruptor = p.locator("#auto-assign-toggle");
    // Sin rótulo: debajo del interruptor está la cabecera de la tabla, y lo
    // taparía.
    await marcar(p, [{ c: await caja(p, interruptor) }], { atenuar: true });
    await guardar(p, "auto-encender.webp", { x: cBarra.x - 10, y: cBarra.y - 10, w: Math.min(cBarra.w, 760), h: cBarra.h + 120 });
    await desmarcar(p);

    const modos = [];
    for (const m of ["maximo", "ilimitado", "porcentaje"]) modos.push(await caja(p, elModo(p, m)));
    await marcar(
        p,
        [{ c: await caja(p, MODOS) }, ...modos.map((c, i) => ({ c, n: i + 1, sinRecuadro: true, esquina: "centro", borde: "abajo" }))],
        { atenuar: true },
    );
    const cAuto = await caja(p, AUTO);
    await guardar(p, "auto-modos.webp", { x: cAuto.x - 12, y: cBarra.y - 10, w: cAuto.w + 24, h: cBarra.h + 36 });
    await desmarcar(p);

    // El tope y la barra de carga de cada persona, debajo de su nombre.
    await marcar(
        p,
        [
            // Sin rótulo: a la derecha del tope están Tabla y Pipeline.
            { c: await caja(p, "#max-chats") },
            { c: await laColumnaDeLaTabla(p, "Asesor") },
        ],
        { atenuar: true },
    );
    await guardar(p, "auto-maximo.webp", holgura({ x: cBarra.x, y: cBarra.y, w: 820, h: cTablaConCamilo.y + cTablaConCamilo.h - cBarra.y }, 10, vista));
    await desmarcar(p);

    /* 5. Repartir por porcentaje ------------------------------------- */
    await elModo(p, "porcentaje").click();
    await p.waitForSelector('[data-columna="porcentaje"]', { timeout: 10000 });
    await quitarAvisos(p);
    await apartar(p);
    await marcar(
        p,
        [
            // Sin rótulo: debajo del modo está la cabecera de la tabla.
            { c: await caja(p, elModo(p, "porcentaje")) },
            { c: await laColumnaDeLaTabla(p, "Porcentaje") },
        ],
        { atenuar: true },
    );
    await guardar(p, "porcentaje-modo.webp", holgura({ ...zonaDeArriba, h: (await caja(p, TABLA)).y + (await caja(p, TABLA)).h - cBarra.y }, 10, vista));
    await desmarcar(p);

    // La parte de cada uno: los disponibles suman 100.
    const parte = { "Laura Gómez": 50, "Andrés Ruiz": 30, "Sofía Martínez": 20, "Camilo Ortiz": 0 };
    for (const [nombre, valor] of Object.entries(parte)) {
        const campo = p.locator(`input[aria-label="Porcentaje de ${nombre}"]`);
        await campo.fill(String(valor));
        await campo.blur();
        await espera(p, 300);
    }
    await quitarAvisos(p);
    await apartar(p);
    await marcar(p, [{ c: await laColumnaDeLaTabla(p, "Porcentaje") }], { atenuar: true });
    await guardar(p, "porcentaje-campos.webp", holgura(await caja(p, TABLA), 14, vista));
    await desmarcar(p);

    await marcar(p, [{ c: await caja(p, SUMA) }], { atenuar: true });
    await guardar(p, "porcentaje-suma.webp", { x: cBarra.x - 10, y: cBarra.y - 10, w: Math.min(cBarra.w, 820), h: cBarra.h + 120 });
    await desmarcar(p);

    await elModo(p, "maximo").click();
    await p.waitForSelector("#max-chats", { timeout: 10000 });
    await quitarAvisos(p);

    /* 6. Medir al equipo --------------------------------------------- */
    const columnas = ["Activas", "Cerradas", "Calientes", "Convertidas", "Última actividad"];
    const cColumnas = [];
    for (const c of columnas) cColumnas.push(await laColumnaDeLaTabla(p, c));
    await marcar(
        p,
        cColumnas.map((c, i) => ({ c: { x: c.x + 3, y: c.y, w: c.w - 6, h: c.h }, n: i + 1, esquina: "centro" })),
        { atenuar: true },
    );
    const uColumnas = unir(...cColumnas);
    await guardar(p, "tabla-columnas.webp", holgura({ x: uColumnas.x, y: uColumnas.y - 12, w: uColumnas.w, h: uColumnas.h + 12 }, 16, vista));
    await desmarcar(p);

    await p.locator(GRAFICAS).scrollIntoViewIfNeeded();
    await espera(p, 600);
    for (const [grafica, nombre] of [
        ["carga", "grafica-carga.webp"],
        ["rendimiento", "grafica-rendimiento.webp"],
        ["estado-de-leads", "grafica-estado.webp"],
    ]) {
        const c = await caja(p, `[data-grafica="${grafica}"]`);
        await marcar(p, [{ c }], { atenuar: true });
        await guardar(p, nombre, holgura(c, 18, p.viewportSize()));
        await desmarcar(p);
    }
    await arriba(p);

    /* 7. Qué ve cada usuario ----------------------------------------- */
    await abrirSuMenu(p, "Andrés Ruiz");
    await apartar(p);
    const cSuMenu = await caja(p, suMenu(p, "Andrés Ruiz"));
    const cMenuAsesor = await caja(p, elMenu(p));
    const cFilaAndres = await caja(p, laFila(p, "Andrés Ruiz"));
    await marcar(p, [{ c: cFilaAndres, soloLuz: true }, { c: cSuMenu }, { c: cMenuAsesor }], { atenuar: true });
    // La fila entera: sin el nombre no se sabe de quién es el menú.
    const uMenu = unir(cFilaAndres, cSuMenu, cMenuAsesor);
    await guardar(p, "menu-del-asesor.webp", holgura({ x: uMenu.x, y: uMenu.y - 6, w: uMenu.w, h: uMenu.h + 12 }, 10, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    const modulos = await suOpcion(p, "Andrés Ruiz", "Módulos");
    await modulos.getByText(/habilitados/).waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 500);
    await marcar(p, [{ c: await caja(p, modulos) }]);
    await guardar(p, "modulos.webp", holgura(await caja(p, modulos), 24, vista));
    await desmarcar(p);
    await cerrarLasVentanas(p);

    const permisos = await suOpcion(p, "Andrés Ruiz", "Permisos");
    await permisos.locator("[data-apartados-del-modulo]").first().waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 600);
    await marcar(p, [{ c: await caja(p, permisos) }]);
    await guardar(p, "permisos.webp", holgura(await caja(p, permisos), 24, vista));
    await desmarcar(p);
    await cerrarLasVentanas(p);

    /* 8. Editar, devolver y eliminar --------------------------------- */
    const editar = await suOpcion(p, "Andrés Ruiz", "Editar asesor");
    await marcar(p, [{ c: await caja(p, editar) }]);
    await guardar(p, "editar.webp", holgura(await caja(p, editar), 24, vista));
    await desmarcar(p);

    // Otro correo: la casilla se marca sola. No se guarda: se cancela.
    await editar.locator("#edit-email").fill("andres.nuevo@banco.test");
    await espera(p, 400);
    await apartar(p);
    await soltarElFoco(p);
    // Sin rótulo: debajo de la casilla están Cancelar y Guardar.
    await marcar(p, [{ c: await caja(p, editar.locator("#edit-email")) }, { c: await caja(p, editar.locator('[data-casilla="nuevo-ocupante"]')) }], { atenuar: true });
    const cEditar = await caja(p, editar);
    await guardar(p, "editar-nuevo-ocupante.webp", holgura(cEditar, 24, vista));
    await desmarcar(p);
    await editar.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 500);

    const devolver = await suOpcion(p, "Andrés Ruiz", "Devolver leads a Sin asignar", '[role="alertdialog"]');
    await marcar(p, [{ c: await caja(p, devolver.getByRole("button", { name: "Cancelar" })), texto: "Cancelar no cambia nada", lado: "abajo" }]);
    const cDevolver = await caja(p, devolver);
    await guardar(p, "devolver.webp", holgura({ ...cDevolver, h: cDevolver.h + 70 }, 18, vista));
    await desmarcar(p);
    await devolver.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 500);

    const eliminar = await suOpcion(p, "Andrés Ruiz", "Eliminar", '[role="alertdialog"]');
    await marcar(p, [{ c: await caja(p, eliminar.getByRole("button", { name: "Cancelar" })), texto: "Cancelar no cambia nada", lado: "abajo" }]);
    const cEliminar = await caja(p, eliminar);
    await guardar(p, "eliminar.webp", holgura({ ...cEliminar, h: cEliminar.h + 70 }, 18, vista));
    await desmarcar(p);
    await eliminar.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 500);

    /* 9. El Pipeline ------------------------------------------------- */
    await conLoPendienteDeVuelta(p);
    await alPipeline(p);
    const tablero = unir(await caja(p, laColumna(p, "sin-asignar")), await caja(p, p.locator("[data-columna-del-asesor]").last()));
    await marcar(p, [{ c: await caja(p, VISTAS), texto: "Pipeline", lado: "abajo" }]);
    await guardar(p, "pipeline.webp");
    await desmarcar(p);

    // Arrastrar: la tarjeta de Hotel Los Almendros, de Sin asignar a Laura.
    const tarjeta = laTarjeta(p, "Hotel Los Almendros");
    const desde = await caja(p, tarjeta);
    const columnaLaura = p.locator("[data-columna-del-asesor]", { hasText: "Laura Gómez" }).first();
    const hasta = await caja(p, columnaLaura);
    await p.mouse.move(desde.x + desde.w / 2, desde.y + desde.h / 2);
    await p.mouse.down();
    await p.mouse.move(desde.x + desde.w / 2 + 20, desde.y + desde.h / 2 + 4, { steps: 6 });
    const destino = { x: hasta.x + hasta.w / 2, y: hasta.y + 140 };
    await p.mouse.move(destino.x - 60, destino.y, { steps: 25 });
    await espera(p, 500);
    await marcar(p, [
        { c: await caja(p, laColumna(p, "sin-asignar").locator("div").first()), texto: "Sin asignar", lado: "abajo", sinRecuadro: true },
        { c: hasta },
    ]);
    await guardar(p, "pipeline-arrastrar.webp", holgura(unir(desde, hasta), 24, vista));
    await desmarcar(p);
    await p.mouse.move(destino.x, destino.y, { steps: 6 });
    await p.mouse.up();
    await columnaLaura.getByText("Hotel Los Almendros").waitFor({ state: "visible", timeout: 20000 });
    await quitarAvisos(p);

    const buscador = p.locator('input[aria-label="Buscar contacto"]');
    await buscador.fill("maria");
    await espera(p, 800);
    await apartar(p);
    const cBuscador = await caja(p, buscador);
    const cCuenta = await caja(p, buscador.locator("xpath=../..").locator("div.ml-auto span").first());
    await marcar(
        p,
        [
            { c: cBuscador, texto: "Sin tildes: «maria» encuentra «María»", lado: "derecha" },
            // A la izquierda del número: debajo está la cabecera de una columna.
            { c: cCuenta, texto: "Coinciden / total", lado: "izquierda" },
        ],
        { atenuar: true },
    );
    await guardar(p, "pipeline-buscar.webp", holgura({ x: cBuscador.x, y: cBuscador.y, w: cCuenta.x + cCuenta.w - cBuscador.x, h: 380 }, 14, vista));
    await desmarcar(p);
    await buscador.fill("");
    await espera(p, 600);

    // El aviso de «Contacto reasignado» llega cuando contesta el servidor, a
    // veces después del primer `quitarAvisos`: saldría encima del panel.
    await quitarAvisos(p);
    await p.locator('button[aria-label="Automatizaciones de Laura Gómez"]').click();
    const panel = laVentana(p);
    await panel.getByText("Bienvenida de Laura").waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 700);
    await apartar(p);
    await soltarElFoco(p);
    await marcar(p, [{ c: await caja(p, panel) }], { atenuar: true });
    await guardar(p, "pipeline-automatizaciones.webp", { x: vista.width - 760, y: 0, w: 760, h: vista.height });
    await desmarcar(p);
    await cerrarLasVentanas(p);
    await comoAlAbrir(p);

    /* 10. Asignar sin atender y más acciones ------------------------- */
    const asignar = p.locator(ASIGNAR);
    await marcar(p, [{ c: await caja(p, asignar), texto: "Asignar sin atender", lado: "abajo" }], { atenuar: true });
    await guardar(p, "asignar-boton.webp", holgura({ ...zonaDeArriba, h: cBarra.h + 110 }, 10, vista));
    await desmarcar(p);

    await asignar.click();
    const aviso = p.locator("[data-sonner-toast]").first();
    await aviso.waitFor({ state: "visible", timeout: 20000 });
    // La tabla vuelve a leer la carga de cada persona después del aviso.
    await espera(p, 2500);
    await soltarElFoco(p);
    await p.mouse.move(10, 450);
    const cAviso = await caja(p, aviso);
    await marcar(p, [{ c: cAviso }, { c: await caja(p, TABLA), soloLuz: true }], { atenuar: true });
    await guardar(p, "asignar-resultado.webp");
    await desmarcar(p);
    await quitarAvisos(p);

    await p.locator(`${ACCIONES} button`).click();
    await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    const cMas = await caja(p, `${ACCIONES} button`);
    const cSuMenuMas = await caja(p, elMenu(p));
    await marcar(p, [{ c: cMas }, { c: cSuMenuMas }], { atenuar: true });
    const uMas = unir(cMas, cSuMenuMas);
    await guardar(p, "mas-acciones.webp", holgura({ x: uMas.x - 380, y: uMas.y - 12, w: uMas.w + 380, h: uMas.h + 24 }, 10, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    /* El marco: el menú y la barra de arriba ------------------------- */
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Entrenamiento", texto: "Usuarios está en Entrenamiento" });

    // El tablero entero de la foto del Pipeline no se usa de recorte: la
    // captura va a pantalla completa (se ven las cinco columnas).
    void tablero;
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cuánto se respira entre una frase y la siguiente: lo justo para que no se
 * monten, y no más —el ritmo lo pone la voz, no el guion—. Es el mismo de
 * Leads, Catálogo, Diagramas, Reuniones y Mis notas. Queda escrito en
 * `voz-de-la-guia/usuarios.json` con el vídeo.
 */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

/**
 * El vídeo: qué se hace en pantalla mientras suena cada frase de
 * `narracion-guia-usuarios.mjs`. La voz se coloca con `empezarLaNarracion` del
 * taller y se graba con la grabadora de todas las guías.
 */
/**
 * Desplaza la pantalla con la rueda, suave (el vídeo lo enseña), hasta que
 * `locator` quede a `arriba` px del borde de arriba. Hace falta en los dos
 * sentidos: bajar a las gráficas, y VOLVER a subir antes de pulsar Pipeline
 * —el ratón pulsa donde está el botón, y si quedó fuera de la pantalla el clic
 * cae en otra cosa y la vista no cambia—. El ratón va primero a `sobre`, que
 * es lo que se desplaza.
 */
async function desplazarHasta(p, locator, { arriba = 160, sobre = { x: 760, y: 520 } } = {}) {
    const b = await locator.boundingBox();
    if (!b) throw new Error(`[guia] no se ve hasta dónde desplazar: ${locator}`);
    const delta = Math.round(b.y - arriba);
    if (Math.abs(delta) < 24) return;
    await p.mouse.move(sobre.x, sobre.y, { steps: 10 });
    const pasos = Math.max(4, Math.round(Math.abs(delta) / 60));
    for (let i = 0; i < pasos; i += 1) {
        await p.mouse.wheel(0, delta / pasos);
        await espera(p, 28);
    }
    await espera(p, 250);
}

/**
 * A 1280 px la barra de trabajo no cabe entera —le sobran unos píxeles— y su
 * carril enseña la flecha «Ver más filtros» ENCIMA del final: lo que queda
 * debajo se ve a medias y el clic se lo lleva la flecha (se comprobó: el
 * Pipeline no llegaba nunca a abrirse). Como haría una persona, se pulsa la
 * flecha que lo tapa y después lo que se quería.
 */
async function alAlcance(p, locator) {
    for (let i = 0; i < 3; i += 1) {
        const b = await locator.boundingBox();
        if (!b) return;
        const tapa = await p.evaluate(({ x, y }) => {
            const flecha = document.elementFromPoint(x, y)?.closest('button[aria-label^="Ver "]');
            return flecha && !flecha.hasAttribute("data-vista") ? flecha.getAttribute("aria-label") : null;
        }, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
        if (!tapa) return;
        await pulsar(p, p.locator(`button[aria-label="${tapa}"]`).first());
        await espera(p, 600);
    }
    throw new Error(`[guia] la flecha de la barra sigue tapando: ${locator}`);
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
    const p = await ctx.newPage();
    // No `recordVideo`: estiraba el vídeo cada vez que el navegador pintaba
    // deprisa y la imagen se iba quedando detrás de la voz (ver la grabadora).
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirEquipo(p);
    // Dónde empieza la tabla con la página arriba del todo: al volver del
    // Pipeline se deja otra vez ahí (ver «permisos»).
    const arribaDeLaTabla = (await p.locator(TABLA).boundingBox()).y;
    await p.mouse.move(640, 400, { steps: 8 });
    // Lo grabado hasta aquí es la página cargando: el vídeo empieza justo
    // antes de la primera palabra.
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("armas tu equipo", 500);
    await mover(p, p.locator(TABLA));
    await alDecir("cuánto lleva cada persona", 200);
    await mover(p, laFila(p, "Laura Gómez").locator("td").first());
    await alDecir("cómo se reparten los chats", 200);
    await mover(p, p.locator(AUTO));

    // El menú de la izquierda: se abre con las dos flechas, se señala dónde
    // está Usuarios y se vuelve a recoger al empezar la frase siguiente, que es
    // la de la barra donde viven las flechas.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const entrenamiento = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Entrenamiento" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Entrenamiento", 600);
    await mover(p, entrenamiento);

    const [, , , buscarTodo, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // Crear: la ventana de Nuevo, sus datos, y se crea.
    await decir("crear");
    await alDecir("el botón Nuevo");
    await pulsar(p, p.locator(`${CREAR} button`));
    const crear = laVentana(p);
    await crear.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("su nombre", 150);
    await pulsar(p, crear.locator("#adv-name"));
    await p.keyboard.type("Camilo Ortiz", { delay: 35 });
    await alDecir("su correo", 150);
    await pulsar(p, crear.locator("#adv-email"));
    await p.keyboard.type("camilo@banco.test", { delay: 25 });
    await alDecir("una contraseña", 100);
    await pulsar(p, crear.locator("#adv-pw"));
    await p.keyboard.type("banco1234", { delay: 25 });
    await alDecir("su rol", 100);
    await mover(p, crear.locator("#adv-role"));
    await alDecir("ya puede entrar", 150);
    await pulsar(p, crear.getByRole("button", { name: "Crear asesor" }));
    await laFila(p, "Camilo Ortiz").waitFor({ state: "visible", timeout: 20000 });

    // Rol y disponibilidad.
    await decir("rol");
    await alDecir("le cambias el rol", 200);
    await mover(p, laFila(p, "Camilo Ortiz").getByRole("combobox"));
    await alDecir("con Disponible", 200);
    await mover(p, laFila(p, "Valeria Torres").getByRole("switch"));
    await alDecir("el punto verde", 200);
    await mover(p, susIniciales(p, "Laura Gómez"));

    // Medir: las columnas y, debajo, las gráficas.
    await decir("medir");
    await alDecir("cuántas conversaciones lleva", 100);
    await mover(p, laFila(p, "Laura Gómez").locator("td").nth(3));
    await alDecir("calientes", 100);
    await mover(p, laFila(p, "Laura Gómez").locator("td").nth(5));
    await alDecir("convirtió", 100);
    await mover(p, laFila(p, "Laura Gómez").locator("td").nth(6));
    await alDecir("en gráficas", 100);
    await desplazarHasta(p, p.locator(GRAFICAS), { arriba: 260 });
    await mover(p, p.locator('[data-grafica="rendimiento"]'));

    // El Pipeline: una columna por persona, y un contacto arrastrado.
    await decir("pipeline");
    await alDecir("el Pipeline", 0);
    await desplazarHasta(p, laVista(p, "pipeline"), { arriba: 90 });
    await alAlcance(p, laVista(p, "pipeline"));
    await pulsar(p, laVista(p, "pipeline"));
    await p
        .waitForSelector('[data-columna-del-asesor="sin-asignar"] [data-tarjeta-del-contacto]', { timeout: 30000 })
        .catch(async (e) => {
            // Un plazo agotado a secas no dice qué había en la pantalla.
            await p.screenshot({ path: path.join(TMP, "video-fallo.png") });
            const b = await laVista(p, "pipeline").boundingBox();
            const debajo = b
                ? await p.evaluate(({ x, y }) => {
                      const cadena = [];
                      for (let e = document.elementFromPoint(x, y); e && cadena.length < 5; e = e.parentElement) {
                          cadena.push(`${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}[${[...e.attributes].filter((a) => a.name.startsWith("data-") || a.name.startsWith("aria-")).map((a) => `${a.name}=${a.value}`).join(" ")}]`);
                      }
                      return cadena;
                  }, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
                : ["(sin caja)"];
            console.error(`[guia] el Pipeline no llegó; así estaba la pantalla: ${path.join(TMP, "video-fallo.png")}`);
            console.error(`[guia] en el centro del botón había: ${debajo.join(" < ")}`);
            throw e;
        });
    await alDecir("su columna", 100);
    await mover(p, p.locator("[data-columna-del-asesor]", { hasText: "Laura Gómez" }).first());
    await alDecir("arrastras un contacto", 0);
    const tarjeta = laTarjeta(p, "Hotel Los Almendros");
    const desde = await tarjeta.boundingBox();
    const hasta = await p.locator("[data-columna-del-asesor]", { hasText: "Andrés Ruiz" }).first().boundingBox();
    await p.mouse.move(desde.x + desde.width / 2, desde.y + desde.height / 2, { steps: 16 });
    await p.mouse.down();
    await p.mouse.move(desde.x + desde.width / 2 + 20, desde.y + desde.height / 2 + 4, { steps: 5 });
    await p.mouse.move(hasta.x + hasta.width / 2, hasta.y + 140, { steps: 30 });
    await espera(p, 200);
    await p.mouse.up();

    // Qué ve cada persona: el «⋯» de su fila, Módulos y Permisos.
    await decir("permisos");
    await alAlcance(p, laVista(p, "tabla"));
    await pulsar(p, laVista(p, "tabla"));
    await p.waitForSelector(TABLA, { timeout: 20000 });
    // La página se quedó desplazada desde las gráficas: la tabla vuelve a su
    // sitio, o la primera fila queda debajo de la barra y lo que viene
    // (porcentajes incluidos) se pulsaría a ciegas.
    await desplazarHasta(p, p.locator(TABLA), { arriba: arribaDeLaTabla });
    await alDecir("el menú de cada fila", 0);
    await pulsar(p, suMenu(p, "Laura Gómez"));
    await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
    await alDecir("sus módulos", 100);
    await mover(p, elMenu(p).getByRole("menuitem", { name: "Módulos" }));
    await alDecir("sus permisos", 100);
    await mover(p, elMenu(p).getByRole("menuitem", { name: "Permisos" }));

    // Asignar sin atender reparte lo que estaba sin asesor. Va ANTES de los
    // modos: cambiar de modo con la auto-asignación encendida también reparte
    // lo pendiente, y aquí se quiere ver este botón haciéndolo.
    await decir("asignar");
    await p.keyboard.press("Escape");
    await alDecir("Asignar sin atender", 0);
    await pulsar(p, p.locator(ASIGNAR));
    await alDecir("todo lo que estaba sin asesor", 200);
    await mover(p, p.locator(TABLA));

    // La auto-asignación y el tope.
    await decir("reparto");
    await alDecir("la auto-asignación encendida", 150);
    await alAlcance(p, p.locator("#auto-assign-toggle"));
    await mover(p, p.locator("#auto-assign-toggle"));
    await alDecir("un tope de chats", 150);
    await alAlcance(p, p.locator("#max-chats"));
    await mover(p, p.locator("#max-chats"));
    await alDecir("sin tope", 100);
    await alAlcance(p, elModo(p, "ilimitado"));
    await mover(p, elModo(p, "ilimitado"));

    // Por porcentaje: el modo, la parte de cada uno y la suma en verde.
    await decir("porcentaje");
    await alDecir("por porcentaje", 0);
    await alAlcance(p, elModo(p, "porcentaje"));
    await pulsar(p, elModo(p, "porcentaje"));
    await p.waitForSelector('[data-columna="porcentaje"]', { timeout: 10000 });
    await alDecir("su parte", 100);
    for (const [nombre, valor] of [["Laura Gómez", "50"], ["Andrés Ruiz", "30"], ["Sofía Martínez", "20"], ["Camilo Ortiz", "0"]]) {
        const campo = p.locator(`input[aria-label="Porcentaje de ${nombre}"]`);
        await pulsar(p, campo);
        // Sin el foco dentro, Ctrl+A selecciona la PÁGINA entera (pasó: la
        // fila estaba debajo de la barra) y el número cae en otro sitio.
        if (!(await campo.evaluate((e) => e === document.activeElement))) throw new Error(`[guia] el porcentaje de ${nombre} no recibió el foco`);
        await p.keyboard.press("Control+A");
        await p.keyboard.type(valor, { delay: 60 });
    }
    await alDecir("en verde", 0);
    await p.locator(SUMA, { hasText: /^\s*Suma 100%\s*$/ }).waitFor({ state: "visible", timeout: 5000 });
    await mover(p, p.locator(SUMA));
    await alDecir("Así se trabaja con Usuarios", 0);
    await mover(p, p.locator(TABLA));
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
    escribirLaVozDelVideo("usuarios", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
    const p = await entrar(ctx, BASE);
    await abrirEquipo(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        // Las capturas cambiaron los datos: el vídeo sale del punto de partida.
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-usuarios.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

// Las que la guía enseña tienen que estar TODAS. Con SOLO_MINIATURAS o
// SOLO_VIDEO, lo demás se conserva del disco: basta con que esté.
comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/usuarios`);
