#!/usr/bin/env node
/*
 * baseline-dry-run.js — Prueba COMPLETA del baseline de Prisma sobre una COPIA.
 *
 * Qué hace, de corrido (se detiene al primer FALLO):
 *   1. Preflight    — verifica herramientas, variables y seguridad.
 *   2. Backup       — pg_dump de PRODUCCIÓN (SOLO LECTURA).
 *   3. Copia        — crea/recrea una BD copia y restaura el backup ahí.
 *   4. 0_init       — genera el baseline desde el schema (no toca ninguna BD).
 *   5. Baseline     — marca 0_init como aplicado EN LA COPIA (no ejecuta DDL).
 *   6. No-op        — verifica que `migrate deploy` en la copia no aplica nada.
 *   7. Protegidos   — verifica que los objetos que no deben borrarse siguen ahí.
 *
 * ⚠️ NUNCA toca producción salvo un pg_dump de solo lectura. Todas las escrituras
 *    ocurren exclusivamente contra la BD copia. Es idempotente: recrea la copia
 *    en cada corrida y no deja basura (salvo que uses KEEP_COPY=1).
 *
 * Uso:
 *   PROD_URL="postgres://.../produccion" \
 *   STAGING_ADMIN_URL="postgres://.../postgres" \
 *   [COPY_DB_NAME=verzay_baseline_dryrun] [KEEP_COPY=0] \
 *   node scripts/baseline-dry-run.js
 *
 *   - PROD_URL:          conexión a la BD de producción (se usa SOLO para pg_dump).
 *   - STAGING_ADMIN_URL: conexión a la BD de mantenimiento del servidor de PRUEBA
 *                        (normalmente termina en /postgres) con permiso CREATEDB.
 *                        La copia se crea en ESE servidor. NO debe ser producción.
 *   - COPY_DB_NAME:      nombre de la BD copia a crear (default verzay_baseline_dryrun).
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RESET = '\x1b[0m', RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', BOLD = '\x1b[1m';
const ok = (m) => console.log(`${GREEN}  ✔ OK${RESET}  ${m}`);
const info = (m) => console.log(`     ${m}`);
function fail(m, detail) {
  console.log(`${RED}  ✗ FALLO${RESET}  ${m}`);
  if (detail) console.log(`${YELLOW}${String(detail).trim()}${RESET}`);
  console.log(`\n${RED}${BOLD}Detenido en el primer fallo. Nada se aplicó a producción.${RESET}`);
  process.exit(1);
}
let stepN = 0;
function step(title) { stepN++; console.log(`\n${BOLD}[${stepN}] ${title}${RESET}`); }

function maskUrl(u) {
  try { const x = new URL(u); if (x.password) x.password = '***'; if (x.username) x.username = x.username[0] + '***'; return x.toString(); }
  catch { return '(url inválida)'; }
}

// Ejecuta un comando; devuelve {code, out, err}. NUNCA imprime secretos.
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...(opts.env || {}) }, maxBuffer: 1024 * 1024 * 64, ...opts });
  return { code: r.status ?? 1, out: r.stdout || '', err: (r.stderr || '') + (r.error ? String(r.error) : '') };
}
function has(bin) { return run(process.platform === 'win32' ? 'where' : 'which', [bin]).code === 0; }

// ── Config ──────────────────────────────────────────────────────────────────
const PROD_URL = process.env.PROD_URL || '';
const STAGING_ADMIN_URL = process.env.STAGING_ADMIN_URL || '';
const COPY_DB_NAME = process.env.COPY_DB_NAME || 'verzay_baseline_dryrun';
const KEEP_COPY = process.env.KEEP_COPY === '1';
const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_SRC = path.join(REPO_ROOT, 'prisma', 'schema.prisma');

console.log(`${BOLD}=== baseline-dry-run — prueba del baseline sobre una COPIA ===${RESET}`);

// Deriva la URL de la copia a partir de STAGING_ADMIN_URL cambiando el nombre de BD.
function deriveCopyUrl() {
  const u = new URL(STAGING_ADMIN_URL);
  u.pathname = '/' + COPY_DB_NAME;
  return u.toString();
}

// ── 1. Preflight ──────────────────────────────────────────────────────────────
step('Preflight (herramientas, variables y seguridad)');
for (const bin of ['pg_dump', 'pg_restore', 'psql', 'npx']) {
  if (!has(bin)) fail(`Falta el binario requerido: ${bin}`);
}
ok('pg_dump, pg_restore, psql, npx disponibles');
if (!PROD_URL) fail('Falta la variable PROD_URL (conexión de producción, solo lectura).');
if (!STAGING_ADMIN_URL) fail('Falta la variable STAGING_ADMIN_URL (servidor de prueba, con CREATEDB).');
if (!fs.existsSync(SCHEMA_SRC)) fail(`No se encontró el schema: ${SCHEMA_SRC}`);

let prod, adminU, copyUrl;
try { prod = new URL(PROD_URL); } catch { fail('PROD_URL no es una URL válida.'); }
try { adminU = new URL(STAGING_ADMIN_URL); } catch { fail('STAGING_ADMIN_URL no es una URL válida.'); }
copyUrl = deriveCopyUrl();
const copyU = new URL(copyUrl);

// Seguridad: la copia NO puede ser producción.
const prodDb = prod.pathname.replace(/^\//, '');
if (copyU.host === prod.host && copyU.pathname === prod.pathname) {
  fail('La BD copia coincide con producción (mismo host + BD). Abortando por seguridad.');
}
if (COPY_DB_NAME === prodDb && adminU.host === prod.host) {
  fail(`La copia se llamaría igual que la BD de producción ("${prodDb}") en el mismo host. Abortando.`);
}
const prodPrisma = new URL(PROD_URL);
if (prodPrisma.host === adminU.host && prodDb === COPY_DB_NAME) {
  fail('Configuración insegura: la copia apuntaría a la BD de producción.');
}
ok(`Producción (solo lectura): ${maskUrl(PROD_URL)}`);
ok(`Servidor de copia:        ${maskUrl(STAGING_ADMIN_URL)}`);
ok(`BD copia a crear:         ${COPY_DB_NAME}  ->  ${maskUrl(copyUrl)}`);

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-dryrun-'));
const DUMP = path.join(WORK, 'prod.dump');
info(`Directorio de trabajo temporal: ${WORK}`);

// psql helper contra una URL con ON_ERROR_STOP.
function psql(url, sql) { return run('psql', [url, '-v', 'ON_ERROR_STOP=1', '-tAc', sql]); }

// ── 2. Backup de producción (SOLO LECTURA) ─────────────────────────────────────
step('Backup de producción con pg_dump (SOLO LECTURA — no escribe nada en prod)');
{
  const r = run('pg_dump', ['-Fc', '--no-owner', '--no-privileges', '-f', DUMP, PROD_URL]);
  if (r.code !== 0) fail('pg_dump de producción falló.', r.err);
  const size = fs.existsSync(DUMP) ? fs.statSync(DUMP).size : 0;
  if (size < 1024) fail('El backup quedó vacío o demasiado pequeño.', `tamaño=${size} bytes`);
  ok(`Backup creado (${(size / 1048576).toFixed(1)} MB): ${DUMP}`);
}

// ── 3. Crear/recrear la copia y restaurar ──────────────────────────────────────
step('Crear la BD copia (idempotente) y restaurar el backup ahí');
{
  // DROP + CREATE contra la BD de mantenimiento del servidor de PRUEBA.
  let r = psql(STAGING_ADMIN_URL, `DROP DATABASE IF EXISTS "${COPY_DB_NAME}" WITH (FORCE);`);
  if (r.code !== 0) fail('No se pudo eliminar la copia previa (¿permiso o versión de PG < 13?).', r.err);
  r = psql(STAGING_ADMIN_URL, `CREATE DATABASE "${COPY_DB_NAME}";`);
  if (r.code !== 0) fail('No se pudo crear la BD copia (¿falta permiso CREATEDB?).', r.err);
  ok(`BD copia "${COPY_DB_NAME}" creada limpia`);

  // Restaurar (pg_restore puede emitir avisos benignos; validamos por conteo después).
  const rr = run('pg_restore', ['--no-owner', '--no-privileges', '-d', copyUrl, DUMP]);
  // Verificar que restauró tablas clave en vez de confiar en el exit code.
  const t = psql(copyUrl, `SELECT to_regclass('public."User"') IS NOT NULL AND to_regclass('public.chat_messages') IS NOT NULL;`);
  if (t.code !== 0 || t.out.trim() !== 't') {
    fail('La restauración no dejó las tablas esperadas en la copia.', (rr.err || '') + '\n' + (t.err || ''));
  }
  ok('Backup restaurado en la copia (tablas clave presentes)');
}

// ── 4. Generar el baseline 0_init desde el schema (no toca ninguna BD) ──────────
step('Generar 0_init con `prisma migrate diff --from-empty` (determinista, sin BD)');
const tmpPrismaDir = path.join(WORK, 'prisma');
const tmpSchema = path.join(tmpPrismaDir, 'schema.prisma');
const migDir = path.join(tmpPrismaDir, 'migrations');
const initDir = path.join(migDir, '0_init');
{
  fs.mkdirSync(initDir, { recursive: true });
  fs.copyFileSync(SCHEMA_SRC, tmpSchema);
  fs.writeFileSync(path.join(migDir, 'migration_lock.toml'),
    '# Please do not edit this file manually\nprovider = "postgresql"\n');
  const sqlPath = path.join(initDir, 'migration.sql');
  const envForPrisma = { DATABASE_URL: copyUrl, DIRECT_URL: copyUrl };
  const r = run('npx', ['--yes', 'prisma', 'migrate', 'diff', '--from-empty',
    '--to-schema-datamodel', tmpSchema, '--script'], { env: envForPrisma });
  if (r.code !== 0) fail('`prisma migrate diff` falló al generar el baseline.', r.err);
  fs.writeFileSync(sqlPath, r.out);
  if (!fs.readFileSync(sqlPath, 'utf8').trim()) fail('El baseline 0_init quedó vacío.');
  ok(`Baseline generado: ${sqlPath} (${r.out.split('\n').length} líneas)`);
  info('→ Este mismo 0_init es el que se commitea a la rama para el baseline real (paso e).');
}

// ── 5. Marcar el baseline como aplicado EN LA COPIA (no ejecuta DDL) ────────────
step('Marcar 0_init como aplicado en la COPIA (`migrate resolve --applied`)');
{
  const envForPrisma = { DATABASE_URL: copyUrl, DIRECT_URL: copyUrl };
  const r = run('npx', ['--yes', 'prisma', 'migrate', 'resolve', '--applied', '0_init',
    '--schema', tmpSchema], { env: envForPrisma });
  if (r.code !== 0) fail('`prisma migrate resolve --applied 0_init` falló en la copia.', r.err);
  ok('Baseline marcado como aplicado en la copia (no se ejecutó DDL)');
}

// ── 6. Verificar que `migrate deploy` es un no-op ──────────────────────────────
step('Verificar que `migrate deploy` en la copia NO aplica nada (cero DDL)');
{
  const envForPrisma = { DATABASE_URL: copyUrl, DIRECT_URL: copyUrl };
  const st = run('npx', ['--yes', 'prisma', 'migrate', 'status', '--schema', tmpSchema], { env: envForPrisma });
  const dep = run('npx', ['--yes', 'prisma', 'migrate', 'deploy', '--schema', tmpSchema], { env: envForPrisma });
  const text = (st.out + '\n' + dep.out).toLowerCase();
  const noPending = /no pending migrations/.test(text) || /no hay migraciones pendientes/.test(text)
    || /already in sync|up to date|base de datos.*al día/.test(text);
  if (dep.code !== 0) fail('`prisma migrate deploy` devolvió error en la copia.', dep.err);
  if (!noPending) fail('`migrate deploy` NO fue un no-op: habría DDL pendiente. Revisar drift.',
    st.out + '\n' + dep.out);
  ok('`migrate deploy` es un no-op (sin migraciones pendientes)');
}

// ── 7. Verificar objetos protegidos ────────────────────────────────────────────
step('Verificar que los objetos protegidos siguen existiendo en la copia');
{
  const checks = [
    ['columna chat_messages.deleted',
      `SELECT count(*) FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='deleted';`, '1'],
    ['columna chat_conversations.lastMessageDeleted',
      `SELECT count(*) FROM information_schema.columns WHERE table_name='chat_conversations' AND column_name='lastMessageDeleted';`, '1'],
    ['tabla chat_lid_map',
      `SELECT (to_regclass('public.chat_lid_map') IS NOT NULL)::int;`, '1'],
    ['tabla ia_credit_alerts',
      `SELECT (to_regclass('public.ia_credit_alerts') IS NOT NULL)::int;`, '1'],
    ['índice Session_userId_instanceId_remoteJid_key',
      `SELECT count(*) FROM pg_indexes WHERE indexname='Session_userId_instanceId_remoteJid_key';`, '1'],
  ];
  let allOk = true;
  for (const [label, sql, expected] of checks) {
    const r = psql(copyUrl, sql);
    const val = (r.out || '').trim();
    if (r.code !== 0) { console.log(`${RED}  ✗ ${label}: error de consulta${RESET}`); allOk = false; continue; }
    if (val === expected) info(`${GREEN}✔${RESET} ${label}`);
    else { console.log(`${RED}  ✗ ${label}: esperado ${expected}, obtenido "${val}"${RESET}`); allOk = false; }
  }
  if (!allOk) fail('Al menos un objeto protegido NO sobrevivió en la copia.');
  ok('Todos los objetos protegidos siguen presentes');
}

// ── Limpieza ───────────────────────────────────────────────────────────────────
step('Limpieza');
{
  try { fs.rmSync(WORK, { recursive: true, force: true }); } catch {}
  if (!KEEP_COPY) {
    const r = psql(STAGING_ADMIN_URL, `DROP DATABASE IF EXISTS "${COPY_DB_NAME}" WITH (FORCE);`);
    if (r.code === 0) ok(`BD copia "${COPY_DB_NAME}" eliminada (usa KEEP_COPY=1 para conservarla)`);
    else info(`(No se pudo eliminar la copia automáticamente; hazlo a mano si quieres: DROP DATABASE "${COPY_DB_NAME}")`);
  } else {
    ok(`BD copia "${COPY_DB_NAME}" conservada (KEEP_COPY=1)`);
  }
}

console.log(`\n${GREEN}${BOLD}✔ DRY-RUN COMPLETO: el baseline es seguro sobre la copia.${RESET}`);
console.log(`${BOLD}Producción NO fue modificada.${RESET} Siguiente paso (humano con acceso de escritura):`);
console.log(`  - Repetir SOLO el baseline contra producción (paso e del runbook):`);
console.log(`      DATABASE_URL="$DIRECT_URL_PROD" npx prisma migrate resolve --applied 0_init`);
console.log(`  - Commitear prisma/migrations/0_init a la rama y recién ahí mergear el PR #18.`);
