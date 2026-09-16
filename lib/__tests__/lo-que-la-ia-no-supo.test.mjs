/**
 * Banco de pruebas de `lib/lo-que-la-ia-no-supo.ts`.
 *
 * Corre sobre el modulo REAL, compilado antes a JS:
 *
 *   npx tsc lib/lo-que-la-ia-no-supo.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --moduleResolution bundler
 *   node --test lib/__tests__/lo-que-la-ia-no-supo.test.mjs
 *
 * Lo que se comprueba aqui es lo unico que decide la pantalla: que texto
 * representa a un grupo, que se cuenta y en que orden sale. Agrupar por
 * significado NO es de aqui — eso lo hace el backend al guardar, porque abrir
 * el informe no puede gastar IA.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  agruparLasPreguntas,
  elResumenDelInforme,
} from "./.compilado/lo-que-la-ia-no-supo.js";

const fila = (grupoId, pregunta, caso, iso) => ({
  grupoId,
  pregunta,
  caso,
  createdAt: new Date(iso),
});

// ── El texto del grupo ───────────────────────────────────────────────────────

test("el grupo se llama como su PRIMERA pregunta, no como la ultima", () => {
  const grupos = agruparLasPreguntas([
    fila("g1", "hacen envios a Medellin?", "dijo_que_no_sabia", "2026-09-01T10:00:00Z"),
    fila("g1", "envian a medellin", "dijo_que_no_sabia", "2026-09-05T10:00:00Z"),
  ]);
  assert.equal(grupos.length, 1);
  // Si mandara la ultima, el titulo del grupo cambiaria solo cada vez que
  // alguien lo preguntara, y el informe dejaria de poder compararse con el de
  // la semana pasada.
  assert.equal(grupos[0].pregunta, "hacen envios a Medellin?");
  assert.deepEqual(grupos[0].variantes, ["envian a medellin"]);
});

test("el orden en que lleguen las filas no cambia nada", () => {
  const alReves = agruparLasPreguntas([
    fila("g1", "envian a medellin", "dijo_que_no_sabia", "2026-09-05T10:00:00Z"),
    fila("g1", "hacen envios a Medellin?", "dijo_que_no_sabia", "2026-09-01T10:00:00Z"),
  ]);
  assert.equal(alReves[0].pregunta, "hacen envios a Medellin?");
});

test("una variante repetida no se lista dos veces, y el tope son cinco", () => {
  const filas = [fila("g1", "la primera", "dijo_que_no_sabia", "2026-09-01T10:00:00Z")];
  for (let i = 0; i < 9; i++) {
    filas.push(
      fila("g1", `variante ${i % 7}`, "dijo_que_no_sabia", `2026-09-0${(i % 8) + 1}T12:00:00Z`),
    );
  }
  const [g] = agruparLasPreguntas(filas);
  assert.equal(g.variantes.length, 5);
  assert.equal(new Set(g.variantes).size, 5);
});

// ── Lo que se cuenta ─────────────────────────────────────────────────────────

test("los dos casos se cuentan aparte ademas de juntos", () => {
  const [g] = agruparLasPreguntas([
    fila("g1", "tienen garantia?", "escalo_sin_saber", "2026-09-01T10:00:00Z"),
    fila("g1", "hay garantia", "dijo_que_no_sabia", "2026-09-02T10:00:00Z"),
    fila("g1", "cuanta garantia dan", "dijo_que_no_sabia", "2026-09-03T10:00:00Z"),
  ]);
  assert.equal(g.veces, 3);
  assert.equal(g.porEscalado, 1);
  assert.equal(g.porNoSaber, 2);
});

test("la ultima vez es la mas reciente del grupo", () => {
  const [g] = agruparLasPreguntas([
    fila("g1", "a", "dijo_que_no_sabia", "2026-09-01T10:00:00Z"),
    fila("g1", "b", "dijo_que_no_sabia", "2026-09-09T10:00:00Z"),
    fila("g1", "c", "dijo_que_no_sabia", "2026-09-04T10:00:00Z"),
  ]);
  assert.equal(g.ultimaVez.toISOString(), "2026-09-09T10:00:00.000Z");
});

// ── Las que no se pudieron agrupar ───────────────────────────────────────────

test("sin grupo, cada fila sale suelta: es mejor que perderla", () => {
  // Pasa cuando la cuenta no tiene clave de OpenAI: el backend guarda la
  // pregunta igual, sin embedding y sin grupo.
  const grupos = agruparLasPreguntas([
    fila(null, "una cosa rara", "dijo_que_no_sabia", "2026-09-01T10:00:00Z"),
    fila(null, "otra cosa rara", "dijo_que_no_sabia", "2026-09-02T10:00:00Z"),
  ]);
  assert.equal(grupos.length, 2);
  assert.equal(elResumenDelInforme(grupos).veces, 2);
});

test("dos sueltas con el MISMO texto y distinta fecha no se funden", () => {
  // No se puede saber si son la misma pregunta: justamente lo que decide eso es
  // el embedding, y estas no lo tienen. Fundirlas seria inventar la agrupacion
  // aqui, que es lo que este fichero no hace.
  const grupos = agruparLasPreguntas([
    fila(null, "misma", "dijo_que_no_sabia", "2026-09-01T10:00:00Z"),
    fila(null, "misma", "dijo_que_no_sabia", "2026-09-02T10:00:00Z"),
  ]);
  assert.equal(grupos.length, 2);
});

// ── El orden y el titular ────────────────────────────────────────────────────

test("manda lo mas preguntado, y a igualdad lo mas reciente", () => {
  const grupos = agruparLasPreguntas([
    fila("poco", "una vez", "dijo_que_no_sabia", "2026-09-09T10:00:00Z"),
    fila("mucho", "muchas veces", "dijo_que_no_sabia", "2026-09-01T10:00:00Z"),
    fila("mucho", "muchas veces otra", "dijo_que_no_sabia", "2026-09-02T10:00:00Z"),
    fila("otropoco", "una vez vieja", "dijo_que_no_sabia", "2026-09-03T10:00:00Z"),
  ]);
  assert.deepEqual(
    grupos.map((g) => g.grupoId),
    ["mucho", "poco", "otropoco"],
  );
});

test("el titular separa VECES de PREGUNTAS DISTINTAS", () => {
  const grupos = agruparLasPreguntas([
    fila("g1", "a", "escalo_sin_saber", "2026-09-01T10:00:00Z"),
    fila("g1", "b", "dijo_que_no_sabia", "2026-09-02T10:00:00Z"),
    fila("g2", "c", "escalo_sin_saber", "2026-09-03T10:00:00Z"),
  ]);
  const resumen = elResumenDelInforme(grupos);
  // 3 veces sin respuesta, pero solo 2 cosas que arreglar. Enseñar solo el 3
  // haria pensar que hay tres huecos distintos en el entrenamiento.
  assert.deepEqual(resumen, { veces: 3, preguntas: 2, porEscalado: 2 });
});

test("sin nada, el informe esta vacio y no revienta", () => {
  assert.deepEqual(agruparLasPreguntas([]), []);
  assert.deepEqual(elResumenDelInforme([]), { veces: 0, preguntas: 0, porEscalado: 0 });
});

test("una fecha que llega como texto se entiende igual", () => {
  const grupos = agruparLasPreguntas([
    { grupoId: "g1", pregunta: "a", caso: "dijo_que_no_sabia", createdAt: "2026-09-01T10:00:00Z" },
    { grupoId: "g1", pregunta: "b", caso: "dijo_que_no_sabia", createdAt: "2026-09-08T10:00:00Z" },
  ]);
  assert.equal(grupos[0].pregunta, "a");
  assert.equal(grupos[0].ultimaVez.toISOString(), "2026-09-08T10:00:00.000Z");
});
