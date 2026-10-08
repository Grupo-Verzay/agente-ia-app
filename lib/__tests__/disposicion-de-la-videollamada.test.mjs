// Qué se ve en grande en la sala de la videollamada, y el límite de duración.
// La regla pura, y la sala MONTADA en Chromium con un Daily de mentira con
// pistas de video de verdad (un lienzo). `MODO=roto` monta la sala de un
// commit pinchado (RAIZ_DE_LA_SALA) y afirma que no existía nada de esto.
// Lo corre `scripts/banco-disposicion-videollamada.sh`.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync, execFileSync } from "node:child_process";
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
const dir = mkdtempSync(join(tmpdir(), "disp-"));

let regla = null;
if (MODO === "bueno") {
  execSync(`npx esbuild lib/disposicion-de-la-videollamada.ts --bundle --format=esm --platform=node --outfile=${dir}/disp.mjs --log-level=error`);
  execSync(`npx esbuild lib/videollamada-ia.ts --bundle --format=esm --platform=node --outfile=${dir}/via.mjs --log-level=error`);
  regla = { ...(await import(`${dir}/disp.mjs`)), ...(await import(`${dir}/via.mjs`)) };
}

let paquete = "";
if (chromium) {
  execSync(
    `npx esbuild ${aqui}/lib/__tests__/sala-de-videollamada/arnes.jsx --bundle --format=iife --jsx=automatic ` +
      `--tsconfig=${RAIZ}/tsconfig.json --alias:@=${RAIZ} ` +
      `--alias:@daily-co/daily-js=${aqui}/lib/__tests__/sala-de-videollamada/daily-de-mentira.js ` +
      `--define:process.env.NODE_ENV='"production"' --outfile=${dir}/arnes.js --log-level=error`,
    { stdio: "inherit", env: { ...process.env, NODE_PATH: `${aqui}/node_modules` } },
  );
  paquete = readFileSync(`${dir}/arnes.js`, "utf8");
  // Los estilos de verdad de la sala (Tailwind con la configuración de la App),
  // para medir tamaños: sin ellos todas las cajas miden lo que su contenido.
  execSync(`printf '@tailwind base;\\n@tailwind components;\\n@tailwind utilities;\\n' > ${dir}/in.css`);
  execSync(`npx tailwindcss -c ${aqui}/tailwind.config.ts -i ${dir}/in.css --content "${RAIZ}/components/videollamada/**/*.tsx" -o ${dir}/sala.css`, { stdio: "ignore" });
}
const css = chromium ? readFileSync(`${dir}/sala.css`, "utf8") : "";

