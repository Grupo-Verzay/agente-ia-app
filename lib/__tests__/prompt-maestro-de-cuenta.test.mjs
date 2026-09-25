/**
 * El prompt maestro por cuenta, lado de la App: la regla pura y un barrido de
 * la pantalla. Lo que el AGENTE recibe lo prueba el banco del backend
 * (`api-webhook/scripts/banco-prompt-maestro.sh`).
 *
 * `MODO=roto` lee la pantalla de ANTES (`git show ANTES_REF`) y afirma que no
 * había forma de ponerle a una cuenta su propio prompt maestro.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "5f3fd2e";
const D = "app/(root)/(protected)/panel/clientes/_components";

const leer = (ruta) => {
    if (!ROTO) return readFileSync(ruta, "utf8");
    try {
        return execSync(`git show ${ANTES_REF}:"${ruta}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return "";
    }
};

const regla = ROTO ? null : await import("./.compilado/prompt-maestro/prompt-maestro-de-cuenta.js");
const t = ROTO ? test.skip : test;

t("vacío o solo espacios: la cuenta usa el global", () => {
    for (const v of [null, undefined, "", "   \n\t", 7]) {
        assert.equal(regla.comoPromptMaestroPropio(v), null);
        assert.equal(regla.elPromptMaestroQueToca(v, "GLOBAL"), "GLOBAL");
    }
});

t("con texto, el propio sustituye al global", () => {
    assert.equal(regla.elPromptMaestroQueToca("PROPIO", "GLOBAL"), "PROPIO");
});

test("el menú de la fila ofrece «Prompt maestro», y solo al dueño de la plataforma", () => {
    const menu = leer(`${D}/user-actions-menu.tsx`);
    const datos = leer("app/(root)/(protected)/panel/clientes/helpers/getClientsPageData.ts");
    if (ROTO) {
        assert.doesNotMatch(menu, /Prompt maestro/);
        assert.equal(leer("actions/prompt-maestro-actions.ts"), "");
        return;
    }
    assert.match(menu, /\{esDuenoDeLaPlataforma &&\s*<DropdownMenuItem[\s\S]*?'prompt'[\s\S]*?Prompt maestro/);
    assert.match(datos, /esDuenoDeLaPlataforma: esSuperAdminDeVerdad\(user\)/);
    const acciones = readFileSync("actions/prompt-maestro-actions.ts", "utf8");
    assert.equal((acciones.match(/await elDuenoDeLaPlataforma\(\)/g) ?? []).length, 2, "las dos acciones pasan por la puerta");
});
