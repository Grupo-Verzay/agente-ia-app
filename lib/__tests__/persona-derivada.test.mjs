// La persona de Tavus con ediciones del editor: nunca se fuerza, se usa una copia.
import test from "node:test";
import assert from "node:assert/strict";

const { laPersonaParaLaConversacion } = await import("./.compilado/persona-de-tavus.js");

function tavus(persona, { patch = 409, nuevaId = "copia-1" } = {}) {
    const llamadas = [];
    globalThis.fetch = async (url, init = {}) => {
        const metodo = init.method ?? "GET";
        llamadas.push({ url: String(url), metodo, cuerpo: init.body });
        if (metodo === "GET") return new Response(JSON.stringify(persona), { status: 200 });
        if (metodo === "PATCH") {
            if (patch === 200) return new Response("{}", { status: 200 });
            return new Response('{"message":"maker_changes: use force=true"}', { status: 409 });
        }
        if (metodo === "POST") return new Response(JSON.stringify({ persona_id: nuevaId }), { status: 200 });
        return new Response("{}", { status: 200 });
    };
    return llamadas;
}

const original = { persona_id: "p-orig", persona_name: "Verzy", system_prompt: "Eres Verzy", layers: { llm: { model: "x", tools: [] } } };

test("sin conflicto: el PATCH entra y va la original", async () => {
    const ll = tavus(original, { patch: 200 });
    assert.equal(await laPersonaParaLaConversacion({ clave: "k", personaId: "p-a" }), "p-a");
    assert.ok(!ll.some((l) => l.metodo === "POST"));
});

test("409 maker_changes: se crea una copia con las herramientas, sin force", async () => {
    const ll = tavus(original, { nuevaId: "copia-1" });
    assert.equal(await laPersonaParaLaConversacion({ clave: "k", personaId: "p-b" }), "copia-1");
    assert.ok(ll.every((l) => !l.url.includes("force")), "nunca force=true");
    const post = ll.find((l) => l.metodo === "POST");
    const cuerpo = JSON.parse(post.cuerpo);
    const nombres = cuerpo.layers.llm.tools.map((t) => t.function.name);
    assert.ok(nombres.includes("mostrar_pantalla"));
    assert.equal(cuerpo.system_prompt, "Eres Verzy");
});

test("misma original: se reutiliza la copia, no se crea otra", async () => {
    const ll = tavus(original, { nuevaId: "otra" });
    assert.equal(await laPersonaParaLaConversacion({ clave: "k", personaId: "p-b" }), "copia-1");
    assert.ok(!ll.some((l) => l.metodo === "POST"));
});

test("la original cambió: copia nueva y la vieja se borra", async () => {
    const ll = tavus({ ...original, system_prompt: "Eres Verzy, versión 2" }, { nuevaId: "copia-2" });
    assert.equal(await laPersonaParaLaConversacion({ clave: "k", personaId: "p-b" }), "copia-2");
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(ll.some((l) => l.metodo === "DELETE" && l.url.endsWith("/copia-1")));
});

test("un fallo nunca tumba la llamada: va la original", async () => {
    globalThis.fetch = async () => new Response("caído", { status: 500 });
    const err = console.error; console.error = () => {};
    try { assert.equal(await laPersonaParaLaConversacion({ clave: "k", personaId: "p-c" }), "p-c"); }
    finally { console.error = err; }
});
