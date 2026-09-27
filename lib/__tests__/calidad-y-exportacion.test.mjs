/**
 * Calidad de conversaciones y exportación: las REGLAS, sin base y sin IA, y un
 * BARRIDO del código.
 *
 * Lo que se prueba aquí es lo que decide: cómo sale una conversación en texto
 * (el formato de «Exportar chat» de WhatsApp), que el `.zip` es un zip de
 * verdad —lo abre el `zipfile` de Python, un lector que no es el nuestro—, y
 * la rúbrica: qué tiempo se mide, cómo se reparte el peso cuando un criterio
 * no se puede medir y qué se marca como ejemplo a mejorar.
 *
 * `MODO=roto` corre las formas INGENUAS escritas aquí dentro y AFIRMA el fallo:
 * la primera respuesta contada con la IA a nombre del asesor, el criterio sin
 * medir contado como cero, y la exportación que se lleva las notas internas.
 * Y el barrido lee el código de ANTES_REF (pinchado, nunca `origin/main`) y
 * afirma que allí no había ni exportación ni calidad.
 *
 * Se levanta con `scripts/banco-calidad-y-exportacion.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as L from "./.compilado/calidad/conversacion-legible.js";
import * as Z from "./.compilado/calidad/zip-sencillo.js";
import * as Q from "./.compilado/calidad/calidad-de-conversaciones.js";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "aecdcef";

const ahora = new Date("2026-09-27T19:00:00Z");
const T0 = Math.floor(new Date("2026-09-27T14:05:00Z").getTime() / 1000);

/* ─────────────────────────── exportación ─────────────────────────── */

const mensajes = [
    { ts: T0 + 60, quien: "ia", texto: "¡Hola Juan! Sí, enviamos a todo el país.", tipo: "conversation" },
    { ts: T0, quien: "contacto", texto: "Hola, ¿tienen envíos a Cali?", tipo: "conversation" },
    { ts: T0 + 120, quien: "asesor", texto: "Solo para el equipo", tipo: "conversation", notaInterna: true },
    { ts: T0 + 180, quien: "contacto", texto: "", tipo: "imageMessage", mediaUrl: "https://s3.test/foto.jpg" },
    { ts: T0 + 240, quien: "contacto", texto: "", tipo: "audioMessage", transcripcion: "quiero dos cajas" },
    { ts: T0 + 300, quien: "asesor", texto: "Listo, ya te lo envío", tipo: "conversation" },
    { ts: T0 + 360, quien: "contacto", texto: "", tipo: "conversation", eliminado: true },
];

test("una conversación sale como el «Exportar chat» de WhatsApp, en orden y con cada uno firmando", () => {
    const txt = L.formatearConversacion(
        { contacto: "Juan Pérez", numero: "+573001112233", linea: "Verzay Ventas", mensajes },
        { exportadaEn: ahora, zonaHoraria: "America/Bogota" },
    );
    const lineas = txt.split("\n");
    assert.equal(lineas[0], "Conversación con Juan Pérez (+573001112233)");
    assert.ok(txt.includes("27/09/2026, 09:05 - Juan Pérez: Hola, ¿tienen envíos a Cali?"), txt);
    assert.ok(txt.includes("27/09/2026, 09:06 - Agente IA: ¡Hola Juan!"));
    assert.ok(txt.includes("Verzay Ventas: Listo, ya te lo envío"), "lo del asesor lo firma la línea");
    assert.ok(txt.includes("<Imagen> https://s3.test/foto.jpg"), "un adjunto se nombra, con su enlace");
    assert.ok(txt.includes("<Nota de voz> (Transcripción: quiero dos cajas)"));
    assert.ok(txt.includes("Se eliminó este mensaje."));
    // El orden es el del reloj, no el del lector (que lee de lo nuevo a lo viejo).
    assert.ok(txt.indexOf("Hola, ¿tienen") < txt.indexOf("¡Hola Juan!"));
});

test("las notas internas NO salen: esto se exporta para dárselo a alguien", () => {
    const txt = L.formatearConversacion({ contacto: "Juan", mensajes }, { exportadaEn: ahora });
    if (ROTO) {
        // La forma ingenua: todos los mensajes tal cual, nota incluida.
        const ingenua = mensajes.map((m) => m.texto).join("\n");
        assert.ok(ingenua.includes("Solo para el equipo"), "EL FALLO: la nota interna se va con el archivo");
        return;
    }
    assert.ok(!txt.includes("Solo para el equipo"));
});

