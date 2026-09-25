/**
 * Embudos y lo personal, contra Postgres y por las ACCIONES de verdad.
 *
 * La cuenta es la de producción en pequeño: un dueño, una administradora de su
 * equipo, dos agentes y una cuenta ajena. Seis conversaciones: dos de Ana, una
 * de Beto, una sin asesor, una que tomó la administradora y una de la cuenta
 * ajena. Lo único fingido es `currentUser()`.
 *
 * Lo que se demuestra:
 *
 *  - Solo quien manda (dueño o administradora, los mismos permisos) crea,
 *    renombra, borra, edita etapas, elige el por defecto y asigna asesores.
 *  - Cada asesor ve SU embudo con solo sus conversaciones; quien manda, todas.
 *  - Las conversaciones sin asesor, o de alguien sin embudo, caen en el por
 *    defecto; y cambiar el por defecto las mueve.
 *  - La etapa se guarda por conversación y embudo: cambiar de embudo y volver
 *    recupera la etapa.
 *  - Borrar una etapa o un embudo no pierde ninguna conversación.
 *  - La lectura de UNA conversación —la que usa la cabecera del chat— dice lo
 *    mismo que el tablero, deja ver la etapa de una que no se puede mover, y
 *    lo que se cambia desde el chat sale en el tablero.
 *  - Las etiquetas y respuestas que crea un agente son suyas: su compañero no
 *    las ve, no las puede borrar, y guardar las etiquetas de una conversación
 *    no se las lleva por delante. Quien manda las ve todas.
 *
 * `MODO=roto` corre la parte de lo personal contra las acciones de
 * `ANTES_REF` y AFIRMA el fallo. La de embudos no tiene «antes»: no existía, y
 * se salta diciéndolo.
 *
 * Se levanta con `scripts/banco-embudos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const M = ROTO
    ? await import("./.compilado/embudos/entrada-de-lo-personal-antes.js")
    : await import("./.compilado/embudos/entrada-de-embudos.js");
const { ponerAQuienMira, db } = M;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DUENO = `em-dueno-${V}`;
const ADMIN = `em-admin-${V}`;
const ANA = `em-ana-${V}`;
const BETO = `em-beto-${V}`;
const AJENA = `em-ajena-${V}`;

const base = (id) => ({
    id,
    sessionUserId: id,
    role: "user",
    rolDeLaPersona: "user",
    email: `${id}@banco.test`,
    name: id,
});
const comoDueno = () => ponerAQuienMira({ ...base(DUENO), effectiveId: DUENO, ownerId: null, advisorRole: null });
const comoAdmin = () =>
    ponerAQuienMira({ ...base(ADMIN), effectiveId: DUENO, ownerId: DUENO, advisorRole: "administrador" });
const comoAna = () => ponerAQuienMira({ ...base(ANA), effectiveId: DUENO, ownerId: DUENO, advisorRole: "agente" });
const comoBeto = () => ponerAQuienMira({ ...base(BETO), effectiveId: DUENO, ownerId: DUENO, advisorRole: "agente" });

const S = {};
const sesion = (userId, asesor, n) =>
    db.session.create({
        data: {
            userId,
            remoteJid: `5730000${n}-${V}@s.whatsapp.net`,
            pushName: `Cliente ${n}`,
            instanceId: `inst-${V}`,
            status: true,
            assignedAdvisorId: asesor,
        },
    });

test.before(async () => {
    await db.user.create({ data: { id: DUENO, email: `${DUENO}@b.t`, name: "Dueño", role: "user" } });
    await db.user.create({ data: { id: AJENA, email: `${AJENA}@b.t`, name: "Ajena", role: "user" } });
    await db.user.create({
        data: { id: ADMIN, email: `${ADMIN}@b.t`, name: "Mónica", role: "user", ownerId: DUENO, advisorRole: "administrador" },
    });
    for (const [id, nombre] of [[ANA, "Ana"], [BETO, "Beto"]]) {
        await db.user.create({
            data: { id, email: `${id}@b.t`, name: nombre, role: "user", ownerId: DUENO, advisorRole: "agente" },
        });
    }
    S.ana1 = await sesion(DUENO, ANA, 1);
    S.ana2 = await sesion(DUENO, ANA, 2);
    S.beto = await sesion(DUENO, BETO, 3);
    S.libre = await sesion(DUENO, null, 4);
    S.admin = await sesion(DUENO, ADMIN, 5);
    S.ajena = await sesion(AJENA, null, 6);
});

test.after(async () => {
    await db.$disconnect();
});

const ids = (tablero) => tablero.tarjetas.map((t) => t.id).sort((a, b) => a - b);
const tarjeta = (tablero, id) => tablero.tarjetas.find((t) => t.id === id);

// ─── Embudos ─────────────────────────────────────────────────────────────────

const E = {};

test("embudos", { skip: ROTO && "antes de esto no existían embudos: no hay «antes» que afirmar" }, async (t) => {
    await t.test("un asesor sin embudo ve la pantalla vacía, no el de otro", async () => {
        comoAna();
        const r = await M.tableroDelEmbudoAction(null);
        assert.equal(r.success, true);
        assert.equal(r.data.embudoId, null);
        assert.deepEqual(r.data.tarjetas, []);
        assert.equal(r.data.manda, false);
    });

    await t.test("un asesor no crea embudos", async () => {
        comoAna();
        const r = await M.crearEmbudoAction("Mío");
        assert.equal(r.success, false);
    });

    await t.test("el dueño y la administradora crean; los dos son de la cuenta", async () => {
        comoDueno();
        const v = await M.crearEmbudoAction("Ventas");
        assert.equal(v.success, true, v.message);
        E.ventas = v.data.id;
        comoAdmin();
        const s = await M.crearEmbudoAction("Soporte");
        assert.equal(s.success, true, s.message);
        E.soporte = s.data.id;

        comoDueno();
        const d = (await M.tableroDelEmbudoAction(null)).data;
        assert.deepEqual(d.embudos.map((e) => e.nombre), ["Ventas", "Soporte"]);
        // El primero nace por defecto.
        assert.equal(d.embudos.find((e) => e.id === E.ventas).porDefecto, true);
        comoAdmin();
        const a = (await M.tableroDelEmbudoAction(null)).data;
        assert.equal(a.manda, true);
        assert.deepEqual(a.embudos.map((e) => e.nombre), ["Ventas", "Soporte"]);
        assert.equal(a.etapas.length, 3);
    });

    await t.test("la administradora asigna; una persona de otra cuenta se ignora", async () => {
        comoAdmin();
        const r = await M.asignarEmbudosAction([
            { personaId: ANA, embudoId: E.ventas },
            { personaId: BETO, embudoId: E.soporte },
            { personaId: AJENA, embudoId: E.ventas },
        ]);
        assert.equal(r.success, true, r.message);
        const d = (await M.tableroDelEmbudoAction(E.ventas)).data;
        assert.deepEqual(d.asignaciones, { [ANA]: E.ventas, [BETO]: E.soporte });
        comoAna();
        assert.equal((await M.asignarEmbudosAction([{ personaId: ANA, embudoId: E.soporte }])).success, false);
    });

    await t.test("quien manda ve todo, embudo por embudo; lo sin asesor, en el por defecto", async () => {
        comoDueno();
        const v = (await M.tableroDelEmbudoAction(E.ventas)).data;
        assert.deepEqual(ids(v), [S.ana1.id, S.ana2.id, S.libre.id, S.admin.id].sort((a, b) => a - b));
        assert.equal(v.total, 4);
        const s = (await M.tableroDelEmbudoAction(E.soporte)).data;
        assert.deepEqual(ids(s), [S.beto.id]);
        // La cuenta ajena no se cuela en ningún tablero.
        assert.equal(tarjeta(v, S.ajena.id), undefined);
    });

    await t.test("un asesor ve SU embudo con solo sus conversaciones, pida lo que pida", async () => {
        comoAna();
        const a = (await M.tableroDelEmbudoAction(E.soporte)).data;
        assert.equal(a.embudoId, E.ventas);
        assert.deepEqual(a.embudos.map((e) => e.id), [E.ventas]);
        assert.deepEqual(ids(a), [S.ana1.id, S.ana2.id]);
        assert.deepEqual(a.equipo, []);
        assert.deepEqual(a.asignaciones, {});
    });

    await t.test("un asesor mueve sus tarjetas y ninguna más", async () => {
        comoAna();
        const a = (await M.tableroDelEmbudoAction(null)).data;
        E.etapasVentas = a.etapas.map((e) => e.id);
        assert.equal(tarjeta(a, S.ana1.id).etapaId, E.etapasVentas[0]);
        assert.equal((await M.moverTarjetaAction(S.ana1.id, E.etapasVentas[1])).success, true);
        assert.equal((await M.moverTarjetaAction(S.beto.id, E.etapasVentas[1])).success, false);
        assert.equal((await M.moverTarjetaAction(S.libre.id, E.etapasVentas[1])).success, false);
        assert.equal((await M.moverTarjetaAction(S.ajena.id, E.etapasVentas[1])).success, false);
        const otra = (await (comoDueno(), M.tableroDelEmbudoAction(E.soporte))).data.etapas[0].id;
        comoAna();
        // Una etapa de OTRO embudo se rechaza: el embudo no se da por bueno.
        assert.equal((await M.moverTarjetaAction(S.ana1.id, otra)).success, false);
        const despues = (await M.tableroDelEmbudoAction(null)).data;
        assert.equal(tarjeta(despues, S.ana1.id).etapaId, E.etapasVentas[1]);
    });

    await t.test("quien manda mueve cualquier tarjeta", async () => {
        comoAdmin();
        assert.equal((await M.moverTarjetaAction(S.libre.id, E.etapasVentas[2])).success, true);
    });

    await t.test("la etapa es por conversación y embudo: se va y vuelve con la suya", async () => {
        comoDueno();
        await M.asignarEmbudosAction([{ personaId: ANA, embudoId: E.soporte }]);
        const s = (await M.tableroDelEmbudoAction(E.soporte)).data;
        assert.equal(tarjeta(s, S.ana1.id).etapaId, s.etapas[0].id);
        await M.asignarEmbudosAction([{ personaId: ANA, embudoId: E.ventas }]);
        const v = (await M.tableroDelEmbudoAction(E.ventas)).data;
        assert.equal(tarjeta(v, S.ana1.id).etapaId, E.etapasVentas[1]);
    });

    await t.test("editar etapas: solo quien manda; borrar una no pierde conversaciones", async () => {
        comoAna();
        assert.equal((await M.guardarEtapasAction(E.ventas, [{ nombre: "X" }])).success, false);
        comoAdmin();
        const r = await M.guardarEtapasAction(E.ventas, [
            { id: E.etapasVentas[0], nombre: "Nuevo", color: 4 },
            { id: E.etapasVentas[2], nombre: "Cerrado", color: null },
            { id: null, nombre: "Ganado", color: 1 },
        ]);
        assert.equal(r.success, true, r.message);
        const v = (await M.tableroDelEmbudoAction(E.ventas)).data;
        assert.deepEqual(v.etapas.map((e) => [e.nombre, e.color]), [["Nuevo", 4], ["Cerrado", null], ["Ganado", 1]]);
        // Ana1 estaba en la etapa borrada: cae en la primera, no desaparece.
        assert.equal(tarjeta(v, S.ana1.id).etapaId, E.etapasVentas[0]);
        assert.equal(tarjeta(v, S.libre.id).etapaId, E.etapasVentas[2]);
        assert.equal(v.total, 4);
        assert.equal((await M.guardarEtapasAction(E.ventas, [])).success, false);
    });

    await t.test("cambiar el por defecto mueve lo que no tiene asesor", async () => {
        comoDueno();
        assert.equal((await M.usarPorDefectoAction(E.soporte)).success, true);
        const s = (await M.tableroDelEmbudoAction(E.soporte)).data;
        assert.deepEqual(ids(s), [S.beto.id, S.libre.id, S.admin.id].sort((a, b) => a - b));
    });

    await t.test("borrar un embudo no borra conversaciones: pasan al por defecto", async () => {
        comoAna();
        assert.equal((await M.borrarEmbudoAction(E.soporte)).success, false);
        comoDueno();
        assert.equal((await M.borrarEmbudoAction(E.soporte)).success, true);
        const d = (await M.tableroDelEmbudoAction(null)).data;
        assert.deepEqual(d.embudos.map((e) => e.id), [E.ventas]);
        assert.deepEqual(d.asignaciones, { [ANA]: E.ventas });
        assert.equal(d.total, 5);
        assert.equal(await db.session.count({ where: { userId: DUENO } }), 5);
        // Y otra cuenta no puede tocar este embudo.
        ponerAQuienMira({ ...base(AJENA), effectiveId: AJENA, ownerId: null, advisorRole: null });
        assert.equal((await M.renombrarEmbudoAction(E.ventas, "Mío")).success, false);
        assert.equal((await M.borrarEmbudoAction(E.ventas)).success, false);
    });

    /*
     * La lectura de UNA conversación, que es la que usa la cabecera del chat.
     *
     * Lo que de verdad hay que demostrar es que dice lo MISMO que el tablero:
     * son dos caminos para la misma pregunta, y si discreparan la cabecera
     * enseñaría una etapa y el tablero otra sin que nadie pudiera saber cuál
     * miente. Por eso los dos se piden y se comparan encadenados, no cada uno
     * por su lado.
     */
    await t.test("la cabecera del chat lee la etapa, y dice lo mismo que el tablero", async () => {
        comoDueno();
        const tablero = (await M.tableroDelEmbudoAction(E.ventas)).data;
        const etapas = tablero.etapas.map((e) => e.id);
        assert.ok(etapas.length >= 2, "hacen falta dos etapas para poder mover");

        for (const s of [S.ana1, S.libre, S.beto]) {
            const r = await M.etapaDeLaConversacionAction(s.id);
            assert.equal(r.success, true, r.message);
            assert.equal(r.data.embudoId, E.ventas);
            assert.equal(r.data.embudoNombre, "Ventas");
            assert.deepEqual(r.data.etapas.map((e) => e.id), etapas);
            assert.equal(r.data.etapaId, tarjeta(tablero, s.id).etapaId);
            assert.equal(r.data.puedeMover, true);
        }
    });

    await t.test("un asesor VE la etapa de una que no lleva, y no la mueve", async () => {
        comoAna();
        const suya = await M.etapaDeLaConversacionAction(S.ana1.id);
        assert.equal(suya.success, true, suya.message);
        assert.equal(suya.data.puedeMover, true);

        // S.beto es de Beto: se lee —es de la cuenta— y el selector lo enseña
        // de solo lectura. Un botón apagado no diría por qué.
        const ajena = await M.etapaDeLaConversacionAction(S.beto.id);
        assert.equal(ajena.success, true, ajena.message);
        assert.equal(ajena.data.puedeMover, false);
        assert.ok(ajena.data.etapaId);
        assert.equal((await M.moverTarjetaAction(S.beto.id, ajena.data.etapas[1].id)).success, false);

        // La de otra cuenta no se lee, igual que no se mueve.
        assert.equal((await M.etapaDeLaConversacionAction(S.ajena.id)).success, false);
        assert.equal((await M.etapaDeLaConversacionAction("no-es-un-id")).success, false);
        assert.equal((await M.etapaDeLaConversacionAction(0)).success, false);
    });

    await t.test("mover desde el chat se ve en el tablero: es la misma fila", async () => {
        comoAna();
        const antes = (await M.etapaDeLaConversacionAction(S.ana1.id)).data;
        const destino = antes.etapas.find((e) => e.id !== antes.etapaId).id;
        assert.equal((await M.moverTarjetaAction(S.ana1.id, destino)).success, true);
        assert.equal((await M.etapaDeLaConversacionAction(S.ana1.id)).data.etapaId, destino);

        comoDueno();
        const tablero = (await M.tableroDelEmbudoAction(E.ventas)).data;
        assert.equal(tarjeta(tablero, S.ana1.id).etapaId, destino);
    });

    await t.test("una cuenta sin embudos lo dice, y no revienta", async () => {
        ponerAQuienMira({ ...base(AJENA), effectiveId: AJENA, ownerId: null, advisorRole: null });
        const r = await M.etapaDeLaConversacionAction(S.ajena.id);
        assert.equal(r.success, true, r.message);
        assert.equal(r.data.embudoId, null);
        assert.equal(r.data.embudoNombre, null);
        assert.deepEqual(r.data.etapas, []);
        assert.equal(r.data.etapaId, null);
        // Y no se puede mover a ninguna parte: no hay etapa que darle.
        assert.equal((await M.moverTarjetaAction(S.ajena.id, "cualquiera")).success, false);
    });
});

