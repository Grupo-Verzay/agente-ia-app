/**
 * El banco de la GUÍA PÚBLICA de Mis datos (`/guia/mis-datos`).
 *
 * Las mismas cosas que las guías de Leads y de Mis notas, y por el mismo
 * motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Los tipos de datos de Google
 *    Sheets, sus botones, los cuatro números del resumen, los campos de un
 *    bloque y las acciones del «⋯» de cada opción que documenta
 *    `lib/guia-mis-datos.ts` se leen de los componentes de `/my-data`. Lo que
 *    la pantalla y la guía comparten —el nombre de las dos opciones, sus
 *    pestañas, las columnas de la tabla— sale de `lib/pantalla-de-mis-datos.ts`
 *    y se comprueba que la pantalla también lo lea de ahí.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de las dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 *
 * `MODO=roto` lee los ficheros de `ANTES_MIS_DATOS_REF` —pinchado a un commit,
 * nunca `origin/main`— y afirma que no había guía de Mis datos ni marcas en la
 * pantalla con las que una receta pudiera señalar sus partes.
 *
 * Se levanta con `scripts/banco-guia-mis-datos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_MIS_DATOS_REF ?? "ab6b110";

const D = "app/(root)/my-data/_components";
const IMPORTAR_HOJA = `${D}/MyDataImport.tsx`;
const BLOQUES = `${D}/KnowledgeBaseManagement.tsx`;
const MENU_HOJA = `${D}/MyDataActionsMenu.tsx`;
const MENU_BASE = `${D}/KnowledgeBaseActionsMenu.tsx`;

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

/** El texto de los `<SelectItem value="clients|catalog">` de la importación, en su orden. */
export function losTiposDeDatos(fuente) {
    return [...fuente.matchAll(/<SelectItem value="(?:clients|catalog)"[^>]*>\s*([^<]+?)\s*<\/SelectItem>/g)].map((m) => m[1]);
}

/** Los rótulos del resumen de una importación: los `<p>` pequeños bajo cada número. */
export function losNumerosDelResumen(fuente) {
    return [...fuente.matchAll(/<p className="text-xs text-muted-foreground mt-0\.5">([^<]+)<\/p>/g)].map((m) => m[1]);
}

/** El nombre de cada campo de la ventana de un bloque, sin su «*» ni su aclaración. */
export function losCamposDelBloque(fuente) {
    return [...fuente.matchAll(/<Label htmlFor="kb-(?:title|keywords|category|content)"[^>]*>\s*([^<*]+?)\s*(?:\*|<)/g)].map((m) => m[1]);
}

