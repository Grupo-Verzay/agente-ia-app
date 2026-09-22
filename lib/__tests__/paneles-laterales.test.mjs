/**
 * Los paneles laterales de Chats: los CINCO, con la misma forma y la misma
 * regla de exclusión.
 *
 * # Qué se rompe aquí, y por eso son dos mitades
 *
 * 1. **Que uno vuelva a ser un modal.** El contexto del lead, el recordatorio
 *    y la tarea eran diálogos centrados con velo: el velo es justo lo que no
 *    deja leer la conversación mientras se rellenan, que es el encargo entero.
 *    Eso se lee del código y no hace falta navegador.
 * 2. **Que dos se abran a la vez.** Eso sí hay que ejercerlo: la exclusión
 *    vive en `usePanelLateral` y se dispara con un evento del navegador,
 *    porque los cinco cuelgan de sitios distintos del árbol. Y el registro es
 *    un CONJUNTO y no un booleano justamente por esto — con un booleano, el
 *    que se cierra después de que otro se abra borra el sitio que el otro
 *    acaba de reservar, y la conversación se queda encogida o destapada sin
 *    que nadie sepa por qué.
 *
 * `MODO=roto` lee las tres pantallas de `origin/main` —donde eran modales— y
 * **afirma el fallo**. De la mitad del navegador, la exclusión no tiene modo
 * roto y se dice. El caso de la CABECERA sí: el arnés se construye con el
 * `PanelLateral` de antes del portal y se afirma que el panel se colocaba
 * contra la cabecera y que la instancia cerrada asomaba en blanco.
 *
 * Se levanta con `scripts/banco-panel-lateral.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    // Sin navegador no se finge: se dice y se salta.
}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "harness-panel-lateral.js");

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;

/** Las tres pantallas que eran modales, y los dos paneles que ya lo eran. */
const CONVERTIDAS = [
    "app/(root)/chats/_components/LeadContextSheet.tsx",
    "app/(root)/chats/_components/ChatReminderDialog.tsx",
    "app/(root)/chats/_components/TaskFormDialog.tsx",
];
const LOS_OTROS_DOS = [
    "app/(root)/ai-chat/components/ChatSheet.tsx",
    "components/chat-equipo/PanelDeEquipo.tsx",
];

const leer = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
// El «antes» del barrido va PINCHADO al padre del #888, que es donde las tres
// eran modales. Leía `origin/main`, y desde que el #888 se fusionó ahí ya no
// hay modales: el modo roto dejó de reproducir nada. Un modo roto que pasa no
// está en verde, está muerto.
const ANTES_DEL_BARRIDO = process.env.ANTES_DEL_BARRIDO ?? "fcddcd0";
const leerDeMain = (f) =>
    execFileSync("git", ["show", `${ANTES_DEL_BARRIDO}:${f}`], { encoding: "utf8", cwd: RAIZ });

// ─────────────────────────────────────────────────────────────────────────────
// 1. El barrido, sin navegador
// ─────────────────────────────────────────────────────────────────────────────

test("las tres ya no montan un modal: ni diálogo, ni hoja, ni velo", (t) => {
    const texto = ROTO ? leerDeMain : leer;
    const modales = CONVERTIDAS.filter((f) => /<(Dialog|Sheet)Content\b/.test(texto(f)));

    if (ROTO) {
        t.diagnostic(`origin/main: ${modales.length} de ${CONVERTIDAS.length} eran modales`);
        assert.equal(
            modales.length,
            CONVERTIDAS.length,
            "el «antes» tenía que traer las tres como modal; si no, este banco no ejerce nada",
        );
        return;
    }
    assert.deepEqual(modales, [], "vuelve a haber un modal donde se pidió una barra lateral");
});

