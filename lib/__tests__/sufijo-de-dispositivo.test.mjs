/**
 * El sufijo de dispositivo: lo puro y la unificacion contra Postgres.
 *
 * Los identificadores van SIEMPRE en los dos formatos -el numero limpio y el
 * numero con el aparato pegado- porque el fallo entero vive en la diferencia
 * entre los dos.
 *
 * Y hay un caso que reproduce la causa diagnosticada: la consulta original, tal
 * cual estaba desde el #549, lanzando su 42703. Sin el, lo verde de al lado no
 * diria si se arreglo la causa o algo parecido.
 */
import test from "node:test";
import assert from "node:assert/strict";

const mod = await import("./.compilado/sufijo/entrada-de-sufijo.js");
const {
  sinSufijoDeDispositivo,
  buildWhatsAppJidCandidates,
  extractWhatsAppDigits,
  pickExplicitWhatsAppPhoneJid,
  fmtPhone,
  isGroupJid,
  isLidJid,
  unificarLasConversaciones,
  unificarLasFichas,
  unificarPorSufijoDeDispositivo,
  TABLAS_QUE_CUELGAN_DE_LA_FICHA,
  db,
} = mod;

const LIMPIO = "573233246305@s.whatsapp.net";
const CON_SUFIJO = "573233246305:39@s.whatsapp.net";
const LINEA = "VERZAY_VENTAS";

// La base del banco se reutiliza entre ejecuciones: sin sufijo de vuelta, la
// segunda encuentra tambien lo de la primera.
const V = `v${Date.now().toString(36)}`;

// ---------------------------------------------------------------- lo puro

test("el sufijo se quita, y lo limpio se queda igual", () => {
  assert.equal(sinSufijoDeDispositivo(CON_SUFIJO), LIMPIO);
  assert.equal(sinSufijoDeDispositivo(LIMPIO), LIMPIO);
  assert.equal(sinSufijoDeDispositivo("573233246305:1@s.whatsapp.net"), LIMPIO);
  assert.equal(sinSufijoDeDispositivo(""), "");
  assert.equal(sinSufijoDeDispositivo(null), "");
});

test("el sufijo ya no se PEGA al numero", () => {
  // Este era el dano: ":39" no lleva letras, asi que al quedarse solo con los
  // digitos salia "57323324630539", un numero que no existe.
  assert.equal(extractWhatsAppDigits(CON_SUFIJO), "573233246305");
  assert.equal(extractWhatsAppDigits(LIMPIO), "573233246305");
});

test("los dos formatos dan las MISMAS identidades", () => {
  const conSufijo = buildWhatsAppJidCandidates(CON_SUFIJO).sort();
  const limpio = buildWhatsAppJidCandidates(LIMPIO).sort();
  assert.deepEqual(conSufijo, limpio);
  // Y ninguna es un numero fabricado con los digitos del aparato dentro.
  assert.equal(
    conSufijo.some((c) => c.includes("57323324630539")),
    false,
  );
});

test("un @lid con sufijo tambien se limpia, y sigue siendo @lid", () => {
  const conSufijo = "210101696733292:12@lid";
  assert.equal(sinSufijoDeDispositivo(conSufijo), "210101696733292@lid");
  assert.equal(isLidJid(conSufijo), true);
  // Un @lid no fabrica telefono: es la regla de siempre y no se toca.
  assert.equal(
    buildWhatsAppJidCandidates(conSufijo).includes("210101696733292@s.whatsapp.net"),
    false,
  );
});

test("un grupo no se toca", () => {
  const grupo = "120363000000000000@g.us";
  assert.equal(sinSufijoDeDispositivo(grupo), grupo);
  assert.equal(isGroupJid(grupo), true);
});

test("el telefono explicito y el formateado salen sin el aparato", () => {
  assert.equal(pickExplicitWhatsAppPhoneJid([CON_SUFIJO]), LIMPIO);
  assert.equal(fmtPhone(CON_SUFIJO), fmtPhone(LIMPIO));
  assert.equal(fmtPhone(CON_SUFIJO).includes("39"), false);
});

// ------------------------------------------------------------ contra Postgres

