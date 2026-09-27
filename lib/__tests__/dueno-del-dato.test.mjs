// Barrido: cada acción de los ficheros que cierra el «dueño del dato» pasa por
// una puerta, o está en SIN_GUARDA con su motivo escrito al lado.
//
// Es la misma idea que `guardas-de-las-acciones.test.mjs`: el fallo de esta
// familia no es que la guarda esté mal escrita, es que **a una hermana se le
// pasa**. Aquí se le había pasado a más de la mitad del fichero de pasos de un
// flujo, y a quince de diecisiete funciones del editor del agente.
//
// `MODO=roto` lee los MISMOS ficheros del commit de antes (`ANTES_REF`, que
// pone `scripts/banco-dueno-del-dato.sh`) y AFIRMA los huecos: sin ese modo, lo
// verde de al lado no diría si el barrido mira.
//
// Se ejecuta con: node --test lib/__tests__/dueno-del-dato.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "7575f8a";

/** Las puertas que cuentan: las de siempre, más las que saca el dueño de la fila. */
const PUERTAS = [
    "laCuentaDeLaAccion",
    "exigirLaCuentaDeLaAccion",
    "assertCanAccessTargetUser",
    "assertUserCanUseApp",
    "laCuentaDeLaConversacion",
    "laCuentaDelFlujo",
    "laCuentaDelNodo",
    "laCuentaDelEntrenamiento",
    "laCuentaDelMensaje",
    "exigirElEntrenamiento",
    "exigirLaCuenta",
    "ensureAuthorizedSessionById",
    "ensureAuthorizedRegistroById",
    "puedeCerrarOReabrir",
];

const FICHEROS = [
    "actions/internal-notes-actions.ts",
    "actions/collab-actions.ts",
    "actions/advisor-assign-actions.ts",
    "actions/registro-action.ts",
    "actions/ai-actions.ts",
    "actions/system-prompt-actions.ts",
    "actions/apply-template-action.ts",
    "actions/workflow-node-action.ts",
    "actions/workflow-actions.ts",
];

/** Lo que se queda sin puerta de alcance, y por qué. */
const SIN_GUARDA = {
    getSessionIdsWithNotesAction:
        "no recibe ningún id: filtra por la cuenta de la sesión (`session.userId = user.id`)",
    deleteInternalNoteAction:
        "solo borra si quien llama es el AUTOR de la nota (identidad, no alcance)",
    getCollabNotificationsAction: "no recibe ningún id: lee las de la persona que llama",
    markCollabNotificationReadAction: "acota por `recipientId` = la persona que llama",
    markAllCollabNotificationsReadAction: "acota por `recipientId` = la persona que llama",
    releaseSession: "solo suelta lo que tiene asignado la persona que llama (identidad)",
    transferSession:
        "solo transfiere lo que tiene asignado quien llama, y el destino pasa por esGenteQueAlcanzo",
    bulkAutoAssign: "no recibe cuenta: reparte la del dueño que llama (`user.id` sin ownerId)",
    resolverSesionesAction: "llama a resolveSession una a una, que pasa por puedeCerrarOReabrir",
    getPromptAssistence: "no recibe ningún id: lee el FAQ de la plataforma para el asistente",
    createWorkflow: "no recibe cuenta: crea bajo la de quien llama (`user.id`)",
    getWorkFlowByUserIds: "filtra cada cuenta pedida con laCuentaDeLaAccion dentro de un bucle",
    getExecutionNodesForWorkflow:
        "ayudante interno: lo llama sendManualWorkflowAction, que ya comprobó el flujo y su línea",
};

function accionesDe(src) {
    const marcas = [];
    const re = /export\s+(?:async\s+function\s+(\w+)|const\s+(\w+)\s*=\s*async)/g;
    let m;
    while ((m = re.exec(src))) marcas.push({ nombre: m[1] || m[2], desde: m.index });
    return marcas.map((marca, i) => ({
        nombre: marca.nombre,
        cuerpo: src.slice(marca.desde, marcas[i + 1]?.desde ?? src.length),
    }));
}

