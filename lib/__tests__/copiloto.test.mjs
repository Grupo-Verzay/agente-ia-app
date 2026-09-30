/**
 * La PANTALLA de Copiloto (`/copiloto`): lo que se arregló al documentarla.
 *
 * Tres cosas, y ninguna se ve probando a mano con una pantalla grande:
 *
 * 1. **`?u=` ejecutaba código.** La dirección del copiloto se puede cambiar con
 *    `/copiloto?u=…` (el copiloto propio de un reseller), y iba TAL CUAL al
 *    `src` del `<iframe>`. Un `src` con `javascript:` corre en el origen de la
 *    página que lo pinta: `/copiloto?u=javascript:alert(document.domain)`
 *    ejecutaba ese código en la plataforma, con la sesión de quien pulsara el
 *    enlace. Lo mismo con una integración guardada con esa dirección.
 * 2. **Los dos botones tapaban los del copiloto** en cuanto el copiloto medía
 *    menos de ~846 px (el menú de la plataforma abierto, una tableta, un
 *    teléfono): «Fijar en Chats» caía encima de su selector de modelo y de
 *    sus botones. Ahora dependen del ANCHO del copiloto (una consulta
 *    de contenedor): flotan con su rótulo, flotan solo con el icono, o van en su
 *    propia fila encima. Eso solo se contesta MIDIENDO, con el copiloto de
 *    verdad dentro —su cabecera no es nuestra y cambia con su ancho—, y en
 *    los dos estados de su menú: estrechando la ventana desde una ancha, el
 *    copiloto lo deja ABIERTO encima de su cabecera.
 * 3. **Pantalla completa en un navegador que no la deja** (un iPhone): el botón
 *    salía y no hacía nada. Ahora no se ofrece.
 *
 * Tres mitades: las REGLAS (`lib/copiloto.ts`, `lib/url-embebible.ts`), un
 * BARRIDO del código y la pantalla REAL (`MainCopiloto`) en Chromium, con el
 * copiloto local (`scripts/copiloto-de-la-guia.sh`, LibreChat v0.8.7 igual al
 * de producción) dentro del marco. Las acciones de las integraciones, contra
 * Postgres, van en `integraciones-db.test.mjs`.
 *
 * `MODO=roto` lee y monta `ANTES_REF` —pinchado a un commit, nunca
 * `origin/main`— y AFIRMA los fallos: el `src` con `javascript:` y el código
 * corriendo, y los botones encima de los del copiloto.
 *
 * Se levanta con `scripts/banco-copiloto.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    // Sin navegador no se finge: se dice y se salta.
}

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "ab6b110";
const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const COMPILADO = path.join(import.meta.dirname, ".compilado", "copiloto");
const HARNESS = path.join(import.meta.dirname, ".compilado", "harness-copiloto.js");
const COPILOTO_LOCAL = process.env.COPILOTO_LOCAL ?? "http://localhost:3080";

const leer = (rel) =>
    ROTO
        ? (() => {
              try {
                  return execSync(`git show ${ANTES}:${JSON.stringify(rel)}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
              } catch {
                  return "";
              }
          })()
        : fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Sin comentarios: el arreglo lleva escrito al lado lo que se quitó, y el barrido no puede tropezar con esa explicación. */
