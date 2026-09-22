/**
 * La regla pura de la bandeja, y un barrido de que las puertas la usan.
 *
 * `MODO=roto` salta la regla pura (no existía) y lee los ficheros del commit de
 * ANTES con `git show`, afirmando que ahí se juntaban las cuentas en los dos
 * sentidos.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "22dd27b";
const leer = (f) => (ROTO ? execFileSync("git", ["show", `${ANTES}:${f}`], { encoding: "utf8" }) : readFileSync(f, "utf8"));

test("la regla: baja, no sube ni va a las hermanas; el superadmin, la familia", async (t) => {
    if (ROTO) return t.skip("no existía");
    const { lasCuentasDeLaBandeja } = await import("./.compilado/bandeja/alcance-de-la-bandeja.js");
    const enlaces = [
        { de: "C", a: "A" }, { de: "C", a: "V" }, { de: "C", a: "N" }, { de: "A", a: "V" },
    ];
    const base = { persona: "A", efectiva: "A", esSuperAdmin: false, enlaces };
    assert.deepEqual(lasCuentasDeLaBandeja({ ...base, cuenta: "A" }), ["A", "V"]);
    assert.deepEqual(lasCuentasDeLaBandeja({ ...base, cuenta: "V", persona: "V", efectiva: "V" }), ["V"]);
    assert.deepEqual(lasCuentasDeLaBandeja({ ...base, cuenta: "A", esAgente: true }), ["A"]);
    assert.deepEqual(
        lasCuentasDeLaBandeja({ cuenta: "C", persona: "C", efectiva: "C", esSuperAdmin: true, familia: ["C", "A", "V", "N"] }).sort(),
        ["A", "C", "N", "V"],
    );
    // Una pareja recíproca se anula: ninguna ve a la otra.
    assert.deepEqual(
        lasCuentasDeLaBandeja({ cuenta: "X", persona: "X", efectiva: "X", esSuperAdmin: false, enlaces: [{ de: "X", a: "Y" }, { de: "Y", a: "X" }] }),
        ["X"],
    );
    // La persona sentada delante entra siempre, aunque no sea una cuenta.
    assert.deepEqual(lasCuentasDeLaBandeja({ ...base, cuenta: "A", persona: "yair" }), ["A", "yair", "V"]);
});

test("barrido: la página no junta las cuentas que la vincularon (la madre)", () => {
    const pagina = leer("app/(root)/chats/page.tsx");
    if (ROTO) return assert.match(pagina, /getMasterAccountInstances\(/, "antes: la página pedía las líneas de las madres");
    assert.doesNotMatch(pagina, /getMasterAccountInstances|getLinkedAccountsInstances/);
    assert.match(pagina, /lasCuentasQueVeLaBandeja\(user\)/);
    assert.match(pagina, /lasLineasDeLasCuentas\(cuentasVinculadas\)/);
});

test("barrido: el token de tiempo real no escucha las salas de las madres", () => {
    const token = leer("app/api/realtime/token/route.ts");
    if (ROTO) return assert.match(token, /"master_user_id" AS id FROM "linked_accounts" WHERE "linked_user_id"/);
    assert.doesNotMatch(token, /linked_accounts"\s+WHERE\s+"linked_user_id"/);
    assert.match(token, /lasCuentasQueVeLaBandeja\(user\)/);
});

test("barrido: las tres rutas de la bandeja y las acciones de línea usan el mismo alcance", () => {
    for (const f of ["app/api/chats/lista/route.ts", "app/api/chats/conversacion/route.ts", "app/api/chats/precarga/route.ts"]) {
        assert.match(leer(f), /getAssociatedAccountIds\(user\)/, f);
    }
    const alcance = leer("lib/cuentas-asociadas.ts");
    if (ROTO) return assert.match(alcance, /WHERE la\."linked_user_id" IN/, "antes: el alcance subía a la madre");
    assert.doesNotMatch(alcance, /linked_user_id" IN/);
    assert.match(leer("actions/macro-actions.ts"), /return getAssociatedAccountIds\(user\)/);
    // Los dos lectores viejos eran endpoints sin puerta: ya no se publican.
    assert.doesNotMatch(leer("actions/linked-account-actions.ts"), /getMasterAccountInstances|getLinkedAccountsInstances/);
});
