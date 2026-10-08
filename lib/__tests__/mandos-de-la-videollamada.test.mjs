// Los mandos de la sala (cámara, compartir, salir) se esconden solos mientras
// hay una pantalla compartida en grande, y vuelven al mover el cursor. Sala
// MONTADA en Chromium con el Daily de mentira y el CSS real. `MODO=roto` monta
// la sala de un commit pinchado (RAIZ_DE_LA_SALA) y afirma que nunca se
// escondían. Lo corre `scripts/banco-mandos-de-la-videollamada.sh`.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("playwright")); } catch { try { ({ chromium } = require("@playwright/test")); } catch { chromium = null; } }
const MODO = process.env.MODO ?? "bueno";
const RAIZ = process.env.RAIZ_DE_LA_SALA ?? ".";
const aqui = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "mandos-"));

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

async function abrir(navegador, ancho, alto) {
  const p = await navegador.newPage({ viewport: { width: ancho, height: alto } });
  await p.route("http://sala.test/**", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="raiz"></div><script src="/arnes.js"></script></body></html>` }));
  await p.route("http://sala.test/arnes.js", (r) => r.fulfill({ contentType: "text/javascript", body: paquete }));
  await p.goto("http://sala.test/");
  await p.waitForFunction(() => window.listo === true);
  await p.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 36;
    c.getContext("2d").fillRect(0, 0, 64, 36);
    const pista = c.captureStream(5).getVideoTracks()[0];
    window.__daily.remotos.av = { session_id: "av", user_name: "tavus-replica", tracks: { video: { state: "playable", persistentTrack: pista } } };
    window.__daily.disparar("participant-updated", { participant: window.__daily.remotos.av });
  });
  await p.waitForFunction(() => document.querySelector("[data-mando]"));
  return p;
}
const compartir = (p) => p.evaluate(() => window.__daily.disparar("app-message", { data: { message_type: "conversation", event_type: "conversation.tool_call", properties: { name: "mostrar_pantalla", arguments: JSON.stringify({ ruta: "/chats" }) } } }));
// Visibles = opacidad 1 y el botón Salir recibe el clic en su centro.
const seVen = (p) => p.evaluate(() => {
  const z = document.querySelector('[data-zona="mandos"]');
  const s = document.querySelector('[data-mando="salir"]');
  if (!z || !s) return null;
  const r = s.getBoundingClientRect();
  const enElCentro = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { opacidad: getComputedStyle(z).opacity, pulsable: !!enElCentro && s.contains(enElCentro) };
});

test("ANTES: con la pantalla compartida los mandos no se escondían nunca", { skip: MODO !== "roto" || !chromium }, async (t) => {
  const navegador = await chromium.launch(); t.after(() => navegador.close());
  const p = await abrir(navegador, 1440, 900);
  await compartir(p);
  await p.mouse.move(700, 300);
  await p.waitForTimeout(4_500);
  const v = await seVen(p);
  assert.equal(v.opacidad, "1"); assert.equal(v.pulsable, true);
});

test("la sala montada", { skip: MODO !== "bueno" || !chromium }, async (t) => {
  const navegador = await chromium.launch(); t.after(() => navegador.close());
  for (const [ancho, alto] of [[1440, 900], [390, 844]]) {
    await t.test(`${ancho}: con pantalla compartida se esconden a los 3,5 s y vuelven al mover el cursor`, async () => {
      const p = await abrir(navegador, ancho, alto);
      await compartir(p);
      await p.waitForFunction(() => document.querySelector('[data-zona="sala"]')?.getAttribute("data-grande") === "pantalla-verzy");
      await p.mouse.move(ancho / 2, alto / 3);
      assert.equal((await seVen(p)).opacidad, "1", "recién movido, se ven");
      await p.waitForFunction(() => document.querySelector('[data-zona="mandos"]')?.getAttribute("data-ocultos") === "si", null, { timeout: 6_000 });
      await p.waitForTimeout(400); // la transición de opacidad
      const oculto = await seVen(p);
      assert.equal(oculto.opacidad, "0"); assert.equal(oculto.pulsable, false, "escondido no se puede pulsar");
      // La pantalla compartida se queda ENCIMA de la barra aunque los mandos se
      // escondan: si bajara, al volver los mandos taparían su parte de abajo.
      const alturaGrande = await p.evaluate(() => document.querySelector('[data-zona="pantalla-del-avatar"]')?.getBoundingClientRect().bottom ?? null);
      if (alturaGrande !== null) assert.ok(Math.abs(alturaGrande - (alto - 80)) <= 1, `la pantalla acaba encima de la barra: ${alturaGrande}`);
      await p.mouse.move(ancho / 2 + 20, alto / 3 + 20);
      await p.waitForFunction(() => document.querySelector('[data-zona="mandos"]')?.getAttribute("data-ocultos") === "no");
      await p.waitForTimeout(400);
      const visto = await seVen(p);
      assert.equal(visto.opacidad, "1"); assert.equal(visto.pulsable, true);
    });

    await t.test(`${ancho}: con el cursor ENCIMA de los mandos no se esconden`, async () => {
      const p = await abrir(navegador, ancho, alto);
      await compartir(p);
      const r = await p.locator('[data-mando="salir"]').boundingBox();
      await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await p.waitForTimeout(4_500);
      assert.equal(await p.locator('[data-zona="mandos"]').getAttribute("data-ocultos"), "no");
    });

    await t.test(`${ancho}: sin pantalla compartida se quedan siempre`, async () => {
      const p = await abrir(navegador, ancho, alto);
      await p.mouse.move(ancho / 2, alto / 3);
      await p.waitForTimeout(4_500);
      const v = await seVen(p);
      assert.equal(v.opacidad, "1"); assert.equal(v.pulsable, true);
    });
  }
});
