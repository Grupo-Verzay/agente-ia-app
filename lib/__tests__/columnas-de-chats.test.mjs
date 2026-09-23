/**
 * Las tres columnas de Chats, sin navegador: los números de la cabecera del
 * panel, dónde se pone la franja, con qué vista abre el chat del equipo, y un
 * barrido de que los tres marcos de panel y el hilo lo usan.
 *
 * Lo que se MIDE —el alto de las filas, el respiro, la raya y los
 * separadores— está en `scripts/probar-columnas-de-chats.mjs`, sobre la página
 * servida. Esto es la mitad que no necesita navegador.
 *
 * `MODO=roto` lee los mismos ficheros de `ANTES_REF` con `git show` y AFIRMA
 * el fallo: la cabecera del panel era otra caja, las hojas no llevaban marca y
 * el hilo del equipo desplegaba la lista encima del chat.
 *
 * Se levanta con `scripts/banco-columnas-de-chats.sh`, que compila antes lo
 * que se importa (sale en `.compilado/`, que está en `.gitignore`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "20db904";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");

/** Un fichero del árbol de ahora, o del commit de antes en modo roto. */
const leer = (ruta) =>
    ROTO
        ? execFileSync("git", ["show", `${ANTES}:${ruta}`], { cwd: RAIZ, encoding: "utf8" })
        : fs.readFileSync(join(RAIZ, ruta), "utf8");

const PANEL_LATERAL = "components/shared/PanelLateral.tsx";
const COPILOTO = "app/(root)/ai-chat/components/ChatSheet.tsx";
const EQUIPO = "components/chat-equipo/PanelDeEquipo.tsx";
const HILO = "components/chat-equipo/HiloDelEquipo.tsx";
const CHATS = "app/(root)/chats/_components/chats-client.tsx";
const CSS = "app/globals.css";

if (!ROTO) {
    const cab = await import("./.compilado/cabeceras-de-chats.js");
    const panel = await import("./.compilado/panel-lateral.js");
    const canales = await import("./.compilado/canales-de-equipo.js");

    test("la cabecera del panel es la MISMA caja que la de la conversación, sin el md:", () => {
        const sinMd = cab.CABECERA_ESCRITORIO.replace(/md:/g, "").split(/\s+/);
        for (const t of sinMd) {
            assert.ok(cab.CABECERA_DEL_PANEL.split(/\s+/).includes(t), `falta «${t}» en la cabecera del panel`);
        }
        // 4.875rem = 78 px, el alto que sale de las filas.
        assert.equal(cab.ALTO_DE_LAS_CABECERAS, 78);
        assert.match(cab.CABECERA_DEL_PANEL, /h-\[4\.875rem\]/);
        assert.match(cab.CABECERA_DEL_PANEL, /border-b-2/);
        assert.match(cab.FILA_1_DEL_PANEL, /\bh-8\b/); // 32 = ALTO_FILA_1
        assert.match(cab.FILA_2_DEL_PANEL, /\bh-7\b/); // 28 = ALTO_FILA_2
        assert.equal(cab.ALTO_FILA_1, 32);
        assert.equal(cab.ALTO_FILA_2, 28);
        // Y las filas de la conversación son las mismas.
        assert.equal(cab.CLASE_FILA_1, "md:h-8");
        assert.equal(cab.CLASE_FILA_2, "md:h-7");
    });

    test("la franja se pone sobre la bandeja: arriba, alto y lo que queda a la derecha", () => {
        assert.deepEqual(panel.laFranjaDeLaBandeja({ top: 58, right: 1435, height: 837 }, 1440), {
            arriba: 58,
            alto: 837,
            derecha: 5,
        });
        // Nunca negativo: una bandeja que llegue al borde deja 0.
        assert.equal(panel.laFranjaDeLaBandeja({ top: 0, right: 1441, height: 10 }, 1440).derecha, 0);
    });

    test("el chat del equipo abre en la LISTA, salvo que se llegue a algo o se estuviera en un chat", () => {
        assert.equal(canales.laVistaDeEntrada({}), "lista");
        assert.equal(canales.laVistaDeEntrada({ recordada: "lista" }), "lista");
        assert.equal(canales.laVistaDeEntrada({ recordada: "chat" }), "chat");
        assert.equal(canales.laVistaDeEntrada({ recordada: "otra-cosa" }), "lista");
        assert.equal(canales.laVistaDeEntrada({ pedido: "c1", recordada: "lista" }), "chat");
        assert.equal(canales.laVistaDeEntrada({ mensaje: "m1" }), "chat");
        assert.equal(canales.laVistaDeEntrada({ pedido: "   " }), "lista");
        // La llave de la vista cuelga de la del canal: misma cuenta, misma persona.
        assert.equal(canales.llaveDeLaVista("a", "b"), `${canales.llaveDelUltimoCanal("a", "b")}::vista`);
    });

    test("recordar la vista nunca lanza, tampoco sin localStorage", () => {
        assert.equal(canales.laVistaRecordada("a", "b"), null);
        assert.doesNotThrow(() => canales.recordarLaVista("a", "b", "chat"));
    });
}

/* ── El barrido: en los dos modos ────────────────────────────────────────── */

const barrido = {
    "los tres marcos marcan su franja y su hoja (la regla de CSS los encuentra)": () =>
        [PANEL_LATERAL, COPILOTO, EQUIPO].every((f) => {
            const s = leer(f);
            return s.includes("data-franja-lateral") && s.includes("data-hoja-lateral");
        }),
    "los tres marcos pintan la cabecera con CABECERA_DEL_PANEL": () =>
        [PANEL_LATERAL, COPILOTO, HILO].every((f) => leer(f).includes("CABECERA_DEL_PANEL")),
    "Chats mide la bandeja para colocar los paneles": () => leer(CHATS).includes("<MedidaDeChats />"),
    "la regla de la tercera columna está en el CSS": () =>
        /\[data-chats-medidos\] \[data-franja-lateral\]/.test(leer(CSS)) &&
        /border-width: 0 0 0 1px/.test(leer(CSS)),
    "el hilo del equipo tiene UNA vista por vez (lista o chat) y flecha de volver": () => {
        const s = leer(HILO);
        return (
            !s.includes("listaAbierta") &&
            s.includes('data-vista-del-equipo') &&
            s.includes('data-boton="volver-a-la-lista"') &&
            s.includes("data-lista-de-canales")
        );
    },
    "la lista se desplaza dentro de SU área, sin tope de alto": () => {
        const s = leer(HILO);
        return /data-lista-de-canales\s+className="min-h-0 flex-1 overflow-y-auto/.test(s) &&
            !s.includes("max-h-[min(50vh,320px)]");
    },
    "con la lista delante el hilo no se marca leído": () =>
        leer("actions/chat-de-equipo-actions.ts").includes("if (ultimo && !sinMarcar)"),
};

for (const [nombre, cumple] of Object.entries(barrido)) {
    test(`${ROTO ? "ANTES (se afirma el fallo)" : "ahora"}: ${nombre}`, () => {
        if (ROTO) assert.equal(cumple(), false, `en ${ANTES} ya se cumplía: el modo roto no reproduce nada`);
        else assert.equal(cumple(), true);
    });
}
