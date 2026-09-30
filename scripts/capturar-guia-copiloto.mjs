/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Copiloto, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-copiloto.mjs`) y con el COPILOTO de verdad dentro: el mismo
 * LibreChat v0.8.7 de producción, levantado en local por
 * `copiloto-de-la-guia.sh` con la IA de ejemplo en lugar de OpenAI.
 *
 * La MISMA forma que las guías de Leads, Catálogo, Diagramas, Reuniones y Mis
 * notas: cada captura es una receta —abre esto, pulsa aquello, resalta este
 * elemento— y las marcas se dibujan encima de la pantalla real. Lo que no
 * depende de la pantalla —entrar, medir, marcar, guardar, las miniaturas, el
 * marco (el menú y la barra de arriba) y la narración— viene del taller común
 * de las guías (`taller-de-la-guia.mjs`). Aquí van solo las recetas de Copiloto.
 *
 * Lo de dentro del copiloto vive en un MARCO (`<iframe>`): se localiza con
 * `frameLocator` por lo que el propio copiloto expone —sus `aria-label`, sus
 * `title` y sus `data-testid`—, y sus cajas salen en coordenadas de la página,
 * así que las marcas se pintan encima igual que en las demás guías. Los
 * rótulos que se ven dentro los apunta `anotar()` en
 * `scripts/copiloto-guia-librechat.json`, y el banco exige que cada etiqueta que
 * la guía nombra estuviera en pantalla.
 *
 * Las capturas CAMBIAN los datos (el copiloto gana conversaciones, archiva una,
 * se fija en Chats), así que antes del vídeo se vuelve a sembrar la plataforma
 * y se deja el copiloto como al empezar.
 *
 * Las miniaturas se toman al llegar a cada estado (`tomarUnaMiniatura`), como
 * en Reuniones: la de «Entrar por primera vez» solo existe antes de entrar.
 *
 * Se lanza con `scripts/generar-guia-copiloto.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
    COPILOTO_LOCAL,
    cuantasRespuestas,
    dejarElCopilotoComoAlEmpezar,
    entrarAlCopiloto,
    entrarEnElContexto,
    esperarElTitulo,
    esperarLaRespuesta,
    preguntarYEsperar,
} from "./copiloto-de-la-guia/preparar.mjs";
import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-copiloto.mjs";
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
    tomarUnaMiniatura,
    unir,
} from "./taller-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

