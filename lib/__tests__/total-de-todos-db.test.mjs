/**
 * El contador de «Todos»: cuenta exactamente lo que la lista enseña.
 *
 * Lo que la lista enseña bajo «Todos» son las conversaciones ACTIVAS: ni
 * borradas, ni archivadas, ni resueltas. El numero se armaba con dos fuentes y
 * ninguna descontaba las resueltas:
 *
 *  - el `COUNT` del servidor (`contarChatsPorLinea`) no miraba `resolved_at`;
 *  - el navegador hacia `max(servidor, cargadas)`, y las cargadas tambien
 *    contaban las resueltas.
 *
 * Resultado, visto en produccion y reportado por un cliente: al resolver una
 * conversacion salia de la lista y el numero no se movia, ni recargando.
 *
 * # Los dos modos
 *
 * Con `MODO=roto` corren la consulta y la cuenta del navegador DE ANTES,
 * escritas aqui literales, sobre la misma semilla, y se AFIRMA el fallo: el
 * numero no baja. Sin ese modo no se sabria si lo verde es que se arreglo la
 * causa o que el caso no se ejerce.
 *
 * Como se levanta: `scripts/banco-total-de-todos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  contarChatsPorLinea,
  marcarSesionResuelta,
  reabrirSesion,
  totalesDeTodos,
  estaResuelta,
  db,
} from "./.compilado/todos/entrada-de-todos.js";

const ROTO = process.env.MODO === "roto";
const V = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const HACE_UNA_HORA = new Date(Date.now() - 60 * 60_000);

// ── Lo de ANTES, escrito aqui ───────────────────────────────────────────────
//
// `contarChatsPorLinea` tal cual estaba (sin `resolved_at`, y sumando las dos
// ramas, asi que un grupo con ficha contaba doble), y el `channelCounts` del
// navegador tal cual estaba: `max(servidor, cargadas)` sin mirar resueltas.

async function contarComoAntes({ userIds, instanceNames }) {
  const filas = await db.$queryRawUnsafe(
    `WITH marcas AS (
        SELECT DISTINCT "userId", "remoteJid"
        FROM "ChatConversationPreference"
        WHERE "userId" = ANY($1::text[])
          AND ("deletedAt" IS NOT NULL OR "archivedAt" IS NOT NULL)
      )
      SELECT linea, SUM(total)::bigint AS total FROM (
        SELECT s."instanceId" AS linea, COUNT(DISTINCT s."remoteJid") AS total
        FROM "Session" s
        LEFT JOIN marcas m  ON m."userId"  = s."userId" AND m."remoteJid"  = s."remoteJid"
        LEFT JOIN marcas ma ON ma."userId" = s."userId" AND ma."remoteJid" = s."remoteJidAlt"
        WHERE s."userId" = ANY($1::text[])
          AND s."remoteJid" NOT LIKE '%@lid'
          AND s."instanceId" = ANY($2::text[])
          AND m."remoteJid" IS NULL
          AND ma."remoteJid" IS NULL
        GROUP BY s."instanceId"
        UNION ALL
        SELECT c."instanceName" AS linea, COUNT(DISTINCT c."remoteJid") AS total
        FROM "chat_conversations" c
        LEFT JOIN marcas mg ON mg."userId" = c."userId" AND mg."remoteJid" = c."remoteJid"
        WHERE c."userId" = ANY($1::text[])
          AND c."remoteJid" LIKE '%@g.us'
          AND c."instanceName" = ANY($2::text[])
          AND mg."remoteJid" IS NULL
        GROUP BY c."instanceName"
      ) AS todo
      GROUP BY linea`,
    userIds,
    instanceNames,
  );
  const out = {};
  for (const f of filas) out[f.linea] = Number(f.total);
  return out;
}

function navegadorComoAntes(filas, servidor) {
  // Las cargadas: sin borradas ni archivadas, pero CON resueltas.
  const cargadas = {};
  for (const f of filas) {
    if (f.borrada || f.archivada) continue;
    cargadas[f.linea] = (cargadas[f.linea] ?? 0) + 1;
  }
  const out = { ...cargadas };
  for (const [l, t] of Object.entries(servidor)) out[l] = Math.max(t, cargadas[l] ?? 0);
  return out;
}

const contar = ROTO ? contarComoAntes : contarChatsPorLinea;

// ── La semilla ──────────────────────────────────────────────────────────────

const CUENTA = `${V}-cuenta`;
const LINEA = `${V}_VENTAS`;

/** Diez conversaciones de una linea, con su ficha y su ultimo mensaje. */
async function sembrar() {
  await db.user.create({
    data: { id: CUENTA, email: `${CUENTA}@banco.test`, name: "Cuenta", role: "user" },
  });
  const ids = [];
  for (let i = 0; i < 10; i++) {
    const jid = `57300${V.length}${String(i).padStart(4, "0")}${i}@s.whatsapp.net`;
    await db.chatConversation.create({
      data: {
        userId: CUENTA,
        instanceName: LINEA,
        remoteJid: jid,
        pushName: `Cliente ${i}`,
        lastMessageFromMe: false,
        lastMessageType: "conversation",
        lastMessageContent: "hola",
        lastMessageTimestamp: HACE_UNA_HORA,
      },
    });
    const s = await db.session.create({
      data: { userId: CUENTA, remoteJid: jid, pushName: `Cliente ${i}`, instanceId: LINEA, status: true },
    });
    ids.push({ id: s.id, jid });
  }
  return ids;
}

