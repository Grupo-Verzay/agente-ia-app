/**
 * Guardar la hoja de Google Sheets contra Postgres, con la acción de verdad
 * (`saveUserSheetsUrl`). Solo se finge quién ha iniciado sesión.
 *
 * Lo que la pantalla no puede garantizar sola: que el SERVIDOR tampoco guarda
 * lo que no es una hoja —una acción de servidor es un endpoint y se llama sin
 * pasar por la pantalla—, que lo que queda escrito es el enlace LIMPIO, que
 * vacío es «sin hoja» (quitarla), y que la puerta sigue en su sitio.
 *
 * `MODO=roto` empaqueta la acción de `ANTES_REF` y AFIRMA el fallo: un enlace
 * de un documento quedaba escrito tal cual.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const m = await import(join(AQUI, ".compilado", "google-sheets-db", "entrada-de-google-sheets.js"));
const { db, ponerAQuienMira, saveUserSheetsUrl } = m;

const SELLO = Date.now().toString(36);
const YO = `hojas-yo-${SELLO}`;
const OTRA = `hojas-otra-${SELLO}`;
const ID = "1mNegocioVentasYCitas2026HojaDeEjemplo0Guia";
const DOCUMENTO = "https://docs.google.com/document/d/1Hq4tR8kLmN2pX9vB7cD3eF5gH6jK0lZ/edit";

test.before(async () => {
    for (const id of [YO, OTRA]) await db.user.create({ data: { id, email: `${id}@banco.test`, name: id } });
});
test.after(async () => {
    await db.user.deleteMany({ where: { id: { in: [YO, OTRA] } } });
    await db.$disconnect();
});

const laGuardada = async (id) => (await db.user.findUnique({ where: { id }, select: { sheetsUrl: true } })).sheetsUrl;

if (ROTO) {
    test("ANTES: un enlace de un documento quedaba escrito como «tu hoja»", async () => {
        ponerAQuienMira({ id: YO });
        const r = await saveUserSheetsUrl(YO, DOCUMENTO);
        assert.equal(r.success, true);
        assert.equal(await laGuardada(YO), DOCUMENTO, "el documento no se guardó: el fallo ya no se reproduce");
    });
} else {
    test("un enlace de un documento NO se escribe: vuelve su motivo y la fila no cambia", async () => {
        ponerAQuienMira({ id: YO });
        await db.user.update({ where: { id: YO }, data: { sheetsUrl: null } });
        const r = await saveUserSheetsUrl(YO, DOCUMENTO);
        assert.equal(r.success, false);
        assert.match(r.error, /no es de una hoja de Google Sheets/);
        assert.equal(await laGuardada(YO), null);
        const publicado = await saveUserSheetsUrl(YO, "https://docs.google.com/spreadsheets/d/e/2PACX-1vQk8sR3mT7vW2xY5zA9bC4dE6fG1hJ/pubhtml");
        assert.equal(publicado.success, false);
        assert.match(publicado.error, /Publicar en la web/);
        assert.equal(await laGuardada(YO), null);
    });

    test("un enlace bueno se escribe LIMPIO, con su pestaña, y se devuelve lo escrito", async () => {
        ponerAQuienMira({ id: YO });
        const r = await saveUserSheetsUrl(YO, `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing#gid=77`);
        const limpio = `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=77`;
        assert.deepEqual(r, { success: true, url: limpio });
        assert.equal(await laGuardada(YO), limpio);
    });

    test("vacío es «sin hoja»: quitarla deja la columna en nulo", async () => {
        ponerAQuienMira({ id: YO });
        await saveUserSheetsUrl(YO, `https://docs.google.com/spreadsheets/d/${ID}/edit`);
        const r = await saveUserSheetsUrl(YO, "   ");
        assert.deepEqual(r, { success: true, url: null });
        assert.equal(await laGuardada(YO), null);
    });

    test("la puerta: nadie guarda la hoja de otra cuenta, ni sin sesión", async () => {
        ponerAQuienMira({ id: OTRA });
        await db.user.update({ where: { id: YO }, data: { sheetsUrl: null } });
        const r = await saveUserSheetsUrl(YO, `https://docs.google.com/spreadsheets/d/${ID}/edit`);
        assert.equal(r.success, false);
        assert.equal(await laGuardada(YO), null, "se escribió en la cuenta de otro");
        ponerAQuienMira(null);
        assert.equal((await saveUserSheetsUrl(YO, `https://docs.google.com/spreadsheets/d/${ID}/edit`)).success, false);
        assert.equal(await laGuardada(YO), null);
    });
}
