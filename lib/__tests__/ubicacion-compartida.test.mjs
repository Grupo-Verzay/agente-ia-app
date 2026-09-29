/**
 * La ubicación que comparte un contacto: se LEE venga del proveedor que venga,
 * se pinta como tarjeta con mapa y se reenvía, se copia y se exporta como el
 * enlace del mapa. Sin navegador: las reglas puras y un barrido del código.
 *
 * Lo que se pinta de verdad lo mide `ubicacion-compartida-navegador.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMP = join(AQUI, ".compilado", "ubicacion-compartida");

const u = await import(join(COMP, "ubicacion-de-whatsapp.js"));
const mapa = await import(join(COMP, "mapa-de-la-ubicacion.js"));
const reenviar = await import(join(COMP, "reenviar-mensaje.js"));
const legible = await import(join(COMP, "conversacion-legible.js"));
const historial = await import(join(COMP, "waha-historial.js"));
const burbujas = await import(join(COMP, "chat-message-utils.js"));
const lista = await import(join(COMP, "chat-sidebar.utils.js"));

// Una ubicación de verdad (Barranquilla), tal como la guarda Evolution.
const EVOLUTION = {
    locationMessage: {
        degreesLatitude: 10.9878,
        degreesLongitude: -74.7889,
        name: "Tienda El Sol",
        address: "Cra 53 #75-20, Barranquilla",
        url: "https://evil.example.com/phish",
        JPEGThumbnail: "/9j/4AAQSkZJRg==",
    },
};

test("coordenadas: cadenas de Waha sí; vacío, 0,0 y fuera de rango no", () => {
    assert.deepEqual(u.comoCoordenadas("8.8301119", "-75.8691734"), { latitud: 8.8301119, longitud: -75.8691734 });
    assert.equal(u.comoCoordenadas("", ""), null);
    assert.equal(u.comoCoordenadas(null, null), null, "Number(null) es 0: no puede colarse");
    assert.equal(u.comoCoordenadas(0, 0), null, "0,0 es un campo vacío convertido, no un sitio");
    assert.equal(u.comoCoordenadas(91, 10), null);
    assert.equal(u.comoCoordenadas(10, 181), null);
    assert.equal(u.comoCoordenadas("abc", 1), null);
});

test("Waha (GOWS): `location` con las coordenadas en cadena, y el crudo de respaldo", () => {
    const gows = {
        id: "false_573001112233@c.us_3EB0",
        body: "",
        hasMedia: false,
        location: { live: false, latitude: "8.8301119", longitude: "-75.8691734", thumbnail: "/9j/AAAA" },
        _data: { Message: { locationMessage: { degreesLatitude: 8.8301119, degreesLongitude: -75.8691734 } } },
    };
    const t = u.ubicacionDeWaha(gows);
    assert.equal(t.tipo, "locationMessage");
    assert.equal(t.datos.degreesLatitude, 8.8301119);
    assert.equal(t.datos.degreesLongitude, -75.8691734);
    assert.equal("JPEGThumbnail" in t.datos || "thumbnail" in t.datos, false, "la miniatura no se guarda");

    const soloCrudo = u.ubicacionDeWaha({ _data: { Message: { liveLocationMessage: { degreesLatitude: 4.6, degreesLongitude: -74.08, caption: "Voy llegando" } } } });
    assert.equal(soloCrudo.tipo, "liveLocationMessage");
    assert.equal(soloCrudo.datos.name, "Voy llegando");

    assert.equal(u.ubicacionDeWaha({ location: { live: true, latitude: "4.6", longitude: "-74.08" } }).tipo, "liveLocationMessage");
    assert.equal(u.ubicacionDeWaha({ body: "hola" }), null, "un texto no es una ubicación");
});

test("Meta y Telegram se traducen a la MISMA forma que Evolution", () => {
    const meta = u.ubicacionDeMeta({ latitude: 10.9878, longitude: -74.7889, name: "Tienda El Sol", address: "Cra 53" });
    assert.deepEqual(meta, { tipo: "locationMessage", datos: { degreesLatitude: 10.9878, degreesLongitude: -74.7889, name: "Tienda El Sol", address: "Cra 53" } });

    const venue = u.ubicacionDeTelegram({ venue: { location: { latitude: 10.9878, longitude: -74.7889 }, title: "Tienda", address: "Cra 53" } });
    assert.equal(venue.tipo, "locationMessage");
    assert.equal(venue.datos.name, "Tienda");
    assert.equal(u.ubicacionDeTelegram({ location: { latitude: 10.9, longitude: -74.7, live_period: 900 } }).tipo, "liveLocationMessage");
    assert.equal(u.ubicacionDeTelegram({ text: "hola" }), null);
});

test("leer lo guardado: nombre, dirección, y el enlace sale de las COORDENADAS, nunca del `url` ajeno", () => {
    const l = u.laUbicacionDelMensaje(EVOLUTION);
    assert.deepEqual(l, { latitud: 10.9878, longitud: -74.7889, nombre: "Tienda El Sol", direccion: "Cra 53 #75-20, Barranquilla", enVivo: false });
    const enlace = u.elEnlaceDelMapa(l);
    assert.equal(enlace, "https://www.google.com/maps/search/?api=1&query=10.987800,-74.788900");
    assert.doesNotMatch(enlace, /evil/);
    assert.equal(u.laUbicacionDelMensaje({ conversation: "hola" }), null);
    assert.equal(u.laUbicacionDelMensaje({ locationMessage: { degreesLatitude: 0, degreesLongitude: 0 } }), null);
});

test("el mapa: las teselas cubren la caja entera y el punto cae en el centro", () => {
    for (const [lat, lng] of [[10.9878, -74.7889], [4.6097, -74.0817], [-33.45, -70.66], [85, 179.999], [-85, -179.999]]) {
        const teselas = mapa.lasTeselasDelMapa(lat, lng);
        assert.ok(teselas.length >= 2 && teselas.length <= 6, `entre 2 y 6 teselas (${teselas.length})`);
        const cubre = (px, py) => teselas.some((t) => px >= t.dx && px < t.dx + mapa.TAMANO_DE_TESELA && py >= t.dy && py < t.dy + mapa.TAMANO_DE_TESELA);
        // Las cuatro esquinas de la caja y el centro (coordenadas relativas al punto).
        const w = mapa.ANCHO_DEL_MAPA / 2, h = mapa.ALTO_DEL_MAPA / 2;
        for (const [px, py] of [[0, 0], [-w, -h], [w - 1, -h], [-w, h - 1], [w - 1, h - 1]]) {
            if (Math.abs(lat) >= 85 && py !== 0) continue; // más allá de un polo no hay teselas
            assert.ok(cubre(px, py), `(${lat},${lng}) el píxel ${px},${py} queda cubierto`);
        }
        for (const t of teselas) assert.match(t.url, /^https:\/\/tile\.openstreetmap\.org\/15\/\d+\/\d+\.png$/);
    }
    // El mundo da la vuelta: al borde del antimeridiano se pide la tesela 0.
    const vuelta = mapa.lasTeselasDelMapa(0.1, 179.999);
    assert.ok(vuelta.some((t) => /\/15\/0\//.test(t.url)), "envuelve en horizontal");
});

test("reenviar y copiar: una ubicación sale como texto con el enlace del mapa", () => {
    const ubicacion = u.laUbicacionDelMensaje(EVOLUTION);
    const r = reenviar.loQueSeReenvia({ id: "x", content: "", ubicacion });
    assert.equal(r.kind, "text");
    assert.equal(r.text, "📍 Tienda El Sol\nCra 53 #75-20, Barranquilla\nhttps://www.google.com/maps/search/?api=1&query=10.987800,-74.788900");
    assert.equal(reenviar.sePuedeReenviar({ id: "x", content: "", ubicacion }), true, "se ofrece Reenviar");
    const sinNombre = u.laUbicacionEnTexto({ latitud: 1, longitud: 2, nombre: null, direccion: null, enVivo: true });
    assert.equal(sinNombre, "📍 Ubicación en vivo\nhttps://www.google.com/maps/search/?api=1&query=1.000000,2.000000");
});

test("exportar: la ubicación se nombra y lleva el enlace, como un documento", () => {
    const m = legible.aMensajeLegible({ key: { fromMe: false }, messageType: "locationMessage", messageTimestamp: 1_700_000_000, message: EVOLUTION });
    assert.equal(m.mediaUrl, "https://www.google.com/maps/search/?api=1&query=10.987800,-74.788900");
    assert.equal(m.nombreDelArchivo, "Tienda El Sol");
    const sinNombre = legible.aMensajeLegible({ key: {}, messageType: "locationMessage", message: { locationMessage: { degreesLatitude: 4.6, degreesLongitude: -74.08 } } });
    assert.equal(sinNombre.nombreDelArchivo, "4.600000, -74.080000");
});

test("historial de Waha: la ubicación se guarda con la forma de Evolution, no como texto vacío", () => {
    const g = historial.mensajeDeWahaParaGuardar(
        { id: "false_57300@c.us_AAA", timestamp: 1_700_000_000, fromMe: false, body: "", location: { latitude: "10.9878", longitude: "-74.7889" } },
        "57300@s.whatsapp.net",
    );
    assert.equal(g.messageType, "locationMessage");
    assert.equal(g.content, "[Ubicación]");
    assert.equal(g.raw.message.locationMessage.degreesLatitude, 10.9878);
});

test("la burbuja: una ubicación es una TARJETA, no «[Mensaje locationMessage]»", () => {
    const [b, vivo] = burbujas.toUIMessages(
        [
            { key: { id: "u1", fromMe: false, remoteJid: "57300@s.whatsapp.net" }, messageType: "locationMessage", messageTimestamp: 1_700_000_000, message: EVOLUTION },
            { key: { id: "u2", fromMe: false, remoteJid: "57300@s.whatsapp.net" }, messageType: "liveLocationMessage", messageTimestamp: 1_700_000_100, message: { liveLocationMessage: { degreesLatitude: 4.6, degreesLongitude: -74.08 } } },
        ],
        undefined,
        new Map(),
    );
    assert.equal(b.content, "", "sin texto: lo dice la tarjeta");
    assert.deepEqual(b.ubicacion, u.laUbicacionDelMensaje(EVOLUTION));
    assert.equal(vivo.ubicacion.enVivo, true);
    // Sin coordenadas que valgan: se dice qué era, nunca el nombre crudo del tipo.
    const [rota] = burbujas.toUIMessages(
        [{ key: { id: "u3", fromMe: false, remoteJid: "57300@s.whatsapp.net" }, messageType: "locationMessage", messageTimestamp: 1, message: { locationMessage: {} } }],
        undefined,
        new Map(),
    );
    assert.equal(rota.ubicacion, undefined);
    assert.equal(rota.content, "Ubicación");
});

test("la lista de chats resume la ubicación con su icono", () => {
    const chat = (messageType, message) => ({ lastMessage: { key: { id: "x", fromMe: false }, messageType, message } });
    assert.equal(lista.lastTextFrom(chat("locationMessage", { ...EVOLUTION, conversation: "[Ubicación]" })).text, "📍 Ubicación");
    assert.equal(lista.lastTextFrom(chat("liveLocationMessage", { liveLocationMessage: { degreesLatitude: 1, degreesLongitude: 2 } })).text, "📍 Ubicación en vivo");
});

test("barrido: las dos copias del módulo coinciden, y todos los sitios pasan por él", () => {
    const aqui = fs.readFileSync(join(RAIZ, "lib/ubicacion-de-whatsapp.ts"), "utf8");
    const backend = join(RAIZ, "..", "api-webhook", "src/modules/webhook/utils/ubicacion-de-whatsapp.ts");
    if (fs.existsSync(backend)) {
        assert.equal(fs.readFileSync(backend, "utf8"), aqui, "la copia del backend es byte a byte la misma");
    } else {
        console.warn("[banco] no está el repositorio del backend al lado: no se comparan las copias");
    }
    const leer = (p) => fs.readFileSync(join(RAIZ, p), "utf8");
    assert.match(leer("app/(root)/chats/_components/ChatMessageList.tsx"), /ubicacion=\{message\.ubicacion\}/);
    assert.match(leer("app/(root)/chats/_components/MessageBubble.tsx"), /<TarjetaDeUbicacion ubicacion=\{ubicacion\}/);
    assert.match(leer("app/(root)/chats/_components/chat-main.tsx"), /laUbicacionEnTexto/, "copiar una ubicación copia su enlace");
    const tarjeta = leer("app/(root)/chats/_components/TarjetaDeUbicacion.tsx");
    assert.match(tarjeta, /MARCO_DE_UN_ADJUNTO, ANCHO_DE_LA_NOTA/, "el marco y el ancho de un documento");
    assert.match(tarjeta, /elEnlaceDelMapa\(ubicacion\)/);
    assert.match(tarjeta, /rel="noopener noreferrer"/);
});
