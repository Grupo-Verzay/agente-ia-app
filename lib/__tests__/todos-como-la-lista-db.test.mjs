/**
 * El numero de «Todos» sale de LO MISMO que la lista.
 *
 * Lo reportado, en produccion: Rca marcaba 32 y al seleccionar todas salian 16;
 * Zoo Shop 26 y 24; un cliente con 14 conversaciones veia 34; en el menu de
 * canales «Todos» decia 58 y Multigama salia sin numero. Y la pista: fallaba en
 * la cuenta que acababa de importar historial.
 *
 * La causa era de fondo: el numero salia de un `COUNT` sobre `Session` —los
 * LEADS de la linea— y la lista enseña CONVERSACIONES pasadas por los filtros
 * del navegador. Todo lo que un historial importado deja a medias cae en esa
 * grieta: fichas sin conversacion que enseñar, conversaciones sin ficha, la
 * marca de archivado guardada bajo el `@lid` mientras la ficha va por el
 * numero, el mismo contacto con el sufijo de dispositivo, la ficha guardada con
 * el id de la linea y no con su nombre (Multigama)… Y la lista, encima, no
 * pasaba de la primera pagina: el cursor viajaba en segundos y la accion lo
 * leia en milisegundos.
 *
 * Aqui se siembran varias lineas con todo eso dentro, se arma la lista DE
 * VERDAD —la consulta de produccion, pagina a pagina hasta el final, y la regla
 * de la barra lateral— y se exige que el numero coincida con su total, linea a
 * linea, en la primera pagina y con la lista entera.
 *
 * # Los dos modos
 *
 * `MODO=roto` corre el `COUNT` de antes y el cursor de antes (en segundos y
 * dando por acabada una pagina corta), escritos aqui literales, y AFIRMA el
 * fallo. Sin ese modo no se sabria si lo verde es que se arreglo la causa.
 *
 * Como se levanta: `scripts/banco-total-de-todos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  getPersistedInboxChats,
  invalidatePersistedInboxCache,
  leerParaElConteo,
  contarTodosDeLaBandeja,
  contarLaLista,
  dedupeAndSortChats,
  laSesionDelChat,
  lasFilasDeLaLista,
  emparejarSesiones,
  identidadesEnVariasLineas,
  chatPreferenceKey,
  marcarSesionResuelta,
  reabrirSesion,
  obtenerResueltasDeCuentas,
  totalesDeTodos,
  estaResuelta,
  conLaResolucion,
  TOPE_DE_LA_BANDEJA,
  epochToMs,
  db,
} from "./.compilado/todos/entrada-de-todos.js";

const ROTO = process.env.MODO === "roto";
const V = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
// Un prefijo de numero distinto en cada vuelta: la base se reutiliza.
const PREFIJO = String(100 + Math.floor(Math.random() * 800));

const CUENTA = `${V}-cuenta`;
const AGENTE = `${V}-agente`;
const OTRO = `${V}-otro`;
const RCA = `${V}_RCA`;
const ZOO = `${V}_ZOO`;
const MULTI = `${V}_MULTIGAMA`;
const MULTI_ID = `${V}-uuid-multigama`;
const LINEAS = [RCA, ZOO, MULTI];

let n = 0;
const numero = () => `57${PREFIJO}${String(++n).padStart(7, "0")}@s.whatsapp.net`;
const lidDe = (jid) => `9${jid.replace(/\D/g, "")}@lid`;
const hace = (min) => new Date(Date.now() - min * 60_000);

// ── La semilla ──────────────────────────────────────────────────────────────

async function conversacion({ linea, jid, alt = null, min, fromMe = false, tipo = "conversation", userId = CUENTA }) {
  await db.chatConversation.create({
    data: {
      userId,
      instanceName: linea,
      remoteJid: jid,
      remoteJidAlt: alt,
      pushName: "Cliente",
      lastMessageId: `${V}-${jid}-${linea}`,
      lastMessageFromMe: fromMe,
      lastMessageType: tipo,
      lastMessageContent: "hola",
      lastMessageTimestamp: hace(min),
    },
  });
}

async function ficha({ linea, jid, alt = null, asesor = null, instanceId = linea }) {
  return db.session.create({
    data: {
      userId: CUENTA,
      remoteJid: jid,
      remoteJidAlt: alt,
      pushName: "Cliente",
      instanceId,
      status: true,
      assignedAdvisorId: asesor,
    },
  });
}

async function marca({ linea, jid, archivada = false, borradaHace = null }) {
  await db.chatConversationPreference.create({
    data: {
      userId: CUENTA,
      instanceName: linea,
      remoteJid: jid,
      archivedAt: archivada ? hace(30) : null,
      deletedAt: borradaHace != null ? hace(borradaHace) : null,
    },
  });
}

const sembradas = { resolver: [], multiLinea: [] };

async function sembrar() {
  for (const id of [CUENTA, AGENTE, OTRO]) {
    await db.user.create({ data: { id, email: `${id}@banco.test`, name: id, role: "user" } });
  }
  await db.instancia.create({
    data: { instanceName: MULTI, instanceId: MULTI_ID, userId: CUENTA, instanceType: "Whatsapp" },
  });

  // ── Rca: lo normal, repartido entre asesores ──
  for (let i = 0; i < 16; i++) {
    const jid = numero();
    await conversacion({ linea: RCA, jid, min: 10 + i });
    const s = await ficha({ linea: RCA, jid, asesor: i < 5 ? AGENTE : i < 10 ? OTRO : null });
    if (i < 3) sembradas.multiLinea.push(jid);
    if (i === 15) sembradas.resolver.push(s.id);
  }
  // Tres resueltas: no salen en «Todos» ni cuentan.
  for (let i = 0; i < 3; i++) {
    const jid = numero();
    await conversacion({ linea: RCA, jid, min: 200 + i });
    const s = await ficha({ linea: RCA, jid });
    await marcarSesionResuelta(s.id);
  }
  // Dos archivadas por su numero.
  for (let i = 0; i < 2; i++) {
    const jid = numero();
    await conversacion({ linea: RCA, jid, min: 300 + i });
    await ficha({ linea: RCA, jid });
    await marca({ linea: RCA, jid, archivada: true });
  }

  // ── Rca: lo que deja un historial IMPORTADO ──
  // La conversacion guardada por el @lid, la ficha por el numero, y el
  // archivado puesto desde la lista, o sea bajo el @lid: el COUNT viejo miraba
  // la ficha y no la encontraba archivada.
  for (let i = 0; i < 4; i++) {
    const num = numero();
    const lid = lidDe(num);
    await conversacion({ linea: RCA, jid: lid, alt: num, min: 400 + i });
    await ficha({ linea: RCA, jid: num });
    await marca({ linea: RCA, jid: lid, archivada: true });
  }
  // Fichas cuya conversacion es solo una reaccion: la lista no la enseña.
  for (let i = 0; i < 3; i++) {
    const jid = numero();
    await conversacion({ linea: RCA, jid, min: 500 + i, tipo: "reactionMessage" });
    await ficha({ linea: RCA, jid });
  }
  // El mismo contacto con el sufijo de dispositivo: dos fichas, un contacto.
  for (let i = 0; i < 2; i++) {
    const jid = numero();
    await ficha({ linea: RCA, jid });
    await ficha({ linea: RCA, jid: jid.replace("@", ":39@") });
  }
  // Conversaciones importadas cuyo ultimo mensaje es del asesor: sin ficha.
  for (let i = 0; i < 2; i++) {
    await conversacion({ linea: RCA, jid: numero(), min: 600 + i, fromMe: true });
  }
  // Borradas que el contacto volvio a escribir: SI salen.
  for (let i = 0; i < 2; i++) {
    const jid = numero();
    await conversacion({ linea: RCA, jid, min: 5 + i });
    await ficha({ linea: RCA, jid });
    await marca({ linea: RCA, jid, borradaHace: 60 });
  }

  // ── Zoo Shop: mas de una pagina, y tres contactos que tambien estan en Rca ──
  for (let i = 0; i < TOPE_DE_LA_BANDEJA + 40; i++) {
    const jid = numero();
    await conversacion({ linea: ZOO, jid, min: 20 + i * 2 });
    await ficha({ linea: ZOO, jid });
  }
  for (const jid of sembradas.multiLinea) {
    await conversacion({ linea: ZOO, jid, min: 15 });
    await ficha({ linea: ZOO, jid });
  }

  // ── Multigama: fichas guardadas con el ID de la linea, no con su nombre ──
  for (let i = 0; i < 5; i++) {
    const jid = numero();
    await conversacion({ linea: MULTI, jid, min: 50 + i });
    await ficha({ linea: MULTI, jid, instanceId: MULTI_ID });
  }
  for (let i = 0; i < 3; i++) {
    await ficha({ linea: MULTI, jid: numero(), instanceId: MULTI_ID });
  }
}

// ── La lista DE VERDAD, como la arma el navegador ──────────────────────────

async function lasPreferencias() {
  const filas = await db.chatConversationPreference.findMany({ where: { userId: CUENTA } });
  const mapa = {};
  for (const p of filas) {
    mapa[chatPreferenceKey(p.userId, p.instanceName ?? "", p.remoteJid)] = {
      instanceName: p.instanceName ?? "",
      remoteJid: p.remoteJid,
      pinnedAt: p.pinnedAt?.toISOString() ?? null,
      archivedAt: p.archivedAt?.toISOString() ?? null,
      deletedAt: p.deletedAt?.toISOString() ?? null,
      purgedAt: p.purgedAt?.toISOString() ?? null,
      updatedAt: p.updatedAt?.toISOString() ?? null,
      isPinned: Boolean(p.pinnedAt),
      isArchived: Boolean(p.archivedAt),
    };
  }
  return mapa;
}

async function lasSesiones() {
  const filas = await db.session.findMany({ where: { userId: CUENTA } });
  const resueltas = await obtenerResueltasDeCuentas([CUENTA]);
  return filas.map((s) => ({
    id: s.id,
    userId: s.userId,
    remoteJid: s.remoteJid,
    remoteJidAlt: s.remoteJidAlt,
    customName: s.customName ?? null,
    pushName: s.pushName,
    tags: [],
    assignedAdvisorId: s.assignedAdvisorId ?? null,
    resolvedAt: resueltas.get(s.id) ?? null,
    instanceId: s.instanceId ?? null,
    updatedAt: s.updatedAt.getTime(),
  }));
}

const DUENOS = Object.fromEntries(LINEAS.map((l) => [l, CUENTA]));

async function contexto(agente) {
  return {
    preferencias: await lasPreferencias(),
    duenoDeLaLinea: DUENOS,
    cuentaPorDefecto: CUENTA,
    agente: agente ? { advisorId: agente, puedeTomarSinAsignar: true } : null,
  };
}

/**
 * Las filas de la barra lateral con lo que la pantalla tiene cargado.
 *
 * Lo que ve un agente se recorta AQUI, como lo recorta `chats-client`
 * (`contacts`), y no con el `agente` de `lasFilasDeLaLista`: asi el conteo del
 * servidor —que si usa ese parametro— se compara contra la lista de verdad y
 * no contra si mismo.
 */