test("en un grupo cada entrante lo firma quien lo escribió", () => {
    const ev = { key: { fromMe: false }, pushName: "Ana", messageTimestamp: T0, messageType: "conversation", message: { conversation: "hola" } };
    const m = L.aMensajeLegible(ev, { esGrupo: true });
    const txt = L.formatearConversacion({ contacto: "Grupo Ventas", mensajes: [m] }, { exportadaEn: ahora, zonaHoraria: "UTC" });
    assert.ok(txt.includes(" - Ana: hola"), txt);
});

test("aMensajeLegible lee lo que devuelve el lector de la base: IA, asesor, contacto, milisegundos", () => {
    assert.equal(L.aMensajeLegible({ key: { fromMe: true }, sentByAi: true, messageTimestamp: T0 }).quien, "ia");
    assert.equal(L.aMensajeLegible({ key: { fromMe: true }, messageTimestamp: T0 }).quien, "asesor");
    assert.equal(L.aMensajeLegible({ key: { fromMe: false }, messageTimestamp: T0 * 1000 }).ts, T0, "ms pasa a s");
    const doc = L.aMensajeLegible({ key: {}, messageType: "documentMessage", message: { documentMessage: { fileName: "cot.pdf" } }, messageTimestamp: T0 });
    assert.equal(L.elCuerpoDelMensaje(doc), "<Documento: cot.pdf>");
});

test("un correo sale con sus cabeceras y, si solo trae HTML, con su texto limpio", () => {
    const txt = L.formatearCorreo(
        { de: "Ana", deDireccion: "ana@x.com", para: "yo@x.com", asunto: "Cotización", fecha: "2026-09-27T14:05:00Z",
          texto: null, html: "<style>p{}</style><p>Hola&nbsp;Carlos</p><p>Adjunto la cotización</p>", adjuntos: [{ nombre: "c.pdf" }] },
        { exportadaEn: ahora, zonaHoraria: "UTC" },
    );
    assert.ok(txt.startsWith("Asunto: Cotización\nDe: Ana <ana@x.com>\nPara: yo@x.com"), txt);
    assert.ok(txt.includes("Adjuntos: c.pdf"));
    assert.ok(txt.includes("Hola Carlos\nAdjunto la cotización"), txt);
    assert.ok(!txt.includes("<p>") && !txt.includes("p{}"));
});

test("los nombres de archivo abren en cualquier sistema y no se pisan dentro del zip", () => {
    assert.equal(L.elNombreDelArchivoDelChat('Juan/Pérez: "VIP"', null), "Chat con Juan Pérez VIP.txt");
    const r = L.sinNombresRepetidos([{ nombre: "Chat con Juan.txt" }, { nombre: "Chat con Juan.txt" }, { nombre: "chat con juan.txt" }]);
    assert.deepEqual(r.map((a) => a.nombre), ["Chat con Juan.txt", "Chat con Juan (2).txt", "chat con juan (3).txt"]);
});

test("el .zip es un zip de verdad: lo abre un lector que no es el nuestro, con acentos y CRC", () => {
    const zip = Z.crearZip([
        { nombre: "Chat con José.txt", contenido: "hola ñandú\n" },
        { nombre: "Chat con Ana.txt", contenido: "x".repeat(5000) },
    ]);
    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    const ruta = join(dir, "a.zip");
    writeFileSync(ruta, zip);
    const salida = execFileSync("python3", ["-c", `
import zipfile,sys,json
z=zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
print(json.dumps({n: z.read(n).decode('utf-8') for n in z.namelist()}))
`, ruta]).toString();
    const leido = JSON.parse(salida);
    assert.equal(leido["Chat con José.txt"], "hola ñandú\n");
    assert.equal(leido["Chat con Ana.txt"].length, 5000);
    assert.equal(Z.crc32(new TextEncoder().encode("123456789")), 0xcbf43926, "el CRC32 de referencia");
});

/* ─────────────────────────── calidad ─────────────────────────── */

const conv = [
    { ts: 1000, deLaCuenta: false, porIa: false, texto: "hola, necesito ayuda" },
    { ts: 1010, deLaCuenta: true, porIa: true, texto: "¡Hola! Te paso con un asesor" },
    { ts: 1000 + 45 * 60, deLaCuenta: true, porIa: false, texto: "Hola, soy Ana, ¿en qué te ayudo?" },
    { ts: 1000 + 50 * 60, deLaCuenta: false, porIa: false, texto: "gracias" },
];

