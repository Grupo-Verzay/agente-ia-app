/**
 * Las reglas de Mis macros, sin base ni navegador, y un barrido del código.
 *
 * La mitad pura (`lib/macros.ts`) decide qué le falta a cada acción, por qué
 * línea sale lo que envía, qué dice el aviso al correrla y qué enseña la lista.
 * El barrido comprueba que la pantalla, el menú de Chats y la acción la USAN:
 * con la regla bien escrita y la pantalla preguntando otra cosa, el fallo
 * seguiría ahí.
 *
 * `MODO=roto` lee los mismos ficheros de `ANTES_REF` —pinchado a un commit,
 * nunca `origin/main`— y AFIRMA el fallo: no había reglas, la lista escribía
 * «acciónes» y «ejecuciónes», lo que enviaba salía siempre por Evolution y el
 * chat no le decía a la macro por qué línea responder.
 *
 * Se levanta con `scripts/banco-macros.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_MACROS_REF || "ab6b110";

const leer = (ruta) =>
    ROTO
        ? (() => {
              try {
                  return execFileSync("git", ["show", `${ANTES}:${ruta}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
              } catch {
                  return null;
              }
          })()
        : existsSync(ruta)
          ? readFileSync(ruta, "utf8")
          : null;

/** La llamada a `executeMacroAction({ … })` del chat, y nada más del fichero. */
const laLlamadaALaMacro = (s) => {
    const i = s.indexOf("executeMacroAction({");
    assert.ok(i >= 0, "el chat llama a executeMacroAction");
    return s.slice(i, s.indexOf("});", i));
};

const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const PANTALLA = "app/(root)/macros/_components/MacrosManager.tsx";
const MENU = "app/(root)/chats/_components/MacrosMenu.tsx";
const CHAT = "app/(root)/chats/_components/chat-main.tsx";
const ACCION = "actions/macro-actions.ts";

