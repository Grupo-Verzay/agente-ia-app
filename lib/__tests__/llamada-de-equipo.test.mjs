/**
 * La llamada del chat de equipo, de punta a punta: DOS navegadores, WebRTC de
 * verdad y las acciones de verdad contra Postgres.
 *
 * # Lo que se prueba, y por qué así
 *
 * Los dos fallos reportados solo se ven con la llamada CONECTADA, y eso no lo
 * da ninguna maqueta:
 *
 *   1. **Plegar desaparecía al ampliar.** El botón iba `absolute` en la esquina
 *      de la tarjeta, y con la imagen puesta esa esquina es el VIDEO: un botón
 *      fantasma de icono oscuro encima de un recuadro casi negro. La tarjeta se
 *      quedaba grande sin forma aparente de volver a la pastilla.
 *   2. **Compartir pantalla salía en una llamada de voz**, porque los mandos
 *      eran una lista fija sin modo.
 *
 * Y lo nuevo, que es de dos puntas por definición: una llamada de voz se SUBE a
 * video solo si la otra parte acepta, sin cortar la llamada; y una
 * videollamada arranca ya en video.
 *
 * Cada página tiene su sesión. Sus acciones de servidor viajan por
 * `window.__accion` hasta Node, que corre las de producción con la persona de
 * ESA página (`AsyncLocalStorage`, porque las dos se cruzan). Lo único fingido
 * es el transporte y `currentUser()`.
 *
 * # El modo roto
 *
 * `MODO=roto` monta la ventana, la pastilla y el oyente de `ANTES_REF`
 * (sacados con `git show`), con las MISMAS acciones de hoy, y afirma los dos
 * fallos: la pantalla compartida en una llamada de voz y el botón de plegar
 * encima del video.
 *
 * Se levanta con `scripts/banco-llamada-de-equipo.sh`.
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
const HARNESS = join(AQUI, ".compilado", "harness-llamada-de-equipo.js");
const SERVIDOR = join(AQUI, ".compilado", "llamada-de-equipo", "entrada-de-llamada-de-equipo.js");

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;

const SELLO = Date.now().toString(36);
const ANA = { id: `ana-${SELLO}`, name: "Ana Cuenta", role: "user", ownerId: null };
const BETO = {
    id: `beto-${SELLO}`,
    name: "Beto Equipo",
    role: "user",
    ownerId: ANA.id,
    advisorRole: "agente",
};

let S = null; // el paquete de servidor: acciones, db, comoPersona
let canalId = null;

function faltaAlgo(t) {
    if (!chromium) return t.skip("sin playwright en este equipo"), true;
    if (!CSS) return t.skip("sin el CSS del build: corre `npm run build` antes"), true;
    if (!process.env.DATABASE_URL) return t.skip("sin Postgres"), true;
    return false;
}

test.before(async () => {
    if (!chromium || !CSS || !process.env.DATABASE_URL) return;
    S = await import(SERVIDOR);
    for (const u of [ANA, BETO]) {
        await S.db.user.create({
            data: {
                id: u.id,
                email: `${u.id}@banco.test`,
                name: u.name,
                ownerId: u.ownerId ?? undefined,
            },
        });
    }
    canalId = await S.abrirElDirecto({
        id: `dir-${SELLO}`,
        cuentaId: ANA.id,
        llave: `${ANA.id}::${BETO.id}`,
        miembros: [ANA.id, BETO.id],
    });
});

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8">` +
                    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS ?? ""}</style></head>` +
                    `<body style="margin:0;background:#fff"><div id="app"></div>` +
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
    return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

/** Dos navegadores —Ana y Beto— sobre el mismo arnés. */
async function abrirLasDos() {
    const server = await levantar();
    const base = `http://127.0.0.1:${server.address().port}`;
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_BIN || undefined,
        args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
        ],
    });
    const paginas = {};
    for (const [clave, persona] of [["ana", ANA], ["beto", BETO]]) {
        const ctx = await navegador.newContext({
            viewport: { width: 1280, height: 800 },
            permissions: ["camera", "microphone"],
        });
        const page = await ctx.newPage();
        page.on("pageerror", (e) => console.error(`[${clave}] pageerror`, e.message));
        await page.exposeFunction("__accion", (nombre, args) =>
            S.comoPersona(persona, async () => {
                const fn = S[nombre];
                if (typeof fn !== "function") throw new Error(`no existe ${nombre}`);
                return JSON.parse(JSON.stringify(await fn(...args)));
            }),
        );
        await page.goto(base + "/", { waitUntil: "load" });
        await page.waitForFunction("window.listo === true", null, { timeout: 20000 });
        paginas[clave] = page;
    }
    // Una vuelta del oyente de Beto deja su latido: sin él, «no está conectado».
    await paginas.beto.waitForTimeout(1500);
    return {
        ...paginas,
        async cerrar() {
            await navegador.close();
            server.close();
        },
    };
}

