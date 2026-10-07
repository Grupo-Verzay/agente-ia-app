// Banco de la búsqueda dentro de los mensajes de Chats: la regla pura y un
// barrido de que la pantalla la usa. Lo levanta scripts/banco-busqueda-en-mensajes.sh.
// MODO=roto lee ANTES_REF y afirma que allí la búsqueda solo miraba nombre y número.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF || "bf1a4af";

function enAntes(ruta) {
  try {
    return execFileSync("git", ["show", `${ANTES}:${ruta}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

if (ROTO) {
  test("roto: en ANTES_REF no había ruta para buscar dentro de los mensajes", () => {
    assert.equal(enAntes("app/api/chats/buscar/route.ts"), null);
    assert.equal(enAntes("lib/busqueda-en-mensajes.ts"), null);
  });
  test("roto: la lista de ANTES_REF no pintaba resultados en mensajes", () => {
    const sidebar = enAntes("app/(root)/chats/_components/chat-sidebar.tsx");
    assert.ok(sidebar, "chat-sidebar existía");
    assert.ok(!sidebar.includes("ResultadosEnMensajes"));
    assert.ok(!sidebar.includes("/api/chats/buscar"));
  });
} else {
  const L = await import(new URL(`../../${process.env.PURO}`, import.meta.url).href);
  // 7 de octubre de 2026, 15:00 en Bogotá (UTC-5 → desfase 300).
  const AHORA = Date.UTC(2026, 9, 7, 20, 0, 0);
  const BOGOTA = 300;

  test("la consulta: sin tildes, prefijo en el último trozo y nada si no hay letras", () => {
    assert.equal(L.normalizarParaBuscar("  Cotización  ÚRGENTE! "), "cotizacion urgente");
    assert.equal(L.comoConsultaDeBusqueda("cotiz"), "'cotiz':*");
    assert.equal(L.comoConsultaDeBusqueda("precio envío"), "'precio':* & 'envio':*");
    assert.equal(L.comoConsultaDeBusqueda("FAC-8841"), "('fac' <-> '8841':*)");
    assert.equal(L.comoConsultaDeBusqueda("!!! ..."), null);
    assert.equal(L.comoConsultaDeBusqueda(""), null);
    // una consulta nunca lleva un operador que el usuario haya tecleado
    assert.ok(!/[|!]/.test(L.comoConsultaDeBusqueda("a|b !c (d)") ?? ""));
  });

  test("las fechas: hoy, ayer, dd/mm, yyyy-mm-dd y «15 de octubre»", () => {
    const hoy = L.laFechaDelTexto("hoy", AHORA, BOGOTA);
    assert.deepEqual([hoy.anio, hoy.mes, hoy.dia], [2026, 10, 7]);
    assert.equal(hoy.hastaSeg - hoy.desdeSeg, 86400);
    // el día empieza a medianoche de Bogotá = 05:00 UTC
    assert.equal(hoy.desdeSeg, Date.UTC(2026, 9, 7, 5) / 1000);
    const ayer = L.laFechaDelTexto("pago ayer", AHORA, BOGOTA);
    assert.deepEqual([ayer.dia, ayer.resto], [6, "pago"]);
    const iso = L.laFechaDelTexto("2026-03-05", AHORA, BOGOTA);
    assert.deepEqual([iso.anio, iso.mes, iso.dia], [2026, 3, 5]);
    const corta = L.laFechaDelTexto("factura 15/09", AHORA, BOGOTA);
    assert.deepEqual([corta.anio, corta.mes, corta.dia, corta.resto], [2026, 9, 15, "factura"]);
    const larga = L.laFechaDelTexto("15 de octubre", AHORA, BOGOTA);
    assert.deepEqual([larga.anio, larga.mes, larga.dia], [2025, 10, 15], "sin año, el más reciente que no sea futuro");
    const anio2 = L.laFechaDelTexto("1/2/25", AHORA, BOGOTA);
    assert.deepEqual([anio2.anio, anio2.mes, anio2.dia], [2025, 2, 1]);
  });

  test("lo que no es una fecha no es una fecha", () => {
    assert.equal(L.laFechaDelTexto("31/02", AHORA, BOGOTA), null);
    assert.equal(L.laFechaDelTexto("precio", AHORA, BOGOTA), null);
    assert.equal(L.laFechaDelTexto("15 de nada", AHORA, BOGOTA), null);
  });

  test("el extracto: entero si es corto, y alrededor de lo buscado si es largo", () => {
    assert.equal(L.elExtracto("Hola, ¿cuánto cuesta?", "cuesta"), "Hola, ¿cuánto cuesta?");
    const largo = "a".repeat(200) + " la cotización está lista " + "b".repeat(200);
    const ex = L.elExtracto(largo, "cotizacion");
    assert.ok(ex.includes("cotización"));
    assert.ok(ex.startsWith("…") && ex.endsWith("…"));
    assert.ok(ex.length <= L.LARGO_DEL_EXTRACTO + 2);
  });

  test("solo se busca dentro de los mensajes con al menos tres letras", () => {
    assert.equal(L.seBuscaEnLosMensajes("ho"), false);
    assert.equal(L.seBuscaEnLosMensajes("hola"), true);
    assert.equal(L.seBuscaEnLosMensajes("!!!"), false);
  });

  test("un agente ve lo suyo y lo sin dueño (si puede tomarlo), nunca lo de otro", () => {
    const r = (jid) => ({ instanceName: "L", remoteJid: jid, remoteJidAlt: null, senderPn: null, pushName: null, fromMe: false, extracto: "", messageTimestamp: 0 });
    const asesores = new Map([["L::a", "yo"], ["L::b", "otro"], ["L::c", null]]);
    const todos = [r("a"), r("b"), r("c"), r("d")];
    assert.deepEqual(L.loQueVeUnAgente(todos, asesores, "yo", true).map((x) => x.remoteJid), ["a", "c", "d"]);
    assert.deepEqual(L.loQueVeUnAgente(todos, asesores, "yo", false).map((x) => x.remoteJid), ["a"]);
  });

  test("barrido: la lista de Chats pinta los resultados y los pide a la ruta", () => {
    const sidebar = readFileSync("app/(root)/chats/_components/chat-sidebar.tsx", "utf8");
    assert.ok(sidebar.includes("<ResultadosEnMensajes"));
    const comp = readFileSync("app/(root)/chats/_components/ResultadosEnMensajes.tsx", "utf8");
    assert.ok(comp.includes("/api/chats/buscar"));
    assert.ok(comp.includes("seBuscaEnLosMensajes"), "no pide nada con menos de tres letras");
    const ruta = readFileSync("app/api/chats/buscar/route.ts", "utf8");
    for (const puerta of ["currentUser", "lasCuentasQueVeLaBandeja", "resolveInstanceOwner", "loQueVeUnAgente"]) {
      assert.ok(ruta.includes(puerta), `la ruta pasa por ${puerta}`);
    }
  });
}
