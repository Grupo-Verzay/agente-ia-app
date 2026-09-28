/**
 * La REGLA de mencionar a la cuenta MADRE, y un BARRIDO de que el código la usa.
 *
 * Lo puro se prueba sin base. El barrido existe porque el fallo de esta familia
 * es que a una hermana se le pase: la pantalla ofreciendo a los de la madre con
 * otra fila, o la ventana recortando la nota. En `MODO=roto` el barrido lee los
 * mismos ficheros de `ANTES_REF` y afirma que no estaba nada.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "f3f296c";
const r = await import("./.compilado/mencion-madre/menciones-de-la-madre.js");

function leer(ruta) {
    if (!ROTO) return readFileSync(ruta, "utf8");
    try {
        return execSync(`git show ${ANTES_REF}:${ruta}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return "";
    }
}

// ── La madre en la malla de linked_accounts ─────────────────────────────────
const M = "madre", H = "hija", S = "hermana", N = "nieta";

test("una hija directa tiene madre; la raíz no tiene", () => {
    const enlaces = [{ de: M, a: H }, { de: M, a: S }];
    assert.deepEqual(r.lasMadresDe(H, enlaces, M), [M]);
    assert.deepEqual(r.lasMadresDe(M, enlaces, M), [], "la raíz no tiene madre");
});

test("el enlace de vuelta (hija → madre) no convierte a la madre en hija", () => {
    // Es la malla real de producción: Ventas vinculó a la madre en agosto.
    const enlaces = [{ de: M, a: H }, { de: H, a: M }];
    assert.deepEqual(r.lasMadresDe(H, enlaces, M), [M]);
    assert.deepEqual(r.lasMadresDe(M, enlaces, M), []);
});

test("dos hermanas enlazadas en los dos sentidos no son madre e hija", () => {
    const enlaces = [{ de: M, a: H }, { de: M, a: S }, { de: H, a: S }, { de: S, a: H }];
    assert.deepEqual(r.lasMadresDe(H, enlaces, M), [M]);
    assert.deepEqual(r.lasMadresDe(S, enlaces, M), [M]);
});

test("solo la madre DIRECTA: la abuela no cuenta", () => {
    const enlaces = [{ de: M, a: H }, { de: H, a: N }];
    assert.deepEqual(r.lasMadresDe(N, enlaces, M), [H]);
});

test("sin enlaces no hay madre", () => {
    assert.deepEqual(r.lasMadresDe(H, [], H), []);
    assert.deepEqual(r.lasMadresDe("", [{ de: M, a: H }], M), []);
});

// ── Lo que ofrece el selector ───────────────────────────────────────────────
const equipo = [
    { id: "a1", name: "Ana Asesora", email: "ana@x.co" },
    { id: "a2", name: "Beto Agente", email: "beto@x.co" },
];
const madre = [{ id: "m1", name: "Carlos Arcos", email: "carlos@madre.co" }];

test("el selector ofrece al equipo y, detrás, a los de la madre, por su nombre", () => {
    assert.deepEqual(r.losMencionables(equipo, madre, "").map((a) => a.id), ["a1", "a2", "m1"]);
    assert.deepEqual(r.losMencionables(equipo, madre, "carl").map((a) => a.name), ["Carlos Arcos"]);
    assert.deepEqual(r.losMencionables(equipo, madre, "madre.co").map((a) => a.id), ["m1"], "también por correo");
    assert.ok(!r.losMencionables(equipo, madre, "").some((a) => /^administrador$/i.test(a.name)));
});

test("sin nadie repetido y con el tope de siempre", () => {
    assert.deepEqual(r.losMencionables(equipo, [...madre, equipo[0]], "").map((a) => a.id), ["a1", "a2", "m1"]);
    const muchos = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, name: `E${i}` }));
    assert.equal(r.losMencionables(muchos, madre, "").length, r.TOPE_DE_SUGERENCIAS);
});

test("los ids que llegan se reparten: equipo, madre, y lo demás fuera", () => {
    const eq = new Map([["a1", {}], ["a2", {}]]);
    const x = r.separarLasMenciones(["a1", "m1", "zz", "yo", "a1", ""], eq, new Set(["m1"]), "yo");
    assert.deepEqual(x.delEquipo, ["a1"]);
    assert.deepEqual(x.deLaMadre, ["m1"]);
    assert.deepEqual(x.descartados, ["zz"]);
});

test("el título nombra a quien escribe y la cuenta hija", () => {
    assert.equal(r.tituloDeLaMencionEnNota("Ana", "Verzay Ventas"), "Ana te mencionó en una nota interna de Verzay Ventas");
    assert.equal(r.tituloDeLaMencionEnNota("", null), "Alguien de una cuenta hija te mencionó en una nota interna");
});

// ── El barrido ──────────────────────────────────────────────────────────────
test("barrido: la pantalla pide a los de la madre y los pasa por la MISMA lista", () => {
    const main = leer("app/(root)/chats/_components/chat-main.tsx");
    const acciones = leer("actions/internal-notes-actions.ts");
    if (ROTO) {
        assert.ok(!main.includes("mencionablesDeLaMadreAction"), "el fallo: la pantalla no ofrecía a nadie de la madre");
        assert.ok(!acciones.includes("losAdministradoresDeLaMadre"), "el fallo: el servidor no los aceptaba");
        return;
    }
    assert.ok(main.includes("mencionablesDeLaMadreAction()"));
    assert.ok(main.includes("losMencionables(advisors ?? [], deLaMadre ?? [], mentionQuery)"));
    assert.ok(acciones.includes("separarLasMenciones("));
    // Solo el equipo recibe acceso por mención.
    assert.ok(acciones.includes("quienesRecibenAcceso(reparto.delEquipo"));
});

test("barrido: la ventana que interrumpe enseña ENTERA una mención", () => {
    const ventana = leer("components/shared/AvisoDeTarea.tsx");
    if (ROTO) {
        assert.ok(/text-muted-foreground line-clamp-3/.test(ventana), "el fallo: toda nota se recortaba a tres líneas");
        return;
    }
    assert.ok(ventana.includes('aviso.tipo === "mencion" ? "" : "line-clamp-3"'));
});
