#!/usr/bin/env node
// El vigilante del despliegue: si el último commit de main no tiene NINGUNA
// corrida de docker-publish, la lanza (workflow_dispatch).
//
// Lo corre .github/workflows/despliegue-perdido.yml cada diez minutos. La
// decisión es scripts/despliegue-perdido.mjs, que es puro; aquí solo se habla
// con la API de GitHub. Ver la sección «Un despliegue que cuelga de UN aviso
// de GitHub no tiene red» de CLAUDE.md.
//
// Variables (las tres primeras las pone GitHub Actions solo):
//   GITHUB_TOKEN        el token del flujo, con `actions: write`
//   GITHUB_REPOSITORY   dueño/repositorio
//   GITHUB_API_URL      https://api.github.com (el banco apunta a uno fingido)
//   RAMA                por defecto main
//   FLUJO               por defecto docker-publish.yml
//   AHORA_MS            solo para el banco: el reloj
//
// Sale con 1 si no pudo PREGUNTAR o no pudo LANZAR: un vigilante que falla en
// silencio es el mismo fallo que viene a tapar.
import fs from "node:fs";
import { queHacerConElUltimoCommit } from "./despliegue-perdido.mjs";

const API = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
const REPO = process.env.GITHUB_REPOSITORY || "";
const TOKEN = process.env.GITHUB_TOKEN || "";
const RAMA = process.env.RAMA || "main";
const FLUJO = process.env.FLUJO || "docker-publish.yml";
const AHORA = Number(process.env.AHORA_MS) || Date.now();

function cabeceras() {
    return {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "vigilante-del-despliegue",
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    };
}

async function pedir(ruta, opciones = {}) {
    const resp = await fetch(`${API}${ruta}`, { ...opciones, headers: { ...cabeceras(), ...(opciones.headers ?? {}) } });
    const texto = await resp.text();
    if (!resp.ok) throw new Error(`${opciones.method ?? "GET"} ${ruta} contestó HTTP ${resp.status}: ${texto.slice(0, 300)}`);
    return texto ? JSON.parse(texto) : null;
}

function resumen(linea) {
    console.log(linea);
    const f = process.env.GITHUB_STEP_SUMMARY;
    if (f) {
        try {
            fs.appendFileSync(f, `${linea}\n`);
        } catch {
            /* el resumen es un adorno: no tumba al vigilante */
        }
    }
}

async function main() {
    if (!REPO.includes("/")) throw new Error("falta GITHUB_REPOSITORY (dueño/repositorio)");

    const commit = await pedir(`/repos/${REPO}/commits/${encodeURIComponent(RAMA)}`);
    const head = {
        sha: commit?.sha,
        fecha: commit?.commit?.committer?.date,
        mensaje: commit?.commit?.message,
    };
    const lista = await pedir(
        `/repos/${REPO}/actions/workflows/${encodeURIComponent(FLUJO)}/runs?head_sha=${encodeURIComponent(head.sha ?? "")}&per_page=20`,
    );
    const corridas = Array.isArray(lista?.workflow_runs) ? lista.workflow_runs : [];

    const decision = queHacerConElUltimoCommit({ head, corridas, ahora: AHORA });
    resumen(`[despliegue] ${RAMA} @ ${String(head.sha).slice(0, 7)}: ${decision.estado} — ${decision.motivo}`);

    if (decision.accion !== "lanzar") return;

    await pedir(`/repos/${REPO}/actions/workflows/${encodeURIComponent(FLUJO)}/dispatches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: RAMA }),
    });
    // Aviso visible en la corrida: una construcción que hubo que lanzar a mano
    // es un aviso de GitHub que se perdió, y eso tiene que poder verse después.
    console.log(`::warning title=Despliegue perdido::${decision.motivo}. Se lanzó ${FLUJO} sobre ${RAMA}.`);
    resumen(`[despliegue] lanzado ${FLUJO} sobre ${RAMA}`);
}

main().catch((error) => {
    console.log(`::error title=Vigilante del despliegue::${error?.message ?? error}`);
    console.error("[despliegue] el vigilante no pudo terminar", error);
    process.exit(1);
});
