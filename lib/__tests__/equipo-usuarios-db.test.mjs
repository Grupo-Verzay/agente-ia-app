/**
 * Usuarios (`/equipo`): las ACCIONES de verdad contra Postgres, con
 * `currentUser()` DE VERDAD (solo se finge la sesión y las cookies).
 *
 * El árbol:
 *  - SUPER, la cuenta de la plataforma (`super_admin`);
 *  - CASA, una cuenta de la casa (`admin`), y CLIENTE_CASA, un cliente suyo;
 *  - DUENO, una cuenta cliente con su equipo: ANA (administradora) y BETO
 *    (agente);
 *  - AJENA, otra empresa que no tiene nada que ver con DUENO;
 *  - OTRA, otra cuenta donde BETO también atiende.
 *
 * Lo que se prueba, en este orden (el último paso borra los vínculos de toda
 * la base, así que va al final):
 *  1. una cuenta cliente NO se apropia de otra escribiendo su correo, ni desde
 *     Usuarios ni desde el conmutador;
 *  2. la casa SÍ vincula a un cliente suyo;
 *  3. las métricas cuentan solo las conversaciones de la cuenta;
 *  4. «Asignar sin atender» funciona para la administradora del equipo;
 *  5. reiniciar los vínculos: una cuenta `admin` no puede, el súper
 *     administrador sin la palabra tampoco, y con ella sí.
 *
 * `MODO=roto` empaqueta ESTAS MISMAS pruebas contra el código de antes y
 * AFIRMA cada fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/equipo-usuarios-antes/entrada-de-equipo-usuarios.js"
        : "./.compilado/equipo-usuarios/entrada-de-equipo-usuarios.js"
);
const { ponerLaSesion, equipo, vinculos, asignar, db } = m;
const SOLO_LO_QUE_YA_ADMINISTRAS =
    "Solo puedes vincular una cuenta que ya administras. Si es de otra empresa, pídeselo a soporte.";

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SUPER = `eu-super-${V}`;
const CASA = `eu-casa-${V}`;
const CLIENTE_CASA = `eu-clientecasa-${V}`;
const DUENO = `eu-dueno-${V}`;
const ANA = `eu-ana-${V}`;
const BETO = `eu-beto-${V}`;
const AJENA = `eu-ajena-${V}`;
const OTRA = `eu-otra-${V}`;
const TODOS = [SUPER, CASA, CLIENTE_CASA, DUENO, ANA, BETO, AJENA, OTRA];
const correo = (id) => `${id}@banco.test`;

const como = async (quien, fn) => {
    ponerLaSesion(quien);
    return fn();
};
const vinculo = async (master, linked) =>
    Number(
        (await db.$queryRawUnsafe(
            `SELECT COUNT(*)::int AS n FROM "linked_accounts" WHERE "master_user_id" = $1 AND "linked_user_id" = $2`,
            master, linked,
        ))[0].n,
    );
const totalDeVinculos = async () =>
    Number((await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "linked_accounts"`))[0].n);

let jid = 0;
async function sesion(userId, extra = {}) {
    jid += 1;
    return db.session.create({
        data: {
            userId, remoteJid: `57310${String(jid).padStart(7, "0")}@s.whatsapp.net`,
            pushName: `Cliente ${jid}`, instanceId: "LINEA", status: true, ...extra,
        },
    });
}

test.before(async () => {
    await db.user.create({ data: { id: SUPER, email: correo(SUPER), name: "Súper", role: "super_admin" } });
    await db.user.create({ data: { id: CASA, email: correo(CASA), name: "Casa", role: "admin" } });
    await db.user.create({ data: { id: CLIENTE_CASA, email: correo(CLIENTE_CASA), name: "Cliente de la casa", role: "user" } });
    await db.user.create({ data: { id: DUENO, email: correo(DUENO), name: "Dueño", role: "user", autoAssignMaxChats: 0 } });
    await db.user.create({ data: { id: ANA, email: correo(ANA), name: "Ana", role: "user", ownerId: DUENO, advisorRole: "administrador", advisorAvailable: true } });
    await db.user.create({ data: { id: BETO, email: correo(BETO), name: "Beto", role: "user", ownerId: DUENO, advisorRole: "agente", advisorAvailable: true } });
    await db.user.create({ data: { id: AJENA, email: correo(AJENA), name: "Ajena", role: "user" } });
    await db.user.create({ data: { id: OTRA, email: correo(OTRA), name: "Otra", role: "user" } });

    // Beto lleva 2 conversaciones de DUENO y 3 de OTRA; y DUENO tiene 2 sin asesor.
    await sesion(DUENO, { assignedAdvisorId: BETO });
    await sesion(DUENO, { assignedAdvisorId: BETO, leadStatus: "CALIENTE" });
    for (let i = 0; i < 3; i++) await sesion(OTRA, { assignedAdvisorId: BETO, leadStatus: "CALIENTE" });
    await sesion(DUENO);
    await sesion(DUENO);
});

test.after(async () => {
    await db.$executeRawUnsafe(`DELETE FROM "linked_accounts" WHERE "master_user_id" = ANY($1) OR "linked_user_id" = ANY($1)`, TODOS).catch(() => {});
    await db.$executeRawUnsafe(`DELETE FROM "AssignmentLog" WHERE "sessionId" IN (SELECT id FROM "Session" WHERE "userId" = ANY($1))`, TODOS).catch(() => {});
    await db.session.deleteMany({ where: { userId: { in: TODOS } } });
    await db.user.updateMany({ where: { id: { in: TODOS } }, data: { ownerId: null } });
    await db.user.deleteMany({ where: { id: { in: TODOS } } });
    await db.$disconnect();
});

test("1a · una cuenta cliente no se apropia de otra desde «Vincular existente»", async () => {
    const r = await como(DUENO, () => equipo.linkExistingAdvisor(correo(AJENA), "agente"));
    if (ROTO) {
        assert.equal(r.success, true, "en ANTES bastaba con escribir el correo");
        assert.equal(await vinculo(DUENO, AJENA), 1);
        await db.$executeRawUnsafe(`DELETE FROM "linked_accounts" WHERE "master_user_id" = $1`, DUENO);
    } else {
        assert.equal(r.success, false);
        assert.equal(r.message, SOLO_LO_QUE_YA_ADMINISTRAS);
        assert.equal(await vinculo(DUENO, AJENA), 0, "no se escribe ninguna fila");
    }
});

test("1b · ni desde «Agregar cuenta» del conmutador", async () => {
    const r = await como(DUENO, () => vinculos.addLinkedAccount(correo(AJENA), "agente"));
    if (ROTO) {
        assert.equal(r.success, true);
        assert.equal(await vinculo(DUENO, AJENA), 1);
        await db.$executeRawUnsafe(`DELETE FROM "linked_accounts" WHERE "master_user_id" = $1`, DUENO);
    } else {
        assert.equal(r.success, false);
        assert.equal(r.message, SOLO_LO_QUE_YA_ADMINISTRAS);
        assert.equal(await vinculo(DUENO, AJENA), 0);
    }
});

test("2 · la casa SÍ vincula a un cliente suyo", async () => {
    const r = await como(CASA, () => equipo.linkExistingAdvisor(correo(CLIENTE_CASA), "agente"));
    assert.equal(r.success, true, r.message);
    assert.equal(await vinculo(CASA, CLIENTE_CASA), 1);
});

test("3 · las métricas cuentan solo las conversaciones de la cuenta", async () => {
    const r = await como(DUENO, () => equipo.getTeamMetrics());
    assert.equal(r.success, true, r.message);
    const beto = r.data.advisors.find((a) => a.id === BETO);
    assert.ok(beto, "Beto sale en las métricas de su cuenta");
    if (ROTO) {
        assert.equal(beto.totalAssigned, 5, "en ANTES sumaba las 3 de la otra cuenta");
        assert.equal(beto.hotCount, 4);
    } else {
        assert.equal(beto.totalAssigned, 2);
        assert.equal(beto.activeCount, 2);
        assert.equal(beto.hotCount, 1);
    }
    // Y la tabla de al lado (getTeamAdvisors) cuenta lo mismo: 2.
    const t = await como(DUENO, () => equipo.getTeamAdvisors());
    assert.equal(t.data.find((a) => a.id === BETO).activeCount, 2);
});

test("4 · «Asignar sin atender» funciona para la administradora del equipo", async () => {
    const sinAsesorAntes = await db.session.count({ where: { userId: DUENO, assignedAdvisorId: null } });
    assert.equal(sinAsesorAntes, 2);
    const r = await como(ANA, () => asignar.bulkAutoAssign());
    if (ROTO) {
        assert.equal(r.success, false, "en ANTES le contestaba «Solo el dueño»");
        assert.equal(await db.session.count({ where: { userId: DUENO, assignedAdvisorId: null } }), 2);
    } else {
        assert.equal(r.success, true, r.message);
        assert.ok(r.assigned >= 1, `asignó ${r.assigned}`);
        assert.ok((await db.session.count({ where: { userId: DUENO, assignedAdvisorId: null } })) < 2);
    }
    // Un agente sigue sin poder.
    const b = await como(BETO, () => asignar.bulkAutoAssign());
    assert.equal(b.success, false);
});

test("5a · una cuenta `admin` no reinicia los vínculos de toda la plataforma", async () => {
    const antes = await totalDeVinculos();
    assert.ok(antes >= 1);
    const r = await como(CASA, () => vinculos.resetAllLinkedAccounts("LIMPIAR"));
    if (ROTO) {
        assert.equal(r.success, true, "en ANTES bastaba con ser admin");
        assert.equal(await totalDeVinculos(), 0);
        // Y descolgó al equipo de su cuenta.
        assert.equal((await db.user.findUnique({ where: { id: ANA } })).ownerId, null);
        await db.user.updateMany({ where: { id: { in: [ANA, BETO] } }, data: { ownerId: DUENO } });
        await db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" (id, "master_user_id", "linked_user_id", role) VALUES ($1, $2, $3, 'agente')`,
            `eu-${V}`, CASA, CLIENTE_CASA,
        );
    } else {
        assert.equal(r.success, false);
        assert.equal(await totalDeVinculos(), antes);
        assert.equal((await db.user.findUnique({ where: { id: ANA } })).ownerId, DUENO);
    }
});

test("5b · el súper administrador sin la palabra tampoco", async () => {
    const antes = await totalDeVinculos();
    const r = await como(SUPER, () => vinculos.resetAllLinkedAccounts());
    if (ROTO) {
        assert.equal(r.success, true, "en ANTES no pedía confirmar nada");
        await db.user.updateMany({ where: { id: { in: [ANA, BETO] } }, data: { ownerId: DUENO } });
    } else {
        assert.equal(r.success, false);
        assert.equal(r.message, "Escribe LIMPIAR para confirmar.");
        assert.equal(await totalDeVinculos(), antes);
    }
});

test("5c · el súper administrador tecleando la palabra, sí", async () => {
    const r = await como(SUPER, () => vinculos.resetAllLinkedAccounts("LIMPIAR"));
    assert.equal(r.success, true, r.message);
    assert.equal(await totalDeVinculos(), 0);
});

test("6 · guardar la auto-asignación encendida dice cuántas conversaciones repartió", async () => {
    // Cambiar de modo (o encender el interruptor) guarda, y guardar con la
    // auto-asignación encendida REPARTE en ese momento lo que estaba sin
    // asesor. Eso cambia datos: la respuesta tiene que decir cuántas.
    const D = `eu-dueno6-${V}`;
    const G = `eu-gente6-${V}`;
    await db.user.create({ data: { id: D, email: correo(D), name: "Dueño 6", role: "user", autoAssignMaxChats: 0 } });
    await db.user.create({ data: { id: G, email: correo(G), name: "Gente 6", role: "user", ownerId: D, advisorRole: "agente", advisorAvailable: true } });
    await sesion(D);
    await sesion(D);
    try {
        const r = await como(D, () => equipo.saveAutoAssignSettings({ enabled: true, maxChats: 0, modo: "ilimitado" }));
        assert.equal(r.success, true, r.message);
        assert.equal(await db.session.count({ where: { userId: D, assignedAdvisorId: null } }), 0, "no repartió lo que estaba sin asesor");
        if (ROTO) {
            assert.equal(r.data, undefined, "en ANTES ya devolvía cuántas");
            assert.match(r.message, /^Configuracion guardada/, "en ANTES el mensaje iba sin tildes");
        } else {
            assert.deepEqual(r.data, { asignadas: 2 });
            assert.equal(r.message, "Configuración guardada. 2 conversaciones sin asesor asignadas.");
            // Sin nada pendiente, se dice lo de siempre y cero.
            const otra = await como(D, () => equipo.saveAutoAssignSettings({ enabled: true, maxChats: 3, modo: "maximo" }));
            assert.deepEqual(otra.data, { asignadas: 0 });
            assert.equal(otra.message, "Configuración guardada.");
        }
    } finally {
        await db.$executeRawUnsafe(`DELETE FROM "AssignmentLog" WHERE "sessionId" IN (SELECT id FROM "Session" WHERE "userId" = $1)`, D).catch(() => {});
        await db.session.deleteMany({ where: { userId: D } });
        await db.user.deleteMany({ where: { id: G } });
        await db.user.deleteMany({ where: { id: D } });
    }
});
