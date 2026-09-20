// La llamada de WhatsApp y la reunión de video aguantan al navegar.
//
// El fallo: la tarjeta de llamada (`CallDialog`) sostiene el RTCPeerConnection,
// el micrófono y los relojes, y se montaba DENTRO del chat —la cabecera, una
// fila del CRM, una burbuja—. Cambiar de conversación rehace la cabecera y
// navegar a otra pantalla se lleva el árbol de la ruta entero: en los dos casos
// la tarjeta se desmontaba y su `cleanup` cerraba la conexión. La llamada se
// cortaba a media frase sin que nadie la colgara.
//
// El arreglo: la tarjeta cuelga del LAYOUT (`AnfitrionDeLlamada`), como ya lo
// hacían el timbre del equipo (`OyenteDeLlamadas`) y el panel de una reunión
// (`ReunionEnLaPlataforma`). Un layout no se remonta al navegar entre pantallas
// del mismo grupo, así que lo que cuelga de él sobrevive.
//
// Este banco tiene dos mitades:
//
//   1. RUNTIME (react-test-renderer, sin navegador): monta una llamada y una
//      reunión ACTIVAS y ejercita el cambio de ruta varias veces. Con el host
//      colgando del layout la conexión sobrevive; con el host dentro de la ruta
//      —el modo roto— se corta. Sin el modo roto no se sabe si el verde de al
//      lado prueba el arreglo o un caso que no se ejercía.
//
//   2. CABLEADO (lee el código real): que los cuatro sitios que llamaban dejaron
//      de montar `<CallDialog>` y ahora disparan `abrirLlamadaAqui`, que el
//      layout monta los dos hosts, y que la reunión sigue colgando solo del
//      layout. El runtime prueba el PRINCIPIO; esto prueba que el código real lo
//      cumple.
//
// Correr:  node --test lib/__tests__/llamada-sobrevive-navegacion.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import React from "react";
import TestRenderer from "react-test-renderer";

const { act } = TestRenderer;
const h = React.createElement;

// ── Runtime ─────────────────────────────────────────────────────────────────

/** Un registro de conexiones, como los RTCPeerConnection que se abren. */
function crearRegistro() {
    const vivas = new Set();
    let creadas = 0;
    return {
        nueva(etiqueta) {
            creadas += 1;
            const con = { etiqueta, cerrada: false };
            con.close = () => {
                con.cerrada = true;
                vivas.delete(con);
            };
            vivas.add(con);
            return con;
        },
        get creadas() {
            return creadas;
        },
        get vivas() {
            return vivas.size;
        },
    };
}

/**
 * El contrato de `CallDialog` y de `SalaDeVideo`: al montar/arrancar abre UNA
 * conexión, y en el cleanup de DESMONTAJE la cierra. Un simple re-render del
 * padre (deps sin cambiar) no vuelve a correr el efecto, así que no la toca.
 */
function Host({ registro, etiqueta, refCon }) {
    const conRef = React.useRef(null);
    React.useEffect(() => {
        conRef.current = registro.nueva(etiqueta);
        refCon.actual = conRef.current;
        return () => {
            conRef.current?.close();
            conRef.current = null;
        };
    }, [registro, etiqueta, refCon]);
    return null;
}

/** El layout bueno: el host es HERMANO de la ruta, no vive dentro de ella. */
function LayoutBueno({ children, registro, etiqueta, refCon }) {
    return h(
        React.Fragment,
        null,
        h("div", null, children),
        h(Host, { registro, etiqueta, refCon }),
    );
}

/** Una pantalla cualquiera de la ruta. La `key` la distingue de las demás. */
function pantalla(ruta) {
    return h("div", { key: ruta }, ruta);
}

for (const etiqueta of ["llamada", "reunion"]) {
    test(`la ${etiqueta} activa sobrevive a cambiar de conversación y de pantalla`, () => {
        const registro = crearRegistro();
        const refCon = { actual: null };
        let root;

        act(() => {
            root = TestRenderer.create(
                h(LayoutBueno, { registro, etiqueta, refCon }, pantalla("chatA")),
            );
        });

        const primera = refCon.actual;
        assert.ok(primera, "se abrió la conexión");
        assert.equal(primera.cerrada, false);
        assert.equal(registro.creadas, 1);

        // Cambiar de conversación (chatB, chatC) y de pantalla (clientes, crm,
        // reuniones), varias veces, como pidió el encargo.
        for (const ruta of ["chatB", "clientes", "crm", "chatC", "reuniones", "chatA"]) {
            act(() => {
                root.update(
                    h(LayoutBueno, { registro, etiqueta, refCon }, pantalla(ruta)),
                );
            });
        }

        assert.equal(primera.cerrada, false, "la conexión NO se cortó al navegar");
        assert.equal(registro.creadas, 1, "no se recreó: es la misma conexión");
        assert.equal(registro.vivas, 1);

        // Y al cerrar de verdad —desmontar el host, que es colgar— sí se suelta.
        act(() => root.unmount());
        assert.equal(primera.cerrada, true);
        assert.equal(registro.vivas, 0);
    });
}

