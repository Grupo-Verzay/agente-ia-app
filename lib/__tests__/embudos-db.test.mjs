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
    await t.test("la cuenta nace con su embudo por defecto, de siete etapas", async () => {
        comoDueno();
        const r = await M.tableroDelEmbudoAction(null);
        assert.equal(r.success, true, r.message);
        // Nadie lo creó: lo sembró la primera lectura del tablero.
        assert.equal(r.data.embudos.length, 1);
        assert.equal(r.data.embudos[0].porDefecto, true);
        E.porDefecto = r.data.embudoId;
        assert.deepEqual(
            r.data.etapas.map((e) => e.nombre),
            ["Nuevo", "Contactado", "Interesado", "Cotizado", "Negociación", "Ganado", "Perdido"],
        );
        assert.deepEqual(
            r.data.etapas.map((e) => e.sistema),
            ["nuevo", null, null, null, null, "ganado", "perdido"],
        );
        // Los siete colores llegan como hex, y ninguno repetido.
        for (const e of r.data.etapas) assert.match(e.color, /^#[0-9A-F]{6}$/);
        assert.equal(new Set(r.data.etapas.map((e) => e.color)).size, 7);
        // Y lo que no está en ninguna etapa entra en Nuevo, que es la primera.
        assert.equal(tarjeta(r.data, S.libre.id).etapaId, r.data.etapas[0].id);
    });

    await t.test("sembrarlo dos veces no crea dos: el candado decide, no el `if`", async () => {
        comoDueno();
        // Dos pestañas abriendo el tablero a la vez.
        const [a, b] = await Promise.all([M.tableroDelEmbudoAction(null), M.tableroDelEmbudoAction(null)]);
        assert.equal(a.data.embudos.length, 1);
        assert.equal(b.data.embudos.length, 1);
        assert.equal(a.data.embudoId, E.porDefecto);
    });

    await t.test("un asesor sin embudo ve la pantalla vacía, no el de la cuenta", async () => {
        comoAna();
        const r = await M.tableroDelEmbudoAction(null);
        assert.equal(r.success, true);
        // La cuenta YA tiene su embudo por defecto, y aun así un asesor sin
        // asignación no ve ninguno: el suyo lo decide quien manda.
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
        // El sembrado sigue delante: el que se crea a mano no le quita el sitio
        // de por defecto, que es de donde caen las conversaciones sin asesor.
        assert.deepEqual(d.embudos.map((e) => e.nombre), ["Embudo de ventas", "Ventas", "Soporte"]);
        assert.equal(d.embudos.find((e) => e.id === E.porDefecto).porDefecto, true);
        assert.equal(d.embudos.find((e) => e.id === E.ventas).porDefecto, false);
        comoAdmin();
        const a = (await M.tableroDelEmbudoAction(E.ventas)).data;
        assert.equal(a.manda, true);
        // Y uno creado a mano nace con las mismas siete: no hay dos clases de
        // embudo.
        assert.equal(a.etapas.length, 7);
        assert.deepEqual(a.etapas.map((e) => e.sistema).filter(Boolean), ["nuevo", "ganado", "perdido"]);
    });

    await t.test("el por defecto se puede mover al creado a mano", async () => {
        comoDueno();
        const r = await M.usarPorDefectoAction(E.ventas);
        assert.equal(r.success, true, r.message);
        const d = (await M.tableroDelEmbudoAction(null)).data;
        assert.equal(d.embudoId, E.ventas);
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
        const antes = (await M.tableroDelEmbudoAction(E.ventas)).data.etapas;
        const deSistema = antes.filter((e) => e.sistema !== null);
        const delCliente = antes.filter((e) => e.sistema === null);
        // Se conservan las tres de sistema, se deja UNA del cliente y se añade
        // una nueva con su color hex.
        const r = await M.guardarEtapasAction(E.ventas, [
            ...deSistema.map((e) => ({ id: e.id, nombre: e.nombre, color: e.color })),
            { id: delCliente[1].id, nombre: "Cotizando", color: "#a855f7" },
            { id: null, nombre: "Revisión", color: "#123456" },
        ]);
        assert.equal(r.success, true, r.message);

        const v = (await M.tableroDelEmbudoAction(E.ventas)).data;
        // Nuevo delante y Ganado/Perdido al final, pase lo que pase con el orden
        // que llegó.
        assert.deepEqual(
            v.etapas.map((e) => e.nombre),
            ["Nuevo", "Cotizando", "Revisión", "Ganado", "Perdido"],
        );
        // El hex se guarda en mayúsculas: una sola forma de cada color.
        assert.equal(v.etapas[1].color, "#A855F7");
        assert.equal(v.etapas[2].color, "#123456");
        // Ana1 estaba en una etapa borrada: cae en la primera —«Nuevo»— y no
        // desaparece.
        assert.equal(tarjeta(v, S.ana1.id).etapaId, v.etapas[0].id);
        assert.equal(v.total, 4);
        assert.equal((await M.guardarEtapasAction(E.ventas, [])).success, false);
        E.etapasVentas = v.etapas.map((e) => e.id);
    });

    await t.test("una etapa de sistema no se elimina, y su color no cambia; su nombre sí", async () => {
        comoAdmin();
        const antes = (await M.tableroDelEmbudoAction(E.ventas)).data.etapas;
        const perdido = antes.find((e) => e.sistema === "perdido");

        // Quitarla de la lista se rechaza, con su nombre delante.
        const sinPerdido = antes.filter((e) => e.sistema !== "perdido");
        const r = await M.guardarEtapasAction(
            E.ventas,
            sinPerdido.map((e) => ({ id: e.id, nombre: e.nombre, color: e.color })),
        );
        assert.equal(r.success, false);
        assert.match(r.message, /Perdido/);

        // Cambiarle el color no hace nada; cambiarle el nombre sí. Y aunque la
        // lista mande la marca inventada, la de la base manda.
        const ok = await M.guardarEtapasAction(
            E.ventas,
            antes.map((e) =>
                e.id === perdido.id
                    ? { id: e.id, nombre: "Descartado", color: "#000000", sistema: null }
                    : { id: e.id, nombre: e.nombre, color: e.color },
            ),
        );
        assert.equal(ok.success, true, ok.message);
        const v = (await M.tableroDelEmbudoAction(E.ventas)).data;
        const ahora = v.etapas.find((e) => e.id === perdido.id);
        assert.equal(ahora.nombre, "Descartado");
        assert.equal(ahora.sistema, "perdido");
        assert.equal(ahora.color, perdido.color);
        // Y sigue siendo la última.
        assert.equal(v.etapas[v.etapas.length - 1].id, perdido.id);
        E.etapasVentas = v.etapas.map((e) => e.id);
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
        assert.deepEqual(d.embudos.map((e) => e.id), [E.porDefecto, E.ventas]);
        assert.deepEqual(d.asignaciones, { [ANA]: E.ventas });
        // Lo que se comprueba es que NO se pierde ninguna conversación, y se
        // suma sobre los embudos que quedan en vez de sobre un número que
        // depende de cuál sea el por defecto: así la prueba sigue midiendo lo
        // suyo el día que ese reparto cambie.
        let enLosTableros = 0;
        for (const e of d.embudos) enLosTableros += (await M.tableroDelEmbudoAction(e.id)).data.total;
        assert.equal(enLosTableros, 5);
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
        // Cada conversación cae en el embudo de SU asesor, así que la cabecera se
        // compara contra el tablero de ese embudo y no contra uno fijo: las dos
        // respuestas tienen que coincidir siempre, que es lo que esta prueba mide.
        const todos = (await M.tableroDelEmbudoAction(null)).data.embudos;
        for (const s of [S.ana1, S.libre, S.beto]) {
            const r = await M.etapaDeLaConversacionAction(s.id);
            assert.equal(r.success, true, r.message);
            assert.ok(r.data.embudoId, "toda conversación cae en algún embudo");
            assert.equal(r.data.embudoNombre, todos.find((e) => e.id === r.data.embudoId).nombre);
            const tablero = (await M.tableroDelEmbudoAction(r.data.embudoId)).data;
            assert.ok(tablero.etapas.length >= 2, "hacen falta dos etapas para poder mover");
            assert.deepEqual(r.data.etapas.map((e) => e.id), tablero.etapas.map((e) => e.id));
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

// ─── Vaciar la columna de Perdido, y sus treinta días ────────────────────────

test(
    "vaciar Perdido",
    { skip: ROTO && "el vaciado no existía: no hay «antes» que afirmar aquí" },
    async (t) => {
        const P = {};

        await t.test("se prepara: un embudo con tres conversaciones en Perdido", async () => {
            comoDueno();
            // Un embudo propio para esto, por defecto y con Ana dentro: así las
            // tres conversaciones —las dos de Ana y la que no tiene asesor—
            // caen en él, sin depender de cómo quedaron las pruebas de arriba.
            const c = await M.crearEmbudoAction("Papelera");
            assert.equal(c.success, true, c.message);
            P.embudo = c.data.id;
            assert.equal((await M.usarPorDefectoAction(P.embudo)).success, true);
            assert.equal((await M.asignarEmbudosAction([{ personaId: ANA, embudoId: P.embudo }])).success, true);

            const d = (await M.tableroDelEmbudoAction(P.embudo)).data;
            P.perdido = d.etapas.find((e) => e.sistema === "perdido").id;
            P.nuevo = d.etapas.find((e) => e.sistema === "nuevo").id;
            assert.ok(P.perdido && P.nuevo);
            for (const s of [S.ana1, S.ana2, S.libre]) {
                const r = await M.moverTarjetaAction(s.id, P.perdido);
                assert.equal(r.success, true, r.message);
            }
            const v = (await M.tableroDelEmbudoAction(P.embudo)).data;
            assert.equal(v.totales[P.perdido], 3);
            assert.equal(v.enLaPapelera, 0);
        });

        await t.test("solo se vacía la columna de Perdido, y solo quien manda", async () => {
            comoAna();
            assert.equal((await M.vaciarLaColumnaAction(P.embudo, P.perdido)).success, false);
            comoDueno();
            // Otra columna NO, aunque el embudo y la cuenta sean los correctos:
            // esconder el botón en la pantalla no cierra la petición directa.
            const r = await M.vaciarLaColumnaAction(P.embudo, P.nuevo);
            assert.equal(r.success, false);
            assert.match(r.message, /Perdido/);
            // Y sigue habiendo tres: no se tocó nada.
            assert.equal((await M.tableroDelEmbudoAction(P.embudo)).data.totales[P.perdido], 3);
        });

        await t.test("el número del diálogo es el que se va a llevar", async () => {
            comoDueno();
            const r = await M.cuantasSeVaciarianAction(P.embudo, P.perdido);
            assert.equal(r.success, true, r.message);
            assert.equal(r.data.cuantas, 3);
        });

        await t.test("vaciar saca las tarjetas del tablero y NO borra nada", async () => {
            comoDueno();
            const antes = await db.session.count({ where: { userId: DUENO } });
            const r = await M.vaciarLaColumnaAction(P.embudo, P.perdido);
            assert.equal(r.success, true, r.message);
            assert.equal(r.data.vaciadas, 3);
            assert.equal(r.data.quedan, 0);

            const v = (await M.tableroDelEmbudoAction(P.embudo)).data;
            // La columna queda vacía: ni tarjetas ni número.
            assert.equal(v.totales[P.perdido], 0);
            assert.equal(v.tarjetas.filter((x) => [S.ana1.id, S.ana2.id, S.libre.id].includes(x.id)).length, 0);
            assert.equal(v.enLaPapelera, 3);
            // **Ni una fila borrada**: de eso va «recuperable».
            assert.equal(await db.session.count({ where: { userId: DUENO } }), antes);
        });

        await t.test("una vaciada no reaparece en Nuevo por la regla de la primera etapa", async () => {
            comoDueno();
            const v = (await M.tableroDelEmbudoAction(P.embudo)).data;
            /*
             * Al vaciar se borra su posición, así que sin la exclusión caerían en
             * la primera etapa por la regla de siempre y volverían a salir — en
             * otra columna, que es peor que no vaciarlas.
             *
             * Se comprueba por ID y no por el total de Nuevo: ahí caen además,
             * legítimamente, las conversaciones de los asesores sin embudo.
             */
            for (const id of [S.ana1.id, S.ana2.id, S.libre.id]) {
                assert.equal(v.tarjetas.some((x) => x.id === id), false, `la vaciada ${id} volvió al tablero`);
            }
            // Y el conteo de Nuevo no las cuenta tampoco: si las contara, la
            // cabecera diría un número que la columna no puede enseñar.
            const enNuevo = v.tarjetas.filter((x) => x.etapaId === P.nuevo).length;
            assert.equal(v.totales[P.nuevo], enNuevo);
        });

        await t.test("la papelera dice de quién era cada una y cuántos días le quedan", async () => {
            comoDueno();
            const r = await M.laPapeleraAction();
            assert.equal(r.success, true, r.message);
            assert.equal(r.data.length, 3);
            for (const c of r.data) {
                assert.equal(c.diasQueQuedan, 30);
                assert.ok(c.nombre, "el nombre se copia dentro de la papelera");
                assert.ok(c.remoteJid);
            }
            comoAna();
            assert.equal((await M.laPapeleraAction()).success, false);
        });

        await t.test("restaurar una la devuelve a SU etapa, no a la primera", async () => {
            comoDueno();
            const r = await M.restaurarDeLaPapeleraAction([S.ana1.id]);
            assert.equal(r.success, true, r.message);
            assert.equal(r.data.restauradas, 1);
            const v = (await M.tableroDelEmbudoAction(P.embudo)).data;
            assert.equal(tarjeta(v, S.ana1.id).etapaId, P.perdido);
            assert.equal(v.totales[P.perdido], 1);
            assert.equal(v.enLaPapelera, 2);
        });

        await t.test("restaurar todo vacía la papelera", async () => {
            comoDueno();
            const r = await M.restaurarDeLaPapeleraAction();
            assert.equal(r.success, true, r.message);
            assert.equal(r.data.restauradas, 2);
            const v = (await M.tableroDelEmbudoAction(P.embudo)).data;
            assert.equal(v.totales[P.perdido], 3);
            assert.equal(v.enLaPapelera, 0);
            assert.deepEqual((await M.laPapeleraAction()).data, []);
        });

        await t.test("con un filtro de asesor puesto se vacía SOLO lo que se ve", async () => {
            comoDueno();
            // Las tres están en Perdido: dos de Ana y una sin asesor.
            const r = await M.vaciarLaColumnaAction(P.embudo, P.perdido, undefined, ANA);
            assert.equal(r.success, true, r.message);
            assert.equal(r.data.vaciadas, 2, "solo las de Ana");
            const v = (await M.tableroDelEmbudoAction(P.embudo)).data;
            assert.equal(v.totales[P.perdido], 1);
            assert.equal(tarjeta(v, S.libre.id).etapaId, P.perdido);
            // Y el número que el diálogo habría dicho es el mismo.
            const c = await M.cuantasSeVaciarianAction(P.embudo, P.perdido, undefined, ANA);
            assert.equal(c.data.cuantas, 0);
        });

        await t.test("el barrido no toca lo que todavía tiene días", async () => {
            const r = await M.runPapeleraDeEmbudos();
            assert.equal(r.caducadas, 0);
            assert.equal(r.borradas, 0);
            comoDueno();
            assert.equal((await M.tableroDelEmbudoAction(P.embudo)).data.enLaPapelera, 2);
        });

        await t.test("pasados los treinta días se borra en firme, con su ficha", async () => {
            // Se envejece la papelera a mano: el plazo es el dato, no el reloj.
            await db.$executeRawUnsafe(
                `UPDATE "embudo_vaciadas" SET "vaciadoEn" = NOW() - INTERVAL '31 days' WHERE "sessionId" = $1`,
                S.ana1.id,
            );
            const r = await M.runPapeleraDeEmbudos();
            assert.equal(r.caducadas, 1);
            assert.equal(r.borradas, 1);
            assert.equal(r.fallos, 0);
            // La ficha se fue…
            assert.equal(await db.session.count({ where: { id: S.ana1.id } }), 0);
            // …y con ella su fila de la papelera y su posición.
            comoDueno();
            assert.equal((await M.tableroDelEmbudoAction(P.embudo)).data.enLaPapelera, 1);
            const quedan = await db.$queryRawUnsafe(
                `SELECT COUNT(*)::int AS n FROM "embudo_posiciones" WHERE "sessionId" = $1`,
                S.ana1.id,
            );
            assert.equal(Number(quedan[0].n), 0);
            // Y la que todavía tiene días sigue entera.
            assert.equal(await db.session.count({ where: { id: S.ana2.id } }), 1);
        });

        await t.test("borrar el embudo suelta su papelera: nadie queda condenado", async () => {
            comoDueno();
            const antes = await db.session.count({ where: { id: S.ana2.id } });
            assert.equal(antes, 1);
            assert.equal((await M.borrarEmbudoAction(P.embudo)).success, true);
            // Su fila de papelera se fue con el embudo, así que el barrido ya no
            // se la lleva: la conversación se queda.
            const r = await M.runPapeleraDeEmbudos();
            assert.equal(r.caducadas, 0);
            assert.equal(await db.session.count({ where: { id: S.ana2.id } }), 1);
        });
    },
);

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
