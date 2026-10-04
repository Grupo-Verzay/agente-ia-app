/**
 * Los cuatro fallos de la zona de planes, y lo que los cierra:
 *
 * 1. **El nombre de un nivel es UNO.** Cada nivel tiene varias filas (IA,
 *    Humano y las de reseller) y el panel solo escribía la que se editaba: la
 *    landing seguía vendiendo el nombre ANTERIOR. Ahora guardar un nombre lo
 *    escribe en todas las filas del nivel, y lo que ya estaba escrito distinto
 *    se lee con una regla (`lib/nombre-del-nivel.ts`): el más reciente de la
 *    plataforma.
 * 2. **La modalidad no va en la dirección** (`?tipo=HUMANO`, `&a=HUMANO`): va
 *    en una cookie, y el servidor solo se la cree si ese nivel se vende así
 *    (`laAsistenciaQueSeVende`). Los enlaces viejos se limpian en el
 *    middleware y su modalidad pasa a la cookie.
 * 3. **La dirección lleva el NIVEL** (`/planes/nivel-2`, `?plan=nivel-2`), no
 *    el nombre interno; el nombre comercial se queda en la pantalla.
 * 4. **«Ver todo lo que incluye» y «Comenzar ahora» se separan**: `flex
 *    gap-3`, no `space-y-*`, que sobre un enlace en línea no separa nada.
 *
 * `MODO=roto` corre las mismas pruebas contra `ANTES_REF` (a5a9371) —pinchado a
 * un commit, nunca `origin/main`— y AFIRMA los cuatro fallos.
 *
 * Se levanta con `scripts/banco-enlaces-de-planes.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    // Sin navegador no se finge: se salta y se dice.
}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "enlaces-de-planes");
const ANTES = process.env.ANTES_REF ?? "a5a9371";
const LANDING = "app/(public)/inicio/_components/LandingClient.tsx";
const ACCIONES = "actions/subscription-plan-actions.ts";
const REGLA = "lib/pagina-de-plan.ts";

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deAntes = (f) => {
    try {
        execFileSync("git", ["cat-file", "-e", `${ANTES}:${f}`], { cwd: RAIZ, stdio: "ignore" });
        return execFileSync("git", ["show", `${ANTES}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
    } catch {
        return null;
    }
};

const hayBase = Boolean(process.env.DATABASE_URL);
const conBase = hayBase ? test : test.skip;
const cssDir = join(RAIZ, ".next", "static", "css");
const sello = Date.now().toString(36);
const CASA = { id: `ep-casa-${sello}`, effectiveId: `ep-casa-${sello}`, sessionUserId: `ep-casa-${sello}`, ownerId: null, advisorRole: null, role: "admin", rolDeLaPersona: "admin", porImpersonacion: false, email: `ep-casa-${sello}@banco.test`, name: "Casa" };

/** Los seis niveles, con un precio cada uno (los seis venden «Comenzar ahora»). */
const NIVELES = [
    ["lite", 19, 2000, "Lite"],
    ["basico", 29, 4000, "Básico"],
    ["intermedio", 49, 8000, "Estárter"],
    ["avanzado", 79, 12000, "Esencial"],
    ["enterprise", 149, 25000, "Business"],
    ["personalizado", 299, 50000, "A la medida"],
];

async function sembrar(m) {
    await m.db.planDetail.deleteMany({});
    await m.db.subscriptionPlan.deleteMany({});
    await m.db.$executeRawUnsafe(`DELETE FROM "plan_funciones"`).catch(() => {});
    await m.db.$executeRawUnsafe(`DELETE FROM "plan_para_quien"`).catch(() => {});
    await m.db.$executeRawUnsafe(`DELETE FROM "plan_pagina"`).catch(() => {});
    await m.db.user.create({ data: { id: CASA.id, email: CASA.email, name: CASA.name, role: CASA.role } });
    m.ponerAQuienMira(CASA);
    for (const [plan, priceUSD, credits, name] of NIVELES) {
        for (const assistanceType of ["IA", "HUMANO"]) {
            const r = await m.upsertSubscriptionPlan({ plan, assistanceType, priceUSD, credits, name, features: ["Chats", "Agenda"] });
            assert.equal(r.success, true, `${plan} ${assistanceType}: ${JSON.stringify(r)}`);
        }
    }
}

