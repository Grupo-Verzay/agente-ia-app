/**
 * El tablero de Embudos ACABA EN SUS ETAPAS.
 *
 * Al final de las columnas había un recuadro punteado, del alto de una columna
 * y con «Nueva etapa» dentro. Con dos etapas en pantalla se leía como que el
 * embudo tenía tres, y una de ellas vacía y sin nombre: **una columna de este
 * tablero es una etapa, así que lo que no es una etapa no se pinta con su
 * forma**. Las etapas se crean donde se editan, en «Etapas del embudo».
 *
 * Se mide en Chromium, sobre el CSS del build y con el `EmbudosClient` de
 * VERDAD: la pregunta es de lo que se pinta, y leyendo el código no se contesta
 * —un `<button>` con `rounded-xl` y `border-dashed` es exactamente igual de
 * legítimo que cualquier otro hasta que se ve al lado de las columnas—.
 *
 * Lo que se comprueba, y las dos mitades hacen falta:
 *
 *   1. **La fila de columnas tiene tantos hijos como etapas**, ninguno
 *      punteado, y el último es una columna con su nombre. Con 2 etapas y con
 *      7, que es donde el fallo se veía más y menos.
 *   2. **Y la forma de crear una etapa sigue ahí**: el engranaje de cualquier
 *      columna abre «Etapas del embudo», que tiene su «Nueva etapa» y añade la
 *      fila al pulsarlo. Esto pasa IGUAL en los dos modos: es el bloque de
 *      «esto no se puede haber aflojado».
 *
 * `MODO=roto` monta el «antes» (pinchado a un commit, ver el `.sh`) y AFIRMA el
 * fallo. Sin ese modo, lo verde de al lado no diría si se quitó el recuadro o
 * si el caso no se llega a ejercer.
 *
 * Se levanta con `scripts/banco-tablero-de-embudos.sh`.
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
const HARNESS = join(AQUI, ".compilado", "harness-tablero-embudos.js");

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;

const ANCHURAS = [1440, 1280, 1024, 390];

const etapa = (id, nombre, sistema, orden) => ({ id, embudoId: "f1", nombre, color: null, orden, sistema });

/** Las siete con las que nace una cuenta. */
const SIETE = [
    etapa("e1", "Nuevo", "nuevo", 0),
    etapa("e2", "Contactado", null, 1),
    etapa("e3", "Interesado", null, 2),
    etapa("e4", "Cotizado", null, 3),
    etapa("e5", "Negociación", null, 4),
    etapa("e6", "Ganado", "ganado", 5),
    etapa("e7", "Perdido", "perdido", 6),
];

/**
 * Las dos de la captura del reporte: un embudo al que le borraron las etapas
 * del cliente. Es el caso donde el recuadro más engañaba —dos columnas de
 * verdad y una de mentira, así que parecía un tercio del embudo—.
 */
const DOS = [etapa("e6", "Ganado", "ganado", 0), etapa("e7", "Perdido", "perdido", 1)];

const tarjeta = (id, pushName, etapaId) => ({
    id,
    pushName,
    remoteJid: `5730011122${id}@s.whatsapp.net`,
    etapaId,
    asesorId: "p1",
    tags: [],
    pendingFollowUps: 0,
    leadScore: null,
    actualizadoEn: new Date("2026-09-01T12:00:00Z").toISOString(),
});

