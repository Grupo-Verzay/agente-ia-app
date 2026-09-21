/**
 * Toda pantalla de fuera de `(root)` declara su propio contenedor que se
 * desplaza — o está exenta con su motivo escrito al lado.
 *
 * # Por qué hace falta un banco, y no basta con haberlo arreglado
 *
 * El `<body>` de la App va con **`overflow-hidden`** (`app/layout.tsx`). Eso
 * está puesto para el armazón autenticado, que se fija a `100dvh` y se
 * desplaza por dentro, así que para él no cambia nada. Pero el `overflow` del
 * `body` **se propaga al viewport** cuando el `<html>` lo tiene en `visible`,
 * que es el caso: el documento entero deja de poder desplazarse, y con él
 * **cualquier página que no viva dentro de `(root)`**.
 *
 * O sea: una pantalla pública nace rota **sin que nadie la toque**, por una
 * clase escrita en otro fichero. `(public)` se había puesto su contenedor
 * hace tiempo; `/t/`, `bookings`, `schedule` y `(auth)` no, y en `/t/` —el
 * formulario de tickets que abre un cliente final por el enlace compartido—
 * eso dejaba **el botón de enviar fuera de alcance**, en escritorio y en
 * móvil.
 *
 * Y por eso pasó desapercibido tanto tiempo: `overflow: hidden` **no es
 * `clip`**. Recorta, pero deja desplazar por código, así que un
 * `scrollIntoView` o el traído automático del campo que recibe el foco siguen
 * funcionando — **tabulando con el teclado se llega al botón y con la rueda o
 * el dedo no**.
 *
 * Así que el banco barre: lo que no declara su contenedor y no está exento,
 * lo caza. La mitad que se mide de verdad —que con la rueda se llega al
 * botón— va en Chromium, `scripts/medir-scroll-publico.mjs`.
 *
 * Correr:  node --test lib/__tests__/pantallas-publicas-se-desplazan.test.mjs
 *          MODO=roto node --test lib/__tests__/pantallas-publicas-se-desplazan.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const APP = path.join(RAIZ, "app");
const ROTO = process.env.MODO === "roto";

/** La marca: importar la medida compartida ES declarar el contenedor. */
const LA_MARCA = "PANTALLA_PUBLICA_QUE_SE_DESPLAZA";

/**
 * Las exentas, **con su motivo escrito al lado**. Sin el motivo no se puede
 * saber después si la exención sigue valiendo, así que el banco exige que
 * esté: una lista de rutas a secas es una lista que crece sola.
 */
const EXENTAS = {
    "app/reunion/[codigo]/page.tsx":
        "una reunión ocupa la pantalla entera a propósito (h-[100dvh] overflow-hidden): " +
        "la rejilla de video se reparte el alto y no hay nada que desplazar.",
    "app/abrir/page.tsx":
        "es un redirect del servidor: no pinta ni un nodo, así que no hay nada que desplazar.",
    "app/layout.tsx":
        "es el layout raíz, el que pone el `overflow-hidden` del que va toda esta regla.",
};

const leer = (f) => readFileSync(f, "utf8");
const relativo = (f) => path.relative(RAIZ, f).split(path.sep).join("/");

/** Todos los `page.tsx` y `layout.tsx` de `app/`, menos los de `(root)`. */
function pantallasDeFuera(dir = APP, encontradas = []) {
    for (const nombre of readdirSync(dir)) {
        const completo = path.join(dir, nombre);
        if (statSync(completo).isDirectory()) {
            if (nombre === "(root)" || nombre === "api") continue;
            pantallasDeFuera(completo, encontradas);
        } else if (nombre === "page.tsx" || nombre === "layout.tsx") {
            encontradas.push(completo);
        }
    }
    return encontradas;
}

/**
 * Quién cubre a una página: ella misma, o cualquier `layout.tsx` por encima
 * —sin contar el raíz, que es justamente el que la rompe—.
 *
 * En modo roto se finge que la marca no está puesta en ninguna parte, que es
 * como estaba el repositorio antes de esto: sirve para comprobar que el
 * barrido de verdad la caza, y no que pasa por no llegar a mirar.
 */
function quienLaCubre(fichero, fingirSinArreglo) {
    let dir = path.dirname(fichero);
    const candidatos = [fichero];
    while (dir !== APP) {
        candidatos.push(path.join(dir, "layout.tsx"));
        dir = path.dirname(dir);
    }
    for (const c of candidatos) {
        let texto;
        try {
            texto = leer(c);
        } catch {
            continue; // ese nivel no tiene layout
        }
        if (fingirSinArreglo) texto = texto.split(LA_MARCA).join("SIN_ARREGLO");
        if (texto.includes(LA_MARCA)) return relativo(c);
    }
    return null;
}

