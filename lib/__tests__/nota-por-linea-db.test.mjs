/**
 * LA NOTA INTERNA SE QUEDA EN SU LÍNEA, contra Postgres y con las acciones de
 * VERDAD.
 *
 * Una cuenta con dos líneas —Ventas y Atención— y el MISMO contacto escribiendo
 * a las dos: una ficha por línea. La de Ventas se tocó la última, que es lo que
 * hacía que ganara. Lo que se prueba es la cadena entera que sigue una nota:
 *
 *   la conversación abierta pide su ficha  →  escribe la nota en esa ficha
 *   →  la nota sale en SU conversación, en SU fila y en la lista de la bandeja
 *
 * y que en ningún eslabón aparece la otra línea.
 *
 * `MODO=roto` hace la MISMA pregunta que hacía la conversación abierta antes
 * —solo por el número, sin la línea, escrita literal— y AFIRMA el fallo: desde
 * Atención se resolvía la ficha de Ventas y la nota caía allí.
 *
 * Se levanta con `scripts/banco-nota-por-linea.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import("./.compilado/nota-por-linea/entrada-de-la-nota-por-linea.js");
const {
    ponerAQuienMira, createInternalNoteAction, getInternalNotesBySessionAction,
    lasNotasDeLaBandejaAction, getSessionByRemoteJid, laFilaDeLaSesionAction,
    laBusquedaDeLaSesionAbierta, db,
} = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUENTA = `npl-cuenta-${V}`;
const MADRE = `npl-madre-${V}`;
const HIJA = `npl-hija-${V}`;
const VENTAS = `NPL_VENTAS_${V}`;
const ATENCION = `NPL_ATENCION_${V}`;
const LIBRE = `NPL_LIBRE_${V}`;
const DE_LA_MADRE = `NPL_MADRE_${V}`;
const DE_LA_HIJA = `NPL_HIJA_${V}`;
const NUMERO = `5731${V.replace(/\D/g, "").slice(-8)}@s.whatsapp.net`;
const OTRO = `5732${V.replace(/\D/g, "").slice(-8)}@s.whatsapp.net`;

function quien(id, extra = {}) {
    return {
        id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
        role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id,
        canTakeUnassigned: false, ...extra,
    };
}

/** Lo que pide la conversación abierta HOY: con su línea. */
function laPreguntaDeHoy(cuentas, jid, linea) {
    const b = laBusquedaDeLaSesionAbierta(jid, [jid], linea);
    return getSessionByRemoteJid(cuentas, b.remoteJid, b.opciones);
}
/** Lo que pedía ANTES, literal: solo por el número. */
function laPreguntaDeAntes(cuentas, jid) {
    return getSessionByRemoteJid(cuentas, jid, { aliases: [jid] });
}

const S = {};

test.before(async () => {
    await db.$executeRawUnsafe(`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP(3)`);
    await db.$executeRawUnsafe(`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP(3)`);
    for (const [id, nombre] of [[CUENTA, "La Cuenta"], [MADRE, "La Madre"], [HIJA, "La Hija"]]) {
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: nombre } });
    }
    await db.linkedAccount.create({ data: { masterUserId: MADRE, linkedUserId: HIJA } });

    const crear = async (userId, linea, jid, nombre) =>
        (await db.session.create({
            data: { userId, instanceId: linea, remoteJid: jid, pushName: nombre, status: true },
            select: { id: true },
        })).id;
    S.atencion = await crear(CUENTA, ATENCION, NUMERO, "Laura");
    S.ventas = await crear(CUENTA, VENTAS, NUMERO, "Laura");
    // El mismo contacto en la madre y en su hija.
    S.madre = await crear(MADRE, DE_LA_MADRE, OTRO, "Marta");
    S.hija = await crear(HIJA, DE_LA_HIJA, OTRO, "Marta");

    // La de Ventas es la que se tocó la última: era la que ganaba siempre.
    await db.$executeRawUnsafe(`UPDATE "Session" SET "updatedAt" = NOW() + interval '1 hour' WHERE id IN (${S.ventas}, ${S.hija})`);
});

// ── MODO=roto: el fallo, con la pregunta de antes ───────────────────────────

test("MODO=roto: desde Atención se resolvía la ficha de Ventas y la nota caía allí", { skip: !ROTO }, async () => {
    ponerAQuienMira(quien(CUENTA));
    const r = await laPreguntaDeAntes([CUENTA], NUMERO);
    assert.equal(r.success, true, r.message);
    assert.equal(r.data.id, S.ventas, "el fallo: la conversación de Atención recibía la ficha de Ventas");
    assert.equal(r.data.instanceId, VENTAS);

    const nota = await createInternalNoteAction({ sessionId: r.data.id, content: "Escrita en Atención" });
    assert.equal(nota.success, true, nota.message);

    const enVentas = await getInternalNotesBySessionAction(S.ventas);
    assert.ok(enVentas.data.some((n) => n.content === "Escrita en Atención"),
        "el fallo: la nota de Atención aparece en la conversación de Ventas");
    const filaVentas = await laFilaDeLaSesionAction(S.ventas);
    assert.equal(filaVentas.data.ultimaNota?.texto, "Escrita en Atención",
        "el fallo: y en la vista previa de la fila de Ventas");
    const enAtencion = await getInternalNotesBySessionAction(S.atencion);
    assert.equal(enAtencion.data.length, 0, "el fallo: y en la de Atención, nada");
});

