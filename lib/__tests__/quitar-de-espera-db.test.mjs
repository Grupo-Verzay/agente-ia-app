/**
 * «Quitar de espera»: apagar el sello de «En espera» sin tocar nada mas.
 * Contra Postgres, con el esquema real y las funciones de PRODUCCION.
 *
 * # Lo que hacia falta
 *
 * La marca `Session.escalated_at` dice «esto espera a una persona». Hoy solo se
 * apaga al TOMAR, al RESOLVER o al DEVOLVER A LA IA, y los tres cambian algo mas
 * (el asignado, el estado, la IA). Cuando la IA sigue atendiendo bien y ya no
 * hay nada que esperar, ninguno corresponde: no se quiere asignar a nadie ni
 * cerrar la conversacion. Faltaba una accion que apagara SOLO ese sello.
 *
 * # Los casos
 *
 *  1. Quitar de espera con la IA encendida: el sello se va, el conteo de «En
 *     espera» baja, y el asignado, el estado y la IA no cambian.
 *  2. Un motivo nuevo (el backend, cuando el cliente vuelve a pedir un humano)
 *     vuelve a encender la marca con normalidad: la accion no dejo nada puesto
 *     que lo impida.
 *  3. Sin permiso —una cuenta que no alcanza esa sesion— no se quita el sello y
 *     se contesta «No autorizado».
 *
 * # Los dos modos
 *
 * `MODO=roto` no llama a la accion nueva: llama a `resolveSession`, que es el
 * camino que EXISTIA para bajar el sello. El banco afirma el fallo que hacia
 * falta arreglar: ese camino apaga tambien la IA (`status = false`) y marca la
 * conversacion como resuelta (`resolved_at`), o sea que no se puede sacar de
 * espera «con la IA encendida». Sin ese modo, lo verde del bueno no diria si la
 * accion nueva de verdad conserva el estado o si el caso no se ejerce.
 *
 * Se levanta con `scripts/banco-quitar-de-espera.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ponerAQuienMira,
  quitarDeEsperaAction,
  resolveSession,
  obtenerEscaladasDeCuentas,
  db,
} from "./.compilado/espera/entrada-de-espera.js";

const ROTO = process.env.MODO === "roto";
const VUELTA = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** El id de la base se reutiliza entre corridas: cada cuenta lleva el sello de la vuelta. */
function idCuenta(nombre) {
  return `espera-${nombre}-${VUELTA}`;
}

async function crearCuenta(id) {
  // Por el cliente de Prisma, no en crudo: hay columnas NOT NULL cuyo valor por
  // defecto lo pone Prisma en el cliente (no la base), asi que un INSERT pelado
  // se cae con 23502.
  await db.user.create({ data: { id, email: `${id}@banco.test` } }).catch(() => {});
}

/**
 * Una sesion escalada y con la IA ATENDIENDO BIEN: sin asesor, encendida y sin
 * pausar. Es el caso del encargo —la IA sigue y ya no hay nada que esperar—.
 *
 * La fila se crea por Prisma (mismos defaults que produccion) y el sello se
 * pone aparte con SQL en crudo, porque `escalated_at` no esta en `schema.prisma`.
 */
async function crearSesionEnEspera(ownerId, remoteJid) {
  const sesion = await db.session.create({
    data: {
      userId: ownerId,
      remoteJid,
      pushName: "Cliente",
      instanceId: "linea-espera",
      status: true,
      agentDisabled: false,
    },
    select: { id: true },
  });
  await db.$executeRaw`UPDATE "Session" SET escalated_at = NOW() WHERE "id" = ${sesion.id}`;
  return sesion.id;
}

async function leerFila(sessionId) {
  const filas = await db.$queryRaw`
    SELECT "status", "agentDisabled",
           assigned_advisor_id AS "assignedAdvisorId",
           escalated_at        AS "escalatedAt",
           resolved_at         AS "resolvedAt"
    FROM "Session" WHERE "id" = ${sessionId} LIMIT 1
  `;
  return filas[0];
}

/** Cuantas de estas sesiones siguen en «En espera» (lo que cuenta la bandeja). */
async function enEspera(ownerId, sessionId) {
  const mapa = await obtenerEscaladasDeCuentas([ownerId]);
  return mapa.has(sessionId);
}