if (process.env.SOLO_MINIATURAS === "1") {
    console.error("[guia] En Copiloto las miniaturas se toman al llegar a cada estado: no hay SOLO_MINIATURAS. Usa SIN_VIDEO=1.");
    process.exit(1);
}

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "copiloto");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-copiloto";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo el vídeo: las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-copiloto.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-copiloto.json");
/** Los rótulos que enseñó el copiloto: el banco compara la guía con esto. */
const ROTULOS = path.join(RAIZ, "scripts", "copiloto-guia-librechat.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });
const focos = {};

/* ------------------------------------------------------------------ */
/* Dónde está cada cosa                                                */
/* ------------------------------------------------------------------ */

/** La pantalla de Copiloto de la plataforma, con el copiloto local dentro. */
const LA_PANTALLA = `${BASE}/copiloto?u=${encodeURIComponent(COPILOTO_LOCAL)}`;
/** La conversación de Chats donde sale la pestaña del copiloto (la de `sembrar-guia-copiloto.mjs`). */
const EL_CHAT = `${BASE}/chats?jid=${encodeURIComponent("573001112233@s.whatsapp.net")}&instance=BANCO_VENTAS`;

const MANDOS = "[data-mandos-del-copiloto]";
const botonFijar = (p) => p.locator(`${MANDOS} [data-mando="fijar"]`);
const botonPantalla = (p) => p.locator(`${MANDOS} [data-mando="pantalla-completa"]`);

/** El copiloto, dentro de su marco. */
const cp = (p) => p.frameLocator("[data-marco-del-copiloto] iframe");
/** El documento del copiloto (para leer lo que enseña): el marco que carga el copiloto local. */
const elDocumento = (p) => p.frames().find((f) => f.url().startsWith(COPILOTO_LOCAL));

const PANEL = 'aside[aria-label="Control Panel"]';
const LA_LISTA = '[aria-label="Conversations"]';
const CAJA_DE_ESCRIBIR = "form:has(#prompt-textarea)";
const TEXTO = "#prompt-textarea";
/** Un botón del copiloto por su rótulo, sea `aria-label` o `title`: el copiloto usa los dos. */
const porRotulo = (donde, rotulo) => donde.locator(`button[aria-label="${rotulo}"], button[title="${rotulo}"], a[aria-label="${rotulo}"]`).first();
/** Un mensaje de la conversación, por su posición («Mensaje 1», «Mensaje 2»…). */
const elMensaje = (p, n) => cp(p).locator(`[aria-label="Mensaje ${n}"]`);
/** Una conversación de la lista, por su título. */
const laFila = (p, titulo) => cp(p).locator('[data-testid="convo-item"]', { hasText: titulo }).first();
/** El menú del copiloto que está abierto (Radix lo pinta dentro de su documento). */
const elMenu = (p) => cp(p).getByRole("menu").last();

/** Lo que se escribe en la guía: el recordatorio de la cita de Camila, y la segunda vuelta. */
const PREGUNTA = "Escribe el recordatorio de la cita de mañana a las 10 para Camila";
const OTRA_VEZ = "Hazlo más corto";
const EL_RECLAMO = "reclamo-pedido-1045.txt";

/* ------------------------------------------------------------------ */
/* Abrir, apuntar y apartar                                            */
/* ------------------------------------------------------------------ */

/**
 * La «Guía rápida» de la plataforma (`ChatOnboardingModal`) se abre sola la
 * primera vez que una pestaña entra, con un velo que se come el primer clic.
 * Aquí no basta con `despejar`: el foco se queda DENTRO del marco del copiloto
 * y el Escape le llega a él, no al diálogo de fuera. Así que se da por vista
 * antes de cargar nada, en los dos contextos —las capturas y el vídeo—. Sin
 * esto, el primer clic del vídeo cerraba la guía en vez de abrir el menú.
 */
const SIN_LA_GUIA_RAPIDA = () => {
    try {
        localStorage.setItem("chat-onboarding-shown", "true");
    } catch {
        /* sin almacenamiento, la guía sale y `despejar` la aparta */
    }
};

/** Abre la pantalla y espera a que el copiloto de dentro enseñe `esperar`. */
async function abrirCopiloto(p, esperar = TEXTO) {
    await p.goto(LA_PANTALLA, { waitUntil: "domcontentloaded" });
    await cp(p).locator(esperar).first().waitFor({ state: "visible", timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 1500);
    await despejar(p);
    // Los botones del borde (nota rápida, copiloto, equipo) son de TODAS las
    // pantallas: aquí tapan los botones de la derecha del copiloto.
    await esconderLosBotonesDelBorde(p);
}

/**
 * El ratón, fuera de todo: un botón con el cursor encima sale resaltado, y un
 * mensaje del copiloto con el cursor encima enseña sus botones.
 */
const apartar = (p) => p.mouse.move(p.viewportSize().width - 12, p.viewportSize().height - 12);

/** Los rótulos que enseña el copiloto AHORA, apuntados para el banco. */
const vistas = new Set();
async function anotar(p) {
    const doc = elDocumento(p);
    if (!doc) return;
    const rotulos = await doc.evaluate(() => {
        const seVe = (e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };
        const out = [];
        for (const e of document.querySelectorAll("[aria-label], [title]")) {
            if (!seVe(e)) continue;
            for (const a of ["aria-label", "title"]) if (e.getAttribute(a)) out.push(e.getAttribute(a));
        }
        // El texto que SE LEE: sin lo que solo oye un lector de pantalla. La
        // opción marcada del selector lleva dentro un «seleccionado» escondido,
        // y con él pegado («OpenAIseleccionado») no casaría con lo que la guía nombra.
        // El copiloto lo esconde de DOS formas: con la clase `sr-only` y con un
        // estilo en línea (recorte a 0 y 1 px, el de su componente de oculto).
        const loQueSeLee = (e) => {
            const copia = e.cloneNode(true);
            for (const oculto of copia.querySelectorAll('.sr-only, [style*="clip: rect(0"], [style*="clip:rect(0"]')) oculto.remove();
            return (copia.textContent ?? "").replace(/\s+/g, " ").trim();
        };
        for (const e of document.querySelectorAll('[role="menuitem"], [role="option"], [role="tab"], a, button, h1, h2')) {
            if (!seVe(e)) continue;
            const t = loQueSeLee(e);
            if (t && t.length <= 60) out.push(t);
        }
        return out;
    });
    for (const r of rotulos) vistas.add(r.trim());
}

/** Una miniatura con la receta de siempre, apuntando dónde quedó su recuadro. */
async function miniatura(p, slug, foco) {
    await apartar(p);
    Object.assign(focos, await tomarUnaMiniatura(p, slug, foco, { salida: SALIDA, tomadas }));
}

/**
 * Las marcas se pintan en el `<body>`; a pantalla completa lo único que se ve
 * es el elemento que la ocupa, así que se mudan dentro de él.
 */
const marcasAlFrente = (p) =>
    p.evaluate(() => {
        const svg = document.getElementById("__guia");
        if (svg && document.fullscreenElement) document.fullscreenElement.appendChild(svg);
    });

/**
 * Un recorte que arranca en el borde del panel del copiloto: con holgura, se
 * colaba por la izquierda un trozo del menú de la plataforma.
 */
function desdeElPanel(c, cPanel) {
    const x = Math.max(c.x, cPanel.x - 2);
    return { ...c, x, w: c.w - (x - c.x) };
}

/**
 * El copiloto avisa «Successfully deleted» arriba al quitar un adjunto, y el
 * aviso tarda en salir: se espera a que APAREZCA y a que se vaya solo, o sale
 * encima de la respuesta de la captura siguiente.
 */
async function sinElAvisoDeBorrado(f) {
    const aviso = f.getByText("Successfully deleted").first();
    await aviso.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    await aviso.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
}

/** Cierra lo que haya abierto dentro del copiloto (un menú, un selector, una ventana). */
async function cerrarEnElCopiloto(p) {
    for (let i = 0; i < 3; i += 1) {
        const abiertos = await cp(p).locator('[role="menu"], [role="dialog"], [role="listbox"]').count();
        if (!abiertos) break;
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();
    const f = cp(p);

    /* 1. Entrar por primera vez -------------------------------------- */
    await abrirCopiloto(p, 'input[name="email"]');
    await anotar(p);
    await f.locator('input[name="email"]').fill("jefe@banco.test");
    await f.locator('input[name="password"]').fill("banco1234");
    const cEntrada = await caja(p, f.locator("form").first());
    await marcar(p, [{ c: cEntrada, texto: "Tu cuenta del copiloto", lado: "izquierda" }]);
    await guardar(p, "entrar.webp");
    await desmarcar(p);
    await miniatura(p, "primera-vez", cEntrada);

    await f.getByRole("link", { name: "Regístrese" }).click();
    await f.getByRole("heading", { name: "Crear su cuenta" }).waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 800);
    await anotar(p);
    await marcar(p, [{ c: await caja(p, f.locator("form").first()), texto: "Nombre, correo y contraseña", lado: "izquierda" }]);
    await guardar(p, "registro.webp");
    await desmarcar(p);
    // «Iniciar sesión» es un enlace sin `href`: no tiene rol de enlace.
    await f.getByText("Iniciar sesión", { exact: true }).click();
    await entrarAlCopiloto(f);
    await espera(p, 2000);
    await apartar(p);
    await anotar(p);

    // El saludo se pinta letra a letra; su texto entero está en un `sr-only`,
    // y lo que se ve es la caja que lo contiene.
    const saludo = f.locator("main span.sr-only", { hasText: "Mi Negocio" }).first().locator("xpath=..");
    await marcar(p, [
        { c: await caja(p, saludo), texto: "Te saluda por tu nombre", lado: "arriba" },
        { c: await caja(p, f.locator(CAJA_DE_ESCRIBIR)), texto: "Aquí escribes", lado: "abajo" },
    ]);
    await guardar(p, "bienvenida.webp");
    await desmarcar(p);

    /* 2. La caja de escribir y adjuntar ------------------------------ */
    const cCaja = await caja(p, f.locator(CAJA_DE_ESCRIBIR));
    const botonesDeLaCaja = ["Attach File Options", "Tools Options", "Usar micrófono", "Enviar mensaje"];
    const cBotones = [];
    for (const r of botonesDeLaCaja) cBotones.push(await caja(p, porRotulo(f, r)));
    await marcar(p, [{ c: cCaja }, ...cBotones.map((c, i) => ({ c, n: i + 1, sinRecuadro: true, esquina: "centro", borde: "abajo" }))]);
    await guardar(p, "caja.webp", holgura(cCaja, 40, vista));
    await desmarcar(p);

    await marcar(p, [{ c: cBotones[2], texto: "Dictar", lado: "abajo" }]);
    await guardar(p, "dictar.webp", holgura({ ...cCaja, h: cCaja.h + 110 }, 40, vista));
    await desmarcar(p);

    await porRotulo(f, "Attach File Options").click();
    const menuDelClip = elMenu(p);
    await menuDelClip.getByText("Subir como texto").waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await anotar(p);
    const cClip = unir(cBotones[0], await caja(p, menuDelClip));
    await marcar(p, [{ c: await caja(p, menuDelClip) }, { c: cBotones[0] }]);
    await guardar(p, "clip.webp", holgura(unir(cCaja, cClip), 40, vista));
    await desmarcar(p);
    await miniatura(p, "archivos", cClip);

    // Un archivo de verdad, subido como texto: el reclamo de un cliente.
    const reclamo = path.join(TMP, EL_RECLAMO);
    writeFileSync(
        reclamo,
        "Pedido 1045 — Reclamo de Laura Gómez\n\n" +
            "El paquete llegó dos días tarde y con la caja golpeada. Uno de los dos vasos venía roto.\n" +
            "Pide que le cambien el vaso o que le devuelvan su valor.\n",
    );
    if (!(await elMenu(p).count())) await porRotulo(f, "Attach File Options").click();
    const [elegir] = await Promise.all([p.waitForEvent("filechooser"), elMenu(p).getByText("Subir como texto").click()]);
    await elegir.setFiles(reclamo);
    const adjunto = f.locator(`button[aria-label="${EL_RECLAMO}"]`);
    await adjunto.waitFor({ state: "visible", timeout: 20000 });
    await f.locator(TEXTO).fill("Resume este reclamo en tres puntos");
    await espera(p, 800);
    await apartar(p);
    const cConAdjunto = await caja(p, f.locator(CAJA_DE_ESCRIBIR));
    await marcar(p, [{ c: await caja(p, adjunto), texto: "El archivo adjunto", lado: "arriba" }]);
    await guardar(p, "adjunto.webp", holgura({ x: cConAdjunto.x, y: cConAdjunto.y - 90, w: cConAdjunto.w, h: cConAdjunto.h + 90 }, 40, vista));
    await desmarcar(p);
    // Se quita sin enviarlo: las capturas de después son de otra conversación.
    await f.locator('button[aria-label="Eliminar archivo"]').first().click();
    await adjunto.waitFor({ state: "detached", timeout: 10000 });
    await f.locator(TEXTO).fill("");
    await sinElAvisoDeBorrado(f);

    /* 3. Hacer una pregunta ------------------------------------------ */
    await f.locator(TEXTO).fill(PREGUNTA);
    await espera(p, 500);
    await apartar(p);
    const cEscrita = await caja(p, f.locator(CAJA_DE_ESCRIBIR));
    await marcar(p, [{ c: await caja(p, f.locator(TEXTO)), texto: "Enter para enviar", lado: "abajo" }]);
    await guardar(p, "escribir.webp", holgura({ ...cEscrita, h: cEscrita.h + 100 }, 40, vista));
    await desmarcar(p);

    const antes = await cuantasRespuestas(f, PREGUNTA);
    await f.locator(TEXTO).press("Enter");
    await esperarLaRespuesta(f, PREGUNTA, antes);
    await esperarElTitulo(f, "Recordatorio de cita");
    // La conversación se enseña con la lista RECOGIDA: abierta, a los lados de
    // los mensajes no queda sitio para los rótulos y caerían encima de los
    // títulos de la lista. Se vuelve a abrir antes del selector de la IA.
    await sinElAvisoDeBorrado(f);
    await porRotulo(f, "Cerrar barra lateral").click();
    await f.locator('[data-testid="open-sidebar-button"]').waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 1200);
    await apartar(p);
    await anotar(p);
    const cPregunta = await caja(p, elMensaje(p, 1));
    const cRespuesta = await caja(p, elMensaje(p, 2));
    await marcar(p, [
        { c: cPregunta, texto: "Tu pregunta", lado: "izquierda" },
        { c: cRespuesta, texto: "La respuesta", lado: "izquierda" },
    ]);
    const cConversacion = unir(cPregunta, cRespuesta);
    await guardar(p, "respuesta.webp", holgura({ x: cConversacion.x - 200, y: cConversacion.y, w: cConversacion.w + 200, h: cConversacion.h }, 30, vista));
    await desmarcar(p);

    await preguntarYEsperar(f, OTRA_VEZ);
    await espera(p, 1200);
    await apartar(p);
    await anotar(p);
    const cOtraVez = await caja(p, elMensaje(p, 3));
    const cCorta = await caja(p, elMensaje(p, 4));
    await marcar(p, [
        { c: cOtraVez, texto: "Le pides un cambio", lado: "izquierda" },
        { c: cCorta, texto: "Te la vuelve a escribir", lado: "izquierda" },
    ]);
    const cSeguir = unir(cOtraVez, cCorta);
    await guardar(p, "seguir.webp", holgura({ x: cSeguir.x - 240, y: cSeguir.y, w: cSeguir.w + 240, h: cSeguir.h }, 30, vista));
    await desmarcar(p);
    await miniatura(p, "preguntar", cSeguir);

    /* 4. Qué hacer con una respuesta --------------------------------- */
    // Los botones de la última respuesta se ven siempre; los de las demás,
    // solo con el ratón encima.
    const ultima = elMensaje(p, 4);
    const botonesDeLaRespuesta = ["Leer en voz alta", "Copiar al portapapeles", "Editar", "Open Fork Menu", "Love this", "Needs improvement", "Regenerar"];
    const cDeLaRespuesta = [];
    for (const r of botonesDeLaRespuesta) cDeLaRespuesta.push(await caja(p, porRotulo(ultima, r)));
    const cFilaDeBotones = unir(...cDeLaRespuesta);
    await marcar(p, [{ c: cFilaDeBotones }, ...cDeLaRespuesta.map((c, i) => ({ c, n: i + 1, sinRecuadro: true, esquina: "centro", borde: "abajo" }))]);
    await guardar(p, "botones-de-la-respuesta.webp", holgura({ ...cCorta, h: cCorta.h + 40 }, 30, vista));
    await desmarcar(p);
    await miniatura(p, "respuestas", cFilaDeBotones);

    // Sin rótulo: a su derecha están los otros botones y debajo, la caja de
    // escribir; cualquiera de los dos lo taparía.
    await marcar(p, [{ c: cDeLaRespuesta[1] }]);
    await guardar(p, "copiar.webp", holgura({ ...cCorta, h: cCorta.h + 30 }, 30, vista));
    await desmarcar(p);

    // «Editar» es de TU pregunta: sale con el ratón encima de ella.
    await elMensaje(p, 3).hover();
    await espera(p, 500);
    await anotar(p);
    const cEditar = await caja(p, porRotulo(elMensaje(p, 3), "Editar"));
    await marcar(p, [
        { c: cEditar, texto: "Cambiar tu pregunta", lado: "derecha" },
        { c: cDeLaRespuesta[6], texto: "Otra versión", lado: "derecha" },
    ]);
    await guardar(p, "regenerar.webp", holgura({ ...cSeguir, h: cSeguir.h + 30 }, 30, vista));
    await desmarcar(p);
    await apartar(p);
    // La lista vuelve a su sitio: el copiloto recuerda si estaba recogida, y
    // las capturas de después —y el vídeo— la enseñan abierta.
    await f.locator('[data-testid="open-sidebar-button"]').click();
    await f.locator(LA_LISTA).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 1000);

    /* 5. La pantalla de un vistazo ----------------------------------- */
    // Portada del vídeo: la pantalla con la conversación del recordatorio.
    await guardar(p, "portada.webp");
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cPanel = await caja(p, f.locator(PANEL));
    const cMensajes = unir(await caja(p, elMensaje(p, 1)), await caja(p, elMensaje(p, 4)));
    const cLaCaja = await caja(p, f.locator(CAJA_DE_ESCRIBIR));
    const cMandos = await caja(p, MANDOS);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: dentro(cPanel, 6), n: 3 },
        { c: cMensajes, n: 4 },
        { c: cLaCaja, n: 5 },
        { c: cMandos, n: 6 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);
    await miniatura(p, "vista-general", unir(cMensajes, cLaCaja));

    // El panel del copiloto: sus iconos y su lista.
    const cCerrar = await caja(p, f.locator('[data-testid="close-sidebar-button"]'));
    const cNuevo = await caja(p, f.locator('[data-testid="new-chat-button"]'));
    const cLista = await caja(p, f.locator(LA_LISTA));
    const cCuenta = await caja(p, f.locator('[data-testid="nav-user"]'));
    await marcar(p, [
        { c: dentro(cCerrar, 2), n: 1, esquina: "derecha" },
        { c: dentro(cNuevo, 2), n: 2, esquina: "derecha", borde: "abajo" },
        { c: cLista, n: 3 },
        { c: dentro(cCuenta, 2), n: 4, esquina: "derecha" },
    ]);
    await guardar(p, "panel.webp", desdeElPanel(holgura({ x: cPanel.x, y: cPanel.y, w: cPanel.w + 40, h: cPanel.h }, 20, vista), cPanel));
    await desmarcar(p);

    // La lista se enseña con un chat NUEVO al lado: con la conversación
    // abierta, los rótulos de la derecha caían encima de sus mensajes.
    await f.locator('[data-testid="new-chat-button"]').click();
    await f.locator("main span.sr-only", { hasText: "Mi Negocio" }).first().waitFor({ state: "attached", timeout: 15000 });
    await espera(p, 1200);
    await apartar(p);

    /* 6. Elegir la inteligencia artificial --------------------------- */
    // Sobre el chat nuevo: debajo del selector queda sitio para su rótulo y
    // para los dos desplegables, sin taparle texto a una conversación.
    const selector = f.locator('[data-testid="model-selector-button"]');
    const cSelector = await caja(p, selector);
    await marcar(p, [{ c: cSelector, texto: "Qué IA te contesta", lado: "abajo" }]);
    await guardar(p, "selector.webp", holgura({ x: cSelector.x, y: cSelector.y, w: 560, h: 170 }, 40, vista));
    await desmarcar(p);

    await selector.click();
    const proveedores = f.getByRole("dialog").filter({ has: f.getByRole("option", { name: "OpenAI" }) }).last();
    await proveedores.waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 600);
    await anotar(p);
    const cProveedores = await caja(p, proveedores);
    await marcar(p, [{ c: cProveedores }]);
    await guardar(p, "proveedores.webp", holgura(unir(cSelector, cProveedores), 40, vista));
    await desmarcar(p);

    await f.getByRole("option", { name: "OpenAI" }).first().hover();
    const modelos = f.getByRole("dialog").filter({ has: f.getByRole("option", { name: "gpt-4o-mini" }) }).last();
    await modelos.waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 600);
    await anotar(p);
    const cModelos = await caja(p, modelos);
    await marcar(p, [{ c: cModelos }]);
    await guardar(p, "modelos.webp", holgura(unir(cSelector, cProveedores, cModelos), 40, vista));
    await desmarcar(p);
    await miniatura(p, "modelos", unir(cSelector, cProveedores, cModelos));
    await cerrarEnElCopiloto(p);
    await apartar(p);
    await espera(p, 600);

    /* 7. Tus conversaciones ------------------------------------------ */
    const primerDia = f.locator(`${LA_LISTA} h2`).first();
    await marcar(p, [{ c: cLista }, { c: await caja(p, primerDia), texto: "Agrupadas por fecha", lado: "derecha" }]);
    await guardar(p, "lista.webp", desdeElPanel(holgura({ x: cPanel.x, y: cPanel.y, w: cPanel.w + 300, h: cLista.y + cLista.h - cPanel.y }, 20, vista), cPanel));
    await desmarcar(p);
    await miniatura(p, "conversaciones", cLista);

    const nuevoDeLaLista = porRotulo(f.locator('div[aria-label="Historial de Chat"]'), "Nuevo chat");
    const cNuevoDeLaLista = await caja(p, nuevoDeLaLista);
    await marcar(p, [{ c: cNuevo }, { c: cNuevoDeLaLista, texto: "Nuevo chat", lado: "derecha" }]);
    await guardar(p, "nuevo-chat.webp", desdeElPanel(holgura({ x: cPanel.x, y: cPanel.y, w: cPanel.w + 300, h: 260 }, 20, vista), cPanel));
    await desmarcar(p);

    // El «⋯» sale al pasar por encima de la conversación.
    const fila = laFila(p, "Respuesta a pedido de descuento");
    await fila.hover();
    await espera(p, 400);
    await fila.locator('button[aria-label="Opciones del menú de conversación"]').click();
    const menuDeLaConversacion = elMenu(p);
    await menuDeLaConversacion.getByText("Archivar").waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await anotar(p);
    const cMenuConv = await caja(p, menuDeLaConversacion);
    await marcar(p, [{ c: cMenuConv }, { c: await caja(p, fila) }]);
    await guardar(p, "menu-de-la-conversacion.webp", desdeElPanel(holgura(unir(await caja(p, fila), cMenuConv, { x: cPanel.x, y: cMenuConv.y, w: 1, h: 1 }), 30, vista), cPanel));
    await desmarcar(p);
    // Se archiva: es lo que enseña después «Conversaciones archivadas».
    await menuDeLaConversacion.getByRole("menuitem", { name: "Archivar" }).click();
    await fila.waitFor({ state: "detached", timeout: 15000 });
    await espera(p, 800);

    /* 8. Tu cuenta del copiloto -------------------------------------- */
    await apartar(p);
    await f.locator('[data-testid="nav-user"]').click();
    const menuDeLaCuenta = elMenu(p);
    await menuDeLaCuenta.getByText("Cerrar sesión").waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await anotar(p);
    const cMenuCuenta = await caja(p, menuDeLaCuenta);
    await marcar(p, [{ c: cMenuCuenta }, { c: cCuenta }]);
    await guardar(p, "menu-de-la-cuenta.webp", desdeElPanel(holgura({ x: cPanel.x, y: cMenuCuenta.y, w: cPanel.w + 60, h: cCuenta.y + cCuenta.h - cMenuCuenta.y }, 30, vista), cPanel));
    await desmarcar(p);
    await miniatura(p, "cuenta", unir(cMenuCuenta, cCuenta));

    // La miniatura cierra lo abierto solo en la página; el menú está dentro del marco.
    if (!(await elMenu(p).count())) await f.locator('[data-testid="nav-user"]').click();
    await elMenu(p).getByRole("menuitem", { name: "Configuración", exact: true }).click();
    // La ventana de Configuración es de Headless UI: su `role="dialog"` es una
    // caja de alto cero, y lo que se ve es su panel.
    const configuracion = f.locator('[id^="headlessui-dialog-panel"]').filter({ has: f.getByRole("tablist") }).last();
    await configuracion.waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 800);
    await anotar(p);
    const cConfiguracion = await caja(p, configuracion);
    await marcar(p, [{ c: await caja(p, configuracion.getByRole("tablist")) }]);
    await guardar(p, "configuracion.webp", holgura(cConfiguracion, 30, vista));
    await desmarcar(p);
    await cerrarEnElCopiloto(p);

    await f.locator('[data-testid="nav-user"]').click();
    await elMenu(p).getByRole("menuitem", { name: "Conversaciones archivadas" }).click();
    const archivadas = f.getByRole("dialog").filter({ hasText: "Respuesta a pedido de descuento" }).last();
    await archivadas.waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 800);
    await anotar(p);
    const cArchivadas = await caja(p, archivadas);
    const laArchivada = archivadas.locator("tr", { hasText: "Respuesta a pedido de descuento" }).first();
    await marcar(p, [{ c: await caja(p, laArchivada) }]);
    await guardar(p, "archivadas.webp", holgura(cArchivadas, 30, vista));
    await desmarcar(p);
    await cerrarEnElCopiloto(p);
    await apartar(p);

    /* 9. Fijar en Chats y pantalla completa -------------------------- */
    const cFijar = await caja(p, botonFijar(p));
    const cPantalla = await caja(p, botonPantalla(p));
    await marcar(p, [
        { c: dentro(cFijar, 2), n: 1 },
        { c: dentro(cPantalla, 2), n: 2, esquina: "derecha" },
    ]);
    const zonaDeLosMandos = { x: cMandos.x - 420, y: 0, w: vista.width - (cMandos.x - 420), h: cMandos.y + cMandos.h + 140 };
    await guardar(p, "botones.webp", holgura(zonaDeLosMandos, 0, vista));
    await desmarcar(p);
    await miniatura(p, "fijar-en-chats", cMandos);

    await botonFijar(p).click();
    await p.waitForFunction(() => document.querySelector('[data-mando="fijar"]')?.textContent?.includes("Quitar de Chats"), null, { timeout: 20000 });
    await quitarAvisos(p);
    await marcar(p, [{ c: await caja(p, botonFijar(p)), texto: "Ahora dice «Quitar de Chats»", lado: "abajo" }]);
    await guardar(p, "fijado.webp", holgura(zonaDeLosMandos, 0, vista));
    await desmarcar(p);

    await botonPantalla(p).click();
    await p.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 10000 });
    await espera(p, 1500);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, botonPantalla(p)), texto: "Esc, o este botón", lado: "abajo" }]);
    await marcasAlFrente(p);
    await guardar(p, "pantalla-completa.webp");
    await desmarcar(p);
    await p.evaluate(() => document.exitFullscreen());
    await p.waitForFunction(() => !document.fullscreenElement, null, { timeout: 10000 });
    await espera(p, 800);

    // La pestaña en Chats: la conversación de Camila, con el copiloto abierto.
    await p.goto(EL_CHAT, { waitUntil: "domcontentloaded" });
    const pestana = p.locator("[data-pestana-del-chat]", { hasText: "Copiloto" }).filter({ visible: true }).first();
    await pestana.waitFor({ state: "visible", timeout: 90000 });
    await espera(p, 1500);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
    await pestana.click();
    await p.frameLocator(`iframe[src^="${COPILOTO_LOCAL}"]`).locator(TEXTO).waitFor({ state: "visible", timeout: 60000 });
    await espera(p, 2000);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, pestana), texto: "La pestaña del copiloto", lado: "derecha" }]);
    await guardar(p, "en-chats.webp");
    await desmarcar(p);

    /* El marco: el menú y la barra de arriba ------------------------- */
    await abrirCopiloto(p);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Herramientas", texto: "Copiloto está en Herramientas" });

    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
    writeFileSync(ROTULOS, JSON.stringify({ copiloto: "LibreChat v0.8.7", rotulos: [...vistas].filter(Boolean).sort() }, null, 2) + "\n");
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cuánto se respira entre una frase y la siguiente: lo justo para que no se
 * monten, y no más —el ritmo lo pone la voz, no el guion—. Es el mismo de
 * todas las guías. Queda escrito en `voz-de-la-guia/copiloto.json` con el vídeo.
 */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