// ─── Lo personal ─────────────────────────────────────────────────────────────

const T = {};

test("etiquetas personales", async (t) => {
    await t.test("dos agentes crean la misma etiqueta, cada uno la suya", async () => {
        comoAna();
        const a = await M.createTagAction({ userId: DUENO, name: "Llamar tarde", color: "#0EA5E9" });
        assert.equal(a.success, true, a.message);
        T.deAna = a.data.id;
        comoBeto();
        const b = await M.createTagAction({ userId: DUENO, name: "Llamar tarde", color: "#8B5CF6" });
        if (ROTO) {
            // Antes eran de la cuenta: la segunda chocaba con una que ni la ve.
            assert.equal(b.success, false);
            return;
        }
        assert.equal(b.success, true, b.message);
        T.deBeto = b.data.id;
        comoDueno();
        const c = await M.createTagAction({ userId: DUENO, name: "Cliente activo", color: "#16A34A" });
        assert.equal(c.success, true);
        T.deCuenta = c.data.id;
    });

    await t.test("su compañero no la ve; quien manda, todas", async () => {
        comoBeto();
        const vistas = (await M.listTagsAction(DUENO)).data.map((x) => x.id);
        if (ROTO) {
            assert.ok(vistas.includes(T.deAna), "antes el compañero veía la etiqueta de Ana");
            return;
        }
        assert.ok(!vistas.includes(T.deAna));
        assert.ok(vistas.includes(T.deBeto) && vistas.includes(T.deCuenta));
        comoAna();
        const deAna = (await M.listTagsAction(DUENO)).data;
        assert.equal(deAna.find((x) => x.id === T.deAna).grupo, "mias");
        assert.equal(deAna.find((x) => x.id === T.deCuenta).grupo, "de-la-cuenta");
        comoAdmin();
        const todas = (await M.listTagsAction(DUENO)).data;
        assert.equal(todas.find((x) => x.id === T.deAna).grupo, "de-asesores");
        assert.ok(todas.some((x) => x.id === T.deBeto));
    });

    await t.test("guardar las etiquetas de una conversación no borra las que no se ven", async () => {
        comoAna();
        assert.equal(
            (await M.replaceSessionTagsAction({ userId: DUENO, sessionId: S.libre.id, tagIds: [T.deAna] })).success,
            true,
        );
        comoBeto();
        const antes = (await M.getSessionTagsAction(DUENO, S.libre.id)).data.map((x) => x.id);
        await M.replaceSessionTagsAction({ userId: DUENO, sessionId: S.libre.id, tagIds: [] });
        const guardadas = (await db.sessionTag.findMany({ where: { sessionId: S.libre.id } })).map((x) => x.tagId);
        if (ROTO) {
            assert.ok(antes.includes(T.deAna));
            assert.deepEqual(guardadas, [], "antes el compañero se llevaba la etiqueta de Ana sin verla");
            return;
        }
        assert.ok(!antes.includes(T.deAna), "Beto no ve la etiqueta de Ana en la conversación");
        assert.deepEqual(guardadas, [T.deAna]);
        // Y no puede poner una que no ve.
        assert.equal(
            (await M.replaceSessionTagsAction({ userId: DUENO, sessionId: S.libre.id, tagIds: [T.deAna] })).success,
            false,
        );
    });

    await t.test("solo su dueña o quien manda la borran", async () => {
        comoBeto();
        const r = await M.deleteTagAction({ id: T.deAna, userId: DUENO });
        if (ROTO) {
            assert.equal(r.success, true, "antes el compañero la borraba");
            return;
        }
        assert.equal(r.success, false);
        assert.equal((await M.deleteTagAction({ id: T.deCuenta, userId: DUENO })).success, false);
        comoAdmin();
        assert.equal((await M.deleteTagAction({ id: T.deBeto, userId: DUENO })).success, true);
        comoAna();
        assert.equal((await M.deleteTagAction({ id: T.deAna, userId: DUENO })).success, true);
    });
});

test("respuestas rápidas personales", async (t) => {
    await t.test("la de un agente no la ve su compañero; quien manda sí", async () => {
        comoAna();
        assert.equal((await M.createRR({ userId: DUENO, name: "cuotas", mensaje: "Paga en 3 cuotas" })).success, true);
        const deAna = (await M.getAllRRs(DUENO)).data.find((x) => x.name === "cuotas");
        assert.ok(deAna);
        comoBeto();
        const deBeto = (await M.getAllRRs(DUENO)).data.map((x) => x.id);
        if (ROTO) {
            assert.ok(deBeto.includes(deAna.id), "antes el compañero la veía");
            return;
        }
        assert.ok(!deBeto.includes(deAna.id));
        assert.equal((await M.deleteRR(deAna.id)).success, false);
        comoDueno();
        const delDueno = (await M.getAllRRs(DUENO)).data.find((x) => x.id === deAna.id);
        assert.equal(delDueno.grupo, "de-asesores");
        comoAna();
        assert.equal((await M.getAllRRs(DUENO)).data.find((x) => x.id === deAna.id).grupo, "mias");
    });
});
