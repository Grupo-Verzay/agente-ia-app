// La sala de la videollamada con pantalla compartida: sin la etiqueta de la
// ruta («Verzy te está mostrando…»), la pantalla de Verzy llena todo su hueco
// sin franjas negras, y la miniatura de Verzy va en la MISMA barra de abajo que
// los botones, alineada con ellos. Se monta la sala real en Chromium con un
// Daily de mentira y una pantalla servida como imagen, y se hacen capturas.
// `MODO=roto` monta la sala de un commit pinchado y afirma la etiqueta y las franjas.
// Lo corre `scripts/banco-barra-de-la-videollamada.sh`.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("playwright")); } catch { try { ({ chromium } = require("@playwright/test")); } catch { chromium = null; } }
const MODO = process.env.MODO ?? "bueno";
const RAIZ = process.env.RAIZ_DE_LA_SALA ?? ".";
const CAPTURAS = process.env.CAPTURAS ?? mkdtempSync(join(tmpdir(), "barra-capturas-"));
mkdirSync(CAPTURAS, { recursive: true });
const aqui = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "barra-"));

let paquete = "";
let css = "";
if (chromium) {
  execSync(
    `npx esbuild ${aqui}/lib/__tests__/sala-de-videollamada/arnes.jsx --bundle --format=iife --jsx=automatic ` +
      `--tsconfig=${RAIZ}/tsconfig.json --alias:@=${RAIZ} ` +
      `--alias:@daily-co/daily-js=${aqui}/lib/__tests__/sala-de-videollamada/daily-de-mentira.js ` +
      `--define:process.env.NODE_ENV='"production"' --outfile=${dir}/arnes.js --log-level=error`,
    { stdio: "inherit", env: { ...process.env, NODE_PATH: `${aqui}/node_modules` } },
  );
  paquete = readFileSync(`${dir}/arnes.js`, "utf8");
  execSync(`printf '@tailwind base;\\n@tailwind components;\\n@tailwind utilities;\\n' > ${dir}/in.css`);
  execSync(`npx tailwindcss -c ${aqui}/tailwind.config.ts -i ${dir}/in.css --content "${RAIZ}/components/videollamada/**/*.tsx" -o ${dir}/sala.css`, { stdio: "ignore" });
  css = readFileSync(`${dir}/sala.css`, "utf8");
}

// La «pantalla» de la plataforma: una imagen clara de 1280x800, para que una
// franja negra a cualquier lado se vea en los píxeles.
const PANTALLA = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#f1f5f9"/><rect width="1280" height="56" fill="#ffffff"/><rect y="56" width="360" height="744" fill="#e2e8f0"/><text x="24" y="36" font-size="22" font-family="sans-serif" fill="#0f172a">Chats</text><rect x="380" y="80" width="860" height="680" rx="12" fill="#ffffff"/></svg>`;

