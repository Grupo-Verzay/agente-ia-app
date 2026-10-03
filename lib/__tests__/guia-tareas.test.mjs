/**
 * El banco de la GUÍA PÚBLICA de Mis tareas (`/guia/tareas`).
 *
 * Las mismas cosas que las demás guías, y por el mismo motivo —se rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Las vistas, las cifras, los
 *    grupos de la lista, las columnas del Kanban, los campos de «Nueva tarea» y
 *    de «Completar tarea», los resultados rápidos, los atajos de la siguiente,
 *    las partes de una tarea y las acciones de una automatización se leen de
 *    `TasksClient.tsx`, `TaskFormDialog.tsx`, `TaskTypeAutomationsPanel.tsx`,
 *    `lib/task-types.ts` y `lib/pantalla-de-tareas.ts`.
 * 2. **Lo que se arregló en la pantalla al documentarla**: la vista Lista y las
 *    cifras dicen lo mismo de «vencida» (una regla), la fecha propuesta va en
 *    la hora de quien mira, cancelar y eliminar se confirman, el título abre la
 *    ficha y en el Kanban el título parte en líneas, no se corta con «…».
 * 3. **Cada imagen que la guía enseña existe**, y no sobra ninguna.
 * 4. **Es pública, no se indexa y sus dos páginas son las de Leads** con otro
 *    nombre, letra por letra.
 * 5. **Su tarjeta en «Tutoriales del módulo»**.
 *
 * `MODO=roto` lee los ficheros de `ANTES_TAREAS_REF` —pinchado, nunca
 * `origin/main`— y afirma que no había guía, que las cifras y la lista decían
 * cosas distintas de una tarea de esta mañana y que eliminar no se confirmaba.
 *
 * Se levanta con `scripts/banco-guia-tareas.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_TAREAS_REF ?? "400482e";

const PANTALLA = "app/(root)/tareas/_components/TasksClient.tsx";
const FICHA = "app/(root)/tareas/_components/FichaDeLaTarea.tsx";
const CREAR = "app/(root)/chats/_components/TaskFormDialog.tsx";
const AUTOMATIZACIONES = "app/(root)/crm/rules/components/TaskTypeAutomationsPanel.tsx";

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
    test("ANTES no había guía pública de Mis tareas", () => {
        assert.equal(leer("lib/guia-tareas.ts"), "", "lib/guia-tareas.ts ya existía");
        assert.equal(leer("app/guia/tareas/page.tsx"), "", "la página ya existía");
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_TAREAS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.ok(!/modulo: "tareas"/.test(leer("lib/tutoriales-del-modulo.ts")), "la tarjeta ya estaba");
        for (const marca of ['data-zona="lista"', "data-grupo", "data-columna", "data-ventana-de-completar"]) {
            assert.ok(!leer(PANTALLA).includes(marca), `la pantalla ya tenía «${marca}»`);
        }
        assert.ok(!leer(CREAR).includes("data-campo"), "el panel de crear ya tenía sus marcas");
    });

    test("ANTES las cifras y la lista no compartían la regla de «vencida»", () => {
        assert.equal(leer("lib/pantalla-de-tareas.ts"), "", "la regla común ya existía");
        assert.ok(!leer(PANTALLA).includes("elGrupoDeLaTarea"), "la lista ya usaba la regla común");
    });

    test("ANTES eliminar una tarea no pedía confirmación", () => {
        assert.ok(!leer(PANTALLA).includes("data-confirmar"), "eliminar ya se confirmaba");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-tareas/guia-tareas.mjs"));
    const reglas = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-tareas/pantalla-de-tareas.mjs"));
    const todo = guia.GUIA_TAREAS.secciones.flatMap((s) => s.pasos.map((p) => `${p.titulo} ${p.texto}`)).join(" \n ");
    const pantalla = leer(PANTALLA);

    test("la barra: las vistas, las cifras, «Completadas», «Actualizar» y «Nuevo» son los de la pantalla", () => {
        const vista = pantalla.slice(pantalla.indexOf('data-zona="vista"'));
        const botones = [...vista.slice(0, vista.indexOf("<ModuleToolbar")).matchAll(/\/>\s*(Lista|Kanban)\s*</g)].map((m) => m[1]);
        assert.deepEqual(botones, [...guia.VISTAS_DOCUMENTADAS]);
        const cifras = [...pantalla.slice(pantalla.indexOf("<PastillasDeMetricas")).matchAll(/etiqueta: "([^"]+)"/g)].slice(0, 3).map((m) => m[1]);
        assert.deepEqual(cifras, [...guia.CIFRAS_DOCUMENTADAS]);
        assert.match(pantalla, /<BotonDeCrear onClick=\{\(\) => setNewTaskOpen\(true\)\}>Nuevo<\/BotonDeCrear>/);
        assert.match(pantalla, /aria-label="Actualizar"/);
        assert.match(pantalla, /data-zona="completadas"/);
        for (const p of guia.PARTES_DE_LA_BARRA_DE_TRABAJO) {
            if (["vista", "cifras", "completadas"].includes(p.zona)) assert.ok(pantalla.includes(`data-zona="${p.zona}"`), `falta data-zona="${p.zona}"`);
        }
        for (const c of [...guia.VISTAS_DOCUMENTADAS, ...guia.CIFRAS_DOCUMENTADAS]) assert.ok(todo.includes(c), `la guía no nombra «${c}»`);
    });

    test("los grupos de la lista y las cifras salen de UNA regla", () => {
        assert.deepEqual([...guia.GRUPOS_DOCUMENTADOS], ["Vencidas", "Hoy", "Mañana", "Esta semana", "Más adelante", "Completadas"]);
        for (const g of guia.GRUPOS_DOCUMENTADOS) assert.ok(todo.toLowerCase().includes(g.toLowerCase()), `la guía no nombra el grupo «${g}»`);
        assert.match(pantalla, /elGrupoDeLaTarea\(/, "la lista no agrupa con la regla común");
        assert.match(pantalla, /lasCifras\(/, "las cifras no salen de la regla común");
        const ahora = new Date(2026, 9, 2, 12, 0);
        // Una tarea de esta mañana: vencida en la cifra Y en la lista, no en «Hoy».
        const estaManana = { status: "pending", dueDate: new Date(2026, 9, 2, 8, 0) };
        assert.equal(reglas.elGrupoDeLaTarea(estaManana, ahora), "Vencidas");
        assert.deepEqual(reglas.lasCifras([estaManana], ahora), { pendientes: 1, vencidas: 1, paraHoy: 0, completadas: 0 });
        assert.equal(reglas.elGrupoDeLaTarea({ status: "pending", dueDate: new Date(2026, 9, 2, 18) }, ahora), "Hoy");
        assert.equal(reglas.elGrupoDeLaTarea({ status: "pending", dueDate: new Date(2026, 9, 3, 9) }, ahora), "Mañana");
        assert.equal(reglas.elGrupoDeLaTarea({ status: "pending", dueDate: new Date(2026, 9, 6, 9) }, ahora), "Esta semana");
        assert.equal(reglas.elGrupoDeLaTarea({ status: "pending", dueDate: new Date(2026, 9, 20, 9) }, ahora), "Más adelante");
        assert.equal(reglas.elGrupoDeLaTarea({ status: "done", dueDate: new Date(2026, 9, 1) }, ahora), "Completadas");
        assert.equal(reglas.elGrupoDeLaTarea({ status: "cancelled", dueDate: new Date(2026, 9, 3) }, ahora), null);
    });

    test("la fecha propuesta va en la hora de quien mira, a las 9:00", () => {
        assert.equal(reglas.laFechaPropuesta(1, new Date(2026, 9, 2, 22, 30)), "2026-10-03T09:00");
        assert.equal(reglas.comoFechaDelCampo(new Date(2026, 0, 5, 7, 4)), "2026-01-05T07:04");
        assert.match(leer(CREAR), /laFechaPropuesta\(1\)/, "el panel de crear no propone con la regla común");
    });

    test("las columnas del Kanban son los tipos de fábrica, en su orden, y cada una con su engranaje", () => {
        const tipos = [...leer("lib/task-types.ts").slice(0, 400).matchAll(/^\s*"([^"]+)",$/gm)].map((m) => m[1]);
        assert.deepEqual(tipos, [...guia.COLUMNAS_DOCUMENTADAS]);
        assert.match(pantalla, /data-columna=\{type\}/);
        assert.match(pantalla, /data-boton="automatizaciones"/);
        const kanban = guia.GUIA_TAREAS.secciones.find((s) => s.slug === "kanban").pasos.map((p) => p.texto).join(" ");
        guia.COLUMNAS_DOCUMENTADAS.forEach((c, i) => assert.ok(kanban.includes(`${i + 1} ${c}`), `el tablero no numera «${c}» como ${i + 1}`));
    });

    test("las acciones de una automatización son las del panel, en su orden", () => {
        const acciones = [...leer(AUTOMATIZACIONES).matchAll(/label: "([^"]+)",\s+icon:/g)].map((m) => m[1]);
        assert.deepEqual(acciones, [...guia.ACCIONES_DE_AUTOMATIZACION]);
    });

    test("el panel «Nueva tarea»: sus campos, y el recordatorio por WhatsApp", () => {
        const crear = leer(CREAR);
        const campos = [...crear.matchAll(/data-campo="([a-z-]+)"/g)].map((m) => m[1]);
        assert.deepEqual(campos, guia.CAMPOS_DE_CREAR.map((c) => c.campo));
        for (const c of guia.CAMPOS_DE_CREAR) assert.ok(todo.includes(c.nombre), `la guía no nombra el campo «${c.nombre}»`);
        assert.match(crear, /Agregar tipo/);
    });

    test("la ventana «Completar tarea»: sus campos, los resultados de un clic y los atajos", () => {
        const campos = [...pantalla.slice(pantalla.indexOf("data-ventana-de-completar")).matchAll(/data-campo="([a-z-]+)"/g)].map((m) => m[1]);
        assert.deepEqual(campos, guia.CAMPOS_DE_COMPLETAR.map((c) => c.campo));
        assert.deepEqual([...guia.RESULTADOS_DOCUMENTADOS], ["Contactado", "No respondió", "Reagendar", "Interesado", "Cerrado"]);
        assert.deepEqual([...guia.ATAJOS_DOCUMENTADOS], ["Mañana", "Próxima semana", "Próximo mes"]);
        for (const r of [...guia.RESULTADOS_DOCUMENTADOS, ...guia.ATAJOS_DOCUMENTADOS]) assert.ok(todo.includes(r), `la guía no nombra «${r}»`);
        assert.match(pantalla, /RESULTADOS_RAPIDOS\.map/);
        assert.match(pantalla, /ATAJOS_DE_LA_SIGUIENTE\.map/);
    });

    test("una tarea de la lista: las partes que la guía numera existen", () => {
        for (const p of guia.PARTES_DE_UNA_TAREA) assert.ok(pantalla.includes(`data-zona="${p.zona}"`), `falta data-zona="${p.zona}"`);
        const texto = guia.GUIA_TAREAS.secciones[0].pasos.find((p) => p.imagen === "tarjeta.webp").texto;
        guia.PARTES_DE_UNA_TAREA.forEach((p, i) => assert.ok(texto.includes(`${i + 1} ${p.nombre}`), `la tarjeta no numera «${p.nombre}» como ${i + 1}`));
        for (const aria of ["Completar tarea", "Cancelar tarea", "Eliminar tarea definitivamente"]) assert.ok(pantalla.includes(`aria-label="${aria}"`), `falta «${aria}»`);
    });

    test("cancelar y eliminar se CONFIRMAN, con «Volver» para no cambiar nada", () => {
        assert.match(pantalla, /data-confirmar=\{confirmar\?\.que\}/);
        assert.match(pantalla, /<AlertDialogCancel>Volver<\/AlertDialogCancel>/);
        assert.match(pantalla, /"Sí, cancelar la tarea"/);
        assert.ok(todo.includes("Volver"), "la guía no dice cómo salir sin cambiar nada");
    });

    test("el título abre la ficha, y en el Kanban el título parte en líneas", () => {
        assert.match(pantalla, /onOpen=\{\(\) => setFicha\(task\)\}/);
        assert.match(leer(FICHA), /data-ficha-de-la-tarea/);
        const kanban = pantalla.slice(pantalla.indexOf("function KanbanCard"));
        assert.match(kanban, /app-item-title line-clamp-2 break-words/);
        assert.ok(!/app-item-title[^"]*truncate/.test(kanban), "el título del Kanban vuelve a cortarse con «…»");
    });

    test("la lista vacía dice por qué", () => {
        assert.equal(reglas.elMensajeDeLaListaVacia("").titulo, "Sin tareas pendientes");
        assert.match(reglas.elMensajeDeLaListaVacia("factura").detalle, /«factura»/);
    });

    test("la guía cubre todos los apartados, y cada sección tiene su página", () => {
        const slugs = guia.GUIA_TAREAS.secciones.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "lista", "metricas", "kanban", "automatizaciones", "crear", "completar", "cancelar-y-eliminar", "ficha"]);
        const pagina = leer("app/guia/tareas/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/);
        assert.equal(guia.GUIA.laSeccion("no-existe"), null);
        assert.equal(guia.GUIA.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.GUIA.lasVecinas("ficha").siguiente, null);
        for (const s of guia.GUIA_TAREAS.secciones) {
            assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
            assert.ok(s.pasos.length >= 2, `${s.slug}: menos de dos pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 200, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"tareas"/);
        assert.equal(guia.MODULO_DE_TAREAS, "Herramientas");
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "tareas");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.GUIA.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/tareas/${n}`);
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
        for (const f of ["app/guia/tareas/page.tsx", "app/guia/tareas/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deTareas = [["TAREAS", "·"], ["Tareas", "·"], ["tareas", "·"], ["DeMis·", "De·"], ["Mis ·", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/tareas/${rel}`), deTareas), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/tareas/${rel} no es la de Leads con otro nombre`);
        }
    });

    test("su tarjeta en «Tutoriales del módulo»", () => {
        const fila = /\{\s*modulo: "tareas",\s*ruta: "([^"]+)",\s*contenido: GUIA_TAREAS,\s*tarjeta: "([^"]+)",?\s*\}/.exec(leer("lib/tutoriales-del-modulo.ts"));
        assert.ok(fila, "falta la fila de Mis tareas en GUIAS_PUBLICADAS");
        assert.equal(fila[1], "/tareas");
        assert.match(fila[2], /^Aprende a .+ en la plataforma$/);
        assert.ok([...fila[2]].length <= 75, `la descripción mide ${[...fila[2]].length} caracteres`);
    });
}
