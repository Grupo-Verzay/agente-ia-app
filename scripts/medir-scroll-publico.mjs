/**
 * Mide en Chromium que una pantalla pública SE PUEDE DESPLAZAR — con la rueda,
 * que es como la usa una persona.
 *
 * # Sobre la página SERVIDA, no sobre una maqueta
 *
 * La primera versión de esto montaba un facsímil de la ficha con las clases
 * copiadas, y **salió más corto que la ficha de verdad**: cabía entero en las
 * cinco ventanas, así que la medida decía «llega» en las dos columnas y no
 * probaba nada. Es el mismo aviso que ya está escrito para la ficha pública de
 * tickets — se mide contra el build servido con `next start` y una base de usar
 * y tirar, que es lo que monta `scripts/banco-scroll-publico.sh`.
 *
 * Así que aquí no se inventa markup: se abre `/t/<codigo>` de verdad.
 *
 * # Y con la RUEDA, nunca con `scrollTop`
 *
 * Esto costó una vuelta al escribirlo: la primera medida forzaba
 * `el.scrollTop = 99999` y daba **«llega» también en la versión rota**.
 * `overflow: hidden` **no es `clip`**: recorta, pero deja desplazar **por
 * código**. Así que cualquier medida que empuje el scroll a mano está midiendo
 * justo lo único que seguía funcionando — y es la misma razón por la que el
 * fallo vivió tanto: tabulando con el teclado se llegaba al botón (el navegador
 * trae al foco a la vista, que también es programático) y con la rueda no.
 *
 * # El «antes» y el «ahora» son el MISMO documento
 *
 * La columna «antes» se obtiene quitándole al `<main>` las dos clases del
 * contenedor, sobre la página ya cargada. Mismo DOM, misma hoja, mismo
 * contenido: lo único que cambia entre las dos columnas es el arreglo.
 *
 * Correr:  scripts/banco-scroll-publico.sh   (levanta la base y el servidor)
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    console.log("sin playwright en este equipo: no se mide");
    process.exit(0);
}

const BASE = process.env.BASE || "http://localhost:3921";
const CODIGO = process.env.CODIGO || "CODIGO-DEL-BANCO";

const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

/** La medida compartida, leída de donde vive. */
function medida(nombre) {
    const s = leer("lib/pantalla-publica.ts");
    const m = s.match(new RegExp(`${nombre}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`));
    if (!m) throw new Error(`no se encontró ${nombre} en lib/pantalla-publica.ts`);
    return m[1];
}
const EL_CONTENEDOR = medida("PANTALLA_PUBLICA_QUE_SE_DESPLAZA");
const EL_CENTRADO = medida("CENTRADO_QUE_NO_SE_CORTA");

const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
};

/* ─── Rueda de verdad ─── */

async function bajarConLaRueda(pagina) {
    await pagina.mouse.move(200, 200);
    for (let i = 0; i < 15; i++) {
        await pagina.mouse.wheel(0, 1200);
        await pagina.waitForTimeout(20);
    }
    await pagina.waitForTimeout(150);
}

const elBoton = (pagina) =>
    pagina.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) =>
            x.textContent.includes("Enviar solicitud"),
        );
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return {
            dentro: r.top >= 0 && r.bottom <= window.innerHeight + 1,
            top: Math.round(r.top),
        };
    });

const VENTANAS = [
    // Las dos del reporte, y las anchuras de siempre de este repositorio.
    { ancho: 1319, alto: 726, nota: "el escritorio del reporte" },
    { ancho: 390, alto: 844, nota: "el móvil del reporte" },
    { ancho: 1440, alto: 900, nota: "" },
    { ancho: 1280, alto: 800, nota: "" },
    { ancho: 1024, alto: 768, nota: "" },
];

const navegador = await chromium.launch();

/* ─── A. La ficha pública de tickets, servida ─── */

const filas = [];
let ventanasQueLoEjercen = 0;

