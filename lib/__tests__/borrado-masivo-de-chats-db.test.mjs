/**
 * Borrar en bloque no da un error de API, y no tiene tope. Contra Postgres, con
 * el esquema real y las funciones de produccion.
 *
 * # El fallo
 *
 * «Al intentar eliminar en bloque sale un error de API, y ademas hay un tope que
 * no deja borrar mas alla de cierta cantidad.» Son dos cosas y ninguna era un
 * numero escrito en el codigo:
 *
 *  1. `bulkDeleteChatsAction` hacia `Promise.all` sobre `hardDeleteLocalChat`:
 *     UNA TRANSACCION INTERACTIVA POR CHAT, todas a la vez, contra un pool de
 *     diez conexiones cuyo `maxWait` son dos segundos. Pasado ese plazo Prisma se
 *     rinde con «Transaction API error: Unable to start a transaction in the
 *     given time.», que es literalmente el error que se veia. Y `Promise.all` se
 *     rinde con el PRIMER rechazo, asi que la pantalla recibia «no se pudieron
 *     eliminar» y no quitaba ni una fila **habiendo borrado varios cientos**.
 *     El umbral depende de lo rapida que sea la base: aqui, con Postgres local,
 *     hacen falta unas mil; en produccion, con la base compartida, son unas
 *     pocas decenas. De ahi la sensacion de tope.
 *  2. «Eliminar por fecha» y «seleccionar todas» contaban sobre las filas
 *     CARGADAS, y la bandeja carga acotada. Lo que no se habia cargado no existia
 *     para el dialogo, asi que no habia forma de pedir «borralas todas».
 *
 * # El arreglo
 *
 *  - **Fase 1**: la marca, en bloque (`marcarEnBloque`, un `INSERT ... ON
 *    CONFLICT` con `unnest`). Es lo que saca la conversacion de la bandeja.
 *  - **Fase 2**: el historial, de fondo y en serie, con el barrido diario detras.
 *    La cola es la propia marca: `deletedAt` puesto y `purgedAt` en nulo.
 *  - **El universo sale del SERVIDOR**, de la misma consulta que la lista y sin
 *    el tope de la pagina.
 *
 * # Los casos
 *
 *  1. Mil conversaciones en bloque: sale bien, se van de la lista y se purga el
 *     historial. En `MODO=roto`, el «error de API» y la pantalla mintiendo.
 *  2. La fase 1 marca y NO purga; la fase 2 purga. La cola es la marca.
 *  3. El barrido retoma lo que se quedo a medias.
 *  4. El universo del borrado ve mas alla de una pagina de bandeja, respeta las
 *     ancladas y las ya borradas, y un rango imposible NO es «todas».
 *  5. Limpiar TODA la base deja la bandeja vacia, a trozos y diciendo cuantas
 *     quedan.
 *  6. Archivar y anclar en bloque escriben bajo TODAS las identidades.
 *  7. Las reglas puras: el rango, el cruce de identidades y el texto.
 *
 * Se levanta con `scripts/banco-borrado-masivo.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ponerAQuienMira,
  bulkDeleteChatsAction,
  bulkArchiveChatsAction,
  bulkPinChatsAction,
  contarConversacionesParaBorrarAction,
  borrarConversacionesDeLaBandejaAction,
  marcarChatsComoBorrados,
  runPurgaDeChats,
  purgarEstosChats,
  loQueFaltaPorPurgar,
  cuantoFaltaPorPurgar,
  elUniversoDelBorrado,
  agruparIdentidades,
  entraEnElBorrado,
  limitesDelBorrado,
  esTodaLaBase,
  comoTextoDelBorrado,
  TOPE_POR_VUELTA,
  getPersistedInboxChats,
  invalidatePersistedInboxCache,
  db,
} from "./.compilado/masivo/entrada.js";

const ROTO = process.env.MODO === "roto";
const VUELTA = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Cuantas conversaciones hacen falta para cruzar el `maxWait` del pool local. */
const MUCHAS = Number(process.env.MUCHAS ?? 1000);

const JUNIO = new Date("2026-06-15T12:00:00.000Z");
const AGOSTO = new Date("2026-08-20T12:00:00.000Z");

