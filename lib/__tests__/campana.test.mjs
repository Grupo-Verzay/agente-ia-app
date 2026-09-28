/**
 * La campana: nueve pastillas en tres grupos de tres, y las tres clases nuevas
 * (Correos, Asignaciones y Créditos bajos), sin navegador y sin base.
 *
 * `MODO=roto` lee `lib/campana.ts` de `ANTES_REF` y afirma el fallo: seis
 * pastillas, en otro orden, y ninguna de las tres nuevas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";
const c = await import("./.compilado/campana/campana.js");

test("nueve pastillas, en tres grupos de tres, en el orden pedido", () => {
    if (ROTO) {
        const antes = execFileSync("git", ["show", `${process.env.ANTES_REF}:lib/campana.ts`], { encoding: "utf8" });
        const lista = /CHIPS_DE_LA_CAMPANA[^=]*=\s*\[([^\]]*)\]/.exec(antes)[1].match(/"(\w+)"/g).map((s) => s.slice(1, -1));
        assert.equal(lista.length, 6, "antes eran seis");
        for (const nueva of ["correo", "asignacion", "creditos"]) assert.ok(!lista.includes(nueva), `antes no había «${nueva}»`);
        return;
    }
    assert.deepEqual(c.CHIPS_DE_LA_CAMPANA, [
        "chat", "correo", "appointment",
        "mention", "asignacion", "tarea",
        "followup", "connection", "creditos",
    ]);
    assert.equal(c.CHIPS_POR_FILA, 3);
    assert.equal(c.CHIPS_DE_LA_CAMPANA.length % c.CHIPS_POR_FILA, 0, "ninguna fila a medias");
    assert.equal(new Set(c.CHIPS_DE_LA_CAMPANA).size, 9, "ni una repetida");
    assert.ok(!c.CHIPS_DE_LA_CAMPANA.includes("task"), "«Tareas» sigue fuera: se leía igual que «Mis tareas»");
});

const skipRoto = { skip: ROTO ? "el «antes» no tenía esta regla" : false };

test("losConteos cuenta las diez clases, también las nuevas", skipRoto, () => {
    const n = c.losConteos([{ kind: "asignacion" }, { kind: "asignacion" }, { kind: "creditos" }, { kind: "correo" }]);
    assert.equal(n.asignacion, 2);
    assert.equal(n.creditos, 1);
    assert.equal(n.correo, 1);
    assert.equal(n.chat, 0);
    assert.equal(Object.keys(n).length, 10);
});

test("correos: uno con el número dentro; ni cero ni «no se sabe» avisan", skipRoto, () => {
    assert.equal(c.elAvisoDeCorreos(0), null);
    assert.equal(c.elAvisoDeCorreos(null), null, "null es «un buzón no contestó», no un aviso");
    const a = c.elAvisoDeCorreos(7);
    assert.equal(a.kind, "correo");
    assert.equal(a.id, "correo:7", "el número en el id: leído, vuelve con el siguiente correo");
    assert.equal(a.href, "/correo");
    assert.equal(c.elAvisoDeCorreos(1).title, "Tienes 1 correo sin leer");
});

const envio = (umbral) => ({ umbral, enviadoEn: `2026-09-2${Math.max(0, umbral) % 9}T10:00:00.000Z` });

test("créditos: sin aviso del WhatsApp no hay aviso, aunque el saldo esté bajo", skipRoto, () => {
    assert.equal(c.elAvisoDeCreditos([], { estado: "quedan", disponibles: 10, total: 1000 }), null);
});

test("créditos: enseña el más grave que el WhatsApp ya mandó y que SIGUE siendo cierto", skipRoto, () => {
    const enviados = [envio(50), envio(25), envio(5)];
    assert.equal(c.elAvisoDeCreditos(enviados, { estado: "quedan", disponibles: 40, total: 1000 }).umbral, 5);
    assert.equal(c.elAvisoDeCreditos(enviados, { estado: "quedan", disponibles: 200, total: 1000 }).umbral, 25);
    assert.equal(c.elAvisoDeCreditos(enviados, { estado: "quedan", disponibles: 800, total: 1000 }), null, "recargó: ya no avisa");
    assert.equal(c.elAvisoDeCreditos([envio(0)], { estado: "quedan", disponibles: 0, total: 1000 }).umbral, 0);
    assert.equal(c.elAvisoDeCreditos(enviados, { estado: "ilimitado" }), null, "ilimitado nunca avisa");
    assert.equal(c.elAvisoDeCreditos([{ umbral: -1, enviadoEn: "x" }], { estado: "sin_bolsa" }).umbral, -1);
    assert.equal(c.elAvisoDeCreditos(enviados, { estado: "quedan", disponibles: 5, total: 0 }), null, "sin total no se inventa un porcentaje");
});

test("créditos: el texto es el del WhatsApp, con sus cifras", skipRoto, () => {
    const t = c.elTextoDelAvisoDeCreditos({ umbral: 5, enviadoEn: "x", disponibles: 40, total: 1000 });
    assert.match(t.titulo, /5 %/);
    assert.match(t.descripcion, /40 de 1000/);
    assert.equal(c.elTextoDelAvisoDeCreditos({ umbral: 0, enviadoEn: "x", disponibles: 0, total: 1000 }).titulo, "Te quedaste sin créditos");
    for (const u of [-1, 0, 5, 25, 50]) {
        const { titulo } = c.elTextoDelAvisoDeCreditos({ umbral: u, enviadoEn: "x", disponibles: null, total: null });
        assert.ok(!/null|undefined|NaN|999999999|-1 /.test(titulo), `sin centinelas: ${titulo}`);
    }
});

const fila = (id, sessionId, advisorId, assignedBy, action, dias) => ({
    id, sessionId, advisorId, assignedBy, action,
    createdAt: new Date(Date.UTC(2026, 8, 28) - dias * 86_400_000 + id * 1000).toISOString(),
});
const DESDE = new Date(Date.UTC(2026, 8, 21)).toISOString();

test("asignaciones: te la asignan, y cuando te la quitan también se dice", skipRoto, () => {
    const filas = [
        fila(1, 10, "yair", "carlos", "assigned", 2),
        fila(2, 10, "sofia", "carlos", "transferred", 1),
    ];
    assert.deepEqual(
        c.losCambiosDeAsignacion(filas, "yair", DESDE).map((x) => `${x.tipo}:${x.id}`),
        ["quitada:2", "asignada:1"],
    );
    assert.deepEqual(c.losCambiosDeAsignacion(filas, "sofia", DESDE).map((x) => `${x.tipo}:${x.id}`), ["asignada:2"]);
});

test("asignaciones: lo que hace uno mismo no le avisa", skipRoto, () => {
    const filas = [fila(1, 11, "yair", "yair", "taken", 1), fila(2, 11, null, "yair", "released", 0)];
    assert.deepEqual(c.losCambiosDeAsignacion(filas, "yair", DESDE), []);
});

test("asignaciones: resolver o reabrir no es cambiar de manos; devolver a la IA sí la quita", skipRoto, () => {
    const filas = [
        fila(1, 12, "yair", null, "auto_assigned", 2),
        fila(2, 12, "yair", "carlos", "resolved", 1),
        fila(3, 12, "yair", "carlos", "reopened", 1),
        fila(4, 12, "yair", "carlos", "returned_to_ai", 0),
    ];
    assert.deepEqual(
        c.losCambiosDeAsignacion(filas, "yair", DESDE).map((x) => `${x.tipo}:${x.id}:${x.porQuien}`),
        ["quitada:4:carlos", "asignada:1:null"],
    );
});

test("asignaciones: lo de antes de la ventana no avisa, pero sí cuenta para saber quién la llevaba", skipRoto, () => {
    const filas = [fila(1, 13, "yair", "carlos", "assigned", 20), fila(2, 13, "sofia", "carlos", "assigned", 1)];
    assert.deepEqual(c.losCambiosDeAsignacion(filas, "yair", DESDE).map((x) => `${x.tipo}:${x.id}`), ["quitada:2"]);
});
