/**
 * Mide la caja de escribir de Chats en Chromium, sobre el CSS del build.
 *
 * Lo que contesta, y no se puede contestar leyendo el código: **cuántos
 * renglones caben de verdad**, que depende del interlineado que le toque a esa
 * pantalla y no del número de píxeles que haya escrito en el tope.
 *
 * Dos cuidados que ya costaron una vuelta en otras medidas de este repositorio:
 *
 *   1. **Las clases se LEEN del componente** y se pasan por el mismo
 *      `tailwind-merge` que usa `cn`. Copiadas a mano —o concatenadas sin
 *      resolver— se estaría midiendo una caja que React no pinta.
 *   2. **El «antes» y el «ahora» se miden con la MISMA hoja**, la del build de
 *      ahora: las dos fórmulas se ejecutan sobre el mismo nodo, así que lo que
 *      cambia entre las dos columnas es la fórmula y nada más.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RAIZ = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    console.log("sin playwright en este equipo: no se mide");
    process.exit(0);
}
const { twMerge } = require("tailwind-merge");

/* ─── Las clases, leídas del componente ─── */

const FUENTE = path.join(RAIZ, "app/(root)/chats/_components/ChatInputBar.tsx");
const fuente = fs.readFileSync(FUENTE, "utf8");
const desde = fuente.indexOf("<Textarea");
if (desde < 0) throw new Error("no se encontró el <Textarea> de la barra de escribir");
const bloque = fuente.slice(fuente.indexOf("className={cn(", desde), fuente.indexOf("/>", desde));

const ternarios = [
    ...bloque.matchAll(/(\w+)\s*\n?\s*\?\s*\n?\s*'([^']*)'\s*\n?\s*:\s*\n?\s*'([^']*)'/g),
];
const porBandera = Object.fromEntries(ternarios.map((t) => [t[1], { si: t[2], no: t[3] }]));
if (!porBandera.isCompactToolbar || !porBandera.noteMode) {
    throw new Error(
        "el <Textarea> cambió de forma: no se reconocen sus ternarios " +
            `(${ternarios.map((t) => t[1]).join(", ") || "ninguno"})`,
    );
}

const deTernario = new Set(ternarios.flatMap((t) => [t[2], t[3]]));
const sueltas = [...bloque.matchAll(/'([^']*)'/g)].map((m) => m[1]).filter((c) => !deTernario.has(c));

/** Lo que React pinta en el caso normal (no es nota interna). */
function clasesDeLaCaja(compacta) {
    return twMerge(
        [
            ...sueltas,
            compacta ? porBandera.isCompactToolbar.si : porBandera.isCompactToolbar.no,
            porBandera.noteMode.no,
        ].join(" "),
    );
}

/* ─── El CSS del build ─── */

const dirCss = path.join(RAIZ, ".next/static/css");
const css = fs
    .readdirSync(dirCss)
    .filter((f) => f.endsWith(".css"))
    .map((f) => fs.readFileSync(path.join(dirCss, f), "utf8"))
    .join("\n");

/* ─── Las dos fórmulas ─── */

const FORMULAS = {
    // Lo que había: un tope en píxeles, y el `scrollHeight` sin los bordes.
    antes: (el) => {
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 160) + "px";
    },
    // Lo de ahora, que es `lib/alto-de-la-caja-de-escribir.ts` en línea: el
    // tope en LÍNEAS y los bordes aparte.
    ahora: (el, lineas) => {
        const cs = getComputedStyle(el);
        const interlineado = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 20;
        const relleno = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const bordes = el.offsetHeight - el.clientHeight;
        el.style.height = "auto";
        const contenido = el.scrollHeight + bordes;
        el.style.height = Math.min(contenido, lineas * interlineado + relleno + bordes) + "px";
    },
};

/* ─── La medida ─── */

const CASOS = {
    "1 renglón": "Hola, ya te confirmo",
    "3 renglones": "uno\ndos\ntres",
    "12 renglones": Array.from({ length: 12 }, (_, i) => `renglón ${i + 1}`).join("\n"),
    vacío: "",
};

