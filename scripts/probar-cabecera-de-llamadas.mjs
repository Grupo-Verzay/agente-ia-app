/**
 * CRM › Llamadas contra Leads, en Chromium y sobre las páginas SERVIDAS.
 *
 * Tres preguntas, las del encargo:
 *
 *   1. **Los encabezados son los de Leads**: mismo color, mismo grosor y mismo
 *      tamaño. Se comparan contra los de `/sessions` medidos en la MISMA
 *      sesión, no contra números escritos aquí: si mañana se afina el tema, el
 *      banco sigue comparando lo que de verdad hay que comparar.
 *   2. **El contenido va a la izquierda**, como en Leads: cada celda alinea a
 *      la izquierda y lo que lleva dentro arranca en su borde. Duración y
 *      Acciones van centradas a propósito, y quedan fuera de esta comprobación.
 *   3. **El ancho se reparte como en Leads**: la tabla llega a los bordes de
 *      su tarjeta, no queda un hueco grande entre Fecha y Detalle, y Acciones
 *      sigue entera a la vista.
 *
 * `MODO=roto` se corre contra el build de ANTES y AFIRMA los fallos: otro
 * tamaño de encabezado, Detalle y Resultado centrados, la tabla más estrecha
 * que su tarjeta y el hueco entre Fecha y Detalle.
 *
 * Se levanta con `scripts/banco-cabecera-de-llamadas.sh`.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3932";
const ROTO = process.env.MODO === "roto";
const VENTANAS = [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
];
/** Más que esto entre el final de la fecha y el principio de Detalle es «un hueco grande». */
const HUECO_MAXIMO = 48;

const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
};

async function entrar(contexto) {
    const p = await contexto.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2500);
    await p.fill('input[name="email"]', "jefe@banco.test");
    await p.fill('input[name="password"]', "banco1234");
    await p.click('button[type="submit"]');
    for (let i = 0; i < 120 && p.url().includes("/login"); i += 1) await p.waitForTimeout(500);
    if (p.url().includes("/login")) throw new Error("no se pudo entrar: la página sigue en /login");
    return p;
}

async function abrir(p, ruta) {
    await p.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("tbody tr td", { timeout: 60000 });
    await p.waitForTimeout(1500);
    // La «Guía rápida» sale sola la primera vez y tapa la tabla.
    for (let i = 0; i < 3; i += 1) {
        if (!(await p.$('[role="dialog"]'))) break;
        await p.keyboard.press("Escape");
        await p.waitForTimeout(300);
    }
}

/** Estilo del TEXTO de cada encabezado: el nodo que lleva el texto, no la celda. */
const medirCabeceras = () => {
    const t = document.querySelector("table");
    return [...t.querySelectorAll("thead th")].map((th) => {
        const conTexto =
            [...th.querySelectorAll("*")].find((e) =>
                [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()),
            ) ?? th;
        const s = getComputedStyle(conTexto);
        return { rotulo: th.innerText.trim(), color: s.color, grosor: s.fontWeight, tamano: s.fontSize };
    });
};

const medirTabla = () => {
    const t = document.querySelector("table");
    const tarjeta = t.closest(".rounded-lg, [class*='border']")?.getBoundingClientRect();
    const rt = t.getBoundingClientRect();
    const rotulos = [...t.querySelectorAll("thead th")].map((th) => th.innerText.trim());
    // Todas las filas: el hueco sale con un Detalle CORTO («Sin detalle»),
    // que con el texto centrado se queda en mitad de su columna.
    const porFila = [...t.querySelectorAll("tbody tr")].map((fila) => [...fila.querySelectorAll("td")].map((td, i) => {
        const r = td.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(td).paddingLeft);
        // Lo primero que se ve dentro: el primer elemento con caja.
        const hijo = [...td.querySelectorAll("*")].find((e) => e.getBoundingClientRect().width > 0);
        // El TEXTO que se ve, no su caja: un `<span>` en bloque mide la
        // columna entera aunque su texto vaya centrado en medio.
        const recorrido = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
        let texto = { left: r.left, right: r.left };
        for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
            if (!n.textContent.trim()) continue;
            const rango = document.createRange();
            rango.selectNodeContents(n);
            const rr = rango.getBoundingClientRect();
            if (rr.width > 0) {
                texto = rr;
                break;
            }
        }
        return {
            rotulo: rotulos[i],
            alineacion: getComputedStyle(td).textAlign,
            desdeElBorde: hijo ? Math.round(hijo.getBoundingClientRect().left - r.left - pad) : 0,
            textoIzq: Math.round(texto.left),
            textoDer: Math.round(texto.right),
        };
    }));
    const celdas = porFila.flat();
    const iFecha = rotulos.indexOf("Fecha");
    const iDetalle = rotulos.indexOf("Detalle");
    const hueco =
        iFecha < 0 || iDetalle < 0
            ? null
            : Math.max(...porFila.map((c) => c[iDetalle].textoIzq - c[iFecha].textoDer));
    const acciones = t.querySelector("tbody tr")?.querySelector('[aria-label="Acciones"]')?.getBoundingClientRect();
    return {
        tabla: Math.round(rt.width),
        tarjeta: tarjeta ? Math.round(tarjeta.width) : null,
        celdas,
        hueco,
        columnas: rotulos.length,
        accionesDentro: acciones ? acciones.right <= window.innerWidth && acciones.width > 0 : false,
        desborda: document.documentElement.scrollWidth > window.innerWidth,
    };
};

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const filas = [];
let rojosDelAntes = { cabecera: 0, alineacion: 0, ancho: 0, hueco: 0 };

