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
  rellenarTodasLasLineas,
  buscarLineas,
  lineasQueQuedan,
  laLineaCasa,
  RECORRIDO_DE_TODAS,
  rellenarUnChat,
  revisarUnChat,
  estadoDelRelleno,
  TOPE_DE_FALLOS_SEGUIDOS,
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

// ── Todas las líneas de la plataforma ──

test("todas: el orden, lo recién terminado y la búsqueda por número", () => {
  const ahora = new Date("2026-09-24T12:00:00Z");
  const empezado = new Date("2026-09-24T11:00:00Z");
  const quedan = lineasQueQuedan(
    [
      { instanceName: "C", terminadoEn: null },
      { instanceName: "A", terminadoEn: new Date("2026-09-24T11:30:00Z") }, // en este recorrido
      { instanceName: "RCA", terminadoEn: new Date("2026-09-24T09:00:00Z") }, // a mano, esta mañana
      { instanceName: "B", terminadoEn: new Date("2026-09-20T09:00:00Z") }, // hace días: se repasa
      { instanceName: "C", terminadoEn: null },
      { instanceName: RECORRIDO_DE_TODAS, terminadoEn: null },
    ],
    empezado,
    ahora,
  );
  assert.deepEqual(quedan, ["B", "C"]);

  const rca = { instanceName: "RCA_LINEA", nombre: "Roberto Crespo", telefonos: ["+507 6284-4456"] };
  assert.equal(laLineaCasa("+50762844456", rca), true);
  assert.equal(laLineaCasa("62844456", rca), true);
  assert.equal(laLineaCasa("roberto crespo", rca), true);
  assert.equal(laLineaCasa("rca", rca), true);
  assert.equal(laLineaCasa("+50762844457", rca), false);
  assert.equal(laLineaCasa("", rca), false);
});