// ── Hoy ─────────────────────────────────────────────────────────────────────

test("cada conversación resuelve la ficha de SU línea, aunque la otra se tocara después", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(CUENTA));
    const atencion = await laPreguntaDeHoy([CUENTA], NUMERO, ATENCION);
    assert.equal(atencion.success, true, atencion.message);
    assert.equal(atencion.data.id, S.atencion);
    assert.equal(atencion.data.instanceId, ATENCION);

    const ventas = await laPreguntaDeHoy([CUENTA], NUMERO, VENTAS);
    assert.equal(ventas.data.id, S.ventas);
});

test("una línea sin ficha de ese contacto NO hereda la de otra", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(CUENTA));
    const libre = await laPreguntaDeHoy([CUENTA], NUMERO, LIBRE);
    assert.equal(libre.success, false, "sin ficha en esta línea: ninguna");
    assert.equal(libre.data, undefined);
});

test("la nota escrita en Atención se queda en Atención: su conversación, su fila y la bandeja", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(CUENTA));
    const ficha = (await laPreguntaDeHoy([CUENTA], NUMERO, ATENCION)).data;
    const nota = await createInternalNoteAction({ sessionId: ficha.id, content: "Solo para Atención" });
    assert.equal(nota.success, true, nota.message);

    const enAtencion = await getInternalNotesBySessionAction(S.atencion);
    assert.deepEqual(enAtencion.data.map((n) => n.content), ["Solo para Atención"]);
    const enVentas = await getInternalNotesBySessionAction(S.ventas);
    assert.equal(enVentas.data.length, 0, "la conversación de Ventas no la ve");

    assert.equal((await laFilaDeLaSesionAction(S.atencion)).data.ultimaNota?.texto, "Solo para Atención");
    const filaVentas = (await laFilaDeLaSesionAction(S.ventas)).data;
    assert.equal(filaVentas.ultimaNota, null, "la vista previa de Ventas no la enseña");
    assert.equal(filaVentas.tieneNotas, false, "ni el candado");

    const bandeja = await lasNotasDeLaBandejaAction();
    assert.ok(bandeja.some((n) => n.sessionId === S.atencion && n.texto === "Solo para Atención"));
    assert.ok(!bandeja.some((n) => n.sessionId === S.ventas), "la bandeja no se la cuelga a Ventas");
});

test("y al revés: la de Ventas no aparece en Atención", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(CUENTA));
    const ficha = (await laPreguntaDeHoy([CUENTA], NUMERO, VENTAS)).data;
    assert.equal((await createInternalNoteAction({ sessionId: ficha.id, content: "Solo para Ventas" })).success, true);

    const enAtencion = (await getInternalNotesBySessionAction(S.atencion)).data.map((n) => n.content);
    assert.deepEqual(enAtencion, ["Solo para Atención"]);
    assert.equal((await laFilaDeLaSesionAction(S.atencion)).data.ultimaNota?.texto, "Solo para Atención");
    assert.equal((await laFilaDeLaSesionAction(S.ventas)).data.ultimaNota?.texto, "Solo para Ventas");
});

test("la madre mirando la conversación de su hija escribe en la ficha de la hija, no en la suya", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(MADRE));
    const ficha = (await laPreguntaDeHoy([MADRE, HIJA], OTRO, DE_LA_MADRE)).data;
    assert.equal(ficha.id, S.madre, "su línea: su ficha, aunque la de la hija se tocara después");
    const deLaHija = (await laPreguntaDeHoy([MADRE, HIJA], OTRO, DE_LA_HIJA)).data;
    assert.equal(deLaHija.id, S.hija);

    assert.equal((await createInternalNoteAction({ sessionId: deLaHija.id, content: "En la línea de la hija" })).success, true);
    assert.equal((await getInternalNotesBySessionAction(S.madre)).data.length, 0, "la de la madre, limpia");
    assert.equal((await laFilaDeLaSesionAction(S.hija)).data.ultimaNota?.texto, "En la línea de la hija");
});

test("lo que no cambia: sin línea, se resuelve como siempre", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(CUENTA));
    const sinLinea = await laPreguntaDeHoy([CUENTA], NUMERO, undefined);
    assert.equal(sinLinea.data.id, S.ventas, "la más reciente entre todas, como antes");
    const deAntes = await laPreguntaDeAntes([CUENTA], NUMERO);
    assert.equal(deAntes.data.id, sinLinea.data.id, "la pregunta sin línea dice lo mismo que la de antes");
});
