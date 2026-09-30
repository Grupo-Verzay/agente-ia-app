/**
 * El banco de la GUÍA PÚBLICA de Respuestas Rápidas (`/guia/respuestas-rapidas`).
 *
 * Las mismas cuatro cosas que las guías de Leads y de Mis notas, y por el
 * mismo motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las pastillas, las categorías,
 *    los dos tipos de la ventana de crear, las partes de la barra de trabajo y
 *    de cada respuesta, y el «⋯» de la barra que documenta
 *    `lib/guia-respuestas-rapidas.ts` se leen de `MainAutoReplies.tsx`,
 *    `ReplyTypeSelector.tsx`, `lib/quick-reply-categories.ts`,
 *    `SortableAutoRepliesList.tsx`, `AutoRepliesCard.tsx` y
 *    `AutoRepliesActions.tsx`. Una pastilla o un mando nuevo sin su nombre en
 *    la guía pone esto en rojo, con el nombre del que falta.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de las dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 *
 * Y la tarjeta de «Tutoriales del módulo» sale sola en `/auto-replies`, con el
 * título y la descripción que pide la regla (`GUIAS_PUBLICADAS`).
 *
 * `MODO=roto` lee los ficheros de `ANTES_RR_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma que no había guía de Respuestas Rápidas, ni marcas en
 * la pantalla con las que una receta pudiera señalar sus partes.
 *
 * Se levanta con `scripts/banco-guia-respuestas-rapidas.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_RR_REF ?? "ab6b110";

const PANTALLA = "app/(root)/auto-replies/_components";
const MAIN = `${PANTALLA}/MainAutoReplies.tsx`;
const LISTA = `${PANTALLA}/SortableAutoRepliesList.tsx`;
const TARJETA = `${PANTALLA}/AutoRepliesCard.tsx`;
const MANDOS = `${PANTALLA}/AutoRepliesActions.tsx`;
const TIPOS = `${PANTALLA}/ReplyTypeSelector.tsx`;

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

/** Los rótulos de las pastillas de la barra, en su orden, leídos del marcado. */
export function lasPastillasDeLaBarra(fuente) {
    const ini = fuente.indexOf("<PastillasDeMetricas");
    if (ini < 0) return [];
    const fin = fuente.indexOf("/>", fuente.indexOf("]}", ini));
    return [...fuente.slice(ini, fin).matchAll(/etiqueta: '([^']+)'/g)].map((m) => m[1]);
}

/** Dónde aparece cada `data-zona` en un fichero (−1 si no está). */
const dondeEsta = (fuente, zona) => fuente.indexOf(`data-zona="${zona}"`);

