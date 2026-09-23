/**
 * El historial del chat de equipo y el orden de los directos.
 *
 * Tres cosas, contra Postgres y con las ACCIONES de verdad:
 *
 * 1. **Limpiar el historial** de un canal, del General o de un directo: solo el
 *    súper administrador, con la palabra tecleada, y sin tocar otra
 *    conversación ni el General de otra familia.
 * 2. **Un puesto que cambia de ocupante** —Equipo › Editar asesor con «Entra
 *    otra persona»—: sus directos arrancan vacíos, sus menciones pendientes y
 *    los dispositivos de la persona anterior se van, y lo que escribió en un
 *    canal de área se queda. Sin la marca no se borra nada.
 * 3. **El orden de los directos es de cada persona**: se guarda con su id,
 *    nadie se lo puede escribir a otro, y lo que llega de fuera se filtra.
 *
 * El árbol: SUPER, cuenta raíz con rol `super_admin` (la casa); ANA,
 * administradora de su equipo; BETO, agente; CARLA, agente. Y OTRA, una cuenta
 * ajena a la familia con su propio General y su propio canal.
 *
 * `MODO=roto` empaqueta ESTAS MISMAS pruebas contra el código de antes y
 * afirma el fallo: no hay acción de limpiar, la persona nueva lee la
 * conversación de la anterior y el orden de los directos no se guarda.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/historial-antes/entrada-del-historial.js"
        : "./.compilado/historial/entrada-del-historial.js"
);
const { ponerLaSesion, chat, equipo, orden, db } = m;
const reglas = ROTO ? null : await import("./.compilado/historial/historial-del-equipo.js");
const ordenPuro = ROTO ? null : await import("./.compilado/historial/orden-de-los-directos.js");

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SUPER = `a-super-${V}`;
const ANA = `b-ana-${V}`;
const BETO = `c-beto-${V}`;
const CARLA = `d-carla-${V}`;
const OTRA = `e-otra-${V}`;
const TODOS = [SUPER, ANA, BETO, CARLA, OTRA];

const como = async (quien, fn) => {
    ponerLaSesion(quien);
    return fn();
};
const hilo = (quien, canal) => como(quien, () => chat.hiloDelEquipoAction(canal));
const escribir = async (quien, canal, texto) => {
    const r = await como(quien, () => chat.enviarAlEquipoAction(texto, canal));
    assert.ok(r.success, `no se pudo escribir: ${r.message}`);
    return r.data.mensaje.id;
};
const textos = async (quien, canal) => {
    const r = await hilo(quien, canal);
    assert.ok(r.success, r.message);
    return r.data.mensajes.map((x) => x.texto);
};
const cuantos = async (sql, ...p) => Number((await db.$queryRawUnsafe(sql, ...p))[0].n);

let AREA;
let DIRECTO_AB; // Ana y Beto
let DIRECTO_BC; // Beto y Carla
let AREA_OTRA;

test.before(async () => {
    await db.user.create({ data: { id: SUPER, email: `${SUPER}@banco.test`, name: "Super", role: "super_admin" } });
    await db.user.create({ data: { id: ANA, email: `${ANA}@banco.test`, name: "Ana", role: "user", ownerId: SUPER, advisorRole: "administrador" } });
    await db.user.create({ data: { id: BETO, email: `${BETO}@banco.test`, name: "Beto", role: "user", ownerId: SUPER, advisorRole: "agente" } });
    await db.user.create({ data: { id: CARLA, email: `${CARLA}@banco.test`, name: "Carla", role: "user", ownerId: SUPER, advisorRole: "agente" } });
    await db.user.create({ data: { id: OTRA, email: `${OTRA}@banco.test`, name: "Otra", role: "admin" } });

    const c = await como(ANA, () => chat.crearCanalAction(`ventas-${V.slice(-5)}`, [ANA, BETO, CARLA]));
    assert.ok(c.success, c.message);
    AREA = c.data.canalId;
    const o = await como(OTRA, () => chat.crearCanalAction(`ajeno-${V.slice(-5)}`, [OTRA]));
    assert.ok(o.success, o.message);
    AREA_OTRA = o.data.canalId;

    const d1 = await como(ANA, () => chat.abrirDirectoAction(BETO));
    assert.ok(d1.success, d1.message);
    DIRECTO_AB = d1.data.canalId;
    const d2 = await como(BETO, () => chat.abrirDirectoAction(CARLA));
    assert.ok(d2.success, d2.message);
    DIRECTO_BC = d2.data.canalId;

    await escribir(ANA, AREA, "precio del plan anual");
    const conReaccion = await escribir(BETO, AREA, "@Carla mira esto");
    await como(ANA, () => chat.reaccionarEnElEquipoAction(conReaccion, "👍"));
    await escribir(ANA, "general", "hola a todo el equipo");
    await escribir(ANA, DIRECTO_AB, "Beto, tu contraseña del CRM es 1234");
    await escribir(BETO, DIRECTO_AB, "gracias Ana");
    await escribir(BETO, DIRECTO_BC, "Carla, cubres mi turno?");
    await escribir(OTRA, "general", "general de otra familia");
    await escribir(OTRA, AREA_OTRA, "canal de otra familia");
});

test.after(async () => {
    await db.$executeRawUnsafe(`DELETE FROM "team_chat_reactions" WHERE "personaId" = ANY($1::text[])`, TODOS);
    await db.$executeRawUnsafe(`DELETE FROM "team_chat_messages" WHERE "autorId" = ANY($1::text[])`, TODOS);
    await db.$executeRawUnsafe(`DELETE FROM "team_channel_members" WHERE "personaId" = ANY($1::text[])`, TODOS);
    await db.$executeRawUnsafe(`DELETE FROM "team_channels" WHERE "cuentaId" = ANY($1::text[])`, TODOS);
    await db.$executeRawUnsafe(`DELETE FROM "orden_en_tablero" WHERE "tableroId" = ANY($1::text[])`, TODOS).catch(() => {});
    await db.$executeRawUnsafe(`DELETE FROM "task_alerts" WHERE "destinatarioId" = ANY($1::text[])`, TODOS).catch(() => {});
    await db.$executeRawUnsafe(`DELETE FROM "push_subscriptions" WHERE "personaId" = ANY($1::text[])`, TODOS).catch(() => {});
    await db.user.deleteMany({ where: { id: { in: [ANA, BETO, CARLA] } } });
    await db.user.deleteMany({ where: { id: { in: [SUPER, OTRA] } } });
    await db.$disconnect();
});

// ── Las reglas puras ────────────────────────────────────────────────────────

test("la advertencia dice que es irreversible y, en un canal, que afecta a todos", { skip: ROTO }, () => {
    const area = reglas.laAdvertenciaDeLimpiar({ tipo: "area", nombre: "ventas", personas: 3 });
    assert.match(area, /No se puede deshacer/);
    assert.match(area, /para todos sus miembros \(3 personas\)/);
    const general = reglas.laAdvertenciaDeLimpiar({ tipo: "general", nombre: "General" });
    assert.match(general, /canal General para todos sus miembros/);
    const directo = reglas.laAdvertenciaDeLimpiar({ tipo: "directo", nombre: "Beto" });
    assert.match(directo, /para las dos personas/);
    assert.match(directo, /No se puede deshacer/);
});

test("confirmar exige la palabra; cambiar el correo PROPONE un nuevo ocupante", { skip: ROTO }, () => {
    assert.equal(reglas.confirmaLaLimpieza("limpiar "), true);
    assert.equal(reglas.confirmaLaLimpieza("si"), false);
    assert.equal(reglas.confirmaLaLimpieza(undefined), false);
    assert.equal(reglas.sugiereNuevoOcupante("a@x.com", "b@x.com"), true);
    assert.equal(reglas.sugiereNuevoOcupante("a@x.com", " A@X.com "), false);
    assert.equal(reglas.sugiereNuevoOcupante("", "b@x.com"), false);
});

test("el orden de los directos: lo colocado delante, lo nuevo detrás, lo supervisado al final", { skip: ROTO }, () => {
    const items = [
        { clave: "p1" }, { clave: null, n: "supervisado" }, { clave: "p2" }, { clave: "p3" }, { clave: "p4" },
    ];
    const colocados = ordenPuro.ordenarLosDirectos(items, { p3: 0, p1: 1 }, (i) => i.clave);
    assert.deepEqual(colocados.map((i) => i.clave ?? i.n), ["p3", "p1", "p2", "p4", "supervisado"]);
    // Sin nada guardado sale exactamente como llegó (con lo supervisado al final).
    const intacto = ordenPuro.ordenarLosDirectos(items, {}, (i) => i.clave);
    assert.deepEqual(intacto.map((i) => i.clave ?? i.n), ["p1", "p2", "p3", "p4", "supervisado"]);
});

// ── Limpiar el historial ───────────────────────────────────────────────────

if (ROTO) {
    test("ANTES: no existe ninguna forma de limpiar el historial", () => {
        assert.equal(chat.limpiarHistorialDelCanalAction, undefined);
    });
}

test("solo el súper administrador ve el botón de limpiar", { skip: ROTO }, async () => {
    const s = await hilo(SUPER, AREA);
    assert.equal(s.data.puedoLimpiar, true);
    for (const quien of [ANA, BETO, OTRA]) {
        const r = await hilo(quien, "general");
        assert.equal(r.data.puedoLimpiar, false, `${quien} no puede ver el botón`);
    }
});

test("una administradora (ni nadie que no sea súper administrador) NO limpia, ni pidiéndolo a mano", { skip: ROTO }, async () => {
    const antes = await textos(ANA, AREA);
    for (const quien of [ANA, BETO]) {
        const r = await como(quien, () => chat.limpiarHistorialDelCanalAction(AREA, "LIMPIAR"));
        assert.equal(r.success, false);
        assert.match(r.message, /súper administrador/);
    }
    assert.deepEqual(await textos(ANA, AREA), antes);
});

test("sin la palabra de confirmación no se limpia", { skip: ROTO }, async () => {
    const r = await como(SUPER, () => chat.limpiarHistorialDelCanalAction(AREA, "vale"));
    assert.equal(r.success, false);
    assert.equal((await textos(ANA, AREA)).length, 2);
});

test("un canal de OTRA familia no se limpia por su id", { skip: ROTO }, async () => {
    const r = await como(SUPER, () => chat.limpiarHistorialDelCanalAction(AREA_OTRA, "LIMPIAR"));
    assert.equal(r.success, false);
    assert.deepEqual(await textos(OTRA, AREA_OTRA), ["canal de otra familia"]);
});

test("limpiar un canal lo vacía para TODOS sus miembros, con reacciones y menciones", { skip: ROTO }, async () => {
    const menciones = () =>
        cuantos(
            `SELECT COUNT(*)::int n FROM "task_alerts" WHERE "destinatarioId" = $1 AND "tipo" = 'mencion'`,
            CARLA,
        );
    assert.equal(await menciones(), 1, "Carla tenía su mención pendiente");

    const r = await como(SUPER, () => chat.limpiarHistorialDelCanalAction(AREA, "LIMPIAR"));
    assert.ok(r.success, r.message);
    assert.equal(r.data.mensajes, 2);

    for (const quien of [ANA, BETO, CARLA]) assert.deepEqual(await textos(quien, AREA), []);
    assert.equal(
        await cuantos(`SELECT COUNT(*)::int n FROM "team_chat_reactions" WHERE "personaId" = $1`, ANA),
        0,
    );
    assert.equal(await menciones(), 0, "la mención apuntaba a un mensaje que ya no está");

    // Lo demás, intacto.
    assert.deepEqual(await textos(ANA, "general"), ["hola a todo el equipo"]);
    assert.equal((await textos(ANA, DIRECTO_AB)).length, 2);
    // Y el canal sigue existiendo: vacío, no borrado. Se puede volver a escribir.
    await escribir(BETO, AREA, "empezamos de nuevo");
    assert.deepEqual(await textos(CARLA, AREA), ["empezamos de nuevo"]);
});

test("limpiar el General vacía el de ESTA familia y no el de otra", { skip: ROTO }, async () => {
    const r = await como(SUPER, () => chat.limpiarHistorialDelCanalAction("general", "LIMPIAR"));
    assert.ok(r.success, r.message);
    assert.deepEqual(await textos(ANA, "general"), []);
    assert.deepEqual(await textos(OTRA, "general"), ["general de otra familia"]);
});

// ── El puesto que cambia de ocupante ───────────────────────────────────────

test("sin marcar «entra otra persona», editar al asesor no borra nada", async () => {
    const r = await como(SUPER, () =>
        equipo.updateAdvisor({ advisorId: CARLA, name: "Carla R.", email: `${CARLA}@banco.test`, password: "", role: "agente" }),
    );
    assert.ok(r.success, r.message);
    assert.deepEqual(await textos(CARLA, DIRECTO_BC), ["Carla, cubres mi turno?"]);
});

test("entra otra persona en el puesto de Beto: sus directos arrancan vacíos", async () => {
    // Lo que tenía la persona anterior: un dispositivo para los avisos y una
    // mención pendiente.
    await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "push_subscriptions" (
            "endpoint" TEXT PRIMARY KEY, "personaId" TEXT NOT NULL, "p256dh" TEXT NOT NULL,
            "auth" TEXT NOT NULL, "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "usadoEn" TIMESTAMP(3))`);
    await db.$executeRawUnsafe(
        `INSERT INTO "push_subscriptions" ("endpoint","personaId","p256dh","auth") VALUES ($1,$2,'x','y')`,
        `https://push.banco/${V}`, BETO,
    );
    await escribir(ANA, AREA, "@Beto revisa el canal");

    const r = await como(SUPER, () =>
        equipo.updateAdvisor({
            advisorId: BETO, name: "Bruno", email: `bruno-${V}@banco.test`, password: "",
            role: "agente", nuevoOcupante: true,
        }),
    );
    assert.ok(r.success, r.message);

    const delDirecto = await textos(BETO, DIRECTO_AB);
    if (ROTO) {
        // ANTES: la persona nueva lee la conversación privada de la anterior.
        assert.ok(delDirecto.includes("Beto, tu contraseña del CRM es 1234"));
        return;
    }
    assert.deepEqual(delDirecto, [], "la persona nueva no hereda el directo con Ana");
    assert.deepEqual(await textos(BETO, DIRECTO_BC), [], "ni el directo con Carla");
    assert.deepEqual(await textos(ANA, DIRECTO_AB), [], "el directo es uno: también vacío para Ana");
    assert.equal(
        await cuantos(`SELECT COUNT(*)::int n FROM "push_subscriptions" WHERE "personaId" = $1`, BETO),
        0,
        "los avisos ya no van al teléfono de quien se fue",
    );
    assert.equal(
        await cuantos(
            `SELECT COUNT(*)::int n FROM "task_alerts" WHERE "destinatarioId" = $1 AND "tipo" = 'mencion'`,
            BETO,
        ),
        0,
        "ni le salta la mención dirigida a la persona anterior",
    );
    // Lo de todo el equipo se queda: el canal de área conserva lo que se dijo.
    assert.ok((await textos(ANA, AREA)).includes("empezamos de nuevo"));
    // El directo sigue existiendo, con los mismos dos: se habla con el puesto.
    await escribir(ANA, DIRECTO_AB, "bienvenido Bruno");
    assert.deepEqual(await textos(BETO, DIRECTO_AB), ["bienvenido Bruno"]);
});

// ── El orden de los directos ───────────────────────────────────────────────

test("el orden de los directos se guarda por PERSONA y vuelve al entrar", async () => {
    const guardado = await como(BETO, () =>
        orden.guardarElOrdenDeLaColumnaAction({ tipo: "directos", tableroId: BETO, ids: [SUPER, CARLA, ANA] }),
    );
    if (ROTO) {
        assert.equal(guardado.success, false, "ANTES: no hay orden de directos que guardar");
        return;
    }
    assert.ok(guardado.success, guardado.message);

    const deBeto = (await hilo(BETO, "general")).data.ordenDeDirectos;
    assert.deepEqual(deBeto, { [SUPER]: 0, [CARLA]: 1, [ANA]: 2 });
    // Cada quien ve el suyo: el de Ana sigue sin tocar.
    assert.deepEqual((await hilo(ANA, "general")).data.ordenDeDirectos, {});

    // Y aplicado a la lista de verdad: la de Beto sale en su orden.
    const datos = (await hilo(BETO, "general")).data;
    const lista = ordenPuro.ordenarLosDirectos(
        datos.gente.filter((p) => p.id !== BETO),
        datos.ordenDeDirectos,
        (p) => p.id,
    );
    assert.deepEqual(lista.map((p) => p.id), [SUPER, CARLA, ANA]);
});

test("nadie le guarda el orden a otro, y lo de fuera de la familia se descarta", { skip: ROTO }, async () => {
    const ajeno = await como(ANA, () =>
        orden.guardarElOrdenDeLaColumnaAction({ tipo: "directos", tableroId: BETO, ids: [ANA, SUPER] }),
    );
    assert.equal(ajeno.success, false);
    assert.deepEqual((await hilo(BETO, "general")).data.ordenDeDirectos, { [SUPER]: 0, [CARLA]: 1, [ANA]: 2 });

    const r = await como(ANA, () =>
        orden.guardarElOrdenDeLaColumnaAction({ tipo: "directos", tableroId: ANA, ids: [OTRA, CARLA, "inventado"] }),
    );
    assert.ok(r.success, r.message);
    // Solo Carla pasa: la cuenta ajena y el id inventado se caen, y la lista
    // se guarda ya filtrada.
    assert.deepEqual((await hilo(ANA, "general")).data.ordenDeDirectos, { [CARLA]: 0 });
});
