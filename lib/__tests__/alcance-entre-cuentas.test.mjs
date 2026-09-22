/**
 * La regla pura del alcance entre cuentas (`lib/alcance-entre-cuentas.ts`).
 *
 * Con el árbol de producción: Carlos (superadministrador) arriba, Atencion y
 * Notificaciones colgando de él, y Ventas colgando de Carlos y de Atencion.
 *
 * `MODO=roto` lleva la regla VIEJA —«con rol de gestión se llega a todo»— y
 * afirma que con ella Atencion llega a Carlos y a su hermana.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { puedeLlegarA, cuelgaHaciaAbajo } from "./.compilado/alcance/alcance-entre-cuentas.js";

const ROTO = process.env.MODO === "roto";

const ENLACES = [
    { de: "carlos", a: "atencion" },
    { de: "carlos", a: "ventas" },
    { de: "carlos", a: "notif" },
    { de: "atencion", a: "ventas" },
];

const CUENTA = (id, rol) => ({ id, role: rol, cuentaId: id, rolDeLaCuenta: rol });

/** La regla que había: el rol de gestión abría cualquier cuenta. */
const reglaVieja = () => ({ puede: true });
const regla = ROTO ? reglaVieja : puedeLlegarA;

const desde = (cuenta, objetivo, extra = {}) =>
    regla({ esSuperAdmin: false, cuenta, objetivo, enlaces: ENLACES, ...extra });

test("una cuenta NO llega a su madre superadministradora", () => {
    const v = desde("atencion", CUENTA("carlos", "super_admin"));
    if (ROTO) return assert.equal(v.puede, true, "antes: Atencion llegaba a Carlos");
    assert.deepEqual(v, { puede: false, motivo: "superadmin" });
});

test("ni a una persona del equipo de Carlos: se juzga por su CUENTA", () => {
    const v = desde("atencion", { id: "p", role: "user", cuentaId: "carlos", rolDeLaCuenta: "super_admin" });
    if (ROTO) return assert.equal(v.puede, true);
    assert.equal(v.puede, false);
});

test("una hija no llega a su madre aunque la madre no sea superadmin", () => {
    const v = desde("ventas", CUENTA("atencion", "admin"));
    if (ROTO) return assert.equal(v.puede, true, "antes: Ventas llegaba a Atencion");
    assert.deepEqual(v, { puede: false, motivo: "por-encima" });
});

test("ni a una HERMANA de la casa", () => {
    const v = desde("atencion", CUENTA("notif", "admin"));
    if (ROTO) return assert.equal(v.puede, true, "antes: Atencion llegaba a Notificaciones");
    assert.deepEqual(v, { puede: false, motivo: "otra-cuenta-de-la-casa" });
});

test("sí llega a lo que cuelga de ella y a los clientes", () => {
    assert.equal(desde("atencion", CUENTA("ventas", "admin")).puede, true);
    assert.equal(desde("atencion", CUENTA("un-cliente", "user")).puede, true);
    assert.equal(desde("atencion", CUENTA("atencion", "admin")).puede, true);
});

test("el superadministrador llega a todo", () => {
    assert.equal(regla({ esSuperAdmin: true, cuenta: "carlos", objetivo: CUENTA("x", "super_admin"), enlaces: ENLACES }).puede, true);
});

test("una pareja recíproca no se alcanza entre sí como cuenta de la casa", { skip: ROTO }, () => {
    const mutuos = [{ de: "a", a: "b" }, { de: "b", a: "a" }];
    const v = puedeLlegarA({ esSuperAdmin: false, cuenta: "a", objetivo: CUENTA("b", "admin"), enlaces: mutuos });
    assert.equal(v.puede, false);
});

test("cuelgaHaciaAbajo baja, no sube ni cruza", { skip: ROTO }, () => {
    assert.equal(cuelgaHaciaAbajo("atencion", "ventas", ENLACES), true);
    assert.equal(cuelgaHaciaAbajo("carlos", "ventas", ENLACES), true);
    assert.equal(cuelgaHaciaAbajo("ventas", "atencion", ENLACES), false);
    assert.equal(cuelgaHaciaAbajo("atencion", "notif", ENLACES), false);
    assert.equal(cuelgaHaciaAbajo("atencion", "atencion", ENLACES), false);
});