test("los CINCO pasan por `usePanelLateral`, que es donde vive la exclusión", (t) => {
    if (ROTO) {
        // El «antes» de esta mitad es otro: la exclusión estaba escrita a mano
        // en `BotonesDelBorde`, y solo para dos de los cinco.
        const botones = leerDeMain("components/chat-equipo/BotonesDelBorde.tsx");
        t.diagnostic("origin/main: la exclusión estaba escrita en la pareja de botones, no en el hook");
        assert.ok(
            /setEquipoAbierto\(false\)|abrirCopiloto\(false\)/.test(botones),
            "el «antes» tenía que cerrar el otro a mano desde la pareja de botones",
        );
        return;
    }

    for (const f of [...CONVERTIDAS, ...LOS_OTROS_DOS]) {
        const texto = f.endsWith("ChatSheet.tsx") || f.endsWith("PanelDeEquipo.tsx") ? leer(f) : leer(f);
        const propio = /usePanelLateral\(/.test(texto);
        const porElComponente = /<PanelLateral\b/.test(texto);
        assert.ok(propio || porElComponente, `${f} no pasa por usePanelLateral`);
    }

    // Y la condición ya NO está escrita a mano en la pareja de botones: con
    // dos reglas que mantener a la par, el día que se afine una la otra se
    // queda atrás, y eso se ve como dos paneles abiertos a la vez de vez en
    // cuando — el fallo más difícil de reproducir de esta familia.
    const botones = leer("components/chat-equipo/BotonesDelBorde.tsx");
    assert.ok(
        !/abrirCopiloto\(false\)/.test(botones),
        "la pareja de botones volvió a cerrar el otro por su cuenta",
    );
});

test("la franja se reserva DONDE CABE, y la ficha ya NO se superpone", () => {
    const css = fs.readFileSync(join(RAIZ, "app", "globals.css"), "utf8");
    assert.ok(
        /\[data-panel-lateral="abierto"\][^{]*\[data-chat-view\]/.test(css),
        "sin esto la conversación no se acomoda: el panel se le monta encima",
    );
    // La ficha entra en la exclusión (`PANEL_DE_LA_FICHA`): nunca convive con
    // un panel, así que la regla que la ponía ENCIMA de la conversación —a su
    // izquierda, con el panel a la derecha— sobra. Ver
    // `paneles-de-chats.test.mjs`.
    assert.ok(
        !/\[data-panel-lateral="abierto"\][^{]*\[data-ficha-de-contacto\]/.test(css),
        "la ficha no puede superponerse: salía por la izquierda de la conversación",
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Los paneles de verdad, en Chromium
// ─────────────────────────────────────────────────────────────────────────────

function faltaNavegador(t, { tieneRoto = false } = {}) {
    if (ROTO && !tieneRoto) {
        t.skip("el «antes» del navegador serían dos builds: se dice en vez de fingirlo");
        return true;
    }
    if (!chromium) {
        t.skip("sin playwright no se mide; se dice en vez de fingir");
        return true;
    }
    if (!CSS || !fs.existsSync(HARNESS)) {
        t.skip("falta el CSS del build o el arnés: levántalo con scripts/banco-panel-lateral.sh");
        return true;
    }
    return false;
}

async function abrirNavegador(ventana = 1440) {
    const bundle = fs.readFileSync(HARNESS);
    const servidor = http.createServer((peticion, respuesta) => {
        const u = (peticion.url ?? "/").split("?")[0];
        if (u === "/harness-panel-lateral.js") {
            respuesta.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            respuesta.end(bundle);
            return;
        }
        respuesta.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        respuesta.end(
            `<!doctype html><html><head><meta charset="utf-8">` +
                `<meta name="viewport" content="width=device-width, initial-scale=1">` +
                `<style>${CSS}</style><style>html,body{margin:0;height:100%}</style>` +
                // Sin apagarlas se mide un panel a media entrada, que no está
                // en ningún sitio. Es la misma trampa que ya costó una vuelta
                // en el banco de los paneles flotantes.
                `<style>*,*::before,*::after{animation:none !important;transition:none !important}</style>` +
                `</head><body><div id="app"></div>` +
                `<script type="module" src="/harness-panel-lateral.js"></script></body></html>`,
        );
    });
    await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const pagina = await navegador.newPage({ viewport: { width: ventana, height: 900 } });
    await pagina.goto(`http://127.0.0.1:${servidor.address().port}/`, { waitUntil: "load" });
    await pagina.waitForFunction("window.listo === true", { timeout: 20000 });
    await pagina.evaluate(() => window.maqueta());
    await pagina.waitForTimeout(60);
    return {
        pagina,
        async abrir(cual, v) {
            await pagina.evaluate(([c, x]) => window.abrir(c, x), [cual, v]);
            await pagina.waitForTimeout(60);
        },
        estado: () =>
            pagina.evaluate(() => ({
                marca: document.documentElement.getAttribute("data-panel-lateral"),
                conversacion: Math.round(document.getElementById("conversacion").getBoundingClientRect().width),
                dentroUno: !!document.getElementById("dentro-uno"),
                dentroDos: !!document.getElementById("dentro-dos"),
                // `aria-hidden` cambia AL INSTANTE; lo de dentro se conserva
                // los 500 ms que dura la salida, así que preguntar por el
                // contenido diría que sigue abierto y no es cierto.
                abiertoUno: document.querySelector('[data-panel="panel-contexto-del-lead"]')
                    ?.getAttribute("aria-hidden") === "false",
                abiertoDos: document.querySelector('[data-panel="panel-crear-recordatorio"]')
                    ?.getAttribute("aria-hidden") === "false",
                fichaAbsoluta: getComputedStyle(document.getElementById("ficha")).position,
            })),
        async cerrar() {
            await navegador.close();
            servidor.close();
        },
    };
}

test("el MISMO panel montado dos veces: la instancia cerrada no suelta el sitio de la abierta", async (t) => {
    if (faltaNavegador(t)) return;
    const nav = await abrirNavegador();
    try {
        // La cabecera de Chats monta el recordatorio DOS veces —una por fila—
        // y la tarea sale de tres sitios. Con el registro llevado por el id
        // del PANEL, la instancia cerrada borraba lo que acababa de apuntar la
        // abierta y la conversación se destapaba sola: el mismo fallo que el
        // registro vino a evitar, entrando por la otra puerta.
        await nav.abrir("dos", true);
        const abierto = await nav.estado();
        assert.equal(abierto.marca, "abierto");

        // La gemela se abre y se cierra sin que la primera se entere.
        await nav.abrir("gemelo", true);
        await nav.abrir("gemelo", false);
        const despues = await nav.estado();
        t.diagnostic(`tras abrir y cerrar la gemela: marca=${despues.marca}, conversación ${despues.conversacion}px`);

        assert.equal(despues.marca, "abierto", "la instancia cerrada soltó el sitio de la que sigue abierta");
        assert.equal(
            despues.conversacion,
            abierto.conversacion,
            "y la conversación se destapó sola, que es como se ve el fallo",
        );
        assert.equal(despues.abiertoDos, true, "dos instancias del MISMO panel no se cierran entre ellas");
    } finally {
        await nav.cerrar();
    }
});

test("abrir uno cierra el otro, y el sitio reservado NO se pierde por el camino", async (t) => {
    if (faltaNavegador(t)) return;
    const nav = await abrirNavegador();
    try {
        const cerrado = await nav.estado();
        assert.equal(cerrado.marca, null, "sin ningún panel abierto no se reserva nada");
        assert.equal(cerrado.dentroUno, false, "lo de dentro no existe hasta la primera apertura");

        await nav.abrir("uno", true);
        const primero = await nav.estado();
        t.diagnostic(`uno abierto: marca=${primero.marca}, conversación ${primero.conversacion}px`);
        assert.equal(primero.marca, "abierto");
        assert.equal(primero.dentroUno, true, "abierto tiene que existir lo de dentro");
        assert.equal(primero.abiertoUno, true);
        assert.equal(primero.abiertoDos, false);
        assert.ok(
            primero.conversacion < cerrado.conversacion,
            `la conversación tiene que acomodarse (${primero.conversacion} vs ${cerrado.conversacion})`,
        );
        assert.equal(primero.fichaAbsoluta, "static", "la ficha no se superpone: sale por su lado, el derecho");

        // El caso del registro: el segundo se abre y el primero se cierra
        // DESPUÉS. Con un booleano, ese cierre borraría el sitio que el
        // segundo acaba de reservar y la conversación se destaparía sola.
        await nav.abrir("dos", true);
        const segundo = await nav.estado();
        t.diagnostic(`dos abierto: marca=${segundo.marca}, conversación ${segundo.conversacion}px`);
        assert.equal(segundo.marca, "abierto", "el sitio reservado no puede perderse al relevarse dos paneles");
        assert.equal(segundo.conversacion, primero.conversacion, "la conversación no puede dar un salto");
        assert.equal(segundo.dentroDos, true);
        assert.equal(segundo.abiertoDos, true, "el segundo tiene que quedar abierto");
        assert.equal(
            segundo.abiertoUno,
            false,
            "NUNCA los dos a la vez: son dos paneles en el mismo sitio y uno taparía al otro",
        );

        await nav.abrir("dos", false);
        const final = await nav.estado();
        assert.equal(final.marca, null, "cerrado el último se suelta el sitio");
        assert.equal(final.conversacion, cerrado.conversacion, "y la conversación vuelve a lo que medía");
    } finally {
        await nav.cerrar();
    }
});

test("montado DENTRO de una cabecera con `backdrop-blur`: se coloca contra la VENTANA, y el cerrado no asoma", async (t) => {
    if (faltaNavegador(t, { tieneRoto: true })) return;
    for (const ventana of [1440, 1366, 1024]) {
        const nav = await abrirNavegador(ventana);
        try {
            await nav.abrir("tarea", true);
            const medida = await nav.pagina.evaluate(() => {
                const hojas = [...document.querySelectorAll('[data-panel="panel-nueva-tarea"]')];
                const abierta = hojas.find((h) => h.getAttribute("aria-hidden") === "false");
                const cerrada = hojas.find((h) => h.getAttribute("aria-hidden") === "true");
                const caja = (n) => {
                    const r = n.getBoundingClientRect();
                    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), height: Math.round(r.height) };
                };
                const cc = caja(cerrada);
                return {
                    abierta: caja(abierta),
                    hayDentro: !!document.getElementById("dentro-tarea"),
                    // «Asoma» = se pinta dentro de la ventana y no está escondida.
                    cerradaAsoma:
                        getComputedStyle(cerrada).visibility !== "hidden" &&
                        cc.left < window.innerWidth &&
                        cc.right > 0,
                    ancho: window.innerWidth,
                    alto: window.innerHeight,
                };
            });
            t.diagnostic(`${ventana}: abierta ${JSON.stringify(medida.abierta)}, la cerrada asoma=${medida.cerradaAsoma}`);

            if (ROTO) {
                // El fallo del #890: contra la cabecera, no contra la ventana.
                const contraLaVentana =
                    medida.abierta.right === medida.ancho && medida.abierta.height === medida.alto;
                assert.equal(contraLaVentana, false, "el «antes» tenía que colocarse contra la cabecera");
                assert.equal(medida.cerradaAsoma, true, "y la instancia cerrada tenía que asomar en blanco");
                continue;
            }

            assert.equal(medida.abierta.right, medida.ancho, "el panel tiene que pegarse al filo derecho de la VENTANA");
            assert.equal(medida.abierta.top, 0, "y arrancar bajo la barra (0 en el arnés), no bajo la cabecera");
            assert.equal(medida.abierta.height, medida.alto, "y ocupar el alto de la ventana, no el de la cabecera");
            assert.equal(medida.hayDentro, true, "abierto tiene que cargar su contenido");
            assert.equal(medida.cerradaAsoma, false, "una instancia cerrada no puede asomar en blanco");

            // Y la equis cierra.
            await nav.pagina.click('[data-panel="panel-nueva-tarea"][aria-hidden="false"] button[aria-label="Cerrar nueva tarea"]');
            await nav.pagina.waitForTimeout(80);
            const trasCerrar = await nav.pagina.evaluate(
                () => !!document.querySelector('[data-panel="panel-nueva-tarea"][aria-hidden="false"]'),
            );
            assert.equal(trasCerrar, false, "la equis tiene que cerrar el panel");
        } finally {
            await nav.cerrar();
        }
    }
});
