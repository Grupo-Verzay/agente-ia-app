/**
 * El índice de cualquier guía pública termina en la línea divisoria que sigue
 * a las tarjetas de cierre, sin nota ni relleno debajo (`FinDeLaGuia`,
 * `CONTENEDOR_DEL_INDICE`). Se barren TODAS las guías de `app/guia/*`, así que
 * una guía nueva que vuelva a escribir su pie se pone en rojo.
 *
 * `MODO=roto` lee el índice de Leads de ANTES_FIN_REF y afirma el fallo: la
 * nota «Las capturas se toman automáticamente…» y el `pb-16` debajo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_FIN_REF ?? "9e38996";

const leer = (ruta) => (ROTO ? execFileSync("git", ["show", `${ANTES}:${ruta}`], { encoding: "utf8" }) : readFileSync(ruta, "utf8"));
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const indices = readdirSync("app/guia", { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `app/guia/${d.name}/page.tsx`)
    .filter((r) => existsSync(r));

test("hay al menos una guía que barrer", () => {
    assert.ok(indices.includes("app/guia/leads/page.tsx"), indices.join(","));
});

if (ROTO) {
    test("ANTES: el índice de Leads terminaba en una nota interna con relleno debajo", () => {
        const s = leer("app/guia/leads/page.tsx");
        assert.match(s, /Las capturas se toman automáticamente/);
        assert.match(s, /<footer/);
        assert.match(s, /pb-16/);
    });
} else {
    for (const ruta of indices) {
        test(`${ruta}: sin nota interna, sin <footer> y sin relleno debajo`, () => {
            const s = sinComentarios(leer(ruta));
            assert.doesNotMatch(s, /capturas se toman/i);
            assert.doesNotMatch(s, /datos de ejemplo/i);
            assert.doesNotMatch(s, /<footer/);
            assert.match(s, /className=\{CONTENEDOR_DEL_INDICE\}/, "el contenedor es el compartido");
        });
        test(`${ruta}: FinDeLaGuia es lo ÚLTIMO del contenedor`, () => {
            const s = sinComentarios(leer(ruta));
            assert.match(s, /<FinDeLaGuia \/>\s*<\/div>\s*<\/>\s*\);\s*\}\s*$/);
        });
    }
    test("el contenedor compartido no lleva relleno inferior y el fin es solo la línea", () => {
        const s = readFileSync("components/guia/Guia.tsx", "utf8");
        const c = s.match(/CONTENEDOR_DEL_INDICE = "([^"]+)"/)?.[1] ?? "";
        assert.ok(c, "existe CONTENEDOR_DEL_INDICE");
        assert.doesNotMatch(c, /(^|\s)(sm:|md:|lg:)?(pb|py|p)-/);
        const fin = s.slice(s.indexOf("export function FinDeLaGuia"));
        assert.match(fin, /return <hr data-fin-de-la-guia className="border-0 border-t border-guia-borde" \/>;/);
    });
}
