// Empaqueta el banco de YouTube: las dos rutas de verdad (`conectar` y la
// vuelta de Google) con `currentUser()`, `next/headers` y `server-only`
// fingidos EXACTOS. Mismo camino que `empaquetar-correo.mjs`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// esbuild no es dependencia del repo: se busca en la caché de `npx` si no está instalado.
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

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const f = (p) => path.join(raiz, "lib/__tests__/fingido", p);
const exactos = {
    "next/headers": f("correo/next-headers.ts"),
    "@/lib/auth": f("auth-de-documentos.ts"),
    "server-only": f("correo/server-only.ts"),
};
await build({
    entryPoints: [f("youtube/entrada.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.join(raiz, "lib/__tests__/.compilado/youtube/entrada.js"),
    external: ["@prisma/client"],
    logLevel: "error",
    banner: {
        js: [
            "import { createRequire as __cr } from 'module';",
            "import { fileURLToPath as __fu } from 'url';",
            "import { dirname as __dn } from 'path';",
            "const require = __cr(import.meta.url);",
            "const __filename = __fu(import.meta.url);",
            "const __dirname = __dn(__filename);",
        ].join(" "),
    },
    plugins: [
        {
            name: "fingidos-exactos",
            setup(b) {
                b.onResolve({ filter: /.*/ }, (a) => (exactos[a.path] ? { path: exactos[a.path] } : undefined));
            },
        },
    ],
    tsconfig: path.join(raiz, "tsconfig.json"),
});
