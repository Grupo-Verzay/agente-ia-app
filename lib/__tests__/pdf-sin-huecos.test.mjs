/**
 * El PDF de una conversación fluye SEGUIDO entre páginas: sin huecos grandes
 * al final de una hoja, sin partir un mensaje corto y, si uno largo se parte,
 * por sus líneas y con «continúa». Y la hoja queda simétrica.
 *
 * Se genera una conversación de verdad —mensajes de 1 a 80 líneas, en varios
 * días— y se LEE con pdf.js, que no es el nuestro: cada línea lleva una marca
 * única (`m12l3`) y así se sabe en qué página cayó cada una.
 *
 * `MODO=roto` corre lo mismo contra el generador de `ANTES_REF` y AFIRMA el
 * fallo: mensajes cortos mandados enteros a la hoja siguiente dejaban cientos
 * de puntos en blanco, y el pie no estaba donde manda el margen.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const require = createRequire(import.meta.url);
const pdfjs = require(join(RAIZ, "node_modules/pdfjs-dist/legacy/build/pdf.js"));
const pdf = await import(process.env.MODULO_DEL_PDF);

const ALTO = 841.89;
const ANCHO = 595.28;
const MARGEN = 32;
const RELLENO = 8;
const LIMITE_DE_ABAJO = MARGEN + 22; // MARGEN + ALTO_DEL_PIE
/**
 * El hueco más grande que se acepta al final de una hoja: el alto de un
 * mensaje CORTO (6 líneas, que no se parte) con su firma, su pie, su aire y
 * un separador de día delante.
 */
const HUECO_MAXIMO = 2 * RELLENO + 11 + 6 * 13 + 12 + 6 + 26;

const BASE = 1790000000;
/** Líneas de cada mensaje: cortos, medianos, largos y uno más alto que una hoja. */
const LARGOS = [1, 2, 12, 4, 25, 3, 8, 1, 40, 6, 15, 2, 5, 30, 1, 1, 9, 20, 3, 80, 2, 7, 33, 1, 4, 18, 6, 27, 2, 11, 5, 38, 1, 3, 22, 6];
const QUIENES = ["contacto", "ia", "asesor"];
const mensajes = LARGOS.map((n, i) => ({
    // un día nuevo cada 6 mensajes, para que haya separadores en cualquier sitio
    ts: BASE + Math.floor(i / 6) * 86400 + (i % 6) * 60,
    quien: QUIENES[i % 3],
    tipo: "conversation",
    texto: Array.from({ length: n }, (_, j) => `m${i}l${j} linea`).join("\n"),
}));

async function leer(bytes) {
    const doc = await pdfjs.getDocument({
        data: new Uint8Array(bytes),
        disableFontFace: true,
        useSystemFonts: false,
        standardFontDataUrl: join(RAIZ, "node_modules/pdfjs-dist/standard_fonts") + "/",
    }).promise;
    const paginas = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const tc = await (await doc.getPage(i)).getTextContent();
        paginas.push(tc.items.map((it) => ({ texto: it.str, x: it.transform[4], y: it.transform[5], ancho: it.width })));
    }
    return paginas;
}

const bytes = await pdf.conversacionEnPdf(
    { contacto: "Juan", linea: "VENTAS", mensajes },
    { exportadaEn: new Date(Date.UTC(2026, 8, 28, 15)), zonaHoraria: "America/Bogota", marca: { nombre: "Tienda El Sol", logo: null } },
);
const paginas = await leer(bytes);

const esLinea = (t) => /^m\d+l\d+ linea$/.test(t);
const esHora = (t) => /^\d{1,2}:\d{2}/.test(t);
const esPie = (t) => /Página \d+ de \d+/.test(t);
/** Dónde acaba lo último pintado en la hoja: el pie de la última burbuja. */
const fondoDe = (items) => Math.min(...items.filter((i) => esHora(i.texto) || i.texto === "continúa").map((i) => i.y)) - 5;
const huecos = paginas.slice(0, -1).map((items) => Math.round(fondoDe(items) - LIMITE_DE_ABAJO));
console.log(`# huecos al final de cada hoja (pt): ${huecos.join(", ")} · ${paginas.length} hojas`);