test("quitar de espera con la IA encendida: baja el sello y el conteo, sin tocar asignado ni estado", async (t) => {
  const owner = idCuenta("owner1");
  await crearCuenta(owner);
  const sessionId = await crearSesionEnEspera(owner, `57300${Date.now() % 1000000}@s.whatsapp.net`);

  // Manda el dueño de la cuenta: alcanza su propia sesion (misma puerta que
  // resolver y reabrir). `ownerId: null` => es la cuenta, no un agente.
  ponerAQuienMira({ id: owner, ownerId: null, advisorRole: null, sessionUserId: owner });

  // Antes: esta sesion cuenta en «En espera».
  assert.equal(await enEspera(owner, sessionId), true, "de partida la sesion esta en espera");

  const res = ROTO ? await resolveSession(sessionId) : await quitarDeEsperaAction(sessionId);
  assert.equal(res.success, true, `la accion tiene que funcionar: ${JSON.stringify(res)}`);

  const fila = await leerFila(sessionId);
  t.diagnostic(
    `${ROTO ? "resolveSession (viejo)" : "quitarDeEsperaAction"}: ` +
      `escalatedAt=${fila.escalatedAt}, status=${fila.status}, agentDisabled=${fila.agentDisabled}, ` +
      `assignedAdvisorId=${fila.assignedAdvisorId}, resolvedAt=${fila.resolvedAt}`,
  );

  // Los dos caminos bajan el sello: el conteo de «En espera» baja.
  assert.equal(fila.escalatedAt, null, "el sello de espera se apago");
  assert.equal(await enEspera(owner, sessionId), false, "el conteo de «En espera» baja");
  // Y ninguno toca el asignado.
  assert.equal(fila.assignedAdvisorId, null, "no se asigna a nadie");

  if (ROTO) {
    // EL FALLO que hacia falta arreglar: el unico camino que existia para bajar
    // el sello apagaba tambien la IA y cerraba la conversacion. Asi no se podia
    // «quitar de espera con la IA encendida».
    assert.equal(fila.status, false, "resolveSession apaga la IA (status=false): por eso hacia falta la accion nueva");
    assert.notEqual(fila.resolvedAt, null, "resolveSession marca la conversacion como resuelta");
    return;
  }

  // Lo nuevo: apaga SOLO el sello. La IA sigue encendida y la conversacion no
  // se cierra ni se pausa.
  assert.equal(fila.status, true, "la IA sigue encendida (status)");
  assert.equal(fila.agentDisabled, false, "la IA no se apago (agentDisabled)");
  assert.equal(fila.resolvedAt, null, "la conversacion no se marca como resuelta");
});

test("un motivo nuevo vuelve a encender la marca con normalidad", async (t) => {
  if (ROTO) {
    t.skip("el motivo nuevo solo se prueba en el modo bueno: es la accion nueva la que no deja nada puesto");
    return;
  }
  const owner = idCuenta("owner2");
  await crearCuenta(owner);
  const sessionId = await crearSesionEnEspera(owner, `57301${Date.now() % 1000000}@s.whatsapp.net`);
  ponerAQuienMira({ id: owner, ownerId: null, advisorRole: null, sessionUserId: owner });

  const res = await quitarDeEsperaAction(sessionId);
  assert.equal(res.success, true, "se quita de espera");
  assert.equal(await enEspera(owner, sessionId), false, "queda fuera de «En espera»");

  // El backend vuelve a escalar cuando el cliente pide otra vez un humano: es
  // un `UPDATE escalated_at = NOW()`, que es justo lo que hace el backend. La
  // accion nueva no dejo nada que lo impida.
  await db.$executeRaw`UPDATE "Session" SET escalated_at = NOW() WHERE "id" = ${sessionId}`;

  const fila = await leerFila(sessionId);
  assert.notEqual(fila.escalatedAt, null, "la marca se vuelve a encender");
  assert.equal(await enEspera(owner, sessionId), true, "vuelve a contar en «En espera»");
});

test("sin permiso no se quita el sello", async (t) => {
  if (ROTO) {
    t.skip("la puerta es la misma en las dos: se prueba una vez, en el modo bueno");
    return;
  }
  const owner = idCuenta("owner3");
  const ajeno = idCuenta("ajeno3");
  await crearCuenta(owner);
  await crearCuenta(ajeno);
  const sessionId = await crearSesionEnEspera(owner, `57302${Date.now() % 1000000}@s.whatsapp.net`);

  // Una cuenta que NO alcanza esa sesion (ni es su dueña, ni esta vinculada, ni
  // es la asesora asignada).
  ponerAQuienMira({ id: ajeno, ownerId: null, advisorRole: null, sessionUserId: ajeno });

  const res = await quitarDeEsperaAction(sessionId);
  assert.equal(res.success, false, "una cuenta ajena no puede quitar de espera");
  assert.match(res.message ?? "", /No autorizado/i, "lo dice");

  const fila = await leerFila(sessionId);
  assert.notEqual(fila.escalatedAt, null, "el sello sigue puesto: no lo toco quien no debia");
});
