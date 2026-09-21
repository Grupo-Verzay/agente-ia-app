/**
 * El logo de la puerta de una reunión, contra Postgres de verdad.
 *
 * Prueba lo que garantiza que la puerta enseñe la marca correcta: el logo sale
 * de la cuenta DUEÑA de la sala (`sala.cuentaId` → `User.image`), que es la
 * MISMA fuente que la pantalla de agendar; y una cuenta sin logo —vacío,
 * espacios o inexistente— devuelve `null`, con lo que la puerta cae al icono de
 * cámara de siempre. La regla pura se prueba al lado, sin base.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
    db,
    elLogoQueSeMuestra,
    elLogoDeLaCuenta,
    crearLaSala,
    laSalaPorCodigo,
} from "./.compilado/logo/entrada-logo.js";

async function crearCuenta(id, image) {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" ("id","email","name","image","role","updatedAt")
         VALUES ($1,$2,$3,$4,'user',NOW()) ON CONFLICT ("id") DO NOTHING`,
        id,
        `${id}@banco.test`,
        id,
        image,
    );
}

test("la puerta muestra el logo de la cuenta DUEÑA de la reunión", async () => {
    const A = `A-${randomUUID().slice(0, 8)}`;
    const url = "https://medias3.verzay.co/logos/a.png";
    await crearCuenta(A, url);
    const sala = await crearLaSala({
        cuentaId: A,
        canalId: null,
        anfitrionId: A,
        anfitrionNombre: "A",
        titulo: "Reunión",
        expiraEn: null,
    });
    // La fuente es la cuenta dueña de la sala, resuelta por su código.
    const s = await laSalaPorCodigo(sala.codigo);
    assert.equal(s.cuentaId, A, "la sala es de la cuenta A");
    assert.equal(await elLogoDeLaCuenta(s.cuentaId), url, "la puerta enseña el logo de A");
});

test("cuenta SIN logo (vacío) → null, la puerta cae al icono", async () => {
    const A = `A-${randomUUID().slice(0, 8)}`;
    await crearCuenta(A, "");
    assert.equal(await elLogoDeLaCuenta(A), null);
});

test("logo con solo espacios → null", async () => {
    const A = `A-${randomUUID().slice(0, 8)}`;
    await crearCuenta(A, "   ");
    assert.equal(await elLogoDeLaCuenta(A), null);
});

test("cuenta que no existe → null (no revienta)", async () => {
    assert.equal(await elLogoDeLaCuenta(`no-existe-${randomUUID()}`), null);
});

test("cuentaId vacío → null sin tocar la base", async () => {
    assert.equal(await elLogoDeLaCuenta(""), null);
});

test("la regla pura recorta y cae a null cuando no hay logo usable", () => {
    assert.equal(elLogoQueSeMuestra("  https://x/l.png  "), "https://x/l.png");
    assert.equal(elLogoQueSeMuestra(""), null);
    assert.equal(elLogoQueSeMuestra("   "), null);
    assert.equal(elLogoQueSeMuestra(null), null);
    assert.equal(elLogoQueSeMuestra(undefined), null);
});

test.after(async () => {
    await db.$disconnect();
});
