// Banco del vigilante del despliegue: un commit de main sin corrida de
// docker-publish se lanza solo. Se levanta con scripts/banco-despliegue-perdido.sh.
//
// Tres mitades: la decisión (pura), el vigilante de verdad contra una API de
// GitHub fingida —sin red: es lo único que dice si se lanza o no—, y un barrido
// de los dos flujos.
//
// MODO=roto lee los flujos de ANTES_REF (a147eaf, la fusión del #1047 que se
// quedó sin corrida) y AFIRMA el fallo: no había nada que volviera a mirar un
// push perdido, ni fila entre construcciones.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const MODO = process.env.MODO ?? "bueno";
const ANTES_REF = process.env.ANTES_REF ?? "a147eaf";
const FLUJOS = ".github/workflows";
const VIGILANTE = `${FLUJOS}/despliegue-perdido.yml`;
const PUBLICAR = `${FLUJOS}/docker-publish.yml`;

// El caso de producción, con sus datos: el #1047 se fusionó a las 19:48:40 y a
// las 20:23 no tenía ninguna corrida.
const SHA_1047 = "a147eaf137280b056466daad6ae5e5a8a6ab908e";
const SHA_1046 = "660c5255734b98ec262b2ff8992fca756e7c27de";
const FUSION_1047 = "2026-09-29T19:48:40Z";
const REVISADO = Date.parse("2026-09-29T20:23:21Z");

