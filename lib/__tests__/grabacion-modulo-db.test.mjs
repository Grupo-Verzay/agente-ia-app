/**
 * La puerta del botón de grabar, **contra Postgres de verdad**.
 *
 * El fallo reportado: el módulo de grabación se asigna a la cuenta MADRE —la
 * que contrata y paga por la familia— pero las reuniones de la familia son de
 * las cuentas HIJAS, y el botón se pedía por la cuenta dueña de cada sala. Así
 * que la madre tenía el módulo y ninguna reunión mostraba el botón.
 *
 * Esto no se puede probar en memoria: la puerta cruza `_UserModules`, `Module`,
 * `ModuleItem` y la familia (`linked_accounts`). Se siembra el esquema real con
 * `prisma db push` (ver `scripts/banco-grabacion-modulo.sh`).
 *
 * Corre en DOS modos: la puerta VIEJA (mirar solo la cuenta de la sala) se
 * reproduce inline y se afirma que con ella la reunión de una hija con el
 * módulo en la madre NO deja grabar; la nueva, que sí. Sin el modo roto no se
 * sabría si lo verde de al lado arregla la causa o solo no la ejerce.
 *
 * Cada test arma su PROPIA familia con ids únicos: las tablas no se limpian
 * entre tests, así que un módulo de un test no puede contar para el siguiente.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
    db,
    laCuentaPuedeGrabar,
    RUTA_DE_GRABACIONES,
} from "./.compilado/grabacion/entrada-de-grabacion.js";

async function crearCuenta(id) {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" ("id","email","name","role","owner_id","updatedAt")
         VALUES ($1,$2,$3,'user',NULL,NOW()) ON CONFLICT ("id") DO NOTHING`,
        id,
        `${id}@banco.test`,
        id,
    );
}

/** Una familia nueva: madre + dos hijas vinculadas bajo ella (raíz = madre). */
async function unaFamilia() {
    const t = randomUUID().slice(0, 8);
    const madre = `madre-${t}`;
    const hija = `hija-${t}`;
    const hija2 = `hija2-${t}`;
    for (const id of [madre, hija, hija2]) await crearCuenta(id);
    // Vincular HIJA/HIJA2 bajo MADRE: así la raíz de la familia es la madre.
    await db.linkedAccount.create({ data: { masterUserId: madre, linkedUserId: hija } });
    await db.linkedAccount.create({ data: { masterUserId: madre, linkedUserId: hija2 } });
    return { madre, hija, hija2 };
}

async function darElModulo(cuentaId, { comoApartado = false } = {}) {
    const modulo = await db.module.create({
        data: comoApartado
            ? {
                  label: "Reuniones",
                  route: "/reuniones",
                  icon: "video",
                  moduleItems: { create: { title: "Grabaciones", url: RUTA_DE_GRABACIONES } },
              }
            : { label: "Reuniones", route: RUTA_DE_GRABACIONES, icon: "video" },
    });
    await db.userModule.create({ data: { A: modulo.id, B: cuentaId } });
}

/** La puerta VIEJA: solo la cuenta de la sala, sin mirar la familia. */
async function puertaVieja(cuentaId) {
    const filas = await db.userModule.findMany({
        where: {
            B: cuentaId,
            Module: {
                OR: [
                    { route: RUTA_DE_GRABACIONES },
                    { moduleItems: { some: { url: RUTA_DE_GRABACIONES } } },
                ],
            },
        },
        select: { A: true },
        take: 1,
    });
    return filas.length > 0;
}

test("EL FALLO: módulo en la madre, reunión de una hija → deja grabar", async () => {
    const { madre, hija } = await unaFamilia();
    await darElModulo(madre);

    // La puerta vieja reproduce el fallo: la hija no tiene el módulo, así que su
    // reunión no dejaba grabar aunque la madre lo tuviera.
    assert.equal(await puertaVieja(hija), false, "modo roto: la hija no puede grabar");

    // La nueva: la madre contrata para la familia, así que la reunión de la hija
    // deja grabar.
    assert.equal(await laCuentaPuedeGrabar(hija), true, "la hija hereda el módulo de la madre");
    // Y con la raíz ya resuelta (la pista del reloj), sin volver a pedir la
    // familia, el resultado es el mismo.
    assert.equal(await laCuentaPuedeGrabar(hija, madre), true, "misma respuesta con la pista de la raíz");
    // La propia madre, por el camino barato.
    assert.equal(await laCuentaPuedeGrabar(madre), true, "la madre puede grabar en su propia reunión");
});

test("el módulo de una hija NO cubre a la madre ni a otra hija", async () => {
    const { madre, hija, hija2 } = await unaFamilia();
    await darElModulo(hija);

    // La hija que lo tiene, sí.
    assert.equal(await laCuentaPuedeGrabar(hija), true, "la hija con el módulo graba lo suyo");
    // La madre, en SU propia reunión, no: su raíz es ella misma y no lo tiene;
    // el módulo de una hija no sube.
    assert.equal(await laCuentaPuedeGrabar(madre), false, "el módulo de una hija no cubre a la madre");
    // Otra hija tampoco: solo la raíz cubre a toda la familia.
    assert.equal(await laCuentaPuedeGrabar(hija2), false, "el módulo de una hija no cubre a su hermana");
});

test("sin módulo en ninguna parte, nadie graba", async () => {
    const { madre, hija } = await unaFamilia();
    assert.equal(await laCuentaPuedeGrabar(madre), false);
    assert.equal(await laCuentaPuedeGrabar(hija), false);
    // Y una cuenta suelta, sin familia ni módulo.
    const sola = `sola-${randomUUID().slice(0, 8)}`;
    await crearCuenta(sola);
    assert.equal(await laCuentaPuedeGrabar(sola), false);
});

test("el módulo vale también como APARTADO (ModuleItem), no solo como ruta", async () => {
    const sola = `apart-${randomUUID().slice(0, 8)}`;
    await crearCuenta(sola);
    await darElModulo(sola, { comoApartado: true });
    assert.equal(await laCuentaPuedeGrabar(sola), true, "un apartado /reuniones/grabaciones también habilita");
});

test.after(async () => {
    await db.$disconnect();
});
