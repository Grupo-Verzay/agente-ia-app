/**
 * Finanzas, en Chromium y sobre la página SERVIDA: pulsar un mes del resumen
 * anual NO cambia de cuenta.
 *
 * Se entra como la cuenta madre de una familia (ver
 * `scripts/sembrar-cuenta-del-resumen.mjs`), se elige UNA cuenta hija en el
 * selector y se pulsa un mes y la flecha de año. Cada cuenta tiene importes
 * distintos, así que la cifra del mes dice de quién es lo que se ve; y se
 * mira además la URL y el rótulo del selector.
 *
 * Y la otra cara del mismo fallo, en Ventas: con UNA cuenta hija elegida sus
 * filas no se ofrecen para editar y «Eliminar todas las ventas» no sale —ese
 * botón borra la cuenta PROPIA, que no es la que se está viendo—.
 *
 * `MODO=roto` corre contra el build de ANTES y AFIRMA el fallo: pulsar el mes
 * devuelve la pantalla a la cuenta madre, y en Ventas las filas de la hija se
 * ofrecen para editar con «Eliminar todas» a la vista.
 *
 * Se levanta con `scripts/banco-cuenta-del-resumen-navegador.sh`.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3933";
const ROTO = process.env.MODO === "roto";
const { madre, norte, sur } = JSON.parse(process.env.CUENTAS ?? "{}");
if (!madre || !norte || !sur) throw new Error("Falta CUENTAS (la salida de la semilla)");

const fallos = [];
let bien = 0;
const exigir = (cumple, que) => {
    if (cumple) bien += 1;
    else fallos.push(que);
    console.log(`${cumple ? "ok " : "MAL"}  ${que}`);
};

async function entrar(contexto) {
    const p = await contexto.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2500);
    await p.fill('input[name="email"]', "madre-resumen@banco.test");
    await p.fill('input[name="password"]', "banco1234");
    await p.click('button[type="submit"]');
    for (let i = 0; i < 120 && p.url().includes("/login"); i += 1) await p.waitForTimeout(500);
    if (p.url().includes("/login")) throw new Error("no se pudo entrar: la página sigue en /login");
    return p;
}

/** Cierra lo que salte solo al entrar (guías, avisos de actualización). */
async function apartarLoQueSalte(p) {
    for (let i = 0; i < 4; i += 1) {
        if (!(await p.$('[role="dialog"], [role="alertdialog"]'))) break;
        await p.keyboard.press("Escape");
        await p.waitForTimeout(300);
    }
}

async function abrirResumen(p, ruta) {
    await p.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("[data-resumen-anual] a", { timeout: 60000 });
    await p.waitForTimeout(1200);
    await apartarLoQueSalte(p);
}

/** La cifra de un mes en la rejilla, solo los dígitos: el formato no decide. */
const laCifraDelMes = (p, mes) =>
    p.evaluate((mes) => {
        const celda = [...document.querySelectorAll("[data-resumen-anual] a")].find(
            (a) => a.firstElementChild?.textContent?.trim().toLowerCase() === mes,
        );
        if (!celda) return null;
        return Number((celda.lastElementChild?.textContent ?? "").replace(/\D/g, ""));
    }, mes);

/** El rótulo del selector de cuentas: el nombre de la cuenta, o «N cuentas». */
const elRotulo = (p) =>
    p.evaluate(() => {
        const nombres = ["Casa Madre", "Sucursal Norte", "Sucursal Sur"];
        const boton = [...document.querySelectorAll("button")].find((b) => {
            const t = b.innerText.trim();
            return nombres.includes(t) || /^\d+ cuentas$/.test(t);
        });
        return boton?.innerText.trim() ?? null;
    });

const laUrl = (p) => new URL(p.url());
const cuentasDeLaUrl = (p) => laUrl(p).searchParams.get("cuentas");

async function pulsarYEsperar(p, localizador, mes) {
    await localizador.click();
    await p.waitForURL((u) => new URL(u).searchParams.get("month") === mes, { timeout: 30000 });
    // El resumen es un componente del servidor: la URL cambia antes de que
    // llegue la rejilla nueva. Se espera a que la celda activa sea la del mes.
    await p.waitForFunction(
        (mes) => {
            const activa = document.querySelector("[data-resumen-anual] a.ring-1");
            return activa?.getAttribute("href")?.includes(`month=${mes}`);
        },
        mes,
        { timeout: 30000 },
    );
    await p.waitForTimeout(800);
}

