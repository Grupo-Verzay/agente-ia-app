/**
 * La clave del servidor de WhatsApp no viaja al navegador, y nadie actúa
 * sobre una clave o una línea que no alcanza.
 *
 * La clave de Evolution es GLOBAL: la comparten todas las cuentas de ese
 * servidor. Así que filtrarla a una sola cuenta —o a quien abre la página
 * pública de agendar— es entregar el WhatsApp de todas las demás.
 *
 * Contra Postgres con el esquema real y con `currentUser()` DE VERDAD; lo único
 * fingido es la petición (sesión y cookies) y el `fetch` hacia Evolution.
 *
 * `MODO=roto` empaqueta ESTAS MISMAS pruebas contra el código de antes
 * (`ANTES_REF`) y AFIRMA la fuga en cada punto.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO ? "./.compilado/clave-antes/entrada-de-la-clave.js" : "./.compilado/clave/entrada-de-la-clave.js"
);
const { ponerLaSesion, api, recordatorios, seguimientos, copia, currentUser, db } = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CLAVE = `CLAVE-GLOBAL-SECRETA-${V}`;
const SERVIDOR = `srv-${V}`;
const MADRE = `m-madre-${V}`;
const HIJA = `h-hija-${V}`;
const AJENA = `z-ajena-${V}`; // reseller, sin vínculo con la madre
const SUPER = `s-super-${V}`;
const CUENTAS = [MADRE, HIJA, AJENA, SUPER];
const linea = (c) => `linea-${c}`;
const TOKEN = (c) => `TOKEN-LINEA-${c}`;
const JID = `57300${String(Date.now()).slice(-7)}@s.whatsapp.net`;

const lleva = (valor, que) => JSON.stringify(valor ?? null).includes(que);

let llamadasAEvolution = 0;
const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = async (url) => {
    if (String(url).includes("evo.banco")) llamadasAEvolution++;
    return new Response(JSON.stringify({ ok: true, instance: { state: "close" } }), { status: 200 });
};

async function como(quien, fn) {
    ponerLaSesion(quien);
    return fn();
}

test.before(async () => {
    await db.apiKey.create({ data: { id: SERVIDOR, url: "evo.banco", key: CLAVE } });
    const roles = { [MADRE]: "user", [HIJA]: "user", [AJENA]: "reseller", [SUPER]: "super_admin" };
    for (const id of CUENTAS) {
        await db.user.create({
            data: { id, email: `${id}@banco.test`, name: id, company: id, role: roles[id], apiKeyId: SERVIDOR },
        });
        await db.instancia.create({
            data: { instanceName: linea(id), instanceId: TOKEN(id), userId: id, instanceType: "Whatsapp" },
        });
    }
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" ("id", "master_user_id", "linked_user_id", "role") VALUES ($1, $2, $3, 'agente')`,
        `lk-${V}`, MADRE, HIJA);
    await db.reminders.create({
        data: {
            title: "Recordatorio de agenda", description: "Hola {{nombre}}", time: "1h", userId: MADRE,
            isSchedule: true, isCampaign: false, serverUrl: "https://evo.banco", apikey: CLAVE,
            instanceName: linea(MADRE),
        },
    });
});

test.after(async () => {
    globalThis.fetch = fetchDeVerdad;
    await db.$executeRawUnsafe(`DELETE FROM "linked_accounts" WHERE "id" = $1`, `lk-${V}`);
    await db.seguimiento.deleteMany({ where: { remoteJid: JID } });
    await db.reminders.deleteMany({ where: { userId: { in: CUENTAS } } });
    await db.instancia.deleteMany({ where: { userId: { in: CUENTAS } } });
    await db.user.deleteMany({ where: { id: { in: CUENTAS } } });
    await db.apiKey.deleteMany({ where: { id: SERVIDOR } });
    await db.$disconnect();
});

test("la sesión (`currentUser`) no lleva la clave del servidor: es lo que llega a toda pantalla", async () => {
    const u = await como(MADRE, () => currentUser());
    assert.ok(u, "hay sesión");
    if (ROTO) {
        assert.ok(lleva(u, CLAVE), "antes: la sesión llevaba la clave global dentro");
        return;
    }
    assert.equal(lleva(u, CLAVE), false);
    assert.equal(u.apiKey?.url, "evo.banco", "la URL sí sigue, para saber que hay servidor");
});

test("un cliente cualquiera NO lista las claves de servidor de la plataforma", async () => {
    const r = await como(MADRE, () => api.obtenerApiKeys());
    if (ROTO) {
        assert.ok(lleva(r, CLAVE), "antes: cualquier sesión listaba todas las claves");
        return;
    }
    assert.equal(r.success, false);
    assert.equal(lleva(r, CLAVE), false);
});

test("quien administra la plataforma SÍ las lista (no se rompe la pantalla de servidores)", async () => {
    const r = await como(SUPER, () => api.obtenerApiKeys());
    assert.equal(r.success, true);
    assert.ok(lleva(r, CLAVE));
});

test("«dame la clave de este servidor» ya no existe como acción", async () => {
    if (ROTO) {
        const r = await como(AJENA, () => api.getApiKeyById(SERVIDOR));
        assert.ok(lleva(r, CLAVE), "antes: con el id del servidor se leía la clave");
        return;
    }
    assert.equal(api.getApiKeyById, undefined);
});

test("un cliente no puede EDITAR la clave de un servidor", async () => {
    const f = new FormData();
    f.set("id", SERVIDOR); f.set("url", "evo.banco"); f.set("key", "CLAVE-PISADA");
    const r = await como(MADRE, () => api.editarApiKey(f));
    const fila = await db.apiKey.findUnique({ where: { id: SERVIDOR } });
    if (ROTO) {
        assert.equal(fila.key, "CLAVE-PISADA", "antes: cualquiera cambiaba la clave de un servidor");
        await db.apiKey.update({ where: { id: SERVIDOR }, data: { key: CLAVE } });
        return;
    }
    assert.equal(r.success, false);
    assert.equal(fila.key, CLAVE, "la clave sigue intacta");
});

test("un cliente no puede CREAR claves de servidor", async () => {
    const f = new FormData();
    f.set("url", `otro-${V}.banco`); f.set("key", "OTRA");
    const r = await como(MADRE, () => api.agregarApi(f));
    const creadas = await db.apiKey.findMany({ where: { url: `otro-${V}.banco` } });
    await db.apiKey.deleteMany({ where: { url: `otro-${V}.banco` } });
    if (ROTO) {
        assert.equal(creadas.length, 1, "antes: cualquiera creaba servidores");
        return;
    }
    assert.equal(r.success, false);
    assert.equal(creadas.length, 0);
});

test("la página PÚBLICA de agendar no recibe la clave en sus recordatorios", async () => {
    const r = await como(null, () => recordatorios.getScheduleRemindersByUserId(MADRE));
    assert.equal(r.success, true);
    assert.ok(r.data.length >= 1, "el recordatorio de agenda sale");
    if (ROTO) {
        assert.ok(lleva(r, CLAVE), "antes: la página pública recibía la clave global");
        return;
    }
    assert.equal(lleva(r, CLAVE), false);
});

test("Recordatorios: la lista de la cuenta tampoco lleva la clave", async () => {
    const r = await como(MADRE, () => recordatorios.getRemindersByUserId(MADRE));
    assert.equal(r.success, true);
    if (ROTO) {
        assert.ok(lleva(r, CLAVE));
        return;
    }
    assert.equal(lleva(r, CLAVE), false);
});

test("crear un recordatorio: la clave la pone el SERVIDOR, no la que mande el navegador", async () => {
    const r = await como(MADRE, () =>
        recordatorios.createReminder({
            title: `Rec ${V}`, time: new Date(Date.now() + 3600e3).toISOString(), userId: MADRE,
            remoteJid: JID, instanceName: linea(MADRE), serverUrl: "http://malo.banco", apikey: "CLAVE-INVENTADA",
        }));
    const fila = await db.reminders.findFirst({ where: { title: `Rec ${V}` } });
    assert.ok(fila, "se creó");
    if (ROTO) {
        assert.equal(fila.apikey, "CLAVE-INVENTADA", "antes: se guardaba la clave que llegaba del navegador");
        return;
    }
    assert.equal(r.success, true);
    assert.equal(fila.apikey, CLAVE, "guardada con la del servidor de la cuenta");
    assert.equal(fila.serverUrl, "https://evo.banco");
    assert.equal(lleva(r, CLAVE), false, "y la respuesta no la devuelve");
});

test("un seguimiento no se programa por la línea de una cuenta que no se alcanza", async () => {
    const r = await como(AJENA, () =>
        seguimientos.createSeguimiento({
            idNodo: "", instancia: linea(MADRE), remoteJid: JID, mensaje: `intruso ${V}`,
            apikey: "X", serverurl: "http://malo.banco", tipo: "text",
        }));
    const filas = await db.seguimiento.findMany({ where: { mensaje: `intruso ${V}` } });
    if (ROTO) {
        assert.equal(filas.length, 1, "antes: cualquiera programaba mensajes por la línea de otro");
        return;
    }
    assert.equal(r.success, false);
    assert.equal(filas.length, 0);
});

test("la HIJA tampoco programa por la línea de su MADRE (nunca hacia arriba)", async () => {
    const r = await como(HIJA, () =>
        seguimientos.createSeguimiento({ idNodo: "", instancia: linea(MADRE), remoteJid: JID, mensaje: `hija ${V}`, tipo: "text" }));
    const filas = await db.seguimiento.findMany({ where: { mensaje: `hija ${V}` } });
    if (ROTO) return;
    assert.equal(r.success, false);
    assert.equal(filas.length, 0);
});

test("la MADRE sí programa por la línea de su HIJA, con la clave puesta por el servidor", async () => {
    if (ROTO) return;
    const r = await como(MADRE, () =>
        seguimientos.createSeguimiento({ idNodo: "", instancia: linea(HIJA), remoteJid: JID, mensaje: `madre ${V}`, tipo: "text", apikey: "X" }));
    assert.equal(r.success, true);
    const fila = await db.seguimiento.findFirst({ where: { mensaje: `madre ${V}` } });
    assert.equal(fila.apikey, CLAVE);
    assert.equal(lleva(r, CLAVE), false);
});

test("borrar la línea de otra cuenta con la función interna: se niega y no toca nada", async () => {
    llamadasAEvolution = 0;
    const r = await como(AJENA, () => api.deleteInstanceInternal(MADRE));
    const sigue = await db.instancia.findFirst({ where: { instanceName: linea(MADRE) } });
    if (ROTO) {
        assert.equal(sigue, null, "antes: una cuenta ajena borraba la línea de otra");
        await db.instancia.create({ data: { instanceName: linea(MADRE), instanceId: TOKEN(MADRE), userId: MADRE, instanceType: "Whatsapp" } });
        return;
    }
    assert.equal(r.success, false);
    assert.ok(sigue, "la línea sigue");
    assert.equal(llamadasAEvolution, 0, "ni se llegó a hablar con Evolution");
});

test("crear una línea a nombre de otra cuenta con la función interna: se niega", async () => {
    const r = await como(AJENA, () => api.createInstanceInternal(MADRE, `nueva-${V}`));
    const creada = await db.instancia.findFirst({ where: { instanceName: `nueva-${V}` } });
    await db.instancia.deleteMany({ where: { instanceName: `nueva-${V}` } });
    if (ROTO) return;
    assert.equal(r.success, false);
    assert.equal(creada, null);
});

test("la copia de seguridad de OTRA cuenta no se saca, y la propia no lleva la clave", async () => {
    const ajena = await como(AJENA, () => copia.exportUserBackupAction(MADRE));
    if (ROTO) {
        assert.equal(ajena.success, true, "antes: un reseller sacaba la copia de cualquier cuenta");
        assert.ok(lleva(ajena, CLAVE), "…con la clave global dentro");
        return;
    }
    assert.equal(ajena.success, false);
    const propia = await como(MADRE, () => copia.exportUserBackupAction(MADRE));
    assert.equal(propia.success, true);
    assert.equal(lleva(propia, CLAVE), false);
});

test("al final: un cliente no puede BORRAR la clave de un servidor", async () => {
    const r = await como(MADRE, () => api.eliminarApiKey(SERVIDOR));
    const fila = await db.apiKey.findUnique({ where: { id: SERVIDOR } }).catch(() => null);
    if (ROTO) {
        // antes el borrado fallaba solo por la clave foránea de las cuentas que
        // lo usan: la puerta no existía. Lo que se afirma es que se intentó.
        assert.ok(r.success === true || /foreign|constraint|violat/i.test(String(r.message)),
            "antes: no había puerta, solo la base lo frenaba");
        return;
    }
    assert.equal(r.success, false);
    assert.match(r.message, /No autorizado/);
    assert.ok(fila);
});
