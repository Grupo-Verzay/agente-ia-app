// cleanup-cross-account-sessions.js
// Limpia leads (Session) que quedaron bajo la cuenta EQUIVOCADA por el bug de la
// bandeja unificada (un administrador veía chats de otra cuenta y se creaba el
// lead bajo su userId en vez del dueño real de la línea).
//
// Regla: para cada Session cuyo instanceId pertenece a una línea de OTRO dueño:
//   - si ese dueño YA tiene una Session con el mismo contacto  -> BORRAR (duplicado)
//   - si NO la tiene                                           -> REASIGNAR al dueño
//     (conserva el lead, etiquetas y estado; no se pierde nada)
//
// Uso:
//   node scripts/cleanup-cross-account-sessions.js           (DRY RUN: solo reporta)
//   node scripts/cleanup-cross-account-sessions.js --apply   (aplica los cambios)

const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`\n=== Limpieza de leads cruzados entre cuentas ${APPLY ? '(APLICAR)' : '(DRY RUN)'} ===\n`);

  // 1) Mapa línea -> dueño. Session.instanceId puede guardar el instanceName O el
  //    instanceId, así que indexamos por ambos.
  const instancias = await db.instancia.findMany({
    select: { instanceName: true, instanceId: true, userId: true },
  });
  const ownerByKey = new Map();
  for (const i of instancias) {
    if (i.instanceName) ownerByKey.set(i.instanceName, i.userId);
    if (i.instanceId) ownerByKey.set(i.instanceId, i.userId);
  }
  console.log(`Instancias indexadas: ${instancias.length}`);

  // 2) Todas las sesiones.
  const sessions = await db.session.findMany({
    select: { id: true, userId: true, remoteJid: true, remoteJidAlt: true, instanceId: true, pushName: true },
  });
  console.log(`Sesiones totales: ${sessions.length}`);

  // 3) Índice userId -> set de JIDs que ya tiene (para detectar duplicados).
  const jidsByUser = new Map();
  const addJid = (userId, jid) => {
    if (!jid) return;
    if (!jidsByUser.has(userId)) jidsByUser.set(userId, new Set());
    jidsByUser.get(userId).add(jid);
  };
  for (const s of sessions) {
    addJid(s.userId, s.remoteJid);
    addJid(s.userId, s.remoteJidAlt);
  }

  const toDelete = [];
  const toReassign = [];

  for (const s of sessions) {
    if (!s.instanceId) continue;              // sin línea -> no tocar
    const owner = ownerByKey.get(s.instanceId);
    if (!owner) continue;                     // línea desconocida -> no tocar
    if (owner === s.userId) continue;         // ya está bien

    const ownerJids = jidsByUser.get(owner);
    const ownerHas =
      ownerJids && ((s.remoteJid && ownerJids.has(s.remoteJid)) || (s.remoteJidAlt && ownerJids.has(s.remoteJidAlt)));

    if (ownerHas) {
      toDelete.push(s);
    } else {
      toReassign.push({ s, owner });
      // El dueño pasará a tener este contacto: futuros duplicados con el mismo
      // JID se marcarán para borrar, no para reasignar de nuevo.
      addJid(owner, s.remoteJid);
      addJid(owner, s.remoteJidAlt);
    }
  }

  console.log(`\nLeads cruzados encontrados: ${toDelete.length + toReassign.length}`);
  console.log(`  - A REASIGNAR al dueño (se conservan): ${toReassign.length}`);
  console.log(`  - A BORRAR (duplicados): ${toDelete.length}\n`);

  const sample = (arr, get) =>
    arr.slice(0, 15).forEach((x) => console.log('   ', get(x)));

  if (toReassign.length) {
    console.log('Ejemplos a reasignar (id | contacto | de -> a):');
    sample(toReassign, ({ s, owner }) => `${s.id} | ${s.pushName || s.remoteJid} | ${s.userId} -> ${owner}`);
  }
  if (toDelete.length) {
    console.log('\nEjemplos a borrar (id | contacto | userId equivocado):');
    sample(toDelete, (s) => `${s.id} | ${s.pushName || s.remoteJid} | ${s.userId}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN: no se modificó nada. Corre con --apply para ejecutar.\n');
    return;
  }

  console.log('\nAplicando cambios...');
  let reassigned = 0;
  let deleted = 0;
  let errors = 0;

  for (const { s, owner } of toReassign) {
    try {
      await db.session.update({ where: { id: s.id }, data: { userId: owner } });
      reassigned++;
    } catch (e) {
      errors++;
      console.error(`  ! No se pudo reasignar la sesión ${s.id}:`, e.message);
    }
  }
  for (const s of toDelete) {
    try {
      await db.session.delete({ where: { id: s.id } });
      deleted++;
    } catch (e) {
      errors++;
      console.error(`  ! No se pudo borrar la sesión ${s.id}:`, e.message);
    }
  }

  console.log(`\nListo. Reasignadas: ${reassigned} | Borradas: ${deleted} | Errores: ${errors}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
