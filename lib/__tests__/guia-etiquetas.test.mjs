/**
 * El banco de la GUÍA PÚBLICA de Etiquetas (`/guia/etiquetas`).
 *
 * Las mismas cuatro cosas que las guías de Leads y de Respuestas Rápidas, y por
 * el mismo motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las vistas, los rangos del
 *    filtro, las partes de la barra de trabajo, de la barra del tablero, de la
 *    cabecera de una columna y de cada tarjeta, y el «⋯» de acciones masivas
 *    que documenta `lib/guia-etiquetas.ts` se leen de `TagsPageClient.tsx`,
 *    `TagKanbanBoard.tsx`, `lib/etiquetas-de-la-pantalla.ts` y
 *    `CrmGlobalActionsMenu.tsx`. Un mando nuevo sin su nombre en la guía pone
 *    esto en rojo, con el nombre del que falta.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de las dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 *
 * Y la tarjeta de «Tutoriales del módulo» sale sola en `/tags`, con el título y
 * la descripción que pide la regla (`GUIAS_PUBLICADAS`).
 *
 * `MODO=roto` lee los ficheros de `ANTES_ET_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma que no había guía de Etiquetas, ni marcas en la
 * pantalla con las que una receta pudiera señalar sus partes.
 *
 * Se levanta con `scripts/banco-guia-etiquetas.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_ET_REF ?? "7767f6f";

const PANTALLA = "app/(root)/tags/components";
const PAGINA = `${PANTALLA}/TagsPageClient.tsx`;
const TABLERO = `${PANTALLA}/TagKanbanBoard.tsx`;
const LISTA = `${PANTALLA}/SortableTagList.tsx`;
const MASIVAS = "app/(root)/crm/dashboard/components/CrmGlobalActionsMenu.tsx";

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

/** Dónde aparece cada `data-zona` en un fichero (−1 si no está). */
const dondeEsta = (fuente, zona) => fuente.indexOf(`data-zona="${zona}"`);

