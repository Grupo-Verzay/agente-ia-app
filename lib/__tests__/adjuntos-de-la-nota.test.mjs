/**
 * LOS ADJUNTOS DE UNA NOTA INTERNA — la regla pura y la subida desde el
 * navegador, más un barrido del código.
 *
 * 1. Qué se deja adjuntar: solo direcciones de NUESTRO bucket, con la forma
 *    exacta que escribe `/api/upload`, en la carpeta de las notas; hasta 4.
 * 2. De qué tipo es cada archivo (imagen, video, audio, documento), que es lo
 *    que decide cómo se pinta.
 * 3. Una nota que es SOLO un archivo se lee en los avisos como el archivo.
 * 4. La subida: pasa el tope de peso, sube de uno en uno, y si algo falla
 *    suelta del bucket lo ya subido (no deja archivos huérfanos) y lo dice.
 * 5. El barrido: la acción vuelve a comprobar, guarda nota y archivos en UNA
 *    transacción, la tabla se crea por la puerta de `ddl-sin-bloquear`, la
 *    caja de escribir y la burbuja los usan, y la tabla no se toca desde el
 *    esquema de Prisma (es del backend).
 *
 * `MODO=roto` afirma que en `ANTES_REF` nada de esto existía.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROTO = process.env.MODO === "roto";
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ANTES_REF = process.env.ANTES_REF || "fb40429";
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

test("MODO=roto: antes no había adjuntos en las notas", { skip: !ROTO }, () => {
    for (const f of ["lib/adjuntos-de-la-nota.ts", "lib/adjuntos-de-la-nota-db.ts", "lib/subir-adjuntos-de-la-nota.ts"]) {
        assert.throws(
            () => execFileSync("git", ["cat-file", "-e", `${ANTES_REF}:${f}`], { cwd: RAIZ, stdio: "ignore" }),
            `${f} no debía existir en ${ANTES_REF}`,
        );
    }
    const antes = execFileSync("git", ["show", `${ANTES_REF}:actions/internal-notes-actions.ts`], { cwd: RAIZ, encoding: "utf8" });
    assert.ok(!/adjuntos/.test(antes), "el fallo: la acción de notas no sabía de archivos");
    assert.match(antes, /content: z\.string\(\)\.trim\(\)\.min\(1\)/, "el fallo: una nota sin texto se rechazaba, aunque llevara un archivo");
});

const R = ROTO ? null : await import("./.compilado/adjuntos-de-la-nota/adjuntos-de-la-nota.js");
const U = ROTO ? null : await import("./.compilado/adjuntos-de-la-nota/subir-adjuntos-de-la-nota.js");
const sin = { skip: ROTO };

const PUBLICA = "https://media.banco.test";
const BUCKET = { publicUrl: PUBLICA, nombre: "verzay-media" };
const suya = (cuenta, nombre = "foto.png", carpeta = "notas-internas") =>
    `${PUBLICA}/verzay-media/${cuenta}/${carpeta}/0a1b2c3d-${nombre}`;

test("una dirección de nuestro bucket, en la carpeta de las notas, se guarda", sin, () => {
    const { adjuntos, rechazados } = R.comoSeGuardanLosAdjuntosDeLaNota(
        [{ url: suya("u1"), nombre: "foto.png", mime: "image/png", tamano: 1234 }],
        BUCKET,
    );
    assert.equal(rechazados, 0);
    assert.equal(adjuntos.length, 1);
    assert.deepEqual(adjuntos[0], {
        url: suya("u1"), nombre: "foto.png", mime: "image/png", tamano: 1234, tipo: "image",
    });
});

test("lo que no es de nuestro bucket, o no está en la carpeta de las notas, se RECHAZA (no se pinta nunca)", sin, () => {
    const malos = [
        { url: "https://evil.example/x.png" },
        { url: `${PUBLICA}/otro-bucket/u1/notas-internas/x.png` },
        { url: suya("u1", "x.png", "chat-equipo") },
        { url: suya("u1", "x.png", "reminders") },
        { url: `${PUBLICA}/verzay-media/u1/notas-internas/../../x.png` },
        { url: `${PUBLICA}/verzay-media/u1/notas-internas/%2e%2e/x.png` },
        { url: `${PUBLICA}/verzay-media/u1/notas-internas/a/b.png` },
        { url: "javascript:alert(1)" },
        { url: "" },
        {},
    ];
    for (const malo of malos) {
        const r = R.comoSeGuardanLosAdjuntosDeLaNota([malo], BUCKET);
        assert.equal(r.adjuntos.length, 0, `no debía pasar: ${JSON.stringify(malo)}`);
        assert.equal(r.rechazados, 1, `se cuenta como rechazado: ${JSON.stringify(malo)}`);
    }
});

test("no es una lista: se rechaza; sin nada, no hay nada que rechazar", sin, () => {
    assert.deepEqual(R.comoSeGuardanLosAdjuntosDeLaNota(undefined, BUCKET), { adjuntos: [], rechazados: 0 });
    assert.deepEqual(R.comoSeGuardanLosAdjuntosDeLaNota(null, BUCKET), { adjuntos: [], rechazados: 0 });
    assert.deepEqual(R.comoSeGuardanLosAdjuntosDeLaNota([], BUCKET), { adjuntos: [], rechazados: 0 });
    assert.equal(R.comoSeGuardanLosAdjuntosDeLaNota("x", BUCKET).rechazados, 1);
});

test("pasarse de 4 archivos es un rechazo, no un recorte en silencio", sin, () => {
    const cinco = Array.from({ length: 5 }, (_, i) => ({ url: suya("u1", `f${i}.png`), nombre: `f${i}.png`, mime: "image/png" }));
    const r = R.comoSeGuardanLosAdjuntosDeLaNota(cinco, BUCKET);
    assert.equal(r.adjuntos.length, R.TOPE_DE_ADJUNTOS_DE_LA_NOTA);
    assert.equal(R.TOPE_DE_ADJUNTOS_DE_LA_NOTA, 4);
    assert.equal(r.rechazados, 1);
});

test("el nombre y el tamaño que llegan se acotan: son datos que se pintan", sin, () => {
    const { adjuntos } = R.comoSeGuardanLosAdjuntosDeLaNota(
        [{ url: suya("u1"), nombre: "C:\\Users\\Ana\\Mis docs\\../informe\nfinal.pdf", mime: "application/pdf", tamano: -5 }],
        BUCKET,
    );
    assert.equal(adjuntos[0].nombre, "informe final.pdf");
    assert.equal(adjuntos[0].tamano, 0, "un tamaño imposible es «no se sabe»");
    assert.equal(adjuntos[0].tipo, "document");
});

test("el tipo: imagen, video, audio o documento — por el mime y, si es genérico, por la extensión", sin, () => {
    const tipo = (mime, nombre) => R.elTipoDelAdjuntoDeLaNota({ mime, nombre });
    assert.equal(tipo("image/jpeg", "a.jpg"), "image");
    assert.equal(tipo("video/mp4", "a.mp4"), "video");
    assert.equal(tipo("audio/webm", "nota.webm"), "audio", "una grabación del navegador es audio aunque sea .webm");
    assert.equal(tipo("audio/mpeg", "a.mp3"), "audio");
    assert.equal(tipo("application/pdf", "a.pdf"), "document");
    assert.equal(tipo("application/vnd.ms-excel", "a.xls"), "document");
    assert.equal(tipo("application/octet-stream", "a.mp4"), "video", "mime genérico: manda la extensión");
    assert.equal(tipo("application/octet-stream", "a.m4a"), "audio");
    assert.equal(tipo("", "a.png"), "image");
    assert.equal(tipo("", "contrato"), "document");
});

test("una nota que es SOLO un archivo se lee en los avisos como el archivo", sin, () => {
    const f = R.elTextoDeLaNotaParaElAviso;
    assert.equal(f("Mira esto", [{ tipo: "image" }]), "Mira esto", "con texto, manda el texto");
    assert.equal(f("", []), "");
    assert.equal(f("  ", [{ tipo: "image", nombre: "a.png" }]), "🖼️ Imagen");
    assert.equal(f("", [{ tipo: "video", nombre: "a.mp4" }]), "🎬 Video");
    assert.equal(f("", [{ tipo: "audio", nombre: "a.mp3" }]), "🎙️ Audio");
    assert.equal(f("", [{ tipo: "document", nombre: "contrato.pdf" }]), "📎 contrato.pdf");
    assert.equal(f("", [{ tipo: "image" }, { tipo: "document", nombre: "x.pdf" }]), "📎 2 archivos adjuntos");
});

test("la burbuja recibe el mismo molde que un mensaje (MediaRenderer)", sin, () => {
    const m = R.comoMediaDeLaBurbuja({ url: suya("u1", "a.pdf"), nombre: "a.pdf", mime: null, tamano: 0, tipo: "document" });
    assert.deepEqual(m, { type: "document", url: suya("u1", "a.pdf"), mimeType: "application/octet-stream", fileName: "a.pdf" });
});

/* ── La subida desde el navegador ── */

