// Banco del interruptor de tipos.
//
// `next.config.js` llevaba `typescript: { ignoreBuildErrors: true }`, asi que
// `npm run build` salia en verde con errores de tipos vivos dentro. El unico
// que los veia era `npx tsc --noEmit`, que no corre en ningun sitio.
//
// Lo que eso deja pasar no son solo tipos: un `soltar` usado en un array de
// dependencias ANTES de declararse es un TDZ de verdad -revienta en tiempo de
// ejecucion- y compilaba limpio.
//
// Este banco es de una linea y existe por una razon concreta: volver a poner
// ese interruptor es lo que se hace cuando un build se cae y hay prisa, y a
// partir de ahi no vuelve a quitarlo nadie. Que salte aqui obliga a decirlo en
// voz alta.
//
// Se ejecuta con: node --test lib/__tests__/tipos-en-el-build.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("../../", import.meta.url).pathname;

test("el build comprueba los tipos", () => {
    const src = readFileSync(join(RAIZ, "next.config.js"), "utf8");
    const sinComentarios = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");

    assert.ok(
        !/ignoreBuildErrors\s*:\s*true/.test(sinComentarios),
        "volvio `typescript: { ignoreBuildErrors: true }` a next.config.js: el build vuelve a salir en verde con errores de tipos dentro",
    );
});
