/**
 * El banco de la GUÍA PÚBLICA de Diagramas (`/guia/diagramas`), con el mismo
 * estándar que la de Leads.
 *
 * Cuatro cosas, y todas son de las que se rompen solas:
 *
 * 1. **La guía dice lo que la pantalla tiene.** Cada lista de
 *    `lib/guia-diagramas.ts` se compara con su pareja en el código: los tres
 *    niveles de «Con el equipo», el «⋯» de la tarjeta, los 22 tipos de paso de
 *    «Selecciona una acción» en sus dos grupos, las tres salidas de la
 *    Decisión, los controles del lienzo, la barra de un paso y la de la nota
 *    Idea. Un tipo de paso nuevo sin su nombre en la guía pone esto en rojo.
 * 2. **Cada imagen que la guía enseña existe**, y no sobra ninguna.
 * 3. **Es pública y no se indexa**, por el mismo sistema que la de Leads.
 * 4. **Lo que se arregló en el editor al documentarlo sigue arreglado**: un
 *    diagrama de solo lectura no deja escribir el nombre de un paso, ni abrir
 *    su caja, ni tocar una nota Idea, ni desbloquear el lienzo; los tres «+» de
 *    la Decisión no se montan; y la barra de un paso no tapa su nombre.
 *
 * `MODO=roto` lee los ficheros de `ANTES_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma el fallo: no había guía de Diagramas, el editor de
 * lectura dejaba escribir y tocar, y los tres «+» se montaban.
 *
 * Se levanta con `scripts/banco-guia-diagramas.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "6d8cd4b";

const EDITOR = "app/(root)/diagramas/[flowId]/_components";
const LISTA = "app/(root)/diagramas/_components/DiagramasListClient.tsx";

const deAntes = (rel) => {
    try {
        return execSync(`git show ${ANTES}:"${rel}"`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
    } catch {
        return "";
    }
};
const hoy = (rel) => readFileSync(path.join(RAIZ, rel), "utf8");
const leer = ROTO ? deAntes : hoy;

/** Los `label` de una lista de acciones de `diagrama-node-types.ts`, en su orden. */
function lasEtiquetasDe(fuente, lista) {
    const ini = fuente.indexOf(`export const ${lista}`);
    assert.ok(ini >= 0, `no se encontró ${lista}`);
    const fin = fuente.indexOf("];", ini);
    return [...fuente.slice(ini, fin).matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
}

/** Los tres niveles de «Con el equipo», leídos de `COMPARTIR`. */
function losNivelesDeCompartir(fuente) {
    const ini = fuente.indexOf("const COMPARTIR");
    const fin = fuente.indexOf("};", ini);
    const bloque = fuente.slice(ini, fin);
    const etiquetas = [...bloque.matchAll(/etiqueta:\s*'([^']+)'/g)].map((m) => m[1]);
    const ayudas = [...bloque.matchAll(/ayuda:\s*'([^']+)'/g)].map((m) => m[1]);
    return etiquetas.map((nombre, i) => ({ nombre, ayuda: ayudas[i] }));
}

/**
 * Cuánto se montan los «+» de la Decisión: la distancia entre el centro de un
 * «+» y el del siguiente, menos su lado. Negativo = se montan.
 */
function elHuecoEntreLosMas(alto, pct, desplazar) {
    const centros = [pct.yes, pct.variante, pct.no].map((x, i) => (x / 100) * alto + [-desplazar, 0, desplazar][i]);
    return Math.min(centros[1] - centros[0], centros[2] - centros[1]) - 28;
}
const ALTOS_DE_LA_CAJA = { sm: 44, md: 58, lg: 74 };

if (ROTO) {
    test("ANTES no había guía pública de Diagramas", () => {
        assert.equal(deAntes("lib/guia-diagramas.ts"), "", "lib/guia-diagramas.ts ya existía en ANTES_REF");
        assert.equal(deAntes("app/guia/diagramas/page.tsx"), "", "la página ya existía en ANTES_REF");
        const guias = /MODULOS_CON_GUIA = \[([^\]]*)\]/.exec(deAntes("lib/introduccion-de-la-guia.ts"))?.[1] ?? "";
        assert.ok(guias.includes('"leads"'), `no se leyeron las guías de ${ANTES}`);
        assert.ok(!guias.includes('"diagramas"'), "Diagramas ya estaba entre las guías");
    });

    test("ANTES (lectura): el nombre de un paso se podía escribir y su caja era un botón", () => {
        const nodo = deAntes(`${EDITOR}/FlowNode.tsx`);
        assert.ok(nodo.includes("onChangeLabel"), `FlowNode.tsx de ${ANTES} no parece el de antes`);
        assert.doesNotMatch(nodo, /readOnly=/, "el nombre ya era de solo lectura");
        assert.match(nodo, /role="button"\s+tabIndex=\{0\}\s+title="Clic para escribir el texto de este paso"/, "la caja ya dejaba de ser un botón en lectura");
    });

    test("ANTES (lectura): la nota Idea se podía escribir, estirar y borrar", () => {
        const idea = deAntes(`${EDITOR}/IdeaNode.tsx`);
        assert.ok(idea.includes("NodeResizeControl"), `IdeaNode.tsx de ${ANTES} no parece el de antes`);
        assert.doesNotMatch(idea, /useSoloLectura/, "la nota ya sabía si el diagrama era de lectura");
    });

    test("ANTES (lectura): el candado del lienzo estaba y lo desbloqueaba", () => {
        const lienzo = deAntes(`${EDITOR}/FlowCanvas.tsx`);
        assert.ok(lienzo.includes("<Controls"), `FlowCanvas.tsx de ${ANTES} no parece el de antes`);
        assert.doesNotMatch(lienzo, /showInteractive/, "el candado ya se quitaba en lectura");
        assert.doesNotMatch(lienzo, /ariaLabelConfig/, "los controles ya hablaban en español");
    });

    test("ANTES: los tres «+» de la Decisión se montaban unos sobre otros", () => {
        const nodo = deAntes(`${EDITOR}/FlowNode.tsx`);
        const pct = Object.fromEntries(
            [...nodo.matchAll(/SourceDotHandle id="(yes|variante|no)" label="[^"]+" topPct=\{(\d+)\}/g)].map((m) => [m[1], Number(m[2])]),
        );
        assert.deepEqual(Object.keys(pct).sort(), ["no", "variante", "yes"], "no se leyeron las tres salidas de antes");
        assert.doesNotMatch(nodo, /desplazarElMas/, "los «+» ya se abrían en abanico");
        for (const [talla, alto] of Object.entries(ALTOS_DE_LA_CAJA)) {
            assert.ok(elHuecoEntreLosMas(alto, pct, 0) < 0, `${talla}: los «+» de antes no se montaban`);
        }
    });

    test("ANTES: la barra de un paso colgaba de la esquina de la caja, sobre el nombre", () => {
        const nodo = deAntes(`${EDITOR}/FlowNode.tsx`);
        assert.match(nodo, /nodrag absolute -top-3 right-0 z-20 flex translate-x-1\/3/, "la barra de antes no estaba en la esquina");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-diagramas/guia-diagramas.mjs"));
    const abanico = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-diagramas/abanico-de-los-mas.mjs"));
    const pasoDe = (slug, imagen) => guia.laSeccion(slug).pasos.find((p) => p.imagen === imagen);

    test("los niveles de «Con el equipo» son EXACTAMENTE los de la tarjeta", () => {
        const enLaTarjeta = losNivelesDeCompartir(leer(LISTA));
        assert.deepEqual(guia.NIVELES_CON_EL_EQUIPO.map((n) => ({ ...n })), enLaTarjeta);
        const texto = pasoDe("compartir", "compartir-equipo.webp").texto;
        enLaTarjeta.forEach((n, i) => assert.ok(texto.includes(`${i + 1} ${n.nombre}`), `«Con tu equipo» no numera «${n.nombre}» como ${i + 1}`));
    });

    test("el «⋯» de la tarjeta documentado es el de la pantalla, en su orden", () => {
        const fuente = leer(LISTA);
        const ini = fuente.indexOf('<DropdownMenuContent align="end"');
        assert.ok(ini > 0, "no se encontró el «⋯» de la tarjeta");
        const menu = fuente.slice(ini, fuente.indexOf("</DropdownMenuContent>", ini));
        let desde = 0;
        for (const o of guia.OPCIONES_DE_LA_TARJETA) {
            const i = menu.indexOf(o, desde);
            assert.ok(i >= 0, `el «⋯» de la tarjeta no tiene «${o}», o no en ese orden`);
            desde = i;
        }
        assert.equal((menu.match(/<DropdownMenuItem/g) ?? []).length, guia.OPCIONES_DE_LA_TARJETA.length, "el «⋯» tiene una opción que la guía no nombra");
        const texto = pasoDe("carpetas-y-orden", "tarjeta-opciones.webp").texto;
        for (const o of guia.OPCIONES_DE_LA_TARJETA) assert.ok(texto.includes(o), `«Más opciones» no nombra «${o}»`);
    });

    test("los tipos de paso son los de «Selecciona una acción», en sus dos grupos y en su orden", () => {
        const tipos = leer(`${EDITOR}/diagrama-node-types.ts`);
        assert.deepEqual([...guia.PASOS_PRINCIPALES], lasEtiquetasDe(tipos, "diagramaPrincipalActions"));
        assert.deepEqual([...guia.PASOS_DE_ACCION], lasEtiquetasDe(tipos, "diagramaAccionActions"));
        const paleta = hoy(`${EDITOR}/InlineAddNode.tsx`);
        for (const g of ["Principales", "Acciones"]) assert.ok(paleta.includes(g), `la lista ya no tiene el grupo «${g}»`);
        const texto = pasoDe("agregar-pasos", "pasos-paleta.webp").texto;
        assert.match(texto, /2 Principales[\s\S]*3 Acciones/, "el paso de la lista no numera sus dos grupos");
    });

    test("las salidas de la Decisión son las del nodo", () => {
        const nodo = leer(`${EDITOR}/FlowNode.tsx`);
        const enElNodo = [...nodo.matchAll(/SourceDotHandle id="(?:yes|variante|no)" label="([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual([...guia.SALIDAS_DE_LA_DECISION], enElNodo);
        const texto = pasoDe("agregar-pasos", "pasos-decision.webp").texto;
        for (const s of enElNodo) assert.ok(texto.includes(s), `el paso de la Decisión no nombra «${s}»`);
    });

    test("los controles del lienzo son los de `ETIQUETAS_DEL_LIENZO`, en español", () => {
        const lienzo = leer(`${EDITOR}/FlowCanvas.tsx`);
        const orden = ["zoomIn", "zoomOut", "fitView", "interactive"];
        const enElLienzo = orden.map((k) => new RegExp(`'controls\\.${k}\\.ariaLabel':\\s*'([^']+)'`).exec(lienzo)?.[1]);
        assert.deepEqual([...guia.CONTROLES_DEL_LIENZO], enElLienzo);
        assert.match(lienzo, /ariaLabelConfig=\{ETIQUETAS_DEL_LIENZO\}/, "el lienzo no usa sus etiquetas en español");
        const texto = pasoDe("editor", "editor-controles.webp").texto;
        guia.CONTROLES_DEL_LIENZO.forEach((_, i) => assert.ok(texto.includes(`${i + 1} `), `«Los controles» no numera el ${i + 1}`));
    });

    test("la barra de un paso y la de la nota Idea son las del código", () => {
        const nodo = leer(`${EDITOR}/FlowNode.tsx`);
        const barra = nodo.slice(nodo.indexOf("{!soloLectura && ("), nodo.indexOf("<input"));
        const titulos = [...barra.matchAll(/title=\{?[`"]([^`"$:]+)/g)].map((m) => m[1].trim());
        assert.deepEqual(titulos, [...guia.BOTONES_DE_UN_PASO]);
        const idea = leer(`${EDITOR}/IdeaNode.tsx`);
        const deLaIdea = [...idea.matchAll(/title="([^"]+)"/g)].map((m) => m[1]).filter((t) => !t.startsWith("Arrastrar"));
        const enOrden = guia.HERRAMIENTAS_DE_LA_IDEA.map((h) => deLaIdea.findIndex((t) => t.startsWith(h)));
        assert.ok(enOrden.every((i) => i >= 0), `la nota Idea no tiene alguna de: ${guia.HERRAMIENTAS_DE_LA_IDEA.join(", ")}`);
        assert.deepEqual(enOrden, [...enOrden].sort((a, b) => a - b), "las herramientas de la Idea no van en ese orden");
        const texto = pasoDe("idea-y-libre", "idea-herramientas.webp").texto.toLowerCase();
        for (const h of ["emojis", "escribir", "negrita", "duplicar", "eliminar", "colores"]) assert.ok(texto.includes(h), `«Sus herramientas» no nombra «${h}»`);
    });

    test("las zonas de la lista y del editor se numeran enteras, en orden", () => {
        const lista = pasoDe("vista-general", "vista-general.webp").texto;
        guia.ZONAS_DE_LA_PANTALLA.forEach((_, i) => assert.ok(lista.includes(`${i + 1} `), `«Todo en una pantalla» no numera la zona ${i + 1}`));
        assert.ok(!lista.includes(`${guia.ZONAS_DE_LA_PANTALLA.length + 1} `), "«Todo en una pantalla» numera una zona de más");
        const editor = pasoDe("editor", "editor-vista.webp").texto;
        guia.ZONAS_DEL_EDITOR.forEach((_, i) => assert.ok(editor.includes(`${i + 1} `), `«Todo en el lienzo» no numera la zona ${i + 1}`));
        assert.ok(!editor.includes(`${guia.ZONAS_DEL_EDITOR.length + 1} `), "«Todo en el lienzo» numera una zona de más");
    });

    test("Diagramas vive en el módulo que la guía dice, y el menú capturado salió entero", () => {
        const menu = hoy("scripts/menu-de-un-cliente.mjs");
        const bloque = menu.slice(menu.indexOf(`label: "${guia.MODULO_DE_DIAGRAMAS}"`));
        assert.ok(bloque.length > 0, `el menú sembrado no tiene el módulo «${guia.MODULO_DE_DIAGRAMAS}»`);
        assert.match(bloque.slice(0, bloque.indexOf("label:", 10)), /url: "\/diagramas"/, `Diagramas no está dentro de «${guia.MODULO_DE_DIAGRAMAS}»`);
        const capturado = JSON.parse(hoy("scripts/menu-guia-diagramas.json"));
        assert.equal(capturado.recogido, true, "el menú de las capturas no estaba recogido");
        assert.ok(capturado.modulos.length >= 5 && capturado.modulos.every((m) => m.conIcono), "algún módulo del menú salió sin su icono");
    });

    test("la guía cubre la lista y el editor, y cada sección tiene su página", () => {
        const slugs = guia.SECCIONES.map((s) => s.slug);
        assert.deepEqual(slugs, ["vista-general", "crear", "editor", "agregar-pasos", "editar-un-paso", "idea-y-libre", "compartir", "carpetas-y-orden", "acciones-masivas"]);
        assert.equal(new Set(slugs).size, slugs.length, "slugs repetidos");
        const pagina = leer("app/guia/diagramas/[seccion]/page.tsx");
        assert.match(pagina, /generateStaticParams/);
        assert.match(pagina, /dynamicParams = false/, "un slug que no existe tiene que dar 404");
        assert.equal(guia.laSeccion("no-existe"), null);
        assert.equal(guia.lasVecinas("vista-general").anterior, null);
        assert.equal(guia.lasVecinas("acciones-masivas").siguiente, null);
        assert.equal(guia.lasVecinas("editor").anterior.slug, "crear");
        const intro = leer("lib/introduccion-de-la-guia.ts");
        assert.match(intro, /MODULOS_CON_GUIA = \[[^\]]*"diagramas"/, "Diagramas no está entre las guías con introducción editable");
    });

    test("cada paso es corto: la captura explica, el texto pone nombre", () => {
        for (const s of guia.SECCIONES) {
            assert.ok(s.pasos.length >= 3, `${s.slug}: menos de tres pasos`);
            for (const p of s.pasos) {
                assert.ok(p.texto.length <= 260, `${s.slug} › ${p.titulo}: ${p.texto.length} caracteres`);
                assert.ok(p.alt.trim(), `${s.slug} › ${p.titulo}: sin texto alternativo`);
            }
        }
    });

    test("cada imagen que la guía enseña existe, y no sobra ninguna", () => {
        const dir = path.join(RAIZ, "public", "guia", "diagramas");
        const enDisco = readdirSync(dir).filter((n) => n.endsWith(".webp"));
        const esperadas = guia.lasCapturasQueSeEnsenan();
        for (const n of esperadas) {
            assert.ok(existsSync(path.join(dir, n)), `falta public/guia/diagramas/${n}`);
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

    test("es PÚBLICA y NO se indexa, y no toca la sesión", () => {
        assert.match(leer("middleware.ts"), /currentPath\.startsWith\("\/guia\/"\)/, "el middleware no deja pasar /guia/ sin sesión");
        const cfg = leer("next.config.js");
        assert.match(cfg.slice(cfg.indexOf('"/guia/:path*"'), cfg.indexOf('"/guia/:path*"') + 300), /X-Robots-Tag[^\n]*noindex/);
        for (const f of ["app/guia/diagramas/page.tsx", "app/guia/diagramas/[seccion]/page.tsx"]) {
            const t = leer(f);
            assert.ok(!/@\/lib\/db|prisma|currentUser|@\/actions\//.test(t), `${f} no puede tocar la base ni la sesión`);
        }
        const indice = leer("app/guia/diagramas/page.tsx");
        const lecturas = [...indice.matchAll(/from "(@\/lib\/[^"]+\.server)"/g)].map((m) => m[1]).sort();
        assert.deepEqual(lecturas, ["@/lib/contacto-de-la-guia.server", "@/lib/introduccion-publica.server"]);
        assert.match(indice, /FinDeLaGuia/, "el índice no termina en la línea divisoria");
        assert.match(indice, /CabeceraDeLaGuia demostracion=/, "la barra de arriba no lleva la demostración");
    });

    test("la tarjeta de la guía está en Documentación, como la de Leads", () => {
        // Documentación pinta una tarjeta por cada guía de `MODULOS_CON_GUIA`,
        // con el nombre de `NOMBRE_DE_LA_GUIA`: estar en las dos listas ES salir.
        const doc = hoy("app/(root)/documentation/guide/page.tsx");
        assert.match(doc, /MODULOS_CON_GUIA\.map\(\(modulo\) =>[\s\S]*<EditarIntroduccionDeLaGuia[^>]*nombre=\{NOMBRE_DE_LA_GUIA\[modulo\]\}/, "Documentación ya no pinta una tarjeta por guía");
        assert.match(hoy("lib/introduccion-de-la-guia.ts"), /diagramas:\s*"Diagramas"/, "la guía de Diagramas no tiene su nombre en Documentación");
        assert.match(hoy("app/(root)/documentation/guide/_components/EditarIntroduccionDeLaGuia.tsx"), /href=\{`\/guia\/\$\{modulo\}`\}/, "la tarjeta no enlaza la guía pública");
    });

    /* --- Lo que se arregló en el editor al documentarlo -------------------- */

    test("lectura: el nombre de un paso no se escribe y su caja no es un botón", () => {
        const nodo = leer(`${EDITOR}/FlowNode.tsx`);
        assert.match(nodo, /readOnly=\{soloLectura\}/, "el nombre de un paso se puede escribir en un diagrama de lectura");
        assert.match(nodo, /role=\{soloLectura \? undefined : 'button'\}/, "la caja sigue siendo un botón en lectura");
        assert.match(nodo, /\{!soloLectura && \(\s*<div className="nodrag absolute bottom-full/, "la barra del paso sale en lectura");
    });

    test("lectura: la nota Idea no se escribe, no se estira y no lleva barra", () => {
        const idea = leer(`${EDITOR}/IdeaNode.tsx`);
        assert.match(idea, /const soloLectura = useSoloLectura\(\)/);
        assert.match(idea, /\{!soloLectura && \(\s*<div className="nodrag absolute -top-2/, "la barra de la nota sale en lectura");
        assert.match(idea, /\{!soloLectura && \(\s*<NodeResizeControl/, "la nota se puede estirar en lectura");
        assert.match(idea, /escribiendo && !soloLectura/, "la nota se puede escribir en lectura");
    });

    test("lectura: el lienzo no ofrece el candado, que lo desbloqueaba", () => {
        assert.match(leer(`${EDITOR}/FlowCanvas.tsx`), /showInteractive=\{!soloLectura\}/);
    });

    test("los tres «+» de la Decisión no se montan en ningún tamaño, y el del medio no se mueve", () => {
        assert.deepEqual({ ...abanico.SALIDAS_DE_LA_DECISION_PCT }, { yes: 16, variante: 50, no: 84 });
        for (const [talla, alto] of Object.entries(ALTOS_DE_LA_CAJA)) {
            const d = abanico.elAbanicoDeLosMas(alto);
            const hueco = elHuecoEntreLosMas(alto, abanico.SALIDAS_DE_LA_DECISION_PCT, d);
            assert.ok(hueco >= abanico.HUECO_ENTRE_MAS_PX - 1e-9, `${talla}: entre dos «+» quedan ${hueco} px`);
            assert.ok(hueco <= abanico.HUECO_ENTRE_MAS_PX + 1e-9 || d === 0, `${talla}: el abanico se abre de más (${hueco} px)`);
        }
        assert.equal(abanico.elAbanicoDeLosMas(1000), 0, "una caja alta no necesita abanico");
        const nodo = leer(`${EDITOR}/FlowNode.tsx`);
        assert.match(nodo, /id="yes"[^\n]*desplazarElMas=\{-abanico\}/);
        assert.match(nodo, /id="no"[^\n]*desplazarElMas=\{abanico\}/);
        assert.doesNotMatch(nodo.match(/id="variante"[^\n]*/)[0], /desplazarElMas/, "el «+» del medio se mueve");
        const salida = leer(`${EDITOR}/SourceDotHandle.tsx`);
        assert.match(salida, /top: `calc\(50% \+ \$\{desplazarElMas\}px\)`/, "el «+» no usa su desplazamiento");
    });

    test("la barra de un paso va ENCIMA del nombre y centrada, no en la esquina de la caja", () => {
        const nodo = leer(`${EDITOR}/FlowNode.tsx`);
        const barra = nodo.indexOf('className="nodrag absolute bottom-full left-1/2');
        assert.ok(barra > 0, "la barra del paso no va centrada encima del nodo");
        assert.ok(barra < nodo.indexOf("<input"), "la barra va dentro de la caja, debajo del nombre");
        assert.doesNotMatch(nodo, /-top-3 right-0 z-20 flex translate-x-1\/3/, "vuelve la barra en la esquina de la caja");
    });

    test("los mensajes de Diagramas hablan de diagramas, no de flujos", () => {
        const acciones = leer("actions/flow-actions.ts");
        const mensajes = [...acciones.matchAll(/message:\s*"([^"]+)"/g)].map((m) => m[1]);
        assert.ok(mensajes.length > 10, "no se leyeron los mensajes de flow-actions");
        assert.deepEqual(mensajes.filter((m) => /\bflujos?\b/i.test(m)), [], "un mensaje de Diagramas habla de «flujo»");
    });
}
