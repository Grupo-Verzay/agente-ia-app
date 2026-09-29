/**
 * El MENÚ y la BARRA DE ARRIBA en la guía pública de Leads.
 *
 * La primera versión de la guía enseñaba la pantalla de Leads sin su marco: el
 * menú de la izquierda salía como tres letras recortadas («C…», «E…», «L…») y
 * la barra de arriba no se nombraba en ningún paso. Las dos cosas nacían en los
 * DATOS de ejemplo, no en la pantalla: se sembraban tres módulos con iconos que
 * el menú no conoce (`MessageCircle`, `Users` son de lucide; el menú dibuja los
 * de `iconMap`), y la cuenta era de la casa, así que su barra no llevaba
 * «Ver tutoriales» ni «Soporte».
 *
 * Lo que se comprueba, y ninguna de estas cosas se ve leyendo una sola pieza:
 *
 * 1. **El menú sembrado se puede pintar entero**: cada icono existe en
 *    `iconMap`, cada ruta existe en `navigationRoutes`, y Leads vive en el
 *    módulo que la guía dice (`MODULO_DE_LEADS`).
 * 2. **La barra de arriba que la guía nombra es la de `Breadcrumbs.tsx`**, con
 *    las mismas partes y en el mismo orden. Un botón nuevo en la barra sin su
 *    nombre en la guía pone esto en rojo.
 * 3. **La sección «La pantalla de un vistazo» nombra las cinco zonas**, el
 *    menú y cada parte de la barra, en orden.
 * 4. **Lo que se CAPTURÓ** (`scripts/menu-guia-leads.json`, lo escribe
 *    `capturar-guia-leads.mjs` al tomar la vista general): el menú estaba
 *    recogido, como se ve al entrar, y cada módulo salió con su icono y con el
 *    nombre del menú sembrado. Es la prueba de que las capturas publicadas
 *    llevan el menú de verdad y no letras sueltas.
 *
 * `MODO=roto` lee `ANTES_MENU_REF` —pinchado a un commit, nunca
 * `origin/main`, que en cuanto esto se fusione pasa a ser el «después»— y
 * afirma el fallo: la semilla vieja con iconos que el menú no conoce, ningún
 * paso para el menú ni para la barra de arriba, y ningún registro del menú.
 *
 * Se levanta con `scripts/banco-guia-leads.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_MENU_REF ?? "8e41502";

const deAntes = (rel) => {
    try {
        return execSync(`git show ${ANTES}:${rel}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
    } catch {
        return "";
    }
};
const hoy = (rel) => readFileSync(path.join(RAIZ, rel), "utf8");
const leer = ROTO ? deAntes : hoy;

/** Los nombres del mapa de iconos del menú, leídos de `schema/module.ts`. */
function losIconosDelMenu(fuente) {
    const bloque = fuente.match(/export const iconMap = \{([\s\S]*?)\};/);
    assert.ok(bloque, "no se encontró `iconMap` en schema/module.ts");
    return new Set(bloque[1].split(/[,\s]+/).filter(Boolean));
}

/** Las rutas que el desplegable de módulos deja elegir (`lib/navigation-routes.ts`). */
function lasRutasDeNavegacion(fuente) {
    return new Set([...fuente.matchAll(/route:\s*["']([^"']+)["']/g)].map((m) => m[1]));
}

/** Los iconos que siembra un fichero de semilla: `icon: "…"`. */
const losIconosSembrados = (fuente) => [...fuente.matchAll(/icon:\s*["']([^"']+)["']/g)].map((m) => m[1]);

/** Que `trozos` aparezcan en `texto` en ese orden, sin saltarse ninguno. */
function enOrden(texto, trozos, que) {
    let desde = 0;
    for (const t of trozos) {
        const i = texto.indexOf(t, desde);
        assert.ok(i >= 0, `${que}: falta «${t}» (o no va en su orden)`);
        desde = i + t.length;
    }
}

const ICONOS = losIconosDelMenu(hoy("schema/module.ts"));

