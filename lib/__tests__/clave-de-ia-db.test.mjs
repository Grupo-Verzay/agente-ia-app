/**
 * Las ACCIONES de verdad contra Postgres: lo que devuelven al navegador no
 * lleva la clave de IA, guardar con el campo vacío la conserva, y el lector
 * que sí la devuelve (`resolveUserAiClient`) sigue funcionando en el servidor
 * con su misma puerta.
 *
 * Lo único que se finge es `currentUser()`. Probar `sinLaClave` a solas no
 * diría nada de esto: el fallo estaba en QUÉ devolvían las acciones.
 *
 * `MODO=roto` empaqueta `actions/userAiconfig-actions.ts` tal como estaba antes
 * del arreglo y AFIRMA el fallo: la clave en claro dentro de la respuesta.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/clave-de-ia/entrada-de-la-clave-de-ia-antes.js"
        : "./.compilado/clave-de-ia/entrada-de-la-clave-de-ia.js"
);
const { ponerAQuienMira, db } = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUENTA = `clave-cuenta-${V}`;
const OTRA = `clave-otra-${V}`;
const SIN_CLAVE = `clave-vacia-${V}`;
/** La llave «de la casa» con la que nace una cuenta: la que no puede salir. */
const CLAVE = `sk-proj-casa-${V}-abcdefghijklmnopqrstuvwxyzQRST`;

function quien(id) {
    return {
        id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
        role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id,
    };
}

let proveedor;

test.before(async () => {
    proveedor = await db.aiProvider.upsert({
        where: { name: "openai" },
        update: {},
        create: { name: "openai", aiModel: "gpt-4o-mini" },
    });
    const modelo = await db.aiModel.upsert({
        where: { providerId_name: { providerId: proveedor.id, name: "gpt-4o-mini" } },
        update: {},
        create: { providerId: proveedor.id, name: "gpt-4o-mini" },
    });
    for (const id of [CUENTA, OTRA, SIN_CLAVE]) {
        await db.user.create({
            data: {
                id, email: `${id}@banco.test`, name: id, role: "user",
                defaultProviderId: proveedor.id, defaultAiModelId: modelo.id,
            },
        });
    }
    await db.userAiConfig.create({
        data: { userId: CUENTA, providerId: proveedor.id, apiKey: CLAVE, isActive: true },
    });
});

test.after(async () => {
    await db.userAiConfig.deleteMany({ where: { userId: { in: [CUENTA, OTRA, SIN_CLAVE] } } });
    await db.user.deleteMany({ where: { id: { in: [CUENTA, OTRA, SIN_CLAVE] } } });
    await db.$disconnect();
});

const llevaLaClave = (x) => JSON.stringify(x).includes(CLAVE);

test("Perfil: getUserAiSettings no lleva la clave, pero dice que hay y su final", async () => {
    ponerAQuienMira(quien(CUENTA));
    const r = await m.getUserAiSettings(CUENTA);
    assert.equal(r.success, true, r.message);
    if (ROTO) {
        assert.equal(llevaLaClave(r), true, "el modo roto tiene que reproducir la clave en claro");
        return;
    }
    assert.equal(llevaLaClave(r), false, "la clave viaja en la respuesta");
    const cfg = r.data.configs.find((c) => c.providerId === proveedor.id);
    assert.equal("apiKey" in cfg, false);
    assert.equal(cfg.tieneClave, true);
    assert.equal(cfg.finalDeLaClave, "QRST");
});

test("getUserAiConfigs tampoco", async () => {
    ponerAQuienMira(quien(CUENTA));
    const r = await m.getUserAiConfigs(CUENTA);
    assert.equal(r.success, true);
    assert.equal(llevaLaClave(r), ROTO);
});

test("guardar con el campo VACÍO conserva la clave guardada", async () => {
    ponerAQuienMira(quien(CUENTA));
    const r = await m.upsertUserAiConfig({
        userId: CUENTA, providerId: proveedor.id, apiKey: "", temperature: 0.2, makeDefaultProvider: true,
    });
    const fila = await db.userAiConfig.findUnique({
        where: { userId_providerId: { userId: CUENTA, providerId: proveedor.id } },
    });
    if (ROTO) {
        // Antes el vacío no se podía mandar: el formulario iba relleno con la
        // clave, y la acción lo rechazaba por no empezar por "sk-".
        assert.equal(r.success, false);
        return;
    }
    assert.equal(r.success, true, r.message);
    assert.equal(llevaLaClave(r), false);
    assert.equal(fila.apiKey, CLAVE, "vacío tiene que conservar la clave");
    assert.equal(fila.temperature, 0.2, "y guardar lo demás");
});

test("guardar una clave NUEVA la cambia, y la respuesta no la trae", async () => {
    ponerAQuienMira(quien(OTRA));
    const nueva = `sk-propia-${V}-0123456789abcdefgh`;
    const r = await m.upsertUserAiConfig({ userId: OTRA, providerId: proveedor.id, apiKey: nueva });
    assert.equal(r.success, true, r.message);
    const fila = await db.userAiConfig.findUnique({
        where: { userId_providerId: { userId: OTRA, providerId: proveedor.id } },
    });
    assert.equal(fila.apiKey, nueva);
    assert.equal(JSON.stringify(r).includes(nueva), ROTO);
});

test("sin clave guardada, el vacío no crea una fila vacía", async () => {
    ponerAQuienMira(quien(SIN_CLAVE));
    const r = await m.upsertUserAiConfig({ userId: SIN_CLAVE, providerId: proveedor.id, apiKey: "" });
    assert.equal(r.success, false);
    const fila = await db.userAiConfig.findUnique({
        where: { userId_providerId: { userId: SIN_CLAVE, providerId: proveedor.id } },
    });
    assert.equal(fila, null);
});

test("update y toggle devuelven la fila sin la clave", async () => {
    ponerAQuienMira(quien(CUENTA));
    const u = await m.updateUserAiConfig({ userId: CUENTA, providerId: proveedor.id, isActive: true });
    const t = await m.toggleUserAiConfigActive(CUENTA, proveedor.id, true);
    assert.equal(u.success && t.success, true);
    assert.equal(llevaLaClave(u) || llevaLaClave(t), ROTO);
    const fila = await db.userAiConfig.findUnique({
        where: { userId_providerId: { userId: CUENTA, providerId: proveedor.id } },
    });
    assert.equal(fila.apiKey, CLAVE, "update sin clave la conserva");
});

test("resolveUserAiClient sigue dando la clave EN EL SERVIDOR, con su misma puerta", async () => {
    if (ROTO) {
        // Antes vivía en el fichero 'use server': exportada ahí era un endpoint.
        assert.equal(typeof m.resolveUserAiClient, "function");
        return;
    }
    ponerAQuienMira(quien(CUENTA));
    const propia = await m.resolveUserAiClient(CUENTA);
    assert.equal(propia.success, true, propia.message);
    assert.equal(propia.data.apiKey, CLAVE);
    assert.equal(propia.data.provider, "openai");

    // Otra cuenta pidiendo la de esta: la puerta de siempre la rechaza.
    ponerAQuienMira(quien(OTRA));
    const ajena = await m.resolveUserAiClient(CUENTA);
    assert.equal(ajena.success, false);
    assert.equal(llevaLaClave(ajena), false);
});