function tablero({ etapas, manda = true, tarjetas = [] }) {
    return {
        embudos: [{ id: "f1", nombre: "Embudo de ventas", porDefecto: true, orden: 0 }],
        embudoId: "f1",
        etapas,
        tarjetas,
        total: tarjetas.length,
        totales: Object.fromEntries(etapas.map((e) => [e.id, tarjetas.filter((t) => t.etapaId === e.id).length])),
        asignaciones: {},
        equipo: manda ? [{ id: "p1", nombre: "Ana Ruiz", rol: "agente" }] : [],
        nombres: { p1: "Ana Ruiz" },
        manda,
        personaId: manda ? "u1" : "p1",
        cuentaId: "c1",
        cuentaNombre: "Verzay",
        esOtraCuenta: false,
        cuentas: [],
        puedeElegirCuenta: false,
        cuentasRecortadas: false,
        asesor: null,
        enLaPapelera: 0,
    };
}

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8">` +
                    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS ?? ""} *{animation:none!important;transition:none!important}` +
                    `html,body{margin:0;height:100%}` +
                    `#pantalla{display:flex;flex-direction:column;height:100vh;width:100%}</style></head>` +
                    `<body><div id="pantalla"></div>` +
                    // La tarjeta del kanban trae `next/link`, que lee
                    // `process.env.__NEXT_*`. En la App eso lo inyecta Next; aquí
                    // no hay nada que lo ponga y el módulo revienta al cargarse
                    // —o sea `window.listo` nunca llega y el banco se queda
                    // esperando sin decir por qué—. Un `process.env` vacío es
                    // exactamente lo que ve el navegador con la configuración
                    // por defecto.
                    `<script>window.process={env:{}}</script>` +
                    `<script type="module" src="/harness.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir(ancho, inicial) {
    const server = await levantar();
    const base = `http://127.0.0.1:${server.address().port}`;
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await (await navegador.newContext({ viewport: { width: ancho, height: 900 } })).newPage();
    // Lo que no llega a pintarse mide cero y hace pasar cualquier comprobación.
    const reventones = [];
    page.on("pageerror", (e) => reventones.push(String(e)));
    await page.goto(base + "/", { waitUntil: "load" });
    try {
        await page.waitForFunction("window.listo === true", { timeout: 20000 });
        await page.evaluate((t) => window.pintar(t), inicial);
        await page.waitForSelector("span.uppercase.text-white", { timeout: 20000 });
    } catch (e) {
        // Un módulo que revienta al cargarse deja `window.listo` sin llegar, y
        // entonces lo único que se ve es un plazo agotado — que no se parece en
        // nada a su causa. El motivo de verdad está en los `pageerror`.
        throw new Error(`${e.message}\nla pantalla reventó: ${reventones.join(" | ") || "(sin errores de página)"}`);
    }
    assert.equal(reventones.join(" | "), "", `la pantalla reventó (MODO=${ROTO ? "roto" : "bueno"})`);
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

/**
 * La fila de columnas, medida desde lo que SE VE.
 *
 * Se llega a ella subiendo desde una cabecera de columna en vez de por una
 * marca del DOM: así se mide igual en los dos modos —el «antes» no tendría
 * ninguna marca nueva— y no hay forma de que el banco esté mirando otro nodo.
 */
function medirLaFila(page) {
    return page.evaluate(() => {
        const cabeceras = [...document.querySelectorAll("span.uppercase.text-white")];
        const primera = cabeceras[0]?.closest("div.rounded-xl") ?? null;
        const fila = primera?.parentElement ?? null;
        if (!fila) return null;
        const hijos = [...fila.children];
        const esPunteado = (n) => {
            const cs = getComputedStyle(n);
            return [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle].includes("dashed");
        };
        const ultimo = hijos[hijos.length - 1];
        return {
            hijos: hijos.length,
            columnas: cabeceras.length,
            nombres: cabeceras.map((c) => c.textContent?.trim()),
            punteados: hijos.filter(esPunteado).length,
            // Lo que dice la fila entera, para poder afirmar sobre el texto y no
            // solo sobre la forma.
            texto: fila.innerText ?? "",
            ultimoEsColumna: Boolean(ultimo?.querySelector("span.uppercase.text-white")),
            ultimoEsBoton: ultimo?.tagName === "BUTTON",
            /** Para el mensaje del fallo: con un hijo de más la fila mide más. */
            ancho: Math.round(fila.getBoundingClientRect().width),
        };
    });
}