const LA_VENTANA = "div.fixed.z-\\[100\\]";

/** Llamar, contestar desde la pastilla y esperar a que las dos hablen. */
async function conectar(p, modo) {
    await p.ana.evaluate(
        ([c, m]) => window.llamar(c, "Beto Equipo", m),
        [canalId, modo],
    );
    await p.beto.waitForSelector('button[aria-label="Contestar"]', { timeout: 20000 });
    const rotuloEntrante = await p.beto.locator(LA_VENTANA).innerText();
    await p.beto.click('button[aria-label="Contestar"]');
    for (const page of [p.ana, p.beto]) {
        await page.waitForFunction(
            (sel) => /En (video)?llamada|\d+:\d\d/.test(document.querySelector(sel)?.innerText ?? ""),
            LA_VENTANA,
            { timeout: 25000 },
        );
    }
    return { rotuloEntrante };
}

async function ampliar(page) {
    if (await page.locator('button[aria-label="Ampliar la llamada"]').count()) {
        await page.click('button[aria-label="Ampliar la llamada"]');
    }
    await page.waitForSelector('button[aria-label="Colgar"]');
    await page.waitForTimeout(150);
}

/** Qué mandos hay en la tarjeta desplegada, por su etiqueta. */
function losMandos(page) {
    return page.evaluate((sel) => {
        const caja = document.querySelector(sel);
        return [...(caja?.querySelectorAll("button[aria-label]") ?? [])].map((b) =>
            b.getAttribute("aria-label"),
        );
    }, LA_VENTANA);
}

/**
 * Dónde está el botón de plegar/ampliar respecto a la caja, y si algo lo tapa
 * o él tapa el video.
 */
function elBotonDePlegado(page) {
    return page.evaluate((sel) => {
        const caja = document.querySelector(sel);
        const b = caja?.querySelector(
            'button[aria-label="Plegar la llamada"], button[aria-label="Ampliar la llamada"]',
        );
        if (!caja || !b) return null;
        const rc = caja.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const cx = rb.left + rb.width / 2;
        const cy = rb.top + rb.height / 2;
        const encima = document.elementFromPoint(cx, cy);
        const videos = [...caja.querySelectorAll("video")].map((v) => v.getBoundingClientRect());
        const sobreVideo = videos.some(
            (v) =>
                v.width > 0 &&
                rb.left < v.right && rb.right > v.left && rb.top < v.bottom && rb.bottom > v.top,
        );
        return {
            etiqueta: b.getAttribute("aria-label"),
            derecha: Math.round(rc.right - rb.right),
            arriba: Math.round(rb.top - rc.top),
            alcanzable: Boolean(encima && (encima === b || b.contains(encima))),
            dentroDeLaPantalla:
                rb.left >= 0 && rb.top >= 0 && rb.right <= innerWidth && rb.bottom <= innerHeight,
            sobreVideo,
        };
    }, LA_VENTANA);
}

async function colgar(p) {
    for (const page of [p.ana, p.beto]) {
        const b = page.locator(`${LA_VENTANA} button[aria-label="Colgar"]`).first();
        if (await b.count()) {
            await b.click().catch(() => {});
            break;
        }
    }
    await p.ana.waitForTimeout(4000);
}

// ─────────────────────────────────────────────────────────────────────────────

test("llamada de VOZ: arranca en voz, sin cámara ni pantalla compartida", async (t) => {
    if (faltaAlgo(t)) return;
    const p = await abrirLasDos();
    try {
        const { rotuloEntrante } = await conectar(p, "voz");
        await ampliar(p.ana);
        const mandos = await losMandos(p.ana);

        if (ROTO) {
            // Lo reportado: la pantalla compartida en una llamada de voz.
            assert.ok(
                mandos.includes("Compartir la pantalla"),
                `ANTES: se esperaba el botón de compartir en voz; hay ${mandos}`,
            );
            return;
        }

        assert.match(rotuloEntrante, /Llamada de voz entrante/);
        assert.ok(!mandos.includes("Compartir la pantalla"), `en voz NO hay pantalla: ${mandos}`);
        assert.ok(!mandos.includes("Encender la cámara"), `en voz NO hay cámara: ${mandos}`);
        assert.ok(mandos.includes("Pasar a videollamada"), `ofrece subir a video: ${mandos}`);
        assert.equal(await p.ana.locator(`${LA_VENTANA} video`).count(), 0, "voz: sin recuadro");
    } finally {
        await colgar(p);
        await p.cerrar();
    }
});

