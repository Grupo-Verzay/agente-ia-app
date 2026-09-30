/**
 * La ventana «Tutoriales del módulo», sin navegador:
 *
 * - Toda guía publicada en `app/guia/<modulo>` tiene su tarjeta registrada en
 *   `lib/tutoriales-del-modulo.ts`, con una ruta que existe en el menú. Es lo
 *   que hace que un hilo que publica una guía no deje su tarjeta como paso
 *   manual: si se le olvida, este banco se pone en rojo.
 * - Las tarjetas de la base y las de las guías se juntan sin repetir.
 * - Todas las tarjetas son iguales: título, descripción y «Ver tutorial» en el
 *   azul de crear, de estilo secundario. Nada de «Ver en YouTube» en rojo.
 *
 * `MODO=roto` lee la barra de ANTES_REF y afirma el fallo: el botón rojo «Ver
 * en YouTube» y ningún registro de las guías.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "7bdc404";
// Antes de la regla de la descripción: las tarjetas decían el subtítulo de la
// guía y las semillas, «Recorrido completo del módulo de X…».
const ANTES_DESCRIPCION = process.env.ANTES_DESCRIPCION_REF ?? "6d4430c";

const leer = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deGit = (f, ref = ANTES) => {
    try {
        return execFileSync("git", ["show", `${ref}:${f}`], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};

if (ROTO) {
    test("ANTES: la tarjeta llevaba el botón rojo «Ver en YouTube»", () => {
        const barra = deGit("components/custom/Breadcrumbs.tsx");
        assert.ok(barra, "no se pudo leer la barra de antes");
        assert.match(barra, /Ver en YouTube/);
        const tarjetas = barra.slice(barra.indexOf("guides.map"));
        assert.match(tarjetas, /bg-\[#FF0033\]/, "el botón de la tarjeta era un bloque rojo");
        assert.doesNotMatch(tarjetas, /Ver tutorial/);
    });
    test("ANTES: las guías de /guia no tenían ningún registro: su tarjeta era un paso manual", () => {
        assert.equal(deGit("lib/tutoriales-del-modulo.ts"), null);
        const acciones = deGit("actions/guide-actions.ts");
        assert.doesNotMatch(acciones, /juntarLosTutoriales/);
    });
    test("ANTES: la tarjeta de una guía decía su subtítulo y las semillas un texto genérico, sin tope", () => {
        const reg = deGit("lib/tutoriales-del-modulo.ts", ANTES_DESCRIPCION);
        assert.ok(reg, "no se pudo leer el registro de antes");
        assert.match(reg, /description: g\.contenido\.subtitulo/);
        assert.doesNotMatch(reg, /porQueNoValeLaDescripcion|TOPE_DE_LA_DESCRIPCION/);
        for (const m of ["leads", "catalogo", "reuniones"]) {
            assert.match(deGit(`scripts/sembrar-guia-${m}.mjs`, ANTES_DESCRIPCION), /Recorrido completo/);
        }
        assert.doesNotMatch(deGit("actions/guide-actions.ts", ANTES_DESCRIPCION), /porQueNoValeLaDescripcion/);
    });
} else {
    const {
        GUIAS_PUBLICADAS,
        TUTORIALES_DE_LAS_GUIAS,
        juntarLosTutoriales,
        BOTON_VER_TUTORIAL,
        TEXTO_DEL_BOTON,
        TOPE_DE_LA_DESCRIPCION,
        porQueNoValeLaDescripcion,
        largoDeLaDescripcion,
    } = await import("./.compilado/tutoriales/tutoriales-del-modulo.mjs");
    const { DESCRIPCIONES_DE_LOS_TUTORIALES } = await import("../../scripts/descripciones-de-los-tutoriales.mjs");
    const { navigationRoutes } = await import("./.compilado/tutoriales/navigation-routes.mjs");

    test("toda carpeta de app/guia tiene su tarjeta registrada, y ninguna de más", () => {
        const carpetas = fs
            .readdirSync(join(RAIZ, "app", "guia"), { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
            .sort();
        assert.ok(carpetas.length >= 3);
        assert.deepEqual(GUIAS_PUBLICADAS.map((g) => g.modulo).sort(), carpetas);
    });

    test("cada tarjeta de guía: ruta del menú, título, descripción y su /guia", () => {
        const rutas = new Set(navigationRoutes.map((r) => r.route));
        for (const t of TUTORIALES_DE_LAS_GUIAS) {
            assert.ok(rutas.has(t.path), `${t.path} no está en navigationRoutes`);
            assert.ok(t.title.trim().length > 0 && t.description && t.description.trim().length > 0);
            assert.match(t.url, /^\/guia\/[a-z0-9-]+$/);
        }
        assert.equal(new Set(TUTORIALES_DE_LAS_GUIAS.map((t) => t.id)).size, TUTORIALES_DE_LAS_GUIAS.length);
    });

    test("se juntan con las de la base: salen en su pantalla y en sus subpantallas, no en otras", () => {
        const leads = juntarLosTutoriales([], ["/sessions"]);
        assert.deepEqual(leads.map((t) => t.url), ["/guia/leads"]);
        assert.deepEqual(juntarLosTutoriales([], ["/diagramas", "/diagramas/abc"]).map((t) => t.url), ["/guia/diagramas"]);
        assert.deepEqual(juntarLosTutoriales([], ["/chats"]), []);
        const yt = { id: "b1", path: "/sessions", title: "Vídeo", description: null, url: "https://youtu.be/x" };
        assert.deepEqual(juntarLosTutoriales([yt], ["/sessions"]).map((t) => t.id), ["b1", "guia-leads"]);
    });

    test("si la guía ya está guardada a mano, no sale dos veces (manda la de la base)", () => {
        const aMano = { id: "b2", path: "/sessions", title: "Mi guía", description: "x", url: "https://agente.ia-app.com/guia/leads/" };
        const r = juntarLosTutoriales([aMano], ["/sessions"]);
        assert.deepEqual(r.map((t) => t.id), ["b2"]);
    });

    test("el botón es el azul de crear, de estilo secundario (fondo blanco y borde)", () => {
        assert.equal(TEXTO_DEL_BOTON, "Ver tutorial");
        const crear = leer("components/shared/BarraDeAcciones.tsx");
        assert.match(crear, /bg-blue-600/, "el botón de crear ya no es blue-600: hay que revisar este azul");
        for (const c of ["border-blue-600", "text-blue-600", "bg-white"]) assert.ok(BOTON_VER_TUTORIAL.split(/\s+/).includes(c), c);
        assert.ok(!BOTON_VER_TUTORIAL.split(/\s+/).includes("bg-blue-600"), "no es un bloque sólido");
    });

    test("barrido: la ventana ya no pinta «Ver en YouTube» ni un botón rojo en la tarjeta", () => {
        const barra = leer("components/custom/Breadcrumbs.tsx");
        assert.doesNotMatch(barra, /Ver en YouTube/);
        const tarjetas = barra.slice(barra.indexOf("guides.map"), barra.indexOf("</ScrollArea>"));
        assert.doesNotMatch(tarjetas, /#FF0033|#e60000/);
        assert.match(tarjetas, /BOTON_VER_TUTORIAL/);
        assert.match(tarjetas, /TEXTO_DEL_BOTON/);
        assert.match(tarjetas, /rel="noopener noreferrer"/);
        assert.match(leer("actions/guide-actions.ts"), /juntarLosTutoriales\(/);
    });

    test("CLAUDE.md deja escrita la regla: quien publica una guía registra su tarjeta", () => {
        const doc = leer("CLAUDE.md");
        assert.match(doc, /lib\/tutoriales-del-modulo\.ts/);
        assert.match(doc, /Tutoriales del módulo/);
    });

    // ── La descripción de una tarjeta: «Aprende a … en la plataforma», ≤ 75 ──

    test("la regla: formato «Aprende a … en la plataforma» y 75 caracteres como mucho", () => {
        assert.equal(TOPE_DE_LA_DESCRIPCION, 75);
        assert.equal(porQueNoValeLaDescripcion("Aprende a crear y gestionar tus diagramas de flujo en la plataforma"), null);
        assert.equal(porQueNoValeLaDescripcion(""), null, "vacía vale: la descripción es opcional");
        assert.equal(porQueNoValeLaDescripcion(null), null);
        assert.equal(porQueNoValeLaDescripcion("  Aprende a usar Leads en la plataforma  "), null, "los espacios de los bordes no cuentan");
        const justo = "Aprende a " + "x".repeat(75 - 10 - 17) + " en la plataforma";
        assert.equal(largoDeLaDescripcion(justo), 75);
        assert.equal(porQueNoValeLaDescripcion(justo), null, "75 justos valen");
        assert.match(porQueNoValeLaDescripcion("Aprende a " + "x".repeat(49) + " en la plataforma"), /76 caracteres/);
        assert.match(porQueNoValeLaDescripcion("Recorrido completo del módulo de Leads con video explicativo y guias"), /Aprende a/);
        assert.match(porQueNoValeLaDescripcion("Aprende cómo entrenar tu Agente IA con IA Prompts"), /Aprende a/);
        assert.match(porQueNoValeLaDescripcion("Aprende a usar Leads en la plataforma."), /Aprende a/, "sin punto final");
        assert.match(porQueNoValeLaDescripcion("Aprende a  en la plataforma"), /Aprende a/, "la acción no puede ir vacía");
        // Una tilde o una eñe cuentan uno, no dos.
        assert.equal(largoDeLaDescripcion("catálogo"), 8);
    });

    test("toda tarjeta de guía sigue la regla, dice su propia acción y no el subtítulo ni un texto genérico", () => {
        const vistas = new Set();
        for (const g of GUIAS_PUBLICADAS) {
            assert.equal(porQueNoValeLaDescripcion(g.tarjeta), null, `${g.modulo}: ${g.tarjeta}`);
            assert.notEqual(g.tarjeta, g.contenido.subtitulo);
            assert.doesNotMatch(g.tarjeta, /Recorrido completo|video explicativo/i);
            assert.ok(!vistas.has(g.tarjeta), `${g.modulo}: repite la descripción de otra guía`);
            vistas.add(g.tarjeta);
        }
        const diagramas = TUTORIALES_DE_LAS_GUIAS.find((t) => t.url === "/guia/diagramas");
        assert.equal(diagramas.description, "Aprende a crear y gestionar tus diagramas de flujo en la plataforma");
    });

    test("las descripciones corregidas de la base: antes no valían, ahora sí, y las guías dicen lo mismo en los dos sitios", () => {
        assert.ok(DESCRIPCIONES_DE_LOS_TUTORIALES.length >= 10);
        for (const d of DESCRIPCIONES_DE_LOS_TUTORIALES) {
            assert.notEqual(porQueNoValeLaDescripcion(d.antes), null, `ya valía: ${d.antes}`);
            assert.equal(porQueNoValeLaDescripcion(d.ahora), null, d.ahora);
        }
        assert.equal(new Set(DESCRIPCIONES_DE_LOS_TUTORIALES.map((d) => d.id)).size, DESCRIPCIONES_DE_LOS_TUTORIALES.length);
        // Si alguien guardó a mano la misma guía, manda la de la base: tiene que decir lo mismo.
        const porTexto = new Set(DESCRIPCIONES_DE_LOS_TUTORIALES.map((d) => d.ahora));
        for (const m of ["leads", "catalogo", "diagramas"]) {
            const g = GUIAS_PUBLICADAS.find((x) => x.modulo === m);
            assert.ok(porTexto.has(g.tarjeta), `la fila de la base de ${m} no dice lo mismo que su tarjeta`);
        }
    });

    test("barrido: crear y editar un tutorial pasan por la regla, el formulario la enseña y ninguna semilla es genérica", () => {
        const acciones = leer("actions/guide-actions.ts");
        for (const f of ["createGuide", "updateGuide"]) {
            const cuerpo = acciones.slice(acciones.indexOf(`export async function ${f}`)).split("export async function")[1];
            assert.match(cuerpo, /porQueNoValeLaDescripcion\(data\.description\)/, f);
        }
        const form = leer("app/(root)/documentation/tutorial/_components/MainTutorial.tsx");
        assert.match(form, /maxLength=\{TOPE_DE_LA_DESCRIPCION\}/);
        assert.match(form, /porQueNoValeLaDescripcion\(form\.description\)/);
        for (const m of ["leads", "catalogo", "diagramas", "reuniones"]) {
            const semilla = leer(`scripts/sembrar-guia-${m}.mjs`);
            assert.doesNotMatch(semilla, /Recorrido completo/);
            const g = GUIAS_PUBLICADAS.find((x) => x.modulo === m);
            assert.ok(semilla.includes(g.tarjeta), `la semilla de ${m} no usa la descripción de su tarjeta`);
        }
    });

    test("CLAUDE.md deja escrita la regla de la descripción: formato y 75 caracteres", () => {
        const doc = leer("CLAUDE.md");
        assert.match(doc, /Aprende a \[acción concreta\] en la plataforma/);
        assert.match(doc, /75 caracteres/);
    });
}
