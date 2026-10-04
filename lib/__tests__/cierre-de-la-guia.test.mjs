/**
 * El banco de la cuadrícula SIMÉTRICA de una guía pública y del orden del
 * índice (vídeo → introducción → secciones), sin navegador.
 *
 * - La regla de cierre (`lib/cierre-de-la-guia.ts`) se ejerce para 0..30
 *   secciones en las tres anchuras: toda fila queda llena, siempre hay un
 *   «Contáctanos», y los casos del encargo dan exactamente lo pedido.
 * - Las clases que salen de ahí dicen lo mismo que la regla (se reconstruye el
 *   ancho de cada tarjeta leyendo sus clases, como lo haría el CSS).
 * - La introducción: vacío es el texto del código, lo largo se rechaza.
 *
 * `MODO=roto` lee el índice de ANTES_REF y afirma el fallo: la introducción
 * antes del vídeo, y ninguna tarjeta de cierre.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "153f64f";
const leer = (rel) =>
    ROTO
        ? execSync(`git show ${ANTES}:${rel}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString()
        : readFileSync(path.join(RAIZ, rel), "utf8");

const posicion = (texto, aguja) => {
    const i = texto.indexOf(aguja);
    return i < 0 ? Infinity : i;
};

if (ROTO) {
    test("ANTES: la introducción iba antes del vídeo y no había tarjetas de cierre", () => {
        const p = leer("app/guia/leads/page.tsx");
        assert.ok(posicion(p, "Guía del módulo") < posicion(p, "data-video-de-la-guia"), "la introducción ya iba detrás del vídeo");
        assert.ok(!/cierre|Contáctanos/.test(p + leer("components/guia/Guia.tsx")), "ya había tarjetas de cierre");
        assert.ok(!/introduccion/i.test(p), "la introducción ya era editable");
    });
} else {
    const cierre = await import(path.join(RAIZ, "lib/__tests__/.compilado/cierre-de-la-guia/cierre.mjs"));
    const intro = await import(path.join(RAIZ, "lib/__tests__/.compilado/cierre-de-la-guia/intro.mjs"));

    test("los casos del encargo, anchura por anchura", () => {
        const { elCierre } = cierre;
        // 1 hueco → contáctanos
        assert.deepEqual(elCierre(5, 3), [{ tipo: "contacto", ocupa: 1 }]);
        assert.deepEqual(elCierre(7, 2), [{ tipo: "contacto", ocupa: 1 }]);
        // 2 huecos → contáctanos + vídeo, uno en cada
        assert.deepEqual(elCierre(7, 3), [{ tipo: "contacto", ocupa: 1 }, { tipo: "video", ocupa: 1 }]);
        // 0 huecos → contáctanos a todo el ancho, en fila nueva
        assert.deepEqual(elCierre(6, 3), [{ tipo: "contacto", ocupa: 3 }]);
        assert.deepEqual(elCierre(6, 2), [{ tipo: "contacto", ocupa: 2 }]);
        // móvil: siempre una tarjeta más
        for (const n of [0, 1, 6, 7]) assert.deepEqual(elCierre(n, 1), [{ tipo: "contacto", ocupa: 1 }]);
    });

    const leerAncho = (clases, prefijo, columnas) => {
        // Lo que el CSS haría: la última regla con ese prefijo gana; sin ella, hereda.
        const t = clases.split(/\s+/);
        const oculto = (p) => t.includes(p ? `${p}:hidden` : "hidden") && !t.includes(p ? `${p}:flex` : "flex");
        const span = (p) => {
            const m = t.find((c) => c.startsWith(p ? `${p}:col-span-` : "col-span-"));
            return m ? Number(m.split("col-span-")[1]) : null;
        };
        if (prefijo === "") return oculto("") ? 0 : span("") ?? 1;
        if (prefijo === "sm") return oculto("sm") || (oculto("") && !t.includes("sm:flex")) ? 0 : span("sm") ?? span("") ?? 1;
        const vis = t.includes("lg:flex") ? true : t.includes("lg:hidden") ? false : leerAncho(clases, "sm", columnas) > 0;
        return vis ? span("lg") ?? span("sm") ?? span("") ?? 1 : 0;
    };

    test("para 0..30 secciones toda fila queda LLENA en las tres anchuras, y las clases dicen lo mismo", () => {
        for (let n = 0; n <= 30; n += 1) {
            assert.ok(cierre.lasFilasQuedanLlenas(n), `${n} secciones: una fila queda a medias`);
            const c = cierre.lasClasesDelCierre(n);
            for (const [prefijo, cols] of [["", 1], ["sm", 2], ["lg", 3]]) {
                const celdas = n + leerAncho(c.contacto, prefijo, cols) + (c.video ? leerAncho(c.video, prefijo, cols) : 0);
                assert.equal(celdas % cols, 0, `${n} secciones a ${cols} columnas: las clases dejan ${celdas} celdas`);
                assert.ok(leerAncho(c.contacto, prefijo, cols) >= 1, `${n}/${cols}: siempre hay Contáctanos`);
            }
        }
    });

    test("sin «Contáctanos» (la guía dentro de una propuesta) el vídeo llena el hueco, nunca queda uno", () => {
        const { elCierre, losHuecos } = cierre;
        const sin = { conContacto: false };
        // Los casos que en la guía normal llevan contacto: aquí los cubre el vídeo.
        assert.deepEqual(elCierre(5, 3, sin), [{ tipo: "video", ocupa: 1 }]);
        assert.deepEqual(elCierre(7, 3, sin), [{ tipo: "video", ocupa: 2 }]);
        assert.deepEqual(elCierre(6, 3, sin), [{ tipo: "video", ocupa: 3 }]);
        assert.deepEqual(elCierre(7, 2, sin), [{ tipo: "video", ocupa: 1 }]);
        for (const n of [0, 1, 6, 7]) assert.deepEqual(elCierre(n, 1, sin), [{ tipo: "video", ocupa: 1 }]);
        for (let n = 0; n <= 30; n += 1) {
            assert.ok(cierre.lasFilasQuedanLlenas(n, sin), `${n} secciones sin contacto: una fila queda a medias`);
            const c = cierre.lasClasesDelCierre(n, sin);
            assert.equal(c.contacto, null, `${n}: sin salidas no se pinta «Contáctanos»`);
            for (const [prefijo, cols] of [["", 1], ["sm", 2], ["lg", 3]]) {
                const ancho = leerAncho(c.video, prefijo, cols);
                assert.ok(ancho >= 1, `${n}/${cols}: el vídeo tiene que estar`);
                assert.equal((n + ancho) % cols, 0, `${n} secciones a ${cols} columnas sin contacto: quedan ${(n + ancho) % cols} huecos`);
                if (cols > 1) assert.equal(ancho, losHuecos(n, cols) || cols, `${n}/${cols}: el vídeo ocupa lo que dejaba el contacto`);
            }
        }
        // Y la guía normal no cambia: sin opciones es la de siempre.
        assert.deepEqual(elCierre(7, 3), [{ tipo: "contacto", ocupa: 1 }, { tipo: "video", ocupa: 1 }]);
        assert.ok(typeof cierre.lasClasesDelCierre(7).contacto === "string");
    });

    test("la introducción: vacío es el texto del código, lo largo se rechaza, párrafos por línea en blanco", () => {
        const def = { titulo: "Leads", subtitulo: "Sub", descripcion: "Desc" };
        assert.deepEqual(intro.laIntroduccionQueSeEnsena(null, def), def);
        assert.deepEqual(intro.laIntroduccionQueSeEnsena({ titulo: "  ", subtitulo: "Otro", descripcion: "" }, def), { ...def, subtitulo: "Otro" });
        assert.equal(intro.comoIntroduccion({ titulo: "x".repeat(81) }).ok, false);
        const ok = intro.comoIntroduccion({ titulo: "  Hola\n mundo ", descripcion: "a\r\nb\n\nc" });
        assert.deepEqual(ok, { ok: true, valor: { titulo: "Hola mundo", subtitulo: "", descripcion: "a\nb\n\nc" } });
        assert.deepEqual(intro.losParrafos("a\nb\n\n  c  "), ["a b", "c"]);
        assert.equal(intro.esModuloConGuia("leads"), true);
        assert.equal(intro.esModuloConGuia("catalogo"), true);
        assert.equal(intro.esModuloConGuia("../x"), false);
        // Cada guía se nombra como su menú, y lo que no se reconoce se enseña tal cual.
        assert.equal(intro.elNombreDeLaGuia("catalogo"), "Catálogo");
        assert.equal(intro.elNombreDeLaGuia("leads"), "Leads");
        assert.equal(intro.elNombreDeLaGuia("otra"), "otra");
    });

    test("el índice va en este orden: vídeo, introducción, secciones — en TODAS las guías", () => {
        for (const modulo of intro.MODULOS_CON_GUIA) {
            const p = leer(`app/guia/${modulo}/page.tsx`);
            const v = posicion(p, "data-video-de-la-guia");
            const i = posicion(p, "<IntroduccionDeLaGuia");
            const s = posicion(p, "<CuadriculaDeSecciones");
            assert.ok(v < i && i < s, `${modulo}: orden: vídeo ${v}, introducción ${i}, secciones ${s}`);
        }
    });

    test("la edición es de la CASA, y la puerta está en la acción", () => {
        const a = leer("actions/guia-introduccion-actions.ts");
        assert.equal((a.match(/quienMandaEnLaCasa\(/g) ?? []).length, 2, "las dos acciones pasan por la puerta de la casa");
        assert.match(a, /revalidatePath\(`\/guia\/\$\{modulo\}`\)/);
        assert.match(leer("app/(root)/documentation/guide/page.tsx"), /EditarIntroduccionDeLaGuia/);
    });
}
