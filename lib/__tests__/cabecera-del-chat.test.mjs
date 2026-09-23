/**
 * La cabecera de la conversación y el «Contexto del lead»: la DECISIÓN y un
 * BARRIDO del código, sin navegador.
 *
 * - `repartirLasPestanas`: qué pestañas caben y cuáles van a «Más».
 * - `comoSeGuardaLaSintesis`: el mismo comportamiento que tenía la ventana
 *   emergente que se quitó.
 * - Y el código real: el icono de Síntesis ya no está en la barra, Macros y
 *   Acciones viven en una caja `shrink-0` aparte de las pestañas, y el panel
 *   pinta sus bloques en el orden pedido y sin el texto de más.
 *
 * `MODO=roto` lee los ficheros de ANTES_REF y AFIRMA los fallos del encargo.
 * Se levanta con `scripts/banco-cabecera-del-chat.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { repartirLasPestanas } from "./.compilado/pestanas-del-chat.js";
import { comoSeGuardaLaSintesis, ORDEN_DEL_CONTEXTO } from "./.compilado/sintesis-del-lead.js";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "22dd27b";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CABECERA = "app/(root)/chats/_components/ChatHeader.tsx";
const CONTEXTO = "app/(root)/chats/_components/LeadContextSheet.tsx";

function leer(fichero) {
    if (!ROTO) return fs.readFileSync(join(RAIZ, fichero), "utf8");
    return execFileSync("git", ["show", `${ANTES_REF}:${fichero}`], { cwd: RAIZ, encoding: "utf8" });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. La decisión
// ─────────────────────────────────────────────────────────────────────────────

const IDS = ["messages", "notes", "sheets", "copiloto", "web"];
const ANCHOS = [96, 72, 76, 88, 60]; // 392 en total

test("pestañas: si caben todas, no hay «Más»", () => {
    const r = repartirLasPestanas(IDS, ANCHOS, "messages", 392, 64);
    assert.deepEqual(r, { visibles: IDS, enMenu: [] });
});

test("pestañas: si no caben, entran las que quepan con el «Más» reservado", () => {
    const r = repartirLasPestanas(IDS, ANCHOS, "messages", 300, 64);
    // 300 - 64 = 236 → 96 + 72 = 168, + 76 = 244 no cabe.
    assert.deepEqual(r.visibles, ["messages", "notes"]);
    assert.deepEqual(r.enMenu, ["sheets", "copiloto", "web"]);
});

test("pestañas: la ACTIVA se ve siempre, aunque le toque plegarse", () => {
    const r = repartirLasPestanas(IDS, ANCHOS, "web", 300, 64);
    assert.ok(r.visibles.includes("web"), `la abierta tiene que verse: ${r.visibles}`);
    assert.ok(!r.enMenu.includes("web"));
    // Y el orden se conserva.
    assert.deepEqual(r.visibles, ["messages", "notes", "web"]);
    assert.deepEqual(r.enMenu, ["sheets", "copiloto"]);
});

test("pestañas: la activa entra quitando las últimas que hagan falta", () => {
    // 200 - 64 = 136 → solo cabe Mensajes (96); Copiloto (88) la desplaza.
    const r = repartirLasPestanas(IDS, ANCHOS, "copiloto", 200, 64);
    assert.deepEqual(r.visibles, ["copiloto"]);
    assert.deepEqual(r.enMenu, ["messages", "notes", "sheets", "web"]);
});

test("pestañas: sin medidas no se decide nada — se devuelven todas", () => {
    for (const [disp, anchos] of [
        [0, ANCHOS],
        [NaN, ANCHOS],
        [300, [96, 72, NaN, 88, 60]],
        [300, [96, 72]],
    ]) {
        assert.deepEqual(repartirLasPestanas(IDS, anchos, "messages", disp, 64), { visibles: IDS, enMenu: [] });
    }
});

test("pestañas: ninguna se pierde ni se repite", () => {
    for (let d = 40; d <= 460; d += 7) {
        for (const activa of IDS) {
            const r = repartirLasPestanas(IDS, ANCHOS, activa, d, 64);
            assert.deepEqual([...r.visibles, ...r.enMenu].sort(), [...IDS].sort(), `a ${d} con ${activa}`);
            assert.ok(r.visibles.includes(activa), `a ${d} la activa ${activa} no se ve`);
        }
    }
});

test("síntesis: con seguimiento se ACTUALIZA el suyo; sin él se CREA; vacía no se guarda", () => {
    assert.deepEqual(comoSeGuardaLaSintesis("fu-1", "Hola"), { accion: "actualizar", followUpId: "fu-1", texto: "Hola" });
    assert.deepEqual(comoSeGuardaLaSintesis(null, "Hola"), { accion: "crear", texto: "Hola" });
    assert.deepEqual(comoSeGuardaLaSintesis(undefined, "Hola"), { accion: "crear", texto: "Hola" });
    assert.deepEqual(comoSeGuardaLaSintesis("fu-1", "   "), { accion: "nada" });
    assert.deepEqual(comoSeGuardaLaSintesis(null, ""), { accion: "nada" });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. El barrido del código real
// ─────────────────────────────────────────────────────────────────────────────

test("el icono de Síntesis ya no está en la barra, y su ventana no existe", () => {
    const cab = leer(CABECERA);
    const usa = /<SintesisEditDialog\b/.test(cab);
    if (ROTO) {
        assert.ok(usa, "el «antes» pintaba el icono de Síntesis en la barra");
        return;
    }
    assert.ok(!usa, "la cabecera no puede volver a pintar SintesisEditDialog");
    assert.ok(
        !fs.existsSync(join(RAIZ, "app/(root)/chats/_components/SintesisEditDialog.tsx")),
        "la ventana emergente se fue con su icono",
    );
    // Y el contexto del lead —donde vive ahora la síntesis— sale en las dos
    // filas: sin él en el móvil, la síntesis quedaría sin forma de verse ahí.
    assert.equal((cab.match(/<LeadContextSheet\b/g) ?? []).length, 2, "el Contexto del lead en el móvil y en escritorio");
});

test("Macros y Acciones viven en su propia caja shrink-0, fuera de la de las pestañas", () => {
    const cab = leer(CABECERA);
    if (ROTO) {
        // El «antes»: una sola caja con desplazamiento, y Macros y Acciones al
        // final de ella.
        const fila = cab.slice(cab.indexOf("Fila 2: tabs"));
        assert.ok(/overflow-x-auto[\s\S]*?\{macrosMenu\}[\s\S]*?\{lifecycleButton\}/.test(fila));
        return;
    }
    const a = cab.indexOf("data-fila-de-pestanas");
    assert.ok(a > 0, "falta la fila de pestañas de escritorio");
    const fila = cab.slice(a, cab.indexOf("end desktop flex-col"));
    assert.ok(!/overflow-x-auto/.test(fila), "la fila no puede volver a desplazarse entera");
    assert.ok(/<PestanasDelChat\b/.test(fila), "las pestañas van por PestanasDelChat");
    const mandos = /data-mandos-de-la-fila className=(?:\{cn\('([^']+)'|"([^"]+)")/.exec(fila);
    assert.ok(mandos && /\bshrink-0\b/.test(mandos[1] ?? mandos[2]), "los mandos van shrink-0");
    assert.ok(fila.indexOf("{macrosMenu}") > fila.indexOf("data-mandos-de-la-fila"), "Macros dentro de los mandos");
    assert.ok(fila.indexOf("{lifecycleButton}") > fila.indexOf("data-mandos-de-la-fila"), "Acciones dentro de los mandos");
});

test("el panel pinta sus bloques en el orden pedido", () => {
    const ctx = leer(CONTEXTO);
    const titulos = ["Puntuación IA", "Estado del lead", "Etiquetas", "Follow-ups pendientes", "Síntesis IA", "Playbook de venta"];
    const pos = titulos.map((t) => ctx.indexOf(`${t}\n`) >= 0 ? ctx.indexOf(`${t}\n`) : ctx.indexOf(t));
    const ordenado = pos.every((p, i) => i === 0 || p > pos[i - 1]);
    if (ROTO) {
        assert.ok(!ordenado, "el «antes» tenía el Playbook en medio y las etiquetas al final");
        return;
    }
    assert.ok(ordenado, `los bloques no siguen el orden: ${pos}`);
    const marcas = [...ctx.matchAll(/data-bloque="(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(marcas, [...ORDEN_DEL_CONTEXTO]);
});

test("los tres de arriba en formato directo: sin párrafo del estado ni «pendiente» repetido", () => {
    const ctx = leer(CONTEXTO);
    const conParrafo = /session\.leadStatusReason/.test(ctx);
    const repite = /pendiente\{pendingFollowUps/.test(ctx);
    if (ROTO) {
        assert.ok(conParrafo, "el «antes» pintaba el porqué del estado");
        assert.ok(repite, "el «antes» repetía «N pendientes» bajo el título");
        return;
    }
    assert.ok(!conParrafo, "el estado va sin su párrafo explicativo");
    assert.ok(!repite, "los follow-ups van con el número a la derecha del título, sin repetir «pendiente»");
});

test("la síntesis se guarda desde el panel, por las mismas acciones que la ventana", () => {
    const ctx = leer(CONTEXTO);
    const guarda = /updateFollowUpSummarySnapshot/.test(ctx) && /createManualSynthesis/.test(ctx);
    if (ROTO) {
        assert.ok(!guarda, "el «antes» solo la leía");
        return;
    }
    assert.ok(guarda, "el panel actualiza o crea la síntesis");
    assert.ok(/comoSeGuardaLaSintesis\(/.test(ctx), "y decide con la función pura, no con su propia condición");
    assert.ok(!/<Dialog\b/.test(ctx), "sin ventana emergente");
});