const sinComentarios = (t) =>
    t
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .split("\n")
        .filter((l) => !/^\s*\/\//.test(l))
        .join("\n");

const MAIN = "app/(root)/copiloto/_components/MainCopiloto.tsx";
const MARCO = "components/custom/IframeRenderer.tsx";
const LISTA = "app/(root)/integraciones/_components/MainIntegraciones.tsx";
const ACCIONES = "actions/user-integration-actions.ts";

const PELIGROSAS = [
    "javascript:alert(document.domain)",
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "\u0001javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "blob:https://a.test/x",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
];

// ─────────────────────────────────────────────────────────────────────────────
// 1 y 2. Las reglas y el barrido
// ─────────────────────────────────────────────────────────────────────────────

if (ROTO) {
    test("ANTES: `?u=` iba tal cual al marco, y los botones flotaban siempre", () => {
        const main = sinComentarios(leer(MAIN));
        assert.ok(main.length > 0, `ANTES_REF (${ANTES}) no tiene la pantalla de Copiloto`);
        assert.match(main, /searchParams\.get\(COPILOT_URL_PARAM\)\?\.trim\(\) \|\| DEFAULT_COPILOT_URL/, "ANTES ya validaba ?u=");
        assert.match(sinComentarios(leer(MARCO)), /src=\{url\}/, "ANTES el marco ya saneaba la dirección");
        assert.match(main, /absolute right-\[52px\] top-2/, "ANTES los botones no flotaban siempre");
        assert.equal(leer("lib/url-embebible.ts"), "", "la regla de las direcciones ya existía");
        assert.equal(leer("lib/copiloto.ts"), "", "lib/copiloto.ts ya existía");
        assert.match(sinComentarios(leer(LISTA)), /href=\{item\.url\}/, "ANTES la lista ya no enlazaba la dirección cruda");
        assert.match(sinComentarios(leer(ACCIONES)), /where: \{ id, userId: user\.id \},\s*data,/, "ANTES la edición ya saneaba el cuerpo");
    });
} else {
    const url = await import(path.join(COMPILADO, "url-embebible.js"));
    const cop = await import(path.join(COMPILADO, "copiloto.js"));

    test("una dirección solo se abre si es http(s) o relativa: lista blanca, no lista negra", () => {
        for (const bien of ["https://copiloto.ia-app.com", "http://localhost:3080/c/new", "/copiloto", "//otro.test/x"]) {
            assert.equal(url.laUrlQueSePuedeAbrir(bien), bien, `rechazó «${bien}»`);
        }
        assert.equal(url.laUrlQueSePuedeAbrir("  https://a.test  "), "https://a.test", "no quita los espacios de alrededor");
        for (const mal of PELIGROSAS) assert.equal(url.laUrlQueSePuedeAbrir(mal), null, `dejó pasar «${JSON.stringify(mal)}»`);
        for (const nada of [null, undefined, 7, {}, "", "   ", `https://a.test/${"x".repeat(url.TOPE_DE_LA_URL)}`]) {
            assert.equal(url.laUrlQueSePuedeAbrir(nada), null);
        }
    });

    test("una INTEGRACIÓN tiene que ser absoluta: una relativa no es otra web", () => {
        assert.equal(url.comoUrlDeIntegracion("https://canva.com"), "https://canva.com");
        assert.equal(url.comoUrlDeIntegracion("/copiloto"), null);
        for (const mal of PELIGROSAS) assert.equal(url.comoUrlDeIntegracion(mal), null);
    });

    test("el copiloto que se abre: el del enlace si es http(s), y si no el de la plataforma", () => {
        assert.equal(cop.laUrlDelCopiloto(null), cop.COPILOTO_POR_DEFECTO);
        assert.equal(cop.laUrlDelCopiloto("   "), cop.COPILOTO_POR_DEFECTO);
        assert.equal(cop.laUrlDelCopiloto("https://copiloto.reseller.test"), "https://copiloto.reseller.test", "el copiloto de un reseller dejó de abrirse");
        for (const mal of [...PELIGROSAS, "/relativa"]) assert.equal(cop.laUrlDelCopiloto(mal), cop.COPILOTO_POR_DEFECTO, `abrió «${JSON.stringify(mal)}»`);
    });

    test("los tres tamaños de los botones, y los cortes son los de las clases", () => {
        assert.equal(cop.comoVanLosBotones(390), "fila");
        assert.equal(cop.comoVanLosBotones(cop.ANCHO_PARA_FLOTAR_PX - 1), "fila");
        assert.equal(cop.comoVanLosBotones(cop.ANCHO_PARA_FLOTAR_PX), "flotan-con-icono");
        assert.equal(cop.comoVanLosBotones(cop.ANCHO_PARA_EL_ROTULO_PX - 1), "flotan-con-icono");
        assert.equal(cop.comoVanLosBotones(cop.ANCHO_PARA_EL_ROTULO_PX), "flotan-con-rotulo");
        // Las clases llevan los cortes en rem: tienen que decir lo mismo que los px.
        const flotar = `${cop.ANCHO_PARA_FLOTAR_PX / 16}rem`;
        assert.ok(cop.MANDOS_DEL_COPILOTO.includes(`min-width:${flotar}`), `los botones no flotan desde ${flotar}`);
        assert.ok(cop.BOTON_FIJAR.includes(`(min-width:${flotar})_and_(max-width:${cop.ANCHO_PARA_EL_ROTULO_PX / 16 - 0.001}rem)`));
        assert.equal(cop.BOTON_FIJAR.match(/\(min-width:[^)]+\)_and_\(max-width:[^)]+\)/)[0], cop.ROTULO_DE_FIJAR.match(/\(min-width:[^)]+\)_and_\(max-width:[^)]+\)/)[0], "el rótulo y el botón se encogen en franjas distintas");
        assert.match(cop.CAJA_DEL_COPILOTO, /\[container-type:inline-size\]/, "sin contenedor, la consulta mide otra cosa");
    });

    test("pantalla completa solo se ofrece si el navegador la deja", () => {
        const div = { requestFullscreen() {} };
        assert.equal(cop.hayPantallaCompleta({ fullscreenEnabled: true }, div), true);
        assert.equal(cop.hayPantallaCompleta({ fullscreenEnabled: false }, div), false, "dentro de un marco sin permiso");
        assert.equal(cop.hayPantallaCompleta({ fullscreenEnabled: true }, {}), false, "un iPhone: el <div> no tiene requestFullscreen");
        assert.equal(cop.hayPantallaCompleta({ fullscreenEnabled: true }, null), false);
        assert.equal(cop.hayPantallaCompleta(undefined, div), false);
    });

    test("el barrido: la pantalla, el marco, la lista y las acciones pasan por la regla", () => {
        const main = sinComentarios(leer(MAIN));
        assert.match(main, /from "@\/lib\/copiloto"/);
        assert.match(main, /const url = laUrlDelCopiloto\(pedida\)/, "la pantalla vuelve a leer ?u= sin la regla");
        for (const literal of ["https://copiloto.ia-app.com", "Fijar en Chats", "Quitar de Chats", "Pantalla completa"]) {
            assert.ok(!main.includes(literal), `MainCopiloto escribe «${literal}» a mano: sale de lib/copiloto.ts`);
        }
        assert.match(main, /conPantallaCompleta && \(/, "el botón de pantalla completa sale aunque el navegador no la deje");
        const marco = sinComentarios(leer(MARCO));
        assert.match(marco, /laUrlQueSePuedeAbrir\(url\)/);
        assert.match(marco, /src=\{segura\}/, "el marco vuelve a pintar la dirección cruda");
        assert.doesNotMatch(marco, /src=\{url\}/);
        const lista = sinComentarios(leer(LISTA));
        assert.doesNotMatch(lista, /href=\{item\.url\}/, "Integraciones enlaza la dirección cruda");
        assert.match(lista, /rel="noopener noreferrer"/);
        const acciones = sinComentarios(leer(ACCIONES));
        assert.equal((acciones.match(/comoIntegracion\(data, (true|false)\)/g) ?? []).length, 2, "crear y editar tienen que sanear las dos");
        assert.doesNotMatch(acciones, /where: \{ id, userId: user\.id \},\s*data,/, "la edición vuelve a pasar el cuerpo tal cual");
        // Las clases de lib/ solo existen en el CSS si Tailwind mira lib/.
        assert.match(leer("tailwind.config.ts"), /"\.\/lib\/\*\*\/\*\.\{ts,tsx\}"/);
        // Y la guía nombra los botones con las MISMAS palabras que la pantalla.
        assert.match(leer("lib/guia-copiloto.ts"), /import \{ BOTONES_DE_LA_PLATAFORMA \} from "@\/lib\/copiloto"/);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. La pantalla REAL en Chromium, con el copiloto de verdad dentro
// ─────────────────────────────────────────────────────────────────────────────

const DIR_CSS = path.join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(path.join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;

async function hayCopilotoLocal() {
    try {
        return (await fetch(`${COPILOTO_LOCAL}/login`)).ok;
    } catch {
        return false;
    }
}
const hayNavegador = Boolean(chromium && CSS && fs.existsSync(HARNESS));
const conCopiloto = hayNavegador && (await hayCopilotoLocal());
if (hayNavegador && !conCopiloto) console.warn(`[banco] el copiloto local no contesta en ${COPILOTO_LOCAL}: corre scripts/copiloto-de-la-guia.sh`);

async function conLaPantalla(hacer) {
    // `right-[52px]` a secas era una clase del «antes»: el CSS de HOY ya no la
    // genera (solo su variante de contenedor), y sin ella el modo roto pintaría
    // los botones de antes en otro sitio. Se pone la regla que el CSS de
    // entonces sí tenía; en el modo bueno no se usa.
    const antes = ROTO ? ".right-\\[52px\\]{right:52px}" : "";
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}${antes} html,body,#app{height:100%;margin:0}</style></head>
<body class="app-module-content"><div id="app"></div>
<script>window.process=window.process||{env:{}};</script>
<script type="module">${fs.readFileSync(HARNESS, "utf8")}</script></body></html>`;
    const servidor = http
        .createServer((_req, res) => {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(html);
        })
        .listen(0);
    await new Promise((r) => servidor.once("listening", r));
    const puerto = servidor.address().port;
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox"] });
    try {
        await hacer(navegador, puerto);
    } finally {
        await navegador.close();
        servidor.close();
    }
}

/** Abre la pantalla con `?u=`. Se sirve en `localhost` y no en 127.0.0.1: así la sesión del copiloto (localhost:3080) es del MISMO sitio, como en producción. */
async function abrir(navegador, puerto, u, { ancho = 1280, alto = 800 } = {}) {
    const p = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    const errores = [];
    const dialogos = [];
    p.on("pageerror", (e) => errores.push(String(e)));
    p.on("dialog", (d) => {
        dialogos.push(d.message());
        void d.dismiss();
    });
    await p.goto(`http://localhost:${puerto}/?u=${encodeURIComponent(u)}`);
    await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
    await p.evaluate("window.maqueta()");
    await p.locator("iframe").first().waitFor({ state: "attached", timeout: 15000 });
    await p.waitForTimeout(800);
    assert.deepEqual(errores, [], "la pantalla no llegó a pintarse");
    return { p, dialogos };
}

/** Lo que se ve de la pantalla y del copiloto de dentro, en coordenadas de la página. */
async function medir(p) {
    const plataforma = await p.evaluate(() => {
        const caja = (e) => {
            const r = e.getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height, texto: (e.textContent ?? "").trim() };
        };
        const mandos = document.querySelector("[data-mandos-del-copiloto]") ?? document.querySelector(".absolute.top-2.z-20");
        const botones = mandos ? [...mandos.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().width > 0).map(caja) : [];
        const marco = document.querySelector("iframe");
        const rotulo = [...(mandos?.querySelectorAll("button span") ?? [])].find((s) => /Chats/.test(s.textContent ?? ""));
        return {
            botones,
            mandos: mandos ? caja(mandos) : null,
            posicion: mandos ? getComputedStyle(mandos).position : null,
            marco: marco ? caja(marco) : null,
            conRotulo: Boolean(rotulo && rotulo.getBoundingClientRect().width > 0),
            desborda: document.documentElement.scrollWidth > window.innerWidth,
        };
    });
    const marco = p.frames().find((f) => f.url().startsWith(COPILOTO_LOCAL));
    const dentro = marco
        ? await marco.evaluate(() =>
              [...document.querySelectorAll('button, [role="button"], a[href]')]
                  .map((e) => {
                      const r = e.getBoundingClientRect();
                      const s = getComputedStyle(e);
                      return { x: r.left, y: r.top, w: r.width, h: r.height, nombre: e.getAttribute("aria-label") || (e.textContent ?? "").trim().slice(0, 30), oculto: s.visibility === "hidden" || s.opacity === "0" || s.pointerEvents === "none" };
                  })
                  .filter((c) => c.w > 0 && c.h > 0 && !c.oculto),
          )
        : [];
    const dx = plataforma.marco?.x ?? 0;
    const dy = plataforma.marco?.y ?? 0;
    // Con el menú del copiloto abierto en un ancho de teléfono, el copiloto
    // pone un VELO del tamaño de todo el marco que también se llama «Close
    // sidebar»: se pulsa en cualquier sitio para cerrar el menú. No es un botón
    // que se pueda tapar —lo pisa todo—, así que no cuenta.
    // Y lo que el copiloto tiene fuera de su marco (el menú plegado se va a la
    // izquierda, con `x` negativo) no se ve: tampoco cuenta.
    const area = (plataforma.marco?.w ?? 0) * (plataforma.marco?.h ?? 0);
    const esVelo = (c) => area > 0 && c.w * c.h >= area / 2;
    const seVe = (c) => !plataforma.marco || (c.x + c.w > 0 && c.x < plataforma.marco.w);
    const botones = dentro.filter((c) => !esVelo(c) && seVe(c));
    return { ...plataforma, conVelo: dentro.some(esVelo), dentro: botones.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy })) };
}

