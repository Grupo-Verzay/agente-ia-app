/**
 * «Tutoriales» del menú de la landing (`/tutoriales`), sin navegador.
 *
 * Lo que se comprueba:
 *
 * 1. **El menú de la landing lleva «Tutoriales» entre «Funciones» y
 *    «Precios»**, en sus tres sitios: la barra de escritorio, el menú del
 *    teléfono y el pie.
 * 2. **Es pública**: el middleware deja pasar `/tutoriales` y sus categorías
 *    sin sesión.
 * 3. **No es una copia**: las dos páginas pintan los MISMOS componentes del
 *    centro de ayuda (`CentroDeAyuda`, `GuiasDeLaCategoria`) con la MISMA
 *    fuente (`lasGuiasDelCentroDeAyuda`), y no hay en `app/tutoriales` ni una
 *    lista de guías ni de categorías escrita a mano.
 * 4. **Los enlaces de la categoría cuelgan de su puerta**: desde la landing,
 *    `/tutoriales/<categoria>` (no `/ayuda`, que manda al login); desde el
 *    panel, `/ayuda/<categoria>` como siempre.
 *
 * `MODO=roto` lee el código de `ANTES_REF` —pinchado a un commit— y afirma que
 * no había nada de esto.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "3992838";
const C = path.join(RAIZ, "lib/__tests__/.compilado/tutoriales-publicos");

const LANDING = "app/(public)/inicio/_components/LandingClient.tsx";
const leer = (rel) => {
    if (!ROTO) return existsSync(path.join(RAIZ, rel)) ? readFileSync(path.join(RAIZ, rel), "utf8") : null;
    try {
        return execSync(`git show "${ANTES}:${rel}"`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
    } catch {
        return null;
    }
};

/** Los rótulos de cada lista del menú, en el orden en que se pintan. */
function losMenusDeLaLanding(s) {
    const listas = [...s.matchAll(/\{\[(\["[^"]+","[^"]+"\](?:,\["[^"]+","[^"]+"\])*)\]/g)].map((m) =>
        [...m[1].matchAll(/\["([^"]+)","([^"]+)"\]/g)].map((x) => x[2]),
    );
    const pie = s.slice(s.indexOf("© {new Date().getFullYear()}"));
    const enElPie = [...pie.matchAll(/>(Funciones|Tutoriales|Precios|FAQ)</g)].map((m) => m[1]);
    return { escritorio: listas[0], telefono: listas[1], pie: enElPie };
}

const entreFuncionesYPrecios = (lista) => {
    const i = lista.indexOf("Funciones");
    return i >= 0 && lista[i + 1] === "Tutoriales" && lista[i + 2] === "Precios";
};

if (ROTO) {
    test("ANTES: la landing no tenía «Tutoriales»", () => {
        const s = leer(LANDING);
        assert.ok(s, "no se pudo leer la landing de antes");
        const m = losMenusDeLaLanding(s);
        for (const [donde, lista] of Object.entries(m)) assert.ok(!lista.includes("Tutoriales"), `ANTES ya había Tutoriales en ${donde}`);
    });
    test("ANTES: no había página pública ni el middleware la dejaba pasar", () => {
        assert.equal(leer("app/tutoriales/page.tsx"), null);
        assert.ok(!leer("middleware.ts").includes('"/tutoriales"'), "ANTES el middleware ya abría /tutoriales");
        assert.ok(!leer("lib/centro-de-ayuda.ts").includes("RUTA_PUBLICA_DE_TUTORIALES"));
    });
} else {
    test("el menú de la landing: «Tutoriales» entre «Funciones» y «Precios» en sus tres sitios", () => {
        const m = losMenusDeLaLanding(leer(LANDING));
        for (const [donde, lista] of Object.entries(m)) {
            assert.ok(entreFuncionesYPrecios(lista), `${donde}: ${JSON.stringify(lista)}`);
        }
        assert.ok(/\["\/tutoriales","Tutoriales"\]/.test(leer(LANDING)), "el menú no lleva a /tutoriales");
        assert.ok(/href="\/tutoriales"[^>]*>Tutoriales</.test(leer(LANDING)), "el pie no lleva a /tutoriales");
    });

    test("es pública: el middleware deja pasar /tutoriales y sus categorías", () => {
        const s = leer("middleware.ts");
        assert.ok(s.includes('currentPath === "/tutoriales"'));
        assert.ok(s.includes('currentPath.startsWith("/tutoriales/")'));
    });

    test("no es una copia: los mismos componentes y la misma fuente que /ayuda", () => {
        const portada = leer("app/tutoriales/page.tsx");
        const categoria = leer("app/tutoriales/[categoria]/page.tsx");
        const ayuda = leer("app/(root)/ayuda/page.tsx");
        for (const [nombre, s] of [["portada", portada], ["categoria", categoria], ["ayuda", ayuda]]) {
            assert.ok(s.includes("lasGuiasDelCentroDeAyuda()"), `${nombre} no lee la fuente común`);
        }
        assert.ok(portada.includes('from "@/components/ayuda/CentroDeAyuda"'));
        assert.ok(categoria.includes('from "@/components/ayuda/GuiasDeLaCategoria"'));
        assert.ok(portada.includes("raiz={RUTA_PUBLICA_DE_TUTORIALES}") && categoria.includes("raiz={RUTA_PUBLICA_DE_TUTORIALES}"));
        // Nada escrito a mano: ni guías, ni categorías, ni enlaces a /guia/.
        const dir = path.join(RAIZ, "app/tutoriales");
        const todo = readdirSync(dir, { recursive: true })
            .filter((f) => String(f).endsWith(".tsx"))
            .map((f) => readFileSync(path.join(dir, String(f)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1"))
            .join("\n");
        assert.ok(!/\/guia\//.test(todo), "app/tutoriales escribe enlaces a guías a mano");
        assert.ok(!/GUIAS_PUBLICADAS|CATEGORIAS_DE_AYUDA/.test(todo), "app/tutoriales arma su propia lista");
    });

    test("los enlaces de cada categoría cuelgan de SU puerta", async () => {
        const ayuda = await import(path.join(C, "centro-de-ayuda.mjs"));
        assert.equal(ayuda.RUTA_PUBLICA_DE_TUTORIALES, "/tutoriales");
        assert.equal(ayuda.elEnlaceDeLaCategoria("bandeja"), "/ayuda/bandeja");
        assert.equal(ayuda.elEnlaceDeLaCategoria("bandeja", ayuda.RUTA_PUBLICA_DE_TUTORIALES), "/tutoriales/bandeja");
        const portada = leer("components/ayuda/CentroDeAyuda.tsx");
        assert.ok(portada.includes("elEnlaceDeLaCategoria(c.slug, raiz)"), "la portada no pasa su raíz");
        assert.ok(leer("components/ayuda/GuiasDeLaCategoria.tsx").includes("href: raiz"), "la flecha no vuelve a su raíz");
    });
}
