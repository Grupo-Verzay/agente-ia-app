/**
 * El panel de filtros de Chats, en Chromium y sobre la página SERVIDA, con
 * sesión de verdad de una cuenta madre con dos hijas (`sembrar-filtro-de-chats`).
 *
 * Lo que se comprueba, que es el encargo:
 *  1. Con varias cuentas, el panel pide primero la CUENTA y no enseña ninguna
 *     etiqueta ni embudo hasta elegirla.
 *  2. Elegida Atención: solo SUS etiquetas (nunca las de Ventas ni la madre) y
 *     sus dos embudos, que hay que elegir antes de ver etapas.
 *  3. Elegida una etapa, la lista queda en EXACTAMENTE las conversaciones de esa
 *     etapa de ese embudo; volver a pulsarla la quita. Las etiquetas filtran
 *     igual.
 *  4. Cambiar a Ventas limpia lo elegido; con un solo embudo, salen sus etapas.
 *
 * Hace falta: `BASE`, `CUENTAS` (el JSON de la siembra).
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3932";
const CUENTAS = JSON.parse(process.env.CUENTAS);

const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
    else console.log("ok -", que);
};

async function entrar(pagina) {
    await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);
    await pagina.fill('input[name="email"]', "jefe@filtro.test");
    await pagina.fill('input[name="password"]', "banco1234");
    await pagina.click('button[type="submit"]');
    for (let i = 0; i < 120 && pagina.url().includes("/login"); i += 1) await pagina.waitForTimeout(500);
    if (pagina.url().includes("/login")) throw new Error("no se pudo entrar");
}

const nombresDeLaLista = (pagina) =>
    pagina.$$eval("[data-columna-de-chats] [data-chat-id]", (filas) =>
        filas
            .map((f) => f.textContent ?? "")
            .map((t) => (t.match(/(Mario|Ana|Beto|Caro|Vera) (Madre|Atencion|Ventas)/) ?? [""])[0])
            .filter(Boolean)
            .sort(),
    );

const textos = (pagina, selector) =>
    pagina.$$eval(`[data-radix-popper-content-wrapper] ${selector}`, (xs) => xs.map((x) => (x.textContent ?? "").trim()));

/** La «Guía rápida» del copiloto se abre sola con un velo que se come los clics. */
async function apartarLoQueTapa(pagina) {
    for (let i = 0; i < 4; i += 1) {
        const capa = await pagina.$('div[data-state="open"].fixed.inset-0');
        if (!capa) break;
        await pagina.keyboard.press("Escape");
        await pagina.waitForTimeout(250);
    }
}

