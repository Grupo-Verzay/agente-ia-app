/**
 * El invariante que este banco protege, en una linea:
 *
 *   **En la duda NO se recorta**, y un area hermana no se confunde con otra.
 *
 * De donde sale: la ficha publica de tickets la llena alguien que no tiene
 * cuenta, y el numero que deja ahi es por donde se le avisa meses despues. Un
 * recorte de mas produce un numero **perfectamente creible** que le pertenece a
 * otra persona — la familia del «999999999 de -1 creditos» —, y no se nota
 * hasta que el aviso no llega.
 *
 * El caso que obliga a mirar el codigo de area: Republica Dominicana usa 809,
 * 829 y 849 sobre el mismo +1. Recortar «si empieza por el indicativo» no
 * distingue ninguno de los tres.
 *
 * `lib/telefono-de-pais.ts` no importa NADA, asi que basta transpilarlo:
 *
 *   npx tsc lib/telefono-de-pais.ts --outDir lib/__tests__/.compilado \
 *     --module esnext --target es2022 --moduleResolution bundler
 *
 * y correr:  node --test lib/__tests__/telefono-de-pais.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compilado = path.join(path.dirname(fileURLToPath(import.meta.url)), ".compilado");
const {
    armarElNumero,
    elIndicativoDeUnNumero,
    soloDigitos,
    LARGOS_NACIONALES,
} = await import(path.join(compilado, "telefono-de-pais.js"));

/** Los indicativos tal y como los ofrece el selector de paises. */
const INDICATIVOS = [
    "+1", "+1809", "+1829", "+1849", "+1876", "+1787", "+1939",
    "+34", "+52", "+55", "+57", "+58", "+51", "+507", "+593", "+7", "+44",
];

const armar = (indicativo, escrito) =>
    armarElNumero({ indicativo, escrito, indicativos: INDICATIVOS });

// ─────────────────────────────────────────────────────────────────────────────
// El caso que define la funcion: Republica Dominicana sobre el +1
// ─────────────────────────────────────────────────────────────────────────────

test("REPUBLICA DOMINICANA: las cuatro formas dan el MISMO numero", () => {
    const esperado = "18091234567";

    // Tal y como lo tendria guardado cada quien.
    assert.equal(armar("+1809", "18091234567").e164, esperado, "el numero entero");
    assert.equal(armar("+1809", "8091234567").e164, esperado, "sin el 1 de delante");
    assert.equal(armar("+1809", "1234567").e164, esperado, "el nacional pelado");
    assert.equal(armar("+1809", "+1 809 123 4567").e164, esperado, "con espacios y +");
});

test("y escribir un 829 con +1809 puesto CORRIGE el indicativo, no lo pega", () => {
    // Esto es lo que un recorte «por indicativo» no puede hacer: el area
    // escrita manda sobre la elegida, porque es la que identifica la linea.
    const res = armar("+1809", "8291234567");
    assert.equal(res.problema, null);
    assert.equal(res.indicativo, "+1829");
    assert.equal(res.e164, "18291234567");
    assert.equal(res.recortado, "829");

    // Y la tercera area, igual.
    assert.equal(armar("+1809", "18491234567").e164, "18491234567");
});

test("un 809 NO se lee como un nacional de diez digitos", () => {
    // Si se quitara solo el `1` quedaria `8091234567`, diez digitos, que en
    // Republica Dominicana no existe: son siete despues del area.
    const res = armar("+1809", "8091234567");
    assert.equal(res.recortado, "809");
    assert.equal(res.e164.length, 11);
});

// ─────────────────────────────────────────────────────────────────────────────
// Lo de todos los dias
// ─────────────────────────────────────────────────────────────────────────────

test("COLOMBIA: con indicativo y sin el dan lo mismo", () => {
    assert.equal(armar("+57", "3001234567").e164, "573001234567");
    assert.equal(armar("+57", "573001234567").e164, "573001234567");
    assert.equal(armar("+57", "+57 300 123 4567").e164, "573001234567");
});

test("un nacional que EMPIEZA por su propio indicativo no se recorta", () => {
    // `5712345678` son diez digitos, que es justo el nacional colombiano.
    // Recortando el `57` quedarian ocho, que no es un largo valido: por eso
    // gana leerlo tal cual. Es el caso que rompe un `startsWith` a secas.
    const res = armar("+57", "5712345678");
    assert.equal(res.recortado, null);
    assert.equal(res.e164, "575712345678");
});

test("ESTADOS UNIDOS: un nacional que empieza por 1 sobrevive", () => {
    assert.equal(armar("+1", "18005551234").e164, "18005551234");
    assert.equal(armar("+1", "8005551234").e164, "18005551234");
    // Diez digitos empezando por 1: quitarle el 1 dejaria nueve, que no vale.
    assert.equal(armar("+1", "1234567890").e164, "11234567890");
});

test("ESPANA y MEXICO, con y sin indicativo", () => {
    assert.equal(armar("+34", "612345678").e164, "34612345678");
    assert.equal(armar("+34", "34612345678").e164, "34612345678");
    assert.equal(armar("+52", "5512345678").e164, "525512345678");
    assert.equal(armar("+52", "525512345678").e164, "525512345678");
});

