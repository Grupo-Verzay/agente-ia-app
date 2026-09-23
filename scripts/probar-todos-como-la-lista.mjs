/**
 * «Todos» = lo que enseña la lista, en Chromium y sobre la página SERVIDA,
 * con el historial importado de `sembrar-todos-importado.mjs`.
 *
 * Se comprueba, con las dos lineas y con cada una elegida en el menu:
 *  1. La pastilla «Todos» dice lo mismo que las filas que se ven.
 *  2. «Seleccionar todas» marca exactamente ese numero.
 *  3. En el menu de canales, cada linea tiene su numero (ninguna sin el), la
 *     fila «Todos» es su suma, y elegir una linea deja la pastilla y las filas
 *     en el numero que prometia.
 *
 * `MODO=roto` exige que FALLE (se corre con un `.next` del commit de antes).
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3933";
const ROTO = process.env.MODO === "roto";
const fallos = [];
const exigir = (bien, que) => {
  if (!bien) fallos.push(que);
  console.log(`${bien ? "ok  " : "FALLO"} ${que}`);
};

async function entrar(contexto) {
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(2500);
  await pagina.fill('input[name="email"]', "jefe@banco.test");
  await pagina.fill('input[name="password"]', "banco1234");
  await pagina.click('button[type="submit"]');
  for (let i = 0; i < 120 && pagina.url().includes("/login"); i += 1) await pagina.waitForTimeout(500);
  if (pagina.url().includes("/login")) throw new Error("no se pudo entrar");
  return pagina;
}

async function leer(pagina) {
  return pagina.evaluate(() => {
    const col = document.querySelector("[data-columna-de-chats]") ?? document;
    // La pastilla, no el desplegable de canales: ese tambien dice «Todos»
    // cuando no hay linea elegida, y lleva su flechita.
    const boton = [...col.querySelectorAll("button")].find(
      (b) =>
        !b.querySelector("svg.lucide-chevron-down") &&
        [...b.querySelectorAll("span")].some((s) => s.textContent?.trim() === "Todos"),
    );
    const insignia = boton && [...boton.querySelectorAll("span")].find((s) => /^\d+$/.test(s.textContent?.trim() ?? ""));
    // Por linea Y numero: el mismo contacto en dos lineas son dos filas.
    const filas = new Set(
      [...col.querySelectorAll("[data-chat-id]")].map(
        (f) => `${f.getAttribute("data-chat-instance") ?? ""}::${f.getAttribute("data-chat-id")}`,
      ),
    );
    return { todos: insignia ? Number(insignia.textContent.trim()) : 0, filas: filas.size, texto: boton?.textContent ?? null };
  });
}

async function estable(pagina) {
  let antes = await leer(pagina);
  for (let i = 0; i < 20; i++) {
    await pagina.waitForTimeout(500);
    const ahora = await leer(pagina);
    if (ahora.todos === antes.todos && ahora.filas === antes.filas && ahora.filas > 0) return ahora;
    antes = ahora;
  }
  return antes;
}

async function seleccionarTodas(pagina) {
  const avatar = pagina.locator("[data-chat-id] button").first();
  await avatar.click();
  await pagina.waitForTimeout(300);
  const todas = pagina.locator('button[title^="Seleccionar los"]').first();
  if (!(await todas.count())) return null;
  await todas.click();
  await pagina.waitForTimeout(300);
  const n = await pagina.locator('span[title$="seleccionados"], span[title$="seleccionado"]').first().textContent();
  await pagina.locator('button[title="Quitar selección"]').first().click();
  await pagina.waitForTimeout(300);
  return Number(n?.trim());
}

async function elMenu(pagina) {
  if (!(await pagina.locator('[role="menuitem"]').count())) {
    const disparador = pagina.locator("[data-columna-de-chats] button:has(svg.lucide-chevron-down)").first();
    await disparador.click();
    await pagina.waitForTimeout(400);
  }
  const items = await pagina.$$eval('[role="menuitem"]', (els) =>
    els.map((el) => {
      const textos = [...el.querySelectorAll("span")].map((s) => s.textContent?.trim() ?? "");
      const numero = textos.find((t) => /^\d+$/.test(t));
      return { nombre: textos.find((t) => t && !/^\d+$/.test(t)) ?? "", numero: numero === undefined ? null : Number(numero) };
    }),
  );
  return items;
}

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const pagina = await entrar(contexto);
await pagina.goto(`${BASE}/chats`, { waitUntil: "domcontentloaded" });
await pagina.waitForSelector("[data-chat-id]", { timeout: 60000 });
await pagina.waitForTimeout(4000);
// Algún diálogo de bienvenida puede abrirse al entrar y tapar la pantalla.
for (let i = 0; i < 4; i += 1) {
  if (!(await pagina.$('div[data-state="open"].fixed.inset-0'))) break;
  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(300);
}

const inicio = await estable(pagina);
exigir(inicio.todos === inicio.filas, `con todas las lineas, «Todos» = filas (todos ${inicio.todos}, filas ${inicio.filas}; pastilla «${inicio.texto}»)`);
const sel = await seleccionarTodas(pagina);
exigir(sel === inicio.filas, `«Seleccionar todas» marca las ${inicio.filas} filas (marco ${sel})`);

const menu = await elMenu(pagina);
const deTodos = menu.find((i) => i.nombre === "Todos");
const lineas = menu.filter((i) => i.nombre && i.nombre !== "Todos");
exigir(!!deTodos && deTodos.numero === inicio.filas, `en el menu, «Todos» dice ${inicio.filas} (dice ${deTodos?.numero})`);
exigir(lineas.length >= 2 && lineas.every((l) => l.numero !== null), `cada linea del menu tiene numero (${JSON.stringify(lineas)})`);
const suma = lineas.reduce((a, l) => a + (l.numero ?? 0), 0);
exigir(suma === deTodos?.numero, `la suma de las lineas (${suma}) es la de «Todos» (${deTodos?.numero})`);
await pagina.keyboard.press("Escape");

for (const linea of lineas) {
  await elMenu(pagina);
  // El menu se repinta mientras la lista se refresca: se pulsa desde dentro.
  await pagina.evaluate((nombre) => {
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
      [...el.querySelectorAll("span")].some((s) => s.textContent?.trim() === nombre),
    );
    item?.click();
  }, linea.nombre);
  await pagina.waitForTimeout(800);
  const vista = await estable(pagina);
  exigir(
    vista.filas === linea.numero && vista.todos === linea.numero,
    `eligiendo ${linea.nombre}: prometia ${linea.numero}, filas ${vista.filas}, «Todos» ${vista.todos}`,
  );
}

await navegador.close();
if (ROTO) {
  if (!fallos.length) { console.error("MODO=roto: se esperaba reproducir el fallo y todo pasó"); process.exit(1); }
  console.log(`MODO=roto: reproducido (${fallos.length} fallos)`);
  process.exit(0);
}
if (fallos.length) { console.error(`\n${fallos.length} fallo(s)`); process.exit(1); }
console.log("\ntodo bien");