if (ROTO) {
    test("ANTES: las reglas de las macros no existían", () => {
        assert.equal(leer("lib/macros.ts"), null);
    });

    test("ANTES: la lista escribía «acciónes» y «ejecuciónes»", () => {
        const p = leer(PANTALLA);
        assert.match(p, /acción\{macro\.actions\.length === 1 \? '' : 'es'\}/);
        assert.match(p, /ejecución\$\{macro\.runCount === 1 \? '' : 'es'\}/);
    });

    test("ANTES: lo que envía salía siempre por Evolution, y un envío sin contexto se saltaba", () => {
        const a = sinComentarios(leer(ACCION));
        assert.doesNotMatch(a, /sendWahaTextAction/);
        assert.match(a, /if \(context && remoteJid && cfg\.text\)/);
        assert.match(a, /applied\+\+/);
    });

    test("ANTES: el chat solo le daba a la macro la línea si tenía clave de Evolution", () => {
        const c = laLlamadaALaMacro(leer(CHAT));
        assert.match(c, /info\?\.apiKeyData && info\?\.instanceName/);
        assert.doesNotMatch(c, /instanceName: info\?\.instanceName \?\? null/);
    });

    test("ANTES: el menú del chat se quedaba abierto después de lanzar la macro", () => {
        const m = sinComentarios(leer(MENU));
        assert.doesNotMatch(m, /open=\{abierto\}/);
        assert.match(m, /e\.preventDefault\(\)/);
    });
} else {
    const r = await import("./.compilado/macros/macros.mjs");

    test("las acciones: quince, en cinco grupos, cada una con su nombre y ninguna dos veces", () => {
        assert.equal(r.ORDEN_DE_ACCIONES.length, 15);
        assert.equal(new Set(r.ORDEN_DE_ACCIONES).size, 15);
        assert.deepEqual(r.GRUPOS_DE_ACCIONES.map((g) => g.grupo), ["Responder", "Clasificar", "Enrutar", "Interno", "Control"]);
        for (const t of r.ORDEN_DE_ACCIONES) assert.ok(r.ETIQUETA_DE_ACCION[t], `${t} tiene nombre`);
        assert.deepEqual(Object.keys(r.ETIQUETA_DE_ACCION).sort(), [...r.ORDEN_DE_ACCIONES].sort());
        // Las que envían son exactamente el grupo «Responder».
        assert.deepEqual([...r.ACCIONES_QUE_ENVIAN].sort(), [...r.GRUPOS_DE_ACCIONES[0].tipos].sort());
    });

    test("qué le falta a cada acción: la misma pregunta al guardar y al correr", () => {
        const f = (type, config) => r.porQueNoEstaLista({ type, config });
        assert.equal(f("SEND_TEXT", { text: "" }), "Escribe el mensaje.");
        assert.equal(f("SEND_TEXT", { text: "   " }), "Escribe el mensaje.", "espacios no son un mensaje");
        assert.equal(f("SEND_TEXT", { text: "Hola" }), null);
        assert.equal(f("SEND_TEXT_VIA", { text: "Hola" }), "Elige la línea por la que sale.");
        assert.equal(f("SEND_TEXT_VIA", { instanceName: "L", viaMode: "template" }), "Elige la plantilla de Meta.");
        assert.equal(f("SEND_TEXT_VIA", { instanceName: "L", viaMode: "template", templateName: "hola" }), null);
        assert.equal(f("SEND_FILE", {}), "Sube un archivo o graba una nota de voz.");
        assert.equal(f("SEND_QUICK_REPLY", { quickReplyId: 0 }), "Elige la respuesta rápida.");
        assert.equal(f("EXECUTE_FLOW", {}), "Elige el flujo.");
        assert.equal(f("ADD_TAG", {}), "Elige la etiqueta.");
        assert.equal(f("REMOVE_TAG", { tagId: 3 }), null);
        assert.equal(f("CHANGE_STAGE", { stage: "INVENTADA" }), "Elige la calificación.");
        assert.equal(f("CHANGE_STAGE", { stage: "CALIENTE" }), null);
        assert.equal(f("ASSIGN_ADVISOR", {}), "Elige el asesor.");
        assert.equal(f("CREATE_TASK", { advisorId: "a" }), "Escribe el título de la tarea.");
        assert.equal(f("CREATE_TASK", { taskTitle: "Llamar" }), "Elige el responsable de la tarea.");
        assert.equal(f("INTERNAL_NOTE", { content: "" }), "Escribe la nota.");
        assert.equal(f("TOGGLE_AI", {}), null);
        assert.equal(f("RESOLVE"), null);
        assert.equal(f("NO_EXISTE", {}), "Esta acción no existe.");
    });

    test("la pausa: la que enseña el campo es la que se cumple, y con tope", () => {
        assert.equal(r.losSegundosDeLaEspera({}), r.SEGUNDOS_POR_DEFECTO);
        assert.equal(r.losSegundosDeLaEspera(undefined), 2);
        assert.equal(r.losSegundosDeLaEspera({ seconds: 5 }), 5);
        assert.equal(r.SEGUNDOS_MAXIMOS_DE_ESPERA, 20);
        assert.equal(r.porQueNoEstaLista({ type: "WAIT", config: {} }), null);
        assert.match(r.porQueNoEstaLista({ type: "WAIT", config: { seconds: 21 } }), /1 a 20/);
        assert.match(r.porQueNoEstaLista({ type: "WAIT", config: { seconds: 0 } }), /1 a 20/);
    });

    test("las calificaciones son las cinco de las pastillas de Chats", () => {
        assert.deepEqual([...r.CALIFICACIONES_CONOCIDAS], ["FRIO", "TIBIO", "CALIENTE", "FINALIZADO", "DESCARTADO"]);
    });

    test("qué impide guardar una macro, con el número de la acción", () => {
        assert.deepEqual(r.losProblemasDeLaMacro({ name: "", actions: [] }), ["Ponle un nombre a la macro.", "Agrega al menos una acción."]);
        assert.deepEqual(
            r.losProblemasDeLaMacro({ name: "X", actions: [{ type: "RESOLVE" }, { type: "ADD_TAG", config: {} }] }),
            ["Acción 2 (Agregar etiqueta): Elige la etiqueta."],
        );
        assert.deepEqual(r.losProblemasDeLaMacro({ name: "X", actions: [{ type: "RESOLVE" }] }), []);
    });

    test("por qué proveedor sale lo que envía, según la línea", () => {
        assert.equal(r.elProveedorDeLaLinea("waha"), "waha");
        assert.equal(r.elProveedorDeLaLinea("WAHA"), "waha");
        assert.equal(r.elProveedorDeLaLinea("meta"), "canal");
        assert.equal(r.elProveedorDeLaLinea("telegram"), "canal");
        assert.equal(r.elProveedorDeLaLinea("Whatsapp"), "evolution");
        assert.equal(r.elProveedorDeLaLinea(null), "evolution", "las líneas antiguas sin tipo son de Evolution");
    });

    test("«Enviar por otra línea» ofrece las de WhatsApp en sus cuatro formas, y nada más", () => {
        for (const t of [null, "", "Whatsapp", "evolution", "waha", "meta"]) assert.equal(r.seOfreceParaEnviarPorOtraLinea(t), true, String(t));
        for (const t of ["telegram", "facebook", "instagram"]) assert.equal(r.seOfreceParaEnviarPorOtraLinea(t), false, t);
    });

    test("el aviso nunca dice «aplicada» si algo falló, y nombra lo que no salió", () => {
        assert.deepEqual(r.elResumenDeLaEjecucion([]), { tono: "error", mensaje: "La macro no tiene acciones." });
        assert.deepEqual(r.elResumenDeLaEjecucion([{ tipo: "RESOLVE", ok: true }]), { tono: "ok", mensaje: "Macro aplicada: 1 acción." });
        assert.equal(r.elResumenDeLaEjecucion([{ tipo: "RESOLVE", ok: true }, { tipo: "ADD_TAG", ok: true }]).mensaje, "Macro aplicada: 2 acciones.");
        const parcial = r.elResumenDeLaEjecucion([{ tipo: "RESOLVE", ok: true }, { tipo: "SEND_TEXT", ok: false, motivo: "sin línea" }]);
        assert.equal(parcial.tono, "parcial");
        assert.equal(parcial.mensaje, "Se aplicaron 1 de 2 acciones. No se pudo «Enviar mensaje»: sin línea");
        const nada = r.elResumenDeLaEjecucion([{ tipo: "SEND_TEXT", ok: false }]);
        assert.equal(nada.tono, "error");
        assert.doesNotMatch(nada.mensaje, /aplicada/i);
    });

    test("lo que dice una fila: «acciones» y «ejecuciones», nunca «acciónes»", () => {
        assert.equal(r.elDetalleDeLaFila({ acciones: 1, ejecuciones: 0, activa: true }), "1 acción");
        assert.equal(r.elDetalleDeLaFila({ acciones: 5, ejecuciones: 23, activa: true }), "5 acciones · 23 ejecuciones");
        assert.equal(r.elDetalleDeLaFila({ acciones: 2, ejecuciones: 1, activa: false }), "2 acciones · 1 ejecución · Inactiva");
        for (let a = 0; a < 4; a++) for (let e = 0; e < 4; e++) assert.doesNotMatch(r.elDetalleDeLaFila({ acciones: a, ejecuciones: e, activa: true }), /ónes/);
    });

    test("la lista: buscar sin acentos, filtrar, contar y cuándo se puede reordenar", () => {
        const ms = [
            { name: "Cotización enviada", enabled: true },
            { name: "Pasar a soporte", enabled: false },
            { name: "Cierre", enabled: true },
        ];
        assert.deepEqual(r.lasMacrosQueSeVen(ms, "cotizacion", "todas").map((m) => m.name), ["Cotización enviada"]);
        assert.deepEqual(r.lasMacrosQueSeVen(ms, "", "inactivas").map((m) => m.name), ["Pasar a soporte"]);
        assert.deepEqual(r.lasMacrosQueSeVen(ms, "", "activas").length, 2);
        // Los números de las pastillas son de la lista entera, no del filtro.
        assert.deepEqual(r.losConteosDeMacros(ms), { todas: 3, activas: 2, inactivas: 1 });
        assert.equal(r.sePuedeReordenar("", "todas"), true);
        assert.equal(r.sePuedeReordenar("cie", "todas"), false);
        assert.equal(r.sePuedeReordenar("", "activas"), false);
        assert.match(r.elMensajeDeLaListaVacia(0, "", "todas"), /Nuevo/);
        assert.match(r.elMensajeDeLaListaVacia(3, "zz", "todas"), /«zz»/);
        assert.equal(r.elMensajeDeLaListaVacia(3, "", "inactivas"), "No tienes macros inactivas.");
    });

    test("el menú del chat vacío dice por qué: sin macros, o todas desactivadas", () => {
        assert.equal(r.elMensajeDelMenuDelChat(3, 2), null);
        assert.match(r.elMensajeDelMenuDelChat(0, 0), /No tienes macros aún/);
        assert.match(r.elMensajeDelMenuDelChat(3, 0), /desactivadas/);
    });

    test("la pantalla usa las reglas y no las vuelve a escribir", () => {
        const p = sinComentarios(leer(PANTALLA));
        assert.match(p, /elDetalleDeLaFila\(/);
        assert.doesNotMatch(p, /'es'/, "ningún plural pegando «es» a mano");
        assert.match(p, /losProblemasDeLaMacro\(/);
        assert.match(p, /GRUPOS_DE_ACCIONES\.map/);
        assert.match(p, /ETIQUETA_DE_ACCION\[/);
        assert.match(p, /lasMacrosQueSeVen\(/);
        assert.match(p, /losConteosDeMacros\(/);
        assert.match(p, /sePuedeReordenar\(/);
        assert.doesNotMatch(p, /type MacroActionType\s*=/, "los tipos viven en lib/macros.ts");
    });

    test("el chat le dice a la macro la línea de la conversación, sea del proveedor que sea", () => {
        const todo = sinComentarios(leer(CHAT));
        const c = laLlamadaALaMacro(todo);
        assert.match(c, /instanceName: info\?\.instanceName \?\? null/);
        assert.doesNotMatch(c, /apiKeyData/);
        assert.match(todo, /res\.tono === 'ok'/);
        assert.match(todo, /res\.tono === 'parcial'/);
    });

    test("el menú del chat: lo vacío dice por qué, el nombre largo se lee entero y se cierra al terminar", () => {
        const m = sinComentarios(leer(MENU));
        assert.match(m, /elMensajeDelMenuDelChat\(/);
        assert.match(m, /title=\{m\.name\}/);
        assert.match(m, /open=\{abierto\}/);
        assert.match(m, /finally \{[^}]*setAbierto\(false\)/);
    });

    test("la acción: pasa por el proveedor de la línea, cuenta lo que falla y valida al guardar", () => {
        const a = sinComentarios(leer(ACCION));
        for (const fn of ["sendWahaTextAction", "sendWahaQuickReplyAction", "sendWahaWorkflowAction", "sendChannelQuickReplyAction", "sendChannelWorkflowAction"]) {
            assert.match(a, new RegExp(`${fn}\\(`), fn);
        }
        assert.match(a, /elProveedorDeLaLinea\(/);
        assert.match(a, /porQueNoEstaLista\(a\)/);
        assert.match(a, /elResumenDeLaEjecucion\(resultados\)/);
        assert.doesNotMatch(a, /applied\+\+/, "ya no se cuenta a ciegas");
        assert.equal((a.match(/losProblemasDeLaMacro\(/g) ?? []).length, 2, "crear y editar");
        assert.match(a, /seOfreceParaEnviarPorOtraLinea\(/);
        assert.match(a, /nombreDeLaCuenta\(/);
        // La clave de Evolution nunca viaja desde aquí: la pone el servidor.
        // (el tipo de `ChatCtx` la nombra; ninguna llamada la pasa).
        assert.doesNotMatch(a, /apiKeyData: (?!null|\{ url: string)/);
    });
}
