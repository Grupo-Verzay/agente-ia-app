/**
 * YouTube: el «antes».
 *
 * Antes de este cambio no había forma de subir un video al canal: ni acceso
 * guardado, ni subida programada, ni la herramienta del agente, ni las dos
 * rutas de la App, ni su sección en CLAUDE.md. Esto lo AFIRMA leyendo el árbol
 * de `ANTES_REF`, pinchado a un commit y nunca a `origin/main`: en cuanto el
 * cambio se fusione, `origin/main` pasa a ser el «después» y el modo roto se
 * pondría verde sin ejercer nada.
 *
 * Solo corre en `MODO=roto`. En el bueno se salta: lo que hay que afirmar del
 * «después» lo afirman `youtube-reglas.test.mjs` y `youtube-db.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "64e8f95";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const t = ROTO ? test : test.skip;

const existeEnElAntes = (ruta) => {
    try {
        execFileSync("git", ["cat-file", "-e", `${ANTES_REF}:${ruta}`], { cwd: RAIZ, stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
};

t(`el commit del «antes» (${ANTES_REF}) existe en el repositorio`, () => {
    // Sin esto, «no existía» saldría verde también con un commit que no se pudo leer.
    assert.equal(existeEnElAntes("package.json"), true, `no se pudo leer ${ANTES_REF}`);
});

for (const ruta of [
    "lib/youtube-acceso.mjs",
    "lib/youtube-subida.mjs",
    "scripts/youtube/youtube.mjs",
    "scripts/youtube/contenedor.mjs",
    "app/api/youtube/conectar/route.ts",
    "app/api/youtube/oauth/route.ts",
]) {
    t(`antes no existía ${ruta}`, () => {
        assert.equal(existeEnElAntes(ruta), false, `${ruta} ya estaba en ${ANTES_REF}`);
    });
}

t("antes CLAUDE.md no decía nada de subir a YouTube", () => {
    const claude = execFileSync("git", ["show", `${ANTES_REF}:CLAUDE.md`], { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    assert.equal(/youtube_canal|scripts\/youtube\/youtube\.mjs/i.test(claude), false);
});
