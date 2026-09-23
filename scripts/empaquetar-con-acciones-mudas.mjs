#!/usr/bin/env node
/**
 * Empaqueta un componente de pantalla para el navegador con **todas sus
 * acciones de servidor mudas**, sin escribir un fichero fingido por cada una.
 *
 * Por qué hace falta: la tabla de Leads cuelga de una docena de componentes
 * (el interruptor de sesión, el del agente, las etiquetas, los seguimientos…)
 * y cada uno importa sus acciones de `@/actions/*`. En un navegador suelto esas
 * acciones no pueden correr, y fingirlas a mano una por una es un fichero por
 * acción que se queda viejo el día que alguien añade otra.
 *
 * Cómo: cada import de `@/actions/...` se resuelve a un módulo generado que
 * exporta, con los MISMOS nombres que pide quien importa (leídos de su propio
 * código), una función que contesta `{ success: true, data: [] }`. Los nombres
 * se leen del importador porque esbuild necesita los exports nombrados en
 * tiempo de empaquetado: un `Proxy` no los tiene.
 *
 * Uso: node scripts/empaquetar-con-acciones-mudas.mjs <entrada> <salida> [--alias:a=b ...]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** esbuild no es dependencia del repo: los demás bancos lo corren con `npx`,
 *  así que aquí se busca en la caché de `npx` si no está instalado. */
async function cargarEsbuild() {
    try {
        return await import("esbuild");
    } catch {
        const npx = path.join(os.homedir(), ".npm", "_npx");
        for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) {
            const main = path.join(npx, d, "node_modules", "esbuild", "lib", "main.js");
            if (fs.existsSync(main)) return (await import(pathToFileURL(main).href)).default;
        }
        throw new Error("no se encontró esbuild: corre `npx esbuild --version` una vez");
    }
}
const { build } = await cargarEsbuild();

const [entrada, salida, ...resto] = process.argv.slice(2);
if (!entrada || !salida) {
    console.error("uso: empaquetar-con-acciones-mudas.mjs <entrada> <salida> [--alias:a=b ...]");
    process.exit(1);
}
const RAIZ = process.cwd();
const alias = { "@": RAIZ };
for (const a of resto) {
    const m = /^--alias:([^=]+)=(.+)$/.exec(a);
    if (m) alias[m[1]] = m[2].startsWith(".") ? path.join(RAIZ, m[2]) : m[2];
}

/** Los nombres que `importador` pide de `desde`, leídos de su código. */
function nombresQuePide(importador, desde) {
    let src = "";
    try {
        src = fs.readFileSync(importador, "utf8");
    } catch {
        return [];
    }
    const esc = desde.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`import\\s+(?!type\\b)(?:[\\w$]+\\s*,\\s*)?\\{([^}]*)\\}\\s*from\\s*["']${esc}["']`, "g");
    const nombres = new Set();
    for (const m of src.matchAll(re)) {
        for (const trozo of m[1].split(",")) {
            const t = trozo.trim();
            if (!t || t.startsWith("type ")) continue;
            nombres.add(t.split(/\s+as\s+/)[0].trim());
        }
    }
    return [...nombres];
}

const accionesMudas = {
    name: "acciones-mudas",
    setup(b) {
        b.onResolve({ filter: /^@\/actions\// }, (args) => {
            // Un alias explícito manda sobre el genérico.
            if (alias[args.path]) return { path: alias[args.path] };
            // Un módulo POR importador: esbuild guarda cada módulo por su ruta,
            // así que con una sola ruta el segundo que importe de la misma
            // acción recibiría los nombres del primero.
            return {
                path: `${args.path}?${args.importer}`,
                namespace: "accion-muda",
                pluginData: { nombres: nombresQuePide(args.importer, args.path) },
            };
        });
        b.onLoad({ filter: /.*/, namespace: "accion-muda" }, (args) => {
            const nombres = args.pluginData?.nombres ?? [];
            const cuerpo = nombres
                .map((n) => `export const ${n} = async () => ({ success: true, data: [] });`)
                .join("\n");
            return { contents: `${cuerpo}\nexport default {};`, loader: "js" };
        });
    },
};

// Los alias con ruta completa (no el `@`) se resuelven antes que el genérico.
const aliasExactos = Object.fromEntries(Object.entries(alias).filter(([k]) => k !== "@"));

await build({
    entryPoints: [entrada],
    outfile: salida,
    bundle: true,
    format: "esm",
    jsx: "automatic",
    loader: { ".tsx": "tsx" },
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { ...aliasExactos, "@": RAIZ },
    plugins: [accionesMudas],
    logLevel: "error",
});