const navegador = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
});
try {
    const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: "es-CO" });
    const p = await entrar(contexto);

    /* ── 1. UNA cuenta hija: pulsar un mes se queda en ella ─────────────── */
    await abrirResumen(p, `/dashboard/finance?month=2026-03&cuentas=${norte}`);
    exigir((await elRotulo(p)) === "Sucursal Norte", "al entrar con la hija, el selector dice «Sucursal Norte»");
    exigir((await laCifraDelMes(p, "marzo")) === 200000, "y marzo enseña lo de la hija (200.000)");

    const mayo = p.locator("[data-resumen-anual] a", { hasText: /^mayo/i });
    await pulsarYEsperar(p, mayo, "2026-05");
    const rotuloTrasElMes = await elRotulo(p);
    const cifraTrasElMes = await laCifraDelMes(p, "mayo");
    if (!ROTO) {
        exigir(cuentasDeLaUrl(p) === norte, "pulsar mayo deja la hija en la URL");
        exigir(rotuloTrasElMes === "Sucursal Norte", "pulsar mayo deja el selector en «Sucursal Norte»");
        exigir(cifraTrasElMes === 2222000, "y mayo enseña lo de la hija (2.222.000), no lo de la madre");

        await pulsarYEsperar(p, p.locator('[data-resumen-anual] a[aria-label="Ver 2025"]'), "2025-05");
        exigir(cuentasDeLaUrl(p) === norte, "la flecha de año también deja la hija en la URL");
        exigir((await elRotulo(p)) === "Sucursal Norte", "y el selector sigue en «Sucursal Norte»");
        exigir((await laCifraDelMes(p, "mayo")) === 20000, "y mayo de 2025 es el de la hija (20.000)");
    } else {
        exigir(cuentasDeLaUrl(p) === null, "ANTES: pulsar mayo soltaba la hija de la URL");
        exigir(rotuloTrasElMes === "Casa Madre", "ANTES: el selector volvía a «Casa Madre»");
        exigir(cifraTrasElMes === 1111000, "ANTES: mayo enseñaba lo de la MADRE (1.111.000)");
    }

    /* ── 2. Consolidando: ya funcionaba, y tiene que seguir igual ───────── */
    await abrirResumen(p, `/dashboard/finance?month=2026-03&cuentas=${norte},${sur}`);
    await pulsarYEsperar(p, p.locator("[data-resumen-anual] a", { hasText: /^mayo/i }), "2026-05");
    exigir(
        (cuentasDeLaUrl(p) ?? "").split(",").sort().join(",") === [norte, sur].sort().join(","),
        "consolidando dos hijas, pulsar mayo las deja a las dos",
    );
    exigir((await laCifraDelMes(p, "mayo")) === 5555000, "y mayo suma las dos (5.555.000)");

    /* ── 3. La propia y sola: la URL sigue limpia ────────────────────────── */
    await abrirResumen(p, "/dashboard/finance?month=2026-03");
    await pulsarYEsperar(p, p.locator("[data-resumen-anual] a", { hasText: /^mayo/i }), "2026-05");
    exigir(cuentasDeLaUrl(p) === null, "con la cuenta propia y sola, la URL sigue sin `cuentas`");
    exigir((await laCifraDelMes(p, "mayo")) === 1111000, "y mayo es lo de la madre (1.111.000)");
    exigir((await elRotulo(p)) === "Casa Madre", "y el selector dice «Casa Madre»");

    /* ── 4. Ventas con UNA cuenta hija: se mira, no se toca ──────────────── */
    async function abrirVentas(ruta, fila) {
        await p.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded" });
        await p.waitForSelector(`tbody tr:has-text("${fila}")`, { timeout: 60000 });
        await p.waitForTimeout(1000);
        await apartarLoQueSalte(p);
        const accionesDeFila = await p.locator("tbody [data-accion-de-fila]").count();
        await p.locator('button[aria-label="Acciones"]').first().click();
        await p.waitForSelector('[role="menu"]', { timeout: 15000 });
        const menu = await p.locator('[role="menu"]').innerText();
        await p.keyboard.press("Escape");
        await p.waitForTimeout(300);
        return { accionesDeFila, eliminarTodas: menu.includes("Eliminar todas las ventas") };
    }

    const hija = await abrirVentas(`/dashboard/finance/sales?cuentas=${norte}`, "Venta de Sucursal Norte");
    if (!ROTO) {
        exigir(hija.accionesDeFila === 0, "en Ventas, las filas de la hija no ofrecen editar ni eliminar");
        exigir(!hija.eliminarTodas, "y «Eliminar todas las ventas» no sale mirando a la hija");
    } else {
        exigir(hija.accionesDeFila > 0, "ANTES: las filas de la hija se ofrecían para editar");
        exigir(hija.eliminarTodas, "ANTES: «Eliminar todas las ventas» salía mirando a la hija");
    }

    const propia = await abrirVentas("/dashboard/finance/sales", "Venta de Casa Madre");
    exigir(propia.accionesDeFila > 0, "con la cuenta propia, sus filas sí se editan");
    exigir(propia.eliminarTodas, "y «Eliminar todas las ventas» sigue ahí");
} finally {
    await navegador.close();
}

console.log(`\n${bien} bien, ${fallos.length} mal${ROTO ? " (MODO=roto: se afirma el fallo de antes)" : ""}`);
if (fallos.length) process.exit(1);