test("plegar se ve y está en el MISMO sitio que ampliar, en voz y en video", async (t) => {
    if (faltaAlgo(t)) return;
    const p = await abrirLasDos();
    try {
        // Una videollamada: es donde el botón de antes caía encima del video.
        await conectar(p, "video");
        // La imagen de los dos lados tarda un momento en llegar.
        await p.ana.waitForTimeout(2500);

        const plegada = await elBotonDePlegado(p.ana);
        assert.equal(plegada?.etiqueta, "Ampliar la llamada", "arranca plegada");
        await ampliar(p.ana);
        // Antes no había videollamada: la cámara se encendía a mano en una de
        // voz, que es como se llegaba a la tarjeta con imagen.
        if (ROTO) await p.ana.click('button[aria-label="Encender la cámara"]');
        await p.ana.waitForFunction(
            (sel) => document.querySelectorAll(`${sel} video`).length > 0,
            LA_VENTANA,
            { timeout: 15000 },
        );
        const ampliada = await elBotonDePlegado(p.ana);

        if (ROTO) {
            assert.ok(ampliada?.sobreVideo, `ANTES: el botón de plegar iba encima del video: ${JSON.stringify(ampliada)}`);
            return;
        }

        assert.equal(ampliada.etiqueta, "Plegar la llamada");
        assert.ok(ampliada.alcanzable, `nada lo tapa: ${JSON.stringify(ampliada)}`);
        assert.ok(ampliada.dentroDeLaPantalla, "dentro de la pantalla");
        assert.equal(ampliada.sobreVideo, false, "NO va encima del video");
        assert.ok(
            Math.abs(ampliada.derecha - plegada.derecha) <= 1 &&
                Math.abs(ampliada.arriba - plegada.arriba) <= 1,
            `mismo sitio: plegada ${JSON.stringify(plegada)} / ampliada ${JSON.stringify(ampliada)}`,
        );

        // Y funciona: vuelve a la pastilla, y se puede ampliar otra vez.
        await p.ana.click('button[aria-label="Plegar la llamada"]');
        await p.ana.waitForSelector('button[aria-label="Ampliar la llamada"]', { timeout: 3000 });
        await ampliar(p.ana);
        assert.equal((await elBotonDePlegado(p.ana)).etiqueta, "Plegar la llamada");
        // Y al volver a ampliar, la imagen del otro sigue ahí. Plegar desmonta
        // el `<video>`; sin engancharlo al montarse, volvía vacío: negro.
        await p.ana.waitForFunction(
            (sel) =>
                [...document.querySelectorAll(`${sel} video`)].some(
                    (v) => !v.muted && v.srcObject?.getVideoTracks?.().length > 0,
                ),
            LA_VENTANA,
            { timeout: 8000 },
        );
    } finally {
        await colgar(p);
        await p.cerrar();
    }
});