for (const v of VENTANAS) {
    const contexto = await navegador.newContext({ viewport: v });
    const p = await entrar(contexto);

    await abrir(p, "/sessions");
    const deLeads = await p.evaluate(medirCabeceras);
    const leadsTabla = await p.evaluate(medirTabla);
    // Referencia: un encabezado que ordena (botón) y uno que no (texto suelto).
    const refBoton = deLeads.find((h) => h.rotulo === "Sesión");
    const refTexto = deLeads.find((h) => h.rotulo === "Acciones");
    exigir(refBoton && refTexto, `${v.width}: no se encontraron los encabezados de Leads`);

    await abrir(p, "/crm/llamadas");
    const deLlamadas = await p.evaluate(medirCabeceras);
    const m = await p.evaluate(medirTabla);

    // 1. Encabezados
    let cabeceraDistinta = 0;
    for (const h of deLlamadas) {
        const ref = h.rotulo === "Acciones" || h.rotulo === "Cuenta" ? refTexto : refBoton;
        for (const k of ["color", "grosor", "tamano"]) {
            if (ref && h[k] !== ref[k]) {
                cabeceraDistinta += 1;
                if (!ROTO) exigir(false, `${v.width}: «${h.rotulo}» ${k} ${h[k]} y en Leads ${ref[k]}`);
            }
        }
    }
    if (cabeceraDistinta) rojosDelAntes.cabecera += 1;

    // 2. Alineación: todo a la izquierda salvo Duración y Acciones, que van
    //    centradas (ver `banco-alineacion-de-llamadas.sh`).
    const CENTRADAS = ["Duración", "Acciones"];
    const centradas = m.celdas.filter(
        (c) => !CENTRADAS.includes(c.rotulo) && (!["left", "start"].includes(c.alineacion) || c.desdeElBorde > 2),
    );
    if (centradas.length) rojosDelAntes.alineacion += 1;
    if (!ROTO)
        exigir(
            centradas.length === 0,
            `${v.width}: celdas no alineadas a la izquierda: ${centradas.map((c) => `${c.rotulo}(${c.alineacion},+${c.desdeElBorde})`).join(", ")}`,
        );

    // 3. Ancho: a los bordes de la tarjeta como en Leads, sin hueco Fecha→Detalle
    const leadsHolgura = leadsTabla.tarjeta - leadsTabla.tabla;
    const holgura = m.tarjeta - m.tabla;
    if (holgura > leadsHolgura + 4) rojosDelAntes.ancho += 1;
    if (!ROTO)
        exigir(
            holgura <= leadsHolgura + 4,
            `${v.width}: la tabla deja ${holgura}px de su tarjeta y la de Leads ${leadsHolgura}px`,
        );
    const hueco = m.hueco;
    if (hueco > HUECO_MAXIMO) rojosDelAntes.hueco += 1;
    if (!ROTO) {
        exigir(hueco <= HUECO_MAXIMO, `${v.width}: hueco de ${hueco}px entre Fecha y Detalle`);
        exigir(m.accionesDentro, `${v.width}: Acciones no se ve entera`);
        exigir(!m.desborda, `${v.width}: la página se desplaza a lo ancho`);
    }

    filas.push({
        ventana: v.width,
        cabecera: `${deLlamadas[0]?.tamano}/${deLlamadas[0]?.grosor} vs Leads ${refBoton?.tamano}/${refBoton?.grosor}`,
        alineacion: m.celdas.slice(0, m.columnas).map((c) => c.alineacion[0]).join(""),
        tablaEnTarjeta: `${m.tabla}/${m.tarjeta} (Leads ${leadsTabla.tabla}/${leadsTabla.tarjeta})`,
        huecoFechaDetalle: hueco,
        acciones: m.accionesDentro ? "entera" : "CORTADA",
    });
    await contexto.close();
}
await navegador.close();

console.table(filas);

if (ROTO) {
    // El antes tiene que reproducir los cuatro fallos, o este modo no prueba nada.
    for (const [k, n] of Object.entries(rojosDelAntes)) {
        exigir(n > 0, `el antes no reproduce el fallo «${k}» en ninguna ventana`);
    }
}

if (fallos.length) {
    console.error(`\n✗ ${fallos.length} fallo(s) (MODO=${ROTO ? "roto" : "bueno"}):`);
    for (const f of fallos) console.error("  - " + f);
    process.exit(1);
}
console.log(`\n✓ MODO=${ROTO ? "roto: el antes reproduce los cuatro fallos" : "bueno"}`);
