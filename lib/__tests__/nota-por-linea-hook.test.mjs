/**
 * LA NOTA INTERNA SE QUEDA EN SU LÍNEA — el hook de la conversación abierta
 * (`useChatSession`), montado de verdad con react-test-renderer.
 *
 * Lo que se prueba aquí no se ve leyendo el código: el hook se MONTA, se le
 * cambia la línea como hace la pantalla al pasar de una conversación del
 * contacto a la del mismo contacto en otra línea (el componente NO se vuelve a
 * montar), y se mira qué le pregunta al servidor y qué ficha se queda.
 *
 * Contra un servidor de mentira que contesta con la misma regla que el de
 * verdad (`fingido/ficha-del-chat-de-mentira.ts`); lo que la regla decide
 * contra Postgres lo prueba `nota-por-linea-db.test.mjs`.
 *
 * `MODO=roto` monta el hook de `ANTES_REF` y AFIRMA el fallo: abierta en
 * Atención resolvía la ficha de Ventas, y pasar de una línea a la otra no
 * volvía a pedir nada.
 *
 * Se levanta con `scripts/banco-nota-por-linea.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROTO = process.env.MODO === "roto";
const { act } = TestRenderer;
const h = React.createElement;
const { useChatSession, servidor } = await import("./.compilado/nota-por-linea/hook.js");

const CUENTA = "cuenta-1";
const N = "573001112233@s.whatsapp.net";
const CUENTAS = [CUENTA];
const ALIAS = [N];
const FICHAS = [
    // La de Ventas es la que se tocó la última: era la que ganaba siempre.
    { id: 101, userId: CUENTA, instanceId: "VENTAS", remoteJid: N, updatedAt: 2000, pushName: "Laura" },
    { id: 202, userId: CUENTA, instanceId: "ATENCION", remoteJid: N, updatedAt: 1000, pushName: "Laura" },
];

/** Monta el hook con props que se pueden cambiar sin volver a montar. */
async function montar(instanceName) {
    servidor.ponerFichas(FICHAS);
    const visto = { session: undefined, resueltas: [] };
    // Estable, como en la pantalla: un manejador nuevo en cada pintado volvería
    // a pedir la ficha por su cuenta y taparía lo que se viene a probar.
    const alResolver = (remoteJid, session, linea) =>
        visto.resueltas.push({ remoteJid, id: session?.id ?? null, linea });
    function Sonda({ linea }) {
        const { session } = useChatSession({
            userId: CUENTA,
            sessionUserIds: CUENTAS,
            remoteJid: N,
            remoteJidAliases: ALIAS,
            instanceName: linea,
            onSessionResolved: alResolver,
        });
        visto.session = session;
        return null;
    }
    let raiz;
    await act(async () => {
        raiz = TestRenderer.create(h(Sonda, { linea: instanceName }));
    });
    await esperar();
    return {
        visto,
        async cambiarDeLinea(linea) {
            await act(async () => raiz.update(h(Sonda, { linea })));
            await esperar();
        },
        desmontar: () => act(() => raiz.unmount()),
    };
}

async function esperar() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

// ── MODO=roto: el fallo, con el hook de antes ───────────────────────────────

test("MODO=roto: abierta en Atención, el hook de antes resolvía la ficha de Ventas", { skip: !ROTO }, async () => {
    const s = await montar("ATENCION");
    assert.equal(servidor.preguntas.length, 1);
    assert.equal(servidor.preguntas[0].opciones?.instanceId, undefined, "el fallo: se preguntaba sin la línea");
    assert.equal(s.visto.session?.id, 101, "el fallo: la conversación de Atención tenía la ficha de Ventas");
    await s.desmontar();
});

test("MODO=roto: pasar de Ventas a Atención no volvía a pedir la ficha", { skip: !ROTO }, async () => {
    const s = await montar("VENTAS");
    assert.equal(s.visto.session?.id, 101);
    await s.cambiarDeLinea("ATENCION");
    assert.equal(servidor.preguntas.length, 1, "el fallo: el cambio de línea no se enteraba");
    assert.equal(s.visto.session?.id, 101, "el fallo: Atención se quedaba con la ficha de Ventas");
    await s.desmontar();
});

// ── Hoy ─────────────────────────────────────────────────────────────────────

test("abierta en una línea, pregunta SOLO por esa línea y se queda con su ficha", { skip: ROTO }, async () => {
    const s = await montar("ATENCION");
    assert.equal(servidor.preguntas.length, 1);
    assert.equal(servidor.preguntas[0].opciones.instanceId, "ATENCION");
    assert.deepEqual(servidor.preguntas[0].cuentas, CUENTAS);
    assert.equal(s.visto.session?.id, 202, "la de Atención, aunque la de Ventas se tocara después");
    assert.deepEqual(s.visto.resueltas.at(-1), { remoteJid: N, id: 202, linea: "ATENCION" },
        "la bandeja sabe de qué línea es la ficha");
    await s.desmontar();
});

test("pasar a la otra línea del mismo contacto vuelve a pedir, con la línea nueva", { skip: ROTO }, async () => {
    const s = await montar("VENTAS");
    assert.equal(s.visto.session?.id, 101);
    await s.cambiarDeLinea("ATENCION");
    assert.equal(servidor.preguntas.length, 2, "una pregunta nueva");
    assert.equal(servidor.preguntas[1].opciones.instanceId, "ATENCION");
    assert.equal(s.visto.session?.id, 202);
    assert.deepEqual(s.visto.resueltas.at(-1), { remoteJid: N, id: 202, linea: "ATENCION" });
    await s.desmontar();
});

test("la respuesta tardía de la línea anterior NO se pinta encima de la de ahora", { skip: ROTO }, async () => {
    servidor.ponerFichas(FICHAS);
    servidor.retenerLaSiguiente();
    const s = await montar("VENTAS");
    assert.equal(s.visto.session ?? null, null, "la de Ventas sigue en vuelo");
    await s.cambiarDeLinea("ATENCION");
    assert.equal(s.visto.session?.id, 202);
    await act(async () => servidor.soltar());
    await esperar();
    assert.equal(s.visto.session?.id, 202, "la de Ventas llegó tarde y se tiró");
    assert.ok(!s.visto.resueltas.some((r) => r.id === 101), "ni se le contó a la bandeja");
    await s.desmontar();
});

test("una línea sin ficha de ese contacto se queda sin ficha: no hereda la de otra", { skip: ROTO }, async () => {
    const s = await montar("LIBRE");
    assert.equal(servidor.preguntas[0].opciones.instanceId, "LIBRE");
    assert.equal(s.visto.session, null);
    assert.deepEqual(s.visto.resueltas.at(-1), { remoteJid: N, id: null, linea: "LIBRE" });
    await s.desmontar();
});

test("lo que no cambia: sin línea, se pregunta por el número y gana la más reciente", { skip: ROTO }, async () => {
    const s = await montar(undefined);
    assert.equal("instanceId" in servidor.preguntas[0].opciones, false);
    assert.deepEqual(servidor.preguntas[0].opciones.aliases, [N]);
    assert.equal(s.visto.session?.id, 101);
    await s.desmontar();
});
