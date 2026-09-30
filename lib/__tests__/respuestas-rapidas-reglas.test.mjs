/**
 * Respuestas Rápidas (`/auto-replies`): las REGLAS de la pantalla y un BARRIDO
 * del código. La mitad contra Postgres —que las acciones de verdad las
 * cumplen— es `respuestas-rapidas-db.test.mjs`.
 *
 * Lo que se arregló, y lo que prueba cada parte:
 *
 * | lo que pasaba | dónde se prueba |
 * | --- | --- |
 * | una respuesta de FLUJO no salía en ningún sitio de Chats | `seOfreceEnChats` y el barrido del arranque de Chats |
 * | en una línea de Waha, una de flujo contestaba «no encontrada» | el barrido de `sendWahaQuickReplyAction` |
 * | el panel de Atajos escondía las que no tienen atajo | el barrido de `ChatAutomationPicker` |
 * | el atajo se guardaba de dos formas («/Hola», «hola») | `comoAtajo`, `elNombreQueSeGuarda` |
 * | la búsqueda no encontraba «Envío» tecleando «envio» | `pasaLaBusqueda` |
 * | con un filtro puesto se reordenaba el trozo y las escondidas saltaban | `porQueNoSePuedeOrdenar` |
 * | un asesor reordenando movía las personales de sus compañeros | `elOrdenConLasDemasEnSuSitio` |
 * | una respuesta nueva nacía empatada con la primera, o perdida | `elOrdenDeUnaNueva` |
 * | las creadas por alguien del equipo no las veía nadie | `elPlanDeLaMudanza` (las ya creadas) y el banco de Postgres |
 *
 * `MODO=roto` lee el código de `ANTES_RR_REF` —pinchado a un commit, nunca
 * `origin/main`— y AFIRMA los fallos del barrido: sin ese modo no se sabría si
 * lo verde es que se arreglaron o que el barrido no mira.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_RR_REF ?? "ab6b110";

const leer = (rel) =>
    ROTO
        ? (() => {
              try {
                  return execSync(`git show ${ANTES}:${JSON.stringify(rel)}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
              } catch {
                  return "";
              }
          })()
        : readFileSync(path.join(RAIZ, rel), "utf8");

const ARRANQUE = "actions/chat-bootstrap-actions.ts";
const WAHA = "actions/waha-chat-actions.ts";
const ATAJOS = "app/(root)/chats/_components/ChatAutomationPicker.tsx";
const ACCIONES = "actions/rr-actions.ts";

/**
 * El código sin sus comentarios. Los arreglos llevan escrito al lado lo que
 * había antes —«el filtro `qr.name !== null` escondía…»—, y buscar sobre el
 * texto crudo haría que la explicación del arreglo tumbara al banco.
 */
const sinComentarios = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** El cuerpo de una función exportada, de su `export` al `export` siguiente. */
function elCuerpo(fuente, nombre) {
    const ini = fuente.indexOf(`export async function ${nombre}(`);
    if (ini < 0) return "";
    const fin = fuente.indexOf("\nexport ", ini + 10);
    return fuente.slice(ini, fin < 0 ? fuente.length : fin);
}

