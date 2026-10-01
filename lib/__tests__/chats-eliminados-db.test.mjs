/**
 * Un chat o un lead ELIMINADO no vuelve solo. Contra Postgres, con el esquema
 * real y las funciones de produccion.
 *
 * # El fallo
 *
 * Se eliminaba un chat o un lead, desaparecia, y al rato volvia a aparecer sin
 * que nadie lo tocara. No era el borrado: era lo que VOLVIA A ESCRIBIR lo
 * borrado.
 *
 *  - El sondeo del chat abierto, la precarga y la importacion de historial de
 *    Waha vuelven a guardar los mensajes viejos (`persistChatMessage`), y cada
 *    uno recreaba la conversacion y la ficha.
 *  - La reposicion de fichas (`crearFichasQueFaltan`, cada cinco minutos al
 *    abrir la bandeja) creaba otra vez el lead a partir de la conversacion.
 *  - El borrado solo quitaba lo guardado bajo UNA cuenta, y la copia de la
 *    conversacion guardada bajo la cuenta de quien la miraba sobrevivia.
 *  - Los recordatorios y seguimientos pendientes seguian saliendo.
 *
 * # El arreglo
 *
 * Eliminar deja una LAPIDA (`chats_eliminados`) bajo todas las identidades del
 * contacto, y todo lo que escribe un mensaje, una conversacion o una ficha la
 * mira antes. Lo eliminado vuelve SOLO si el contacto escribe despues.
 *
 * `MODO=roto` empaqueta este mismo fichero contra el arbol de un commit
 * pinchado (sin el arreglo) y AFIRMA el fallo: el chat y el lead vuelven. Los
 * casos de «esto no se puede haber aflojado» —el contacto escribe y vuelve,
 * una persona escribe y la conversacion se ve— pasan IGUAL en los dos modos.
 *
 * Se levanta con `scripts/banco-chats-eliminados.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import {
  ponerAQuienMira,
  deleteChatConversationAction,
  bulkDeleteChatsAction,
  getChatConversationPreferencesForAssociatedAccounts,
  deleteSession,
  persistChatMessage,
  getPersistedInboxChats,
  invalidatePersistedInboxCache,
  purgarEstosChats,
  db,
} from "./.compilado/eliminados/entrada-de-eliminados.js";

const ROTO = process.env.MODO === "roto";
const VUELTA = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** La espera del barrido, leida del codigo (en el «antes» no existe). */
function esperaDelBarrido() {
  const fichero = "lib/borrado-de-chats.server.ts";
  if (!existsSync(fichero)) return 5000;
  const m = readFileSync(fichero, "utf8").match(/ESPERA_DEL_BARRIDO_MS\s*=\s*([\d_]+)/);
  return m ? Number(m[1].replace(/_/g, "")) : 5000;
}

const dormir = (ms) => new Promise((listo) => setTimeout(listo, ms));

let cuantas = 0;
function n() {
  cuantas += 1;
  return cuantas;
}

async function cuenta(sufijo) {
  const id = `elim-${sufijo}-${VUELTA}`;
  await db.user.create({
    data: { id, email: `${id}@banco.test`, name: `Cuenta ${sufijo}`, role: "user" },
  });
  return id;
}

async function linea(userId, tipo, sufijo) {
  const nombre = `ELIM_${sufijo}_${VUELTA}`;
  await db.instancia.create({
    data: { userId, instanceName: nombre, instanceId: `i-${sufijo}-${VUELTA}`, instanceType: tipo },
  });
  return nombre;
}

function contactoNuevo() {
  const k = n();
  const num = `5730000${String(k).padStart(5, "0")}${String(Date.now()).slice(-3)}`;
  return {
    num: `${num}@s.whatsapp.net`,
    lid: `9${num.slice(1)}77@lid`,
  };
}

const HACE_DOS_HORAS = () => new Date(Date.now() - 2 * 60 * 60 * 1000);
const DESPUES = () => new Date(Date.now() + 3000);

