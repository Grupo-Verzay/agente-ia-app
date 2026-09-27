/**
 * La ENCUESTA DE SATISFACCIÓN (NPS): las reglas, puras y sin nada montado.
 *
 * Qué se rompe aquí y por qué se prueba sin base:
 *
 * 1. **Qué respuesta cuenta como puntuación.** Lo que se guarde sale en el NPS
 *    de un asesor, así que tiene que ser inequívoco: un número de un pedido, un
 *    teléfono o «entre 7 y 8» no pueden colarse como una nota.
 * 2. **En qué grupo cae y cómo se calcula el número**, que es lo mismo en la
 *    ficha y en el CRM porque sale de aquí.
 * 3. **Que la pantalla y el servidor usen ESTO**, y no su copia: un barrido del
 *    código lo comprueba.
 *
 * `MODO=roto` no tiene «antes» puro que afirmar —esto es nuevo—; el fallo del
 * «antes» (resolver no preguntaba nada) lo afirma la mitad de Postgres.
 *
 * Se levanta con `scripts/banco-encuesta-de-satisfaccion.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
    laPuntuacionDelTexto,
    laCategoria,
    elResumenNps,
    elNpsPorAsesor,
    laRespuestaEntreLosMensajes,
    elMensajeDeLaEncuesta,
    elNegocioDeLaCuenta,
    ENCUESTA_POR_DEFECTO,
    MENSAJES_QUE_SE_MIRAN,
} from "./.compilado/encuesta/encuesta-de-satisfaccion.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const leer = (f) => fs.readFileSync(join(RAIZ, f), "utf8");

test("apagada por defecto", () => {
    assert.equal(ENCUESTA_POR_DEFECTO.activa, false);
});

test("las respuestas que SÍ son una puntuación", () => {
    const casos = {
        "8": 8, "10": 10, "1": 1, " 9 ": 9, "Le doy un 9": 9, "10/10": 10,
        "9 de 10": 9, "8 sobre 10": 8, "un 7!": 7, "Diez": 10, "ocho": 8,
        "10 👍": 10, "5, regular": 5, "nueve.": 9, "10 excelente servicio": 10,
    };
    for (const [texto, esperado] of Object.entries(casos)) {
        assert.equal(laPuntuacionDelTexto(texto), esperado, `«${texto}»`);
    }
});

test("las que NO: ambiguas, fuera de escala o conversación", () => {
    const casos = [
        "", null, undefined, "0", "11", "15", "entre 7 y 8", "8.5", "7,5",
        "mi pedido es el 12345", "573001112233", "gracias",
        "uno de ustedes me dijo que el precio era otro y quiero confirmar",
        "Hola, quería preguntar si ya tienen disponible la talla 9 en color negro para el modelo que vi",
        "7 u 8", "una pregunta", "uno más", "necesito que me envíen 3 cajas",
        "tengo 2 preguntas sobre el precio del plan",
    ];
    for (const texto of casos) {
        assert.equal(laPuntuacionDelTexto(texto), null, `«${texto}»`);
    }
});

test("categorías: 9-10 promotor, 7-8 pasivo, 1-6 detractor", () => {
    assert.deepEqual([10, 9, 8, 7, 6, 1].map(laCategoria),
        ["promotor", "promotor", "pasivo", "pasivo", "detractor", "detractor"]);
});

test("el NPS: promotores menos detractores, sobre el total", () => {
    const r = elResumenNps([10, 9, 8, 3, 2]);
    assert.deepEqual(r, { respuestas: 5, promotores: 2, pasivos: 1, detractores: 2, nps: 0 });
    assert.equal(elResumenNps([10, 10, 7]).nps, 67);
    assert.equal(elResumenNps([1]).nps, -100);
});

test("sin respuestas el NPS es null, nunca 0", () => {
    assert.equal(elResumenNps([]).nps, null);
});

test("por asesor: la suma de filas cuadra con el total, y «sin asesor» es una fila", () => {
    const filas = [
        { asesorId: "ana", puntuacion: 10 },
        { asesorId: "ana", puntuacion: 4 },
        { asesorId: null, puntuacion: 9 },
        { asesorId: "luis", puntuacion: 8 },
        { asesorId: "ana", puntuacion: 9 },
    ];
    const por = elNpsPorAsesor(filas);
    assert.equal(por[0].asesorId, "ana");
    assert.equal(por[0].respuestas, 3);
    assert.equal(por[0].nps, 33);
    assert.ok(por.some((f) => f.asesorId === null && f.promotores === 1));
    const total = elResumenNps(filas.map((f) => f.puntuacion));
    for (const k of ["respuestas", "promotores", "pasivos", "detractores"]) {
        assert.equal(por.reduce((s, f) => s + f[k], 0), total[k], k);
    }
});

test("la respuesta es la PRIMERA válida, y solo entre los primeros mensajes", () => {
    const t = (min) => new Date(Date.UTC(2026, 0, 1, 10, min));
    assert.deepEqual(
        laRespuestaEntreLosMensajes([
            { texto: "10", cuando: t(3) },
            { texto: "Gracias!", cuando: t(1) },
            { texto: "le pongo un 8", cuando: t(2) },
        ]),
        { puntuacion: 8, cuando: t(2) },
    );
    const muchos = Array.from({ length: MENSAJES_QUE_SE_MIRAN }, (_, i) => ({ texto: "ok", cuando: t(i) }));
    muchos.push({ texto: "9", cuando: t(30) });
    assert.equal(laRespuestaEntreLosMensajes(muchos), null);
});

test("el mensaje: corto, del 1 al 10, y nombra el negocio solo si es de verdad", () => {
    const con = elMensajeDeLaEncuesta("Tienda Sol");
    assert.match(con, /Del 1 al 10/);
    assert.match(con, /recomiendes a Tienda Sol/);
    assert.match(con, /solo con el número/);
    const sin = elMensajeDeLaEncuesta(null);
    assert.match(sin, /nos recomiendes/);
    assert.ok(con.length < 260, `demasiado largo: ${con.length}`);
    assert.equal(elNegocioDeLaCuenta("Empresa Demo"), null);
    assert.equal(elNegocioDeLaCuenta("  "), null);
    assert.equal(elNegocioDeLaCuenta(" Tienda Sol "), "Tienda Sol");
});

/* ── Barrido: que se use ESTO y no una copia ─────────────────────────── */

const sinComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("resolver encola la encuesta, en la ÚNICA puerta de resolver", () => {
    const src = sinComentarios(leer("actions/advisor-assign-actions.ts"));
    const cuerpo = src.slice(src.indexOf("export async function resolveSession"), src.indexOf("export async function resolverSesionesAction"));
    assert.match(cuerpo, /encolarLaEncuestaDeSatisfaccion\(sessionId, assignedAdvisorId\)/);
    // Nadie más marca una conversación como resuelta por otro camino.
    const otros = ["actions", "lib", "app"].flatMap(function recorrer(dir) {
        return fs.readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
            const r = join(dir, e.name);
            if (e.isDirectory()) return e.name.startsWith(".") || e.name === "__tests__" ? [] : recorrer(r);
            return /\.(ts|tsx)$/.test(e.name) ? [r] : [];
        });
    }).filter((f) => /marcarSesionResuelta\(/.test(sinComentarios(leer(f))));
    assert.deepEqual(otros.sort(), ["actions/advisor-assign-actions.ts", "lib/session-resolved.ts"].sort());
});

test("las pantallas y el servidor usan las MISMAS reglas", () => {
    const vista = leer("app/(root)/crm/dashboard/components/AnalyticsView.tsx");
    assert.match(vista, /getNpsDelCrm/);
    assert.match(vista, /COLOR_DE_LA_CATEGORIA/);
    const ficha = leer("app/(root)/chats/_components/ContactInfoPanel.tsx");
    assert.match(ficha, /getEncuestasDelContactoAction/);
    assert.match(ficha, /NOMBRE_DE_LA_CATEGORIA/);
    const acciones = sinComentarios(leer("actions/encuesta-de-satisfaccion-actions.ts"));
    assert.match(acciones, /elResumenNps\(/);
    assert.match(acciones, /laCategoria\(/);
    assert.match(acciones, /lasCuentasQueConsultaElCrm/);
    assert.match(acciones, /laCuentaQueConfigura/);
    assert.match(acciones, /laCuentaDeLaConversacion/);
    // Ninguna acción acepta un userId del navegador.
    assert.doesNotMatch(acciones, /export async function \w+\([^)]*userId/);
    const servidor = sinComentarios(leer("lib/encuesta-de-satisfaccion.server.ts"));
    assert.match(servidor, /elMensajeDeLaEncuesta\(elNegocioDeLaCuenta/);
    assert.match(servidor, /enviarConHistorial\(/);
});

test("el interruptor vive en Perfil › Comportamiento, junto al escalado y con su forma", () => {
    const perfil = leer("app/(root)/profile/_components/UserInformation.tsx");
    const escalado = perfil.indexOf("<EscaladoCard");
    const encuesta = perfil.indexOf("<EncuestaSatisfaccionCard");
    assert.ok(escalado > 0 && encuesta > escalado, "la encuesta va justo detrás del escalado");
    assert.match(perfil, /<SectionTitle>Encuesta de satisfacción<\/SectionTitle>/);
    const tarjeta = leer("app/(root)/profile/_components/EncuestaSatisfaccionCard.tsx");
    const vecina = leer("app/(root)/profile/_components/EscaladoCard.tsx");
    for (const clase of [
        'className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"',
        'className="text-sm font-semibold"',
        'className="text-xs text-muted-foreground"',
        'className="data-[state=checked]:bg-green-600"',
    ]) {
        assert.ok(vecina.includes(clase), `la vecina ya no lleva ${clase}`);
        assert.ok(tarjeta.includes(clase), `la encuesta no lleva ${clase}`);
    }
});

test("la sección de NPS es gemela de la de Llamadas", () => {
    const vista = leer("app/(root)/crm/dashboard/components/AnalyticsView.tsx");
    const llamadas = vista.slice(vista.indexOf("{visibleSections.llamadas &&"), vista.indexOf("{visibleSections.satisfaccion &&"));
    const nps = vista.slice(vista.indexOf("{visibleSections.satisfaccion &&"), vista.indexOf("{visibleSections.sesiones &&"));
    assert.ok(llamadas.length > 0 && nps.length > 0);
    // La secuencia de piezas y sus clases: mismas tarjetas, mismo orden, misma forma.
    const forma = (s) => Array.from(
        s.matchAll(/<(Card|CardHeader|CardTitle|CardDescription|CardContent|KpiList|SectionLabel)\b(?:[^>]*?className=(\{[^}]*\}|"[^"]*"))?/g),
        (m) => `${m[1]}|${m[2] ?? ""}`,
    );
    assert.deepEqual(forma(nps), forma(llamadas));
    assert.match(vista, /satisfaccion: "Satisfacción \(NPS\)"/);
});