test("la primera respuesta de un ASESOR es la de una persona, no la de la IA", () => {
    const t = Q.medirTiempos(conv, { tieneAsesor: true });
    if (ROTO) {
        // La forma ingenua: la primera saliente, sea de quien sea.
        const ingenua = conv.find((m) => m.deLaCuenta).ts - conv[0].ts;
        assert.equal(ingenua, 10, "EL FALLO: se le regalan 10 s de la IA a un asesor que tardó 45 min");
        return;
    }
    assert.equal(t.responsable, "asesor");
    assert.equal(t.primeraRespuestaSeg, 45 * 60);
});

test("sin asesor y solo con la IA, la nota es de la IA y cuenta su respuesta", () => {
    const t = Q.medirTiempos(conv.slice(0, 2), { tieneAsesor: false });
    assert.equal(t.responsable, "ia");
    assert.equal(t.primeraRespuestaSeg, 10);
    const s = Q.medirTiempos(conv, { tieneAsesor: false });
    assert.equal(s.responsable, "sin_asignar", "contestó una persona sin estar asignada");
});

test("la resolución: por la marca de resuelta, o por el último mensaje si la IA dice que se resolvió", () => {
    assert.equal(Q.medirTiempos(conv, { tieneAsesor: true, resueltaEnTs: 1000 + 3600 }).resolucionSeg, 3600);
    assert.equal(Q.medirTiempos(conv, { tieneAsesor: true, resolvioSegunLaIa: "si" }).resolucionSeg, 45 * 60);
    assert.equal(Q.medirTiempos(conv, { tieneAsesor: true, resolvioSegunLaIa: "no" }).resolucionSeg, null);
});

test("un criterio que no se puede medir se saca de la cuenta, no vale cero", () => {
    const ia = { saludo: 100, tono: 100, resolvio: "si", mejora: "" };
    const p = Q.calcularPuntaje(ia, { primeraRespuestaSeg: null, resolucionSeg: null });
    if (ROTO) {
        const ingenua = Math.round((15 * 100 + 25 * 100 + 35 * 100 + 15 * 0 + 10 * 0) / 100);
        assert.equal(ingenua, 75, "EL FALLO: una atención impecable sale en 75 por lo que no se pudo medir");
        return;
    }
    assert.equal(p, 100);
    assert.equal(Q.calcularPuntaje({ saludo: null, tono: null, resolvio: null, mejora: "" }, { primeraRespuestaSeg: null, resolucionSeg: null }), null);
    // Pesos: todo medido.
    const todo = Q.calcularPuntaje({ saludo: 0, tono: 100, resolvio: "no", mejora: "" }, { primeraRespuestaSeg: 60, resolucionSeg: 30 * 3600 });
    assert.equal(todo, Math.round((0 * 15 + 100 * 25 + 0 * 35 + 100 * 15 + 20 * 10) / 100));
    assert.equal(Q.esEjemploAMejorar(todo), true);
    assert.equal(Q.esEjemploAMejorar(null), false, "sin puntaje no es un ejemplo de nada");
});

test("la respuesta de la IA no se da por buena: JSON envuelto, cadenas, fuera de rango", () => {
    const r = Q.leerLaEvaluacionDeLaIa('Claro:\n```json\n{"saludo":"120","tono":-5,"resolvio":"Sí","mejora":"Saluda por el nombre."}\n```');
    assert.deepEqual(r, { saludo: 100, tono: 0, resolvio: "si", mejora: "Saluda por el nombre." });
    assert.deepEqual(Q.leerLaEvaluacionDeLaIa("no sé"), { saludo: null, tono: null, resolvio: null, mejora: "" });
    assert.equal(Q.leerLaEvaluacionDeLaIa('{"resolvio":"quizás"}').resolvio, null);
});

test("lo que ve la IA: los más recientes, con quién habla, recortado por el PRINCIPIO", () => {
    const largo = Array.from({ length: 200 }, (_, i) => ({ ts: i, deLaCuenta: i % 2 === 1, porIa: false, texto: `m${i} ` + "x".repeat(100) }));
    const t = Q.laTranscripcionParaEvaluar(largo);
    assert.ok(t.length <= Q.CARACTERES_A_EVALUAR);
    assert.ok(t.includes("m199"), "el final se conserva");
    assert.ok(!t.includes("m10 "), "lo viejo se pierde");
    assert.ok(Q.laTranscripcionParaEvaluar(conv).startsWith("CLIENTE: hola, necesito ayuda\nAGENTE IA:"));
});

