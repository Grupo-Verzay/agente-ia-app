/**
 * La regla de la LAPIDA, sin base: que hacer con un mensaje que llega de un
 * contacto eliminado. Y que la copia del backend diga lo MISMO, byte a byte:
 * la App y el motor escriben las mismas tablas y tienen que decidir igual.
 *
 * Se levanta con `scripts/banco-chats-eliminados.sh` (solo en el modo bueno:
 * en el «antes» esta regla no existia, y el banco lo afirma aparte).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  queHacerConElMensaje,
  laLapidaQueManda,
  estaRevivida,
  esDeAntesDe,
} from "./.compilado/eliminados/chats-eliminados.js";

const T0 = new Date("2026-09-30T12:00:00.000Z");
const antes = new Date(T0.getTime() - 60_000);
const despues = new Date(T0.getTime() + 60_000);

const chat = { eliminadoEn: T0, historialHasta: T0, revividoEn: null, alcance: "chat" };
const ficha = { eliminadoEn: T0, historialHasta: null, revividoEn: null, alcance: "ficha" };

const entra = (hora, extra = {}) => ({ hora, esHistorial: false, fromMe: false, porUnaPersona: false, ...extra });

test("sin lapida se escribe todo, como siempre", () => {
  assert.deepEqual(queHacerConElMensaje(null, entra(antes)), {
    mensaje: true, conversacion: true, ficha: true, accion: "nada",
  });
});

test("chat eliminado: lo de antes no vuelve, venga en vivo o del historial", () => {
  for (const extra of [{}, { esHistorial: true }, { fromMe: true }, { fromMe: true, porUnaPersona: true }]) {
    const d = queHacerConElMensaje(chat, entra(antes, extra));
    assert.deepEqual(d, { mensaje: false, conversacion: false, ficha: false, accion: "nada" }, JSON.stringify(extra));
  }
  // A la misma hora tambien es «de antes»: el borrado se lo llevo.
  assert.equal(queHacerConElMensaje(chat, entra(T0)).mensaje, false);
});

test("historial sin hora se trata como viejo; en vivo sin hora es de ahora", () => {
  assert.equal(queHacerConElMensaje(chat, entra(null, { esHistorial: true })).mensaje, false);
  assert.equal(queHacerConElMensaje(chat, entra(null)).accion, "revivir");
});

test("el contacto escribe despues: revive y vuelve todo", () => {
  assert.deepEqual(queHacerConElMensaje(chat, entra(despues)), {
    mensaje: true, conversacion: true, ficha: true, accion: "revivir",
  });
  assert.deepEqual(queHacerConElMensaje(ficha, entra(despues)), {
    mensaje: true, conversacion: true, ficha: true, accion: "revivir",
  });
});

test("un envio automatico despues: se guarda, pero no devuelve el chat ni el lead", () => {
  assert.deepEqual(queHacerConElMensaje(chat, entra(despues, { fromMe: true })), {
    mensaje: true, conversacion: false, ficha: false, accion: "nada",
  });
});

test("una persona escribe despues: la conversacion vuelve, el lead no", () => {
  assert.deepEqual(queHacerConElMensaje(chat, entra(despues, { fromMe: true, porUnaPersona: true })), {
    mensaje: true, conversacion: true, ficha: false, accion: "devolver-la-conversacion",
  });
});

test("solo el lead eliminado: la conversacion sigue, un mensaje viejo no crea la ficha", () => {
  assert.deepEqual(queHacerConElMensaje(ficha, entra(antes, { esHistorial: true })), {
    mensaje: true, conversacion: true, ficha: false, accion: "nada",
  });
  assert.deepEqual(queHacerConElMensaje(ficha, entra(despues, { fromMe: true })), {
    mensaje: true, conversacion: true, ficha: false, accion: "nada",
  });
});

test("revivida: todo vuelve, salvo el historial que se borro con el chat", () => {
  const revivida = { ...chat, revividoEn: despues };
  assert.equal(estaRevivida(revivida), true);
  assert.equal(queHacerConElMensaje(revivida, entra(antes, { esHistorial: true })).mensaje, false);
  assert.deepEqual(queHacerConElMensaje(revivida, entra(despues, { fromMe: true })), {
    mensaje: true, conversacion: true, ficha: true, accion: "nada",
  });
  // Un lead revivido: lo viejo ya puede tener su ficha.
  assert.equal(queHacerConElMensaje({ ...ficha, revividoEn: despues }, entra(antes)).ficha, true);
});

test("un revivido de una eliminacion ANTERIOR no cuenta", () => {
  assert.equal(estaRevivida({ ...chat, revividoEn: antes }), false);
});

test("manda la eliminacion mas reciente; a igual hora, la del chat", () => {
  const vieja = { ...chat, eliminadoEn: antes, revividoEn: despues };
  assert.equal(laLapidaQueManda([vieja, ficha]), ficha);
  assert.equal(laLapidaQueManda([ficha, chat]), chat);
  assert.equal(laLapidaQueManda([]), null);
});

test("esDeAntesDe: sin marca nunca", () => {
  assert.equal(esDeAntesDe(null, entra(antes)), false);
});

test("la copia del backend es IDENTICA a la de la App", (t) => {
  const backend = "../api-webhook/src/modules/webhook/utils/chats-eliminados.ts";
  if (!existsSync(backend)) {
    t.skip("el backend no esta al lado: no hay con que comparar");
    return;
  }
  assert.equal(
    readFileSync(backend, "utf8"),
    readFileSync("lib/chats-eliminados.ts", "utf8"),
    "las dos reglas tienen que decir lo mismo: si se toca una, se copia a la otra",
  );
});