/**
 * Cierra el menú del copiloto pulsando su velo, que es lo que hace quien lo
 * tiene abierto en un teléfono. El copiloto recuerda si su menú estaba abierto,
 * así que al estrechar la ventana desde una ancha sale ABIERTO, encima de su
 * cabecera: los botones de la plataforma se miden en los dos estados.
 */
async function cerrarElMenuDelCopiloto(p) {
    // Con el ratón y en el borde derecho del velo, a media altura: ahí no hay
    // ni menú ni botones. Un `.click()` de JavaScript no lo cierra —el copiloto
    // escucha el puntero—.
    const r = await p.locator("iframe").first().boundingBox();
    await p.mouse.click(r.x + r.width - 12, r.y + r.height / 2);
    await p.waitForTimeout(900);
}

/** Cuánto se pisan dos cajas (px²). */
const pisa = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const lasQueTapan = (m) =>
    m.botones.flatMap((b) => m.dentro.filter((d) => pisa(b, d) > 4).map((d) => `«${b.texto || "pantalla completa"}» tapa «${d.nombre}»`));

const ANCHOS = [1280, 900, 800, 640, 500, 390];

test("`?u=javascript:` no llega al marco ni corre en la plataforma", { skip: !hayNavegador }, async () => {
    await conLaPantalla(async (navegador, puerto) => {
        const { p, dialogos } = await abrir(navegador, puerto, "javascript:alert(document.domain)");
        await p.waitForTimeout(600);
        const src = await p.locator("iframe").first().getAttribute("src");
        if (ROTO) {
            assert.equal(src, "javascript:alert(document.domain)", "ANTES el marco no recibía la dirección cruda");
            assert.ok(dialogos.some((d) => d.includes("localhost")), "ANTES el código no llegó a correr en la plataforma");
        } else {
            assert.equal(src, "https://copiloto.ia-app.com", "se embebió otra cosa que el copiloto de la plataforma");
            assert.deepEqual(dialogos, [], "corrió código de la dirección");
        }
        await p.close();
    });
});