test("el reparto por asesor: promedios solo de lo medido, y el peor arriba", () => {
    const f = (asesorId, responsable, puntaje, pr, ejemplo) => ({ asesorId, responsable, puntaje, primeraRespuestaSeg: pr, resolucionSeg: null, ejemplo });
    const g = Q.agruparPorAsesor([
        f("ana", "asesor", 90, 60, false),
        f("ana", "asesor", 70, null, false),
        f("luis", "asesor", 40, 600, true),
        f(null, "ia", 80, 5, false),
    ]);
    assert.deepEqual(g.map((a) => a.clave), ["luis", "ana", "ia"]);
    const ana = g.find((a) => a.clave === "ana");
    assert.equal(ana.puntajePromedio, 80);
    assert.equal(ana.primeraRespuestaPromedioSeg, 60, "la que no tiene primera respuesta no lo baja a cero");
    assert.equal(g.find((a) => a.clave === "luis").aMejorar, 1);
    assert.equal(Q.laDuracionLegible(3 * 3600 + 20 * 60), "3 h 20 min");
    assert.equal(Q.laDuracionLegible(null), "—");
});

/* ─────────────────────────── barrido ─────────────────────────── */

function leer(ruta, ref) {
    if (!ref) return readFileSync(ruta, "utf8");
    try {
        return execFileSync("git", ["show", `${ref}:${ruta}`], { stdio: ["ignore", "pipe", "ignore"] }).toString();
    } catch {
        return "";
    }
}

test("barrido: los tres sitios de Chats y los tres de Correo exportan por UN camino cada uno", () => {
    const ref = ROTO ? ANTES_REF : null;
    const cabecera = leer("app/(root)/chats/_components/ChatHeader.tsx", ref);
    const lote = leer("app/(root)/chats/_components/chat-sidebar.tsx", ref);
    const calidad = leer("app/(root)/crm/dashboard/components/CalidadView.tsx", ref);
    const lectura = leer("app/(root)/correo/_components/LecturaDelCorreo.tsx", ref);
    const bandeja = leer("app/(root)/correo/_components/CorreoClient.tsx", ref);
    if (ROTO) {
        // EL FALLO: antes no había forma de exportar nada, ni en Chats ni en Correo.
        for (const f of [cabecera, lote, lectura, bandeja]) assert.ok(!/useExportar(Conversaciones|Correos)/.test(f));
        assert.equal(calidad, "", "y no existía la vista de calidad");
        return;
    }
    for (const f of [cabecera, lote, calidad]) assert.ok(f.includes("useExportarConversaciones"), "Chats: un camino");
    for (const f of [lectura, bandeja]) assert.ok(f.includes("useExportarCorreos"), "Correo: un camino");
    // Nadie llama a la acción a mano: se va por el hook, que es el que avisa y descarga.
    for (const f of [cabecera, lote, calidad, lectura, bandeja]) {
        assert.ok(!/exportar(Conversaciones|Correos)Action\(/.test(f));
    }
});

test("barrido: el runner NO es una acción, las acciones no aceptan un userId, y lo lanza el corte semanal", () => {
    const runner = leer("lib/calidad-runner.server.ts");
    assert.ok(runner.startsWith('import "server-only"'), "un runner de sistema no es un endpoint");
    const acciones = leer("actions/calidad-actions.ts");
    assert.ok(acciones.startsWith('"use server"'));
    assert.ok(acciones.includes("lasCuentasQueConsultaElCrm"), "la puerta del CRM, la misma de las otras vistas");
    assert.ok(acciones.includes("isAdvisorAccount(user) && !isAdvisorAdmin(user)"), "un agente no ve la calidad del equipo");
    assert.ok(!/userId\s*:/.test(acciones.split("export async function")[1] ?? ""), "no recibe userId");
    const cron = leer("app/api/cron/billing/route.ts");
    assert.ok(!cron.includes("lanzarElBarridoDeCalidad"), "el QA ya no corre cada día desde el cron de facturación");
    assert.ok(leer("lib/weekly-report-runner.server.ts").includes("evaluarLaCalidadDeLaCuenta("), "lo lanza el corte semanal del reporte");
    const exportar = leer("actions/exportar-conversaciones-actions.ts");
    assert.ok(exportar.includes("getAssociatedAccountIds"), "la puerta de la bandeja");
    assert.ok(leer("lib/navigation-routes.ts").includes('"/crm/calidad"'));
    // Toda consulta de CRM excluye los grupos.
    assert.ok(leer("lib/calidad-db.ts").includes('sinGruposSql("c")'));
});