async function abrir(navegador, consulta = "") {
  const pagina = await navegador.newPage();
  await pagina.route("http://sala.test/**", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="raiz"></div><script src="/arnes.js"></script></body></html>` }));
  await pagina.route("http://sala.test/arnes.js", (r) => r.fulfill({ contentType: "text/javascript", body: paquete }));
  await pagina.goto(`http://sala.test/${consulta}`);
  await pagina.waitForFunction(() => window.listo === true);
  // Pistas de video de verdad para los remotos de mentira.
  await pagina.evaluate(() => {
    window.__pista = (color) => {
      const c = document.createElement("canvas"); c.width = 64; c.height = 36;
      const g = c.getContext("2d"); g.fillStyle = color; g.fillRect(0, 0, 64, 36);
      return c.captureStream(5).getVideoTracks()[0];
    };
    window.__poner = (id, p) => {
      window.__daily.remotos[id] = { session_id: id, ...p };
      window.__daily.disparar("participant-updated", { participant: window.__daily.remotos[id] });
    };
  });
  await pagina.waitForFunction(() => document.querySelector('[data-mando]'));
  return pagina;
}
const ponerAvatar = (p) => p.evaluate(() => window.__poner("av", { user_name: "tavus-replica", tracks: { video: { state: "playable", persistentTrack: window.__pista("red") } } }));
const ponerAsesor = (p, conPantalla) => p.evaluate((pant) => window.__poner("as", {
  user_name: "Laura (asesora)", userData: { humano: true, asesor: true },
  tracks: { video: { state: "playable", persistentTrack: window.__pista("blue") }, ...(pant ? { screenVideo: { state: "playable", persistentTrack: window.__pista("green") } } : {}) },
}), conPantalla);
const dice = (p, role, speech) => p.evaluate(([r, s]) => window.__daily.disparar("app-message", { data: { event_type: "conversation.utterance", properties: { role: r, speech: s } } }), [role, speech]);
const disp = (p) => p.evaluate(() => {
  const m = document.querySelector('[data-zona="sala"]');
  return m ? { grande: m.getAttribute("data-grande"), mini: m.getAttribute("data-mini") } : null;
});
const esperar = (p, grande, mini) => p.waitForFunction(([g, m]) => {
  const s = document.querySelector('[data-zona="sala"]');
  return s && s.getAttribute("data-grande") === g && s.getAttribute("data-mini") === m;
}, [grande, mini], { timeout: 5_000 });
const caja = (p, zona) => p.evaluate((z) => { const e = document.querySelector(`[data-zona="${z}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; }, zona);

const compartir = (p, ruta) => p.evaluate((r) => window.__daily.disparar("app-message", { data: { message_type: "conversation", event_type: "conversation.tool_call", properties: { name: "mostrar_pantalla", arguments: JSON.stringify({ ruta: r }) } } }), ruta);
// Que Verzy NO vuelva a grande en ningún momento durante `ms`.
const nuncaGrande = (p, ms) => p.evaluate((t) => new Promise((ok) => {
  const vistos = new Set(); const fin = Date.now() + t;
  const mirar = () => { const s = document.querySelector('[data-zona="sala"]'); vistos.add(s?.getAttribute("data-grande")); if (Date.now() < fin) requestAnimationFrame(mirar); else ok([...vistos]); };
  mirar();
}), ms);

test("la regla", { skip: MODO !== "bueno" }, () => {
  const { laDisposicion: d, elCierreDeLaSala, LIMITE_DE_FABRICA_MIN, TOPE_DE_LA_PRESENTACION_MS } = regla;
  const base = { presentacionTerminada: false, pantallaVerzy: false, asesorAlMando: false, asesor: { camara: false, pantalla: false } };
  assert.deepEqual(d(base), { grande: "avatar", mini: null });
  assert.deepEqual(d({ ...base, presentacionTerminada: true }), { grande: "portada", mini: "avatar" });
  assert.deepEqual(d({ ...base, pantallaVerzy: true }), { grande: "pantalla-verzy", mini: "avatar" });
  assert.deepEqual(d({ ...base, asesorAlMando: true, asesor: { camara: true, pantalla: false } }), { grande: "asesor-camara", mini: null });
  assert.deepEqual(d({ ...base, asesorAlMando: true, asesor: { camara: true, pantalla: true } }), { grande: "asesor-pantalla", mini: "asesor-camara" });
  assert.deepEqual(d({ ...base, asesorAlMando: true, pantallaVerzy: true }), { grande: "pantalla-verzy", mini: null });
  // Una vez que Verzy PIDIÓ compartir, no vuelve a grande nunca: aunque la
  // pantalla falle o la oculte, va la portada y él en miniatura.
  assert.deepEqual(d({ ...base, yaSeCompartio: true }), { grande: "portada", mini: "avatar" });
  assert.deepEqual(d({ ...base, yaSeCompartio: true, pantallaVerzy: true }), { grande: "pantalla-verzy", mini: "avatar" });
  // La cámara de un asesor que NO tomó la palabra no cambia nada.
  assert.deepEqual(d({ ...base, asesor: { camara: true, pantalla: true } }), { grande: "avatar", mini: null });
  assert.equal(TOPE_DE_LA_PRESENTACION_MS, 120_000);
  assert.equal(LIMITE_DE_FABRICA_MIN, 30);
  const t0 = new Date("2026-10-07T15:00:00Z");
  assert.equal(elCierreDeLaSala(t0, new Date("2026-10-07T15:10:00Z"), 30).toISOString(), "2026-10-07T15:30:00.000Z", "desde que empezó, no desde ahora");
  assert.equal(elCierreDeLaSala(null, t0, 30).toISOString(), "2026-10-07T15:30:00.000Z");
  assert.equal(elCierreDeLaSala(t0, t0, "x").toISOString(), "2026-10-07T15:30:00.000Z", "lo raro es el de fábrica, nunca sin límite");
  assert.equal(elCierreDeLaSala("no-fecha", t0, 5).toISOString(), "2026-10-07T15:05:00.000Z");
});

test("ANTES: la sala no decía qué va en grande ni tenía límite", { skip: MODO !== "roto" || !chromium }, async (t) => {
  const navegador = await chromium.launch(); t.after(() => navegador.close());
  const p = await abrir(navegador, "?reentrada=1");
  await ponerAvatar(p);
  await p.waitForTimeout(500);
  assert.equal((await disp(p))?.grande ?? null, null, "no había data-grande");
  assert.equal(await p.locator('[data-zona="portada"]').count(), 0, "no había portada");
  const sala = readFileSync(`${RAIZ}/components/videollamada/SalaDeLaVideollamada.tsx`, "utf8");
  assert.doesNotMatch(sala, /elCierreDeLaSala|laDisposicion/);
});

test("ANTES (47824de): compartir una pantalla que falla devolvía a Verzy a grande", { skip: MODO !== "roto-miniatura" || !chromium }, async (t) => {
  const navegador = await chromium.launch(); t.after(() => navegador.close());
  const p = await abrir(navegador, "?pantallaFalla=1");
  await ponerAvatar(p);
  await esperar(p, "avatar", "ninguna");
  await compartir(p, "/chats");
  await p.waitForTimeout(1_500);
  assert.deepEqual(await disp(p), { grande: "avatar", mini: "ninguna" }, "volvía a grande");
});

test("ANTES: la pizarra era una línea suelta, sin logo ni eslogan aparte", { skip: MODO !== "roto" }, () => {
  // 4c84c02 — la primera portada: una sola frase gris, sin nombre ni eslogan propios.
  const sala = execFileSync("git", ["show", "4c84c02:components/videollamada/SalaDeLaVideollamada.tsx"], { cwd: process.cwd(), encoding: "utf8" });
  assert.match(sala, /data-zona="portada"/);
  assert.doesNotMatch(sala, /nombre-de-la-portada|eslogan-de-la-portada|logo-de-la-portada/);
});

test("la sala montada", { skip: MODO !== "bueno" || !chromium }, async (t) => {
  const navegador = await chromium.launch(); t.after(() => navegador.close());
  for (const [ancho, alto] of [[1440, 900], [390, 844]]) {
    await t.test(`${ancho}: presentación → Verzy en grande y nada más`, async () => {
      const p = await abrir(navegador);
      await p.setViewportSize({ width: ancho, height: alto });
      await ponerAvatar(p);
      await esperar(p, "avatar", "ninguna");
      assert.equal(await p.locator('[data-zona="portada"]').count(), 0);
      const g = await caja(p, "avatar");
      assert.ok(g && g.w >= ancho - 2, `el avatar ocupa el ancho: ${JSON.stringify(g)}`);
    });

    await t.test(`${ancho}: terminada la presentación sin nada compartido → la portada y Verzy en miniatura`, async () => {
      const p = await abrir(navegador, "?reentrada=1");
      await p.setViewportSize({ width: ancho, height: alto });
      await ponerAvatar(p);
      await esperar(p, "portada", "avatar");
      assert.equal((await p.locator('[data-zona="nombre-de-la-portada"]').innerText()).trim(), "Verzay");
      assert.equal((await p.locator('[data-zona="eslogan-de-la-portada"]').innerText()).trim(), "Soluciones Digitales con IA");
      assert.equal(await p.locator('[data-zona="logo-de-la-portada"]').count(), 1, "la pizarra lleva el logo");
      const m = await caja(p, "avatar");
      assert.ok(m && m.w <= 200 && m.h <= 140, `el avatar va en miniatura: ${JSON.stringify(m)}`);
      // El nombre y el eslogan se leen enteros: la miniatura de Verzy no les cae encima.
      const tapados = await p.evaluate(() => {
        const av = document.querySelector('[data-zona="avatar"]').getBoundingClientRect();
        return ["nombre-de-la-portada", "eslogan-de-la-portada"].filter((z) => {
          const r = document.querySelector(`[data-zona="${z}"]`).getBoundingClientRect();
          return !(r.right <= av.left || r.left >= av.right || r.bottom <= av.top || r.top >= av.bottom);
        });
      });
      assert.deepEqual(tapados, [], "la miniatura tapa la pizarra");
      const fondo = await p.evaluate(() => getComputedStyle(document.querySelector('[data-zona="portada"]')).backgroundImage);
      assert.match(fondo, /radial-gradient/, "la pizarra lleva su fondo de marca");
    });

    await t.test(`${ancho}: Verzy comparte → su pantalla en grande y él en miniatura, también al dejar de compartir`, async () => {
      const p = await abrir(navegador);
      await p.setViewportSize({ width: ancho, height: alto });
      await ponerAvatar(p);
      await esperar(p, "avatar", "ninguna");
      await p.evaluate(() => window.__daily.disparar("app-message", { data: { message_type: "conversation", event_type: "conversation.tool_call", properties: { name: "mostrar_pantalla", arguments: JSON.stringify({ ruta: "/chats" }) } } }));
      await esperar(p, "pantalla-verzy", "avatar");
      // «ninguna» no quita la última pantalla (se queda fija) y Verzy sigue en miniatura.
      await compartir(p, "ninguna");
      assert.ok(!(await nuncaGrande(p, 1_500)).includes("avatar"), "Verzy no vuelve a grande");
      assert.equal((await disp(p)).mini, "avatar");
    });

    await t.test(`${ancho}: Verzy pide compartir y la pantalla FALLA → sigue en miniatura, nunca en grande`, async () => {
      const p = await abrir(navegador, "?pantallaFalla=1");
      await p.setViewportSize({ width: ancho, height: alto });
      await ponerAvatar(p);
      await esperar(p, "avatar", "ninguna");
      await compartir(p, "/chats");
      await esperar(p, "portada", "avatar");
      const vistos = await nuncaGrande(p, 2_000);
      assert.ok(!vistos.includes("avatar"), `Verzy volvió a grande: ${vistos}`);
      const m = await caja(p, "avatar");
      assert.ok(m && m.w <= 200 && m.h <= 140, `el avatar sigue en miniatura: ${JSON.stringify(m)}`);
    });
  }

  await t.test("la cámara de un asesor que no tomó la palabra NO cambia nada", async () => {
    const p = await abrir(navegador);
    await ponerAvatar(p);
    await ponerAsesor(p, true);
    await p.waitForTimeout(400);
    assert.deepEqual(await disp(p), { grande: "avatar", mini: "ninguna" });
    assert.equal(await p.locator('[data-zona="camara-del-asesor"]').count(), 0);
  });

  await t.test("«Verzy, yo sigo desde aquí» → la cámara del asesor ocupa el sitio de Verzy; con pantalla, su pantalla grande y su cámara mini", async () => {
    const p = await abrir(navegador);
    await ponerAvatar(p);
    await ponerAsesor(p, false);
    await dice(p, "user", "Verzy, yo sigo desde aquí");
    await esperar(p, "asesor-camara", "ninguna");
    assert.equal(await p.evaluate(() => document.querySelector('[data-zona="avatar"]')?.getAttribute("data-visible")), "no");
    await ponerAsesor(p, true);
    await esperar(p, "asesor-pantalla", "asesor-camara");
    const m = await caja(p, "camara-del-asesor");
    assert.ok(m && m.w <= 200, `la cámara va en miniatura: ${JSON.stringify(m)}`);
    // Lo llaman de nuevo: vuelve, ya sin presentación → portada y él en miniatura.
    await dice(p, "user", "Verzy, ¿me ayudas con los precios?");
    await esperar(p, "portada", "avatar");
  });

  await t.test("la cámara del cliente no se pinta nunca", async () => {
    const p = await abrir(navegador);
    await ponerAvatar(p);
    assert.equal(await p.locator("video").evaluateAll((vs) => vs.filter((v) => v.srcObject && v.srcObject.getVideoTracks().length && !v.closest('[data-zona="avatar"]')).length), 0);
  });

  await t.test("el límite: se cuelga sola contando desde que EMPEZÓ", async () => {
    const empezo = new Date(Date.now() - (5 * 60_000 - 2_000)).toISOString();
    const p = await abrir(navegador, `?limite=5&empezo=${encodeURIComponent(empezo)}`);
    await p.waitForFunction(() => document.body.innerText.includes("La videollamada terminó."), null, { timeout: 8_000 });
    assert.equal(await p.evaluate(() => window.__daily.salidas), 1);
  });

  await t.test("con el límite lejos, no se cuelga", async () => {
    const p = await abrir(navegador, `?limite=30&empezo=${encodeURIComponent(new Date().toISOString())}`);
    await p.waitForTimeout(3_000);
    assert.equal(await p.evaluate(() => window.__daily.salidas), 0);
  });
});
