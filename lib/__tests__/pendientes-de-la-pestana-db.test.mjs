/**
 * El número de la pestaña, contra Postgres y con sus TRES fuentes.
 *
 * Lo que este banco protege no es una consulta: es que el icono **cuente lo
 * que dice que cuenta**. El fallo de partida era que no contaba ninguna de las
 * tres — chats sin leer, menciones del equipo y directos— y no había forma de
 * distinguirlo de «no hay nada que contar», porque sin pendientes el icono es
 * el de siempre.
 *
 * # Los dos modos, y qué demuestra el roto
 *
 * Con `MODO=viejo` la mitad de chats sale de donde salía: del store que **solo
 * escribe la bandeja**, o sea cero en cualquier pantalla que no sea Chats. Con
 * cinco conversaciones esperando respuesta sembradas en la base, ese modo
 * afirma que el icono **no se pinta**. Sin ese modo no se sabría si lo verde
 * de al lado es que se arregló la causa o que el caso no llegaba a ejercerla.
 *
 * Cómo se levanta: `scripts/banco-pendientes.sh` (Postgres de usar y tirar).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  contarChatsSinLeer,
  losChatsQueEsperan,
  loQuePuedeSonar,
  marcarLeido,
  elNumeroDeChats,
  loQueSePinta,
  db,
} from "./.compilado/pendientes/entrada-de-pendientes.js";

const VIEJO = process.env.MODO === "viejo";

/** Ids distintos en cada vuelta: la base del banco se reutiliza. */
const V = `v${Date.now().toString(36)}`;
const MADRE = `${V}-madre`;
const HIJA = `${V}-hija`;
const AJENA = `${V}-ajena`;
const AGENTE = `${V}-agente`;
const YO = `${V}-yo`;
const OTRA_PERSONA = `${V}-otra`;

const L_MADRE = `${V}_VENTAS`;
const L_HIJA = `${V}_ATENCION`;
const L_AJENA = `${V}_AJENA`;
const L_MUERTA = `${V}_VENTAS_V2`;

const T0 = new Date("2026-09-01T10:00:00Z");
const masTarde = (min) => new Date(T0.getTime() + min * 60_000);

async function tablas() {
  // Solo lo que tocan las consultas. Sin claves foraneas: lo que se prueba es
  // la consulta, no el esquema.
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "chat_conversations" (
      "id" BIGSERIAL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "instanceName" TEXT NOT NULL,
      "remoteJid" TEXT NOT NULL,
      "remoteJidAlt" TEXT,
      "senderPn" TEXT,
      "lastMessageId" TEXT,
      "lastMessageFromMe" BOOLEAN,
      "lastMessageTimestamp" TIMESTAMP(3)
    )`);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ChatConversationPreference" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "instanceName" TEXT NOT NULL DEFAULT '',
      "remoteJid" TEXT NOT NULL,
      "archivedAt" TIMESTAMP(3),
      "deletedAt" TIMESTAMP(3)
    )`);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Instancias" (
      "id" SERIAL PRIMARY KEY,
      "instanceName" TEXT NOT NULL,
      "display_name" TEXT,
      "userId" TEXT NOT NULL,
      "instanceId" TEXT NOT NULL,
      "instanceType" TEXT,
      "meta_channel" TEXT
    )`);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "linked_accounts" (
      "id" TEXT PRIMARY KEY,
      "master_user_id" TEXT NOT NULL,
      "linked_user_id" TEXT NOT NULL
    )`);
}

/** Una conversacion. `deEllos` = el ultimo mensaje lo escribio el contacto. */
async function conversacion(o) {
  await db.$executeRawUnsafe(
    `INSERT INTO "chat_conversations"
       ("userId","instanceName","remoteJid","remoteJidAlt","senderPn",
        "lastMessageId","lastMessageFromMe","lastMessageTimestamp")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    o.cuenta, o.linea, o.jid, o.jidAlt ?? null, o.senderPn ?? null,
    o.sinMensaje ? null : `m-${o.jid}-${o.linea}`,
    // `deEllos` es lo que se lee al sembrar; la columna guarda lo contrario.
    !o.deEllos, o.cuando ?? T0,
  );
}

async function marca(cuenta, jid, cual) {
  await db.$executeRawUnsafe(
    `INSERT INTO "ChatConversationPreference" ("id","userId","instanceName","remoteJid","${cual}")
     VALUES ($1,$2,'',$3,$4)`,
    `${cuenta}-${jid}-${cual}`, cuenta, jid, T0,
  );
}

async function linea(cuenta, nombre, extra = {}) {
  await db.$executeRawUnsafe(
    `INSERT INTO "Instancias" ("instanceName","userId","instanceId","instanceType","meta_channel")
     VALUES ($1,$2,$3,$4,$5)`,
    nombre, cuenta, nombre, extra.tipo ?? "Whatsapp", extra.canal ?? null,
  );
}

async function mensajeDeEquipo(o) {
  await db.$executeRawUnsafe(
    `INSERT INTO "team_chat_messages"
       ("id","cuentaId","canalId","autorId","autorNombre","texto","mencionados","creadoEn")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    o.id, o.cuenta, o.canal, o.autor, "quien sea", o.texto ?? "hola",
    o.mencionados ?? [], o.cuando ?? T0,
  );
}

