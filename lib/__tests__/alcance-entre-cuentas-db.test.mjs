/**
 * El alcance entre cuentas, contra Postgres y con `currentUser()` DE VERDAD.
 *
 * El árbol es el de producción, con sus nombres: Carlos Arcos
 * (superadministrador) arriba; Verzay | Atencion, Ventas y Notificaciones
 * colgando de él; Ventas colgando además de Atencion; y Yair —administrador de
 * Atencion por `owner_id`—. Más un cliente suelto de la plataforma y una
 * persona del equipo de Carlos.
 *
 * Los cuatro frentes del encargo:
 *
 * 1. «Ingresar» (`impersonateUser`) y la cookie que `currentUser()` vuelve a
 *    leer en cada petición.
 * 2. El conmutador de cuentas: una hija ya no se cambia a su madre.
 * 3. Las consultas de Leads comprueban de quién es el `userId`.
 * 4. `assertCanAccessTargetUser`, la puerta de más de sesenta acciones.
 *
 * `MODO=roto` empaqueta EXACTAMENTE estas pruebas contra el código de antes
 * (commit pinchado en `scripts/banco-alcance-entre-cuentas.sh`) y afirma la
 * fuga: Yair entra como Carlos, Atencion se cambia a Carlos, y cualquiera lee
 * y borra los leads de otra cuenta.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/alcance-antes/entrada-del-alcance.js"
        : "./.compilado/alcance/entrada-del-alcance.js"
);
const {
    ponerLaSesion, lasCookies, currentUser, impersonateUser, switchToAccount,
    getMyLinkedAccounts, assertCanAccessTargetUser, getLeadsPorLinea,
    getSessionsCountByUserId, getSessionsByUserId, searchSessionsByUserId,
    deleteSession, db,
} = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CARLOS = `c-carlos-${V}`;
const ATENCION = `3-atencion-${V}`;
const VENTAS = `c-ventas-${V}`;
const NOTIF = `f-notif-${V}`;
const CLIENTE = `k-cliente-${V}`;
const YAIR = `y-yair-${V}`;
const DE_CARLOS = `p-de-carlos-${V}`;
const CUENTAS = [CARLOS, ATENCION, VENTAS, NOTIF, CLIENTE];
const PERSONAS = [YAIR, DE_CARLOS];

const puedeEntrar = async (quien, a) => {
    ponerLaSesion(quien);
    return impersonateUser(a);
};
const llega = async (quien, a, cookies = {}) => {
    ponerLaSesion(quien, cookies);
    try {
        await assertCanAccessTargetUser(a);
        return true;
    } catch {
        return false;
    }
};

test.before(async () => {
    const roles = { [CARLOS]: "super_admin", [ATENCION]: "admin", [VENTAS]: "admin", [NOTIF]: "admin", [CLIENTE]: "user" };
    for (const id of CUENTAS) {
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: id, role: roles[id] } });
    }
    await db.user.create({ data: { id: YAIR, email: `${YAIR}@banco.test`, name: "Yair", role: "user", ownerId: ATENCION, advisorRole: "administrador" } });
    await db.user.create({ data: { id: DE_CARLOS, email: `${DE_CARLOS}@banco.test`, name: "De Carlos", role: "user", ownerId: CARLOS } });

    const enlaces = [[CARLOS, ATENCION], [CARLOS, VENTAS], [CARLOS, NOTIF], [ATENCION, VENTAS]];
    let n = 0;
    for (const [de, a] of enlaces) {
        await db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" ("id", "master_user_id", "linked_user_id", "role")
             VALUES ($1, $2, $3, 'agente')`, `la-${V}-${n++}`, de, a);
    }
    for (const id of CUENTAS) {
        for (let i = 0; i < 2; i++) {
            await db.session.create({
                data: { userId: id, remoteJid: `57300${i}${n}-${id}@s.whatsapp.net`, pushName: `Lead ${i} de ${id}`, instanceId: `linea-${id}`, status: true },
            });
        }
    }
});

test.after(async () => {
    await db.$executeRawUnsafe(
        `DELETE FROM "linked_accounts" WHERE "master_user_id" = ANY($1::text[]) OR "linked_user_id" = ANY($1::text[])`,
        [...CUENTAS, ...PERSONAS]);
    await db.session.deleteMany({ where: { userId: { in: CUENTAS } } });
    await db.user.deleteMany({ where: { id: { in: PERSONAS } } });
    await db.user.deleteMany({ where: { id: { in: CUENTAS } } });
    await db.$disconnect();
});

// ── 1. «Ingresar» ─────────────────────────────────────────────────────────

test("1. Yair NO entra como Carlos (su madre, superadministrador)", async () => {
    const r = await puedeEntrar(YAIR, CARLOS);
    if (ROTO) return assert.equal(r.success, true, "antes: entraba como Carlos");
    assert.equal(r.success, false);
    assert.equal(lasCookies().impersonate_user_id, undefined, "y no deja cookie puesta");
});

test("1. ni como una persona del equipo de Carlos", async () => {
    const r = await puedeEntrar(YAIR, DE_CARLOS);
    if (ROTO) return assert.equal(r.success, true);
    assert.equal(r.success, false);
});

test("1. ni como Notificaciones, su hermana de la casa", async () => {
    const r = await puedeEntrar(YAIR, NOTIF);
    if (ROTO) return assert.equal(r.success, true);
    assert.equal(r.success, false);
});

test("1. sí entra a lo que cuelga de su cuenta y a un cliente", async () => {
    assert.equal((await puedeEntrar(YAIR, VENTAS)).success, true);
    assert.equal((await puedeEntrar(YAIR, CLIENTE)).success, true);
    assert.equal((await puedeEntrar(CARLOS, ATENCION)).success, true, "el superadmin entra a todas");
});

test("1. una cookie de «Ingresar» ya puesta hacia Carlos NO le da su cuenta", async () => {
    ponerLaSesion(YAIR, { impersonate_user_id: CARLOS });
    const u = await currentUser();
    if (ROTO) return assert.equal(u.id, CARLOS, "antes: la cookie lo convertía en Carlos");
    assert.notEqual(u.id, CARLOS);
    assert.equal(u.porImpersonacion, false);
    assert.equal(u.sessionUserId, YAIR);
});

test("1. y la cookie hacia un cliente sí vale", async () => {
    ponerLaSesion(YAIR, { impersonate_user_id: CLIENTE });
    const u = await currentUser();
    assert.equal(u.id, CLIENTE);
    assert.equal(u.porImpersonacion, true);
});

// ── 2. El conmutador ──────────────────────────────────────────────────────

test("2. Atencion NO se cambia a Carlos, su madre", async () => {
    ponerLaSesion(ATENCION);
    const r = await switchToAccount(CARLOS);
    if (ROTO) return assert.equal(r.success, true, "antes: se cambiaba a su madre");
    assert.equal(r.success, false);
    assert.equal(lasCookies().active_account_id, undefined);
});

test("2. una cookie del conmutador hacia la madre se ignora", async () => {
    ponerLaSesion(ATENCION, { active_account_id: CARLOS });
    const u = await currentUser();
    if (ROTO) return assert.equal(u.id, CARLOS, "antes: actuaba como Carlos");
    assert.equal(u.id, ATENCION);
});

test("2. el menú de cuentas solo ofrece las que cuelgan de ella", async () => {
    ponerLaSesion(ATENCION);
    const r = await getMyLinkedAccounts();
    const ofrecidas = r.data.accounts.map((a) => a.accountUserId).sort();
    if (ROTO) return assert.ok(ofrecidas.includes(CARLOS), "antes: le ofrecía a su madre");
    assert.deepEqual(ofrecidas, [VENTAS]);
});

test("2. bajar sigue funcionando: Atencion se cambia a Ventas", async () => {
    ponerLaSesion(ATENCION);
    assert.equal((await switchToAccount(VENTAS)).success, true);
    ponerLaSesion(ATENCION, { active_account_id: VENTAS });
    assert.equal((await currentUser()).id, VENTAS);
});

// ── 3. Leads ──────────────────────────────────────────────────────────────

test("3. un cliente cualquiera NO lee los leads de Atencion", async () => {
    ponerLaSesion(CLIENTE);
    const lista = await getSessionsByUserId(ATENCION);
    const cuenta = await getSessionsCountByUserId(ATENCION);
    const busca = await searchSessionsByUserId(ATENCION, "Lead");
    const lineas = await getLeadsPorLinea(ATENCION);
    if (ROTO) {
        assert.equal(lista.data.length, 2, "antes: los leía");
        assert.equal(cuenta.data.total, 2);
        assert.equal(busca.data.length, 2);
        assert.equal(lineas.success, true);
        return;
    }
    for (const r of [lista, cuenta, busca, lineas]) assert.equal(r.success, false);
});

test("3. ni borra uno", async () => {
    const lead = await db.session.findFirst({ where: { userId: ATENCION } });
    ponerLaSesion(CLIENTE);
    const r = await deleteSession(ATENCION, lead.id, lead.remoteJid);
    const sigue = await db.session.findUnique({ where: { id: lead.id } });
    if (ROTO) return assert.equal(sigue, null, "antes: lo borraba");
    assert.equal(r.success, false);
    assert.ok(sigue, "el lead sigue ahí");
});

test("3. la propia cuenta sí lee sus leads", async () => {
    ponerLaSesion(ATENCION);
    const r = await getSessionsByUserId(ATENCION);
    assert.equal(r.success, true);
    assert.ok(r.data.length >= 1);
});

// ── 4. assertCanAccessTargetUser ──────────────────────────────────────────

test("4. Atencion (admin) NO llega a Carlos", async () => {
    const r = await llega(ATENCION, CARLOS);
    if (ROTO) return assert.equal(r, true, "antes: el vínculo valía en los dos sentidos");
    assert.equal(r, false);
});

test("4. Yair tampoco llega a Carlos ni a su equipo", async () => {
    const a = await llega(YAIR, CARLOS);
    const b = await llega(YAIR, DE_CARLOS);
    if (ROTO) return assert.equal(a && b, true);
    assert.equal(a, false);
    assert.equal(b, false);
});

test("4. Ventas NO llega a Atencion, que está por encima", async () => {
    const r = await llega(VENTAS, ATENCION);
    if (ROTO) return assert.equal(r, true);
    assert.equal(r, false);
});

test("4. Atencion NO llega a Notificaciones, su hermana", async () => {
    const r = await llega(ATENCION, NOTIF);
    if (ROTO) return assert.equal(r, true, "antes: el rol admin abría cualquier cuenta");
    assert.equal(r, false);
});

test("4. lo de abajo y los clientes siguen pasando", async () => {
    assert.equal(await llega(ATENCION, VENTAS), true);
    assert.equal(await llega(YAIR, VENTAS), true);
    assert.equal(await llega(ATENCION, CLIENTE), true);
    assert.equal(await llega(YAIR, ATENCION), true, "su propia cuenta");
    assert.equal(await llega(CARLOS, NOTIF), true, "el superadmin llega a todo");
    assert.equal(await llega(CARLOS, ATENCION), true);
});

test("4. un cliente no llega a otro", async () => {
    assert.equal(await llega(CLIENTE, ATENCION), false);
});
