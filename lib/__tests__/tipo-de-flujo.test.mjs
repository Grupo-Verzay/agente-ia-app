/**
 * La regla pura de cambiar el tipo de activación de un flujo, y un barrido de
 * que la tarjeta ofrece cambiarlo con el MISMO selector que «Nuevo flujo».
 *
 * En `MODO=roto` lee la tarjeta y las acciones de ANTES_REF y afirma que no
 * había forma de cambiar el tipo de un flujo ya creado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "75b7e76";
const leer = (f) => (ROTO ? execFileSync("git", ["show", `${ANTES}:${f}`], { encoding: "utf8" }) : readFileSync(f, "utf8"));
const t = ROTO ? test.skip : test;
const r = ROTO ? test : test.skip;

const m = ROTO ? null : await import("./.compilado/tipo-de-flujo/tipo-de-activacion.js");
const TIPOS = ["inicio", "ia", "flujo", "chatbot"];
const pedida = (tipo) => ({ tipo, palabras: ["hola", " Hola ", "precio"], coincidencia: "contiene", condicion: "quiere pagar" });

t("cada tipo pedido es el tipo que se deduce después: nunca se queda el viejo", () => {
    for (const tipo of TIPOS) {
        const cambios = m.losCambiosDelTipo(pedida(tipo));
        assert.equal(m.elTipoTrasLosCambios("f1", cambios), tipo, tipo);
    }
});

t("pasar a un tipo QUITA los otros dos", () => {
    const ia = m.losCambiosDelTipo(pedida("ia"));
    assert.equal(ia.description, "");
    assert.equal(ia.triggerOnNewSession, false);
    const chatbot = m.losCambiosDelTipo(pedida("chatbot"));
    assert.equal(chatbot.disparador, null);
    assert.deepEqual(JSON.parse(chatbot.description), { matchType: "contiene", keywords: ["hola", "precio"] });
    const flujo = m.losCambiosDelTipo(pedida("flujo"));
    assert.deepEqual([flujo.description, flujo.disparador, flujo.triggerOnNewSession], ["", null, false]);
    assert.equal(m.losCambiosDelTipo(pedida("inicio")).apagarLasOtrasBienvenidas, true);
});

t("chatbot sin palabras o IA sin intención no se guardan, y lo dicen", () => {
    assert.match(m.porQueNoSePuedeCambiar({ tipo: "chatbot", palabras: ["  "] }), /palabra clave/);
    assert.match(m.porQueNoSePuedeCambiar({ tipo: "ia", condicion: " " }), /intención/);
    assert.match(m.porQueNoSePuedeCambiar({ tipo: "otro" }), /Elige/);
    assert.equal(m.porQueNoSePuedeCambiar({ tipo: "flujo" }), null);
});

t("la ventana abre con lo que el flujo es hoy", () => {
    const desc = JSON.stringify({ matchType: "contiene", keywords: ["a", "b"] });
    assert.deepEqual(m.laActivacionActual({ id: "f", description: desc }, null),
        { tipo: "chatbot", palabras: ["a", "b"], coincidencia: "contiene", condicion: "" });
    assert.equal(m.laActivacionActual({ id: "f", description: desc }, "quiere pagar").tipo, "ia");
    assert.equal(m.laActivacionActual({ id: "f", triggerOnNewSession: true }, null).tipo, "inicio");
});

t("la tarjeta ofrece «Cambiar tipo» y la ventana usa el MISMO selector que crear", () => {
    assert.match(leer("app/(root)/flow/_components/WorkflowAction.tsx"), /data-cambiar-tipo-del-flujo/);
    assert.match(leer("app/(root)/flow/_components/WorkflowCard.tsx"), /CambiarTipoDelFlujoDialog/);
    for (const f of ["app/(root)/flow/_components/CambiarTipoDelFlujoDialog.tsx", "app/(root)/flow/_components/CreateWorflowDialog.tsx"]) {
        assert.match(leer(f), /SelectorDeTipoDeActivacion/, f);
    }
    assert.match(leer("actions/workflow-actions.ts"), /export const cambiarElTipoDelFlujoAction/);
});

r("ANTES: no había forma de cambiar el tipo de un flujo ya creado", () => {
    assert.doesNotMatch(leer("app/(root)/flow/_components/WorkflowAction.tsx"), /Cambiar tipo/);
    assert.doesNotMatch(leer("actions/workflow-actions.ts"), /cambiarElTipoDelFlujo/);
    assert.throws(() => leer("lib/tipo-de-activacion.ts"));
});
