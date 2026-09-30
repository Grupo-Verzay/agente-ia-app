/**
 * El banco de la GUÍA PÚBLICA de Mis macros (`/guia/macros`).
 *
 * Las mismas cosas que las guías de Leads, Catálogo, Diagramas, Reuniones y
 * Mis notas, y por el mismo motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las acciones del editor por
 *    grupo, las pastillas de la barra, las partes de una macro de la lista, su
 *    menú «⋯», los mandos de cada acción, el pie del menú «Macros» de Chats, el
 *    tope de la pausa y las cinco calificaciones que documenta
 *    `lib/guia-macros.ts` se leen de `lib/macros.ts`, `MacrosManager.tsx`,
 *    `MacrosMenu.tsx` y `leadStatus.ts`. Una acción nueva en el editor sin su
 *    nombre en la guía pone esto en rojo, con el nombre de la que falta.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de las dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 * 5. **Su tarjeta en «Tutoriales del módulo»** dice «Guía de Mis macros» y una
 *    descripción con la forma de la casa.
 *
 * `MODO=roto` lee los ficheros de `ANTES_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma que no había guía de Mis macros ni marcas en la
 * pantalla con las que una receta pudiera señalar sus partes.
 *
 * Se levanta con `scripts/banco-guia-macros.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_MACROS_REF ?? "ab6b110";

const PANTALLA = "app/(root)/macros/_components/MacrosManager.tsx";
const MENU_DEL_CHAT = "app/(root)/chats/_components/MacrosMenu.tsx";
const REGLAS = "lib/macros.ts";

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
 * Los `title` de los botones de UNA macro de la lista, en su orden: el asa de
 * la fila que se arrastra y los tres botones de `MacroRowInner`. Se lee del
 * marcado, no de una lista escrita en el banco.
 */
export function losTitulosDeLaFila(fuente) {
    const fila = fuente.slice(fuente.indexOf("function MacroRowInner"), fuente.indexOf("export function MacrosManager"));
    const interior = fila.slice(0, fila.indexOf("function SortableMacroRow"));
    const asa = /title="(Arrastrar[^"]*)"/.exec(fila.slice(fila.indexOf("function SortableMacroRow")))?.[1];
    return [asa, ...[...interior.matchAll(/title="([^"]+)"/g)].map((m) => m[1])];
}

