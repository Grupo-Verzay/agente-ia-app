/**
 * Reuniones por cuenta: quién puede qué, cuándo caduca y cuánto duró.
 *
 * Lo que este banco protege, y los cinco son formas de que la pantalla mienta
 * o de que se abra algo que no debía:
 *
 *   1. **Una sala de otra cuenta NO es mía.** Es lo único que hace que una
 *      cuenta cliente vea y cree solo lo suyo.
 *   2. **Un `agente` SÍ abre reuniones.** Pedirle que mande habría sido
 *      quitarle algo que ya tenía en los canales.
 *   3. **Pero no toca la sala de otro.** Revocar echa a quien esté dentro.
 *   4. **La caducidad se mueve DESDE AHORA.** Medida desde la creación,
 *      alargar una sala vieja no daría casi nada.
 *   5. **El fin de una reunión NO es `salidoEn`.** Cuando todos cierran la
 *      pestaña a la vez no queda nadie que lo escriba.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc -p lib/__tests__/tsconfig.banco.json
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  puedeAbrirUnaReunion,
  esDeMiCuenta,
  esDeMiFamilia,
  puedeAdministrarLaSala,
  cuandoTermino,
  cuantoDuro,
  comoSeLeeLaDuracion,
} from "./.compilado/lib/reuniones-de-la-cuenta.js";
import {
  DURACIONES,
  DURACION_POR_DEFECTO,
  SIN_CADUCIDAD,
  comoSeLeeLaCaducidad,
  comoEstaLaSala,
  cuandoCaduca,
  cuandoCaducaAlCambiar,
  duracionesQuePuedeElegir,
  esUnaDuracion,
  laDuracionQueSePuede,
} from "./.compilado/lib/sala-de-video.js";

const CUENTA = "cuenta-1";
const OTRA = "cuenta-2";

/** Alguien del equipo que llega por `owner_id`: su cuenta es la de su dueño. */
const agente = { personaId: "p-agente", cuentaId: CUENTA, manda: false };
/** Quien administra: dueño, `administrador` del equipo o super admin. */
const jefa = { personaId: "p-jefa", cuentaId: CUENTA, manda: true };
/** Una cuenta vinculada: SU fila no cuelga de nadie, su cuenta es ella misma. */
const vinculada = { personaId: "p-vinculada", cuentaId: OTRA, manda: true };

const salaDeLaCuenta = { cuentaId: CUENTA, canalId: null, anfitrionId: "p-agente" };

test("una cuenta ve solo SUS salas", () => {
  assert.equal(esDeMiCuenta(salaDeLaCuenta, CUENTA), true);
  assert.equal(esDeMiCuenta(salaDeLaCuenta, OTRA), false);
  // Y una cuenta vacía no alcanza nada: sin eso, una sesión a medio resolver
  // se llevaría por delante todas las salas sin cuenta.
  assert.equal(esDeMiCuenta({ cuentaId: "" }, ""), false);
  assert.equal(esDeMiCuenta(salaDeLaCuenta, "   "), false);
});

test("una sala se ve si es de MI FAMILIA, no solo de mi cuenta", () => {
  // La familia de la casa: la madre y dos hijas vinculadas.
  const MADRE = "cuenta-madre";
  const HIJA_A = "cuenta-hija-a";
  const HIJA_B = "cuenta-hija-b";
  const familia = [MADRE, HIJA_A, HIJA_B];

  const salaDeLaMadre = { cuentaId: MADRE };
  const salaDeUnaHija = { cuentaId: HIJA_A };
  const salaDeFuera = { cuentaId: "cuenta-ajena" };

  // La madre ve las salas de las tres cuentas de su familia.
  assert.equal(esDeMiFamilia(salaDeLaMadre, familia), true);
  assert.equal(esDeMiFamilia(salaDeUnaHija, familia), true);
  assert.equal(esDeMiFamilia({ cuentaId: HIJA_B }, familia), true);

  // Alguien de fuera de la familia no ve ninguna.
  assert.equal(esDeMiFamilia(salaDeFuera, familia), false);

  // Y una sala sin cuenta, o una familia vacía, no alcanzan nada: sin eso una
  // sesión a medio resolver se llevaría por delante salas ajenas.
  assert.equal(esDeMiFamilia({ cuentaId: "" }, familia), false);
  assert.equal(esDeMiFamilia(salaDeLaMadre, []), false);
  assert.equal(esDeMiFamilia({ cuentaId: "  " }, familia), false);
});

