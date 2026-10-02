/**
 * El CENTRO DE AYUDA (`/ayuda`, el botón «Ayuda» de la barra de arriba), sin
 * navegador: las reglas y un barrido del código.
 *
 * Lo que se comprueba, y ninguna de estas cosas se ve leyendo una sola pieza:
 *
 * 1. **Las diez categorías son los diez grupos del menú lateral**, en su orden
 *    y con sus pantallas: se comparan con el menú de un cliente
 *    (`scripts/menu-de-un-cliente.mjs`), el mismo que siembran las guías. Si
 *    el menú gana una pantalla o la mueve de grupo, esto se pone rojo.
 * 2. **Cada guía publicada cae SOLA en su categoría**, la del grupo del menú
 *    donde vive su pantalla, sin clasificarla a mano: se compara con
 *    `elModuloDe` de ese mismo menú, guía por guía. Ninguna se queda fuera.
 * 3. **El buscador** encuentra por palabra clave en cualquier categoría, sin
 *    mirar tildes ni mayúsculas, y lleva directo a la SECCIÓN cuando lo que
 *    coincide es de una.
 * 4. **Las pantallas de una categoría no llevan administración**: ni «Nuevo»,
 *    ni «Editar introducción», ni arrastrar, ni «Guías publicadas». Y la fila
 *    es la MISMA de Documentación › Guías (`FilaDeGuia`), no una parecida.
 * 5. **El botón está en la barra de arriba, justo antes de «Soporte»**, y
 *    «Ver tutoriales» sigue ahí.
 *
 * `MODO=roto` lee el código de `ANTES_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma que no había nada de esto.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const C = path.join(RAIZ, "lib/__tests__/.compilado/centro-de-ayuda");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "fd8b831";

const hoy = (rel) => readFileSync(path.join(RAIZ, rel), "utf8");
const deAntes = (rel) => {
    try {
        return execSync(`git show ${ANTES}:${JSON.stringify(rel).slice(1, -1)}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
    } catch {
        return null;
    }
};
/** Quita los comentarios: lo que se explica al lado de un arreglo no puede tumbar el barrido. */
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\s*\}/g, "");

