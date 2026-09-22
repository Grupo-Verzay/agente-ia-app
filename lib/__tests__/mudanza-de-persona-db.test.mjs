/**
 * Mover una persona de una cuenta a otra, contra Postgres de verdad y
 * ejerciendo **las acciones**, no las consultas.
 *
 * El invariante que esto protege, en una linea:
 *
 *   **De lo que ella firmo no cambia ni una fila, y no queda nada apuntando a
 *   la cuenta que deja.**
 *
 * Es lo unico que un banco puro no puede decir. La decision —que se mueve, con
 * que rol, que modulos le quedan— se prueba al lado sin base ninguna; aqui se
 * siembran filas de las DOS clases —lo suyo y lo de la cuenta— y se mira la
 * base antes y despues.
 *
 * | | que tiene que pasar |
 * | --- | --- |
 * | el informe | cuenta lo que hay y **no escribe ni una fila** |
 * | la mudanza | su fila, su cartera y sus modulos, y nada mas |
 * | sus notas, chats, tareas, permisos y actividad | **intactos**, con su id |
 * | `actividad_jornada.cuentaId` | **intacto**: es historia, no alcance |
 * | un `agente`, o alguien de fuera de la familia | no puede moverla |
 * | una CUENTA, o un destino que es una persona | se rechaza con su motivo |
 *
 * Y corre en DOS modos. `MODO=roto` mueve solo la fila de la persona —la forma
 * ingenua, la que se escribe sola— y **afirma los dos restos**: la cartera
 * atascada bajo la cuenta de antes, sin que nadie pueda quitarsela desde la
 * nueva, y un modulo que la cuenta nueva no tiene seguido abierto. Sin ese modo
 * no se sabria si lo verde de arriba arregla la causa o algo parecido.
 *
 * Como se corre: `scripts/banco-mudanza.sh` (Postgres de usar y tirar).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
    crearEspacioAction,
    cuentasParaMudarAction,
    db,
    guardarLaJornada,
    informeDeLaMudanzaAction,
    losModulosDe,
    mudarALaPersonaAction,
    ponerAQuienMira,
    ponerPermisoAction,
} from "./.compilado/mudanza/entrada-de-mudanza.js";

const ROTO = process.env.MODO === "roto";

/* ─────────────────────────────── La semilla ─────────────────────────────── */

// Los ids llevan el sello de la vuelta: la base se reutiliza entre ejecuciones
// y un id fijo haria que la segunda encontrara tambien lo de la primera.
const V = `m${Date.now().toString(36)}`;
const ID = (n) => `${V}-${n}`;

const MADRE = ID("madre");
const ATENCION = ID("atencion");
const AJENA = ID("ajena");
const MARIA = ID("maria");
const OTRO_AGENTE = ID("otroagente");
const CLIENTE = ID("cliente");

// Modulos: MARIA tiene A y B; ATENCION tiene B y C. El cruce es B.
const MOD_A = ID("modA");
const MOD_B = ID("modB");
const MOD_C = ID("modC");

const COMO = {
    madre: { id: MADRE, role: "admin", ownerId: null, advisorRole: null, name: "Madre" },
    ajena: { id: AJENA, role: "admin", ownerId: null, advisorRole: null, name: "Ajena" },
    // Participa, no manda.
    agente: {
        id: OTRO_AGENTE,
        role: "user",
        ownerId: MADRE,
        advisorRole: "agente",
        name: "Otro agente",
    },
};

