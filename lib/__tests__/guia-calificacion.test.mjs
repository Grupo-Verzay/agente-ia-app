/**
 * El banco de la GUÍA PÚBLICA de Calificación (`/guia/calificacion`).
 *
 * Las mismas cuatro cosas que las demás guías, y por el mismo motivo —se
 * rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las seis columnas, los cinco
 *    rangos del filtro, las partes de la barra de trabajo, de la barra del
 *    tablero, de la cabecera de una columna y de cada tarjeta, y las acciones
 *    de una automatización que documenta `lib/guia-calificacion.ts` se leen de
 *    `KanbanBoard.tsx`, `CrmDashboard.tsx`, `lib/etiquetas-de-la-pantalla.ts` y
 *    `StageAutomationsPanel.tsx`. Un mando nuevo sin su nombre en la guía pone
 *    esto en rojo, con el nombre del que falta.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de las dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 *
 * Y la tarjeta de «Tutoriales del módulo» sale sola en `/crm/kanban`.
 *
 * `MODO=roto` lee los ficheros de `ANTES_CAL_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma que no había guía de Calificación, ni marcas en la
 * pantalla con las que una receta pudiera señalar sus partes.
 *
 * Se levanta con `scripts/banco-guia-calificacion.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_CAL_REF ?? "84f98e5";

const TABLERO = "app/(root)/crm/kanban/_components/KanbanBoard.tsx";
const PAGINA = "app/(root)/crm/dashboard/components/CrmDashboard.tsx";
const AUTOMATIZACIONES = "app/(root)/crm/rules/components/StageAutomationsPanel.tsx";

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
const numerados = (texto) => (texto.match(/(?:^|· )\d /g) ?? []).length;

if (ROTO) {
    test("ANTES no había guía pública de Calificación", () => {
        assert.equal(leer("lib/guia-calificacion.ts"), "", "lib/guia-calificacion.ts ya existía en ANTES_CAL_REF");
        assert.equal(leer("app/guia/calificacion/page.tsx"), "", "la página ya existía en ANTES_CAL_REF");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_CAL_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/"calificacion"/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía");
        assert.ok(!/"\/crm\/kanban"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba registrada");
        for (const [fichero, zona] of [[TABLERO, "puntuar"], [TABLERO, "automatizaciones"], [PAGINA, "filtro-de-puntaje"], [AUTOMATIZACIONES, "automatizacion"]]) {
            assert.equal(dondeEsta(leer(fichero), zona), -1, `la pantalla ya tenía «data-zona="${zona}"»`);
        }
        // Y los rangos de puntaje estaban copiados en el tablero: el filtro y la
        // insignia no salían de la misma regla que Etiquetas.
        assert.match(leer(TABLERO), /SCORE_RANGES/);
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-calificacion/guia-calificacion.mjs"));
    const todo = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");
    const textoDe = (imagen) => guia.SECCIONES.flatMap((s) => s.pasos).find((p) => p.imagen === imagen).texto;

    test("las seis columnas documentadas son las del tablero, en su orden", () => {
        const tablero = leer(TABLERO);
        const bloque = tablero.slice(tablero.indexOf("const COLUMNS"), tablero.indexOf("];", tablero.indexOf("const COLUMNS")));
        const columnas = [...bloque.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
        assert.deepEqual(columnas, [...guia.COLUMNAS_DOCUMENTADAS]);
        for (const c of guia.COLUMNAS_DOCUMENTADAS) assert.ok(todo.includes(c), `ningún paso nombra la columna «${c}»`);
        assert.equal(guia.COLUMNA_SIN_CLASIFICAR, columnas[0]);
    });

    test("los cinco rangos del filtro son los de `RANGOS_DE_PUNTAJE`, con su tramo", () => {
        const reglas = leer("lib/etiquetas-de-la-pantalla.ts");
        const rangos = [...reglas.matchAll(/nombre: "(\w+)", min: (\d+), max: (\d+)/g)].map((m) => ({ nombre: m[1], tramo: `${m[2]}–${m[3]}` }));
        assert.equal(rangos.length, 5, `no se leyeron los rangos: ${JSON.stringify(rangos)}`);
        assert.deepEqual(guia.RANGOS_DOCUMENTADOS.map((r) => ({ ...r })), rangos);
        for (const r of guia.RANGOS_DOCUMENTADOS) assert.ok(todo.includes(`${r.nombre} (${r.tramo})`), `ningún paso nombra el rango «${r.nombre} (${r.tramo})»`);
        // Y la barra y el tablero los sacan de ahí, no de una copia.
        assert.match(leer(PAGINA), /RANGOS_DE_PUNTAJE\.map/);
        assert.match(leer(TABLERO), /pasaElFiltroDePuntaje/);
        assert.doesNotMatch(leer(TABLERO), /SCORE_RANGES/, "el tablero vuelve a llevar su propia copia de los rangos");
        assert.match(leer(PAGINA), /elFiltroDePuntaje/, "pulsar el rango puesto no lo quita");
    });

    test("la barra de trabajo: las pestañas del CRM y el filtro, en su orden", () => {
        const pagina = leer(PAGINA);
        const pos = guia.PARTES_DE_LA_BARRA_DE_TRABAJO.map((p) => dondeEsta(pagina, p.zona));
        pos.forEach((p, i) => assert.ok(p >= 0, `la barra no tiene «${guia.PARTES_DE_LA_BARRA_DE_TRABAJO[i].zona}»`));
        assert.deepEqual([...pos].sort((a, b) => a - b), pos, "la guía no numera la barra en el orden en que se pinta");
        assert.equal(numerados(textoDe("barra.webp")), guia.PARTES_DE_LA_BARRA_DE_TRABAJO.length);
        const pestanas = pagina.slice(dondeEsta(pagina, "pestanas-del-crm"), dondeEsta(pagina, "filtro-de-puntaje"));
        for (const p of ["Analíticas", "Registros", "Kanban", "Reportes"]) assert.ok(pestanas.includes(p), `las pestañas del CRM ya no tienen «${p}»`);
    });

    test("la barra del tablero y la cabecera de una columna: sus partes existen, en su orden", () => {
        const tablero = leer(TABLERO);
        for (const [partes, imagen] of [[guia.PARTES_DE_LA_BARRA_DEL_TABLERO, "barra-del-tablero.webp"], [guia.PARTES_DE_UNA_COLUMNA, "cabecera-de-columna.webp"]]) {
            const posiciones = partes.map((p) => dondeEsta(tablero, p.zona));
            posiciones.forEach((pos, i) => assert.ok(pos >= 0, `el tablero no tiene «${partes[i].zona}»`));
            if (imagen === "cabecera-de-columna.webp") {
                assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones, `${imagen}: la guía no numera en el orden en que se pinta`);
            }
            assert.equal(numerados(textoDe(imagen)), partes.length, `${imagen}: no numera ${partes.length} partes`);
        }
        // La barra del tablero se pinta en este orden: buscador, contador, actualizar, calificar.
        const barra = guia.PARTES_DE_LA_BARRA_DEL_TABLERO.map((p) => tablero.lastIndexOf(`data-zona="${p.zona}"`));
        assert.deepEqual([...barra].sort((a, b) => a - b), barra, "la barra del tablero no se numera en el orden en que se pinta");
    });

    test("una tarjeta: sus ocho partes existen, de arriba abajo, y la guía las numera así", () => {
        const tablero = leer(TABLERO);
        const tarjeta = tablero.slice(tablero.indexOf("data-tarjeta-del-tablero"));
        const pos = guia.PARTES_DE_UNA_TARJETA.map((p) => (p.zona === "puntaje" ? tarjeta.indexOf("<ScoreBadge") : tarjeta.indexOf(`data-zona="${p.zona}"`)));
        pos.forEach((p, i) => assert.ok(p >= 0, `a la tarjeta le falta «${guia.PARTES_DE_UNA_TARJETA[i].zona}»`));
        assert.deepEqual([...pos].sort((a, b) => a - b), pos, "la guía no numera la tarjeta en el orden en que se pinta");
        assert.ok(dondeEsta(tablero, "puntaje") >= 0, "la insignia del puntaje no tiene su marca");
        assert.equal(numerados(textoDe("tarjeta.webp")), 8);
    });

    test("las acciones de una automatización son las de la pantalla, todas", () => {
        const panel = leer(AUTOMATIZACIONES);
        const bloque = panel.slice(panel.indexOf("const ACTION_TYPES"), panel.indexOf("];", panel.indexOf("const ACTION_TYPES")));
        const acciones = [...bloque.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual([...guia.ACCIONES_DE_UNA_AUTOMATIZACION], acciones);
        for (const zona of ["automatizacion", "acciones", "accion", "nueva-automatizacion", "eliminar-automatizacion"]) {
            assert.ok(dondeEsta(panel, zona) >= 0, `el panel de automatizaciones no tiene «${zona}»`);
        }
        assert.equal(numerados(textoDe("automatizaciones-lista.webp")), 3);
    });

    test("la guía cubre todos los apartados de la pantalla, y cada sección tiene su página", () => {
        assert.deepEqual(
            guia.SECCIONES.map((s) => s.slug),
            ["vista-general", "el-tablero", "buscar", "arrastrar", "calificar-con-ia", "filtrar-por-puntaje", "automatizaciones"],
        );
        const pagina = leer("app/guia/calificacion/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("automatizaciones").siguiente, null);
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"calificacion"/);
        assert.match(leer("actions/guia-introduccion-actions.ts"), /\bcalificacion:/);
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

    test("la tarjeta de «Tutoriales del módulo» sale sola en /crm/kanban, con su título y su descripción", () => {
        const t = leer("lib/tutoriales-del-modulo.ts");
        const fila = /\{[^{}]*modulo:\s*"calificacion"[^{}]*\}/.exec(t)?.[0] ?? "";
        assert.ok(fila, "no hay fila de calificacion en GUIAS_PUBLICADAS");
        assert.match(fila, /ruta:\s*"\/crm\/kanban"/);
        const tarjeta = /tarjeta:\s*"([^"]+)"/.exec(fila)?.[1] ?? "";
        assert.equal(tarjeta, "Aprende a calificar tus contactos por etapa en la plataforma");
        assert.ok([...tarjeta].length <= 75, `la descripción mide ${[...tarjeta].length} caracteres`);
        assert.equal(guia.GUIA_CALIFICACION.titulo, "Calificación");
        assert.ok(leer("scripts/sembrar-guia-calificacion.mjs").includes(`description: "${tarjeta}"`), "la semilla dice otra descripción");
        assert.match(leer("lib/navigation-routes.ts"), /"\/crm\/kanban"/);
    });

    test("los datos de ejemplo no son de nadie: ni correos ni teléfonos de verdad", () => {
        const datos = leer("scripts/guia-calificacion-datos.mjs");
        assert.doesNotMatch(datos, /@(gmail|hotmail|outlook|yahoo)\./, "un correo real en los datos de ejemplo");
        assert.doesNotMatch(datos, /verzay/i);
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "calificacion");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/calificacion/${n}`);
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
        for (const f of ["app/guia/calificacion/page.tsx", "app/guia/calificacion/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
        const lecturas = [...leer("app/guia/calificacion/page.tsx").matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deCalificacion = [["CALIFICACION", "·"], ["Calificación", "·"], ["Calificacion", "·"], ["calificacion", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(
                neutra(leer(`app/guia/calificacion/${rel}`), deCalificacion),
                neutra(leer(`app/guia/leads/${rel}`), deLeads),
                `app/guia/calificacion/${rel} no es la de Leads con otro nombre`,
            );
        }
    });
}