/** Lo que el navegador ve de cada fila, con la sesion y la marca de verdad. */
async function filasDelNavegador(sesiones) {
  const leidas = await db.$queryRawUnsafe(
    `SELECT s.id, s."remoteJid", s.resolved_at, c."lastMessageTimestamp"
       FROM "Session" s JOIN "chat_conversations" c
         ON c."userId" = s."userId" AND c."instanceName" = s."instanceId" AND c."remoteJid" = s."remoteJid"
      WHERE s.id = ANY($1::int[])`,
    sesiones.map((s) => s.id),
  );
  return leidas.map((f) => {
    const resuelta = estaResuelta(
      new Date(f.lastMessageTimestamp).getTime(),
      f.resolved_at ? new Date(f.resolved_at).getTime() : null,
    );
    return {
      clave: `${LINEA}::${f.remoteJid}`,
      linea: LINEA,
      conSesion: true,
      activa: !resuelta,
      borrada: false,
      archivada: false,
    };
  });
}

let sesiones;

test.before(async () => {
  sesiones = await sembrar();
});

test.after(async () => {
  await db.$disconnect();
});

test("el COUNT del servidor no cuenta las resueltas", async () => {
  const antes = (await contar({ userIds: [CUENTA], instanceNames: [LINEA] }))[LINEA];
  assert.equal(antes, 10);

  await marcarSesionResuelta(sesiones[0].id);
  await marcarSesionResuelta(sesiones[1].id);
  const despues = (await contar({ userIds: [CUENTA], instanceNames: [LINEA] }))[LINEA];

  if (ROTO) {
    // El fallo: se resolvieron dos y el numero, aun recontando, sigue en 10.
    assert.equal(despues, 10, "con la consulta vieja, resolver no baja el numero");
  } else {
    assert.equal(despues, 8);
  }

  // Un mensaje del cliente DESPUES de la marca la reabre sola: vuelve a contar.
  await db.chatConversation.updateMany({
    where: { userId: CUENTA, instanceName: LINEA, remoteJid: sesiones[1].jid },
    data: { lastMessageTimestamp: new Date(Date.now() + 60_000) },
  });
  const conMensaje = (await contar({ userIds: [CUENTA], instanceNames: [LINEA] }))[LINEA];
  assert.equal(conMensaje, ROTO ? 10 : 9);

  // Y reabrir a mano, tambien.
  await reabrirSesion(sesiones[0].id);
  const reabierta = (await contar({ userIds: [CUENTA], instanceNames: [LINEA] }))[LINEA];
  assert.equal(reabierta, 10);
});

