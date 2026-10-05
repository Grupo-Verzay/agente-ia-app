/**
 * Bloquear y silenciar una conversación de Chats: las reglas, un barrido de la
 * pantalla y la tabla contra Postgres.
 *
 * `MODO=roto` lee los ficheros de ANTES_REF (pinchado a un commit, nunca
 * origin/main) y AFIRMA que no existía nada de esto.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF || "9c0e76d";
const leer = (ruta) =>
  ROTO
    ? (() => { try { return execSync(`git show ${ANTES}:"${ruta}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } })()
    : readFileSync(ruta, "utf8");
const C = "app/(root)/chats/_components";

if (ROTO) {
  test("ANTES: no había bloqueo ni silencio en ninguna parte", () => {
    assert.equal(leer("lib/bloqueo-y-silencio.ts"), "", "el módulo no existía");
    const barra = leer(`${C}/ChatTabBar.tsx`);
    assert.ok(barra.includes("Eliminar por fecha"), "el menú sí existía");
    assert.ok(!barra.includes("Bloqueados") && !barra.includes("Silenciados"), "sin los dos estados");
    assert.ok(!leer(`${C}/lo-que-ve-todos.ts`).includes("bloqueada"), "Todos no sabía de bloqueadas");
    assert.ok(!leer("hooks/chats/useAdvisorNotifications.ts").includes("callado"), "el aviso no se podía callar");
  });
} else {
  const m = await import("./.compilado/bloqueo-y-silencio/entrada-de-bloqueo-y-silencio.js");
  const CUENTA = "cta", LINEA = "VENTAS";
  const llave = (jid, linea = LINEA) => m.chatPreferenceKey(CUENTA, linea, jid);
  const marca = (extra = {}) => ({ instanceName: LINEA, remoteJid: "57300@s.whatsapp.net", bloqueadoEn: null, silenciadoEn: null, updatedAt: "2026-10-01T00:00:00.000Z", ...extra });

  test("sin marca, ni bloqueada ni silenciada", () => {
    assert.deepEqual(m.elEstadoDelChat({}, CUENTA, LINEA, ["57300@s.whatsapp.net"]), m.SIN_BLOQUEO);
    assert.deepEqual(m.elEstadoDelChat(undefined, CUENTA, LINEA, ["x"]), m.SIN_BLOQUEO);
  });

  test("la marca se encuentra por CUALQUIERA de las identidades", () => {
    const mapa = { [llave("123@lid")]: marca({ remoteJid: "123@lid", bloqueadoEn: "2026-10-01T00:00:00.000Z" }) };
    const e = m.elEstadoDelChat(mapa, CUENTA, LINEA, ["57300@s.whatsapp.net", "123@lid"]);
    assert.equal(e.bloqueado, true);
    assert.equal(e.silenciado, false);
  });

  test("bloquear no toca el silencio, y al revés", () => {
    assert.deepEqual(Object.keys(m.elCambio("bloqueo", true)), ["bloqueadoEn"]);
    assert.deepEqual(Object.keys(m.elCambio("silencio", false)), ["silenciadoEn"]);
    assert.equal(m.elCambio("silencio", false).silenciadoEn, null);
    let mapa = m.conLaMarca({}, [llave("a")], "silencio", true, { instanceName: LINEA, remoteJid: "a" });
    mapa = m.conLaMarca(mapa, [llave("a")], "bloqueo", true, { instanceName: LINEA, remoteJid: "a" });
    mapa = m.conLaMarca(mapa, [llave("a")], "bloqueo", false, { instanceName: LINEA, remoteJid: "a" });
    const e = m.elEstadoDelChat(mapa, CUENTA, LINEA, ["a"]);
    assert.deepEqual(e, { bloqueado: false, silenciado: true });
  });

  test("conLaMarca pone la marca bajo TODAS las llaves", () => {
    const mapa = m.conLaMarca({}, [llave("a"), llave("b")], "bloqueo", true, { instanceName: LINEA, remoteJid: "a" });
    assert.ok(mapa[llave("a")].bloqueadoEn && mapa[llave("b")].bloqueadoEn);
  });

  test("manda la marca de SU línea", () => {
    const mapa = {
      [llave("a", "")]: marca({ instanceName: "", remoteJid: "a", bloqueadoEn: "2026-09-01T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z" }),
      [llave("a")]: marca({ remoteJid: "a", bloqueadoEn: null }),
    };
    assert.equal(m.elEstadoDelChat(mapa, CUENTA, LINEA, ["a"]).bloqueado, false);
  });

  test("barrido: el menú agrupa Bloqueados y Silenciados, y «Eliminar por fecha» va el último", () => {
    const barra = leer(`${C}/ChatTabBar.tsx`);
    // El rótulo que se pinta (en su propia línea), no la palabra de un comentario.
    const rotulo = (t) => barra.search(new RegExp(`\\n\\s*${t}\\n`));
    const iArch = rotulo("Archivados"), iRes = rotulo("Resueltos");
    const iBlo = rotulo("Bloqueados"), iSil = rotulo("Silenciados");
    const iEli = barra.indexOf("Eliminar por fecha");
    assert.ok(iArch > 0 && iRes > 0 && iBlo > iRes && iSil > iBlo && iEli > iSil, "orden del menú");
    const entre = (a, b) => barra.slice(a, b).includes("border-t border-border/50");
    assert.ok(entre(iRes, iBlo), "una raya antes del grupo nuevo");
    assert.ok(!entre(iBlo, iSil), "Bloqueados y Silenciados, juntos");
    assert.ok(entre(iSil, iEli), "una raya antes de «Eliminar por fecha»");
  });

  test("barrido: bloqueada sale de Todos, silenciada no avisa, y nada lo levanta solo", () => {
    assert.match(leer(`${C}/lo-que-ve-todos.ts`), /activa: [^\n]*!bloqueada/);
    assert.match(leer("lib/conteo-de-todos.server.ts"), /bloqueada:/);
    const cliente = leer(`${C}/chats-client.tsx`);
    assert.match(cliente, /bloqueada: \(chat\) => estadoDeBloqueo\(chat\)\.bloqueado/);
    assert.match(cliente, /setChatBlockedAction/);
    assert.match(cliente, /setChatMutedAction/);
    assert.match(leer("hooks/chats/useAdvisorNotifications.ts"), /callado/);
    assert.match(leer(`${C}/chat-sidebar.tsx`), /!c\.isMuted && c\.isUnreadLocal/);
    // Bloquear no se levanta solo: ningún sitio limpia `bloqueadoEn` salvo la acción.
    for (const ruta of ["actions/chat-conversation-actions.ts", "lib/bloqueo-y-silencio-db.ts"]) {
      assert.ok(!/bloqueadoEn"?\s*=\s*NULL/i.test(leer(ruta)), `${ruta} no puede limpiar el bloqueo por su cuenta`);
    }
  });

  const PG = Boolean(process.env.DATABASE_URL);
  test("contra Postgres: se escribe bajo todas las identidades y se lee igual", { skip: !PG }, async () => {
    const V = `${Date.now()}`;
    const cuenta = `bs-${V}`, linea = `L_${V}`;
    const ids = [`57300${V.slice(-6)}@s.whatsapp.net`, `9${V.slice(-8)}@lid`];
    const filas = await m.escribirLaMarca(cuenta, linea, ids, "bloqueadoEn", new Date());
    assert.equal(filas.length, 2);
    await m.escribirLaMarca(cuenta, linea, ids, "silenciadoEn", new Date());
    let mapa = await m.leerLosBloqueos([cuenta]);
    for (const jid of ids) {
      const e = m.elEstadoDelChat(mapa, cuenta, linea, [jid]);
      assert.deepEqual(e, { bloqueado: true, silenciado: true }, jid);
    }
    await m.escribirLaMarca(cuenta, linea, ids, "bloqueadoEn", null);
    mapa = await m.leerLosBloqueos([cuenta]);
    assert.deepEqual(m.elEstadoDelChat(mapa, cuenta, linea, [ids[1]]), { bloqueado: false, silenciado: true }, "desbloquear no quita el silencio");
    assert.deepEqual(await m.leerLosBloqueos([`otra-${V}`]), {}, "otra cuenta no ve nada");
    await m.db.$executeRaw`DELETE FROM "chat_bloqueo_silencio" WHERE "userId" = ${cuenta}`;
    await m.db.$disconnect();
  });
}
