/**
 * La nota interna en la VISTA PREVIA de la fila, en Chromium y sobre la página
 * SERVIDA (`scripts/banco-nota-en-la-vista-previa.sh`).
 *
 * Lo reportado: el asesor escribe una nota interna, es lo último que pasó en
 * el chat, y la fila de la lista enseña solo el candado —la vista previa sigue
 * diciendo el mensaje de antes—. Lo pedido: «🔒 texto de la nota» mientras sea
 * lo último, y en cuanto llega o sale un mensaje, la vista previa vuelve a ser
 * el mensaje y la nota queda solo en el candado de la fila de iconitos.
 *
 * El camino, en orden:
 *
 *  A. Al entrar, con las notas que ya estaban: la de Beatriz es posterior a su
 *     mensaje → «🔒 Llamar mañana a las 10»; la de Diana es ANTERIOR → la vista
 *     previa sigue siendo «Hola», y el candado está en las dos.
 *  B. Se abre Camilo, se escribe una nota desde la barra → su fila dice
 *     «🔒 Pedir factura» al momento (por el aviso de la fila, no por el reloj).
 *  C. Recargando sigue ahí: la lista la trae del servidor.
 *  D. Le llega un mensaje a Camilo → la vista previa vuelve a ser el mensaje y
 *     el candado se queda.
 *  E. Le llega un mensaje a Beatriz → lo mismo.
 *
 * `MODO=roto` (con un `.next` del commit de antes) exige que A, B y C FALLEN
 * —el candado sin texto— y que D y E, el candado y la vuelta al mensaje,
 * pasen igual: eso no se rompía.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3941";
const USUARIO = process.env.USUARIO ?? "jefe@banco.test";
const CLAVE = process.env.CLAVE ?? "banco1234";
const ROTO = process.env.MODO === "roto";

const BEATRIZ = "573001112244@s.whatsapp.net";
const CAMILO = "573001112255@s.whatsapp.net";
const DIANA = "573001112266@s.whatsapp.net";

const resultados = [];
/** `delArreglo`: lo que antes fallaba. Lo demás no se podía haber roto. */
const exigir = (bien, que, delArreglo = false) => {
  resultados.push({ bien, que, delArreglo });
  console.log(`${bien ? "ok  " : "FALLO"} ${delArreglo ? "[arreglo] " : ""}${que}`);
};

function llegaUnMensaje(jid, texto) {
  execFileSync(process.execPath, ["scripts/llega-un-mensaje.mjs"], {
    env: { ...process.env, JID: jid, TEXTO: texto },
    encoding: "utf8",
  });
}

async function entrar(contexto) {
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(2500);
  await pagina.fill('input[name="email"]', USUARIO);
  await pagina.fill('input[name="password"]', CLAVE);
  await pagina.click('button[type="submit"]');
  for (let i = 0; i < 120 && pagina.url().includes("/login"); i += 1) {
    await pagina.waitForTimeout(500);
  }
  if (pagina.url().includes("/login")) throw new Error("no se pudo entrar: sigue en /login");
  return pagina;
}

async function apartarLoQueTapa(pagina) {
  for (let i = 0; i < 8; i += 1) {
    const capa = await pagina.$('div[data-state="open"].fixed.inset-0');
    if (!capa) return;
    const cerrar = pagina.locator('[role="dialog"] button:has-text("Close")').first();
    if (await cerrar.count()) await cerrar.click({ force: true }).catch(() => {});
    else await pagina.keyboard.press("Escape");
    await pagina.waitForTimeout(400);
  }
}

async function irALaBandeja(pagina) {
  await pagina.goto(`${BASE}/chats`, { waitUntil: "domcontentloaded" });
  await pagina.locator("[data-chat-id]").first().waitFor({ timeout: 60000 });
  // Las notas y las sesiones llegan después que la lista.
  await pagina.waitForTimeout(5000);
  await apartarLoQueTapa(pagina);
}

/**
 * Lo que dice la fila: su vista previa (leída de la línea de debajo del
 * nombre, que existe también en el «antes»), la marca nueva si está, y si
 * lleva el candado de notas en la fila de iconitos.
 */
async function laFila(pagina, jid) {
  return pagina.evaluate((jid) => {
    const fila = document.querySelector(`[data-columna-de-chats] [data-chat-id="${jid}"]`);
    if (!fila) return null;
    const marca = fila.querySelector("[data-vista-previa]");
    const linea = fila.querySelector(".mt-0\\.5 > div");
    return {
      vista: (marca ?? linea)?.textContent?.trim() ?? "",
      esNota: marca ? marca.getAttribute("data-vista-previa") === "nota" : null,
      candado: !!fila.querySelector("span.border-amber-300.bg-amber-50 svg"),
    };
  }, jid);
}

async function esperarFila(pagina, jid, plazoMs, cumple) {
  const hasta = Date.now() + plazoMs;
  let f = await laFila(pagina, jid);
  while (Date.now() < hasta) {
    if (f && cumple(f)) return f;
    await pagina.waitForTimeout(500);
    f = await laFila(pagina, jid);
  }
  return f;
}