if (ROTO) {
    test("ANTES no había guía pública de Mis macros", () => {
        assert.equal(leer("lib/guia-macros.ts"), "", "lib/guia-macros.ts ya existía en ANTES_MACROS_REF");
        assert.equal(leer("app/guia/macros/page.tsx"), "", "la página ya existía en ANTES_MACROS_REF");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_MACROS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/["']macros["']/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía de macros");
        assert.ok(!/modulo: "macros"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta de «Tutoriales del módulo» ya estaba");
        // Y la pantalla no exponía nada con lo que una receta la pudiera
        // señalar: las capturas se habrían tomado por coordenadas.
        for (const marca of ["data-macro-de-la-lista", "data-editor-de-macro", "data-accion-de-macro", "data-agregar-accion"]) {
            assert.ok(!leer(PANTALLA).includes(marca), `la pantalla ya tenía «${marca}»`);
        }
        assert.ok(!leer(MENU_DEL_CHAT).includes("data-macros-de-chat") && !leer("app/(root)/chats/_components/chat-main.tsx").includes("data-macros-de-chat"), "el botón «Macros» de Chats ya tenía su marca");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-macros/guia-macros.mjs"));
    const reglas = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-macros/macros.mjs"));

    test("las acciones documentadas son EXACTAMENTE las del selector, grupo por grupo y en su orden", () => {
        const enLaPantalla = reglas.GRUPOS_DE_ACCIONES.map((g) => ({
            grupo: g.grupo,
            acciones: g.tipos.map((t) => reglas.ETIQUETA_DE_ACCION[t]),
        }));
        assert.deepEqual(
            guia.ACCIONES_DOCUMENTADAS.map((g) => ({ grupo: g.grupo, acciones: [...g.acciones] })),
            enLaPantalla,
            "la guía y el selector de acciones no nombran las mismas acciones",
        );
        // El selector pinta EXACTAMENTE esos grupos (`<optgroup>` sobre
        // GRUPOS_DE_ACCIONES) y cada acción con su etiqueta.
        const pantalla = leer(PANTALLA);
        assert.match(pantalla, /GRUPOS_DE_ACCIONES\.map\(\(g\) => \(\s*<optgroup key=\{g\.grupo\} label=\{g\.grupo\}>/, "el selector ya no pinta los grupos de lib/macros");
        assert.match(pantalla, /ETIQUETA_DE_ACCION\[t\]/, "el selector ya no nombra las acciones con ETIQUETA_DE_ACCION");
        // Y cada acción la nombra algún paso de la guía, en su sección.
        const todo = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");
        for (const a of guia.ACCIONES_DOCUMENTADAS.flatMap((g) => g.acciones)) {
            const corta = a.replace(/ \(pausa\)$/, "");
            assert.ok(todo.includes(corta), `ningún paso de la guía nombra «${corta}»`);
        }
    });

    test("la barra de trabajo, la fila, su menú y los mandos de una acción son los de la pantalla", () => {
        const pantalla = leer(PANTALLA);
        const pastillas = [...pantalla.slice(pantalla.indexOf("<PastillasDeMetricas")).matchAll(/etiqueta: '([^']+)'/g)].slice(0, 3).map((m) => m[1]);
        assert.deepEqual([...guia.PASTILLAS_DE_LA_BARRA], pastillas);
        assert.deepEqual(
            guia.PARTES_DE_UNA_MACRO.filter((p) => p.titulo).map((p) => p.titulo),
            losTitulosDeLaFila(pantalla),
            "las partes de una macro no son los botones de la fila, en su orden",
        );
        const texto = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "una-macro.webp").texto;
        guia.PARTES_DE_UNA_MACRO.forEach((p, i) => assert.ok(texto.includes(`${i + 1} ${p.nombre}`), `la fila no numera «${p.nombre}» como ${i + 1}`));
        const menu = [...pantalla.matchAll(/\/>\s*(Duplicar|Desactivar)\s*</g)].map((m) => m[1]);
        assert.deepEqual([...guia.MENU_DE_LA_MACRO], menu);
        const mandos = [...pantalla.matchAll(/title="(Subir|Bajar|Quitar)"/g)].map((m) => m[1]);
        assert.deepEqual([...guia.MANDOS_DE_UNA_ACCION], mandos);
        assert.match(leer(MENU_DEL_CHAT), new RegExp(`>\\s*${guia.PIE_DEL_MENU_DEL_CHAT}\\s*<`), "el pie del menú «Macros» ya no dice lo que la guía");
        assert.match(pantalla, /<BotonDeCrear onClick=\{openCreate\}>Nuevo<\/BotonDeCrear>/, "el botón de crear ya no dice «Nuevo»");
    });

    test("los números que la guía dice son los de las reglas: la pausa y las calificaciones", () => {
        const todo = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => p.texto)).join(" ");
        assert.match(todo, new RegExp(`hasta ${reglas.SEGUNDOS_MAXIMOS_DE_ESPERA} segundos`), "la guía no dice el tope de la pausa");
        assert.equal(reglas.CALIFICACIONES_CONOCIDAS.length, 5);
        assert.match(todo, /cinco calificaciones/);
        const pastillasDeChats = [...leer("app/(root)/crm/dashboard/helpers/leadStatus.ts").matchAll(/\{ value: "([A-Z]+)"/g)].map((m) => m[1]).slice(0, 5);
        assert.deepEqual([...reglas.CALIFICACIONES_CONOCIDAS], pastillasDeChats, "las calificaciones de una macro no son las de Chats");
    });

    test("la guía cubre todos los apartados de la pantalla, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, [
            "vista-general",
            "crear-una-macro",
            "responder",
            "otra-linea",
            "clasificar-y-enrutar",
            "tareas-y-cierre",
            "usar-en-un-chat",
            "buscar-y-ordenar",
            "activar-duplicar-eliminar",
            "acciones-masivas",
        ]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/macros/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("acciones-masivas").siguiente, null);
        assert.equal(guia.lasVecinas("responder").anterior.slug, "crear-una-macro");
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"macros"/);
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
        const dir = path.join(RAIZ, "public", "guia", "macros");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/macros/${n}`);
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
        for (const f of ["app/guia/macros/page.tsx", "app/guia/macros/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const lecturas = [...leer("app/guia/macros/page.tsx").matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deMacros = [["MACROS", "·"], ["Mis macros", "·"], ["Macros", "·"], ["macros", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/macros/${rel}`), deMacros),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/macros/${rel} no es la de Leads con otro nombre`,
            );
        }
    });

    test("su tarjeta en «Tutoriales del módulo»: «Guía de Mis macros», con la descripción de la casa", () => {
        const fila = /\{\s*modulo: "macros",\s*ruta: "([^"]+)",\s*contenido: GUIA_MACROS,\s*tarjeta: "([^"]+)",?\s*\}/.exec(leer("lib/tutoriales-del-modulo.ts"));
        assert.ok(fila, "falta la fila de Mis macros en GUIAS_PUBLICADAS");
        assert.equal(fila[1], "/macros");
        assert.equal(guia.GUIA_MACROS.titulo, "Mis macros", "el título de la tarjeta sale de aquí: «Guía de Mis macros»");
        const tarjeta = fila[2];
        assert.match(tarjeta, /^Aprende a .+ en la plataforma$/);
        assert.ok([...tarjeta].length <= 75, `la descripción mide ${[...tarjeta].length} caracteres`);
        assert.ok(!/[[\]]/.test(tarjeta), "la descripción lleva corchetes de plantilla");
    });
}
