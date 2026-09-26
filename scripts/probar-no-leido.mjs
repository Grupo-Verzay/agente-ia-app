/**
 * El «sin leer» de la lista de Chats, en Chromium y sobre la página SERVIDA.
 *
 * Lo reportado: un contacto escribe y el chat **nace ya leído**, sin que nadie
 * lo haya abierto ni respondido, también con la IA apagada.
 *
 * Aquí no hay IA, ni aviso de tiempo real, ni contador del proveedor: la línea
 * es `waha`, así que la lista sale de nuestra base y `unreadCount` vale 0
 * siempre. Es el caso exacto de producción, y lo único que se hace es escribir
 * un mensaje entrante como lo escribe el webhook.
 *
 * El camino entero, en orden:
 *
 *  1. Al entrar, la bandeja que YA ESTABA no se pone en rojo. Cuatro
 *     conversaciones con el último mensaje del contacto y ninguna sin leer:
 *     eso lo hace el corte, y es lo que evita abrir con miles en rojo el día
 *     del despliegue.
 *  2. Llega un mensaje a una de ellas → esa, y solo esa, sale SIN LEER.
 *  3. Recargando sigue sin leer: no se limpia sola ni con la vuelta del reloj.
 *  4. Se ABRE el chat → se limpia, y la pastilla baja.
 *  5. Recargando sigue leída: la marca es de este navegador y persiste.
 *  6. Con el chat DELANTE llega otro mensaje → no se pone en rojo, y al
 *     cambiarse a otra conversación SIGUE leído. Abrir guarda el mensaje que la
 *     fila tenía en ese momento, así que sin avanzar la marca el chat que se
 *     acaba de leer volvería a salir sin leer al salir de él.
 *  7. Llega OTRO mensaje al mismo chat, ya cerrado → vuelve a salir sin leer.
 *     Abrirlo una vez no lo deja leído para siempre.
 *  8. Escribe un contacto que NO estaba en la bandeja → nace sin leer. Es el
 *     caso que el mecanismo de antes descartaba a propósito («un chat que
 *     aparece por PRIMERA vez NO debe notificar»), así que un contacto nuevo
 *     nacía leído SIEMPRE — literalmente lo reportado.
 *
 * Hace falta: `BASE`, `USUARIO`, `CLAVE`. `MODO=roto` exige que FALLE (se corre
 * con un `.next` del commit de antes).
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3933";
const USUARIO = process.env.USUARIO ?? "jefe@banco.test";
const CLAVE = process.env.CLAVE ?? "banco1234";
const LINEA = process.env.CHAT_LINEA ?? "BANCO_VENTAS";
/** La conversación a la que le llega el mensaje nuevo. */
const JID = process.env.CHAT_JID ?? "573001112255@s.whatsapp.net";
/** Su nombre en la fila: es lo que identifica al botón que abre el chat. */
const NOMBRE = process.env.CHAT_NOMBRE ?? "Camilo Cliente";
/** Otra conversación de la misma línea, para cambiarse a ella. */
const OTRO = "573001112244@s.whatsapp.net";
const OTRO_NOMBRE = "Beatriz Cliente";
const ROTO = process.env.MODO === "roto";
const PLAZO_MS = 12000;

const fallos = [];
const exigir = (bien, que) => {
  if (!bien) fallos.push(que);
  console.log(`${bien ? "ok  " : "FALLO"} ${que}`);
};