async function usuario(id, ownerId, advisorRole, role = "user") {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" ("id","email","name","company","role","owner_id","advisor_role","updatedAt")
         VALUES ($1,$2,$3,'Empresa Demo',$4::"Role",$5,$6,NOW())
         ON CONFLICT ("id") DO NOTHING`,
        id,
        `${id}@banco.test`,
        id,
        role,
        ownerId,
        advisorRole,
    );
}

async function sembrar() {
    await usuario(MADRE, null, null, "admin");
    await usuario(ATENCION, null, null, "user");
    await usuario(AJENA, null, null, "admin");
    await usuario(CLIENTE, null, null, "user");
    await usuario(MARIA, MADRE, "agente");
    await usuario(OTRO_AGENTE, MADRE, "agente");

    // La malla: la madre vinculo a Atencion bajo la suya.
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id")
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        ID("enlace"),
        MADRE,
        ATENCION,
    );

    /* ── Lo SUYO: todo esto lleva su id y no puede moverse ni un milimetro ── */

    // Una nota. Son de la PERSONA, no de la cuenta.
    await db.$executeRawUnsafe(
        `INSERT INTO "user_notes" ("id","userId","title","content","updatedAt")
         VALUES ($1,$2,'Su nota','{}'::jsonb,NOW()) ON CONFLICT ("id") DO NOTHING`,
        ID("nota"),
        MARIA,
    );

    // Un chat tomado. La conversacion es de la cuenta; la asignacion es suya.
    await db.$executeRawUnsafe(
        `INSERT INTO "Session"
           ("userId","remoteJid","pushName","instanceId","status","assigned_advisor_id","updatedAt")
         VALUES ($1,$2,'Contacto','linea-1',true,$3,NOW())`,
        MADRE,
        `${V}@s.whatsapp.net`,
        MARIA,
    );

    // Una tarea abierta a su nombre, en la agenda de la cuenta.
    await db.$executeRawUnsafe(
        `INSERT INTO "tasks"
           ("ownerId","assignedToId","title","dueDate","createdById","status","updatedAt")
         VALUES ($1,$2,'Su tarea',NOW(),$3,'pending',NOW())`,
        MADRE,
        MARIA,
        MADRE,
    );

    // Su cartera: el cliente es suyo, y la fila cuelga de la cuenta.
    await db.$executeRawUnsafe(
        `INSERT INTO "advisor_clients" ("id","advisor_user_id","client_user_id","owner_user_id")
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        ID("cartera"),
        MARIA,
        CLIENTE,
        MADRE,
    );

    // Modulos: los de ella y los de la cuenta nueva.
    for (const [id, label] of [
        [MOD_A, "Finanzas"],
        [MOD_B, "Chats"],
        [MOD_C, "Cobros"],
    ]) {
        await db.$executeRawUnsafe(
            `INSERT INTO "Module" ("id","label","route","icon","updatedAt")
             VALUES ($1,$2,$3,'Box',NOW()) ON CONFLICT ("id") DO NOTHING`,
            id,
            label,
            `/${label.toLowerCase()}`,
        );
    }
    for (const [mod, quien] of [
        [MOD_A, MARIA],
        [MOD_B, MARIA],
        [MOD_B, ATENCION],
        [MOD_C, ATENCION],
    ]) {
        await db.$executeRawUnsafe(
            `INSERT INTO "_UserModules" ("A","B") VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            mod,
            quien,
        );
    }

    // Su historial de actividad, por el escritor de VERDAD: asi la tabla es la
    // de produccion y no una que el banco se invente.
    await guardarLaJornada({
        personaId: MARIA,
        cuentaId: MADRE,
        envio: { pestanaId: "p1", trozos: [{ seccion: "chats", segundos: 600 }] },
    });

    // Un documento compartido CON ELLA, tambien por el camino de verdad.
    ponerAQuienMira(COMO.madre);
    const espacio = await crearEspacioAction({ nombre: "Procedimientos" });
    assert.equal(espacio.success, true, "no se pudo sembrar el espacio");
    const permiso = await ponerPermisoAction({
        objetoTipo: "espacio",
        objetoId: espacio.data.id,
        sujetoTipo: "persona",
        sujetoId: MARIA,
        permiso: "edicion",
    });
    assert.equal(permiso.success, true, "no se pudo sembrar el permiso");
}

/* ────────────────────────── Leer la base a pelo ─────────────────────────── */

const uno = async (sql, ...args) => (await db.$queryRawUnsafe(sql, ...args))[0];

const laFila = () =>
    uno(`SELECT "owner_id" AS owner, "advisor_role" AS rol FROM "User" WHERE "id" = $1`, MARIA);

const laCartera = () =>
    db.$queryRawUnsafe(
        `SELECT "advisor_user_id" AS asesor, "owner_user_id" AS cuenta
         FROM "advisor_clients" WHERE "advisor_user_id" = $1`,
        MARIA,
    );

/** Las cinco firmas, tal y como estaban. Ninguna puede cambiar. */
async function lasFirmas() {
    const [nota, chat, tarea, actividad, permiso] = await Promise.all([
        uno(`SELECT COUNT(*)::int AS n FROM "user_notes" WHERE "userId" = $1`, MARIA),
        uno(`SELECT COUNT(*)::int AS n FROM "Session" WHERE "assigned_advisor_id" = $1`, MARIA),
        uno(`SELECT COUNT(*)::int AS n FROM "tasks" WHERE "assignedToId" = $1`, MARIA),
        uno(
            `SELECT COUNT(*)::int AS n, MIN("cuentaId") AS cuenta
             FROM "actividad_jornada" WHERE "personaId" = $1`,
            MARIA,
        ),
        uno(
            `SELECT COUNT(*)::int AS n FROM "doc_permisos"
             WHERE "sujetoTipo" = 'persona' AND "sujetoId" = $1`,
            MARIA,
        ),
    ]);
    return {
        notas: nota.n,
        chats: chat.n,
        tareas: tarea.n,
        actividad: actividad.n,
        cuentaDeLaActividad: actividad.cuenta,
        permisos: permiso.n,
    };
}

/** La forma INGENUA: solo la fila de la persona. */
async function mudanzaIngenua() {
    await db.$executeRawUnsafe(
        `UPDATE "User" SET "owner_id" = $1, "advisor_role" = 'administrador' WHERE "id" = $2`,
        ATENCION,
        MARIA,
    );
}

await sembrar();
const FIRMAS_ANTES = await lasFirmas();

/* ───────────────────────────── El informe ───────────────────────────────── */

test("el informe cuenta lo que hay y NO escribe ni una fila", { skip: ROTO }, async () => {
    ponerAQuienMira(COMO.madre);
    const antes = await laFila();

    const res = await informeDeLaMudanzaAction(MARIA, ATENCION, "administrador");
    assert.equal(res.success, true, res.message);
    const { recuento, areas, destino } = res.data;

    assert.equal(destino.id, ATENCION);
    assert.equal(recuento.mismaFamilia, true, "madre y Atencion estan vinculadas");
    assert.equal(recuento.cartera, 1);
    assert.equal(recuento.chatsTomados, 1);
    assert.equal(recuento.tareasAbiertas, 1);
    assert.equal(recuento.notas, 1);
    assert.equal(recuento.permisosPropios, 1);
    assert.equal(recuento.diasDeActividad, 1);
    // Del cruce se va A y no entra ninguno: B ya lo tenia.
    assert.deepEqual(recuento.modulosQueSeQuitan, [MOD_A]);
    assert.deepEqual(recuento.modulosQueSeDan, []);

    // Pasa de la MADRE a una hija. La bandeja solo baja (punto 5 de la
    // auditoria de alcance): desde Atencion no se alcanzan las lineas de la
    // madre, asi que los chats de antes se pierden aunque sea administradora y
    // esten en la misma familia. Antes el informe decia «sigue» — y en cuanto
    // se abria Chats esas lineas contestaban «No autorizado».
    assert.equal(recuento.origenCuelgaDelDestino, false);
    assert.equal(areas.chats.suerte, "se_pierde");
    // Las tareas tampoco, con ningun rol.
    assert.equal(areas.tareas.suerte, "se_pierde");
    assert.equal(areas.permisos_propios.suerte, "sigue");

    // Y lo que de verdad prueba que no escribe: la fila sigue igual.
    assert.deepEqual(await laFila(), antes);
});

test("un contador que no puede contar devuelve `null`, NO cero", { skip: ROTO }, async () => {
    ponerAQuienMira(COMO.madre);
    const res = await informeDeLaMudanzaAction(MARIA, ATENCION, "agente");
    assert.equal(res.success, true, res.message);
    // El chat del equipo no se ha usado nunca en esta base, asi que su tabla no
    // existe. Un cero ahi diria «no esta en ningun canal» y esto es justo lo que
    // alguien va a leer para decidir si la mueve.
    assert.equal(res.data.recuento.canalesDondeEsta, null);
    assert.equal(res.data.recuento.canalesDeAreaDeAntes, null);
});

test("como AGENTE los chats se pierden, y el informe lo dice", { skip: ROTO }, async () => {
    ponerAQuienMira(COMO.madre);
    const res = await informeDeLaMudanzaAction(MARIA, ATENCION, "agente");
    assert.equal(res.success, true, res.message);
    assert.equal(res.data.areas.chats.suerte, "se_pierde");
    assert.match(res.data.areas.chats.porque, /agente/i);
});

/* ──────────────────────────── Las puertas ──────────────────────────────── */

test("un `agente` no mueve a nadie", { skip: ROTO }, async () => {
    ponerAQuienMira(COMO.agente);
    const res = await mudarALaPersonaAction(MARIA, ATENCION, "agente");
    assert.equal(res.success, false);
    assert.match(res.message, /No autorizado/);
    assert.equal((await laFila()).owner, MADRE, "no se movio");
});

test("una cuenta de FUERA de la familia tampoco", { skip: ROTO }, async () => {
    ponerAQuienMira(COMO.ajena);
    const res = await mudarALaPersonaAction(MARIA, ATENCION, "agente");
    assert.equal(res.success, false);
    assert.equal((await laFila()).owner, MADRE);
});

test("una CUENTA no se muda, y un destino que es persona se rechaza", { skip: ROTO }, async () => {
    ponerAQuienMira(COMO.madre);

    const cuenta = await mudarALaPersonaAction(ATENCION, MADRE, "agente");
    assert.equal(cuenta.success, false);
    assert.match(cuenta.message, /no es del equipo/i);

    const aUnaPersona = await mudarALaPersonaAction(MARIA, OTRO_AGENTE, "agente");
    assert.equal(aUnaPersona.success, false);
    assert.match(aUnaPersona.message, /persona/i);

    assert.equal((await laFila()).owner, MADRE, "ninguna de las dos la movio");
});

test("el selector ofrece solo cuentas de la familia, y ninguna persona", { skip: ROTO }, async () => {
    ponerAQuienMira(COMO.madre);
    const res = await cuentasParaMudarAction();
    assert.equal(res.success, true, res.message);
    const ids = res.data.map((c) => c.id);
    assert.ok(ids.includes(ATENCION), "esta la hermana");
    assert.ok(!ids.includes(MARIA), "no esta ninguna persona");
    assert.ok(!ids.includes(AJENA), "no esta una cuenta de fuera");
});

/* ─────────────────────────── La mudanza ────────────────────────────────── */

test("MODO=roto: mover solo la fila deja la cartera y los modulos atras", async () => {
    if (!ROTO) return;

    await mudanzaIngenua();

    // 1. Su cartera se queda colgando de la cuenta de ANTES. Sigue funcionando
    //    —`clientesDelAsesor` busca por `advisor_user_id`— asi que no se ve
    //    nada roto: lo que pasa es que desde la cuenta nueva nadie puede
    //    quitarsela, porque Equipo acota por `owner_user_id`.
    const cartera = await laCartera();
    assert.equal(cartera.length, 1);
    assert.equal(cartera[0].cuenta, MADRE, "la cartera se quedo en la cuenta de antes");

    // 2. Y sigue con un modulo que su cuenta nueva no tiene.
    const modulos = await losModulosDe(MARIA);
    assert.ok(modulos.includes(MOD_A), "sigue abierto un modulo que Atencion no tiene");
});

test("la mudanza mueve su fila, su cartera y sus modulos", { skip: ROTO }, async () => {
    ponerAQuienMira(COMO.madre);
    const res = await mudarALaPersonaAction(MARIA, ATENCION, "administrador");
    assert.equal(res.success, true, res.message);
    assert.equal(res.data.carteraMovida, 1);
    assert.equal(res.data.modulosQuitados, 1);
    assert.equal(res.data.modulosDados, 0);

    assert.deepEqual(await laFila(), { owner: ATENCION, rol: "administrador" });

    const cartera = await laCartera();
    assert.equal(cartera.length, 1, "la fila no se duplico ni se perdio");
    assert.equal(cartera[0].asesor, MARIA, "sigue siendo su cartera");
    assert.equal(cartera[0].cuenta, ATENCION, "y ahora se gestiona desde la cuenta nueva");

    // Solo el cruce: nunca un modulo que Atencion no tenga.
    assert.deepEqual(await losModulosDe(MARIA), [MOD_B]);
});

test("nada de lo que ella firmo cambio de autor", { skip: ROTO }, async () => {
    const ahora = await lasFirmas();
    assert.deepEqual(ahora, FIRMAS_ANTES, "las cinco siguen con su id, una por una");
    // Y la mas facil de estropear «por consistencia»: el rato que paso en la
    // cuenta de antes lo paso alli. Es historia, no alcance.
    assert.equal(ahora.cuentaDeLaActividad, MADRE);
});

test("no queda nada apuntando a la cuenta que deja", { skip: ROTO }, async () => {
    const resto = await uno(
        `SELECT COUNT(*)::int AS n FROM "advisor_clients"
         WHERE "advisor_user_id" = $1 AND "owner_user_id" = $2`,
        MARIA,
        MADRE,
    );
    assert.equal(resto.n, 0);

    // Y su `owner_id` apunta a una fila que existe y que ES una cuenta.
    const destino = await uno(
        `SELECT u."id" AS id, u."owner_id" AS owner
         FROM "User" p JOIN "User" u ON u."id" = p."owner_id"
         WHERE p."id" = $1`,
        MARIA,
    );
    assert.equal(destino.id, ATENCION);
    assert.equal(destino.owner, null, "el destino no cuelga de nadie: es una cuenta");
});

test("moverla otra vez desde la cuenta de antes no hace nada", { skip: ROTO }, async () => {
    // Entre el informe y el boton alguien pudo adelantarse. El `UPDATE` va
    // condicionado al origen que se vio, asi que esta llamada no la arrastra
    // desde donde ya no estaba.
    ponerAQuienMira(COMO.madre);
    const res = await mudarALaPersonaAction(MARIA, MADRE, "agente");
    // Ahora su cuenta ES Atencion, asi que mover a MADRE ya no es «volver»:
    // es una mudanza normal, y la madre manda en las dos.
    assert.equal(res.success, true, res.message);
    assert.equal((await laFila()).owner, MADRE);

    // Y su cartera vuelve con ella, sin duplicarse.
    const cartera = await laCartera();
    assert.equal(cartera.length, 1);
    assert.equal(cartera[0].cuenta, MADRE);
});