/** Un mensaje como lo guarda el sondeo, la precarga o el webhook. */
async function mensaje(userId, nombreLinea, jid, opciones = {}) {
  const {
    fromMe = false,
    ts = HACE_DOS_HORAS(),
    historial = false,
    id = `MSG${n()}${VUELTA.replace(/-/g, "")}`,
    porUnaPersona = false,
    alt = null,
    texto = "hola",
    tipo = "waha",
  } = opciones;
  await persistChatMessage({
    userId,
    instanceName: nombreLinea,
    instanceType: tipo,
    remoteJid: jid,
    remoteJidAlt: alt,
    messageId: id,
    fromMe,
    pushName: fromMe ? null : "Cliente de prueba",
    messageType: "conversation",
    content: texto,
    raw: { message: { conversation: texto } },
    messageTimestamp: ts,
    puedeReabrir: historial ? false : undefined,
    porUnaPersona,
  });
  return id;
}

/** Lo que hay guardado de un contacto en una linea, bajo CUALQUIER cuenta. */
async function loQueHay(nombreLinea, jids) {
  const [m] = await db.$queryRaw`
    SELECT COUNT(*)::int AS n FROM "chat_messages"
    WHERE "instanceName" = ${nombreLinea}
      AND ("remoteJid" = ANY(${jids}::text[]) OR "remoteJidAlt" = ANY(${jids}::text[]))
  `;
  const [c] = await db.$queryRaw`
    SELECT COUNT(*)::int AS n FROM "chat_conversations"
    WHERE "instanceName" = ${nombreLinea}
      AND ("remoteJid" = ANY(${jids}::text[]) OR "remoteJidAlt" = ANY(${jids}::text[]))
  `;
  const fichas = await db.session.count({
    where: {
      instanceId: nombreLinea,
      OR: [{ remoteJid: { in: jids } }, { remoteJidAlt: { in: jids } }],
    },
  });
  return { mensajes: m.n, conversaciones: c.n, fichas };
}

async function enLaLista(userId, nombreLinea, jids) {
  invalidatePersistedInboxCache();
  const lista = await getPersistedInboxChats({ userIds: [userId], instanceNames: [nombreLinea] });
  return lista.some((chat) =>
    [chat.remoteJid, chat.remoteJidAlt, chat.senderPn].some((j) => j && jids.includes(j)),
  );
}

