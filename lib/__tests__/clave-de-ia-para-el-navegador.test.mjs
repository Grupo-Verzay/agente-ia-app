/**
 * La regla, en una línea: **al navegador solo le llega SI hay clave de IA y
 * sus cuatro últimos caracteres.** Y el formulario vacío conserva la guardada,
 * que es lo que permite no devolverla nunca.
 *
 * Dos mitades:
 *  - la decisión pura (`lib/clave-de-ia-para-el-navegador.ts`);
 *  - un barrido del código: que las acciones que devuelven configuraciones
 *    pasan por `sinLaClave`, que Perfil no lee `.apiKey` de lo que recibe, y
 *    que `resolveUserAiClient` ya no se exporta desde un fichero `'use server'`.
 *
 * `MODO=roto` corre el barrido sobre los ficheros del commit anterior al
 * arreglo (`ANTES_REF`) y AFIRMA el fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
    comoLaVeElNavegador,
    sinLaClave,
    laClaveQueSeGuarda,
} from "./.compilado/clave-de-ia/clave-de-ia-para-el-navegador.js";

const ROTO = process.env.MODO === "roto";
/** El «antes» va PINCHADO a un commit: con `origin/main`, en cuanto esto se
 *  fusione el modo roto dejaría de reproducir nada y saldría verde. */
const ANTES_REF = process.env.ANTES_REF || "5e03716a";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function leer(fichero) {
    if (ROTO) {
        // Un fichero que no existía antes se lee vacío: es justo lo que faltaba.
        try {
            return execFileSync("git", ["show", `${ANTES_REF}:${fichero}`], {
                cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
            });
        } catch {
            return "";
        }
    }
    const p = path.join(RAIZ, fichero);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

const CLAVE = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789WXYZ";

test("la decisión: solo si hay clave y su final", () => {
    assert.deepEqual(comoLaVeElNavegador(CLAVE), { tieneClave: true, finalDeLaClave: "WXYZ" });
    assert.deepEqual(comoLaVeElNavegador("  "), { tieneClave: false, finalDeLaClave: null });
    assert.deepEqual(comoLaVeElNavegador(null), { tieneClave: false, finalDeLaClave: null });
    // Una clave corta no enseña su final: cuatro caracteres serían media clave.
    assert.deepEqual(comoLaVeElNavegador("sk-corta"), { tieneClave: true, finalDeLaClave: null });
});

test("sinLaClave quita la clave y no toca lo demás", () => {
    const fila = { id: "c1", userId: "u", providerId: "p", apiKey: CLAVE, isActive: true, temperature: 0.2 };
    const limpia = sinLaClave(fila);
    assert.equal("apiKey" in limpia, false);
    assert.equal(JSON.stringify(limpia).includes(CLAVE), false);
    assert.deepEqual(limpia, {
        id: "c1", userId: "u", providerId: "p", isActive: true, temperature: 0.2,
        tieneClave: true, finalDeLaClave: "WXYZ",
    });
});

test("guardar: vacía conserva la que hay; sin ninguna, se pide", () => {
    assert.deepEqual(laClaveQueSeGuarda("  sk-nueva-1234567890  ", CLAVE), { ok: true, clave: "sk-nueva-1234567890", esNueva: true });
    assert.deepEqual(laClaveQueSeGuarda("", CLAVE), { ok: true, clave: CLAVE, esNueva: false });
    assert.deepEqual(laClaveQueSeGuarda(undefined, CLAVE), { ok: true, clave: CLAVE, esNueva: false });
    assert.deepEqual(laClaveQueSeGuarda("", null), { ok: false, motivo: "api_key_required" });
});

/* ── El barrido ─────────────────────────────────────────────────────────── */

const ACCIONES = leer("actions/userAiconfig-actions.ts");
const PERFIL = leer("app/(root)/profile/_components/ApiKeyConfigurator.tsx");
const CLIENTES = leer("actions/userClientDataActions.ts");
const SERVIDOR = leer("lib/cliente-de-ia.server.ts");

const fallos = {
    "resolveUserAiClient se exporta desde un fichero 'use server'":
        /^\s*['"]use server['"]/.test(ACCIONES.replace(/^﻿/, "")) &&
        /export\s+async\s+function\s+resolveUserAiClient\b/.test(ACCIONES),
    "el lector de la clave no es server-only":
        !/^import\s+["']server-only["']/m.test(SERVIDOR),
    "una acción devuelve la fila de configuración sin pasar por sinLaClave":
        /data:\s*(cfg|configs)\s*\}/.test(ACCIONES),
    "Perfil lee la clave de lo que recibe":
        /(cfg|existingCfg)\??\.apiKey/.test(PERFIL),
    "Panel › Clientes manda aiConfigs con la clave":
        !/aiConfigs:\s*user\.aiConfigs\.map\(sinLaClave\)/.test(CLIENTES),
};

for (const [fallo, hay] of Object.entries(fallos)) {
    test(`${ROTO ? "ANTES" : "ahora"}: ${fallo}`, () => {
        if (ROTO) assert.equal(hay, true, `el modo roto tiene que reproducir: ${fallo}`);
        else assert.equal(hay, false, fallo);
    });
}