async function filasDe(chats, ctx) {
  const mapa = emparejarSesiones(chats, await lasSesiones());
  const visibles = ctx.agente
    ? chats.filter((chat) => {
        const asignado = laSesionDelChat(chat, mapa)?.assignedAdvisorId;
        return asignado === ctx.agente.advisorId || !asignado;
      })
    : chats;
  return lasFilasDeLaLista(visibles, {
    preferencias: ctx.preferencias,
    duenoDelChat: (chat) => ctx.duenoDeLaLinea[chat.instanceName] ?? CUENTA,
    sesionDelChat: (chat) => laSesionDelChat(chat, mapa),
    repartidasEntreLineas: identidadesEnVariasLineas(chats),
    agente: null,
  });
}

/**
 * La primera pagina y, bajando, las siguientes de cada linea hasta el final,
 * con el cursor que manda la pantalla.
 */
async function laLista({ cursorViejo = false } = {}) {
  invalidatePersistedInboxCache();
  const primera = dedupeAndSortChats(
    await getPersistedInboxChats({ userIds: [CUENTA], instanceNames: LINEAS }),
  );
  let chats = primera;
  const sinMas = {};
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const pendientes = LINEAS.filter((l) => !sinMas[l]);
    if (!pendientes.length) break;
    for (const linea of pendientes) {
      const suyos = chats.filter((c) => c.instanceName === linea);
      if (!suyos.length) { sinMas[linea] = true; continue; }
      const orden = (c) => c.lastMessage?.messageTimestamp ?? Math.floor(new Date(c.updatedAt).getTime() / 1000);
      const masAntiguo = Math.min(...suyos.map((c) => (cursorViejo ? orden(c) : epochToMs(orden(c)))));
      invalidatePersistedInboxCache();
      const pagina = await getPersistedInboxChats({
        userIds: [CUENTA],
        instanceNames: [linea],
        antesDe: new Date(masAntiguo),
      });
      if (cursorViejo ? pagina.length < TOPE_DE_LA_BANDEJA : pagina.length === 0) sinMas[linea] = true;
      chats = dedupeAndSortChats([...pagina, ...chats]);
    }
  }
  return { primera, entera: chats };
}

