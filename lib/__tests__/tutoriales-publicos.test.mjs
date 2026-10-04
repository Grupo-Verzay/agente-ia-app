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
 * 6. **La GUÍA también se abre dentro de la landing**
 *    (`#tutoriales/<categoria>/<modulo>[/<seccion>]`): «Ver» y el buscador
 *    no navegan, la vista pinta las MISMAS piezas que `/guia/<modulo>`
 *    (`components/guia/Guia.tsx`) y el contenido lo trae una acción pública
 *    que sale de `GUIAS_PUBLICADAS`. Su modo roto lee `ANTES_GUIA_REF` y
 *    afirma que «Ver» abría `/guia/<modulo>` en otra pestaña.
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
/** Antes de integrar la guía en la landing: «Ver» salía a /guia/<modulo>. */
const ANTES_GUIA = process.env.ANTES_GUIA_REF ?? "2114b64";
const deAntesDeLaGuia = (rel) => {
    try {
        return execSync(`git show "${ANTES_GUIA}:${rel}"`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
    } catch {
        return null;
    }
};
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
    // El pie empieza en su comentario: el año ya no va escrito en la landing
    // (lo pone `PieDeLasPublicas`), así que no sirve de marca.
    const pie = s.slice(s.indexOf("{/* ══ FOOTER"));
    const enElPie = [...pie.matchAll(/href="([^"]+)"[^>]*>(Funciones|Tutoriales|Precios|FAQ)</g)].map((m) => ({ href: m[1], rotulo: m[2] }));
    return { escritorio: listas[0], telefono: listas[1], pie: enElPie };
}

