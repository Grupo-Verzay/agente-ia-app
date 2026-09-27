// Empaqueta el banco de Correo. Va por la API de esbuild y no por la línea de
// órdenes porque `nodemailer` hay que fingirlo EXACTO: un `--alias` también
// reescribiría `nodemailer/lib/mail-composer`, que tiene que ser el de verdad
// (es quien arma el MIME de una respuesta de Gmail).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// esbuild no es dependencia del repo: igual que `empaquetar-con-acciones-mudas`,
// se busca en la caché de `npx` si no está instalado.
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
    imapflow: f("correo/imapflow.ts"),
    nodemailer: f("correo/nodemailer.ts"),
    "next/headers": f("correo/next-headers.ts"),
    "@/lib/auth": f("auth-de-documentos.ts"),
    "next/cache": f("next-cache.ts"),
    "server-only": f("correo/server-only.ts"),
    // La IA de la sugerencia: la de Chats, fingida para no arrastrar los clientes de OpenAI y Google.
    "@/lib/sugerencia-de-correo.server": f("correo/sugerencia.ts"),
};
await build({
    entryPoints: [f("correo/entrada.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.join(raiz, "lib/__tests__/.compilado/correo/entrada.js"),
    external: ["@prisma/client"],
    logLevel: "error",
    // `require`, `__dirname` y `__filename` no existen en un módulo ESM, y
    // dentro del paquete los piden `next/server` y los compilados de Next.
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