if (ROTO) {
    test("ANTES no había guía pública de Etiquetas", () => {
        assert.equal(leer("lib/guia-etiquetas.ts"), "", "lib/guia-etiquetas.ts ya existía en ANTES_ET_REF");
        assert.equal(leer("app/guia/etiquetas/page.tsx"), "", "la página ya existía en ANTES_ET_REF");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_ET_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/"etiquetas"/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía");
        assert.ok(!/"\/tags"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba registrada");
        // Y la pantalla no exponía nada con lo que una receta la pudiera
        // señalar: las capturas se habrían tomado por coordenadas.
        for (const [fichero, zona] of [[PAGINA, "filtro-de-puntaje"], [TABLERO, "tablero"], [TABLERO, "puntuar"], [LISTA, "asa"]]) {
            assert.equal(dondeEsta(leer(fichero), zona), -1, `la pantalla ya tenía «data-zona="${zona}"»`);
        }
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-etiquetas/guia-etiquetas.mjs"));
    const todo = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");
    const textoDe = (imagen) => guia.SECCIONES.flatMap((s) => s.pasos).find((p) => p.imagen === imagen).texto;

    test("las dos vistas documentadas son las de la pantalla", () => {
        const pagina = leer(PAGINA);
        const zona = pagina.slice(dondeEsta(pagina, "vista"), pagina.indexOf("</div>", pagina.indexOf("Gestionar", dondeEsta(pagina, "vista"))));
        const vistas = [...zona.matchAll(/\/>\s*\n\s*(\w+)\s*\n\s*<\/button>/g)].map((m) => m[1]);
        assert.deepEqual(vistas, [...guia.VISTAS_DOCUMENTADAS]);
        for (const v of guia.VISTAS_DOCUMENTADAS) assert.ok(todo.includes(v), `ningún paso nombra la vista «${v}»`);
    });

    test("los cinco rangos del filtro son los de `RANGOS_DE_PUNTAJE`, con su tramo", () => {
        const reglas = leer("lib/etiquetas-de-la-pantalla.ts");
        const rangos = [...reglas.matchAll(/nombre: "(\w+)", min: (\d+), max: (\d+)/g)].map((m) => ({ nombre: m[1], tramo: `${m[2]}–${m[3]}` }));
        assert.equal(rangos.length, 5, `no se leyeron los rangos: ${JSON.stringify(rangos)}`);
        assert.deepEqual(guia.RANGOS_DOCUMENTADOS.map((r) => ({ ...r })), rangos);
        for (const r of guia.RANGOS_DOCUMENTADOS) assert.ok(todo.includes(r.nombre), `ningún paso nombra el rango «${r.nombre}»`);
        // Y la barra los pinta de ahí, no de una copia.
        assert.match(leer(PAGINA), /RANGOS_DE_PUNTAJE\.map/);
        assert.match(leer(TABLERO), /pasaElFiltroDePuntaje/);
    });

    test("la barra de trabajo: sus cuatro partes existen, en su orden, y la guía las numera así", () => {
        const pagina = leer(PAGINA);
        const posiciones = guia.PARTES_DE_LA_BARRA_DE_TRABAJO.map((p) => (p.zona === "acciones" ? pagina.indexOf("acciones={") : dondeEsta(pagina, p.zona)));
        posiciones.forEach((pos, i) => assert.ok(pos >= 0, `la barra no tiene «${guia.PARTES_DE_LA_BARRA_DE_TRABAJO[i].zona}»`));
        // «acciones» se escribe antes en el JSX (es una prop) pero se pinta la
        // última: se comparan solo las tres del carril.
        const carril = posiciones.slice(0, 3);
        assert.deepEqual([...carril].sort((a, b) => a - b), carril, "la guía no numera la barra en el orden en que se pinta");
        guia.PARTES_DE_LA_BARRA_DE_TRABAJO.forEach((p, i) => assert.ok(textoDe("barra.webp").includes(`${i + 1} ${p.nombre}`), `la barra no numera «${p.nombre}» como ${i + 1}`));
    });

    test("la barra del tablero y la cabecera de una columna: sus partes existen, en su orden", () => {
        const tablero = leer(TABLERO);
        for (const [partes, imagen] of [[guia.PARTES_DE_LA_BARRA_DEL_TABLERO, "barra-del-tablero.webp"], [guia.PARTES_DE_UNA_COLUMNA, "cabecera-de-columna.webp"]]) {
            const posiciones = partes.map((p) => dondeEsta(tablero, p.zona));
            posiciones.forEach((pos, i) => assert.ok(pos >= 0, `el tablero no tiene «${partes[i].zona}»`));
            assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones, `${imagen}: la guía no numera en el orden en que se pinta`);
            assert.equal((textoDe(imagen).match(/\d /g) ?? []).length, partes.length, `${imagen}: no numera ${partes.length} partes`);
        }
        assert.match(tablero, /label: 'Sin etiqueta'|"Sin etiqueta"|'Sin etiqueta'/, "la primera columna ya no es «Sin etiqueta»");
        assert.ok(todo.includes(guia.COLUMNA_SIN_ETIQUETA));
    });

    test("una tarjeta: sus seis partes existen, de arriba abajo, y la guía las numera así", () => {
        const tablero = leer(TABLERO);
        const tarjeta = tablero.slice(tablero.indexOf("data-tarjeta-del-tablero"));
        const orden = [
            tarjeta.indexOf('role="checkbox"'),
            tarjeta.indexOf('data-zona="contacto"'),
            tarjeta.indexOf("<ScoreBadge"),
            tarjeta.indexOf('data-zona="puntuar"'),
            tarjeta.indexOf('data-zona="motivo"'),
            tarjeta.indexOf('data-zona="estado"'),
        ];
        orden.forEach((pos, i) => assert.ok(pos >= 0, `a la tarjeta le falta su parte ${i + 1}`));
        assert.deepEqual([...orden].sort((a, b) => a - b), orden, "la guía no numera la tarjeta en el orden en que se pinta");
        assert.ok(dondeEsta(tablero, "puntaje") >= 0, "la insignia del puntaje no tiene su marca");
        assert.equal((textoDe("tarjeta.webp").match(/\d /g) ?? []).length, 6);
    });

    test("el «⋯» de la barra es el de la pantalla, sin los registros", () => {
        const masivas = leer(MASIVAS);
        const enLaPantalla = [...masivas.matchAll(/label: `([^`(]+?) \(\$\{\w+FollowUpsCount\}\)`/g)].map((m) => m[1]);
        assert.deepEqual([...guia.ACCIONES_MASIVAS_DOCUMENTADAS], enLaPantalla);
        assert.match(leer(PAGINA), /hideRegistros/, "Etiquetas ya no esconde los registros del CRM en su «⋯»");
        assert.match(masivas, /aria-label="Acciones masivas"/);
    });

    test("la guía cubre todos los apartados de la pantalla, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, [
            "vista-general",
            "el-tablero",
            "arrastrar",
            "calificar-con-ia",
            "filtrar-por-puntaje",
            "seleccion-multiple",
            "crear-etiqueta",
            "editar-etiqueta",
            "ordenar-etiquetas",
            "eliminar-etiqueta",
        ]);
        const pagina = leer("app/guia/etiquetas/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("eliminar-etiqueta").siguiente, null);
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"etiquetas"/);
        assert.match(leer("actions/guia-introduccion-actions.ts"), /"etiquetas"/);
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

    test("la tarjeta de «Tutoriales del módulo» sale sola en /tags, con su título y su descripción", () => {
        const t = leer("lib/tutoriales-del-modulo.ts");
        const fila = /\{[^{}]*modulo:\s*"etiquetas"[^{}]*\}/.exec(t)?.[0] ?? "";
        assert.ok(fila, "no hay fila de etiquetas en GUIAS_PUBLICADAS");
        assert.match(fila, /ruta:\s*"\/tags"/);
        const tarjeta = /tarjeta:\s*"([^"]+)"/.exec(fila)?.[1] ?? "";
        assert.match(tarjeta, /^Aprende a [^[\]]+ en la plataforma$/, `«${tarjeta}» no sigue el formato «Aprende a … en la plataforma»`);
        assert.ok([...tarjeta].length <= 75, `la descripción mide ${[...tarjeta].length} caracteres`);
        assert.equal(guia.GUIA_ETIQUETAS.titulo, "Etiquetas");
        assert.ok(leer("scripts/sembrar-guia-etiquetas.mjs").includes(`description: "${tarjeta}"`), "la semilla dice otra descripción");
        assert.match(leer("lib/navigation-routes.ts"), /"\/tags"/);
    });

    test("los datos de ejemplo no son de nadie: ni correos ni teléfonos de verdad", () => {
        const datos = leer("scripts/guia-etiquetas-datos.mjs");
        assert.doesNotMatch(datos, /@(gmail|hotmail|outlook|yahoo)\./, "un correo real en los datos de ejemplo");
        assert.doesNotMatch(datos, /verzay/i);
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "etiquetas");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/etiquetas/${n}`);
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
        for (const f of ["app/guia/etiquetas/page.tsx", "app/guia/etiquetas/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
        const lecturas = [...leer("app/guia/etiquetas/page.tsx").matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deEtiquetas = [["ETIQUETAS", "·"], ["Etiquetas", "·"], ["etiquetas", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/etiquetas/${rel}`), deEtiquetas),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/etiquetas/${rel} no es la de Leads con otro nombre`,
            );
        }
    });
}
