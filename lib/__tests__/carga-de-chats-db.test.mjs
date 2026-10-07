/**
 * Abrir Chats NO espera a crear las fichas que faltan. Contra Postgres, con el
 * esquema real y las funciones de produccion.
 *
 * # El fallo
 *
 * La pagina de Chats espera, en su `Promise.all`, a las preferencias de la
 * bandeja (`getChatConversationPreferencesForAssociatedAccounts`). Y esas
 * esperaban a `crearFichasQueFaltan`: una consulta que en produccion llego a
 * tardar 3-5 minutos en las cuentas grandes y crecia cada dia. Mientras, la
 * lista se quedaba en «Cargando conversaciones».
 *
 * Aqui se reproduce sin cuentas grandes: se coge `chats_eliminados` (la lapida
 * que esa consulta lee) con un candado desde otra conexion, como lo tendria una
 * consulta lenta. Con el codigo de antes, abrir la bandeja se queda esperando;
 * con el de ahora contesta al momento y las fichas se crean de fondo en cuanto
 * se suelta el candado.
 *
 * `MODO=roto` empaqueta este mismo fichero contra un commit pinchado y AFIRMA
 * el fallo. Se levanta con `scripts/banco-carga-de-chats.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import {
  ponerAQuienMira,
  getChatConversationPreferencesForAssociatedAccounts,
  deleteSession,
  persistChatMessage,
  db,
} from "./.compilado/carga/entrada-de-eliminados.js";

const ROTO = process.env.MODO === "roto";
const VUELTA = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PLAZO_DE_LA_BANDEJA_MS = 5000;
const dormir = (ms) => new Promise((listo) => setTimeout(listo, ms));

let cuantas = 0;
async function cuenta(sufijo) {
  const id = `carga-${sufijo}-${VUELTA}`;
  await db.user.create({ data: { id, email: `${id}@banco.test`, name: `Cuenta ${sufijo}`, role: "user" } });
  return id;
}
async function linea(userId, sufijo) {
  const nombre = `${sufijo}_${VUELTA}`;
  await db.instancia.create({
    data: { userId, instanceName: nombre, instanceId: `i-${sufijo}-${VUELTA}`, instanceType: "waha" },
  });
  return nombre;
}
function contacto() {
  cuantas += 1;
  return `5731${String(cuantas).padStart(4, "0")}${String(Date.now()).slice(-4)}@s.whatsapp.net`;
}
async function mensaje(userId, nombreLinea, jid) {
  cuantas += 1;
  await persistChatMessage({
    userId,
    instanceName: nombreLinea,
    instanceType: "waha",
    remoteJid: jid,
    remoteJidAlt: null,
    messageId: `CARGA${cuantas}${VUELTA.replace(/-/g, "")}`,
    fromMe: false,
    pushName: "Cliente de prueba",
    messageType: "conversation",
    content: "hola",
    raw: { message: { conversation: "hola" } },
    messageTimestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
  });
}
function actuarComo(userId) {
  ponerAQuienMira({ id: userId, role: "user", ownerId: null, advisorRole: null });
}

/** Otra conexion que coge la lapida, como una consulta lenta. */
function cogerLaLapida() {
  const psql = spawn("psql", [process.env.DATABASE_URL, "-q", "-v", "ON_ERROR_STOP=1"], {
    stdio: ["pipe", "ignore", "inherit"],
  });
  psql.stdin.write('BEGIN; LOCK TABLE "chats_eliminados" IN ACCESS EXCLUSIVE MODE; SELECT 1;\n');
  return {
    soltar() {
      return new Promise((listo) => {
        psql.on("exit", listo);
        psql.stdin.end("COMMIT;\n");
      });
    },
  };
}

/** Lo que tarda en contestar la bandeja, o `null` si pasa del plazo. */
async function abrirLaBandeja() {
  const t0 = Date.now();
  const respuesta = getChatConversationPreferencesForAssociatedAccounts();
  const r = await Promise.race([respuesta, dormir(PLAZO_DE_LA_BANDEJA_MS).then(() => null)]);
  return { r, ms: Date.now() - t0, respuesta };
}

async function fichasDe(userId, nombreLinea) {
  return db.session.findMany({ where: { instanceId: nombreLinea }, select: { userId: true, remoteJid: true } });
}

test.before(async () => {
  // La lapida tiene que existir antes de cogerla: la crea su propio modulo la
  // primera vez que se usa.
  const P = await cuenta("cebo");
  actuarComo(P);
  await getChatConversationPreferencesForAssociatedAccounts();
  for (let i = 0; i < 50; i++) {
    const [t] = await db.$queryRaw`SELECT to_regclass('"chats_eliminados"')::text AS t`;
    if (t.t) break;
    await dormir(200);
  }
});

test("1. con la revision de fichas atascada, la bandeja contesta igual", async () => {
  const A = await cuenta("atascada");
  const L = await linea(A, "ATASCADA");
  const jids = [contacto(), contacto(), contacto()];
  for (const j of jids) await mensaje(A, L, j);
  // Las conversaciones se quedan sin ficha, como las que entraron por Waha.
  await db.session.deleteMany({ where: { instanceId: L } });
  assert.equal((await fichasDe(A, L)).length, 0);

  actuarComo(A);
  const candado = cogerLaLapida();
  await dormir(500);
  const { r, ms, respuesta } = await abrirLaBandeja();

  if (ROTO) {
    assert.equal(r, null, `ANTES: la bandeja esperaba a la revision de fichas (contesto en ${ms} ms)`);
    await candado.soltar();
    await respuesta;
    return;
  }
  assert.ok(r, `la bandeja tiene que contestar sin esperar (paso de ${PLAZO_DE_LA_BANDEJA_MS} ms)`);
  assert.equal(r.success, true, r.message);

  // Y las fichas se crean de fondo en cuanto se suelta el candado.
  await candado.soltar();
  let fichas = [];
  for (let i = 0; i < 50; i++) {
    fichas = await fichasDe(A, L);
    if (fichas.length >= jids.length) break;
    await dormir(200);
  }
  assert.equal(fichas.length, jids.length, "cada conversacion recupera su ficha, sin repetidas");
  assert.ok(fichas.every((f) => f.userId === A), "la ficha es de la cuenta duena de la linea");
  assert.deepEqual(fichas.map((f) => f.remoteJid).sort(), [...jids].sort());
});

test("2. un lead eliminado no vuelve con la revision de fondo", async () => {
  const B = await cuenta("lapida");
  const L = await linea(B, "LAPIDA");
  const vivo = contacto();
  const borrado = contacto();
  await mensaje(B, L, vivo);
  await mensaje(B, L, borrado);
  actuarComo(B);
  const ficha = await db.session.findFirst({ where: { instanceId: L, remoteJid: borrado } });
  const d = await deleteSession(B, ficha.id, borrado);
  assert.equal(d.success, true, d.message);
  await db.session.deleteMany({ where: { instanceId: L, remoteJid: vivo } });

  const r = await getChatConversationPreferencesForAssociatedAccounts();
  assert.equal(r.success, true, r.message);
  let fichas = [];
  for (let i = 0; i < 50; i++) {
    fichas = await fichasDe(B, L);
    if (fichas.length) break;
    await dormir(200);
  }
  await dormir(1000);
  fichas = await fichasDe(B, L);
  assert.deepEqual(fichas.map((f) => f.remoteJid), [vivo], "vuelve la que faltaba y no la eliminada");
});

test.after(async () => {
  await db.$disconnect();
});
