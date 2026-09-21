/**
 * La fila de Chats y su menú «⌄», sin los dos selectores, en Chromium.
 *
 * # Qué se quitó
 *
 * De cada fila de la lista: el **estado del cliente** (Cliente activa / Cliente
 * inactiva / Sin clasificar) y el **tipo de asistencia** (Asistencia IA /
 * Asistencia humana / Sin asignar). Y del menú «⌄» sus cuatro filtros.
 *
 * # Por qué esto se mide en un navegador
 *
 * Las dos preguntas del encargo son de pintado y no se contestan leyendo:
 *
 *   1. **No queda franja en blanco ni se descuadra la fila.** Los badges viven
 *      en un array que se pinta en un contenedor `gap-1` detrás de un
 *      `visibleBadges.length > 0`, así que quitar dos no puede dejar hueco —y
 *      eso se comprueba midiendo el alto de la fila con los valores guardados
 *      y sin ellos, no leyendo la condición.
 *   2. **El menú ya no ofrece los cuatro filtros**, y al quitarlos no queda un
 *      separador huérfano ni dos seguidos: los dos que se fueron vivían DENTRO
 *      de los bloques borrados.
 *
 * # Los dos modos
 *
 * `MODO=roto` empaqueta los componentes de **`origin/main`** —no una copia
 * escrita aquí— y afirma el «antes»: la fila pinta los dos selectores y el menú
 * ofrece los cuatro filtros. Sin ese modo, lo verde del normal no diría si la
 * medida ejerce algo.
 *
 * Se levanta con `scripts/banco-fila-de-chats.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
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
const HARNESS = join(AQUI, ".compilado", "harness-fila-de-chats.js");

/** El CSS del build: medir con otra hoja es medir una fila que nadie ve. */
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;

/**
 * Los dos selectores de la fila se buscan por su `aria-label`, no por su texto.
 *
 * Su disparador es **solo un icono con su flechita** —el de la interrogación de
 * las capturas—: el rótulo («Cliente Activo», «Asistencia IA») vive en un
 * tooltip, o sea en un portal que solo existe con el cursor encima. Buscar por
 * texto daría vacío también en `origin/main`, y el modo roto saldría verde sin
 * haber ejercido nada — costó una vuelta.
 */
const DE_LA_FILA = ["Cambiar estado del cliente", "Cambiar tipo de servicio"];
/** En el menú sí son texto: cuatro opciones con su rótulo. */
const DEL_MENU = ["Cliente activo", "Cliente inactivo", "Asistencia IA", "Asistencia humana"];

const ANCHURAS = [1440, 1280, 1024, 390];
/** La columna de Chats: `--ancho-lateral` (18/20/22/24 rem) y el móvil entero. */
const COLUMNA = { 1440: 384, 1280: 384, 1024: 352, 390: 390 };

function unContacto({ conLosDosValores }) {
    const sesion = {
        id: 1,
        userId: "cuenta",
        remoteJid: "573001112233@s.whatsapp.net",
        pushName: "Marta Restrepo",
        tags: [],
        leadStatus: "TIBIO",
        // Lo que este cambio deja de pintar, y que sigue guardado en la base.
        serviceType: conLosDosValores ? "IA" : null,
        clientStatus: conLosDosValores ? "ACTIVO" : null,
        reminderCount: 0,
        pendingSeguimientos: 0,
        assignedAdvisorId: null,
        status: true,
    };
    return {
        id: "573001112233@s.whatsapp.net",
        chatSession: sesion,
        isArchived: false,
        isDeleted: false,
        isPurged: false,
        isGroup: false,
        isPinned: false,
        isUnreadLocal: false,
        lastMessage: "Perfecto, quedo pendiente entonces",
        lastMessageId: "ABC123",
        name: "Marta Restrepo",
        avatarSrc: "",
        pinnedAtMs: 0,
        timestamp: "10:24",
        ts: 1_700_000_000,
        instanceName: "VERZAY_VENTAS",
    };
}

