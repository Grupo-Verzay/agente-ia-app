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
 * `MODO=roto` lee el código de `ANTES_REF` (73f991f, la primera versión ya
 * desplegada) —pinchado a un commit, nunca `origin/main`— y AFIRMA los fallos
 * de la segunda vuelta: la cabecera en `slate-900` con el nombre de la cuenta
 * junto al logo y sin eslogan, «Servicios» fijo, sin campos de contacto, línea,
 * vigencia, nota ni pago, y el botón de WhatsApp como un enlace a `wa.me` que
 * no envía nada ni usa la línea de la cuenta.
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
const ANTES_REF = process.env.ANTES_REF ?? "73f991f";

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
    const pub = () => {
        const f = deAntes("components/propuestas/PropuestaPublica.tsx");
        assert.ok(f, "no se pudo leer la página pública de ANTES_REF");
        return f;
    };
    test("ANTES: la cabecera era slate-900, casi negra", () => {
        assert.match(pub(), /rounded-2xl bg-slate-900 p-5 text-white/);
    });
    test("ANTES: el nombre de la cuenta iba junto al logo, y no había eslogan", () => {
        assert.ok(pub().includes("{negocio.nombre || \"Propuesta comercial\"}"));
        assert.equal(pub().includes("eslogan"), false);
    });
    test("ANTES: el título «Servicios» era fijo", () => {
        assert.equal(pub().includes("Productos"), false);
        const reglas = deAntes("lib/propuestas.ts");
        assert.equal(reglas.includes("tipoDeItems"), false);
    });
    test("ANTES: no había empresa, WhatsApp, línea, correo, vigencia, nota ni pago", () => {
        const reglas = deAntes("lib/propuestas.ts");
        for (const campo of ["empresa", "whatsapp:", "linea:", "correo", "vigencia", "notaVisibilidad", "metodoPago", "medioPago"]) {
            assert.equal(reglas.includes(campo), false, `ya había ${campo}`);
        }
    });
    test("ANTES: el botón de WhatsApp abría wa.me y no enviaba nada", () => {
        const cli = deAntes("app/(root)/(protected)/panel/propuestas/_components/PropuestasClient.tsx");
        assert.match(cli, /<a\s+href=\{elEnlaceDeWhatsapp/);
        assert.equal(cli.includes("enviarPropuestaPorWhatsappAction"), false);
        const acc = deAntes("actions/propuestas-actions.ts");
        assert.equal(acc.includes("sendViaWhatsAppDispatcher"), false);
    });

    // El «antes» del enlace personalizado: pinchado al commit anterior, nunca
    // `origin/main`, que pasa a ser el «después» en cuanto esto se fusiona.
    const ANTES_DEL_SLUG = process.env.ANTES_DEL_SLUG ?? "f8057cb";
    const delAntesDelSlug = (f) =>
        execFileSync("git", ["show", `${ANTES_DEL_SLUG}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] });

    test("ANTES DEL SLUG: el enlace era siempre el token y no se podía editar", () => {
        const reglas = delAntesDelSlug("lib/propuestas.ts");
        assert.equal(reglas.includes("comoSlug"), false, "no había enlace personalizado");
        const db = delAntesDelSlug("lib/propuestas-db.ts");
        assert.equal(/"slug"/.test(db), false, "la tabla no tenía columna slug");
        assert.match(db, /WHERE "token" = \$1/, "la página pública solo buscaba por el token");
        const form = delAntesDelSlug("app/(root)/(protected)/panel/propuestas/_components/FormularioDePropuesta.tsx");
        assert.equal(form.includes("propuesta-slug"), false, "el formulario no ofrecía el campo");
        const cli = delAntesDelSlug("app/(root)/(protected)/panel/propuestas/_components/PropuestasClient.tsx");
        assert.match(cli, /elEnlacePublico\(base, p\.token\)/, "se copiaba siempre el del token");
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

    test("los campos nuevos se sanean y son todos opcionales", () => {
        const sin = reglas.comoPropuesta(BASE);
        assert.equal(sin.ok, true);
        assert.deepEqual(
            {
                t: sin.datos.tipoDeItems, e: sin.datos.empresa, w: sin.datos.whatsapp, l: sin.datos.linea, c: sin.datos.correo,
                v: sin.datos.vigencia, n: sin.datos.nota, nv: sin.datos.notaVisibilidad, mp: sin.datos.metodoPago, md: sin.datos.medioPago,
            },
            { t: "servicios", e: "", w: "", l: "", c: "", v: null, n: "", nv: "interna", mp: "", md: "" },
        );
        const con = reglas.comoPropuesta({
            ...BASE,
            tipoDeItems: "PRODUCTOS",
            empresa: "  Sonrisa   SAS ",
            whatsapp: "+57 (300) 123-4567",
            linea: "VERZAY_VENTAS",
            correo: "ana@sonrisa.co",
            vigencia: "2026-10-15",
            nota: "Descuento de lanzamiento",
            notaVisibilidad: "publica",
            metodoPago: "Transferencia",
            medioPago: "Bancolombia 123\r\nA nombre de X",
        });
        assert.equal(con.ok, true, con.motivo);
        assert.equal(con.datos.tipoDeItems, "productos");
        assert.equal(con.datos.empresa, "Sonrisa SAS");
        assert.equal(con.datos.whatsapp, "573001234567");
        assert.equal(con.datos.vigencia, "2026-10-15");
        assert.equal(con.datos.notaVisibilidad, "publica");
        assert.equal(con.datos.medioPago, "Bancolombia 123\nA nombre de X");
        assert.equal(reglas.comoPropuesta({ ...BASE, notaVisibilidad: "cualquiera" }).datos.notaVisibilidad, "interna", "lo que no se entiende es interna");
        assert.equal(reglas.comoPropuesta({ ...BASE, tipoDeItems: "otra" }).datos.tipoDeItems, "servicios");
    });

    test("lo mal escrito de los campos nuevos se rechaza con su motivo", () => {
        assert.match(reglas.comoPropuesta({ ...BASE, whatsapp: "123" }).motivo, /WhatsApp/);
        assert.match(reglas.comoPropuesta({ ...BASE, whatsapp: "llámame" }).motivo, /WhatsApp/);
        assert.match(reglas.comoPropuesta({ ...BASE, correo: "no-es-correo" }).motivo, /correo/);
        assert.match(reglas.comoPropuesta({ ...BASE, vigencia: "2026-02-30" }).motivo, /vigencia/);
        assert.match(reglas.comoPropuesta({ ...BASE, vigencia: "2026-09-01" }).motivo, /anterior/);
        assert.match(reglas.comoPropuesta({ ...BASE, tipoDeItems: "productos", servicios: [] }).motivo, /al menos un producto/);
    });

    test("Servicios o Productos lo dice una sola función", () => {
        assert.deepEqual(reglas.losRotulosDeItems("servicios"), { plural: "Servicios", singular: "servicio" });
        assert.deepEqual(reglas.losRotulosDeItems("productos"), { plural: "Productos", singular: "producto" });
    });

    test("la nota interna nunca llega al cliente; la pública sí", () => {
        assert.equal(reglas.laNotaQueSeEnsena({ nota: "secreto", notaVisibilidad: "interna" }), "");
        assert.equal(reglas.laNotaQueSeEnsena({ nota: "para ti", notaVisibilidad: "publica" }), "para ti");
    });

    test("se envía desde líneas de WhatsApp, no desde Telegram ni Instagram", () => {
        assert.equal(reglas.esLineaParaEnviar({ instanceType: "Whatsapp" }), true);
        assert.equal(reglas.esLineaParaEnviar({ instanceType: "waha" }), true);
        assert.equal(reglas.esLineaParaEnviar({ instanceType: null }), true);
        assert.equal(reglas.esLineaParaEnviar({ instanceType: "meta", metaChannel: "whatsapp" }), true);
        assert.equal(reglas.esLineaParaEnviar({ instanceType: "meta", metaChannel: "instagram" }), false);
        assert.equal(reglas.esLineaParaEnviar({ instanceType: "telegram" }), false);
        assert.equal(reglas.elJidDelWhatsapp("573001234567"), "573001234567@s.whatsapp.net");
        assert.equal(reglas.comoEslogan("  Vende   más \n hoy "), "Vende más hoy");
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

    test("el enlace personalizado se normaliza como el de una landing, y nunca tiene la forma de un token", () => {
        assert.equal(reglas.comoSlug("  Clínica Sonrisa 2026! "), "clinica-sonrisa-2026");
        assert.equal(reglas.comoSlug("--Ñandú__Pérez--"), "nandu-perez");
        assert.equal(reglas.comoSlug(""), "", "vacío es «sin personalizar»");
        assert.equal(reglas.comoSlug("   "), "");
        assert.equal(reglas.comoSlug(undefined), "");
        assert.equal(reglas.comoSlug("ab"), null, "demasiado corto");
        assert.equal(reglas.comoSlug("!!!"), null, "no deja nada");
        assert.equal(reglas.comoSlug("a".repeat(reglas.TOPE_DE_SLUG + 1)), null, "demasiado largo");
        assert.equal(reglas.comoSlug("a".repeat(reglas.TOPE_DE_SLUG)), "a".repeat(reglas.TOPE_DE_SLUG));
        assert.ok(reglas.TOPE_DE_SLUG < reglas.LARGO_DEL_TOKEN, "un slug no puede medir lo que un token");
        for (const slug of ["clinica-sonrisa", "a".repeat(reglas.TOPE_DE_SLUG), "abc"]) {
            assert.equal(reglas.esSlugValido(slug), true);
            assert.equal(reglas.esTokenValido(slug), false, "ningún slug válido es un token válido");
        }
        assert.equal(reglas.esSlugValido("a".repeat(32)), false);
        assert.equal(reglas.esSlugValido("Clinica"), false, "se guarda en minúsculas");
        assert.equal(reglas.esSlugValido("a--b"), false);
        const T = "t".repeat(32);
        assert.equal(reglas.laLlaveDelEnlace({ token: T, slug: "" }), T, "sin personalizar, el token");
        assert.equal(reglas.laLlaveDelEnlace({ token: T, slug: "clinica" }), "clinica");
        assert.equal(reglas.laLlaveDelEnlace({ token: T, slug: "MAL SLUG" }), T, "uno roto no se usa");
        assert.equal(reglas.elEnlaceDeLaPropuesta("https://x.com/", { token: T, slug: "clinica" }), "https://x.com/propuesta/clinica");
        assert.equal(reglas.comoPropuesta({ ...BASE, slug: "Mi Propuesta" }).datos.slug, "mi-propuesta");
        assert.equal(reglas.comoPropuesta(BASE).datos.slug, "", "si no se toca, no se personaliza");
        const mal = reglas.comoPropuesta({ ...BASE, slug: "x" });
        assert.equal(mal.ok, false);
        assert.match(mal.motivo, /enlace personalizado/);
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
        assert.ok(cliente.includes("elEnlaceDeWhatsapp"), "abrir sin enviar sigue en el menú");
        assert.ok(cliente.includes("editarPropuestaAction"));
    });

    test("el enlace personalizado se edita en el formulario y el panel copia el que toca", () => {
        const form = crudo("app/(root)/(protected)/panel/propuestas/_components/FormularioDePropuesta.tsx");
        assert.ok(form.includes('id="propuesta-slug"'));
        assert.ok(form.includes("data-vista-del-enlace"), "se enseña cómo va a quedar");
        const cli = crudo("app/(root)/(protected)/panel/propuestas/_components/PropuestasClient.tsx");
        assert.equal(/elEnlacePublico\(base, p\.token\)/.test(cli), false, "ningún sitio arma el enlace con el token a pelo");
        assert.ok(cli.includes("elEnlaceDeLaPropuesta(base, p)"));
        const acc = crudo("actions/propuestas-actions.ts");
        assert.ok(acc.includes("elEnlaceDeLaPropuesta(await elOrigenDeLaApp(), p)"), "WhatsApp manda el mismo enlace");
        const db = crudo("lib/propuestas-db.ts");
        assert.match(db, /CREATE UNIQUE INDEX IF NOT EXISTS "propuestas_comerciales_slug_key"[\s\S]*WHERE "slug" <> ''/);
    });

    test("el botón de WhatsApp ENVÍA por la acción del servidor, no abre wa.me", () => {
        const cliente = crudo("app/(root)/(protected)/panel/propuestas/_components/PropuestasClient.tsx");
        const boton = cliente.slice(cliente.indexOf("data-enviar-whatsapp") - 400, cliente.indexOf("data-enviar-whatsapp") + 900);
        assert.ok(boton.includes("enviar(p)"));
        assert.equal(/href=/.test(boton), false, "el botón no es un enlace");
        const acc = crudo("actions/propuestas-actions.ts");
        assert.ok(acc.includes("sendViaWhatsAppDispatcher"));
        assert.ok(acc.includes("dispatcher.instanceName !== p.linea"), "nunca por otra línea");
    });

    test("la página pública no enseña el contacto del cliente ni la línea", () => {
        const db = crudo("lib/propuestas-db.ts");
        const publica = db.slice(db.indexOf("export async function laPropuestaPublica"));
        const ret = publica.slice(publica.indexOf("return {"), publica.indexOf("};", publica.indexOf("return {")));
        for (const oculto of ["whatsapp", "correo", "linea:", "notaVisibilidad"]) {
            assert.equal(ret.includes(oculto), false, `la página pública no lleva ${oculto}`);
        }
        assert.ok(ret.includes("laNotaQueSeEnsena(p)"));
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
            "actualizadaEn", "cliente", "condiciones", "empresa", "fecha", "mantenimientoDescripcion",
            "mantenimientoMensual", "medioPago", "metodoPago", "moneda", "negocio", "nota", "planes", "servicios",
            "tipoDeItems", "token", "vigencia",
        ]);
        // `planes` son solo referencias (nivel y modalidad): el video y el enlace se leen al pintar.
        assert.deepEqual(pub.planes, []);
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

    const LINEA_A = `LINEA_A_${sello}`;
    const LINEA_A2 = `LINEA_A2_${sello}`;
    const LINEA_B = `LINEA_B_${sello}`;
    let completa = null;

    conBase("siembra de las líneas de cada cuenta", async () => {
        for (const [userId, instanceName, instanceType, metaChannel] of [
            [A, LINEA_A, "Whatsapp", null],
            [A, LINEA_A2, "waha", null],
            [A, `IG_${sello}`, "meta", "instagram"],
            [B, LINEA_B, "Whatsapp", null],
        ]) {
            await m.db.instancia.create({
                data: { instanceName, instanceId: `iid-${instanceName}`, userId, instanceType, metaChannel },
            });
        }
        m.ponerAQuienMira(DUENO_A);
        const l = await m.listarPropuestasAction();
        assert.deepEqual(l.data.lineas.map((x) => x.instanceName).sort(), [LINEA_A, LINEA_A2].sort(), "solo las de A y de WhatsApp");
    });

    conBase("todos los campos nuevos se guardan y se leen; la línea tiene que ser de la cuenta", async () => {
        m.ponerAQuienMira(DUENO_A);
        const ajena = await m.crearPropuestaAction({ ...BASE, whatsapp: "573001234567", linea: LINEA_B });
        assert.equal(ajena.success, false);
        assert.match(ajena.message, /no es de esta cuenta/);
        const r = await m.crearPropuestaAction({
            ...BASE,
            tipoDeItems: "productos",
            empresa: "Sonrisa SAS",
            whatsapp: "+57 300 123 4567",
            linea: LINEA_A,
            correo: "ana@sonrisa.co",
            vigencia: "2026-10-15",
            nota: "Solo para el equipo",
            notaVisibilidad: "interna",
            metodoPago: "Transferencia",
            medioPago: "Bancolombia 123",
        });
        assert.equal(r.success, true, r.message);
        completa = r.data;
        assert.equal(completa.whatsapp, "573001234567");
        assert.equal(completa.linea, LINEA_A);
        assert.equal(completa.vigencia, "2026-10-15");
        assert.equal(completa.tipoDeItems, "productos");
        const e = await m.editarPropuestaAction(completa.id, { ...BASE, linea: LINEA_A2, whatsapp: "573001234567", notaVisibilidad: "publica", nota: "Hola cliente" });
        assert.equal(e.success, true, e.message);
        assert.equal(e.data.token, completa.token);
        assert.equal(e.data.linea, LINEA_A2);
        assert.equal(e.data.tipoDeItems, "servicios");
        completa = e.data;
    });

    conBase("la nota interna no llega a la página pública; la pública sí", async () => {
        m.ponerAQuienMira(DUENO_A);
        const conInterna = await m.editarPropuestaAction(completa.id, { ...BASE, nota: "secreto del equipo", notaVisibilidad: "interna", metodoPago: "Nequi" });
        assert.equal(conInterna.success, true);
        let pub = await m.laPropuestaPublica(completa.token);
        assert.equal(pub.nota, "");
        assert.equal(JSON.stringify(pub).includes("secreto del equipo"), false);
        assert.equal(pub.metodoPago, "Nequi");
        await m.editarPropuestaAction(completa.id, { ...BASE, nota: "para el cliente", notaVisibilidad: "publica", whatsapp: "573001234567", linea: LINEA_A, correo: "a@b.co" });
        pub = await m.laPropuestaPublica(completa.token);
        assert.equal(pub.nota, "para el cliente");
        assert.equal("whatsapp" in pub || "correo" in pub || "linea" in pub, false);
    });

    conBase("el eslogan es de la cuenta: sale en su página y vacío se quita", async () => {
        m.ponerAQuienMira(DUENO_A);
        assert.equal((await m.ponerEsloganAction("  Vende más con IA ")).data, "Vende más con IA");
        assert.equal((await m.laPropuestaPublica(completa.token)).negocio.eslogan, "Vende más con IA");
        assert.equal((await m.listarPropuestasAction()).data.eslogan, "Vende más con IA");
        m.ponerAQuienMira(DUENO_B);
        assert.equal((await m.listarPropuestasAction()).data.eslogan, "", "B no ve el de A");
        m.ponerAQuienMira(AGENTE_A);
        assert.equal((await m.ponerEsloganAction("robado")).success, false);
        m.ponerAQuienMira(DUENO_A);
        assert.equal((await m.ponerEsloganAction("")).data, "");
        assert.equal((await m.laPropuestaPublica(completa.token)).negocio.eslogan, "");
    });

    conBase("WhatsApp ENVÍA al número de la propuesta desde SU línea", async () => {
        m.ponerAQuienMira(DUENO_A);
        m.ponerLineasConectadas({ [A]: [LINEA_A2, LINEA_A] });
        m.enviados.length = 0;
        const r = await m.enviarPropuestaPorWhatsappAction(completa.id);
        assert.equal(r.success, true, r.message);
        assert.equal(m.enviados.length, 1);
        assert.equal(m.enviados[0].remoteJid, "573001234567@s.whatsapp.net");
        assert.equal(m.enviados[0].linea, LINEA_A, "sale por la línea elegida, no por la primera conectada");
        assert.equal(m.enviados[0].cuenta, A);
        assert.ok(m.enviados[0].text.includes(`/propuesta/${completa.token}`));
        assert.ok(m.enviados[0].text.includes("Clínica Dental Sonrisa"));
    });

    conBase("sin la línea conectada NO se cae a otra, y sin número no se envía", async () => {
        m.ponerAQuienMira(DUENO_A);
        m.enviados.length = 0;
        m.ponerLineasConectadas({ [A]: [LINEA_A2] });
        const desconectada = await m.enviarPropuestaPorWhatsappAction(completa.id);
        assert.equal(desconectada.success, false);
        assert.match(desconectada.message, /no está conectada/);
        m.ponerLineasConectadas({ [A]: [LINEA_A] });
        const sinNumero = await m.crearPropuestaAction({ ...BASE, linea: LINEA_A });
        assert.match((await m.enviarPropuestaPorWhatsappAction(sinNumero.data.id)).message, /WhatsApp del cliente/);
        const sinLinea = await m.crearPropuestaAction({ ...BASE, whatsapp: "573001234567" });
        assert.match((await m.enviarPropuestaPorWhatsappAction(sinLinea.data.id)).message, /línea/);
        assert.equal(m.enviados.length, 0, "nada salió");
    });

    conBase("otra cuenta ni un agente mandan la propuesta de A", async () => {
        m.enviados.length = 0;
        m.ponerLineasConectadas({ [A]: [LINEA_A], [B]: [LINEA_B] });
        m.ponerAQuienMira(DUENO_B);
        assert.equal((await m.enviarPropuestaPorWhatsappAction(completa.id)).success, false);
        m.ponerAQuienMira(AGENTE_A);
        assert.equal((await m.enviarPropuestaPorWhatsappAction(completa.id)).success, false);
        assert.equal(m.enviados.length, 0);
    });

    let conSlug = null;

    conBase("enlace personalizado: se guarda normalizado, abre por él Y por el token", async () => {
        m.ponerAQuienMira(DUENO_A);
        const r = await m.crearPropuestaAction({ ...BASE, slug: `  Clínica Sonrisa ${sello} ` });
        assert.equal(r.success, true, r.message);
        conSlug = r.data;
        assert.equal(conSlug.slug, `clinica-sonrisa-${sello}`);
        assert.equal(reglas.esTokenValido(conSlug.token), true, "el token se genera igual");
        assert.equal((await m.laPropuestaPublica(conSlug.slug)).cliente, "Clínica Dental Sonrisa");
        assert.equal((await m.laPropuestaPublica(conSlug.token)).cliente, "Clínica Dental Sonrisa", "el enlace con código sigue abriendo");
        assert.ok(await m.laPropuestaPublica(conSlug.slug.toUpperCase()), "tecleado en mayúsculas abre igual");
        assert.equal(await m.laPropuestaPublica(`${conSlug.slug}-no`), null, "un slug que no existe no abre nada");
    });

    conBase("un enlace personalizado no se repite: ni en la misma cuenta ni en otra", async () => {
        m.ponerAQuienMira(DUENO_A);
        const misma = await m.crearPropuestaAction({ ...BASE, slug: conSlug.slug.toUpperCase().replace(/-/g, " ") });
        assert.equal(misma.success, false);
        assert.match(misma.message, /ya lo usa otra propuesta/);
        m.ponerAQuienMira(DUENO_B);
        const otra = await m.crearPropuestaAction({ ...BASE, slug: conSlug.slug });
        assert.equal(otra.success, false, "la URL es global: tampoco otra cuenta");
        assert.match(otra.message, /ya lo usa otra propuesta/);
        m.ponerAQuienMira(DUENO_A);
        const editada = await m.editarPropuestaAction(completa.id, { ...BASE, slug: conSlug.slug });
        assert.equal(editada.success, false, "editar hacia uno ocupado tampoco");
        assert.match(editada.message, /ya lo usa otra propuesta/);
        const mal = await m.crearPropuestaAction({ ...BASE, slug: "ab" });
        assert.equal(mal.success, false);
        assert.match(mal.message, /enlace personalizado/);
        const s1 = await m.crearPropuestaAction(BASE);
        const s2 = await m.crearPropuestaAction(BASE);
        assert.equal(s1.success && s2.success, true, "las que no se personalizan no chocan (índice parcial)");
        assert.equal(s1.data.slug, "");
        assert.notEqual(s1.data.token, s2.data.token);
    });

    conBase("editar conserva, cambia o quita el enlace; el token nunca cambia", async () => {
        m.ponerAQuienMira(DUENO_A);
        const igual = await m.editarPropuestaAction(conSlug.id, { ...BASE, slug: conSlug.slug, cliente: "Otra vez" });
        assert.equal(igual.success, true, igual.message);
        assert.equal(igual.data.slug, conSlug.slug, "guardar la misma no choca consigo misma");
        const nuevo = `nuevo-${sello}`;
        const cambiada = await m.editarPropuestaAction(conSlug.id, { ...BASE, slug: nuevo });
        assert.equal(cambiada.data.slug, nuevo);
        assert.equal(cambiada.data.token, conSlug.token);
        assert.ok(await m.laPropuestaPublica(nuevo));
        assert.equal(await m.laPropuestaPublica(conSlug.slug), null, "el slug viejo queda libre");
        const quitada = await m.editarPropuestaAction(conSlug.id, { ...BASE, slug: "" });
        assert.equal(quitada.data.slug, "");
        assert.equal(await m.laPropuestaPublica(nuevo), null);
        assert.ok(await m.laPropuestaPublica(conSlug.token), "sin personalizar vuelve a ser el código");
        const libre = await m.crearPropuestaAction({ ...BASE, slug: nuevo });
        assert.equal(libre.success, true, "un slug que se soltó se puede usar otra vez");
    });

    conBase("WhatsApp manda el enlace personalizado si lo hay, y el del token si no", async () => {
        m.ponerAQuienMira(DUENO_A);
        m.ponerLineasConectadas({ [A]: [LINEA_A] });
        const bonito = `envio-${sello}`;
        const r = await m.crearPropuestaAction({ ...BASE, whatsapp: "573001234567", linea: LINEA_A, slug: bonito });
        assert.equal(r.success, true, r.message);
        m.enviados.length = 0;
        assert.equal((await m.enviarPropuestaPorWhatsappAction(r.data.id)).success, true);
        assert.ok(m.enviados[0].text.includes(`/propuesta/${bonito}`));
        assert.equal(m.enviados[0].text.includes(r.data.token), false);
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
                        cabecera: (() => {
                            const h = document.querySelector("[data-cabecera]");
                            const logo = h.querySelector("[data-logo-propuesta]").getBoundingClientRect();
                            const esl = h.querySelector("[data-eslogan]")?.getBoundingClientRect();
                            return {
                                texto: h.textContent,
                                sinRotulo: !h.querySelector("[data-rotulo-propuesta]") && !h.textContent.includes("Propuesta comercial"),
                                esloganDerecha: Boolean(esl) && esl.left >= logo.right && Math.abs(esl.right - h.getBoundingClientRect().right) < 1,
                            };
                        })(),
                        azul: (() => {
                            const bg = getComputedStyle(document.querySelector("[data-hero]")).backgroundImage;
                            const m = bg.match(/rgb\((\d+), (\d+), (\d+)\)/);
                            return m ? m.slice(1).map(Number) : null;
                        })(),
                        tituloItems: document.querySelector("[data-titulo-items]").textContent.trim(),
                        empresa: document.querySelector("[data-empresa]")?.textContent ?? "",
                        vigencia: document.querySelector("[data-vigencia]")?.textContent ?? "",
                        nota: Boolean(document.querySelector("[data-nota]")),
                        orden: (() => {
                            const y = (sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
                            return { cond: y("[data-condiciones]"), pago: y("[data-pago]"), pie: y("[data-propuesta] footer") };
                        })(),
                        metodo: document.querySelector("[data-metodo-pago]")?.textContent ?? "",
                        medio: document.querySelector("[data-medio-pago]")?.textContent ?? "",
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
                assert.equal(r.cabecera.texto.includes("Verzay | Pruebas"), false, `${w}: el nombre de la cuenta no va junto al logo`);
                assert.ok(r.cabecera.sinRotulo, `${w}: «Propuesta comercial» ya no va debajo del logo`);
                assert.ok(r.cabecera.esloganDerecha, `${w}: el eslogan va a la derecha`);
                assert.ok(r.azul, `${w}: la cabecera tiene su degradado`);
                const [cr, cg, cb] = r.azul;
                assert.ok(cb > 200 && cb > cr + 60 && (cr + cg + cb) / 3 > 110, `${w}: el azul es claro y azul (${r.azul})`);
                assert.equal(r.tituloItems, "Productos");
                assert.match(r.empresa, /Grupo Clínicas Sonrisa/);
                assert.match(r.vigencia, /15 de octubre de 2026/);
                assert.equal(r.nota, true);
                assert.ok(r.orden.cond < r.orden.pago && r.orden.pago < r.orden.pie, `${w}: el pago va tras las condiciones y antes del pie`);
                assert.match(r.metodo, /Transferencia \/ Nequi/);
                assert.match(r.medio, /Bancolombia/);
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
