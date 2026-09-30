/**
 * La regla de la ficha SIMÉTRICA, sin navegador:
 *   - Nombre y Teléfono llevan su sección REAL («Contacto»), no «Fijo»;
 *   - Notas es un campo de TODA ficha, siempre el último, y nunca entra en la
 *     lista editable (ni arrastrándolo ni mandándolo a mano);
 *   - la ficha abierta sale en el MISMO orden que el diálogo: los fijos
 *     primero, los campos de la cuenta, Notas la última;
 *   - Google Sheets sigue exportando Notas, aunque ya no viva en la lista.
 *
 * `MODO=roto` corre la misma pregunta contra el `lib/contact-fields.ts` de
 * `ANTES_REF` y AFIRMA el fallo: sin sección en los fijos y sin Notas.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const r = await import(ROTO ? "./.compilado/ficha-simetrica/antes-reglas.js" : "./.compilado/ficha-simetrica/reglas.js");

const F = (key, extra = {}) => ({ key, label: key.toUpperCase(), section: "Datos de negocio", icon: "Tag", enabled: true, order: 0, custom: true, ...extra });
const claves = (secciones) => secciones.flatMap((s) => s.filas.map((f) => f.campo.key));

test("ANTES: Nombre y Teléfono no tenían sección, y no había Notas", { skip: !ROTO }, () => {
    assert.ok(r.CAMPOS_FIJOS.every((c) => c.section === undefined), "los fijos no tenían sección: el diálogo decía «Fijo»");
    assert.equal(r.CAMPO_NOTAS, undefined, "no existía el campo Notas");
    assert.equal(r.lasSeccionesDeLaFicha, undefined, "la ficha no tenía un orden con Notas al final");
    assert.deepEqual(r.normalizeContactFieldsConfig({ version: 2, campos: [] }), [], "una cuenta nueva no traía Notas");
});

test("Nombre y Teléfono llevan su sección real, y Notas la suya", { skip: ROTO }, () => {
    assert.deepEqual(r.CAMPOS_FIJOS.map((c) => [c.label, c.section]), [["Nombre", "Contacto"], ["Teléfono", "Contacto"]]);
    assert.deepEqual([r.CAMPO_NOTAS.key, r.CAMPO_NOTAS.label, r.CAMPO_NOTAS.section, r.CAMPO_NOTAS.multiline], ["notas", "Notas", "Libre", true]);
    const secciones = r.DEFAULT_CONTACT_SECTIONS.map((s) => s.title);
    for (const c of [...r.CAMPOS_FIJOS, r.CAMPO_NOTAS]) assert.ok(secciones.includes(c.section), `${c.label}: ${c.section} es una sección de verdad`);
});

test("Notas nunca entra en la lista editable, se mande como se mande", { skip: ROTO }, () => {
    const g = r.comoSeGuardaLaFicha([F("a"), F("notas", { label: "Notas" }), F("b")]);
    assert.deepEqual(g.campos.map((f) => f.key), ["a", "b"]);
    // Una lista de antes con el Notas de fábrica: la clave se va de la lista y
    // el dato (ExternalClientData.data.notas) lo sigue leyendo el campo fijo.
    const migrada = r.normalizeContactFieldsConfig(r.CAMPOS_DE_FABRICA_DE_ANTES);
    assert.equal(migrada.length, 12);
    assert.ok(!migrada.some((f) => f.key === "notas" || f.key === "telefono"));
});

test("una ficha sin campos: Nombre, Teléfono y Notas, en ese orden", { skip: ROTO }, () => {
    const s = r.lasSeccionesDeLaFicha([]);
    assert.deepEqual(s.map((x) => x.title), ["Contacto", "Libre"]);
    assert.deepEqual(claves(s), ["nombre", "telefono", "notas"]);
    assert.deepEqual(s.flatMap((x) => x.filas.map((f) => f.tipo)), ["fijo", "fijo", "notas"]);
});

test("Notas queda la ÚLTIMA se agreguen o se reordenen los campos que sea", { skip: ROTO }, () => {
    const base = [
        F("x", { section: "Libre", order: 0 }),          // un campo de la cuenta en la sección de Notas
        F("empresa", { order: 1 }),
        F("correo", { section: "Contacto", order: 2 }),  // uno en la sección de los fijos
        F("oculto", { order: 3, enabled: false }),
        F("web", { section: "Presencia digital", order: 4 }),
    ];
    for (let vuelta = 0; vuelta < 50; vuelta++) {
        const revuelto = [...base, ...Array.from({ length: vuelta % 7 }, (_, i) => F(`n${i}`, { section: ["Libre", "Otra", "Contacto"][i % 3] }))]
            .map((f, i, a) => ({ ...f, order: (i * 37 + vuelta * 11) % a.length }));
        const s = r.lasSeccionesDeLaFicha(revuelto);
        const k = claves(s);
        assert.equal(k.at(-1), "notas", `vuelta ${vuelta}: ${k}`);
        assert.deepEqual(k.slice(0, 2), ["nombre", "telefono"], `vuelta ${vuelta}`);
        assert.equal(s[0].title, "Contacto");
        assert.equal(s.at(-1).title, "Libre");
        assert.equal(new Set(s.map((x) => x.title)).size, s.length, "ninguna sección repetida");
        assert.ok(!k.includes("oculto"), "lo apagado no se pinta");
        assert.equal(k.filter((x) => x === "notas").length, 1);
    }
});

test("la ficha abierta sigue el orden del diálogo, sección a sección", { skip: ROTO }, () => {
    const s = r.lasSeccionesDeLaFicha([
        F("empresa", { order: 0 }),
        F("correo", { section: "Contacto", order: 1 }),
        F("x", { section: "Libre", order: 2 }),
        F("web", { section: "Presencia digital", order: 3 }),
    ]);
    assert.deepEqual(s.map((x) => [x.title, x.filas.map((f) => f.campo.key)]), [
        ["Contacto", ["nombre", "telefono", "correo"]],
        ["Datos de negocio", ["empresa"]],
        ["Presencia digital", ["web"]],
        ["Libre", ["x", "notas"]],
    ]);
});

test("Google Sheets sigue exportando Notas, la última", { skip: ROTO }, () => {
    const cols = r.losCamposQueSeExportan([F("empresa", { label: "Empresa" }), F("oculto", { enabled: false })]);
    assert.deepEqual(cols, [{ key: "empresa", label: "Empresa" }, { key: "notas", label: "Notas" }]);
});