// ── Lo de ANTES, escrito aqui ───────────────────────────────────────────────

async function contarComoAntes() {
  const filas = await db.$queryRawUnsafe(
    `WITH marcas AS (
        SELECT DISTINCT "userId", "remoteJid" FROM "ChatConversationPreference"
        WHERE "userId" = ANY($1::text[]) AND ("deletedAt" IS NOT NULL OR "archivedAt" IS NOT NULL)
      )
      SELECT linea, COUNT(DISTINCT jid)::bigint AS total FROM (
        SELECT s."instanceId" AS linea, s."remoteJid" AS jid
        FROM "Session" s
        LEFT JOIN marcas m  ON m."userId"  = s."userId" AND m."remoteJid"  = s."remoteJid"
        LEFT JOIN marcas ma ON ma."userId" = s."userId" AND ma."remoteJid" = s."remoteJidAlt"
        WHERE s."userId" = ANY($1::text[]) AND s."remoteJid" NOT LIKE '%@lid'
          AND s."instanceId" = ANY($2::text[])
          AND m."remoteJid" IS NULL AND ma."remoteJid" IS NULL
          AND (s.resolved_at IS NULL OR EXISTS (
            SELECT 1 FROM "chat_conversations" cc
            WHERE cc."userId" = s."userId" AND cc."instanceName" = s."instanceId"
              AND cc."remoteJid" IN (s."remoteJid", s."remoteJidAlt")
              AND cc."lastMessageTimestamp" > s.resolved_at))
      ) AS todo GROUP BY linea`,
    [CUENTA],
    LINEAS,
  );
  const out = {};
  for (const f of filas) out[f.linea] = Number(f.total);
  return out;
}

