/**
 * La clave del servidor: las reglas puras y un barrido del código.
 *
 * El barrido lee los ficheros del árbol y, en `MODO=roto`, los MISMOS ficheros
 * del commit de antes (`ANTES_REF`, pinchado: nunca `origin/main`), y ahí
 * AFIRMA cada fuga. Sin ese modo no se sabría si lo verde es que se arregló o
 * que el barrido no mira.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("../..", import.meta.url).pathname;
const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "7575f8a";

const leer = (rel) => {
    if (!ROTO) {
        try { return readFileSync(join(RAIZ, rel), "utf8"); } catch { return ""; }
    }
    try {
        return execFileSync("git", ["show", `${ANTES_REF}:${rel}`], { cwd: RAIZ, encoding: "utf8" });
    } catch {
        return "";
    }
};
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const puro = ROTO ? null : await import("./.compilado/clave/clave-del-servidor.js");
const cita = ROTO ? null : await import("./.compilado/clave/cita-publica.js");

test("sinLaClaveDelServidor y sinLaClaveDeLaFila quitan la clave y dejan lo demás", { skip: ROTO }, () => {
    assert.deepEqual(puro.sinLaClaveDelServidor({ id: "a", url: "u", key: "K" }), { id: "a", url: "u", key: "" });
    assert.deepEqual(puro.sinLaClaveDeLaFila({ id: 1, apikey: "K", serverUrl: "u" }), { id: 1, apikey: null, serverUrl: "u" });
    assert.equal(puro.sinLaClaveDeLaFila(null), null);
    assert.equal(puro.CLAVE_EN_EL_SERVIDOR.key, "");
    assert.ok(Object.isFrozen(puro.CLAVE_EN_EL_SERVIDOR));
    assert.equal(puro.comoUrlDelServidor("evo.banco"), "https://evo.banco");
    assert.equal(puro.comoUrlDelServidor("http://evo.banco"), "http://evo.banco");
});

test("la confirmación pública solo vale para una cita RECIÉN creada", { skip: ROTO }, () => {
    const ahora = new Date("2026-09-27T12:00:00Z");
    assert.equal(cita.sePuedeConfirmarLaCita(new Date(ahora - 60e3), ahora), true);
    assert.equal(cita.sePuedeConfirmarLaCita(new Date(ahora - (cita.MINUTOS_PARA_CONFIRMAR + 1) * 60e3), ahora), false);
    assert.equal(cita.sePuedeConfirmarLaCita(new Date(+ahora + 10 * 60e3), ahora), false, "del futuro no");
    assert.equal(cita.sePuedeConfirmarLaCita(null, ahora), false);
    assert.equal(cita.comoZonaHoraria("Nada/Inventada", "America/Bogota"), "America/Bogota");
    assert.equal(cita.comoZonaHoraria("America/Lima", "America/Bogota"), "America/Lima");
});

test("la sesión (currentUser) no selecciona la clave del servidor", () => {
    const auth = sinComentarios(leer("lib/auth.ts"));
    const bloques = [...auth.matchAll(/apiKey:\s*\{\s*select:\s*\{([^}]*)\}/g)].map((m) => m[1]);
    const conClave = bloques.filter((b) => /\bkey:\s*true/.test(b));
    if (ROTO) {
        const todoElObjeto = /apiKey:\s*true/.test(auth);
        assert.ok(conClave.length > 0 || todoElObjeto, "antes: la sesión traía la clave");
        return;
    }
    assert.ok(bloques.length >= 1, "la sesión sigue trayendo la URL del servidor");
    assert.deepEqual(conClave, []);
});

test("las acciones de claves de servidor tienen puerta, y «dame la clave» no existe", () => {
    const src = sinComentarios(leer("actions/api-action.ts"));
    if (ROTO) {
        assert.match(src, /export async function getApiKeyById/);
        assert.doesNotMatch(src, /administraLosServidores/);
        return;
    }
    assert.doesNotMatch(src, /export async function getApiKeyById/);
    for (const f of ["agregarApi", "editarApiKey", "eliminarApiKey", "obtenerApiKeys"]) {
        const cuerpo = src.slice(src.indexOf(`export async function ${f}`)).slice(0, 400);
        assert.match(cuerpo, /administraLosServidores\(\)/, `${f} sin puerta`);
    }
    for (const f of ["deleteInstanceInternal", "deleteInstanceEvolutionAware", "createInstanceInternal"]) {
        const i = src.indexOf(`export async function ${f}`);
        const cuerpo = src.slice(i, src.indexOf("export async function", i + 10));
        assert.match(cuerpo, /puedeTocarLasLineasDe\(/, `${f} no comprueba el dueño`);
    }
});

test("los envíos con url+clave en los parámetros ya no son endpoints", () => {
    for (const rel of ["actions/chat-actions.ts", "actions/sending-messages-actions.ts"]) {
        const cabeza = leer(rel).replace(/^﻿/, "").slice(0, 400);
        if (ROTO) {
            assert.match(cabeza, /['"]use server['"]/, `${rel}: antes era un POST abierto`);
            continue;
        }
        assert.doesNotMatch(cabeza, /^\s*['"]use server['"]/m, rel);
        assert.match(cabeza, /import\s+["']server-only["']/, rel);
    }
    if (!ROTO) {
        assert.equal(leer("app/schedule/helpers/testAPISendMessages.ts"), "", "el fichero con la clave escrita a mano se fue");
    }
});

test("la página pública de agendar no recibe la cuenta entera", () => {
    const pagina = sinComentarios(leer("app/schedule/[userId]/page.tsx"));
    const cliente = sinComentarios(leer("app/schedule/_components/SchedulePageClient.tsx"));
    if (ROTO) {
        assert.ok(/apiKey|include:/.test(pagina) || /apikey|apiKey/.test(cliente),
            "antes: la página pública pasaba la clave al navegador");
        return;
    }
    assert.doesNotMatch(pagina, /apiKey:\s*true|apiKey:\s*\{\s*select:\s*\{[^}]*\bkey:/, "la página no lee la clave");
    assert.doesNotMatch(pagina, /include:/, "ni la fila entera con sus relaciones");
    assert.match(pagina, /select:/, "se eligen los campos, no la fila entera");
    assert.doesNotMatch(cliente, /apikey|apiKey|serverUrl|createSeguimiento|sendMessageWithHistoryAction/);
    assert.match(cliente, /confirmarLaCitaPublicaAction/);
});

test("Chats no manda la clave al navegador", () => {
    const pagina = sinComentarios(leer("app/(root)/chats/page.tsx"));
    if (ROTO) {
        assert.match(pagina, /key:\s*[A-Za-z_.?]+\.key\b/, "antes: se metía la clave en lo que va al navegador");
        return;
    }
    assert.doesNotMatch(pagina, /key:\s*[A-Za-z_.?]+\.key\b|apiKey\??\.key/);
});

test("Recordatorios, Campañas y Mensajes: ningún componente de cliente lee la clave", () => {
    const archivos = [
        "app/(root)/reminders/_components/ReminderForm.tsx",
        "app/(root)/messages/_components/SendMessageCard.tsx",
        "hooks/useSendMessageWithHistory.ts",
        "app/(root)/reminders/page.tsx",
        "app/(root)/campaigns/page.tsx",
    ];
    const conClave = archivos.filter((a) => /apiKey\??\.key|\bapikey\b/.test(sinComentarios(leer(a))));
    if (ROTO) {
        assert.ok(conClave.length >= 2, `antes: ${conClave.join(", ")}`);
        return;
    }
    assert.deepEqual(conClave, []);
});

test("barrido: ningún fichero de cliente toca `apiKey.key`", () => {
    if (ROTO) return;
    const malos = [];
    const andar = (dir) => {
        for (const n of readdirSync(join(RAIZ, dir))) {
            const rel = join(dir, n);
            if (n === "node_modules" || n.startsWith(".")) continue;
            if (statSync(join(RAIZ, rel)).isDirectory()) { andar(rel); continue; }
            if (!/\.(tsx?|jsx?)$/.test(n)) continue;
            const src = readFileSync(join(RAIZ, rel), "utf8");
            if (!/^\s*['"]use client['"]/m.test(src.slice(0, 300))) continue;
            if (/apiKey\??\.key\b/.test(sinComentarios(src))) malos.push(rel);
        }
    };
    for (const d of ["app", "components", "hooks"]) andar(d);
    assert.deepEqual(malos, []);
});