// ─── 1. El tablero acaba en sus etapas ───────────────────────────────────────
for (const [comoSeLlama, etapas] of [
    ["dos etapas (la captura del reporte)", DOS],
    ["las siete con las que nace una cuenta", SIETE],
]) {
    for (const ancho of ANCHURAS) {
        test(`${ancho}: con ${comoSeLlama}, la fila acaba en una columna`, async (t) => {
            if (faltaNavegador(t)) return;
            const tarjetas = etapas.length === 7 ? [tarjeta(1, "maría lópez", "e1")] : [];
            const { page, cerrar } = await abrir(ancho, tablero({ etapas, tarjetas }));
            try {
                const m = await medirLaFila(page);
                assert.ok(m, "no se encontró la fila de columnas");
                assert.equal(m.columnas, etapas.length, `columnas pintadas: ${m.nombres.join(", ")}`);

                if (ROTO) {
                    // El «antes»: un hijo de más, punteado y con su rótulo.
                    assert.equal(
                        m.hijos,
                        etapas.length + 1,
                        `ANTES: la fila tenía un hijo de más (mide ${m.ancho} px)`,
                    );
                    assert.equal(m.punteados, 1, "ANTES: y ese hijo iba punteado");
                    assert.ok(m.texto.includes("Nueva etapa"), "ANTES: con «Nueva etapa» dentro");
                    assert.equal(m.ultimoEsBoton, true, "ANTES: la fila acababa en un botón, no en una columna");
                    return;
                }

                assert.equal(
                    m.hijos,
                    etapas.length,
                    `la fila tiene un hijo por etapa y ninguno más (mide ${m.ancho} px)`,
                );
                assert.equal(m.punteados, 0, "y ninguno punteado");
                assert.ok(!m.texto.includes("Nueva etapa"), "el tablero no dice «Nueva etapa» en ninguna parte");
                assert.equal(m.ultimoEsColumna, true, "el último hijo es una columna con su nombre");
                assert.equal(
                    m.nombres[m.nombres.length - 1],
                    etapas[etapas.length - 1].nombre,
                    "y es la última etapa del embudo",
                );
            } finally {
                await cerrar();
            }
        });
    }
}

// ─── 2. Un asesor sigue viendo solo sus columnas ─────────────────────────────
// Pasa igual en los dos modos —el recuadro era de quien manda— y está aquí
// porque quitarlo no puede haber cambiado lo que ve el resto.
test("un asesor ve solo las columnas, sin mandos de etapas", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1440, tablero({ etapas: SIETE, manda: false }));
    try {
        const m = await medirLaFila(page);
        assert.equal(m.hijos, SIETE.length, "la fila tiene un hijo por etapa");
        assert.equal(m.punteados, 0, "y ninguno punteado");
        assert.ok(!m.texto.includes("Nueva etapa"), "un asesor no ve «Nueva etapa»");
        assert.equal(await page.locator('[aria-label="Editar etapas"]').count(), 0, "ni el engranaje de etapas");
    } finally {
        await cerrar();
    }
});

// ─── 3. Y las etapas se siguen creando donde se editan ───────────────────────
// Esto pasa IGUAL en los dos modos a propósito: es lo que se conservó, y es lo
// único que hace aceptable quitar el recuadro del tablero.
test("el engranaje de una columna abre «Etapas del embudo», y ahí sí se añade una", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1440, tablero({ etapas: SIETE }));
    try {
        await page.locator('[aria-label="Editar etapas"]').first().click();
        await page.waitForSelector("text=Etapas del embudo", { timeout: 15000 });

        const antes = await page.locator('input[aria-label^="Nombre de la etapa"]').count();
        assert.equal(antes, SIETE.length, "el panel abre con las siete etapas del embudo");

        const boton = page.getByRole("button", { name: "Nueva etapa" });
        assert.equal(await boton.count(), 1, "y tiene su botón de «Nueva etapa»");
        await boton.click();

        const despues = await page.locator('input[aria-label^="Nombre de la etapa"]').count();
        assert.equal(despues, antes + 1, "pulsarlo añade una fila al borrador");
    } finally {
        await cerrar();
    }
});
