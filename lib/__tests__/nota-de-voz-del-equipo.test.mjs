/**
 * El banco de las notas de voz del chat del equipo.
 *
 * Tres cosas se prueban aquí y cada una es un fallo que ya costó caro en esta
 * casa: **quién paga** (cobrarle a la persona deja a todo el mundo sin poder
 * transcribir), **quién puede pedirlo** (un administrador lee los directos de
 * su cuenta y eso no le deja gastar créditos en ellos) y **qué direcciones se
 * aceptan** (una que no sea nuestra convierte el botón en una petición que sale
 * de nuestro servidor hacia donde le digan).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
    comoSeGuardaLaNota,
    comoSeLeeElCosto,
    comoSeLeeLaDuracion,
    laCuentaQuePagaLaTranscripcion,
    puedePedirLaTranscripcion,
} from "./.compilado/nota-de-voz-del-equipo.js";
import { costoDeLaNota, queHacerConLaNota } from "./.compilado/transcripcion-de-voz.js";

const BUCKET = { publicUrl: "https://medias3.verzay.co", nombre: "verzay-media" };
const BUENA = "https://medias3.verzay.co/verzay-media/cuenta1/chat-equipo/uuid-nota.webm";

// ── Quién paga ──────────────────────────────────────────────────────────────

test("paga la cuenta, y dentro de una familia la MADRE", () => {
    assert.equal(
        laCuentaQuePagaLaTranscripcion({ cuentaId: "atencion", raizDeLaFamilia: "grupo" }),
        "grupo",
        "en el chat interno de Grupo Verzay lo paga Grupo Verzay",
    );
});

test("una cuenta que no cuelga de nadie se paga a sí misma", () => {
    assert.equal(
        laCuentaQuePagaLaTranscripcion({ cuentaId: "cliente", raizDeLaFamilia: "cliente" }),
        "cliente",
    );
});

test("sin familia resuelta se cae a su propia cuenta, nunca a vacío", () => {
    assert.equal(
        laCuentaQuePagaLaTranscripcion({ cuentaId: "atencion", raizDeLaFamilia: null }),
        "atencion",
    );
    assert.equal(
        laCuentaQuePagaLaTranscripcion({ cuentaId: "atencion", raizDeLaFamilia: "   " }),
        "atencion",
        "una raíz en blanco no puede dejar el cobro sin cuenta",
    );
});

// ── Quién puede pedirlo ─────────────────────────────────────────────────────

test("quien pertenece al canal puede pedirlo", () => {
    assert.equal(puedePedirLaTranscripcion({ pertenezco: true }), true);
});

test("quien SOLO puede leer, no", () => {
    assert.equal(
        puedePedirLaTranscripcion({ pertenezco: false }),
        false,
        "un administrador lee los directos de su cuenta y eso no le deja gastar créditos en ellos",
    );
});

// ── Qué direcciones se aceptan ──────────────────────────────────────────────

test("una nota de nuestro bucket se guarda", () => {
    const n = comoSeGuardaLaNota(
        { url: BUENA, segundos: 12, mime: "audio/webm;codecs=opus" },
        BUCKET,
    );
    assert.equal(n?.url, BUENA);
    assert.equal(n?.segundos, 12);
    assert.equal(n?.mime, "audio/webm;codecs=opus");
});

test("una dirección de OTRO dominio no es una nota", () => {
    assert.equal(
        comoSeGuardaLaNota(
            { url: "https://malo.example/verzay-media/a/b/c.webm", segundos: 5 },
            BUCKET,
        ),
        null,
    );
});

test("otro bucket del mismo dominio tampoco", () => {
    assert.equal(
        comoSeGuardaLaNota(
            { url: "https://medias3.verzay.co/otro-bucket/a/b/c.webm", segundos: 5 },
            BUCKET,
        ),
        null,
    );
});

test("un salto de carpeta no pasa, ni codificado", () => {
    for (const mala of [
        "https://medias3.verzay.co/verzay-media/../../etc/passwd",
        "https://medias3.verzay.co/verzay-media/a/%2e%2e/c.webm",
        "https://medias3.verzay.co/verzay-media/a/b/c/d.webm",
        "https://medias3.verzay.co/verzay-media/a/b",
    ]) {
        assert.equal(comoSeGuardaLaNota({ url: mala, segundos: 5 }, BUCKET), null, mala);
    }
});

test("sin dirección no hay nota, y eso no es un error", () => {
    assert.equal(comoSeGuardaLaNota(null, BUCKET), null);
    assert.equal(comoSeGuardaLaNota({ url: "   " }, BUCKET), null);
});

test("los segundos se acotan, pero NO al tope de lo transcribible", () => {
    // La trampa, y la caza este caso: recortando a los 10 minutos que es el
    // tope de Chats, una nota de MEDIA HORA se guardaba como de diez y entonces
    // `queHacerConLaNota` la daba por transcribible — o sea, se cobraban diez
    // minutos por transcribir treinta. El recorte es un absurdo, no el tope.
    const media = comoSeGuardaLaNota({ url: BUENA, segundos: 1800 }, BUCKET);
    assert.equal(media?.segundos, 1800, "media hora se guarda como media hora");
    assert.equal(
        queHacerConLaNota({ segundos: media.segundos, creditosDisponibles: 99999 }).hacer,
        "saltar",
        "y con la duración de verdad delante, la regla de siempre la rechaza",
    );

    const enorme = comoSeGuardaLaNota({ url: BUENA, segundos: 999999999 }, BUCKET);
    assert.equal(enorme?.segundos, 6 * 60 * 60, "el techo es un absurdo, seis horas");

    const negativo = comoSeGuardaLaNota({ url: BUENA, segundos: -30 }, BUCKET);
    assert.equal(negativo?.segundos, 0);

    const raro = comoSeGuardaLaNota({ url: BUENA, segundos: Number.NaN }, BUCKET);
    assert.equal(raro?.segundos, 0, "un número que no lo es vale cero, nunca NaN");
});

test("un mime que no es de audio se descarta", () => {
    const n = comoSeGuardaLaNota(
        { url: BUENA, segundos: 5, mime: "text/html" },
        BUCKET,
    );
    assert.equal(n?.mime, null);
});

// ── La tarifa es la MISMA que la de Chats ───────────────────────────────────

test("seis créditos por minuto, prorrateado por segundos", () => {
    assert.equal(costoDeLaNota(60).creditos, 6, "un minuto son seis créditos");
    assert.equal(costoDeLaNota(30).creditos, 3, "medio minuto, tres");
    assert.equal(costoDeLaNota(120).creditos, 12);
});

test("una nota corta nunca cuesta cero", () => {
    assert.equal(costoDeLaNota(1).creditos, 1);
    assert.equal(costoDeLaNota(5).creditos, 1);
    assert.equal(
        costoDeLaNota(0).creditos,
        1,
        "con floor costaría cero y se transcribiría gratis para siempre",
    );
});

// ── Lo que se lee en pantalla ───────────────────────────────────────────────

test("la duración se lee como en un reproductor", () => {
    assert.equal(comoSeLeeLaDuracion(0), "0:00");
    assert.equal(comoSeLeeLaDuracion(9), "0:09");
    assert.equal(comoSeLeeLaDuracion(75), "1:15");
    assert.equal(comoSeLeeLaDuracion(600), "10:00");
});

test("una duración imposible no rompe la burbuja", () => {
    assert.equal(comoSeLeeLaDuracion(Number.NaN), "0:00");
    assert.equal(comoSeLeeLaDuracion(-5), "0:00");
});

test("el costo se lee en singular y en plural", () => {
    assert.equal(comoSeLeeElCosto(1), "1 crédito");
    assert.equal(comoSeLeeElCosto(3), "3 créditos");
});

test("lo que se ofrece es lo que se va a cobrar", () => {
    // Encadenadas: lo que el botón enseña sale de la MISMA función con la que
    // la acción cobra. Si se separaran, el botón prometería un precio y la
    // cuenta pagaría otro.
    const segundos = 95;
    const guardada = comoSeGuardaLaNota({ url: BUENA, segundos }, BUCKET);
    assert.equal(
        comoSeLeeElCosto(costoDeLaNota(guardada.segundos).creditos),
        "10 créditos",
    );
});