function delAntes(ruta) {
    try {
        return execFileSync("git", ["-C", RAIZ, "show", `${ANTES_REF}:${ruta}`], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
    } catch {
        return null;
    }
}

function flujosDelAntes() {
    const lista = execFileSync("git", ["-C", RAIZ, "ls-tree", "--name-only", `${ANTES_REF}:${FLUJOS}`], { encoding: "utf8" });
    return lista.split("\n").filter(Boolean).map((n) => ({ nombre: n, texto: delAntes(`${FLUJOS}/${n}`) ?? "" }));
}

const tieneReloj = (texto) => /^\s*schedule:\s*$/m.test(texto) && /cron:/.test(texto);
const vaEnFila = (texto) => /^concurrency:/m.test(texto) && /cancel-in-progress:\s*false/.test(texto);

if (MODO === "roto") {
    test("ANTES: la corrida del #1046 existe y la del #1047 no es un caso inventado (el commit está en git)", () => {
        const tipo = execFileSync("git", ["-C", RAIZ, "cat-file", "-t", SHA_1047], { encoding: "utf8" }).trim();
        assert.equal(tipo, "commit");
    });

    test("ANTES: ningún flujo vuelve a mirar un push perdido (ninguno lleva reloj)", () => {
        const flujos = flujosDelAntes();
        assert.ok(flujos.length >= 1, "no se leyó ningún flujo: el modo roto no ejercería nada");
        assert.deepEqual(flujos.filter((f) => tieneReloj(f.texto)).map((f) => f.nombre), []);
        assert.equal(delAntes(VIGILANTE), null);
    });

    test("ANTES: docker-publish solo se lanzaba con el aviso del push (o a mano)", () => {
        const t = delAntes(PUBLICAR);
        assert.ok(t);
        assert.match(t, /on:\s*\n\s*push:/);
        assert.doesNotMatch(t, /schedule:/);
    });

    test("ANTES: dos construcciones podían correr a la vez y desplegar fuera de orden", () => {
        assert.equal(vaEnFila(delAntes(PUBLICAR) ?? ""), false);
    });
} else {
    const m = await import(path.join(RAIZ, "scripts/despliegue-perdido.mjs"));
    const corrida = (sha, status, conclusion = null, event = "push") => ({ head_sha: sha, status, conclusion, event });

    // ---------------------------------------------------------------- decisión
    test("el caso de producción: el #1047 sin corrida 35 minutos después se LANZA", () => {
        const d = m.queHacerConElUltimoCommit({
            head: { sha: SHA_1047, fecha: FUSION_1047, mensaje: "Merge pull request #1047" },
            corridas: [corrida(SHA_1046, "completed", "success")],
            ahora: REVISADO,
        });
        assert.equal(d.accion, "lanzar");
        assert.equal(d.estado, "perdido");
        assert.match(d.motivo, /a147eaf/);
    });

    test("recién fusionado y sin corrida todavía: se ESPERA, no se lanza un duplicado", () => {
        const d = m.queHacerConElUltimoCommit({
            head: { sha: SHA_1047, fecha: FUSION_1047 },
            corridas: [],
            ahora: Date.parse(FUSION_1047) + m.MARGEN_ANTES_DE_LANZAR_MS - 1000,
        });
        assert.equal(d.accion, "esperar");
        const justo = m.queHacerConElUltimoCommit({
            head: { sha: SHA_1047, fecha: FUSION_1047 },
            corridas: [],
            ahora: Date.parse(FUSION_1047) + m.MARGEN_ANTES_DE_LANZAR_MS,
        });
        assert.equal(justo.accion, "lanzar");
    });

    test("con corrida en curso —en cola, esperando turno o corriendo— no se toca", () => {
        for (const status of ["queued", "pending", "waiting", "requested", "in_progress"]) {
            const d = m.queHacerConElUltimoCommit({ head: { sha: SHA_1047, fecha: FUSION_1047 }, corridas: [corrida(SHA_1047, status)], ahora: REVISADO });
            assert.equal(d.accion, "nada", status);
            assert.equal(d.estado, "desplegando", status);
        }
    });

    test("desplegado: la corrida verde, venga del push o lanzada a mano", () => {
        for (const event of ["push", "workflow_dispatch"]) {
            const d = m.queHacerConElUltimoCommit({ head: { sha: SHA_1047 }, corridas: [corrida(SHA_1047, "completed", "success", event)], ahora: REVISADO });
            assert.equal(d.estado, "desplegado", event);
        }
    });

    test("una corrida EN ROJO no se relanza en bucle: es la señal, no un aviso perdido", () => {
        for (const conclusion of ["failure", "timed_out", "startup_failure", "action_required"]) {
            const d = m.queHacerConElUltimoCommit({ head: { sha: SHA_1047, fecha: FUSION_1047 }, corridas: [corrida(SHA_1047, "completed", conclusion)], ahora: REVISADO });
            assert.equal(d.accion, "nada", conclusion);
            assert.equal(d.estado, "fallida", conclusion);
        }
        // y un reintento verde manda sobre la roja de antes
        const d = m.queHacerConElUltimoCommit({
            head: { sha: SHA_1047 },
            corridas: [corrida(SHA_1047, "completed", "failure"), corrida(SHA_1047, "completed", "success")],
            ahora: REVISADO,
        });
        assert.equal(d.estado, "desplegado");
    });

    test("una corrida CANCELADA no se relanza: eso lo decidió alguien", () => {
        const d = m.queHacerConElUltimoCommit({ head: { sha: SHA_1047, fecha: FUSION_1047 }, corridas: [corrida(SHA_1047, "completed", "cancelled")], ahora: REVISADO });
        assert.equal(d.accion, "nada");
        assert.equal(d.estado, "cancelada");
    });

    test("solo cuentan las corridas DE ESE commit: una verde de otro no tapa el perdido", () => {
        const d = m.queHacerConElUltimoCommit({
            head: { sha: SHA_1047, fecha: FUSION_1047 },
            corridas: [corrida(SHA_1046, "completed", "success"), corrida(SHA_1046, "in_progress")],
            ahora: REVISADO,
        });
        assert.equal(d.accion, "lanzar");
    });

    test("un commit con [skip ci] no se construye a escondidas", () => {
        for (const marca of m.MARCAS_DE_NO_CONSTRUIR) {
            const d = m.queHacerConElUltimoCommit({ head: { sha: SHA_1047, fecha: FUSION_1047, mensaje: `docs ${marca.toUpperCase()}` }, corridas: [], ahora: REVISADO });
            assert.equal(d.accion, "nada", marca);
            assert.equal(d.estado, "sin_construir", marca);
        }
    });

    test("sin fecha legible se lanza (desplegar dos veces el mismo commit no cambia nada)", () => {
        const d = m.queHacerConElUltimoCommit({ head: { sha: SHA_1047, fecha: "no es una fecha" }, corridas: [], ahora: REVISADO });
        assert.equal(d.accion, "lanzar");
    });

    test("sin commit legible no se lanza nada a ciegas", () => {
        for (const sha of [undefined, "", "a147eaf", "Z".repeat(40)]) {
            assert.equal(m.queHacerConElUltimoCommit({ head: { sha }, corridas: [], ahora: REVISADO }).accion, "nada", String(sha));
        }
    });

    // ------------------------------------------------ el vigilante de verdad
    /**
     * Una API de GitHub fingida con lo mínimo: el último commit de main, la
     * lista de corridas de ese commit y el lanzamiento. Apunta lo que recibe.
     */
    async function conGitHubFingido({ corridas = [], fallaLista = false, fallaLanzar = false, fecha = FUSION_1047, mensaje = "Merge pull request #1047" }, fn) {
        const recibido = [];
        const server = http.createServer((req, res) => {
            let cuerpo = "";
            req.on("data", (d) => (cuerpo += d));
            req.on("end", () => {
                const url = new URL(req.url, "http://x");
                recibido.push({ metodo: req.method, ruta: url.pathname, query: url.searchParams, auth: req.headers.authorization, cuerpo });
                const json = (codigo, obj) => {
                    res.writeHead(codigo, { "Content-Type": "application/json" });
                    res.end(obj === undefined ? "" : JSON.stringify(obj));
                };
                if (req.method === "GET" && url.pathname === "/repos/Grupo-Verzay/agente-ia-app/commits/main") {
                    return json(200, { sha: SHA_1047, commit: { message: mensaje, committer: { date: fecha } } });
                }
                if (req.method === "GET" && url.pathname === "/repos/Grupo-Verzay/agente-ia-app/actions/workflows/docker-publish.yml/runs") {
                    if (fallaLista) return json(500, { message: "Server Error" });
                    const sha = url.searchParams.get("head_sha");
                    const suyas = corridas.filter((c) => !sha || c.head_sha === sha);
                    return json(200, { total_count: suyas.length, workflow_runs: suyas });
                }
                if (req.method === "POST" && url.pathname === "/repos/Grupo-Verzay/agente-ia-app/actions/workflows/docker-publish.yml/dispatches") {
                    if (fallaLanzar) return json(403, { message: "Resource not accessible by integration" });
                    res.writeHead(204);
                    return res.end();
                }
                json(404, { message: "Not Found" });
            });
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        try {
            return await fn(`http://127.0.0.1:${server.address().port}`, recibido);
        } finally {
            await new Promise((r) => server.close(r));
        }
    }

    function correrElVigilante(api) {
        return new Promise((resolve) => {
            const hijo = spawn(process.execPath, [path.join(RAIZ, "scripts/vigilar-despliegue.mjs")], {
                env: {
                    PATH: process.env.PATH,
                    GITHUB_API_URL: api,
                    GITHUB_REPOSITORY: "Grupo-Verzay/agente-ia-app",
                    GITHUB_TOKEN: "token-del-banco",
                    AHORA_MS: String(REVISADO),
                },
                stdio: ["ignore", "pipe", "pipe"],
            });
            let salida = "";
            hijo.stdout.on("data", (d) => (salida += d));
            hijo.stderr.on("data", (d) => (salida += d));
            hijo.on("close", (codigo) => resolve({ codigo, salida }));
        });
    }

    const lanzamientos = (recibido) => recibido.filter((r) => r.metodo === "POST" && r.ruta.endsWith("/dispatches"));

    test("vigilante: el #1047 sin corrida → lanza docker-publish sobre main, y lo dice", async () => {
        await conGitHubFingido({ corridas: [corrida(SHA_1046, "completed", "success")] }, async (api, recibido) => {
            const { codigo, salida } = await correrElVigilante(api);
            assert.equal(codigo, 0, salida);
            const l = lanzamientos(recibido);
            assert.equal(l.length, 1, salida);
            assert.deepEqual(JSON.parse(l[0].cuerpo), { ref: "main" });
            assert.equal(l[0].auth, "Bearer token-del-banco");
            assert.match(salida, /::warning title=Despliegue perdido::/);
            // pregunta por las corridas DE ESE commit, no por las últimas a secas
            const lista = recibido.find((r) => r.ruta.endsWith("/runs"));
            assert.equal(lista.query.get("head_sha"), SHA_1047);
        });
    });

    test("vigilante: con la corrida verde no lanza nada", async () => {
        await conGitHubFingido({ corridas: [corrida(SHA_1047, "completed", "success")] }, async (api, recibido) => {
            const { codigo, salida } = await correrElVigilante(api);
            assert.equal(codigo, 0, salida);
            assert.equal(lanzamientos(recibido).length, 0);
            assert.match(salida, /desplegado/);
        });
    });

    test("vigilante: con la corrida en rojo no lanza nada (y sale en verde: el rojo ya está)", async () => {
        await conGitHubFingido({ corridas: [corrida(SHA_1047, "completed", "failure")] }, async (api, recibido) => {
            const { codigo, salida } = await correrElVigilante(api);
            assert.equal(codigo, 0, salida);
            assert.equal(lanzamientos(recibido).length, 0);
            assert.match(salida, /fallida/);
        });
    });

    test("vigilante: si no puede PREGUNTAR, sale en rojo y no lanza a ciegas", async () => {
        await conGitHubFingido({ fallaLista: true }, async (api, recibido) => {
            const { codigo, salida } = await correrElVigilante(api);
            assert.equal(codigo, 1);
            assert.equal(lanzamientos(recibido).length, 0);
            assert.match(salida, /::error title=Vigilante del despliegue::.*HTTP 500/);
        });
    });

    test("vigilante: si no puede LANZAR, sale en rojo (un vigilante mudo es el mismo fallo)", async () => {
        await conGitHubFingido({ fallaLanzar: true }, async (api) => {
            const { codigo, salida } = await correrElVigilante(api);
            assert.equal(codigo, 1);
            assert.match(salida, /HTTP 403/);
        });
    });

    // ------------------------------------------------------------- los flujos
    const vigilante = fs.readFileSync(path.join(RAIZ, VIGILANTE), "utf8");
    const publicar = fs.readFileSync(path.join(RAIZ, PUBLICAR), "utf8");

    test("flujo del vigilante: con reloj, con permiso para lanzar y corriendo el script", () => {
        assert.ok(tieneReloj(vigilante));
        const cron = vigilante.match(/cron:\s*"([^"]+)"/)?.[1];
        assert.ok(cron, "sin cron");
        const minutos = Number(cron.match(/^\*\/(\d+)\s/)?.[1]);
        assert.ok(minutos >= 5 && minutos <= 15, `cada ${cron}: ni más de 15 min (se nota) ni menos de 5 (GitHub no baja de ahí)`);
        assert.match(vigilante, /actions:\s*write/);
        assert.match(vigilante, /run:\s*node scripts\/vigilar-despliegue\.mjs/);
        assert.match(vigilante, /GITHUB_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
    });

    test("flujo del vigilante: el checkout parcial trae TODO lo que el script importa", () => {
        const lista = (vigilante.match(/sparse-checkout:\s*\|\n((?:\s+\S+\n)+)/)?.[1] ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
        assert.ok(lista.includes("scripts/vigilar-despliegue.mjs"));
        const script = fs.readFileSync(path.join(RAIZ, "scripts/vigilar-despliegue.mjs"), "utf8");
        const locales = [...script.matchAll(/from\s+"(\.\/[^"]+)"/g)].map((x) => path.posix.join("scripts", x[1]));
        assert.ok(locales.length >= 1);
        for (const f of locales) assert.ok(lista.includes(f), `el checkout no trae ${f}: el vigilante se caería al importarlo`);
    });

    test("docker-publish: se deja lanzar a mano (el vigilante lo necesita) y va en fila", () => {
        assert.match(publicar, /^\s{2}workflow_dispatch:/m);
        assert.ok(vaEnFila(publicar), "sin concurrency: dos construcciones a la vez pueden desplegar la vieja la última");
        assert.match(publicar, /group:\s*docker-publish-\$\{\{\s*github\.ref\s*\}\}/);
        // lo que el vigilante lanza es ESTE flujo
        const script = fs.readFileSync(path.join(RAIZ, "scripts/vigilar-despliegue.mjs"), "utf8");
        assert.match(script, /FLUJO\s*=\s*process\.env\.FLUJO\s*\|\|\s*"docker-publish\.yml"/);
    });

    test("docker-publish sigue haciendo las seis cosas del despliegue", async () => {
        const e = await import(path.join(RAIZ, "scripts/entorno-de-agentes.mjs"));
        assert.deepEqual(e.loQueLeFaltaAlFlujo(publicar), []);
    });

    test("la guía del entorno nombra al vigilante", () => {
        const guia = fs.readFileSync(path.join(RAIZ, "docs/entorno-claude-code-agentes.md"), "utf8");
        assert.match(guia, /despliegue-perdido/);
    });
}
