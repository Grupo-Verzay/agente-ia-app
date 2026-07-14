// consolidate-lid-sessions.js
// Consolida sesiones/leads DUPLICADOS causados por WhatsApp @lid: un mismo
// contacto queda con DOS Session (una bajo "NNN@lid" y otra bajo el número real
// "NNN@s.whatsapp.net"). El índice único (userId, instanceId, remoteJid) NO las
// colapsa porque son remoteJid distintos.
//
// Un @lid es un ID de privacidad, NO un teléfono: NO se puede convertir por sí
// solo. Por eso el emparejamiento SOLO se hace por fuentes seguras:
//   (a) la sesión @lid tiene remoteJidAlt = remoteJid de la sesión del número real
//   (b) la tabla chat_lid_map (userId, lid) -> remoteJid real que el webhook aprende
// NUNCA se empareja por los dígitos crudos del @lid.
//
// Ganadora = la sesión del número real (@s.whatsapp.net). Perdedora = la @lid.
// Antes de borrar la perdedora, TODOS sus hijos (descubiertos por FK + tablas
// "shadow" sin FK) se reasignan a la ganadora, respetando los índices únicos
// (las filas que colisionarían se descartan). También se rellenan campos vacíos
// de la ganadora con los de la perdedora y se registra el @lid en chat_lid_map.
//
// Caso extra: sesión @lid con número real conocido pero SIN sesión gemela del
// número real -> se "canoniza" (se renombra su remoteJid al número real). Seguro
// porque no hay colisión.
//
// Uso:
//   node scripts/consolidate-lid-sessions.js            (DRY RUN: solo reporta)
//   node scripts/consolidate-lid-sessions.js --apply    (aplica los cambios)

const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const APPLY = process.argv.includes('--apply');

const LID_SUFFIX = '@lid';
const isLid = (jid) => typeof jid === 'string' && jid.trim().toLowerCase().endsWith(LID_SUFFIX);
const isRealNumberJid = (jid) =>
  typeof jid === 'string' && jid.trim().toLowerCase().endsWith('@s.whatsapp.net');

// Tablas "shadow" que referencian Session.id pero SIN foreign key real en Prisma
// (no aparecen en el descubrimiento por FK y no cascan solas al borrar).
const SHADOW_CHILD_TABLES = [
  { table: 'session_participants', col: 'sessionId' },
  { table: 'collab_notifications', col: 'sessionId' },
  { table: 'crm_follow_ups_archive', col: 'sessionId' },
  { table: 'sales_outcome_learning', col: 'sessionId' },
  { table: 'sales_playbook_feedback', col: 'sessionId' },
];

// Campos de Session que se rellenan en la ganadora SOLO si están vacíos (para no
// perder datos que quizá quedaron en la sesión @lid). Los booleanos NO se tocan.
const FILLABLE_FIELDS = [
  'customName',
  'seguimientos',
  'inactividad',
  'sessionDelay',
  'flujos',
  'leadStatus',
  'leadStatusReason',
  'serviceType',
  'clientStatus',
  'leadScore',
  'leadScoreReason',
  'assignedAdvisorId',
  'adSource',
];

const q = (ident) => `"${String(ident).replace(/"/g, '""')}"`;