test("administrar una sala de OTRA cuenta de la familia: solo la MADRE", () => {
  const MADRE = "cuenta-madre";
  const HIJA_A = "cuenta-hija-a";
  const HIJA_B = "cuenta-hija-b";
  const familia = { raiz: MADRE, cuentas: [MADRE, HIJA_A, HIJA_B] };

  // Quien administra la cuenta madre (la raíz): manda sobre las salas de sus
  // hijas, que es lo que la deja moderar y revocar sin cambiar de cuenta.
  const madreAdmin = { personaId: "p-madre", cuentaId: MADRE, manda: true };
  const salaDeLaHija = { cuentaId: HIJA_A, canalId: null, anfitrionId: "otro" };
  assert.equal(puedeAdministrarLaSala(salaDeLaHija, madreAdmin, familia), true);

  // El administrador de una HIJA no manda sobre la sala de una hermana: su rol
  // es en su cuenta, no en la de al lado. Sin esta mitad, cualquier admin de la
  // familia le cortaría la reunión a cualquier otra cuenta.
  const hijaAdmin = { personaId: "p-hija-a", cuentaId: HIJA_A, manda: true };
  const salaDeLaHermana = { cuentaId: HIJA_B, canalId: null, anfitrionId: "otro" };
  assert.equal(puedeAdministrarLaSala(salaDeLaHermana, hijaAdmin, familia), false);
  // Ni sobre la de la madre.
  const salaDeLaMadre = { cuentaId: MADRE, canalId: null, anfitrionId: "otro" };
  assert.equal(puedeAdministrarLaSala(salaDeLaMadre, hijaAdmin, familia), false);

  // Pero sí sobre la SUYA, como siempre.
  const salaPropiaDeLaHija = { cuentaId: HIJA_A, canalId: null, anfitrionId: "otro" };
  assert.equal(puedeAdministrarLaSala(salaPropiaDeLaHija, hijaAdmin, familia), true);

  // El anfitrión manda sobre la suya venga de donde venga, aunque no administre.
  const invitadaAnfitriona = { personaId: "p-x", cuentaId: HIJA_B, manda: false };
  assert.equal(
    puedeAdministrarLaSala({ cuentaId: HIJA_A, anfitrionId: "p-x" }, invitadaAnfitriona, familia),
    true,
  );

  // Y sin familia resuelta, solo la propia cuenta: se ve de menos, nunca de más.
  assert.equal(puedeAdministrarLaSala(salaDeLaHija, madreAdmin), false);
});

test("un agente SÍ puede abrir una reunión", () => {
  assert.equal(puedeAbrirUnaReunion(agente), true);
  assert.equal(puedeAbrirUnaReunion(jefa), true);
  // Sin cuenta resuelta no hay bajo qué guardarla.
  assert.equal(puedeAbrirUnaReunion(null), false);
  assert.equal(puedeAbrirUnaReunion({ personaId: "x", cuentaId: "", manda: true }), false);
});

test("administrar una sala: el anfitrión, y quien manda en SU cuenta", () => {
  // El anfitrión, aunque no mande.
  assert.equal(puedeAdministrarLaSala(salaDeLaCuenta, agente), true);
  // Quien administra la cuenta, aunque no sea el anfitrión: sin esto, una sala
  // de alguien que ya se fue del equipo no la cierra nadie nunca.
  assert.equal(puedeAdministrarLaSala(salaDeLaCuenta, jefa), true);
  // Otro del equipo que ni es el anfitrión ni manda: no.
  const otroAgente = { personaId: "p-otro", cuentaId: CUENTA, manda: false };
  assert.equal(puedeAdministrarLaSala(salaDeLaCuenta, otroAgente), false);
  // Y mandar en OTRA cuenta no vale aquí, por mucho que mande.
  assert.equal(puedeAdministrarLaSala(salaDeLaCuenta, vinculada), false);
  assert.equal(puedeAdministrarLaSala(salaDeLaCuenta, null), false);
});

test("la caducidad por defecto cubre la reunión de MAÑANA", () => {
  // El fallo que esto arregla: un enlace creado hoy a las 9 con un día llegaba
  // caducado a una reunión de mañana por la tarde.
  const hoy9 = Date.parse("2026-09-20T09:00:00Z");
  const mananaTarde = Date.parse("2026-09-21T16:00:00Z");
  assert.ok(cuandoCaduca("24h", hoy9).getTime() < mananaTarde, "24h no llegaba");
  assert.ok(
    cuandoCaduca(DURACION_POR_DEFECTO, hoy9).getTime() > mananaTarde,
    "la de por defecto tiene que llegar a mañana por la tarde",
  );
});

