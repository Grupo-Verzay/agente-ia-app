// El pie de una foto o un video en la vista previa de la fila de Chats: con
// pie sale el icono y ese texto; sin pie, «Imagen» / «Video» como siempre.
// Lo corre `scripts/banco-pie-en-la-vista-previa.sh`.
//
// `MODO=roto` carga los de `ANTES_REF` y afirma el fallo: la fila decía
// «🖼️ Imagen» aunque la foto llevara texto.
import test from "node:test";
import assert from "node:assert/strict";

const MODO = process.env.MODO ?? "bueno";
const C = await import("./.compilado/pie-en-la-vista-previa/chat.js");

const chat = (messageType, message, fromMe) => ({
    lastMessage: { key: { id: "m-1", fromMe, remoteJid: "573126460385@s.whatsapp.net" }, messageType, message },
});
const texto = (messageType, message, fromMe = false) => C.lastTextFrom(chat(messageType, message, fromMe)).text;

const conPie = [
    ["imageMessage", { imageMessage: { caption: "Mira este catálogo" } }, "🖼️ Mira este catálogo"],
    ["videoMessage", { videoMessage: { caption: "Así se instala" } }, "🎥 Así se instala"],
    // El pie suelto en `conversation`, como lo manda Evolution en algunas versiones.
    ["imageMessage", { conversation: "Mira este catálogo", imageMessage: {} }, "🖼️ Mira este catálogo"],
    ["videoMessage", { conversation: "Así se instala", videoMessage: {} }, "🎥 Así se instala"],
];

test("ANTES: la fila no enseñaba el pie de la foto ni del video", { skip: MODO !== "roto" }, () => {
    assert.equal(texto("imageMessage", { imageMessage: { caption: "Mira este catálogo" } }), "🖼️ Imagen");
    assert.equal(texto("videoMessage", { videoMessage: { caption: "Así se instala" } }), "🎥 Video");
});

test("con pie, la fila enseña el icono y el texto (recibido y enviado)", { skip: MODO !== "bueno" }, () => {
    for (const fromMe of [false, true]) {
        for (const [tipo, mensaje, esperado] of conPie) {
            assert.equal(texto(tipo, mensaje, fromMe), esperado);
        }
    }
});

test("sin pie, la fila sigue diciendo «Imagen» / «Video»", () => {
    for (const fromMe of [false, true]) {
        assert.equal(texto("imageMessage", { imageMessage: {} }, fromMe), "🖼️ Imagen");
        assert.equal(texto("videoMessage", { videoMessage: {} }, fromMe), "🎥 Video");
        assert.equal(texto("imageMessage", { imageMessage: { caption: "   " } }, fromMe), "🖼️ Imagen");
    }
});

test("lo que no escribió nadie no cuenta como pie", () => {
    // Etiqueta que guarda el servidor, rótulo de la burbuja optimista y nombre del archivo.
    assert.equal(texto("imageMessage", { conversation: "[Imagen]", imageMessage: {} }), "🖼️ Imagen");
    assert.equal(texto("videoMessage", { conversation: "[Video]", videoMessage: {} }), "🎥 Video");
    assert.equal(texto("imageMessage", { conversation: "🖼️ Imagen", imageMessage: {} }), "🖼️ Imagen");
    assert.equal(texto("videoMessage", { conversation: "🎥 Video", videoMessage: {} }), "🎥 Video");
    assert.equal(
        texto("imageMessage", { conversation: "IMG_0001.jpg", imageMessage: { fileName: "IMG_0001.jpg" } }),
        "🖼️ Imagen",
    );
});

test("un pie largo o con saltos de línea cabe en una línea", { skip: MODO !== "bueno" }, () => {
    assert.equal(
        texto("imageMessage", { imageMessage: { caption: "Hola\n\n  buenas   tardes" } }),
        "🖼️ Hola buenas tardes",
    );
    const largo = texto("videoMessage", { videoMessage: { caption: "a".repeat(500) } });
    assert.equal(largo.startsWith("🎥 aaa"), true);
    assert.equal(largo.endsWith("…"), true);
    assert.equal(largo.length < 230, true);
});

test("el resto de adjuntos no cambia", () => {
    assert.equal(texto("documentMessage", { documentMessage: { caption: "Factura" } }), "📄 Documento");
    assert.equal(texto("audioMessage", { audioMessage: { ptt: true } }), "🎙️ Nota de voz");
    assert.equal(texto("stickerMessage", { stickerMessage: {} }), "🏷️ Sticker");
});
