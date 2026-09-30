/**
 * Las MINIATURAS de las tarjetas de Secciones de la guía de Leads llevan el
 * efecto de ENFOQUE: la zona que explica cada sección, nítida y en su
 * recuadro; el resto, atenuado. Todas con la misma receta —la de acciones
 * masivas con el menú «⋯» abierto: cerrado es un icono y no dice nada—.
 *
 * Se mide en los PÍXELES de cada `mini-*.webp`, con el recuadro que el script
 * dejó escrito en `scripts/miniaturas-guia-leads.json`:
 *
 * - fuera de la zona, nada pasa de gris medio (el velo oscurece hasta el
 *   blanco de la página);
 * - dentro, hay blanco de verdad (la zona no lleva velo);
 * - en el borde, el azul del recuadro;
 * - y la imagen es 960×540, la proporción de la tarjeta, así el
 *   `object-cover` no recorta la zona fuera de la vista.
 *
 * `MODO=roto` lee la guía de `ANTES_REF` y afirma el fallo: las tarjetas
 * reutilizaban la captura de un paso, a pantalla completa y sin 16:9.
 *
 * Se levanta con `scripts/banco-miniaturas-guia-leads.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { AIRE, PROPORCION, SALIDA, encuadreDeLaMiniatura } from "../../scripts/encuadre-de-la-miniatura.mjs";
import { medirLaMiniatura } from "./medir-miniatura.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "98a247c";
const DIR = path.join(RAIZ, "public", "guia", "leads");

/** Las miniaturas y los pasos, leídos del contenido de la guía (sin compilarla: basta el texto). */
function laGuia(texto) {
    const secciones = [];
    for (const trozo of texto.split(/\n\s*slug: "/).slice(1)) {
        const slug = trozo.slice(0, trozo.indexOf('"'));
        const miniatura = /miniatura: "([^"]+)"/.exec(trozo)?.[1];
        const pasos = [...trozo.matchAll(/imagen: "([^"]+)"/g)].map((m) => m[1]);
        secciones.push({ slug, miniatura, pasos });
    }
    return secciones;
}

