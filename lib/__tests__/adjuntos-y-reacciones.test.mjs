/**
 * El banco de lo que el chat del equipo ganó para parecerse a un chat de
 * verdad: adjuntos, reacciones, y editar y borrar lo propio.
 *
 * Las tres cosas tienen la misma forma de romperse y por eso van juntas: **lo
 * que llega del navegador no decide lo que se guarda**. Una dirección que no
 * es nuestra pinta un `<video>` apuntando a donde le digan; un «emoji» con
 * letras dentro es un segundo canal para escribir debajo del mensaje de otro;
 * y un id ajeno en la acción de borrar sería borrar lo que no es tuyo.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
    TOPE_DE_BYTES,
    comoSeGuardaElAdjunto,
    comoSeLeeElNombre,
    comoSeLeeElTamano,
    laClaseDelAdjunto,
    loQueSeLeeDeUnAdjunto,
} from "./.compilado/adjuntos-del-equipo.js";
import {
    EMOJIS_RAPIDOS,
    TOPE_POR_PERSONA,
    agruparLasReacciones,
    alternarEnLaLista,
    comoSeGuardaLaReaccion,
    cuantasTienePuestas,
    esUnEmojiDeReaccion,
} from "./.compilado/reacciones-del-equipo.js";
import {
    LO_QUE_QUEDA_AL_BORRAR,
    sePuedeBorrar,
    sePuedeEditar,
    seEditó,
} from "./.compilado/editar-del-equipo.js";

const BUCKET = { publicUrl: "https://medias3.verzay.co", nombre: "verzay-media" };
const BUENA = "https://medias3.verzay.co/verzay-media/cuenta1/chat-equipo/uuid-foto.jpg";

// ── Adjuntos: de qué clase es ───────────────────────────────────────────────

test("manda el mime, y la extensión es el respaldo", () => {
    assert.equal(laClaseDelAdjunto({ mime: "image/png", nombre: "x.bin" }), "imagen");
    assert.equal(laClaseDelAdjunto({ mime: "video/mp4", nombre: "x.bin" }), "video");
    // Sin mime —pasa con lo que se arrastra desde según qué sitios— decide el
    // nombre. Sin ninguna de las dos, `archivo`.
    assert.equal(laClaseDelAdjunto({ mime: null, nombre: "foto.JPG" }), "imagen");
    assert.equal(laClaseDelAdjunto({ mime: null, nombre: "clip.mov" }), "video");
    assert.equal(laClaseDelAdjunto({ mime: null, nombre: "informe.pdf" }), "archivo");
    assert.equal(laClaseDelAdjunto({ mime: null, nombre: "sin-nada" }), "archivo");
});

test("equivocarse hacia `archivo` ENTREGA, que es lo que importa", () => {
    // Un tipo raro da una tarjeta con su descarga, que funciona siempre. Al
    // revés —pintarlo como imagen— sale un hueco roto y no hay forma de
    // bajárselo.
    assert.equal(
        laClaseDelAdjunto({ mime: "application/octet-stream", nombre: "cosa.xyz" }),
        "archivo",
    );
});

// ── Adjuntos: lo que se guarda de lo que llega ──────────────────────────────

test("solo se acepta una dirección de NUESTRO bucket y con su forma", () => {
    assert.ok(comoSeGuardaElAdjunto({ url: BUENA, nombre: "foto.jpg" }, BUCKET));
    for (const mala of [
        "https://otro-sitio.com/verzay-media/cuenta1/chat-equipo/uuid-foto.jpg",
        "https://medias3.verzay.co/otro-bucket/cuenta1/chat-equipo/uuid.jpg",
        "https://medias3.verzay.co/verzay-media/cuenta1/uuid.jpg",
        "https://medias3.verzay.co/verzay-media/cuenta1/chat-equipo/../../otro.jpg",
        "",
    ]) {
        assert.equal(
            comoSeGuardaElAdjunto({ url: mala, nombre: "foto.jpg" }, BUCKET),
            null,
            `no puede pasar: ${mala || "(vacía)"}`,
        );
    }
});

test("el nombre se queda sin ruta: lo que llega de fuera no dice carpetas", () => {
    const guardado = comoSeGuardaElAdjunto(
        { url: BUENA, nombre: "../../etc/passwd" },
        BUCKET,
    );
    assert.equal(guardado.nombre, "passwd");
});

test("sin nombre, uno que se pueda leer; nunca vacío", () => {
    const guardado = comoSeGuardaElAdjunto({ url: BUENA, nombre: "   " }, BUCKET);
    assert.ok(guardado.nombre.trim(), "una tarjeta sin nombre no se puede distinguir");
});

test("el tamaño se acota, y 0 significa «no se sabe»", () => {
    const enorme = comoSeGuardaElAdjunto(
        { url: BUENA, nombre: "x.jpg", tamano: 999 * 1024 * 1024 },
        BUCKET,
    );
    assert.equal(enorme.tamano, TOPE_DE_BYTES);
    const raro = comoSeGuardaElAdjunto(
        { url: BUENA, nombre: "x.jpg", tamano: -3 },
        BUCKET,
    );
    assert.equal(raro.tamano, 0);
});

test("un mime inventado no se guarda: se queda en null", () => {
    const guardado = comoSeGuardaElAdjunto(
        { url: BUENA, nombre: "x.jpg", mime: "esto no es un mime" },
        BUCKET,
    );
    assert.equal(guardado.mime, null);
    // Y con el mime fuera, la clase la decide el nombre: se sigue viendo la
    // foto. Rechazar el mime no puede convertir una imagen en un fichero.
    assert.equal(laClaseDelAdjunto(guardado), "imagen");
});

// ── Adjuntos: lo que se lee cuando no hay texto ─────────────────────────────

test("un mensaje de solo archivo NO deja el aviso en blanco", () => {
    // Es el mismo hueco que ya tuvo la nota de voz: un aviso vacío no dice ni
    // quién escribió ni de qué, y se despacha sin mirar.
    assert.match(loQueSeLeeDeUnAdjunto({ mime: "image/png", nombre: "a.png" }), /Imagen/);
    assert.match(loQueSeLeeDeUnAdjunto({ mime: "video/mp4", nombre: "a.mp4" }), /Video/);
    assert.match(
        loQueSeLeeDeUnAdjunto({ mime: null, nombre: "contrato.pdf" }),
        /contrato\.pdf/,
    );
});

test("el nombre se recorta por el MEDIO y conserva la extensión", () => {
    const largo = `${"a".repeat(80)}.pdf`;
    const leido = comoSeLeeElNombre(largo);
    assert.ok(leido.length <= 41, leido);
    assert.ok(leido.endsWith(".pdf"), "sin la extensión no se sabe qué es");
    assert.ok(leido.startsWith("aaa"), "y se conserva el principio, que es lo que se lee");
});

test("el tamaño se lee en unidades de persona", () => {
    assert.equal(comoSeLeeElTamano(0), "");
    assert.match(comoSeLeeElTamano(900), /B$/);
    assert.match(comoSeLeeElTamano(2 * 1024 * 1024), /MB$/);
});

// ── Reacciones: qué es un emoji ─────────────────────────────────────────────

test("los seis rápidos son emojis válidos", () => {
    for (const e of EMOJIS_RAPIDOS) {
        assert.ok(esUnEmojiDeReaccion(e), `debería valer: ${e}`);
    }
});

test("un emoji compuesto vale; un texto disfrazado NO", () => {
    assert.ok(esUnEmojiDeReaccion("👨‍👩‍👧‍👦"), "una familia son varios puntos de código unidos");
    assert.ok(esUnEmojiDeReaccion("👍🏽"), "con tono de piel");
    for (const malo of [
        "ok",
        "👍 bien",
        "   ",
        "",
        null,
        7,
        // Reaccionar no puede ser un segundo canal para escribir: un chip con
        // una frase dentro, debajo del mensaje de otro y sin forma de quitarlo.
        "😀😀😀😀😀😀😀😀😀😀😀😀",
    ]) {
        assert.equal(esUnEmojiDeReaccion(malo), false, `no debería valer: ${String(malo)}`);
    }
});

test("lo que se guarda va sin espacios de sobra", () => {
    assert.equal(comoSeGuardaLaReaccion("  👍  "), "👍");
    assert.equal(comoSeGuardaLaReaccion("hola"), null);
});

// ── Reacciones: agrupar ─────────────────────────────────────────────────────

const FILAS = [
    { mensajeId: "m1", personaId: "ana", emoji: "👍" },
    { mensajeId: "m1", personaId: "beto", emoji: "👍" },
    { mensajeId: "m1", personaId: "ana", emoji: "❤️" },
    { mensajeId: "m2", personaId: "beto", emoji: "😂" },
];

test("se agrupa por mensaje y por emoji, y se sabe cuál es la mía", () => {
    const mapa = agruparLasReacciones(FILAS, "ana");
    const m1 = mapa.get("m1");
    assert.equal(m1.length, 2);
    assert.deepEqual(m1[0], { emoji: "👍", quienes: ["ana", "beto"], mia: true });
    assert.equal(m1[1].emoji, "❤️");
    assert.equal(mapa.get("m2")[0].mia, false, "beto reaccionó, no ana");
});

test("el orden es el de APARICIÓN, no el de cantidad", () => {
    // Con el orden por cantidad, el chip salta de sitio en cuanto alguien
    // reacciona y se pulsa el que no era.
    const mapa = agruparLasReacciones(
        [
            { mensajeId: "m", personaId: "a", emoji: "❤️" },
            { mensajeId: "m", personaId: "b", emoji: "👍" },
            { mensajeId: "m", personaId: "c", emoji: "👍" },
            { mensajeId: "m", personaId: "d", emoji: "👍" },
        ],
        "z",
    );
    assert.deepEqual(
        mapa.get("m").map((r) => r.emoji),
        ["❤️", "👍"],
        "el de uno sigue delante del de tres",
    );
});

test("una fila rota no tumba el grupo", () => {
    const mapa = agruparLasReacciones(
        [{ mensajeId: "", personaId: "a", emoji: "👍" }, ...FILAS],
        "ana",
    );
    assert.equal(mapa.get("m1").length, 2);
});

// ── Reacciones: alternar, y que las dos mitades digan lo mismo ──────────────

test("alternar pone y quita, y el grupo desaparece al vaciarse", () => {
    let lista = alternarEnLaLista(undefined, "👍", "ana");
    assert.deepEqual(lista, [{ emoji: "👍", quienes: ["ana"], mia: true }]);
    lista = alternarEnLaLista(lista, "👍", "ana");
    assert.deepEqual(lista, [], "quitar la última borra el chip entero");
});

test("quitar la mía deja el chip de los demás en pie", () => {
    const antes = [{ emoji: "👍", quienes: ["ana", "beto"], mia: true }];
    const despues = alternarEnLaLista(antes, "👍", "ana");
    assert.deepEqual(despues, [{ emoji: "👍", quienes: ["beto"], mia: false }]);
});

test("lo nuevo entra al FINAL y no reordena lo que había", () => {
    const antes = [{ emoji: "❤️", quienes: ["beto"], mia: false }];
    const despues = alternarEnLaLista(antes, "👍", "ana");
    assert.deepEqual(despues.map((r) => r.emoji), ["❤️", "👍"]);
});

test("no se muta la lista que llega: es estado de React", () => {
    const antes = [{ emoji: "👍", quienes: ["beto"], mia: false }];
    const copia = JSON.parse(JSON.stringify(antes));
    alternarEnLaLista(antes, "👍", "ana");
    assert.deepEqual(antes, copia, "mutarla deja la pantalla sin repintar");
});

test("lo que pinta el navegador es lo que diría la base", () => {
    // Encadenadas: se alterna en la lista y se comprueba que agrupar las filas
    // que habría escrito la base da exactamente lo mismo. Si las dos mitades no
    // estuvieran de acuerdo, el chip se marcaría al tocarlo y se desmarcaría
    // solo cinco segundos después, en la vuelta del reloj.
    const enPantalla = alternarEnLaLista(
        [{ emoji: "👍", quienes: ["beto"], mia: false }],
        "👍",
        "ana",
    );
    const desdeLaBase = agruparLasReacciones(
        [
            { mensajeId: "m", personaId: "beto", emoji: "👍" },
            { mensajeId: "m", personaId: "ana", emoji: "👍" },
        ],
        "ana",
    ).get("m");
    assert.deepEqual(enPantalla, desdeLaBase);
});

test("el tope se cuenta por PERSONA, y quitar nunca se cuenta", () => {
    const cinco = ["👍", "❤️", "😂", "😮", "😢"].map((emoji) => ({
        emoji,
        quienes: ["ana"],
        mia: true,
    }));
    assert.equal(cuantasTienePuestas(cinco, "ana"), TOPE_POR_PERSONA);
    assert.equal(cuantasTienePuestas(cinco, "beto"), 0, "el tope es de cada uno");
    // Y con el tope lleno, quitar sigue pudiéndose: si no, llegar al tope
    // dejaría a alguien sin forma de deshacer lo que puso.
    assert.equal(alternarEnLaLista(cinco, "👍", "ana").length, 4);
});

// ── Editar y borrar ─────────────────────────────────────────────────────────

const MIO = { autorId: "ana", borradoEn: null, llamada: null };

test("lo propio se edita y se borra; lo ajeno NO", () => {
    assert.equal(sePuedeEditar({ mensaje: MIO, yo: "ana", puedoEscribir: true }), true);
    assert.equal(sePuedeBorrar({ mensaje: MIO, yo: "ana", puedoEscribir: true }), true);
    assert.equal(sePuedeEditar({ mensaje: MIO, yo: "beto", puedoEscribir: true }), false);
    assert.equal(sePuedeBorrar({ mensaje: MIO, yo: "beto", puedoEscribir: true }), false);
});

test("sin permiso de ESCRIBIR no se toca nada, ni lo propio", () => {
    // Quien administra lee los directos de su cuenta y no escribe en ellos; que
    // un mensaje sea suyo no le devuelve la mano en una conversación de la que
    // no forma parte.
    assert.equal(sePuedeEditar({ mensaje: MIO, yo: "ana", puedoEscribir: false }), false);
    assert.equal(sePuedeBorrar({ mensaje: MIO, yo: "ana", puedoEscribir: false }), false);
});

test("un mensaje ya borrado no se vuelve a tocar", () => {
    const borrado = { ...MIO, borradoEn: "2026-09-19T10:00:00.000Z" };
    assert.equal(sePuedeEditar({ mensaje: borrado, yo: "ana", puedoEscribir: true }), false);
    assert.equal(sePuedeBorrar({ mensaje: borrado, yo: "ana", puedoEscribir: true }), false);
});

test("una llamada NO se edita, y SÍ se borra", () => {
    // Nadie escribió «Llamada de voz · 3:07»: lo dejó la llamada al terminar, y
    // editarlo sería reescribir un hecho. Borrarlo es otra cosa: es quitar del
    // hilo un registro que ya no interesa, y eso sí se puede.
    const llamada = { ...MIO, llamada: { fin: "colgada", segundos: 187 } };
    assert.equal(sePuedeEditar({ mensaje: llamada, yo: "ana", puedoEscribir: true }), false);
    assert.equal(sePuedeBorrar({ mensaje: llamada, yo: "ana", puedoEscribir: true }), true);
});

test("editado se marca, y borrado deja su señal", () => {
    assert.equal(seEditó({ editadoEn: null }), false);
    assert.equal(seEditó({ editadoEn: "2026-09-19T10:00:00.000Z" }), true);
    assert.ok(LO_QUE_QUEDA_AL_BORRAR.trim(), "el hueco tiene que decir algo");
});
