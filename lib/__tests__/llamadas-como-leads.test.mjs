/**
 * CRM › Llamadas y el menú de llamar de Chats, alineados con Leads.
 *
 * Se mide en Chromium, sobre el CSS del build y con los componentes de VERDAD.
 * Las cinco preguntas del encargo:
 *
 *   1. **Las columnas son las de Leads**: Contacto, Nombre, Duración, Fecha,
 *      Detalle, Resultado y Acciones. Sin «Tipo» ni «Estado», y el nombre en
 *      su PROPIA celda, no colgado bajo el número. El número, azul y a la
 *      izquierda.
 *   2. **Un solo tamaño de letra en toda la tabla** —pastillas incluidas—, el
 *      de Leads (`text-sm`, 14 px).
 *   3. **Acciones se ve SIEMPRE**, también con el menú lateral abierto: si
 *      falta sitio encogen Detalle y Resultado, y las columnas fijas no se
 *      cortan.
 *   4. **La ventana de Llamar tiene DOS botones en una fila**: «Llamar IA» a
 *      la izquierda y «Llamar» a la derecha. Sin «Cancelar».
 *   5. **El menú de llamar de Chats dice «Llamar IA»**, nace con su borde
 *      izquierdo en el del icono y no tapa el botón Macros.
 *
 * `MODO=roto` monta el «antes» (pinchado a un commit, ver el `.sh`) y AFIRMA
 * los fallos. Sin ese modo, lo verde de al lado no diría si se arregló la causa
 * o si el caso no se llega a ejercer.
 *
 * Se levanta con `scripts/banco-llamadas-como-leads.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
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
const HARNESS = join(AQUI, ".compilado", "harness-como-leads.js");

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;

/**
 * El hueco de verdad de la pantalla CON EL MENÚ LATERAL ABIERTO: la ventana
 * menos los 16 rem del menú y el relleno. Es el caso del encargo —«también con
 * el menú lateral abierto»— y el que cortaba Acciones.
 */
const HUECO = { 1440: 1160, 1280: 1000, 1024: 744, 390: 374 };
const ANCHURAS_DE_ESCRITORIO = [1440, 1280, 1024];

/** `text-sm`: el de la tabla de Leads (`components/ui/table.tsx`) y el de Chats. */
const TAMANO_DE_LEADS = 14;

const COLUMNAS = ["Contacto", "Nombre", "Duración", "Fecha", "Detalle", "Resultado", "Acciones"];

/*
 * La maqueta de la cabecera de Chats para el menú. Reproduce su geometría
 * —dos filas dentro de `data-cabecera-de-chat`: arriba los iconos con el botón
 * verde el primero del grupo de la derecha, abajo Macros y Resolver pegados al
 * borde derecho— con los anchos de los controles de verdad. El botón de llamar
 * y su menú SÍ son los de verdad.
 */
const CABECERA = `
<div data-cabecera-de-chat style="position:relative;width:900px;margin-left:420px;border-bottom:2px solid #ddd">
  <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;height:44px;padding:0 16px">
    <div id="menu"></div>
    ${'<span style="display:inline-block;width:28px;height:28px;background:#eee"></span>'.repeat(8)}
    <span style="display:inline-block;width:50px;height:32px;background:#eee"></span>
  </div>
  <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;height:36px;padding:0 16px">
    <span style="display:inline-block;width:28px;height:28px;background:#eee"></span>
    <button data-macros-de-chat style="width:88px;height:32px">Macros</button>
    <button style="width:120px;height:32px">Resolver</button>
  </div>
</div>`;

