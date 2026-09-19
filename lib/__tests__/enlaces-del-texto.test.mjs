/**
 * El banco de los enlaces de una burbuja.
 *
 * Dos cosas se prueban aquí y las dos se ven igual de mal si fallan: **qué se
 * reconoce como enlace** —de menos, un enlace que no se puede pulsar; de más,
 * media frase convertida en enlace roto— y **qué cuenta como de dentro**, que
 * decide si algo navega dentro de la plataforma o abre una pestaña.
 *
 * La tercera, y la que de verdad no se puede ver mirando la pantalla: que el
 * orden sea enlaces primero y formato después. Una dirección con guiones bajos
 * pasada por el lector de marcas sale **sin ellos**, o sea llevando a otro
 * sitio, y eso en pantalla parece un enlace perfectamente normal.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
    apartarLasReuniones,
    elCodigoDeLaReunion,
    laRutaDeLaPlataforma,
    pareceLlevarEnlaces,
    partirPorEnlaces,
} from "./.compilado/enlaces-del-texto.js";
import { leerFormatoDeWhatsapp } from "./.compilado/formato-whatsapp.js";

const ORIGEN = "https://ia-app.com";

const soloEnlaces = (texto) =>
    partirPorEnlaces(texto).filter((p) => p.tipo === "enlace");

// ── Qué es un enlace ────────────────────────────────────────────────────────

test("se reconocen http, https y www", () => {
    assert.deepEqual(
        soloEnlaces("mira https://ia-app.com y http://x.com y www.y.com").map((p) => p.texto),
        ["https://ia-app.com", "http://x.com", "www.y.com"],
    );
});

test("a `www.` se le pone el esquema, o el navegador lo lee como ruta relativa", () => {
    const [e] = soloEnlaces("entra en www.ia-app.com");
    assert.equal(e.texto, "www.ia-app.com", "se LEE como se escribió");
    assert.equal(e.href, "https://www.ia-app.com", "y se ABRE con esquema");
});

test("un punto entre palabras NO es un enlace", () => {
    // De más es peor que de menos: media frase convertida en un enlace roto.
    for (const frase of [
        "llego a las 3.30pm",
        "la versión 2.0.rc1",
        "escríbeme a hola@verzay.com",
        "el fichero informe.pdf",
        "ia-app.com sin esquema no se reconoce",
    ]) {
        assert.deepEqual(soloEnlaces(frase), [], `no debería haber enlace en: ${frase}`);
    }
});

test("la puntuación de la frase se le devuelve al texto", () => {
    const partes = partirPorEnlaces("Míralo en https://ia-app.com.");
    assert.equal(partes.at(-2).texto, "https://ia-app.com");
    assert.equal(partes.at(-1).texto, ".", "el punto es de la frase, no del enlace");
});

test("un paréntesis de cierre se devuelve… salvo que el enlace lleve el suyo", () => {
    assert.equal(
        soloEnlaces("(ver https://ia-app.com)")[0].texto,
        "https://ia-app.com",
    );
    // El caso clásico de Wikipedia: recortar ahí deja el enlace en otro sitio.
    assert.equal(
        soloEnlaces("https://es.wikipedia.org/wiki/Malla_(informática)")[0].texto,
        "https://es.wikipedia.org/wiki/Malla_(informática)",
    );
});

test("dos mensajes seguidos encuentran sus enlaces", () => {
    // La expresión es global y de módulo: sin reiniciar `lastIndex`, el segundo
    // mensaje empezaría donde acabó el primero. Se vería como «a veces el
    // enlace no se puede pulsar».
    assert.equal(soloEnlaces("https://ia-app.com/uno").length, 1);
    assert.equal(soloEnlaces("https://ia-app.com/dos").length, 1);
    assert.equal(soloEnlaces("texto corto https://ia-app.com/tres").length, 1);
});

test("el texto se conserva entero al juntar los trozos", () => {
    // Lo que no puede pasar es perder un carácter por el camino.
    for (const frase of [
        "antes https://ia-app.com después",
        "Míralo en https://ia-app.com.",
        "(ver https://ia-app.com) y ya",
        "sin ningún enlace",
        "https://ia-app.com",
    ]) {
        assert.equal(
            partirPorEnlaces(frase).map((p) => p.texto).join(""),
            frase,
            `se perdió algo en: ${frase}`,
        );
    }
});

test("`pareceLlevarEnlaces` acierta y no se queda pegada", () => {
    assert.equal(pareceLlevarEnlaces("hola https://x.com"), true);
    assert.equal(pareceLlevarEnlaces("hola https://x.com"), true, "dos veces seguidas");
    assert.equal(pareceLlevarEnlaces("sin nada"), false);
    assert.equal(pareceLlevarEnlaces(""), false);
});

// ── El orden: enlaces primero, formato después ──────────────────────────────

test("una dirección con marcas dentro NO se la come el formato", () => {
    // Es la razón de ser del orden, y el banco ya corrigió una vez la
    // explicación: `mi_cuenta_x` está a salvo —el lector no abre una marca
    // pegada a una letra, que es la protección del `snake_case`—. Lo que sí se
    // rompe es la marca que empieza después de un signo.
    const rompibles = [
        "https://ia-app.com/a/_b_/c",
        "https://ia-app.com/docs/_index_",
        "https://ia-app.com/x?q=_a_&r=1",
        "https://ia-app.com/*destacado*",
    ];
    for (const url of rompibles) {
        // Primero se demuestra que el peligro es real: el lector de marcas, a
        // solas, se la come. Sin esta mitad no se sabe si el orden hace falta.
        assert.match(
            JSON.stringify(leerFormatoDeWhatsapp(url)),
            /cursiva|negrilla|tachado/,
            `el lector SÍ interpreta esto, por eso va después: ${url}`,
        );
        // Y después, que partiendo antes llega entera.
        assert.equal(soloEnlaces(`entra en ${url} ahora`)[0].texto, url);
    }
});

test("y `snake_case` ya estaba a salvo: la exageración se corrigió", () => {
    // Se queda como caso para que nadie vuelva a escribir que esta era la
    // razón. El lector no abre una marca pegada a un carácter alfanumérico.
    const url = "https://ia-app.com/panel/mi_cuenta_x";
    assert.doesNotMatch(JSON.stringify(leerFormatoDeWhatsapp(url)), /cursiva/);
    assert.equal(soloEnlaces(url)[0].texto, url);
});

test("el formato de los trozos de alrededor se sigue leyendo", () => {
    const partes = partirPorEnlaces("*mira* https://ia-app.com *esto*");
    const textos = partes.filter((p) => p.tipo === "texto");
    assert.ok(textos.length >= 2, "hay texto a los dos lados del enlace");
    assert.ok(
        JSON.stringify(leerFormatoDeWhatsapp(textos[0].texto)).includes("negrilla"),
        "lo de antes del enlace conserva su marca",
    );
});

// ── De dentro o de fuera ────────────────────────────────────────────────────

test("una ruta relativa es siempre de dentro", () => {
    assert.equal(laRutaDeLaPlataforma("/panel/clientes", ORIGEN), "/panel/clientes");
    assert.equal(laRutaDeLaPlataforma("/panel?x=1#y", ""), "/panel?x=1#y", "sin origen también");
});

test("`//otro.com` NO es una ruta", () => {
    // Es una dirección absoluta sin esquema. Tratarla como ruta sería navegar
    // fuera creyendo ir dentro.
    assert.equal(laRutaDeLaPlataforma("//otro.com/x", ORIGEN), null);
});

test("se compara el ORIGEN entero, no el principio del dominio", () => {
    assert.equal(laRutaDeLaPlataforma("https://ia-app.com/panel", ORIGEN), "/panel");
    for (const malo of [
        "https://ia-app.com.otrositio.net/panel",
        "https://otro-ia-app.com/panel",
        "http://ia-app.com/panel",
        "https://ia-app.com:8443/panel",
    ]) {
        assert.equal(laRutaDeLaPlataforma(malo, ORIGEN), null, `no es de dentro: ${malo}`);
    }
});

test("sin origen nada absoluto es de dentro, y ese es el lado seguro", () => {
    // Equivocarse hacia «de fuera» abre una pestaña de más; equivocarse hacia
    // «de dentro» manda a una ruta que no existe.
    assert.equal(laRutaDeLaPlataforma("https://ia-app.com/panel", ""), null);
});

test("lo que no es una dirección no revienta", () => {
    for (const malo of ["", "   ", "no es una url", "http://"]) {
        assert.doesNotThrow(() => laRutaDeLaPlataforma(malo, ORIGEN));
    }
});

// ── Las reuniones ───────────────────────────────────────────────────────────

test("se reconoce el código de una reunión de la plataforma", () => {
    assert.equal(elCodigoDeLaReunion(`${ORIGEN}/reunion/ABC123`, ORIGEN), "ABC123");
    assert.equal(elCodigoDeLaReunion("/reunion/ABC123", ORIGEN), "ABC123");
    assert.equal(elCodigoDeLaReunion(`${ORIGEN}/reunion/ABC123?x=1`, ORIGEN), "ABC123");
});

test("una reunión de OTRO sitio no es una reunión nuestra", () => {
    // Sin esto, un enlace de fuera con esa forma pintaría una tarjeta de
    // reunión con un botón de entrar que lleva fuera de la plataforma.
    assert.equal(elCodigoDeLaReunion("https://otro.com/reunion/ABC123", ORIGEN), null);
    assert.equal(elCodigoDeLaReunion(`${ORIGEN}/panel`, ORIGEN), null);
    assert.equal(elCodigoDeLaReunion(`${ORIGEN}/reunion/`, ORIGEN), null);
});

test("la dirección de la reunión se aparta del texto y deja su código", () => {
    const { texto, codigos } = apartarLasReuniones(
        `📹 Reunión abierta: Cierre\n${ORIGEN}/reunion/ABC123`,
        ORIGEN,
    );
    assert.equal(codigos.length, 1);
    assert.equal(codigos[0], "ABC123");
    assert.equal(texto, "📹 Reunión abierta: Cierre", "sin el renglón vacío colgando");
});

test("quitarla de en medio no deja dos espacios pegados", () => {
    const { texto } = apartarLasReuniones(
        `entra aquí ${ORIGEN}/reunion/ABC123 antes de las 5`,
        ORIGEN,
    );
    assert.equal(texto, "entra aquí antes de las 5");
});

test("los renglones que escribió el autor NO se aplastan", () => {
    const { texto } = apartarLasReuniones("una\ndos\ntres", ORIGEN);
    assert.equal(texto, "una\ndos\ntres");
});

test("un enlace que NO es de reunión se queda en el texto", () => {
    const { texto, codigos } = apartarLasReuniones(
        `mira https://ia-app.com/panel y ${ORIGEN}/reunion/ABC`,
        ORIGEN,
    );
    assert.deepEqual(codigos, ["ABC"]);
    assert.ok(texto.includes("https://ia-app.com/panel"), "el otro enlace sigue ahí");
});

test("la misma reunión repetida da UN solo código", () => {
    const { codigos } = apartarLasReuniones(
        `${ORIGEN}/reunion/ABC y otra vez ${ORIGEN}/reunion/ABC`,
        ORIGEN,
    );
    assert.deepEqual(codigos, ["ABC"], "dos tarjetas iguales serían ruido");
});

test("sin origen no se aparta nada: no se sabe qué es nuestro", () => {
    const original = `${ORIGEN}/reunion/ABC123`;
    const { texto, codigos } = apartarLasReuniones(original, "");
    assert.equal(texto, original);
    assert.deepEqual(codigos, []);
});
