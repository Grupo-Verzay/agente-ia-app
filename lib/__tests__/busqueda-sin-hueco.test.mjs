/**
 * El hueco en blanco encima de «En mensajes», medido en Chromium con el
 * ChatEmptyState real sobre el CSS de Tailwind del árbol que se prueba.
 * `MODO=roto` lo pinta con el del «antes» y AFIRMA el hueco.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROTO = process.env.MODO === "roto";
const BUNDLE = fs.readFileSync(process.env.BUNDLE_DEL_BANCO);
const CSS = fs.readFileSync(process.env.CSS_DEL_BANCO, "utf8");

test(ROTO ? "antes: el resultado arranca muy abajo" : "el resultado en mensajes arranca arriba", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/b.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end(BUNDLE); }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="app-module-content"><div id="app"></div></div><script>window.process={env:{}}</script><script type="module" src="/b.js"></script></body></html>`);
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN });
  try {
    for (const ancho of [1440, 1024, 390]) {
      const page = await browser.newPage({ viewport: { width: ancho, height: 900 } });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => window.listo === true);
      const hueco = await page.evaluate(() => {
        const lista = document.querySelector("[data-lista]").getBoundingClientRect();
        const sec = document.querySelector("[data-en-mensajes]").getBoundingClientRect();
        return sec.top - lista.top;
      });
      if (ROTO) assert.ok(hueco > 400, `a ${ancho}: hueco de ${hueco}px (se esperaba el fallo)`);
      else assert.ok(hueco < 120, `a ${ancho}: hueco de ${hueco}px encima de los resultados`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});
