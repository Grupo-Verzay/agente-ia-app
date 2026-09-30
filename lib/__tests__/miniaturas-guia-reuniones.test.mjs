/**
 * Las MINIATURAS de las tarjetas de Secciones de la guía de Reuniones, con el
 * mismo efecto de ENFOQUE que las de Leads: la zona que explica cada sección,
 * nítida y en su recuadro azul; el resto, atenuado. Se miden con la MISMA
 * función (`medir-miniatura.mjs`) y el recuadro que el script dejó en
 * `scripts/miniaturas-guia-reuniones.json`.
 *
 * Lo único distinto de Leads es el umbral de lo nítido, y es a propósito: la
 * reunión tiene fondo oscuro, así que su zona más clara no llega al blanco de
 * una tabla. Lo que se exige es lo que define el enfoque —la zona clara muy por
 * encima del velo—, no un blanco que en una sala de video no existe.
 *
 * `MODO=roto` lee `ANTES_REF` y afirma que no había miniaturas de Reuniones.
 *
 * Se levanta con `scripts/banco-guia-reuniones.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { SALIDA } from "../../scripts/encuadre-de-la-miniatura.mjs";
import { medirLaMiniatura } from "./medir-miniatura.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "24ba0b2";
const DIR = path.join(RAIZ, "public", "guia", "reuniones");

function laGuia(texto) {
    return texto
        .split(/\n\s*slug: "/)
        .slice(1)
        .map((trozo) => ({
            slug: trozo.slice(0, trozo.indexOf('"')),
            miniatura: /miniatura: "([^"]+)"/.exec(trozo)?.[1],
            pasos: [...trozo.matchAll(/imagen: "([^"]+)"/g)].map((m) => m[1]),
        }));
}

if (ROTO) {
    test("ANTES no había miniaturas de Reuniones", () => {
        const existe = (f) => spawnSync("git", ["cat-file", "-e", `${ANTES}:${f}`], { cwd: RAIZ }).status === 0;
        assert.ok(existe("scripts/miniaturas-guia-leads.json"), `${ANTES} no parece el «antes» bueno`);
        assert.ok(!existe("scripts/miniaturas-guia-reuniones.json"), "el recuadro de las miniaturas ya existía");
        assert.ok(!existe("public/guia/reuniones/mini-vista-general.webp"), "las miniaturas ya existían");
    });
} else {
    const secciones = laGuia(readFileSync(path.join(RAIZ, "lib/guia-reuniones.ts"), "utf8"));
    const focos = JSON.parse(readFileSync(path.join(RAIZ, "scripts/miniaturas-guia-reuniones.json"), "utf8"));

    test("cada tarjeta tiene su PROPIA miniatura, que no es la de ningún paso", () => {
        assert.equal(secciones.length, 9);
        const deLosPasos = new Set(secciones.flatMap((s) => s.pasos));
        for (const s of secciones) {
            assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: la miniatura no es la suya`);
            assert.ok(!deLosPasos.has(s.miniatura), `${s.slug}: su miniatura es también la de un paso`);
            assert.ok(existsSync(path.join(DIR, s.miniatura)), `falta ${s.miniatura}`);
            assert.ok(focos[s.miniatura], `${s.miniatura}: el script no dejó escrito dónde está su recuadro`);
        }
        assert.deepEqual(Object.keys(focos).sort(), secciones.map((s) => s.miniatura).sort(), "focos de miniaturas que la guía no enseña");
    });

    for (const s of secciones) {
        test(`${s.slug}: 16:9, la zona nítida en su recuadro y el resto atenuado`, async () => {
            const m = await medirLaMiniatura(readFileSync(path.join(DIR, s.miniatura)), focos[s.miniatura]);
            assert.equal(m.w, SALIDA.ancho);
            assert.equal(m.h, SALIDA.alto);
            const { zona } = m;
            assert.ok(zona.x >= -0.5 && zona.y >= -0.5 && zona.r <= m.w + 0.5 && zona.b <= m.h + 0.5, `${s.slug}: la zona se sale de la miniatura`);
            assert.ok(m.fuera > 1000, `${s.slug}: no queda fondo alrededor de la zona que atenuar`);
            // El velo, igual que en Leads.
            assert.ok(m.fueraAlto < 150, `${s.slug}: el fondo no está atenuado (p99,5 de luminancia ${m.fueraAlto.toFixed(0)})`);
            // Lo nítido: claro, y muy por encima del velo.
            assert.ok(m.dentroAlto >= 190, `${s.slug}: la zona no está nítida (p99 de luminancia ${m.dentroAlto.toFixed(0)})`);
            assert.ok(m.dentroAlto - m.fueraAlto >= 60, `${s.slug}: la zona no destaca del velo (${m.dentroAlto.toFixed(0)} frente a ${m.fueraAlto.toFixed(0)})`);
            assert.ok(m.azules > 40, `${s.slug}: no se ve el recuadro azul alrededor de la zona (${m.azules} px)`);
        });
    }
}
