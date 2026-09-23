/**
 * El chat de equipo en Chromium, sobre la página SERVIDA: el orden de los
 * directos y el diálogo de limpiar el historial.
 *
 * Lo que esto contesta y el banco de acciones no: que el asa ARRASTRA de
 * verdad (dnd-kit con su sensor, dentro del desplegable de canales), que el
 * orden vuelve al recargar y que es de cada persona, y que el «⋯» y su diálogo
 * solo existen para el súper administrador, con el botón apagado hasta teclear
 * la palabra.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3941";
const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
    console.log(`${bien ? "ok  " : "MAL "} ${que}`);
};

async function entrar(navegador, email) {
    const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
    const pagina = await contexto.newPage();
    // Con reintento: rellenar antes de que React hidrate el formulario deja
    // los campos a medias y el servidor contesta «Usuario no existe».
    for (let intento = 1; intento <= 3; intento += 1) {
        await pagina.goto(`${BASE}/login`, { waitUntil: "networkidle" });
        await pagina.fill('input[name="email"]', email);
        await pagina.fill('input[name="password"]', "banco1234");
        await pagina.click('button[type="submit"]');
        try {
            await pagina.waitForURL((u) => !String(u).includes("/login"), { timeout: 20000 });
            return pagina;
        } catch {
            console.log(`  (reintento de login ${intento} para ${email})`);
        }
    }
    throw new Error(`no se pudo entrar como ${email}`);
}

/** La «Guía rápida» y demás capas que se abren solas al entrar: se apartan. */
async function apartarLoQueTapa(pagina) {
    await pagina.waitForTimeout(1500);
    for (let i = 0; i < 4; i += 1) {
        const capa = await pagina.$('div[data-state="open"].fixed.inset-0');
        if (!capa) break;
        await pagina.keyboard.press("Escape");
        await pagina.waitForTimeout(250);
    }
}

async function abrirLaLista(pagina) {
    await pagina.goto(`${BASE}/chat-equipo`, { waitUntil: "domcontentloaded" });
    await pagina.waitForSelector("textarea", { timeout: 60000 });
    await apartarLoQueTapa(pagina);
    await pagina.getByRole("button", { name: /Cambiar/ }).first().click();
    await pagina.waitForSelector('[data-lista="directos"]', { timeout: 20000 });
}

const elOrden = (pagina) =>
    pagina.$$eval('[data-lista="directos"] [data-directo]', (xs) =>
        xs.map((x) => x.textContent?.trim() ?? ""),
    );

const navegador = await chromium.launch();
try {
    /* ── Beto arrastra ── */
    const beto = await entrar(navegador, "beto@banco.test");
    await abrirLaLista(beto);
    const antes = await elOrden(beto);
    console.log("antes:", antes);
    exigir(antes.length >= 3, "la lista de Beto ofrece al menos tres personas");

    const asas = await beto.$$('[data-lista="directos"] [data-asa="directo"]');
    const a = await asas[0].boundingBox();
    const c = await asas[asas.length - 1].boundingBox();
    await beto.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await beto.mouse.down();
    for (let i = 1; i <= 12; i += 1) {
        await beto.mouse.move(a.x + a.width / 2, a.y + (c.y - a.y + 6) * (i / 12) + a.height / 2);
        await beto.waitForTimeout(30);
    }
    await beto.mouse.up();
    await beto.waitForTimeout(1500);
    const despues = await elOrden(beto);
    console.log("después:", despues);
    exigir(despues[despues.length - 1] === antes[0], "arrastrar la primera al final la deja la última");

    await abrirLaLista(beto);
    const alVolver = await elOrden(beto);
    exigir(JSON.stringify(alVolver) === JSON.stringify(despues), "al recargar, el orden de Beto sigue ahí");

    // La fila sigue siendo un botón que abre el directo: el clic no se lo come el arrastre.
    await beto.locator('[data-lista="directos"] [data-directo] button:not([data-asa])').first().click();
    await beto.waitForTimeout(1500);
    // La barra de canales: el botón que dice «Cambiar» o «Cerrar», no el
    // primer `aria-expanded` de la página (ese es el menú de la cuenta).
    const cabecera = await beto
        .locator('button[aria-expanded]:has-text("Cambiar"), button[aria-expanded]:has-text("Cerrar")')
        .first()
        .innerText();
    exigir(cabecera.includes(alVolver[0]), `pulsar el nombre abre ese directo (cabecera: ${cabecera.split("\n")[0]})`);
    exigir(!(await beto.$('[data-boton="opciones-del-canal"]')), "un agente no ve el «⋯» de limpiar");

    /* ── Ana: su lista, sin tocar ── */
    const ana = await entrar(navegador, "ana@banco.test");
    await abrirLaLista(ana);
    const deAna = await elOrden(ana);
    console.log("Ana:", deAna);
    exigir(deAna.length >= 3, "Ana ve su lista");
    exigir(!(await ana.$('[data-boton="opciones-del-canal"]')), "una administradora no ve el «⋯» de limpiar");

    /* ── La casa limpia el General ── */
    const casa = await entrar(navegador, "casa@banco.test");
    await casa.goto(`${BASE}/chat-equipo`, { waitUntil: "domcontentloaded" });
    await casa.waitForSelector("textarea", { timeout: 60000 });
    await apartarLoQueTapa(casa);
    const marca = `mensaje-para-limpiar-${Date.now()}`;
    await casa.fill("textarea", marca);
    await casa.keyboard.press("Enter");
    await casa.waitForFunction((t) => document.body.innerText.includes(t), marca, { timeout: 20000 });

    await casa.click('[data-boton="opciones-del-canal"]');
    await casa.click('[data-opcion="limpiar-historial"]');
    const dialogo = casa.locator('[data-dialogo="limpiar-historial"]');
    await dialogo.waitFor();
    const texto = await dialogo.innerText();
    exigir(/No se puede deshacer/.test(texto), "el diálogo dice que es irreversible");
    exigir(/todos sus miembros/.test(texto), "el diálogo dice que afecta a todos los miembros");
    const boton = casa.locator('[data-boton="confirmar-limpieza"]');
    exigir(await boton.isDisabled(), "sin la palabra, el botón está apagado");
    await casa.fill("#confirmar-limpieza", "LIMPIAR");
    exigir(!(await boton.isDisabled()), "con la palabra, se enciende");
    await boton.click();
    await casa.waitForFunction((t) => !document.body.innerText.includes(t), marca, { timeout: 20000 });
    exigir(!(await casa.textContent("body")).includes(marca), "el mensaje ya no está en el General");
    const sobra = await casa.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    exigir(sobra <= 0, "la página no desborda a lo ancho");
} finally {
    await navegador.close();
}

if (fallos.length) {
    console.error(`\n${fallos.length} fallo(s)`);
    process.exit(1);
}
console.log("\ntodo bien");
