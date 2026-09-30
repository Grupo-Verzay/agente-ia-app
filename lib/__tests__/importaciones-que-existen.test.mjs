// Banco: todo lo que se importa por nombre entre ficheros del repo EXISTE en
// el fichero del que se importa.
//
// Es lo que tumbó el despliegue del #1000 sin que el #1000 tuviera nada que
// ver: el #998 (reagendar) importaba `losRecordatoriosDeLaCita` de
// `@/lib/cita-publica`, y el #999 —fusionado un minuto antes— la había mudado
// a `@/lib/recordatorios-de-la-cita`. Cada PR compilaba por su lado; juntos,
// `next build` se caía en «Checking validity of types» y la imagen no salía.
// Los dos PR siguientes heredaron el fallo, y el que se veía rojo era el del
// panel lateral.
//
// Esto no espera al build de siete minutos: lee el código, resuelve cada
// `import { … } from "@/…"` y `"./…"` a su fichero y exige que el nombre esté
// exportado ahí. Un `export *` hace que el fichero se dé por bueno (no se
// sigue la cadena): mejor callar que cantar un fallo que no existe.
//
// MODO=roto: lee el árbol del commit que se fusionó roto (0583de4, pinchado:
// nunca `origin/main`, que pasa a ser el «ahora» en cuanto esto se fusione) y
// AFIRMA que el banco caza el import que tumbó el build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const ROTO = process.env.MODO === "roto";
const REF_ROTA = process.env.REF_ROTA || "0583de4";
const CARPETAS = ["app", "lib", "actions", "components", "hooks", "src", "types", "schema", "middleware.ts"];
const EXTENSIONES = [".ts", ".tsx", ".js", ".mjs", ".jsx"];

/** Un árbol: la lista de ficheros y cómo leer cada uno (de disco o de git). */
function elArbol() {
    if (!ROTO) {
        const ficheros = [];
        const recorrer = (rel) => {
            const abs = path.join(RAIZ, rel);
            if (!fs.existsSync(abs)) return;
            const st = fs.statSync(abs);
            if (st.isFile()) return void ficheros.push(rel);
            for (const nombre of fs.readdirSync(abs)) {
                if (nombre === "node_modules" || nombre === "__tests__" || nombre.startsWith(".")) continue;
                recorrer(path.join(rel, nombre));
            }
        };
        CARPETAS.forEach(recorrer);
        return { ficheros: new Set(ficheros), leer: (f) => fs.readFileSync(path.join(RAIZ, f), "utf8") };
    }
    const lista = execFileSync("git", ["ls-tree", "-r", "--name-only", REF_ROTA, ...CARPETAS], { cwd: RAIZ, encoding: "utf8" })
        .split("\n")
        .filter((f) => f && !f.includes("__tests__") && !f.split("/").some((t) => t.startsWith(".")));
    return {
        ficheros: new Set(lista),
        leer: (f) => execFileSync("git", ["show", `${REF_ROTA}:${f}`], { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 << 20 }),
    };
}

function resolver(desde, spec, ficheros) {
    let base;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith("./") || spec.startsWith("../")) base = path.posix.normalize(path.posix.join(path.posix.dirname(desde), spec));
    else return null;
    const candidatos = [base, ...EXTENSIONES.map((e) => base + e), ...EXTENSIONES.map((e) => `${base}/index${e}`)];
    return candidatos.find((c) => ficheros.has(c) && EXTENSIONES.some((e) => c.endsWith(e))) ?? null;
}

// Se lee con el propio compilador de TypeScript, no con expresiones: un `/*`
// dentro de una cadena («/api/*») se comería medio fichero y el banco cantaría
// fallos que no existen.
const require = createRequire(import.meta.url);
const ts = require("typescript");

