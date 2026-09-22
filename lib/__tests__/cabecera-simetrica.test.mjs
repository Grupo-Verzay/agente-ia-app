/**
 * Las DOS filas de la cabecera de Chats, medidas por sus dos extremos.
 *
 * # Por qué esto se mide en un navegador
 *
 * La pregunta no es qué padding lleva cada fila: es **dónde cae lo que se
 * ve**. Y no coinciden, porque las dos filas llegan de formas distintas: la de
 * arriba se pone su hueco con el `px-*` de su contenedor, y la de abajo NO
 * tiene contenedor con hueco —su extremo izquierdo es el `px-4` de la primera
 * pestaña, que es además el ancho del subrayado de la activa—. Comparar los
 * dos `className` a ojo dice que uno pone 12 y el otro 16 y no dice **a qué
 * píxel llega cada cosa**, que es lo único que se ve.
 *
 * # Las clases salen del componente, no de aquí
 *
 * Se leen de `ChatHeader.tsx` con su regex, resolviendo la constante cuando la
 * clase va por `cn(...)`. Copiadas al banco se estaría midiendo una cabecera
 * que React no pinta — es la regla de siempre de esta casa.
 *
 * # Los dos modos
 *
 * `MODO=roto` lee el MISMO componente de `origin/main` —donde la fila de
 * arriba va con `px-3` y el grupo de abajo con `pr-2`— y **afirma el fallo**:
 * los dos extremos torcidos, y en sentidos contrarios.
 *
 * Se levanta con `scripts/banco-paneles-flotantes.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    // Sin navegador no se finge: se dice y se salta.
}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPONENTE = "app/(root)/chats/_components/ChatHeader.tsx";

/** El CSS del build: medir con otra hoja es medir una cabecera que nadie ve. */
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;

function faltaNavegador(t) {
    if (!chromium) {
        t.skip("sin playwright no se mide; se dice en vez de fingir");
        return true;
    }
    if (!CSS) {
        t.skip("falta el CSS del build (.next/static/css): corre 'npm run build'");
        return true;
    }
    return false;
}

/**
 * El texto del componente: el del árbol de trabajo, o el de `origin/main`
 * cuando se está afirmando el «antes».
 */
function elComponente() {
    if (!ROTO) return fs.readFileSync(join(RAIZ, COMPONENTE), "utf8");
    return execFileSync("git", ["show", `origin/main:${COMPONENTE}`], {
        encoding: "utf8",
        cwd: RAIZ,
    });
}

/**
 * Las clases que de verdad se aplican, resolviendo la constante cuando van por
 * `cn(...)`.
 *
 * Lo que se exige no es que aparezca una sola vez —la de una pestaña está
 * escrita en las tres, Mensajes, Notas y las integraciones— sino que **todas
 * las coincidencias digan lo mismo**. Con dos distintas el banco mediría la
 * primera que apareciera, y eso no es ninguna fila en concreto.
 */
function clases(texto, re) {
    const todas = [...texto.matchAll(re)].map((m) => {
        // La alternancia deja huecos: la rama del literal llena un grupo y la
        // del `cn(...)` dos. Se toman los que HAYA, no los de tal posición.
        const [literal, constante] = m.slice(1).filter(Boolean);
        if (!constante) return literal;
        const valor = new RegExp(`const ${constante} = ['"]([^'"]+)['"]`).exec(texto);
        assert.ok(valor, `no se pudo resolver la constante ${constante}`);
        return `${literal} ${valor[1]}`;
    });

    assert.ok(todas.length > 0, `no se encontró la clase: ${re}`);
    assert.equal(
        new Set(todas).size,
        1,
        `la clase tiene que decir lo mismo en todas partes; salieron ${[...new Set(todas)]}`,
    );
    return todas[0];
}

function laCabecera() {
    const texto = elComponente();
    return {
        fila1: clases(
            texto,
            /className=(?:"(flex items-center [^"]*py-0 gap-3 overflow-hidden)"|\{cn\('(flex items-center py-0 gap-3 overflow-hidden)', (\w+)\)\})/g,
        ),
        grupo1: clases(texto, /className="(flex items-center gap-1\.5 overflow-x-auto[^"]*)"/g),
        ficha: clases(texto, /className="(hidden md:flex h-8 items-center gap-1\.5 px-2\.5 rounded-lg[^"]*)"/g),
        fila2: clases(texto, /className="(flex items-center overflow-x-auto \[scrollbar-width:none\][^"]*)"/g),
        tab: clases(texto, /'(px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors)'/g),
        grupo2: clases(
            texto,
            /className=(?:"(ml-auto flex items-center gap-1 pr-\d)"|\{cn\('(ml-auto flex items-center gap-1)', (\w+)\)\})/g,
        ),
        boton: clases(texto, /className="(h-8 gap-1\.5 px-2\.5 text-sm)"/g),
    };
}

/**
 * La maqueta: las dos filas de escritorio con la misma forma que la cabecera
 * de verdad —a la izquierda el mando de plegar y el nombre, a la derecha la
 * tira de iconos; y debajo las pestañas con Macros y Acciones al final—.
 */
function pagina(c) {
    return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS}</style>