const navegador = await chromium.launch();
const filas = [];

for (const { ventana, columna, compacta } of [
    { ventana: 1440, columna: 760, compacta: false },
    { ventana: 1280, columna: 640, compacta: false },
    { ventana: 390, columna: 390, compacta: true },
]) {
    const pagina = await navegador.newPage({ viewport: { width: ventana, height: 900 } });
    await pagina.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>` +
            `<body style="margin:0"><div style="width:${columna}px">` +
            `<textarea id="caja" rows="1"></textarea></div></body></html>`,
    );
    await pagina.evaluate((cs) => {
        document.getElementById("caja").className = cs;
    }, clasesDeLaCaja(compacta));

    for (const [caso, texto] of Object.entries(CASOS)) {
        const fila = { ventana, caso };
        for (const modo of ["antes", "ahora"]) {
            const r = await pagina.evaluate(
                ({ texto, modo, formulas }) => {
                    const el = document.getElementById("caja");
                    el.value = texto;
                    if (!texto.trim()) {
                        el.style.height = "";
                    } else {
                        // eslint-disable-next-line no-new-func
                        new Function("el", "lineas", `(${formulas[modo]})(el, lineas)`)(el, 3);
                    }
                    const cs = getComputedStyle(el);
                    const relleno = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
                    const bordes = el.offsetHeight - el.clientHeight;
                    const alto = el.getBoundingClientRect().height;
                    return {
                        alto,
                        barra: el.scrollHeight > el.clientHeight + 1,
                        caben:
                            Math.round(
                                ((alto - relleno - bordes) / parseFloat(cs.lineHeight)) * 10,
                            ) / 10,
                    };
                },
                {
                    texto,
                    modo,
                    formulas: Object.fromEntries(
                        Object.entries(FORMULAS).map(([k, f]) => [k, f.toString()]),
                    ),
                },
            );
            fila[`${modo}`] = `${r.alto}px`;
            fila[`${modo}: caben`] = r.caben;
            fila[`${modo}: barra`] = r.barra ? "SÍ" : "no";
        }
        filas.push(fila);
    }
    await pagina.close();
}

await navegador.close();

console.log("clases (escritorio):", clasesDeLaCaja(false));
console.log("clases (móvil):", clasesDeLaCaja(true));
console.table(filas);

/* ─── Y lo medido se comprueba, que si no es una tabla bonita ─── */

const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
};

for (const f of filas) {
    const donde = `${f.ventana} · ${f.caso}`;
    if (f.caso === "12 renglones") {
        exigir(f["ahora: caben"] === 3, `${donde}: se ven ${f["ahora: caben"]} renglones, no 3`);
        exigir(f["ahora: barra"] === "SÍ", `${donde}: pasado el tope tiene que haber barra`);
    }
    if (f.caso === "3 renglones") {
        exigir(f["ahora: caben"] === 3, `${donde}: se ven ${f["ahora: caben"]} renglones, no 3`);
        exigir(f["ahora: barra"] === "no", `${donde}: con tres renglones no puede haber barra`);
    }
    if (f.caso === "1 renglón" || f.caso === "vacío") {
        exigir(f["ahora: barra"] === "no", `${donde}: una línea no puede traer barra`);
        exigir(f["ahora: caben"] <= 1.2, `${donde}: tiene que volver a una línea`);
    }
}

// Y que el «antes» de verdad reproduce lo reportado: si dejara de hacerlo, la
// tabla de arriba estaría comparando contra nada.
const movilLleno = filas.find((f) => f.ventana === 390 && f.caso === "12 renglones");
exigir(
    movilLleno["antes: caben"] > 5,
    `el modo viejo ya no reproduce el fallo (${movilLleno["antes: caben"]} renglones en un móvil)`,
);

if (fallos.length) {
    console.error("\nNO pasa:");
    for (const f of fallos) console.error(" ·", f);
    process.exit(1);
}
console.log("\nTres renglones en las tres anchuras, y barra solo a partir de ahí.");