function elArbolDe(codigo, nombre) {
    return ts.createSourceFile(nombre, codigo, ts.ScriptTarget.Latest, false, nombre.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

const tieneExport = (n) => (ts.getModifiers?.(n) ?? n.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const tieneDefault = (n) => (ts.getModifiers?.(n) ?? n.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

/**
 * Los nombres que declara una variable, también desestructurada:
 * `export const { laSeccion, lasVecinas } = GUIA` exporta esos dos, y sin
 * recorrer el patrón el banco cantaba como inexistentes los de todas las guías.
 */
function losNombresDe(nombre, salida) {
    if (ts.isIdentifier(nombre)) return void salida.add(nombre.text);
    for (const el of nombre.elements ?? []) if (!ts.isOmittedExpression(el)) losNombresDe(el.name, salida);
}

/** Los nombres que exporta un fichero, o `null` si lleva un `export *` (no se sigue). */
function lasExportaciones(codigo, nombre) {
    const sf = elArbolDe(codigo, nombre);
    const nombres = new Set();
    for (const st of sf.statements) {
        if (ts.isExportDeclaration(st)) {
            if (!st.exportClause) return null; // export * from
            if (ts.isNamedExports(st.exportClause)) for (const e of st.exportClause.elements) nombres.add(e.name.text);
            else return null; // export * as x
            continue;
        }
        if (ts.isExportAssignment(st)) { nombres.add("default"); continue; }
        if (!tieneExport(st)) continue;
        if (tieneDefault(st)) nombres.add("default");
        if (ts.isVariableStatement(st)) {
            for (const d of st.declarationList.declarations) losNombresDe(d.name, nombres);
        } else if (st.name && ts.isIdentifier(st.name)) nombres.add(st.name.text);
    }
    return nombres;
}

/** Los `import { … } from "x"` de un fichero, con el nombre de la IZQUIERDA del `as`. */
function lasImportaciones(codigo, nombre) {
    const sf = elArbolDe(codigo, nombre);
    const salida = [];
    for (const st of sf.statements) {
        if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
        const nb = st.importClause?.namedBindings;
        if (!nb || !ts.isNamedImports(nb)) continue;
        salida.push({ spec: st.moduleSpecifier.text, nombres: nb.elements.map((e) => (e.propertyName ?? e.name).text) });
    }
    return salida;
}

function losQueFaltan() {
    const { ficheros, leer } = elArbol();
    const cache = new Map();
    const exportsDe = (f) => {
        if (!cache.has(f)) cache.set(f, lasExportaciones(leer(f), f));
        return cache.get(f);
    };
    const faltan = [];
    for (const f of ficheros) {
        if (!/\.(tsx?|mjs|jsx?)$/.test(f) || f.endsWith(".d.ts")) continue;
        for (const { spec, nombres } of lasImportaciones(leer(f), f)) {
            const destino = resolver(f, spec, ficheros);
            if (!destino) continue;
            const exp = exportsDe(destino);
            if (!exp) continue;
            for (const n of nombres) if (!exp.has(n)) faltan.push(`${f}: «${n}» no lo exporta ${destino}`);
        }
    }
    return faltan;
}

if (!ROTO) {
    test("todo lo que se importa por nombre entre ficheros del repo está exportado ahí", () => {
        const faltan = losQueFaltan();
        assert.deepEqual(faltan, [], `imports que no existen:\n${faltan.join("\n")}`);
    });

    test("la reprogramación de reagendar sale de la MISMA regla que agendar", () => {
        const s = fs.readFileSync(path.join(RAIZ, "lib/reagendar-cita.server.ts"), "utf8");
        assert.match(s, /from "@\/lib\/recordatorios-de-la-cita"/);
        assert.match(s, /laLlaveDelRecordatorio\(/, "lleva la llave única, como al agendar");
        assert.match(s, /laZonaDeLaCuenta\(/, "la hora del texto en la zona de la cuenta");
        assert.doesNotMatch(s, /from "@\/lib\/cita-publica"/, "cita-publica ya no tiene los recordatorios");
    });

    test("editar la hora de una cita reprograma UNA vez, no dos", () => {
        const s = fs.readFileSync(path.join(RAIZ, "actions/appointments-actions.ts"), "utf8");
        const i = s.indexOf("export async function updateAppointmentDetails");
        const fin = s.indexOf("\nexport ", i + 10);
        const cuerpo = s.slice(i, fin);
        assert.equal((cuerpo.match(/reprogramarLosRecordatoriosDeLaCita\(/g) ?? []).length, 1);
        assert.doesNotMatch(cuerpo, /(?<!re)programarLosRecordatoriosDeLaCita\(/, "ni un segundo camino que borre y cree");
    });
} else {
    test(`ANTES (${REF_ROTA}): el import roto que tumbó el build se caza`, () => {
        const faltan = losQueFaltan();
        assert.ok(
            faltan.some((l) => l.startsWith("lib/reagendar-cita.server.ts") && l.includes("losRecordatoriosDeLaCita")),
            `no cazó el import roto; encontró:\n${faltan.join("\n")}`,
        );
    });
}
