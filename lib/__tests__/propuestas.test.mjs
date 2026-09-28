/**
 * PROPUESTAS COMERCIALES: Panel › Propuestas y su página pública
 * `/propuesta/<token>`.
 *
 * # Tres mitades, porque el cambio vive en tres capas
 *
 * 1. **La regla** (pura): qué se acepta al guardar —cliente, fecha, moneda, al
 *    menos un servicio con nombre e importe—, cómo se lee un importe tecleado
 *    («1.500.000»), cuánto suma, y la forma del token.
 * 2. **Las acciones contra Postgres**: crear genera un token de 32 caracteres
 *    que no se repite; editar NO lo cambia; otra cuenta no ve, ni edita, ni
 *    borra la propuesta de la primera; un `agente` no crea; la página pública
 *    devuelve solo los campos elegidos, cuenta la visita, y un token inventado
 *    o de una propuesta borrada no abre nada.
 * 3. **La página pública en Chromium**, con el componente REAL sobre el CSS del
 *    build, a 320/360/390/768/1440: nada se sale a lo ancho (se abre desde el
 *    teléfono), los servicios, el total y el mantenimiento se ven, y un nombre
 *    larguísimo sin espacios no rompe la pantalla. Más el barrido: la ruta es
 *    pública en el middleware, lleva `noindex` en su metadata Y en la
 *    cabecera, y el panel ofrece copiar el enlace y editar.
 *
 * `MODO=roto` lee el código de `ANTES_REF` —pinchado a un commit, nunca
 * `origin/main`— y AFIRMA el fallo: no había sección de propuestas, ni ruta
 * pública, ni nada que copiar.
 *
 * Se levanta con `scripts/banco-propuestas.sh`.
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
const COMPILADO = join(AQUI, ".compilado", "propuestas");
const HARNESS = join(AQUI, ".compilado", "harness-propuestas.js");
const ANTES_REF = process.env.ANTES_REF ?? "69d9721";

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deAntes = (f) => {
    try {
        // `git show REF:ruta/[token]/…` contesta VACÍO y con éxito para una ruta
        // que no existe (los corchetes): se pregunta primero si existe.
        execFileSync("git", ["cat-file", "-e", `${ANTES_REF}:${f}`], { cwd: RAIZ, stdio: "ignore" });
        return execFileSync("git", ["show", `${ANTES_REF}:${f}`], {
            encoding: "utf8",
            cwd: RAIZ,
            stdio: ["ignore", "pipe", "ignore"],
        });
    } catch {
        return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// MODO=roto: el «antes» no tenía nada de esto
// ─────────────────────────────────────────────────────────────────────────────

if (ROTO) {
    test("ANTES: no existía la sección, ni la regla, ni las acciones", () => {
        assert.equal(deAntes("lib/propuestas.ts"), null);
        assert.equal(deAntes("actions/propuestas-actions.ts"), null);
        assert.equal(deAntes("app/(root)/(protected)/panel/propuestas/page.tsx"), null);
        assert.equal(deAntes("app/propuesta/[token]/page.tsx"), null);
    });
    test("ANTES: /propuesta/ no era pública (el cliente caía en el login)", () => {
        const mw = deAntes("middleware.ts");
        assert.ok(mw, "no se pudo leer el middleware de ANTES_REF");
        assert.equal(mw.includes('"/propuesta/"'), false);
    });
    test("ANTES: el panel no ofrecía /panel/propuestas", () => {
        const rutas = deAntes("lib/navigation-routes.ts");
        assert.ok(rutas);
        assert.equal(rutas.includes("/panel/propuestas"), false);
    });
    test("ANTES: nada decía que no se indexara", () => {
        const cfg = deAntes("next.config.js");
        assert.ok(cfg);
        assert.equal(cfg.includes("X-Robots-Tag"), false);
    });
} else {
    const reglas = await import(join(COMPILADO, "propuestas.js"));

    // ─────────────────────────────────────────────────────────────────────────
    // 1. La regla, pura
    // ─────────────────────────────────────────────────────────────────────────

    const BASE = {
        cliente: "  Clínica   Dental Sonrisa ",
        fecha: "2026-09-28",
        moneda: "cop",
        servicios: [
            { nombre: "Agente IA", alcance: "Configuración\r\ny entrenamiento", inversion: "1.500.000" },
            { nombre: "", alcance: "", inversion: "" }, // fila en blanco: no cuenta
            { nombre: "Landing", alcance: "", inversion: 800000 },
        ],
        mantenimientoMensual: "250.000",
        mantenimientoDescripcion: "Soporte y ajustes",
        condiciones: "50% anticipo",
    };

    test("se acepta una propuesta completa y se sanea", () => {
        const v = reglas.comoPropuesta(BASE);
        assert.equal(v.ok, true);
        assert.equal(v.datos.cliente, "Clínica Dental Sonrisa");
        assert.equal(v.datos.moneda, "COP");
        assert.equal(v.datos.servicios.length, 2, "la fila en blanco no es un servicio");
        assert.deepEqual(v.datos.servicios[0], { nombre: "Agente IA", alcance: "Configuración\ny entrenamiento", inversion: 1500000 });
        assert.equal(v.datos.mantenimientoMensual, 250000);
        assert.equal(reglas.elTotal(v.datos.servicios), 2300000);
    });

    test("lo que falta se rechaza con su motivo, no se guarda a medias", () => {
        assert.equal(reglas.comoPropuesta({ ...BASE, cliente: "  " }).ok, false);
        assert.equal(reglas.comoPropuesta({ ...BASE, fecha: "2026-02-30" }).ok, false);
        assert.equal(reglas.comoPropuesta({ ...BASE, moneda: "BTC" }).ok, false);
        assert.equal(reglas.comoPropuesta({ ...BASE, servicios: [] }).ok, false);
        assert.equal(reglas.comoPropuesta({ ...BASE, servicios: [{ nombre: "", alcance: "x", inversion: "1" }] }).ok, false);
        const sinImporte = reglas.comoPropuesta({ ...BASE, servicios: [{ nombre: "X", alcance: "", inversion: "mucho" }] });
        assert.equal(sinImporte.ok, false);
        assert.match(sinImporte.motivo, /«X»/);
        assert.equal(reglas.comoPropuesta({ ...BASE, mantenimientoMensual: "abc" }).ok, false);
        assert.equal(reglas.comoPropuesta(null).ok, false);
    });

    test("un importe tecleado se lee como lo teclea una persona, y nunca se inventa", () => {
        assert.equal(reglas.comoImporte("1.500.000"), 1500000);
        assert.equal(reglas.comoImporte("1,500,000"), 1500000);
        assert.equal(reglas.comoImporte("2.500,50"), 2500.5);
        assert.equal(reglas.comoImporte("2,500.50"), 2500.5);
        assert.equal(reglas.comoImporte("1.500"), 1500, "tres cifras detrás nunca son decimales");
        assert.equal(reglas.comoImporte("$ 300.000"), 300000);
        assert.equal(reglas.comoImporte(0), 0, "cero SÍ es un importe");
        assert.equal(reglas.comoImporte(""), null);
        assert.equal(reglas.comoImporte("-5"), null);
        assert.equal(reglas.comoImporte("1e9"), null);
        assert.equal(reglas.comoImporte(Number.NaN), null);
        assert.equal(reglas.comoImporte(reglas.TOPE_DE_IMPORTE * 10), null);
    });

    test("sin mantenimiento es null; cero es «incluido», no «sin»", () => {
        assert.equal(reglas.comoPropuesta({ ...BASE, mantenimientoMensual: "" }).datos.mantenimientoMensual, null);
        assert.equal(reglas.comoPropuesta({ ...BASE, mantenimientoMensual: null }).datos.mantenimientoMensual, null);
        assert.equal(reglas.comoPropuesta({ ...BASE, mantenimientoMensual: "0" }).datos.mantenimientoMensual, 0);
    });

    test("el tope de servicios se respeta", () => {
        const muchos = Array.from({ length: reglas.TOPE_DE_SERVICIOS + 1 }, (_, i) => ({ nombre: `S${i}`, alcance: "", inversion: 1 }));
        assert.equal(reglas.comoPropuesta({ ...BASE, servicios: muchos }).ok, false);
    });

    test("el token tiene la forma exacta y los enlaces se arman igual siempre", () => {
        assert.equal(reglas.esTokenValido("a".repeat(32)), true);
        assert.equal(reglas.esTokenValido("a".repeat(31)), false);
        assert.equal(reglas.esTokenValido("a".repeat(31) + "/"), false);
        assert.equal(reglas.esTokenValido(null), false);
        assert.equal(reglas.elEnlacePublico("https://x.com/", "T"), "https://x.com/propuesta/T");
        const wa = reglas.elEnlaceDeWhatsapp(reglas.elMensajeDeWhatsapp("Ana", "https://x.com/propuesta/T"));
        assert.ok(wa.startsWith("https://wa.me/?text="));
        assert.ok(decodeURIComponent(wa).includes("https://x.com/propuesta/T"));
    });

    test("el importe se lee con su moneda", () => {
        assert.match(reglas.comoSeLeeElImporte(1500000, "COP"), /1\.500\.000.*COP/);
        assert.match(reglas.comoSeLeeElImporte(2500.5, "USD"), /2\.500,50.*USD/);
        assert.equal(reglas.comoSeLeeLaFecha("2026-09-28"), "28 de septiembre de 2026");
        assert.equal(reglas.lasIniciales("Grupo Verzay SAS"), "GV");
        assert.equal(reglas.lasIniciales(""), "·");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Barrido: la ruta es pública, no se indexa, y el panel copia y edita
    // ─────────────────────────────────────────────────────────────────────────

    test("la página pública está abierta en el middleware", () => {
        assert.ok(crudo("middleware.ts").includes('currentPath.startsWith("/propuesta/")'));
    });

    test("no se indexa: robots en la metadata y X-Robots-Tag en la cabecera", () => {
        const pagina = crudo("app/propuesta/[token]/page.tsx");
        assert.match(pagina, /robots:\s*{\s*index:\s*false,\s*follow:\s*false/);
        const cfg = crudo("next.config.js");
        assert.match(cfg, /source:\s*"\/propuesta\/:path\*"/);
        assert.match(cfg, /X-Robots-Tag",\s*value:\s*"noindex/);
        assert.match(cfg, /Referrer-Policy",\s*value:\s*"no-referrer"/);
    });

    test("la página pública no lee por una acción de servidor ni publica ids", () => {
        const pagina = crudo("app/propuesta/[token]/page.tsx");
        assert.equal(/from "@\/actions\//.test(pagina), false, "sin sesión no hay acción que la guarde");
        const db = crudo("lib/propuestas-db.ts");
        const publica = db.slice(db.indexOf("export async function laPropuestaPublica"));
        const ret = publica.slice(publica.indexOf("return {"), publica.indexOf("};", publica.indexOf("return {")));
        for (const oculto of ["id:", "cuentaId", "vecesAbierta", "creadoPorId"]) {
            assert.equal(ret.includes(oculto), false, `la página pública no lleva ${oculto}`);
        }
    });

    test("el panel está en el desplegable de módulos y ofrece copiar, WhatsApp y editar", () => {
        assert.ok(crudo("lib/navigation-routes.ts").includes('{ route: "/panel/propuestas" }'));
        const cliente = crudo("app/(root)/(protected)/panel/propuestas/_components/PropuestasClient.tsx");
        assert.ok(cliente.includes("data-copiar-enlace"));
        assert.ok(cliente.includes("copiarAlPortapapeles"));
        assert.ok(cliente.includes("elEnlaceDeWhatsapp"));
        assert.ok(cliente.includes("editarPropuestaAction"));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Las acciones contra Postgres
    // ─────────────────────────────────────────────────────────────────────────

    const hayBase = Boolean(process.env.DATABASE_URL);
    let m = null;
    if (hayBase) m = await import(join(COMPILADO, "entrada-de-propuestas.js"));

    const sello = Date.now().toString(36);
    const A = `prop-a-${sello}`;
    const B = `prop-b-${sello}`;
    const AGENTE = `prop-ag-${sello}`;
    const DUENO_A = { id: A, sessionUserId: A, role: "user", ownerId: null, name: "Cuenta A" };
    const DUENO_B = { id: B, sessionUserId: B, role: "user", ownerId: null, name: "Cuenta B" };
    const AGENTE_A = { id: AGENTE, sessionUserId: AGENTE, role: "user", ownerId: A, advisorRole: "agente", name: "Ag" };

    const conBase = hayBase ? test : test.skip;

    let creada = null;

    conBase("siembra de las cuentas", async () => {
        for (const [id, extra] of [[A, { brandName: "Verzay Pruebas", image: "https://otro.com/logo.png" }], [B, {}], [AGENTE, { ownerId: A, advisorRole: "agente" }]]) {
            await m.db.user.create({ data: { id, email: `${id}@banco.test`, name: id, ...extra } });
        }
    });

    conBase("el dueño crea: token de 32 caracteres, sin nada que se adivine", async () => {
        m.ponerAQuienMira(DUENO_A);
        const r = await m.crearPropuestaAction(BASE);
        assert.equal(r.success, true, r.message);
        creada = r.data;
        assert.equal(reglas.esTokenValido(creada.token), true);
        assert.notEqual(creada.token, creada.id);
        assert.equal(creada.servicios.length, 2);
        assert.equal(creada.fecha, "2026-09-28");
        const otra = await m.crearPropuestaAction({ ...BASE, cliente: "Otro" });
        assert.equal(otra.success, true);
        assert.notEqual(otra.data.token, creada.token);
        const l = await m.listarPropuestasAction();
        assert.equal(l.success, true);
        assert.deepEqual(l.data.propuestas.map((p) => p.cliente), ["Otro", "Clínica Dental Sonrisa"]);
    });

    conBase("editar cambia el contenido y CONSERVA el token", async () => {
        m.ponerAQuienMira(DUENO_A);
        const r = await m.editarPropuestaAction(creada.id, { ...BASE, cliente: "Clínica Editada", moneda: "USD", mantenimientoMensual: "" });
        assert.equal(r.success, true, r.message);
        assert.equal(r.data.token, creada.token);
        assert.equal(r.data.cliente, "Clínica Editada");
        assert.equal(r.data.moneda, "USD");
        assert.equal(r.data.mantenimientoMensual, null);
        const pub = await m.laPropuestaPublica(creada.token);
        assert.equal(pub.cliente, "Clínica Editada", "el enlace ya mandado enseña la versión nueva");
    });

    conBase("otra cuenta no ve, ni edita, ni borra la propuesta de la primera", async () => {
        m.ponerAQuienMira(DUENO_B);
        const l = await m.listarPropuestasAction();
        assert.equal(l.success, true);
        assert.equal(l.data.propuestas.length, 0);
        const e = await m.editarPropuestaAction(creada.id, { ...BASE, cliente: "Robada" });
        assert.equal(e.success, false);
        const d = await m.borrarPropuestaAction(creada.id);
        assert.equal(d.success, false);
        m.ponerAQuienMira(DUENO_A);
        const sigue = await m.listarPropuestasAction();
        assert.ok(sigue.data.propuestas.some((p) => p.id === creada.id && p.cliente === "Clínica Editada"));
    });

    conBase("un agente no crea ni edita, y sin sesión nada", async () => {
        m.ponerAQuienMira(AGENTE_A);
        assert.equal((await m.crearPropuestaAction(BASE)).success, false);
        assert.equal((await m.editarPropuestaAction(creada.id, BASE)).success, false);
        m.ponerAQuienMira(null);
        assert.equal((await m.listarPropuestasAction()).success, false);
    });

    conBase("lo que no pasa la regla no llega a la base", async () => {
        m.ponerAQuienMira(DUENO_A);
        const r = await m.crearPropuestaAction({ ...BASE, servicios: [] });
        assert.equal(r.success, false);
        assert.match(r.message, /al menos un servicio/);
    });

    conBase("la página pública: solo lo elegido, cuenta la visita, y el logo ajeno no sale", async () => {
        const pub = await m.laPropuestaPublica(creada.token);
        assert.ok(pub);
        assert.deepEqual(Object.keys(pub).sort(), [
            "actualizadaEn", "cliente", "condiciones", "fecha", "mantenimientoDescripcion",
            "mantenimientoMensual", "moneda", "negocio", "servicios", "token",
        ]);
        assert.equal(pub.negocio.nombre, "Verzay Pruebas");
        assert.equal(pub.negocio.logo, null, "un logo de otro dominio no se le pide al navegador del cliente");
        m.ponerAQuienMira(DUENO_A);
        const l = await m.listarPropuestasAction();
        const fila = l.data.propuestas.find((p) => p.id === creada.id);
        assert.ok(fila.vecesAbierta >= 2);
        assert.ok(fila.ultimaVezAbierta);
    });

    conBase("un token inventado o mal formado no abre nada", async () => {
        assert.equal(await m.laPropuestaPublica("x".repeat(32)), null);
        assert.equal(await m.laPropuestaPublica("'; DROP TABLE x; --"), null);
        assert.equal(await m.laPropuestaPublica(creada.id), null, "el id de la fila no es la puerta");
    });

    conBase("borrar la quita y su enlace deja de abrir", async () => {
        m.ponerAQuienMira(DUENO_A);
        const r = await m.borrarPropuestaAction(creada.id);
        assert.equal(r.success, true);
        assert.equal(await m.laPropuestaPublica(creada.token), null);
    });

    conBase("el logo solo se enseña si es nuestro o va dentro", () => {
        assert.equal(m.elLogoQueSeEnsena("https://s3.test/b/logo.png", "https://s3.test"), "https://s3.test/b/logo.png");
        assert.equal(m.elLogoQueSeEnsena("https://otro.com/logo.png", "https://s3.test"), null);
        assert.equal(m.elLogoQueSeEnsena("javascript:alert(1)", "https://s3.test"), null);
        assert.ok(m.elLogoQueSeEnsena("data:image/png;base64,AAAA", undefined));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. La página pública en Chromium, mobile-first
    // ─────────────────────────────────────────────────────────────────────────

    const cssDir = join(RAIZ, ".next", "static", "css");
    const hayNavegador = chromium && fs.existsSync(HARNESS) && fs.existsSync(cssDir);
    const conNavegador = hayNavegador ? test : test.skip;

    conNavegador("la propuesta pública cabe en el teléfono y se lee entera", async () => {
        const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
        const js = fs.readFileSync(HARNESS, "utf8");
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body class="overflow-hidden"><div id="app"></div><script>${js}</script></body></html>`;
        const srv = http.createServer((_q, r) => { r.setHeader("content-type", "text/html"); r.end(html); });
        await new Promise((ok) => srv.listen(0, ok));
        const url = `http://127.0.0.1:${srv.address().port}/`;
        const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
        try {
            for (const [w, h] of [[320, 568], [360, 740], [390, 844], [768, 1024], [1440, 900]]) {
                const pag = await nav.newPage({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 768 });
                await pag.goto(url);
                await pag.waitForFunction(() => window.listo === true);
                const r = await pag.evaluate(() => {
                    const main = document.querySelector("main");
                    const art = document.querySelector("[data-propuesta]");
                    const fuera = [...art.querySelectorAll("*")].filter((el) => {
                        const b = el.getBoundingClientRect();
                        return b.width > 0 && (b.right > window.innerWidth + 0.5 || b.left < -0.5);
                    }).length;
                    return {
                        anchoDoc: document.documentElement.scrollWidth,
                        anchoMain: main.scrollWidth,
                        vw: window.innerWidth,
                        fuera,
                        servicios: document.querySelectorAll("[data-servicio]").length,
                        total: document.querySelector("[data-total]")?.textContent ?? "",
                        mant: Boolean(document.querySelector("[data-mantenimiento]")),
                        cond: Boolean(document.querySelector("[data-condiciones]")),
                        seDesplaza: main.scrollHeight > main.clientHeight ? getComputedStyle(main).overflowY : "cabe",
                        letraCliente: parseFloat(getComputedStyle(document.querySelector("[data-cliente]")).fontSize),
                    };
                });
                assert.ok(r.anchoDoc <= r.vw, `${w}: el documento desborda a lo ancho (${r.anchoDoc} > ${r.vw})`);
                assert.ok(r.anchoMain <= r.vw, `${w}: la página se desplaza a lo ancho (${r.anchoMain})`);
                assert.equal(r.fuera, 0, `${w}: hay ${r.fuera} elementos fuera de la pantalla`);
                assert.equal(r.servicios, 3, `${w}: los tres servicios`);
                assert.match(r.total, /3\.400\.000/, `${w}: el total`);
                assert.equal(r.mant, true);
                assert.equal(r.cond, true);
                assert.ok(["auto", "scroll", "cabe"].includes(r.seDesplaza), `${w}: la página no se desplaza (${r.seDesplaza})`);
                assert.ok(r.letraCliente >= 20, `${w}: el cliente se lee grande (${r.letraCliente})`);
                // Y la rueda llega al final: el body lleva overflow-hidden.
                await pag.mouse.move(w / 2, h / 2);
                await pag.mouse.wheel(0, 20000);
                await pag.waitForTimeout(150);
                const alFinal = await pag.evaluate(() => {
                    const main = document.querySelector("main");
                    const pie = document.querySelector("[data-propuesta] footer").getBoundingClientRect();
                    return pie.bottom <= main.getBoundingClientRect().bottom + 1;
                });
                assert.ok(alFinal, `${w}: con la rueda no se llega al pie`);
                await pag.close();
            }
        } finally {
            await nav.close();
            srv.close();
        }
    });
}
