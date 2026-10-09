#!/usr/bin/env node
/**
 * Tope de tamaño de los `CLAUDE.md`: ninguno pasa de 2.000 tokens.
 *
 * El `CLAUDE.md` de la raíz llegó a 1,6 MB (~450k tokens) porque cada PR le
 * añadía su sección, y llenaba la ventana de contexto de cada sesión. Desde el
 * 2026-10-09 los `CLAUDE.md` son cortos y de solo lectura para los agentes; lo
 * largo vive en `docs/reglas/`.
 *
 * Los tokens se ESTIMAN (no hay tokenizador sin red): caracteres / 3,3, que
 * para español con Markdown queda por encima del recuento real. Mejor cortar un
 * poco antes que dejar pasar uno que no cabe.
 *
 *   node scripts/comprobar-claude-md.mjs           # los del árbol de trabajo
 *   node scripts/comprobar-claude-md.mjs --staged  # los del índice (pre-commit)
 *
 * Sale con 1 si alguno pasa del tope.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const TOPE_DE_TOKENS = 2000;
export const CARACTERES_POR_TOKEN = 3.3;
export const esClaudeMd = (f) => /^claude(\.local)?\.md$/i.test(path.basename(f));
export const tokensEstimados = (texto) => Math.ceil([...texto].length / CARACTERES_POR_TOKEN);

const git = (...args) =>
    execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function losDelIndice() {
    return git("ls-files", "-z", "--cached")
        .split("\0")
        .filter((f) => f && esClaudeMd(f))
        .map((f) => ({ archivo: f, texto: git("show", `:${f}`) }));
}

function losDelArbol(raiz) {
    const salida = [];
    const recorrer = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name === ".git" || e.name === ".next") continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) recorrer(p);
            else if (esClaudeMd(e.name)) salida.push({ archivo: path.relative(raiz, p), texto: fs.readFileSync(p, "utf8") });
        }
    };
    recorrer(raiz);
    return salida;
}

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (esPrincipal) {
    const raiz = git("rev-parse", "--show-toplevel").trim();
    process.chdir(raiz);
    const archivos = process.argv.includes("--staged") ? losDelIndice() : losDelArbol(raiz);
    let malos = 0;
    for (const { archivo, texto } of archivos.sort((a, b) => a.archivo.localeCompare(b.archivo))) {
        const t = tokensEstimados(texto);
        const ok = t <= TOPE_DE_TOKENS;
        if (!ok) malos++;
        console.log(`${ok ? "ok  " : "MAL "} ${String(t).padStart(6)} tokens  ${archivo}`);
    }
    if (malos) {
        console.error(
            `\n${malos} CLAUDE.md pasa(n) de ${TOPE_DE_TOKENS} tokens. Lo largo va a docs/reglas/<tema>.md ` +
                `(índice: docs/reglas/README.md), nunca a un CLAUDE.md.`,
        );
        process.exit(1);
    }
}