if (!ROTO) {
  const LINEA_B = `LINEAB_${V}`;
  const NUMB = `5730050${P}@s.whatsapp.net`;
  const historialB = [evo({ id: `TELB${V}`, jid: NUMB, fromMe: true, texto: "Desde el celular, línea B.", ts: T0 + 900 })];
  const pedidosPorLinea = [];
  const proveedorDe = async (linea) => ({
    nombre: "evolution",
    async listarChats() {
      return linea.instanceName === LINEA_B ? [NUMB] : [NUM1, NUM2, NUM3, GRUPO];
    },
    async traerMensajes(jid) {
      pedidosPorLinea.push(`${linea.instanceName}:${jid}`);
      const h = linea.instanceName === LINEA_B ? (jid === NUMB ? historialB : []) : historial[jid] ?? [];
      return { mensajes: h.map((m) => traidoDeEvolution(m, linea.instanceName)), recortado: false };
    },
  });

  test("todas: en serie, una detrás de otra, y se salta la que se lanzó a mano antes", async () => {
    await db.user.update({ where: { id: CUENTA }, data: { notificationNumber: `+57 300 70${P}` } });
    await db.instancia.create({ data: { instanceName: LINEA_B, instanceId: `idb-${V}`, userId: CUENTA, instanceType: "Whatsapp" } });
    // La línea «del cliente que reclama» se rellenó a mano primero.
    const a = await laLineaDelRelleno(LINEA);
    await rellenarLaLinea(a, { proveedor: await proveedorDe(a), pausaEntreChatsMs: 0, desdeCero: true });
    const b = await laLineaDelRelleno(LINEA_B);

    pedidosPorLinea.length = 0;
    const r = await rellenarTodasLasLineas({ lineas: [b, a], proveedorDe, pausaEntreLineasMs: 0, pausaEntreChatsMs: 0, desdeCero: true });
    assert.equal(r.ok, true);
    assert.ok(pedidosPorLinea.every((x) => x.startsWith(`${LINEA_B}:`)), `no repite la línea hecha a mano: ${pedidosPorLinea}`);
    assert.equal(r.estado.chatsTotal, 1, "una línea por recorrer");
    assert.equal(r.estado.escritos, 1);
    const f = await filas(LINEA_B, NUMB);
    assert.deepEqual(f.map((x) => [x.fromMe, x.content]), [[true, "Desde el celular, línea B."]]);
    const g = await db.$queryRaw`SELECT "estado" FROM "relleno_de_historial" WHERE "instanceName" = ${LINEA_B}`;
    assert.equal(g[0].estado, "terminado");
  });

  test("todas: relanzarlo no duplica ni repite, y dos a la vez corre uno", async () => {
    const lineas = [await laLineaDelRelleno(LINEA), await laLineaDelRelleno(LINEA_B)];
    const antes = (await todasLasFilas(LINEA)).length + (await todasLasFilas(LINEA_B)).length;
    pedidosPorLinea.length = 0;
    const lento = async (l) => {
      const p = await proveedorDe(l);
      return { ...p, async traerMensajes(j) { await new Promise((z) => setTimeout(z, 30)); return p.traerMensajes(j); } };
    };
    const [x, y] = await Promise.all([
      rellenarTodasLasLineas({ lineas, proveedorDe: lento, pausaEntreLineasMs: 0, pausaEntreChatsMs: 0, desdeCero: true }),
      rellenarTodasLasLineas({ lineas, proveedorDe: lento, pausaEntreLineasMs: 0, pausaEntreChatsMs: 0, desdeCero: true }),
    ]);
    assert.equal([x, y].filter((z) => z.ok).length, 1);
    assert.match([x, y].find((z) => !z.ok).motivo, /Ya hay un recorrido/);
    const despues = (await todasLasFilas(LINEA)).length + (await todasLasFilas(LINEA_B)).length;
    assert.equal(despues, antes, "nada nuevo que escribir: no duplica");
  });

  test("todas: un recorrido cortado por un despliegue sigue por las líneas que faltan", async () => {
    const lineas = [await laLineaDelRelleno(LINEA), await laLineaDelRelleno(LINEA_B)];
    // Como lo deja un despliegue: corriendo, sin latido, LINEA ya hecha en este recorrido y B no.
    await db.$executeRaw`
      UPDATE "relleno_de_historial" SET "estado" = 'corriendo', "latidoEn" = NOW() - INTERVAL '1 hour',
             "empezadoEn" = NOW() - INTERVAL '2 hours', "chatsHechos" = 1, "chatsTotal" = 2, "terminadoEn" = NULL
       WHERE "instanceName" = ${RECORRIDO_DE_TODAS}`;
    await db.$executeRaw`UPDATE "relleno_de_historial" SET "terminadoEn" = NOW() - INTERVAL '90 minutes' WHERE "instanceName" = ${LINEA}`;
    await db.$executeRaw`UPDATE "relleno_de_historial" SET "terminadoEn" = NOW() - INTERVAL '3 days' WHERE "instanceName" = ${LINEA_B}`;
    assert.equal((await estadoDelRelleno(RECORRIDO_DE_TODAS)).estado, "interrumpido");
    pedidosPorLinea.length = 0;
    const r = await rellenarTodasLasLineas({ lineas, proveedorDe, pausaEntreLineasMs: 0, pausaEntreChatsMs: 0 });
    assert.equal(r.ok, true);
    assert.ok(pedidosPorLinea.length > 0 && pedidosPorLinea.every((z) => z.startsWith(`${LINEA_B}:`)), `${pedidosPorLinea}`);
    assert.equal(r.estado.chatsHechos, 2);
  });

  test("buscar: la línea por el número del dueño, con y sin indicativo, y su estado", async () => {
    const porNumero = await buscarLineas(`300 70${P}`);
    assert.ok(porNumero.some((l) => l.instanceName === LINEA_B));
    assert.ok(porNumero.every((l) => !("telefonos" in l)), "no devuelve los teléfonos");
    const porNombre = await buscarLineas(CUENTA);
    const b = porNombre.find((l) => l.instanceName === LINEA_B);
    assert.equal(b.relleno.estado, "terminado");
    assert.equal(b.proveedor, "evolution");
    assert.ok(porNombre.some((l) => l.instanceName === WAHA && l.proveedor === "waha"));
  });
}

