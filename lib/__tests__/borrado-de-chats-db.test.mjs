/**
 * Un chat borrado NO vuelve a la lista al recargar. Contra Postgres, con el
 * esquema real y las funciones de produccion.
 *
 * # El fallo
 *
 * Conversaciones viejas -junio, en una linea de Verzay Ventas- que se borraban
 * una y otra vez, por la conversacion misma y por «Eliminar por fecha», y
 * siempre volvian al salir de Chats y entrar.
 *
 * Eran DOS agujeros que se sumaban:
 *
 *  1. La consulta que arma la bandeja en el SERVIDOR nunca miraba las marcas de
 *     borrado -solo el contador de cada linea las descontaba-. La lista salia
 *     con el chat borrado dentro y todo dependia de que el NAVEGADOR emparejara
 *     la marca con la identidad bajo la que la fila reaparece.
 *  2. Ese emparejamiento fallaba cuando el puente `@lid`<->numero se perdia. Lo
 *     unico que lo cruza era `chat_messages`, que el propio borrado VACIA y que
 *     ademas CADUCA a los 90 dias: una conversacion de junio ya no tenia ni un
 *     mensaje, asi que la marca cubria una sola forma y la lista traia el
 *     contacto por la otra. Y «Eliminar por fecha» ni siquiera pasaba las
 *     identidades que la pantalla si conoce.
 *
 * # El arreglo
 *
 *  - La consulta de la bandeja excluye lo borrado, cruzando por CUALQUIER
 *    identidad de la conversacion Y de su ficha (la ficha trae el numero cuando
 *    la conversacion solo trae el `@lid`), y respetando la regla de siempre: un
 *    chat vuelve si el contacto escribe despues del borrado.
 *  - `identidadesDelContacto` lee tambien de fuentes DURABLES (`Session` y
 *    `chat_conversations`), no solo de `chat_messages`, asi que la marca cubre
 *    todas las identidades aunque los mensajes ya no esten.
 *  - `bulkDeleteChatsAction` pasa las identidades de cada fila, igual que el
 *    borrado de uno en uno.
 *
 * # Los casos
 *
 *  1. Borrar una conversacion (uno a uno) y recargar -> se va, aunque reaparezca
 *     por su OTRA identidad; y la no borrada sigue.
 *  2. Borrar por rango de fechas (en bloque) y recargar -> se va de verdad
 *     (linea Waha: se borran las filas), incluida la fila de la otra identidad.
 *  3. Una conversacion no borrada sigue apareciendo.
 *  4. Un chat borrado cuyo contacto vuelve a escribir SI aparece (la regla no se
 *     rompe: la exclusion del servidor no esconde lo revivido).
 *
 * `MODO=roto` apunta el borrado y la consulta a `origin/main`: el chat vuelve
 * (casos 1 y 2 en rojo) y la marca no cubre la otra identidad. Sin ese modo, lo
 * verde no diria si se arreglo la causa o si el caso no se ejerce.
 *
 * Se levanta con `scripts/banco-borrado-chats.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ponerAQuienMira,
  deleteChatConversationAction,
  bulkDeleteChatsAction,
  getPersistedInboxChats,
  invalidatePersistedInboxCache,
  elegirPreferenciaDelChat,
  chatPreferenceKey,
  getChatIdentityCandidates,
  isChatDeletedByPreference,
  db,
} from "./.compilado/borrado/entrada-de-borrado.js";

const ROTO = process.env.MODO === "roto";
const VUELTA = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const JUNIO = new Date("2026-06-15T12:00:00.000Z");

async function cuenta(sufijo) {
  const id = `borr-${sufijo}-${VUELTA}`;
  await db.user.create({
    data: { id, email: `${id}@banco.test`, name: `Cuenta ${sufijo}`, role: "user" },
  });
  return id;
}

async function linea(userId, tipo, sufijo) {
  const nombre = `LINEA_${sufijo}_${VUELTA}`;
  await db.instancia.create({
    data: { userId, instanceName: nombre, instanceId: `i-${sufijo}-${VUELTA}`, instanceType: tipo },
  });
  return nombre;
}

/**
 * Un contacto con su conversacion, su ficha y (a proposito) SIN mensajes: eso
 * es una conversacion vieja cuyos `chat_messages` ya caducaron, que es el caso
 * que rompia. La ficha guarda el puente numero<->lid.
 */
async function contacto(userId, nombreLinea, { num, lid, ts = JUNIO, fromMe = false }) {
  await db.chatConversation.create({
    data: {
      userId,
      instanceName: nombreLinea,
      remoteJid: num,
      remoteJidAlt: lid,
      pushName: "Contacto de junio",
      lastMessageFromMe: fromMe,
      lastMessageType: "conversation",
      lastMessageContent: "hola",
      lastMessageTimestamp: ts,
    },
  });
  await db.session.create({
    data: {
      userId,
      remoteJid: num,
      remoteJidAlt: lid,
      pushName: "Contacto de junio",
      instanceId: nombreLinea,
      status: true,
    },
  });
}