/** Descubre (tabla, columna) de cada FK que referencia "Session"."id" + shadow. */
async function discoverChildTables() {
  const fks = await db.$queryRawUnsafe(`
    SELECT tc.table_name AS "table", kcu.column_name AS "col"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'Session'
      AND ccu.column_name = 'id'
      AND tc.table_schema = 'public'
  `);

  const byKey = new Map();
  for (const r of fks) byKey.set(`${r.table}.${r.col}`, { table: r.table, col: r.col });

  // Confirma que las shadow existen y tienen la columna, antes de agregarlas.
  for (const s of SHADOW_CHILD_TABLES) {
    const exists = await db.$queryRawUnsafe(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2 LIMIT 1`,
      s.table,
      s.col,
    );
    if (exists.length) byKey.set(`${s.table}.${s.col}`, s);
  }
  return Array.from(byKey.values());
}

/** Índices únicos de una tabla que incluyen la columna FK (para evitar colisiones). */
async function uniqueIndexesIncluding(table, fkCol) {
  const rows = await db.$queryRawUnsafe(
    `
    SELECT array_agg(a.attname ORDER BY k.ord) AS cols
    FROM pg_index ix
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE ix.indisunique AND n.nspname = 'public' AND t.relname = $1
    GROUP BY ix.indexrelid
  `,
    table,
  );
  return rows
    .map((r) => r.cols)
    .filter((cols) => Array.isArray(cols) && cols.includes(fkCol));
}

/** Cuenta filas hijas de una sesión (para el reporte DRY-RUN). */
async function countChildren(table, col, sessionId) {
  const r = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM ${q(table)} WHERE ${q(col)} = $1`,
    sessionId,
  );
  return r[0]?.n ?? 0;
}

/**
 * Reasigna los hijos de loserId -> winnerId en una tabla, respetando uniques:
 * primero borra las filas de la perdedora que colisionarían con una fila de la
 * ganadora en algún índice único; luego actualiza el resto. Devuelve {moved, dropped}.
 * Usa el executor `x` (tx dentro de la transacción).
 */
async function reassignChildTable(x, table, col, loserId, winnerId) {
  const uniques = await uniqueIndexesIncluding(table, col);
  let dropped = 0;
  for (const cols of uniques) {
    const others = cols.filter((c) => c !== col);
    let existsCond;
    if (others.length === 0) {
      // Único = solo la FK (ej. sessionId @unique): si la ganadora ya tiene fila,
      // TODA fila de la perdedora colisiona.
      existsCond = `SELECT 1 FROM ${q(table)} w WHERE w.${q(col)} = $2`;
    } else {
      const on = others.map((c) => `w.${q(c)} = l.${q(c)}`).join(' AND ');
      existsCond = `SELECT 1 FROM ${q(table)} w WHERE w.${q(col)} = $2 AND ${on}`;
    }
    const delSql = `DELETE FROM ${q(table)} l WHERE l.${q(col)} = $1 AND EXISTS (${existsCond})`;
    dropped += await x.$executeRawUnsafe(delSql, loserId, winnerId);
  }
  const moved = await x.$executeRawUnsafe(
    `UPDATE ${q(table)} SET ${q(col)} = $2 WHERE ${q(col)} = $1`,
    loserId,
    winnerId,
  );
  return { moved, dropped };
}

function fillWinnerData(winner, loser) {
  const data = {};
  for (const f of FILLABLE_FIELDS) {
    const wv = winner[f];
    const lv = loser[f];
    const winnerEmpty = wv === null || wv === undefined || (typeof wv === 'string' && wv.trim() === '');
    const loserHas = !(lv === null || lv === undefined || (typeof lv === 'string' && lv.trim() === ''));
    if (winnerEmpty && loserHas) data[f] = lv;
  }
  // Registrar el @lid como alterno de la ganadora si no tiene alterno: ayuda a que
  // un futuro mensaje @lid encuentre esta misma sesión por remoteJidAlt.
  const winnerAltEmpty =
    winner.remoteJidAlt === null || winner.remoteJidAlt === undefined || String(winner.remoteJidAlt).trim() === '';
  if (winnerAltEmpty && isLid(loser.remoteJid)) data.remoteJidAlt = loser.remoteJid;
  return data;
}

async function rememberLidMapping(x, userId, lid, realJid) {
  try {
    await x.$executeRawUnsafe(
      `INSERT INTO "chat_lid_map" ("userId","lid","remoteJid","updatedAt")
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT ("userId","lid") DO UPDATE SET "remoteJid"=EXCLUDED."remoteJid","updatedAt"=NOW()`,
      userId,
      lid,
      realJid,
    );
  } catch {
    // chat_lid_map la crea el webhook; si aún no existe, no es crítico.
  }
}

async function main() {
  console.log(`\n=== Consolidación de sesiones @lid ${APPLY ? '(APLICAR)' : '(DRY RUN)'} ===\n`);

  // Confirmación de a qué BD estás conectado (para no aplicar sobre la equivocada).
  try {
    const info = await db.$queryRawUnsafe(
      `SELECT current_database() AS db, inet_server_addr()::text AS host, current_user AS usr`,
    );
    console.log(`Conectado a: db=${info[0].db} host=${info[0].host ?? 'local'} user=${info[0].usr}\n`);
  } catch {
    /* noop */
  }

  const childTables = await discoverChildTables();
  console.log(`Tablas hijas de Session detectadas: ${childTables.length}`);
  console.log('  ' + childTables.map((c) => `${c.table}.${c.col}`).join(', ') + '\n');

  const sessions = await db.session.findMany();
  console.log(`Sesiones totales: ${sessions.length}`);

  // chat_lid_map: (userId, lid) -> remoteJid real.
  const lidMap = new Map();
  try {
    const rows = await db.$queryRawUnsafe(`SELECT "userId","lid","remoteJid" FROM "chat_lid_map"`);
    for (const r of rows) lidMap.set(`${r.userId}::${String(r.lid).toLowerCase()}`, r.remoteJid);
    console.log(`Entradas en chat_lid_map: ${rows.length}`);
  } catch {
    console.log('chat_lid_map no existe todavía (se ignora esa fuente).');
  }

  // Índice: (userId, instanceId, remoteJid) -> sesión, para encontrar la gemela.
  const byKey = new Map();
  for (const s of sessions) byKey.set(`${s.userId}::${s.instanceId}::${s.remoteJid}`, s);

  const merges = []; // { winner, loser, realJid }
  const canon = []; // { session, realJid }  (@lid sin gemela: renombrar)

  for (const s of sessions) {
    if (!isLid(s.remoteJid)) continue; // solo nos interesan las sesiones @lid
    // Número real conocido de forma SEGURA:
    let realJid = null;
    if (isRealNumberJid(s.remoteJidAlt)) realJid = s.remoteJidAlt;
    if (!realJid) {
      const m = lidMap.get(`${s.userId}::${String(s.remoteJid).toLowerCase()}`);
      if (m && isRealNumberJid(m)) realJid = m;
    }
    if (!realJid) continue; // no se puede resolver con seguridad -> no se toca

    const winner = byKey.get(`${s.userId}::${s.instanceId}::${realJid}`);
    if (winner && winner.id !== s.id) {
      merges.push({ winner, loser: s, realJid });
    } else if (!winner) {
      canon.push({ session: s, realJid });
    }
  }

  console.log(`\nDuplicados @lid + número real (a FUSIONAR): ${merges.length}`);
  console.log(`Sesiones @lid sin gemela, con número real conocido (a CANONIZAR): ${canon.length}\n`);

  if (merges.length) {
    console.log('— Fusiones (loser @lid -> winner número real) —');
    for (const { winner, loser, realJid } of merges.slice(0, 30)) {
      const counts = [];
      for (const c of childTables) {
        const n = await countChildren(c.table, c.col, loser.id);
        if (n > 0) counts.push(`${c.table}:${n}`);
      }
      console.log(
        `   loser #${loser.id} (${loser.remoteJid}) -> winner #${winner.id} (${realJid}) | user ${winner.userId} | hijos: ${counts.join(', ') || 'ninguno'}`,
      );
    }
    if (merges.length > 30) console.log(`   ...y ${merges.length - 30} más`);
  }
  if (canon.length) {
    console.log('\n— Canonizaciones (@lid -> número real, sin fusión) —');
    for (const { session, realJid } of canon.slice(0, 30)) {
      console.log(`   #${session.id} ${session.remoteJid} -> ${realJid} | user ${session.userId}`);
    }
    if (canon.length > 30) console.log(`   ...y ${canon.length - 30} más`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN: no se modificó nada. Corre con --apply para ejecutar.\n');
    return;
  }

  console.log('\nAplicando cambios...\n');
  let mergedOk = 0;
  let canonOk = 0;
  let errors = 0;

  for (const { winner, loser, realJid } of merges) {
    try {
      await db.$transaction(async (x) => {
        for (const c of childTables) {
          await reassignChildTable(x, c.table, c.col, loser.id, winner.id);
        }
        const fill = fillWinnerData(winner, loser);
        if (Object.keys(fill).length) {
          await x.session.update({ where: { id: winner.id }, data: fill });
        }
        await rememberLidMapping(x, winner.userId, loser.remoteJid, realJid);
        await x.session.delete({ where: { id: loser.id } });
      });
      mergedOk++;
    } catch (e) {
      errors++;
      console.error(`  ! Fusión falló (loser #${loser.id} -> winner #${winner.id}):`, e.message);
    }
  }

  for (const { session, realJid } of canon) {
    try {
      await db.$transaction(async (x) => {
        // Doble chequeo anti-carrera: que no haya aparecido una gemela.
        const twin = await x.session.findFirst({
          where: { userId: session.userId, instanceId: session.instanceId, remoteJid: realJid },
          select: { id: true },
        });
        if (twin) {
          for (const c of childTables) await reassignChildTable(x, c.table, c.col, session.id, twin.id);
          await rememberLidMapping(x, session.userId, session.remoteJid, realJid);
          await x.session.delete({ where: { id: session.id } });
        } else {
          const data = { remoteJid: realJid };
          const altEmpty = !session.remoteJidAlt || String(session.remoteJidAlt).trim() === '';
          if (altEmpty) data.remoteJidAlt = session.remoteJid; // guarda el @lid como alterno
          await x.session.update({ where: { id: session.id }, data });
          await rememberLidMapping(x, session.userId, session.remoteJid, realJid);
        }
      });
      canonOk++;
    } catch (e) {
      errors++;
      console.error(`  ! Canonización falló (#${session.id}):`, e.message);
    }
  }

  console.log(`\nListo. Fusionadas: ${mergedOk} | Canonizadas: ${canonOk} | Errores: ${errors}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
