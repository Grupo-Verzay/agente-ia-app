// Las reglas puras de la vista por dispositivo de la pantalla de Verzy.
// Lo corre `scripts/banco-vista-por-dispositivo.sh`.
import test from "node:test";
import assert from "node:assert/strict";

const P = await import("./.compilado/vista-por-dispositivo/puro.js");

test("la primera sala que habla se queda la ventana de Verzy; otro dispositivo va a su espejo", () => {
    assert.equal(P.laVistaQueToca({ pedido: "movil", conductor: "pc", adoptado: false }), "conductor", "el de fábrica no cuenta");
    assert.equal(P.laVistaQueToca({ pedido: "movil", conductor: "movil", adoptado: true }), "conductor");
    assert.equal(P.laVistaQueToca({ pedido: "pc", conductor: "movil", adoptado: true }), "espejo");
    assert.equal(P.laVistaQueToca({ pedido: "tablet", conductor: "pc", adoptado: true }), "espejo");
});

test("el espejo sigue la página del conductor, y un chat abierto pulsando su fila", () => {
    const base = "http://127.0.0.1:3000";
    assert.equal(P.laRutaQueSigueElEspejo({ url: `${base}/planes?x=1#precios`, base, chatAbierto: null }), "/planes?x=1");
    assert.equal(P.laRutaQueSigueElEspejo({ url: `${base}/chats`, base, chatAbierto: { jid: "57300@s.whatsapp.net", linea: "l1" } }), "/chats?jid=57300%40s.whatsapp.net&instance=l1");
    assert.equal(P.laRutaQueSigueElEspejo({ url: `${base}/chats?jid=a`, base, chatAbierto: { jid: "b", linea: null } }), "/chats?jid=a", "la URL manda si lo dice");
    assert.equal(P.laRutaQueSigueElEspejo({ url: "about:blank", base, chatAbierto: null }), null, "la pantalla de espera");
    assert.equal(P.laRutaQueSigueElEspejo({ url: "https://otro.sitio/x", base, chatAbierto: null }), null);
});

test("lo bajada que va una página, en proporción", () => {
    assert.equal(P.laProporcionBajada({ arriba: 0, alto: 2000, ventana: 800 }), 0);
    assert.equal(P.laProporcionBajada({ arriba: 600, alto: 2000, ventana: 800 }), 0.5);
    assert.equal(P.laProporcionBajada({ arriba: 5000, alto: 2000, ventana: 800 }), 1);
    assert.equal(P.laProporcionBajada({ arriba: 10, alto: 500, ventana: 800 }), 0, "no baja");
});
