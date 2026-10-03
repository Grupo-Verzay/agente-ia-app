/**
 * El banco de la GUÍA PÚBLICA de Embudos (`/guia/embudos`).
 *
 * Lo mismo que las demás guías, y por el mismo motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las etapas de fábrica y las del
 *    sistema salen de `lib/embudos.ts`; los mandos de una columna, las opciones
 *    del «⋯», los filtros de asesor y las marcas que usa la receta se leen de
 *    `EmbudosClient.tsx`; los días de la papelera, de `lib/papelera-de-embudos.ts`.
 * 2. **Cada imagen que la guía enseña existe**, y no sobra ninguna.
 * 3. **Es pública, no se indexa y sus dos páginas son las de Leads** con otro
 *    nombre, letra por letra.
 * 4. **Su tarjeta en «Tutoriales del módulo»**.
 *
 * `MODO=roto` lee los ficheros de `ANTES_EMBUDOS_REF` —pinchado, nunca
 * `origin/main`— y afirma que no había guía, ni tarjeta, ni marcas.
 *
 * Se levanta con `scripts/banco-guia-embudos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_EMBUDOS_REF ?? "84f98e5";

const PANTALLA = "app/(root)/embudos/_components/EmbudosClient.tsx";

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
    test("ANTES no había guía pública de Embudos", () => {
        assert.equal(leer("lib/guia-embudos.ts"), "", "lib/guia-embudos.ts ya existía");
        assert.equal(leer("app/guia/embudos/page.tsx"), "", "la página ya existía");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_EMBUDOS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(leer(PANTALLA).length > 0, `ANTES_EMBUDOS_REF (${ANTES}) no tiene la pantalla de Embudos`);
        assert.ok(!/modulo: "embudos"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba");
        for (const marca of ["data-tarjeta", "data-columna", "data-cabeza-de-columna", 'data-hoja="etapas"']) {
            assert.ok(!leer(PANTALLA).includes(marca), `la pantalla ya tenía «${marca}»`);
        }
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-embudos/guia-embudos.mjs"));
    const todo = guia.GUIA_EMBUDOS.secciones.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");
    const pantalla = leer(PANTALLA);

    test("el embudo de ventas: siete etapas en su orden, tres del sistema", () => {
        assert.deepEqual([...guia.ETAPAS_DEL_EMBUDO_DE_VENTAS], ["Nuevo", "Contactado", "Interesado", "Cotizado", "Negociación", "Ganado", "Perdido"]);
        assert.deepEqual([...guia.ETAPAS_DEL_SISTEMA], ["Nuevo", "Ganado", "Perdido"]);
        for (const e of guia.ETAPAS_DEL_EMBUDO_DE_VENTAS) assert.ok(todo.includes(e), `la guía no nombra la etapa «${e}»`);
    });

    test("los mandos de una columna y el «⋯» de la barra son los de la pantalla, en su orden", () => {
        let desde = 0;
        for (const m of guia.MANDOS_DE_UNA_COLUMNA) {
            const i = pantalla.indexOf(`aria-label="${m}"`, desde);
            assert.ok(i >= 0, `falta el mando «${m}» (o va fuera de orden)`);
            desde = i;
        }
        const menu = [...pantalla.matchAll(/etiqueta: '([^']+)'/g)].map((m) => m[1]).filter((e) => guia.MENU_DE_LA_BARRA.includes(e));
        assert.deepEqual([...new Set(menu)], [...guia.MENU_DE_LA_BARRA]);
        for (const o of guia.MENU_DE_LA_BARRA) assert.ok(todo.includes(o), `la guía no nombra «${o}»`);
    });

    test("el filtro de asesor y la barra de trabajo", () => {
        for (const f of guia.FILTROS_DE_ASESOR.slice(0, 2)) assert.ok(pantalla.includes(f), `la pantalla no ofrece «${f}»`);
        for (const marca of ['data-selector="cuenta"', 'data-selector="embudo"', 'data-filtro="asesor"', 'aria-label="Buscar conversación"', 'aria-label="Actualizar"']) {
            assert.ok(pantalla.includes(marca), `falta ${marca}`);
        }
        assert.equal(guia.PARTES_DE_LA_BARRA_DE_TRABAJO.length, 7);
        const barra = guia.GUIA_EMBUDOS.secciones[0].pasos.find((p) => p.imagen === "barra.webp").texto;
        guia.PARTES_DE_LA_BARRA_DE_TRABAJO.forEach((p, i) => assert.ok(barra.includes(`${i + 1} ${p}`), `la barra no numera «${p}» como ${i + 1}`));
    });

    test("las marcas que usa la receta de capturas existen", () => {
        for (const marca of ["data-tarjeta=", "data-columna=", "data-cabeza-de-columna", 'data-hoja="etapas"', 'data-hoja="papelera"', 'data-hoja="asesores"']) {
            assert.ok(pantalla.includes(marca), `la pantalla no expone ${marca}`);
        }
        for (const aria of ["Subir etapa", "Bajar etapa", "Etapa del sistema", "Eliminar etapa", "Nombre del embudo"]) assert.ok(pantalla.includes(`aria-label="${aria}"`), `falta «${aria}»`);
    });

    test("los números: 30 días de papelera y los colores rápidos", () => {
        assert.equal(guia.DIAS_EN_LA_PAPELERA, 30);
        assert.ok(todo.includes("30 días"), "la guía no dice los 30 días");
        assert.ok(guia.CUANTOS_COLORES_RAPIDOS >= 6);
        assert.ok(todo.includes(`${guia.CUANTOS_COLORES_RAPIDOS} colores`), "la guía no dice cuántos colores rápidos hay");
    });

    test("la guía cubre todos los apartados, y cada sección tiene su página", () => {
        const slugs = guia.GUIA_EMBUDOS.secciones.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "tablero", "embudo-de-ventas", "selectores", "crear-embudo", "etapas", "asesores", "perdido"]);
        const pagina = leer("app/guia/embudos/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.GUIA.laSeccion("no-existe"), null);
        assert.equal(guia.GUIA.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.GUIA.lasVecinas("perdido").siguiente, null);
        for (const s of guia.GUIA_EMBUDOS.secciones) {
            assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 220, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"embudos"/);
        assert.equal(guia.MODULO_DE_EMBUDOS, "Panel");
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "embudos");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.GUIA.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/embudos/${n}`);
            const kb = statSync(path.join(dir, n)).size / 1024;
            assert.ok(kb > 5, `${n} pesa ${kb.toFixed(1)} KB: no parece una captura`);
            assert.ok(kb < 700, `${n} pesa ${kb.toFixed(0)} KB`);
        }
        assert.deepEqual(enDisco.filter((n) => !esperadas.includes(n)), [], "capturas en disco que la guía no enseña");
        const video = path.join(RAIZ, "public", guia.VIDEO_DE_DEMOSTRACION);
        assert.ok(existsSync(video), "falta el vídeo de demostración");
        const mb = statSync(video).size / 1024 / 1024;
        assert.ok(mb > 0.1 && mb < 12, `el vídeo pesa ${mb.toFixed(1)} MB`);
    });

    test("es PÚBLICA, no toca la base, y sus páginas son las de Leads con otro nombre", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/);
        for (const f of ["app/guia/embudos/page.tsx", "app/guia/embudos/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deEmbudos = [["EMBUDOS", "·"], ["Embudos", "·"], ["embudos", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/embudos/${rel}`), deEmbudos), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/embudos/${rel} no es la de Leads con otro nombre`);
        }
    });

    test("su tarjeta en «Tutoriales del módulo»", () => {
        const fila = /\{\s*modulo: "embudos",\s*ruta: "([^"]+)",\s*contenido: GUIA_EMBUDOS,\s*tarjeta: "([^"]+)",?\s*\}/.exec(leer("lib/tutoriales-del-modulo.ts"));
        assert.ok(fila, "falta la fila de Embudos en GUIAS_PUBLICADAS");
        assert.equal(fila[1], "/embudos");
        assert.match(fila[2], /^Aprende a .+ en la plataforma$/);
        assert.ok([...fila[2]].length <= 75, `la descripción mide ${[...fila[2]].length} caracteres`);
    });
}
