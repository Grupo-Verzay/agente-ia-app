/**
 * ACTUALIZACIONES: la tarjeta de Documentación, la pantalla que publica y la
 * ventana que salta una vez a cada persona.
 *
 * # Qué se rompe aquí, y por eso son tres mitades
 *
 * 1. **La regla** (pura): qué se puede publicar —el texto obligatorio, el
 *    archivo solo si es NUESTRO— y cuál le toca ver a cada persona: la más
 *    reciente que no ha visto, y ninguna si ya la vio.
 * 2. **Las acciones contra Postgres**: que publicar es de la casa y un cliente
 *    no puede, que a cada persona le sale UNA vez —cerrada o vista, no vuelve—,
 *    que dos personas no se pisan, que una nueva vuelve a salir, que retirar la
 *    quita, y que la consulta en SQL dice lo mismo que la regla pura.
 * 3. **La pantalla en Chromium**, sobre el CSS del build: las cuatro tarjetas
 *    en su orden —Actualizaciones, Tutoriales, Guías, Meta—, sin «Plantillas
 *    IA», y SIMÉTRICAS (mismo ancho, alto, y el icono, el título, la
 *    descripción y el botón a la misma altura en las cuatro) a
 *    1440/1280/1024/390; y la ventana: sale sola, «Ver completo» la agranda y
 *    la marca como vista, cerrar la marca, y una vez marcada no vuelve.
 *
 * `MODO=roto` pinta la página de Documentación de `ANTES_REF` —pinchado a un
 * commit, nunca `origin/main`— y AFIRMA el fallo: «Plantillas IA» dentro, sin
 * «Actualizaciones», y ninguna ventana que salte en el layout.
 *
 * Se levanta con `scripts/banco-actualizaciones.sh`.
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
const COMPILADO = join(AQUI, ".compilado", "actualizaciones");
const HARNESS = join(AQUI, ".compilado", "harness-actualizaciones.js");
const ANTES_REF = process.env.ANTES_REF ?? "97ae916";

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deAntes = (f) => {
    try {
        return execFileSync("git", ["show", `${ANTES_REF}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};

const reglas = await import(join(COMPILADO, "actualizaciones.js"));

const BUCKET = { publicUrl: "https://s3.test", nombre: "verzay-media" };
const URL_BUENA = "https://s3.test/verzay-media/cuenta1/actualizaciones/abc-video.mp4";

// ─────────────────────────────────────────────────────────────────────────────
// 1. La regla, pura
// ─────────────────────────────────────────────────────────────────────────────

test("el texto es obligatorio y se sanea", () => {
    assert.equal(reglas.loQueSePublica({ texto: "   " }, BUCKET).ok, false);
    assert.equal(reglas.loQueSePublica({}, BUCKET).ok, false);
    const r = reglas.loQueSePublica({ texto: "  hola\r\nmundo  " }, BUCKET);
    assert.deepEqual(r, { ok: true, texto: "hola\nmundo", archivo: null });
    const largo = reglas.loQueSePublica({ texto: "x".repeat(5000) }, BUCKET);
    assert.equal(largo.texto.length, reglas.TOPE_DE_TEXTO);
});

test("el archivo solo vale si es de NUESTRO bucket", () => {
    const bueno = reglas.loQueSePublica({ texto: "t", archivo: { url: URL_BUENA, nombre: "video.mp4", mime: "video/mp4", tamano: 10 } }, BUCKET);
    assert.equal(bueno.ok, true);
    assert.equal(bueno.archivo.url, URL_BUENA);
    for (const url of [
        "https://otro.test/verzay-media/c/actualizaciones/x.mp4",
        "https://s3.test/verzay-media/c/../../x.mp4",
        "javascript:alert(1)",
    ]) {
        const r = reglas.loQueSePublica({ texto: "t", archivo: { url } }, BUCKET);
        assert.equal(r.ok, false, `${url} no puede colarse en la ventana de toda la plataforma`);
    }
});

test("de qué clase es el archivo", () => {
    assert.equal(reglas.laClaseDelArchivo({ url: URL_BUENA, nombre: "a.mp4", mime: "video/mp4", tamano: 1 }), "video");
    assert.equal(reglas.laClaseDelArchivo({ url: "u", nombre: "manual.pdf", mime: "application/pdf", tamano: 1 }), "documento");
    assert.equal(reglas.laClaseDelArchivo({ url: "u", nombre: "a.png", mime: "image/png", tamano: 1 }), "imagen");
    assert.equal(reglas.laClaseDelArchivo(null), null);
});

test("le toca la MÁS RECIENTE que no ha visto, y ninguna si ya la vio", () => {
    const a = { id: "a", publicadaEn: "2026-09-01T00:00:00.000Z" };
    const b = { id: "b", publicadaEn: "2026-09-10T00:00:00.000Z" };
    assert.equal(reglas.laActualizacionPendiente([], []), null);
    assert.equal(reglas.laActualizacionPendiente([a, b], []).id, "b");
    assert.equal(reglas.laActualizacionPendiente([b, a], ["a"]).id, "b");
    assert.equal(reglas.laActualizacionPendiente([a, b], ["b"]), null, "la vieja no salta aunque no se viera");
    assert.equal(reglas.laActualizacionPendiente([a, b], new Set(["b"])), null);
});

test("cómo se cerró: solo «vista» es vista; lo demás es «cerrada»", () => {
    assert.equal(reglas.comoSeCerro("vista"), "vista");
    assert.equal(reglas.comoSeCerro("cerrada"), "cerrada");
    assert.equal(reglas.comoSeCerro("lo-que-sea"), "cerrada");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Barrido del código
// ─────────────────────────────────────────────────────────────────────────────

test("barrido: la tarjeta, la ruta y la ventana existen donde tienen que estar", () => {
    const pagina = ROTO ? deAntes("app/(root)/documentation/page.tsx") : crudo("app/(root)/documentation/page.tsx");
    const layout = ROTO ? deAntes("app/(root)/layout.tsx") : crudo("app/(root)/layout.tsx");
    if (ROTO) {
        assert.ok(pagina.includes('"Plantillas IA"'), "el antes tenía «Plantillas IA»");
        assert.ok(!pagina.includes('"Actualizaciones"'), "el antes no tenía «Actualizaciones»");
        assert.ok(!layout.includes("AvisoDeActualizacion"), "el antes no montaba ninguna ventana");
        assert.equal(deAntes("actions/actualizaciones-actions.ts"), null, "el antes no tenía acciones");
        return;
    }
    assert.ok(!pagina.includes('"Plantillas IA"'), "«Plantillas IA» se quita de Documentación");
    const orden = ["Actualizaciones", "Administrador tutoriales", "Administrador guías", "Conexión API de Meta"].map((t) =>
        pagina.indexOf(`title: "${t}"`),
    );
    assert.ok(orden.every((i) => i > 0), "las cuatro tarjetas existen");
    assert.deepEqual([...orden].sort((x, y) => x - y), orden, "en el orden pedido");
    assert.ok(layout.includes("<AvisoDeActualizacion />"), "la ventana cuelga del layout: sale esté donde esté");
    assert.ok(crudo("lib/navigation-routes.ts").includes('"/documentation/actualizaciones"'));

    const acciones = crudo("actions/actualizaciones-actions.ts");
    for (const f of ["publicarActualizacionAction", "retirarActualizacionAction", "listarActualizacionesAction"]) {
        const trozo = acciones.slice(acciones.indexOf(`function ${f}`));
        const cuerpo = trozo.slice(0, trozo.indexOf("\nexport ") > 0 ? trozo.indexOf("\nexport ") : undefined);
        assert.ok(cuerpo.includes("quienMandaEnLaCasa("), `${f} pasa por la puerta de la casa`);
    }
    // Ninguna acción de ver/cerrar acepta un id de persona del navegador.
    assert.ok(!/miActualizacionPendienteAction\([^)]/.test(acciones), "la pendiente no recibe parámetros");
    assert.ok(!/userId|personaId\s*:/.test(acciones.replace(/\/\*[\s\S]*?\*\//g, "")), "ningún id de persona llega de fuera");
    assert.ok(!crudo("prisma/schema.prisma").includes("actualizacion"), "ni una columna en el esquema del backend");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Las acciones, contra Postgres
// ─────────────────────────────────────────────────────────────────────────────

const hayBase = Boolean(process.env.DATABASE_URL) && !ROTO;
const acc = hayBase ? await import(join(COMPILADO, "entrada-de-actualizaciones.js")) : null;
const sello = Date.now().toString(36);
const idDe = (q) => `act-${sello}-${q}`;

async function persona(quien, role = "user") {
    const id = idDe(quien);
    await acc.db.user.upsert({ where: { id }, update: { role }, create: { id, email: `${id}@banco.test`, name: quien, role } });
    return { id, role, name: quien, ownerId: null, rolDeLaPersona: role };
}

test("publicar es de la CASA: un cliente no puede, un admin sí", { skip: !hayBase }, async () => {
    const cliente = await persona("cliente");
    acc.ponerAQuienMira(cliente);
    assert.equal(await acc.puedoPublicarActualizacionesAction(), false);
    const r = await acc.publicarActualizacionAction({ texto: "intento" });
    assert.equal(r.success, false);
    assert.equal((await acc.listarActualizacionesAction()).success, false, "tampoco lista");

    const admin = await persona("admin", "admin");
    acc.ponerAQuienMira(admin);
    assert.equal(await acc.puedoPublicarActualizacionesAction(), true);
    const vacia = await acc.publicarActualizacionAction({ texto: "   " });
    assert.equal(vacia.success, false, "sin texto no se publica");
    const ajena = await acc.publicarActualizacionAction({ texto: "t", archivo: { url: "https://evil.test/x.mp4" } });
    assert.equal(ajena.success, false, "un archivo de fuera no se publica");
});

test("a cada persona le sale UNA vez: cerrada o vista, no vuelve", { skip: !hayBase }, async () => {
    const admin = await persona("admin2", "admin");
    acc.ponerAQuienMira(admin);
    const pub = await acc.publicarActualizacionAction({
        texto: "Nueva función de reportes",
        archivo: { url: `${process.env.S3_PUBLIC_URL}/verzay-media/${admin.id}/actualizaciones/x-guia.pdf`, nombre: "guia.pdf", mime: "application/pdf", tamano: 2048 },
    });
    assert.equal(pub.success, true, pub.message);
    assert.equal(pub.data.archivo.nombre, "guia.pdf");

    const ana = await persona("ana");
    const luis = await persona("luis");

    acc.ponerAQuienMira(ana);
    const p1 = await acc.miActualizacionPendienteAction();
    assert.equal(p1?.id, pub.data.id, "a Ana le toca la recién publicada");
    assert.equal(p1.texto, "Nueva función de reportes");
    // Dos pestañas cerrando a la vez: una sola fila.
    await Promise.all([
        acc.marcarActualizacionVistaAction(pub.data.id, "cerrada"),
        acc.marcarActualizacionVistaAction(pub.data.id, "vista"),
    ]);
    assert.equal(await acc.miActualizacionPendienteAction(), null, "cerrada: a Ana no le vuelve a salir");
    const filas = await acc.db.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM "actualizaciones_vistas" WHERE "personaId" = $1`,
        ana.id,
    );
    assert.equal(filas[0].n, 1);

    acc.ponerAQuienMira(luis);
    assert.equal((await acc.miActualizacionPendienteAction())?.id, pub.data.id, "Luis no se pisa con Ana: a él sí le sale");
    await acc.marcarActualizacionVistaAction(pub.data.id, "vista");
    assert.equal(await acc.miActualizacionPendienteAction(), null, "vista: a Luis no le vuelve a salir");

    // Una marca de un id que no existe no escribe nada.
    await acc.marcarActualizacionVistaAction("no-existe", "vista");

    // Una NUEVA vuelve a salir a los dos.
    acc.ponerAQuienMira(admin);
    await new Promise((r) => setTimeout(r, 15));
    const pub2 = await acc.publicarActualizacionAction({ texto: "Segunda" });
    assert.equal(pub2.success, true);
    acc.ponerAQuienMira(ana);
    assert.equal((await acc.miActualizacionPendienteAction())?.id, pub2.data.id);

    // La lista dice cuántos la vieron.
    acc.ponerAQuienMira(admin);
    const lista = await acc.listarActualizacionesAction();
    const vieja = lista.data.find((a) => a.id === pub.data.id);
    assert.ok(vieja.vistas >= 2, "Ana y Luis la vieron");
    assert.equal(lista.data[0].id, pub2.data.id, "la más reciente primero");

    // Retirar la quita: a Ana ya no le sale la segunda.
    assert.equal((await acc.retirarActualizacionAction(pub2.data.id)).success, true);
    acc.ponerAQuienMira(ana);
    const trasRetirar = await acc.miActualizacionPendienteAction();
    assert.notEqual(trasRetirar?.id, pub2.data.id, "retirada: ya no le salta a nadie");
    // Un cliente no puede retirar.
    acc.ponerAQuienMira(luis);
    assert.equal((await acc.retirarActualizacionAction(pub.data.id)).success, false);
});

test("la consulta de la pendiente dice lo mismo que la regla pura", { skip: !hayBase }, async () => {
    const admin = await persona("admin3", "admin");
    acc.ponerAQuienMira(admin);
    await acc.publicarActualizacionAction({ texto: "Tercera" });
    const todas = await acc.lasActualizaciones(500);
    for (const quien of ["p1", "p2"]) {
        const p = await persona(quien);
        acc.ponerAQuienMira(p);
        const vistas = (
            await acc.db.$queryRawUnsafe(`SELECT "actualizacionId" FROM "actualizaciones_vistas" WHERE "personaId" = $1`, p.id)
        ).map((f) => f.actualizacionId);
        const pura = reglas.laActualizacionPendiente(todas, vistas);
        const sql = await acc.miActualizacionPendienteAction();
        assert.equal(sql?.id ?? null, pura?.id ?? null);
        if (sql) await acc.marcarActualizacionVistaAction(sql.id, "cerrada");
        const vistas2 = (
            await acc.db.$queryRawUnsafe(`SELECT "actualizacionId" FROM "actualizaciones_vistas" WHERE "personaId" = $1`, p.id)
        ).map((f) => f.actualizacionId);
        assert.equal((await acc.miActualizacionPendienteAction())?.id ?? null, reglas.laActualizacionPendiente(todas, vistas2)?.id ?? null);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. La pantalla y la ventana, en Chromium
// ─────────────────────────────────────────────────────────────────────────────

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;
const hayNavegador = Boolean(chromium && CSS && fs.existsSync(HARNESS));

async function conLaPantalla(hacer) {
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style></head>
<body class="app-module-content"><div id="app"></div>
<script>window.process=window.process||{env:{}};</script>
<script type="module">${fs.readFileSync(HARNESS, "utf8")}</script></body></html>`;
    const servidor = http.createServer((_q, res) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
    }).listen(0);
    await new Promise((r) => servidor.once("listening", r));
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox"] });
    try {
        await hacer(navegador, servidor.address().port);
    } finally {
        await navegador.close();
        servidor.close();
    }
}

async function abrir(navegador, puerto, ancho, alto, que) {
    const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    const errores = [];
    pagina.on("pageerror", (e) => errores.push(String(e)));
    await pagina.goto(`http://127.0.0.1:${puerto}/`);
    await pagina.waitForFunction("window.listo === true", null, { timeout: 15000 });
    await pagina.evaluate(que);
    await pagina.waitForTimeout(400);
    assert.deepEqual(errores, [], `la pantalla no llegó a pintarse a ${ancho}x${alto}`);
    return pagina;
}

const MEDIR = `() => {
    // El «antes» no lleva la marca: se busca también por su forma, que existe
    // en los dos mundos (las hijas de la rejilla).
    let cajas = [...document.querySelectorAll('[data-tarjeta-de-documentacion]')];
    if (!cajas.length) cajas = [...document.querySelectorAll('#app .grid > div')];
    const r = (el) => el ? el.getBoundingClientRect() : null;
    return {
        desborda: document.documentElement.scrollWidth > window.innerWidth,
        tarjetas: cajas.map((c) => {
            const t = r(c);
            const icono = r(c.querySelector('.rounded-2xl.w-12, .w-12.h-12'));
            const titulo = r(c.querySelector('[data-titulo-de-tarjeta]') ?? c.querySelector('p'));
            const desc = r(c.querySelector('[data-descripcion-de-tarjeta]') ?? c.querySelectorAll('p')[1]);
            const boton = c.querySelector('a');
            const b = r(boton);
            return {
                titulo: c.getAttribute('data-tarjeta-de-documentacion') ?? c.querySelector('p')?.textContent?.trim(),
                top: t.top, left: t.left, ancho: t.width, alto: t.height,
                icono: icono.top - t.top, tituloY: titulo.top - t.top, descY: desc.top - t.top,
                botonY: b.top - t.top, botonAlto: b.height, botonAncho: b.width,
                color: getComputedStyle(boton).backgroundColor,
                textoBoton: getComputedStyle(boton).color,
            };
        }),
    };
}`;

const ORDEN = ["Actualizaciones", "Administrador tutoriales", "Administrador guías", "Conexión API de Meta"];
const VENTANAS = [[1440, 900], [1280, 800], [1024, 768], [390, 844]];
const cerca = (a, b, tol = 1) => Math.abs(a - b) <= tol;

test("las cuatro tarjetas, en su orden y SIMÉTRICAS", { skip: !hayNavegador }, async (t) => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            await t.test(`${ancho}x${alto}`, async () => {
                const p = await abrir(nav, puerto, ancho, alto, "window.documentacion()");
                const m = await p.evaluate(`(${MEDIR})()`);
                const titulos = m.tarjetas.map((x) => x.titulo);
                if (ROTO) {
                    assert.ok(titulos.includes("Plantillas IA"), "el antes tenía «Plantillas IA»");
                    assert.ok(!titulos.includes("Actualizaciones"), "y no tenía «Actualizaciones»");
                    await p.close();
                    return;
                }
                assert.deepEqual(titulos, ORDEN);
                assert.equal(m.desborda, false, "nada desborda a lo ancho");
                const [a] = m.tarjetas;
                for (const x of m.tarjetas) {
                    assert.ok(cerca(x.ancho, a.ancho), `${x.titulo}: mismo ancho (${x.ancho} vs ${a.ancho})`);
                    for (const k of ["icono", "tituloY", "descY", "botonY", "botonAlto"]) {
                        assert.ok(cerca(x[k], a[k]), `${x.titulo}: ${k} ${x[k]} vs ${a[k]}`);
                    }
                    assert.ok(cerca(x.botonAncho, x.ancho - 40, 2), `${x.titulo}: el botón ocupa el ancho de su tarjeta`);
                }
                if (ancho >= 1024) {
                    // Una fila: mismo borde de arriba y mismo alto, y de izquierda a derecha.
                    for (const x of m.tarjetas) {
                        assert.ok(cerca(x.top, a.top), `${x.titulo} en la misma fila`);
                        assert.ok(cerca(x.alto, a.alto), `${x.titulo}: mismo alto (${x.alto} vs ${a.alto})`);
                    }
                    const lefts = m.tarjetas.map((x) => x.left);
                    assert.deepEqual([...lefts].sort((x, y) => x - y), lefts, "de izquierda a derecha");
                }
                const colores = new Set(m.tarjetas.map((x) => x.color));
                assert.equal(colores.size, 4, "cada botón con su color propio");
                assert.ok(m.tarjetas.every((x) => x.textoBoton === m.tarjetas[0].textoBoton), "el texto de los botones igual en las cuatro");
                await p.close();
            });
        }
    });
});

test("la ventana: sale sola, «Ver completo» la agranda y marca, y no vuelve", { skip: !hayNavegador || ROTO }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrir(nav, puerto, 1280, 800, "window.aviso(true)");
        await p.waitForSelector("[data-aviso-de-actualizacion]", { timeout: 5000 });
        const texto = await p.textContent("[data-aviso-de-actualizacion]");
        assert.ok(texto.includes("Ya puedes exportar a PDF"), "enseña el texto publicado");
        assert.ok(await p.$("[data-documento-de-actualizacion]"), "y el documento con su enlace");
        const anchoAntes = (await p.$eval("[data-aviso-de-actualizacion]", (e) => e.getBoundingClientRect().width));
        assert.deepEqual(await p.evaluate("window.__marcas"), [], "abrirla no la marca");

        await p.click("[data-boton-ver-actualizacion]");
        await p.waitForTimeout(250);
        const anchoDespues = await p.$eval("[data-aviso-de-actualizacion]", (e) => e.getBoundingClientRect().width);
        assert.ok(anchoDespues > anchoAntes, "«Ver completo» la agranda");
        assert.equal(await p.$("[data-boton-ver-actualizacion]"), null, "y ya no ofrece «Ver completo»");
        assert.deepEqual(await p.evaluate("window.__marcas.map(m => m.como)"), ["vista"]);

        await p.click("[data-boton-cerrar-actualizacion]");
        await p.waitForTimeout(300);
        assert.equal(await p.$("[data-aviso-de-actualizacion]"), null, "cerrar la quita");
        assert.equal((await p.evaluate("window.__marcas.length")), 1, "y no la marca dos veces");

        // Volver a abrir la plataforma: ya no hay nada pendiente.
        await p.evaluate("window.aviso(false)");
        await p.waitForTimeout(2000);
        assert.equal(await p.$("[data-aviso-de-actualizacion]"), null, "una vez vista, no vuelve");

        // Otra nueva, y esta se cierra con Escape: cuenta como cerrada.
        await p.evaluate("window.aviso(true)");
        await p.waitForSelector("[data-aviso-de-actualizacion]", { timeout: 5000 });
        await p.keyboard.press("Escape");
        await p.waitForTimeout(300);
        assert.equal(await p.$("[data-aviso-de-actualizacion]"), null);
        assert.deepEqual(await p.evaluate("window.__marcas.map(m => m.como)"), ["vista", "cerrada"]);

        // Y en un teléfono no se sale de la pantalla.
        const m = await abrir(nav, puerto, 390, 844, "window.aviso(true)");
        await m.waitForSelector("[data-aviso-de-actualizacion]", { timeout: 5000 });
        const caja = await m.$eval("[data-aviso-de-actualizacion]", (e) => {
            const r = e.getBoundingClientRect();
            return { left: r.left, right: r.right, vw: window.innerWidth };
        });
        assert.ok(caja.left >= 0 && caja.right <= caja.vw, "la ventana cabe en un móvil");
    });
});
