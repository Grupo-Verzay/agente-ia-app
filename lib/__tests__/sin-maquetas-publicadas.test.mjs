/**
 * Ninguna maqueta se publica en la plataforma.
 *
 * `/ia/maqueta` quedó servida en el dominio real (#1096): una pantalla de
 * prueba, sin guardar nada, al alcance de cualquiera con sesión. Las maquetas
 * y pruebas visuales se enseñan en el hilo de la conversación, nunca como una
 * ruta de la App.
 *
 * Lo que se comprueba:
 *   1. **Barrido**: ninguna carpeta ni fichero de `app/` se llama «maqueta» o
 *      «mockup», y nada importa ya `lib/maqueta-del-paso`.
 *   2. **Lo que el editor de verdad usaba se conserva**: los campos del caso,
 *      el de la transición y la lista de pasos viven ahora en
 *      `lib/casos-y-transicion-del-paso` con EXACTAMENTE los mismos valores
 *      que tenían (comparados con los de `ANTES_REF`, compilados de git).
 *   3. **El build no la sirve**: si hay `.next`, la ruta no está en el
 *      manifiesto de páginas.
 *
 * `MODO=roto` lee el árbol de `ANTES_REF` y AFIRMA que allí la maqueta
 * existía y se servía. Se levanta con `scripts/banco-sin-maquetas.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "df810cd";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const PROHIBIDO = /(^|\/)[^/]*(maqueta|mockup)[^/]*(\/|$)/i;

const ficherosDe = (ref) =>
    ref
        ? execSync(`git ls-tree -r --name-only ${ref}`, { cwd: RAIZ, maxBuffer: 64 << 20 }).toString().split("\n").filter(Boolean)
        : execSync(`git ls-files --cached --others --exclude-standard`, { cwd: RAIZ, maxBuffer: 64 << 20 })
              .toString()
              .split("\n")
              .filter((f) => f && fs.existsSync(join(RAIZ, f)));

const leer = (ref, rel) =>
    ref
        ? execSync(`git show ${ref}:${JSON.stringify(rel)}`, { cwd: RAIZ, maxBuffer: 64 << 20 }).toString()
        : fs.readFileSync(join(RAIZ, rel), "utf8");

const rutasDeMaqueta = (ref) => ficherosDe(ref).filter((f) => f.startsWith("app/") && PROHIBIDO.test(f));
const importanLaMaqueta = (ref) =>
    ficherosDe(ref)
        .filter((f) => /^(app|components|lib|actions|hooks)\/.*\.(ts|tsx|js|mjs)$/.test(f) && !f.startsWith("lib/__tests__/"))
        .filter((f) => /from ["']@\/lib\/maqueta-del-paso["']/.test(leer(ref, f)));

if (ROTO) {
    test("ROTO: en el «antes» la maqueta estaba publicada en /ia/maqueta", () => {
        const rutas = rutasDeMaqueta(ANTES);
        assert.ok(rutas.includes("app/(root)/ia/maqueta/page.tsx"), `no estaba: ${rutas.join(", ")}`);
        assert.ok(importanLaMaqueta(ANTES).length >= 3, "el editor no colgaba de la maqueta");
    });
} else {
    test("ninguna ruta de la App se llama maqueta o mockup", () => {
        assert.deepEqual(rutasDeMaqueta(null), []);
        assert.equal(fs.existsSync(join(RAIZ, "app/(root)/ia/maqueta")), false);
    });

    test("nada importa ya lib/maqueta-del-paso", () => {
        assert.deepEqual(importanLaMaqueta(null), []);
        assert.equal(fs.existsSync(join(RAIZ, "lib/maqueta-del-paso.ts")), false);
    });

    test("las tarjetas del editor siguen con sus campos de siempre", async () => {
        const hoy = await import("./.compilado/casos-y-transicion-del-paso.mjs");
        const antes = await import("./.compilado/maqueta-del-paso-antes.mjs");
        assert.deepEqual(hoy.CAMPOS_DEL_CASO, antes.CAMPOS_DEL_CASO);
        assert.deepEqual(hoy.CAMPO_DE_LA_TRANSICION, antes.CAMPO_DE_LA_TRANSICION);
        const pasos = [{ id: "a", titulo: "Bienvenida" }, { id: "b", titulo: "Datos" }, { id: "c", titulo: " " }];
        assert.deepEqual(hoy.pasosParaLaTransicion(pasos, "b"), antes.pasosParaLaTransicion(pasos, "b"));
        const usa = {
            "app/(root)/ai/_components/action-steeps/CasoCard.tsx": "CAMPOS_DEL_CASO",
            "app/(root)/ai/_components/action-steeps/TransicionCard.tsx": "CAMPO_DE_LA_TRANSICION",
            "app/(root)/ai/_components/action-steeps/ElementRenderer.tsx": "pasosParaLaTransicion",
        };
        for (const [f, nombre] of Object.entries(usa)) {
            assert.match(leer(null, f), new RegExp(`import \\{ ${nombre} \\} from "@/lib/casos-y-transicion-del-paso"`), f);
        }
    });

    test("el build no sirve /ia/maqueta", (t) => {
        const manifiesto = join(RAIZ, ".next/server/app-paths-manifest.json");
        if (!fs.existsSync(manifiesto)) return t.skip("sin build (.next)");
        const rutas = Object.keys(JSON.parse(fs.readFileSync(manifiesto, "utf8")));
        assert.deepEqual(rutas.filter((r) => PROHIBIDO.test(r)), []);
        assert.ok(rutas.some((r) => r.startsWith("/(root)/ia/")), "el manifiesto no trae /ia: build raro");
    });
}