/**
 * El vídeo: qué se hace en pantalla mientras suena cada frase de
 * `narracion-guia-copiloto.mjs`. La voz se coloca con `empezarLaNarracion` del
 * taller y se graba con la grabadora de todas las guías.
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
    await ctx.addInitScript(SIN_LA_GUIA_RAPIDA);
    // El copiloto abre ya con la sesión puesta: la pantalla de entrada no es
    // de este vídeo. Y Chats se abre una vez antes de grabar, para que el
    // servidor la tenga caliente cuando el vídeo llegue a ella.
    await entrarEnElContexto(ctx);
    const calentar = await ctx.newPage();
    await calentar.goto(EL_CHAT, { waitUntil: "domcontentloaded" });
    await calentar.locator("[data-pestanas-del-chat]").first().waitFor({ state: "visible", timeout: 90000 }).catch(() => {});
    await calentar.close();

    const p = await ctx.newPage();
    const f = cp(p);
    // No `recordVideo`: estiraba el vídeo cada vez que el navegador pintaba
    // deprisa y la imagen se iba quedando detrás de la voz (ver la grabadora).
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirCopiloto(p);
    await p.mouse.move(700, 420, { steps: 8 });
    // Lo grabado hasta aquí es la página cargando: el vídeo empieza justo
    // antes de la primera palabra.
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("un asistente", 500);
    await mover(p, f.locator(TEXTO));
    await alDecir("mensajes, ideas", 300);
    await mover(p, f.locator(LA_LISTA));

    // El menú de la izquierda: se abre con las dos flechas, se señala dónde
    // está Copiloto y se vuelve a recoger al empezar la frase siguiente, que
    // es la de la barra donde viven las flechas.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const herramientas = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Herramientas" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Herramientas", 600);
    await mover(p, herramientas);

    const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // Preguntar: se escribe de verdad, se pulsa Enter y la respuesta llega
    // escribiéndose.
    await decir("preguntar");
    await alDecir("en la caja de abajo", 400);
    await pulsar(p, f.locator(TEXTO));
    await alDecir("por ejemplo", 300);
    await f.locator(TEXTO).pressSequentially(PREGUNTA, { delay: 26 });
    const antes = await cuantasRespuestas(f, PREGUNTA);
    await alDecir("pulsas Enter", 200);
    await p.keyboard.press("Enter");
    await esperarLaRespuesta(f, PREGUNTA, antes);

    // Seguir: «Hazlo más corto», en la misma conversación.
    await decir("seguir");
    await alDecir("se lo pides", 400);
    await pulsar(p, f.locator(TEXTO));
    const antesDeSeguir = await cuantasRespuestas(f, OTRA_VEZ);
    await f.locator(TEXTO).pressSequentially(OTRA_VEZ, { delay: 45 });
    await p.keyboard.press("Enter");
    await esperarLaRespuesta(f, OTRA_VEZ, antesDeSeguir);
    await alDecir("te la vuelve a escribir", 300);
    await mover(p, elMensaje(p, 4));

    // Los botones de la respuesta: se copia de verdad, y se señala regenerar.
    const ultima = elMensaje(p, 4);
    await decir("respuestas");
    await alDecir("sus botones", 400);
    await mover(p, porRotulo(ultima, "Leer en voz alta"));
    await alDecir("con copiar", 300);
    await pulsar(p, porRotulo(ultima, "Copiar al portapapeles"));
    await alDecir("con regenerar", 300);
    await mover(p, porRotulo(ultima, "Regenerar"));

    // La lista: guardada, con sus títulos; y Nuevo chat la deja en blanco.
    await decir("conversaciones");
    await alDecir("quedan guardadas", 400);
    await mover(p, f.locator(LA_LISTA));
    await alDecir("con su título", 300);
    await mover(p, laFila(p, "Recordatorio de cita"));
    await alDecir("con Nuevo chat", 300);
    await pulsar(p, f.locator('[data-testid="new-chat-button"]'));

    // El selector: los proveedores, y los modelos de uno al pasar por él.
    await decir("modelos");
    await alDecir("Arriba eliges", 400);
    await pulsar(p, f.locator('[data-testid="model-selector-button"]'));
    await alDecir("OpenAI", 300);
    await mover(p, f.getByRole("option", { name: "OpenAI" }).first());
    await alDecir("DeepSeek", 300);
    await mover(p, f.getByRole("option", { name: "DeepSeek" }).first());

    // El clip y el micrófono.
    await decir("archivos");
    await p.keyboard.press("Escape");
    await p.keyboard.press("Escape");
    await alDecir("Con el clip", 400);
    await pulsar(p, porRotulo(f, "Attach File Options"));
    await alDecir("para que lo lea", 300);
    await mover(p, elMenu(p).getByText("Subir como texto"));
    await alDecir("con el micrófono", 300);
    await p.keyboard.press("Escape");
    await mover(p, porRotulo(f, "Usar micrófono"));

    // Pantalla completa, y de vuelta.
    await decir("pantallaCompleta");
    await alDecir("Con este botón", 450);
    await pulsar(p, botonPantalla(p));
    await alDecir("la tecla Escape", 200);
    await p.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : null));

    // Fijar en Chats, y el copiloto como pestaña de la conversación de Camila.
    await decir("fijar");
    await alDecir("Fijar en Chats", 500);
    await pulsar(p, botonFijar(p));
    await p.waitForFunction(() => document.querySelector('[data-mando="fijar"]')?.textContent?.includes("Quitar de Chats"), null, { timeout: 20000 });
    await alDecir("una pestaña", 300);
    await p.goto(EL_CHAT, { waitUntil: "domcontentloaded" });
    await rotulo(p, NARRACION.fijar.rotulo);
    await esconderLosBotonesDelBorde(p);
    const pestana = p.locator("[data-pestana-del-chat]", { hasText: "Copiloto" }).filter({ visible: true }).first();
    await pestana.waitFor({ state: "visible", timeout: 60000 });
    // La conversación de Camila, con sus mensajes: sin esperar, el vídeo
    // enseñaba «Cargando mensajes…» justo cuando la voz dice «cada conversación».
    // Se espera un mensaje de EN MEDIO: el último sale también en la fila de
    // la lista, y esperarlo daba por cargada una conversación que no lo estaba.
    await p.getByText("¿Me confirman la cita de mañana?").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await alDecir("sin salir del chat", 300);
    await pulsar(p, pestana);
    await p.frameLocator(`iframe[src^="${COPILOTO_LOCAL}"]`).locator(TEXTO).waitFor({ state: "visible", timeout: 30000 });
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
    escribirLaVozDelVideo("copiloto", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
    console.log("  ✓ demostracion.webm", Math.round(statSync(destino).size / 1024), "KB,", colocados.length, "frases narradas");
}

/* ------------------------------------------------------------------ */

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
try {
    // El copiloto sale siempre del mismo punto: cuatro conversaciones de
    // ejemplo, cada una de otro día.
    if (!SOLO_VIDEO) await dejarElCopilotoComoAlEmpezar(navegador);
    const ctx = await navegador.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        locale: "es-CO",
        timezoneId: "America/Bogota",
    });
    await ctx.addInitScript(SIN_LA_GUIA_RAPIDA);
    const p = await entrar(ctx, BASE);
    if (!SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO) {
        // Las capturas cambiaron los datos: el vídeo sale del punto de partida.
        execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-copiloto.mjs")], { stdio: "inherit" });
        await dejarElCopilotoComoAlEmpezar(navegador);
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

// Las que la guía enseña tienen que estar TODAS. Con SOLO_VIDEO, lo demás se
// conserva del disco: basta con que esté.
comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO ? "" : " y el vídeo"} en public/guia/copiloto`);
