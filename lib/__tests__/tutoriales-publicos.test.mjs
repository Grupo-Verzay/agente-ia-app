/**
 * «Tutoriales» DENTRO de la landing (`/inicio#tutoriales`), sin navegador.
 *
 * Lo que se comprueba:
 *
 * 1. **Es una sección anclada de la landing**, como Preguntas frecuentes: el
 *    menú lleva a `#tutoriales` (no a una página aparte) entre «Funciones» y
 *    «Precios», en sus tres sitios —la barra, el menú del teléfono y el pie—,
 *    y la sección existe con ese `id`.
 * 2. **El logo lleva siempre al inicio de la landing** (`#inicio`, el `id` del
 *    principio de la página), en la barra y en el pie. Antes no era un enlace.
 * 3. **No es una copia**: la sección pinta los MISMOS componentes del centro
 *    de ayuda (`CentroDeAyuda`, `GuiasDeLaCategoria`) con la MISMA fuente
 *    (`lasGuiasDelCentroDeAyuda`) que `/ayuda`.
 * 4. **Las direcciones viejas no se rompen**: `/tutoriales` y
 *    `/tutoriales/<categoria>` redirigen a la landing con su ancla, y siguen
 *    sin pedir sesión.
 * 5. **El ancla** (`laCategoriaDelAncla`, pura) decide la vista.
 *
 * `MODO=roto` lee el código de `ANTES_REF` —pinchado a un commit— y afirma el
 * fallo: el menú llevaba a la página aparte `/tutoriales` y el logo no era un
 * enlace al inicio.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "ffe0583";
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

/** Los enlaces de cada lista del menú, en el orden en que se pintan. */
function losMenusDeLaLanding(s) {
    const listas = [...s.matchAll(/\{\[(\["[^"]+","[^"]+"\](?:,\["[^"]+","[^"]+"\])*)\]/g)].map((m) =>
        [...m[1].matchAll(/\["([^"]+)","([^"]+)"\]/g)].map((x) => ({ href: x[1], rotulo: x[2] })),
    );
    const pie = s.slice(s.indexOf("© {new Date().getFullYear()}"));
    const enElPie = [...pie.matchAll(/href="([^"]+)"[^>]*>(Funciones|Tutoriales|Precios|FAQ)</g)].map((m) => ({ href: m[1], rotulo: m[2] }));
    return { escritorio: listas[0], telefono: listas[1], pie: enElPie };
}

/** Las etiquetas de apertura de los logos: la de la barra y la del pie. */
function losLogos(s) {
    const barra = s.slice(s.indexOf("{/* ══ NAVBAR"), s.indexOf("<nav"));
    const pie = s.slice(s.indexOf("{/* ══ FOOTER"), s.indexOf("© {new Date().getFullYear()}"));
    return { barra, pie };
}

if (ROTO) {
    test("ANTES: «Tutoriales» llevaba a una página APARTE, fuera de la landing", () => {
        const s = leer(LANDING);
        assert.ok(s, "no se pudo leer la landing de antes");
        const m = losMenusDeLaLanding(s);
        for (const [donde, lista] of Object.entries(m)) {
            const t = lista.find((x) => x.rotulo === "Tutoriales");
            assert.ok(t, `ANTES no había Tutoriales en ${donde}`);
            assert.equal(t.href, "/tutoriales", `${donde}: ANTES ya era un ancla (${t.href})`);
        }
        assert.ok(!/id="tutoriales"/.test(s), "ANTES ya había una sección #tutoriales");
    });
    test("ANTES: el logo de la landing no llevaba al inicio", () => {
        const { barra, pie } = losLogos(leer(LANDING));
        for (const [donde, trozo] of Object.entries({ barra, pie })) {
            assert.ok(!/<a\b|<Link\b/.test(trozo), `${donde}: ANTES el logo ya era un enlace`);
        }
    });
    test("ANTES: /tutoriales era una página con su propio logo hacia «/» (el login sin sesión)", () => {
        const layout = leer("app/tutoriales/layout.tsx");
        assert.ok(layout && /<Link href="\/"/.test(layout), "ANTES el logo de /tutoriales no iba a «/»");
        assert.ok(leer("app/tutoriales/page.tsx").includes("<CentroDeAyuda"), "ANTES /tutoriales no pintaba el centro de ayuda");
    });
} else {
    test("es una sección anclada: el menú lleva a #tutoriales entre Funciones y Precios, en sus tres sitios", () => {
        const s = leer(LANDING);
        const m = losMenusDeLaLanding(s);
        for (const [donde, lista] of Object.entries(m)) {
            const rotulos = lista.map((x) => x.rotulo);
            const i = rotulos.indexOf("Funciones");
            assert.ok(i >= 0 && rotulos[i + 1] === "Tutoriales" && rotulos[i + 2] === "Precios", `${donde}: ${JSON.stringify(rotulos)}`);
            assert.equal(lista[i + 1].href, "#tutoriales", `${donde}: Tutoriales lleva a ${lista[i + 1].href}`);
        }
        assert.ok(/<section id="tutoriales"/.test(s), "la landing no tiene la sección #tutoriales");
        assert.ok(s.indexOf('<section id="tutoriales"') < s.indexOf('<section id="pricing"'), "Tutoriales tiene que ir antes que Precios");
        assert.ok(!/href="\/tutoriales|"\/tutoriales"/.test(s), "la landing sigue llevando a la página aparte");
    });

    test("el logo lleva al inicio de la landing, en la barra y en el pie", () => {
        const s = leer(LANDING);
        const { barra, pie } = losLogos(s);
        for (const [donde, trozo] of Object.entries({ barra, pie })) {
            assert.ok(/<a\s[^>]*href=\{`#\$\{ANCLA_DEL_INICIO\}`\}[^>]*onClick=\{volverAlInicio\}/.test(trozo), `${donde}: el logo no lleva al inicio`);
        }
        assert.ok(/<div id=\{ANCLA_DEL_INICIO\}/.test(s), "el principio de la landing no tiene su id");
    });

    test("no es una copia: los mismos componentes y la misma fuente que /ayuda", () => {
        const seccion = leer("components/ayuda/TutorialesDeLaLanding.tsx");
        assert.ok(seccion.includes('from "@/components/ayuda/CentroDeAyuda"'));
        assert.ok(seccion.includes('from "@/components/ayuda/GuiasDeLaCategoria"'));
        assert.ok(/className="dark\b/.test(seccion), "la sección no toma los colores oscuros de la landing");
        const codigo = seccion.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        assert.ok(!/GUIAS_PUBLICADAS|CATEGORIAS_DE_AYUDA|\/guia\//.test(codigo), "la sección arma su propia lista");
        for (const rel of ["app/(public)/inicio/page.tsx", "app/(root)/ayuda/page.tsx"]) {
            assert.ok(leer(rel).includes("lasGuiasDelCentroDeAyuda()"), `${rel} no lee la fuente común`);
        }
        assert.ok(leer(LANDING).includes("<TutorialesDeLaLanding guias={guiasDeAyuda} />"));
        // En el panel, las categorías siguen siendo enlaces a /ayuda/<categoria>.
        assert.ok(leer("components/ayuda/CentroDeAyuda.tsx").includes("elEnlaceDeLaCategoria(c.slug, raiz)"));
        assert.ok(leer("components/ayuda/GuiasDeLaCategoria.tsx").includes("href: raiz"));
    });

    test("las direcciones viejas redirigen a la landing y siguen sin pedir sesión", () => {
        assert.equal(leer("app/tutoriales/layout.tsx"), null, "/tutoriales sigue teniendo su propio marco");
        for (const rel of ["app/tutoriales/page.tsx", "app/tutoriales/[categoria]/page.tsx"]) {
            const s = leer(rel);
            assert.ok(/redirect\(elEnlaceDeTutoriales\(/.test(s), `${rel} no redirige a la landing`);
            assert.ok(!/<CentroDeAyuda|<GuiasDeLaCategoria/.test(s), `${rel} sigue pintando una página aparte`);
        }
        const mw = leer("middleware.ts");
        assert.ok(mw.includes('currentPath === "/tutoriales"') && mw.includes('currentPath.startsWith("/tutoriales/")'));
    });

    test("el ancla decide la vista, y las redirecciones llevan a la landing", async () => {
        const t = await import(path.join(C, "tutoriales-de-la-landing.mjs"));
        assert.equal(t.laCategoriaDelAncla("#tutoriales"), null);
        assert.equal(t.laCategoriaDelAncla("#tutoriales/panel"), "panel");
        assert.equal(t.laCategoriaDelAncla("#tutoriales/panel/"), "panel");
        assert.equal(t.laCategoriaDelAncla("#tutoriales/no-existe"), null, "una que no existe es la portada");
        assert.equal(t.laCategoriaDelAncla("#faq"), undefined, "un ancla de otra sección no se toca");
        assert.equal(t.laCategoriaDelAncla(""), undefined);
        assert.equal(t.laCategoriaDelAncla("#tutorialesx"), undefined);
        assert.equal(t.laCategoriaDelAncla("#%E0"), undefined, "un % suelto no revienta");
        assert.equal(t.elAnclaDeLaCategoria("bandeja"), "#tutoriales/bandeja");
        assert.equal(t.elEnlaceDeTutoriales(), "/inicio#tutoriales");
        assert.equal(t.elEnlaceDeTutoriales("contactos"), "/inicio#tutoriales/contactos");
        assert.equal(t.elEnlaceDeTutoriales("no-existe"), "/inicio#tutoriales");
    });
}