for (const v of VENTANAS) {
    const fila = { ventana: `${v.ancho}x${v.alto}`, nota: v.nota };
    let loEjerce = false;

    for (const modo of ["antes", "ahora"]) {
        const pagina = await navegador.newPage({
            viewport: { width: v.ancho, height: v.alto },
        });
        await pagina.goto(`${BASE}/t/${CODIGO}`, { waitUntil: "networkidle" });

        const main = await pagina.evaluate((contenedor) => {
            const m = document.querySelector("main");
            return {
                clases: m.className,
                loDeclara: contenedor.split(/\s+/).every((c) => m.classList.contains(c)),
                alto: m.scrollHeight,
                hueco: m.clientHeight,
            };
        }, EL_CONTENEDOR);

        exigir(
            main.loDeclara,
            `${fila.ventana}: el <main> de /t/ no declara el contenedor (${main.clases})`,
        );
        fila.contenido = `${main.alto} px`;

        // Lo que decide si esta ventana prueba algo NO es que el contenido
        // desborde —a 1280 sobran 24 px, que son el relleno de abajo y el
        // botón ya se veía—: es que **el botón quede fuera sin desplazar**.
        // Si ya cabía, las dos columnas dirán «LLEGA» y eso no significa nada.
        loEjerce = !(await elBoton(pagina))?.dentro;

        if (modo === "antes") {
            // Mismo documento, menos el arreglo: así el «antes» no se mide con
            // otro CSS ni con otro contenido.
            await pagina.evaluate((contenedor) => {
                document
                    .querySelector("main")
                    .classList.remove(...contenedor.split(/\s+/));
            }, EL_CONTENEDOR);
        }

        await bajarConLaRueda(pagina);
        const r = await elBoton(pagina);
        exigir(r, `${fila.ventana}: no se encontró el botón de enviar en /t/`);
        fila[modo] = r?.dentro ? "LLEGA" : "no llega";

        const anchoDesborda = await pagina.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        exigir(!anchoDesborda, `${fila.ventana} (${modo}): la página desborda a lo ancho`);
        await pagina.close();
    }

    fila["¿el botón queda fuera?"] = loEjerce ? "queda fuera" : "ya cabía";
    if (loEjerce) {
        ventanasQueLoEjercen++;
        exigir(
            fila.antes === "no llega",
            `${fila.ventana}: el modo viejo YA NO reproduce el fallo, así que el «ahora» no prueba nada`,
        );
        exigir(
            fila.ahora === "LLEGA",
            `${fila.ventana}: con la rueda no se llega al botón de enviar`,
        );
    }
    filas.push(fila);
}

exigir(
    ventanasQueLoEjercen >= 2,
    `el botón ya cabía en casi todas las ventanas (${ventanasQueLoEjercen} de ${VENTANAS.length} lo dejan fuera): ` +
        "esta medida ya no ejerce el fallo",
);

/* ─── B. La geometría del centrado, que es lo que rompe el login ─── */

const dirCss = path.join(RAIZ, ".next/static/css");
const css = fs
    .readdirSync(dirCss)
    .filter((f) => f.endsWith(".css"))
    .map((f) => fs.readFileSync(path.join(dirCss, f), "utf8"))
    .join("\n");

/**
 * Aquí el contenido SÍ es de encargo, y a propósito: lo que se mide no es la
 * altura de ningún formulario, es **la geometría de centrar dentro de un
 * contenedor que se desplaza** cuando el contenido no cabe. Se fuerza a que no
 * quepa —1.400 px, con `style` y no con una clase: una clase arbitraria que no
 * use ninguna pantalla **no existe en el CSS del build**, y ese fue el primer
 * intento: la caja medía 28 px y la medida no ejercía nada—.
 */
const paginaCentrada = (dentro) => `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><style>${css}</style></head>
<body class="overflow-hidden"><div class="${EL_CONTENEDOR}"><div class="${dentro}">
  <div style="height:1400px" class="w-full max-w-md rounded-xl border bg-card p-6">
    <p data-arriba class="text-lg font-semibold">Entrar</p>
  </div>
</div></div></body></html>`;

/**
 * El centrado que corta, medido y no razonado: **el de alto FIJO**. La primera
 * versión de esta medida señalaba a `min-h-screen` y el navegador la
 * desmintió — `min-h-screen` no corta ni con grid ni con flex; lo que corta es
 * `h-full`, porque entonces la caja no puede crecer y el centrado reparte el
 * sobrante arriba y abajo.
 */
const EL_CENTRADO_QUE_CORTA = "flex h-full items-center justify-center";

const filasCentrado = [];
for (const v of [VENTANAS[0], VENTANAS[1]]) {
    const pagina = await navegador.newPage({
        viewport: { width: v.ancho, height: v.alto },
    });
    const arribaDe = async (dentro) => {
        await pagina.setContent(paginaCentrada(dentro));
        return pagina.evaluate(() =>
            Math.round(document.querySelector("[data-arriba]").getBoundingClientRect().top),
        );
    };
    const conLaMala = await arribaDe(EL_CENTRADO_QUE_CORTA);
    const conLaBuena = await arribaDe(EL_CENTRADO);

    filasCentrado.push({
        ventana: `${v.ancho}x${v.alto}`,
        [`${EL_CENTRADO_QUE_CORTA}: arranca en`]: conLaMala,
        [`${EL_CENTRADO}: arranca en`]: conLaBuena,
    });
    exigir(
        conLaMala < 0,
        `${v.ancho}x${v.alto}: el centrado de alto fijo ya no corta por arriba; esta medida no prueba nada`,
    );
    exigir(conLaBuena >= 0, `${v.ancho}x${v.alto}: el centrado corta el principio del formulario`);
    await pagina.close();
}

await navegador.close();

console.log("contenedor:", EL_CONTENEDOR);
console.log("centrado  :", EL_CENTRADO);
console.log(`\n── /t/${CODIGO} servida, con la RUEDA ──`);
console.table(filas);
console.log("── la geometría del centrado (contenido de 1.400 px) ──");
console.table(filasCentrado);

if (fallos.length) {
    console.error("\nNO pasa:");
    for (const f of fallos) console.error(" ·", f);
    process.exit(1);
}
console.log("\nSe llega al botón de enviar donde la ficha no cabe, y el centrado no corta por arriba.");
