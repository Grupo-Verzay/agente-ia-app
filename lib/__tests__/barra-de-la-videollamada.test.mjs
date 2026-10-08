// La sala de la videollamada con pantalla compartida: sin la etiqueta de la
// ruta («Verzy te está mostrando…»), la pantalla de Verzy se ve ENTERA —de
// arriba abajo, sin que la barra de mandos tape su parte de abajo— y con su
// forma real (object-contain, nunca estirada), y la miniatura de Verzy va en la
// MISMA barra de abajo que los botones, alineada con ellos. Se monta la sala
// real en Chromium con un Daily de mentira y una pantalla servida como imagen,
// en móvil, tableta y escritorio, y se hacen capturas.
// `MODO=roto` monta la sala de un commit pinchado y afirma el corte de abajo.
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
  execSync(`npx tailwindcss -c ${aqui}/tailwind.config.ts -i ${dir}/in.css --content "${RAIZ}/components/videollamada/**/*.tsx,${RAIZ}/lib/disposicion-de-la-videollamada.ts" -o ${dir}/sala.css`, { stdio: "ignore" });
  css = readFileSync(`${dir}/sala.css`, "utf8");
}

// La «pantalla» de la plataforma: 1280x800, con una franja verde arriba (la
// barra de la App) y una magenta abajo (la barra de escribir con sus emojis):
// si cualquiera de las dos no se ve, la pantalla está cortada.
const PANTALLA = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#f1f5f9"/><rect width="1280" height="40" fill="#00c853"/><rect y="40" width="360" height="720" fill="#e2e8f0"/><text x="24" y="28" font-size="22" font-family="sans-serif" fill="#0f172a">Chats</text><rect x="380" y="60" width="860" height="680" rx="12" fill="#ffffff"/><rect y="760" width="1280" height="40" fill="#ff00ff"/></svg>`;

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
  await p.waitForSelector('[data-zona="mandos"][data-ocultos="no"]', { timeout: 5_000 });
  // La caja de la pantalla baja o sube con una transición de 300 ms.
  await p.waitForTimeout(450);
  return p;
}