async function abrir(navegador, ancho, alto) {
  const p = await navegador.newPage({ viewport: { width: ancho, height: alto } });
  await p.route("http://sala.test/**", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="raiz"></div><script src="/arnes.js"></script></body></html>` }));
  await p.route("http://sala.test/arnes.js", (r) => r.fulfill({ contentType: "text/javascript", body: paquete }));
  await p.goto("http://sala.test/?reentrada=1");
  await p.waitForFunction(() => window.listo === true);
  // La imagen de la pantalla se pide con <img>, no con fetch: va por la red de la página.
  await p.route("http://sala.test/api/videollamada/pantalla?stream=1**", (r) => r.fulfill({ contentType: "image/svg+xml", body: PANTALLA }));
  await p.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 36;
    const g = c.getContext("2d"); g.fillStyle = "red"; g.fillRect(0, 0, 64, 36);
    const pista = c.captureStream(5).getVideoTracks()[0];
    window.__daily.remotos.av = { session_id: "av", user_name: "tavus-replica", tracks: { video: { state: "playable", persistentTrack: pista } } };
    window.__daily.disparar("participant-updated", { participant: window.__daily.remotos.av });
  });
  await p.waitForFunction(() => document.querySelector("[data-mando]"));
  await p.evaluate(() => window.__daily.disparar("app-message", { data: { message_type: "conversation", event_type: "conversation.tool_call", properties: { name: "mostrar_pantalla", arguments: JSON.stringify({ ruta: "/chats" }) } } }));
  await p.waitForFunction(() => {
    const img = document.querySelector('[data-zona="video-de-la-pantalla"]');
    return img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 8_000 });
  // Se mueve el cursor para que los mandos estén a la vista.
  await p.mouse.move(ancho / 2, alto / 2);
  await p.mouse.move(ancho / 2 + 5, alto - 30);
  await p.waitForTimeout(400);
  return p;
}

const medir = (p) => p.evaluate(() => {
  const r = (e) => e?.getBoundingClientRect();
  const sala = r(document.querySelector('[data-zona="sala"]')) ?? { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
  const img = r(document.querySelector('[data-zona="video-de-la-pantalla"]'));
  const mandos = r(document.querySelector('[data-zona="mandos"]'));
  const mini = r(document.querySelector('[data-zona="avatar"]'));
  const botones = [...document.querySelectorAll('[data-zona="mandos"] [data-mando]')].map(r);
  const fit = getComputedStyle(document.querySelector('[data-zona="video-de-la-pantalla"]')).objectFit;
  const centro = (b) => (b.top + b.bottom) / 2;
  return {
    etiqueta: /te est[aá] mostrando/i.test(document.body.innerText),
    img: img && { top: img.top - sala.top, bottom: sala.bottom - img.bottom, left: img.left - sala.left, right: sala.right - img.right },
    fit,
    mini: mini && mandos && {
      dentroDeLaBarra: mini.top >= mandos.top - 0.5 && mini.bottom <= mandos.bottom + 0.5,
      desfase: botones.length ? centro(mini) - centro(botones[0]) : NaN,
      tapa: botones.filter((b) => b.right > mini.left && b.left < mini.right && b.bottom > mini.top && b.top < mini.bottom).length,
      chica: mini.width < 160,
    },
    botones: botones.length,
  };
});

// Cuánto de la sala es negro en los bordes: se mira la captura por franjas.
const franjasNegras = (p) => p.evaluate(async () => {
  const img = document.querySelector('[data-zona="video-de-la-pantalla"]');
  const r = img.getBoundingClientRect();
  const c = document.createElement("canvas"); c.width = Math.round(r.width); c.height = Math.round(r.height);
  const g = c.getContext("2d");
  // Dibuja la imagen tal como la pinta object-fit, con su recorte.
  const fit = getComputedStyle(img).objectFit;
  const nw = img.naturalWidth, nh = img.naturalHeight;
  const esc = fit === "cover" ? Math.max(c.width / nw, c.height / nh) : Math.min(c.width / nw, c.height / nh);
  const w = nw * esc, h = nh * esc;
  const x = (c.width - w) / 2;
  const y = fit === "cover" ? 0 : (c.height - h) / 2;
  g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, x, y, w, h);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const negro = (px, py) => { const i = (py * c.width + px) * 4; return d[i] + d[i + 1] + d[i + 2] < 30; };
  return { arriba: negro(Math.floor(c.width / 2), 1), abajo: negro(Math.floor(c.width / 2), c.height - 2), izquierda: negro(1, Math.floor(c.height / 2)), derecha: negro(c.width - 2, Math.floor(c.height / 2)) };
});

const ANCHOS = [[1440, 900], [1024, 768], [390, 844]];

test("con pantalla compartida: sin etiqueta, sin franjas y la miniatura en la barra", { skip: MODO !== "bueno" || !chromium }, async (t) => {
  const navegador = await chromium.launch(); t.after(() => navegador.close());
  for (const [ancho, alto] of ANCHOS) {
    const p = await abrir(navegador, ancho, alto);
    await p.screenshot({ path: `${CAPTURAS}/sala-${ancho}.png` });
    const m = await medir(p);
    assert.equal(m.etiqueta, false, `${ancho}: no se lee la ruta`);
    assert.equal(m.fit, "cover", `${ancho}: la pantalla llena su hueco`);
    for (const lado of ["top", "bottom", "left", "right"]) assert.ok(Math.abs(m.img[lado]) <= 1, `${ancho}: la pantalla llega al borde ${lado} (${m.img[lado]})`);
    const f = await franjasNegras(p);
    assert.deepEqual(f, { arriba: false, abajo: false, izquierda: false, derecha: false }, `${ancho}: ninguna franja negra`);
    assert.ok(m.botones >= 3, `${ancho}: los botones están`);
    assert.ok(m.mini.dentroDeLaBarra, `${ancho}: la miniatura va en la barra de abajo`);
    assert.ok(Math.abs(m.mini.desfase) <= 1, `${ancho}: alineada con los botones (${m.mini.desfase})`);
    assert.equal(m.mini.tapa, 0, `${ancho}: no tapa ningún botón`);
    assert.ok(m.mini.chica, `${ancho}: es una caja pequeña`);
    await p.close();
  }
});

test("ANTES: la ruta se leía arriba y dejaba una franja", { skip: !MODO.startsWith("roto") || !chromium }, async (t) => {
  const navegador = await chromium.launch(); t.after(() => navegador.close());
  const p = await abrir(navegador, 1440, 900);
  await p.screenshot({ path: `${CAPTURAS}/antes-1440.png` });
  const m = await medir(p);
  assert.equal(m.etiqueta, true, "se leía «te está mostrando»");
  assert.ok(m.img.top > 1 || m.fit !== "cover", "la pantalla no llegaba arriba o no llenaba su caja");
});
