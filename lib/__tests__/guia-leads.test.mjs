/**
 * El banco de la GUÍA PÚBLICA de Leads (`/guia/leads`).
 *
 * Tres cosas, y las tres son de las que se rompen solas:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las columnas, los contadores y
 *    las columnas del CSV que documenta `lib/guia-leads.ts` se comparan con
 *    las que pintan `Columns.tsx`, `FilterLeadsByStats.tsx` y
 *    `sessions-content.tsx`. Una columna nueva en la pantalla sin su paso en
 *    la guía pone esto en rojo, con el nombre de la que falta.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**: el prefijo en el middleware, `robots` en
 *    la metadata y `X-Robots-Tag` en la cabecera — el mismo sistema que la
 *    página de una Propuesta comercial.
 *
 * `MODO=roto` lee los ficheros de `ANTES_REF` (sin guía) y afirma que no
 * existía nada de esto.
 *
 * Se levanta con `scripts/banco-guia-leads.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "73f991f";

const leer = (rel) =>
    ROTO
        ? (() => {
              try {
                  return execSync(`git show ${ANTES}:${rel}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
              } catch {
                  return "";
              }
          })()
        : readFileSync(path.join(RAIZ, rel), "utf8");

if (ROTO) {
    test("ANTES no había guía pública de Leads", () => {
        assert.equal(leer("lib/guia-leads.ts"), "", "lib/guia-leads.ts ya existía en ANTES_REF");
        assert.equal(leer("app/guia/leads/page.tsx"), "", "la página ya existía en ANTES_REF");
        assert.ok(!leer("middleware.ts").includes('"/guia/"'), "el middleware ya dejaba pasar /guia/");
        assert.ok(!leer("next.config.js").includes('"/guia/:path*"'), "next.config ya ponía X-Robots-Tag a /guia");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-leads/guia-leads.mjs"));

    test("las columnas documentadas son EXACTAMENTE las de la tabla", () => {
        const columnas = leer("app/(root)/sessions/_components/Columns.tsx");
        const enLaTabla = [...columnas.matchAll(/>\s*([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s*<ArrowUpDown/g)].map((m) => m[1]);
        if (/>Acciones<\/div>/.test(columnas)) enLaTabla.push("Acciones");
        assert.deepEqual([...guia.COLUMNAS_DOCUMENTADAS], enLaTabla, "la guía y la tabla no nombran las mismas columnas, en el mismo orden");
        const pasos = guia.laSeccion("columnas").pasos.map((p) => p.titulo);
        for (const c of enLaTabla) assert.ok(pasos.includes(c), `la columna «${c}» no tiene su paso en la sección Columnas`);
    });

    test("los contadores documentados son los de la barra", () => {
        const f = leer("app/(root)/sessions/_components/FilterLeadsByStats.tsx");
        const enLaBarra = [...f.matchAll(/etiqueta:\s*"([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual([...guia.PASTILLAS_DOCUMENTADAS], enLaBarra);
        const texto = guia.laSeccion("filtros").pasos[0].texto;
        for (const e of enLaBarra) assert.ok(texto.includes(e), `el paso de los contadores no nombra «${e}»`);
    });

    test("las columnas del CSV son las que exporta la pantalla", () => {
        const s = leer("app/(root)/sessions/_components/sessions-content.tsx");
        const m = s.match(/const headers = \[([^\]]+)\]/);
        assert.ok(m, "no se encontraron las cabeceras del CSV en sessions-content.tsx");
        const enElCsv = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
        assert.deepEqual([...guia.COLUMNAS_DEL_CSV], enElCsv);
    });

    test("la guía cubre las siete partes del encargo, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "columnas", "sesion-y-agente", "filtros", "buscar", "exportar", "nuevo-contacto"]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/leads/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("nuevo-contacto").siguiente, null);
        assert.equal(guia.lasVecinas("columnas").anterior.slug, "vista-general");
    });

    test("cada paso es corto: la captura explica, el texto pone nombre", () => {
        for (const s of guia.SECCIONES) {
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 200, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "leads");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/leads/${n}`);
            const kb = statSync(path.join(dir, n)).size / 1024;
            assert.ok(kb > 5, `${n} pesa ${kb.toFixed(1)} KB: no parece una captura`);
            assert.ok(kb < 600, `${n} pesa ${kb.toFixed(0)} KB: demasiado para una página que se abre en el móvil`);
        }
        assert.deepEqual(enDisco.filter((n) => !esperadas.includes(n)), [], "capturas en disco que la guía no enseña");
        const video = path.join(RAIZ, "public", guia.VIDEO_DE_DEMOSTRACION);
        assert.ok(existsSync(video), "falta el vídeo de demostración");
        const mb = statSync(video).size / 1024 / 1024;
        assert.ok(mb > 0.1 && mb < 12, `el vídeo pesa ${mb.toFixed(1)} MB`);
    });

    test("es PÚBLICA y NO se indexa, como una propuesta comercial", () => {
        const mw = leer("middleware.ts");
        assert.match(mw, /currentPath\.startsWith\("\/guia\/"\)/, "el middleware no deja pasar /guia/ sin sesión");
        const cfg = leer("next.config.js");
        const bloque = cfg.slice(cfg.indexOf('"/guia/:path*"'));
        assert.ok(cfg.includes('"/guia/:path*"'), "next.config no tiene cabeceras para /guia");
        assert.match(bloque.slice(0, 300), /X-Robots-Tag[^\n]*noindex/);
        const layout = leer("app/guia/layout.tsx");
        assert.match(layout, /index:\s*false/);
        assert.match(layout, /PANTALLA_PUBLICA_QUE_SE_DESPLAZA/, "sin su contenedor la página no se puede desplazar");
        // Ni sesión ni acciones: pública de verdad. La ÚNICA lectura de la base
        // es la introducción editable y el WhatsApp de contacto, por dos
        // lectores que nunca tumban la página (sin base, el texto del código).
        for (const f of ["app/guia/layout.tsx", "app/guia/leads/page.tsx", "app/guia/leads/[seccion]/page.tsx", "components/guia/Guia.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const indice = leer("app/guia/leads/page.tsx");
        const lecturas = [...indice.matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
        assert.match(leer("lib/introduccion-publica.server.ts"), /catch[\s\S]*return porDefecto/, "sin base tiene que salir el texto del código");
    });
}