function levantar(conCabecera) {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8">` +
                    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS ?? ""} *{animation:none!important;transition:none!important}</style></head>` +
                    `<body style="margin:0">${conCabecera ? CABECERA : ""}<div id="hueco"><div id="pantalla"></div></div>` +
                    `<script type="module" src="/harness.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir(ancho, { tabla = true } = {}) {
    const server = await levantar(!tabla);
    const base = `http://127.0.0.1:${server.address().port}`;
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await (
        await navegador.newContext({ viewport: { width: ancho, height: 900 } })
    ).newPage();
    // Lo que no llega a pintarse mide cero y hace pasar cualquier comprobación.
    const reventones = [];
    page.on("pageerror", (e) => reventones.push(String(e)));
    await page.goto(base + "/", { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    if (tabla) {
        await page.evaluate((w) => {
            document.getElementById("hueco").style.width = w + "px";
        }, HUECO[ancho] ?? ancho);
        await page.evaluate(() => window.pintarTabla());
        await page.waitForSelector('[title="Abrir chat del contacto"]', { timeout: 20000 });
    } else {
        await page.evaluate(() => window.pintarMenu());
        await page.waitForSelector("[data-menu-llamada]", { timeout: 20000 });
    }
    assert.equal(reventones.join(" | "), "", `la pantalla reventó (MODO=${ROTO ? "roto" : "bueno"})`);
    return {
        page,
        async cerrar() {
            await navegador.close();
            server.close();
        },
    };
}

function faltaNavegador(t) {
    if (!chromium) {
        t.skip("sin playwright en este equipo");
        return true;
    }
    if (!CSS) {
        t.skip("sin el CSS del build: corre `npm run build` antes");
        return true;
    }
    return false;
}

/** Todo lo de la tabla, en una pasada. */
function medirLaTabla(page) {
    return page.evaluate(() => {
        const tabla = document.querySelector("table");
        const caja = tabla.parentElement; // el `overflow-x-auto`
        const cabeceras = [...tabla.querySelectorAll("thead th")].map((th) => th.innerText.trim());
        const fila = tabla.querySelector("tbody tr");
        const celdas = [...fila.children];
        const numero = fila.querySelector('[title="Abrir chat del contacto"]');
        const nombre = fila.querySelector('[title="Editar el nombre del contacto"]');
        const acciones = fila.querySelector('[aria-label="Acciones"]');

        const sonda = document.createElement("span");
        sonda.className = "text-blue-600";
        document.body.appendChild(sonda);
        const azulDeLeads = getComputedStyle(sonda).color;
        sonda.remove();

        // Todos los tamaños de letra de la tabla, PASTILLAS INCLUIDAS.
        const tamanos = new Set();
        for (const n of tabla.querySelectorAll("*")) {
            const propio = [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
            if (propio) tamanos.add(Math.round(parseFloat(getComputedStyle(n).fontSize)));
        }

        const rc = caja.getBoundingClientRect();
        const ra = acciones.getBoundingClientRect();
        const tdNum = numero.closest("td");
        const iFecha = cabeceras.indexOf("Fecha");
        const tdFecha = iFecha >= 0 ? celdas[iFecha] : null;
        return {
            cabeceras,
            columnaDelNumero: celdas.indexOf(tdNum),
            columnaDelNombre: nombre ? celdas.indexOf(nombre.closest("td")) : -1,
            nombreBajoElNumero: !!nombre && tdNum.contains(nombre),
            alineacion: getComputedStyle(tdNum).textAlign,
            colorDelNumero: getComputedStyle(numero).color,
            azulDeLeads,
            tamanos: [...tamanos].sort((a, b) => a - b),
            // Acciones: entera y dentro de lo que se ve de la tabla.
            accionesDentro: ra.left >= rc.left - 0.5 && ra.right <= rc.right + 0.5 && ra.width > 0,
            accionesDerecha: Math.round(ra.right),
            cajaDerecha: Math.round(rc.right),
            seDesplaza: caja.scrollWidth > caja.clientWidth + 1,
            // Las columnas fijas no recortan su contenido.
            numeroCortado: numero.scrollWidth > numero.clientWidth + 1,
            fechaCortada: tdFecha ? tdFecha.scrollWidth > tdFecha.clientWidth + 1 : null,
            paginaDesborda:
                document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
    });
}

test("1. las columnas son las de Leads, y el nombre va en la suya", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1440);
    try {
        const m = await medirLaTabla(page);
        if (ROTO) {
            assert.ok(m.cabeceras.includes("Tipo"), "el antes ya no tenía la columna Tipo");
            assert.ok(m.cabeceras.includes("Estado"), "el antes ya no tenía la columna Estado");
            assert.ok(!m.cabeceras.includes("Nombre"), "el antes ya tenía columna Nombre");
            assert.ok(m.nombreBajoElNumero, "el antes no colgaba el nombre bajo el número");
            return;
        }
        assert.deepEqual(m.cabeceras, COLUMNAS, "las columnas y su orden");
        assert.equal(m.nombreBajoElNumero, false, "el nombre no puede ir bajo el número");
        assert.equal(m.columnaDelNumero, 0, "el número va en la columna Contacto");
        assert.equal(m.columnaDelNombre, 1, "el nombre va en su propia columna, al lado");
        assert.equal(m.alineacion, "left", "el número va a la izquierda");
        assert.equal(m.colorDelNumero, m.azulDeLeads, "el número es el azul de Leads");
    } finally {
        await cerrar();
    }
});

test("2. un solo tamaño de letra en toda la tabla, pastillas incluidas", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1440);
    try {
        const m = await medirLaTabla(page);
        if (ROTO) {
            assert.ok(m.tamanos.length > 1, `el antes ya tenía un solo tamaño: ${m.tamanos}`);
            return;
        }
        assert.deepEqual(m.tamanos, [TAMANO_DE_LEADS], `la tabla mezcla tamaños: ${m.tamanos}`);
    } finally {
        await cerrar();
    }
});

test("3. Acciones se ve siempre con el menú lateral abierto", async (t) => {
    if (faltaNavegador(t)) return;
    let cortadas = 0;
    for (const ancho of ANCHURAS_DE_ESCRITORIO) {
        const { page, cerrar } = await abrir(ancho);
        try {
            const m = await medirLaTabla(page);
            if (ROTO) {
                if (!m.accionesDentro) cortadas += 1;
                continue;
            }
            assert.ok(
                m.accionesDentro,
                `a ${ancho} Acciones se corta: acaba en ${m.accionesDerecha} y la tabla en ${m.cajaDerecha}`,
            );
            assert.equal(m.seDesplaza, false, `a ${ancho} la tabla se desplaza a lo ancho`);
            assert.equal(m.numeroCortado, false, `a ${ancho} el número se recorta`);
            assert.equal(m.fechaCortada, false, `a ${ancho} la fecha se recorta`);
            assert.equal(m.paginaDesborda, false, `a ${ancho} la página desborda`);
        } finally {
            await cerrar();
        }
    }
    if (ROTO) assert.ok(cortadas > 0, "el antes no cortaba Acciones en ninguna anchura");
});

