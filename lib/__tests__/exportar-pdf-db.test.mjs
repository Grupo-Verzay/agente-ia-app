/**
 * Exportar en PDF contra POSTGRES, por la acción de verdad.
 *
 * Lo que solo se ve aquí:
 *
 * - que el PDF lleva el nombre y el logo del negocio DUEÑO de la línea —no de
 *   quien exporta—: la madre exporta una conversación de su hija y sale la
 *   marca de la hija;
 * - que las imágenes de NUESTRO almacenamiento se bajan y se incrustan, y que
 *   una dirección de fuera NO se pide nunca (se cuenta lo que llega al otro
 *   servidor);
 * - que el PDF y el `.txt` de la misma conversación dicen lo mismo, y que
 *   pedir texto sigue dando exactamente el texto de siempre;
 * - que en lote salen varios PDF, y que lo ajeno no se cuela.
 *
 * Se finge `currentUser()`; el almacenamiento es un servidor HTTP local.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

import {
    ponerAQuienMira,
    exportarConversacionesAction,
    persistChatMessage,
    db,
} from "./.compilado/calidad/entrada-de-calidad.js";

const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const pdfjs = require(join(RAIZ, "node_modules/pdfjs-dist/legacy/build/pdf.js"));

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MADRE = `p-madre-${V}`;
const HIJA = `p-hija-${V}`;
const AJENA = `p-ajena-${V}`;
const LINEA_HIJA = `P_HIJA_${V}`;
const LINEA_MADRE = `P_MADRE_${V}`;
const LINEA_AJENA = `P_AJENA_${V}`;
const NUM = `57301${String(Date.now()).slice(-7)}`;
const JID = `${NUM}@s.whatsapp.net`;
const JID2 = `57302${String(Date.now()).slice(-7)}@s.whatsapp.net`;
const hace = (min) => new Date(Date.now() - min * 60 * 1000);

let almacen;
let otro;
const pedidosAlOtro = [];
const pedidosAlAlmacen = [];
let S3;

async function levantar(manejador) {
    const s = http.createServer(manejador);
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    return s;
}

function quien(id) {
    return { id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null, role: "user", rolDeLaPersona: "user", email: `${id}@b.t`, name: id };
}

async function leer(base64) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(base64, "base64")), standardFontDataUrl: join(RAIZ, "node_modules/pdfjs-dist/standard_fonts") + "/" }).promise;
    let texto = "";
    let imagenes = 0;
    for (let i = 1; i <= doc.numPages; i++) {
        const p = await doc.getPage(i);
        texto += (await p.getTextContent()).items.map((it) => it.str).join("\n") + "\n";
        const ops = await p.getOperatorList();
        imagenes += ops.fnArray.filter((f) => f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintJpegXObject).length;
    }
    return { texto, imagenes };
}

async function msg(userId, instanceName, remoteJid, { fromMe, texto = "", min, tipo = "conversation", mediaUrl = null, ia = false, id }) {
    const cuerpo =
        tipo === "imageMessage" ? { imageMessage: { caption: texto } } : { conversation: texto };
    await persistChatMessage({
        userId, instanceName, remoteJid, fromMe, messageId: id,
        messageType: tipo, content: texto || null, mediaUrl,
        raw: { message: cuerpo, ...(ia ? { sentByAi: true } : {}) },
        messageTimestamp: hace(min), puedeReabrir: false,
    });
}

async function limpiar() {
    const ids = [MADRE, HIJA, AJENA];
    await db.$executeRawUnsafe(`DELETE FROM "chat_messages" WHERE "userId" = ANY($1::text[])`, ids).catch(() => {});
    await db.$executeRawUnsafe(`DELETE FROM "chat_conversations" WHERE "userId" = ANY($1::text[])`, ids).catch(() => {});
    await db.linkedAccount.deleteMany({ where: { OR: [{ masterUserId: { in: ids } }, { linkedUserId: { in: ids } }] } });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.instancia.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
}

test.before(async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 128, b: 105, alpha: 1 } } }).png().toBuffer();
    const foto = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#ff3366" } }).webp().toBuffer();
    almacen = await levantar((req, res) => {
        pedidosAlAlmacen.push(req.url);
        if (req.url.endsWith("/logo.png")) { res.writeHead(200, { "Content-Type": "image/png" }); return res.end(png); }
        if (req.url.endsWith("/foto.webp")) { res.writeHead(200, { "Content-Type": "image/webp" }); return res.end(foto); }
        res.writeHead(404); res.end();
    });
    otro = await levantar((req, res) => { pedidosAlOtro.push(req.url); res.writeHead(200); res.end(png); });
    S3 = `http://127.0.0.1:${almacen.address().port}`;
    process.env.S3_PUBLIC_URL = S3;
    const OTRO = `http://127.0.0.1:${otro.address().port}`;

    await limpiar();
    await db.user.create({ data: { id: MADRE, email: `${MADRE}@b.t`, name: "Madre", company: "Casa Matriz" } });
    await db.user.create({ data: { id: HIJA, email: `${HIJA}@b.t`, name: "Hija", brandName: "Tienda El Sol", image: `${S3}/bucket/${HIJA}/perfil/logo.png` } });
    await db.user.create({ data: { id: AJENA, email: `${AJENA}@b.t`, name: "Ajena" } });
    await db.linkedAccount.create({ data: { masterUserId: MADRE, linkedUserId: HIJA } });
    await db.instancia.create({ data: { instanceName: LINEA_HIJA, userId: HIJA, instanceId: `pih-${V}`, instanceType: "Whatsapp", displayName: "Ventas El Sol" } });
    await db.instancia.create({ data: { instanceName: LINEA_MADRE, userId: MADRE, instanceId: `pim-${V}`, instanceType: "Whatsapp", displayName: "Línea Madre" } });
    await db.instancia.create({ data: { instanceName: LINEA_AJENA, userId: AJENA, instanceId: `pia-${V}`, instanceType: "Whatsapp" } });

    await msg(HIJA, LINEA_HIJA, JID, { fromMe: false, texto: "Hola, ¿tienen la mesa en roble?", min: 60, id: `h1-${V}` });
    await msg(HIJA, LINEA_HIJA, JID, { fromMe: true, texto: "¡Sí! Te mando la foto.", min: 59, ia: true, id: `h2-${V}` });
    await msg(HIJA, LINEA_HIJA, JID, { fromMe: true, tipo: "imageMessage", texto: "Esta es", mediaUrl: `${S3}/bucket/${HIJA}/chat/foto.webp`, min: 58, id: `h3-${V}` });
    await msg(HIJA, LINEA_HIJA, JID, { fromMe: false, tipo: "imageMessage", mediaUrl: `${OTRO}/robada.png`, min: 57, id: `h4-${V}` });
    await msg(HIJA, LINEA_HIJA, JID, { fromMe: false, texto: "Perfecto 👍", min: 56, id: `h5-${V}` });
    await db.session.create({ data: { userId: HIJA, remoteJid: JID, pushName: "María", customName: "María López", instanceId: `pih-${V}`, status: true } });

    await msg(MADRE, LINEA_MADRE, JID2, { fromMe: false, texto: "Pregunta a la madre", min: 30, id: `m1-${V}` });
    await msg(AJENA, LINEA_AJENA, JID, { fromMe: false, texto: "secreto de la ajena", min: 30, id: `a1-${V}` });
});

test.after(async () => {
    await limpiar();
    await db.$disconnect();
    almacen?.close();
    otro?.close();
});

test("la madre exporta en PDF una conversación de su hija: marca de la HIJA, foto incrustada, lo de fuera ni se pide", async () => {
    ponerAQuienMira(quien(MADRE));
    pedidosAlAlmacen.length = 0;
    const r = await exportarConversacionesAction([{ instanceName: LINEA_HIJA, remoteJid: JID }], "America/Bogota", "pdf");
    assert.equal(r.success, true, r.message);
    assert.equal(r.archivos.length, 1);
    const a = r.archivos[0];
    assert.equal(a.formato, "pdf");
    assert.equal(a.nombre, "Chat con María López.pdf");
    assert.equal(Buffer.from(a.contenido, "base64").subarray(0, 5).toString(), "%PDF-");
    const { texto, imagenes } = await leer(a.contenido);
    assert.match(texto, /Tienda El Sol/, "el nombre del negocio DUEÑO de la línea");
    assert.doesNotMatch(texto, /Casa Matriz/, "no el de quien exporta");
    assert.match(texto, /Conversación con María López/);
    assert.match(texto, /Línea: Ventas El Sol/);
    for (const t of ["Hola, ¿tienen la mesa en roble?", "¡Sí! Te mando la foto.", "Esta es", "Perfecto", "Agente IA", "Imagen", "Abrir archivo"]) {
        assert.ok(texto.includes(t), `falta «${t}»`);
    }
    assert.equal(imagenes, 2, "el logo de la hija y la foto de nuestro almacenamiento");
    assert.ok(pedidosAlAlmacen.some((u) => u.endsWith("/logo.png")) && pedidosAlAlmacen.some((u) => u.endsWith("/foto.webp")));
    assert.deepEqual(pedidosAlOtro, [], "una dirección que no es nuestra NO se pide nunca");
});

test("el mismo pedido en texto da el .txt de siempre, con los mismos mensajes", async () => {
    ponerAQuienMira(quien(MADRE));
    const txt = await exportarConversacionesAction([{ instanceName: LINEA_HIJA, remoteJid: JID }], "America/Bogota");
    assert.equal(txt.success, true);
    assert.equal(txt.archivos[0].formato, "txt");
    assert.equal(txt.archivos[0].nombre, "Chat con María López.txt");
    assert.match(txt.archivos[0].contenido, /^Conversación con María López/);
    assert.match(txt.archivos[0].contenido, /5 mensajes/);
    const pdf = await exportarConversacionesAction([{ instanceName: LINEA_HIJA, remoteJid: JID }], "America/Bogota", "pdf");
    const { texto } = await leer(pdf.archivos[0].contenido);
    assert.match(texto, /5 mensajes/, "el PDF cuenta los mismos mensajes que el .txt");
    const raro = await exportarConversacionesAction([{ instanceName: LINEA_HIJA, remoteJid: JID }], "America/Bogota", "docx");
    assert.equal(raro.archivos[0].formato, "txt", "un formato que no existe es texto");
});

test("en lote: un PDF por conversación, cada una con SU marca, y lo ajeno se omite", async () => {
    ponerAQuienMira(quien(MADRE));
    const r = await exportarConversacionesAction(
        [
            { instanceName: LINEA_HIJA, remoteJid: JID },
            { instanceName: LINEA_MADRE, remoteJid: JID2 },
            { instanceName: LINEA_AJENA, remoteJid: JID },
        ],
        "UTC",
        "pdf",
    );
    assert.equal(r.success, true);
    assert.equal(r.archivos.length, 2);
    assert.equal(r.omitidas, 1);
    assert.ok(r.archivos.every((a) => a.formato === "pdf"));
    const madre = await leer(r.archivos[1].contenido);
    assert.match(madre.texto, /Casa Matriz/, "la conversación de la madre lleva la marca de la madre");
    assert.equal(madre.imagenes, 0, "la madre no subió logo: iniciales, sin imagen");
    for (const a of r.archivos) assert.doesNotMatch((await leer(a.contenido)).texto, /secreto de la ajena/);
});

test("una hija no exporta la conversación de su madre, ni en PDF", async () => {
    ponerAQuienMira(quien(HIJA));
    const r = await exportarConversacionesAction([{ instanceName: LINEA_MADRE, remoteJid: JID2 }], "UTC", "pdf");
    assert.equal(r.success, false);
    ponerAQuienMira(null);
    const sin = await exportarConversacionesAction([{ instanceName: LINEA_HIJA, remoteJid: JID }], "UTC", "pdf");
    assert.equal(sin.success, false, "sin sesión no se exporta nada");
});
