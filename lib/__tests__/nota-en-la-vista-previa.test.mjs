/**
 * LA NOTA INTERNA EN LA VISTA PREVIA de la fila de Chats: la regla y un
 * barrido del código.
 *
 * La regla (`lib/nota-en-la-vista-previa.ts`) es pura: la nota manda solo si
 * es ESTRICTAMENTE posterior al último mensaje, con las dos marcas en
 * milisegundos —el mensaje puede llegar en segundos o en milisegundos—, y un
 * mensaje posterior la devuelve a la fila de iconitos.
 *
 * El barrido mira lo que un banco puro no puede: que la lista PASA por la
 * regla, que el aviso de la conversación abierta trae el texto de la nota (no
 * solo «tiene notas»), y que la fila marca la vista previa como nota.
 *
 * `MODO=roto` lee los mismos ficheros de `DIR_ANTES` (un worktree del commit
 * de antes) y afirma el fallo: la lista solo sabía «esta conversación tiene
 * notas», así que se veía el candado y nunca el texto.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const ROTO = process.env.MODO === "roto";
const DIR = ROTO ? process.env.DIR_ANTES : RAIZ;
const leer = (rel) => readFileSync(join(DIR, rel), "utf8");
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const C = "app/(root)/chats/_components/";

if (!ROTO) {
  const L = await import(join(AQUI, ".compilado", "nota-en-la-vista-previa.js"));
  const NOTA = (texto, creadaEnMs) => ({ texto, creadaEnMs });

  test("la nota manda si es lo último: con el mensaje en SEGUNDOS y en MILISEGUNDOS", () => {
    const nota = NOTA("Llamar mañana a las 10", 1_780_000_060_000);
    for (const ultimo of [1_780_000_000, 1_780_000_000_000]) {
      assert.deepEqual(
        L.laVistaPreviaDeLaFila({ textoDelMensaje: "🖼️ Imagen", ultimoMensajeMs: ultimo * (ultimo < 1e11 ? 1000 : 1), nota }),
        { texto: "🔒 Llamar mañana a las 10", esNota: true },
      );
    }
    // La regla en crudo también normaliza: una marca en segundos no puede ganarle a una nota de hoy.
    assert.equal(L.laNotaEsLoUltimo(nota, 1_780_000_000), true);
  });

  test("un mensaje posterior vuelve a ser la vista previa; a igualdad manda el mensaje", () => {
    const nota = NOTA("Ya confirmó", 1_780_000_000_000);
    assert.deepEqual(
      L.laVistaPreviaDeLaFila({ textoDelMensaje: "Gracias", ultimoMensajeMs: 1_780_000_001_000, nota }),
      { texto: "Gracias", esNota: false },
    );
    assert.deepEqual(
      L.laVistaPreviaDeLaFila({ textoDelMensaje: "🎙️ Nota de voz", ultimoMensajeMs: 1_780_000_000_000, nota }),
      { texto: "🎙️ Nota de voz", esNota: false },
      "empate: el cliente ve el mensaje, la nota no le gana",
    );
  });

  test("sin nota, o con una nota sin fecha, la fila enseña el mensaje tal cual", () => {
    for (const nota of [null, undefined, NOTA("x", 0), NOTA("x", Number.NaN)]) {
      assert.deepEqual(
        L.laVistaPreviaDeLaFila({ textoDelMensaje: "📞 Llamada", ultimoMensajeMs: 5, nota }),
        { texto: "📞 Llamada", esNota: false },
      );
    }
    assert.equal(L.comoUltimaNota({ contenido: "hola", creadaEn: "no es fecha" }), null);
    assert.equal(L.comoUltimaNota(null), null);
  });

  test("una conversación sin mensajes y con nota: manda la nota", () => {
    const v = L.laVistaPreviaDeLaFila({ textoDelMensaje: "", ultimoMensajeMs: 0, nota: NOTA("Revisar", 1000) });
    assert.equal(v.esNota, true);
    assert.equal(v.texto, "🔒 Revisar");
  });

  test("el texto viaja en una línea, cortado, y sin texto dice «Nota interna»", () => {
    assert.equal(L.elTextoDeLaNota("  Hola\n\n  qué   tal\t "), "Hola qué tal");
    const largo = L.elTextoDeLaNota("a ".repeat(500));
    assert.ok(largo.length <= L.TOPE_DEL_TEXTO_DE_LA_NOTA);
    assert.ok(largo.endsWith("…"));
    assert.equal(L.laVistaPreviaDeLaNota("   "), `${L.ICONO_DE_LA_NOTA} ${L.NOTA_SIN_TEXTO}`);
    assert.equal(L.elTextoDeLaNota(42), "");
    const desdeBase = L.comoUltimaNota({ contenido: "Dato\ncon salto", creadaEn: new Date(1_780_000_000_000) });
    assert.deepEqual(desdeBase, { texto: "Dato con salto", creadaEnMs: 1_780_000_000_000 });
  });

  test("el mapa: una nota por conversación, la más reciente, y no se copia si no cambia", () => {
    const mapa = L.elMapaDeLasNotas([
      { sessionId: 1, texto: "vieja", creadaEnMs: 100 },
      { sessionId: 1, texto: "nueva", creadaEnMs: 200 },
      { sessionId: 2, texto: "otra", creadaEnMs: 50 },
      { sessionId: 0, texto: "sin id", creadaEnMs: 10 },
      { sessionId: 3, texto: "sin fecha", creadaEnMs: 0 },
    ]);
    assert.deepEqual([...mapa.keys()].sort(), [1, 2]);
    assert.equal(mapa.get(1).texto, "nueva");

    const igual = L.conLaUltimaNota(mapa, 1, { texto: "nueva", creadaEnMs: 200 });
    assert.equal(igual, mapa, "misma nota: el mismo mapa, la lista no se rehace");
    assert.equal(L.conLaUltimaNota(mapa, 9, null), mapa, "quitar lo que no está: el mismo mapa");

    const otra = L.conLaUltimaNota(mapa, 1, { texto: "otra más", creadaEnMs: 300 });
    assert.notEqual(otra, mapa);
    assert.equal(otra.get(1).texto, "otra más");
    assert.equal(mapa.get(1).texto, "nueva", "el de antes no se toca");

    const sinNota = L.conLaUltimaNota(mapa, 2, null);
    assert.equal(sinNota.has(2), false, "borrar la última nota la quita del mapa");
  });
}

test(`${ROTO ? "ANTES" : "ahora"}: la lista pasa por la regla de la vista previa`, () => {
  const s = sinComentarios(leer(C + "chat-sidebar.tsx"));
  const pasa = /laVistaPreviaDeLaFila\(/.test(s);
  if (ROTO) assert.equal(pasa, false, "antes ya había regla");
  else assert.equal(pasa, true, "la lista arma la vista previa sin mirar la nota");
});

test(`${ROTO ? "ANTES" : "ahora"}: la lista guarda la ÚLTIMA nota de cada conversación, no solo sus ids`, () => {
  const s = sinComentarios(leer(C + "chat-sidebar.tsx"));
  if (ROTO) {
    assert.match(s, /getSessionIdsWithNotesAction/, "antes solo pedía los ids");
    assert.doesNotMatch(s, /lasNotasDeLaBandejaAction/);
  } else {
    assert.match(s, /lasNotasDeLaBandejaAction\(/);
    assert.doesNotMatch(s, /getSessionIdsWithNotesAction/);
    assert.match(s, /conLaUltimaNota\(/, "el aviso de una fila se aplica con la regla");
  }
});

test(`${ROTO ? "ANTES" : "ahora"}: el aviso de la conversación abierta lleva el texto de la nota`, () => {
  const cliente = sinComentarios(leer(C + "chats-client.tsx"));
  const i = cliente.indexOf("avisarDeLasNotasDeLaFila(");
  assert.ok(i >= 0, "la pantalla avisa de las notas de la fila");
  const llamada = cliente.slice(i, cliente.indexOf(")", cliente.indexOf(")", i) + 1) + 1);
  if (ROTO) assert.doesNotMatch(llamada, /ultimaNota/, "antes solo decía si tenía notas");
  else assert.match(llamada, /ultimaNota/);

  const accion = sinComentarios(leer("actions/session-action.ts"));
  const j = accion.indexOf("export async function laFilaDeLaSesionAction");
  assert.ok(j >= 0);
  const cuerpo = accion.slice(j, accion.indexOf("export ", j + 10));
  assert.equal(/ultimaNota/.test(cuerpo), !ROTO);
});

test(`${ROTO ? "ANTES" : "ahora"}: la fila marca su vista previa como nota o como mensaje`, () => {
  const s = sinComentarios(leer(C + "ChatContactItem.tsx"));
  assert.equal(/data-vista-previa=/.test(s), !ROTO);
  if (!ROTO) assert.match(s, /vistaPreviaEsNota/);
});

test(`${ROTO ? "ANTES" : "ahora"}: la regla existe`, () => {
  assert.equal(existsSync(join(DIR, "lib/nota-en-la-vista-previa.ts")), !ROTO);
});

test(`${ROTO ? "ANTES" : "ahora"}: el candado de la fila sigue saliendo mientras haya notas`, () => {
  // Lo que NO cambia: la fila de iconitos. El candado lo decide `hasNotes`.
  const fila = sinComentarios(leer(C + "ChatContactItem.tsx"));
  assert.match(fila, /hasNotes/);
  const lista = sinComentarios(leer(C + "chat-sidebar.tsx"));
  assert.match(lista, /hasNotes:/);
});