/** Las acciones de un «⋯», sin el número que llevan entre paréntesis. */
export function lasAccionesDelMenu(fuente) {
    const deLabel = [...fuente.matchAll(/label: `([^`(]+?) \(\$\{/g)].map((m) => m[1]);
    if (deLabel.length) return deLabel;
    return [...fuente.matchAll(/<DropdownMenuItem[\s\S]*?>\s*(?:<[^>]+\/>\s*)?([^<{(]+?)\s*\(\{/g)].map((m) => m[1]);
}

if (ROTO) {
    test("ANTES no había guía pública de Mis datos", () => {
        assert.equal(leer("lib/guia-mis-datos.ts"), "", "lib/guia-mis-datos.ts ya existía en ANTES_MIS_DATOS_REF");
        assert.equal(leer("app/guia/mis-datos/page.tsx"), "", "la página ya existía en ANTES_MIS_DATOS_REF");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_MIS_DATOS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/["']mis-datos["']/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía de Mis datos");
        assert.ok(!/mis-datos/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta de Tutoriales ya estaba registrada");
        // Y la pantalla no exponía nada con lo que una receta la pudiera
        // señalar: las capturas se habrían tomado por coordenadas.
        const pantalla = [IMPORTAR_HOJA, BLOQUES, MENU_HOJA, MENU_BASE, `${D}/MyDataContent.tsx`].map(leer).join("\n");
        for (const marca of ["data-cabecera-de-mis-datos", "data-tarjeta-de-seccion", "data-tipo-de-datos", "data-vista-previa", "data-lista-de-bloques"]) {
            assert.ok(!pantalla.includes(marca), `la pantalla ya tenía «${marca}»`);
        }
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-mis-datos/guia-mis-datos.mjs"));

    test("los tipos de datos, los botones y el resumen de Google Sheets son los de la pantalla", () => {
        const hoja = leer(IMPORTAR_HOJA);
        assert.deepEqual([...guia.TIPOS_DE_DATOS], losTiposDeDatos(hoja), "los tipos de datos del selector no son los de la guía");
        assert.deepEqual([...guia.RESUMEN_DE_LA_IMPORTACION], losNumerosDelResumen(hoja), "el resumen de una importación no es el de la guía");
        let desde = 0;
        for (const b of guia.BOTONES_DE_SHEETS) {
            const i = hoja.indexOf(b, desde);
            assert.ok(i >= 0, `la importación ya no tiene «${b}» (o no en este orden)`);
            desde = i;
        }
    });

    test("los campos de un bloque y las acciones de cada «⋯» son los de la pantalla", () => {
        assert.deepEqual([...guia.CAMPOS_DEL_BLOQUE], losCamposDelBloque(leer(BLOQUES)));
        assert.deepEqual([...guia.ACCIONES_DE_SHEETS], lasAccionesDelMenu(leer(MENU_HOJA)));
        assert.deepEqual([...guia.ACCIONES_DE_LA_BASE], lasAccionesDelMenu(leer(MENU_BASE)));
        // Y cada una la nombra algún paso de la guía.
        const todo = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");
        for (const x of [...guia.ACCIONES_DE_SHEETS, ...guia.ACCIONES_DE_LA_BASE, ...guia.CAMPOS_DEL_BLOQUE, ...guia.RESUMEN_DE_LA_IMPORTACION]) {
            assert.ok(todo.includes(x), `ningún paso de la guía nombra «${x}»`);
        }
    });

    test("lo que la pantalla y la guía comparten, la pantalla también lo lee de lib/pantalla-de-mis-datos", () => {
        // Los nombres de las dos opciones y de sus pestañas no pueden estar
        // escritos a mano en los componentes: la guía los lee de ahí.
        const todo = readdirSync(path.join(RAIZ, D))
            .filter((n) => n.endsWith(".tsx"))
            .map((n) => readFileSync(path.join(RAIZ, D, n), "utf8"))
            .join("\n");
        for (const nombre of ["SECCIONES_DE_MIS_DATOS", "PESTANAS_DE_LA_SECCION", "SEPARADORES_DE_LA_BASE", "laEtiquetaDeLaColumna"]) {
            assert.ok(todo.includes(nombre), `la pantalla no usa «${nombre}»: podría decir otra cosa que la guía`);
        }
        const texto = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => p.texto)).join(" ");
        for (const p of ["Importar", "Gestionar"]) assert.ok(texto.includes(p), `la guía no nombra la pestaña «${p}»`);
    });

    test("la guía cubre todos los apartados de la pantalla, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "google-sheets", "datos-importados", "base-de-conocimiento", "bloques", "acciones"]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/mis-datos/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("acciones").siguiente, null);
        assert.equal(guia.lasVecinas("datos-importados").anterior.slug, "google-sheets");
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"mis-datos"/);
        // La vista general numera sus cuatro zonas, en su orden.
        const vista = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "vista-general.webp").texto;
        guia.ZONAS_DE_LA_PANTALLA.forEach((z, i) => assert.ok(vista.includes(`${i + 1} ${z.toLowerCase()}`) || vista.includes(`${i + 1} ${z}`), `la vista general no numera «${z}» como ${i + 1}`));
    });

    test("la tarjeta de Tutoriales del módulo: «Guía de Mis datos», con su descripción", () => {
        const t = leer("lib/tutoriales-del-modulo.ts");
        const fila = /\{\s*modulo:\s*"mis-datos",\s*ruta:\s*"([^"]+)",\s*contenido:\s*(\w+),\s*tarjeta:\s*"([^"]+)"/.exec(t);
        assert.ok(fila, "la guía de Mis datos no está en GUIAS_PUBLICADAS");
        assert.equal(fila[1], guia.RUTA_DE_MIS_DATOS);
        assert.equal(fila[2], "GUIA_MIS_DATOS");
        const tarjeta = fila[3];
        assert.match(tarjeta, /^Aprende a .+ en la plataforma$/);
        assert.ok([...tarjeta].length <= 75, `la descripción mide ${[...tarjeta].length} caracteres`);
        assert.ok(!/[[\]]/.test(tarjeta), "la descripción lleva corchetes literales");
        assert.equal(`Guía de ${guia.GUIA_MIS_DATOS.titulo}`, "Guía de Mis datos");
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
        const dir = path.join(RAIZ, "public", "guia", "mis-datos");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/mis-datos/${n}`);
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

    test("es PÚBLICA y NO se indexa, y no toca la base más que la de Leads", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/);
        for (const f of ["app/guia/mis-datos/page.tsx", "app/guia/mis-datos/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const lecturas = [...leer("app/guia/mis-datos/page.tsx").matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deMisDatos = [["MIS_DATOS", "·"], ["MisDatos", "·"], ["Mis datos", "·"], ["mis-datos", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/mis-datos/${rel}`), deMisDatos),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/mis-datos/${rel} no es la de Leads con otro nombre`,
            );
        }
    });
}
