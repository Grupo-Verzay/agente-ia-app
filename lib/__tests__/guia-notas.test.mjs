/**
 * El banco de la GUÍA PÚBLICA de Mis notas (`/guia/notas`).
 *
 * Las mismas tres cosas que la guía de Leads, y por el mismo motivo —se
 * rompen solas—, más la que hace que las dos sean LA MISMA guía:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Los botones de la barra de la
 *    nota, las pestañas del panel, los grupos de la barra de formato, las
 *    plantillas, los formatos de exportar, los colores, los niveles de
 *    compartir y los menús «⋯» que documenta `lib/guia-notas.ts` se leen de
 *    `NotesEditor.tsx`, `NotesSidebar.tsx`, `EditorDeTexto.tsx`,
 *    `SortableNoteList.tsx` y `lib/niveles-de-acceso.ts`. Un botón nuevo sin
 *    su nombre en la guía pone esto en rojo, con el nombre del que falta.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de las dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan). Una guía
 *    que se pinta distinta de la otra deja de ser «el mismo estándar».
 *
 * `MODO=roto` lee los ficheros de `ANTES_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma que no había guía de Mis notas.
 *
 * Se levanta con `scripts/banco-guia-notas.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_NOTAS_REF ?? "24ba0b2";

const EDITOR = "app/(root)/notas/_components/NotesEditor.tsx";
const PANEL = "app/(root)/notas/_components/NotesSidebar.tsx";
const LISTA = "app/(root)/notas/_components/SortableNoteList.tsx";
const FORMATO = "components/shared/EditorDeTexto.tsx";

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

/**
 * Los grupos de la barra de formato tal cual los pinta `EditorDeTexto.tsx`:
 * los `title` de sus botones, cortados por los separadores verticales. Se lee
 * del marcado, no de una lista escrita en el banco.
 */
export function losGruposDeLaBarraDeFormato(fuente) {
    const ini = fuente.indexOf("data-barra-de-formato");
    if (ini < 0) return [];
    const fin = fuente.indexOf("</div>", ini);
    return fuente
        .slice(ini, fin)
        .split('<Separator orientation="vertical"')
        .map((trozo) => [...trozo.matchAll(/title="([^"]+)"/g)].map((m) => m[1]));
}

/**
 * Los mandos de la barra de la nota, en su orden, con el `title` que enseñan
 * al posar el cursor. De un `title={a ? 'X' : 'Y'}` cuenta el nombre de la
 * nota que se tiene delante recién abierta (el de la segunda rama para el
 * panel, que nace abierto: «Ocultar panel»). El historial lo pinta
 * `AuditHistoryButton`, que se lee aparte.
 */
export function losMandosDeLaBarraDeLaNota(editor, historial) {
    const ini = editor.indexOf("data-barra-de-la-nota");
    const fin = editor.indexOf("{/* Editor", ini) > 0 ? editor.indexOf("{/* Editor", ini) : editor.length;
    const barra = editor.slice(ini, fin);
    const tituloDelHistorial = /title="([^"]+)"/.exec(historial)?.[1];
    const mandos = [];
    const re = /title=(?:"([^"]+)"|\{[^}]*?\?\s*'([^']+)'\s*:\s*'([^']+)'\s*\}|\{(mandoDeArchivo\.titulo)\})|<AuditHistoryButton|data-estado-de-guardado/g;
    let m;
    const vistos = new Set();
    while ((m = re.exec(barra))) {
        let t;
        if (m[0] === "<AuditHistoryButton") t = tituloDelHistorial;
        else if (m[0] === "data-estado-de-guardado") t = null;
        else if (m[1]) t = m[1];
        // El panel nace abierto (su nombre es la primera rama); el enfoque y
        // la chincheta nacen apagados (la segunda).
        else if (m[2]) t = m[2] === "Ocultar panel" ? m[2] : m[3];
        else if (m[4]) t = "Archivar nota";
        const llave = t === null ? "__guardado" : t;
        if (vistos.has(llave)) continue;
        vistos.add(llave);
        mandos.push(t);
    }
    // Lo que NO es un mando de la barra: el volver del móvil, un color suelto
    // de su menú y el aviso de solo lectura (va encima del estado de guardado).
    const fuera = new Set(["Volver a notas", "Quitar contacto", "No puedes editar esta nota"]);
    return mandos.filter((t) => !fuera.has(t) && !/^(Sin color|Amarillo|Rosa|Verde|Azul|Violeta|Naranja|Gris)$/.test(t ?? ""));
}