test("el copiloto de un reseller (`?u=https://…`) sigue abriéndose", { skip: !hayNavegador || ROTO }, async () => {
    await conLaPantalla(async (navegador, puerto) => {
        const { p } = await abrir(navegador, puerto, "https://copiloto.reseller.test");
        assert.equal(await p.locator("iframe").first().getAttribute("src"), "https://copiloto.reseller.test");
        assert.equal(await p.locator("iframe").first().getAttribute("title"), "Copiloto de IA", "el marco no dice qué es a un lector de pantalla");
        await p.close();
    });
});

test("los dos botones no tapan NINGÚN botón del copiloto, en ningún ancho", { skip: !conCopiloto }, async () => {
    const { entrarAlCopiloto } = await import("../../scripts/copiloto-de-la-guia/preparar.mjs");
    await conLaPantalla(async (navegador, puerto) => {
        const { p } = await abrir(navegador, puerto, COPILOTO_LOCAL);
        await entrarAlCopiloto(p.frameLocator("iframe"));
        await p.frameLocator("iframe").locator('[data-testid="model-selector-button"]').first().waitFor({ state: "visible", timeout: 30000 });
        const tapados = {};
        for (const ancho of ANCHOS) {
            await p.setViewportSize({ width: ancho, height: 800 });
            await p.waitForTimeout(900);
            const m = await medir(p);
            assert.ok(m.dentro.length > 3, `a ${ancho}: no se midió el copiloto de dentro`);
            assert.ok(m.botones.length >= 2, `a ${ancho}: no están los dos botones`);
            assert.equal(m.desborda, false, `a ${ancho}: la página se desplaza a lo ancho`);
            tapados[ancho] = lasQueTapan(m);
            if (m.conVelo) {
                await cerrarElMenuDelCopiloto(p);
                const cerrado = await medir(p);
                assert.equal(cerrado.conVelo, false, `a ${ancho}: el menú del copiloto no se cerró`);
                tapados[ancho] = [...new Set([...tapados[ancho], ...lasQueTapan(cerrado)])];
            }
            if (ROTO) continue;
            assert.deepEqual(tapados[ancho], [], `a ${ancho}`);
            const modo = (await import(path.join(COMPILADO, "copiloto.js"))).comoVanLosBotones(m.mandos ? m.marco.w : ancho);
            if (modo === "fila") {
                assert.equal(m.posicion, "static", `a ${ancho}: tendrían que ir en su fila`);
                assert.ok(m.marco.y >= m.mandos.y + m.mandos.h - 0.5, `a ${ancho}: el copiloto empieza debajo de su fila`);
            } else {
                assert.equal(m.posicion, "absolute", `a ${ancho}: tendrían que flotar`);
            }
            assert.equal(m.conRotulo, modo !== "flotan-con-icono", `a ${ancho} (${modo}): el rótulo «Fijar en Chats»`);
        }
        if (ROTO) {
            const conFallo = Object.entries(tapados).filter(([, t]) => t.length);
            console.log("  ANTES tapaban:", JSON.stringify(Object.fromEntries(conFallo)));
            assert.ok(conFallo.length >= 2, `ANTES los botones no tapaban nada: ${JSON.stringify(tapados)}`);
            assert.ok(tapados[390].length > 0, "ANTES en un teléfono no tapaban los del copiloto");
        }
        await p.close();
    });
});
