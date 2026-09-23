/**
 * El relleno de historial de una linea: trae del proveedor lo que falta, sin
 * duplicar y sin partir conversaciones.
 *
 * Lo reportado: un cliente reclama los mensajes que el dueño escribio desde su
 * telefono ANTES de api-webhook#174/#175, que nunca se guardaron. Evolution y
 * Waha si los tienen; esto los trae.
 *
 * Lo que solo se ve contra Postgres, y por eso esta aqui:
 *
 * - el mismo mensaje ya guardado con el id en OTRA forma (Waha lo serializa,
 *   Evolution lo da pelado) no se vuelve a escribir;
 * - una conversacion guardada bajo el `@lid` y devuelta por el proveedor por
 *   el NUMERO no se parte en dos: lo que falta cae bajo el `@lid`;
 * - revisar un chat no escribe nada;
 * - la linea entera se recorre, se puede relanzar sin duplicar, se retoma
 *   donde se quedo y no corre dos veces a la vez.
 *
 * `MODO=roto` corre el relleno ingenuo —volver a guardar todo con
 * `persistEvolutionMessages`, que es lo que hace el reloj del chat abierto— y
 * AFIRMA que parte la conversacion del `@lid`. Se levanta con
 * `scripts/banco-relleno-de-historial.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  rellenarLaLinea,
  rellenarUnChat,
  revisarUnChat,
  estadoDelRelleno,
  laLineaDelRelleno,
  traidoDeEvolution,
  traidoDeWaha,
  planDelChat,
  chatsQueQuedan,
  persistEvolutionMessages,
  db,
} from "./.compilado/relleno/entrada-del-relleno.js";

const ROTO = process.env.MODO === "roto";
const V = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const CUENTA = `cuenta-${V}`;
const LINEA = `LINEA_${V}`;
const WAHA = `WAHA_${V}`;
const P = String(Date.now()).slice(-5);
const NUM1 = `5730010${P}@s.whatsapp.net`;
const NUM2 = `5730020${P}@s.whatsapp.net`;
const LID2 = `99${P}123456@lid`;
const NUM3 = `5730030${P}@s.whatsapp.net`;
const GRUPO = `120363${P}000111@g.us`;
const T0 = Math.floor(Date.now() / 1000) - 86400 * 30;

function evo({ id, jid, fromMe, texto, ts, alt, senderPn }) {
  return {
    key: { id, remoteJid: jid, fromMe, ...(alt ? { remoteJidAlt: alt } : {}), ...(senderPn ? { senderPn } : {}) },
    pushName: fromMe ? "" : "Cliente",
    messageType: "conversation",
    message: { conversation: texto },
    messageTimestamp: ts,
  };
}

async function filas(linea, jid) {
  return db.$queryRaw`
    SELECT "messageId", "fromMe", "content", "remoteJid", "messageTimestamp" AS ts
      FROM "chat_messages" WHERE "instanceName" = ${linea} AND "remoteJid" = ${jid}
     ORDER BY "messageTimestamp" ASC, "id" ASC`;
}
async function todasLasFilas(linea) {
  return db.$queryRaw`
    SELECT "messageId", "fromMe", "remoteJid" FROM "chat_messages" WHERE "instanceName" = ${linea}`;
}

// ── Lo que ya hay en nuestra base (escrito por el camino de produccion) ──
// y lo que tiene el PROVEEDOR de cada chat.
const historial = {
  // Chat 1: tenemos el entrante y el de la plataforma; falta lo del telefono y
  // un entrante. El de la plataforma esta guardado con el id SERIALIZADO de
  // cuando la linea era de Waha; Evolution lo da pelado.
  [NUM1]: [
    evo({ id: `IN1${V}`, jid: NUM1, fromMe: false, texto: "Hola, ¿precio?", ts: T0 }),
    evo({ id: `APP1${V}`, jid: NUM1, fromMe: true, texto: "Son 50 mil.", ts: T0 + 60 }),
    evo({ id: `TEL1${V}`, jid: NUM1, fromMe: true, texto: "Desde el celular: ya te lo mando.", ts: T0 + 120 }),
    evo({ id: `IN2${V}`, jid: NUM1, fromMe: false, texto: "Gracias", ts: T0 + 180 }),
  ],
  // Chat 2: en nuestra base vive bajo el @lid. El proveedor lo da por el NUMERO.
  [NUM2]: [
    evo({ id: `IN3${V}`, jid: NUM2, fromMe: false, texto: "Buenas", ts: T0 + 300, alt: LID2 }),
    evo({ id: `TEL2${V}`, jid: NUM2, fromMe: true, texto: "Desde el celular: dime.", ts: T0 + 360, alt: LID2 }),
  ],
  // Chat 3: no tenemos NADA de el.
  [NUM3]: [
    evo({ id: `TEL3${V}`, jid: NUM3, fromMe: true, texto: "Te escribo yo primero.", ts: T0 + 500 }),
  ],
  // Un grupo, con lo del telefono dentro.
  [GRUPO]: [
    { ...evo({ id: `GIN${V}`, jid: GRUPO, fromMe: false, texto: "¿Quién atiende?", ts: T0 + 600 }), key: { id: `GIN${V}`, remoteJid: GRUPO, fromMe: false, participant: NUM1 } },
    evo({ id: `GTEL${V}`, jid: GRUPO, fromMe: true, texto: "Yo, desde el celular.", ts: T0 + 660 }),
  ],
};

const pedidos = [];
function proveedorFingido(linea = LINEA) {
  return {
    nombre: "evolution",
    async listarChats() {
      return [NUM1, NUM2, NUM3, GRUPO, "status@broadcast"];
    },
    async traerMensajes(jid) {
      pedidos.push(jid);
      const h = historial[jid];
      if (!h) return { mensajes: [], recortado: false };
      return { mensajes: h.map((m) => traidoDeEvolution(m, linea)), recortado: false };
    },
  };
}

test.before(async () => {
  await db.user.create({ data: { id: CUENTA, email: `${CUENTA}@banco.test`, name: CUENTA, role: "user" } });
  await db.instancia.create({
    data: { instanceName: LINEA, instanceId: `id-${V}`, userId: CUENTA, instanceType: "Whatsapp" },
  });
  await db.instancia.create({
    data: { instanceName: WAHA, instanceId: `idw-${V}`, userId: CUENTA, instanceType: "waha" },
  });
  // Chat 1: el entrante con su id, y el de la plataforma con el id serializado.
  await persistEvolutionMessages({
    userId: CUENTA, instanceName: LINEA, remoteJid: NUM1,
    messages: [
      evo({ id: `IN1${V}`, jid: NUM1, fromMe: false, texto: "Hola, ¿precio?", ts: T0 }),
      evo({ id: `true_${NUM1.replace("@s.whatsapp.net", "@c.us")}_APP1${V}`, jid: NUM1, fromMe: true, texto: "Son 50 mil.", ts: T0 + 60 }),
    ],
  });
  // Chat 2: guardado SOLO bajo el @lid, como entra un contacto en privacidad.
  await persistEvolutionMessages({
    userId: CUENTA, instanceName: LINEA, remoteJid: LID2,
    messages: [evo({ id: `IN3${V}`, jid: LID2, fromMe: false, texto: "Buenas", ts: T0 + 300 })],
  });
});

test.after(async () => {
  await db.$disconnect();
});

test("la decision: el id se compara crudo y lo que falta cae donde vive la conversacion", () => {
  const plan = planDelChat({
    jidDelProveedor: NUM2,
    traidos: [
      { messageId: "A", fromMe: false, jids: [NUM2] },
      { messageId: "B", fromMe: true, jids: [NUM2] },
      { messageId: "B", fromMe: true, jids: [NUM2] },
    ],
    existentes: [{ messageId: "false_x@c.us_A", fromMe: false, remoteJid: LID2 }],
  });
  assert.equal(plan.escribirBajo, LID2);
  assert.deepEqual(plan.aEscribir.map((m) => m.messageId), ["B"]);
  assert.equal(plan.yaEstaban, 1);
  assert.equal(plan.repetidosEnLoTraido, 1);
  assert.deepEqual(chatsQueQuedan(["b@s.whatsapp.net", "status@broadcast", "a@s.whatsapp.net", "c@g.us"], "a@s.whatsapp.net"), [
    "b@s.whatsapp.net",
    "c@g.us",
  ]);
});

if (ROTO) {
  test("ANTES: el relleno ingenuo parte la conversacion del @lid y duplica lo de la plataforma", async () => {
    for (const jid of [NUM1, NUM2]) {
      await persistEvolutionMessages({ userId: CUENTA, instanceName: LINEA, remoteJid: jid, messages: historial[jid] });
    }
    // El chat 2 ahora tiene filas bajo el NUMERO y bajo el @lid: dos conversaciones.
    assert.ok((await filas(LINEA, NUM2)).length > 0, "deberia haber escrito bajo el numero");
    assert.ok((await filas(LINEA, LID2)).length > 0);
    // Y el de la plataforma sale dos veces: con el id serializado y con el pelado.
    const app = (await filas(LINEA, NUM1)).filter((f) => f.content === "Son 50 mil.");
    assert.equal(app.length, 2);
  });
} else {
  test("revisar un chat no escribe nada y dice donde escribiria", async () => {
    const linea = await laLineaDelRelleno(LINEA);
    const antes = (await todasLasFilas(LINEA)).length;
    const inf = await revisarUnChat(linea, proveedorFingido(), NUM2);
    assert.equal((await todasLasFilas(LINEA)).length, antes);
    assert.equal(inf.escribirBajo, LID2);
    assert.equal(inf.aEscribir, 1);
    assert.equal(inf.aEscribirDelNegocio, 1);
    assert.equal(inf.yaEstaban, 1);
    assert.equal(inf.yaPartida, false);
  });

  test("un chat: entrante + plataforma + telefono en la misma conversacion, en orden, sin duplicados", async () => {
    const linea = await laLineaDelRelleno(LINEA);
    const inf = await rellenarUnChat(linea, proveedorFingido(), NUM1);
    assert.equal(inf.escritos, 2);
    const f = await filas(LINEA, NUM1);
    assert.deepEqual(
      f.map((x) => x.content),
      ["Hola, ¿precio?", "Son 50 mil.", "Desde el celular: ya te lo mando.", "Gracias"],
    );
    assert.deepEqual(f.map((x) => x.fromMe), [false, true, true, false]);
    // Con su hora real, no la de ahora.
    const tel = f.find((x) => x.content.startsWith("Desde el celular"));
    assert.equal(Math.floor(new Date(tel.ts).getTime() / 1000), T0 + 120);
  });

  test("el chat del @lid no se parte: lo que falta cae bajo el @lid", async () => {
    const linea = await laLineaDelRelleno(LINEA);
    await rellenarUnChat(linea, proveedorFingido(), NUM2);
    assert.equal((await filas(LINEA, NUM2)).length, 0, "no puede nacer una conversacion bajo el numero");
    const f = await filas(LINEA, LID2);
    assert.deepEqual(f.map((x) => x.content), ["Buenas", "Desde el celular: dime."]);
    const conv = await db.$queryRaw`
      SELECT "remoteJid" FROM "chat_conversations" WHERE "instanceName" = ${LINEA} AND "remoteJid" IN (${NUM2}, ${LID2})`;
    assert.deepEqual(conv.map((c) => c.remoteJid), [LID2]);
  });

  test("la linea entera: recorre todo (grupos incluidos, sin estados) y queda terminada", async () => {
    const linea = await laLineaDelRelleno(LINEA);
    pedidos.length = 0;
    const r = await rellenarLaLinea(linea, { proveedor: proveedorFingido(), pausaEntreChatsMs: 0, desdeCero: true });
    assert.equal(r.ok, true);
    assert.ok(!pedidos.includes("status@broadcast"));
    assert.ok(pedidos.includes(GRUPO) && pedidos.includes(NUM3));
    assert.equal(r.estado.estado, "terminado");
    assert.equal(r.estado.chatsTotal, r.estado.chatsHechos);
    assert.deepEqual((await filas(LINEA, NUM3)).map((x) => x.content), ["Te escribo yo primero."]);
    assert.deepEqual((await filas(LINEA, GRUPO)).map((x) => x.fromMe), [false, true]);
  });

  test("relanzarla no duplica nada", async () => {
    const linea = await laLineaDelRelleno(LINEA);
    const antes = await todasLasFilas(LINEA);
    const r = await rellenarLaLinea(linea, { proveedor: proveedorFingido(), pausaEntreChatsMs: 0, desdeCero: true });
    assert.equal(r.estado.escritos, 0);
    assert.equal((await todasLasFilas(LINEA)).length, antes.length);
    // Ni un id de WhatsApp repetido en la linea.
    const llaves = antes.map((f) => `${f.fromMe}:${String(f.messageId).split("_").length >= 3 ? String(f.messageId).split("_")[2] : f.messageId}`);
    assert.equal(new Set(llaves).size, llaves.length);
  });

  test("un recorrido cortado se retoma por el chat siguiente", async () => {
    const linea = await laLineaDelRelleno(LINEA);
    // Como lo dejaria un despliegue: «corriendo», sin latido, a medias.
    await db.$executeRaw`
      UPDATE "relleno_de_historial" SET "estado" = 'corriendo', "latidoEn" = NOW() - INTERVAL '1 hour',
             "ultimoChat" = ${NUM1}, "chatsHechos" = 2, "terminadoEn" = NULL
       WHERE "instanceName" = ${LINEA}`;
    assert.equal((await estadoDelRelleno(LINEA)).estado, "interrumpido");
    pedidos.length = 0;
    const r = await rellenarLaLinea(linea, { proveedor: proveedorFingido(), pausaEntreChatsMs: 0 });
    assert.equal(r.ok, true);
    assert.ok(!pedidos.includes(NUM1), "no vuelve a pedir lo ya hecho");
    assert.ok(pedidos.includes(NUM2) && pedidos.includes(NUM3));
  });

  test("dos lanzamientos a la vez: corre uno", async () => {
    const linea = await laLineaDelRelleno(LINEA);
    const lento = {
      ...proveedorFingido(),
      async traerMensajes(jid) {
        await new Promise((r) => setTimeout(r, 50));
        return proveedorFingido().traerMensajes(jid);
      },
    };
    const [a, b] = await Promise.all([
      rellenarLaLinea(linea, { proveedor: lento, pausaEntreChatsMs: 0, desdeCero: true }),
      rellenarLaLinea(linea, { proveedor: lento, pausaEntreChatsMs: 0, desdeCero: true }),
    ]);
    assert.equal([a, b].filter((x) => x.ok).length, 1);
    assert.match([a, b].find((x) => !x.ok).motivo, /Ya hay un relleno/);
  });

  test("Waha: la misma regla, con su traduccion de siempre", async () => {
    const linea = await laLineaDelRelleno(WAHA);
    const chat = `5730040${P}@s.whatsapp.net`;
    const c = chat.replace("@s.whatsapp.net", "@c.us");
    const crudos = [
      { id: `false_${c}_WIN${V}`, timestamp: T0 + 700, from: c, to: "me@c.us", fromMe: false, body: "Hola" },
      { id: `true_${c}_WTEL${V}`, timestamp: T0 + 760, from: "me@c.us", to: c, fromMe: true, body: "Desde el celular" },
    ];
    const prov = {
      nombre: "waha",
      async listarChats() { return [chat]; },
      async traerMensajes() { return { mensajes: crudos.map((m) => traidoDeWaha(m, WAHA)), recortado: false }; },
    };
    // Ya teniamos el entrante (lo guardo el webhook).
    await rellenarUnChat(linea, { ...prov, async traerMensajes() { return { mensajes: [traidoDeWaha(crudos[0], WAHA)], recortado: false }; } }, chat);
    const r = await rellenarLaLinea(linea, { proveedor: prov, pausaEntreChatsMs: 0, desdeCero: true });
    assert.equal(r.estado.escritos, 1);
    const f = await filas(WAHA, chat);
    assert.deepEqual(f.map((x) => [x.fromMe, x.content]), [[false, "Hola"], [true, "Desde el celular"]]);
  });
}