if (ROTO) {
    test("ANTES: una respuesta de FLUJO no llegaba a Chats, ni salía por una línea de Waha", () => {
        const arranque = leer(ARRANQUE);
        assert.ok(arranque.length > 0, `ANTES_RR_REF (${ANTES}) no tiene ${ARRANQUE}`);
        assert.match(arranque, /if \(!message\) return items;/, "el arranque de Chats ya dejaba pasar las de flujo");
        const waha = elCuerpo(leer(WAHA), "sendWahaQuickReplyAction");
        assert.match(waha, /if \(!texto\) return \{ success: false, message: 'Respuesta rápida no encontrada\.' \}/, "Waha ya sabía mandar una de flujo");
        assert.doesNotMatch(waha, /sendManualWorkflowAction\(/, "Waha ya lanzaba el flujo");
    });

    test("ANTES: el panel de Atajos escondía las que no tienen atajo", () => {
        assert.match(leer(ATAJOS), /filteredQuickReplies\.filter\(\(qr\) => qr\.name !== null\)/);
    });

    test("ANTES: crear guardaba la respuesta con el id de quien la creaba, y el orden eran N llamadas", () => {
        const acciones = leer(ACCIONES);
        assert.match(elCuerpo(acciones, "createRR"), /\{ \.\.\.data, userId: cuenta \}/, "createRR ya resolvía la cuenta de la fila");
        assert.ok(elCuerpo(acciones, "updateRROrder"), "no había updateRROrder, una llamada por fila");
        assert.equal(elCuerpo(acciones, "guardarElOrdenDeLasRespuestasAction"), "", "ya se guardaba la lista entera de una vez");
        assert.equal(leer("lib/respuestas-rapidas.ts"), "", "las reglas ya estaban en un sitio");
    });
} else {
    const r = await import(path.join(RAIZ, "lib/__tests__/.compilado/respuestas-rapidas/respuestas-rapidas.js"));
    const { elPlanDeLaMudanza } = await import(path.join(RAIZ, "scripts/mover-respuestas-a-su-cuenta.mjs"));

    test("el tipo lo decide el flujo, y un flujo vacío no es un flujo", () => {
        assert.equal(r.elTipoDeLaRespuesta({ workflowId: "wf1" }), "flujo");
        assert.equal(r.elTipoDeLaRespuesta({ workflowId: "  " }), "texto");
        assert.equal(r.elTipoDeLaRespuesta({ workflowId: null }), "texto");
        assert.equal(r.elTipoDeLaRespuesta({}), "texto");
    });

    test("el atajo se guarda como se teclea en Chats: sin barra, en minúsculas y sin espacios", () => {
        assert.equal(r.comoAtajo("/Bienvenida"), "bienvenida");
        assert.equal(r.comoAtajo("//hola"), "hola");
        assert.equal(r.comoAtajo("Horario de Atencion"), "horariodeatencion");
        assert.equal(r.comoAtajo(null), "");
        assert.equal(r.comoAtajo("x".repeat(80)).length, r.TOPE_DEL_ATAJO);
        // El mismo atajo, venga por la tarjeta o por la ventana de crear, se guarda igual.
        assert.equal(r.elNombreQueSeGuarda("/PRECIOS", "texto"), r.elNombreQueSeGuarda("precios", "texto"));
        // En una de flujo el nombre es libre: solo se recorta.
        assert.equal(r.elNombreQueSeGuarda("  Bienvenida   al cliente ", "flujo"), "Bienvenida al cliente");
        // Vacío es null, no undefined: así se puede QUITAR el atajo.
        assert.equal(r.elNombreQueSeGuarda("   ", "texto"), null);
        assert.equal(r.elNombreQueSeVe("hola", "texto"), "/hola");
        assert.equal(r.elNombreQueSeVe("Medios de pago", "flujo"), "Medios de pago");
        assert.equal(r.elNombreQueSeVe(null, "texto"), null);
    });

    test("Chats ofrece las DOS clases; la barra «/» solo las de texto con atajo", () => {
        assert.equal(r.seOfreceEnChats({ mensaje: null, workflowId: "wf" }), true, "una de flujo no llegaba a Chats");
        assert.equal(r.seOfreceEnChats({ mensaje: "Hola", workflowId: null }), true);
        assert.equal(r.seOfreceEnChats({ mensaje: "  ", workflowId: null }), false);
        const deTexto = { name: "envio", message: "Hacemos envíos", workflowId: null, workflowName: null };
        const deFlujo = { name: "Medios de pago", message: "", workflowId: "wf", workflowName: "Medios de pago" };
        assert.equal(r.seSugiereConLaBarra(deTexto, "env"), true);
        assert.equal(r.seSugiereConLaBarra(deTexto, "/ENV"), true);
        assert.equal(r.seSugiereConLaBarra(deTexto, "pre"), false);
        assert.equal(r.seSugiereConLaBarra(deFlujo, "med"), false, "la barra no puede poner en la caja una de flujo, que no tiene texto");
        assert.equal(r.loQueDiceLaRespuesta(deFlujo), "Ejecuta el flujo «Medios de pago»");
        assert.equal(r.loQueDiceLaRespuesta({ ...deFlujo, workflowName: null }), "Ejecuta un flujo");
        assert.equal(r.loQueDiceLaRespuesta(deTexto), "Hacemos envíos");
    });

    test("la búsqueda no mira tildes ni mayúsculas, y encuentra por el flujo y la categoría", () => {
        const fila = { name: "envio", mensaje: "Hacemos ENVÍOS a Medellín", workflowId: null };
        assert.equal(r.pasaLaBusqueda(fila, "envios", "", "Ventas"), true);
        assert.equal(r.pasaLaBusqueda(fila, "medellin", "", "Ventas"), true);
        assert.equal(r.pasaLaBusqueda(fila, "ventas", "", "Ventas"), true);
        assert.equal(r.pasaLaBusqueda(fila, "reembolso", "", "Ventas"), false);
        assert.equal(r.pasaLaBusqueda({ name: "x", mensaje: null, workflowId: "wf" }, "catalogo", "Catálogo de productos", "General"), true);
        assert.equal(r.pasaLaBusqueda(fila, "   ", "", ""), true);
    });

    test("filtros: tipo y categoría, y las pastillas cuentan la lista ENTERA", () => {
        const filas = [
            { mensaje: "a", workflowId: null, category: "ventas" },
            { mensaje: null, workflowId: "wf", category: "pago" },
            { mensaje: "c", workflowId: null, category: "pago" },
        ];
        assert.deepEqual(r.losNumerosPorTipo(filas), { todas: 3, texto: 2, flujo: 1 });
        assert.equal(r.pasaLosFiltros(filas[1], { tipo: "flujo", categoria: r.TODAS_LAS_CATEGORIAS }, "pago"), true);
        assert.equal(r.pasaLosFiltros(filas[0], { tipo: "flujo", categoria: r.TODAS_LAS_CATEGORIAS }, "ventas"), false);
        assert.equal(r.pasaLosFiltros(filas[2], { tipo: "todas", categoria: "ventas" }, "pago"), false);
    });

    test("con un filtro o una búsqueda puestos no se reordena, y se dice por qué", () => {
        assert.equal(r.porQueNoSePuedeOrdenar(r.SIN_FILTROS), null);
        for (const f of [{ tipo: "flujo" }, { categoria: "ventas" }, { busqueda: "pago" }]) {
            const filtros = { ...r.SIN_FILTROS, ...f };
            assert.equal(r.hayFiltroPuesto(filtros), true);
            assert.match(r.porQueNoSePuedeOrdenar(filtros), /Quita la búsqueda y los filtros/);
        }
        assert.equal(r.hayFiltroPuesto({ ...r.SIN_FILTROS, busqueda: "   " }), false);
    });

    test("ordenar: lo que no se ve se queda en su sitio, y lo ajeno se ignora", () => {
        // Un asesor ve 1, 3 y 5 (no ve 2 ni 4, personales de otro) y pone el 5 primero.
        assert.deepEqual(r.elOrdenConLasDemasEnSuSitio([1, 2, 3, 4, 5], [5, 1, 3]), [5, 2, 1, 4, 3]);
        // Quien manda lo ve todo: el orden es el pedido.
        assert.deepEqual(r.elOrdenConLasDemasEnSuSitio([1, 2, 3], [3, 1, 2]), [3, 1, 2]);
        // Un id de otra cuenta, o repetido, no mueve nada.
        assert.deepEqual(r.elOrdenConLasDemasEnSuSitio([1, 2, 3], [99, 2, 2, 1, 3]), [2, 1, 3]);
    });

    test("una nueva sale la PRIMERA sin mover a las demás", () => {
        assert.equal(r.elOrdenDeUnaNueva([]), 0);
        assert.equal(r.elOrdenDeUnaNueva([0, 1, 2]), -1);
        assert.equal(r.elOrdenDeUnaNueva([-3, 5]), -4);
        assert.equal(r.elOrdenDeUnaNueva([Number.NaN, 2]), 1);
    });

    test("la mudanza de las ya creadas: solo las de una persona, al FINAL de su cuenta, y personal si era un agente", () => {
        const plan = elPlanDeLaMudanza(
            [
                { id: 11, userId: "ana", cuentaId: "casa", rol: "agente", createdAt: "2026-09-02" },
                { id: 10, userId: "yair", cuentaId: "casa", rol: "administrador", createdAt: "2026-09-01" },
                { id: 12, userId: "casa", cuentaId: "casa", rol: null, createdAt: "2026-09-03" },
                { id: 13, userId: "luis", cuentaId: "otra", rol: null, createdAt: "2026-09-04" },
            ],
            new Map([["casa", 7]]),
        );
        assert.deepEqual(plan, [
            { id: 10, de: "yair", a: "casa", orden: 8, personal: null },
            { id: 11, de: "ana", a: "casa", orden: 9, personal: "ana" },
            { id: 13, de: "luis", a: "otra", orden: 0, personal: null },
        ]);
    });

    test("barrido: Chats ofrece las de flujo, Waha las lanza, y el panel de Atajos no esconde las sin atajo", () => {
        assert.match(leer(ARRANQUE), /if \(!seOfreceEnChats\(quickReply\)\) return items;/);
        const waha = elCuerpo(leer(WAHA), "sendWahaQuickReplyAction");
        assert.match(waha, /sendManualWorkflowAction\(/, "Waha no lanza el flujo de una respuesta");
        assert.match(waha, /type: 'intention'/, "Waha no anota la intención y el webhook lo volvería a disparar");
        assert.match(waha, /where: \{ id: flujo, userId: rr\.userId \}/, "el flujo tiene que ser de la misma cuenta que la respuesta");
        assert.doesNotMatch(sinComentarios(leer(ATAJOS)), /qr\.name !== null/);
        // La barra «/», el panel de Atajos y «Nueva conversación» pintan con las mismas reglas.
        for (const f of [ATAJOS, "app/(root)/chats/_components/NewConversationDialog.tsx"]) {
            assert.match(leer(f), /from '@\/lib\/respuestas-rapidas'/, `${f} no pinta con las reglas de lib/respuestas-rapidas`);
        }
    });

    test("barrido: crear sube a la CUENTA, y el orden se guarda de una vez", () => {
        const acciones = leer(ACCIONES);
        const crear = elCuerpo(acciones, "createRR");
        assert.match(crear, /const cuenta = await laCuentaDeLaFila\(alcanzada\);/);
        assert.match(crear, /order: elOrdenDeUnaNueva\(/);
        assert.equal(elCuerpo(acciones, "updateRROrder"), "", "vuelve la llamada por fila");
        assert.match(elCuerpo(acciones, "guardarElOrdenDeLasRespuestasAction"), /UPDATE "rr" AS r SET "order" = v\.o/);
        // El borrado en bloque pasa por deleteRR, con sus puertas, y no lleva copia.
        assert.match(leer("actions/borrado-en-bloque-actions.ts"), /const res = await deleteRR\(Number\(id\)\);/);
    });
}
