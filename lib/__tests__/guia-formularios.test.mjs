/**
 * El banco de la GUÍA PÚBLICA de Mis formularios (`/guia/formularios`).
 *
 * Las mismas cosas que la guía de Leads, y por el mismo motivo —se rompen
 * solas—, más la que hace que sean LA MISMA guía:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las cifras de la lista, el «⋯»
 *    de una tarjeta, los campos de «Nuevo formulario», las tres tarjetas del
 *    editor y su «⋯», los campos de «Nuevo campo», los catorce tipos, las
 *    cifras de Registros, el estado de un registro, sus botones y el «⋯» de
 *    Registros que documenta `lib/guia-formularios.ts` se leen de
 *    `MisFormulariosClient.tsx`, `FormEditorClient.tsx`,
 *    `FormRegistrosClient.tsx` y `lib/formularios.ts`. Un mando nuevo sin su
 *    nombre en la guía pone esto en rojo, con el nombre del que falta.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de las dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 *
 * `MODO=roto` lee los ficheros de `ANTES_FORMULARIOS_REF` —pinchado a un
 * commit, nunca `origin/main`— y afirma que no había guía de Mis formularios
 * ni marcas en la pantalla con las que una receta pudiera señalar sus partes.
 *
 * Se levanta con `scripts/banco-guia-formularios.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_FORMULARIOS_REF ?? "ab6b110";

const DIR = "app/(root)/(protected)/mis-formularios";
const LISTA = `${DIR}/_components/MisFormulariosClient.tsx`;
const EDITOR = `${DIR}/[formId]/_components/FormEditorClient.tsx`;
const REGISTROS = `${DIR}/[formId]/registros/_components/FormRegistrosClient.tsx`;

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

/** Las etiquetas de las pastillas de una pantalla, en su orden (`etiqueta: '…'`). */
export function lasPastillas(fuente) {
    const ini = fuente.indexOf("<PastillasDeMetricas");
    if (ini < 0) return [];
    const fin = fuente.indexOf("/>\n", fuente.indexOf("]}", ini));
    return [...fuente.slice(ini, fin).matchAll(/etiqueta: '([^']+)'/g)].map((m) => m[1]);
}

/**
 * Las opciones del «⋯» de una tarjeta de la lista, en su orden: el texto que
 * sigue a cada icono dentro de su `DropdownMenuContent`. Con las dos caras de
 * las que cambian —«Copiado» y «Activar»—, que se quitan aquí: la guía
 * documenta el menú de un formulario activo recién abierto.
 */
export function elMenuDeLaTarjeta(fuente) {
    const ini = fuente.indexOf("<DropdownMenuContent");
    if (ini < 0) return [];
    const trozo = fuente.slice(ini, fuente.indexOf("</DropdownMenuContent>", ini));
    return [...trozo.matchAll(/\/>\s*([A-ZÁÉÍÓÚ][^<{}]*?)\s*</g)].map((m) => m[1]);
}

