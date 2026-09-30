/**
 * Mis formularios contra POSTGRES, con las acciones de verdad.
 *
 * Lo único fingido es `currentUser()` y Google Sheets (que imita a Google: una
 * pestaña que ya existe sin mirar mayúsculas no se puede volver a crear). Lo
 * demás —la puerta de la cuenta, las consultas, el envío público— es el código
 * de producción.
 *
 * `MODO=roto` empaqueta estas MISMAS pruebas contra `forms-actions` de un
 * commit pinchado y AFIRMA los fallos que se vieron:
 *   - el título «PROCESO DE ATENCION» con la pestaña «Proceso de atención »
 *     ya en la hoja: cada registro quedaba en «Error» (3 así en producción);
 *   - el envío público guardaba cualquier clave que le mandaran, también a un
 *     formulario desactivado, y devolvía la hoja de Google a quien lo abría;
 *   - alguien del equipo no veía los formularios de su cuenta;
 *   - «Inscripción» daba el enlace «inscripcin».
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import("./.compilado/formularios/entrada-de-formularios.js");
const A = m.acciones;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DUENO = `fo-dueno-${V}`;
const ASESOR = `fo-asesor-${V}`;
const HIJA = `fo-hija-${V}`;
const AJENA = `fo-ajena-${V}`;
const IDS = [DUENO, ASESOR, HIJA, AJENA];

const quien = (id, extra = {}) => ({
    id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
    role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id, ...extra,
});
const dueno = () => quien(DUENO);
const asesor = () => quien(ASESOR, { ownerId: DUENO, effectiveId: DUENO, advisorRole: "agente" });
const hija = () => quien(HIJA);
const ajena = () => quien(AJENA);

const HOJA = "https://docs.google.com/spreadsheets/d/banco-hoja-123/edit";
const PREFIJO = (formId) => `http://localhost/verzay-media/formularios/${formId}/`;

let formId; // «PROCESO DE ATENCION», del dueño, con la hoja
let campos; // los tres campos de ese formulario

async function crearFormularioDirecto(userId, extra = {}) {
    return m.db.form.create({ data: { userId, title: `F ${V}`, slug: `f-${Math.random().toString(36).slice(2, 8)}`, ...extra } });
}

test.before(async () => {
    for (const [id, ownerId, advisorRole] of [[DUENO, null, null], [ASESOR, DUENO, "agente"], [HIJA, null, null], [AJENA, null, null]]) {
        await m.db.user.create({ data: { id, email: `${id}@banco.test`, name: id, ownerId, advisorRole } });
    }
    await m.db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id") VALUES ($1,$2,$3)`,
        `fo-lk-${V}`, DUENO, HIJA,
    );

    const f = await m.db.form.create({
        data: { userId: DUENO, title: "PROCESO DE ATENCION", slug: `proceso-${V}`, sheetsUrl: HOJA, isActive: true },
    });
    formId = f.id;
    campos = await Promise.all([
        m.db.formField.create({ data: { formId, label: "¿Cómo te llamas?", type: "text", required: true, order: 0 } }),
        m.db.formField.create({ data: { formId, label: "Acepto", type: "checkbox", required: false, order: 1 } }),
        m.db.formField.create({ data: { formId, label: "Documento", type: "file", required: false, order: 2 } }),
    ]);
});

test.after(async () => {
    await m.db.form.deleteMany({ where: { userId: { in: IDS } } });
    await m.db.$executeRawUnsafe(`DELETE FROM "linked_accounts" WHERE "master_user_id" = $1`, DUENO).catch(() => {});
    await m.db.user.deleteMany({ where: { id: { in: IDS } } });
    await m.db.$disconnect();
});

// ── La hoja de Google ───────────────────────────────────────────────────────

test("un registro cae en la pestaña que YA existe aunque su nombre no coincida en mayúsculas", async () => {
    m.ponerLaHoja(["Hoja 1", "Proceso de atención ".replace("ó", "o")]);
    const r = await A.submitFormResponse(formId, { [campos[0].id]: "Ana" });
    assert.equal(r.success, true);
    const reg = await m.db.formSubmission.findFirst({ where: { formId }, orderBy: { createdAt: "desc" } });

    if (ROTO) {
        assert.equal(reg.syncStatus, "ERROR", "ANTES: el registro queda en Error");
        assert.match(reg.syncError, /already exists/, "ANTES: Google rechaza la pestaña repetida");
        return;
    }
    assert.equal(reg.syncStatus, "SYNCED", reg.syncError ?? "");
    const hoja = m.laHojaDeMentira();
    assert.equal(hoja.llamadas.filter((l) => l.que === "addSheet").length, 0, "no intenta crear otra pestaña");
    const fila = hoja.llamadas.find((l) => l.que === "append");
    assert.equal(fila.rango, "'Proceso de atencion '!A1", "va a la pestaña que ya había, con su nombre");
    assert.deepEqual(fila.valores[0].slice(2), ["Ana", "No", ""], "la casilla sin marcar se lee «No»");
});

test("un título con comilla no rompe el rango de la hoja", { skip: ROTO }, async () => {
    const f = await crearFormularioDirecto(DUENO, { title: "Registro d'Anna", sheetsUrl: HOJA });
    await m.db.formField.create({ data: { formId: f.id, label: "Nombre", type: "text", order: 0 } });
    m.ponerLaHoja(["Hoja 1"]);
    m.ponerAQuienMira(null);
    const r = await A.submitFormResponse(f.id, {});
    assert.equal(r.success, true);
    const hoja = m.laHojaDeMentira();
    assert.equal(hoja.llamadas.find((l) => l.que === "addSheet").pestana, "Registro d'Anna");
    for (const l of hoja.llamadas.filter((l) => l.que === "append")) assert.equal(l.rango, "'Registro d''Anna'!A1");
    const reg = await m.db.formSubmission.findFirst({ where: { formId: f.id } });
    assert.equal(reg.syncStatus, "SYNCED");
});

test("si la hoja falla, el registro se guarda con el motivo, y «Reintentar» lo sincroniza", { skip: ROTO }, async () => {
    m.ponerLaHoja(["Hoja 1"], "The caller does not have permission");
    await A.submitFormResponse(formId, { [campos[0].id]: "Beto" });
    const reg = await m.db.formSubmission.findFirst({ where: { formId }, orderBy: { createdAt: "desc" } });
    assert.equal(reg.syncStatus, "ERROR");
    assert.match(reg.syncError, /permission/);

    m.ponerAQuienMira(dueno());
    m.ponerLaHoja(["proceso de atencion"]);
    const r = await A.retrySheetSync(reg.id);
    assert.equal(r.success, true, r.error);
    const despues = await m.db.formSubmission.findUnique({ where: { id: reg.id } });
    assert.equal(despues.syncStatus, "SYNCED");
    assert.equal(despues.syncError, null);

    m.ponerAQuienMira(ajena());
    const ajeno = await A.retrySheetSync(reg.id);
    assert.equal(ajeno.success, false, "otra cuenta no reintenta un registro ajeno");
});

// ── El envío público ────────────────────────────────────────────────────────

test("el envío público solo guarda los campos del formulario", async () => {
    m.ponerLaHoja(["proceso de atencion"]);
    m.ponerAQuienMira(null);
    const r = await A.submitFormResponse(formId, { [campos[0].id]: "Carla", inventado: "<script>", [campos[1].id]: "true" });
    assert.equal(r.success, true);
    const reg = await m.db.formSubmission.findFirst({ where: { formId }, orderBy: { createdAt: "desc" } });
    if (ROTO) {
        assert.equal(reg.data.inventado, "<script>", "ANTES: guardaba cualquier clave");
        return;
    }
    assert.equal("inventado" in reg.data, false);
    assert.equal(reg.data[campos[1].id], true, "la casilla se guarda como casilla");
});

test("un obligatorio sin responder no se guarda, tampoco saltándose la pantalla", async () => {
    m.ponerAQuienMira(null);
    const antes = await m.db.formSubmission.count({ where: { formId } });
    const r = await A.submitFormResponse(formId, { [campos[1].id]: true });
    const despues = await m.db.formSubmission.count({ where: { formId } });
    if (ROTO) {
        assert.equal(despues, antes + 1, "ANTES: se guardaba sin la respuesta obligatoria");
        return;
    }
    assert.equal(r.success, false);
    assert.match(r.error, /Falta responder «¿Cómo te llamas\?»/);
    assert.equal(despues, antes);
});

test("un archivo tiene que ser uno subido a ESTE formulario", { skip: ROTO }, async () => {
    m.ponerAQuienMira(null);
    const fuera = await A.submitFormResponse(formId, { [campos[0].id]: "Dani", [campos[2].id]: "https://malo.test/virus.exe" });
    assert.equal(fuera.success, false);
    assert.match(fuera.error, /«Documento» no es válido/);

    const deOtro = await A.submitFormResponse(formId, { [campos[0].id]: "Dani", [campos[2].id]: `${PREFIJO("otro-formulario")}a.pdf` });
    assert.equal(deOtro.success, false, "un archivo subido a otro formulario tampoco");

    m.ponerLaHoja(["proceso de atencion"]);
    const suyo = await A.submitFormResponse(formId, { [campos[0].id]: "Dani", [campos[2].id]: `${PREFIJO(formId)}abc.pdf` });
    assert.equal(suyo.success, true, suyo.error);
});

test("un formulario desactivado no recibe respuestas, ni por la petición directa", async () => {
    const f = await crearFormularioDirecto(DUENO, { isActive: false });
    m.ponerAQuienMira(null);
    const r = await A.submitFormResponse(f.id, {});
    const n = await m.db.formSubmission.count({ where: { formId: f.id } });
    if (ROTO) {
        assert.equal(n, 1, "ANTES: un formulario desactivado seguía guardando");
        return;
    }
    assert.equal(r.success, false);
    assert.equal(n, 0);
});

test("quien abre el formulario público no recibe la hoja de Google", async () => {
    const f = await m.db.form.findUnique({ where: { id: formId } });
    m.ponerAQuienMira(null);
    const r = await A.getPublicFormBySlug(DUENO, f.slug);
    assert.equal(r.success, true);
    if (ROTO) {
        assert.equal(r.form.sheetsUrl, HOJA, "ANTES: la página pública llevaba la hoja con los registros de todos");
        return;
    }
    assert.equal("sheetsUrl" in r.form, false);
});

// ── De quién es cada formulario ─────────────────────────────────────────────

test("alguien del equipo ve y edita los formularios de SU cuenta", async () => {
    m.ponerAQuienMira(asesor());
    const r = await A.getMyForms();
    const suyos = (r.forms ?? []).map((f) => f.id);
    if (ROTO) {
        assert.equal(suyos.includes(formId), false, "ANTES: el equipo no veía los formularios de la cuenta");
        return;
    }
    assert.ok(suyos.includes(formId));
    const e = await A.getFormById(formId);
    assert.equal(e.success, true);
    assert.equal(e.form.userId, DUENO, "el enlace se arma con la cuenta DUEÑA");
});

test("otra cuenta no toca un formulario ajeno por ninguna acción", { skip: ROTO }, async () => {
    m.ponerAQuienMira(ajena());
    assert.equal((await A.getFormById(formId)).success, false);
    assert.equal((await A.updateForm(formId, { title: "Mío" })).success, false);
    assert.equal((await A.addFormField(formId, { label: "x", type: "text" })).success, false);
    assert.equal((await A.updateFormField(campos[0].id, { label: "x" })).success, false);
    assert.equal((await A.deleteFormField(campos[0].id)).success, false);
    assert.equal((await A.updateFormPublicSlug(formId, "robado")).success, false);
    assert.equal((await A.getFormSubmissions(formId)).success, false);
    assert.equal((await A.deleteForm(formId)).success, false);
    const f = await m.db.form.findUnique({ where: { id: formId }, include: { fields: true } });
    assert.equal(f.title, "PROCESO DE ATENCION");
    assert.equal(f.fields.length, 3);
});

test("la madre llega al formulario de su hija, y la hija no al de la madre", { skip: ROTO }, async () => {
    const deLaHija = await crearFormularioDirecto(HIJA);
    m.ponerAQuienMira(dueno());
    assert.equal((await A.getFormById(deLaHija.id)).success, true);
    m.ponerAQuienMira(hija());
    assert.equal((await A.getFormById(formId)).success, false);
});

test("reordenar no mueve los campos de otro formulario", { skip: ROTO }, async () => {
    const otro = await crearFormularioDirecto(DUENO);
    const ajeno = await m.db.formField.create({ data: { formId: otro.id, label: "Ajeno", type: "text", order: 7 } });
    m.ponerAQuienMira(dueno());
    const r = await A.reorderFormFields(formId, [ajeno.id, campos[2].id, campos[1].id, campos[0].id]);
    assert.equal(r.success, true);
    assert.equal((await m.db.formField.findUnique({ where: { id: ajeno.id } })).order, 7, "el ajeno se queda donde estaba");
    const orden = (await m.db.formField.findMany({ where: { formId }, orderBy: { order: "asc" } })).map((c) => c.label);
    assert.deepEqual(orden, ["Documento", "Acepto", "¿Cómo te llamas?"]);
    await A.reorderFormFields(formId, campos.map((c) => c.id));
});

test("un tipo de campo inventado o una pregunta vacía no se guardan", { skip: ROTO }, async () => {
    m.ponerAQuienMira(dueno());
    assert.equal((await A.addFormField(formId, { label: "x", type: "inventado" })).success, false);
    assert.equal((await A.addFormField(formId, { label: "   ", type: "text" })).success, false);
    const ok = await A.addFormField(formId, { label: "Teléfono", type: "phone" });
    assert.equal(ok.success, true);
    await A.deleteFormField(ok.field.id);
});

// ── El enlace ───────────────────────────────────────────────────────────────

test("el enlace conserva la letra de una tilde", async () => {
    m.ponerAQuienMira(dueno());
    const r = await A.createForm({ title: "Inscripción de clientes", slug: "Inscripción de clientes" });
    assert.equal(r.success, true, r.error);
    const f = await m.db.form.findUnique({ where: { id: r.formId } });
    if (ROTO) {
        assert.equal(f.slug, "inscripcin-de-clientes", "ANTES: la tilde se llevaba la letra");
        return;
    }
    assert.equal(f.slug, "inscripcion-de-clientes");
    const p = await A.updateFormPublicSlug(r.formId, "Atención Médica");
    assert.equal(p.slug, "atencion-medica");
    const dup = await A.createForm({ title: "Otra", slug: "inscripcion de clientes" });
    assert.equal(dup.success, false, "el mismo enlace dos veces en la cuenta no");
});

// ── Registros ───────────────────────────────────────────────────────────────

test("los conteos de registros son un COUNT, no lo que cabe en la lista", { skip: ROTO }, async () => {
    const f = await crearFormularioDirecto(DUENO);
    await m.db.formSubmission.createMany({
        data: Array.from({ length: 520 }, (_, i) => ({ formId: f.id, data: {}, syncStatus: i < 3 ? "ERROR" : "SYNCED" })),
    });
    m.ponerAQuienMira(dueno());
    const r = await A.getFormSubmissions(f.id);
    assert.equal(r.submissions.length, 500);
    assert.deepEqual(r.conteos, { total: 520, sincronizados: 517, pendientes: 0, conError: 3 });
});

test("las cifras de Registros filtran EN EL SERVIDOR, y cada registro conserva su número", { skip: ROTO }, async () => {
    const f = await crearFormularioDirecto(DUENO);
    const base = Date.UTC(2026, 8, 1, 12);
    const estados = ["SYNCED", "ERROR", "SYNCED", "PENDING", "ERROR", "SYNCED"];
    await m.db.formSubmission.createMany({
        data: estados.map((syncStatus, i) => ({ formId: f.id, data: { n: i + 1 }, syncStatus, createdAt: new Date(base + i * 60_000) })),
    });
    m.ponerAQuienMira(dueno());
    const errores = await A.getFormSubmissions(f.id, "ERROR");
    assert.equal(errores.success, true);
    assert.deepEqual(errores.submissions.map((s) => s.syncStatus), ["ERROR", "ERROR"], "solo los que fallaron");
    assert.deepEqual(errores.submissions.map((s) => s.numero), [5, 2], "con el número que tienen en la lista entera");
    assert.deepEqual(errores.conteos, { total: 6, sincronizados: 3, pendientes: 1, conError: 2 }, "las cifras no se filtran");
    const todos = await A.getFormSubmissions(f.id, "inventado");
    assert.deepEqual(todos.submissions.map((s) => s.numero), [6, 5, 4, 3, 2, 1], "un filtro que no se entiende es «todos»");
});

test("el correo con el que compartir la hoja sale del de la plataforma, y solo con sesión", { skip: ROTO }, async () => {
    m.ponerAQuienMira(dueno());
    assert.equal(await A.correoParaCompartirLaHoja(), "hoja@banco.iam.gserviceaccount.com");
    m.ponerAQuienMira(null);
    assert.equal(await A.correoParaCompartirLaHoja(), null);
});