const medir = (p) => p.evaluate(() => {
  const r = (e) => e?.getBoundingClientRect();
  const sala = r(document.querySelector('[data-zona="sala"]')) ?? { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
  const img = r(document.querySelector('[data-zona="video-de-la-pantalla"]'));
  const mandos = r(document.querySelector('[data-zona="mandos"]'));
  const mini = r(document.querySelector('[data-zona="avatar"]'));
  const botones = [...document.querySelectorAll('[data-zona="mandos"] [data-mando]')].map(r);
  const el = document.querySelector('[data-zona="video-de-la-pantalla"]');
  const fit = getComputedStyle(el).objectFit;
  const centro = (b) => (b.top + b.bottom) / 2;
  // Dónde queda de verdad el contenido dentro de su caja, según object-fit.
  const nw = el.naturalWidth, nh = el.naturalHeight;
  const esc = fit === "cover" ? Math.max(img.width / nw, img.height / nh) : fit === "fill" ? NaN : Math.min(img.width / nw, img.height / nh);
  const cw = nw * esc, ch = nh * esc;
  const pos = getComputedStyle(el).objectPosition.split(" ");
  const fy = pos[1] === "0%" || pos[1] === "top" ? 0 : 0.5;
  const contenido = { top: img.top + (img.height - ch) * fy, left: img.left + (img.width - cw) / 2, width: cw, height: ch };
  contenido.bottom = contenido.top + ch; contenido.right = contenido.left + cw;
  // Qué hay encima de la franja de abajo y de la de arriba del contenido.
  const queHay = (y) => { const e = document.elementFromPoint(Math.round(contenido.left + cw / 2), Math.round(y)); return e === el ? "pantalla" : e?.closest('[data-zona="mandos"]') ? "mandos" : (e?.dataset?.zona ?? e?.tagName ?? "nada"); };
  return {
    etiqueta: /te est[aá] mostrando/i.test(document.body.innerText),
    img: img && { top: img.top - sala.top, bottom: sala.bottom - img.bottom, left: img.left - sala.left, right: sala.right - img.right },
    bajoLaBarra: mandos ? mandos.top - img.bottom : NaN,
    contenido: {
      dentro: contenido.top >= Math.max(0, sala.top) - 1 && contenido.bottom <= Math.min(innerHeight, sala.bottom) + 1 && contenido.left >= -1 && contenido.right <= innerWidth + 1,
      forma: (cw / ch) / (nw / nh),
      arriba: queHay(Math.max(contenido.top + 6, 0)),
      abajo: queHay(Math.min(contenido.bottom - 6, innerHeight - 1)),
      ocupa: Math.max(cw / img.width, ch / img.height),
    },
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

// Escritorio, tableta horizontal, tableta vertical y móvil.
const ANCHOS = [[1440, 900], [1024, 768], [768, 1024], [390, 844]];

test("con pantalla compartida: sin etiqueta, entera, sin deformar y la miniatura en la barra", { skip: MODO !== "bueno" || !chromium }, async (t) => {
  const navegador = await chromium.launch(); t.after(() => navegador.close());
  for (const [ancho, alto] of ANCHOS) {
    const p = await abrir(navegador, ancho, alto);
    await p.screenshot({ path: `${CAPTURAS}/sala-${ancho}.png` });
    const m = await medir(p);
    assert.equal(m.etiqueta, false, `${ancho}: no se lee la ruta`);
    assert.equal(m.fit, "contain", `${ancho}: la pantalla se ve entera, con su forma`);
    for (const lado of ["top", "left", "right"]) assert.ok(Math.abs(m.img[lado]) <= 1, `${ancho}: su caja llega al borde ${lado} (${m.img[lado]})`);
    assert.ok(m.bajoLaBarra >= -1, `${ancho}: la caja acaba encima de la barra de mandos (${m.bajoLaBarra})`);
    assert.ok(m.contenido.dentro, `${ancho}: el contenido entero cabe en la sala`);
    assert.ok(Math.abs(m.contenido.forma - 1) < 0.01, `${ancho}: sin deformar (${m.contenido.forma})`);
    assert.equal(m.contenido.arriba, "pantalla", `${ancho}: se ve la parte de arriba`);
    assert.equal(m.contenido.abajo, "pantalla", `${ancho}: se ve la parte de abajo, sin que la tape nada`);
    assert.ok(m.contenido.ocupa > 0.99, `${ancho}: ocupa todo lo ancho o todo lo alto de su hueco`);
    assert.ok(m.botones >= 3, `${ancho}: los botones están`);
    assert.ok(m.mini.dentroDeLaBarra, `${ancho}: la miniatura va en la barra de abajo`);
    assert.ok(Math.abs(m.mini.desfase) <= 1, `${ancho}: alineada con los botones (${m.mini.desfase})`);
    assert.equal(m.mini.tapa, 0, `${ancho}: no tapa ningún botón`);
    assert.ok(m.mini.chica, `${ancho}: es una caja pequeña`);
    await p.close();
  }
});

test("sin mandos a la vista, la pantalla llega al borde de abajo y vuelve a subir", { skip: MODO !== "bueno" || !chromium }, async (t) => {
  const navegador = await chromium.launch(); t.after(() => navegador.close());
  for (const [ancho, alto] of ANCHOS) {
    const p = await abrir(navegador, ancho, alto);
    // El cursor sale de la barra y se queda quieto: los mandos se apartan.
    await p.mouse.move(ancho / 2, alto / 3);
    await p.waitForSelector('[data-zona="mandos"][data-ocultos="si"]', { timeout: 8_000 });
    await p.waitForTimeout(450);
    const oculta = await medir(p);
    assert.ok(Math.abs(oculta.img.bottom) <= 1, `${ancho}: con los mandos ocultos llega abajo (${oculta.img.bottom})`);
    assert.ok(oculta.contenido.dentro, `${ancho}: y se sigue viendo entera`);
    await p.mouse.move(ancho / 2 + 10, alto / 3 + 10);
    await p.waitForSelector('[data-zona="mandos"][data-ocultos="no"]', { timeout: 5_000 });
    await p.waitForTimeout(450);
    const vuelta = await medir(p);
    assert.ok(vuelta.bajoLaBarra >= -1, `${ancho}: al volver los mandos, la caja sube encima de ellos (${vuelta.bajoLaBarra})`);
    await p.close();
  }
});

test("ANTES: la parte de abajo de la pantalla se cortaba", { skip: !MODO.startsWith("roto") || !chromium }, async (t) => {
  const navegador = await chromium.launch(); t.after(() => navegador.close());
  for (const [ancho, alto] of [[1440, 900], [390, 844]]) {
    const p = await abrir(navegador, ancho, alto);
    await p.screenshot({ path: `${CAPTURAS}/antes-${ancho}.png` });
    const m = await medir(p);
    assert.equal(m.fit, "cover", `${ancho}: se recortaba para llenar`);
    assert.ok(!m.contenido.dentro || m.contenido.abajo !== "pantalla", `${ancho}: la parte de abajo no se veía (${m.contenido.abajo})`);
    await p.close();
  }
});