// ── Las pruebas ─────────────────────────────────────────────────────────────

test.before(async () => {
  await sembrar();
});

test.after(async () => {
  await db.$disconnect();
});

test("la lista pasa de la primera pagina y llega a la ultima fila de cada linea", async () => {
  const bien = await laLista();
  const ctx = await contexto(null);
  const total = contarLaLista(await filasDe(bien.entera, ctx)).todos;
  // Zoo Shop tiene mas filas que una pagina entera de la bandeja.
  assert.ok(total[ZOO] > TOPE_DE_LA_BANDEJA, `Zoo tiene ${total[ZOO]}`);
  const primera = contarLaLista(await filasDe(bien.primera, ctx)).todos;
  assert.ok(primera[ZOO] < total[ZOO], "la primera pagina no la trae entera");

  if (ROTO) {
    const viejo = await laLista({ cursorViejo: true });
    const alcanzado = contarLaLista(await filasDe(viejo.entera, ctx)).todos;
    assert.equal(alcanzado[ZOO], primera[ZOO], "con el cursor en segundos no pasa de la primera pagina");
  }
});

for (const [quien, agente] of [["la cuenta", null], ["un agente", AGENTE]]) {
  test(`el numero coincide con el total real de la lista, linea a linea (${quien})`, async (t) => {
    const ctx = await contexto(agente);
    const { primera, entera } = await laLista();
    const filasEnteras = await filasDe(entera, ctx);
    const total = contarLaLista(filasEnteras).todos;
    // «Seleccionar todas» marca las filas que la lista TIENE bajo «Todos».
    const seleccionables = (filas) => {
      const out = {};
      for (const f of filas) if (f.activa) out[f.linea] = (out[f.linea] ?? 0) + 1;
      return out;
    };
    assert.deepEqual(seleccionables(filasEnteras), total);

    const filasPrimera = await filasDe(primera, ctx);
    const numero = (filas, servidor) =>
      totalesDeTodos(contarLaLista(filas), filas, servidor, new Map(), true);

    if (ROTO) {
      // Antes: max(COUNT de leads, lo cargado). Ni con la lista entera cuadra.
      const viejo = await contarComoAntes();
      const cargadoEntero = contarLaLista(filasEnteras).todos;
      const mostrado = {};
      for (const l of LINEAS) {
        mostrado[l] = viejo[l] === undefined ? cargadoEntero[l] : Math.max(viejo[l], cargadoEntero[l] ?? 0);
      }
      t.diagnostic(`antes (${quien}): numero ${JSON.stringify(mostrado)} contra lista ${JSON.stringify(total)}`);
      if (!agente) {
        assert.notEqual(mostrado[RCA], total[RCA], `Rca: el numero viejo (${mostrado[RCA]}) no es la lista (${total[RCA]})`);
        assert.equal(viejo[MULTI], undefined, "Multigama no salia en el COUNT viejo: sin numero");
      } else {
        assert.ok(viejo[RCA] > total[RCA], `al agente le salia ${viejo[RCA]} con ${total[RCA]} en su lista`);
      }
      return;
    }

    const servidor = contarTodosDeLaBandeja(
      await leerParaElConteo({ userIds: [CUENTA], instanceNames: LINEAS }),
      ctx,
    );
    assert.ok(servidor, "el servidor cuenta");
    for (const l of LINEAS) {
      assert.equal(servidor.todos[l] ?? 0, total[l] ?? 0, `servidor, ${l}`);
      assert.equal(numero(filasPrimera, servidor)[l] ?? 0, total[l] ?? 0, `con la primera pagina, ${l}`);
      assert.equal(numero(filasEnteras, servidor)[l] ?? 0, total[l] ?? 0, `con la lista entera, ${l}`);
    }
    // La suma del menu de canales es la de sus lineas: Multigama cuenta.
    assert.ok((total[MULTI] ?? 0) > 0, "Multigama tiene numero");
    const suma = Object.values(numero(filasPrimera, servidor)).reduce((a, b) => a + b, 0);
    assert.equal(suma, LINEAS.reduce((a, l) => a + (total[l] ?? 0), 0));
  });
}