// ── Los dos casos que cazó RCA en producción (MULTIGAMA_SA, 2026-09-24) ──

if (!ROTO) {
  test("RCA 1: chat abierto por el @lid con su historial bajo el NUMERO, unidos solo por una fila", async () => {
    const linea = await laLineaDelRelleno(WAHA);
    const num = `5076600${P}@s.whatsapp.net`;
    const lid = `5441300${P}77@lid`;
    // Lo que ya habia: 5 mensajes bajo el numero con id PELADO, y UNO que
    // lleva el @lid en remoteJidAlt (el unico puente). La conversacion del
    // @lid existe, sin enlace al numero.
    for (let i = 0; i < 5; i++) {
      await db.$executeRaw`
        INSERT INTO "chat_messages" ("userId","instanceName","instanceType","remoteJid","remoteJidAlt","messageId","fromMe","messageType","content","raw","messageTimestamp","updatedAt")
        VALUES (${CUENTA}, ${WAHA}, 'waha', ${num}, ${i === 0 ? lid : null}, ${`3AOLD${i}${V}`}, ${i % 2 === 0}, 'conversation', ${`viejo ${i}`}, '{}'::jsonb, to_timestamp(${T0 + 1000 + i}), NOW())`;
    }
    await db.$executeRaw`
      INSERT INTO "chat_conversations" ("userId","instanceName","remoteJid","lastMessageTimestamp")
      VALUES (${CUENTA}, ${WAHA}, ${lid}, to_timestamp(${T0 + 1000}))
      ON CONFLICT DO NOTHING`.catch(() => {});
    // Waha lista el chat por el @lid y devuelve los 5 con el id SERIALIZADO por el @lid.
    const crudos = [0, 1, 2, 3, 4].map((i) => ({
      id: `${i % 2 === 0}_${lid}_3AOLD${i}${V}`,
      timestamp: T0 + 1000 + i,
      from: i % 2 === 0 ? "me@c.us" : lid,
      to: i % 2 === 0 ? lid : "me@c.us",
      fromMe: i % 2 === 0,
      body: `viejo ${i}`,
    }));
    const prov = {
      nombre: "waha",
      async listarChats() { return [lid]; },
      async traerMensajes() { return { mensajes: crudos.map((m) => traidoDeWaha(m, WAHA)), recortado: false }; },
    };
    const inf = await revisarUnChat(linea, prov, lid);
    assert.equal(inf.aEscribir, 0, `no hay nada que escribir: ${JSON.stringify(inf)}`);
    assert.equal(inf.yaEstaban, 5);
    const w = await rellenarUnChat(linea, prov, lid);
    assert.equal(w.escritos, 0);
  });

  test("RCA 2: el proveedor lista al mismo contacto dos veces (numero y @lid) y el mensaje se guarda UNA vez", async () => {
    const linea = await laLineaDelRelleno(WAHA);
    const num = `5076700${P}@s.whatsapp.net`;
    const lid = `1841080${P}88@lid`;
    // Como en produccion: el MISMO id, pero cada chat lo devuelve con su propio `from`.
    const c = num.replace("@s.whatsapp.net", "@c.us");
    const prov = {
      nombre: "waha",
      async listarChats() { return [num, lid]; },
      async traerMensajes(jid) {
        const from = jid === lid ? lid : c;
        const m = { id: `false_${lid}_3ADOS${V}`, timestamp: T0 + 2000, from, to: "me@c.us", fromMe: false, body: "hola desde el lid" };
        return { mensajes: [traidoDeWaha(m, WAHA)], recortado: false };
      },
    };
    const r = await rellenarLaLinea(linea, { proveedor: prov, pausaEntreChatsMs: 0, desdeCero: true });
    assert.equal(r.ok, true);
    const n = await db.$queryRaw`
      SELECT count(*)::int n FROM "chat_messages" WHERE "instanceName" = ${WAHA} AND "messageId" LIKE ${`%3ADOS${V}`}`;
    assert.equal(n[0].n, 1, "una sola fila para el mismo mensaje");
  });

  test("AMERICA: lo que entra EN VIVO a mitad del recorrido no se vuelve a escribir", async () => {
    const VIVA = `VIVA_${V}`;
    await db.instancia.create({ data: { instanceName: VIVA, instanceId: `idv-${V}`, userId: CUENTA, instanceType: "Whatsapp" } });
    const linea = await laLineaDelRelleno(VIVA);
    // Como en produccion: la IA guarda su respuesta en vivo bajo un jid pelado,
    // sin puente con el de verdad, mientras el recorrido va por otro chat.
    const pelado = `5287110${P}`;
    const bueno = `52187110${P}@s.whatsapp.net`;
    const otro = `5730090${P}@s.whatsapp.net`;
    const ahora = Math.floor(Date.now() / 1000);
    const respuesta = evo({ id: `3EBVIVO${V}`, jid: bueno, fromMe: true, texto: "Respuesta de la IA", ts: ahora });
    const prov = {
      nombre: "evolution",
      // Se lista DESPUES de leer las llaves de la linea: lo que entra aqui es
      // justo lo que la foto inicial no ve.
      async listarChats() {
        await persistEvolutionMessages({
          userId: CUENTA, instanceName: VIVA, remoteJid: pelado,
          messages: [evo({ id: `3EBVIVO${V}`, jid: pelado, fromMe: true, texto: "Respuesta de la IA", ts: ahora })],
        });
        return [otro, bueno];
      },
      async traerMensajes(jid) {
        if (jid === otro) return { mensajes: [], recortado: false };
        return { mensajes: [traidoDeEvolution(respuesta, VIVA)], recortado: false };
      },
    };
    const r = await rellenarLaLinea(linea, { proveedor: prov, pausaEntreChatsMs: 0, desdeCero: true });
    assert.equal(r.ok, true);
    const n = await db.$queryRaw`
      SELECT count(*)::int n FROM "chat_messages" WHERE "instanceName" = ${VIVA} AND "messageId" = ${`3EBVIVO${V}`}`;
    assert.equal(n[0].n, 1, "la respuesta guardada en vivo no se duplica bajo el jid bueno");
  });
  test("AUDFONOS: la linea cambia de proveedor a mitad del recorrido y se corta diciendolo", async () => {
    const MUDA = `MUDA_${V}`;
    await db.instancia.create({ data: { instanceName: MUDA, instanceId: `idm-${V}`, userId: CUENTA, instanceType: "Whatsapp" } });
    const linea = await laLineaDelRelleno(MUDA);
    const jids = Array.from({ length: 60 }, (_, i) => `57301${String(i).padStart(3, "0")}${P}@s.whatsapp.net`);
    let pedidos = 0;
    const prov = {
      nombre: "evolution",
      async listarChats() { return jids; },
      async traerMensajes() {
        pedidos++;
        // Como en produccion: a mitad del recorrido la pasan a Waha, la
        // instancia desaparece de Evolution y cada chat contesta 404.
        if (pedidos === 3) await db.instancia.updateMany({ where: { instanceName: MUDA }, data: { instanceType: "waha" } });
        return pedidos < 3 ? { mensajes: [], recortado: false } : null;
      },
    };
    const r = await rellenarLaLinea(linea, { proveedor: prov, pausaEntreChatsMs: 0, desdeCero: true });
    assert.equal(r.ok, false, "no se da por terminada una linea que el proveedor dejo de contestar");
    assert.match(r.motivo, /evolution a waha/, "dice que cambio de proveedor");
    const e = await estadoDelRelleno(MUDA);
    assert.equal(e.estado, "fallido");
    assert.equal(e.chatsHechos, 2 + TOPE_DE_FALLOS_SEGUIDOS, "se para en cuanto llega al tope, no quema los 60");
  });
}
