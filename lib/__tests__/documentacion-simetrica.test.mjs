/**
 * DOCUMENTACIÓN SIMÉTRICA: la flecha de regreso, el orden propio arrastrando,
 * la barra de Guías y Tutoriales, la rejilla compacta, Meta ordenada y ninguna
 * pestaña de otros módulos encima.
 *
 * # Tres mitades
 *
 * 1. **Las reglas**, puras: qué lista existe, qué se lee de lo guardado, qué
 *    ids entran, qué rutas no llevan pestañas y cómo se busca sin tildes.
 * 2. **Las acciones contra Postgres**: el orden es de la PERSONA —el de una no
 *    mueve el de otra—, un id inventado no entra, las guías publicadas son de
 *    la casa, y la acción genérica de columnas no escribe estas listas.
 * 3. **Las pantallas reales en Chromium**, sobre el CSS del build: la flecha en
 *    el MISMO píxel en las cuatro pantallas internas, «Nuevo» a la derecha y el
 *    buscador a la izquierda, las tarjetas de tutoriales del mismo alto y en
 *    filas parejas, arrastrar que reordena y guarda la lista entera, y Meta sin
 *    desbordar, a 1440/1280/1024/390.
 *
 * `MODO=roto` lee las pantallas de `ANTES_REF` —pinchado a un commit, nunca
 * `origin/main`— y AFIRMA los fallos.
 *
 * Se levanta con `scripts/banco-documentacion-simetrica.sh`.
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
const COMPILADO = join(AQUI, ".compilado", "documentacion-simetrica");
const HARNESS = join(COMPILADO, "harness.js");
const ANTES_REF = process.env.ANTES_REF ?? "e3f2e7a";

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deAntes = (f) => {
    try {
        return execFileSync("git", ["show", `${ANTES_REF}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};
const leer = (f) => (ROTO ? deAntes(f) ?? "" : crudo(f));
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

const P = "app/(root)/documentation";
const PANTALLAS_INTERNAS = {
    guias: `${P}/guide/_components/MainGuide.tsx`,
    tutoriales: `${P}/tutorial/_components/MainTutorial.tsx`,
    actualizaciones: `${P}/actualizaciones/_components/MainActualizaciones.tsx`,
    meta: `${P}/meta/_components/MetaCredentialsGuide.tsx`,
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Las reglas, puras
// ─────────────────────────────────────────────────────────────────────────────

const reglas = ROTO
    ? null
    : {
          ...(await import(join(COMPILADO, "orden-propio.js"))),
          ...(await import(join(COMPILADO, "pantallas-sin-pestanas.js"))),
          ...(await import(join(COMPILADO, "buscar-en-documentacion.js"))),
          ...(await import(join(COMPILADO, "orden-de-las-tarjetas.js"))),
      };

test("las tres listas que se ordenan, y nada más", { skip: ROTO }, () => {
    assert.deepEqual([...reglas.TIPOS_DE_ORDEN_PROPIO], ["doc-portada", "guias-publicadas", "tutoriales"]);
    assert.equal(reglas.comoTipoDeOrdenPropio(" tutoriales "), "tutoriales");
    assert.equal(reglas.comoTipoDeOrdenPropio("proyecto"), null, "un tipo de otro tablero no pasa");
    assert.equal(reglas.comoTipoDeOrdenPropio(null), null);
    assert.deepEqual([...reglas.TARJETAS_DE_LA_PORTADA], ["actualizaciones", "tutoriales", "guias", "meta"]);
});

test("lo guardado se lee con cuidado: lo que no es un orden no ordena", { skip: ROTO }, () => {
    assert.deepEqual(reglas.comoOrdenGuardado({ a: 0, b: 2 }), { a: 0, b: 2 });
    assert.deepEqual(reglas.comoOrdenGuardado([]), {}, "el arreglo que devuelve una acción muda no es un orden");
    assert.deepEqual(reglas.comoOrdenGuardado(null), {});
    assert.deepEqual(reglas.comoOrdenGuardado({ a: "1", b: NaN, c: 3 }), { c: 3 });
});

test("solo entran ids de ESA lista, sin repetidos", { skip: ROTO }, () => {
    const lista = ["a", "b", "c"];
    assert.deepEqual(reglas.losIdsQueValen(["c", "a", "a", "x", 7, " b "], lista), ["c", "a", "b"]);
    assert.deepEqual(reglas.losIdsQueValen("a,b", lista), [], "una cadena no es una lista");
    const muchos = Array.from({ length: 900 }, (_, i) => `i${i}`);
    assert.equal(reglas.losIdsQueValen(muchos, muchos).length, reglas.TOPE_DEL_ORDEN_PROPIO);
});

test("arrastrar con una búsqueda puesta NO mueve lo escondido de su sitio", { skip: ROTO }, () => {
    // La lista completa es a,b,c,d; se ven b y d. Soltar d sobre b.
    const nuevos = reglas.moverEnLaListaCompleta(["a", "b", "c", "d"], "d", "b");
    assert.deepEqual(nuevos, ["a", "d", "b", "c"]);
    assert.equal(nuevos.length, 4, "la lista sigue entera");
});

test("Documentación no lleva las pestañas de otros módulos, y se compara por segmento", { skip: ROTO }, () => {
    for (const r of ["/documentation", "/documentation/guide", "/documentation/tutorial", "/documentation/actualizaciones", "/documentation/meta"]) {
        assert.equal(reglas.escondeLasPestanas(r), true, r);
    }
    for (const r of ["/documentationes", "/panel", "/chats", "", null, "/documentacion"]) {
        assert.equal(reglas.escondeLasPestanas(r), false, String(r));
    }
});

test("el buscador encuentra sin tildes ni mayúsculas, en cualquier campo", { skip: ROTO }, () => {
    assert.equal(reglas.coincideConLaBusqueda("conexion", "Conexión API"), true);
    assert.equal(reglas.coincideConLaBusqueda("LEADS", "Cómo usar", "/sessions leads"), true);
    assert.equal(reglas.coincideConLaBusqueda("", "x"), true, "sin búsqueda sale todo");
    assert.equal(reglas.coincideConLaBusqueda("zzz", "Guía", null, undefined), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1b. El barrido del código (y en MODO=roto, el «antes» que afirma el fallo)
// ─────────────────────────────────────────────────────────────────────────────

test(ROTO ? "ANTES: ninguna pantalla interna tenía flecha de regreso" : "las cuatro pantallas internas llevan la flecha de regreso", () => {
    for (const [nombre, f] of Object.entries(PANTALLAS_INTERNAS)) {
        const t = sinComentarios(leer(f));
        assert.ok(t.length > 0, `no se pudo leer ${f}`);
        const tiene = t.includes("<CabeceraDeDocumentacion");
        assert.equal(tiene, !ROTO, `${nombre}: ${ROTO ? "el antes ya tenía flecha" : "falta la cabecera con la flecha"}`);
    }
    if (!ROTO) {
        const cab = crudo("components/documentacion/CabeceraDeDocumentacion.tsx");
        assert.match(cab, /RUTA_DE_DOCUMENTACION\s*=\s*['"]\/documentation['"]/);
        assert.match(cab, /aria-label="Volver a Documentación"/);
    }
});

test(ROTO ? "ANTES: en Tutoriales y Guías «Crear» iba fuera de la barra de siempre" : "Guías y Tutoriales: el buscador a la izquierda y «Nuevo» a la derecha", () => {
    for (const f of [PANTALLAS_INTERNAS.guias, PANTALLAS_INTERNAS.tutoriales]) {
        const t = sinComentarios(leer(f));
        if (ROTO) {
            assert.ok(!t.includes("<BarraDeAcciones"), `${f}: el antes ya usaba la barra`);
            continue;
        }
        assert.match(t, /<BarraDeAcciones[\s\S]*buscador=\{/, `${f}: buscador en su hueco`);
        assert.match(t, /crear=\{[\s\S]*<BotonDeCrear/, `${f}: «Nuevo» en el hueco de crear`);
        assert.ok(!/DialogTrigger/.test(t), `${f}: el botón no puede colgar de un DialogTrigger (BotonDeCrear no reenvía la ref)`);
    }
});

test(ROTO ? "ANTES: ninguna de las tres listas se podía arrastrar" : "las tres listas se reordenan arrastrando, con el orden propio", () => {
    const listas = [`${P}/_components/MainDocumentation.tsx`, PANTALLAS_INTERNAS.guias, PANTALLAS_INTERNAS.tutoriales];
    const tipos = ["doc-portada", "guias-publicadas", "tutoriales"];
    listas.forEach((f, i) => {
        const t = sinComentarios(leer(f));
        const arrastra = t.includes("<RejillaOrdenable") && t.includes(`useOrdenPropio('${tipos[i]}'`);
        assert.equal(arrastra, !ROTO, `${f}`);
    });
});

test(ROTO ? "ANTES: la barra de pestañas del panel salía encima de Documentación" : "la barra de pestañas del panel se esconde en Documentación", () => {
    const t = sinComentarios(leer("components/custom/PanelAwareTabNav.tsx"));
    const esconde = /if \(escondeLasPestanas\(pathname\)\) return null;/.test(t);
    assert.equal(esconde, !ROTO);
    if (!ROTO) {
        // Va después de TODOS los hooks: un `return` antes de un hook rompe React.
        const despues = t.slice(t.indexOf("if (escondeLasPestanas(pathname))"));
        assert.ok(!/\buse[A-Z]\w*\(/.test(despues.split("return null;")[1]?.split("\n").slice(0, 3).join("\n") ?? ""));
    }
});

test("la acción genérica de columnas NO escribe estas listas (van por la suya)", { skip: ROTO }, () => {
    const t = crudo("actions/orden-de-tablero-actions.ts");
    for (const tipo of ["doc-portada", "guias-publicadas", "tutoriales"]) assert.ok(t.includes(`"${tipo}"`), tipo);
    const accion = crudo("actions/orden-propio-actions.ts");
    assert.ok(!/userId|personaId/.test(accion.split("export async function")[1] ?? ""), "ninguna acción recibe un id de persona");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Las acciones, contra Postgres
// ─────────────────────────────────────────────────────────────────────────────

const hayBase = Boolean(process.env.DATABASE_URL) && !ROTO;
const acc = hayBase ? await import(join(COMPILADO, "entrada-de-orden-propio.js")) : null;
const sello = Date.now().toString(36);
const idDe = (q) => `docsim-${sello}-${q}`;

async function persona(quien, role = "user") {
    const id = idDe(quien);
    await acc.db.user.upsert({ where: { id }, update: { role }, create: { id, email: `${id}@banco.test`, name: quien, role } });
    return { id, role, name: quien, ownerId: null, rolDeLaPersona: role };
}

test("el orden es de la PERSONA: el de una no mueve el de otra", { skip: !hayBase }, async () => {
    const ana = await persona("ana");
    const beto = await persona("beto");
    acc.ponerAQuienMira(ana);
    assert.equal((await acc.guardarMiOrdenAction("doc-portada", ["meta", "guias", "actualizaciones", "tutoriales"])).success, true);
    const deAna = await acc.leerMiOrdenAction("doc-portada");
    assert.deepEqual(deAna.data, { meta: 0, guias: 1, actualizaciones: 2, tutoriales: 3 });

    acc.ponerAQuienMira(beto);
    assert.deepEqual((await acc.leerMiOrdenAction("doc-portada")).data, {}, "Beto no hereda el orden de Ana");
    await acc.guardarMiOrdenAction("doc-portada", ["tutoriales", "meta"]);

    acc.ponerAQuienMira(ana);
    assert.deepEqual((await acc.leerMiOrdenAction("doc-portada")).data, { meta: 0, guias: 1, actualizaciones: 2, tutoriales: 3 }, "el de Ana no se movió");
});

test("un id que no es de esa lista no entra", { skip: !hayBase }, async () => {
    const carla = await persona("carla");
    const t1 = await acc.db.guideUrl.create({ data: { path: "/sessions", title: "Uno", url: "https://x.test/1" } });
    const t2 = await acc.db.guideUrl.create({ data: { path: "/chats", title: "Dos", url: "https://x.test/2" } });
    acc.ponerAQuienMira(carla);
    await acc.guardarMiOrdenAction("tutoriales", [t2.id, "inventado", t1.id, t2.id]);
    assert.deepEqual((await acc.leerMiOrdenAction("tutoriales")).data, { [t2.id]: 0, [t1.id]: 1 });
    await acc.guardarMiOrdenAction("doc-portada", ["plantillas-ia", "meta"]);
    assert.deepEqual((await acc.leerMiOrdenAction("doc-portada")).data, { meta: 0 });
});

test("las guías publicadas son de la CASA: un cliente no las ordena", { skip: !hayBase }, async () => {
    const cliente = await persona("cliente");
    acc.ponerAQuienMira(cliente);
    const r = await acc.guardarMiOrdenAction("guias-publicadas", ["catalogo", "leads"]);
    assert.equal(r.success, false);

    const admin = await persona("admin", "admin");
    acc.ponerAQuienMira(admin);
    assert.equal((await acc.guardarMiOrdenAction("guias-publicadas", ["catalogo", "leads", "no-existe"])).success, true);
    assert.deepEqual((await acc.leerMiOrdenAction("guias-publicadas")).data, { catalogo: 0, leads: 1 });
});

test("sin sesión y con un tipo inventado no se escribe nada", { skip: !hayBase }, async () => {
    acc.ponerAQuienMira(null);
    assert.equal((await acc.guardarMiOrdenAction("tutoriales", [])).success, false);
    const dora = await persona("dora");
    acc.ponerAQuienMira(dora);
    assert.equal((await acc.guardarMiOrdenAction("proyecto", ["a"])).success, false);
    const r = await acc.guardarElOrdenDeLaColumnaAction({ tipo: "doc-portada", tableroId: dora.id, ids: ["meta"] });
    assert.equal(r.success, false, "la acción de columnas no abre estas listas");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Las pantallas, en Chromium
// ─────────────────────────────────────────────────────────────────────────────

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;
const hayNavegador = Boolean(chromium && CSS && fs.existsSync(HARNESS)) && !ROTO;

const GUIAS = [
    { id: "g1", title: "Cómo crear un lead", path: "/sessions", url: "https://x.test/1", description: "Aprende a crear leads en la plataforma" },
    { id: "g2", title: "Un tutorial con un título muy largo que ocupa dos líneas enteras y más", path: "/chats", url: "https://x.test/2", description: null },
    { id: "g3", title: "Etiquetas", path: "/tags", url: "https://x.test/3", description: "Aprende a etiquetar tus chats y ordenar tu bandeja con criterio en la plataforma" },
    { id: "g4", title: "Agenda", path: "/schedule", url: "https://x.test/4", description: "Aprende a agendar citas" },
    { id: "g5", title: "Reuniones", path: "/reuniones", url: "https://x.test/5", description: "Corta" },
    { id: "g6", title: "Correo", path: "/correo", url: "https://x.test/6", description: "Aprende a leer y responder tu correo en la plataforma" },
    { id: "g7", title: "Notas", path: "/notas", url: "https://x.test/7", description: null },
];

async function conLaPantalla(hacer) {
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style></head>
<body class="app-module-content"><div id="app" style="height:100vh"></div>
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

async function abrir(navegador, puerto, ancho, que, datos = {}) {
    const pagina = await navegador.newPage({ viewport: { width: ancho, height: 900 } });
    const errores = [];
    pagina.on("pageerror", (e) => errores.push(String(e)));
    await pagina.goto(`http://127.0.0.1:${puerto}/`);
    await pagina.waitForFunction("window.listo === true", null, { timeout: 20000 });
    await pagina.evaluate(({ que, datos }) => {
        Object.assign(window, datos);
        window.pantalla(que);
    }, { que, datos });
    await pagina.waitForTimeout(500);
    assert.deepEqual(errores, [], `${que} no llegó a pintarse a ${ancho}`);
    return pagina;
}

const ANCHOS = [1440, 1280, 1024, 390];

test("la flecha de regreso cae en el MISMO píxel en las cuatro pantallas internas", { skip: !hayNavegador }, async () => {
    await conLaPantalla(async (navegador, puerto) => {
        for (const ancho of ANCHOS) {
            const sitios = {};
            for (const que of ["guias", "tutoriales", "actualizaciones", "meta"]) {
                const p = await abrir(navegador, puerto, ancho, que, { __guias: GUIAS, __manuales: [] });
                sitios[que] = await p.evaluate(() => {
                    const a = document.querySelector("[data-volver-a-documentacion]");
                    const t = document.querySelector("[data-titulo-de-documentacion]");
                    if (!a || !t) return null;
                    const r = a.getBoundingClientRect();
                    const rt = t.getBoundingClientRect();
                    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), href: a.getAttribute("href"), tituloX: Math.round(rt.left), desborda: document.documentElement.scrollWidth > window.innerWidth };
                });
                await p.close();
                assert.ok(sitios[que], `${que} a ${ancho}: sin flecha`);
                assert.equal(sitios[que].href, "/documentation");
                assert.equal(sitios[que].desborda, false, `${que} a ${ancho} desborda a lo ancho`);
            }
            const [ref, ...resto] = Object.values(sitios);
            for (const s of resto) {
                assert.deepEqual({ x: s.x, y: s.y, w: s.w, h: s.h, t: s.tituloX }, { x: ref.x, y: ref.y, w: ref.w, h: ref.h, t: ref.tituloX }, `a ${ancho} la flecha no cae en el mismo sitio: ${JSON.stringify(sitios)}`);
            }
        }
    });
});

test("Guías y Tutoriales: buscador a la izquierda, «Nuevo» pegado a la derecha, sin pestañas", { skip: !hayNavegador }, async () => {
    await conLaPantalla(async (navegador, puerto) => {
        for (const ancho of ANCHOS) {
            for (const [que, sel] of [["guias", "[data-crear-guia]"], ["tutoriales", "[data-crear-tutorial]"]]) {
                const p = await abrir(navegador, puerto, ancho, que, { __guias: GUIAS, __manuales: [] });
                const m = await p.evaluate((sel) => {
                    const barra = document.querySelector("[data-barra-de-acciones]").getBoundingClientRect();
                    const b = document.querySelector('[data-zona="buscador"] input').getBoundingClientRect();
                    const c = document.querySelector(sel).getBoundingClientRect();
                    return { barraL: barra.left, barraR: barra.right, bL: b.left, bR: b.right, cL: c.left, cR: c.right, tabs: document.querySelectorAll('[role="tablist"]').length };
                }, sel);
                await p.close();
                assert.ok(Math.abs(m.bL - m.barraL) <= 1, `${que} a ${ancho}: el buscador no arranca a la izquierda`);
                assert.ok(m.barraR - m.cR <= 1, `${que} a ${ancho}: «Nuevo» no acaba en el borde derecho (${m.barraR - m.cR}px)`);
                assert.ok(m.cL >= m.bR, `${que} a ${ancho}: «Nuevo» se monta sobre el buscador`);
                if (ancho >= 1024) assert.ok(m.cL - m.bR > 200, `${que} a ${ancho}: «Nuevo» sigue pegado al buscador`);
                assert.equal(m.tabs, 0, `${que}: hay pestañas dentro de la pantalla`);
            }
        }
    });
});

test("Tutoriales: tarjetas del MISMO alto, filas parejas y sin huecos", { skip: !hayNavegador }, async () => {
    await conLaPantalla(async (navegador, puerto) => {
        for (const ancho of ANCHOS) {
            const p = await abrir(navegador, puerto, ancho, "tutoriales", { __guias: GUIAS });
            const cajas = await p.evaluate(() =>
                [...document.querySelectorAll("[data-tarjeta-de-recurso]")].map((c) => {
                    const r = c.getBoundingClientRect();
                    const ver = c.querySelector("[data-botones-de-recurso]").getBoundingClientRect();
                    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), botones: Math.round(ver.top - r.top) };
                }),
            );
            await p.close();
            assert.equal(cajas.length, GUIAS.length, `a ${ancho}`);
            const altos = new Set(cajas.map((c) => c.h));
            assert.equal(altos.size, 1, `a ${ancho} las tarjetas miden distinto: ${[...altos]}`);
            assert.equal(new Set(cajas.map((c) => c.w)).size, 1, `a ${ancho} anchos distintos`);
            assert.equal(new Set(cajas.map((c) => c.botones)).size, 1, `a ${ancho} los botones no caen a la misma altura`);
            const filas = [...new Set(cajas.map((c) => c.y))].sort((a, b) => a - b);
            const pasos = filas.slice(1).map((y, i) => y - filas[i]);
            assert.ok(pasos.every((d) => d === pasos[0]), `a ${ancho} las filas no van parejas: ${pasos}`);
            if (pasos.length) assert.ok(pasos[0] - cajas[0].h <= 16, `a ${ancho} hay hueco entre filas: ${pasos[0] - cajas[0].h}px`);
        }
    });
});

async function arrastrar(p, desde, hasta) {
    const a = await desde.boundingBox();
    const b = await hasta.boundingBox();
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await p.mouse.down();
    await p.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 4 });
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await p.waitForTimeout(150);
    await p.mouse.up();
    await p.waitForTimeout(400);
}

test("arrastrar reordena y guarda la lista ENTERA: portada, tutoriales y guías publicadas", { skip: !hayNavegador }, async () => {
    await conLaPantalla(async (navegador, puerto) => {
        // Tutoriales: la primera sobre la tercera.
        let p = await abrir(navegador, puerto, 1280, "tutoriales", { __guias: GUIAS });
        let asas = p.locator("[data-asa-de-orden]");
        assert.equal(await asas.count(), GUIAS.length);
        await arrastrar(p, asas.nth(0), asas.nth(2));
        let titulos = await p.$$eval("[data-titulo-de-recurso]", (e) => e.map((x) => x.textContent.trim()));
        let guardado = await p.evaluate(() => window.__guardado);
        await p.close();
        assert.equal(titulos[2], GUIAS[0].title, `la tarjeta no quedó donde se soltó: ${titulos}`);
        assert.equal(guardado?.[0]?.tipo, "tutoriales");
        assert.deepEqual(guardado[0].ids, ["g2", "g3", "g1", "g4", "g5", "g6", "g7"]);

        // Lo guardado se respeta al volver a abrir. Lo que no tiene posición
        // (un tutorial recién creado) va PRIMERO, como en Proyectos.
        p = await abrir(navegador, puerto, 1280, "tutoriales", { __guias: GUIAS, __orden: Object.fromEntries(["g3", "g1", "g2", "g4", "g5", "g6"].map((id, i) => [id, i])) });
        titulos = await p.$$eval("[data-titulo-de-recurso]", (e) => e.map((x) => x.textContent.trim()));
        await p.close();
        assert.deepEqual(titulos.slice(0, 3), ["Notas", "Etiquetas", "Cómo crear un lead"]);

        // La portada.
        p = await abrir(navegador, puerto, 1280, "portada");
        asas = p.locator("[data-asa-de-orden]");
        assert.equal(await asas.count(), 4);
        await arrastrar(p, asas.nth(3), asas.nth(0));
        const portada = await p.$$eval("[data-tarjeta-de-documentacion]", (e) => e.map((x) => x.getAttribute("data-tarjeta-de-documentacion")));
        guardado = await p.evaluate(() => window.__guardado);
        await p.close();
        assert.equal(portada[0], "Conexión API de Meta");
        assert.deepEqual(guardado[0], { tipo: "doc-portada", ids: ["meta", "actualizaciones", "tutoriales", "guias"] });

        // Las guías publicadas.
        p = await abrir(navegador, puerto, 1280, "guias", { __manuales: [] });
        asas = p.locator("[data-seccion-guias-publicas] [data-asa-de-orden]");
        assert.equal(await asas.count(), 4);
        await arrastrar(p, asas.nth(0), asas.nth(3));
        guardado = await p.evaluate(() => window.__guardado);
        await p.close();
        assert.equal(guardado?.[0]?.tipo, "guias-publicadas");
        assert.equal(guardado[0].ids[3], "leads");
    });
});

test("Meta: ordenada en bloques, los dos caminos del mismo alto y nada desborda", { skip: !hayNavegador }, async () => {
    await conLaPantalla(async (navegador, puerto) => {
        for (const ancho of ANCHOS) {
            const p = await abrir(navegador, puerto, ancho, "meta");
            const m = await p.evaluate(() => {
                const caminos = [...document.querySelectorAll("[data-camino]")].map((c) => c.getBoundingClientRect());
                return {
                    caminos: caminos.map((r) => ({ y: Math.round(r.top), h: Math.round(r.height) })),
                    bloques: document.querySelectorAll("[data-pantalla-de-meta] h3").length,
                    desborda: document.documentElement.scrollWidth > window.innerWidth,
                };
            });
            await p.close();
            assert.equal(m.caminos.length, 2, `a ${ancho}`);
            if (ancho >= 1024) {
                assert.equal(m.caminos[0].y, m.caminos[1].y, `a ${ancho} los caminos no van en la misma fila`);
                assert.equal(m.caminos[0].h, m.caminos[1].h, `a ${ancho} los caminos miden distinto`);
            }
            assert.ok(m.bloques >= 4, `a ${ancho}: faltan los bloques con título`);
            assert.equal(m.desborda, false, `a ${ancho} desborda`);
        }
    });
});