function actuarComo(userId) {
  ponerAQuienMira({ id: userId, role: "user", ownerId: null, advisorRole: null });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Eliminar un CHAT: el sondeo y el historial no lo vuelven a escribir
// ─────────────────────────────────────────────────────────────────────────────

test("1. eliminar un chat: el sondeo y la importacion de historial no lo vuelven a escribir", async () => {
  const A = await cuenta("chat");
  const L = await linea(A, "waha", "CHAT");
  const { num, lid } = contactoNuevo();
  actuarComo(A);

  // El contacto escribio hace dos horas: conversacion, mensajes y ficha.
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push(await mensaje(A, L, num, { alt: lid }));
  const antes = await loQueHay(L, [num, lid]);
  assert.equal(antes.mensajes, 3);
  assert.equal(antes.conversaciones, 1);
  assert.equal(antes.fichas, 1, "el contacto tiene su ficha antes de eliminar");

  const r = await deleteChatConversationAction({
    userId: A,
    instanceName: L,
    remoteJid: num,
    identidades: [num, lid],
  });
  assert.equal(r.success, true, r.message);
  const recien = await loQueHay(L, [num, lid]);
  assert.deepEqual(recien, { mensajes: 0, conversaciones: 0, fichas: 0 }, "el borrado se lo lleva todo");

  // El sondeo del chat abierto vuelve a traer los mismos mensajes (historial),
  // y la importacion de Waha los trae por la OTRA identidad (solo el @lid).
  for (const id of ids) await mensaje(A, L, num, { id, alt: lid, historial: true });
  for (const id of ids) await mensaje(A, L, lid, { id: `${id}-lid`, historial: true });
  // Y un mensaje viejo llega como si fuera en vivo (un reintento del webhook).
  await mensaje(A, L, num, { alt: lid });

  const despues = await loQueHay(L, [num, lid]);
  const sigueEnLaLista = await enLaLista(A, L, [num, lid]);

  if (ROTO) {
    assert.ok(despues.conversaciones > 0, "ANTES: la conversacion eliminada vuelve sola");
    assert.ok(despues.mensajes > 0, "ANTES: el historial eliminado vuelve");
    assert.ok(despues.fichas > 0, "ANTES: el lead eliminado vuelve");
    assert.equal(sigueEnLaLista, true, "ANTES: el chat eliminado vuelve a la lista");
    return;
  }
  assert.deepEqual(despues, { mensajes: 0, conversaciones: 0, fichas: 0 }, "nada de lo eliminado vuelve");
  assert.equal(sigueEnLaLista, false, "el chat eliminado no vuelve a la lista");
});

test("1b. si el contacto escribe DESPUES de eliminar, el chat vuelve (y lo viejo no)", async () => {
  const A = await cuenta("revive");
  const L = await linea(A, "waha", "REVIVE");
  const { num, lid } = contactoNuevo();
  actuarComo(A);

  const viejo = await mensaje(A, L, num, { alt: lid });
  const r = await deleteChatConversationAction({ userId: A, instanceName: L, remoteJid: num, identidades: [num, lid] });
  assert.equal(r.success, true, r.message);

  await mensaje(A, L, num, { alt: lid, ts: DESPUES(), texto: "volvi a escribir" });
  const ahora = await loQueHay(L, [num, lid]);
  assert.equal(ahora.conversaciones, 1, "el chat vuelve cuando el contacto escribe");
  assert.equal(ahora.fichas, 1, "el lead vuelve cuando el contacto escribe");
  assert.equal(await enLaLista(A, L, [num, lid]), true, "y se ve en la lista");

  if (ROTO) return;
  // El historial de antes se borro a proposito: no vuelve ni revivido.
  await mensaje(A, L, num, { id: viejo, alt: lid, historial: true });
  const conElViejo = await loQueHay(L, [num, lid]);
  assert.equal(conElViejo.mensajes, 1, "solo el mensaje nuevo: el historial eliminado no vuelve");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Eliminar un LEAD: la reposicion de fichas no lo vuelve a crear
// ─────────────────────────────────────────────────────────────────────────────

test("2. eliminar un lead: ni la reposicion de fichas ni el sondeo lo vuelven a crear", async () => {
  const B = await cuenta("lead");
  const L = await linea(B, "Whatsapp", "LEAD");
  const { num, lid } = contactoNuevo();
  actuarComo(B);

  const viejo = await mensaje(B, L, num, { alt: lid, tipo: "Whatsapp" });
  const ficha = await db.session.findFirst({ where: { instanceId: L, remoteJid: num } });
  assert.ok(ficha, "el lead existe");

  // Un seguimiento pendiente de ese contacto en esa linea.
  await db.seguimiento.create({
    data: { instancia: L, remoteJid: num, mensaje: "¿Sigues interesado?", tipo: "text", time: "1h" },
  });

  const r = await deleteSession(B, ficha.id, num);
  assert.equal(r.success, true, r.message);
  assert.equal((await loQueHay(L, [num, lid])).fichas, 0, "el lead se elimina");

  // Abrir la bandeja: corre la reposicion de fichas (la que creaba el lead otra vez).
  const pref = await getChatConversationPreferencesForAssociatedAccounts();
  assert.equal(pref.success, true, pref.message);
  // Y el sondeo vuelve a guardar el mensaje de antes.
  await mensaje(B, L, num, { id: viejo, alt: lid, historial: true, tipo: "Whatsapp" });

  const despues = await loQueHay(L, [num, lid]);
  const seguimientos = await db.seguimiento.count({ where: { instancia: L, remoteJid: num } });

  if (ROTO) {
    assert.ok(despues.fichas > 0, "ANTES: el lead eliminado vuelve solo");
    assert.ok(seguimientos > 0, "ANTES: el seguimiento del lead eliminado sigue pendiente");
    return;
  }
  assert.equal(despues.fichas, 0, "el lead eliminado no vuelve");
  assert.equal(despues.conversaciones, 1, "eliminar el lead no borra la conversacion");
  assert.equal(seguimientos, 0, "sus seguimientos pendientes se van con el");
});

test("2b. un lead eliminado vuelve cuando el contacto escribe despues", async () => {
  const B = await cuenta("lead-revive");
  const L = await linea(B, "Whatsapp", "LEADREV");
  const { num, lid } = contactoNuevo();
  actuarComo(B);

  await mensaje(B, L, num, { alt: lid, tipo: "Whatsapp" });
  const ficha = await db.session.findFirst({ where: { instanceId: L, remoteJid: num } });
  const r = await deleteSession(B, ficha.id, num);
  assert.equal(r.success, true, r.message);

  await mensaje(B, L, num, { alt: lid, ts: DESPUES(), tipo: "Whatsapp", texto: "quiero comprar" });
  assert.equal((await loQueHay(L, [num, lid])).fichas, 1, "el lead vuelve cuando el contacto escribe");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Lo que sale DESPUES de eliminar
// ─────────────────────────────────────────────────────────────────────────────

test("3. un envio automatico no devuelve un chat eliminado; una persona escribiendo si", async () => {
  const C = await cuenta("salida");
  const L = await linea(C, "waha", "SALIDA");
  const { num, lid } = contactoNuevo();
  actuarComo(C);

  await mensaje(C, L, num, { alt: lid });
  const r = await deleteChatConversationAction({ userId: C, instanceName: L, remoteJid: num, identidades: [num, lid] });
  assert.equal(r.success, true, r.message);

  // Un seguimiento o la IA: sale despues, pero nadie lo pidio.
  await mensaje(C, L, num, { alt: lid, ts: DESPUES(), fromMe: true, texto: "¿Seguimos?" });
  const tras = await loQueHay(L, [num, lid]);
  if (ROTO) {
    assert.ok(tras.conversaciones > 0, "ANTES: un seguimiento devolvia el chat eliminado");
  } else {
    assert.equal(tras.conversaciones, 0, "un envio automatico no devuelve el chat");
    assert.equal(tras.fichas, 0, "ni crea el lead");
  }

  // Una persona le escribe desde el panel: la conversacion se ve (la abrio
  // ella), pero el lead no vuelve hasta que el contacto conteste.
  await mensaje(C, L, num, { alt: lid, ts: DESPUES(), fromMe: true, porUnaPersona: true, texto: "Hola, te escribo yo" });
  const conLaPersona = await loQueHay(L, [num, lid]);
  assert.equal(conLaPersona.conversaciones, 1, "lo que escribe una persona se ve");
  assert.equal(conLaPersona.fichas, 0, "y no crea el lead");
  assert.equal(await enLaLista(C, L, [num, lid]), true, "la conversacion vuelve a la lista");
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. La copia guardada bajo OTRA cuenta
// ─────────────────────────────────────────────────────────────────────────────

test("4. eliminar se lleva tambien la copia guardada bajo la cuenta de quien miraba", async () => {
  const D = await cuenta("duena");
  const V = await cuenta("mira");
  const L = await linea(D, "waha", "COPIA");
  const { num, lid } = contactoNuevo();
  actuarComo(D);

  await mensaje(D, L, num, { alt: lid });
  // La bandeja unificada guardo la conversacion tambien bajo la cuenta que miraba.
  await mensaje(V, L, num, { alt: lid, id: `COPIA${VUELTA.replace(/-/g, "")}` });
  assert.equal((await loQueHay(L, [num, lid])).conversaciones, 2);

  const r = await deleteChatConversationAction({ userId: D, instanceName: L, remoteJid: num, identidades: [num, lid] });
  assert.equal(r.success, true, r.message);

  const despues = await loQueHay(L, [num, lid]);
  const enLaDeQuienMiraba = await enLaLista(V, L, [num, lid]);
  if (ROTO) {
    assert.ok(despues.conversaciones > 0, "ANTES: la copia de quien miraba sobrevivia");
    assert.equal(enLaDeQuienMiraba, true, "ANTES: el chat seguia en la bandeja de quien miraba");
    return;
  }
  assert.equal(despues.conversaciones, 0, "no queda ninguna copia de la conversacion");
  assert.equal(despues.mensajes, 0, "ni de sus mensajes");
  assert.equal(enLaDeQuienMiraba, false, "y no vuelve en la bandeja de nadie");
});

test("4b. con la misma linea en dos cuentas, una no borra el historial de la otra", async () => {
  const P = await cuenta("una");
  const Q = await cuenta("otra");
  const L = await linea(P, "waha", "DOBLE");
  // El mismo nombre de linea dado de alta tambien en otra cuenta.
  await db.instancia.create({
    data: { userId: Q, instanceName: L, instanceId: `i-doble-q-${VUELTA}`, instanceType: "waha" },
  });
  const { num, lid } = contactoNuevo();
  actuarComo(P);

  await mensaje(P, L, num, { alt: lid });
  await mensaje(Q, L, num, { alt: lid, id: `OTRA${VUELTA.replace(/-/g, "")}` });

  const r = await deleteChatConversationAction({ userId: P, instanceName: L, remoteJid: num, identidades: [num, lid] });
  assert.equal(r.success, true, r.message);
  const deLaOtra = await db.chatConversation.count({ where: { userId: Q, instanceName: L, remoteJid: num } });
  assert.equal(deLaOtra, 1, "la conversacion de la otra cuenta se queda");
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Recordatorios pendientes
// ─────────────────────────────────────────────────────────────────────────────

test("5. eliminar un chat se lleva sus recordatorios pendientes, no las plantillas", async () => {
  const E = await cuenta("record");
  const L = await linea(E, "waha", "RECORD");
  const { num, lid } = contactoNuevo();
  actuarComo(E);

  await mensaje(E, L, num, { alt: lid });
  await db.reminders.create({
    data: { title: "Pago pendiente", instanceName: L, remoteJid: num, userId: E, time: "10/10/2026 10:00" },
  });
  await db.reminders.create({
    data: { title: "Plantilla de la agenda", instanceName: L, userId: E, isSchedule: true, time: "minutes-30" },
  });

  const r = await deleteChatConversationAction({ userId: E, instanceName: L, remoteJid: num, identidades: [num, lid] });
  assert.equal(r.success, true, r.message);

  const delContacto = await db.reminders.count({ where: { instanceName: L, remoteJid: num } });
  const plantillas = await db.reminders.count({ where: { instanceName: L, isSchedule: true } });
  assert.equal(plantillas, 1, "las plantillas de la agenda no se tocan");
  if (ROTO) {
    assert.equal(delContacto, 1, "ANTES: el recordatorio seguia pendiente y le escribia al eliminado");
    return;
  }
  assert.equal(delContacto, 0, "el recordatorio pendiente del contacto se va");
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Eliminar en BLOQUE (fase 1 marca, fase 2 purga de fondo)
// ─────────────────────────────────────────────────────────────────────────────

test("6. eliminar en bloque: ni entre las dos fases ni despues vuelve lo eliminado", async () => {
  const F = await cuenta("bloque");
  const L = await linea(F, "Whatsapp", "BLOQUE");
  const uno = contactoNuevo();
  const dos = contactoNuevo();
  actuarComo(F);

  const idUno = await mensaje(F, L, uno.num, { alt: uno.lid, tipo: "Whatsapp" });
  const idDos = await mensaje(F, L, dos.num, { alt: dos.lid, tipo: "Whatsapp" });

  const r = await bulkDeleteChatsAction({
    userId: F,
    instanceName: L,
    remoteJids: [uno.num, dos.num],
    identidadesPorJid: { [uno.num]: [uno.num, uno.lid], [dos.num]: [dos.num, dos.lid] },
  });
  assert.equal(r.success, true, r.message);

  // La fase 2 (la purga del historial). Se espera aqui en vez de dejarla de
  // fondo, para que el caso no dependa de cuando termine.
  await purgarEstosChats([
    { userId: F, instanceName: L, remoteJid: uno.num },
    { userId: F, instanceName: L, remoteJid: dos.num },
  ]);
  const purgado = await loQueHay(L, [uno.num, uno.lid, dos.num, dos.lid]);
  assert.equal(purgado.conversaciones, 0, "la purga se lleva las conversaciones");

  // El sondeo de Evolution vuelve a traer los mensajes de antes.
  await mensaje(F, L, uno.num, { id: idUno, alt: uno.lid, historial: true, tipo: "Whatsapp" });
  await mensaje(F, L, dos.num, { id: idDos, alt: dos.lid, historial: true, tipo: "Whatsapp" });

  const despues = await loQueHay(L, [uno.num, uno.lid, dos.num, dos.lid]);
  if (ROTO) {
    assert.ok(despues.mensajes > 0, "ANTES: el historial eliminado en bloque volvia");
    assert.ok(despues.fichas > 0, "ANTES: los leads eliminados en bloque volvian");
    return;
  }
  assert.deepEqual(despues, { mensajes: 0, conversaciones: 0, fichas: 0 }, "lo eliminado en bloque no vuelve");

  // Y revivir a uno no revive al otro de la misma tanda.
  await mensaje(F, L, uno.num, { alt: uno.lid, ts: DESPUES(), tipo: "Whatsapp", texto: "hola de nuevo" });
  assert.equal((await loQueHay(L, [uno.num, uno.lid])).fichas, 1, "el que escribe vuelve");
  await mensaje(F, L, dos.num, { id: idDos, alt: dos.lid, historial: true, tipo: "Whatsapp" });
  assert.equal((await loQueHay(L, [dos.num, dos.lid])).fichas, 0, "el otro sigue eliminado");
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Lo que ya estaba en camino cuando se elimino
// ─────────────────────────────────────────────────────────────────────────────

test("7. lo que se colo a la vez que el borrado se barre unos segundos despues", async () => {
  const G = await cuenta("colado");
  const L = await linea(G, "waha", "COLADO");
  const { num, lid } = contactoNuevo();
  actuarComo(G);

  await mensaje(G, L, num, { alt: lid });
  const r = await deleteChatConversationAction({ userId: G, instanceName: L, remoteJid: num, identidades: [num, lid] });
  assert.equal(r.success, true, r.message);

  // Una vuelta del sondeo que leyo «no hay lapida» un instante antes de que el
  // borrado la escribiera: escribe la conversacion igual.
  await db.chatConversation.create({
    data: {
      userId: G,
      instanceName: L,
      remoteJid: num,
      remoteJidAlt: lid,
      pushName: "Cliente de prueba",
      lastMessageFromMe: false,
      lastMessageType: "conversation",
      lastMessageContent: "hola",
      lastMessageTimestamp: HACE_DOS_HORAS(),
    },
  });

  await dormir(esperaDelBarrido() + 1500);
  const despues = await loQueHay(L, [num, lid]);
  if (ROTO) {
    assert.equal(despues.conversaciones, 1, "ANTES: lo que se colaba se quedaba y el chat volvia");
    return;
  }
  assert.equal(despues.conversaciones, 0, "el barrido se lleva lo que se colo");
});

test("7b. el barrido no toca un chat que el contacto revivio mientras tanto", async () => {
  const H = await cuenta("colado-vivo");
  const L = await linea(H, "waha", "COLVIVO");
  const { num, lid } = contactoNuevo();
  actuarComo(H);

  await mensaje(H, L, num, { alt: lid });
  const r = await deleteChatConversationAction({ userId: H, instanceName: L, remoteJid: num, identidades: [num, lid] });
  assert.equal(r.success, true, r.message);
  await mensaje(H, L, num, { alt: lid, ts: DESPUES(), texto: "ya volvi" });

  await dormir(esperaDelBarrido() + 1500);
  const despues = await loQueHay(L, [num, lid]);
  assert.equal(despues.conversaciones, 1, "la conversacion revivida se queda");
  assert.equal(despues.fichas, 1, "y su lead tambien");
});
