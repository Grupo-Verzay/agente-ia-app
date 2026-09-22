/**
 * La bandeja de Chats alcanza HACIA ABAJO: nunca las líneas de la madre ni las
 * de las hermanas. Contra Postgres y con `currentUser()` DE VERDAD; lo único
 * fingido es la petición (quién inició sesión y qué cookies trae).
 *
 * El árbol es el de producción: Carlos Arcos (superadministrador) arriba;
 * Verzay | Atencion, Ventas y Notificaciones colgando de él; Ventas colgando
 * además de Atencion; Yair —administrador de Atencion por `owner_id`— y un
 * agente de Atencion. Más una cuenta ajena a la familia.
 *
 * Los cinco frentes del encargo, cada uno por su puerta de verdad:
 *
 * 1. Qué líneas enseña la bandeja.
 * 2. El alcance de las rutas de la bandeja (`getAssociatedAccountIds`).
 * 3. «Enviar por otra línea» (`getAccountLinesAction`).
 * 4. Las notas: con quién se puede compartir.
 * 5. El token de tiempo real: a qué salas se une el navegador.
 *
 * `MODO=roto` empaqueta ESTAS MISMAS pruebas contra el código de antes (commit
 * pinchado en el script) y afirma la fuga: la hija ve, recibe y ofrece las
 * líneas de su madre.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/bandeja-antes/entrada-de-la-bandeja.js"
        : "./.compilado/bandeja/entrada-de-la-bandeja.js"
);
const {
    ponerLaSesion, currentUser, getAssociatedAccountIds, tokenDeTiempoReal,
    getAccountLinesAction, getTeamAccounts, setNoteShare, lineasDeLaBandeja, db,
} = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CARLOS = `c-carlos-${V}`;
const ATENCION = `3-atencion-${V}`;
const VENTAS = `c-ventas-${V}`;
const NOTIF = `f-notif-${V}`;
const AJENA = `z-ajena-${V}`;
const YAIR = `y-yair-${V}`;
const AGENTE = `y-agente-${V}`;
const CUENTAS = [CARLOS, ATENCION, VENTAS, NOTIF, AJENA];
const PERSONAS = [YAIR, AGENTE];
const linea = (c) => `linea-${c}`;

async function alcance(quien) {
    ponerLaSesion(quien);
    return getAssociatedAccountIds(await currentUser());
}
async function lineas(quien) {
    ponerLaSesion(quien);
    return new Set(await lineasDeLaBandeja());
}
async function lineasParaEnviar(quien) {
    ponerLaSesion(quien);
    const r = await getAccountLinesAction();
    return new Set(r.data.map((l) => l.instanceName));
}
async function salas(quien) {
    ponerLaSesion(quien);
    const res = await tokenDeTiempoReal();
    const { token } = await res.json();
    const cuerpo = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    return new Set(cuerpo.userIds);
}
async function equipoDeNotas(quien, cuenta) {
    ponerLaSesion(quien);
    const r = await getTeamAccounts(cuenta);
    return new Set(r.data.map((x) => x.id));
}

let NOTA_DE_ATENCION;
let NOTA_DE_VENTAS;

test.before(async () => {
    process.env.REALTIME_JWT_SECRET = "banco";
    process.env.REALTIME_URL = "http://localhost";
    const roles = { [CARLOS]: "super_admin", [ATENCION]: "admin", [VENTAS]: "admin", [NOTIF]: "admin", [AJENA]: "admin" };
    for (const id of CUENTAS) {
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: id, company: id, role: roles[id] } });
        await db.instancia.create({ data: { instanceName: linea(id), instanceId: `iid-${id}`, userId: id, instanceType: "Whatsapp" } });
    }
    await db.user.create({ data: { id: YAIR, email: `${YAIR}@banco.test`, name: "Yair", role: "user", ownerId: ATENCION, advisorRole: "administrador" } });
    await db.user.create({ data: { id: AGENTE, email: `${AGENTE}@banco.test`, name: "Agente", role: "user", ownerId: ATENCION, advisorRole: "agente" } });

    const enlaces = [[CARLOS, ATENCION], [CARLOS, VENTAS], [CARLOS, NOTIF], [ATENCION, VENTAS]];
    let n = 0;
    for (const [de, a] of enlaces) {
        await db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" ("id", "master_user_id", "linked_user_id", "role")
             VALUES ($1, $2, $3, 'agente')`, `bj-${V}-${n++}`, de, a);
    }
    NOTA_DE_ATENCION = (await db.userNote.create({ data: { userId: ATENCION, title: "de Atencion" } })).id;
    NOTA_DE_VENTAS = (await db.userNote.create({ data: { userId: VENTAS, title: "de Ventas" } })).id;
});

test.after(async () => {
    await db.$executeRawUnsafe(
        `DELETE FROM "linked_accounts" WHERE "master_user_id" = ANY($1::text[]) OR "linked_user_id" = ANY($1::text[])`,
        [...CUENTAS, ...PERSONAS]);
    await db.noteShare.deleteMany({ where: { noteId: { in: [NOTA_DE_ATENCION, NOTA_DE_VENTAS] } } });
    await db.userNote.deleteMany({ where: { userId: { in: CUENTAS } } });
    await db.instancia.deleteMany({ where: { userId: { in: CUENTAS } } });
    await db.user.deleteMany({ where: { id: { in: PERSONAS } } });
    await db.user.deleteMany({ where: { id: { in: CUENTAS } } });
    await db.$disconnect();
});

// ── 1. Las líneas de la bandeja ───────────────────────────────────────────

test("1. Ventas (hija) NO ve en su bandeja las líneas de Carlos ni de Atencion, sus madres", async () => {
    const l = await lineas(VENTAS);
    if (ROTO) {
        assert.ok(l.has(linea(CARLOS)) && l.has(linea(ATENCION)), "antes: la hija veía las líneas de sus madres");
        return;
    }
    assert.deepEqual([...l], [linea(VENTAS)]);
});

test("1. Atencion ve las suyas y las de Ventas, que cuelga de ella; ni Carlos ni Notificaciones (hermana)", async () => {
    const l = await lineas(ATENCION);
    if (ROTO) return assert.ok(l.has(linea(CARLOS)), "antes: veía las de su madre");
    assert.ok(l.has(linea(ATENCION)) && l.has(linea(VENTAS)));
    assert.ok(!l.has(linea(CARLOS)), "la madre no");
    assert.ok(!l.has(linea(NOTIF)), "la hermana no");
    assert.ok(!l.has(linea(AJENA)));
});

test("1. Yair, administrador de Atencion, ve lo mismo que su cuenta", async () => {
    const l = await lineas(YAIR);
    assert.ok(l.has(linea(ATENCION)) && l.has(linea(VENTAS)));
    assert.ok(!l.has(linea(CARLOS)) && !l.has(linea(NOTIF)));
});

test("1. un agente de Atencion, solo las de Atencion", async () => {
    assert.deepEqual([...(await lineas(AGENTE))], [linea(ATENCION)]);
});

test("2. Carlos, superadministrador, ve TODAS las de su familia y ninguna de fuera", async (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma su fallo");
    const l = await lineas(CARLOS);
    for (const c of [CARLOS, ATENCION, VENTAS, NOTIF]) assert.ok(l.has(linea(c)), `Carlos ve ${c}`);
    assert.ok(!l.has(linea(AJENA)));
});

// ── 2. El alcance de las rutas de la bandeja ──────────────────────────────

test("2. las rutas de la bandeja no alcanzan a la madre", async () => {
    const a = await alcance(ATENCION);
    const y = await alcance(YAIR);
    if (ROTO) return assert.ok(a.includes(CARLOS) && y.includes(CARLOS), "antes: la ruta aceptaba la línea de la madre");
    for (const lista of [a, y]) {
        assert.ok(lista.includes(ATENCION) && lista.includes(VENTAS));
        assert.ok(!lista.includes(CARLOS) && !lista.includes(NOTIF) && !lista.includes(AJENA));
    }
    const v = await alcance(VENTAS);
    assert.deepEqual(v, [VENTAS]);
    const c = await alcance(CARLOS);
    for (const x of [CARLOS, ATENCION, VENTAS, NOTIF]) assert.ok(c.includes(x));
    assert.ok(!c.includes(AJENA));
});

// ── 3. Enviar por otra línea ──────────────────────────────────────────────

test("3. «Enviar por otra línea» no ofrece las líneas de la madre ni de la hermana", async () => {
    const v = await lineasParaEnviar(VENTAS);
    const a = await lineasParaEnviar(ATENCION);
    if (ROTO) return assert.ok(v.has(linea(CARLOS)) && a.has(linea(CARLOS)), "antes: ofrecía la línea de la madre");
    assert.deepEqual([...v], [linea(VENTAS)]);
    assert.ok(a.has(linea(ATENCION)) && a.has(linea(VENTAS)));
    assert.ok(!a.has(linea(CARLOS)) && !a.has(linea(NOTIF)));
});

// ── 4. Las notas ──────────────────────────────────────────────────────────

test("4. las notas no enseñan ni dejan compartir con la madre ni con la hermana", async () => {
    const eA = await equipoDeNotas(ATENCION, ATENCION);
    const eV = await equipoDeNotas(VENTAS, VENTAS);
    ponerLaSesion(VENTAS);
    const aCarlos = await setNoteShare(NOTA_DE_VENTAS, VENTAS, CARLOS, "read");
    if (ROTO) {
        assert.ok(eA.has(CARLOS) && eV.has(CARLOS), "antes: el selector ofrecía a la madre, con nombre y correo");
        assert.equal(aCarlos.success, true, "antes: se le compartía una nota a la madre");
        return;
    }
    assert.ok(eA.has(VENTAS) && eA.has(YAIR) && eA.has(AGENTE), "su hija y su equipo, sí");
    assert.ok(!eA.has(CARLOS) && !eA.has(NOTIF), "ni la madre ni la hermana");
    assert.ok(!eV.has(CARLOS) && !eV.has(ATENCION) && !eV.has(NOTIF));
    assert.equal(aCarlos.success, false);
    ponerLaSesion(ATENCION);
    assert.equal((await setNoteShare(NOTA_DE_ATENCION, ATENCION, NOTIF, "read")).success, false, "a la hermana, no");
    assert.equal((await setNoteShare(NOTA_DE_ATENCION, ATENCION, VENTAS, "read")).success, true, "a su hija, sí");
});

// ── 5. El tiempo real ─────────────────────────────────────────────────────

test("5. la hija no se une a la sala de su madre: no recibe sus avisos en vivo", async () => {
    const v = await salas(VENTAS);
    const y = await salas(YAIR);
    if (ROTO) return assert.ok(v.has(CARLOS) && v.has(ATENCION), "antes: Ventas escuchaba las salas de sus madres");
    assert.ok(!v.has(CARLOS) && !v.has(ATENCION) && !v.has(NOTIF));
    assert.ok(v.has(VENTAS));
    assert.ok(y.has(ATENCION) && y.has(VENTAS), "Yair escucha su cuenta y la de su hija");
    assert.ok(!y.has(CARLOS) && !y.has(NOTIF));
    const a = await salas(AGENTE);
    assert.ok(a.has(ATENCION) && !a.has(VENTAS), "un agente, solo su cuenta: lo mismo que su bandeja");
    const c = await salas(CARLOS);
    for (const x of [CARLOS, ATENCION, VENTAS, NOTIF]) assert.ok(c.has(x), `Carlos escucha ${x}`);
    assert.ok(!c.has(AJENA));
});
