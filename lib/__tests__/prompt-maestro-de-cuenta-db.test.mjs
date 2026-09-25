/**
 * Las ACCIONES de verdad contra Postgres: leer y guardar el prompt maestro de
 * una cuenta, con su puerta. Lo único que se finge es `currentUser()`.
 *
 * Solo corre en el modo normal: antes de este cambio las acciones no existían.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = ROTO ? null : await import("./.compilado/prompt-maestro/entrada-del-prompt-maestro.js");
const t = ROTO ? test.skip : test;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CLIENTE = `pm-cliente-${V}`;
const OTRA = `pm-otra-${V}`;
const SUPER = `pm-super-${V}`;
const ADMIN = `pm-admin-${V}`;

function quien(id, extra = {}) {
    return {
        id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
        role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id, ...extra,
    };
}
const superAdmin = () => quien(SUPER, { role: "super_admin", rolDeLaPersona: "super_admin" });

async function laFila(cuentaId) {
    const filas = await m.db.$queryRawUnsafe(
        `SELECT "texto", "actualizadoPorId" FROM "prompt_maestro_de_cuenta" WHERE "cuentaId" = $1`, cuentaId,
    );
    return filas[0] ?? null;
}

test.before(async () => {
    if (ROTO) return;
    for (const [id, role] of [[CLIENTE, "user"], [OTRA, "user"], [SUPER, "super_admin"], [ADMIN, "admin"]]) {
        await m.db.user.create({ data: { id, email: `${id}@banco.test`, name: id, role } });
    }
});

test.after(async () => {
    if (ROTO) return;
    await m.db.$executeRawUnsafe(`DELETE FROM "prompt_maestro_de_cuenta" WHERE "cuentaId" LIKE 'pm-%-${V}'`).catch(() => {});
    await m.db.user.deleteMany({ where: { id: { in: [CLIENTE, OTRA, SUPER, ADMIN] } } });
    await m.db.$disconnect();
});

t("una cuenta que nunca tuvo prompt propio lee vacío (usa el global)", async () => {
    m.ponerAQuienMira(superAdmin());
    const r = await m.leerPromptMaestroDeCuentaAction(OTRA);
    assert.equal(r.success, true, r.message);
    assert.equal(r.data.texto, null);
});

t("el dueño de la plataforma guarda un prompt propio y se lee igual", async () => {
    m.ponerAQuienMira(superAdmin());
    const texto = `Eres el asistente de la clínica ${V}.\nNunca des precios.`;
    const g = await m.guardarPromptMaestroDeCuentaAction(CLIENTE, texto);
    assert.equal(g.success, true, g.message);
    const r = await m.leerPromptMaestroDeCuentaAction(CLIENTE);
    assert.equal(r.data.texto, texto);
    const fila = await laFila(CLIENTE);
    assert.equal(fila.texto, texto);
    assert.equal(fila.actualizadoPorId, SUPER, "firma la persona");
    assert.equal(await laFila(OTRA), null, "la otra cuenta no se toca");
});

t("vaciar el campo BORRA la fila: la cuenta vuelve al global", async () => {
    m.ponerAQuienMira(superAdmin());
    const g = await m.guardarPromptMaestroDeCuentaAction(CLIENTE, "   \n  ");
    assert.equal(g.success, true, g.message);
    assert.equal(g.data.texto, null);
    assert.equal(await laFila(CLIENTE), null);
});

t("el cliente, un admin y un super admin dentro de una cuenta por «Ingresar» NO pueden", async () => {
    const intentos = [
        quien(CLIENTE),
        quien(ADMIN, { role: "admin", rolDeLaPersona: "admin" }),
        quien(CLIENTE, { rolDeLaPersona: "super_admin", sessionUserId: SUPER, porImpersonacion: true }),
    ];
    for (const persona of intentos) {
        m.ponerAQuienMira(persona);
        const g = await m.guardarPromptMaestroDeCuentaAction(CLIENTE, "intento de colarse");
        assert.equal(g.success, false);
        assert.equal(g.message, "No autorizado.");
        const r = await m.leerPromptMaestroDeCuentaAction(CLIENTE);
        assert.equal(r.success, false);
    }
    assert.equal(await laFila(CLIENTE), null, "no se escribió nada");
});

t("una cuenta que no existe no deja una fila huérfana, y el tope se respeta", async () => {
    m.ponerAQuienMira(superAdmin());
    const g = await m.guardarPromptMaestroDeCuentaAction(`pm-noexiste-${V}`, "hola");
    assert.equal(g.success, false);
    assert.equal(await laFila(`pm-noexiste-${V}`), null);
    const largo = await m.guardarPromptMaestroDeCuentaAction(CLIENTE, "x".repeat(100_001));
    assert.equal(largo.success, false);
    assert.equal(await laFila(CLIENTE), null);
});