/** Una fila SUELTA de conversacion, por la que la lista puede traer al contacto
 * con su OTRA identidad (Evolution lo devuelve unas veces por el numero y otras
 * por el `@lid`). Sin ficha propia: la comparte con la de arriba. */
async function conversacionSuelta(userId, nombreLinea, jid, ts = JUNIO) {
  await db.chatConversation.create({
    data: {
      userId,
      instanceName: nombreLinea,
      remoteJid: jid,
      pushName: "Contacto de junio",
      lastMessageFromMe: false,
      lastMessageType: "conversation",
      lastMessageContent: "hola",
      lastMessageTimestamp: ts,
    },
  });
}

async function listaDeLaLinea(userId, nombreLinea) {
  invalidatePersistedInboxCache();
  return getPersistedInboxChats({ userIds: [userId], instanceNames: [nombreLinea] });
}

function apareceJid(lista, jid) {
  return lista.some((c) => c.remoteJid === jid || c.remoteJidAlt === jid);
}

async function marcasDe(userId) {
  const filas = await db.chatConversationPreference.findMany({
    where: { userId },
    select: {
      userId: true,
      instanceName: true,
      remoteJid: true,
      pinnedAt: true,
      archivedAt: true,
      deletedAt: true,
      purgedAt: true,
      updatedAt: true,
    },
  });
  const mapa = {};
  for (const f of filas) {
    mapa[chatPreferenceKey(f.userId, f.instanceName ?? "", f.remoteJid)] = {
      ...f,
      deletedAt: f.deletedAt ? f.deletedAt.toISOString() : null,
    };
  }
  return { filas, mapa };
}

// El borrado y la papelera piden `currentUser`; se le pone el dueno de la
// cuenta, que es quien manda en su linea.
function actuarComo(userId) {
  ponerAQuienMira({ id: userId, role: "user", ownerId: null, advisorRole: null });
}

test("uno a uno: el chat borrado no vuelve, ni por su otra identidad; la no borrada si", async () => {
  const dueno = await cuenta("evo");
  const LINEA = await linea(dueno, "Whatsapp", "EVO");
  const NUM = `573001110001@s.whatsapp.net`;
  const LID = `210101696700001@lid`;
  const NUM_B = `573001110002@s.whatsapp.net`;

  // El contacto a borrar, con su puente numero<->lid solo en la ficha (sin
  // mensajes), y una fila suelta por la que reaparece con su `@lid`.
  await contacto(dueno, LINEA, { num: NUM, lid: LID });
  await conversacionSuelta(dueno, LINEA, LID);
  // El que se queda.
  await contacto(dueno, LINEA, { num: NUM_B, lid: `210101696700002@lid` });

  const antes = await listaDeLaLinea(dueno, LINEA);
  assert.ok(apareceJid(antes, NUM), "el contacto tiene que estar antes de borrar");
  assert.ok(apareceJid(antes, LID), "y tambien su fila del `@lid`");

  // Se borra por el NUMERO, pasando solo esa identidad: el puente al `@lid` lo
  // tiene que poner el servidor desde la ficha (Session), no la pantalla.
  actuarComo(dueno);
  const res = await deleteChatConversationAction({
    userId: dueno,
    instanceName: LINEA,
    remoteJid: NUM,
    identidades: [NUM],
  });
  assert.equal(res.success, true, res.message);

  // La marca cubre las DOS identidades (numero y `@lid`), gracias a la ficha.
  const { filas: marcas, mapa } = await marcasDe(dueno);
  const marcadas = new Set(marcas.filter((m) => m.deletedAt).map((m) => m.remoteJid));
  if (ROTO) {
    assert.ok(!marcadas.has(LID), "modo roto: la marca NO deberia cubrir el `@lid`");
  } else {
    assert.ok(marcadas.has(NUM), "la marca cubre el numero");
    assert.ok(marcadas.has(LID), "la marca cubre el `@lid` (puente desde la ficha)");
  }

  // Recargar: ni el numero ni el `@lid` vuelven; el otro contacto sigue.
  const despues = await listaDeLaLinea(dueno, LINEA);
  if (ROTO) {
    assert.ok(
      apareceJid(despues, NUM) || apareceJid(despues, LID),
      "modo roto: el chat borrado tiene que reaparecer",
    );
  } else {
    assert.ok(!apareceJid(despues, NUM), "el numero no vuelve");
    assert.ok(!apareceJid(despues, LID), "el `@lid` tampoco vuelve");
  }
  assert.ok(apareceJid(despues, NUM_B), "la conversacion no borrada sigue apareciendo");

  // Y el filtro del navegador tambien lo esconde si reaparece por el `@lid`.
  const chatPorLid = {
    remoteJid: LID,
    remoteJidAlt: null,
    senderPn: null,
    aliases: [],
    instanceName: LINEA,
    lastMessage: { key: { fromMe: false }, messageTimestamp: Math.floor(JUNIO.getTime() / 1000) },
  };
  const pref = elegirPreferenciaDelChat(mapa, dueno, LINEA, getChatIdentityCandidates(chatPorLid));
  if (ROTO) {
    assert.equal(isChatDeletedByPreference(chatPorLid, pref), false, "modo roto: el navegador no lo esconde");
  } else {
    assert.equal(isChatDeletedByPreference(chatPorLid, pref), true, "el navegador lo esconde por el `@lid`");
  }
});