if (ROTO) {
    test("ANTES: no había centro de ayuda", () => {
        assert.equal(deAntes("lib/centro-de-ayuda.ts"), null, "ANTES ya existía lib/centro-de-ayuda.ts");
        assert.equal(deAntes("app/(root)/ayuda/page.tsx"), null, "ANTES ya existía la pantalla /ayuda");
        assert.equal(deAntes("app/(root)/ayuda/[categoria]/page.tsx"), null, "ANTES ya existían las categorías");
    });
    test("ANTES: la barra de arriba no tenía «Ayuda» delante de «Soporte»", () => {
        const barra = deAntes("components/custom/Breadcrumbs.tsx");
        assert.ok(barra, "no se pudo leer la barra de antes");
        assert.ok(barra.includes("<BotonDeSoporte"), "la barra de antes ya tenía Soporte");
        assert.ok(!barra.includes("BotonDeAyuda"), "ANTES ya había un botón de ayuda");
        assert.ok(!/href=["'{]*\/ayuda/.test(barra), "ANTES la barra ya llevaba a /ayuda");
    });
    test("ANTES: las guías no nombraban «Centro de ayuda» entre las partes de la barra", () => {
        const guia = deAntes("lib/guia-de-modulo.ts");
        assert.ok(guia && !guia.includes("BotonDeAyuda"));
    });
    test("ANTES: la fila de Documentación › Guías no era compartida", () => {
        assert.equal(deAntes("components/documentacion/FilaDeGuia.tsx"), null);
    });
} else {
    const ayuda = await import(path.join(C, "centro-de-ayuda.mjs"));
    const { lasGuiasDelCentroDeAyuda } = await import(path.join(C, "guias-del-centro-de-ayuda.mjs"));
    const { GUIAS_PUBLICADAS } = await import(path.join(C, "tutoriales-del-modulo.mjs"));
    const { losQueSeVenEnElMenu, elModuloDe } = await import(path.join(RAIZ, "scripts/menu-de-un-cliente.mjs"));
    const { PARTES_DE_LA_BARRA_DE_ARRIBA } = await import(path.join(C, "guia-de-modulo.mjs"));
    const guias = lasGuiasDelCentroDeAyuda();

    /** El nombre de un grupo del menú, como se escribe en la categoría («Conexión→ Ajustes» → «Conexión y Ajustes»). */
    const comoNombre = (label) => label.replace(/\s*→\s*/, " y ").trim();
    /** Las rutas de un grupo del menú: las de sus pestañas, o la suya si es una pantalla suelta. */
    const lasRutasDelGrupo = (m) => (m.items.length ? [...(m.route.startsWith("/") ? [m.route] : []), ...m.items.map((i) => i.url)] : [m.route]);

    test("las diez categorías, en el orden del menú lateral y con los nombres pedidos", () => {
        assert.deepEqual(
            ayuda.CATEGORIAS_DE_AYUDA.map((c) => c.nombre),
            [
                "Panel",
                "Bandeja",
                "Contactos",
                "Integraciones",
                "Herramientas",
                "Apps Externas",
                "Entrenamiento",
                "Creación de Flujos",
                "Automatizaciones",
                "Conexión y Ajustes",
            ],
        );
        const slugs = ayuda.CATEGORIAS_DE_AYUDA.map((c) => c.slug);
        assert.equal(new Set(slugs).size, 10, "dos categorías con la misma dirección");
        for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/, `«${s}» no es una dirección limpia`);
    });

    test("cada categoría es un grupo del menú de un cliente, con SUS pantallas", () => {
        const grupos = losQueSeVenEnElMenu();
        assert.equal(grupos.length, 10, "el menú de un cliente ya no tiene diez grupos: hay que volver a mirar las categorías");
        grupos.forEach((m, i) => {
            const c = ayuda.CATEGORIAS_DE_AYUDA[i];
            assert.equal(c.nombre, comoNombre(m.label), `el grupo ${i + 1} del menú es «${m.label}» y la categoría «${c.nombre}»`);
            assert.deepEqual(
                c.pantallas.map((p) => p.ruta),
                lasRutasDelGrupo(m),
                `las pantallas de «${c.nombre}» no son las del menú`,
            );
            assert.equal(c.icono, m.icon, `«${c.nombre}» lleva otro icono que su grupo del menú`);
        });
    });

    test("cada guía publicada cae sola en la categoría del grupo donde vive su pantalla", () => {
        assert.equal(guias.length, GUIAS_PUBLICADAS.length);
        assert.ok(guias.length >= 15, "se esperaban al menos las quince guías publicadas");
        for (const g of guias) {
            const grupo = elModuloDe(g.ruta);
            assert.ok(grupo, `la pantalla de «${g.titulo}» (${g.ruta}) no está en el menú de un cliente`);
            assert.ok(g.categoria, `«${g.titulo}» se quedó sin categoría`);
            assert.equal(ayuda.laCategoria(g.categoria).nombre, comoNombre(grupo.label), `«${g.titulo}» cayó en otra categoría`);
        }
    });

    test("lo que ya hay: cuántas guías por categoría, las diez también con cero", () => {
        const cuantas = ayuda.cuantasPorCategoria(guias);
        assert.deepEqual(Object.keys(cuantas), ayuda.CATEGORIAS_DE_AYUDA.map((c) => c.slug));
        assert.equal(Object.values(cuantas).reduce((a, b) => a + b, 0), guias.length, "alguna guía no se contó");
        // Hoy: Leads, Agenda y Etiquetas en Contactos; Mis notas y Copiloto en
        // Herramientas; y Llamadas en Bandeja.
        assert.equal(cuantas.contactos, 3);
        assert.equal(cuantas.herramientas, 2);
        assert.equal(cuantas.bandeja, 1); // Llamadas
        assert.deepEqual(
            ayuda.lasGuiasDeLaCategoria(guias, "herramientas").map((g) => g.modulo),
            ["notas", "copiloto"],
            "las de una categoría van en el orden en que se publicaron",
        );
    });

    test("la ruta de una SUBpantalla cae en la categoría de su pantalla; lo que no está en el menú, en ninguna", () => {
        const c = ayuda.laCategoriaDeLaRuta;
        assert.equal(c("/sessions"), "contactos");
        assert.equal(c("/sessions/"), "contactos");
        assert.equal(c("/sessions?x=1"), "contactos");
        assert.equal(c("/dashboard/finance/ventas"), "panel");
        assert.equal(c("/crm/llamadas"), "bandeja", "/crm/llamadas es de Bandeja aunque /crm/kanban sea de Panel");
        assert.equal(c("/crm/kanban/algo"), "panel");
        assert.equal(c("/tagsx"), null, "cortar por SEGMENTO: /tagsx no es /tags");
        assert.equal(c("/crm"), null);
        assert.equal(c("/ayuda"), null);
        assert.equal(c(""), null);
        assert.equal(c("/profile"), "conexion-y-ajustes");
    });

    test("el buscador encuentra por palabra clave en cualquier categoría, sin tildes ni mayúsculas", () => {
        const buscar = (q) => ayuda.buscarEnLasGuias(guias, q);
        assert.deepEqual(buscar(""), []);
        assert.deepEqual(buscar("   "), []);
        assert.deepEqual(buscar("zxqwv"), [], "algo que no está en ninguna guía no encuentra nada");

        const catalogo = buscar("catalogo");
        assert.equal(catalogo[0]?.guia.modulo, "catalogo", "«catalogo» sin tilde encuentra Catálogo");
        assert.equal(catalogo[0].url, "/guia/catalogo", "por el nombre de la guía, lleva a la guía entera");
        assert.equal(catalogo[0].seccion, null);
        assert.equal(buscar("CATÁLOGO")[0]?.guia.modulo, "catalogo");

        // «exportar» no es el nombre de ninguna guía: lleva a la SECCIÓN.
        const exportar = buscar("exportar");
        assert.ok(exportar.length > 0, "«exportar» no encontró nada");
        for (const r of exportar) {
            assert.ok(r.seccion, `«exportar» en ${r.guia.modulo} tendría que llevar a una sección`);
            assert.equal(r.url, `${r.guia.url}/${r.seccion.slug}`);
        }
        assert.ok(exportar.some((r) => r.guia.modulo === "leads"), "«exportar» tendría que encontrar la sección de Leads");

        // Las palabras no tienen que ir juntas, pero TIENEN que estar todas.
        const dos = buscar("etiquetas leads");
        assert.equal(dos[0]?.guia.modulo, "leads");
        assert.deepEqual(buscar("leads zxqwv"), []);

        // Guías de categorías distintas en la misma búsqueda.
        const cats = new Set(buscar("guardar").map((r) => r.guia.categoria));
        assert.ok(cats.size >= 2, "«guardar» tendría que salir en guías de más de una categoría");

        // Nunca más del tope.
        assert.ok(buscar("a").length <= ayuda.TOPE_DE_RESULTADOS);
        assert.ok(ayuda.buscarEnLasGuias(guias, "a", 3).length <= 3, "el tope que se pide se respeta");
    });

    test("el filtro de una categoría mira título, descripción y secciones, sin tildes", () => {
        const [notas] = ayuda.lasGuiasDeLaCategoria(guias, "herramientas");
        assert.ok(ayuda.pasaElFiltroDeLaCategoria(notas, ""));
        assert.ok(ayuda.pasaElFiltroDeLaCategoria(notas, "NOTAS"));
        assert.ok(ayuda.pasaElFiltroDeLaCategoria(notas, notas.secciones[1].titulo.toLowerCase()));
        assert.ok(!ayuda.pasaElFiltroDeLaCategoria(notas, "zxqwv"));
    });

    test("los textos: «1 guía», «N guías», las pantallas en una frase y el aviso de sin guías", () => {
        assert.equal(ayuda.elNumeroDeGuias(1), "1 guía");
        assert.equal(ayuda.elNumeroDeGuias(4), "4 guías");
        assert.equal(ayuda.lasPantallasEnUnaFrase(ayuda.laCategoria("bandeja")), "Chats, Correos y Llamadas");
        assert.equal(ayuda.lasPantallasEnUnaFrase(ayuda.laCategoria("conexion-y-ajustes")), "Conexión y Ajustes");
        assert.equal(ayuda.SIN_GUIAS_TODAVIA, "Estamos trabajando en esta guía");
        assert.equal(ayuda.elEnlaceDeLaCategoria("bandeja"), "/ayuda/bandeja");
        assert.equal(ayuda.laCategoria("no-existe"), null);
    });

    test("lo que viaja a la pantalla: sin el contenido de las guías, solo lo que se pinta y se busca", () => {
        for (const g of guias) {
            assert.deepEqual(Object.keys(g).sort(), ["categoria", "descripcion", "modulo", "nombre", "ruta", "secciones", "subtitulo", "titulo", "url"]);
            assert.match(g.titulo, /^Guía de /);
            assert.equal(g.url, `/guia/${g.modulo}`);
            for (const s of g.secciones) assert.ok(s.claves.length <= 600, "las claves de una sección van topadas");
        }
        assert.ok(JSON.stringify(guias).length < 60_000, "lo que baja a la pantalla creció demasiado");
    });

    test("las pantallas del centro no llevan administración, y la fila es la de Documentación › Guías", () => {
        const pantallas = [
            "components/ayuda/CentroDeAyuda.tsx",
            "components/ayuda/GuiasDeLaCategoria.tsx",
            "app/(root)/ayuda/page.tsx",
            "app/(root)/ayuda/[categoria]/page.tsx",
        ].map((f) => [f, sinComentarios(hoy(f))]);
        const PROHIBIDO = [
            ["«+ Nuevo»", /BotonDeCrear|>\s*Nuevo\s*</],
            ["«Editar introducción»", /Editar introducci|EditarIntroduccion/],
            ["arrastrar para reordenar", /useSortable|DndContext|RejillaOrdenable|OrdenDeColumna|useOrdenPropio|GripVertical/],
            ["«Guías publicadas»", /Guías publicadas|Guias publicadas/],
            ["acciones de guardar", /@\/actions\//],
        ];
        for (const [f, s] of pantallas) for (const [que, re] of PROHIBIDO) assert.ok(!re.test(s), `${f} lleva ${que}`);

        const categoria = sinComentarios(hoy("components/ayuda/GuiasDeLaCategoria.tsx"));
        const documentacion = sinComentarios(hoy("app/(root)/documentation/guide/_components/EditarIntroduccionDeLaGuia.tsx"));
        assert.ok(categoria.includes("<FilaDeGuia"), "la lista de una categoría no usa la fila de Documentación");
        assert.ok(documentacion.includes("<FilaDeGuia"), "Documentación › Guías ya no usa la fila compartida");
        assert.ok(categoria.includes("SIN_GUIAS_TODAVIA"), "la categoría vacía no dice que se está trabajando en ella");
        // La fila de la categoría solo lleva «Ver»: nada detrás.
        assert.match(categoria, /<FilaDeGuia[^>]*\/>/, "la fila de una categoría lleva algo más que «Ver»");
        const fila = sinComentarios(hoy("components/documentacion/FilaDeGuia.tsx"));
        assert.match(fila, /target="_blank"/);
        assert.match(fila, /rel="noopener noreferrer"/);
    });

    test("en la barra de arriba: «Ayuda» justo antes de «Soporte», y «Ver tutoriales» sigue", () => {
        const barra = hoy("components/custom/Breadcrumbs.tsx");
        const cabecera = sinComentarios(barra.slice(barra.indexOf("<header"), barra.indexOf("</header>")));
        const ayudaEn = cabecera.indexOf("<BotonDeAyuda");
        const soporteEn = cabecera.indexOf("<BotonDeSoporte");
        const buscarEn = cabecera.indexOf("<GlobalSearch");
        assert.ok(ayudaEn > 0, "no hay botón de Ayuda en la barra");
        assert.ok(buscarEn < ayudaEn && ayudaEn < soporteEn, "«Ayuda» no va entre el buscador y «Soporte»");
        assert.equal(cabecera.slice(ayudaEn, soporteEn).match(/<[A-Z]/g)?.length, 1, "entre «Ayuda» y «Soporte» hay otra cosa");
        assert.ok(cabecera.includes("Ver tutoriales"), "«Ver tutoriales» ya no está");

        const boton = sinComentarios(hoy("components/ayuda/BotonDeAyuda.tsx"));
        assert.ok(boton.includes("RUTA_DEL_CENTRO_DE_AYUDA"), "el botón no lleva al centro de ayuda");
        // La misma forma que «Soporte»: son pareja.
        const soporte = hoy("components/tickets/BotonDeSoporte.tsx");
        const clases = (s) => s.match(/className=[{`"]+(h-9 gap-1\.5 border border-primary\/30 text-primary hover:bg-primary\/10 hover:text-primary)/)?.[1];
        assert.ok(clases(boton) && clases(boton) === clases(soporte), "«Ayuda» no tiene la forma de «Soporte»");

        const nombres = PARTES_DE_LA_BARRA_DE_ARRIBA.map((p) => p.componente);
        assert.equal(nombres[nombres.indexOf("BotonDeSoporte") - 1], "BotonDeAyuda", "las guías no nombran «Centro de ayuda» antes de «Soporte»");
    });

    test("el centro de ayuda es para todos: no es una ruta de ningún módulo", () => {
        // El guardián del layout solo cierra rutas que están en algún módulo:
        // /ayuda no está en ninguno, así que la abre cualquiera con sesión.
        const rutas = hoy("lib/navigation-routes.ts");
        assert.ok(!/route:\s*["']\/ayuda/.test(rutas), "/ayuda se volvió una ruta asignable: dejaría de verla quien no la tenga");
        const semillas = hoy("scripts/menu-de-un-cliente.mjs");
        assert.ok(!semillas.includes("/ayuda"));
    });

    test("las capturas de la barra en las guías salen con siete partes numeradas", () => {
        const taller = hoy("scripts/taller-de-la-guia.mjs");
        const partes = taller.slice(taller.indexOf("export const lasPartesDeArriba"), taller.indexOf("];", taller.indexOf("export const lasPartesDeArriba")));
        assert.equal(partes.match(/p\.locator\(/g).length, 7, "el taller no localiza las siete partes");
        assert.ok(partes.indexOf("data-boton-de-ayuda") < partes.indexOf("Pedir soporte"));
        for (const f of execSync("ls scripts/capturar-guia-*.mjs", { cwd: RAIZ }).toString().trim().split("\n")) {
            const s = hoy(f);
            if (!s.includes("lasPartesDeArriba(p)")) continue;
            assert.ok(/\[\s*,\s*,\s*,\s*buscarTodo,\s*ayuda,\s*soporte,\s*campana\s*\]/.test(s), `${f} no reparte las siete partes`);
        }
    });

    test("existe la imagen de la barra con «Ayuda» en cada guía publicada", () => {
        const marca = path.join(RAIZ, "scripts/barra-de-las-guias.json");
        assert.ok(existsSync(marca), "no se regeneraron las capturas de la barra (scripts/barra-de-las-guias.json)");
        const hecho = JSON.parse(hoy("scripts/barra-de-las-guias.json"));
        assert.deepEqual(hecho.partes, PARTES_DE_LA_BARRA_DE_ARRIBA.map((p) => p.nombre), "las capturas de la barra se tomaron con otras partes");
        assert.deepEqual([...hecho.guias].sort(), guias.map((g) => g.modulo).sort(), "falta la barra de alguna guía");
        // Y cada imagen es la que se tomó así: una barra que se vuelve a
        // fotografiar por otro camino (una guía generada con la barra vieja)
        // cambia su huella y se pone en rojo.
        for (const m of hecho.guias) {
            const fichero = path.join(RAIZ, "public/guia", m, "barra-de-arriba.webp");
            assert.ok(existsSync(fichero), `no existe la barra de ${m}`);
            const huella = createHash("sha1").update(readFileSync(fichero)).digest("hex").slice(0, 16);
            assert.equal(huella, hecho.imagenes?.[m], `la barra de ${m} no es la que se tomó con las siete partes: vuelve a correr scripts/regenerar-barra-de-las-guias.sh`);
        }
    });
}
