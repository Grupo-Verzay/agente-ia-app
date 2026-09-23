/**
 * La simetría de Chats, sin navegador: la decisión y un barrido del código.
 *
 * La mitad que se mide en píxeles está en `scripts/probar-simetria-de-chats.mjs`
 * (sobre la página servida). Aquí va lo que se contesta leyendo:
 *
 *  - los números: el «+» a la MISMA distancia del filo que de la caja, el pie
 *    fijo con el alto de la barra de escribir;
 *  - el botón de la derecha del copiloto: UNO, micrófono o flecha;
 *  - que las tres barras usen el MISMO marco y la misma fila, y los tres
 *    paneles su pie fijo; los rótulos «Crear»; crear en azul;
 *  - que la puerta del playbook pregunte por la cuenta DUEÑA de la conversación.
 *
 * `MODO=roto` lee los mismos ficheros de `ANTES_REF` con `git show` y AFIRMA el
 * fallo: sin ese modo, lo verde de al lado no diría si el barrido mira.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "c0d2a50";

// La decisión de hoy, o la de ANTES (compilada de `git show`) en el modo roto.
const {
    ALTO_DE_LA_BARRA,
    FILA_DE_LA_BARRA,
    HUECO_DEL_MAS,
    MARCO_DE_LA_BARRA,
    PIE_DEL_PANEL,
    losBotonesDeLaDerecha,
} = await import(ROTO ? "./.compilado/simetria-antes/barra-de-escribir.js" : "./.compilado/simetria/barra-de-escribir.js");

function leer(ruta) {
    if (!ROTO) return fs.readFileSync(ruta, "utf8");
    try {
        return execFileSync("git", ["show", `${ANTES}:${ruta}`], { encoding: "utf8" });
    } catch {
        return "";
    }
}

const REM = 16;
const px = (clase) => {
    // `px-1.5` → 6, `gap-1.5` → 6.
    const m = clase.match(/-(\d+(?:\.\d+)?)$/);
    return m ? Number(m[1]) * 4 : NaN;
};

test("el «+» queda a la MISMA distancia del filo que de la caja, y es la mínima (6 px)", () => {
    if (ROTO) {
        assert.equal(MARCO_DE_LA_BARRA, undefined, "el «antes»: no había un marco común, cada barra el suyo");
        return;
    }
    const relleno = MARCO_DE_LA_BARRA.split(/\s+/).find((c) => c.startsWith("px-"));
    const hueco = FILA_DE_LA_BARRA.split(/\s+/).find((c) => c.startsWith("gap-"));
    assert.equal(px(relleno), HUECO_DEL_MAS, "el relleno lateral del marco");
    assert.equal(px(hueco), HUECO_DEL_MAS, "el hueco entre el «+» y la caja");
    assert.equal(HUECO_DEL_MAS, 6, "el margen de las cabeceras de Chats");
});

test("el pie fijo de un panel mide lo que la barra de escribir", () => {
    if (ROTO) {
        assert.equal(PIE_DEL_PANEL, undefined, "el «antes»: no había pie fijo");
        return;
    }
    // `sm:py-2` (8+8) + la caja en una línea (`min-h-10`, 40) + 1 px de raya.
    const alto = PIE_DEL_PANEL.match(/sm:h-\[calc\((\d+(?:\.\d+)?)rem\+(\d+)px\)\]/);
    assert.ok(alto, "el pie lleva su alto en rem más el píxel de la raya");
    assert.equal(Number(alto[1]) * REM + Number(alto[2]), ALTO_DE_LA_BARRA);
    assert.equal(ALTO_DE_LA_BARRA, 8 + 40 + 8 + 1);
    assert.match(PIE_DEL_PANEL, /\bborder-t\b/, "con su raya encima");
    assert.match(PIE_DEL_PANEL, /\bjustify-between\b/, "Cancelar a la izquierda, la acción a la derecha");
    assert.match(MARCO_DE_LA_BARRA, /\bsm:py-2\b/, "el relleno vertical de la conversación");
});

test("el copiloto: UN botón a la derecha — micrófono vacío, flecha con texto", () => {
    const base = { compacta: true, conVoz: true, conNota: false, hayDictado: true, dictando: false, grabando: false };
    if (ROTO) {
        // El «antes» no sabía de un botón solo: con la caja vacía, el menú de voz.
        assert.deepEqual(losBotonesDeLaDerecha({ ...base, hayAlgoQueEnviar: false }), ["menu"]);
        return;
    }
    assert.deepEqual(losBotonesDeLaDerecha({ ...base, hayAlgoQueEnviar: false }), ["dictado"]);
    assert.deepEqual(losBotonesDeLaDerecha({ ...base, hayAlgoQueEnviar: true }), ["enviar"]);
    // Dictando se queda el de parar (la regla 2 de siempre).
    assert.deepEqual(losBotonesDeLaDerecha({ ...base, dictando: true, hayAlgoQueEnviar: true }), ["dictado"]);
    // Sin dictado en el navegador, la flecha.
    assert.deepEqual(losBotonesDeLaDerecha({ ...base, hayDictado: false, hayAlgoQueEnviar: false }), ["enviar"]);
    // Y las otras dos barras no cambian: sin el campo, lo de siempre.
    const conversacion = { compacta: true, conVoz: true, hayDictado: true, dictando: false, grabando: false, hayAlgoQueEnviar: false };
    assert.deepEqual(losBotonesDeLaDerecha(conversacion), ["menu"]);
});

const BARRAS = [
    "app/(root)/chats/_components/ChatInputBar.tsx",
    "components/chat-equipo/HiloDelEquipo.tsx",
    "app/(root)/ai-chat/components/ChatComposer.tsx",
];

test("las TRES barras usan el mismo marco y la misma fila", () => {
    const sinMarco = BARRAS.filter((f) => !/MARCO_DE_LA_BARRA/.test(leer(f)) || !/FILA_DE_LA_BARRA/.test(leer(f)));
    if (ROTO) {
        assert.deepEqual(sinMarco, BARRAS, "el «antes»: cada barra con su relleno");
        assert.match(leer(BARRAS[1]), /px-3 py-3 sm:px-6/, "la del equipo, con 24 px de aire");
        return;
    }
    assert.deepEqual(sinMarco, []);
});

test("el copiloto: sin sugerencias sueltas ni dos botones a la derecha", () => {
    const composer = leer("app/(root)/ai-chat/components/ChatComposer.tsx");
    const hoja = leer("app/(root)/ai-chat/components/ChatSheet.tsx");
    if (ROTO) {
        assert.match(hoja, /<QuickActions \/>/, "el «antes»: las sugerencias sueltas encima de la caja");
        assert.match(composer, /<Mic /);
        assert.match(composer, /<SendHorizontal /, "y el micrófono y la flecha a la vez");
        return;
    }
    assert.doesNotMatch(hoja, /<QuickActions/);
    assert.match(composer, /conNota: false/);
    assert.match(composer, /<ZonaDeHerramientas[\s\S]*<OpcionesRapidas/);
    assert.match(composer, /<BotonesDeLaDerecha/);
});

test("recordatorio, tarea y contexto: la fila de abajo es el pie FIJO del panel", () => {
    const tarea = leer("app/(root)/chats/_components/TaskFormDialog.tsx");
    const contexto = leer("app/(root)/chats/_components/LeadContextSheet.tsx");
    const recordatorio = leer("app/(root)/chats/_components/ChatReminderDialog.tsx");
    const formulario = leer("app/(root)/reminders/_components/ReminderForm.tsx");
    if (ROTO) {
        assert.doesNotMatch(tarea, /\bpie=\{/, "el «antes»: la fila al final del formulario");
        assert.doesNotMatch(contexto, /\bpie=\{/, "y la del contexto, dentro del playbook");
        assert.doesNotMatch(recordatorio, /\benPanel\b/);
        return;
    }
    assert.match(tarea, /\bpie=\{/);
    assert.match(contexto, /\bpie=\{[\s\S]*No se envía al cliente/);
    assert.match(recordatorio, /\benPanel\b/);
    assert.match(recordatorio, /onCancel=\{\(\) => setOpen\(false\)\}/, "Cancelar cierra el panel");
    assert.match(formulario, /enPanel \? PIE_DEL_PANEL/);
    // Y ya no dentro de la sección del playbook (su fila `border-t pt-2`).
    assert.doesNotMatch(contexto, /border-t pt-2/);
});

test("los botones dicen «Crear», y crear va en AZUL", () => {
    const tarea = leer("app/(root)/chats/_components/TaskFormDialog.tsx");
    const formulario = leer("app/(root)/reminders/_components/ReminderForm.tsx");
    if (ROTO) {
        assert.match(tarea, /"Crear tarea"/, "el «antes»: repetía el título");
        assert.match(formulario, /`Crear \$\{modalTitle\}`/);
        assert.match(formulario, /type="submit" variant="save"/, "y crear el recordatorio iba en VERDE");
        return;
    }
    assert.doesNotMatch(tarea, /"Crear tarea"/);
    assert.doesNotMatch(formulario, /Crear \$\{modalTitle\}/);
    assert.match(formulario, /variant=\{isEdit \? "save" : "default"\}/, "guardar en verde, crear en azul");
});

test("el playbook pregunta por la cuenta DUEÑA de la conversación, no por la de quien mira", () => {
    const acciones = leer("actions/sales-playbook-actions.ts");
    const puntuar = leer("actions/lead-score-action.ts");
    if (ROTO) {
        assert.match(acciones, /where: \{ id: sessionId, userId: ownerId \}/, "el «antes»: solo la cuenta propia");
        assert.match(puntuar, /where: \{ id: sessionId, userId: user\.id \}/);
        return;
    }
    assert.match(acciones, /assertCanAccessTargetUser\(session\.userId\)/);
    assert.match(puntuar, /assertCanAccessTargetUser\(dueno\.userId\)/);
});