/** Siembra una cuenta con su linea, su ficha buena y su copia con sufijo. */
async function sembrar(sufijoDelCaso, opciones = {}) {
  const userId = `${V}-${sufijoDelCaso}`;
  await db.$executeRawUnsafe(
    `INSERT INTO "User" ("id","email","updatedAt") VALUES ($1,$2,NOW())`,
    userId,
    `${userId}@banco.test`,
  );
  const crearFicha = async (jid, extra = "") =>
    (
      await db.$queryRawUnsafe(
        `INSERT INTO "Session" ("userId","remoteJid","pushName","instanceId","status","createdAt","updatedAt"${extra ? `,${extra.columna}` : ""})
         VALUES ($1,$2,'Cliente',$3,TRUE,NOW(),NOW()${extra ? `,$4` : ""}) RETURNING id`,
        ...(extra ? [userId, jid, LINEA, extra.valor] : [userId, jid, LINEA]),
      )
    )[0].id;

  const buena = await crearFicha(LIMPIO);
  const mala = await crearFicha(CON_SUFIJO, opciones.tocada);
  return { userId, buena, mala };
}

/** Una conversacion con su fila en la bandeja. */
async function sembrarConversacion(userId, jid, ts) {
  await db.$executeRawUnsafe(
    `INSERT INTO "chat_conversations"
       ("userId","instanceName","remoteJid","pushName","lastMessageId","lastMessageFromMe",
        "lastMessageContent","lastMessageTimestamp","createdAt","updatedAt")
     VALUES ($1,$2,$3,'Cliente',$4,FALSE,$5,$6,NOW(),NOW())`,
    userId,
    LINEA,
    jid,
    `ult-${jid}`,
    `ultimo de ${jid}`,
    ts,
  );
}

