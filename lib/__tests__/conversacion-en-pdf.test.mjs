/**
 * Exportar una conversación en PDF, en Node y sin base: las reglas puras y el
 * PDF de verdad, leído con pdf.js —un lector que no es el nuestro—.
 *
 * Lo que se comprueba:
 *
 * - que el PDF lleva el nombre del negocio, el contacto y TODO lo que lleva el
 *   `.txt` —los mismos mensajes, sin la nota interna— con cada tipo pintado:
 *   imagen incrustada, video, nota de voz (duración y transcripción),
 *   documento, ubicación, contacto, sticker, llamada y el eliminado;
 * - que lo del contacto va a la IZQUIERDA y lo de la cuenta a la DERECHA;
 * - que los adjuntos llevan su enlace pulsable, y que una imagen que no es de
 *   nuestro almacenamiento no se incrusta: va como tarjeta con su enlace;
 * - que un emoji no tumba el PDF, y que un mensaje enorme se parte en páginas;
 * - y que el `.txt` sale IGUAL que antes (`ANTES_REF`).
 *
 * `MODO=roto` lee el código de `ANTES_REF` y afirma que no había PDF: ni
 * formato que elegir, ni generador, y que la descarga le ponía el BOM de
 * texto a todo —un PDF así ya no es un PDF—.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF;
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMP = join(AQUI, ".compilado", "pdf");

const antes = (ruta) => {
    try {
        return execFileSync("git", ["show", `${ANTES_REF}:${ruta}`], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};

if (ROTO) {
    test(`ANTES (${ANTES_REF}): no había forma de exportar en PDF`, () => {
        assert.equal(antes("lib/conversacion-en-pdf.ts"), null, "no había generador de PDF");
        assert.equal(antes("lib/formatos-de-exportacion.ts"), null, "no había formato que elegir");
        const accion = antes("actions/exportar-conversaciones-actions.ts");
        assert.ok(accion, "la acción existía");
        assert.doesNotMatch(accion, /pdf/i, "la acción solo sabía de texto");
        const descarga = antes("lib/descargar-exportacion.ts");
        assert.match(descarga, /new Blob\(\[BOM \+ archivos\[0\]\.contenido\]/, "la descarga le ponía el BOM de texto a todo");
        const cabecera = antes("app/(root)/chats/_components/ChatHeader.tsx");
        assert.doesNotMatch(cabecera, /OpcionesDeExportar|MenuDeExportar/, "la cabecera exportaba directo a texto");
    });
} else {
    const require = createRequire(import.meta.url);
    const pdfjs = require(join(RAIZ, "node_modules/pdfjs-dist/legacy/build/pdf.js"));
    const pdf = await import(join(COMP, "conversacion-en-pdf.js"));
    const legible = await import(join(COMP, "conversacion-legible.js"));
    const formatos = await import(join(COMP, "formatos-de-exportacion.js"));
    const descarga = await import(join(COMP, "descargar-exportacion.js"));
    const M = await import(join(AQUI, "conversacion-en-pdf", "muestra.mjs"));

    async function leer(bytes) {
        const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false, standardFontDataUrl: join(RAIZ, "node_modules/pdfjs-dist/standard_fonts") + "/" }).promise;
        const paginas = [];
        for (let i = 1; i <= doc.numPages; i++) {
            const p = await doc.getPage(i);
            const tc = await p.getTextContent();
            const items = tc.items.map((it) => ({ texto: it.str, x: it.transform[4], y: it.transform[5], ancho: it.width }));
            const anotaciones = await p.getAnnotations();
            const ops = await p.getOperatorList();
            const imagenes = ops.fnArray.filter((f) => f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintJpegXObject).length;
            paginas.push({ items, texto: items.map((i) => i.texto).join("\n"), anotaciones, imagenes });
        }
        return { paginas, todo: paginas.map((p) => p.texto).join("\n"), numPages: doc.numPages };
    }

    const opciones = async (extra = {}) => ({
        exportadaEn: new Date(Date.UTC(2026, 8, 27, 19, 5)),
        zonaHoraria: "America/Bogota",
        marca: { nombre: "Tienda El Sol", logo: await M.logoDePrueba() },
        imagenes: new Map([[M.IMAGEN_NUESTRA, await M.imagenDePrueba()]]),
        ...extra,
    });

    test("los formatos: PDF primero, texto plano después, y lo raro es texto", () => {
        assert.deepEqual(formatos.FORMATOS_DE_EXPORTACION.map((f) => f.clave), ["pdf", "txt"]);
        assert.equal(formatos.comoFormatoDeExportacion("pdf"), "pdf");
        for (const raro of ["txt", "PDF", undefined, null, 3, "docx"]) assert.equal(formatos.comoFormatoDeExportacion(raro), "txt");
    });

    test("el texto imprimible: los acentos se quedan, los emojis se van, y solo-emoji dice (emoji)", () => {
        assert.equal(pdf.aTextoImprimible("¿Añadir ñandú? «sí» — 5 €"), "¿Añadir ñandú? «sí» — 5 €");
        assert.equal(pdf.aTextoImprimible("Hola 😀 amigo"), "Hola amigo");
        assert.equal(pdf.aTextoImprimible("👍🏽"), "(emoji)");
        assert.equal(pdf.aTextoImprimible("中文 ok").trim(), "ok", "lo que WinAnsi no sabe se quita sin tumbar nada");
        assert.ok(!/[^\n\x20-\x7e\xa0-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/.test(pdf.aTextoImprimible("a​b c\tčd")));
        assert.equal(pdf.aTextoImprimible(""), "");
    });

    test("envolver: ninguna línea se sale, los saltos se respetan y una palabra larga se corta", () => {
        const medir = (s) => s.length * 5;
        const lineas = pdf.envolverTexto("uno dos tres\n\ncuatro " + "x".repeat(40), 50, medir);
        assert.ok(lineas.every((l) => medir(l) <= 50), JSON.stringify(lineas));
        assert.equal(lineas[0], "uno dos");
        assert.ok(lineas.includes(""), "el párrafo en blanco se queda");
        assert.equal(lineas.join("").replace(/\s/g, "").length, "unodostrescuatro".length + 40);
    });

    test("de qué lado va cada uno: el contacto a la izquierda, la cuenta a la derecha, la IA en otro color", () => {
        assert.equal(pdf.elLadoYElColor("contacto").lado, "izquierda");
        assert.equal(pdf.elLadoYElColor("asesor").lado, "derecha");
        assert.equal(pdf.elLadoYElColor("ia").lado, "derecha");
        assert.notEqual(pdf.elLadoYElColor("ia").color, pdf.elLadoYElColor("asesor").color);
    });

    test("solo se incrusta lo de NUESTRO almacenamiento", () => {
        assert.equal(pdf.seDejaIncrustar(M.IMAGEN_NUESTRA, M.S3), true);
        for (const fuera of [
            M.IMAGEN_AJENA,
            "https://s3.banco.test.malo.com/x.jpg",
            "https://usuario:clave@s3.banco.test/x.jpg",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "http://169.254.169.254/latest",
            "",
            null,
        ]) {
            assert.equal(pdf.seDejaIncrustar(fuera, M.S3), false, String(fuera));
        }
        assert.equal(pdf.seDejaIncrustar(M.IMAGEN_NUESTRA, undefined), false, "sin almacenamiento configurado, nada");
        assert.deepEqual(pdf.lasImagenesQueSePiden(M.MENSAJES, M.S3, 10), [M.IMAGEN_NUESTRA]);
        assert.deepEqual(pdf.lasImagenesQueSePiden(M.MENSAJES, M.S3, 0), [], "con el tope agotado no se pide ninguna");
    });

    test("la pieza de cada tipo: nada se esconde", () => {
        const hay = (u) => u === M.IMAGEN_NUESTRA;
        const por = Object.fromEntries(M.MENSAJES.map((m) => [m.tipo + (m.eliminado ? ":x" : "") + (m.mediaUrl === M.IMAGEN_AJENA ? ":ajena" : ""), pdf.laPiezaDelMensaje(m, hay)]));
        assert.equal(por["conversation"].clase, "texto");
        assert.equal(por["conversation:x"].clase, "eliminado");
        assert.deepEqual(por["imageMessage"], { clase: "imagen", url: M.IMAGEN_NUESTRA });
        assert.equal(por["imageMessage:ajena"].clase, "tarjeta", "sin descargar: tarjeta con su enlace");
        assert.equal(por["imageMessage:ajena"].enlace, M.IMAGEN_AJENA);
        assert.equal(por["videoMessage"].icono, "video");
        assert.equal(por["audioMessage"].detalle, "0:23");
        assert.equal(por["documentMessage"].titulo, "Documento: cotizacion-2026.pdf");
        for (const [tipo, icono] of [["locationMessage", "ubicacion"], ["contactMessage", "contacto"], ["call", "llamada"]]) {
            assert.equal(por[tipo].icono, icono);
        }
        assert.equal(pdf.laDuracion(3725), "1:02:05");
        assert.equal(pdf.laDuracion(0), null);
        assert.equal(pdf.lasIniciales("Tienda El Sol"), "TE");
        assert.equal(pdf.lasIniciales("😀"), "?");
    });

    test("el PDF: la marca, el contacto y TODOS los mensajes del .txt, con cada tipo pintado", async () => {
        const bytes = await pdf.conversacionEnPdf(M.CONVERSACION, await opciones());
        assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
        const r = await leer(bytes);
        const p1 = r.paginas[0].texto;
        assert.match(p1, /Tienda El Sol/);
        assert.match(p1, /Conversación con Juan Pérez \(\+573001112233\)/);
        assert.match(p1, /Línea: Línea de Ventas/);
        const exportados = legible.losMensajesQueSeExportan(M.MENSAJES);
        assert.match(p1, new RegExp(`${exportados.length} mensajes`), "el mismo número de mensajes que el .txt");
        for (const t of [
            "Hola, ¿tienen envíos a Cali?",
            "¡Hola Juan! Sí, enviamos a todo el país.",
            "Soy Ana, del equipo de ventas. Te paso el catálogo.",
            "Así la quiero",
            "Mira cómo se arma",
            "Nota de voz",
            "0:23",
            "Transcripción: quiero dos unidades para el viernes",
            "Documento: cotizacion-2026.pdf",
            "Ubicación",
            "Contacto",
            "Sticker",
            "Llamada",
            "Se eliminó este mensaje.",
            "21/09/2026",
            "22/09/2026",
            "Línea 1 de un mensaje enorme.",
            "Línea 140 de un mensaje enorme.",
            "Agente IA",
        ]) {
            assert.ok(r.todo.includes(t), `falta «${t}»`);
        }
        assert.ok(!r.todo.includes("NOTA INTERNA"), "la nota interna NO sale, igual que en el .txt");
        assert.ok(!r.todo.includes("algo que se borró"), "lo borrado no se enseña");
        assert.ok(r.numPages >= 3, "el mensaje enorme se parte en páginas");
        assert.ok(r.todo.includes(`Página ${r.numPages} de ${r.numPages}`));
    });

    test("izquierda y derecha: se mide dónde cae cada texto", async () => {
        const r = await leer(await pdf.conversacionEnPdf(M.CONVERSACION, await opciones()));
        const items = r.paginas[0].items;
        const buscar = (t) => items.find((i) => i.texto.startsWith(t));
        const contacto = buscar("Hola, ¿tienen envíos");
        const ia = buscar("¡Hola Juan!");
        const asesor = buscar("Soy Ana");
        const bordeIzq = pdf.MARGEN + 8;
        const bordeDer = pdf.ANCHO_DE_PAGINA - pdf.MARGEN - 8;
        assert.ok(Math.abs(contacto.x - bordeIzq) < 1, `el contacto arranca en el margen izquierdo (${contacto.x})`);
        for (const [n, it] of [["ia", ia], ["asesor", asesor]]) {
            assert.ok(it.x > pdf.ANCHO_DE_PAGINA * (1 - pdf.PROPORCION_DE_LA_BURBUJA) - 1, `${n} va a la derecha (${it.x})`);
            // pdf.js mide con sus propias métricas de Helvetica: unos puntos de holgura.
            assert.ok(it.x + it.ancho <= bordeDer + 4, `${n} no se sale de su burbuja (${it.x + it.ancho})`);
        }
        for (const p of r.paginas) {
            for (const it of p.items) assert.ok(it.x >= pdf.MARGEN - 1 && it.x + it.ancho <= pdf.ANCHO_DE_PAGINA - pdf.MARGEN + 1, `«${it.texto}» se sale de la página`);
        }
    });

    test("imágenes y enlaces: la nuestra incrustada, las demás con su enlace pulsable", async () => {
        const r = await leer(await pdf.conversacionEnPdf(M.CONVERSACION, await opciones()));
        assert.equal(r.paginas[0].imagenes, 2, "el logo y la foto del cliente");
        const urls = r.paginas.flatMap((p) => p.anotaciones.filter((a) => a.subtype === "Link").map((a) => a.url));
        for (const u of [M.IMAGEN_NUESTRA, M.IMAGEN_AJENA, M.VIDEO, M.AUDIO, M.DOCUMENTO]) assert.ok(urls.includes(u), `falta el enlace ${u}`);
        // Sin imágenes descargadas nada se incrusta, pero todo sigue enlazado.
        const sin = await leer(await pdf.conversacionEnPdf(M.CONVERSACION, await opciones({ imagenes: new Map(), marca: { nombre: "Tienda El Sol" } })));
        assert.equal(sin.paginas[0].imagenes, 0);
        assert.ok(sin.paginas[0].texto.includes("TE"), "sin logo, las iniciales del negocio");
        assert.ok(sin.paginas.flatMap((p) => p.anotaciones).some((a) => a.url === M.IMAGEN_NUESTRA));
        // Una imagen corrupta tampoco tumba el PDF.
        const rota = await pdf.conversacionEnPdf(M.CONVERSACION, await opciones({ imagenes: new Map([[M.IMAGEN_NUESTRA, { bytes: new Uint8Array([1, 2, 3]), formato: "jpg" }]]) }));
        assert.ok(rota.length > 1000);
    });

    test("sin mensajes, con emojis sueltos y con miles: siempre sale un PDF que se lee", async () => {
        const vacia = await leer(await pdf.conversacionEnPdf({ contacto: "Nadie", mensajes: [] }, await opciones()));
        assert.match(vacia.todo, /no tiene mensajes guardados/);
        const soloEmoji = await leer(
            await pdf.conversacionEnPdf({ contacto: "Juan 😀", mensajes: [{ ts: M.BASE, quien: "contacto", tipo: "conversation", texto: "🙏🙏" }] }, await opciones()),
        );
        assert.match(soloEmoji.todo, /\(emoji\)/);
        const muchos = Array.from({ length: 2000 }, (_, i) => ({ ts: M.BASE + i * 30, quien: i % 3 === 0 ? "contacto" : i % 3 === 1 ? "ia" : "asesor", tipo: "conversation", texto: `mensaje ${i}` }));
        const t0 = Date.now();
        const grande = await leer(await pdf.conversacionEnPdf({ contacto: "Juan", mensajes: muchos }, await opciones()));
        assert.ok(Date.now() - t0 < 20_000, "2000 mensajes en un tiempo razonable");
        assert.ok(grande.todo.includes("mensaje 0") && grande.todo.includes("mensaje 1999"));
    });

    test("la descarga: el PDF va con sus bytes tal cual, el .txt con su BOM", () => {
        const b = descarga.losBytesDelArchivo({ nombre: "a.pdf", contenido: Buffer.from("%PDF-1.7 ñ").toString("base64"), formato: "pdf" });
        assert.ok(b instanceof Uint8Array);
        assert.equal(Buffer.from(b).toString(), "%PDF-1.7 ñ", "sin BOM y sin tocar un byte");
        assert.equal(descarga.losBytesDelArchivo({ nombre: "a.txt", contenido: "hola" }), "﻿hola", "sin formato es texto, como siempre (Correo)");
        assert.equal(pdf.elNombreDelPdfDelChat("Chat con Juan.txt"), "Chat con Juan.pdf");
    });

    test(`el .txt sale IGUAL que antes (${ANTES_REF})`, async () => {
        const viejo = await import(join(COMP, "antes", "conversacion-legible.js"));
        const o = { exportadaEn: new Date(Date.UTC(2026, 8, 27, 19, 5)), zonaHoraria: "America/Bogota" };
        assert.equal(legible.formatearConversacion(M.CONVERSACION, o), viejo.formatearConversacion(M.CONVERSACION, o));
    });
}
