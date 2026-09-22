/**
 * El menú verde de la cabecera de Chats, en Chromium y con el componente REAL.
 *
 * # Qué se prueba, y por qué aquí
 *
 * Las dos opciones del menú disparan **dos llamadas distintas**, y las dos
 * tienen que salir por **la línea de la conversación abierta**:
 *
 *   | opción          | qué dispara                          | por dónde va la línea |
 *   | --------------- | ------------------------------------ | --------------------- |
 *   | Llamar          | el evento `llamada:abrir` del layout | `detail.instanceName` |
 *   | Llamar con IA   | `startBotCallAction`                 | su segundo parámetro  |
 *
 * Eso no se contesta leyendo el componente: hay que **pulsar** cada entrada y
 * mirar qué salió. Radix monta el contenido del menú en un portal y solo al
 * abrirlo, así que el `onSelect` de cada opción es código que no se ejecuta sin
 * navegador.
 *
 * Y se comprueba además lo que separa a las dos: **cada una dispara la suya y
 * NO la otra**. Un menú que al pulsar «Llamar» lanzara también la llamada con
 * IA gastaría créditos sin que nadie los pidiera, y eso no da ningún error.
 *
 * # El modo roto
 *
 * `MODO=roto` monta la versión INGENUA —la que sale de copiar el manejador del
 * marcador del CRM, `startBotCallAction(digitos)` sin más— y **afirma el
 * fallo**: la llamada con IA sale sin línea. No es «el componente de antes»
 * —este menú es nuevo— y por eso se dice: es la forma en que esto se escribe
 * solo, y es exactamente el fallo que *la salida es la línea de la
 * CONVERSACIÓN* describe entero.
 *
 * Se levanta con `scripts/banco-llamar-con-ia.sh`.
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
const HARNESS = join(AQUI, ".compilado", "harness-menu-de-llamada.js");

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;

/** La conversación abierta: un contacto de una línea que NO es la de quien mira. */
const LA_CONVERSACION = {
    phone: "573001112233",
    contactName: "Marta Restrepo",
    instanceType: "waha",
    instanceName: "VERZAY_ATENCION",
};

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><style>${CSS ?? ""}</style></head>` +
                    `<body style="margin:0"><div id="menu"></div>` +
                    `<script type="module" src="/harness-menu-de-llamada.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness-menu-de-llamada.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir(datos = LA_CONVERSACION) {
    const server = await levantar();
    const base = `http://127.0.0.1:${server.address().port}`;
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await (
        await navegador.newContext({ viewport: { width: 1280, height: 800 } })
    ).newPage();
    await page.goto(base + "/", { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.evaluate((d) => window.pintarMenu(d), datos);
    await page.waitForTimeout(120);
    return {
        page,
        async cerrar() {
            await navegador.close();
            server.close();
        },
    };
}

/** Pulsa el disparador y después la opción, y devuelve lo que salió por cada vía. */
async function elegir(page, opcion) {
    await page.click('[data-menu-llamada]');
    await page.waitForSelector(`[data-opcion="${opcion}"]`, { timeout: 5000 });
    await page.click(`[data-opcion="${opcion}"]`);
    await page.waitForTimeout(200);
    return page.evaluate(() => ({
        // El evento de verdad que escucha el anfitrión del layout.
        eventos: window.__abiertas ?? [],
        // Lo que recibió `startBotCallAction`.
        ia: window.__llamadasIa ?? [],
    }));
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

test("«Llamar» abre la tarjeta del layout con la línea de la conversación", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir();
    try {
        const { eventos, ia } = await elegir(page, "llamar");

        assert.equal(eventos.length, 1, "«Llamar» tiene que disparar `llamada:abrir` una vez");
        assert.equal(eventos[0].phone, "573001112233");
        assert.equal(
            eventos[0].instanceName,
            "VERZAY_ATENCION",
            "la llamada sale por la línea de la conversación abierta, no por la de quien mira",
        );
        assert.equal(eventos[0].instanceType, "waha");
        // Y NO la otra: pulsar «Llamar» no puede gastar créditos de IA.
        assert.equal(ia.length, 0, "«Llamar» no puede llamar a `startBotCallAction`");
    } finally {
        await cerrar();
    }
});

test("«Llamar con IA» dispara su propia llamada, y con la MISMA línea", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir();
    try {
        const { eventos, ia } = await elegir(page, "llamar-ia");

        assert.equal(ia.length, 1, "«Llamar con IA» tiene que llamar a `startBotCallAction`");
        assert.equal(ia[0].phone, "573001112233");
        // Y no abre la tarjeta de la llamada normal: son dos llamadas distintas.
        assert.equal(eventos.length, 0, "«Llamar con IA» no abre la tarjeta de la llamada normal");

        if (ROTO) {
            // EL FALLO: copiando el manejador del marcador, la línea se queda
            // por el camino y la llamada sale con el número de la cuenta de
            // quien mira, con su burbuja anotada en otra conversación.
            assert.equal(
                ia[0].linea,
                null,
                "la versión ingenua tiene que perder la línea; si la pasa, este modo no ejerce nada",
            );
            return;
        }

        assert.equal(
            ia[0].linea,
            "VERZAY_ATENCION",
            "la llamada con IA va por la línea de la conversación abierta",
        );
    } finally {
        await cerrar();
    }
});

test("cada conversación lleva SU línea, no la de la anterior", async (t) => {
    if (faltaNavegador(t)) return;
    if (ROTO) return; // sin línea no hay nada que distinguir
    const otra = { ...LA_CONVERSACION, phone: "573009998877", instanceName: "VERZAY_VENTAS" };
    const { page, cerrar } = await abrir(otra);
    try {
        const { ia } = await elegir(page, "llamar-ia");
        assert.equal(ia[0].phone, "573009998877");
        assert.equal(ia[0].linea, "VERZAY_VENTAS");
    } finally {
        await cerrar();
    }
});

test("el menú ofrece las dos opciones, en su orden, y no añade un segundo botón", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir();
    try {
        // Un solo disparador en la cabecera: el encargo era que el botón verde
        // pasara a ser un menú, no que apareciera otro botón al lado.
        const disparadores = await page.locator("[data-menu-llamada]").count();
        assert.equal(disparadores, 1, "la cabecera tiene UN botón de llamar, no dos");

        await page.click("[data-menu-llamada]");
        await page.waitForSelector('[data-opcion="llamar"]', { timeout: 5000 });
        const rotulos = await page.evaluate(() =>
            [...document.querySelectorAll("[data-opcion]")].map((n) => n.textContent.trim()),
        );
        // «Llamar IA», igual que en la ventana de Llamar del CRM. La versión
        // ingenua del modo roto es la de antes y conserva su rótulo viejo.
        assert.deepEqual(rotulos, ["Llamar", ROTO ? "Llamar con IA" : "Llamar IA"], "en este orden");
    } finally {
        await cerrar();
    }
});