if (ROTO) {
    test("ANTES no había guía pública de Mis notas", () => {
        assert.equal(leer("lib/guia-notas.ts"), "", "lib/guia-notas.ts ya existía en ANTES_NOTAS_REF");
        assert.equal(leer("app/guia/notas/page.tsx"), "", "la página ya existía en ANTES_NOTAS_REF");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_NOTAS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        const intro = leer("lib/introduccion-de-la-guia.ts");
        assert.ok(!/["']notas["']/.test(intro), "la introducción editable ya conocía la guía de notas");
        // Y la pantalla no exponía nada con lo que una receta la pudiera
        // señalar: las capturas se habrían tomado por coordenadas.
        for (const marca of ["data-barra-de-la-nota", "data-nota-abierta", "data-panel-de-notas"]) {
            assert.ok(!leer(EDITOR).includes(marca) && !leer(PANEL).includes(marca), `la pantalla ya tenía «${marca}»`);
        }
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-notas/guia-notas.mjs"));

    test("la barra de la nota documentada es EXACTAMENTE la de la pantalla, en su orden", () => {
        const enLaPantalla = losMandosDeLaBarraDeLaNota(leer(EDITOR), leer("components/shared/AuditHistoryButton.tsx"));
        assert.deepEqual(
            guia.PARTES_DE_LA_BARRA_DE_LA_NOTA.map((p) => p.titulo),
            enLaPantalla,
            "la guía y la barra de la nota no nombran los mismos mandos, en el mismo orden",
        );
        const texto = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "barra-de-la-nota.webp").texto;
        guia.PARTES_DE_LA_BARRA_DE_LA_NOTA.forEach((p, i) => assert.ok(texto.includes(`${i + 1} ${p.nombre}`), `la barra no numera «${p.nombre}» como ${i + 1}`));
    });

    test("las pestañas del panel son las de la pantalla, con su rótulo y su nombre entero", () => {
        const panel = leer(PANEL);
        const enLaPantalla = [...panel.matchAll(/<TabsTrigger[^>]*title="([^"]+)"[\s\S]*?(?:<span className="truncate">([^<]+)<\/span>|Todas)/g)].map((m) => ({
            rotulo: m[2] ?? "Todas",
            titulo: m[1],
        }));
        assert.deepEqual(guia.PESTANAS_DEL_PANEL.map((p) => ({ ...p })), enLaPantalla);
    });

    test("la barra de formato documentada es la de EditorDeTexto, grupo por grupo", () => {
        const enLaPantalla = losGruposDeLaBarraDeFormato(leer(FORMATO));
        assert.equal(enLaPantalla.length, 6, `no se leyeron los seis grupos: ${JSON.stringify(enLaPantalla)}`);
        assert.deepEqual(guia.FORMATOS_DEL_TEXTO.map((g) => [...g.botones]), enLaPantalla);
        const texto = guia.laSeccion("formato").pasos.find((p) => p.imagen === "formato-barra.webp").texto;
        guia.FORMATOS_DEL_TEXTO.forEach((g, i) => assert.ok(texto.includes(`${i + 1} ${g.grupo}`), `la barra de formato no numera «${g.grupo}» como ${i + 1}`));
    });

    test("plantillas, exportar, colores, niveles y los menús «⋯» son los de la pantalla", () => {
        const editor = leer(EDITOR);
        const plantillas = [...editor.matchAll(/label: '([^']+)',\n\s+title:/g)].map((m) => m[1]);
        assert.deepEqual([...guia.PLANTILLAS_DOCUMENTADAS], plantillas);
        for (const f of guia.FORMATOS_DE_EXPORTAR) assert.match(editor, new RegExp(`>\\s*${f.replace(/[.()]/g, "\\$&")}\\s*<`), `el menú Exportar ya no dice «${f}»`);
        const colores = [...editor.matchAll(/\{ value: [^,]+, label: '([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual([...guia.COLORES_DE_LA_NOTA], colores);
        const niveles = leer("lib/niveles-de-acceso.ts");
        for (const n of guia.NIVELES_DE_COMPARTIR) assert.ok(niveles.includes(`"${n}"`), `«${n}» no es un nivel de compartir`);
        const lista = leer(LISTA);
        const menuNota = [...lista.matchAll(/\/>\s*(Fijar|Mover a carpeta|Eliminar)\s*</g)].map((m) => m[1]);
        assert.deepEqual([...guia.MENU_DE_LA_NOTA], menuNota);
        const menuCarpeta = [...leer(PANEL).matchAll(/\/>\s*(Editar|Eliminar)\s*<\/DropdownMenuItem>/g)].map((m) => m[1]);
        assert.deepEqual([...guia.MENU_DE_LA_CARPETA], menuCarpeta);
        // Y cada una de esas listas la nombra algún paso de la guía.
        const todo = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => p.texto)).join(" \n ");
        for (const x of [...guia.PLANTILLAS_DOCUMENTADAS.map((p) => p.replace(/^\S+\s/, "")), ...guia.FORMATOS_DE_EXPORTAR, ...guia.NIVELES_DE_COMPARTIR, "Mover a carpeta"]) {
            assert.ok(todo.includes(x), `ningún paso de la guía nombra «${x}»`);
        }
    });

    test("la guía cubre todos los apartados de la pantalla, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, [
            "vista-general",
            "crear-y-escribir",
            "formato",
            "carpetas",
            "buscar-y-ordenar",
            "icono-y-color",
            "vincular-contacto",
            "compartir",
            "plantillas-y-exportar",
            "archivar-y-eliminar",
        ]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/notas/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("archivar-y-eliminar").siguiente, null);
        assert.equal(guia.lasVecinas("formato").anterior.slug, "crear-y-escribir");
        // Cada sección tiene su miniatura propia, como en Leads.
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        // Y la guía está en la lista de las que tienen introducción editable.
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"notas"/);
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
        const dir = path.join(RAIZ, "public", "guia", "notas");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/notas/${n}`);
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
        for (const f of ["app/guia/notas/page.tsx", "app/guia/notas/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const lecturas = [...leer("app/guia/notas/page.tsx").matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        // La MISMA guía: se quitan los nombres de cada módulo —y los
        // comentarios, que cuentan la historia de cada una— y el código que
        // queda tiene que ser idéntico. Una pieza que solo lleve una de las
        // dos es una guía que se pinta distinta de la otra.
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deNotas = [["NOTAS", "·"], ["Mis notas", "·"], ["Notas", "·"], ["notas", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/notas/${rel}`), deNotas),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/notas/${rel} no es la de Leads con otro nombre`,
            );
        }
    });
}
