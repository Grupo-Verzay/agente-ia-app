/**
 * El número de la pestaña: qué cuenta, y lo que contaba de más.
 *
 * Lo que este banco protege no es una consulta: es que el icono **cuente lo
 * que dice que cuenta**. Son tres cosas y ninguna más —las conversaciones SIN
 * LEER, las menciones del chat de equipo y los mensajes directos— y si las
 * tres suman cero, no se pinta nada.
 *
 * # Los dos modos, y qué demuestra el roto
 *
 * Con `MODO=viejo` la mitad de chats sale de donde salía hasta el #838: una
 * consulta del servidor que contaba **las conversaciones cuyo último mensaje
 * es del contacto**, arbitrada contra lo que dijera la bandeja. Ese modo lleva
 * la consulta vieja escrita dentro, literal, y afirma los dos fallos que se
 * vieron en producción con la cuenta Verzay Ventas:
 *
 *  1. **Cuenta algo que no existe.** Con los leads borrados —`/sessions` en
 *     cero— y la bandeja vacía, seguía devolviendo un número de tres cifras,
 *     porque `chat_conversations` sobrevive a borrar `Session`. Y la arbitraje
 *     del navegador lo dejaba ganar SIEMPRE: con la bandeja vacía su marca es
 *     cero, así que cualquier hora del servidor la supera.
 *  2. **No es «sin leer».** Con todas las conversaciones leídas, la bandeja
 *     decía 0 y el icono seguía diciendo `9+`.
 *
 * Sin ese modo no se sabría si lo verde de al lado es que se arregló la causa
 * o que el caso no llegaba a ejercerla.
 *
 * Cómo se levanta: `scripts/banco-pendientes.sh` (Postgres de usar y tirar).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  loQuePuedeSonar,
  marcarLeido,
  losChatsSinLeer,
  loQueSePinta,
  db,
} from "./.compilado/pendientes/entrada-de-pendientes.js";

const VIEJO = process.env.MODO === "viejo";

/** Ids distintos en cada vuelta: la base del banco se reutiliza. */
const V = `v${Date.now().toString(36)}`;
const MADRE = `${V}-madre`;
const HIJA = `${V}-hija`;
const YO = `${V}-yo`;
const OTRA_PERSONA = `${V}-otra`;

const L_MADRE = `${V}_VENTAS`;
const L_HIJA = `${V}_ATENCION`;

const T0 = new Date("2026-09-01T10:00:00Z");
const masTarde = (min) => new Date(T0.getTime() + min * 60_000);

// ── La consulta VIEJA, escrita aquí ─────────────────────────────────────────
//
// Es `contarChatsSinLeer` tal cual estaba en `lib/chat-persistence.ts` antes
// del #838, y el arbitraje de `elNumeroDeChats` tal cual estaba en
// `lib/insignia-del-favicon.ts`. Viven aquí porque el código de producción ya
// no los tiene: sin ellos el modo roto no podría ejercerse, y entonces lo
// verde del modo nuevo no significaría nada.

async function contarComoAntes({ userIds, instanceNames }) {
  const vacio = { total: 0, masNuevo: 0 };
  if (!userIds.length || !instanceNames.length) return vacio;
  const filas = await db.$queryRawUnsafe(
    `WITH marcas AS (
       SELECT DISTINCT "userId", "remoteJid"
       FROM "ChatConversationPreference"
       WHERE "userId" = ANY($1::text[])
         AND ("deletedAt" IS NOT NULL OR "archivedAt" IS NOT NULL)
     )
     SELECT
       COUNT(DISTINCT (
         c."instanceName",
         COALESCE(NULLIF(c."senderPn", ''), c."remoteJid")
       ))::int AS total,
       MAX(c."lastMessageTimestamp") AS "masNuevo"
     FROM "chat_conversations" c
     LEFT JOIN marcas m  ON m."userId"  = c."userId" AND m."remoteJid"  = c."remoteJid"
     LEFT JOIN marcas ma ON ma."userId" = c."userId" AND ma."remoteJid" = c."remoteJidAlt"
     WHERE c."userId" = ANY($1::text[])
       AND c."instanceName" = ANY($2::text[])
       AND c."lastMessageId" IS NOT NULL
       AND c."lastMessageFromMe" = false
       AND m."remoteJid" IS NULL
       AND ma."remoteJid" IS NULL`,
    userIds,
    instanceNames,
  );
  const f = filas[0];
  return {
    total: Number(f?.total ?? 0),
    masNuevo: f?.masNuevo ? new Date(f.masNuevo).getTime() : 0,
  };
}