test("la premisa sigue en pie: el `<body>` va con `overflow-hidden`", () => {
    const raiz = leer(path.join(APP, "layout.tsx"));
    const body = raiz.match(/<body[^>]*>/s);
    assert.ok(body, "no se encontró el `<body>` de `app/layout.tsx`");
    assert.ok(
        body[0].includes("overflow-hidden"),
        "El `<body>` ya no lleva `overflow-hidden`. Esta regla entera cuelga de " +
            "esa clase: si de verdad se quitó, hay que volver a `lib/pantalla-publica.ts` " +
            "y decidir si los contenedores de las públicas siguen haciendo falta — " +
            "no dejarlos puestos sin motivo escrito.",
    );
});

test("ninguna pantalla de fuera de `(root)` nace sin poder desplazarse", () => {
    const sinCubrir = [];
    for (const fichero of pantallasDeFuera()) {
        const rel = relativo(fichero);
        if (rel in EXENTAS) continue;
        if (!quienLaCubre(fichero, ROTO)) sinCubrir.push(rel);
    }

    if (ROTO) {
        // Con la marca fingida fuera, el barrido tiene que cazarlas TODAS: si
        // aquí saliera vacío, lo verde del modo normal no probaría nada.
        assert.ok(
            sinCubrir.length >= 6,
            `el barrido no caza el fallo: solo vio ${sinCubrir.length} pantallas sin contenedor`,
        );
        for (const esperada of [
            "app/t/[codigo]/page.tsx",
            "app/bookings/[userId]/page.tsx",
            "app/schedule/[userId]/page.tsx",
            "app/(auth)/login/page.tsx",
        ]) {
            assert.ok(
                sinCubrir.includes(esperada),
                `el barrido no vio ${esperada}, que es una de las que estaban rotas`,
            );
        }
        return;
    }

    assert.deepEqual(
        sinCubrir,
        [],
        "Estas pantallas viven fuera de `(root)` y no declaran su contenedor que se " +
            "desplaza, así que heredan el `overflow-hidden` del `<body>` y nacen sin " +
            "poder desplazarse:\n  · " +
            sinCubrir.join("\n  · ") +
            "\nSe arregla importando `PANTALLA_PUBLICA_QUE_SE_DESPLAZA` de " +
            "`lib/pantalla-publica.ts`, o añadiéndolas a EXENTAS con su motivo.",
    );
});

test("una exención sin motivo escrito no se cuela", () => {
    for (const [ruta, motivo] of Object.entries(EXENTAS)) {
        assert.ok(
            typeof motivo === "string" && motivo.trim().length > 20,
            `la exención de ${ruta} no explica por qué`,
        );
    }
});

test("la medida es de alto FIJO y en `dvh`, que es lo único que funciona", () => {
    const modulo = leer(path.join(RAIZ, "lib", "pantalla-publica.ts"));
    const valor = modulo.match(
        new RegExp(`${LA_MARCA}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`),
    );
    assert.ok(valor, "no se encontró el valor de la medida");
    const clases = valor[1].split(/\s+/);

    // Con `min-h-*` el elemento crece con su contenido, así que su propio
    // `overflow` no se dispara nunca y se vuelve exactamente al mismo sitio.
    assert.ok(
        !clases.some((c) => c.startsWith("min-h-")),
        "el alto tiene que ser FIJO: con `min-h-*` el contenedor crece y no desplaza nada",
    );
    assert.ok(
        clases.includes("h-[100dvh]"),
        "el alto es `h-[100dvh]`: con `vh` la barra del navegador de un móvil deja " +
            "el final del contenido debajo de ella",
    );
    assert.ok(
        clases.includes("overflow-y-auto"),
        "sin `overflow-y-auto` el contenedor recorta y no desplaza",
    );
});

test("el centrado del login no puede colgar de un alto FIJO", () => {
    const modulo = leer(path.join(RAIZ, "lib", "pantalla-publica.ts"));
    const valor = modulo.match(
        /CENTRADO_QUE_NO_SE_CORTA\s*=\s*["'`]([^"'`]+)["'`]/,
    );
    assert.ok(valor, "no se encontró el centrado");
    const clases = valor[1].split(/\s+/);
    // Medido en Chromium: con `flex h-full items-center` y 1.400 px de
    // contenido el principio del formulario arranca en **−337 px**, o sea
    // fuera de alcance. Lo que corta es el alto FIJO, no `screen` frente a
    // `full`; con `min-h-*` la caja crece con su contenido y nunca corta.
    assert.ok(
        !clases.some((c) => /^h-/.test(c)),
        "el centrado no puede llevar alto fijo: con él, un formulario más alto que " +
            "la ventana se sale por arriba y no se alcanza",
    );
    assert.ok(
        clases.includes("min-h-full"),
        "el centrado llena el CONTENEDOR que se desplaza (`min-h-full`), no la ventana",
    );
});