async function abrirPanel(pagina) {
    await apartarLoQueTapa(pagina);
    if (await pagina.$("[data-radix-popper-content-wrapper] [data-seccion]")) return;
    await pagina.click('button[aria-label="Filtros"]');
    await pagina.waitForSelector("[data-radix-popper-content-wrapper] [data-seccion]", { timeout: 15000 });
    await pagina.waitForTimeout(1200);
}
/** Etiquetas y Embudos nacen plegadas: se despliega la que se va a mirar. */
async function desplegar(pagina, seccion) {
    const sel = `[data-radix-popper-content-wrapper] button[data-seccion="${seccion}"]`;
    await pagina.waitForSelector(sel, { timeout: 15000 });
    if ((await pagina.getAttribute(sel, "data-abierta")) !== "si") await pagina.click(sel);
    await pagina.waitForTimeout(300);
}
/** Elegir una etiqueta o una etapa cierra el panel entero, solo. */
async function exigirPanelCerrado(pagina, que) {
    await pagina.waitForTimeout(500);
    exigir(!(await pagina.$("[data-radix-popper-content-wrapper] [data-seccion]")), `elegir ${que} cierra el panel`);
}
async function cerrarPanel(pagina) {
    await pagina.keyboard.press("Escape");
    await pagina.waitForTimeout(600);
}

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const pagina = await (await navegador.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
try {
    await entrar(pagina);
    await pagina.goto(`${BASE}/chats`, { waitUntil: "domcontentloaded" });
    await pagina.waitForSelector("[data-columna-de-chats] [data-chat-id]", { timeout: 60000 });
    await pagina.waitForTimeout(2500);

    const todas = await nombresDeLaLista(pagina);
    exigir(todas.length === 5, `la bandeja trae las 5 conversaciones de las tres cuentas (${todas.join(", ")})`);

    // 1. Primero la cuenta.
    await abrirPanel(pagina);
    const cuentas = await pagina.$$eval("[data-radix-popper-content-wrapper] [data-cuenta]", (xs) =>
        xs.map((x) => x.getAttribute("data-cuenta")),
    );
    exigir(cuentas.length === 3, `el panel ofrece las tres cuentas (${cuentas.length})`);
    exigir(
        (await pagina.$$("[data-radix-popper-content-wrapper] [data-tag]")).length === 0,
        "sin cuenta elegida no sale ninguna etiqueta",
    );
    exigir(
        !(await pagina.$('[data-radix-popper-content-wrapper] [data-seccion="embudos"]')),
        "sin cuenta elegida no sale la sección de embudos",
    );
    const nombresDeCuentas = await textos(pagina, "[data-cuenta]");
    exigir(nombresDeCuentas.includes("Hija Atencion"), `las cuentas se ven por su nombre (${nombresDeCuentas.join(", ")})`);

    // 2. Atención: sus etiquetas y sus dos embudos.
    await pagina.click(`[data-radix-popper-content-wrapper] [data-cuenta="${CUENTAS.atencion}"]`);
    await pagina.waitForTimeout(500);
    exigir(
        (await pagina.$$("[data-radix-popper-content-wrapper] [data-tag]")).length === 0,
        "Etiquetas nace plegada",
    );
    await desplegar(pagina, "etiquetas");
    const etiquetas = await textos(pagina, "[data-tag]");
    exigir(
        JSON.stringify([...etiquetas].sort()) === JSON.stringify(["Interesado", "Reclamo"]),
        `Atención ofrece solo SUS etiquetas (${etiquetas.join(", ")})`,
    );
    await desplegar(pagina, "embudos");
    await pagina.waitForSelector("[data-radix-popper-content-wrapper] [data-embudo-opcion]", { timeout: 15000 });
    exigir(
        (await pagina.$$("[data-radix-popper-content-wrapper] [data-tag]")).length === 0,
        "desplegar Embudos pliega Etiquetas",
    );
    const embudos = await textos(pagina, "[data-embudo-opcion]");
    exigir(
        JSON.stringify(embudos) === JSON.stringify(["Embudo de ventas", "Soporte"]),
        `Atención ofrece sus dos embudos (${embudos.join(", ")})`,
    );
    exigir((await pagina.$$("[data-radix-popper-content-wrapper] [data-etapa]")).length === 0, "sin embudo elegido no salen etapas");

    // 3. Embudo → etapa → la lista.
    await pagina.click('[data-radix-popper-content-wrapper] [data-embudo-opcion]:has-text("Embudo de ventas")');
    await pagina.waitForTimeout(400);
    const etapas = await textos(pagina, "[data-etapa]");
    exigir(etapas.includes("Cotizado") && etapas[0] === "Nuevo", `salen las etapas del embudo (${etapas.join(", ")})`);
    await pagina.click('[data-radix-popper-content-wrapper] [data-etapa]:has-text("Cotizado")');
    await exigirPanelCerrado(pagina, "la etapa");
    const enCotizado = await nombresDeLaLista(pagina);
    exigir(JSON.stringify(enCotizado) === JSON.stringify(["Beto Atencion"]), `en «Cotizado» sale solo Beto (${enCotizado.join(", ")})`);

    await abrirPanel(pagina);
    await desplegar(pagina, "embudos");
    await pagina.click('[data-radix-popper-content-wrapper] [data-etapa]:has-text("Nuevo")');
    await exigirPanelCerrado(pagina, "la etapa");
    const enNuevo = await nombresDeLaLista(pagina);
    exigir(JSON.stringify(enNuevo) === JSON.stringify(["Ana Atencion"]), `en «Nuevo» sale solo Ana (${enNuevo.join(", ")})`);

    await abrirPanel(pagina);
    await desplegar(pagina, "embudos");
    await pagina.click('[data-radix-popper-content-wrapper] [data-etapa]:has-text("Nuevo")');
    await exigirPanelCerrado(pagina, "la etapa");
    exigir((await nombresDeLaLista(pagina)).length === 5, "pulsar la etapa otra vez la quita: vuelven todas");

    // Etiqueta, con el mismo comportamiento.
    await abrirPanel(pagina);
    await desplegar(pagina, "etiquetas");
    await pagina.click('[data-radix-popper-content-wrapper] [data-tag]:has-text("Reclamo")');
    await exigirPanelCerrado(pagina, "la etiqueta");
    const conReclamo = await nombresDeLaLista(pagina);
    exigir(JSON.stringify(conReclamo) === JSON.stringify(["Beto Atencion"]), `la etiqueta «Reclamo» filtra a Beto (${conReclamo.join(", ")})`);

    // 4. Cambiar a Ventas limpia lo elegido; un solo embudo → etapas directas.
    await abrirPanel(pagina);
    await pagina.click("[data-radix-popper-content-wrapper] [data-cambiar-cuenta]");
    await pagina.waitForTimeout(300);
    await pagina.click(`[data-radix-popper-content-wrapper] [data-cuenta="${CUENTAS.ventas}"]`);
    await pagina.waitForTimeout(500);
    await desplegar(pagina, "etiquetas");
    const deVentas = await textos(pagina, "[data-tag]");
    exigir(JSON.stringify(deVentas) === JSON.stringify(["Interesado"]), `Ventas ofrece solo su «Interesado» (${deVentas.join(", ")})`);
    await desplegar(pagina, "embudos");
    exigir((await pagina.$$("[data-radix-popper-content-wrapper] [data-embudo-opcion]")).length === 0, "con un solo embudo no hay que elegirlo");
    exigir((await pagina.$$("[data-radix-popper-content-wrapper] [data-etapa]")).length >= 3, "y salen sus etapas directamente");
    await cerrarPanel(pagina);
    exigir((await nombresDeLaLista(pagina)).length === 5, "cambiar de cuenta suelta la etiqueta de la otra");

    // Ventas, etiqueta Interesado → solo Vera (no Ana, que tiene la de Atención).
    await abrirPanel(pagina);
    await desplegar(pagina, "etiquetas");
    await pagina.click('[data-radix-popper-content-wrapper] [data-tag]:has-text("Interesado")');
    await exigirPanelCerrado(pagina, "la etiqueta");
    const interesados = await nombresDeLaLista(pagina);
    exigir(JSON.stringify(interesados) === JSON.stringify(["Vera Ventas"]), `«Interesado» de Ventas no trae el de Atención (${interesados.join(", ")})`);
} finally {
    await navegador.close();
}

if (fallos.length) {
    console.error("\nMAL:\n - " + fallos.join("\n - "));
    process.exit(1);
}
console.log("\nel panel de filtros: bien");
