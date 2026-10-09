// La videollamada con IA (Verzy, Tavus) en el chat: la fila del CRM
// (`tavus_<cita>`, `messageType: 'call'`, `raw.call.isVideo: true`) sale con
// la CÁMARA, no con el teléfono, en la lista de chats y en la conversación.
// Lo corre `scripts/banco-videollamada-graba-el-asesor.sh`.
//
// `MODO=roto` carga los de `ANTES_REF` y afirma el fallo: «📞 Videollamada…».
import test from "node:test";
import assert from "node:assert/strict";

const MODO = process.env.MODO ?? "bueno";
const C = await import("./.compilado/videollamada-graba-el-asesor/chat.js");

// Lo que `buildMessageContent` (lib/chat-persistence.ts) saca de la fila que
// escribe `anotarEnElCrm` (lib/videollamada-ia-aviso.server.ts): su `raw` es
// `{ call }` y el texto va en `conversation`.
const mensaje = {
    call: { direction: "outgoing", isVideo: true, isBot: true, provider: "tavus", durationSecs: 301 },
    conversation: "Videollamada con IA realizada",
};
const llamada = {
    call: { direction: "outgoing", isVideo: false, durationSecs: 60 },
    conversation: "Llamada con IA realizada",
};
const chat = (message) => ({
    lastMessage: { key: { id: "tavus_cita-1", fromMe: true, remoteJid: "573126460385@s.whatsapp.net" }, messageType: "call", message },
});

test("ANTES: la lista de chats ponía el teléfono a la videollamada", { skip: MODO !== "roto" }, () => {
    assert.equal(C.lastTextFrom(chat(mensaje)).text, "📞 Videollamada con IA realizada");
});

test("la lista de chats pone la cámara a la videollamada y el teléfono a la llamada", { skip: MODO !== "bueno" }, () => {
    assert.equal(C.lastTextFrom(chat(mensaje)).text, "🎥 Videollamada con IA realizada");
    assert.equal(C.lastTextFrom(chat({ call: mensaje.call })).text.startsWith("🎥"), true);
    assert.equal(C.lastTextFrom(chat(llamada)).text, "📞 Llamada con IA realizada");
});

test("la burbuja de la conversación sabe que es una videollamada", () => {
    const [b] = C.toUIMessages(
        [{ key: { id: "tavus_cita-1", fromMe: true, remoteJid: "573126460385@s.whatsapp.net" }, messageType: "call", message: mensaje, messageTimestamp: 1_791_000_000 }],
        undefined,
        new Map(),
    );
    assert.equal(b.kind, "call");
    assert.equal(b.call.isVideo, true);
    assert.equal(b.call.direction, "outgoing");
});