test("en el navegador baja al RESOLVER y sube al REABRIR, sin recargar", async () => {
  // La foto del servidor al cargar la pagina.
  const servidor = await contar({ userIds: [CUENTA], instanceNames: [LINEA] });
  const base = new Map();
  const cuenta = async () => {
    const filas = await filasDelNavegador(sesiones);
    return ROTO ? navegadorComoAntes(filas, servidor)[LINEA] : totalesDeTodos(filas, servidor, base)[LINEA];
  };

  assert.equal(await cuenta(), 10);

  // Se resuelve una: la fila sale de la lista y el numero tiene que bajar ya,
  // con la MISMA foto del servidor (no se ha recargado nada).
  await marcarSesionResuelta(sesiones[4].id);
  const trasResolver = await cuenta();
  if (ROTO) {
    assert.equal(trasResolver, 10, "con la cuenta vieja el numero no baja");
    return;
  }
  assert.equal(trasResolver, 9);

  // Se reabre: vuelve a subir.
  await reabrirSesion(sesiones[4].id);
  assert.equal(await cuenta(), 10);

  // Y al recargar, el servidor ya dice lo mismo que dijo el navegador.
  await marcarSesionResuelta(sesiones[5].id);
  assert.equal(await cuenta(), 9);
  const recargado = (await contarChatsPorLinea({ userIds: [CUENTA], instanceNames: [LINEA] }))[LINEA];
  assert.equal(recargado, 9);
});

test("las sesiones que llegan tarde no restan dos veces", () => {
  // El servidor ya desconto una resuelta: dice 2 de 3.
  const servidor = { L: 2 };
  const base = new Map();
  // Primer pintado: la lista sin sesiones todavia; la resuelta se ve activa.
  const sinSesiones = [
    { clave: "L::a", linea: "L", conSesion: false, activa: true },
    { clave: "L::b", linea: "L", conSesion: false, activa: true },
    { clave: "L::c", linea: "L", conSesion: false, activa: true },
  ];
  assert.equal(totalesDeTodos(sinSesiones, servidor, base).L, 3);
  // Llegan las sesiones: `c` era resuelta. No es un cambio, es lo que el
  // servidor ya sabia. Tiene que decir 2, no 1.
  const conSesiones = sinSesiones.map((f) => ({ ...f, conSesion: true, activa: f.clave !== "L::c" }));
  assert.equal(totalesDeTodos(conSesiones, servidor, base).L, 2);
  // Ahora si se resuelve `a`: 1.
  const resuelta = conSesiones.map((f) => (f.clave === "L::a" ? { ...f, activa: false } : f));
  assert.equal(totalesDeTodos(resuelta, servidor, base).L, 1);
});

test("un grupo con ficha cuenta una vez, no dos", { skip: ROTO ? "solo el modo bueno" : false }, async () => {
  const L = `${V}_GRUPOS`;
  const jid = `120363${Date.now()}@g.us`;
  await db.chatConversation.create({
    data: {
      userId: CUENTA, instanceName: L, remoteJid: jid, pushName: "Grupo",
      lastMessageFromMe: false, lastMessageType: "conversation", lastMessageContent: "hola",
      lastMessageTimestamp: HACE_UNA_HORA,
    },
  });
  await db.session.create({ data: { userId: CUENTA, remoteJid: jid, pushName: "Grupo", instanceId: L, status: true } });
  const sinFicha = `120364${Date.now()}@g.us`;
  await db.chatConversation.create({
    data: {
      userId: CUENTA, instanceName: L, remoteJid: sinFicha, pushName: "Grupo 2",
      lastMessageFromMe: false, lastMessageType: "conversation", lastMessageContent: "hola",
      lastMessageTimestamp: HACE_UNA_HORA,
    },
  });
  const viejo = (await contarComoAntes({ userIds: [CUENTA], instanceNames: [L] }))[L];
  assert.equal(viejo, 3, "la consulta vieja contaba el grupo con ficha dos veces");
  const nuevo = (await contarChatsPorLinea({ userIds: [CUENTA], instanceNames: [L] }))[L];
  assert.equal(nuevo, 2);
});