async function sembrarMensaje(userId, jid, messageId, texto, ts, fromMe = false) {
  await db.$executeRawUnsafe(
    `INSERT INTO "chat_messages"
       ("userId","instanceName","remoteJid","messageId","fromMe","content","messageTimestamp","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
    userId,
    LINEA,
    jid,
    messageId,
    fromMe,
    texto,
    ts,
  );
}

const mensajesDe = (userId, jid) =>
  db.$queryRawUnsafe(
    `SELECT "messageId","content" FROM "chat_messages"
      WHERE "userId"=$1 AND "instanceName"=$2 AND "remoteJid"=$3 ORDER BY "messageTimestamp"`,
    userId,
    LINEA,
    jid,
  );

const fichas = (userId) =>
  db.$queryRawUnsafe(`SELECT "id","remoteJid" FROM "Session" WHERE "userId"=$1 ORDER BY id`, userId);

test("LA CAUSA: la consulta original lanza 42703 por el nombre de la columna", async () => {
  const { userId } = await sembrar("causa");
  let fallo = null;
  try {
    // Tal cual estaba en actions/chat-conversation-actions.ts desde el #549.
    await db.$queryRawUnsafe(
      `DELETE FROM "Session" mala
        WHERE mala."userId" = $1
          AND mala."remoteJid" ~ ':[0-9]+@'
          AND mala."assignedAdvisorId" IS NULL
          AND mala."customName" IS NULL
          AND mala."leadStatus" IS NULL
          AND mala."createdAt" = mala."updatedAt"
        RETURNING "remoteJid"`,
      userId,
    );
  } catch (error) {
    fallo = error;
  }
  assert.ok(fallo, "la consulta vieja tenia que fallar");
  assert.equal(fallo.constructor.name, "PrismaClientKnownRequestError");
  assert.equal(fallo.code, "P2010");
  assert.equal(fallo.meta.code, "42703");
  assert.match(fallo.meta.message, /assignedAdvisorId/);
  // Y por eso no borraba nada: las dos fichas siguen ahi.
  assert.equal((await fichas(userId)).length, 2);
});

test("las columnas que nombra el modulo existen DE VERDAD en la base", async () => {
  // La misma familia del 42703: en SQL en crudo la columna es la de la BASE.
  const nombradas = [
    { tabla: "Session", columna: "assigned_advisor_id" },
    { tabla: "Session", columna: "custom_name" },
    { tabla: "Session", columna: "leadStatus" },
    ...TABLAS_QUE_CUELGAN_DE_LA_FICHA,
  ];
  for (const { tabla, columna } of nombradas) {
    const filas = await db.$queryRawUnsafe(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
      tabla,
      columna,
    );
    assert.equal(filas.length, 1, `no existe ${tabla}.${columna}`);
  }
});

test("la ficha con sufijo se une a la buena y desaparece", async () => {
  const { userId, buena } = await sembrar("ficha");
  assert.equal(await unificarLasFichas([userId]), 1);
  const quedan = await fichas(userId);
  assert.deepEqual(
    quedan.map((f) => f.remoteJid),
    [LIMPIO],
  );
  assert.equal(quedan[0].id, buena);
});

test("los mensajes de las DOS quedan en la conversacion que sobrevive", async () => {
  const { userId } = await sembrar("mensajes");
  await sembrarConversacion(userId, LIMPIO, new Date("2026-09-01T10:00:00Z"));
  await sembrarConversacion(userId, CON_SUFIJO, new Date("2026-09-02T10:00:00Z"));
  await sembrarMensaje(userId, LIMPIO, "m1", "desde el telefono", new Date("2026-09-01T10:00:00Z"));
  await sembrarMensaje(userId, CON_SUFIJO, "m2", "desde el portatil", new Date("2026-09-02T10:00:00Z"));

  assert.equal(await unificarLasConversaciones([userId]), 1);

  const juntos = await mensajesDe(userId, LIMPIO);
  assert.deepEqual(
    juntos.map((m) => m.messageId),
    ["m1", "m2"],
  );
  assert.equal((await mensajesDe(userId, CON_SUFIJO)).length, 0);

  const filas = await db.$queryRawUnsafe(
    `SELECT "remoteJid","lastMessageId" FROM "chat_conversations" WHERE "userId"=$1`,
    userId,
  );
  assert.equal(filas.length, 1);
  assert.equal(filas[0].remoteJid, LIMPIO);
  // El mensaje mas nuevo era el de la conversacion con sufijo: es el que manda.
  assert.equal(filas[0].lastMessageId, `ult-${CON_SUFIJO}`);
});

test("el mismo mensaje guardado bajo los dos jids no se duplica ni se pierde", async () => {
  const { userId } = await sembrar("repetido");
  await sembrarConversacion(userId, LIMPIO, new Date("2026-09-01T10:00:00Z"));
  await sembrarConversacion(userId, CON_SUFIJO, new Date("2026-09-01T09:00:00Z"));
  await sembrarMensaje(userId, LIMPIO, "m1", "el bueno", new Date("2026-09-01T10:00:00Z"));
  await sembrarMensaje(userId, CON_SUFIJO, "m1", "la copia", new Date("2026-09-01T10:00:00Z"));
  await sembrarMensaje(userId, CON_SUFIJO, "m9", "solo suyo", new Date("2026-09-01T11:00:00Z"));

  await unificarLasConversaciones([userId]);

  const juntos = await mensajesDe(userId, LIMPIO);
  assert.deepEqual(
    juntos.map((m) => m.messageId).sort(),
    ["m1", "m9"],
  );
  assert.equal(juntos.find((m) => m.messageId === "m1").content, "el bueno");
  // La fila mas nueva era la limpia: su ultimo mensaje se queda.
  const filas = await db.$queryRawUnsafe(
    `SELECT "lastMessageId" FROM "chat_conversations" WHERE "userId"=$1`,
    userId,
  );
  assert.equal(filas[0].lastMessageId, `ult-${LIMPIO}`);
});

test("sin gemela limpia, la conversacion se queda: se le quita el sufijo", async () => {
  const { userId } = await sembrar("sola");
  await sembrarConversacion(userId, CON_SUFIJO, new Date("2026-09-02T10:00:00Z"));
  await sembrarMensaje(userId, CON_SUFIJO, "m2", "unico", new Date("2026-09-02T10:00:00Z"));

  await unificarLasConversaciones([userId]);

  const filas = await db.$queryRawUnsafe(
    `SELECT "remoteJid" FROM "chat_conversations" WHERE "userId"=$1`,
    userId,
  );
  assert.deepEqual(
    filas.map((f) => f.remoteJid),
    [LIMPIO],
  );
  assert.equal((await mensajesDe(userId, LIMPIO)).length, 1);
});

test("lo que cuelga de la ficha NO se pierde: nota, etiqueta, cita y tarea", async () => {
  const { userId, buena, mala } = await sembrar("cuelga");

  await db.$executeRawUnsafe(
    `INSERT INTO "internal_notes" ("sessionId","authorId","content","updatedAt")
     VALUES ($1,$2,'una nota que alguien escribio',NOW())`,
    mala,
    userId,
  );
  const tag = (
    await db.$queryRawUnsafe(
      `INSERT INTO "Tag" ("userId","name","slug","updatedAt") VALUES ($1,'VIP','vip',NOW()) RETURNING id`,
      userId,
    )
  )[0].id;
  await db.$executeRawUnsafe(`INSERT INTO "SessionTag" ("sessionId","tagId") VALUES ($1,$2)`, mala, tag);
  await db.$executeRawUnsafe(
    `INSERT INTO "Appointment" ("id","userId","sessionId","startTime","endTime","timezone","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,NOW(),NOW(),'America/Bogota',NOW())`,
    userId,
    mala,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "tasks" ("ownerId","assignedToId","sessionId","title","dueDate","createdById","updatedAt")
     VALUES ($1,$1,$2,'llamar al cliente',NOW(),$1,NOW())`,
    userId,
    mala,
  );

  await unificarLasFichas([userId]);

  const cuenta = async (tabla, columna) =>
    Number(
      (
        await db.$queryRawUnsafe(
          `SELECT COUNT(*)::int AS n FROM "${tabla}" WHERE "${columna}"=$1`,
          buena,
        )
      )[0].n,
    );
  assert.equal(await cuenta("internal_notes", "sessionId"), 1);
  assert.equal(await cuenta("SessionTag", "sessionId"), 1);
  assert.equal(await cuenta("Appointment", "sessionId"), 1);
  assert.equal(await cuenta("tasks", "sessionId"), 1);
  assert.deepEqual(
    (await fichas(userId)).map((f) => f.remoteJid),
    [LIMPIO],
  );
});

test("una etiqueta que las dos tienen no revienta la unificacion", async () => {
  const { userId, buena, mala } = await sembrar("colision");
  const tag = (
    await db.$queryRawUnsafe(
      `INSERT INTO "Tag" ("userId","name","slug","updatedAt") VALUES ($1,'VIP','vip',NOW()) RETURNING id`,
      userId,
    )
  )[0].id;
  await db.$executeRawUnsafe(`INSERT INTO "SessionTag" ("sessionId","tagId") VALUES ($1,$2)`, buena, tag);
  await db.$executeRawUnsafe(`INSERT INTO "SessionTag" ("sessionId","tagId") VALUES ($1,$2)`, mala, tag);
  // Y un disparador en cada una: su sessionId es unico el solo.
  await db.$executeRawUnsafe(
    `INSERT INTO "SessionTrigger" ("time","sessionId","updatedAt") VALUES ('10:00',$1,NOW())`,
    buena,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "SessionTrigger" ("time","sessionId","updatedAt") VALUES ('11:00',$1,NOW())`,
    mala,
  );

  await unificarLasFichas([userId]);

  const etiquetas = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM "SessionTag" WHERE "sessionId"=$1`,
    buena,
  );
  assert.equal(Number(etiquetas[0].n), 1);
  const disparadores = await db.$queryRawUnsafe(
    `SELECT "time" FROM "SessionTrigger" WHERE "sessionId"=$1`,
    buena,
  );
  assert.deepEqual(
    disparadores.map((d) => d.time),
    ["10:00"],
  );
  assert.deepEqual(
    (await fichas(userId)).map((f) => f.remoteJid),
    [LIMPIO],
  );
});

test("una ficha TOCADA no se toca", async () => {
  for (const tocada of [
    { columna: '"assigned_advisor_id"', valor: "alguien" },
    { columna: '"custom_name"', valor: "Don Pedro" },
  ]) {
    const caso = `tocada-${tocada.columna.replace(/\W/g, "")}`;
    const { userId } = await sembrar(caso, { tocada });
    assert.equal(await unificarLasFichas([userId]), 0);
    assert.equal((await fichas(userId)).length, 2);
  }
});

test("una ficha vuelta a guardar tampoco: createdAt ya no es updatedAt", async () => {
  const { userId, mala } = await sembrar("guardada");
  await db.$executeRawUnsafe(`UPDATE "Session" SET "updatedAt" = NOW() + interval '1 minute' WHERE id=$1`, mala);
  assert.equal(await unificarLasFichas([userId]), 0);
  assert.equal((await fichas(userId)).length, 2);
});

test("no se toca lo de otra cuenta", async () => {
  const mia = await sembrar("mia");
  const ajena = await sembrar("ajena");
  await sembrarConversacion(ajena.userId, CON_SUFIJO, new Date("2026-09-02T10:00:00Z"));

  await unificarPorSufijoDeDispositivo([mia.userId]);

  assert.equal((await fichas(ajena.userId)).length, 2);
  const filas = await db.$queryRawUnsafe(
    `SELECT "remoteJid" FROM "chat_conversations" WHERE "userId"=$1`,
    ajena.userId,
  );
  assert.deepEqual(
    filas.map((f) => f.remoteJid),
    [CON_SUFIJO],
  );
});

test("unificar no lanza aunque falte una tabla", async () => {
  // Nunca rompe la carga de la bandeja: es la regla de la funcion.
  await unificarPorSufijoDeDispositivo([]);
  await unificarPorSufijoDeDispositivo(["no-existe-esta-cuenta"]);
});

test.after(async () => {
  await db.$disconnect();
});