test("lo que no está en la lista cae en la de por defecto, NUNCA en «no caduca»", () => {
  // Es la mitad que de verdad protege ahora que «No caduca» existe: caer en un
  // enlace permanente por no reconocer un valor sería exactamente el enlace
  // que nadie sabe que sigue abierto.
  const ahora = Date.parse("2026-09-20T09:00:00Z");
  const porDefecto = cuandoCaduca(DURACION_POR_DEFECTO, ahora).getTime();
  for (const raro of ["siempre", "", null, undefined, 0, {}, "99d"]) {
    assert.equal(cuandoCaduca(raro, ahora)?.getTime(), porDefecto);
  }
  assert.notEqual(DURACION_POR_DEFECTO, SIN_CADUCIDAD);
  // Y las que tienen fecha siguen con su techo de 30 días.
  for (const d of DURACIONES) {
    if (d.horas === null) continue;
    assert.ok(d.horas > 0 && d.horas <= 24 * 30, `${d.valor} se sale del techo`);
  }
  // La única sin fecha es la que lo dice.
  const sinFecha = DURACIONES.filter((d) => d.horas === null).map((d) => d.valor);
  assert.deepEqual(sinFecha, [SIN_CADUCIDAD]);
});

test("«No caduca» devuelve NULL, y null no es una fecha rara", () => {
  const ahora = Date.parse("2026-09-20T09:00:00Z");
  assert.equal(cuandoCaduca(SIN_CADUCIDAD, ahora), null);
  assert.equal(cuandoCaducaAlCambiar(SIN_CADUCIDAD, ahora), null);
  // Y una sala sin fecha está ABIERTA, no caducada: si se leyera al revés, el
  // enlace fijo de atención dejaría de valer al minuto de crearlo.
  assert.equal(comoEstaLaSala({ expiraEn: null, revocadaEn: null }, ahora), "abierta");
  // Revocar sí la cierra: es una decisión que alguien tomó.
  assert.equal(
    comoEstaLaSala({ expiraEn: null, revocadaEn: "2026-09-20T08:00:00Z" }, ahora),
    "revocada",
  );
});

test("«No caduca» solo la elige quien ADMINISTRA la cuenta", () => {
  // Las dos mitades: no se le ofrece…
  const paraCualquiera = duracionesQuePuedeElegir(false).map((d) => d.valor);
  const paraQuienManda = duracionesQuePuedeElegir(true).map((d) => d.valor);
  assert.ok(!paraCualquiera.includes(SIN_CADUCIDAD));
  assert.ok(paraQuienManda.includes(SIN_CADUCIDAD));
  assert.equal(paraQuienManda.length, paraCualquiera.length + 1);

  // …y esconder la opción NO cierra la petición directa: el servidor la
  // rechaza igual, y con un motivo distinto del de una duración inventada.
  assert.deepEqual(laDuracionQueSePuede(SIN_CADUCIDAD, false), {
    ok: false,
    motivo: "no_puede",
  });
  assert.deepEqual(laDuracionQueSePuede(SIN_CADUCIDAD, true), {
    ok: true,
    valor: SIN_CADUCIDAD,
  });
  assert.deepEqual(laDuracionQueSePuede("99d", true), { ok: false, motivo: "desconocida" });
  // Lo normal pasa sin mandar en nada.
  assert.deepEqual(laDuracionQueSePuede("7d", false), { ok: true, valor: "7d" });
});

test("encadenadas: lo que se OFRECE es exactamente lo que el servidor acepta", () => {
  // Probar cada mitad por su cuenta es lo que deja un desplegable ofreciendo
  // algo que la acción luego rechaza — el «menú abierto, puerta cerrada».
  for (const manda of [false, true]) {
    for (const d of duracionesQuePuedeElegir(manda)) {
      assert.deepEqual(
        laDuracionQueSePuede(d.valor, manda),
        { ok: true, valor: d.valor },
        `${d.valor} se ofrece con manda=${manda} y el servidor la rechaza`,
      );
    }
  }
});

test("la caducidad se lee ENTERA, con su prefijo dentro", () => {
  // El prefijo va dentro y no escrito en cada pantalla: con un «Caduca »
  // delante, un enlace permanente saldría como «Caduca No caduca».
  const ahora = Date.parse("2026-09-20T09:00:00Z");
  assert.equal(comoSeLeeLaCaducidad(null, ahora), "No caduca");
  assert.equal(comoSeLeeLaCaducidad(undefined, ahora), "No caduca");
  assert.equal(comoSeLeeLaCaducidad("2026-09-20T12:00:00Z", ahora), "Caduca en 3 h");
  assert.equal(comoSeLeeLaCaducidad("2026-09-21T09:00:00Z", ahora), "Caduca mañana");
  assert.equal(comoSeLeeLaCaducidad("2026-09-27T09:00:00Z", ahora), "Caduca en 7 días");
  assert.equal(comoSeLeeLaCaducidad("2026-09-20T08:00:00Z", ahora), "Caduca ya");
  // Una marca rota NO se lee como «no caduca»: eso sería decir que un enlace
  // es permanente porque su fecha no se entiende.
  assert.equal(comoSeLeeLaCaducidad("ayer", ahora), "No caduca");
});

