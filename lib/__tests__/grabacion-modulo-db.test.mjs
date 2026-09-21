/**
 * La puerta del botón de grabar (`laCuentaPuedeGrabar`), **contra Postgres**.
 *
 * La regla es «como cualquier módulo»: el botón sale cuando la cuenta VE la ruta
 * `/reuniones/grabaciones` en su menú, con la misma regla que el layout. Eso
 * cruza `_UserModules`, `Module`, `ModuleItem`, el plan y la familia
 * (`linked_accounts`), que son tablas del esquema; se siembra el esquema real
 * con `prisma db push` (ver `scripts/banco-grabacion-modulo.sh`).
 *
 * El FALLO que arregla: crear el módulo en Panel › Módulos crea la DEFINICIÓN
 * global del módulo, pero **no** una fila en `_UserModules` para la cuenta. Y
 * `_UserModules` es una **restricción**: una cuenta sin filas ve TODOS los
 * módulos que su plan permite. Así que en el menú tenía la pestaña y en el botón
 * daba `false`, porque la puerta vieja miraba si EXISTÍA una fila. Se asignara
 * las veces que se asignara, no aparecía.
 *
 * Corre en DOS modos: la puerta VIEJA (¿existe fila en `_UserModules`?) se
 * reproduce inline y se afirma que reproduce el fallo; la nueva, que no. Sin el
 * modo roto no se sabría si lo verde de al lado arregla la causa o no la ejerce.
 *
 * Cada test arma sus PROPIOS ids: las tablas no se limpian entre tests.
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
    db,
    laCuentaPuedeGrabar,
    RUTA_DE_GRABACIONES,
} from "./.compilado/grabacion/entrada-de-grabacion.js";

/**
 * El módulo de grabación es una DEFINICIÓN global, así que uno creado en un test
 * lo verían las cuentas sin tope de los demás —las tablas no se limpian entre
 * tests—. Se borra antes de cada uno para que cada test parta de «no existe».
 * Las cuentas y sus restricciones a OTROS módulos usan ids únicos por test, así
 * que no hace falta tocarlas.
 */