/** Escribe un mensaje entrante en la base, como el webhook. */
function llegaUnMensaje(jid, texto, nombre) {
  const salida = execFileSync(process.execPath, ["scripts/llega-un-mensaje.mjs"], {
    env: { ...process.env, JID: jid, TEXTO: texto, ...(nombre ? { NOMBRE: nombre } : {}) },
    encoding: "utf8",
  });
  return JSON.parse(salida.trim().split("\n").pop());
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

/**
 * Qué filas están sin leer, leído de las TRES formas que hay.
 *
 * `punto` es el punto azul de la fila y `pastilla` el número de «Sin leer»: los
 * dos existen también en el «antes», y son lo que hace que `MODO=roto` ejerza
 * algo. `marca` es el `data-sin-leer` de ahora, que no existía; si se midiera
 * SOLO con él, el modo roto diría «cero sin leer» por no encontrar el atributo
 * —lo mismo que diría el arreglo funcionando—, y no probaría nada.
 *
 * Se comprueba además que la marca y el punto dicen lo mismo: son el dato y su
 * dibujo, y separados uno de los dos miente.
 */
async function leer(pagina) {
  return pagina.evaluate(() => {
    const col = document.querySelector("[data-columna-de-chats]") ?? document;
    const filas = [...col.querySelectorAll("[data-chat-id]")];
    const boton = [...col.querySelectorAll("button")].find((b) =>
      [...b.querySelectorAll("span")].some((s) => s.textContent?.trim() === "Sin leer"),
    );
    const insignia = boton
      ? [...boton.querySelectorAll("span")].find((s) => /^\d+$/.test(s.textContent?.trim() ?? ""))
      : null;
    const jid = (f) => f.getAttribute("data-chat-id");
    return {
      filas: filas.length,
      // El texto de cada fila: es lo que dice si el mensaje LLEGÓ a la lista.
      // Sin comprobarlo, un caso que espera «no se pone en rojo» pasa también
      // cuando el mensaje todavía no ha llegado, o sea sin ejercer nada.
      textos: Object.fromEntries(filas.map((f) => [jid(f), (f.textContent ?? "").trim()])),
      punto: filas
        .filter((f) => f.querySelector("span.inline-block.h-2.w-2.rounded-full.bg-primary"))
        .map(jid),
      marca: filas.filter((f) => f.getAttribute("data-sin-leer") === "1").map(jid),
      hayMarca: filas.some((f) => f.hasAttribute("data-sin-leer")),
      pastilla: insignia ? Number(insignia.textContent.trim()) : 0,
      hayPastilla: !!boton,
    };
  });
}

/** Espera a que la bandeja diga exactamente estos jids sin leer. */
async function esperarSinLeer(pagina, esperado) {
  const hasta = Date.now() + PLAZO_MS;
  let ultimo = await leer(pagina);
  const igual = (v) =>
    v.punto.length === esperado.length && esperado.every((j) => v.punto.includes(j));
  while (Date.now() < hasta) {
    if (ultimo.filas > 0 && igual(ultimo)) return ultimo;
    await pagina.waitForTimeout(400);
    ultimo = await leer(pagina);
  }
  return ultimo;
}

/** Espera hasta que la bandeja cumpla la condición, con su propio plazo. */
async function esperarMas(pagina, plazoMs, cumple) {
  const hasta = Date.now() + plazoMs;
  let ultimo = await leer(pagina);
  while (Date.now() < hasta) {
    if (ultimo.filas > 0 && cumple(ultimo)) return ultimo;
    await pagina.waitForTimeout(500);
    ultimo = await leer(pagina);
  }
  return ultimo;
}

/** El dato y su dibujo tienen que decir lo mismo. */
function marcaYPuntoCuadran(v) {
  if (!v.hayMarca) return true; // el «antes» no tenía la marca
  return v.marca.length === v.punto.length && v.marca.every((j) => v.punto.includes(j));
}

/**
 * La «Guía rápida» del copiloto se abre sola la primera vez y su velo se come
 * los clics de la lista entera. Sin apartarla, el clic sobre la fila se queda
 * esperando y el banco se cae por algo que no tiene nada que ver.
 */
async function apartarLoQueTapa(pagina) {
  for (let i = 0; i < 8; i += 1) {
    const capa = await pagina.$('div[data-state="open"].fixed.inset-0');
    if (!capa) return;
    const cerrar = pagina.locator('[role="dialog"] button:has-text("Close")').first();
    if (await cerrar.count()) await cerrar.click({ force: true }).catch(() => {});
    else await pagina.keyboard.press("Escape");
    await pagina.waitForTimeout(400);
  }
  if (await pagina.$('div[data-state="open"].fixed.inset-0')) {
    throw new Error("hay un diálogo tapando la lista y no se deja cerrar");
  }
}

async function irALaBandeja(pagina) {
  await pagina.goto(`${BASE}/chats`, { waitUntil: "domcontentloaded" });
  await pagina.locator("[data-chat-id]").first().waitFor({ timeout: 60000 });
  // Las sesiones llegan después que la lista, y el corte se siembra con la
  // primera vuelta que trae chats: sin este respiro se mediría a medio camino.
  await pagina.waitForTimeout(4000);
  await apartarLoQueTapa(pagina);
}

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const pagina = await entrar(contexto);

// ── 1. Lo que YA ESTABA no se pone en rojo ──────────────────────────────────
await irALaBandeja(pagina);
const inicio = await leer(pagina);
exigir(inicio.filas === 4, `la bandeja trae sus 4 conversaciones (trae ${inicio.filas})`);
exigir(
  inicio.punto.length === 0,
  `al entrar, lo que ya estaba NO sale sin leer (salen ${inicio.punto.length})`,
);
exigir(marcaYPuntoCuadran(inicio), "el punto de la fila y su marca dicen lo mismo");

// ── 2. Llega un mensaje: ese, y solo ese ────────────────────────────────────
llegaUnMensaje(JID, "Oye, sigo esperando");
await irALaBandeja(pagina);
const tras = await esperarSinLeer(pagina, [JID]);
exigir(
  tras.punto.length === 1 && tras.punto[0] === JID,
  `un mensaje entrante deja el chat SIN LEER (sin leer: ${JSON.stringify(tras.punto)})`,
);
exigir(marcaYPuntoCuadran(tras), "el punto y la marca siguen cuadrando");
exigir(tras.pastilla === 1, `la pastilla «Sin leer» dice 1 (dice ${tras.pastilla})`);

// ── 3. No se limpia sola ────────────────────────────────────────────────────
await irALaBandeja(pagina);
const tras2 = await esperarSinLeer(pagina, [JID]);
exigir(
  tras2.punto.length === 1 && tras2.punto[0] === JID,
  `recargando sigue sin leer (sin leer: ${JSON.stringify(tras2.punto)})`,
);

// ── 4. Se limpia al ABRIRLO ─────────────────────────────────────────────────
//
// Se pulsa el botón que lleva el NOMBRE, que es el que abre la conversación.
// El primer `button` de la fila es el avatar —y el último, el menú—: un
// `[data-chat-id] button` a secas se queda con el avatar y no abre nada, así
// que el banco habría dicho «no se limpia» sin haber abierto el chat.
await apartarLoQueTapa(pagina);
await pagina
  .locator(`[data-chat-id="${JID}"] button`, { hasText: NOMBRE })
  .first()
  .click();
await pagina.waitForTimeout(3000);
const abierto = await esperarSinLeer(pagina, []);
exigir(
  abierto.punto.length === 0,
  `abrir el chat lo limpia (siguen sin leer: ${JSON.stringify(abierto.punto)})`,
);
exigir(abierto.pastilla === 0, `la pastilla vuelve a 0 (dice ${abierto.pastilla})`);

// ── 5. Y sigue leído al recargar ────────────────────────────────────────────
await irALaBandeja(pagina);
const tras3 = await esperarSinLeer(pagina, []);
exigir(
  tras3.punto.length === 0,
  `recargando sigue leído (sin leer: ${JSON.stringify(tras3.punto)})`,
);

// ── 6. Con el chat delante, la marca AVANZA ─────────────────────────────────
await apartarLoQueTapa(pagina);
await pagina.locator(`[data-chat-id="${JID}"] button`, { hasText: NOMBRE }).first().click();
await pagina.waitForTimeout(2000);
const DELANTE = "Una cosa mas";
llegaUnMensaje(JID, DELANTE);
// Sin recargar: lo trae el reloj de la lista, que va a 20 s. Se espera a que el
// TEXTO llegue a la fila, no a que el punto no esté: «no está en rojo» se
// cumple también mientras el mensaje no ha llegado, y el caso no ejercería nada.
const conElChatDelante = await esperarMas(pagina, 60000, (v) =>
  (v.textos[JID] ?? "").includes(DELANTE),
);
exigir(
  (conElChatDelante.textos[JID] ?? "").includes(DELANTE),
  "el mensaje llega a la fila con el chat delante (si no, lo de abajo no prueba nada)",
);
exigir(
  !conElChatDelante.punto.includes(JID),
  `con el chat delante no se pone en rojo (sin leer: ${JSON.stringify(conElChatDelante.punto)})`,
);
// Y al irse a otra conversación sigue leído: es lo que hace el avance de la
// marca. Sin él, el chat que se acaba de leer volvería a salir sin leer.
await pagina.locator(`[data-chat-id="${OTRO}"] button`, { hasText: OTRO_NOMBRE }).first().click();
await pagina.waitForTimeout(2500);
const trasCambiar = await leer(pagina);
exigir(
  !trasCambiar.punto.includes(JID),
  `al cambiarse de conversación el anterior sigue leído (sin leer: ${JSON.stringify(trasCambiar.punto)})`,
);

// ── 7. El siguiente mensaje vuelve a ponerlo sin leer ───────────────────────
const OTRA_VEZ = "Hola? alguien ahi?";
llegaUnMensaje(JID, OTRA_VEZ);
await irALaBandeja(pagina);
// Se espera al TEXTO y no al punto: el punto podría venir de la vuelta
// anterior, y entonces este caso no probaría nada.
const tras4 = await esperarMas(pagina, 30000, (v) =>
  (v.textos[JID] ?? "").includes(OTRA_VEZ),
);
exigir(
  (tras4.textos[JID] ?? "").includes(OTRA_VEZ),
  "el mensaje llega a la fila (si no, lo de abajo no prueba nada)",
);
exigir(
  tras4.punto.length === 1 && tras4.punto[0] === JID,
  `el mensaje siguiente vuelve a dejarlo sin leer (sin leer: ${JSON.stringify(tras4.punto)})`,
);

// ── 8. Un contacto NUEVO nace sin leer ──────────────────────────────────────
//
// Antes no: el hook de avisos descartaba a propósito los chats que aparecen por
// primera vez —para no soltar cientos de avisos al abrir la App—, así que el
// contacto nuevo, que es el que más importa, nacía leído siempre.
const NUEVO = "573009998877@s.whatsapp.net";
llegaUnMensaje(NUEVO, "Buenas, me interesa", "Elena Nueva");
await irALaBandeja(pagina);
const conNuevo = await esperarSinLeer(pagina, [JID, NUEVO]);
exigir(
  conNuevo.punto.includes(NUEVO),
  `un contacto que escribe por PRIMERA vez nace sin leer (sin leer: ${JSON.stringify(conNuevo.punto)})`,
);
// Y son exactamente esos dos: la bandeja no se pone en rojo de más.
exigir(
  conNuevo.punto.length === 2 && conNuevo.punto.includes(JID),
  `y son exactamente los dos que escribieron (sin leer: ${JSON.stringify(conNuevo.punto)})`,
);
// Con sin-leer de verdad, el filtro «Sin leer» se enciende solo al entrar y la
// lista se queda con ellos. Antes no se encendía nunca, porque nunca había
// ninguno que contar.
exigir(
  conNuevo.filas === 2,
  `el filtro «Sin leer» se enciende solo y deja los 2 (filas ${conNuevo.filas})`,
);

await navegador.close();

if (ROTO) {
  if (fallos.length === 0) {
    console.error("MODO=roto: se esperaba reproducir el fallo y todo pasó");
    process.exit(1);
  }
  console.log(`MODO=roto: reproducido (${fallos.length} fallos)`);
  process.exit(0);
}
if (fallos.length) {
  console.error(`\n${fallos.length} fallo(s)`);
  process.exit(1);
}
console.log("\ntodo bien");
