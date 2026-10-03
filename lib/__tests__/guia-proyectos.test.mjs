/**
 * El banco de la GUÍA PÚBLICA de Proyectos (`/guia/proyectos`).
 *
 * Las mismas cosas que las demás guías, y por el mismo motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las partes de la barra, las
 *    cifras, las partes y los botones de una tarjeta, los campos de «Nuevo
 *    proyecto», las columnas del tablero, el filtro de vencimiento y las partes
 *    y campos de una tarea se leen de `ProjectsClient.tsx`, `ProjectBoard.tsx`,
 *    `TarjetaDeProyecto.tsx`, `FiltroDeVencimiento.tsx` y de las listas de
 *    `lib/project-types.ts`, `lib/task-types.ts` y `lib/vencimiento.ts`.
 * 2. **Cada imagen que la guía enseña existe**, y no sobra ninguna.
 * 3. **Es pública, no se indexa y sus dos páginas son las de Leads** con otro
 *    nombre, letra por letra.
 * 4. **Su tarjeta en «Tutoriales del módulo»**.
 *
 * `MODO=roto` lee los ficheros de `ANTES_PROYECTOS_REF` —pinchado, nunca
 * `origin/main`— y afirma que no había guía ni marcas en la pantalla.
 *
 * Se levanta con `scripts/banco-guia-proyectos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_PROYECTOS_REF ?? "84f98e5";

const LISTA = "app/(root)/proyectos/_components/ProjectsClient.tsx";
const TABLERO = "app/(root)/proyectos/_components/ProjectBoard.tsx";
const TARJETA = "app/(root)/proyectos/_components/TarjetaDeProyecto.tsx";

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
    test("ANTES no había guía pública de Proyectos", () => {
        assert.equal(leer("lib/guia-proyectos.ts"), "", "lib/guia-proyectos.ts ya existía");
        assert.equal(leer("app/guia/proyectos/page.tsx"), "", "la página ya existía");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_PROYECTOS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/modulo: "proyectos"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba");
    });

    test("ANTES la pantalla no exponía las marcas que la guía señala", () => {
        for (const marca of ["data-proyecto", 'data-zona="cifras"', 'data-campo="equipo"']) assert.ok(!leer(LISTA).includes(marca), `la lista ya tenía «${marca}»`);
        for (const marca of ["data-columna", 'data-campo="comentarios"', 'data-zona="mandos-del-tablero"']) assert.ok(!leer(TABLERO).includes(marca), `el tablero ya tenía «${marca}»`);
        assert.ok(!leer(TARJETA).includes("data-tarea"), "la tarjeta de tarea ya tenía su marca");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-proyectos/guia-proyectos.mjs"));
    const todo = guia.GUIA_PROYECTOS.secciones.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");
    const lista = leer(LISTA);
    const tablero = leer(TABLERO);
    const tarjeta = leer(TARJETA);
    const paso = (imagen) => guia.GUIA_PROYECTOS.secciones.flatMap((s) => s.pasos).find((p) => p.imagen === imagen).texto;
    const numera = (texto, nombres) => nombres.forEach((n, i) => assert.ok(texto.includes(`${i + 1} ${n}`), `no numera «${n}» como ${i + 1}`));

    test("la barra de trabajo: sus partes, sus cifras y sus filtros son los de la pantalla", () => {
        for (const p of guia.PARTES_DE_LA_BARRA_DE_TRABAJO) {
            if (["estado-y-responsable", "cifras", "carpetas"].includes(p.zona)) assert.ok(lista.includes(`data-zona="${p.zona}"`), `falta data-zona="${p.zona}"`);
        }
        assert.match(lista, /placeholder="Buscar proyecto\.\.\."/);
        assert.match(lista, /<BotonDeCrear[^>]*>Nuevo<\/BotonDeCrear>/);
        numera(paso("barra.webp"), guia.PARTES_DE_LA_BARRA_DE_TRABAJO.map((p) => p.nombre));
        const cifras = [...lista.slice(lista.indexOf("<PastillasDeMetricas")).matchAll(/etiqueta: "([^"]+)"/g)].slice(0, 4).map((m) => m[1]);
        assert.deepEqual(cifras, [...guia.CIFRAS_DOCUMENTADAS]);
        for (const c of [...guia.CIFRAS_DOCUMENTADAS, ...guia.ESTADOS_DOCUMENTADOS, ...guia.RESPONSABLES_DOCUMENTADOS]) {
            assert.ok(todo.includes(c), `la guía no nombra «${c}»`);
        }
        for (const r of guia.RESPONSABLES_DOCUMENTADOS) assert.ok(lista.includes(`"${r}"`), `el filtro de responsable no ofrece «${r}»`);
    });

    test("una tarjeta de proyecto: sus partes y sus botones, en su orden", () => {
        for (const p of guia.PARTES_DE_UN_PROYECTO) assert.ok(lista.includes(`data-zona="${p.zona}"`), `falta data-zona="${p.zona}"`);
        assert.match(lista, /data-proyecto=\{project\.name\}/);
        numera(paso("tarjeta.webp"), guia.PARTES_DE_UN_PROYECTO.map((p) => p.nombre));
        const mandos = lista.slice(lista.indexOf('data-zona="mandos"'));
        const titulos = [...mandos.slice(0, mandos.indexOf('data-zona="estado"')).matchAll(/title="([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual(titulos, [...guia.MANDOS_DE_UN_PROYECTO].slice(1), "los botones de la tarjeta no son los de la guía");
        assert.ok(leer("components/shared/Carpetas.tsx").includes("Mover a una carpeta"), "el primer botón no es «Mover a una carpeta»");
        numera(paso("mandos.webp"), [...guia.MANDOS_DE_UN_PROYECTO]);
    });

    test("«Nuevo proyecto»: sus campos, en su orden", () => {
        const campos = [...lista.matchAll(/data-campo="([a-z-]+)"/g)].map((m) => m[1]);
        assert.deepEqual(campos, guia.CAMPOS_DEL_PROYECTO.map((c) => c.campo));
        for (const c of guia.CAMPOS_DEL_PROYECTO) assert.ok(todo.includes(c.nombre), `la guía no nombra el campo «${c.nombre}»`);
        assert.match(lista, /"Crear proyecto"/);
    });

    test("el tablero: sus columnas, el filtro de vencimiento y «Dar por hecha»", () => {
        assert.deepEqual([...guia.COLUMNAS_DOCUMENTADAS], ["Por hacer", "En curso", "En revisión", "Hecho", "Cancelado"]);
        assert.match(tablero, /data-columna=\{status\}/);
        for (const z of ["cabecera-del-tablero", "proyecto", "mandos-del-tablero", "columnas"]) assert.ok(tablero.includes(`data-zona="${z}"`), `falta data-zona="${z}"`);
        assert.match(tablero, /<FiltroDeVencimiento/);
        assert.deepEqual([...guia.FILTROS_DOCUMENTADOS], ["Todas", "Solo vencidas", "Vencen esta semana"]);
        for (const f of [...guia.COLUMNAS_DOCUMENTADAS, ...guia.FILTROS_DOCUMENTADOS, "Dar por hecha"]) assert.ok(todo.includes(f), `la guía no nombra «${f}»`);
        assert.match(tablero, /<DialogTitle>Dar por hecha<\/DialogTitle>/);
        assert.match(tablero, /title=\{`Añadir tarea en \$\{label\}`\}/);
    });

    test("una tarea: las partes de su tarjeta y los campos de su ventana", () => {
        for (const p of guia.PARTES_DE_UNA_TAREA) {
            const donde = p.zona === "vencimiento" ? leer("components/shared/DistintivoDeVencimiento.tsx") : tarjeta;
            assert.ok(donde.includes(`data-zona="${p.zona}"`), `falta data-zona="${p.zona}"`);
        }
        assert.match(tarjeta, /data-tarea=/);
        numera(paso("tarea-tarjeta.webp"), guia.PARTES_DE_UNA_TAREA.map((p) => p.nombre));
        const campos = [...tablero.matchAll(/data-campo="([a-z-]+)"/g)].map((m) => m[1]).filter((c) => !["cuenta", "tipo-de-trabajo"].includes(c));
        assert.deepEqual(campos, guia.CAMPOS_DE_LA_TAREA.map((c) => c.campo));
        numera(paso("tarea-ventana.webp"), guia.CAMPOS_DE_LA_TAREA.slice(0, 5).map((c) => c.nombre));
        for (const t of guia.TIPOS_DOCUMENTADOS) assert.ok(todo.includes(t), `la guía no nombra el tipo «${t}»`);
        const adjuntos = leer("components/shared/BloqueDeAdjuntos.tsx");
        for (const a of guia.ADJUNTOS_DOCUMENTADOS) {
            assert.ok(adjuntos.includes(a), `BloqueDeAdjuntos no ofrece «${a}»`);
            assert.ok(todo.includes(a), `la guía no nombra «${a}»`);
        }
        assert.match(tablero, /<AlertDialogCancel[^>]*>Volver<\/AlertDialogCancel>/);
    });

    test("la guía cubre todos los apartados, y cada sección tiene su página", () => {
        const slugs = guia.GUIA_PROYECTOS.secciones.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "buscar-y-filtrar", "carpetas-y-orden", "crear", "editar-compartir-eliminar", "tablero", "vencimiento", "tarea", "adjuntos-y-comentarios"]);
        const pagina = leer("app/guia/proyectos/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.GUIA.laSeccion("no-existe"), null);
        assert.equal(guia.GUIA.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.GUIA.lasVecinas("adjuntos-y-comentarios").siguiente, null);
        for (const s of guia.GUIA_PROYECTOS.secciones) {
            assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 220, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"proyectos"/);
        assert.equal(guia.MODULO_DE_PROYECTOS, "Panel");
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "proyectos");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.GUIA.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/proyectos/${n}`);
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
        for (const f of ["app/guia/proyectos/page.tsx", "app/guia/proyectos/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deProyectos = [["PROYECTOS", "·"], ["Proyectos", "·"], ["proyectos", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/proyectos/${rel}`), deProyectos), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/proyectos/${rel} no es la de Leads con otro nombre`);
        }
    });

    test("su tarjeta en «Tutoriales del módulo»", () => {
        const fila = /\{\s*modulo: "proyectos",\s*ruta: "([^"]+)",\s*contenido: GUIA_PROYECTOS,\s*tarjeta: "([^"]+)",?\s*\}/.exec(leer("lib/tutoriales-del-modulo.ts"));
        assert.ok(fila, "falta la fila de Proyectos en GUIAS_PUBLICADAS");
        assert.equal(fila[1], "/proyectos");
        assert.match(fila[2], /^Aprende a .+ en la plataforma$/);
        assert.ok([...fila[2]].length <= 75, `la descripción mide ${[...fila[2]].length} caracteres`);
    });
}