const git = (ref, rel) => execSync(`git show ${ref}:${rel}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });

if (ROTO) {
    test("ANTES: las tarjetas reutilizaban la captura de un paso, sin enfoque propio", async () => {
        const secciones = laGuia(git(ANTES, "lib/guia-leads.ts").toString());
        assert.equal(secciones.length, 7);
        for (const s of secciones) {
            assert.ok(!s.miniatura.startsWith("mini-"), `${s.slug}: ya tenía miniatura propia`);
            assert.ok(s.pasos.includes(s.miniatura), `${s.slug}: su miniatura no era la de un paso`);
            const m = await sharp(git(ANTES, `public/guia/leads/${s.miniatura}`)).metadata();
            const proporcion = m.width / m.height;
            assert.ok(Math.abs(proporcion - PROPORCION) > 0.02 || m.width !== SALIDA.ancho, `${s.slug}: ya era 16:9 de ${SALIDA.ancho}`);
        }
    });
    test("ANTES: no existía la receta de las miniaturas", () => {
        const script = git(ANTES, "scripts/capturar-guia-leads.mjs").toString();
        assert.ok(!/async function miniaturas\(/.test(script), "ya había receta de miniaturas");
    });
} else {
    const secciones = laGuia(readFileSync(path.join(RAIZ, "lib/guia-leads.ts"), "utf8"));
    const focos = JSON.parse(readFileSync(path.join(RAIZ, "scripts/miniaturas-guia-leads.json"), "utf8"));

    test("cada tarjeta tiene su PROPIA miniatura, que no es la de ningún paso", () => {
        assert.ok(secciones.length >= 8 && secciones.some((s) => s.slug === "acciones-masivas"), "falta la tarjeta de acciones masivas");
        const todasLasDePasos = new Set(secciones.flatMap((s) => s.pasos));
        for (const s of secciones) {
            assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: la miniatura no es la suya`);
            assert.ok(!todasLasDePasos.has(s.miniatura), `${s.slug}: su miniatura es también la de un paso`);
            assert.ok(existsSync(path.join(DIR, s.miniatura)), `falta ${s.miniatura}`);
            assert.ok(focos[s.miniatura], `${s.miniatura}: el script no dejó escrito dónde está su recuadro`);
        }
        assert.deepEqual(Object.keys(focos).sort(), secciones.map((s) => s.miniatura).sort(), "focos de miniaturas que la guía no enseña");
    });

    for (const s of secciones) {
        test(`${s.slug}: 16:9, la zona nítida en su recuadro y el resto atenuado`, async () => {
            const f = focos[s.miniatura];
            const m = await medirLaMiniatura(readFileSync(path.join(DIR, s.miniatura)), f);
            const { w, h, zona, fueraAlto, dentroAlto, azules } = m;
            assert.equal(w, SALIDA.ancho);
            assert.equal(h, SALIDA.alto);
            // Todo el recuadro dentro de la miniatura: la zona no se corta.
            assert.ok(zona.x >= 0 && zona.y >= 0 && zona.r <= w + 0.5 && zona.b <= h + 0.5, `${s.slug}: la zona se sale de la miniatura`);
            assert.ok(m.fuera > 1000, `${s.slug}: no queda fondo alrededor de la zona que atenuar`);
            assert.ok(fueraAlto < 150, `${s.slug}: el fondo no está atenuado (p99,5 de luminancia ${fueraAlto.toFixed(0)})`);
            assert.ok(dentroAlto > 200, `${s.slug}: la zona no está nítida (p99 de luminancia ${dentroAlto.toFixed(0)})`);
            assert.ok(azules > 40, `${s.slug}: no se ve el recuadro azul alrededor de la zona (${azules} px)`);
        });
    }

    test("el encuadre: 16:9, la zona entera dentro, con aire, y sin salirse de la pantalla", () => {
        const vista = { width: 1440, height: 900 };
        const casos = [
            { x: 1300, y: 40, w: 60, h: 36 }, // un botón en la esquina
            { x: 50, y: 100, w: 1340, h: 40 }, // la barra entera
            { x: 600, y: 400, w: 200, h: 40 }, // en medio
            { x: 0, y: 0, w: 1440, h: 900 }, // la pantalla entera
        ];
        for (const foco of casos) {
            const e = encuadreDeLaMiniatura(foco, vista);
            assert.ok(Math.abs(e.w / e.h - PROPORCION) < 1e-9, "no es 16:9");
            assert.ok(e.x >= 0 && e.y >= 0 && e.x + e.w <= vista.width + 1e-9 && e.y + e.h <= vista.height + 1e-9, "se sale de la pantalla");
            const cabe = foco.w <= e.w && foco.h <= e.h;
            if (cabe) {
                assert.ok(foco.x >= e.x - 1e-9 && foco.x + foco.w <= e.x + e.w + 1e-9, "la zona se corta a lo ancho");
                assert.ok(foco.y >= e.y - 1e-9 && foco.y + foco.h <= e.y + e.h + 1e-9, "la zona se corta a lo alto");
            }
            if (foco.w * AIRE <= vista.width) assert.ok(e.w >= foco.w * AIRE - 1e-9, "sin aire alrededor");
        }
        // En medio de la pantalla, la zona queda CENTRADA.
        const e = encuadreDeLaMiniatura({ x: 600, y: 400, w: 200, h: 40 }, vista);
        assert.ok(Math.abs(e.x + e.w / 2 - 700) < 1e-9 && Math.abs(e.y + e.h / 2 - 420) < 1e-9, "no está centrada");
    });

    test("la tarjeta es 16:9 como la miniatura", () => {
        const guia = readFileSync(path.join(RAIZ, "components/guia/Guia.tsx"), "utf8");
        const tarjeta = guia.slice(guia.indexOf("export function TarjetaDeSeccion"));
        assert.match(tarjeta.slice(0, 1500), /aspect-\[16\/9\]/, "la tarjeta ya no es 16:9: la miniatura se recortaría");
    });
}