test("sembrar", async () => {
  await tablas();

  // La familia: la madre vincula a la hija. La ajena no es de nadie.
  await db.$executeRawUnsafe(
    `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id") VALUES ($1,$2,$3)`,
    `${V}-l1`, MADRE, HIJA,
  );

  await linea(MADRE, L_MADRE);
  await linea(HIJA, L_HIJA);
  await linea(AJENA, L_AJENA);
  // Una linea que ya no existe en la bandeja: el resto de un cambio de
  // proveedor. Sigue teniendo conversaciones guardadas y NO tiene ficha en
  // `Instancias`, asi que no puede contar. Es el fallo de
  // `refetchChatsManualAction`, que devolvia la bandeja entera de la cuenta.

  // — En la linea de la madre —
  // 1) espera respuesta
  await conversacion({ cuenta: MADRE, linea: L_MADRE, jid: "57300@s.whatsapp.net", deEllos: true, cuando: masTarde(1) });
  // 2) espera respuesta, y es la mas nueva de todas
  await conversacion({ cuenta: MADRE, linea: L_MADRE, jid: "57301@s.whatsapp.net", deEllos: true, cuando: masTarde(9) });
  // 3) contestada: el ultimo es del asesor
  await conversacion({ cuenta: MADRE, linea: L_MADRE, jid: "57302@s.whatsapp.net", deEllos: false, cuando: masTarde(5) });
  // 4) borrada
  await conversacion({ cuenta: MADRE, linea: L_MADRE, jid: "57303@s.whatsapp.net", deEllos: true, cuando: masTarde(2) });
  await marca(MADRE, "57303@s.whatsapp.net", "deletedAt");
  // 5) archivada
  await conversacion({ cuenta: MADRE, linea: L_MADRE, jid: "57304@s.whatsapp.net", deEllos: true, cuando: masTarde(2) });
  await marca(MADRE, "57304@s.whatsapp.net", "archivedAt");
  // 6) sin ningun mensaje todavia
  await conversacion({ cuenta: MADRE, linea: L_MADRE, jid: "57305@s.whatsapp.net", deEllos: true, sinMensaje: true });
  // 7) la MISMA conversacion, dos filas: una por su @lid y otra por su numero
  await conversacion({ cuenta: MADRE, linea: L_MADRE, jid: "2101016@lid", senderPn: "57306@s.whatsapp.net", deEllos: true, cuando: masTarde(3) });
  await conversacion({ cuenta: MADRE, linea: L_MADRE, jid: "57306@s.whatsapp.net", deEllos: true, cuando: masTarde(3) });
  // 8) en la linea muerta: no tiene ficha, no cuenta
  await conversacion({ cuenta: MADRE, linea: L_MUERTA, jid: "57307@s.whatsapp.net", deEllos: true, cuando: masTarde(4) });

  // — En la linea de la hija —
  await conversacion({ cuenta: HIJA, linea: L_HIJA, jid: "57400@s.whatsapp.net", deEllos: true, cuando: masTarde(6) });
  // El MISMO contacto que el 1, pero escribiendo a otra linea: son dos.
  await conversacion({ cuenta: HIJA, linea: L_HIJA, jid: "57300@s.whatsapp.net", deEllos: true, cuando: masTarde(6) });

  // — En una cuenta de fuera —
  await conversacion({ cuenta: AJENA, linea: L_AJENA, jid: "57500@s.whatsapp.net", deEllos: true, cuando: masTarde(30) });
});

// ── Fuente 1: los chats de clientes ─────────────────────────────────────────

test("cuenta lo que espera respuesta, y NADA mas", async () => {
  const r = await contarChatsSinLeer({ userIds: [MADRE], instanceNames: [L_MADRE] });
  // Los dos primeros y la pareja @lid/numero, que es UNA. La contestada, la
  // borrada, la archivada y la que no tiene mensaje se quedan fuera.
  assert.equal(r.total, 3);
});

