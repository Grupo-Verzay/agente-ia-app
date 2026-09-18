/**
 * La invariante que, de haber existido, habría evitado los cinco fallos del
 * inventario: **quien ESCRIBE y quien LEE preguntan lo mismo.**
 *
 * `laPersonaQueActua` firma (autor de un comentario, quién cerró, quién creó,
 * el actor de un aviso, el asesor que toma un chat) y
 * `elDestinatarioDeLosAvisos` lee (la ventana, la campanita, el clic que los
 * atiende). Si los dos no devuelven el MISMO id para la misma sesión, el aviso
 * se crea a nombre de uno y se busca a nombre de otro — y eso no da ningún
 * error: da una campanita vacía.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { laPersonaQueActua } from "../chat-de-equipo.ts";
import { elDestinatarioDeLosAvisos } from "../avisos-de-tarea-tipos.ts";

/** El caso de siempre: nadie ha entrado a ninguna cuenta ajena. */
const normal = { id: "yair", name: "Yair", ownerId: "atencion" };
/** «Ingresar» / el conmutador: la fila efectiva es la del cliente. */
const dentroDeOtra = {
    id: "cliente",
    name: "Distribuidora Pacifico",
    ownerId: null,
    sessionUserId: "yair",
    nombreDeLaPersona: "Yair",
    porImpersonacion: true,
};

test("escribir y leer devuelven el MISMO id, siempre", () => {
    for (const caso of [normal, dentroDeOtra, { id: "solo" }]) {
        assert.equal(
            laPersonaQueActua(caso).id,
            elDestinatarioDeLosAvisos(caso),
            `no coinciden para ${JSON.stringify(caso)}`,
        );
    }
});

test("en el caso normal no cambia nada", () => {
    assert.equal(laPersonaQueActua(normal).id, "yair");
    assert.equal(laPersonaQueActua(normal).nombre, "Yair");
});

test("EL CASO: dentro de otra cuenta se firma con la persona, no con el cliente", () => {
    const firma = laPersonaQueActua(dentroDeOtra);
    assert.equal(firma.id, "yair");
    assert.notEqual(firma.id, dentroDeOtra.id);
    // Y el nombre tampoco puede ser el del cliente: un comentario salía firmado
    // «Distribuidora Pacifico» y el «Tú» del hilo no acertaba.
    assert.equal(firma.nombre, "Yair");
});

test("el actor de un aviso casa con el destinatario, así que nadie se avisa a sí mismo", () => {
    // `crearLosAvisos` descuenta con `destinatarioId === actorId`. El
    // destinatario sale de `tasks.createdById`/`assignedToId`, que ahora se
    // escriben con esta misma función.
    const actorId = laPersonaQueActua(dentroDeOtra).id;
    const destinatarios = ["yair", "sofia"];
    assert.deepEqual(destinatarios.filter((d) => d !== actorId), ["sofia"]);
});

test("sin id no se inventa nada", () => {
    assert.equal(elDestinatarioDeLosAvisos({}), null);
    assert.equal(elDestinatarioDeLosAvisos(null), null);
    assert.equal(laPersonaQueActua({}).id, "");
});

test("los espacios no crean una identidad distinta", () => {
    assert.equal(laPersonaQueActua({ id: "  yair  " }).id, "yair");
    assert.equal(elDestinatarioDeLosAvisos({ id: "yair", sessionUserId: "   " }), "yair");
});