test("BRASIL admite diez y once, y las dos se recortan igual", () => {
    assert.equal(armar("+55", "1112345678").e164, "551112345678");
    assert.equal(armar("+55", "11912345678").e164, "5511912345678");
    assert.equal(armar("+55", "5511912345678").e164, "5511912345678");
});

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE NO PUEDE PASAR: recortar a ojo
// ─────────────────────────────────────────────────────────────────────────────

test("si no encaja ninguna longitud NO se inventa un numero", () => {
    // Le faltan digitos: recortar aqui daria un numero corto y creible.
    const corto = armar("+57", "30012");
    assert.equal(corto.e164, "");
    assert.ok(corto.problema);
    assert.match(corto.problema, /10 d/);

    // Y le sobran.
    const largo = armar("+57", "5757300123456789");
    assert.equal(largo.e164, "");
    assert.ok(largo.problema);
});

test("sin pais o sin numero se dice, no se arma nada", () => {
    assert.equal(armar("", "3001234567").e164, "");
    assert.ok(armar("", "3001234567").problema);
    assert.equal(armar("+57", "").e164, "");
    assert.ok(armar("+57", "   ").problema);
    assert.equal(armar("+57", "no soy un numero").e164, "");
});

test("un pais que no esta en la tabla NO se rechaza", () => {
    // Inventarle una longitud a un pais sin comprobar es rechazar a alguien que
    // si existe, y eso se ve como que la ficha no funciona.
    const res = armarElNumero({ indicativo: "+678", escrito: "1234567", indicativos: ["+678"] });
    assert.equal(res.problema, null);
    assert.equal(res.e164, "6781234567");
});

// ─────────────────────────────────────────────────────────────────────────────
// De que pais es un numero ya armado
// ─────────────────────────────────────────────────────────────────────────────

test("el indicativo de un numero es el MAS LARGO que encaja, no el primero", () => {
    // `18091234567` empieza por `+1` y por `+1809`. Quedarse con `+1` diria
    // «Estados Unidos» de un numero dominicano — la misma trampa que el
    // `.find(Boolean)` de las marcas de borrado.
    assert.equal(elIndicativoDeUnNumero("18091234567", INDICATIVOS), "+1809");
    assert.equal(elIndicativoDeUnNumero("18005551234", INDICATIVOS), "+1");
    assert.equal(elIndicativoDeUnNumero("573001234567", INDICATIVOS), "+57");
    assert.equal(elIndicativoDeUnNumero("", INDICATIVOS), null);
    assert.equal(elIndicativoDeUnNumero("12", INDICATIVOS), null);
});

test("el indicativo solo cuenta si lo que queda es un nacional plausible", () => {
    // `1234` empieza por `1` y por nada mas; cuatro digitos no son un nacional
    // de Estados Unidos, asi que no se le adjudica ese pais.
    assert.equal(elIndicativoDeUnNumero("1234", INDICATIVOS), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Las dos encadenadas, que es lo que ningun caso suelto prueba
// ─────────────────────────────────────────────────────────────────────────────

test("lo que se arma se reconoce despues como del MISMO pais", () => {
    // Sin esto, el numero se guardaria bien y la ficha siguiente arrancaria con
    // el pais equivocado prellenado.
    for (const [indicativo, escrito] of [
        ["+1809", "8091234567"],
        ["+1829", "1234567"],
        ["+57", "3001234567"],
        ["+52", "5512345678"],
        ["+34", "612345678"],
    ]) {
        const armado = armar(indicativo, escrito);
        assert.equal(armado.problema, null, `${indicativo} ${escrito}`);
        assert.equal(
            elIndicativoDeUnNumero(armado.e164, INDICATIVOS),
            armado.indicativo,
            `${indicativo} ${escrito} -> ${armado.e164}`,
        );
    }
});

test("armar dos veces lo ya armado no lo cambia", () => {
    // La ficha recuerda el numero en el navegador y lo vuelve a meter en el
    // campo: si una segunda pasada le pegara otro indicativo, cada envio
    // añadiria uno.
    const primera = armar("+1809", "8091234567");
    const segunda = armar(primera.indicativo, primera.e164);
    assert.equal(segunda.e164, primera.e164);

    const tercera = armar("+57", "3001234567");
    assert.equal(armar(tercera.indicativo, tercera.e164).e164, tercera.e164);
});

// ─────────────────────────────────────────────────────────────────────────────
// La tabla
// ─────────────────────────────────────────────────────────────────────────────

test("las tres areas dominicanas estan, y con siete digitos", () => {
    for (const area of ["1809", "1829", "1849"]) {
        assert.deepEqual(LARGOS_NACIONALES[area], [7], area);
    }
});

test("soloDigitos se queda con los digitos y nada mas", () => {
    assert.equal(soloDigitos("+57 (300) 123-45-67"), "573001234567");
    assert.equal(soloDigitos(null), "");
    assert.equal(soloDigitos(undefined), "");
});