test("`esUnaDuracion` reconoce exactamente la lista", () => {
  for (const d of DURACIONES) assert.equal(esUnaDuracion(d.valor), true);
  for (const raro of ["siempre", "", null, undefined, 7, "7D"]) {
    assert.equal(esUnaDuracion(raro), false);
  }
  // «nunca» SÍ existe ahora: lo que decide si se puede usar es otra pregunta.
  assert.equal(esUnaDuracion(SIN_CADUCIDAD), true);
});

test("cambiar la caducidad se mide DESDE AHORA, no desde que se creó", () => {
  const creada = Date.parse("2026-09-01T10:00:00Z");
  const ahora = Date.parse("2026-09-07T10:00:00Z"); // seis días después
  const nueva = cuandoCaducaAlCambiar("7d", ahora).getTime();
  // Desde la creación, «7 días» dejaría el enlace caducando mañana.
  assert.ok(nueva > cuandoCaduca("7d", creada).getTime());
  assert.equal(nueva, ahora + 7 * 24 * 3600 * 1000);
});

test("el fin de la reunión sale del último LATIDO cuando nadie se despidió", () => {
  // El caso normal: todos cierran la pestaña a la vez y nadie escribe
  // `salidoEn`. Midiendo por `salidoEn` esta reunión no tendría fin.
  const sinDespedirse = [
    { salidoEn: null, vistoEn: "2026-09-20T10:30:00Z" },
    { salidoEn: null, vistoEn: "2026-09-20T10:31:00Z" },
  ];
  assert.equal(cuandoTermino(sinDespedirse)?.toISOString(), "2026-09-20T10:31:00.000Z");

  // Con despedida, gana la marca mayor de las dos, sea cual sea.
  const mezcla = [
    { salidoEn: "2026-09-20T10:45:00Z", vistoEn: "2026-09-20T10:44:00Z" },
    { salidoEn: null, vistoEn: "2026-09-20T10:31:00Z" },
  ];
  assert.equal(cuandoTermino(mezcla)?.toISOString(), "2026-09-20T10:45:00.000Z");

  // Sin nadie, no hay fin que inventar.
  assert.equal(cuandoTermino([]), null);
  assert.equal(cuandoTermino([{ salidoEn: null, vistoEn: null }]), null);
  // Y una marca rota no cuenta como fin.
  assert.equal(cuandoTermino([{ salidoEn: "ayer", vistoEn: null }]), null);
});

test("una sala en la que no entró nadie NO dura cero: no tiene duración", () => {
  assert.equal(cuantoDuro(null, "2026-09-20T10:31:00Z"), null);
  assert.equal(cuantoDuro("2026-09-20T10:00:00Z", null), null);
  assert.equal(cuantoDuro(null, null), null);
  // Y lo que sí se usó se cuenta desde que entró el PRIMERO.
  assert.equal(cuantoDuro("2026-09-20T10:00:00Z", "2026-09-20T10:31:30Z"), 1890);
  // Un fin anterior al principio —relojes que saltan— es 0, nunca negativo.
  assert.equal(cuantoDuro("2026-09-20T10:31:00Z", "2026-09-20T10:00:00Z"), 0);
});

test("la duración se lee como la de una llamada", () => {
  assert.equal(comoSeLeeLaDuracion(null), "—");
  assert.equal(comoSeLeeLaDuracion(0), "0:00");
  assert.equal(comoSeLeeLaDuracion(8), "0:08");
  assert.equal(comoSeLeeLaDuracion(440), "7:20");
  assert.equal(comoSeLeeLaDuracion(3849), "1:04:09");
});

test("encadenadas: una reunión de verdad, de punta a punta", () => {
  // Lo que de verdad importa es que las tres se usen juntas como en la
  // consulta: probar cada una por su cuenta deja pasar el desajuste.
  const participantes = [
    { entradoEn: "2026-09-20T10:00:00Z", salidoEn: null, vistoEn: "2026-09-20T10:29:00Z" },
    { entradoEn: "2026-09-20T10:05:00Z", salidoEn: "2026-09-20T10:30:00Z", vistoEn: "2026-09-20T10:29:30Z" },
  ];
  const primero = participantes
    .map((p) => p.entradoEn)
    .filter(Boolean)
    .sort()[0];
  const fin = cuandoTermino(participantes);
  assert.equal(comoSeLeeLaDuracion(cuantoDuro(primero, fin)), "30:00");
});