<style>*{animation:none!important;transition:none!important}body{margin:0}</style>
</head><body>
<div id="cab" class="hidden md:flex md:flex-col md:justify-center overflow-hidden border-b-2 border-border" style="height:5.125rem">
  <div class="${c.fila1}">
    <div class="flex items-center gap-3 min-w-0 flex-1">
      <button id="primero1" class="h-8 w-8 shrink-0 rounded-md border border-input bg-background">P</button>
      <div class="min-w-0"><span class="text-sm">Contacto</span></div>
    </div>
    <div class="${c.grupo1}">
      <button class="h-7 w-7 shrink-0 rounded-md border">a</button>
      <button class="h-7 w-7 shrink-0 rounded-md border">b</button>
      <button id="ultimo1" class="${c.ficha.replace("hidden md:flex", "flex")}">F</button>
    </div>
  </div>
  <div class="${c.fila2}">
    <button class="${c.tab}"><span id="texto2">Mensajes</span></button>
    <button class="${c.tab}">Notas</button>
    <div class="${c.grupo2}">
      <button class="h-7 w-7 shrink-0 rounded-md">s</button>
      <button class="${c.boton}">Macros</button>
      <button id="ultimo2" class="${c.boton}">Acciones</button>
    </div>
  </div>
</div></body></html>`;
}

/** Las anchuras de escritorio. El móvil va aparte: allí la cabecera es otra. */
const ANCHURAS = [1440, 1280, 1024];

async function medir(c) {
    const html = pagina(c);
    const servidor = http.createServer((_p, r) => {
        r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        r.end(html);
    });
    await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
    const puerto = servidor.address().port;
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN });

    const salida = [];
    try {
        for (const ventana of ANCHURAS) {
            const pagina = await navegador.newPage({ viewport: { width: ventana, height: 900 } });
            await pagina.goto(`http://127.0.0.1:${puerto}/`);
            salida.push({
                ventana,
                ...(await pagina.evaluate(() => {
                    const caja = (id) => document.getElementById(id).getBoundingClientRect();
                    const cab = caja("cab");
                    return {
                        izquierda1: Math.round(caja("primero1").left - cab.left),
                        izquierda2: Math.round(caja("texto2").left - cab.left),
                        derecha1: Math.round(cab.right - caja("ultimo1").right),
                        derecha2: Math.round(cab.right - caja("ultimo2").right),
                        desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                    };
                })),
            });
            await pagina.close();
        }
    } finally {
        await navegador.close();
        servidor.close();
    }
    return salida;
}

test("las dos filas de la cabecera empiezan y acaban en el MISMO píxel", async (t) => {
    if (faltaNavegador(t)) return;

    const medidas = await medir(laCabecera());
    for (const m of medidas) {
        t.diagnostic(
            `${m.ventana}: izquierda ${m.izquierda1}/${m.izquierda2} · derecha ${m.derecha1}/${m.derecha2}`,
        );
    }

    if (ROTO) {
        // EL ANTES: la fila de arriba con `px-3` y el grupo de abajo con
        // `pr-2`. Los dos extremos torcidos, y en sentidos CONTRARIOS —por eso
        // la fila se lee descuadrada aunque cada número por separado parezca
        // razonable—. Y de paso queda dicho cuál sobresalía de verdad: el de
        // abajo, no el de arriba.
        for (const m of medidas) {
            assert.notEqual(m.izquierda1, m.izquierda2, `a ${m.ventana} la izquierda ya cuadraba`);
            assert.notEqual(m.derecha1, m.derecha2, `a ${m.ventana} la derecha ya cuadraba`);
            assert.ok(
                m.derecha2 < m.derecha1,
                `a ${m.ventana} quien sobresalía era Acciones, no la ficha (${m.derecha2} vs ${m.derecha1})`,
            );
        }
        return;
    }

    for (const m of medidas) {
        assert.ok(
            Math.abs(m.izquierda1 - m.izquierda2) <= 1,
            `a ${m.ventana} las dos filas no empiezan igual (${m.izquierda1} vs ${m.izquierda2})`,
        );
        assert.ok(
            Math.abs(m.derecha1 - m.derecha2) <= 1,
            `a ${m.ventana} las dos filas no acaban igual (${m.derecha1} vs ${m.derecha2})`,
        );
        assert.ok(!m.desborda, `a ${m.ventana} la cabecera desborda a lo ancho`);
    }
});

test("el margen está escrito UNA vez, y sus dos mitades son el mismo escalón", (t) => {
    if (ROTO) {
        t.skip("en el «antes» no había ninguna constante que comprobar");
        return;
    }
    const texto = fs.readFileSync(join(RAIZ, COMPONENTE), "utf8");
    const fila = /const MARGEN_DE_LA_CABECERA = '(px-(\d+))'/.exec(texto);
    const derecho = /const MARGEN_DERECHO_DE_LA_CABECERA = '(pr-(\d+))'/.exec(texto);

    assert.ok(fila, "falta MARGEN_DE_LA_CABECERA");
    assert.ok(derecho, "falta MARGEN_DERECHO_DE_LA_CABECERA");
    // Son dos constantes porque cada fila llega de una forma. El número es el
    // mismo, y eso es lo único que no puede separarse: con dos escalones
    // distintos vuelve el fallo entero y nadie lo nota leyendo el diff.
    assert.equal(fila[2], derecho[2], "las dos mitades del margen tienen que ser el mismo escalón");

    // Y que no quede ninguna copia suelta del hueco viejo en las dos filas.
    assert.ok(
        !texto.includes('className="flex items-center px-3 py-0 gap-3 overflow-hidden"'),
        "la fila de iconos volvió a escribir su hueco a mano",
    );
    assert.ok(
        !texto.includes('className="ml-auto flex items-center gap-1 pr-2"'),
        "el grupo de Macros y Acciones volvió a escribir su hueco a mano",
    );
});