const nombresDe = async (m, plan) =>
    (await m.db.subscriptionPlan.findMany({ where: { plan }, select: { name: true, assistanceType: true, isResellerPlan: true } }))
        .map((f) => `${f.isResellerPlan ? "R" : "P"}-${f.assistanceType}:${f.name}`)
        .sort();

const activo = async (m, plan, tipo) =>
    ((await m.getActiveSubscriptionPlans()).data ?? []).find((p) => p.plan === plan && p.assistanceType === tipo);

/** Las seis tarjetas, servidas con el CSS del build y abiertas a 1440 y 390. */
async function abrirTarjetas(paquete, datos, pintar) {
    const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
    const js = fs.readFileSync(paquete, "utf8");
    const json = JSON.stringify(datos).replace(/</g, "\\u003c");
    const html =
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>` +
        `<body><div id="app"></div><script>window.process=window.process||{env:{}};Object.assign(window, ${json});</script>` +
        `<script type="module">${js}</script></body></html>`;
    const srv = http.createServer((_q, res) => { res.setHeader("content-type", "text/html"); res.end(html); });
    await new Promise((ok) => srv.listen(0, ok));
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    try {
        for (const [w, h] of [[1440, 900], [390, 844]]) {
            const pag = await nav.newPage({ viewport: { width: w, height: h } });
            await pag.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
            const errores = [];
            pag.on("pageerror", (e) => errores.push(String(e)));
            await pag.goto(url);
            await pag.waitForFunction(() => window.listo === true);
            await pag.waitForTimeout(250);
            await pintar(pag, w, errores);
            await pag.close();
        }
    } finally {
        await nav.close();
        srv.close();
    }
}

/** De cada tarjeta: los dos enlaces y el hueco entre «Ver todo» y el botón de comenzar. */
const medirLasTarjetas = (pag) =>
    pag.$$eval("[data-tarjeta]", (tarjetas) =>
        tarjetas.map((t) => {
            const ver = [...t.querySelectorAll("a")].find((a) => /Ver todo lo que incluye/.test(a.textContent ?? ""));
            const boton = [...t.querySelectorAll("button")].find((b) => /Comenzar ahora/.test(b.textContent ?? ""));
            const registro = boton?.closest("a");
            const a = ver?.getBoundingClientRect();
            const b = boton?.getBoundingClientRect();
            return {
                plan: t.getAttribute("data-tarjeta"),
                ver: ver?.getAttribute("href") ?? null,
                verTarget: ver?.getAttribute("target") ?? null,
                registro: registro?.getAttribute("href") ?? null,
                hueco: a && b ? Math.round((b.top - a.bottom) * 10) / 10 : null,
                alto: b ? b.height : 0,
            };
        }),
    );

const TARJETAS = NIVELES.map(([plan, priceUSD, credits, name], i) => ({
    id: `t${i}`,
    plan,
    assistanceType: "HUMANO",
    priceUSD,
    credits,
    name,
    isActive: true,
    features: ["Chats", "Agenda"],
    destacadas: ["Chats", "Agenda"],
}));

if (ROTO) {
    // ─────────────────────────────────────────────────────────────────────────
    // ANTES: lo que había, afirmado
    // ─────────────────────────────────────────────────────────────────────────

    test("ANTES: la tarjeta armaba las direcciones con el nombre interno y la modalidad a la vista, y separaba con space-y", () => {
        const l = deAntes(LANDING);
        assert.ok(l, `no se pudo leer ${ANTES}`);
        assert.ok(l.includes("mt-auto space-y-2.5"), "los dos botones iban en un space-y");
        assert.ok(l.includes("`/planes/${plan.plan}?tipo=${assistanceType}`"), "la página del plan llevaba ?tipo=");
        assert.ok(l.includes("`/register?plan=${plan.plan}&a=${assistanceType}`"), "el registro llevaba &a=");
    });

    test("ANTES: no había limpieza de direcciones, ni cookie, y guardar pisaba el nombre de una sola fila", () => {
        assert.equal(deAntes("lib/enlaces-de-planes.ts"), null, "no existía la regla de las direcciones");
        assert.equal(deAntes("lib/nombre-del-nivel.ts"), null, "ni la del nombre vigente");
        assert.equal(deAntes("middleware.ts").includes("laDireccionLimpiaDelPlan"), false, "el middleware no limpiaba nada");
        assert.ok(deAntes(ACCIONES).includes("name: data.name ?? null"), "guardar sin nombre lo borraba");
        assert.ok(deAntes(REGLA).includes("&a=${datos.asistencia}"), "el botón de la página llevaba la modalidad");
    });

    let m = null;
    if (hayBase) m = await import(join(COMPILADO, "entrada-de-enlaces-de-planes-antes.js"));

    conBase("siembra (con el código de antes)", async () => {
        await sembrar(m);
    });

    conBase("ANTES: renombrar el nivel desde la pestaña de IA dejaba la fila de Humano —la que vende la landing— con el nombre anterior", async () => {
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertSubscriptionPlan({ plan: "intermedio", assistanceType: "IA", priceUSD: 49, credits: 8000, name: "Starter", features: ["Chats"] })).success, true);
        assert.equal((await activo(m, "intermedio", "HUMANO")).name, "Estárter", "la landing seguía con el nombre viejo");
        assert.equal((await m.laPaginaDelPlan("intermedio", "HUMANO")).nombre, "Estárter", "y la página del plan también");
    });

    conBase("ANTES: guardar el plan sin mandar el nombre lo borraba", async () => {
        m.ponerAQuienMira(CASA);
        await m.upsertSubscriptionPlan({ plan: "avanzado", assistanceType: "HUMANO", priceUSD: 89, credits: 12000, features: ["Chats"] });
        assert.deepEqual(await nombresDe(m, "avanzado"), ["P-HUMANO:null", "P-IA:Esencial"]);
    });

    conBase("ANTES: el botón de la página del plan llevaba el nombre interno y la modalidad", async () => {
        const p = await m.laPaginaDelPlan("intermedio", "HUMANO");
        assert.match(p.botones.principal.url, /plan=intermedio/);
        assert.match(p.botones.principal.url, /a=HUMANO/);
    });

    const TARJETA = join(COMPILADO, "tarjetas-antes.js");
    const conNavegador = chromium && fs.existsSync(TARJETA) && fs.existsSync(cssDir) ? test : test.skip;

    conNavegador("ANTES: en las seis tarjetas «Ver todo» quedaba pegado a «Comenzar ahora», y las direcciones decían HUMANO y el nombre interno", async () => {
        await abrirTarjetas(TARJETA, { __planes: TARJETAS, __asistencia: "HUMANO" }, async (pag, w, errores) => {
            const t = await medirLasTarjetas(pag);
            assert.equal(t.length, 6, `${w}: seis tarjetas`);
            for (const x of t) {
                assert.ok(x.hueco !== null && x.hueco < 4, `${w} ${x.plan}: hueco de ${x.hueco}px`);
                assert.equal(x.ver, `/planes/${x.plan}?tipo=HUMANO`, `${w} ${x.plan}`);
                assert.equal(x.registro, `/register?plan=${x.plan}&a=HUMANO`, `${w} ${x.plan}`);
            }
            assert.deepEqual(errores, []);
        });
    });
} else {
    const e = await import(join(COMPILADO, "enlaces-de-planes.js"));
    const n = await import(join(COMPILADO, "nombre-del-nivel.js"));
    const tipos = await import(join(COMPILADO, "plans.js"));

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Las reglas, puras
    // ─────────────────────────────────────────────────────────────────────────

    test("la lista de niveles del middleware es EXACTAMENTE la de PLANS (el edge no puede leer Prisma)", () => {
        assert.deepEqual([...e.NIVELES_DE_PLAN], [...tipos.PLANS]);
    });

    test("nivel ↔ dirección: nivel-N en las dos direcciones, y lo que no es un nivel no lo es", () => {
        NIVELES.forEach(([plan], i) => {
            assert.equal(e.elSlugDelNivel(plan), `nivel-${i + 1}`);
            for (const forma of [`nivel-${i + 1}`, `nivel${i + 1}`, `Nivel ${i + 1}`, `${i + 1}`, plan.toUpperCase()]) {
                assert.equal(e.elNivelDelSlug(forma), plan, forma);
            }
        });
        for (const raro of ["nivel-0", "nivel-7", "starter", "", null, undefined, "nivel-x"]) assert.equal(e.elNivelDelSlug(raro), null, String(raro));
    });

    test("los enlaces van por nivel y sin modalidad; solo el de la landing incrustada la lleva", () => {
        assert.equal(e.elEnlaceDeLaPaginaDelPlan("basico"), "/planes/nivel-2");
        assert.equal(e.elEnlaceDeLaPaginaDelPlan("avanzado", null), "/planes/nivel-4");
        assert.equal(e.elEnlaceDeLaPaginaDelPlan("avanzado", "HUMANO"), "/planes/nivel-4?tipo=HUMANO");
        assert.equal(e.elEnlaceDeRegistro("intermedio"), "/register?plan=nivel-3");
        assert.equal(e.elEnlaceDeRegistro("intermedio", { r: "agencia" }), "/register?r=agencia&plan=nivel-3");
        assert.equal(e.elEnlaceDeRegistro("lite", { asistenciaQueViaja: "IA" }), "/register?plan=nivel-1&a=IA");
    });

    test("la dirección limpia: nivel en vez del nombre, sin a= ni tipo=IA/HUMANO, y tipo=reseller se queda", () => {
        const limpia = (ruta) => {
            const u = new URL(ruta, "http://x");
            return e.laDireccionLimpiaDelPlan(u.pathname, u.searchParams);
        };
        assert.deepEqual(limpia("/planes/basico?tipo=HUMANO"), { destino: "/planes/nivel-2", asistencia: "HUMANO" });
        assert.deepEqual(limpia("/planes/nivel-2?tipo=IA"), { destino: "/planes/nivel-2", asistencia: "IA" });
        assert.deepEqual(limpia("/planes/avanzado"), { destino: "/planes/nivel-4", asistencia: null });
        assert.deepEqual(limpia("/register?plan=avanzado&a=HUMANO"), { destino: "/register?plan=nivel-4", asistencia: "HUMANO" });
        assert.deepEqual(limpia("/register?r=agencia&plan=lite&a=IA&aff=x"), { destino: "/register?r=agencia&plan=nivel-1&aff=x", asistencia: "IA" });
        assert.deepEqual(limpia("/completar-registro?plan=basico&a=HUMANO"), { destino: "/completar-registro?plan=nivel-2", asistencia: "HUMANO" });
        assert.deepEqual(limpia("/register?plan=nivel-2&a=raro"), { destino: "/register?plan=nivel-2", asistencia: null }, "una modalidad rara se quita y no se apunta");
        assert.equal(limpia("/completar-registro?tipo=reseller&plan=nivel-2"), null, "el registro de un reseller se queda como está");
        assert.equal(limpia("/planes/nivel-2"), null, "lo limpio no se toca");
        assert.equal(limpia("/register?plan=nivel-4"), null);
        assert.equal(limpia("/planes/inventado"), null, "un plan que no existe lo contesta la página (404)");
        assert.equal(limpia("/chats?tipo=HUMANO"), null, "fuera de los planes no se toca nada");
        assert.equal(limpia("/planes"), null);
    });

    test("la cookie de la modalidad: de primera parte, y dentro de un marco particionada", () => {
        assert.equal(e.laCookieDeAsistencia("HUMANO"), "plan_asistencia=HUMANO; Path=/; Max-Age=604800; SameSite=Lax");
        assert.equal(e.laCookieDeAsistencia("IA", { entreSitios: true }), "plan_asistencia=IA; Path=/; Max-Age=604800; SameSite=None; Secure; Partitioned");
        assert.equal(e.comoAsistencia(" humano "), "HUMANO");
        assert.equal(e.comoAsistencia("reseller"), null);
        assert.equal(e.comoAsistencia(3), null);
    });

    test("la modalidad que se vende: la pedida si está a la venta; si no, la que se venda (IA primero)", () => {
        const ambas = new Set(["IA", "HUMANO"]);
        assert.equal(e.elegirLaAsistencia("HUMANO", ambas), "HUMANO");
        assert.equal(e.elegirLaAsistencia(null, ambas), "IA");
        assert.equal(e.elegirLaAsistencia("HUMANO", new Set(["IA"])), "IA");
        assert.equal(e.elegirLaAsistencia("IA", new Set(["HUMANO"])), "HUMANO");
        assert.equal(e.elegirLaAsistencia(null, new Set()), "IA");
    });

    test("el nombre vigente: el más reciente de la plataforma; el de reseller solo si no hay ninguno; sin nombre, «Nivel N»", () => {
        const f = (plan, name, isResellerPlan, dia) => ({ plan, name, isResellerPlan, updatedAt: new Date(2026, 8, dia) });
        const nombres = n.losNombresDeLosNiveles([
            f("intermedio", "Estárter", false, 1),
            f("intermedio", "Starter", false, 5),
            f("intermedio", "De reseller", true, 9),
            f("avanzado", "Solo reseller", true, 2),
            f("enterprise", "  ", false, 3),
            f("enterprise", null, false, 4),
        ]);
        assert.deepEqual(nombres, { intermedio: "Starter", avanzado: "Solo reseller" });
        assert.equal(n.elNombreDelNivel("enterprise", nombres), "Nivel 5");
        assert.deepEqual(n.conElNombreDelNivel([{ plan: "intermedio", name: "Estárter", priceUSD: 49 }], nombres), [{ plan: "intermedio", name: "Starter", priceUSD: 49 }]);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Un barrido del código
    // ─────────────────────────────────────────────────────────────────────────

    test("barrido: ninguna dirección de planes se arma a mano con la modalidad o el nombre interno", () => {
        const ficheros = [];
        const recorrer = (dir) => {
            for (const d of fs.readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
                const ruta = join(dir, d.name);
                if (d.isDirectory()) {
                    if (d.name === "node_modules" || d.name === "__tests__" || d.name.startsWith(".")) continue;
                    recorrer(ruta);
                } else if (/\.(ts|tsx)$/.test(d.name)) ficheros.push(ruta);
            }
        };
        for (const dir of ["app", "components", "lib", "actions"]) recorrer(dir);
        const mal = [];
        for (const f of ficheros) {
            if (f === "lib/enlaces-de-planes.ts" || f.startsWith("app/api/")) continue;
            const s = crudo(f);
            const reglas = [
                [/\/planes\/\$\{/g, "una /planes/${…} a mano"],
                [/[?&]tipo=\$\{/g, "un ?tipo=${…}"],
                [/[?&]a=\$\{/g, "un &a=${…}"],
                [/[?&]plan=\$\{(?!elSlugDelNivel\()/g, "un ?plan=${…} sin el nivel"],
            ];
            for (const [re, que] of reglas) for (const x of s.matchAll(re)) mal.push(`${f}: ${que} → ${s.slice(x.index, x.index + 60)}`);
        }
        assert.ok(ficheros.length > 100, "el barrido recorrió el código");
        assert.deepEqual(mal, []);
    });

    test("barrido: el middleware limpia la dirección ANTES de decidir si es pública, y la tarjeta separa con flex gap", () => {
        const mw = crudo("middleware.ts");
        const i = mw.indexOf("laDireccionLimpiaDelPlan(currentPath");
        assert.ok(i > 0, "el middleware limpia");
        assert.ok(i < mw.indexOf("publicRoutes.includes(currentPath)"), "antes de la ruta pública");
        assert.ok(mw.includes("laCookieDeAsistencia(limpia.asistencia"), "y apunta la modalidad en la cookie");
        const l = crudo(LANDING);
        assert.match(l, /className="mt-auto flex flex-col gap-3" data-botones-de-la-tarjeta/);
        assert.equal(l.includes("space-y-2.5"), false);
        const acc = crudo(ACCIONES);
        assert.match(acc, /updateMany\(\{ where: \{ plan: data\.plan \}, data: \{ name: nombre \} \}\)/, "guardar un nombre lo escribe en todo el nivel");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Las acciones de verdad, contra Postgres
    // ─────────────────────────────────────────────────────────────────────────

    let m = null;
    if (hayBase) m = await import(join(COMPILADO, "entrada-de-enlaces-de-planes.js"));

    conBase("siembra", async () => {
        await sembrar(m);
    });

    conBase("renombrar el nivel desde la pestaña de IA lo renombra en TODAS sus filas, también la de reseller", async () => {
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertSubscriptionPlan({ plan: "intermedio", assistanceType: "IA", isResellerPlan: true, priceUSD: 30, credits: 8000, name: "Estárter", features: ["Chats"] })).success, true);
        assert.equal((await m.upsertSubscriptionPlan({ plan: "intermedio", assistanceType: "IA", priceUSD: 49, credits: 8000, name: "Starter", features: ["Chats"] })).success, true);
        assert.deepEqual(await nombresDe(m, "intermedio"), ["P-HUMANO:Starter", "P-IA:Starter", "R-IA:Starter"]);
        assert.equal((await activo(m, "intermedio", "HUMANO")).name, "Starter", "la landing vende el nombre vigente");
        assert.equal((await m.laPaginaDelPlan("nivel-3", "HUMANO")).nombre, "Starter", "y la página del plan también");
    });

    conBase("guardar el plan sin mandar el nombre lo conserva", async () => {
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertSubscriptionPlan({ plan: "avanzado", assistanceType: "HUMANO", priceUSD: 89, credits: 12000, features: ["Chats"] })).success, true);
        assert.deepEqual(await nombresDe(m, "avanzado"), ["P-HUMANO:Esencial", "P-IA:Esencial"]);
    });

    conBase("lo que ya estaba escrito distinto: manda el más reciente de la plataforma, no el de reseller", async () => {
        const fijar = (tipo, reseller, nombre, horas) =>
            m.db.$executeRawUnsafe(
                `UPDATE "subscription_plans" SET "name" = $1, "updatedAt" = now() + ($2 || ' hours')::interval WHERE "plan" = 'enterprise' AND "assistanceType" = $3 AND "isResellerPlan" = $4`,
                nombre, String(horas), tipo, reseller,
            );
        m.ponerAQuienMira(CASA);
        assert.equal((await m.upsertSubscriptionPlan({ plan: "enterprise", assistanceType: "IA", isResellerPlan: true, priceUSD: 99, credits: 25000, features: ["Chats"] })).success, true);
        await fijar("IA", false, "Business Pro", 0);
        await fijar("HUMANO", false, "Business viejo", -24);
        await fijar("IA", true, "Nombre de reseller", 24);
        assert.equal((await activo(m, "enterprise", "HUMANO")).name, "Business Pro");
        assert.equal((await m.laPaginaDelPlan("nivel-5", "HUMANO")).nombre, "Business Pro");
        assert.equal((await m.etiquetasDePlanesParaMarca(null)).enterprise, "Business Pro");
        const todos = (await m.getAllSubscriptionPlans()).data.filter((p) => p.plan === "enterprise" && !p.isResellerPlan);
        assert.deepEqual(todos.map((p) => p.name), ["Business Pro", "Business Pro"], "el panel enseña el mismo nombre en las dos pestañas");
    });

    conBase("la página del plan enlaza por nivel y sin modalidad", async () => {
        const p = await m.laPaginaDelPlan("nivel-3", "HUMANO");
        assert.equal(p.botones.principal.url, "/register?plan=nivel-3");
        assert.equal(p.planSuperior?.url, "/planes/nivel-4");
        const q = await m.laPaginaDelPlan("intermedio", "HUMANO");
        assert.equal(q?.nombre, "Starter", "un enlace viejo por nombre interno sigue abriendo la página");
    });

    conBase("la modalidad de la cookie solo vale si ese nivel se vende así (sin eso el precio salía en 0)", async () => {
        await m.db.subscriptionPlan.updateMany({ where: { plan: "basico", assistanceType: "HUMANO", isResellerPlan: false }, data: { isActive: false } });
        assert.equal((await m.precioDePlanParaCuenta("nivel-2", "HUMANO", null)).price, 0, "la modalidad apagada daba precio 0");
        const vendida = await m.laAsistenciaQueSeVende("nivel-2", "HUMANO", null);
        assert.equal(vendida, "IA");
        assert.ok((await m.precioDePlanParaCuenta("nivel-2", vendida, null)).price > 0);
        assert.equal(await m.laAsistenciaQueSeVende("nivel-3", "HUMANO", null), "HUMANO");
        assert.equal(await m.laAsistenciaQueSeVende("nivel-3", null, null), "IA");
        await m.db.subscriptionPlan.updateMany({ where: { plan: "lite", assistanceType: "IA", isResellerPlan: false }, data: { isActive: false } });
        assert.equal(await m.laAsistenciaQueSeVende("nivel-1", "IA", null), "HUMANO");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Las seis tarjetas de VERDAD, en Chromium
    // ─────────────────────────────────────────────────────────────────────────

    const TARJETA = join(COMPILADO, "tarjetas.js");
    const conNavegador = chromium && fs.existsSync(TARJETA) && fs.existsSync(cssDir) ? test : test.skip;

    conNavegador("las seis tarjetas: «Ver todo» separado de «Comenzar ahora», y direcciones por nivel sin modalidad", async () => {
        await abrirTarjetas(TARJETA, { __planes: TARJETAS, __asistencia: "HUMANO" }, async (pag, w, errores) => {
            const t = await medirLasTarjetas(pag);
            assert.equal(t.length, 6, `${w}: seis tarjetas`);
            t.forEach((x, i) => {
                assert.ok(x.hueco >= 11.5, `${w} ${x.plan}: hueco de ${x.hueco}px`);
                assert.ok(x.alto > 20, `${w} ${x.plan}: el botón se pinta`);
                assert.equal(x.ver, `/planes/nivel-${i + 1}`, `${w} ${x.plan}`);
                assert.equal(x.registro, `/register?plan=nivel-${i + 1}`, `${w} ${x.plan}`);
                assert.equal(x.verTarget, null);
            });
            const huecos = new Set(t.map((x) => x.hueco));
            assert.equal(huecos.size, 1, `${w}: el mismo hueco en las seis (${[...huecos]})`);
            assert.deepEqual(errores, []);
        });
    });

    conNavegador("incrustada en otra web: la pestaña nueva lleva la modalidad (el middleware la pasa a la cookie)", async () => {
        await abrirTarjetas(TARJETA, { __planes: TARJETAS.slice(0, 2), __asistencia: "HUMANO", __enOtraPestana: true }, async (pag, w, errores) => {
            const t = await medirLasTarjetas(pag);
            assert.equal(t[1].ver, "/planes/nivel-2?tipo=HUMANO", `${w}`);
            assert.equal(t[1].verTarget, "_blank", `${w}`);
            assert.equal(t[1].registro, "/register?plan=nivel-2&a=HUMANO", `${w}`);
            assert.deepEqual(errores, []);
        });
    });
}

void relative;
