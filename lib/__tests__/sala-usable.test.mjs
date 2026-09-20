/**
 * Lo que decide sobre una reunion ya montada: quien va en grande, de que
 * tamano se ve la ventana y que se guarda del chat.
 *
 * Las tres son puras a proposito, y las tres son de las que se equivocan **sin
 * dar ningun error**:
 *
 *   1. **Quien habla.** Sin histeresis, el recuadro grande salta diez veces por
 *      segundo y la reunion parpadea. Eso no se prueba con un navegador: se
 *      prueba dandole niveles y un reloj, que es lo que hace este banco.
 *   2. **El tamano de la ventana.** `completa` no se puede restaurar al abrir
 *      —el navegador la niega fuera de un gesto de la persona— asi que
 *      recordarla dejaria la reunion pintada como completa dentro de una pagina
 *      que no lo esta.
 *   3. **El mensaje del chat.** Viaja en CADA vuelta del reloj de todos los
 *      demas, asi que el tope no es cosmetico.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc -p lib/__tests__/tsconfig.banco.json
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MINIMO_EN_GRANDE_MS,
  NIVEL_MINIMO,
  VENTAJA_PARA_CAMBIAR,
  elNivelDeLasMuestras,
  elQueHabla,
} from "./.compilado/lib/voz-activa.js";
import {
  ESTADOS_DE_LA_VENTANA,
  VENTANA_POR_DEFECTO,
  alAmpliar,
  alReducir,
  alSalirDePantallaCompleta,
  esEstadoDeVentana,
  quiereLaPantallaCompleta,
  sePuedeArrastrar,
} from "./.compilado/lib/ventana-de-reunion.js";
import {
  TOPE_DEL_MENSAJE,
  comoSeGuardaElMensaje,
  hayQueObedecerElSilencio,
  laDistribucionQueSeVe,
  tieneLaManoLevantada,
  VIGENCIA_DEL_SILENCIO_MS,
  VIGENCIA_DE_LA_MANO_MS,
} from "./.compilado/lib/sala-de-video.js";

const ALTO = NIVEL_MINIMO * 10;
const BAJO = NIVEL_MINIMO * 2;

const habla = (id, nivel, mic = true) => ({ id, nivel, micEncendido: mic });

// ── Quien va en grande ──────────────────────────────────────────────────────

test("sin nadie en grande, se pone quien suena", () => {
  const r = elQueHabla({
    niveles: [habla("a", ALTO), habla("b", BAJO)],
    anterior: { id: null, desde: 0 },
    ahora: 1000,
    presentes: ["a", "b"],
  });
  assert.equal(r.id, "a");
});

test("el ruido de fondo NO cuenta como hablar", () => {
  // Por debajo del suelo no es voz, es la habitacion. Sin el suelo, en una
  // reunion en silencio el recuadro grande iria saltando entre quien tenga el
  // micro mas sensible.
  const r = elQueHabla({
    niveles: [habla("a", NIVEL_MINIMO / 2), habla("b", NIVEL_MINIMO / 3)],
    anterior: { id: null, desde: 0 },
    ahora: 1000,
    presentes: ["a", "b"],
  });
  // Nadie habla: se coge al primero para que el hueco grande no salga vacio.
  assert.equal(r.id, "a");
});

test("quien esta callado no gana el recuadro aunque su pista suene", () => {
  // A quien se silencia le sigue llegando su pista, con silencio dentro —y el
  // ruido del codec no es exactamente cero—. Sin mirar `micEncendido`, alguien
  // callado podria ganar el recuadro grande en una sala en silencio.
  const r = elQueHabla({
    niveles: [habla("a", ALTO, false), habla("b", BAJO, true)],
    anterior: { id: null, desde: 0 },
    ahora: 1000,
    presentes: ["a", "b"],
  });
  assert.equal(r.id, "b");
});

test("NO se cambia antes del rato minimo, por muy alto que suene el otro", () => {
  const puesto = { id: "a", desde: 1000 };
  const r = elQueHabla({
    niveles: [habla("a", BAJO), habla("b", ALTO * 5)],
    anterior: puesto,
    ahora: 1000 + MINIMO_EN_GRANDE_MS - 1,
    presentes: ["a", "b"],
  });
  assert.equal(r.id, "a", "una tos no puede llevarse el recuadro grande");
  assert.equal(r.desde, 1000, "y el rato no se reinicia");
});

test("pasado el rato minimo SI se cambia, con ventaja clara", () => {
  const r = elQueHabla({
    niveles: [habla("a", BAJO), habla("b", BAJO * VENTAJA_PARA_CAMBIAR * 2)],
    anterior: { id: "a", desde: 1000 },
    ahora: 1000 + MINIMO_EN_GRANDE_MS + 1,
    presentes: ["a", "b"],
  });
  assert.equal(r.id, "b");
});

test("sin ventaja clara NO se cambia, aunque haya pasado el rato", () => {
  // Dos personas hablando a la vez con volumenes parecidos dejan el recuadro
  // quieto en vez de repartirselo a cachos.
  const r = elQueHabla({
    niveles: [habla("a", ALTO), habla("b", ALTO * 1.1)],
    anterior: { id: "a", desde: 1000 },
    ahora: 1000 + MINIMO_EN_GRANDE_MS + 1,
    presentes: ["a", "b"],
  });
  assert.equal(r.id, "a");
});

test("en SILENCIO se conserva a quien hablaba", () => {
  // Entre dos frases de la misma persona hay medio segundo de silencio.
  // Vaciando el recuadro ahi, parpadearia en cada coma.
  const r = elQueHabla({
    niveles: [habla("a", 0), habla("b", 0)],
    anterior: { id: "b", desde: 1000 },
    ahora: 9000,
    presentes: ["a", "b"],
  });
  assert.equal(r.id, "b");
  assert.equal(r.desde, 1000, "y sin reiniciarle el rato");
});

test("quien se va suelta el recuadro EN EL ACTO", () => {
  // No es histeresis: ya no hay a quien ensenar, y conservarlo dejaria el hueco
  // grande con el recuadro negro de alguien que cerro la pestana.
  const r = elQueHabla({
    niveles: [habla("a", ALTO)],
    anterior: { id: "b", desde: 1000 },
    ahora: 1100,
    presentes: ["a"],
  });
  assert.equal(r.id, "a");
});

test("una conversacion de ida y vuelta SIGUE a quien habla", () => {
  // La prueba que de verdad importa: encadenando vueltas, el recuadro tiene que
  // acabar en quien lleva hablando, no quedarse clavado en el primero.
  let estado = { id: null, desde: 0 };
  let ahora = 0;
  const paso = (quien) => {
    for (let i = 0; i < 40; i++) {
      ahora += 100;
      estado = elQueHabla({
        niveles: [habla("a", quien === "a" ? ALTO : 0), habla("b", quien === "b" ? ALTO : 0)],
        anterior: estado,
        ahora,
        presentes: ["a", "b"],
      });
    }
    return estado.id;
  };
  assert.equal(paso("a"), "a");
  assert.equal(paso("b"), "b");
  assert.equal(paso("a"), "a");
});

test("el nivel del silencio es CERO, no el maximo", () => {
  // Las muestras vienen centradas en 128. Sin restar ese centro antes de
  // elevar al cuadrado, el silencio saldria como el nivel mas alto posible y
  // todo el mundo estaria «hablando» siempre.
  const silencio = new Uint8Array(256).fill(128);
  assert.equal(elNivelDeLasMuestras(silencio), 0);

  const fuerte = new Uint8Array(256);
  for (let i = 0; i < fuerte.length; i++) fuerte[i] = i % 2 ? 255 : 0;
  assert.ok(elNivelDeLasMuestras(fuerte) > NIVEL_MINIMO * 10);

  assert.equal(elNivelDeLasMuestras(new Uint8Array(0)), 0, "sin muestras, cero");
});

// ── El tamano de la ventana ─────────────────────────────────────────────────

test("son TRES, y en escala de menor a mayor", () => {
  assert.deepEqual([...ESTADOS_DE_LA_VENTANA], ["pastilla", "maximizada", "completa"]);
  // El panel mediano flotante se fue: metia un escalon entre "ampliar" y estar
  // grande, asi que la primera pulsacion se quedaba a medias y parecia que el
  // boton no llegaba mas lejos.
  assert.equal(ESTADOS_DE_LA_VENTANA.includes("panel"), false);
});

test("se abre SIEMPRE grande, y eso es lo unico que habria que recordar", () => {
  // De los tres, `completa` la niega el navegador sin un gesto y `pastilla`
  // abre una reunion que no se ve empezar. O sea que una memoria del ultimo
  // estado solo podria devolver esto, que ya es la constante: por eso no hay
  // ninguna.
  assert.equal(VENTANA_POR_DEFECTO, "maximizada");
});

test("lo que no se reconoce no es un estado", () => {
  assert.equal(esEstadoDeVentana("gigante"), false);
  assert.equal(esEstadoDeVentana("panel"), false);
  assert.equal(esEstadoDeVentana(null), false);
  assert.equal(esEstadoDeVentana(7), false);
  for (const e of ESTADOS_DE_LA_VENTANA) assert.equal(esEstadoDeVentana(e), true);
});

test("la escala se para en los extremos, no da la vuelta", () => {
  // Una escala que salta de `completa` a `pastilla` hace desaparecer la reunion
  // justo cuando se esta intentando verla mejor. Y que se pare es lo que deja
  // esconder el boton en el ultimo escalon, comparandolo con el de ahora.
  assert.equal(alAmpliar("completa"), "completa");
  assert.equal(alReducir("pastilla"), "pastilla");
});

test("una pulsacion de ampliar desde la pastilla YA deja la reunion grande", () => {
  // Esto es lo que se reporto roto: con el panel en medio, la primera
  // pulsacion se quedaba en una ventana mediana flotante.
  assert.equal(alAmpliar("pastilla"), "maximizada");
  assert.equal(alAmpliar("maximizada"), "completa");
});

test("la escala recorre los tres en orden", () => {
  let e = "pastilla";
  const subiendo = [e];
  for (let i = 0; i < 2; i++) subiendo.push((e = alAmpliar(e)));
  assert.deepEqual(subiendo, [...ESTADOS_DE_LA_VENTANA]);

  let b = "completa";
  const bajando = [b];
  for (let i = 0; i < 2; i++) bajando.push((b = alReducir(b)));
  assert.deepEqual(bajando, [...ESTADOS_DE_LA_VENTANA].reverse());
});

test("salir de pantalla completa con Escape deja la reunion GRANDE", () => {
  // Quien pulso Escape queria salir del modo pantalla completa, no encoger la
  // reunion a una pastilla.
  assert.equal(alSalirDePantallaCompleta(), "maximizada");
  assert.equal(esEstadoDeVentana(alSalirDePantallaCompleta()), true);
});

test("solo la pastilla se arrastra", () => {
  assert.equal(sePuedeArrastrar("pastilla"), true);
  assert.equal(sePuedeArrastrar("maximizada"), false);
  assert.equal(sePuedeArrastrar("completa"), false);
});

test("solo `completa` le pide algo al navegador", () => {
  assert.equal(quiereLaPantallaCompleta("completa"), true);
  for (const e of ["pastilla", "maximizada"]) {
    assert.equal(quiereLaPantallaCompleta(e), false);
  }
});

// ── El chat ─────────────────────────────────────────────────────────────────

test("un mensaje vacio no se guarda", () => {
  assert.equal(comoSeGuardaElMensaje(""), null);
  assert.equal(comoSeGuardaElMensaje("   \n  "), null);
  assert.equal(comoSeGuardaElMensaje(null), null);
  assert.equal(comoSeGuardaElMensaje(7), null);
});

test("los saltos de linea se CONSERVAN, al reves que en un nombre", () => {
  // Aqui si se escribe en varias lineas —se pega un error, una direccion— y
  // aplastarlos convertiria lo pegado en un churro.
  assert.equal(comoSeGuardaElMensaje("uno\ndos"), "uno\ndos");
  // Lo que si se quita es el exceso: mas de dos seguidos es alguien dejando
  // hueco, no estructura.
  assert.equal(comoSeGuardaElMensaje("uno\n\n\n\n\ndos"), "uno\n\ndos");
});

test("el mensaje se acota, porque viaja en cada vuelta del reloj", () => {
  const largo = "x".repeat(TOPE_DEL_MENSAJE + 500);
  assert.equal(comoSeGuardaElMensaje(largo).length, TOPE_DEL_MENSAJE);
});

// ── El silencio y la mano ───────────────────────────────────────────────────

test("una orden de silencio CADUCA", () => {
  // Puesta para siempre, esa persona no podria volver a encender el micro
  // nunca: cada vuelta del reloj le traeria la orden otra vez.
  const ahora = 1_000_000;
  const vieja = new Date(ahora - VIGENCIA_DEL_SILENCIO_MS - 1).toISOString();
  assert.equal(hayQueObedecerElSilencio(vieja, null, ahora), false);

  const fresca = new Date(ahora - 1000).toISOString();
  assert.equal(hayQueObedecerElSilencio(fresca, null, ahora), true);
});

test("una orden ya obedecida no se vuelve a obedecer", () => {
  // Sin esto, quien decide volver a hablar se callaria solo en la vuelta
  // siguiente, una y otra vez, sin entender por que.
  const ahora = 1_000_000;
  const marca = new Date(ahora - 1000);
  const iso = marca.toISOString();
  assert.equal(hayQueObedecerElSilencio(iso, iso, ahora), false);
  assert.equal(hayQueObedecerElSilencio(iso, null, ahora), true);
});

test("sin orden no hay nada que obedecer", () => {
  assert.equal(hayQueObedecerElSilencio(null, null, 1000), false);
  assert.equal(hayQueObedecerElSilencio("no es una fecha", null, 1000), false);
});

test("una mano levantada se baja sola", () => {
  // Nadie vuelve a pulsar el boton para bajarla, asi que a los diez minutos la
  // reunion entera tendria la mano arriba y el icono dejaria de decir nada.
  const ahora = 1_000_000;
  assert.equal(
    tieneLaManoLevantada(new Date(ahora - VIGENCIA_DE_LA_MANO_MS - 1).toISOString(), ahora),
    false,
  );
  assert.equal(tieneLaManoLevantada(new Date(ahora - 5_000).toISOString(), ahora), true);
  assert.equal(tieneLaManoLevantada(null, ahora), false);
});

// ── El reparto de la pantalla ───────────────────────────────────────────────

test("con una sola persona manda la cuadricula, elija lo que elija", () => {
  // La vista de orador con cero miniaturas pintaria una tira vacia al lado del
  // unico recuadro: un hueco gris pidiendo explicacion.
  assert.equal(laDistribucionQueSeVe("orador", 1), "cuadricula");
  assert.equal(laDistribucionQueSeVe("orador", 0), "cuadricula");
  assert.equal(laDistribucionQueSeVe("orador", 2), "orador");
  assert.equal(laDistribucionQueSeVe("cuadricula", 4), "cuadricula");
});