/** Una fila PELADA: sin sesión, así que no tiene ni un badge que pintar. */
function unContactoSinBadges() {
    return { ...unContacto({ conLosDosValores: false }), chatSession: null };
}

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><style>${CSS ?? ""}</style></head>` +
                    `<body style="margin:0">` +
                    `<div id="columna"><div id="fila"></div><div id="pestanas"></div></div>` +
                    `<script type="module" src="/harness-fila-de-chats.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness-fila-de-chats.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir(ancho = 1440) {
    const server = await levantar();
    const base = `http://127.0.0.1:${server.address().port}`;
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await (await navegador.newContext({ viewport: { width: ancho, height: 900 } })).newPage();
    await page.goto(base + "/", { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.evaluate((ancho) => {
        document.getElementById("columna").style.width = ancho + "px";
    }, COLUMNA[ancho] ?? 384);
    return {
        page,
        async cerrar() {
            await navegador.close();
            server.close();
        },
    };
}

function faltaNavegador(t) {
    if (!chromium) {
        t.skip("sin playwright en este equipo");
        return true;
    }
    if (!CSS) {
        t.skip("sin el CSS del build: corre `npm run build` antes");
        return true;
    }
    return false;
}

test("la fila no pinta el estado del cliente ni el tipo de asistencia", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1440);
    try {
        await page.evaluate((c) => window.pintarFila(c), unContacto({ conLosDosValores: true }));
        await page.waitForTimeout(150);
        const encontrados = await page.evaluate(
            (rotulos) =>
                rotulos.filter((r) => document.getElementById("fila").querySelector(`[aria-label="${r}"]`)),
            DE_LA_FILA,
        );

        if (ROTO) {
            // EL ANTES: los dos selectores están, con sus rótulos de verdad.
            assert.equal(
                encontrados.length,
                2,
                "la fila de origin/main pinta los dos selectores; " +
                    `se vio: ${JSON.stringify(encontrados)}`,
            );
            return;
        }

        assert.deepEqual(
            encontrados,
            [],
            `la fila ya no puede pintar esos rótulos; se vio: ${JSON.stringify(encontrados)}`,
        );
    } finally {
        await cerrar();
    }
});

test("la fila mide lo MISMO con los dos valores guardados y sin ellos", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1440);
    try {
        const medir = async (conLosDosValores) => {
            await page.evaluate((c) => window.pintarFila(c), unContacto({ conLosDosValores }));
            await page.waitForTimeout(150);
            return page.evaluate(() => {
                const fila = document.getElementById("fila").firstElementChild;
                const badges = fila.querySelector(".flex-wrap");
                return {
                    alto: Math.round(fila.getBoundingClientRect().height),
                    badges: badges ? badges.children.length : 0,
                };
            });
        };
        const con = await medir(true);
        const sin = await medir(false);
        t.diagnostic(
            `${ROTO ? "origin/main" : "ahora"}: con los dos valores ${con.alto}px / ${con.badges} pastillas; ` +
                `sin ellos ${sin.alto}px / ${sin.badges}`,
        );
        assert.equal(
            con.alto,
            sin.alto,
            "un dato que ya no se pinta no puede cambiar el alto de la fila",
        );
        assert.equal(con.badges, sin.badges, "ni el numero de pastillas");

        // Y el número concreto, que es lo que separa los dos modos: la fila de
        // este contacto lleva la clasificación del lead y nada más. En
        // `origin/main` llevaba además los dos selectores.
        assert.equal(
            con.badges,
            ROTO ? 3 : 1,
            ROTO
                ? "origin/main pinta el lead y los DOS selectores"
                : "ahora la fila solo pinta la clasificación del lead",
        );
    } finally {
        await cerrar();
    }
});