test("por rango (en bloque, linea Waha): se borra de verdad, incluida la otra identidad", async () => {
  const dueno = await cuenta("waha");
  const LINEA = await linea(dueno, "waha", "WAHA");
  const NUM = `573002220001@s.whatsapp.net`;
  const LID = `210101696710001@lid`;
  const NUM_D = `573002220002@s.whatsapp.net`;

  await contacto(dueno, LINEA, { num: NUM, lid: LID });
  await conversacionSuelta(dueno, LINEA, LID);
  await contacto(dueno, LINEA, { num: NUM_D, lid: `210101696710002@lid` });

  actuarComo(dueno);
  // «Eliminar por fecha» agrupa por cuenta+linea y llama en bloque. Se pasa solo
  // el numero en `identidadesPorJid`: el puente al `@lid` sale de la ficha.
  const res = await bulkDeleteChatsAction({
    userId: dueno,
    instanceName: LINEA,
    remoteJids: [NUM],
    identidadesPorJid: { [NUM]: [NUM] },
  });
  assert.equal(res.success, true, res.message);

  // Waha borra de verdad: no queda ninguna fila de conversacion del contacto,
  // ni la del numero ni la del `@lid`.
  const quedan = await db.chatConversation.findMany({
    where: { userId: dueno, instanceName: LINEA, remoteJid: { in: [NUM, LID] } },
    select: { remoteJid: true },
  });
  if (ROTO) {
    assert.ok(quedan.some((c) => c.remoteJid === LID), "modo roto: la fila del `@lid` sobrevive");
  } else {
    assert.equal(quedan.length, 0, "no queda ninguna fila del contacto borrado");
  }

  const despues = await listaDeLaLinea(dueno, LINEA);
  if (ROTO) {
    assert.ok(apareceJid(despues, LID), "modo roto: reaparece por el `@lid`");
  } else {
    assert.ok(!apareceJid(despues, NUM), "el numero no vuelve");
    assert.ok(!apareceJid(despues, LID), "el `@lid` tampoco");
  }
  assert.ok(apareceJid(despues, NUM_D), "la no borrada sigue");
});

test("revivir: un chat borrado cuyo contacto vuelve a escribir SI aparece", async () => {
  const dueno = await cuenta("rev");
  const LINEA = await linea(dueno, "Whatsapp", "REV");
  const NUM = `573003330001@s.whatsapp.net`;
  const LID = `210101696720001@lid`;

  await contacto(dueno, LINEA, { num: NUM, lid: LID });

  actuarComo(dueno);
  const res = await deleteChatConversationAction({
    userId: dueno,
    instanceName: LINEA,
    remoteJid: NUM,
    identidades: [NUM],
  });
  assert.equal(res.success, true, res.message);

  // El borrado se lleva la fila de la conversacion (en Evolution la trae de
  // vuelta el telefono en cada vuelta; en el banco lo simula el re-persistido de
  // abajo). Recien borrada y sin nada del contacto, sigue oculta.
  const calladito = await listaDeLaLinea(dueno, LINEA);
  if (!ROTO) {
    assert.ok(!apareceJid(calladito, NUM), "sin nuevo mensaje del contacto, sigue oculto");
  }

  // El contacto escribe DESPUES del borrado: la vuelta del reloj vuelve a
  // persistir la conversacion con un mensaje ENTRANTE posterior a la marca. La
  // exclusion del servidor NO puede esconderla: la regla de siempre es que un
  // chat borrado vuelve si el contacto escribe.
  await db.chatConversation.create({
    data: {
      userId: dueno,
      instanceName: LINEA,
      remoteJid: NUM,
      remoteJidAlt: LID,
      pushName: "Contacto de junio",
      lastMessageFromMe: false,
      lastMessageType: "conversation",
      lastMessageContent: "sigo aqui",
      lastMessageTimestamp: new Date(),
    },
  });

  const despues = await listaDeLaLinea(dueno, LINEA);
  assert.ok(
    apareceJid(despues, NUM),
    "un chat borrado vuelve si el contacto escribe despues (la exclusion no lo esconde)",
  );
});
