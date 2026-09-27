/**
 * El botón "Conectar Gmail": que esté ENCENDIDO de verdad, no solo escrito.
 *
 * Tres mitades, y cada una contesta algo que las otras no pueden:
 *
 * 1. **El código** (siempre): la dirección de vuelta que arma la App para el
 *    dominio de producción es EXACTAMENTE la registrada en Google, el botón se
 *    enciende con las dos variables y se apaga sin ellas, la plantilla del
 *    stack nombra las variables sin valor, y ningún fichero del repo lleva un
 *    secreto de Google (`GOCSPX-`).
 * 2. **Google** (con `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET`
 *    en el entorno; sin ellas se salta y lo dice): Google acepta esa dirección
 *    de vuelta para ese cliente —no contesta `redirect_uri_mismatch`— y acepta
 *    el secreto —con un código inventado contesta `invalid_grant`, que solo
 *    sale cuando el cliente se autenticó; con un secreto malo sale
 *    `invalid_client`—.
 * 3. **Producción** (con `PORTAINER_URL` y `PORTAINER_TOKEN`): el servicio de
 *    la App tiene las dos variables con valor, y todos sus contenedores vivos
 *    las llevan y están `healthy`. Es lo único que dice que el botón está
 *    encendido en la App que se usa, y no en un fichero.
 *
 * `MODO=roto` afirma que la mitad 2 DISCRIMINA: una vuelta con una barra de
 * más y un secreto equivocado tienen que ser rechazados por Google. Sin eso,
 * un "aceptado" no diría nada.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const r = await import(join(AQUI, ".compilado", "correo-puro", "correo.js"));

const PRODUCCION = "https://agente.ia-app.com";
const VUELTA_REGISTRADA = "https://agente.ia-app.com/api/correo/oauth/gmail";

const CID = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
const SEC = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
const hayCredenciales = Boolean(CID && SEC);
const hayPortainer = Boolean(process.env.PORTAINER_URL && process.env.PORTAINER_TOKEN);

// --- 1. El código -----------------------------------------------------------

test("la vuelta de producción es exactamente la registrada en Google", () => {
    assert.equal(r.laDireccionDeVuelta(PRODUCCION, "gmail"), VUELTA_REGISTRADA);
    assert.equal(r.laDireccionDeVuelta(PRODUCCION + "/", "gmail"), VUELTA_REGISTRADA, "una barra final no puede colarse");
});

test("el botón de Gmail se enciende con las dos variables y solo con las dos", () => {
    assert.deepEqual(r.VARIABLES_DEL_PROVEEDOR.gmail, ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"]);
    assert.equal(r.hayLlavesDe("gmail", { GOOGLE_OAUTH_CLIENT_ID: "a", GOOGLE_OAUTH_CLIENT_SECRET: "b" }), true);
    assert.equal(r.hayLlavesDe("gmail", { GOOGLE_OAUTH_CLIENT_ID: "a" }), false);
    assert.equal(r.hayLlavesDe("gmail", { GOOGLE_OAUTH_CLIENT_ID: "a", GOOGLE_OAUTH_CLIENT_SECRET: "  " }), false);
});

test("la plantilla del stack nombra las variables de Correo, sin valor", () => {
    const t = fs.readFileSync(join(RAIZ, "docker-compose.yml"), "utf8");
    for (const v of ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "MICROSOFT_OAUTH_CLIENT_ID", "MICROSOFT_OAUTH_CLIENT_SECRET"]) {
        assert.match(t, new RegExp(`^\\s*- ${v}=$`, "m"), `${v} tiene que estar en la plantilla y vacía`);
    }
});

test("ningún fichero del repositorio lleva un secreto de Google", () => {
    const hallados = execSync("git grep -l -I -e 'GOCSPX-[A-Za-z0-9_-]\\{10,\\}' || true", { cwd: RAIZ, encoding: "utf8" }).trim();
    assert.equal(hallados, "", `secreto de Google en: ${hallados}`);
});

// --- 2. Google --------------------------------------------------------------

async function adondeLlevaLaAutorizacion(vuelta) {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", CID);
    u.searchParams.set("redirect_uri", vuelta);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", r.PERMISOS_DEL_PROVEEDOR.gmail.join(" "));
    const res = await fetch(u, { redirect: "manual" });
    return res.headers.get("location") || "";
}

async function queContestaElToken(secreto) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: CID, client_secret: secreto, grant_type: "authorization_code",
            code: "codigo-inventado-por-el-banco", redirect_uri: VUELTA_REGISTRADA,
        }),
    });
    return (await res.json()).error;
}

// El error de Google viaja en base64 dentro de `authError`: se decodifica para
// no depender de cómo lo escape.
const esRechazo = (loc) => /\/signin\/oauth\/error/.test(loc)
    && /redirect_uri_mismatch/.test(Buffer.from(decodeURIComponent(new URL(loc).searchParams.get("authError") || ""), "base64").toString("latin1"));

test("Google acepta la vuelta registrada para este cliente", { skip: !hayCredenciales && "sin GOOGLE_OAUTH_CLIENT_ID/SECRET en el entorno" }, async () => {
    if (ROTO) {
        const loc = await adondeLlevaLaAutorizacion(VUELTA_REGISTRADA + "/");
        assert.ok(esRechazo(loc), `una vuelta con barra de más tenía que dar redirect_uri_mismatch; llevó a ${loc.slice(0, 120)}`);
        return;
    }
    const loc = await adondeLlevaLaAutorizacion(VUELTA_REGISTRADA);
    assert.ok(loc.startsWith("https://accounts.google.com/"), `sin redirección de Google: ${loc.slice(0, 120)}`);
    assert.ok(!esRechazo(loc) && !/\/signin\/oauth\/error/.test(loc), `Google rechazó la vuelta: ${loc.slice(0, 160)}`);
});

test("Google acepta el secreto de este cliente", { skip: !hayCredenciales && "sin GOOGLE_OAUTH_CLIENT_ID/SECRET en el entorno" }, async () => {
    if (ROTO) {
        assert.equal(await queContestaElToken("secreto-equivocado"), "invalid_client");
        return;
    }
    assert.equal(await queContestaElToken(SEC), "invalid_grant", "con el secreto bueno solo puede fallar el código inventado");
});

// --- 3. Producción ----------------------------------------------------------

async function portainer(ruta) {
    const res = await fetch(`${process.env.PORTAINER_URL}/api/endpoints/1/docker${ruta}`, {
        headers: { "X-API-Key": process.env.PORTAINER_TOKEN },
    });
    assert.ok(res.ok, `Portainer contestó ${res.status} a ${ruta}`);
    return res.json();
}

const conValor = (env, v) => env.some((e) => e.startsWith(`${v}=`) && e.slice(v.length + 1).trim() !== "");

test("en producción el servicio y sus contenedores llevan las dos llaves", { skip: (ROTO || !hayPortainer) && (ROTO ? "solo en modo bueno" : "sin PORTAINER_URL/TOKEN") }, async () => {
    const filtro = encodeURIComponent(JSON.stringify({ name: ["agente-app_verzay_app"] }));
    const [servicio] = await portainer(`/services?filters=${filtro}`);
    assert.ok(servicio, "no se encontró el servicio agente-app_verzay_app");
    const env = servicio.Spec.TaskTemplate.ContainerSpec.Env || [];
    for (const v of r.VARIABLES_DEL_PROVEEDOR.gmail) assert.ok(conValor(env, v), `el servicio no tiene ${v}`);

    const f2 = encodeURIComponent(JSON.stringify({ service: ["agente-app_verzay_app"], "desired-state": ["running"] }));
    const tareas = await portainer(`/tasks?filters=${f2}`);
    assert.ok(tareas.length > 0, "no hay tareas corriendo");
    for (const t of tareas) {
        const id = t.Status?.ContainerStatus?.ContainerID;
        assert.ok(id, `la tarea ${t.ID} no tiene contenedor`);
        const c = await portainer(`/containers/${id}/json`);
        for (const v of r.VARIABLES_DEL_PROVEEDOR.gmail) assert.ok(conValor(c.Config.Env || [], v), `el contenedor ${id.slice(0, 12)} no tiene ${v}`);
        assert.equal(c.State?.Health?.Status, "healthy", `el contenedor ${id.slice(0, 12)} no está sano`);
    }
});
