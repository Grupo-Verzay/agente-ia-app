/**
 * El banco de la GUÍA PÚBLICA de Crear flujos (`/guia/flujos`).
 *
 * Las mismas cuatro cosas que las demás guías, y por el mismo motivo —se
 * rompen solas—:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Los cuatro tipos (y lo que
 *    filtra cada pastilla) salen de `lib/flujos-de-la-lista.ts`, el «⋯» de una
 *    tarjeta de `WorkflowAction.tsx`, la paleta «Selecciona una acción» de
 *    `types/workflow-node.ts` grupo por grupo, y los topes de pasos, de
 *    seguimientos y de caracteres de `types/workflow*.ts`. Un paso nuevo en la
 *    paleta sin su nombre en la guía pone esto en rojo.
 * 2. **Cada imagen que la guía enseña existe**, y no hay capturas huérfanas.
 * 3. **Es pública y no se indexa**, por el mismo prefijo de `/guia/`.
 * 4. **Es simétrica con Leads**: el código de sus dos páginas es el de Leads
 *    con otro nombre, letra por letra (los comentarios no cuentan).
 *
 * Y las reglas de la lista (`lib/flujos-de-la-lista.ts`), que la pantalla y la
 * guía comparten: de qué tipo es un flujo, qué deja una pastilla y cuándo no
 * se puede reordenar.
 *
 * `MODO=roto` lee los ficheros de `ANTES_FLUJOS_REF` —pinchado a un commit,
 * nunca `origin/main`— y afirma que no había guía, ni reglas de la lista, que
 * las pastillas no filtraban y que la paleta no exponía con qué señalarla.
 *
 * Se levanta con `scripts/banco-guia-flujos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_FLUJOS_REF ?? "7767f6f";
const LISTA = "app/(root)/flow/_components";
const EDITOR = "app/(root)/workflow/[workflowId]/_components";

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
    test("ANTES no había guía pública de Crear flujos", () => {
        assert.ok(leer("lib/guia-leads.ts").length > 0, `ANTES_FLUJOS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        assert.equal(leer("lib/guia-flujos.ts"), "", "lib/guia-flujos.ts ya existía");
        assert.equal(leer("app/guia/flujos/page.tsx"), "", "la página ya existía");
        assert.ok(!/["']flujos["']/.test(leer("lib/introduccion-de-la-guia.ts")), "la introducción editable ya conocía la guía");
        assert.ok(!/modulo: "flujos"/.test(leer("lib/tutoriales-del-modulo.ts")), "«Tutoriales del módulo» ya tenía la tarjeta");
    });

    test("ANTES las pastillas de tipo no filtraban, y no había reglas de la lista", () => {
        assert.equal(leer("lib/flujos-de-la-lista.ts"), "", "las reglas de la lista ya existían");
        assert.match(leer(`${LISTA}/WorkflowListContent.tsx`), /no son pulsables/, "las pastillas ya filtraban");
    });

    test("ANTES la paleta y la lista no exponían con qué señalarlas", () => {
        const todo = [
            `${EDITOR}/WorkflowSidebar.tsx`,
            `${EDITOR}/InlineAddNode.tsx`,
            `${LISTA}/WorkflowCard.tsx`,
            `${LISTA}/SortableWorkflowList.tsx`,
        ].map(leer).join("\n");
        for (const marca of ["data-grupo-de-la-paleta", "data-panel-de-acciones", "data-tarjeta-de-flujo", "data-asa-de-flujo"]) {
            assert.ok(!todo.includes(marca), `ya existía «${marca}»`);
        }
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-flujos/guia-flujos.mjs"));
    const reglas = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-flujos/flujos-de-la-lista.mjs"));
    const nodos = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-flujos/workflow-node.mjs"));
    const topes = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-flujos/workflow.mjs"));

    test("los cuatro tipos son los de la lista, en su orden, y cada uno tiene su paso", () => {
        assert.deepEqual([...guia.TIPOS_DOCUMENTADOS], reglas.TIPOS_DE_FLUJO.map((t) => t.nombre));
        assert.deepEqual([...guia.TIPOS_DOCUMENTADOS], ["Inicio", "IA", "Flujo", "Chatbot"]);
        const tipos = guia.laSeccion("tipos");
        const texto = [tipos.resumen, ...tipos.consejos, ...tipos.pasos.map((p) => `${p.titulo} ${p.texto}`)].join(" \n ");
        for (const t of guia.TIPOS_DOCUMENTADOS) assert.ok(texto.includes(t), `la sección de tipos no nombra «${t}»`);
    });

    test("el tipo de un flujo se decide en UN orden: bienvenida, IA, palabras clave, flujo", () => {
        const ia = new Set(["b"]);
        assert.equal(reglas.elTipoDelFlujo({ id: "a", triggerOnNewSession: true, description: "hola" }, new Set(["a"])), "inicio");
        assert.equal(reglas.elTipoDelFlujo({ id: "b", description: "precio" }, ia), "ia");
        assert.equal(reglas.elTipoDelFlujo({ id: "c", description: "precio, costo" }, ia), "chatbot");
        assert.equal(reglas.elTipoDelFlujo({ id: "d", description: "   " }, ia), "flujo");
        assert.equal(reglas.elTipoDelFlujo({ id: "e" }, ia), "flujo");
        const conteos = reglas.losConteosPorTipo([{ id: "a", triggerOnNewSession: true }, { id: "b" }, { id: "c", description: "x" }], ia);
        assert.deepEqual(conteos, { inicio: 1, ia: 1, flujo: 0, chatbot: 1 }, "los cuatro tipos siempre presentes, con 0 donde no hay");
    });

    test("una pastilla filtra, la misma pulsada otra vez la quita, y con filtro no se reordena", () => {
        assert.equal(reglas.alPulsarUnTipo(null, "ia"), "ia");
        assert.equal(reglas.alPulsarUnTipo("ia", "ia"), null);
        assert.equal(reglas.alPulsarUnTipo("ia", "chatbot"), "chatbot");
        assert.deepEqual(reglas.lasPalabrasClave(JSON.stringify({ matchType: "contains", keywords: ["precio", "costo"] })), ["precio", "costo"]);
        assert.deepEqual(reglas.lasPalabrasClave(" hola "), ["hola"], "el texto suelto de antes es la palabra tal cual");
        assert.deepEqual(reglas.lasPalabrasClave(null), []);
        assert.equal(reglas.porQueNoSePuedeOrdenar("", null), null);
        assert.ok(reglas.porQueNoSePuedeOrdenar("hola", null), "con búsqueda no se puede reordenar");
        assert.ok(reglas.porQueNoSePuedeOrdenar("", "ia"), "con un tipo puesto no se puede reordenar");
        // La lista usa estas reglas, no una copia.
        const lista = [`${LISTA}/WorkflowListContent.tsx`, `${LISTA}/UserWorkflows.tsx`, `${LISTA}/SortableWorkflowList.tsx`].map(leer).join("\n");
        for (const f of ["losConteosPorTipo", "pasaElFiltro", "alPulsarUnTipo", "porQueNoSePuedeOrdenar"]) {
            assert.ok(lista.includes(f), `la lista no usa ${f}`);
        }
    });

    test("el «⋯» de una tarjeta ofrece EXACTAMENTE lo que la guía nombra, en su orden", () => {
        const accion = leer(`${LISTA}/WorkflowAction.tsx`);
        const opciones = [];
        for (const m of accion.matchAll(/<DropdownMenuItem[\s\S]*?<\/DropdownMenuItem>/g)) {
            const t = m[0];
            if (/Repeticiones/.test(t)) opciones.push("Repeticiones");
            else if (/Paso de embudo/.test(t)) opciones.push("Paso de embudo");
            else if (/Usar como bienvenida/.test(t)) opciones.push("Usar como bienvenida");
            else if (/Eliminar/.test(t)) opciones.push("Eliminar");
            else opciones.push(`?${t.slice(0, 60)}`);
        }
        assert.deepEqual(opciones, [...guia.MENU_DE_LA_TARJETA]);
        // Eliminar pide confirmación.
        assert.match(accion, /GenericDeleteDialog|DeleteWorkflowDialog/);
        const texto = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => p.texto)).join(" \n ");
        for (const o of guia.MENU_DE_LA_TARJETA) assert.ok(texto.includes(o), `ningún paso nombra «${o}»`);
    });

    test("la paleta documentada es la de «Selecciona una acción», grupo por grupo y en su orden", () => {
        const deLaPantalla = {
            Nodos: nodos.nodeActions.map((a) => a.label),
            Acciones: nodos.accionActions.map((a) => a.label),
            Automatizaciones: nodos.automationActions.map((a) => a.label),
            Seguimientos: nodos.seguimientoActions.map((a) => a.label),
        };
        assert.deepEqual(Object.keys(guia.PALETA_DOCUMENTADA), Object.keys(deLaPantalla));
        for (const g of Object.keys(deLaPantalla)) {
            assert.deepEqual([...guia.PALETA_DOCUMENTADA[g]], deLaPantalla[g], `el grupo «${g}» no coincide`);
        }
        // Las dos formas de agregar un paso pintan los cuatro grupos en el mismo orden.
        for (const f of [`${EDITOR}/WorkflowSidebar.tsx`, `${EDITOR}/InlineAddNode.tsx`]) {
            const t = leer(f);
            const orden = ["Nodos", "Acciones", "Automatizaciones", "Seguimientos"].map((g) => t.indexOf(`"${g}"`));
            assert.ok(orden.every((i, k) => i >= 0 && (k === 0 || i > orden[k - 1])), `${f}: los grupos no van en orden`);
        }
        // Cada grupo se nombra en algún paso.
        const texto = guia.SECCIONES.flatMap((s) => s.pasos.map((p) => p.texto)).join(" \n ");
        for (const g of Object.keys(deLaPantalla)) assert.ok(texto.includes(g), `ningún paso nombra el grupo «${g}»`);
    });

    test("los topes de la guía son los del editor", () => {
        assert.equal(guia.LARGO_MAXIMO_DEL_MENSAJE, nodos.MAX_MESSAGE_LENGTH);
        const texto = guia.laSeccion("limites").pasos.map((p) => p.texto).join(" ");
        assert.ok(texto.includes(String(topes.MAX_NODES_PER_WORKFLOW)), "no dice el tope de pasos");
        assert.ok(texto.includes(String(topes.MAX_SEGUIMIENTOS_PER_WORKFLOW)), "no dice el tope de seguimientos");
        assert.ok(texto.includes(nodos.MAX_MESSAGE_LENGTH.toLocaleString("es-CO")), "no dice el tope de caracteres");
    });

    test("la vista general numera las cinco zonas, en su orden", () => {
        const texto = guia.laSeccion("vista-general").pasos.find((p) => p.imagen === "vista-general.webp").texto;
        guia.ZONAS_DE_LA_PANTALLA.forEach((z, i) => assert.ok(texto.includes(`${i + 1} ${z}`), `la vista general no numera «${z}» como ${i + 1}`));
    });

    test("las secciones, cada una con su página y su miniatura", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "tipos", "crear", "palabras-clave", "el-editor", "agregar-pasos", "automatizaciones", "seguimientos", "mas-acciones", "limites"]);
        const pagina = leer("app/guia/flujos/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("limites").siguiente, null);
        for (const s of guia.SECCIONES) assert.equal(s.miniatura, `mini-${s.slug}.webp`, `${s.slug}: sin su miniatura`);
        assert.match(leer("lib/introduccion-de-la-guia.ts"), /"flujos"/);
    });

    test("la tarjeta de «Tutoriales del módulo» lleva su descripción, y apunta a la pantalla", () => {
        const tutoriales = leer("lib/tutoriales-del-modulo.ts");
        const fila = /\{\s*modulo: "flujos",\s*ruta: "([^"]+)",\s*contenido: GUIA_FLUJOS,\s*tarjeta: "([^"]+)"/.exec(tutoriales);
        assert.ok(fila, "falta la fila de Flujos en GUIAS_PUBLICADAS");
        assert.ok(["/workflow", "/flow"].includes(fila[1]), `ruta inesperada «${fila[1]}»`);
        assert.ok(leer("lib/navigation-routes.ts").includes(`"${fila[1]}"`) || leer("lib/navigation-routes.ts").includes(`'${fila[1]}'`), "la ruta no está en el menú");
        assert.match(fila[2], /^Aprende a .+ en la plataforma$/);
        assert.ok(fila[2].length <= 75, `la descripción mide ${fila[2].length} caracteres`);
    });

    test("cada paso es corto: la captura explica, el texto pone nombre", () => {
        for (const s of guia.SECCIONES) {
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 220, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "flujos");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/flujos/${n}`);
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

    test("es PÚBLICA y NO se indexa, y no toca la base más que la de Leads", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/);
        for (const f of ["app/guia/flujos/page.tsx", "app/guia/flujos/[seccion]/page.tsx"]) {
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(leer(f)), `${f} no puede tocar la base ni la sesión`);
        }
    });

    test("las dos páginas son las de Leads con otro nombre, letra por letra", () => {
        const sinComentarios = (t) => t.split("\n").filter((l) => !/^\s*(\/\*\*|\*|\/\/)/.test(l)).join("\n");
        const neutra = (t, nombres) => sinComentarios(nombres.reduce((s, [de, a]) => s.replaceAll(de, a), t));
        const deLeads = [["LEADS", "·"], ["Leads", "·"], ["leads", "·"]];
        const deFlujos = [["Crear flujos", "·"], ["FLUJOS", "·"], ["Flujos", "·"], ["flujos", "·"]];
        for (const rel of ["page.tsx", "[seccion]/page.tsx"]) {
            assert.equal(neutra(leer(`app/guia/flujos/${rel}`), deFlujos), neutra(leer(`app/guia/leads/${rel}`), deLeads), `app/guia/flujos/${rel} no es la de Leads con otro nombre`);
        }
    });
}
