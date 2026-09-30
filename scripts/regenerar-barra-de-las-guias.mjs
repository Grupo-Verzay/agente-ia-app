/**
 * Rehace SOLO la foto de la barra de arriba (`barra-de-arriba.webp`) de TODAS
 * las guías publicadas, sobre la App servida de verdad.
 *
 * # Por qué existe
 *
 * La barra es la misma en todas las pantallas, y cada guía la enseña numerada
 * parte por parte (`PARTES_DE_LA_BARRA_DE_ARRIBA`). Cuando la barra gana o
 * pierde un botón —«Ayuda», al llegar el centro de ayuda— esa foto se queda
 * vieja en todas las guías a la vez, y volver a generarlas enteras
 * (capturas, miniaturas y vídeo) para cambiar una tira de 131 px es rehacer
 * mucho más de lo que cambió. Esto abre la pantalla de cada guía y toma esa
 * foto con la MISMA receta que al generarla (`laFotoDeLaBarra`, del taller).
 *
 * Deja en `scripts/barra-de-las-guias.json` con qué partes se tomó y la huella
 * de cada imagen: el banco del centro de ayuda lo compara con las partes de hoy
 * y con los ficheros, así que una barra que cambia sin volver a correr esto se
 * pone en rojo.
 *
 * Se lanza con `scripts/regenerar-barra-de-las-guias.sh` (que levanta la base
 * y `next start` como `generar-guia.sh`). Después hay que volver a construir.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

import {
    LA_BARRA_DE_ARRIBA,
    apuntarLaBarra,
    crearGuardar,
    despejar,
    entrar,
    esconderLosBotonesDelBorde,
    espera,
    laFotoDeLaBarra,
    lasPartesDeArriba,
} from "./taller-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const COMPILADO = path.join(RAIZ, "lib/__tests__/.compilado/barra-de-las-guias");
const { GUIAS_PUBLICADAS } = await import(path.join(COMPILADO, "tutoriales-del-modulo.mjs"));
const { PARTES_DE_LA_BARRA_DE_ARRIBA } = await import(path.join(COMPILADO, "guia-de-modulo.mjs"));

const SOLO = (process.env.SOLO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const guias = GUIAS_PUBLICADAS.filter((g) => SOLO.length === 0 || SOLO.includes(g.modulo));

const navegador = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    args: ["--no-sandbox", "--lang=es-CO"],
});
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "es-CO", timezoneId: "America/Bogota" });
const p = await entrar(contexto, BASE);

const partes = PARTES_DE_LA_BARRA_DE_ARRIBA.map((x) => x.nombre);
for (const g of guias) {
    const salida = path.join(RAIZ, "public", "guia", g.modulo);
    mkdirSync(salida, { recursive: true });
    const guardar = crearGuardar({ salida, tomadas: new Set() });

    console.log(`· ${g.modulo} (${g.ruta})`);
    await p.goto(`${BASE}${g.ruta}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(LA_BARRA_DE_ARRIBA, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    await esconderLosBotonesDelBorde(p);
    // Una pantalla que redirige no es la de la guía: su «Ver tutoriales» sería otro.
    const donde = new URL(p.url()).pathname;
    if (donde !== g.ruta && !donde.startsWith(`${g.ruta}/`)) throw new Error(`${g.modulo}: se abrió ${donde} en vez de ${g.ruta}`);
    // Las siete partes, todas a la vista antes de fotografiar: una que falte
    // dejaría la foto con un número de menos y nadie lo notaría.
    for (const [i, parte] of lasPartesDeArriba(p).entries()) {
        await parte.first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {
            throw new Error(`${g.modulo}: no se ve «${partes[i]}» en la barra`);
        });
    }
    await laFotoDeLaBarra(p, guardar);
    // `laFotoDeLaBarra` ya apuntó la huella; aquí se añade con qué partes.
    apuntarLaBarra(g.modulo, path.join(salida, "barra-de-arriba.webp"), partes);
}

await navegador.close();
console.log(`listo: ${guias.length} barras`);
