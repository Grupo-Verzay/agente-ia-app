// migrate-legacy-reseller-links.js
// Consolida la vinculación cliente↔reseller hacia el sistema NUEVO
// (User.demoResellerId). La vinculación vive en DOS sistemas:
//   - NUEVO: User.demoResellerId = <resellerId>
//   - VIEJO: tabla `reseller` (fila con userId=<cliente>, resellerid=<reseller>)
// Un cliente vinculado SOLO por el sistema viejo tiene demoResellerId=null, así
// que los crons que filtran por demoResellerId (billing de plataforma vs cobros
// del reseller, notificaciones) lo tratan como cliente DIRECTO y lo cobran/
// notifican por la línea de Verzay en vez de por la del reseller.
//
// Este script puebla User.demoResellerId desde la tabla `reseller` vieja, para
// que TODO quede en el sistema nuevo y los crons resuelvan bien el reseller.
//
// Reglas (conservadoras):
//   - Solo migra cuando el `resellerid` legacy es un RESELLER REAL (role=reseller).
//     Filas cuyo resellerid es admin/super_admin (Verzay) se tratan como clientes
//     DIRECTOS de la plataforma y NO se migran (seguirían cobrándose por Verzay).
//   - Solo migra clientes con demoResellerId ACTUALMENTE NULL.
//   - NO toca conflictos (cliente con demoResellerId ya puesto a OTRO reseller):
//     se reportan para revisión manual.
//   - Ignora filas de branding (userId null) y auto-referencias (userId=resellerid).
//
// Uso:
//   node scripts/migrate-legacy-reseller-links.js            (DRY RUN: solo reporta)
//   node scripts/migrate-legacy-reseller-links.js --apply    (aplica los cambios)

const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`\n=== Migración de vínculos reseller legacy → demoResellerId ===`);
  console.log(APPLY ? '>>> MODO: APLICAR CAMBIOS' : '>>> MODO: DRY RUN (solo reporta, no escribe)');

  // Filas de ASIGNACIÓN cliente→reseller del sistema viejo.
  const rows = await db.reseller.findMany({
    where: { userId: { not: null }, resellerid: { not: null } },
    select: { id: true, userId: true, resellerid: true },
  });

  // Cargar en lote los usuarios involucrados (clientes + resellers).
  const ids = Array.from(
    new Set(rows.flatMap((r) => [r.userId, r.resellerid]).filter(Boolean)),
  );
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, role: true, name: true, company: true, demoResellerId: true, isDemo: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  const toMigrate = [];   // {clientId, resellerId, label}
  const conflicts = [];   // demoResellerId ya puesto a OTRO reseller
  const skippedNotReseller = []; // resellerid no es un reseller real
  const alreadyConsistent = []; // demoResellerId === resellerid ya
  const missingUser = [];       // cliente o reseller inexistente
  const selfRef = [];

  // Dedup por cliente (un cliente podría tener varias filas legacy).
  const seenClient = new Map();

  for (const row of rows) {
    const clientId = row.userId;
    const resellerId = row.resellerid;
    if (clientId === resellerId) { selfRef.push(row); continue; }

    const client = userById.get(clientId);
    const reseller = userById.get(resellerId);
    if (!client || !reseller) { missingUser.push({ ...row, hasClient: !!client, hasReseller: !!reseller }); continue; }

    const label = `${client.company || client.name || client.id} (rol=${client.role})  →  reseller ${reseller.company || reseller.name || reseller.id} (rol=${reseller.role})`;

    // El reseller legacy debe ser un RESELLER REAL. Si es admin/super_admin/user,
    // el cliente se considera directo de la plataforma y NO se migra.
    if (reseller.role !== 'reseller') { skippedNotReseller.push({ clientId, resellerId, label }); continue; }

    if (client.demoResellerId === resellerId) { alreadyConsistent.push({ clientId, resellerId, label }); continue; }
    if (client.demoResellerId && client.demoResellerId !== resellerId) {
      conflicts.push({ clientId, resellerId, current: client.demoResellerId, label });
      continue;
    }

    // demoResellerId null → candidato a migrar. Evitar duplicar por cliente.
    if (seenClient.has(clientId)) {
      const prev = seenClient.get(clientId);
      if (prev !== resellerId) {
        conflicts.push({ clientId, resellerId, current: `(otra fila legacy: ${prev})`, label });
      }
      continue;
    }
    seenClient.set(clientId, resellerId);
    toMigrate.push({ clientId, resellerId, label });
  }

  // ── Reporte ──────────────────────────────────────────────────────────────
  const section = (title, arr) => {
    console.log(`\n── ${title}: ${arr.length} ──`);
    for (const x of arr.slice(0, 100)) console.log(`   • ${x.label ?? JSON.stringify(x)}`);
    if (arr.length > 100) console.log(`   … y ${arr.length - 100} más`);
  };

  console.log(`\nFilas de asignación legacy encontradas: ${rows.length}`);
  section('A MIGRAR (demoResellerId null → reseller real)', toMigrate);
  section('YA CONSISTENTES (demoResellerId ya = reseller)', alreadyConsistent);
  section('OMITIDOS (resellerid NO es reseller real → cliente directo)', skippedNotReseller);
  section('CONFLICTOS (demoResellerId apunta a OTRO reseller — revisar a mano)', conflicts);
  section('USUARIO INEXISTENTE (fila legacy huérfana)', missingUser);
  if (selfRef.length) console.log(`\n── AUTO-REFERENCIAS ignoradas: ${selfRef.length} ──`);

  // ── Aplicar ──────────────────────────────────────────────────────────────
  if (!APPLY) {
    console.log(`\n>>> DRY RUN: no se escribió nada. Ejecuta con --apply para migrar ${toMigrate.length} clientes.`);
    return;
  }

  let updated = 0, failed = 0;
  for (const m of toMigrate) {
    try {
      await db.user.update({ where: { id: m.clientId }, data: { demoResellerId: m.resellerId } });
      updated++;
    } catch (e) {
      failed++;
      console.error(`   ✗ Error migrando ${m.clientId} → ${m.resellerId}: ${e.message}`);
    }
  }
  console.log(`\n>>> APLICADO: ${updated} clientes migrados, ${failed} fallidos.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