/** El arbitraje de antes: el servidor gana si trae algo MÁS NUEVO. */
function elNumeroDeChatsViejo({ deLaBandeja, hastaLaBandeja, delServidor, masNuevoDelServidor }) {
  const n = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  if (deLaBandeja == null) return n(delServidor);
  return n(masNuevoDelServidor) > n(hastaLaBandeja) ? n(delServidor) : n(deLaBandeja);
}

// ── El esquema del banco ────────────────────────────────────────────────────

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
    CREATE TABLE IF NOT EXISTS "Session" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "instanceId" TEXT,
      "remoteJid" TEXT
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

  // Una cuenta con conversaciones guardadas: 120 en las que el ultimo mensaje
  // lo escribio el contacto. Son las que la consulta vieja contaba, y son mas
  // de 99 a proposito: es lo que se leia como «99+».
  for (let i = 0; i < 120; i += 1) {
    await conversacion({
      cuenta: MADRE,
      linea: L_MADRE,
      jid: `5730${String(i).padStart(4, "0")}@s.whatsapp.net`,
      deEllos: true,
      cuando: masTarde(i + 1),
    });
  }
  // Y dos contestadas, que ni la vieja contaba.
  await conversacion({ cuenta: MADRE, linea: L_MADRE, jid: "57999@s.whatsapp.net", deEllos: false, cuando: masTarde(5) });
  await conversacion({ cuenta: HIJA, linea: L_HIJA, jid: "57998@s.whatsapp.net", deEllos: false, cuando: masTarde(5) });
});

// ── FALLO 1: la cuenta vacía ────────────────────────────────────────────────

test("EL CASO: borrar los leads NO borra `chat_conversations`", async () => {
  // Es la mitad que explica el reporte: `/sessions` decia 0 leads y `/chats`
  // no enseñaba ninguna conversacion, y aun asi el contador iba a tres cifras.
  // El borrado de leads toca `Session`; las conversaciones se quedan.
  const leads = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM "Session" WHERE "userId" = $1`, MADRE,
  );
  assert.equal(leads[0].n, 0, "la cuenta no tiene ni un lead");

  const quedan = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM "chat_conversations" WHERE "userId" = $1`, MADRE,
  );
  assert.equal(quedan[0].n, 121, "y sin embargo quedan 121 conversaciones guardadas");
});

test("EL CASO: cuenta vacía da CERO y no se pinta insignia", async () => {
  // La bandeja esta abierta y no tiene ni una conversacion que enseñar: dice
  // cero. Ahi se acaba la pregunta.
  const laBandejaDice = 0;

  if (VIEJO) {
    // ANTES: el servidor contaba las 120 que quedan en `chat_conversations` y
    // el arbitraje lo dejaba ganar, porque con la bandeja vacia su marca es
    // CERO y cualquier hora del servidor la supera. De ahi el «99+» sobre una
    // cuenta sin una sola conversacion a la vista.
    const servidor = await contarComoAntes({ userIds: [MADRE], instanceNames: [L_MADRE] });
    assert.equal(servidor.total, 120, "el servidor contaba lo que ya no se ve");
    const chats = elNumeroDeChatsViejo({
      deLaBandeja: laBandejaDice,
      hastaLaBandeja: 0,
      delServidor: servidor.total,
      masNuevoDelServidor: servidor.masNuevo,
    });
    assert.equal(chats, 120, "y ganaba el servidor sobre la bandeja vacia");
    assert.equal(loQueSePinta(chats, 0).texto, "9+", "el icono decia 9+");
  } else {
    const chats = losChatsSinLeer(laBandejaDice);
    assert.equal(chats, 0);
    assert.deepEqual(loQueSePinta(chats, 0), { total: 0, texto: null });
  }
});

