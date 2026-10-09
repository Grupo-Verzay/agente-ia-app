#!/usr/bin/env node
/**
 * PreToolUse: ningún agente escribe en un `CLAUDE.md` (ni `CLAUDE.local.md`).
 *
 * El de la raíz llegó a 1,6 MB porque cada sesión le añadía su sección. Los
 * aprendizajes van a `docs/reglas/<tema>.md`. Sale con 2 (bloquea la
 * herramienta) y le dice a Claude adónde ir.
 *
 * Cubre las herramientas de archivo, las de GitHub que escriben archivos y los
 * comandos de Bash que mencionan un CLAUDE.md y escriben (redirección, tee,
 * sed -i, mv/cp/rm, intérpretes, git checkout/restore/apply…). Leer sigue
 * permitido.
 */
import fs from "node:fs";

const MENSAJE =
    "Bloqueado: ningún agente, script o hook escribe en un CLAUDE.md. " +
    "Escribe el aprendizaje o registro en docs/reglas/<tema>.md (índice: docs/reglas/README.md). " +
    "Si de verdad hay que cambiar un CLAUDE.md, lo hace una persona fuera de Claude Code.";

const esClaudeMd = (p) => typeof p === "string" && /(^|[\\/])claude(\.local)?\.md$/i.test(p.trim());

let entrada = {};
try {
    entrada = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
} catch {
    process.exit(0);
}
const herramienta = entrada.tool_name ?? "";
const ti = entrada.tool_input ?? {};

function bloquear() {
    process.stderr.write(MENSAJE + "\n");
    process.exit(2);
}

// Herramientas de archivo y de GitHub.
const rutas = [ti.file_path, ti.notebook_path, ti.path, ...(Array.isArray(ti.files) ? ti.files.map((f) => f?.path) : [])];
if (herramienta !== "Bash" && rutas.some(esClaudeMd)) bloquear();

// Bash: menciona un CLAUDE.md y además escribe.
if (herramienta === "Bash" && typeof ti.command === "string") {
    const cmd = ti.command;
    if (/claude(\.local)?\.md/i.test(cmd)) {
        const limpio = cmd.replace(/\d?&?>{1,2}\s*\/dev\/null|\d>&\d/g, "");
        const escribe = [
            />/, // redirección
            /\btee\b/, /\bsed\b[^|;&]*\s-i/, /\bperl\b[^|;&]*\s-i/, /\b(mv|cp|rm|ln|install|truncate|dd|touch|rsync)\b/,
            /\b(python3?|node|ruby|perl|php|deno|bun)\b/, /\bgit\s+(checkout|restore|apply|am|mv|rm|stash\s+pop|cherry-pick|revert)\b/,
            /\bpatch\b/, /\b(ed|ex|vi|vim|nano)\b/,
        ].some((re) => re.test(limpio));
        if (escribe) bloquear();
    }
}
process.exit(0);