test("resolver baja el numero al momento y reabrir lo sube, con la linea a medias", { skip: ROTO ? "solo el modo bueno" : false }, async () => {
  const ctx = await contexto(null);
  const servidor = contarTodosDeLaBandeja(
    await leerParaElConteo({ userIds: [CUENTA], instanceNames: LINEAS }),
    ctx,
  );
  const { primera } = await laLista();
  const base = new Map();
  const numero = async () => {
    const filas = await filasDe(primera, ctx);
    return totalesDeTodos(contarLaLista(filas), filas, servidor, base, true);
  };
  const antes = await numero();
  const id = sembradas.resolver[0];
  await marcarSesionResuelta(id);
  assert.equal((await numero())[RCA], antes[RCA] - 1);
  await reabrirSesion(id);
  assert.equal((await numero())[RCA], antes[RCA]);
});

test("sin las sesiones todavia, manda el servidor; con ellas y la linea entera, lo cargado", () => {
  const servidor = { filas: { L: 3 }, todos: { L: 2 } };
  // Primer pintado: todavia no se sabe que `c` esta resuelta.
  const sinSesiones = [
    { clave: "L::a", linea: "L", activa: true },
    { clave: "L::b", linea: "L", activa: true },
    { clave: "L::c", linea: "L", activa: true },
  ];
  const cargado = { filas: { L: 3 }, todos: { L: 3 } };
  assert.equal(totalesDeTodos(cargado, sinSesiones, servidor, new Map(), false).L, 2);
  // Llegan: la linea esta entera, manda lo cargado.
  const con = sinSesiones.map((f) => ({ ...f, activa: f.clave !== "L::c" }));
  assert.equal(totalesDeTodos({ filas: { L: 3 }, todos: { L: 2 } }, con, servidor, new Map(), true).L, 2);
});

test("con la linea ENTERA manda lo que la lista enseña, diga lo que diga el servidor", () => {
  // Un chat que llego en vivo despues de contar, o uno que el servidor ve de
  // otra forma: la lista tiene 4 filas y enseña 4; el servidor contaba 5.
  const servidor = { filas: { L: 4 }, todos: { L: 5 } };
  const filas = ["a", "b", "c", "d"].map((x) => ({ clave: `L::${x}`, linea: "L", activa: true }));
  assert.equal(totalesDeTodos({ filas: { L: 4 }, todos: { L: 4 } }, filas, servidor, new Map(), true).L, 4);
  // A medias (la lista tiene 2 de 4 filas), el servidor: la lista todavia no lo sabe.
  assert.equal(
    totalesDeTodos({ filas: { L: 2 }, todos: { L: 2 } }, filas.slice(0, 2), servidor, new Map(), true).L,
    5,
  );
});

test("la pantalla pinta resolver y reabrir en TODAS las llaves", () => {
  const ahora = Date.now();
  const mapa = {};
  for (let i = 1; i <= 2; i++) {
    const s = { id: 900 + i, resolvedAt: null };
    mapa[`57300000${i}@s.whatsapp.net`] = s;
    mapa[`L::57300000${i}@s.whatsapp.net`] = s;
  }
  const resuelta = conLaResolucion(mapa, [902], ahora);
  assert.equal(resuelta.tocadas, 2);
  assert.ok(estaResuelta(ahora - 1, resuelta.siguiente["L::573000002@s.whatsapp.net"].resolvedAt));
  const reabierta = conLaResolucion(resuelta.siguiente, [902], null);
  assert.equal(reabierta.siguiente["L::573000002@s.whatsapp.net"].resolvedAt, null);
  assert.equal(conLaResolucion(mapa, [123456], ahora).tocadas, 0);
});
