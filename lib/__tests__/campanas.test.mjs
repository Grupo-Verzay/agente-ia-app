/**
 * Las reglas de una CAMPAÑA (`lib/campanas.ts`), puras.
 *
 * Qué dice cada mensaje, a qué hora sale cada uno, qué pasa al editarla y
 * desde cuándo se reprograma. En `MODO=roto` no hay nada que probar aquí —el
 * módulo no existía en `ANTES_REF`— y se AFIRMA que no existía.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";

if (ROTO) {
    test("antes: no había reglas de campaña (lib/campanas.ts no existía)", () => {
        const ref = process.env.ANTES_REF ?? "400482e";
        assert.throws(() => execFileSync("git", ["show", `${ref}:lib/campanas.ts`], { stdio: "pipe" }));
    });
} else {
    const c = await import("./.compilado/campanas/campanas.js");

    test("las variables: nombre, teléfono y fecha; sin nombre va el número", () => {
        const hoy = new Date("2026-10-02T15:00:00Z");
        assert.equal(c.elMensajeDeLaCampana("Hola {{nombre}} ({{telefono}})", "Ana", "573001", hoy), "Hola Ana (573001)");
        assert.equal(c.elMensajeDeLaCampana("Hola {{NOMBRE}}", "", "573001", hoy), "Hola 573001");
        assert.equal(c.elMensajeDeLaCampana("Hola {{nombre}}", "Desconocido", "573001", hoy), "Hola 573001");
        assert.match(c.elMensajeDeLaCampana("{{fecha}}", "Ana", "1", hoy), /2026/);
        assert.deepEqual(c.VARIABLES_DE_LA_CAMPANA.map((v) => v.clave), ["{{nombre}}", "{{telefono}}", "{{fecha}}"]);
    });

    test("el teléfono de un jid, sin sufijo de dispositivo", () => {
        assert.equal(c.elTelefonoDelJid("573001112233:39@s.whatsapp.net"), "573001112233");
    });

    test("la pausa se acota a 30–600 y el máximo nunca baja del mínimo", () => {
        assert.deepEqual(c.laPausa(10, 5000), { min: 30, max: 600 });
        assert.deepEqual(c.laPausa(120, 60), { min: 120, max: 120 });
        assert.deepEqual(c.laPausa(undefined, undefined), { min: 30, max: 60 });
    });

    test("los retrasos son ACUMULADOS: cada mensaje espera una pausa tras el anterior", () => {
        const r = c.losRetrasos(4, { min: 30, max: 60 }, () => 0);
        assert.deepEqual(r, [30, 60, 90, 120]);
        const r2 = c.losRetrasos(3, { min: 30, max: 60 }, () => 0.999);
        assert.deepEqual(r2, [60, 120, 180]);
    });

    test("desde Campañas es campaña aunque lleve UN contacto", () => {
        assert.equal(c.esUnaCampana(true, 1), true);
        assert.equal(c.esUnaCampana(undefined, 1), false);
        assert.equal(c.esUnaCampana(undefined, 2), true);
    });

    test("editar: lo enviado se queda, lo pendiente se rehace y lo pausado sigue pausado", () => {
        const plan = c.elPlanDeLaEdicion("X", [
            { id: 1, idNodo: "camping-X-1", remoteJid: "a", followUpStatus: "sent" },
            { id: 2, idNodo: "camping-X-2", remoteJid: "b", followUpStatus: "pending" },
            { id: 3, idNodo: "camping-X-3", remoteJid: "c", followUpStatus: "canceled" },
            { id: 4, idNodo: "camping-X-4", remoteJid: "d", followUpStatus: "failed" },
        ], [{ jid: "a", nombre: "A" }, { jid: "b", nombre: "B" }, { jid: "c", nombre: "C" }, { jid: "e", nombre: "E" }, { jid: "e", nombre: "E" }]);
        assert.deepEqual(plan.borrar, [2, 3]);
        assert.deepEqual(plan.crear.map((x) => [x.jid, x.numero, x.pausado]), [["b", 5, false], ["c", 6, true], ["e", 7, false]]);
    });

    test("reanudar y reintentar salen escalonados, no de golpe", () => {
        const ahora = new Date("2026-10-02T15:00:00Z");
        const h = c.lasHorasEscalonadas(3, ahora, { min: 30, max: 30 }, () => 0);
        assert.deepEqual(h, ["2026-10-02T15:00:30.000Z", "2026-10-02T15:01:00.000Z", "2026-10-02T15:01:30.000Z"]);
    });

    test("una hora pasada se reprograma desde ahora", () => {
        const ahora = new Date("2026-10-02T15:00:00Z");
        assert.equal(c.desdeCuandoSeReprograma("2026-10-01T10:00:00Z", ahora).toISOString(), ahora.toISOString());
        assert.equal(c.desdeCuandoSeReprograma("2026-10-05T10:00:00Z", ahora).toISOString(), "2026-10-05T10:00:00.000Z");
        assert.equal(c.LA_CAMPANA_NO_SE_REPITE, "NONE");
    });
}
