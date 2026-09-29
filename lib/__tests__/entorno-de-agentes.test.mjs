// Banco del entorno de los agentes: que la guía, el comprobador y los flujos
// de despliegue digan lo mismo. Se levanta con scripts/banco-entorno-de-agentes.sh.
//
// MODO=roto lee la guía y el módulo de ANTES_REF (antes de esta auditoría) y
// AFIRMA que no existían: sin ese modo, lo verde del normal no diría nada.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const MODO = process.env.MODO ?? "bueno";
const ANTES_REF = process.env.ANTES_REF ?? "8c898bd";
const GUIA = "docs/entorno-claude-code-agentes.md";
const MODULO = "scripts/entorno-de-agentes.mjs";

function delAntes(ruta) {
  try {
    return execFileSync("git", ["-C", RAIZ, "show", `${ANTES_REF}:${ruta}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

if (MODO === "roto") {
  test("ANTES: no había guía del entorno", () => assert.equal(delAntes(GUIA), null));
  test("ANTES: no había comprobador", () => assert.equal(delAntes(MODULO), null));
  test("ANTES: el flujo de astracalls ya no desplegaba (la asimetría es previa)", async () => {
    const m = await import(path.join(RAIZ, MODULO));
    const f = "/home/user/astracalls/.github/workflows/docker-image.yml";
    if (!fs.existsSync(f)) return; // sin clon no se afirma nada de él
    assert.ok(m.loQueLeFaltaAlFlujo(fs.readFileSync(f, "utf8")).includes("despliegaPorWebhook"));
  });
} else {
  const m = await import(path.join(RAIZ, MODULO));
  const guia = fs.readFileSync(path.join(RAIZ, GUIA), "utf8");

  test("variables: detecta las que faltan, sin mirar valores", () => {
    assert.deepEqual(m.lasQueFaltan(m.VARIABLES), []);
    assert.deepEqual(m.lasQueFaltan(["PORTAINER_URL", "OTRA"]), ["PORTAINER_TOKEN", "PORTAINER_EVO_URL", "PORTAINER_EVO_TOKEN"]);
    assert.deepEqual(m.lasQueFaltan([]), m.VARIABLES);
  });

  test("imagen: el commit sale de la etiqueta, con o sin digest; latest no es commit", () => {
    const sha = "8c898bd49e0ab6bc3d54241f08edc7241f609fae";
    assert.equal(m.elCommitDeLaImagen(`ghcr.io/grupo-verzay/agente-ia-app:${sha}`), sha);
    assert.equal(m.elCommitDeLaImagen(`ghcr.io/grupo-verzay/agente-ia-app:${sha}@sha256:${"a".repeat(64)}`), sha);
    assert.equal(m.elCommitDeLaImagen("ghcr.io/grupo-verzay/wacalls:latest"), null);
    assert.equal(m.elCommitDeLaImagen(undefined), null);
  });

  test("despliegue: exacto con commit, aproximado con latest, y nunca inventado", () => {
    const a = "a".repeat(40), b = "b".repeat(40);
    assert.equal(m.estadoDelDespliegue({ imagen: `x:${a}`, ultimoCommit: a }), "al_dia");
    assert.equal(m.estadoDelDespliegue({ imagen: `x:${a}`, ultimoCommit: b }), "atrasado");
    assert.equal(m.estadoDelDespliegue({ imagen: "x:latest", servicioActualizado: "2026-09-25T21:40:38Z", ultimaFusion: "2026-09-25T20:40:00Z" }), "probablemente_al_dia");
    assert.equal(m.estadoDelDespliegue({ imagen: "x:latest", servicioActualizado: "2026-09-01T00:00:00Z", ultimaFusion: "2026-09-25T20:40:00Z" }), "probablemente_atrasado");
    assert.equal(m.estadoDelDespliegue({ imagen: "x:latest" }), "no_se_sabe");
  });

  test("rol del token de Portainer", () => {
    assert.equal(m.elRolDelToken(1), "administrador");
    assert.equal(m.elRolDelToken(2), "usuario");
    assert.equal(m.elRolDelToken(undefined), "desconocido");
  });

  test("simetría: todo repositorio con despliegue automático hace las seis cosas", () => {
    let mirados = 0;
    for (const r of m.REPOSITORIOS.filter((x) => x.despliegue === "automatico")) {
      const dir = r.repo === "agente-ia-app" ? RAIZ : `/home/user/${r.repo}`;
      const f = path.join(dir, r.flujo);
      if (!fs.existsSync(f)) continue;
      assert.deepEqual(m.loQueLeFaltaAlFlujo(fs.readFileSync(f, "utf8")), [], `${r.repo} (${r.flujo})`);
      mirados++;
    }
    assert.ok(mirados >= 1, "no se miró ningún flujo: el banco no ejercería nada");
  });

  test("simetría: un flujo sin el paso de Portainer se detecta", () => {
    const f = fs.readFileSync(path.join(RAIZ, ".github/workflows/docker-publish.yml"), "utf8");
    const sinDespliegue = f.slice(0, f.indexOf("- name: Deploy via Portainer webhook"));
    const falta = m.loQueLeFaltaAlFlujo(sinDespliegue);
    assert.ok(falta.includes("despliegaPorWebhook") && falta.includes("fallaSiNoEs2xx"));
  });

  test("la guía nombra las cuatro variables, los tres repositorios y los servicios", () => {
    for (const v of m.VARIABLES) assert.ok(guia.includes(`\`${v}\``), v);
    for (const r of m.REPOSITORIOS) {
      assert.ok(guia.includes(r.repo), r.repo);
      assert.ok(guia.includes(r.servicio), r.servicio);
    }
  });

  test("la guía: los diez pasos, en orden", () => {
    let desde = 0;
    for (let n = 1; n <= 10; n++) {
      const i = guia.indexOf(`### Paso ${n} `, desde);
      assert.ok(i >= 0, `falta el paso ${n}`);
      desde = i;
    }
  });

  test("la guía: todo despliegue manual está en Pendiente", () => {
    const pendiente = guia.slice(guia.indexOf("## Pendiente"));
    for (const r of m.REPOSITORIOS.filter((x) => x.despliegue === "manual")) {
      assert.ok(pendiente.includes(r.repo) && pendiente.includes(r.servicio), r.repo);
    }
  });

  test("la guía no lleva ninguna llave ni contraseña", () => {
    assert.doesNotMatch(guia, /ptr_[A-Za-z0-9]{10,}/);
    assert.doesNotMatch(guia, /gh[pous]_[A-Za-z0-9]{20,}/);
    assert.doesNotMatch(guia, /api\/webhooks\/[0-9a-f-]{20,}/);
    assert.doesNotMatch(guia, /(TOKEN|KEY)=[^.\s]{8,}/);
  });

  test("el comprobador no imprime valores de las llaves", () => {
    const s = fs.readFileSync(path.join(RAIZ, "scripts/comprobar-entorno-de-agentes.sh"), "utf8");
    for (const linea of s.split("\n")) {
      if (/(echo|printf|ok|aviso|mal)\b.*\$\{?!?[a-z_]*tok/i.test(linea) || /(echo|printf).*\$\{?PORTAINER_(EVO_)?TOKEN/.test(linea)) {
        // la única forma permitida de tocar la llave es dentro de la cabecera de curl
        assert.match(linea, /X-API-Key/, `imprime una llave: ${linea.trim()}`);
      }
    }
    assert.doesNotMatch(s, /-X\s+(POST|PUT|DELETE|PATCH)/, "el comprobador tiene que ser de solo lectura");
  });
}
