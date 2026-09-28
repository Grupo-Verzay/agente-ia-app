/**
 * Exportar en PDF, en Chromium.
 *
 * 1. El PDF de muestra RENDERIZADO con pdf.js en un lienzo, y medido en
 *    píxeles: la banda de la cabecera, el fondo del chat y el color de la
 *    burbuja detrás de cada mensaje —blanco el contacto, verde el asesor, azul
 *    la IA—. Es lo único que dice que «se ve como un chat» y no solo que el
 *    texto está.
 * 2. La barra de acciones en lote REAL: la de Chats abre el menú de formatos
 *    (PDF o texto) y entrega el elegido; la de Correo sigue exportando directo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = (() => { for (const p of [undefined, ...(process.env.NODE_PATH ?? "").split(":").filter(Boolean)]) { try { return p ? require(require.resolve("playwright", { paths: [p] })) : require("playwright"); } catch {} } throw new Error("no se encontró playwright"); })();

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMP = join(AQUI, ".compilado", "pdf");
const PDFJS = join(RAIZ, "node_modules", "pdfjs-dist", "build");
const CSS = fs.readFileSync(process.env.CSS_DEL_BANCO, "utf8");

function levantar() {
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        const enviar = (tipo, cuerpo) => { res.writeHead(200, { "Content-Type": tipo }); res.end(cuerpo); };
        if (u === "/pdf") return enviar("text/html; charset=utf-8", `<!doctype html><html><body style="margin:0"><canvas id="c"></canvas><script src="/pdf.min.js"></script></body></html>`);
        if (u === "/pdf.min.js" || u === "/pdf.worker.min.js") return enviar("application/javascript", fs.readFileSync(join(PDFJS, u.slice(1))));
        if (u === "/muestra.pdf") return enviar("application/pdf", fs.readFileSync(join(COMP, "muestra.pdf")));
        if (u === "/barra") {
            return enviar(
                "text/html; charset=utf-8",
                `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${CSS}</style>` +
                    `<style>*,*::before,*::after{animation:none !important;transition:none !important}</style><script>window.process={env:{}}</script>` +
                    `</head><body><div id="app"></div><script type="module" src="/b.js"></script></body></html>`,
            );
        }
        if (u === "/b.js") return enviar("application/javascript; charset=utf-8", fs.readFileSync(join(COMP, "barra.js")));
        res.writeHead(404);
        res.end();
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

const HEX = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
const cerca = (a, b, tol = 8) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test("el PDF se ve como un chat: cabecera, fondo y el color de cada burbuja", async () => {
    const server = await levantar();
    const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    try {
        const page = await browser.newPage({ viewport: { width: 1300, height: 1800 } });
        await page.goto(`http://127.0.0.1:${server.address().port}/pdf`);
        const escala = 2;
        const r = await page.evaluate(async (escala) => {
            pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
            const doc = await pdfjsLib.getDocument("/muestra.pdf").promise;
            const p = await doc.getPage(1);
            const v = p.getViewport({ scale: escala });
            const c = document.getElementById("c");
            c.width = v.width;
            c.height = v.height;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            await p.render({ canvasContext: ctx, viewport: v }).promise;
            const px = (x, y) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3));
            const tc = await p.getTextContent();
            const detras = (t) => {
                const it = tc.items.find((i) => i.str.startsWith(t));
                if (!it) return null;
                const [x, y] = v.convertToViewportPoint(it.transform[4], it.transform[5]);
                // 4 pt a la izquierda del texto y un poco arriba de su base: dentro
                // de la burbuja y fuera de las letras.
                return { color: px(x - 4 * escala, y - 3 * escala), x: x / escala };
            };
            return {
                banda: px(10, 10),
                fondo: px(8, v.height / 2),
                contacto: detras("Hola, ¿tienen envíos"),
                ia: detras("¡Hola Juan!"),
                asesor: detras("Soy Ana"),
                ancho: v.width / escala,
            };
        }, escala);
        await page.locator("#c").screenshot({ path: join(COMP, "pagina-1.png") });
        assert.ok(cerca(r.banda, HEX("#008069")), `la banda de la cabecera (${r.banda})`);
        assert.ok(cerca(r.fondo, HEX("#EFEAE2")), `el fondo del chat (${r.fondo})`);
        assert.ok(cerca(r.contacto.color, HEX("#FFFFFF")), `el contacto va en blanco (${r.contacto.color})`);
        assert.ok(cerca(r.asesor.color, HEX("#D9FDD3")), `el asesor va en verde (${r.asesor.color})`);
        assert.ok(cerca(r.ia.color, HEX("#E7F0FE")), `la IA va en azul (${r.ia.color})`);
        assert.ok(r.contacto.x < r.ancho / 2, "el contacto, a la izquierda");
        assert.ok(r.asesor.x > r.contacto.x + 100 && r.ia.x > r.contacto.x + 100, "la cuenta, a la derecha");
    } finally {
        await browser.close();
        server.close();
    }
});

test("la barra en lote de Chats elige formato; la de Correo exporta directo", async () => {
    const server = await levantar();
    const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const errores = [];
        page.on("pageerror", (e) => errores.push(String(e)));
        await page.goto(`http://127.0.0.1:${server.address().port}/barra`);
        await page.waitForFunction(() => window.listo === true, null, { timeout: 15000 });
        assert.deepEqual(errores, []);

        const chats = page.locator('[data-barra="chats"] button[aria-label="Exportar chats"]');
        for (const [rotulo, formato] of [["Como PDF", "pdf"], ["Como texto plano", "txt"]]) {
            await chats.click();
            const menu = page.locator("[data-menu-de-exportar]");
            await menu.waitFor();
            const opciones = await menu.locator("[data-formato-de-exportacion]").evaluateAll((els) => els.map((e) => e.getAttribute("data-formato-de-exportacion")));
            assert.deepEqual(opciones, ["pdf", "txt"], "PDF primero, texto después");
            const caja = await menu.boundingBox();
            assert.ok(caja.x >= 0 && caja.x + caja.width <= 1280 && caja.y + caja.height <= 800, "el menú cabe en la pantalla");
            await menu.getByText(rotulo, { exact: true }).click();
            await menu.waitFor({ state: "detached" });
            const ultimo = await page.evaluate(() => window.exportados.at(-1));
            assert.deepEqual(ultimo, { donde: "chats", formato });
        }

        await page.locator('[data-barra="correo"] button[aria-label="Exportar correos"]').click();
        assert.equal(await page.locator("[data-menu-de-exportar]").count(), 0, "Correo no abre el menú");
        assert.deepEqual(await page.evaluate(() => window.exportados.at(-1)), { donde: "correo", formato: null });
    } finally {
        await browser.close();
        server.close();
    }
});
