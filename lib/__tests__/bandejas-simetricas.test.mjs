/**
 * La barrita Chats ⇄ Correos: la regla, y un barrido de que las dos pantallas
 * pintan su panel de «nada abierto» con la MISMA pieza.
 *
 * `MODO=roto` lee las pantallas de `ANTES_REF` y afirma que no había ni panel
 * compartido ni barrita.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "9a5656b";
const leer = (ruta) =>
    ROTO
        ? (() => {
              try {
                  return execFileSync("git", ["show", `${ANTES_REF}:${ruta}`], { cwd: RAIZ, encoding: "utf8" });
              } catch {
                  return "";
              }
          })()
        : fs.readFileSync(join(RAIZ, ruta), "utf8");

const { laBandejaActiva, seVeLaBarritaDeBandejas } = await import("./.compilado/bandejas/alternar-bandejas.mjs");
const AMBAS = ["/chats", "/correo", "/sessions"];

test("la barrita sale en las dos pantallas y marca la que se mira", () => {
    assert.equal(laBandejaActiva("/chats"), "chats");
    assert.equal(laBandejaActiva("/correo"), "correo");
    assert.equal(laBandejaActiva("/chats/algo"), "chats");
    assert.equal(seVeLaBarritaDeBandejas("/chats", AMBAS), true);
    assert.equal(seVeLaBarritaDeBandejas("/correo", AMBAS), true);
});

test("no sale fuera de Chats y Correos", () => {
    assert.equal(seVeLaBarritaDeBandejas("/sessions", AMBAS), false);
    assert.equal(seVeLaBarritaDeBandejas("/", AMBAS), false);
    assert.equal(seVeLaBarritaDeBandejas("/chatsx", AMBAS), false);
    assert.equal(seVeLaBarritaDeBandejas(null, AMBAS), false);
});

test("sin las DOS en el menú no hay nada que alternar", () => {
    assert.equal(seVeLaBarritaDeBandejas("/chats", ["/chats"]), false);
    assert.equal(seVeLaBarritaDeBandejas("/correo", ["/correo", null]), false);
    assert.equal(seVeLaBarritaDeBandejas("/chats", ["/chats/", "/correo/"]), true);
});

const quitar = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test(ROTO ? "ANTES: Correo no tenía el panel de Chats ni la barrita" : "las dos pantallas pintan el panel con la MISMA pieza", () => {
    const correo = quitar(leer("app/(root)/correo/_components/CorreoClient.tsx"));
    const chats = quitar(leer("app/(root)/chats/_components/PanelSinChat.tsx"));
    const barra = quitar(leer("components/custom/Breadcrumbs.tsx"));
    if (ROTO) {
        assert.ok(correo.includes("Elige un correo para leerlo"));
        assert.ok(!correo.includes("PanelSinSeleccion"));
        assert.ok(!barra.includes("AlternarBandeja"));
        return;
    }
    assert.ok(correo.includes("<PanelSinSeleccion"), "Correo usa el panel compartido");
    assert.ok(chats.includes("<PanelSinSeleccion"), "Chats usa el panel compartido");
    assert.ok(!correo.includes("Elige un correo"), "no queda el texto viejo");
    const cc = quitar(fs.readFileSync(join(RAIZ, "app/(root)/chats/_components/chats-client.tsx"), "utf8"));
    assert.ok(cc.includes("<PanelSinChat"), "chats-client pinta PanelSinChat");
    assert.ok(!cc.includes("Tus conversaciones"), "chats-client no lleva otra copia del panel");
    assert.ok(barra.includes("<AlternarBandeja"), "la barrita va en la barra de arriba");
});