test("subir a video: solo si el otro ACEPTA, y sin cortar la llamada", async (t) => {
    if (faltaAlgo(t) || ROTO) return; // antes no existía: no hay fallo que afirmar
    const p = await abrirLasDos();
    try {
        await conectar(p, "voz");
        await ampliar(p.ana);
        await p.ana.waitForTimeout(2200);
        const antes = await p.ana.locator(LA_VENTANA).innerText();
        const segAntes = Number((antes.match(/(\d+):(\d\d)/) ?? [0, 0, 0]).slice(1).reduce((m, s) => m * 60 + Number(s), 0));
        const llamadaAntes = await S.db.$queryRawUnsafe(
            `SELECT "id","estado","modo" FROM "llamadas_de_voz" WHERE "estado"='en_curso' AND "dellamaId"=$1`,
            ANA.id,
        );
        assert.equal(llamadaAntes.length, 1);

        await p.ana.click('button[data-mando="subir-a-video"]');
        // Beto ve la petición (la ventana se despliega sola) y NADIE tiene
        // cámara todavía.
        await p.beto.waitForSelector('[data-llamada="peticion-de-video"]', { timeout: 10000 });
        assert.equal(await p.ana.locator(`${LA_VENTANA} video`).count(), 0, "Ana: sin cámara hasta que acepten");
        assert.equal(await p.beto.locator(`${LA_VENTANA} video`).count(), 0, "Beto: sin cámara hasta aceptar");
        const esperando = await p.ana.getAttribute('button[data-mando="subir-a-video"]', "aria-label");
        assert.match(esperando, /Esperando/);

        // Quien PIDIÓ no puede aceptárselo a sí mismo, ni por la puerta de atrás.
        const trampa = await S.comoPersona(ANA, () =>
            S.contestarVideoAction(llamadaAntes[0].id, true),
        );
        assert.equal(trampa.success, false, "el que pide no se acepta solo");

        await p.beto.click('text=Aceptar video');
        for (const page of [p.ana, p.beto]) {
            await page.waitForFunction(
                (sel) => /En videollamada/.test(document.querySelector(sel)?.innerText ?? ""),
                LA_VENTANA,
                { timeout: 15000 },
            );
        }
        // Las dos reciben la imagen del otro, por la MISMA conexión.
        for (const page of [p.ana, p.beto]) {
            await page.waitForFunction(
                (sel) =>
                    [...document.querySelectorAll(`${sel} video`)].some(
                        (v) => !v.muted && v.srcObject?.getVideoTracks?.().some((tr) => tr.readyState === "live" && !tr.muted),
                    ),
                LA_VENTANA,
                { timeout: 15000 },
            );
        }
        const mandos = await losMandos(p.ana);
        assert.ok(mandos.includes("Compartir la pantalla"), `en video SÍ hay pantalla: ${mandos}`);
        assert.ok(!mandos.includes("Pasar a videollamada"), "ya no ofrece subir");

        // No se cortó: la misma fila, en curso, en video; y el contador sigue.
        const despues = await S.db.$queryRawUnsafe(
            `SELECT "id","estado","modo" FROM "llamadas_de_voz" WHERE "id"=$1`,
            llamadaAntes[0].id,
        );
        assert.deepEqual(
            { estado: despues[0].estado, modo: despues[0].modo },
            { estado: "en_curso", modo: "video" },
        );
        const txt = await p.ana.locator(LA_VENTANA).innerText();
        const segDespues = Number((txt.match(/(\d+):(\d\d)/) ?? [0, 0, 0]).slice(1).reduce((m, s) => m * 60 + Number(s), 0));
        assert.ok(segDespues > segAntes, `el contador sigue: ${segAntes} -> ${segDespues}`);
        const audioVivo = await p.ana.evaluate(() =>
            [...document.querySelectorAll("audio")].some((a) =>
                a.srcObject?.getAudioTracks?.().some((tr) => tr.readyState === "live"),
            ),
        );
        assert.ok(audioVivo, "el audio del otro sigue llegando");
    } finally {
        await colgar(p);
        await p.cerrar();
    }
});

test("si el otro NO acepta, sigue en voz y quien pidió se entera", async (t) => {
    if (faltaAlgo(t) || ROTO) return;
    const p = await abrirLasDos();
    try {
        await conectar(p, "voz");
        await ampliar(p.ana);
        await p.ana.click('button[data-mando="subir-a-video"]');
        await p.beto.waitForSelector('[data-llamada="peticion-de-video"]', { timeout: 10000 });
        await p.beto.click("text=Seguir con voz");
        await p.ana.waitForSelector("text=prefiere seguir solo con voz", { timeout: 10000 });
        const mandos = await losMandos(p.ana);
        assert.ok(!mandos.includes("Compartir la pantalla"), "sigue sin pantalla");
        assert.ok(mandos.includes("Pasar a videollamada"), "y se puede volver a pedir");
        assert.equal(await p.ana.locator(`${LA_VENTANA} video`).count(), 0);
    } finally {
        await colgar(p);
        await p.cerrar();
    }
});

test("una VIDEOLLAMADA arranca en video, con cámara y pantalla compartida", async (t) => {
    if (faltaAlgo(t) || ROTO) return;
    const p = await abrirLasDos();
    try {
        const { rotuloEntrante } = await conectar(p, "video");
        assert.match(rotuloEntrante, /Videollamada entrante/);
        await ampliar(p.beto);
        await p.beto.waitForFunction(
            (sel) => /En videollamada/.test(document.querySelector(sel)?.innerText ?? ""),
            LA_VENTANA,
            { timeout: 10000 },
        );
        const mandos = await losMandos(p.beto);
        assert.ok(mandos.includes("Apagar la cámara"), `cámara ENCENDIDA desde el principio: ${mandos}`);
        assert.ok(mandos.includes("Compartir la pantalla"), `pantalla disponible: ${mandos}`);
        assert.ok(!mandos.includes("Pasar a videollamada"));
    } finally {
        await colgar(p);
        await p.cerrar();
    }
});

test("el directo anota una videollamada como videollamada", async (t) => {
    if (faltaAlgo(t) || ROTO) return;
    const filas = await S.db.$queryRawUnsafe(
        `SELECT "texto" FROM "team_chat_messages" WHERE "canalId"=$1 AND "id" LIKE 'llamada-%'`,
        canalId,
    );
    const textos = filas.map((f) => f.texto);
    assert.ok(textos.some((x) => /^Videollamada · /.test(x)), `hay videollamadas anotadas: ${textos}`);
    assert.ok(textos.some((x) => /^Llamada de voz · /.test(x)), `y llamadas de voz: ${textos}`);
});