test("sin una sola pastilla NO queda franja en blanco", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1440);
    try {
        await page.evaluate((c) => window.pintarFila(c), unContactoSinBadges());
        await page.waitForTimeout(150);
        const huecos = await page.evaluate(() => {
            const fila = document.getElementById("fila");
            // Una caja sin texto, sin hijos y con alto: eso es una franja en
            // blanco. El contenedor de pastillas va detras de un
            // `visibleBadges.length > 0`, asi que con cero no debe existir.
            return Array.from(fila.querySelectorAll("div, span"))
                .filter(
                    (el) =>
                        el.children.length === 0 &&
                        !(el.textContent ?? "").trim() &&
                        el.getBoundingClientRect().height > 0 &&
                        el.getBoundingClientRect().width > 0,
                )
                .map((el) => el.className || el.tagName);
        });
        assert.deepEqual(huecos, [], `no puede quedar ninguna caja vacia con alto: ${JSON.stringify(huecos)}`);
    } finally {
        await cerrar();
    }
});

test("la fila no desborda a lo ancho en ninguna de las cuatro anchuras", async (t) => {
    if (faltaNavegador(t)) return;
    for (const ancho of ANCHURAS) {
        const { page, cerrar } = await abrir(ancho);
        try {
            await page.evaluate((c) => window.pintarFila(c), unContacto({ conLosDosValores: true }));
            await page.waitForTimeout(150);
            const r = await page.evaluate(() => ({
                desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                alto: Math.round(document.getElementById("fila").firstElementChild.getBoundingClientRect().height),
            }));
            assert.equal(r.desborda, false, `a ${ancho} la pagina se desplaza a lo ancho`);
            assert.ok(r.alto > 0, `a ${ancho} la fila no llego a pintarse`);
        } finally {
            await cerrar();
        }
    }
});

test("el menu de la barra ya no ofrece los cuatro filtros", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1440);
    try {
        await page.evaluate(() => window.pintarPestanas());
        await page.waitForTimeout(150);
        // El «⌄» es el ultimo boton de la fila de pastillas.
        const botones = page.locator("#pestanas button");
        await botones.last().click();
        await page.waitForSelector('[role="menu"]', { timeout: 5000 });

        const menu = await page.evaluate(() => {
            const m = document.querySelector('[role="menu"]');
            const hijos = Array.from(m.children);
            return {
                opciones: Array.from(m.querySelectorAll('[role="menuitem"]')).map((el) =>
                    (el.textContent ?? "").trim(),
                ),
                // Un separador es una raya sin texto; los del menu son `<div>`
                // con `border-t` y los de Radix llevan su rol.
                forma: hijos.map((el) =>
                    el.getAttribute("role") === "menuitem"
                        ? "opcion"
                        : (el.className || "").includes("border-t") || el.getAttribute("role") === "separator"
                          ? "raya"
                          : "otro",
                ),
            };
        });

        const encontrados = DEL_MENU.filter((r) =>
            menu.opciones.some((o) => o.toLowerCase().includes(r.toLowerCase())),
        );

        if (ROTO) {
            // EL ANTES: los cuatro filtros estaban en este menu.
            assert.equal(
                encontrados.length,
                4,
                `el menu de origin/main tiene que ofrecer los cuatro; se vio: ${JSON.stringify(menu.opciones)}`,
            );
            return;
        }

        assert.deepEqual(
            encontrados,
            [],
            `el menu ya no puede ofrecerlos; se vio: ${JSON.stringify(menu.opciones)}`,
        );
        assert.ok(menu.opciones.length > 0, "el menu sigue teniendo sus demas opciones");

        // Y al quitar los dos bloques no queda ninguna raya suelta: ni dos
        // seguidas, ni una al principio, ni una al final. Los separadores que
        // se fueron vivian DENTRO de los bloques borrados.
        assert.ok(menu.forma.length > 0, "el menu tiene contenido");
        assert.notEqual(menu.forma[0], "raya", "el menu no puede abrir con una raya");
        assert.notEqual(menu.forma.at(-1), "raya", "el menu no puede acabar en una raya");
        for (let i = 1; i < menu.forma.length; i++) {
            assert.ok(
                !(menu.forma[i] === "raya" && menu.forma[i - 1] === "raya"),
                `hay dos rayas seguidas: ${JSON.stringify(menu.forma)}`,
            );
        }
    } finally {
        await cerrar();
    }
});