async function cuenta(sufijo) {
  const id = `masivo-${sufijo}-${VUELTA}`;
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
 * Un contacto con su conversacion, su ficha y sus mensajes.
 *
 * Con mensajes a proposito: son las filas que la fase 2 tiene que llevarse, y es
 * lo que hace cara la transaccion que reventaba.
 */
async function contacto(userId, nombreLinea, { num, lid, ts = JUNIO, mensajes = 2 }) {
  await db.chatConversation.create({
    data: {
      userId,
      instanceName: nombreLinea,
      remoteJid: num,
      remoteJidAlt: lid,
      pushName: "Contacto",
      lastMessageFromMe: false,
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
      pushName: "Contacto",
      instanceId: nombreLinea,
      status: true,
    },
  });
  for (let m = 0; m < mensajes; m++) {
    await db.chatMessage.create({
      data: {
        userId,
        instanceName: nombreLinea,
        remoteJid: num,
        remoteJidAlt: lid,
        messageId: `m-${num}-${m}-${VUELTA}`,
        fromMe: false,
        messageType: "conversation",
        content: "hola",
        messageTimestamp: ts,
        raw: {},
      },
    });
  }
}

/** Siembra `cuantos` contactos en una linea, y devuelve sus numeros. */
async function sembrar(userId, nombreLinea, cuantos, { ts = JUNIO, base = 1 } = {}) {
  const jids = [];
  for (let i = 0; i < cuantos; i++) {
    const n = base + i;
    const num = `57300${String(n).padStart(7, "0")}@s.whatsapp.net`;
    const lid = `2101016${String(n).padStart(8, "0")}@lid`;
    jids.push(num);
    await contacto(userId, nombreLinea, { num, lid, ts, mensajes: 1 });
  }
  return jids;
}

async function listaDeLaLinea(userId, nombreLinea) {
  invalidatePersistedInboxCache();
  return getPersistedInboxChats({ userIds: [userId], instanceNames: [nombreLinea] });
}

function actuarComo(userId) {
  ponerAQuienMira({ id: userId, role: "user", ownerId: null, advisorRole: null });
}

// ─────────────────────────────────────────────────────────────────────────────

test("las reglas puras: el rango, el cruce de identidades y el texto", () => {
  // Un rango imposible NO es «todas»: sin esta distincion, un «hasta» mal
  // escrito borraria la cuenta entera.
  assert.equal(limitesDelBorrado("2026-08-01", "2026-06-01"), null);
  assert.equal(limitesDelBorrado("no-es-fecha", ""), null);

  const todas = limitesDelBorrado("", "");
  assert.ok(todas, "las dos vacias son un rango valido");
  assert.equal(esTodaLaBase(todas), true);

  // Sin rango entra aunque no tenga fecha: quien pide todas las pide todas.
  assert.equal(entraEnElBorrado({ segundos: 0 }, undefined, todas), true);
  // Con rango, sin fecha no se puede afirmar que sea vieja.
  const soloJunio = limitesDelBorrado("2026-06-01", "2026-06-30");
  assert.equal(entraEnElBorrado({ segundos: 0 }, undefined, soloJunio), false);
  const enJunio = Math.floor(JUNIO.getTime() / 1000);
  const enAgosto = Math.floor(AGOSTO.getTime() / 1000);
  assert.equal(entraEnElBorrado({ segundos: enJunio }, undefined, soloJunio), true);
  assert.equal(entraEnElBorrado({ segundos: enAgosto }, undefined, soloJunio), false);
  // El «hasta» incluye el dia entero.
  const hastaElQuince = limitesDelBorrado("", "2026-06-15");
  assert.equal(entraEnElBorrado({ segundos: enJunio }, undefined, hastaElQuince), true);

  // Anclada no, ya borrada no.
  assert.equal(entraEnElBorrado({ segundos: enJunio }, { isPinned: true }, todas), false);
  assert.equal(entraEnElBorrado({ segundos: enJunio }, { isDeleted: true }, todas), false);

  // Las identidades se cruzan por FILA, nunca fabricando un puente.
  const grupos = agruparIdentidades([
    { remoteJid: "573001@s.whatsapp.net", remoteJidAlt: "2101@lid", senderPn: null },
    { remoteJid: "573002@s.whatsapp.net", remoteJidAlt: null, senderPn: null },
  ]);
  assert.ok(grupos.get("573001@s.whatsapp.net").includes("2101@lid"));
  assert.ok(!(grupos.get("573002@s.whatsapp.net") ?? []).includes("2101@lid"));

  // El `senderPn` de un GRUPO es quien escribio, no el contacto: no une nada.
  const conGrupo = agruparIdentidades([
    { remoteJid: "12345@g.us", remoteJidAlt: null, senderPn: "573009@s.whatsapp.net" },
  ]);
  assert.ok(!(conGrupo.get("12345@g.us") ?? []).includes("573009@s.whatsapp.net"));

  // El texto lleva los numeros delante y dice si quedan.
  const texto = comoTextoDelBorrado({ marcadas: 2000, sinLinea: 0, quedan: 400 });
  assert.match(texto, /2000/);
  assert.match(texto, /segundo plano/);
  assert.match(texto, /Quedan 400/);
  assert.match(comoTextoDelBorrado({ marcadas: 0, sinLinea: 0, quedan: 0 }), /No se elimino/);
});

test(`en bloque con ${MUCHAS} conversaciones: ni error de API, ni pantalla mintiendo`, async () => {
  const dueno = await cuenta("muchas");
  const LINEA = await linea(dueno, "waha", "MUCHAS");
  const jids = await sembrar(dueno, LINEA, MUCHAS);

  actuarComo(dueno);
  // Una PAGINA de bandeja, no las mil: la lista carga acotada
  // (`TOPE_DE_LA_BANDEJA`, 300) y las siguientes llegan al bajar. Ese es el tope
  // que se sentia como «no deja borrar mas alla de cierta cantidad», y es justo
  // por lo que «todas» tiene que resolverse en el servidor.
  const antes = await listaDeLaLinea(dueno, LINEA);
  assert.equal(antes.length, 300, "la bandeja carga acotada: una pagina");

  const t0 = Date.now();
  let res;
  try {
    res = await bulkDeleteChatsAction({
      userId: dueno,
      instanceName: LINEA,
      remoteJids: jids,
      identidadesPorJid: Object.fromEntries(jids.map((j) => [j, [j]])),
    });
  } catch (error) {
    res = { success: false, message: `EXCEPCION: ${error?.message ?? error}` };
  }
  const tardo = Date.now() - t0;
  const quedanConversaciones = await db.chatConversation.count({
    where: { userId: dueno, instanceName: LINEA },
  });

  if (ROTO) {
    // El fallo, afirmado: la accion se rinde con el error de la API de
    // transacciones... y la base ya no esta como estaba. Eso es lo que hacia que
    // la pantalla siguiera enseñando chats que ya no existen.
    assert.equal(res.success, false, `con el codigo de antes tenia que fallar (tardo ${tardo}ms)`);
    assert.match(res.message, /Transaction API error|Unable to start a transaction|Timed out/i);
    assert.ok(
      quedanConversaciones < MUCHAS,
      `y dejaba borradas unas cuantas de todas formas (quedaban ${quedanConversaciones} de ${MUCHAS})`,
    );
    return;
  }

  assert.equal(res.success, true, `no tenia que fallar: ${res.message}`);
  assert.equal(res.data?.length, MUCHAS, "se devuelve una marca por conversacion");
  // La fase 1 es lo que la pantalla espera, y tiene que ser rapida.
  assert.ok(tardo < 60_000, `la fase 1 tardo ${tardo}ms`);

  // Ya no salen en la bandeja: es lo unico que la persona ve.
  const despues = await listaDeLaLinea(dueno, LINEA);
  assert.equal(despues.length, 0, "ninguna vuelve a la lista");

  // Y la fase 2 se lleva el historial. Se fuerza aqui en vez de esperar al obrero
  // de fondo, que es lo que el barrido hace por su cuenta.
  await purgarEstosChats(
    jids.map((j) => ({ userId: dueno, instanceName: LINEA, remoteJid: j })),
  );
  assert.equal(
    await db.chatConversation.count({ where: { userId: dueno, instanceName: LINEA } }),
    0,
    "el historial se va en la fase 2",
  );
  assert.equal(
    await db.chatMessage.count({ where: { userId: dueno, instanceName: LINEA } }),
    0,
    "y los mensajes tambien",
  );
});

test("la fase 1 marca y no purga; la fase 2 purga; y la cola es la marca", async (t) => {
  if (ROTO) return t.skip("la fase 1 no existia en el «antes»");
  const dueno = await cuenta("fases");
  const LINEA = await linea(dueno, "Whatsapp", "FASES");
  const jids = await sembrar(dueno, LINEA, 3);

  actuarComo(dueno);
  const { marcas } = await marcarChatsComoBorrados(
    dueno,
    LINEA,
    jids,
    Object.fromEntries(jids.map((j) => [j, [j]])),
  );
  assert.equal(marcas.length, 3);
  // Marcada y pendiente: eso ES la cola.
  assert.ok(marcas.every((m) => m.isDeleted), "quedan marcadas como eliminadas");
  assert.ok(marcas.every((m) => !m.isPurged), "y pendientes de purgar");

  // El historial sigue ahi: la fase 1 no lo toca.
  assert.equal(
    await db.chatConversation.count({ where: { userId: dueno, instanceName: LINEA } }),
    3,
    "la fase 1 no borra historial",
  );
  // Pero ya no salen en la bandeja.
  assert.equal((await listaDeLaLinea(dueno, LINEA)).length, 0);

  const pendientesAntes = await cuantoFaltaPorPurgar();
  assert.ok(pendientesAntes >= 3, `la cola tiene que tener las tres (tenia ${pendientesAntes})`);

  const cola = await loQueFaltaPorPurgar(50);
  assert.ok(cola.length > 0, "la cola sale de la propia marca");
  assert.ok(
    cola.every((f) => f.instanceName !== ""),
    "la marca antigua sin linea no entra en la cola: sin linea no se borra nada",
  );

  const resumen = await purgarEstosChats(cola);
  assert.ok(resumen.purgadas > 0, "la fase 2 purga");
  assert.equal(
    await db.chatConversation.count({ where: { userId: dueno, instanceName: LINEA } }),
    0,
    "y se lleva el historial",
  );
});

test("el barrido retoma lo que se quedo a medias", async (t) => {
  if (ROTO) return t.skip("el barrido no existia en el «antes»");
  const dueno = await cuenta("barrido");
  const LINEA = await linea(dueno, "Whatsapp", "BARRIDO");
  const jids = await sembrar(dueno, LINEA, 4);

  actuarComo(dueno);
  // Fase 1 y NADA mas: es exactamente lo que deja un despliegue que se lleva la
  // promesa de fondo a medias.
  await marcarChatsComoBorrados(dueno, LINEA, jids, {});
  assert.equal(
    await db.chatConversation.count({ where: { userId: dueno, instanceName: LINEA } }),
    4,
    "el historial se quedo dentro",
  );

  const res = await runPurgaDeChats({ limite: 50 });
  assert.ok(res.purgadas > 0, "el barrido la retoma");
  assert.equal(
    await db.chatConversation.count({ where: { userId: dueno, instanceName: LINEA } }),
    0,
    "y termina el trabajo",
  );
});

test("el universo sale del servidor: mas alla de una pagina, sin las ancladas ni las ya borradas", async (t) => {
  if (ROTO) return t.skip("contar el universo no existia en el «antes»");
  const dueno = await cuenta("universo");
  const LINEA = await linea(dueno, "waha", "UNIVERSO");

  // Mas de una pagina de bandeja: es el tope que hacia que «todas» no fuera
  // todas. Se siembran en dos fechas para poder probar el rango.
  const deJunio = await sembrar(dueno, LINEA, 320, { ts: JUNIO, base: 1 });
  const deAgosto = await sembrar(dueno, LINEA, 40, { ts: AGOSTO, base: 1000 });
  assert.ok(deJunio.length + deAgosto.length > 300, "hay mas de una pagina");

  actuarComo(dueno);
  const puedeBorrarEn = async () => true;

  const todas = await elUniversoDelBorrado({ lineas: [LINEA], puedeBorrarEn });
  assert.equal(todas.total, 360, "el universo es la bandeja ENTERA, no la pagina cargada");

  const soloJunio = await elUniversoDelBorrado({
    lineas: [LINEA],
    desde: "2026-06-01",
    hasta: "2026-06-30",
    puedeBorrarEn,
  });
  assert.equal(soloJunio.total, 320, "el rango acota, y tambien sobre la base entera");

  // Una anclada no entra.
  await bulkPinChatsAction({
    userId: dueno,
    instanceName: LINEA,
    remoteJids: [deAgosto[0]],
    isPinned: true,
  });
  const conAnclada = await elUniversoDelBorrado({ lineas: [LINEA], puedeBorrarEn });
  assert.equal(conAnclada.total, 359, "la anclada se queda: anclar es «esta me importa»");

  // Una linea que no se alcanza no aporta nada y se dice.
  const ajena = await elUniversoDelBorrado({
    lineas: [LINEA, "LINEA_QUE_NO_EXISTE"],
    puedeBorrarEn,
  });
  assert.deepEqual(ajena.lineasFuera, ["LINEA_QUE_NO_EXISTE"]);

  // Un rango imposible no es «todas».
  const imposible = await elUniversoDelBorrado({
    lineas: [LINEA],
    desde: "2026-08-01",
    hasta: "2026-06-01",
    puedeBorrarEn,
  });
  assert.equal(imposible, null);
});

test("limpiar TODA la base: la bandeja queda vacia, a trozos y diciendo cuantas quedan", async (t) => {
  if (ROTO) return t.skip("limpiar por criterio no existia en el «antes»");
  const dueno = await cuenta("todala");
  const LINEA = await linea(dueno, "waha", "TODALA");
  const cuantas = TOPE_POR_VUELTA + 25;
  await sembrar(dueno, LINEA, cuantas);

  actuarComo(dueno);
  const cuenta1 = await contarConversacionesParaBorrarAction({ lineas: [LINEA] });
  assert.equal(cuenta1.success, true, cuenta1.message);
  assert.equal(cuenta1.data.total, cuantas, "el conteo es de la base entera");
  assert.equal(cuenta1.data.enEstaVuelta, TOPE_POR_VUELTA);
  assert.equal(cuenta1.data.quedan, 25, "y dice cuantas quedan para la vuelta siguiente");

  const primera = await borrarConversacionesDeLaBandejaAction({ lineas: [LINEA] });
  assert.equal(primera.success, true, primera.message);
  assert.equal(primera.data.borradas, TOPE_POR_VUELTA);
  assert.equal(primera.data.quedan, 25);
  assert.match(primera.message, /Quedan 25/);

  const segunda = await borrarConversacionesDeLaBandejaAction({ lineas: [LINEA] });
  assert.equal(segunda.data.borradas, 25);
  assert.equal(segunda.data.quedan, 0);

  assert.equal(
    (await listaDeLaLinea(dueno, LINEA)).length,
    0,
    "la bandeja queda vacia: eso es limpiar toda la base",
  );

  // Y una tercera vuelta no tiene nada que hacer.
  const tercera = await borrarConversacionesDeLaBandejaAction({ lineas: [LINEA] });
  assert.equal(tercera.data.borradas, 0);
});

test("archivar y anclar en bloque marcan bajo TODAS las identidades", async (t) => {
  if (ROTO) return t.skip("el «antes» de estas dos se prueba por el lado del borrado");
  const dueno = await cuenta("marcas");
  const LINEA = await linea(dueno, "Whatsapp", "MARCAS");
  const NUM = `573007770001@s.whatsapp.net`;
  const LID = `210101696770001@lid`;
  await contacto(dueno, LINEA, { num: NUM, lid: LID });

  actuarComo(dueno);
  const arch = await bulkArchiveChatsAction({
    userId: dueno,
    instanceName: LINEA,
    remoteJids: [NUM],
    archived: true,
  });
  assert.equal(arch.success, true, arch.message);

  const filas = await db.chatConversationPreference.findMany({
    where: { userId: dueno, instanceName: LINEA },
    select: { remoteJid: true, archivedAt: true, pinnedAt: true, deletedAt: true },
  });
  const porJid = Object.fromEntries(filas.map((f) => [f.remoteJid, f]));
  assert.ok(porJid[NUM]?.archivedAt, "la identidad pedida queda archivada");
  assert.ok(
    porJid[LID]?.archivedAt,
    "y su `@lid` tambien: si no, el chat volvia por su otra identidad",
  );

  // Anclar solo toca `pinnedAt`: no puede llevarse por delante el archivado.
  const pin = await bulkPinChatsAction({
    userId: dueno,
    instanceName: LINEA,
    remoteJids: [NUM],
    isPinned: true,
  });
  assert.equal(pin.success, true, pin.message);
  const tras = await db.chatConversationPreference.findMany({
    where: { userId: dueno, instanceName: LINEA },
    select: { remoteJid: true, archivedAt: true, pinnedAt: true },
  });
  assert.ok(tras.every((f) => f.pinnedAt), "las dos identidades quedan ancladas");
  assert.ok(
    tras.every((f) => f.archivedAt),
    "y el archivado sigue puesto: anclar solo toca su columna",
  );
});