async function limpiarModulosDeGrabacion() {
    const mods = await db.module.findMany({
        where: {
            OR: [
                { route: RUTA_DE_GRABACIONES },
                { moduleItems: { some: { url: RUTA_DE_GRABACIONES } } },
            ],
        },
        select: { id: true },
    });
    const ids = mods.map((m) => m.id);
    if (!ids.length) return;
    await db.userModule.deleteMany({ where: { A: { in: ids } } });
    await db.moduleItem.deleteMany({ where: { moduleId: { in: ids } } });
    await db.module.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(limpiarModulosDeGrabacion);

async function crearCuenta(id, { role = "user", plan = "basico" } = {}) {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" ("id","email","name","role","plan","owner_id","updatedAt")
         VALUES ($1,$2,$3,$4::"Role",$5::"Plan",NULL,NOW()) ON CONFLICT ("id") DO NOTHING`,
        id,
        `${id}@banco.test`,
        id,
        role,
        plan,
    );
}

/** Una familia nueva: madre + dos hijas vinculadas bajo ella (raíz = madre). */
async function unaFamilia(opciones = {}) {
    const t = randomUUID().slice(0, 8);
    const madre = `madre-${t}`;
    const hija = `hija-${t}`;
    const hija2 = `hija2-${t}`;
    for (const id of [madre, hija, hija2]) await crearCuenta(id, opciones);
    await db.linkedAccount.create({ data: { masterUserId: madre, linkedUserId: hija } });
    await db.linkedAccount.create({ data: { masterUserId: madre, linkedUserId: hija2 } });
    return { madre, hija, hija2 };
}

/**
 * Crear el módulo de grabación. Por defecto **solo la DEFINICIÓN global**, como
 * hace Panel › Módulos: sin fila en `_UserModules`. `restringirA` crea además la
 * fila de restricción para esas cuentas (que es lo que las deja ver SOLO este
 * módulo).
 */
async function crearElModulo({
    comoApartado = false,
    adminOnly = false,
    allowedPlans = [],
    lockedPlans = [],
    itemLockedPlans = [],
    restringirA = [],
} = {}) {
    const modulo = await db.module.create({
        data: {
            label: "Reuniones",
            route: comoApartado ? "/reuniones" : RUTA_DE_GRABACIONES,
            icon: "video",
            adminOnly,
            allowedPlans,
            lockedPlans,
            ...(comoApartado
                ? {
                      moduleItems: {
                          create: {
                              title: "Grabaciones",
                              url: RUTA_DE_GRABACIONES,
                              lockedPlans: itemLockedPlans,
                          },
                      },
                  }
                : {}),
        },
        include: { moduleItems: true },
    });
    for (const cuentaId of restringirA) {
        await db.userModule.create({ data: { A: modulo.id, B: cuentaId } });
    }
    return modulo;
}

/** La puerta VIEJA: ¿existe una fila en `_UserModules` para el módulo? */
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

test("EL FALLO: módulo creado global, cuenta SIN restricción → deja grabar", async () => {
    const cuenta = `libre-${randomUUID().slice(0, 8)}`;
    await crearCuenta(cuenta);
    // Panel › Módulos crea la definición y NADA en `_UserModules`.
    await crearElModulo();

    // El modo roto: sin fila en `_UserModules`, la puerta vieja dice que no.
    assert.equal(await puertaVieja(cuenta), false, "modo roto: la puerta vieja no ve el módulo");
    // La nueva: la cuenta no tiene restricción, así que VE la ruta en su menú.
    assert.equal(await laCuentaPuedeGrabar(cuenta), true, "una cuenta sin tope ve el módulo");
});

test("mismo caso con la ruta como APARTADO (ModuleItem)", async () => {
    const cuenta = `apart-${randomUUID().slice(0, 8)}`;
    await crearCuenta(cuenta);
    await crearElModulo({ comoApartado: true });
    assert.equal(await puertaVieja(cuenta), false, "modo roto");
    assert.equal(await laCuentaPuedeGrabar(cuenta), true, "un apartado también habilita");
});

test("sin módulo creado en ninguna parte, nadie graba", async () => {
    const cuenta = `sinmod-${randomUUID().slice(0, 8)}`;
    await crearCuenta(cuenta);
    assert.equal(await laCuentaPuedeGrabar(cuenta), false);
});

test("una cuenta RESTRINGIDA que no incluye grabación, no graba", async () => {
    const conTope = `tope-${randomUUID().slice(0, 8)}`;
    await crearCuenta(conTope);
    // Otro módulo cualquiera, y la cuenta restringida SOLO a él.
    const otro = await db.module.create({
        data: { label: "Chats", route: "/chats", icon: "chat" },
    });
    await db.userModule.create({ data: { A: otro.id, B: conTope } });
    // La grabación existe como definición, pero la cuenta tiene tope y no la
    // incluye: no la ve en su menú.
    await crearElModulo();
    assert.equal(await laCuentaPuedeGrabar(conTope), false, "el tope deja fuera la grabación");
});

test("una cuenta RESTRINGIDA que SÍ incluye grabación, graba", async () => {
    const conTope = `tope2-${randomUUID().slice(0, 8)}`;
    await crearCuenta(conTope);
    await crearElModulo({ restringirA: [conTope] });
    assert.equal(await puertaVieja(conTope), true, "la vieja también, porque hay fila");
    assert.equal(await laCuentaPuedeGrabar(conTope), true, "el tope la incluye");
});

test("bloqueada por PLAN: no graba aunque exista el módulo", async () => {
    const cuenta = `plan-${randomUUID().slice(0, 8)}`;
    await crearCuenta(cuenta, { plan: "basico" });
    // El módulo solo para 'avanzado': un 'basico' no lo alcanza.
    await crearElModulo({ allowedPlans: ["avanzado"] });
    assert.equal(await laCuentaPuedeGrabar(cuenta), false, "allowedPlans deja fuera al plan");

    await limpiarModulosDeGrabacion();
    const cuenta2 = `plan2-${randomUUID().slice(0, 8)}`;
    await crearCuenta(cuenta2, { plan: "basico" });
    await crearElModulo({ lockedPlans: ["basico"] });
    assert.equal(await laCuentaPuedeGrabar(cuenta2), false, "lockedPlans deja fuera al plan");
});

test("adminOnly: un 'user' no graba, un 'admin' sí", async () => {
    const modulo = await crearElModulo({ adminOnly: true });
    assert.ok(modulo);
    const usuario = `u-${randomUUID().slice(0, 8)}`;
    await crearCuenta(usuario, { role: "user" });
    assert.equal(await laCuentaPuedeGrabar(usuario), false, "un módulo Solo Admin no lo ve un 'user'");

    const admin = `a-${randomUUID().slice(0, 8)}`;
    await crearCuenta(admin, { role: "admin" });
    assert.equal(await laCuentaPuedeGrabar(admin), true, "un admin sí ve los Solo Admin");
});

test("el apartado de grabación DENEGADO a mano no graba", async () => {
    const cuenta = `deny-${randomUUID().slice(0, 8)}`;
    await crearCuenta(cuenta);
    const modulo = await crearElModulo({ comoApartado: true });
    const item = modulo.moduleItems.find((it) => it.url === RUTA_DE_GRABACIONES);
    await db.$executeRawUnsafe(
        `UPDATE "User" SET "denied_module_items" = $1 WHERE "id" = $2`,
        item.id,
        cuenta,
    );
    assert.equal(await laCuentaPuedeGrabar(cuenta), false, "un apartado denegado no se ve");
});

test("FAMILIA: hija restringida sin grabación, pero la madre SÍ la alcanza", async () => {
    // Las hijas restringidas a otro módulo; la madre sin tope, así que alcanza
    // la grabación. Es la historia de siempre: la madre contrata para la familia.
    const { madre, hija } = await unaFamilia();
    const otro = await db.module.create({
        data: { label: "Chats", route: "/chats", icon: "chat" },
    });
    await db.userModule.create({ data: { A: otro.id, B: hija } });
    await crearElModulo(); // definición global; la madre no tiene tope → la alcanza

    // La hija, por su cuenta, no la ve (tope sin grabación).
    assert.equal(await algunaSuya(hija), false, "la hija sola no alcanza la grabación");
    // Pero su reunión deja grabar, porque la raíz (la madre) sí la alcanza.
    assert.equal(await laCuentaPuedeGrabar(hija), true, "hereda de la madre");
    // Y con la raíz ya resuelta (la pista del reloj), lo mismo, sin pedir familia.
    assert.equal(await laCuentaPuedeGrabar(hija, madre), true, "misma respuesta con la pista");
});

/** Solo la propia cuenta, sin caer a la familia: `laCuentaPuedeGrabar` con la raíz forzada a sí misma. */
async function algunaSuya(cuentaId) {
    // Pasando la propia cuenta como raíz, el paso de familia no añade nada.
    return laCuentaPuedeGrabar(cuentaId, cuentaId);
}

test.after(async () => {
    await db.$disconnect();
});