const esLaNota = (texto) => (f) => f.vista === `🔒 ${texto}` && f.esNota !== false;
const esElMensaje = (texto) => (f) => f.vista === texto && f.esNota !== true;

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const pagina = await entrar(contexto);

// ── A. Al entrar ────────────────────────────────────────────────────────────
await irALaBandeja(pagina);
const beatriz = await esperarFila(pagina, BEATRIZ, 8000, esLaNota("Llamar mañana a las 10"));
exigir(
  !!beatriz && esLaNota("Llamar mañana a las 10")(beatriz),
  `nota posterior al último mensaje → la vista previa es la nota (dice «${beatriz?.vista}»)`,
  true,
);
exigir(!!beatriz?.candado, "y el candado de la fila sigue puesto");
const diana = await laFila(pagina, DIANA);
exigir(
  !!diana && esElMensaje("Hola")(diana),
  `nota ANTERIOR al último mensaje → la vista previa sigue siendo el mensaje (dice «${diana?.vista}»)`,
);
exigir(!!diana?.candado, "y la nota se ve solo en el candado de la fila de iconitos");
const camilo0 = await laFila(pagina, CAMILO);
exigir(!!camilo0 && !camilo0.candado && camilo0.vista === "Hola", "una conversación sin notas no cambia");

// ── B. Se escribe una nota desde la conversación abierta ────────────────────
await pagina.locator(`[data-chat-id="${CAMILO}"] button`, { hasText: "Camilo Cliente" }).first().click();
// La de la conversación: en la página hay otras barras de escribir (el
// copiloto, el chat del equipo), y solo esta tiene el botón de nota interna.
const barra = pagina
  .locator('[data-barra="escribir"]')
  .filter({ has: pagina.locator('button[aria-label="Nota interna"]') })
  .first();
await barra.waitFor({ timeout: 30000 });
await pagina.waitForTimeout(1500);
await barra.locator('button[aria-label="Nota interna"]').first().click();
await barra.locator("textarea").first().fill("Pedir factura");
await barra.locator('button[title="Guardar nota interna"]').first().click();
const tras = await esperarFila(pagina, CAMILO, 10000, esLaNota("Pedir factura"));
exigir(
  !!tras && esLaNota("Pedir factura")(tras),
  `al guardar la nota, la fila dice «🔒 Pedir factura» al momento (dice «${tras?.vista}»)`,
  true,
);
exigir(!!tras?.candado, "con el candado puesto");

// ── C. Recargando, la trae el servidor ──────────────────────────────────────
await irALaBandeja(pagina);
const recarga = await esperarFila(pagina, CAMILO, 8000, esLaNota("Pedir factura"));
exigir(
  !!recarga && esLaNota("Pedir factura")(recarga),
  `recargando sigue siendo la nota (dice «${recarga?.vista}»)`,
  true,
);

// ── D. Llega un mensaje: vuelve a ser el mensaje ────────────────────────────
llegaUnMensaje(CAMILO, "Ya hice el pago");
const conMensaje = await esperarFila(pagina, CAMILO, 60000, esElMensaje("Ya hice el pago"));
exigir(
  !!conMensaje && esElMensaje("Ya hice el pago")(conMensaje),
  `un mensaje nuevo vuelve a ser la vista previa (dice «${conMensaje?.vista}»)`,
);
exigir(!!conMensaje?.candado, "y la nota queda solo en el candado");

// ── E. Lo mismo con la nota que ya estaba ───────────────────────────────────
llegaUnMensaje(BEATRIZ, "Confirmo la cita");
const beatriz2 = await esperarFila(pagina, BEATRIZ, 60000, esElMensaje("Confirmo la cita"));
exigir(
  !!beatriz2 && esElMensaje("Confirmo la cita")(beatriz2),
  `con la nota de antes, el mensaje nuevo también gana (dice «${beatriz2?.vista}»)`,
);
exigir(!!beatriz2?.candado, "y el candado se queda");

await navegador.close();

const delArregloFallan = resultados.filter((r) => r.delArreglo && !r.bien);
const otrosFallan = resultados.filter((r) => !r.delArreglo && !r.bien);
if (ROTO) {
  const delArreglo = resultados.filter((r) => r.delArreglo);
  if (delArregloFallan.length !== delArreglo.length || otrosFallan.length) {
    console.error(
      `\nMODO=roto: tenían que fallar los ${delArreglo.length} casos del arreglo (fallan ${delArregloFallan.length}) y nada más (fallan ${otrosFallan.length} de los otros).`,
    );
    process.exit(1);
  }
  console.log(`\nMODO=roto: reproduce el fallo (${delArregloFallan.length} casos), y lo demás pasa igual.`);
} else if (delArregloFallan.length || otrosFallan.length) {
  console.error(`\n${delArregloFallan.length + otrosFallan.length} fallos.`);
  process.exit(1);
} else {
  console.log(`\n${resultados.length} comprobaciones en verde.`);
}