test("la misma conversacion por su @lid y por su numero cuenta UNA", async () => {
  // Contando filas, el icono diria dos donde la bandeja enseña una. Se
  // comprueba aparte porque es el caso que solo se ve con los dos formatos.
  const dos = await contarChatsSinLeer({ userIds: [MADRE], instanceNames: [L_MADRE] });
  const filas = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM "chat_conversations"
      WHERE "userId" = $1 AND "instanceName" = $2
        AND "remoteJid" IN ('2101016@lid','57306@s.whatsapp.net')`,
    MADRE, L_MADRE,
  );
  assert.equal(filas[0].n, 2, "tienen que ser dos filas de verdad");
  assert.equal(dos.total, 3, "y una sola conversacion en el numero");
});

test("una linea SIN ficha no cuenta, aunque tenga conversaciones guardadas", async () => {
  const soloLaViva = await contarChatsSinLeer({ userIds: [MADRE], instanceNames: [L_MADRE] });
  const conLaMuerta = await contarChatsSinLeer({
    userIds: [MADRE],
    instanceNames: [L_MADRE, L_MUERTA],
  });
  assert.equal(soloLaViva.total, 3);
  assert.equal(conLaMuerta.total, 4, "la muerta si se pide, se cuenta");
  // Y el alcance de verdad —que sale de `Instancias`— no la pide nunca.
  const bandeja = await losChatsQueEsperan({ id: MADRE });
  assert.equal(bandeja.total, 3 + 2, "la madre: lo suyo y lo de su hija");
});

test("sin lineas no se consulta nada, y el cero es el dato", async () => {
  assert.deepEqual(await contarChatsSinLeer({ userIds: [MADRE], instanceNames: [] }), {
    total: 0,
    masNuevo: 0,
  });
  assert.deepEqual(await contarChatsSinLeer({ userIds: [], instanceNames: [L_MADRE] }), {
    total: 0,
    masNuevo: 0,
  });
});

test("`masNuevo` es la hora del mas reciente de los que CUENTAN", async () => {
  const r = await contarChatsSinLeer({ userIds: [MADRE], instanceNames: [L_MADRE] });
  // El +9 es el ultimo que espera respuesta. La linea muerta tiene uno de +4 y
  // la contestada uno de +5: ninguno de los dos manda.
  assert.equal(r.masNuevo, masTarde(9).getTime());
});

// ── El alcance ──────────────────────────────────────────────────────────────

test("la madre consolida su familia; una cuenta de fuera no entra", async () => {
  const madre = await losChatsQueEsperan({ id: MADRE });
  assert.equal(madre.total, 5, "3 suyas + 2 de la hija");
  // La ajena tiene una conversacion esperando y no se cuela por ningun lado.
  const ajena = await losChatsQueEsperan({ id: AJENA });
  assert.equal(ajena.total, 1);
});

test("la hija ve lo suyo; y un AGENTE no ve las lineas de las vinculadas", async () => {
  const hija = await losChatsQueEsperan({ id: HIJA });
  assert.equal(hija.total, 5, "la vinculacion vale en los dos sentidos");

  // Un agente trabaja en UNA cuenta: la bandeja no le junta las de al lado, y
  // el icono tampoco puede — le prometeria chats que no puede ni abrir.
  const agente = await losChatsQueEsperan({
    id: AGENTE,
    ownerId: HIJA,
    advisorRole: "agente",
  });
  assert.equal(agente.total, 2, "solo la linea de SU cuenta");

  // Y su administrador si las junta, como en la bandeja.
  const admin = await losChatsQueEsperan({
    id: `${V}-admin`,
    ownerId: HIJA,
    advisorRole: "administrador",
  });
  assert.equal(admin.total, 5);
});

test("una cuenta sin lineas conectadas da cero sin consultar conversaciones", async () => {
  const nadie = await losChatsQueEsperan({ id: `${V}-sin-lineas` });
  assert.deepEqual(nadie, { total: 0, masNuevo: 0 });
});

// ── Fuentes 2 y 3: el equipo ────────────────────────────────────────────────

const DIRECTO = `${V}-directo`;
const AREA = `${V}-area`;

test("sembrar el equipo", async () => {
  // `conLaTabla` crea `team_chat_messages` y `team_chat_reads` sola, asi que
  // la primera consulta las deja puestas.
  await loQuePuedeSonar({ personaId: YO, directos: [], otros: [], familia: [], conGeneral: false });

  await mensajeDeEquipo({ id: `${V}-d1`, cuenta: MADRE, canal: DIRECTO, autor: OTRA_PERSONA, cuando: masTarde(20) });
  // En un area solo suena una MENCION: este no la lleva.
  await mensajeDeEquipo({ id: `${V}-a1`, cuenta: MADRE, canal: AREA, autor: OTRA_PERSONA, cuando: masTarde(21) });
  await mensajeDeEquipo({ id: `${V}-a2`, cuenta: MADRE, canal: AREA, autor: OTRA_PERSONA, mencionados: [YO], cuando: masTarde(22) });
  // Lo que escribe uno mismo no le llega a el.
  await mensajeDeEquipo({ id: `${V}-a3`, cuenta: MADRE, canal: AREA, autor: YO, mencionados: [YO], cuando: masTarde(23) });
});

test("un DIRECTO sin leer es un aviso; una MENCION en un area, otro", async () => {
  const avisos = await loQuePuedeSonar({
    personaId: YO,
    directos: [DIRECTO],
    otros: [AREA],
    familia: [MADRE],
    conGeneral: false,
  });
  assert.equal(avisos.length, 2, "uno por conversacion, no uno por mensaje");
  const porMotivo = Object.fromEntries(avisos.map((a) => [a.motivo, a.canalId]));
  assert.equal(porMotivo.directo, DIRECTO);
  assert.equal(porMotivo.mencion, AREA);
});

test("un mensaje de area SIN mencion no avisa", async () => {
  const soloElArea = await loQuePuedeSonar({
    personaId: OTRA_PERSONA,
    directos: [],
    otros: [AREA],
    familia: [MADRE],
    conGeneral: false,
  });
  // A la otra persona la mencionan en cero mensajes, aunque el area tenga tres.
  assert.equal(soloElArea.length, 0);
});

test("LEER baja el aviso, y solo el del canal que se leyo", async () => {
  await marcarLeido(YO, AREA, masTarde(99));
  const avisos = await loQuePuedeSonar({
    personaId: YO,
    directos: [DIRECTO],
    otros: [AREA],
    familia: [MADRE],
    conGeneral: false,
  });
  assert.equal(avisos.length, 1, "queda el directo");
  assert.equal(avisos[0].motivo, "directo");

  await marcarLeido(YO, DIRECTO, masTarde(99));
  const ninguno = await loQuePuedeSonar({
    personaId: YO,
    directos: [DIRECTO],
    otros: [AREA],
    familia: [MADRE],
    conGeneral: false,
  });
  assert.equal(ninguno.length, 0);
});

// ── Y LAS TRES SUMADAS ──────────────────────────────────────────────────────

test("EL CASO: las tres fuentes, sumadas, pintan el numero", async () => {
  // Se vuelve a dejar sin leer el equipo: dos avisos, un directo y una mencion.
  await db.$executeRawUnsafe(`DELETE FROM "team_chat_reads" WHERE "personaId" = $1`, YO);

  const chatsDelServidor = await losChatsQueEsperan({ id: MADRE });
  const avisos = await loQuePuedeSonar({
    personaId: YO,
    directos: [DIRECTO],
    otros: [AREA],
    familia: [MADRE],
    conGeneral: false,
  });

  assert.equal(chatsDelServidor.total, 5, "fuente 1: chats que esperan respuesta");
  assert.equal(avisos.filter((a) => a.motivo === "directo").length, 1, "fuente 2: directos");
  assert.equal(avisos.filter((a) => a.motivo === "mencion").length, 1, "fuente 3: menciones");

  // Y ahora el icono, en frio: nadie ha entrado a la bandeja todavia.
  const chats = VIEJO
    // ANTES: la mitad de chats salia del store, que SOLO escribe la bandeja.
    // Fuera de Chats valia cero, y ese cero es el fallo entero.
    ? 0
    : elNumeroDeChats({
        deLaBandeja: null,
        hastaLaBandeja: 0,
        delServidor: chatsDelServidor.total,
        masNuevoDelServidor: chatsDelServidor.masNuevo,
      });

  const pintado = loQueSePinta(chats, avisos.length);

  if (VIEJO) {
    // Con cinco conversaciones esperando respuesta en la base, el icono
    // enseñaba **dos**: solo el equipo. Y sin menciones ni directos no se
    // habria pintado nada, que es como se reporto.
    assert.equal(pintado.total, 2, "el modo roto se deja fuera los cinco chats");
    const sinEquipo = loQueSePinta(0, 0);
    assert.equal(sinEquipo.texto, null, "y sin equipo el icono no cambia nunca");
  } else {
    assert.equal(pintado.total, 7, "5 chats + 1 directo + 1 mencion");
    assert.equal(pintado.texto, "7");
  }
});

test("y con la bandeja abierta manda ella, tambien sobre este conteo", async () => {
  const delServidor = await losChatsQueEsperan({ id: MADRE });
  // La bandeja ya juzgo hasta el mas nuevo y dice que quedan dos sin leer: son
  // las marcas de `seenMessages`, que el servidor no puede ver.
  const chats = elNumeroDeChats({
    deLaBandeja: 2,
    hastaLaBandeja: delServidor.masNuevo,
    delServidor: delServidor.total,
    masNuevoDelServidor: delServidor.masNuevo,
  });
  // Esto pasa IGUAL en los dos modos, y por eso está: es el bloque de «no se
  // aflojó nada de paso». Lo único que cambia entre ellos es el fallo.
  assert.equal(chats, 2);
  assert.equal(loQueSePinta(chats, 0).texto, "2");
});

test.after(async () => {
  await db.$disconnect();
});
