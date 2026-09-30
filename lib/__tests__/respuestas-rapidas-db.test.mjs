/**
 * Respuestas Rápidas contra POSTGRES, con las acciones de producción. Solo se
 * finge `currentUser()`.
 *
 * La cuenta es la de producción en pequeño: un dueño, una administradora de su
 * equipo y dos agentes. Lo que esta mitad prueba y un banco puro no puede
 * decir:
 *
 *  - Lo que crea alguien del equipo nace en la CUENTA —la administradora manda
 *    su propio id, que es lo que hacía la pantalla— y lo ve toda la cuenta.
 *    Antes quedaba a su nombre y no lo veía nadie, ni ella.
 *  - Una nueva sale la PRIMERA; el atajo se guarda como se teclea; una de
 *    texto sin texto no se crea, y el atajo se puede quitar.
 *  - Cada respuesta dice si quien mira la puede tocar (`editable`): un agente
 *    VE las de la cuenta y no las edita.
 *  - Un agente reordena lo que ve sin mover las personales de su compañero, y
 *    el orden se guarda en una llamada.
 *  - Borrar en bloque pasa por las puertas de cada fila: un agente no se lleva
 *    las de la cuenta, y lo que no se pudo se cuenta.
 *
 * `MODO=roto` empaqueta las MISMAS pruebas contra el código de `ANTES_RR_REF`
 * y AFIRMA los fallos.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ROTO = process.env.MODO === "roto";
const { db, ponerAQuienMira, rr, borrado } = await import(join(AQUI, ".compilado", "respuestas-rapidas-db", "entrada-de-respuestas-rapidas.js"));

const V = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DUENO = `rr-dueno-${V}`;
const ADMIN = `rr-admin-${V}`;
const ANA = `rr-ana-${V}`;
const BETO = `rr-beto-${V}`;

const base = (id) => ({ id, sessionUserId: id, role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id });
const comoDueno = () => ponerAQuienMira({ ...base(DUENO), effectiveId: DUENO, ownerId: null, advisorRole: null });
const comoAdmin = () => ponerAQuienMira({ ...base(ADMIN), effectiveId: DUENO, ownerId: DUENO, advisorRole: "administrador" });
const comoAna = () => ponerAQuienMira({ ...base(ANA), effectiveId: DUENO, ownerId: DUENO, advisorRole: "agente" });
const comoBeto = () => ponerAQuienMira({ ...base(BETO), effectiveId: DUENO, ownerId: DUENO, advisorRole: "agente" });

const lista = async () => (await rr.getAllRRs(DUENO)).data ?? [];
const deLaCuenta = () => db.quickReply.findMany({ where: { userId: DUENO }, orderBy: [{ order: "asc" }, { id: "asc" }] });

test.before(async () => {
    await db.user.create({ data: { id: DUENO, email: `${DUENO}@b.t`, name: "Dueño", role: "user" } });
    for (const [id, papel] of [[ADMIN, "administrador"], [ANA, "agente"], [BETO, "agente"]]) {
        await db.user.create({ data: { id, email: `${id}@b.t`, name: id, role: "user", ownerId: DUENO, advisorRole: papel } });
    }
    comoDueno();
    for (const [name, mensaje] of [["hola", "¡Hola!"], ["precios", "Desde $49.000"], ["envio", "A todo el país"]]) {
        const r = await rr.createRR({ userId: DUENO, name, mensaje, category: "ventas" });
        assert.equal(r.success, true, r.message);
    }
});

test.after(async () => {
    await db.quickReply.deleteMany({ where: { userId: { in: [DUENO, ADMIN, ANA, BETO] } } });
    await db.user.deleteMany({ where: { id: { in: [ANA, BETO, ADMIN] } } });
    await db.user.deleteMany({ where: { id: DUENO } });
    await db.$disconnect();
});

test("lo que crea la administradora con SU id nace en la cuenta, y lo ve toda la cuenta", async () => {
    comoAdmin();
    const r = await rr.createRR({ userId: ADMIN, name: "/Referido", mensaje: "Te comparto el enlace", category: "ventas" });
    assert.equal(r.success, true, r.message);
    const fila = await db.quickReply.findFirst({ where: { mensaje: "Te comparto el enlace" } });
    comoDueno();
    const laVeElDueno = (await lista()).some((x) => x.id === fila.id);
    if (ROTO) {
        assert.equal(fila.userId, ADMIN, "ANTES ya nacía en la cuenta");
        assert.equal(laVeElDueno, false, "ANTES la cuenta ya la veía");
        return;
    }
    assert.equal(fila.userId, DUENO, "nació a nombre de la persona, y la pantalla lee por la cuenta");
    assert.equal(laVeElDueno, true);
    comoAdmin();
    assert.ok((await lista()).some((x) => x.id === fila.id), "ni quien la creó la ve");
});

test("una nueva sale la PRIMERA, y el atajo se guarda como se teclea", async () => {
    comoDueno();
    const r = await rr.createRR({ userId: DUENO, name: "/PAGO Rapido", mensaje: "Nequi o transferencia", category: "pago" });
    assert.equal(r.success, true, r.message);
    const primera = (await lista())[0];
    if (ROTO) {
        assert.notEqual(primera?.mensaje, "Nequi o transferencia", "ANTES ya salía la primera");
        const fila = await db.quickReply.findFirst({ where: { mensaje: "Nequi o transferencia" } });
        assert.equal(fila.name, "/PAGO Rapido", "ANTES ya se guardaba el atajo limpio");
        return;
    }
    assert.equal(primera.mensaje, "Nequi o transferencia", "la nueva no sale la primera");
    assert.equal(primera.name, "pagorapido");
});

test("una de texto sin texto no se crea, y el atajo se puede QUITAR", async () => {
    comoDueno();
    const vacia = await rr.createRR({ userId: DUENO, name: "nada", mensaje: "   ", category: "general" });
    const hola = (await lista()).find((x) => x.name === "hola");
    const sinAtajo = await rr.updateRR(hola.id, { name: "" });
    const sinTexto = await rr.updateRR(hola.id, { mensaje: "  " });
    const despues = await db.quickReply.findUnique({ where: { id: hola.id } });
    if (ROTO) {
        assert.equal(vacia.success, true, "ANTES ya rechazaba una respuesta de texto vacía");
        assert.equal(sinTexto.success, true, "ANTES ya rechazaba dejar el texto vacío");
        assert.notEqual(despues.name, null, "ANTES quitar el atajo ya lo borraba");
        return;
    }
    assert.equal(vacia.success, false);
    assert.match(vacia.message, /mensaje es obligatorio/);
    assert.equal(sinAtajo.success, true, sinAtajo.message);
    assert.equal(sinTexto.success, false);
    assert.equal(despues.name, null, "el atajo no se quitó");
    assert.equal(despues.mensaje, "¡Hola!", "el texto se vació");
});

test("un agente VE las de la cuenta y no las toca; lo suyo, sí", async () => {
    comoAna();
    const r = await rr.createRR({ userId: DUENO, name: "cuotas", mensaje: "Paga en 3 cuotas", category: "pago" });
    assert.equal(r.success, true, r.message);
    const vistas = await lista();
    const suya = vistas.find((x) => x.name === "cuotas");
    const deLaCuentaVista = vistas.find((x) => x.name === "precios");
    assert.ok(suya && deLaCuentaVista, "la agente no ve lo suyo y lo de la cuenta");
    if (ROTO) {
        assert.equal(deLaCuentaVista.editable, undefined, "ANTES ya decía si se puede tocar");
        return;
    }
    assert.equal(suya.editable, true);
    assert.equal(deLaCuentaVista.editable, false, "a una agente se le ofrecía editar lo de la cuenta");
    // Y el servidor lo cumple.
    assert.equal((await rr.updateRR(deLaCuentaVista.id, { mensaje: "Otro precio" })).success, false);
});

test("un agente reordena lo que ve sin mover lo personal de su compañero, en UNA llamada", async () => {
    if (ROTO) {
        assert.equal(rr.guardarElOrdenDeLasRespuestasAction, undefined, "ANTES ya se guardaba el orden de una vez");
        assert.equal(typeof rr.updateRROrder, "function", "ANTES no era una llamada por fila");
        return;
    }
    comoBeto();
    assert.equal((await rr.createRR({ userId: DUENO, name: "demora", mensaje: "Disculpa la demora", category: "soporte" })).success, true);
    const deBeto = (await db.quickReply.findFirst({ where: { mensaje: "Disculpa la demora" } })).id;
    // Beto la mueve a la mitad de la lista.
    const actual = (await deLaCuenta()).map((x) => x.id);
    const sinEl = actual.filter((id) => id !== deBeto);
    const mitad = Math.floor(sinEl.length / 2);
    const conElEnMedio = [...sinEl.slice(0, mitad), deBeto, ...sinEl.slice(mitad)];
    comoDueno();
    assert.equal((await rr.guardarElOrdenDeLasRespuestasAction(DUENO, conElEnMedio)).success, true);
    const antes = (await deLaCuenta()).map((x) => x.id);
    const dondeEstaba = antes.indexOf(deBeto);

    comoAna();
    const queVe = (await lista()).map((x) => x.id);
    assert.ok(!queVe.includes(deBeto), "Ana ve la personal de Beto");
    const alReves = [...queVe].reverse();
    const r = await rr.guardarElOrdenDeLasRespuestasAction(DUENO, alReves);
    assert.equal(r.success, true, r.message);
    const despues = (await deLaCuenta()).map((x) => x.id);
    assert.equal(despues.indexOf(deBeto), dondeEstaba, "la personal de Beto cambió de sitio");
    assert.deepEqual(despues.filter((id) => id !== deBeto), alReves, "el orden de Ana no se guardó");
});

test("borrar en bloque pasa por las puertas de cada fila, y cuenta lo que no pudo", async () => {
    if (ROTO) {
        assert.equal(borrado.eliminarRespuestasRapidasAction, undefined, "ANTES ya había borrado en bloque");
        return;
    }
    comoAna();
    const suya = (await lista()).find((x) => x.name === "cuotas");
    const ajena = (await lista()).find((x) => x.name === "precios");
    const resumen = await borrado.eliminarRespuestasRapidasAction([suya.id, ajena.id, "basura", -3]);
    assert.equal(resumen.borrados, 1);
    assert.equal(resumen.fallaron, 1, "no dice que una no se pudo");
    assert.ok(await db.quickReply.findUnique({ where: { id: ajena.id } }), "una agente borró una de la cuenta");
    assert.equal(await db.quickReply.findUnique({ where: { id: suya.id } }), null);
});