/** Los títulos de las tarjetas del editor, sin sus iconos. */
export function lasTarjetasDelEditor(fuente) {
    return [...fuente.matchAll(/<CardTitle[^>]*>([\s\S]*?)<\/CardTitle>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
}

/** El «⋯» del editor: las `etiqueta` de sus `extras`, sin la cifra entre paréntesis. */
export function elMenuDelEditor(fuente) {
    const ini = fuente.indexOf("extras={[");
    if (ini < 0) return [];
    const trozo = fuente.slice(ini, fuente.indexOf("]}", ini));
    return [...trozo.matchAll(/etiqueta: [`'"]([^`'"]+)[`'"]/g)].map((m) => m[1].replace(/\s*\(\$\{[^}]+\}\)\s*$/, "").trim());
}

/** Las etiquetas de los campos de una ventana: el texto de sus `<Label>`, sin el asterisco. */
export function losRotulos(trozo) {
    return [...trozo.matchAll(/<Label[^>]*>([^<]+)</g)].map((m) => m[1].replace(/\s*\*\s*$/, "").trim());
}

if (ROTO) {
    test("ANTES no había guía pública de Mis formularios", () => {
        assert.equal(leer("lib/guia-formularios.ts"), "", "lib/guia-formularios.ts ya existía en ANTES_FORMULARIOS_REF");
        assert.equal(leer("app/guia/formularios/page.tsx"), "", "la página ya existía en ANTES_FORMULARIOS_REF");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_FORMULARIOS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/["']formularios["']/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía de formularios");
        assert.ok(!/modulo: "formularios"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba registrada");
        // Y la pantalla no exponía nada con lo que una receta la pudiera
        // señalar: las capturas se habrían tomado por coordenadas.
        for (const [rel, marca] of [
            [LISTA, "data-lista-de-formularios"],
            [LISTA, "data-formulario="],
            [EDITOR, "data-seccion-whatsapp"],
            [EDITOR, "data-campo="],
            [REGISTROS, "data-registro="],
        ]) {
            assert.ok(!leer(rel).includes(marca), `la pantalla ya tenía «${marca}»`);
        }
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-formularios/guia-formularios.mjs"));
    const textoDe = (slug, imagen) => guia.laSeccion(slug).pasos.find((p) => p.imagen === imagen).texto;
    const todo = () => guia.SECCIONES.flatMap((s) => [...s.pasos.map((p) => p.texto), ...(s.consejos ?? [])]).join(" \n ");

    test("las cifras de la lista son las de la pantalla, y la barra las numera", () => {
        assert.deepEqual([...guia.CIFRAS_DE_LA_LISTA], lasPastillas(leer(LISTA)));
        const texto = textoDe("vista-general", "barra.webp");
        guia.CIFRAS_DE_LA_LISTA.forEach((c, i) => assert.ok(texto.includes(`${i + 2} ${c}`), `la barra no numera «${c}» como ${i + 2}`));
    });

    test("el «⋯» de una tarjeta es el de la pantalla, y la otra cara también se nombra", () => {
        const menu = elMenuDeLaTarjeta(leer(LISTA));
        assert.deepEqual(menu, ["Copiado", "Copiar enlace", "Ver formulario", "Desactivar", "Activar", "Eliminar"], `el menú cambió: ${JSON.stringify(menu)}`);
        assert.deepEqual([...guia.MENU_DE_LA_TARJETA], menu.filter((o) => o !== "Copiado" && o !== "Activar"));
        const t = todo();
        for (const o of [...guia.MENU_DE_LA_TARJETA, "Activar"]) assert.ok(t.includes(`«${o}»`), `ningún paso nombra «${o}»`);
    });

    test("los campos de «Nuevo formulario» y de Configuración son los mismos, y los de la pantalla", () => {
        const lista = leer(LISTA);
        const crear = lista.slice(lista.indexOf('htmlFor="form-title"') - 40);
        assert.deepEqual([...guia.CAMPOS_DEL_FORMULARIO], losRotulos(crear));
        const editor = leer(EDITOR);
        const config = editor.slice(editor.indexOf("<Label>Título</Label>") - 1, editor.indexOf("<Label>Google Sheets URL</Label>") + 40);
        assert.deepEqual([...guia.CAMPOS_DEL_FORMULARIO], losRotulos(config));
        assert.ok(textoDe("editor", "configuracion.webp").includes(guia.CAMPOS_DEL_FORMULARIO.slice(0, 3).join(", ")));
    });

    test("las tres tarjetas del editor y su «⋯» son las de la pantalla", () => {
        const editor = leer(EDITOR);
        assert.deepEqual([...guia.SECCIONES_DEL_EDITOR], lasTarjetasDelEditor(editor));
        const texto = textoDe("editor", "editor.webp");
        guia.SECCIONES_DEL_EDITOR.forEach((s, i) => assert.ok(texto.includes(`${i + 5} ${s}`), `el editor no numera «${s}» como ${i + 5}`));
        assert.deepEqual([...guia.MENU_DEL_EDITOR], elMenuDelEditor(editor));
        const menu = textoDe("editor", "editor-menu.webp");
        for (const o of guia.MENU_DEL_EDITOR) assert.ok(menu.includes(`«${o}»`), `el paso del «⋯» no nombra «${o}»`);
    });

    test("«Nuevo campo» y los catorce tipos son los de la pantalla", () => {
        const editor = leer(EDITOR);
        const dialogo = editor.slice(editor.indexOf(">Pregunta</Label>") - 80);
        assert.deepEqual([...guia.CAMPOS_DEL_CAMPO], losRotulos(dialogo).slice(0, guia.CAMPOS_DEL_CAMPO.length));
        const tipos = [...leer("lib/formularios.ts").matchAll(/\{ tipo: "[a-z]+", nombre: "([^"]+)" \}/g)].map((m) => m[1]);
        assert.equal(tipos.length, 14, `no se leyeron los catorce tipos: ${JSON.stringify(tipos)}`);
        assert.deepEqual([...guia.TIPOS_DOCUMENTADOS], tipos);
        const consejo = guia.laSeccion("campos").consejos.find((c) => c.startsWith("Los catorce tipos"));
        for (const t of tipos) assert.ok(consejo.includes(t), `el consejo de los tipos no nombra «${t}»`);
        assert.match(editor, /TIPOS_DE_CAMPO\.map/, "el desplegable ya no sale de TIPOS_DE_CAMPO");
    });

    test("Registros: cifras, estados, botones y su «⋯» son los de la pantalla", () => {
        const registros = leer(REGISTROS);
        assert.deepEqual([...guia.CIFRAS_DE_LOS_REGISTROS], lasPastillas(registros));
        const texto = textoDe("registros", "registros.webp");
        guia.CIFRAS_DE_LOS_REGISTROS.forEach((c, i) => assert.ok(texto.includes(`${i + 2} ${c}`), `Registros no numera «${c}» como ${i + 2}`));
        const estados = [...registros.matchAll(/label: '([^']+)',\s+icon:/g)].map((m) => m[1]);
        assert.deepEqual([...guia.ESTADOS_DEL_REGISTRO], estados);
        const botones = [...registros.matchAll(/title="([^"]+)" aria-label="\1"/g)].map((m) => m[1]).filter((t) => t !== "Actualizar");
        assert.deepEqual([...guia.ACCIONES_DEL_REGISTRO], botones);
        const menu = [...registros.matchAll(/etiqueta: '([^']+)',\n/g)].map((m) => m[1]);
        assert.deepEqual([...guia.MENU_DE_LOS_REGISTROS], menu);
        const t = todo();
        for (const x of [...guia.ACCIONES_DEL_REGISTRO, ...guia.MENU_DE_LOS_REGISTROS, "Sincronizado"]) assert.ok(t.includes(x), `ningún paso nombra «${x}»`);
    });

    test("la guía cubre las tres pantallas y el formulario público, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "crear", "editor", "campos", "whatsapp", "url", "compartir", "google-sheets", "registros", "activar-y-eliminar"]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/formularios/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("activar-y-eliminar").siguiente, null);
        assert.equal(guia.lasVecinas("editor").anterior.slug, "crear");
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"formularios"/);
        // Y la vista general numera las mismas zonas que las demás guías.
        assert.equal(guia.MODULO_DE_FORMULARIOS, "Apps Externas");
        const zonas = textoDe("vista-general", "vista-general.webp");
        guia.ZONAS_DE_LA_PANTALLA.slice(0, 3).forEach((z, i) => assert.ok(zonas.includes(`${i + 1} ${z}`), `la vista general no numera «${z}»`));
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
        const dir = path.join(RAIZ, "public", "guia", "formularios");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/formularios/${n}`);
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
        for (const f of ["app/guia/formularios/page.tsx", "app/guia/formularios/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const lecturas = [...leer("app/guia/formularios/page.tsx").matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
    });

    test("la tarjeta de «Tutoriales del módulo» se registra sola, en /mis-formularios", () => {
        const tutoriales = leer("lib/tutoriales-del-modulo.ts");
        assert.match(tutoriales, /modulo: "formularios",\s*ruta: "\/mis-formularios",\s*contenido: GUIA_FORMULARIOS,\s*tarjeta: "Aprende a [^"]+ en la plataforma"/);
        const tarjeta = /modulo: "formularios"[\s\S]*?tarjeta: "([^"]+)"/.exec(tutoriales)[1];
        assert.ok([...tarjeta].length <= 75, `la descripción mide ${[...tarjeta].length}`);
        assert.ok(!/[[\]]/.test(tarjeta), "la descripción lleva corchetes");
        assert.equal(guia.GUIA_FORMULARIOS.titulo, "Mis formularios");
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deFormularios = [["FORMULARIOS", "·"], ["Mis formularios", "·"], ["Formularios", "·"], ["formularios", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/formularios/${rel}`), deFormularios),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/formularios/${rel} no es la de Leads con otro nombre`,
            );
        }
    });
}