const dataUrl = (mime, texto) => `data:${mime};base64,${Buffer.from(texto).toString("base64")}`;

function pedirFalso({ fallaEn = -1 } = {}) {
    const llamadas = [];
    let n = 0;
    const pedir = async (url, init) => {
        llamadas.push({ url, init });
        if (url === "/api/upload") {
            const i = n++;
            if (i === fallaEn) return { ok: false, status: 500, json: async () => ({ error: "API UPLOAD - error al subir el archivo." }) };
            const archivo = init.body.get("file");
            return {
                ok: true,
                status: 200,
                json: async () => ({ url: suya(init.body.get("userID"), `${i}-${archivo.name}`) }),
            };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    return { pedir, llamadas };
}

test("subir: cada archivo va a /api/upload en la carpeta de las notas, con la cuenta, y vuelve con su dirección", sin, async () => {
    const { pedir, llamadas } = pedirFalso();
    const r = await U.subirLosAdjuntosDeLaNota(
        [
            { dataUrl: dataUrl("image/png", "PNG"), mimeType: "image/png", fileName: "foto.png" },
            { dataUrl: dataUrl("audio/webm;codecs=opus", "AUDIO"), mimeType: "audio/webm;codecs=opus", fileName: "audio-1.webm" },
        ],
        "cuenta-9",
        pedir,
    );
    assert.equal(r.ok, true);
    assert.equal(r.adjuntos.length, 2);
    assert.equal(llamadas.length, 2);
    for (const l of llamadas) {
        assert.equal(l.init.body.get("userID"), "cuenta-9");
        assert.equal(l.init.body.get("workflowID"), "notas-internas");
    }
    assert.equal(r.adjuntos[1].mime, "audio/webm", "el tipo va sin códecs");
    assert.equal(r.adjuntos[0].tamano, 3);
    assert.equal(R.comoSeGuardanLosAdjuntosDeLaNota(r.adjuntos, BUCKET).rechazados, 0, "lo que sube lo acepta la acción");
});

test("subir: un archivo que pasa del tope se dice ANTES de subir nada", sin, async () => {
    const { pedir, llamadas } = pedirFalso();
    const enorme = `data:application/pdf;base64,${"A".repeat(Math.ceil((26 * 1024 * 1024 * 4) / 3))}`;
    const r = await U.subirLosAdjuntosDeLaNota(
        [
            { dataUrl: dataUrl("image/png", "PNG"), mimeType: "image/png", fileName: "foto.png" },
            { dataUrl: enorme, mimeType: "application/pdf", fileName: "libro.pdf" },
        ],
        "cuenta-9",
        pedir,
    );
    assert.equal(r.ok, false);
    assert.match(r.message, /libro\.pdf/);
    assert.match(r.message, /máximo/);
    assert.equal(llamadas.length, 0, "no se subió ni el primero");
});

test("subir: si el segundo falla, el primero se SUELTA del bucket y se dice qué falló", sin, async () => {
    const { pedir, llamadas } = pedirFalso({ fallaEn: 1 });
    const r = await U.subirLosAdjuntosDeLaNota(
        [
            { dataUrl: dataUrl("image/png", "PNG"), mimeType: "image/png", fileName: "foto.png" },
            { dataUrl: dataUrl("application/pdf", "PDF"), mimeType: "application/pdf", fileName: "contrato.pdf" },
        ],
        "cuenta-9",
        pedir,
    );
    assert.equal(r.ok, false);
    assert.match(r.message, /error al subir/i);
    const borrados = llamadas.filter((l) => l.url === "/api/upload/borrar");
    assert.equal(borrados.length, 1, "lo subido no se queda huérfano");
    assert.ok(JSON.parse(borrados[0].init.body).url.includes("foto.png"));
});

test("subir: sin cuenta no sube; sin archivos no hace nada", sin, async () => {
    const { pedir, llamadas } = pedirFalso();
    assert.deepEqual(await U.subirLosAdjuntosDeLaNota([], "c", pedir), { ok: true, adjuntos: [] });
    const r = await U.subirLosAdjuntosDeLaNota([{ dataUrl: dataUrl("image/png", "x"), mimeType: "image/png", fileName: "x.png" }], "", pedir);
    assert.equal(r.ok, false);
    assert.equal(llamadas.length, 0);
});

/* ── El barrido del código ── */

test("la acción vuelve a comprobar cada archivo, y nota y archivos se guardan en UNA transacción", sin, () => {
    const a = leer("actions/internal-notes-actions.ts");
    assert.match(a, /comoSeGuardanLosAdjuntosDeLaNota\(/);
    assert.match(a, /laCuentaDelArchivoDeLaNota\(/);
    assert.match(a, /laCuentaDeLaAccion\(carpeta\)/, "la carpeta del archivo pasa por la puerta de siempre");
    assert.match(a, /db\.\$transaction\(async \(tx\) => \{[\s\S]*?internalNote\.create[\s\S]*?guardarLosAdjuntosDeLaNota\(tx/);
    assert.match(a, /rechazados > 0[\s\S]{0,400}return \{ success: false/, "un archivo que no vale no se guarda sin él");
    // Borrar: archivos y nota juntos, y luego el bucket.
    assert.match(a, /quitarLosAdjuntosDeLaNota\(tx, noteId\)[\s\S]*?internalNote\.delete[\s\S]*?soltarLosArchivosDelBucket\(adjuntos\)/);
    // La bandeja lee la nota que es solo un archivo.
    assert.match(a, /CASE WHEN btrim\(n\."content"\) = ''/);
});

test("la tabla de adjuntos es NUESTRA: se crea por ddl-sin-bloquear y no está en el esquema de Prisma", sin, () => {
    const db = leer("lib/adjuntos-de-la-nota-db.ts");
    assert.match(db, /asegurarTabla\(/);
    assert.match(db, /asegurarIndice\(/);
    assert.ok(!/REFERENCES/i.test(db), "sin clave foránea: internal_notes es del backend");
    assert.ok(!/adjuntos_de_notas|AdjuntosDeNotas/.test(leer("prisma/schema.prisma")), "el esquema lo migra el backend");
    assert.match(leer("lib/ddl-sin-bloquear.ts"), /export async function asegurarTabla/);
});

test("la caja de escribir y la burbuja usan los archivos de la nota", sin, () => {
    const caja = leer("app/(root)/chats/_components/ChatInputBar.tsx");
    assert.match(caja, /conVideo=\{noteMode\}/, "el video se ofrece solo en una nota");
    assert.match(caja, /deshabilitado: noteMode \? \(!notaConAlgo \|\| isSending\)/, "con un archivo la nota se puede guardar sin texto, y mientras sube no se guarda otra");
    assert.match(caja, /data-adjuntar-audio-a-la-nota/, "grabar dentro de una nota no se manda al cliente");
    const main = leer("app/(root)/chats/_components/chat-main.tsx");
    assert.match(main, /subirLosAdjuntosDeLaNota\(composeMediaList/);
    assert.match(main, /createInternalNoteAction\(\{[\s\S]*?adjuntos: subidos/);
    assert.match(main, /noteAdjuntos: n\.adjuntos/);
    const burbuja = leer("app/(root)/chats/_components/InternalNoteBubble.tsx");
    assert.match(burbuja, /<MediaRenderer media=\{comoMediaDeLaBurbuja\(a\)\}/);
    assert.match(burbuja, /data-nota-descargar/);
    const lista = leer("app/(root)/chats/_components/ChatMessageList.tsx");
    assert.match(lista, /adjuntos=\{message\.noteAdjuntos\}/);
});
