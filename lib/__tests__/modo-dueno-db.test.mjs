/**
 * Modo Dueño, Fase 0: las cinco reglas de gobernanza, contra Postgres y con
 * las rutas `/api/owner/*` DE VERDAD (las que llama el backend).
 *
 * Una cuenta con Modo Dueño y una persona autorizada (Ana), un lead (Juan) y
 * los módulos del menú. Se le habla a la App como el backend: con la clave y
 * el número de quien escribe.
 *
 * `MODO=roto` empaqueta las rutas del commit de ANTES (`ANTES_REF`) y AFIRMA
 * los huecos: la tarea se creaba al pedirla, mover un lead fallaba siempre,
 * los candados del plan no contaban, otro país pasaba por el dueño y
 * restaurar una versión no cambiaba lo que el agente lee.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
  ROTO
    ? "./.compilado/modo-dueno-antes/entrada-del-modo-dueno-antes.js"
    : "./.compilado/modo-dueno/entrada-del-modo-dueno.js"
);
const { db, ponerLaSesion } = m;
const t = ROTO ? test.skip : test;
const antes = ROTO ? test : test.skip;

process.env.OWNER_COMMANDS_KEY = "banco";

const V = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const A = `md-cuenta-${V}`;
const B = `md-ajena-${V}`;
const ANA = "573001234567";
const JUAN = `57311${String(Date.now()).slice(-7)}`;
const ASESORA = `md-asesora-${V}`;
const RUTAS = ["/tareas", "/schedule", "/crm/kanban", "/chats", "/tags", "/equipo", "/ia"];
let SESION, PROMPT;
const MODULOS = new Map();

const SECCIONES = {
  business: { nombre: "A", sector: "", ubicacion: "", horarios: "", telefono: "", email: "", sitio: "", facebook: "", instagram: "", tiktok: "", youtube: "", linkedin: "", twitter: "", telegram: "", notas: "" },
  training: { steps: [] },
  faq: { items: [] },
  products: { items: [] },
  extras: { firmaEnabled: false, firmaText: "", firmaName: "", items: [] },
  management: { items: [] },
};

async function pedir(ruta, cuerpo, telefono = ANA) {
  const res = await ruta(
    new Request("http://localhost/api/owner/x", {
      method: "POST",
      headers: { authorization: "Bearer banco", "content-type": "application/json" },
      body: JSON.stringify({ userId: A, ownerPhone: telefono, ...cuerpo }),
    }),
  );
  return { status: res.status, json: await res.json() };
}
const decir = (texto, extra = {}) => pedir(m.turno, { texto, ...extra });
const tareas = () => db.task.count({ where: { ownerId: A } });
const estado = async () => (await db.session.findUnique({ where: { id: SESION } })).leadStatus;
const bitacora = (where = "") =>
  db.$queryRawUnsafe(`SELECT * FROM owner_acciones WHERE cuenta_id = $1 ${where} ORDER BY creada_en DESC`, A);
const bloquear = (ruta, si = true) =>
  db.module.update({ where: { id: MODULOS.get(ruta) }, data: { lockedPlans: si ? ["basico"] : [] } });

test.before(async () => {
  for (const [id, nombre] of [[A, "Cuenta A"], [B, "Cuenta B"]]) {
    await db.user.create({
      data: {
        id,
        email: `${id}@banco.test`,
        name: nombre,
        plan: "basico",
        ownerModeEnabled: true,
        ownerModePhone: JSON.stringify([{ name: "Ana", phone: ANA, role: "Dueña" }]),
      },
    });
  }
  await db.user.create({ data: { id: ASESORA, email: `${ASESORA}@banco.test`, name: `Rosa ${V}`, ownerId: A, advisorRole: "agente" } });
  for (const route of RUTAS) {
    const ya = await db.module.findFirst({ where: { route } });
    const mod = ya ?? (await db.module.create({ data: { label: route, route, icon: "x", allowedPlans: [], lockedPlans: [] } }));
    MODULOS.set(route, mod.id);
  }
  SESION = (
    await db.session.create({
      data: { userId: A, remoteJid: `${JUAN}@s.whatsapp.net`, pushName: "Juan", instanceId: `L-${V}`, status: true, leadStatus: "FRIO" },
    })
  ).id;
  PROMPT = (
    await db.agentPrompt.create({
      data: { userId: A, agentId: "system-prompt-ai", status: "published", sections: SECCIONES, promptText: "texto NUEVO", businessName: "A" },
    })
  ).id;
  await db.agentPromptRevision.create({
    data: { promptId: PROMPT, revisionNumber: 1, sectionsSnapshot: SECCIONES, promptTextSnapshot: "texto viejo", publishedBy: A },
  });
});

test.after(async () => {
  await db.$executeRawUnsafe(`DELETE FROM owner_acciones WHERE cuenta_id = ANY($1::text[])`, [A, B]).catch(() => {});
  await db.$executeRawUnsafe(`DELETE FROM owner_identidad WHERE cuenta_id = ANY($1::text[])`, [A, B]).catch(() => {});
  await db.$executeRawUnsafe(`DELETE FROM audit_logs WHERE user_id = ANY($1::text[])`, [A, B]).catch(() => {});
  await db.task.deleteMany({ where: { ownerId: A } });
  await db.agentPromptRevision.deleteMany({ where: { promptId: PROMPT } });
  await db.agentPrompt.deleteMany({ where: { id: PROMPT } });
  await db.session.deleteMany({ where: { userId: A } });
  await db.tag.deleteMany({ where: { userId: A } });
  await db.user.deleteMany({ where: { id: { in: [ASESORA, A, B] } } });
  await db.$disconnect();
});

// ── Lo de ANTES ─────────────────────────────────────────────────────────────

antes("ANTES: la tarea se CREABA al pedirla, sin confirmación de nadie", async () => {
  const r = await pedir(m.tarea, { title: "Sin confirmar", dueDate: "2026-12-01T15:00:00Z" });
  assert.equal(r.status, 201);
  assert.equal(await tareas(), 1);
});

antes("ANTES: mover un lead desde el Modo Dueño fallaba SIEMPRE (pedía sesión)", async () => {
  const r = await pedir(m.estadoDelLead, { sessionId: SESION, status: "CALIENTE", confirmed: true });
  assert.equal(r.status, 502);
  assert.equal(await estado(), "FRIO");
});

antes("ANTES: los candados del plan no contaban", async () => {
  await bloquear("/tareas");
  const r = await pedir(m.tarea, { title: "Fuera del plan", dueDate: "2026-12-01T15:00:00Z" });
  await bloquear("/tareas", false);
  assert.equal(r.status, 201);
});

antes("ANTES: un número de OTRO país con la misma cola pasaba por el dueño", async () => {
  assert.equal(m.phonesMatch("523001234567", ANA), true);
});

antes("ANTES: restaurar una versión NO cambiaba lo que el agente lee", async () => {
  ponerLaSesion(A);
  const r = await m.restoreRevision({ promptId: PROMPT, revisionNumber: 1 });
  assert.equal(r.ok, true);
  const p = await db.agentPrompt.findUnique({ where: { id: PROMPT } });
  assert.equal(p.promptText, "texto NUEVO");
  assert.equal(p.status, "draft");
});

// ── Identidad: número exacto + código ───────────────────────────────────────

t("otro país con la misma cola NO pasa", async () => {
  const r = await pedir(m.resumen, {}, "523001234567");
  assert.equal(r.status, 403);
});

t("sin verificar: consulta sí, cambio NO (y queda en la bitácora)", async () => {
  assert.equal((await pedir(m.resumen, { pedido: "¿cómo voy hoy?" })).status, 200);
  const r = await pedir(m.tarea, { title: "x", dueDate: "2026-12-01T15:00:00Z", pedido: "créame x" });
  assert.equal(r.status, 403);
  assert.equal(r.json.requiereVerificacion, true);
  assert.equal(await tareas(), 0);
  const [rechazo, consulta] = await bitacora();
  assert.equal(rechazo.estado, "rechazada");
  assert.equal(rechazo.resultado.motivo, "sin_verificar");
  assert.equal(rechazo.pedido, "créame x");
  assert.equal(consulta.estado, "consulta");
  assert.equal(consulta.pedido, "¿cómo voy hoy?");
});

t("el código del panel lo genera solo quien alcanza la cuenta", async () => {
  ponerLaSesion(B);
  const ajeno = await m.generarCodigoDelDueno(A, ANA);
  assert.equal(ajeno.success, false);
  ponerLaSesion(A);
  const propio = await m.generarCodigoDelDueno(A, ANA);
  assert.equal(propio.success, true);
  assert.match(propio.codigo, /^\d{6}$/);
});

t("código equivocado no verifica; el bueno sí", async () => {
  const codigo = await m.generarCodigoDeVerificacion(A, ANA);
  const otro = codigo === "000000" ? "111111" : "000000";
  const mal = await decir(otro);
  assert.equal(mal.json.atendido, true);
  assert.match(mal.json.respuesta, /no es correcto/);
  const bien = await decir(codigo);
  assert.match(bien.json.respuesta, /verificado/);
});

t("un @lid (número oculto) queda atado a la persona del código", async () => {
  const codigo = await m.generarCodigoDeVerificacion(A, ANA);
  const lid = `9988${V}@lid`;
  const res = await m.lidConCodigo(
    new Request("http://localhost/api/owner/identity/lid", {
      method: "POST",
      headers: { authorization: "Bearer banco", "content-type": "application/json" },
      body: JSON.stringify({ userId: A, lid, texto: codigo }),
    }),
  );
  const json = await res.json();
  assert.equal(json.success, true);
  const [fila] = await db.$queryRawUnsafe(`SELECT lid, verificado_en FROM owner_identidad WHERE cuenta_id=$1 AND telefono=$2`, A, ANA);
  assert.equal(fila.lid, lid);
  assert.ok(fila.verificado_en);
});

// ── Confirmación persistente y estricta ─────────────────────────────────────

t("pedir una tarea la PREPARA; `confirmed: true` no ejecuta nada", async () => {
  const r = await pedir(m.tarea, { title: "Llamar a Juan", dueDate: "2026-12-01T15:00:00Z", confirmed: true });
  assert.equal(r.status, 202);
  assert.equal(r.json.pendiente, true);
  assert.match(r.json.confirmacion, /Por confirmar/);
  assert.match(r.json.confirmacion, /Llamar a Juan/);
  assert.equal(await tareas(), 0);
});

t("«ok pero a otro número» NO ejecuta: descarta y lo avisa", async () => {
  const r = await decir("ok pero a otro número");
  assert.equal(r.json.atendido, false);
  assert.match(r.json.aviso, /Descarté/);
  assert.match(r.json.contexto, /DESCARTADA/);
  assert.equal(await tareas(), 0);
  const [fila] = await bitacora();
  assert.equal(fila.estado, "descartada");
  assert.equal(fila.respuesta, "ok pero a otro número");
});

t("«no» cancela", async () => {
  await pedir(m.tarea, { title: "Llamar a Juan", dueDate: "2026-12-01T15:00:00Z" });
  const r = await decir("no, gracias");
  assert.equal(r.json.atendido, true);
  assert.match(r.json.respuesta, /no lo hago/);
  assert.equal(await tareas(), 0);
});

t("un «sí» limpio ejecuta LO QUE SE MOSTRÓ, y la bitácora guarda quién, canal, pedido y respuesta", async () => {
  await pedir(m.tarea, {
    title: "Llamar a Juan",
    dueDate: "2026-12-01T15:00:00Z",
    canal: "whatsapp_audio",
    pedido: "recuérdame llamar a Juan el primero de diciembre",
  });
  const r = await decir("Sí, dale.");
  assert.equal(r.json.atendido, true);
  assert.match(r.json.respuesta, /Tarea creada/);
  assert.match(r.json.respuesta, /deshaz [0-9a-f]{8}/);
  assert.equal(await tareas(), 1);
  const [fila] = await bitacora();
  assert.equal(fila.estado, "ejecutada");
  assert.equal(fila.persona_nombre, "Ana");
  assert.equal(fila.persona_telefono, ANA);
  assert.equal(fila.canal, "whatsapp_audio");
  assert.equal(fila.pedido, "recuérdame llamar a Juan el primero de diciembre");
  assert.match(fila.resumen, /Llamar a Juan/);
  assert.equal(fila.respuesta, "Sí, dale.");
  assert.ok(fila.creada_en && fila.decidida_en && fila.ejecutada_en);
  assert.equal(fila.reversible, true);
});

t("un «sí» sin nada pendiente no hace nada", async () => {
  const r = await decir("sí");
  assert.equal(r.json.atendido, false);
});

t("la pendiente caduca: un «sí» tarde no ejecuta y lo dice", async () => {
  await pedir(m.tarea, { title: "Tarde", dueDate: "2026-12-01T15:00:00Z" });
  await db.$executeRawUnsafe(`UPDATE owner_acciones SET expira_en = now() - interval '1 minute' WHERE cuenta_id=$1 AND estado='pendiente'`, A);
  const r = await decir("sí");
  assert.match(r.json.respuesta, /caducó/);
  assert.equal(await tareas(), 1);
});

t("la pendiente vive en la base: la ve cualquier réplica", async () => {
  await pedir(m.tarea, { title: "Otra", dueDate: "2026-12-01T15:00:00Z" });
  const filas = await bitacora("AND estado = 'pendiente'");
  assert.equal(filas.length, 1);
  await decir("no");
});

// ── Los dos fallos y deshacer ───────────────────────────────────────────────

t("mover un lead ya funciona sin sesión, y se puede deshacer", async () => {
  const p = await pedir(m.estadoDelLead, { phone: JUAN, status: "CALIENTE" });
  assert.equal(p.status, 202);
  assert.match(p.json.confirmacion, /FRIO.*CALIENTE/s);
  await decir("sí");
  assert.equal(await estado(), "CALIENTE");

  const h = await pedir(m.historial, {});
  const linea = h.json.acciones.find((a) => /CALIENTE/.test(a.que));
  assert.equal(linea.deshacer, "se puede");
  const d = await pedir(m.deshacer, { accionId: linea.codigo });
  assert.equal(d.status, 202);
  assert.match(d.json.confirmacion, /DESHACER/);
  const r = await decir("sí");
  assert.match(r.json.respuesta, /FRIO/);
  assert.equal(await estado(), "FRIO");

  const otra = await pedir(m.deshacer, { accionId: linea.codigo });
  assert.equal(otra.status, 409, "no se deshace dos veces");
});

t("deshacer no pisa un cambio posterior", async () => {
  await pedir(m.estadoDelLead, { sessionId: SESION, status: "TIBIO" });
  await decir("sí");
  const [hecha] = await bitacora("AND estado='ejecutada' AND herramienta='owner_mover_lead'");
  await db.session.update({ where: { id: SESION }, data: { leadStatus: "FINALIZADO" } });
  await pedir(m.deshacer, { accionId: hecha.id.slice(0, 8) });
  const r = await decir("sí");
  assert.match(r.json.respuesta, /cambió después/);
  assert.equal(await estado(), "FINALIZADO");
});

t("restaurar una versión desde el editor PUBLICA: el agente la lee", async () => {
  ponerLaSesion(A);
  const r = await m.restoreRevision({ promptId: PROMPT, revisionNumber: 1 });
  assert.equal(r.ok, true);
  const p = await db.agentPrompt.findUnique({ where: { id: PROMPT } });
  assert.notEqual(p.promptText, "texto NUEVO");
  assert.equal(p.status, "published");
});

t("lo irreversible se dice ANTES de confirmar", async () => {
  const msg = await pedir(m.mensaje, { phone: JUAN, text: "Hola Juan" });
  assert.match(msg.json.confirmacion, /no se puede deshacer/);
  await decir("no");
  const desc = await pedir(m.estadoDelLead, { sessionId: SESION, status: "DESCARTADO" });
  assert.match(desc.json.confirmacion, /seguimientos programados/);
  await decir("no");
  const sube = await pedir(m.estadoDelLead, { sessionId: SESION, status: "TIBIO" });
  assert.doesNotMatch(sube.json.confirmacion, /no se puede deshacer/);
  await decir("no");
});

t("se guardan las fotos de las 5 últimas de cada cosa; la bitácora, todas", async () => {
  for (const s of ["TIBIO", "CALIENTE", "TIBIO", "CALIENTE", "TIBIO", "CALIENTE"]) {
    await pedir(m.estadoDelLead, { sessionId: SESION, status: s });
    await decir("sí");
  }
  const filas = await bitacora(`AND estado='ejecutada' AND entidad_tipo='lead' AND entidad_id='${SESION}'`);
  assert.ok(filas.length >= 6);
  assert.equal(filas.filter((f) => f.antes !== null).length, 5);
  assert.equal(filas[filas.length - 1].reversible, false);
});

// ── Plan ────────────────────────────────────────────────────────────────────

t("fuera del plan: ni se consulta ni se prepara, y se dice por qué", async () => {
  await bloquear("/chats");
  const r = await pedir(m.mensaje, { phone: JUAN, text: "Hola" });
  await bloquear("/chats", false);
  assert.equal(r.status, 403);
  assert.equal(r.json.fueraDelPlan, true);
  assert.match(r.json.message, /no está incluida en el plan/);

  await bloquear("/schedule");
  const c = await pedir(m.citas, {});
  await bloquear("/schedule", false);
  assert.equal(c.status, 403);
  const [fila] = await bitacora();
  assert.equal(fila.estado, "rechazada");
  assert.equal(fila.resultado.motivo, "plan");
});

t("si el módulo se quita mientras espera la confirmación, no se ejecuta", async () => {
  const antesN = await tareas();
  await pedir(m.tarea, { title: "Justo antes", dueDate: "2026-12-01T15:00:00Z" });
  await bloquear("/tareas");
  const r = await decir("sí");
  await bloquear("/tareas", false);
  assert.match(r.json.respuesta, /No lo hice/);
  assert.equal(await tareas(), antesN);
});
