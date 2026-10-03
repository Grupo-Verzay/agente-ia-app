/**
 * El banco de la GUÍA PÚBLICA de Informes (`/guia/informes`).
 *
 * Las mismas cosas que las demás guías, y por el mismo motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las vistas del CRM, los
 *    periodos, las opciones de cuentas, los mandos de la barra, los estados del
 *    filtro y las trece secciones con sus tarjetas se leen de
 *    `CrmDashboard.tsx`, `AnalyticsView.tsx`, `SelectorDeCuentas.tsx` y
 *    `lib/secciones-de-informes.ts`.
 * 2. **Lo que se arregló en la pantalla al documentarla**: el buscador filtra
 *    secciones de verdad, cada sección se pliega por su título y se recuerda,
 *    y el menú «Secciones» y la cabecera dicen el MISMO nombre.
 * 3. **Cada imagen que la guía enseña existe**, y no sobra ninguna.
 * 4. **Es pública, no toca la base y sus dos páginas son las de Leads.**
 * 5. **Su tarjeta en «Tutoriales del módulo».**
 *
 * `MODO=roto` lee los ficheros de `ANTES_INFORMES_REF` —pinchado, nunca
 * `origin/main`— y afirma que no había guía, que el buscador no filtraba nada
 * y que las secciones no se plegaban.
 *
 * Se levanta con `scripts/banco-guia-informes.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_INFORMES_REF ?? "84f98e5";

const TABLERO = "app/(root)/crm/dashboard/components/CrmDashboard.tsx";
const ANALITICAS = "app/(root)/crm/dashboard/components/AnalyticsView.tsx";
const CUENTAS = "components/shared/SelectorDeCuentas.tsx";

const leer = (rel) =>
    ROTO
        ? (() => {
              try {
                  return execSync(`git show ${ANTES}:${JSON.stringify(rel)}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
              } catch {
                  return "";
              }
          })()
        : readFileSync(path.join(RAIZ, rel), "utf8");

if (ROTO) {
    test("ANTES no había guía pública de Informes", () => {
        assert.equal(leer("lib/guia-informes.ts"), "", "lib/guia-informes.ts ya existía");
        assert.equal(leer("app/guia/informes/page.tsx"), "", "la página ya existía");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_INFORMES_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/modulo: "informes"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba");
    });

    test("ANTES el buscador no filtraba nada y las secciones no se plegaban", () => {
        const a = leer(ANALITICAS);
        assert.ok(a.length > 0, "no está AnalyticsView en ANTES");
        assert.equal(leer("lib/secciones-de-informes.ts"), "", "las reglas comunes ya existían");
        assert.ok(!a.includes("laSeccionPasaLaBusqueda"), "el buscador ya filtraba");
        assert.ok(!a.includes("data-seccion-de-informes"), "las secciones ya eran plegables");
        assert.ok(!a.includes('data-zona="buscador"'), "la barra ya exponía sus marcas");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-informes/guia-informes.mjs"));
    const reglas = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-informes/secciones-de-informes.mjs"));
    const todo = guia.GUIA_INFORMES.secciones.flatMap((s) => [s.titulo, s.resumen, ...(s.consejos ?? []), ...s.pasos.map((p) => `${p.titulo} ${p.texto}`)]).join(" \n ");
    const tablero = leer(TABLERO);
    const analiticas = leer(ANALITICAS);

    test("las vistas del CRM son las de la fila de arriba, en su orden", () => {
        const fila = tablero.slice(tablero.indexOf('data-zona="pestanas-del-crm"'));
        const vistas = [...fila.slice(0, 6000).matchAll(/\/>\s*\n\s*([A-ZÁÉÍÓÚ][a-záéíóú]+)\s*\n\s*<\/button>/g)].map((m) => m[1]);
        assert.deepEqual(vistas, [...guia.VISTAS_DEL_CRM]);
        for (const v of guia.VISTAS_DEL_CRM) assert.ok(todo.includes(v), `la guía no nombra la vista «${v}»`);
    });

    test("los periodos salen de una lista, y la guía los nombra", () => {
        assert.match(tablero, /PERIODOS_DE_INFORMES\.map/, "el tablero no pinta los periodos de la lista común");
        assert.deepEqual([...guia.PERIODOS_DOCUMENTADOS], ["7 días", "30 días", "90 días", "Todo"]);
        assert.match(tablero, /data-zona="periodo"/);
        for (const p of ["7 días", "30 días", "90 días"]) assert.ok(todo.includes(p), `la guía no nombra «${p}»`);
    });

    test("el selector de cuentas: sus opciones son las del componente", () => {
        const c = leer(CUENTAS);
        for (const o of guia.OPCIONES_DE_CUENTAS) {
            assert.ok(c.includes(o), `el selector no ofrece «${o}»`);
            assert.ok(todo.includes(o), `la guía no nombra «${o}»`);
        }
        assert.match(c, /Cuentas de la familia/);
        assert.match(tablero, /data-zona="cuentas"/);
    });

    test("la barra: buscar, filtrar, secciones y exportar, con sus marcas", () => {
        for (const z of ["buscador", "filtros", "secciones", "exportar", "totales", "secciones-de-informes"]) {
            assert.ok(analiticas.includes(`data-zona="${z}"`), `falta data-zona="${z}"`);
        }
        assert.match(analiticas, /placeholder="Buscar en analíticas\.\.\."/);
        assert.match(analiticas, /Exportar analíticas a CSV/);
        for (const m of ["Filtros", "Secciones", "Exportar"]) assert.ok(todo.includes(m), `la guía no nombra «${m}»`);
        const filtro = analiticas.slice(analiticas.indexOf("<SelectContent>"), analiticas.indexOf("</SelectContent>"));
        const estados = [...filtro.matchAll(/<SelectItem value="[^"]+">([^<]+)<\/SelectItem>/g)].map((m) => m[1]);
        assert.deepEqual(estados, [...guia.ESTADOS_DEL_FILTRO]);
    });

    test("las trece secciones: el menú y la cabecera dicen el MISMO nombre, y la guía las nombra todas", () => {
        assert.equal(reglas.SECCIONES_DE_INFORMES.length, 13);
        assert.match(analiticas, /SECCIONES_DE_INFORMES\.map\(\(\{ clave: key, titulo: label \}\)/, "el menú «Secciones» no sale de la lista común");
        assert.match(analiticas, /titulo: SECCIONES_DE_INFORMES\.find/, "la cabecera no sale de la lista común");
        assert.match(analiticas, /data-seccion-de-informes=\{clave\}/);
        const minus = todo.toLowerCase();
        for (const s of reglas.SECCIONES_DE_INFORMES) {
            const nombre = s.titulo.replace(/\s*\(.*\)$/, "").toLowerCase();
            assert.ok(minus.includes(nombre), `la guía no nombra la sección «${s.titulo}»`);
        }
    });

    test("el buscador filtra SECCIONES, sin tildes ni mayúsculas", () => {
        const [actividad] = reglas.SECCIONES_DE_INFORMES;
        const satisf = reglas.SECCIONES_DE_INFORMES.find((s) => s.clave === "satisfaccion");
        const leads = reglas.SECCIONES_DE_INFORMES.find((s) => s.clave === "leads");
        assert.equal(reglas.laSeccionPasaLaBusqueda(actividad, ""), true);
        assert.equal(reglas.laSeccionPasaLaBusqueda(satisf, "nps"), true);
        assert.equal(reglas.laSeccionPasaLaBusqueda(satisf, "SATISFACCION"), true);
        assert.equal(reglas.laSeccionPasaLaBusqueda(leads, "embudo"), true);
        assert.equal(reglas.laSeccionPasaLaBusqueda(actividad, "embudo"), false);
        assert.match(analiticas, /laSeccionPasaLaBusqueda\(seccion, searchValue\)/);
    });

    test("plegar se alterna y se recuerda, y lo raro cae en «nada plegado»", () => {
        const una = reglas.alternarPlegada(new Set(), "citas");
        assert.deepEqual([...una], ["citas"]);
        assert.deepEqual([...reglas.alternarPlegada(una, "citas")], []);
        assert.deepEqual([...reglas.comoPlegadas(["citas", "no-existe", 7])], ["citas"]);
        assert.deepEqual([...reglas.comoPlegadas("roto")], []);
        assert.match(analiticas, /LLAVE_DE_LAS_PLEGADAS/);
        assert.match(analiticas, /aria-expanded/);
    });

    test("la guía cubre todos los apartados, y cada sección tiene su página", () => {
        const slugs = guia.GUIA_INFORMES.secciones.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "periodo-y-cuentas", "barra", "actividad", "leads-y-citas", "llamadas-y-satisfaccion", "sesiones-y-flujos", "ventas-y-creditos"]);
        const pagina = leer("app/guia/informes/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.GUIA.laSeccion("no-existe"), null);
        assert.equal(guia.GUIA.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.GUIA.lasVecinas("ventas-y-creditos").siguiente, null);
        for (const s of guia.GUIA_INFORMES.secciones) {
            assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
            assert.ok(s.pasos.length >= 2, `${s.slug}: menos de dos pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 220, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"informes"/);
        assert.equal(guia.MODULO_DE_INFORMES, "Panel");
        assert.equal(guia.ZONAS_DE_LA_PANTALLA.length, 7);
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "informes");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.GUIA.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/informes/${n}`);
            const kb = statSync(path.join(dir, n)).size / 1024;
            assert.ok(kb > 5, `${n} pesa ${kb.toFixed(1)} KB: no parece una captura`);
            assert.ok(kb < 600, `${n} pesa ${kb.toFixed(0)} KB`);
        }
        assert.deepEqual(enDisco.filter((n) => !esperadas.includes(n)), [], "capturas en disco que la guía no enseña");
        const video = path.join(RAIZ, "public", guia.VIDEO_DE_DEMOSTRACION);
        assert.ok(existsSync(video), "falta el vídeo de demostración");
        const mb = statSync(video).size / 1024 / 1024;
        assert.ok(mb > 0.1 && mb < 12, `el vídeo pesa ${mb.toFixed(1)} MB`);
    });

    test("es PÚBLICA, no toca la base, y sus páginas son las de Leads con otro nombre", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/);
        for (const f of ["app/guia/informes/page.tsx", "app/guia/informes/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deInformes = [["INFORMES", "·"], ["Informes", "·"], ["informes", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/informes/${rel}`), deInformes), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/informes/${rel} no es la de Leads con otro nombre`);
        }
    });

    test("su tarjeta en «Tutoriales del módulo»", () => {
        const fila = /\{\s*modulo: "informes",\s*ruta: "([^"]+)",\s*contenido: GUIA_INFORMES,\s*tarjeta: "([^"]+)",?\s*\}/.exec(leer("lib/tutoriales-del-modulo.ts"));
        assert.ok(fila, "falta la fila de Informes en GUIAS_PUBLICADAS");
        assert.equal(fila[1], "/crm/dashboard");
        assert.match(fila[2], /^Aprende a .+ en la plataforma$/);
        assert.ok([...fila[2]].length <= 75, `la descripción mide ${[...fila[2]].length} caracteres`);
    });
}
