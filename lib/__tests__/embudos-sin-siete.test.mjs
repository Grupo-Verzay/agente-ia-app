/**
 * El «antes» de las siete etapas, afirmado contra Postgres.
 *
 * Corre las acciones de embudos tal como estaban ANTES de este cambio, sacadas
 * de git (`ANTES_DE_LAS_SIETE`), y afirma los tres fallos que se venían a
 * arreglar:
 *
 *  1. Una cuenta nueva abría el tablero **sin ningún embudo**: el dueño veía
 *     «Aún no hay embudos en esta cuenta» y tenía que crear el primero a mano.
 *  2. Un embudo nacía con **tres** etapas —Nuevo, En proceso, Cerrado—, no con
 *     las siete.
 *  3. **Ninguna era del sistema**, así que se podían borrar todas menos una: no
 *     había ni Ganado ni Perdido que conservar, y por tanto ninguna columna a la
 *     que ponerle el botón de vaciar.
 *
 * Va en su propio fichero y **corre siempre**, no detrás de un `MODO=roto`: así
 * no se puede quedar verde por no haberse ejecutado, que es la peor forma de
 * tener un modo roto. Lo que hace lo contrario —el embudo que nace solo, las
 * siete etapas, las tres de sistema— lo prueba `embudos-db.test.mjs`.
 *
 * Se levanta con `scripts/banco-embudos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const M = await import("./.compilado/embudos/entrada-de-embudos-sin-siete.js");
const { ponerAQuienMira, db } = M;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DUENO = `s7-dueno-${V}`;

test.before(async () => {
    await db.user.create({ data: { id: DUENO, email: `${DUENO}@b.t`, name: "Dueño", role: "user" } });
});

test.after(async () => {
    await db.$disconnect();
});

const comoDueno = () =>
    ponerAQuienMira({
        id: DUENO,
        sessionUserId: DUENO,
        effectiveId: DUENO,
        ownerId: null,
        advisorRole: null,
        role: "user",
        rolDeLaPersona: "user",
        email: `${DUENO}@banco.test`,
        name: DUENO,
    });

test("ANTES: una cuenta nueva abría el tablero sin ningún embudo", async () => {
    comoDueno();
    const r = await M.tableroDelEmbudoAction(null);
    assert.equal(r.success, true, r.message);
    assert.equal(r.data.embudoId, null, "con el código de antes el embudo NO nacía solo");
    assert.deepEqual(r.data.embudos, []);
});

test("ANTES: un embudo nacía con tres etapas, ninguna del sistema", async () => {
    comoDueno();
    const c = await M.crearEmbudoAction("Viejo");
    assert.equal(c.success, true, c.message);
    const d = (await M.tableroDelEmbudoAction(c.data.id)).data;
    assert.deepEqual(
        d.etapas.map((e) => e.nombre),
        ["Nuevo", "En proceso", "Cerrado"],
    );
    // Ninguna traía marca de sistema: no había Perdido que vaciar.
    for (const e of d.etapas) assert.equal(e.sistema, undefined);
});

test("ANTES: se podía borrar la última etapa, así que no había columna de Perdido", async () => {
    comoDueno();
    const c = await M.crearEmbudoAction("Otro");
    const d = (await M.tableroDelEmbudoAction(c.data.id)).data;
    // Se guarda la lista con solo la primera: las otras dos se van sin queja.
    const r = await M.guardarEtapasAction(c.data.id, [{ id: d.etapas[0].id, nombre: "Solo una", color: null }]);
    assert.equal(r.success, true, r.message);
    const v = (await M.tableroDelEmbudoAction(c.data.id)).data;
    assert.deepEqual(v.etapas.map((e) => e.nombre), ["Solo una"]);
});