test("modo roto: con el host dentro de la ruta, la conexión se corta al navegar", () => {
    const registro = crearRegistro();
    const refCon = { actual: null };
    let root;

    // El host vive DENTRO de la página, como cuando `CallDialog` colgaba de la
    // cabecera del chat.
    const conHost = (ruta) =>
        h("div", { key: ruta }, ruta, h(Host, { registro, etiqueta: "llamada", refCon }));
    const sinHost = (ruta) => h("div", { key: ruta }, ruta);

    act(() => {
        root = TestRenderer.create(h("div", null, conHost("chatA")));
    });
    const primera = refCon.actual;
    assert.ok(primera && !primera.cerrada);

    // Navegar a otra pantalla: la página cambia y el host se va con ella.
    act(() => root.update(h("div", null, sinHost("clientes"))));
    assert.equal(primera.cerrada, true, "el bug reproducido: se cortó al navegar");

    // Y cambiar de conversación (otra página con su propio host) tampoco la
    // conserva: es una conexión nueva, no la de antes.
    act(() => root.update(h("div", null, conHost("chatB"))));
    assert.equal(refCon.actual === primera, false);
    assert.equal(registro.creadas, 2);
});

// ── Cableado del código real ─────────────────────────────────────────────────

const raiz = process.cwd();
const leer = (p) => readFileSync(join(raiz, p), "utf8");

const LAYOUT = "app/(root)/layout.tsx";
const HOST_LLAMADA = "components/chats/AnfitrionDeLlamada.tsx";
// Los cuatro sitios que antes montaban `<CallDialog>` dentro de la ruta.
const SITIOS_DE_LLAMADA = [
    "app/(root)/chats/_components/ChatHeader.tsx",
    "app/(root)/chats/_components/MessageBubble.tsx",
    "app/(root)/crm/dashboard/components/records-table/CrmRecordActionsCell.tsx",
    "app/(root)/crm/llamadas/_components/CallsCrmClient.tsx",
];

test("el layout monta los tres hosts que cuelgan de él", () => {
    const layout = leer(LAYOUT);
    for (const host of ["AnfitrionDeLlamada", "OyenteDeLlamadas", "ReunionEnLaPlataforma"]) {
        assert.match(layout, new RegExp(`<${host}\\s*/?>`), `el layout monta <${host}>`);
        assert.match(layout, new RegExp(`import\\b.*\\b${host}\\b`), `el layout importa ${host}`);
    }
});

test("ningún sitio de la ruta monta ya <CallDialog>: disparan abrirLlamadaAqui", () => {
    for (const p of SITIOS_DE_LLAMADA) {
        const src = leer(p);
        assert.doesNotMatch(src, /<CallDialog\b/, `${p} ya no monta <CallDialog>`);
        assert.match(src, /abrirLlamadaAqui\s*\(/, `${p} dispara abrirLlamadaAqui`);
    }
});

test("solo el anfitrión del layout monta <CallDialog>", () => {
    const host = leer(HOST_LLAMADA);
    assert.match(host, /<CallDialog\b/, "el anfitrión monta la tarjeta");
    // Y el anfitrión lo hace con una `key` que cambia en cada apertura, para que
    // una segunda llamada arranque de cero.
    assert.match(host, /key=\{[^}]*nonce/, "la tarjeta se remonta por nonce");
});

test("la reunión sigue colgando solo del layout, no de una ruta", () => {
    // `<SalaDeVideo>` (la conexión de la reunión) se monta únicamente desde
    // `LaReunion`, que a su vez cuelga de `ReunionEnLaPlataforma` en el layout.
    assert.match(leer("components/video/LaReunion.tsx"), /<SalaDeVideo\b/);
    assert.match(leer("components/video/ReunionEnLaPlataforma.tsx"), /<LaReunion\b/);
    // La pantalla de Reuniones abre por evento, no montando el panel.
    const reuniones = leer("app/(root)/reuniones/_components/ReunionesClient.tsx");
    assert.doesNotMatch(reuniones, /<ReunionEnLaPlataforma\b/);
    assert.match(reuniones, /abrirLaReunionAqui\s*\(/);
});
