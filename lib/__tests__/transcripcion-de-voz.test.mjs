/**
 * Transcribir las notas de voz de Chats.
 *
 * Los cuatro invariantes que este banco protege:
 *
 *   1. **Se paga por MINUTO y el contador mide TOKENS.** La cadena es
 *      `segundos → creditos → tokens`, con el redondeo una sola vez y HACIA
 *      ARRIBA: con `floor`, una nota de 5 segundos costaria CERO y se
 *      transcribiria gratis para siempre mientras el consumo si ocurre.
 *   2. **La comprobacion va en CREDITOS, nunca en tokens.** Es la regla
 *      explicita de CLAUDE.md: ninguna comparacion toca `used` y `total` en la
 *      misma expresion. Ese fallo ya paso en el voicebot — bastaban 4 creditos
 *      para agotar un cupo de 12.000.
 *   3. **«Sin creditos» es ESPERAR, no saltar.** Saltar deja marca y no se
 *      reintenta nunca; quedarse sin creditos es de hoy, y marcarlo dejaria esa
 *      nota sin transcribir aunque la cuenta recargue esta tarde.
 *   4. **Una nota muy larga no se recorta.** Media transcripcion no se ve como
 *      incompleta: se ve como completa, y quien la lee actua sobre ella.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc lib/transcripcion-de-voz.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --moduleResolution bundler --skipLibCheck
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CREDITOS_POR_MINUTO_DE_AUDIO,
  TOKENS_POR_CREDITO,
  TOPE_DE_SEGUNDOS,
  costoDeLaNota,
  esNotaDeVozTranscribible,
  porQueNoSeTranscribio,
  laMarcaVieja,
  queHacerConLaNota,
} from "./.compilado/transcripcion-de-voz.js";

// ── El costo ────────────────────────────────────────────────────────────────

test("un minuto cuesta la tarifa, y en tokens es la tarifa por 3085", () => {
  const c = costoDeLaNota(60);
  assert.equal(c.creditos, CREDITOS_POR_MINUTO_DE_AUDIO);
  assert.equal(c.tokens, CREDITOS_POR_MINUTO_DE_AUDIO * TOKENS_POR_CREDITO);
});

test("se cobra PRORRATEADO, no por minuto empezado", () => {
  // Media nota de minuto cuesta media tarifa, no una entera.
  assert.equal(costoDeLaNota(30).creditos, CREDITOS_POR_MINUTO_DE_AUDIO / 2);
  // Y una de 4 segundos no cuesta un minuto: eso seria quince veces de mas.
  assert.ok(costoDeLaNota(4).creditos < CREDITOS_POR_MINUTO_DE_AUDIO);
});

test("NUNCA cuesta cero: con `floor` una nota corta se transcribiria gratis", () => {
  for (const segundos of [1, 2, 3, 5, 9]) {
    assert.ok(costoDeLaNota(segundos).creditos >= 1, `${segundos}s dio 0`);
  }
});

test("el redondeo es hacia ARRIBA, una sola vez y al final", () => {
  // 70 s = 7 creditos exactos a 6/min; 71 s pasa de 7,1 y sube a 8.
  assert.equal(costoDeLaNota(70).creditos, 7);
  assert.equal(costoDeLaNota(71).creditos, 8);
});

test("los tokens son un entero, que es lo que admite la columna", () => {
  for (const s of [1, 7, 33, 59, 61, 599]) {
    assert.ok(Number.isInteger(costoDeLaNota(s).tokens), `${s}s dio decimales`);
  }
});

test("una duracion imposible no revienta ni sale gratis", () => {
  for (const malo of [0, -5, NaN, Infinity]) {
    const c = costoDeLaNota(malo);
    assert.equal(c.creditos, 1);
    assert.equal(c.tokens, TOKENS_POR_CREDITO);
  }
});

// ── Que hacer con la nota ───────────────────────────────────────────────────

test("una nota normal con creditos se transcribe", () => {
  const q = queHacerConLaNota({ segundos: 30, saldo: { estado: "quedan", creditos: 1000 } });
  assert.equal(q.hacer, "transcribir");
  assert.equal(q.costo.creditos, 3);
});

test("una nota muy larga NO se transcribe, y se marca para no reintentarla", () => {
  const q = queHacerConLaNota({ segundos: TOPE_DE_SEGUNDOS + 1, saldo: { estado: "quedan", creditos: 999999 } });
  assert.equal(q.hacer, "saltar");
  assert.equal(q.motivo, "muy_larga");
});

test("y el tope se SUPERA, no se iguala: una nota justo en el tope entra", () => {
  const q = queHacerConLaNota({ segundos: TOPE_DE_SEGUNDOS, saldo: { estado: "quedan", creditos: 999999 } });
  assert.equal(q.hacer, "transcribir");
});

test("una nota muy larga se salta ANTES de mirar creditos: la decision no cuesta", () => {
  // Sin creditos y muy larga: manda «muy larga», que es lo permanente.
  const q = queHacerConLaNota({ segundos: TOPE_DE_SEGUNDOS + 60, saldo: { estado: "quedan", creditos: 0 } });
  assert.equal(q.hacer, "saltar");
});

test("sin creditos es ESPERAR, no saltar: no deja marca", () => {
  const q = queHacerConLaNota({ segundos: 60, saldo: { estado: "quedan", creditos: 0 } });
  assert.equal(q.hacer, "esperar");
  assert.equal(q.porque, "sin_creditos");
});

test("y con MENOS de lo que cuesta, tampoco: no se transcribe a medias", () => {
  // 60 s cuestan 6 creditos. Con 5 no alcanza.
  assert.equal(queHacerConLaNota({ segundos: 60, saldo: { estado: "quedan", creditos: 5 } }).hacer, "esperar");
  assert.equal(queHacerConLaNota({ segundos: 60, saldo: { estado: "quedan", creditos: 6 } }).hacer, "transcribir");
});

test("ilimitados (`null`) se transcribe sin descontar", () => {
  const q = queHacerConLaNota({ segundos: 120, saldo: { estado: "ilimitado" } });
  assert.equal(q.hacer, "transcribir");
});

test("`null` NO es cero: son dos respuestas distintas", () => {
  // Es la familia de `Number(null) es 0`: confundirlos aqui dejaria a las
  // cuentas con llave propia sin transcribir nada.
  assert.equal(queHacerConLaNota({ segundos: 120, saldo: { estado: "ilimitado" } }).hacer, "transcribir");
  assert.equal(queHacerConLaNota({ segundos: 120, saldo: { estado: "quedan", creditos: 0 } }).hacer, "esperar");
});

// ── Que es una nota de voz ──────────────────────────────────────────────────

test("la nota de voz del ASESOR tambien se transcribe: es lo que hay que revisar", () => {
  assert.equal(esNotaDeVozTranscribible({ fromMe: true, audio: { ptt: true, seconds: 10 } }), true);
  assert.equal(esNotaDeVozTranscribible({ fromMe: true, audio: { seconds: 10 } }), true);
  // Un archivo de audio que manda el asesor sigue sin ser una nota.
  assert.equal(esNotaDeVozTranscribible({ fromMe: true, audio: { ptt: false, seconds: 240 } }), false);
});

test("un archivo de audio adjunto (`ptt: false`) tampoco", () => {
  // Una cancion de cuatro minutos no es una nota de voz.
  assert.equal(esNotaDeVozTranscribible({ fromMe: false, audio: { ptt: false, seconds: 240 } }), false);
});

test("sin `ptt` se acepta: es lo que llega de casi todos los proveedores", () => {
  assert.equal(esNotaDeVozTranscribible({ fromMe: false, audio: { seconds: 10 } }), true);
});

test("lo que no es audio no entra", () => {
  assert.equal(esNotaDeVozTranscribible({ fromMe: false, audio: null }), false);
  assert.equal(esNotaDeVozTranscribible({ fromMe: false }), false);
});

// ── Lo que se lee debajo del audio ──────────────────────────────────────────

/**
 * Este caso llamaba a `porQueNoHayTexto`, que dejo de existir cuando los dos
 * motivos de antes se convirtieron en los ocho de `NoSeTranscribio`. Asi que
 * el banco entero **no arrancaba** —se caia al importar, antes de ejercer un
 * solo caso—, y eso no se lee como un fallo: se lee como que aqui no hay nada
 * que probar. Se actualiza a la lista de hoy, y ahora corre desde
 * `scripts/banco-saldo-de-la-cuenta.sh`.
 */
test("todos los motivos dicen algo que se entiende sin saber nada de esto", () => {
  const TODOS = [
    "sin_linea",
    "no_es_nota",
    "sin_audio",
    "muy_larga",
    "sin_creditos",
    "sin_bolsa",
    "sin_ia",
    "no_bajo",
    "no_transcribio",
  ];
  for (const motivo of TODOS) {
    const texto = porQueNoSeTranscribio(motivo);
    assert.ok(texto && texto.length > 0, `${motivo} no dice nada`);
    // Y ninguno dice «error»: no es un error del asesor ni algo que pueda
    // arreglar sabiendo que algo fallo.
    assert.ok(!/error/i.test(texto), `${motivo} habla de un error`);
  }
  assert.match(porQueNoSeTranscribio("muy_larga"), /larga/i);

  // La marca VIEJA que quedo escrita en filas de produccion sigue leyendose:
  // `muy_larga` se explica y `fallo` vuelve a ofrecer el boton.
  assert.ok(laMarcaVieja("muy_larga").explicar);
  assert.equal(laMarcaVieja("fallo").ofrecerElBoton, true);
  assert.equal(laMarcaVieja(null).ofrecerElBoton, true);
});