if (ROTO) {
    test("ANTES no había guía pública de Respuestas Rápidas", () => {
        assert.equal(leer("lib/guia-respuestas-rapidas.ts"), "", "lib/guia-respuestas-rapidas.ts ya existía en ANTES_RR_REF");
        assert.equal(leer("app/guia/respuestas-rapidas/page.tsx"), "", "la página ya existía en ANTES_RR_REF");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_RR_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/respuestas-rapidas/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía");
        assert.ok(!/auto-replies/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba registrada");
        // Y la pantalla no exponía nada con lo que una receta la pudiera
        // señalar: las capturas se habrían tomado por coordenadas.
        for (const [fichero, zona] of [[LISTA, "asa"], [LISTA, "lista-de-respuestas"], [TARJETA, "atajo"], [MAIN, "filtro-de-categoria"]]) {
            assert.equal(dondeEsta(leer(fichero), zona), -1, `la pantalla ya tenía «data-zona="${zona}"»`);
        }
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-respuestas-rapidas/guia-respuestas-rapidas.mjs"));
    const todo = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");

    test("las pastillas documentadas son EXACTAMENTE las de la barra, en su orden", () => {
        const enLaPantalla = lasPastillasDeLaBarra(leer(MAIN));
        assert.equal(enLaPantalla.length, 3, `no se leyeron las pastillas: ${JSON.stringify(enLaPantalla)}`);
        assert.deepEqual([...guia.PASTILLAS_DOCUMENTADAS], enLaPantalla);
        for (const p of guia.PASTILLAS_DOCUMENTADAS) assert.ok(todo.includes(p), `ningún paso nombra la pastilla «${p}»`);
    });

    test("las categorías y los dos tipos son los del código", () => {
        const categorias = [...leer("lib/quick-reply-categories.ts").matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual([...guia.CATEGORIAS_DOCUMENTADAS], categorias);
        const tipos = [...leer(TIPOS).matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual([...guia.TIPOS_DE_RESPUESTA], tipos);
        for (const t of guia.TIPOS_DE_RESPUESTA) assert.ok(todo.includes(t), `ningún paso nombra el tipo «${t}»`);
    });

    test("la barra de trabajo: sus cinco partes existen, en el orden de la barra, y la guía las numera así", () => {
        const main = leer(MAIN);
        // Cada zona está en el componente, y en el orden en que la barra las pinta.
        const posiciones = guia.PARTES_DE_LA_BARRA_DE_TRABAJO.map((p) => {
            if (p.zona === "crear" || p.zona === "acciones") return main.indexOf(`${p.zona}={`);
            return dondeEsta(main, p.zona);
        });
        posiciones.forEach((pos, i) => assert.ok(pos >= 0, `la barra no tiene «${guia.PARTES_DE_LA_BARRA_DE_TRABAJO[i].zona}»`));
        assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones, "la guía no numera la barra en el orden en que se pinta");
        const texto = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "barra.webp").texto;
        guia.PARTES_DE_LA_BARRA_DE_TRABAJO.forEach((p, i) => assert.ok(texto.includes(`${i + 1} ${p.nombre}`), `la barra no numera «${p.nombre}» como ${i + 1}`));
    });

    test("una respuesta: sus partes existen en la fila, de izquierda a derecha, y la guía las numera así", () => {
        // La fila la pintan tres ficheros, uno dentro del otro: la lista (asa y
        // casilla), la tarjeta (tipo, atajo, categoría y mensaje) y sus mandos.
        const fila = leer(LISTA);
        const tarjeta = leer(TARJETA);
        const mandos = leer(MANDOS);
        assert.ok(dondeEsta(fila, "asa") < dondeEsta(fila, "casilla"), "el asa va antes que la casilla");
        assert.ok(fila.indexOf("<AutoRepliesCard") > dondeEsta(fila, "casilla"), "la tarjeta va después de la casilla");
        const tipo = tarjeta.indexOf('title={esTexto ? "Texto simple" : "Ejecuta un flujo"}');
        assert.ok(tipo >= 0, "la tarjeta ya no dice su tipo en el icono");
        const orden = [tipo, dondeEsta(tarjeta, "atajo"), dondeEsta(tarjeta, "categoria"), dondeEsta(tarjeta, "mensaje")];
        orden.forEach((pos) => assert.ok(pos >= 0));
        assert.deepEqual([...orden].sort((a, b) => a - b), orden, "la guía no numera la tarjeta en el orden en que se pinta");
        assert.ok(dondeEsta(mandos, "mas-acciones") >= 0, "los mandos no tienen su «⋯»");
        assert.ok(tarjeta.indexOf("<AutoRepliesActions") > dondeEsta(tarjeta, "mensaje"), "los mandos van al final de la tarjeta");
        const texto = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "tarjeta.webp").texto;
        guia.PARTES_DE_UNA_RESPUESTA.forEach((p, i) => assert.ok(texto.includes(`${i + 1} ${p.nombre}`), `la tarjeta no numera «${p.nombre}» como ${i + 1}`));
    });

    test("el «⋯» de la barra es el de la pantalla, y los mandos de una respuesta los nombra la guía", () => {
        const main = leer(MAIN);
        assert.match(main, /etiqueta: seleccion\.estanTodos \? 'Desmarcar todas' : 'Marcar todas las que se ven'/);
        assert.match(leer("components/shared/AccionesMasivas.tsx"), /Eliminar \{cuantas\}/);
        for (const a of guia.ACCIONES_MASIVAS_DOCUMENTADAS) assert.ok(todo.includes(a), `ningún paso nombra «${a}»`);
        // Los mandos de cada respuesta: el editor del flujo y el «⋯» con Eliminar.
        const mandos = leer(MANDOS);
        assert.ok(dondeEsta(mandos, "editar-flujo") >= 0, "una respuesta de flujo ya no lleva su «Editar flujo»");
        assert.ok(todo.includes("Editar flujo") || todo.includes("editor"), "ningún paso nombra cómo se abre el flujo");
    });

    test("la guía cubre todos los apartados de la pantalla, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, [
            "vista-general",
            "crear-de-texto",
            "crear-con-flujo",
            "editar",
            "filtrar-y-buscar",
            "ordenar",
            "eliminar",
            "usar-en-un-chat",
        ]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/respuestas-rapidas/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("usar-en-un-chat").siguiente, null);
        assert.equal(guia.lasVecinas("editar").anterior.slug, "crear-con-flujo");
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"respuestas-rapidas"/);
        assert.match(leer("actions/guia-introduccion-actions.ts"), /"respuestas-rapidas"/);
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

    test("la tarjeta de «Tutoriales del módulo» sale sola en /auto-replies, con su título y su descripción", async () => {
        const t = leer("lib/tutoriales-del-modulo.ts");
        const fila = /\{[^{}]*modulo:\s*"respuestas-rapidas"[^{}]*\}/.exec(t)?.[0] ?? "";
        assert.ok(fila, "no hay fila de respuestas-rapidas en GUIAS_PUBLICADAS");
        assert.match(fila, /ruta:\s*"\/auto-replies"/);
        const tarjeta = /tarjeta:\s*"([^"]+)"/.exec(fila)?.[1] ?? "";
        assert.match(tarjeta, /^Aprende a [^[\]]+ en la plataforma$/, `«${tarjeta}» no sigue el formato «Aprende a … en la plataforma»`);
        assert.ok([...tarjeta].length <= 75, `la descripción mide ${[...tarjeta].length} caracteres`);
        // El título lo pone la guía: «Guía de Respuestas Rápidas».
        assert.equal(guia.GUIA_RESPUESTAS_RAPIDAS.titulo, "Respuestas Rápidas");
        // Y la semilla usa esa misma descripción.
        assert.ok(leer("scripts/sembrar-guia-respuestas-rapidas.mjs").includes(`description: "${tarjeta}"`), "la semilla dice otra descripción");
        assert.match(leer("app/(root)/auto-replies/page.tsx") + leer("lib/navigation-routes.ts"), /auto-replies/);
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "respuestas-rapidas");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/respuestas-rapidas/${n}`);
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
        for (const f of ["app/guia/respuestas-rapidas/page.tsx", "app/guia/respuestas-rapidas/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const lecturas = [...leer("app/guia/respuestas-rapidas/page.tsx").matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deRR = [["RESPUESTAS_RAPIDAS", "·"], ["Respuestas Rápidas", "·"], ["respuestas-rapidas", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/respuestas-rapidas/${rel}`), deRR),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/respuestas-rapidas/${rel} no es la de Leads con otro nombre`,
            );
        }
    });
}
