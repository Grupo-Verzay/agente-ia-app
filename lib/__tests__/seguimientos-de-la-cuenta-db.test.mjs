/**
 * Contra Postgres: el mismo número tiene seguimientos en TRES cuentas (y en dos
 * líneas de una de ellas, una guardada por nombre y otra por id). Borrar desde
 * una cuenta se lleva solo los de sus líneas.
 *
 * `MODO=roto` corre el borrado de antes, escrito literal, y AFIRMA que se
 * llevaba los de las otras cuentas.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import("./.compilado/seguimientos-de-la-cuenta/entrada-de-seguimientos-de-la-cuenta.js");

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const JID = `57300${Date.now() % 10000000}@s.whatsapp.net`;
const OTRO_JID = `57311${Date.now() % 10000000}@s.whatsapp.net`;
const A = `sc-a-${V}`, B = `sc-b-${V}`, C = `sc-c-${V}`;
const LINEAS = [
    { userId: A, instanceName: `A_VENTAS_${V}`, instanceId: `a-ventas-${V}` },
    { userId: A, instanceName: `A_SOPORTE_${V}`, instanceId: `a-soporte-${V}` },
    { userId: B, instanceName: `B_LINEA_${V}`, instanceId: `b-linea-${V}` },
    { userId: C, instanceName: `C_LINEA_${V}`, instanceId: `c-linea-${V}` },
];

async function sembrar() {
    await m.db.seguimiento.deleteMany({ where: { remoteJid: { in: [JID, OTRO_JID] } } });
    await m.db.seguimiento.createMany({
        data: [
            { instancia: LINEAS[0].instanceName, remoteJid: JID, mensaje: "a1" },
            { instancia: LINEAS[1].instanceId, remoteJid: JID, mensaje: "a2 (por id)" },
            { instancia: LINEAS[0].instanceName, remoteJid: OTRO_JID, mensaje: "a otro número" },
            { instancia: LINEAS[2].instanceName, remoteJid: JID, mensaje: "b" },
            { instancia: LINEAS[3].instanceId, remoteJid: JID, mensaje: "c" },
        ],
    });
}
const cuantos = (instancias, jid = JID) =>
    m.db.seguimiento.count({ where: { remoteJid: jid, instancia: { in: instancias } } });

test.before(async () => {
    for (const id of [A, B, C]) await m.db.user.create({ data: { id, email: `${id}@banco.test`, name: id } });
    await m.db.instancia.createMany({ data: LINEAS.map((l) => ({ ...l, instanceType: "Whatsapp" })) });
});
test.after(async () => {
    await m.db.seguimiento.deleteMany({ where: { remoteJid: { in: [JID, OTRO_JID] } } });
    await m.db.instancia.deleteMany({ where: { userId: { in: [A, B, C] } } });
    await m.db.user.deleteMany({ where: { id: { in: [A, B, C] } } });
    await m.db.$disconnect();
});

const deB = () => [LINEAS[2].instanceName, LINEAS[2].instanceId];
const deC = () => [LINEAS[3].instanceName, LINEAS[3].instanceId];
const deA = () => LINEAS.slice(0, 2).flatMap((l) => [l.instanceName, l.instanceId]);

if (ROTO) {
    test("ANTES: el borrado por número se llevaba los seguimientos de las OTRAS cuentas", async () => {
        await sembrar();
        await m.db.seguimiento.deleteMany({ where: { remoteJid: JID } }); // literal de antes
        assert.equal(await cuantos(deB()), 0, "el antes tenía que borrar el de la cuenta B");
        assert.equal(await cuantos(deC()), 0, "el antes tenía que borrar el de la cuenta C");
    });
} else {
    test("desde la cuenta A se borran los dos de A (nombre e id) y nada más", async () => {
        await sembrar();
        const n = await m.borrarSeguimientosDelNumeroEnLaCuenta(A, JID);
        assert.equal(n, 2);
        assert.equal(await cuantos(deA()), 0);
        assert.equal(await cuantos(deB()), 1, "el de la cuenta B tiene que seguir");
        assert.equal(await cuantos(deC()), 1, "el de la cuenta C tiene que seguir");
        assert.equal(await cuantos(deA(), OTRO_JID), 1, "otro número de A no se toca");
    });

    test("desde la cuenta B solo el de B (la regla es simétrica)", async () => {
        await sembrar();
        assert.equal(await m.borrarSeguimientosDelNumeroEnLaCuenta(B, JID), 1);
        assert.equal(await cuantos(deA()), 2);
        assert.equal(await cuantos(deC()), 1);
    });

    test("una cuenta sin líneas no borra nada, y sin cuenta tampoco", async () => {
        await sembrar();
        assert.equal(await m.borrarSeguimientosDelNumeroEnLaCuenta(`sc-nadie-${V}`, JID), 0);
        assert.equal(await m.borrarSeguimientosDelNumeroEnLaCuenta(null, JID), 0);
        assert.equal(await m.db.seguimiento.count({ where: { remoteJid: JID } }), 4);
    });
}
