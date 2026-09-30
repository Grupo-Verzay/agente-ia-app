/**
 * Integrar URLs contra POSTGRES, con las cinco acciones de producción. Solo se
 * finge quién ha iniciado sesión y `revalidatePath`.
 *
 * Lo que esta mitad prueba y un banco puro no puede decir: que lo que llega del
 * navegador NO se guarda tal cual —una `javascript:` se rechaza, una sin
 * `https://` se guarda con él—, que el tope de diez existe de verdad, que la
 * posición de una app nueva no choca con otra después de borrar una del medio,
 * que editar o borrar una fila que ya no está no revienta, y que ninguna de las
 * cinco toca las apps de OTRA cuenta.
 *
 * `MODO=roto` empaqueta las MISMAS pruebas contra el código de `ANTES_REF` y
 * AFIRMA los fallos.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ROTO = process.env.MODO === "roto";
const m = await import(join(AQUI, ".compilado", "integraciones-db", "entrada-de-integraciones.js"));
const { db, ponerAQuienMira, getUserIntegrations, createUserIntegration, updateUserIntegration, deleteUserIntegration, reorderUserIntegrations } = m;

const SELLO = Date.now().toString(36);
const DUENA = `duena-intg-${SELLO}`;
const OTRA = `otra-intg-${SELLO}`;
const comoDuena = () => ponerAQuienMira({ id: DUENA });
const lasDe = (userId) => db.userIntegration.findMany({ where: { userId }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });

test.before(async () => {
    await db.user.create({ data: { id: DUENA, email: `${DUENA}@b.test`, name: "Dueña" } });
    await db.user.create({ data: { id: OTRA, email: `${OTRA}@b.test`, name: "Otra" } });
    await db.userIntegration.create({ data: { userId: OTRA, name: "De la otra", url: "https://otra.co", order: 0 } });
});
test.after(async () => {
    await db.userIntegration.deleteMany({ where: { userId: { in: [DUENA, OTRA] } } });
    await db.user.deleteMany({ where: { id: { in: [DUENA, OTRA] } } });
    await db.$disconnect();
});

if (ROTO) {
    test("ANTES: una dirección javascript: se guardaba tal cual", async () => {
        comoDuena();
        const r = await createUserIntegration({ name: "Trampa", url: "javascript:alert(document.cookie)" });
        assert.equal(r.success, true);
        const guardadas = await lasDe(DUENA);
        assert.ok(guardadas.some((i) => i.url === "javascript:alert(document.cookie)"));
    });

    test("ANTES: una sin https:// se guardaba sin él (y se abría dentro de la propia App)", async () => {
        comoDuena();
        await createUserIntegration({ name: "Sin esquema", url: "typebot.co/bot" });
        assert.ok((await lasDe(DUENA)).some((i) => i.url === "typebot.co/bot"));
    });

    test("ANTES: el máximo de 10 no existía", async () => {
        comoDuena();
        for (let i = (await lasDe(DUENA)).length; i < 11; i++) {
            const r = await createUserIntegration({ name: `App ${i}`, url: `https://app${i}.co` });
            assert.equal(r.success, true, `la ${i + 1}.ª no se aceptó`);
        }
        assert.equal((await lasDe(DUENA)).length, 11);
    });

    test("ANTES: editar una que ya no está REVENTABA en vez de contestar", async () => {
        comoDuena();
        await assert.rejects(() => updateUserIntegration("no-existe", { name: "X" }));
    });
} else {
    test("sin sesión no se hace nada", async () => {
        ponerAQuienMira(null);
        assert.equal((await createUserIntegration({ name: "X", url: "https://x.co" })).success, false);
        assert.equal((await getUserIntegrations()).success, false);
        assert.equal((await reorderUserIntegrations(["a"])).success, false);
    });

    test("crear: se rechaza lo que no es una web, y se guarda con https:// lo que no lo traía", async () => {
        comoDuena();
        const trampa = await createUserIntegration({ name: "Trampa", url: "javascript:alert(document.cookie)" });
        assert.equal(trampa.success, false);
        assert.match(trampa.error, /direcciones web/);
        const sinNombre = await createUserIntegration({ name: "   ", url: "https://x.co" });
        assert.equal(sinNombre.success, false);
        const bien = await createUserIntegration({ name: "  Mi   Typebot ", url: "typebot.co/bot" });
        assert.equal(bien.success, true, bien.error);
        assert.equal(bien.item.name, "Mi Typebot");
        assert.equal(bien.item.url, "https://typebot.co/bot");
        const guardadas = await lasDe(DUENA);
        assert.deepEqual(guardadas.map((i) => i.url), ["https://typebot.co/bot"]);
    });

    test("crear: un nombre repetido (con otra mayúscula o tilde) se rechaza", async () => {
        comoDuena();
        const r = await createUserIntegration({ name: "MI TYPEBOT", url: "https://otro.co" });
        assert.equal(r.success, false);
        assert.match(r.error, /Ya tienes una app llamada/);
    });

    test("crear: la posición es la siguiente a la ÚLTIMA, no el número de filas (con una borrada en medio)", async () => {
        comoDuena();
        const b = (await createUserIntegration({ name: "B", url: "https://b.co" })).item;
        const c = (await createUserIntegration({ name: "C", url: "https://c.co" })).item;
        assert.equal((await deleteUserIntegration(b.id)).success, true);
        const d = (await createUserIntegration({ name: "D", url: "https://d.co" })).item;
        assert.ok(d.order > c.order, `D quedó en ${d.order} y C en ${c.order}: dos filas en el mismo sitio`);
        assert.deepEqual((await lasDe(DUENA)).map((i) => i.name), ["Mi Typebot", "C", "D"]);
    });

    test("crear: el tope de 10 existe de verdad", async () => {
        comoDuena();
        let n = (await lasDe(DUENA)).length;
        while (n < 10) {
            const r = await createUserIntegration({ name: `Relleno ${n}`, url: `https://relleno${n}.co` });
            assert.equal(r.success, true, r.error);
            n += 1;
        }
        const once = await createUserIntegration({ name: "La once", url: "https://once.co" });
        assert.equal(once.success, false);
        assert.match(once.error, /máximo/);
        assert.equal((await lasDe(DUENA)).length, 10);
    });

    test("editar: la de otra cuenta no se toca, y una que ya no está se dice sin reventar", async () => {
        comoDuena();
        const [ajena] = await lasDe(OTRA);
        const r = await updateUserIntegration(ajena.id, { name: "Robada", url: "https://robo.co" });
        assert.equal(r.success, false);
        assert.equal((await lasDe(OTRA))[0].name, "De la otra");
        const nada = await updateUserIntegration("no-existe", { name: "X" });
        assert.equal(nada.success, false);
        assert.match(nada.error, /ya no existe/);
    });

    test("editar: pasa por las mismas reglas, y un nombre de otra app se rechaza", async () => {
        comoDuena();
        const [primera, segunda] = await lasDe(DUENA);
        assert.equal((await updateUserIntegration(primera.id, { url: "javascript:x" })).success, false);
        const repetido = await updateUserIntegration(primera.id, { name: segunda.name });
        assert.equal(repetido.success, false);
        assert.match(repetido.error, /otra app llamada/);
        const bien = await updateUserIntegration(primera.id, { name: "Mi Typebot", url: "typebot.co/otro" });
        assert.equal(bien.success, true, bien.error);
        assert.equal((await lasDe(DUENA))[0].url, "https://typebot.co/otro");
    });

    test("reordenar: se guarda la lista entera; ids ajenos o repetidos no mueven nada", async () => {
        comoDuena();
        const antes = await lasDe(DUENA);
        const [ajena] = await lasDe(OTRA);
        const nuevo = [...antes].reverse().map((i) => i.id);
        const r = await reorderUserIntegrations([nuevo[0], ajena.id, ...nuevo, nuevo[0]]);
        assert.equal(r.success, true, r.error);
        const despues = await lasDe(DUENA);
        assert.deepEqual(despues.map((i) => i.id), nuevo);
        assert.equal((await lasDe(OTRA))[0].order, 0, "la de otra cuenta cambió de sitio");
    });

    test("borrar: la de otra cuenta no se borra; una que ya no está cuenta como borrada", async () => {
        comoDuena();
        const [ajena] = await lasDe(OTRA);
        assert.equal((await deleteUserIntegration(ajena.id)).success, true);
        assert.equal((await lasDe(OTRA)).length, 1, "se borró la app de otra cuenta");
        assert.equal((await deleteUserIntegration("no-existe")).success, true);
    });

    test("la lista sale en su orden, y solo con lo de la cuenta", async () => {
        comoDuena();
        const r = await getUserIntegrations();
        assert.equal(r.success, true);
        assert.deepEqual(r.data.map((i) => i.id), (await lasDe(DUENA)).map((i) => i.id));
        assert.ok(!r.data.some((i) => i.name === "De la otra"));
    });
}