test("y lo mismo con la bandeja sin haber hablado: cero, no un conteo del servidor", async () => {
  // Fuera de Chats la bandeja no dice nada. `null` es «no lo se», y de «no lo
  // se» no sale un numero: sale el icono de siempre.
  if (VIEJO) {
    const servidor = await contarComoAntes({ userIds: [MADRE], instanceNames: [L_MADRE] });
    const chats = elNumeroDeChatsViejo({
      deLaBandeja: null,
      hastaLaBandeja: 0,
      delServidor: servidor.total,
      masNuevoDelServidor: servidor.masNuevo,
    });
    assert.equal(loQueSePinta(chats, 0).texto, "9+");
  } else {
    assert.equal(losChatsSinLeer(null), 0);
    assert.equal(loQueSePinta(losChatsSinLeer(null), 0).texto, null);
  }
});

// ── FALLO 2: contar EXACTAMENTE lo sin leer ─────────────────────────────────

test("EL CASO: bandeja cargada, el numero es el de la pastilla «Sin leer»", async () => {
  // 577 conversaciones en la linea y TRES sin leer: es el caso reportado, con
  // la campanita vacia y nada pendiente salvo esos tres.
  const laPastillaSinLeer = 3;

  if (VIEJO) {
    const servidor = await contarComoAntes({ userIds: [MADRE], instanceNames: [L_MADRE] });
    const chats = elNumeroDeChatsViejo({
      deLaBandeja: laPastillaSinLeer,
      // La bandeja juzgo hasta el penultimo: basta con que entre algo mas
      // nuevo —o con que su marca se quede corta por un chat que no carga—
      // para que el servidor vuelva a mandar.
      hastaLaBandeja: masTarde(1).getTime(),
      delServidor: servidor.total,
      masNuevoDelServidor: servidor.masNuevo,
    });
    assert.equal(chats, 120, "el servidor desmentia a la bandeja con su proxy");
    assert.equal(loQueSePinta(chats, 0).texto, "9+");
  } else {
    assert.equal(losChatsSinLeer(laPastillaSinLeer), 3);
    assert.equal(loQueSePinta(losChatsSinLeer(laPastillaSinLeer), 0).texto, "3");
  }
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

  const avisos = await loQuePuedeSonar({
    personaId: YO,
    directos: [DIRECTO],
    otros: [AREA],
    familia: [MADRE],
    conGeneral: false,
  });
  assert.equal(avisos.filter((a) => a.motivo === "directo").length, 1, "fuente 2: directos");
  assert.equal(avisos.filter((a) => a.motivo === "mencion").length, 1, "fuente 3: menciones");

  // La bandeja dice que quedan cuatro sin leer.
  const chats = VIEJO
    ? elNumeroDeChatsViejo({
        deLaBandeja: 4,
        hastaLaBandeja: masTarde(1).getTime(),
        delServidor: (await contarComoAntes({ userIds: [MADRE], instanceNames: [L_MADRE] })).total,
        masNuevoDelServidor: masTarde(500).getTime(),
      })
    : losChatsSinLeer(4);

  const pintado = loQueSePinta(chats, avisos.length);

  if (VIEJO) {
    assert.equal(pintado.total, 122, "el proxy del servidor se comia el numero de verdad");
    assert.equal(pintado.texto, "9+");
  } else {
    assert.equal(pintado.total, 6, "4 sin leer + 1 directo + 1 mencion");
    assert.equal(pintado.texto, "6");
  }
});

test("y las tres en cero no pintan NADA", async () => {
  // Esto pasa IGUAL en los dos modos, y por eso esta: es el bloque de «no se
  // afloja nada de paso». Lo unico que cambia entre ellos es el fallo.
  await marcarLeido(YO, AREA, masTarde(999));
  await marcarLeido(YO, DIRECTO, masTarde(999));
  const avisos = await loQuePuedeSonar({
    personaId: YO,
    directos: [DIRECTO],
    otros: [AREA],
    familia: [MADRE],
    conGeneral: false,
  });
  assert.equal(avisos.length, 0);
  assert.deepEqual(loQueSePinta(losChatsSinLeer(0), avisos.length), { total: 0, texto: null });
});
