/**
 * La regla de la ficha de contacto, sin base ni navegador:
 *   - Nombre y Teléfono son FIJOS y nunca entran en la lista editable;
 *   - una cuenta sin nada guardado arranca VACÍA (sin campos de fábrica);
 *   - una lista de ANTES se migra: fuera los apagados de fábrica, se quedan los
 *     encendidos y todos los creados por la cuenta, y todo pasa a ser borrable;
 *   - lo que se guarda es siempre la forma de la versión 2, y leer lo guardado
 *     devuelve lo mismo (simetría).
 *
 * `MODO=roto` corre la misma pregunta contra el `lib/contact-fields.ts` de
 * antes y AFIRMA el fallo: sin nada guardado salían los 14 de fábrica.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const r = await import(ROTO ? "./.compilado/campos-de-la-ficha/antes-reglas.js" : "./.compilado/campos-de-la-ficha/reglas.js");

const F = (key, extra = {}) => ({ key, label: key.toUpperCase(), section: "Libre", icon: "Tag", enabled: true, order: 0, ...extra });

test("ANTES: sin nada guardado salían los 14 campos de fábrica, y ninguno se podía borrar", { skip: !ROTO }, () => {
    const lista = r.normalizeContactFieldsConfig(null);
    assert.equal(lista.length, 14);
    assert.ok(lista.every((f) => !f.custom), "ninguno era borrable");
    assert.ok(lista.some((f) => f.key === "telefono"), "y Teléfono era un campo más de la lista");
});

test("ANTES: guardar una lista vacía volvía a traer los 14", { skip: !ROTO }, () => {
    assert.equal(r.normalizeContactFieldsConfig([]).length, 14);
});

test("una cuenta que nunca tocó la ficha arranca sin campos (solo los dos fijos)", { skip: ROTO }, () => {
    for (const nada of [null, undefined, "", 7, {}, { version: 3, campos: [] }]) {
        assert.deepEqual(r.normalizeContactFieldsConfig(nada), [], JSON.stringify(nada));
    }
    assert.deepEqual(r.DEFAULT_CONTACT_FIELDS, []);
    assert.deepEqual(r.CAMPOS_FIJOS.map((c) => c.label), ["Nombre", "Teléfono"]);
});

test("migrar una lista de ANTES: fuera los apagados de fábrica; encendidos y propios se quedan", { skip: ROTO }, () => {
    const antes = [
        F("empresa", { order: 0 }),
        F("cargo", { order: 1, enabled: false }),              // de fábrica y apagado → fuera
        F("telefono", { order: 2 }),                            // ahora es fijo → fuera
        F("email", { order: 3 }),
        F("pais", { order: 4, enabled: false }),                // fuera
        F("nuevo_campo", { order: 5, custom: true }),           // propio encendido
        F("nuevo_campo_1", { order: 6, custom: true, enabled: false }), // propio oculto: se queda, oculto
    ];
    const lista = r.normalizeContactFieldsConfig(antes);
    assert.deepEqual(lista.map((f) => f.key), ["empresa", "email", "nuevo_campo", "nuevo_campo_1"]);
    assert.ok(lista.every((f) => f.custom === true), "todo lo que queda es editable y borrable");
    assert.equal(lista.find((f) => f.key === "nuevo_campo_1").enabled, false, "el propio oculto sigue oculto");
    assert.deepEqual(lista.map((f) => f.order), [0, 1, 2, 3]);
    // Determinista: migrar lo migrado no quita nada más.
    const otraVez = r.normalizeContactFieldsConfig(r.comoSeGuardaLaFicha(lista));
    assert.deepEqual(otraVez, lista);
});

test("una lista de antes con los 14 de fábrica encendidos conserva 12 (Teléfono y Notas pasan a ser fijos)", { skip: ROTO }, () => {
    const lista = r.normalizeContactFieldsConfig(r.CAMPOS_DE_FABRICA_DE_ANTES);
    assert.equal(lista.length, 12);
    assert.ok(!lista.some((f) => f.key === "telefono" || f.key === "notas"));
});

test("en la versión 2 un campo apagado se QUEDA (se ocultó a propósito, no es de antes)", { skip: ROTO }, () => {
    const g = r.comoSeGuardaLaFicha([F("empresa", { enabled: false }), F("x", { custom: true })]);
    assert.equal(g.version, 2);
    assert.deepEqual(r.normalizeContactFieldsConfig(g).map((f) => [f.key, f.enabled]), [["empresa", false], ["x", true]]);
});

test("los dos fijos nunca se guardan en la lista, se manden como se manden", { skip: ROTO }, () => {
    const g = r.comoSeGuardaLaFicha([F("nombre", { custom: true }), F("telefono"), F("otro", { custom: true })]);
    assert.deepEqual(g.campos.map((f) => f.key), ["otro"]);
});

test("guardar vacío se queda vacío: simetría entre lo que se guarda y lo que se lee", { skip: ROTO }, () => {
    const g = r.comoSeGuardaLaFicha([]);
    assert.deepEqual(g, { version: 2, campos: [] });
    assert.deepEqual(r.normalizeContactFieldsConfig(g), []);
    assert.deepEqual(r.comoSeGuardaLaFicha("basura"), { version: 2, campos: [] });
});