/** Las etiquetas de apertura de los logos: la de la barra y la del pie. */
function losLogos(s) {
    const barra = s.slice(s.indexOf("{/* ══ NAVBAR"), s.indexOf("<nav"));
    const inicio = s.indexOf("{/* ══ FOOTER");
    // Hasta el texto de los derechos si va escrito aquí (antes), o hasta el
    // cierre del componente del pie (ahora).
    const antes = s.indexOf("© {new Date().getFullYear()}", inicio);
    const pie = s.slice(inicio, antes >= 0 ? antes : s.indexOf("despues=", inicio));
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
    test("ANTES: «Ver» de una guía salía de la landing a /guia/<modulo>, en otra pestaña", () => {
        const fila = deAntesDeLaGuia("components/documentacion/FilaDeGuia.tsx");
        assert.ok(fila && /<a href=\{url\} target="_blank"/.test(fila), "ANTES «Ver» ya no era un enlace a otra pestaña");
        assert.ok(!/alVer/.test(fila), "ANTES la fila ya sabía abrir la guía en la misma página");
        const seccion = deAntesDeLaGuia("components/ayuda/TutorialesDeLaLanding.tsx");
        assert.ok(seccion && !/GuiaEnLaLanding/.test(seccion), "ANTES la landing ya pintaba la guía");
        assert.equal(deAntesDeLaGuia("components/guia/GuiaEnLaLanding.tsx"), null, "ANTES ya existía la guía incrustada");
        const buscador = deAntesDeLaGuia("components/ayuda/CentroDeAyuda.tsx");
        assert.ok(/window\.open\(url/.test(buscador), "ANTES el buscador no abría la guía en otra pestaña");
    });
} else {
    test("la guía se abre DENTRO de la landing, con las mismas piezas que /guia/<modulo>", () => {
        const seccion = leer("components/ayuda/TutorialesDeLaLanding.tsx");
        assert.ok(seccion.includes('from "@/components/guia/GuiaEnLaLanding"'), "la landing no pinta la guía");
        assert.ok(/alAbrirGuia=\{\(m\) => abrirGuia\(m\)\}/.test(seccion), "«Ver» de la categoría no abre la guía en la landing");
        assert.ok(/alAbrirGuia=\{abrirGuia\}/.test(seccion), "el buscador no abre la guía en la landing");
        const fila = leer("components/documentacion/FilaDeGuia.tsx");
        assert.ok(/alVer \? \(/.test(fila), "la fila no sabe abrir la guía sin navegar");
        // En el panel (Documentación, /ayuda) «Ver» sigue siendo el enlace de siempre.
        assert.ok(/<a href=\{url\} target="_blank" rel="noopener noreferrer" data-ver-guia>/.test(fila));
        const guia = leer("components/guia/GuiaEnLaLanding.tsx");
        for (const pieza of ["ArticuloDeLaSeccion", "CuadriculaDeSecciones", "IntroduccionDeLaGuia", "FinDeLaGuia", "CONTENEDOR_DEL_INDICE"]) {
            assert.ok(guia.includes(pieza), `la guía incrustada no usa ${pieza}`);
        }
        assert.ok(guia.includes("laGuiaPublicaAction"), "la guía incrustada no pide su contenido");
        const codigo = guia.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        assert.ok(!/GUIAS_PUBLICADAS|lib\/guia-[a-z]/.test(codigo), "la guía incrustada carga el contenido de las guías en el navegador");
        assert.ok(/alVerElVideo=/.test(guia) && /alAbrirSeccion=/.test(guia), "secciones o vídeo navegan fuera de la vista");
        // La acción sale de la MISMA lista que publica las guías, y es pública.
        const accion = leer("actions/guia-publica-actions.ts");
        assert.ok(accion.startsWith('"use server"'));
        assert.ok(/GUIAS_PUBLICADAS\.find\(\(g\) => g\.modulo === modulo\)/.test(accion));
        assert.ok(/laIntroduccionPublica\(/.test(accion) && /elContactoDeLaGuia\(/.test(accion));
        assert.ok(!/currentUser/.test(accion), "la acción pide sesión y la landing no la tiene");
        // Las páginas /guia siguen con su Link de siempre.
        const piezas = leer("components/guia/Guia.tsx");
        assert.ok(/<Link href=\{href\}/.test(piezas));
    });

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
        // Una dirección `/guia/…` escrita aquí (no el import de `@/components/guia/…`).
        assert.ok(!/GUIAS_PUBLICADAS|CATEGORIAS_DE_AYUDA|["'`]\/guia\//.test(codigo), "la sección arma su propia lista");
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

        // La vista entera, con la guía y su sección.
        const guias = (await import(path.join(C, "guias-del-centro-de-ayuda.mjs"))).lasGuiasDelCentroDeAyuda();
        const g = guias.find((x) => x.categoria);
        const sec = g.secciones[1].slug;
        const V = (cat, mod = null, s = null) => ({ categoria: cat, modulo: mod, seccion: s });
        assert.deepEqual(t.laVistaDelAncla("#tutoriales", guias), V(null));
        assert.deepEqual(t.laVistaDelAncla(`#tutoriales/${g.categoria}`, guias), V(g.categoria));
        assert.deepEqual(t.laVistaDelAncla(`#tutoriales/${g.categoria}/${g.modulo}`, guias), V(g.categoria, g.modulo));
        assert.deepEqual(t.laVistaDelAncla(`#tutoriales/${g.categoria}/${g.modulo}/${sec}`, guias), V(g.categoria, g.modulo, sec));
        assert.deepEqual(t.laVistaDelAncla(`#tutoriales/${g.categoria}/${g.modulo}/no-existe`, guias), V(g.categoria, g.modulo), "una sección que no existe es el índice");
        assert.deepEqual(t.laVistaDelAncla(`#tutoriales/${g.categoria}/no-existe`, guias), V(g.categoria), "una guía que no existe es su categoría");
        const otra = ["panel", "bandeja", "contactos", "herramientas"].find((c) => c !== g.categoria);
        assert.deepEqual(t.laVistaDelAncla(`#tutoriales/${otra}/${g.modulo}`, guias), V(otra), "una guía de OTRA categoría no se abre ahí");
        assert.deepEqual(t.laVistaDelAncla("#tutoriales/no-existe/leads", guias), V(null));
        assert.equal(t.laVistaDelAncla("#faq", guias), undefined);
        for (const v of [V(null), V(g.categoria), V(g.categoria, g.modulo), V(g.categoria, g.modulo, sec)]) {
            assert.deepEqual(t.laVistaDelAncla(t.elAnclaDeLaVista(v), guias), v, `ida y vuelta de ${JSON.stringify(v)}`);
        }
    });
}
