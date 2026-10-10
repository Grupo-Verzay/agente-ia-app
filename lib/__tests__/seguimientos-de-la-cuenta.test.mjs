/**
 * La regla pura y un barrido del código: los caminos que borran seguimientos
 * por número (Descartado y la frase de despedida) pasan por la regla de la
 * cuenta y ninguno vuelve a borrar con el `remoteJid` a secas.
 *
 * `MODO=roto` lee las dos acciones de `ANTES_REF` y AFIRMA el fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "22bd5bf";
const r = await import("./.compilado/seguimientos-de-la-cuenta/seguimientos-de-la-cuenta.js");

const leer = (f) => (ROTO ? execSync(`git show ${ANTES}:${f}`, { encoding: "utf8" }) : readFileSync(f, "utf8"));
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
// El descarte del lead se mudó a `lib/estado-del-lead.server.ts` (sin puerta,
// para el Modo Dueño); el ANTES sigue leyéndose donde estaba.
const ACCIONES = ROTO
    ? ["actions/session-action.ts", "actions/chat-manual-actions.ts"]
    : ["lib/estado-del-lead.server.ts", "actions/chat-manual-actions.ts"];
const BORRADO_SIN_CUENTA = /seguimiento\.deleteMany\(\{\s*where:\s*\{\s*remoteJid(\s*:\s*[\w.]+)?\s*\}\s*\}\)/;

test("las dos llaves de cada línea, sin repetidas ni vacías", () => {
    assert.deepEqual(
        r.lasLlavesDeLasLineas([
            { instanceName: "VENTAS", instanceId: "uuid-1" },
            { instanceName: "VENTAS", instanceId: "" },
            { instanceName: null, instanceId: " uuid-2 " },
        ]),
        ["VENTAS", "uuid-1", "uuid-2"],
    );
});

test("el where lleva SIEMPRE las líneas de la cuenta", () => {
    assert.deepEqual(r.dondeBorrarLosSeguimientos("573@s.whatsapp.net", [{ instanceName: "A", instanceId: "a1" }]), {
        remoteJid: "573@s.whatsapp.net",
        instancia: { in: ["A", "a1"] },
    });
});

test("sin líneas o sin número no se borra nada (nunca un where sin cuenta)", () => {
    assert.equal(r.dondeBorrarLosSeguimientos("573@s.whatsapp.net", []), null);
    assert.equal(r.dondeBorrarLosSeguimientos("", [{ instanceName: "A", instanceId: "a" }]), null);
    assert.equal(r.dondeBorrarLosSeguimientos(null, [{ instanceName: "A", instanceId: "a" }]), null);
});

for (const f of ACCIONES) {
    test(`${f}: ${ROTO ? "AFIRMA el borrado por número a secas" : "borra por la regla de la cuenta"}`, () => {
        const codigo = sinComentarios(leer(f));
        if (ROTO) {
            assert.match(codigo, BORRADO_SIN_CUENTA, "el antes tenía que borrar solo por remoteJid");
            assert.doesNotMatch(codigo, /borrarSeguimientosDelNumeroEnLaCuenta/);
        } else {
            assert.doesNotMatch(codigo, BORRADO_SIN_CUENTA);
            assert.match(codigo, /borrarSeguimientosDelNumeroEnLaCuenta\(/);
        }
    });
}