if (ROTO) {
    test("ANTES: un mensaje que no cabía pasaba ENTERO a la hoja siguiente y dejaba un hueco grande", () => {
        assert.equal(pdf.elCorteDeLaBurbuja, undefined, "no había regla de corte");
        const grande = Math.max(...huecos);
        assert.ok(grande > 250, `el hueco más grande era de ${grande} pt: ${huecos.join(", ")}`);
    });
    test("ANTES: el pie no estaba a MARGEN del borde, como el resto de la hoja", () => {
        const pies = paginas.flatMap((items) => items.filter((i) => esPie(i.texto)).map((i) => Math.round(i.y)));
        assert.ok(pies.every((y) => y !== MARGEN), `pies en ${pies.join(",")}`);
    });
} else {
    test("la regla del corte: corto entero, largo por líneas con 3 mínimas, y en hoja nueva nunca se salta", () => {
        const c = pdf.elCorteDeLaBurbuja;
        const fijo = 2 * RELLENO + 11 + 12;
        // cabe entero
        assert.deepEqual(c({ queda: 500, paginaVacia: false, altoFijo: fijo, lineas: 10 }), { saltarAntes: false, lineasAqui: 10 });
        // corto que no cabe: salta entero
        assert.deepEqual(c({ queda: 60, paginaVacia: false, altoFijo: fijo, lineas: 6 }), { saltarAntes: true, lineasAqui: 0 });
        // largo que no cabe: se parte, dejando 3 para después
        const p = c({ queda: 200, paginaVacia: false, altoFijo: fijo, lineas: 20 });
        assert.equal(p.saltarAntes, false);
        assert.equal(p.lineasAqui, Math.floor((200 - 6 - fijo) / 13));
        // cabrían 9 de 10: quedan 3 para la siguiente, no 1
        assert.equal(c({ queda: 6 + fijo + 9 * 13, paginaVacia: false, altoFijo: fijo, lineas: 10 }).lineasAqui, 7);
        // largo sin sitio ni para 3 líneas: salta
        assert.equal(c({ queda: fijo + 6 + 2 * 13, paginaVacia: false, altoFijo: fijo, lineas: 20 }).saltarAntes, true);
        // en una hoja vacía no se salta nunca
        assert.equal(c({ queda: 30, paginaVacia: true, altoFijo: fijo, lineas: 20 }).saltarAntes, false);
        assert.ok(c({ queda: 30, paginaVacia: true, altoFijo: fijo, lineas: 20 }).lineasAqui >= 1);
        assert.equal(pdf.LINEAS_PARA_PARTIR, 2 * pdf.LINEAS_MINIMAS_POR_TROZO + 1);
    });

    test("sin huecos grandes: ninguna hoja termina antes de lo que mide un mensaje corto", () => {
        assert.ok(paginas.length >= 4, `varias páginas (${paginas.length})`);
        for (const [i, h] of huecos.entries()) {
            assert.ok(h >= -1 && h <= HUECO_MAXIMO, `hoja ${i + 1}: queda un hueco de ${h} pt (máximo ${HUECO_MAXIMO}); todos: ${huecos.join(", ")}`);
        }
    });

    test("ninguna línea se pierde ni se parte, y un mensaje corto nunca se reparte entre dos hojas", () => {
        const dondeVa = new Map();
        paginas.forEach((items, p) =>
            items.filter((i) => esLinea(i.texto)).forEach((i) => {
                assert.ok(!dondeVa.has(i.texto), `${i.texto} sale dos veces`);
                dondeVa.set(i.texto, p);
            }),
        );
        LARGOS.forEach((n, m) => {
            const hojas = Array.from({ length: n }, (_, j) => dondeVa.get(`m${m}l${j} linea`));
            assert.ok(hojas.every((h) => h !== undefined), `al mensaje ${m} le falta una línea`);
            if (n < pdf.LINEAS_PARA_PARTIR) {
                assert.equal(new Set(hojas).size, 1, `el mensaje ${m} (${n} líneas) se partió: ${hojas}`);
            } else {
                // Cada trozo lleva al menos las líneas mínimas, y va en orden.
                const trozos = new Map();
                hojas.forEach((h) => trozos.set(h, (trozos.get(h) ?? 0) + 1));
                for (const [h, k] of trozos) {
                    const limite = h === hojas[0] || h === hojas.at(-1) ? pdf.LINEAS_MINIMAS_POR_TROZO : 1;
                    assert.ok(k >= limite, `mensaje ${m}: la hoja ${h + 1} lleva solo ${k} líneas`);
                }
                assert.deepEqual([...hojas].sort((a, b) => a - b), hojas, `mensaje ${m} en desorden`);
            }
        });
    });

    test("un mensaje partido dice «continúa» y la hora va solo en su último trozo", () => {
        const continuas = paginas.map((items) => items.filter((i) => i.texto === "continúa").length);
        const partidos = LARGOS.filter((n) => n >= pdf.LINEAS_PARA_PARTIR).length;
        assert.ok(continuas.reduce((a, b) => a + b, 0) >= 1, "algún mensaje largo se partió");
        assert.ok(continuas.every((k) => k <= 1), "a lo sumo un «continúa» por hoja: es el último mensaje de la hoja");
        // La hora total es una por mensaje, ni más ni menos.
        const horas = paginas.flat().filter((i) => esHora(i.texto)).length;
        assert.equal(horas, LARGOS.length);
        assert.ok(partidos > 0);
    });

    test("el separador de día nunca se queda solo al final de una hoja", () => {
        let total = 0;
        paginas.forEach((items, p) => {
            const lineas = items.filter((i) => esLinea(i.texto));
            const separadores = items.filter((i) => !esLinea(i.texto) && !esHora(i.texto) && !esPie(i.texto) && i.texto !== "continúa" && Math.abs(i.x + i.ancho / 2 - ANCHO / 2) < 2);
            total += separadores.length;
            for (const s of separadores) {
                assert.ok(lineas.some((l) => l.y < s.y), `hoja ${p + 1}: el separador «${s.texto}» no tiene mensaje debajo`);
            }
        });
        const dias = new Set(mensajes.map((m) => Math.floor((m.ts - BASE) / 86400))).size;
        assert.equal(total, dias, "un separador por día, ni más ni menos");
    });

    test("el separador va con su mensaje también cuando cae justo al final de la hoja", async () => {
        // Se va corriendo el cambio de día hasta que caiga en todas las alturas del final de la hoja.
        for (let k = 36; k <= 60; k++) {
            const lista = [
                ...Array.from({ length: k }, (_, i) => ({ ts: BASE + i * 60, quien: QUIENES[i % 3], tipo: "conversation", texto: `m${i}l0 linea` })),
                { ts: BASE + 86400, quien: "contacto", tipo: "conversation", texto: Array.from({ length: 5 }, (_, j) => `m${k}l${j} linea`).join("\n") },
            ];
            const hojas = await leer(
                await pdf.conversacionEnPdf(
                    { contacto: "Juan", mensajes: lista },
                    { exportadaEn: new Date(Date.UTC(2026, 8, 28, 15)), zonaHoraria: "America/Bogota", marca: { nombre: "Tienda", logo: null } },
                ),
            );
            // El separador del segundo día es el último rótulo centrado que no es el pie.
            const centrados = hojas.flatMap((items, p) =>
                items.filter((i) => !esLinea(i.texto) && !esHora(i.texto) && !esPie(i.texto) && Math.abs(i.x + i.ancho / 2 - ANCHO / 2) < 2).map(() => p),
            );
            const dondeSep = centrados.at(-1);
            const dondeMsg = hojas.findIndex((items) => items.some((i) => i.texto === `m${k}l0 linea`));
            assert.equal(dondeSep, dondeMsg, `con ${k} mensajes antes, el separador cayó en la hoja ${dondeSep + 1} y su mensaje en la ${dondeMsg + 1}`);
        }
    });

    test("simetría: márgenes iguales a los lados, arriba y hasta el pie", () => {
        const izquierdas = paginas.flat().filter((i) => esLinea(i.texto)).map((i) => i.x);
        assert.equal(Math.round(Math.min(...izquierdas)), MARGEN + RELLENO, "lo de la izquierda empieza a MARGEN + relleno");
        const horasDerecha = paginas.flat().filter((i) => esHora(i.texto) || i.texto === "continúa").map((i) => i.x + i.ancho);
        assert.ok(Math.abs(Math.max(...horasDerecha) - (ANCHO - MARGEN - RELLENO)) < 0.5, "lo de la derecha acaba a MARGEN + relleno del borde");
        for (const [p, items] of paginas.entries()) {
            const pie = items.find((i) => esPie(i.texto));
            assert.ok(pie, `hoja ${p + 1} sin pie`);
            assert.equal(Math.round(pie.y), MARGEN, `hoja ${p + 1}: el pie a MARGEN del borde de abajo`);
            assert.ok(Math.abs(pie.x + pie.ancho / 2 - ANCHO / 2) < 0.5, "el pie centrado");
            if (p > 0) {
                const arriba = Math.max(...items.filter((i) => !esPie(i.texto)).map((i) => i.y));
                // La primera fila escrita cae justo bajo MARGEN + relleno: nada de hueco arriba.
                assert.ok(arriba <= ALTO - MARGEN && arriba >= ALTO - MARGEN - RELLENO - 26 - 12, `hoja ${p + 1}: empieza en ${arriba}`);
            }
        }
    });
}
