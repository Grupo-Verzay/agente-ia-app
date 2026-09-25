/**
 * EL CUPO DE LLAMADAS SIMULTÁNEAS, del lado del navegador.
 *
 * El proveedor cuenta un cupo por línea y una llamada solo sale de esa cuenta
 * cuando alguien le pone el final. `CallDialog` tenía **una sola** puerta que
 * lo hiciera —`hangup`— y todos los demás finales se iban por `cleanup`, que
 * suelta el micrófono y la conexión de ESTE navegador y no le dice nada al
 * servidor. Así que cada final malo dejaba un sitio ocupado por una llamada
 * que ya no existe, y a la octava vez la tarjeta contestaba
 * «Límite de llamadas simultáneas alcanzado» sin que hubiera nadie hablando.
 *
 * # Por qué es un barrido y no una prueba de comportamiento
 *
 * El fallo no está en lo que `soltarElSitio` hace —eso es una línea— sino en
 * **cuántos sitios se olvidaron de llamarla**: eran cinco, y son justo los
 * caminos que nadie ejerce a mano porque son los finales raros (el audio que
 * no conecta, el micrófono denegado, cerrar la tarjeta mientras marca, la
 * recarga). Es la familia de *a una hermana se le pasa*, la misma del banco de
 * las guardas de las acciones: lo que hay que comprobar es que no quede
 * ninguna.
 *
 * `MODO=roto` lee el MISMO fichero del commit de antes (`ANTES_REF`) y afirma
 * el fallo. Sin ese modo, lo verde del otro no diría si se arregló la causa o
 * si el barrido no está mirando nada.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TARJETA = "app/(root)/chats/_components/CallDialog.tsx";

// El «antes» va PINCHADO a un commit y nunca a `origin/main`: el día que este
// cambio se fusione, `origin/main` pasa a ser el «después» y el modo roto se
// pondría verde sin ejercer nada, que es la peor forma de tener un banco.
const ANTES_REF = process.env.ANTES_REF || "0139530";
const ROTO = process.env.MODO === "roto";

function fuente() {
    if (!ROTO) return fs.readFileSync(path.join(RAIZ, TARJETA), "utf8");
    return execFileSync("git", ["show", `${ANTES_REF}:${TARJETA}`], { cwd: RAIZ, encoding: "utf8" });
}

const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Las líneas del cuerpo, sin comentarios, numeradas desde 1. */
function lineas() {
    return sinComentarios(fuente()).split("\n");
}

/** Las líneas que ocupa el cuerpo de `hangup`, que es la única puerta. */
function cuerpoDeHangup(ls) {
    const desde = ls.findIndex((l) => /const hangup = useCallback\(/.test(l));
    assert.ok(desde > 0, "no se encuentra `hangup`");
    const hasta = ls.findIndex((l, i) => i > desde && /^\s*\}, \[/.test(l));
    assert.ok(hasta > desde, "no se encuentra el final de `hangup`");
    return { desde, hasta };
}

/** La primera línea en que la llamada queda apuntada (y por tanto, soltable). */
function dondeSeApunta(ls, proveedor) {
    return ls.findIndex((l) => new RegExp(`callRef\\.current = \\{ provider: '${proveedor}'`).test(l));
}

test("la llamada se apunta ANTES del guardián de cancelación", () => {
    const ls = lineas();
    for (const proveedor of ["astra", "meta"]) {
        const apunte = dondeSeApunta(ls, proveedor);
        assert.ok(apunte > 0, `no se encuentra dónde se apunta la llamada de ${proveedor}`);
        // El guardián que sigue al apunte tiene que soltar; y sobre todo, no
        // puede haber un `return` pelado ENTRE crear la llamada y apuntarla.
        const crear = ls.findIndex((l) =>
            proveedor === "astra" ? /await startAstraCall\(/.test(l) : /await startMetaWhatsAppCall\(/.test(l));
        assert.ok(crear > 0 && crear < apunte, `el apunte de ${proveedor} tiene que ir después de crear la llamada`);
        const enMedio = ls.slice(crear, apunte).filter((l) => /if \(cancelledRef\.current\) return;/.test(l));
        assert.deepEqual(
            enMedio, [],
            `entre crear la llamada de ${proveedor} y apuntarla no puede haber un \`return\` pelado: ` +
            "la llamada ya existe en el servidor y nadie podría soltarla",
        );
    }
});

test("ningún guardián de cancelación abandona una llamada ya creada", () => {
    const ls = lineas();
    const primerApunte = Math.min(
        ...["astra", "meta"].map((p) => dondeSeApunta(ls, p)).filter((i) => i > 0),
    );
    const malos = [];
    ls.forEach((l, i) => {
        if (i <= primerApunte) return;
        if (!/cancelledRef\.current\)/.test(l)) return;
        if (/hangup\(\)/.test(l)) return;
        // Un `return` pelado con la llamada viva deja el sitio ocupado.
        if (/\breturn\b/.test(l)) malos.push(`${i + 1}: ${l.trim()}`);
    });
    assert.deepEqual(malos, [], "con la llamada ya creada, cancelar tiene que colgar: si no, el sitio se queda ocupado");
});

test("`cleanup` y `soltarElSitio` NO se llaman fuera de `hangup`", () => {
    const ls = lineas();
    // La invariante es exacta a propósito, sin vecindades ni proximidad: un
    // banco que mira «¿hay un soltarElSitio cerca?» se traga que falte
    // justamente el de este bloque, porque encuentra el del bloque de al lado.
    // Lo comprobado es más simple y no se puede ablandar: fuera del cuerpo de
    // `hangup` esas dos no se nombran.
    const cuerpo = cuerpoDeHangup(ls);
    const malos = [];
    ls.forEach((l, i) => {
        if (i >= cuerpo.desde && i <= cuerpo.hasta) return;
        if (/^\s*(cleanup|soltarElSitio)\(\);\s*$/.test(l)) malos.push(`${i + 1}: ${l.trim()}`);
        else if (/[^a-zA-Z](cleanup|soltarElSitio)\(\)/.test(l) && !/const (cleanup|soltarElSitio) =/.test(l)) {
            malos.push(`${i + 1}: ${l.trim()}`);
        }
    });
    assert.deepEqual(
        malos, [],
        "toda salida va por `hangup()`: con dos llamadas sueltas repartidas, olvidarse de una no se nota",
    );
});

test("desmontar suelta el sitio (es el camino de la recarga y de navegar fuera)", () => {
    const src = sinComentarios(fuente());
    const efecto = src.match(/useEffect\(\(\) => \(\) => \{?[^;]*;/);
    assert.ok(efecto, "no se encuentra el efecto de desmontaje");
    assert.match(
        efecto[0], /hangup/,
        "si la tarjeta desaparece con una llamada a medias, nadie más va a decirle al proveedor que acabó",
    );
});

test("soltarElSitio es estable: no puede depender de una prop", () => {
    if (ROTO) return; // en el «antes» no existía
    const src = sinComentarios(fuente());
    const decl = src.match(/const soltarElSitio = useCallback\(\(\) => \{[\s\S]*?\}, \[([^\]]*)\]\);/);
    assert.ok(decl, "no se encuentra `soltarElSitio`");
    assert.equal(
        decl[1].trim(), "",
        "corre al desmontar: con dependencias cambiaría de identidad y el efecto se dispararía en mitad de una llamada viva",
    );
});