function leer(fichero) {
    if (!ROTO) return readFileSync(new URL(`../../${fichero}`, import.meta.url), "utf8");
    return execFileSync("git", ["show", `${ANTES_REF}:${fichero}`], { encoding: "utf8" });
}

function abiertas() {
    const fuera = [];
    for (const fichero of FICHEROS) {
        for (const { nombre, cuerpo } of accionesDe(leer(fichero))) {
            if (PUERTAS.some((p) => cuerpo.includes(`${p}(`))) continue;
            if (nombre in SIN_GUARDA) continue;
            fuera.push(`${fichero} :: ${nombre}`);
        }
    }
    return fuera;
}

test("cada acción pasa por una puerta, o dice por qué no", () => {
    const fuera = abiertas();
    if (ROTO) {
        // Los huecos del encargo, uno por familia. Si alguno de estos dejara de
        // salir aquí, el modo roto ya no estaría ejerciendo el fallo.
        for (const hueco of [
            "actions/internal-notes-actions.ts :: getInternalNotesBySessionAction",
            "actions/collab-actions.ts :: getSessionParticipantsAction",
            "actions/advisor-assign-actions.ts :: takeSession",
            "actions/advisor-assign-actions.ts :: assignSessionToAdvisor",
            "actions/registro-action.ts :: getRegistrosBySessionId",
            "actions/ai-actions.ts :: updatePromptAi",
            "actions/system-prompt-actions.ts :: restoreRevision",
            "actions/system-prompt-actions.ts :: publishPrompt",
            "actions/apply-template-action.ts :: applyTemplateToPrompt",
            "actions/workflow-node-action.ts :: updateNode",
            "actions/workflow-node-action.ts :: deleteAllNodes",
            "actions/workflow-actions.ts :: deleteEntireWorkflow",
        ]) {
            assert.ok(fuera.includes(hueco), `antes: ${hueco} no tenía puerta`);
        }
        return;
    }
    assert.deepEqual(fuera, [], `sin puerta y sin motivo:\n  ${fuera.join("\n  ")}`);
});

test("ninguna exclusión se cuela sin motivo", () => {
    for (const [nombre, motivo] of Object.entries(SIN_GUARDA)) {
        assert.ok(typeof motivo === "string" && motivo.trim().length > 20, `${nombre} no explica por qué`);
    }
});

test("borrar un flujo entero comprueba el dueño ANTES de vaciarlo", () => {
    const src = leer("actions/workflow-actions.ts");
    const cuerpo = accionesDe(src).find((a) => a.nombre === "deleteEntireWorkflow").cuerpo;
    const puerta = cuerpo.indexOf("laCuentaDelFlujo(");
    const vaciar = cuerpo.indexOf("deleteAllNodes(");
    if (ROTO) return assert.equal(puerta, -1, "antes: no había puerta antes de vaciar");
    assert.ok(puerta > -1 && puerta < vaciar, "la puerta va antes de deleteAllNodes");
    assert.ok(puerta < cuerpo.indexOf("deleteFileNode("), "y antes de borrar los archivos");
});

test("los caminos sin sesión no pasan por las acciones con puerta", () => {
    if (ROTO) return;
    // La reserva pública y el modo dueño por WhatsApp no tienen sesión: si
    // volvieran a llamar a las acciones, esta puerta los apagaría en silencio.
    const agenda = readFileSync(new URL("../../actions/appointments-actions.ts", import.meta.url), "utf8");
    assert.ok(!/\bregisterSession\(/.test(agenda), "createAppointment crea su lead sin puerta");
    const reserva = readFileSync(new URL("../../app/schedule/_components/SchedulePageClient.tsx", import.meta.url), "utf8");
    assert.ok(!/\bregisterSession\(/.test(reserva), "la página pública no llama a registerSession");
    const dueno = readFileSync(new URL("../../lib/owner-commands.ts", import.meta.url), "utf8");
    assert.ok(!dueno.includes("addTagsToSessionAction("), "el modo dueño etiqueta sin puerta");
    const entrenamiento = readFileSync(new URL("../../lib/owner-training.ts", import.meta.url), "utf8");
    assert.ok(!entrenamiento.includes("@/actions/system-prompt-actions"), "el modo dueño entrena sin puerta");
});