test("3b. en un teléfono Acciones sigue a la vista aunque la tabla se desplace", async (t) => {
    if (faltaNavegador(t)) return;
    if (ROTO) return; // el antes ya falla en escritorio, que es el caso del encargo
    const { page, cerrar } = await abrir(390);
    try {
        const m = await medirLaTabla(page);
        assert.ok(m.accionesDentro, `a 390 Acciones no se ve (${m.accionesDerecha} / ${m.cajaDerecha})`);
        assert.equal(m.paginaDesborda, false, "a 390 la página desborda");
    } finally {
        await cerrar();
    }
});

/** Abre la ventana de Llamar y mide su pie. */
async function medirLaVentana(page) {
    await page.click('[data-boton="abrir-llamar"]');
    await page.waitForSelector('[data-dialogo="llamar"]', { timeout: 5000 });
    return page.evaluate(() => {
        const d = document.querySelector('[data-dialogo="llamar"]');
        const botones = [...d.querySelectorAll("button")]
            .filter((b) => b.innerText.trim())
            // La X de cerrar es de todos los diálogos: no es un botón del pie.
            .filter((b) => b.innerText.trim() !== "Close")
            .map((b) => {
                const r = b.getBoundingClientRect();
                return { texto: b.innerText.trim(), left: r.left, right: r.right, top: r.top };
            })
            .sort((a, b) => a.left - b.left);
        const rd = d.getBoundingClientRect();
        return { botones, dialogo: { left: rd.left, right: rd.right } };
    });
}

test("4. la ventana de Llamar: «Llamar IA» a la izquierda, «Llamar» a la derecha, sin Cancelar", async (t) => {
    if (faltaNavegador(t)) return;
    for (const ancho of [1440, 390]) {
        const { page, cerrar } = await abrir(ancho);
        try {
            const m = await medirLaVentana(page);
            const textos = m.botones.map((b) => b.texto);
            if (ROTO) {
                assert.ok(textos.includes("Cancelar"), `a ${ancho} el antes no tenía Cancelar`);
                assert.ok(textos.includes("Llamar con IA"), `a ${ancho} el antes ya decía «Llamar IA»`);
                continue;
            }
            assert.deepEqual(textos, ["Llamar IA", "Llamar"], `a ${ancho} los botones del pie`);
            const [ia, llamar] = m.botones;
            assert.ok(Math.abs(ia.top - llamar.top) <= 1, `a ${ancho} no van en la misma fila`);
            // Cada uno a su extremo del diálogo (el relleno es de 24 px).
            assert.ok(ia.left - m.dialogo.left <= 32, `a ${ancho} «Llamar IA» no va a la izquierda`);
            assert.ok(m.dialogo.right - llamar.right <= 32, `a ${ancho} «Llamar» no va a la derecha`);
        } finally {
            await cerrar();
        }
    }
});

test("5. el menú de Chats: «Llamar IA», colgado de su icono y sin tapar Macros", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1440, { tabla: false });
    try {
        await page.click("[data-menu-llamada]");
        await page.waitForSelector('[data-opcion="llamar-ia"]', { timeout: 5000 });
        const m = await page.evaluate(() => {
            const r = (n) => n.getBoundingClientRect();
            const icono = r(document.querySelector("[data-menu-llamada]"));
            const menu = r(document.querySelector('[role="menu"]'));
            const macros = r(document.querySelector("[data-macros-de-chat]"));
            const cabecera = r(document.querySelector("[data-cabecera-de-chat]"));
            const seCruzan =
                menu.left < macros.right && menu.right > macros.left &&
                menu.top < macros.bottom && menu.bottom > macros.top;
            return {
                opciones: [...document.querySelectorAll("[data-opcion]")].map((n) => n.textContent.trim()),
                izquierda: menu.left - icono.left,
                bajoLaCabecera: menu.top - cabecera.bottom,
                tapaMacros: seCruzan,
            };
        });
        if (ROTO) {
            assert.ok(m.tapaMacros, "el antes no tapaba Macros en la maqueta: el modo roto no ejerce nada");
            assert.deepEqual(m.opciones, ["Llamar", "Llamar con IA"]);
            return;
        }
        assert.deepEqual(m.opciones, ["Llamar", "Llamar IA"], "los rótulos del menú");
        assert.ok(Math.abs(m.izquierda) <= 1, `el menú no arranca en el borde izquierdo del icono (${m.izquierda} px)`);
        assert.ok(m.bajoLaCabecera >= -1, `el menú nace dentro de la cabecera (${m.bajoLaCabecera} px)`);
        assert.equal(m.tapaMacros, false, "el menú tapa el botón Macros");
    } finally {
        await cerrar();
    }
});