if (ROTO) {
    test("ANTES: la semilla sembraba iconos que el menú NO conoce (por eso salían letras recortadas)", () => {
        const semilla = deAntes("scripts/sembrar-barra.mjs") + deAntes("scripts/sembrar-guia-leads.mjs");
        assert.ok(semilla, "no se pudo leer la semilla de ANTES_MENU_REF");
        const iconos = losIconosSembrados(semilla);
        assert.ok(iconos.length > 0, "la semilla de antes no sembraba ningún módulo");
        const desconocidos = iconos.filter((i) => !ICONOS.has(i));
        assert.ok(desconocidos.length > 0, `todos los iconos de antes existían en iconMap: ${iconos.join(", ")}`);
        assert.ok(!deAntes("scripts/sembrar-guia-leads.mjs").includes("menu-de-un-cliente"), "la semilla de antes ya sembraba el menú de un cliente");
        assert.equal(deAntes("scripts/menu-de-un-cliente.mjs"), "", "el menú de un cliente ya existía");
    });

    test("ANTES: la guía no nombraba el menú ni la barra de arriba", () => {
        const guia = deAntes("lib/guia-leads.ts");
        assert.ok(guia, "no se pudo leer lib/guia-leads.ts de ANTES_MENU_REF");
        assert.ok(!guia.includes("El menú de la plataforma"), "la guía de antes ya tenía un paso para el menú");
        // Ojo: la guía de antes llamaba «barra de arriba» a la barra de TRABAJO
        // de Leads (la del buscador), y la de la plataforma no la nombraba.
        assert.ok(!/titulo:\s*"La barra de arriba"/.test(guia), "la guía de antes ya tenía un paso para la barra de arriba");
        assert.ok(!guia.includes("Ver tutoriales") && !guia.includes("notificaciones"), "la guía de antes ya nombraba las partes de la barra de arriba");
        assert.ok(!guia.includes("PARTES_DE_LA_BARRA_DE_ARRIBA"), "la guía de antes ya listaba las partes de la barra");
        assert.ok(!guia.includes("menu-lateral.webp"), "la guía de antes ya enseñaba el menú");
    });

    test("ANTES: no había registro de lo que pintaba el menú en las capturas", () => {
        assert.equal(deAntes("scripts/menu-guia-leads.json"), "", "el registro del menú ya existía");
    });
} else {
    const guia = await import(path.join(RAIZ, "lib/__tests__/.compilado/guia-leads/guia-leads.mjs"));
    const { MENU_DE_UN_CLIENTE, losQueSeVenEnElMenu, elModuloDe } = await import(path.join(RAIZ, "scripts/menu-de-un-cliente.mjs"));
    const vistaGeneral = guia.laSeccion("vista-general");
    const paso = (titulo) => vistaGeneral.pasos.find((p) => p.titulo === titulo);

    test("cada icono del menú sembrado existe en iconMap (si no, sale el nombre recortado)", () => {
        const sinIcono = MENU_DE_UN_CLIENTE.filter((m) => !ICONOS.has(m.icon)).map((m) => `${m.label} (${m.icon})`);
        assert.deepEqual(sinIcono, [], "módulos con un icono que el menú no sabe dibujar");
    });

    test("cada ruta del menú sembrado existe en navigationRoutes", () => {
        const rutas = lasRutasDeNavegacion(hoy("lib/navigation-routes.ts"));
        const malas = [];
        for (const m of MENU_DE_UN_CLIENTE) {
            // `#container` es un módulo que solo agrupa: no tiene pantalla propia.
            if (m.route !== "#container" && !rutas.has(m.route)) malas.push(m.route);
            for (const it of m.items) if (!rutas.has(it.url)) malas.push(`${m.label} › ${it.title} (${it.url})`);
        }
        assert.deepEqual(malas, [], "rutas del menú que no existen");
    });

    test("Leads vive en el módulo que la guía dice", () => {
        const modulo = elModuloDe("/sessions");
        assert.ok(modulo, "/sessions no está en el menú sembrado");
        assert.equal(modulo.label, guia.MODULO_DE_LEADS);
        assert.ok(paso("El menú de la plataforma").texto.includes(guia.MODULO_DE_LEADS), "el paso del menú no dice dónde está Leads");
    });

    test("la semilla de la guía siembra ESE menú y nada más, en una cuenta cliente", () => {
        const semilla = hoy("scripts/sembrar-guia-leads.mjs");
        assert.match(semilla, /from "\.\/menu-de-un-cliente\.mjs"/);
        assert.match(semilla, /db\.module\.deleteMany\(\{\}\)/, "no borra los módulos de antes: quedarían mezclados con el menú del cliente");
        assert.match(semilla, /role:\s*"user"/, "la cuenta de la guía no es la de un cliente");
        // Sin estas dos filas la barra sale sin «Ver tutoriales» y sin «Soporte».
        assert.match(semilla, /db\.guideUrl\.create/);
        assert.match(semilla, /INSERT INTO "tickets_config"/);
    });

    test("la barra de arriba que la guía nombra es la de Breadcrumbs.tsx, en su orden", () => {
        const barra = hoy("components/custom/Breadcrumbs.tsx");
        const cabecera = barra.slice(barra.indexOf("<header"), barra.indexOf("</header>"));
        assert.ok(cabecera.length > 0, "no se encontró la <header> de la barra");
        const donde = (componente) => {
            const i = componente.startsWith("Ver ") ? cabecera.indexOf(componente) : cabecera.indexOf(`<${componente}`);
            assert.ok(i >= 0, `«${componente}» ya no está en la barra de arriba`);
            return i;
        };
        const posiciones = guia.PARTES_DE_LA_BARRA_DE_ARRIBA.map((p) => donde(p.componente));
        assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b), "las partes de la barra no van en el orden de la guía");
        // Nada nuevo en la barra sin nombre en la guía. Lo que NO es una parte:
        // el diálogo de tutoriales por dentro y el tema del editor de flujos
        // (solo sale en /workflow, no en Leads).
        const ESTRUCTURA = new Set([
            "Dialog", "DialogTrigger", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription",
            "ScrollArea", "Button", "Play", "ThemeSwitcher",
        ]);
        const nombradas = new Set(guia.PARTES_DE_LA_BARRA_DE_ARRIBA.map((p) => p.componente));
        const sinNombre = [...new Set([...cabecera.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]))].filter(
            (c) => !ESTRUCTURA.has(c) && !nombradas.has(c),
        );
        assert.deepEqual(sinNombre, [], "hay partes en la barra de arriba que la guía no nombra");
    });

    test("«La pantalla de un vistazo» nombra las cinco zonas, el menú y cada parte de la barra", () => {
        const titulos = vistaGeneral.pasos.map((p) => p.titulo);
        enOrden(titulos.join("\n"), ["Todo en una pantalla", "El menú de la plataforma", "La barra de arriba", "La barra de trabajo"], "pasos");
        enOrden(paso("Todo en una pantalla").texto, [...guia.ZONAS_DE_LA_PANTALLA], "las zonas de la vista general");
        enOrden(paso("La barra de arriba").texto, guia.PARTES_DE_LA_BARRA_DE_ARRIBA.map((p, i) => `${i + 1} ${p.nombre}`), "las partes de la barra de arriba");
        assert.equal(paso("El menú de la plataforma").imagen, "menu-lateral.webp");
        assert.equal(paso("La barra de arriba").imagen, "barra-de-arriba.webp");
        for (const img of ["menu-lateral.webp", "barra-de-arriba.webp", "vista-general.webp"]) {
            assert.ok(existsSync(path.join(RAIZ, "public/guia/leads", img)), `falta ${img}`);
        }
    });

    test("en las capturas el menú salió recogido, con el icono y el nombre de cada módulo", () => {
        const fichero = path.join(RAIZ, "scripts/menu-guia-leads.json");
        assert.ok(existsSync(fichero), "no hay registro del menú: vuelve a correr scripts/generar-guia-leads.sh");
        const capturado = JSON.parse(readFileSync(fichero, "utf8"));
        assert.equal(capturado.recogido, true, "el menú no estaba recogido, que es como se ve al entrar a Leads");
        const sinIcono = capturado.modulos.filter((m) => !m.conIcono).map((m) => m.nombre);
        assert.deepEqual(sinIcono, [], "módulos que salieron sin icono (letras recortadas)");
        assert.deepEqual(
            capturado.modulos.map((m) => m.nombre),
            losQueSeVenEnElMenu().map((m) => m.label.trim()),
            "el menú de las capturas no es el sembrado",
        );
    });
}
